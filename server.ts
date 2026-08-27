import express from "express";
import path from "path";
import fs from "fs";
import ccxt from "ccxt";
import { WebSocket as WsClient } from "ws";
import { RSI, MACD, BollingerBands, ATR, SMA, EMA } from "technicalindicators";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// =============== STATE & CONFIG ===============
let botState = "stopped";
let dataLoop: NodeJS.Timeout | null = null;
let lastLogId = 0;
const engineLogs: any[] = [];
const pendingEntries = new Set<string>();
let serverIp = "Tespit ediliyor...";
let lastIpFetchTime = 0;

let exchange: ccxt.Exchange | null = null;
let targetLeverage = 15;
let tradeCounter = 1;

let isExchangeAuthenticated = false;
let isBinanceTestnet = false;
let whitelistCoins: string[] = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "ADA/USDT",
  "DOGE/USDT",
  "SUI/USDT"
];
let latestTickersCache: any[] = [];
let activeStopLossPct = 1.5;
let activeLookbackMin: 1 | 3 | 5 | 15 = 1;
let activeStakeAmount = 25;
let maxOpenTrades = 1;

// Position management per coin
interface ActivePosition {
  trade_id: number;
  pair: string;
  type: "long" | "short";
  entryPrice: number;
  amount: number;
  peakPrice: number;
  openDate: number;
  leverage: number;
  binanceStopOrderId?: string;
  unrealizedPnl?: number;
  percentage?: number;
  
  // Dynamic Exit Analysis (Adaptive 3->6->10)
  exitReviewMeasurements: { longAdv: number; shortAdv: number; gap: number; netInflowUSD?: number; largeTradeNetUSD?: number }[];
  exitReviewState: "none" | "3" | "6" | "10";
  maxExpectedProfitUSD?: number;
  minExpectedProfitUSD?: number;
  peakNetPnlUSD?: number;
  profitProtectionFloorUSD?: number;
}

const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};
let priceHistoryMap: Record<string, number[]> = {};
let volumeHistoryMap: Record<string, number[]> = {};
let recentTradesMap: Record<string, any[]> = {};
let flowHistoryMap: Record<string, any[]> = {};
let depthFetchedAt: Record<string, number> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08;
const ESTIMATED_SLIPPAGE_PCT = 0.06;
const MIN_EXPECTED_NET_PNL_USD = 0.50;
const MIN_EXPECTED_NET_PNL_RATIO = 0.02;
const DEPTH_CACHE_MS = 1000;
const FLOW_HISTORY_SIZE = 30;
const PROFIT_PROTECTION_GAP = 2;
const PROFIT_PROTECTION_MIN_NET_USD = 0.20;
const PROFIT_PROTECTION_PEAK_RETENTION = 0.55; // protect before profit turns negative
const PROFIT_PROTECTION_CONFIRMATIONS = 2;

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 250) engineLogs.length = 250;
  console.log(`[${level}] ${timestamp} - ${message}`);
}

async function fetchServerIp() {
  const now = Date.now();
  if (now - lastIpFetchTime > 300000 || serverIp === "Tespit ediliyor..." || serverIp === "Bağlantı Hatası") {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      serverIp = data.ip;
      lastIpFetchTime = now;
    } catch (e) {
      if (serverIp === "Tespit ediliyor...") {
        serverIp = "Bağlantı Hatası";
      }
    }
  }
  return serverIp;
}

const getServerPublicIp = fetchServerIp;

// =============== INITIALIZATION ===============
async function initializeExchange() {
  try {
    let confStr = "{}";
    if (fs.existsSync("config.json")) {
      confStr = fs.readFileSync("config.json", "utf8");
    }
    const conf = JSON.parse(confStr);
    
    const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY;
    const secret = conf?.exchange?.secret || process.env.BINANCE_API_SECRET;
    
    targetLeverage = conf?.leverage || 15;
    isBinanceTestnet = conf?.exchange?.testnet === true;
    
    if (conf?.exchange?.pair_whitelist && conf.exchange.pair_whitelist.length > 0) {
      whitelistCoins = conf.exchange.pair_whitelist;
    }
    
    if (conf?.stop_loss_pct) activeStopLossPct = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
    if (conf?.stake_amount) activeStakeAmount = conf.stake_amount;
    if (conf?.max_open_trades) maxOpenTrades = conf.max_open_trades;

    if (apiKey && secret && apiKey.trim() !== "" && secret.trim() !== "") {
      const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
      exchange = new ExchangeClass({
        apiKey: apiKey.trim(),
        secret: secret.trim(),
        enableRateLimit: true,
        options: { 
          defaultType: "future",
          adjustForTimeDifference: true,
          recvWindow: 60000 
        }
      });
      if (isBinanceTestnet) {
        if (typeof exchange.enableDemoTrading === "function") {
          exchange.enableDemoTrading(true);
        } else {
          exchange.setSandboxMode(true);
        }
        addEngineLog("INFO", "Binance TESTNET modu aktif. ");
      } else {
        addEngineLog("INFO", "Binance API bağlantısı kuruldu. Gerçek emirler gönderilecek.");
      }
      isExchangeAuthenticated = true;
      syncBinancePositions(); // Auto-sync open positions on start
    } else {
      exchange = null;
      isExchangeAuthenticated = false;
      addEngineLog("WARN", "API kimlik bilgileri eksik. Gerçek emir motoru işlem açmayacak.");
    }
  } catch (e: any) {
    addEngineLog("ERROR", `API Başlatma Hatası: ${e.message}`);
  }
}

async function syncBinancePositions() {
  if (!exchange || !isExchangeAuthenticated) return;
  try {
    const positions = await exchange.fetchPositions();
    let syncCount = 0;
    for (const pos of positions) {
      const sym = (pos.symbol || "").replace(/[^A-Z]/g, "").replace("USDT", "/USDT");
      const notional = pos.notional ? Math.abs(pos.notional) : 0;
      if (notional > 0 && whitelistCoins.includes(sym)) {
        if (!activePositions[sym]) {
          const type = pos.side === 'short' ? 'short' : 'long';
          activePositions[sym] = {
            trade_id: tradeCounter++,
            pair: sym,
            type,
            entryPrice: pos.entryPrice,
            amount: Math.abs(pos.contracts),
            peakPrice: pos.entryPrice,
            openDate: Date.now(),
            leverage: pos.leverage || targetLeverage,
            exitReviewMeasurements: [],
            exitReviewState: "none"
          };
          (activePositions[sym] as any).isRealBinance = true;
          syncCount++;
        }
      }
    }
    if (syncCount > 0) addEngineLog("INFO", `Binance'den ${syncCount} adet aktif pozisyon başarıyla senkronize edildi.`);
  } catch (e) {}
}

function getMarketSymbol(symbol: string) {
  return symbol.replace("/", "");
}

// =============== HIGH INFLOW & DEEP ORDER FLOW ENGINE ===============
interface OrderFlowMetrics {
  longAdvantage: number;
  shortAdvantage: number;
  gap: number;
  takerBuyRatio: number;
  netInflowUSD: number;
  expectedNetPnlUsdLong: number;
  expectedNetPnlUsdShort: number;
  liquidityMap: {
    firstTargetLong: number;
    strongResistance: number;
    firstTargetShort: number;
    strongSupport: number;
  };
  obi: number; 
  predictedProfitPct: number;
  predictedTimeSec: number;
  smartTargetPrice: number;
  smartStopPrice: number;
  liquidityGravityScore: number;
  microPrice: number;
  midPrice: number;
  spreadPct: number;
  volumeSpike: boolean;
  volumeRatio: number;
  vwap: number;
  stdDev: number;
  deepScore: number;
}

function normalizeDepthOrders(orders: any[], avgUsd: number) {
  const avg = Math.max(avgUsd, 1);
  return orders.map((o: any, i: number) => {
    const price = Number(o[0]);
    const qty = Number(o[1]);
    const usd = price * qty;
    const ratio = usd / avg;
    const sizeWeight = ratio < 0.20 ? 0.08 : ratio >= 8 ? 1.35 : ratio >= 3 ? 1.0 : 0.55;
    const distanceWeight = 1 / (1 + i * 0.08);
    const zoneWeight = i < 5 ? 2 : i < 15 ? 1 : 0.65;
    return { index: i, price, qty, usd, ratio, sizeWeight, distanceWeight, zoneWeight };
  }).filter((x: any) => Number.isFinite(x.price) && Number.isFinite(x.qty) && x.qty > 0);
}

async function refreshFuturesDepth(symbol: string) {
  const now = Date.now();
  if (now - (depthFetchedAt[symbol] || 0) < DEPTH_CACHE_MS) return latestOrderBooks[symbol];
  const clean = symbol.replace('/', '').toUpperCase();
  const base = isBinanceTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  try {
    const res = await fetch(`${base}/fapi/v1/depth?symbol=${clean}&limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d: any = await res.json();
    latestOrderBooks[symbol] = {
      bids: (d.bids || []).slice(0, 50).map((x: any) => [Number(x[0]), Number(x[1])]),
      asks: (d.asks || []).slice(0, 50).map((x: any) => [Number(x[0]), Number(x[1])]),
      timestamp: now,
      source: isBinanceTestnet ? 'futures-testnet' : 'futures-live'
    };
    depthFetchedAt[symbol] = now;
  } catch (e: any) {
    addEngineLog('WARN', `${symbol} Futures 50-seviye depth alınamadı: ${e.message}`);
  }
  return latestOrderBooks[symbol];
}

function analyzeOrderFlowAndInflow(ob: any, recentTrades: any[], prices: number[], volumes: number[], currentPrice: number): any {
  const bids = Array.isArray(ob?.bids) ? ob.bids.slice(0, 50) : [];
  const asks = Array.isArray(ob?.asks) ? ob.asks.slice(0, 50) : [];
  const bidAvg = bids.length ? bids.reduce((a: number, x: any) => a + Number(x[0]) * Number(x[1]), 0) / bids.length : 1;
  const askAvg = asks.length ? asks.reduce((a: number, x: any) => a + Number(x[0]) * Number(x[1]), 0) / asks.length : 1;
  const vb = normalizeDepthOrders(bids, bidAvg);
  const va = normalizeDepthOrders(asks, askAvg);
  // Futures-only layered order-book model.
  // 1-10 primary entry, 11-20 confirmation, 21-30 secondary confirmation,
  // 31-50 only path/liquidity context.
  const layerScore = (arr: any[], start: number, end: number) => arr.reduce((s, x, i) => {
    const level = i + 1;
    if (level < start || level > end) return s;
    const weight = level <= 10 ? 1 : level <= 20 ? 0.37 : level <= 30 ? 0.24 : 0.08;
    return s + x.usd * x.sizeWeight * x.distanceWeight * x.zoneWeight * weight;
  }, 0);
  const bid10 = layerScore(vb,1,10), ask10 = layerScore(va,1,10);
  const bid20 = layerScore(vb,11,20), ask20 = layerScore(va,11,20);
  const bid30 = layerScore(vb,21,30), ask30 = layerScore(va,21,30);
  const entryBid = bid10 * 0.62 + bid20 * 0.23 + bid30 * 0.15;
  const entryAsk = ask10 * 0.62 + ask20 * 0.23 + ask30 * 0.15;
  const entryTotal = entryBid + entryAsk;
  const entryObLong = entryTotal > 0 ? entryBid / entryTotal * 100 : 50;
  const entryObShort = 100 - entryObLong;
  const bidScore = entryBid, askScore = entryAsk, total = entryTotal;
  const obLong = entryObLong;
  const obShort = entryObShort;

  const rows = (recentTrades || []).filter((t: any) => Number(t.price) > 0 && Number(t.amount) > 0).map((t: any) => ({ ...t, usd: Number(t.price) * Number(t.amount) }));
  const sizes = rows.map((r: any) => r.usd).sort((a: number, b: number) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 1;
  let buy = 0, sell = 0, largeBuy = 0, largeSell = 0;
  for (const r of rows) {
    const ratio = r.usd / Math.max(median, 1);
    const w = ratio < 0.5 ? 0.20 : ratio >= 8 ? 2.0 : ratio >= 3 ? 1.35 : 0.70;
    if (r.side === 'buy') { buy += r.usd * w; if (ratio >= 3) largeBuy += r.usd; }
    if (r.side === 'sell') { sell += r.usd * w; if (ratio >= 3) largeSell += r.usd; }
  }
  const flowTotal = buy + sell;
  const takerBuyRatio = flowTotal > 0 ? buy / flowTotal : 0.5;
  const netInflowUSD = buy - sell;
  const largeTradeNetUSD = largeBuy - largeSell;

  const bestBid = Number(bids[0]?.[0] || currentPrice), bestAsk = Number(asks[0]?.[0] || currentPrice);
  const midPrice = (bestBid + bestAsk) / 2 || currentPrice;
  const spreadPct = midPrice ? (bestAsk - bestBid) / midPrice * 100 : 0;
  const obi = total > 0 ? (bidScore - askScore) / total : 0;

  const upper = asks.filter((x: any) => Number(x[0]) > currentPrice).sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
  const lower = bids.filter((x: any) => Number(x[0]) < currentPrice).sort((a: any, b: any) => Number(b[0]) - Number(a[0]));
  const askWall = upper.find((x: any) => Number(x[0]) * Number(x[1]) >= askAvg * 2.5);
  const bidWall = lower.find((x: any) => Number(x[0]) * Number(x[1]) >= bidAvg * 2.5);
  const resistance = askWall?.[0] || upper[Math.min(14, Math.max(0, upper.length - 1))]?.[0] || currentPrice * 1.01;
  const support = bidWall?.[0] || lower[Math.min(14, Math.max(0, lower.length - 1))]?.[0] || currentPrice * 0.99;
  const pathLong = Math.max(0, (resistance - currentPrice) / currentPrice * 100);
  const pathShort = Math.max(0, (currentPrice - support) / currentPrice * 100);
  const rets = prices?.length > 6 ? prices.slice(1).map((x, i) => prices[i] ? Math.abs((x - prices[i]) / prices[i]) * 100 : 0) : [];
  const volPct = rets.length ? Math.max(0.05, Math.min(5, (rets.reduce((a,b)=>a+b,0)/rets.length)*3)) : 0.25;
  const movementLong = Math.min(6, Math.max(volPct, pathLong));
  const movementShort = Math.min(6, Math.max(volPct, pathShort));
  const liqLong = Math.max(0, Math.min(100, 50 + Math.min(25, pathLong * 20) - (askWall ? 15 : 0)));
  const liqShort = Math.max(0, Math.min(100, 50 + Math.min(25, pathShort * 20) - (bidWall ? 15 : 0)));
  const moneyAdv = takerBuyRatio * 100;
  const largeFlowAdv = largeBuy + largeSell > 0 ? largeBuy / (largeBuy + largeSell) * 100 : 50;
  const longAdvantage = Math.max(0, Math.min(100, entryObLong * 0.35 + moneyAdv * 0.40 + liqLong * 0.25));
  const shortAdvantage = Math.max(0, Math.min(100, entryObShort * 0.35 + (100 - moneyAdv) * 0.40 + liqShort * 0.25));
  const gap = longAdvantage - shortAdvantage;

  const notionalUSD = Math.max(activeStakeAmount * targetLeverage, 0);
  const frictionPct = ESTIMATED_FEE_PCT + ESTIMATED_SLIPPAGE_PCT + Math.min(0.12, spreadPct * 1.5);
  const frictionUSD = notionalUSD * frictionPct / 100;
  const expectedNetPnlUsdLong = notionalUSD * movementLong / 100 - frictionUSD;
  const expectedNetPnlUsdShort = notionalUSD * movementShort / 100 - frictionUSD;
  const minimumNetPnlUSD = Math.max(MIN_EXPECTED_NET_PNL_USD, notionalUSD * MIN_EXPECTED_NET_PNL_RATIO);

  return {
    longAdvantage, shortAdvantage, gap, takerBuyRatio, netInflowUSD, largeTradeNetUSD,
    largeBuyUSD: largeBuy, largeSellUSD: largeSell,
    expectedNetPnlUsdLong, expectedNetPnlUsdShort, minimumNetPnlUSD,
    longProfitEligible: expectedNetPnlUsdLong >= minimumNetPnlUSD,
    shortProfitEligible: expectedNetPnlUsdShort >= minimumNetPnlUSD,
    expectedMovePctLong: movementLong, expectedMovePctShort: movementShort,
    movementPotentialLong: pathLong, movementPotentialShort: pathShort,
    liquidityLongScore: liqLong, liquidityShortScore: liqShort,
    liquidityMap: { firstTargetLong: currentPrice * (1 + Math.max(volPct, movementLong*0.6)/100), strongResistance: Number(resistance), firstTargetShort: currentPrice * (1 - Math.max(volPct, movementShort*0.6)/100), strongSupport: Number(support) },
    entryObLong, entryObShort, obi, predictedProfitPct: gap / 10, predictedTimeSec: Math.max(10, Math.round(60 / Math.max(volPct, 0.1))),
    smartTargetPrice: gap >= 0 ? Number(resistance) : Number(support), smartStopPrice: gap >= 0 ? Number(support) : Number(resistance),
    spreadPct, midPrice, microPrice: midPrice,
    moneyFlowAlignment: gap >= 0 ? moneyAdv : 100-moneyAdv,
    largeTradeAlignment: gap >= 0 ? largeFlowAdv : 100-largeFlowAdv
  };
}

function startBinanceServerWebSocket() {
  clearTimeout(binanceWsReconnectTimer);
  if (binanceWsClient) { try { binanceWsClient.terminate(); } catch {} }
  const baseWs = isBinanceTestnet ? 'wss://stream.binancefuture.com' : 'wss://fstream.binance.com';
  const streams = whitelistCoins.map(c => { const x=c.replace('/','').toLowerCase(); return `${x}@ticker/${x}@aggTrade`; }).join('/');
  try {
    binanceWsClient = new WsClient(`${baseWs}/stream?streams=${streams}`);
    binanceWsClient.on('open', () => addEngineLog('INFO', `Binance Futures ${isBinanceTestnet ? 'TESTNET' : 'LIVE'} ticker/trade akışı aktif.`));
    binanceWsClient.on('message', (raw:any) => handleWsMessage(raw));
    binanceWsClient.on('error', (err:any) => addEngineLog('WARN', `Futures WS hatası: ${err?.message || 'bilinmeyen'}`));
    binanceWsClient.on('close', () => { binanceWsReconnectTimer = setTimeout(startBinanceServerWebSocket, 3000); });
  } catch (e:any) {
    addEngineLog('ERROR', `Futures WS başlatma hatası: ${e.message}`);
    binanceWsReconnectTimer = setTimeout(startBinanceServerWebSocket, 3000);
  }
}

function handleWsMessage(raw: any) {
  try {
    const payload = JSON.parse(raw.toString());
    const stream = payload.stream || '';
    const data = payload.data;
    if (!data) return;

    const symUpper = (data.s || '').toUpperCase();
    const formattedSym = whitelistCoins.find(w => w.replace('/', '').toUpperCase() === symUpper) || 
      (symUpper.endsWith('USDT') ? `${symUpper.slice(0, -4)}/USDT` : symUpper);

    if (stream.includes('@ticker')) {
      const currentPrice = parseFloat(data.c || data.lastPrice || data.p || 0);
      const changePct = parseFloat(data.P || data.priceChangePercent || 0);
      const volumeUsdt = parseFloat(data.q || data.quoteVolume || 0);

      if (currentPrice > 0) {
        if (!priceHistoryMap[formattedSym]) priceHistoryMap[formattedSym] = [];
        priceHistoryMap[formattedSym].push(currentPrice);
        if (priceHistoryMap[formattedSym].length > 120) priceHistoryMap[formattedSym].shift();
        if (!volumeHistoryMap[formattedSym]) volumeHistoryMap[formattedSym] = [];
        if (volumeUsdt > 0) {
          volumeHistoryMap[formattedSym].push(volumeUsdt);
          if (volumeHistoryMap[formattedSym].length > 120) volumeHistoryMap[formattedSym].shift();
        }

        if (!latestMetricsPerCoin[formattedSym]) {
          latestMetricsPerCoin[formattedSym] = {
            currentPrice,
            change_24h_pct: changePct,
            volume_24h_usdt: volumeUsdt,
            rsi: 50,
            atr: currentPrice * 0.008,
            deepScore: 0,
            netInflowUSD: 0,
            takerBuyRatio: 0.5
          };
        } else {
          latestMetricsPerCoin[formattedSym].currentPrice = currentPrice;
          if (changePct !== 0) latestMetricsPerCoin[formattedSym].change_24h_pct = changePct;
          if (volumeUsdt !== 0) latestMetricsPerCoin[formattedSym].volume_24h_usdt = volumeUsdt;
        }
      }
    } else if (stream.includes('@aggTrade')) {
      const price = parseFloat(data.p);
      const qty = parseFloat(data.q);
      const isBuyerMaker = data.m;
      const side = isBuyerMaker ? 'sell' : 'buy';
      if (!recentTradesMap[formattedSym]) recentTradesMap[formattedSym] = [];
      recentTradesMap[formattedSym].push({ price, amount: qty, side, timestamp: data.T });
      
      // Cleanup older than 15 minutes (max lookback)
      const cutoff = Date.now() - 15 * 60 * 1000;
      recentTradesMap[formattedSym] = recentTradesMap[formattedSym].filter(t => t.timestamp > cutoff);
    }
  } catch (err) {}
}

// Start WebSocket stream immediately
startBinanceServerWebSocket();

// =============== CORE REAL-TIME LOOP ===============
async function updateMarketDataAndExecute() {
  if (botState !== "running") return;
  const entryCandidates: any[] = [];

  for (const symbol of whitelistCoins) {
    try {
      const cleanSymbol = symbol.replace("/", "").toUpperCase();
      let ticker: any = null;
      let ob: any = latestOrderBooks[symbol];
      const memMetric = latestMetricsPerCoin[symbol];
      let currentPrice = memMetric?.currentPrice || ob?.bids?.[0]?.[0] || 0;

      // Futures REST provides authoritative 50-level book data; ticker/trades come from the same Futures stream.
      ob = await refreshFuturesDepth(symbol);
      if (!ob || !ob.bids?.length || !ob.asks?.length) continue;
      if (!currentPrice) currentPrice = Number(ob.bids[0][0] || 0);

      if (!currentPrice || currentPrice <= 0) continue;

      // Initialize or update rolling price history (NO FAKE DATA)
      if (!priceHistoryMap[symbol]) {
        priceHistoryMap[symbol] = [];
      }
      priceHistoryMap[symbol].push(currentPrice);
      if (priceHistoryMap[symbol].length > 120) priceHistoryMap[symbol].shift();

      const prices = priceHistoryMap[symbol];
      const volumes = volumeHistoryMap[symbol] || [];

      // Deep Inflow & Order Flow Metrics
      const currentCutoff = Date.now() - (60 * 1000);
      const activeTrades = (recentTradesMap[symbol] || []).filter((t: any) => t.timestamp > currentCutoff);
      const flow = analyzeOrderFlowAndInflow(ob, activeTrades, prices, volumes, currentPrice);
      const fh = flowHistoryMap[symbol] || [];
      fh.push({ ts: Date.now(), gap: flow.gap, longAdv: flow.longAdvantage, shortAdv: flow.shortAdvantage, netInflowUSD: flow.netInflowUSD, largeTradeNetUSD: flow.largeTradeNetUSD });
      if (fh.length > FLOW_HISTORY_SIZE) fh.shift();
      flowHistoryMap[symbol] = fh;

      latestMetricsPerCoin[symbol] = {
        currentPrice,
        change_24h_pct: ticker?.percentage || latestMetricsPerCoin[symbol]?.change_24h_pct || 0,
        volume_24h_usdt: ticker?.quoteVolume || latestMetricsPerCoin[symbol]?.volume_24h_usdt || 0,
        ...flow
      };

      const pos = activePositions[symbol];

      // ================= EXITS: ADAPTIVE DYNAMIC TRAILING & OF REVIEW =================
      if (pos) {
        if (pos.type === 'long' && currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;
        if (pos.type === 'short' && currentPrice < pos.peakPrice) pos.peakPrice = currentPrice;
        const pnlUSD = pos.type === 'long' ? (currentPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - currentPrice) * pos.amount;
        const priceMovePct = pos.type === 'long' ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
        const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
        const peakPnlUSD = pos.type === 'long' ? (pos.peakPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - pos.peakPrice) * pos.amount;
        const peakInitialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
        const peakRoePct = peakInitialMargin > 0 ? (peakPnlUSD / peakInitialMargin) * 100 : 0;
        const drawdownFromPeakRoe = peakRoePct - roePct;
        let shouldExit = false, exitReason = '';

        // Profit protection: never rely on a single 51/49 snapshot.
        // Track the real/net estimated PnL peak and require repeated adverse evidence
        // from Order Flow + money flow + large trades before closing.
        const estimatedRoundTripCost = (entryPrice * pos.amount) * (ESTIMATED_FEE_PCT + ESTIMATED_SLIPPAGE_PCT) / 100;
        const netPnlUSD = pnlUSD - estimatedRoundTripCost;
        pos.peakNetPnlUSD = Math.max(Number(pos.peakNetPnlUSD || 0), netPnlUSD);
        const peakNet = Number(pos.peakNetPnlUSD || 0);
        const protectionFloor = Math.max(
          PROFIT_PROTECTION_MIN_NET_USD,
          peakNet * PROFIT_PROTECTION_PEAK_RETENTION
        );
        pos.profitProtectionFloorUSD = protectionFloor;

        const profitable = netPnlUSD >= PROFIT_PROTECTION_MIN_NET_USD;
        const sideGap = pos.type === 'long' ? flow.gap : -flow.gap;
        const moneyAligned = pos.type === 'long'
          ? (flow.netInflowUSD > 0 && flow.largeTradeNetUSD > 0)
          : (flow.netInflowUSD < 0 && flow.largeTradeNetUSD < 0);
        const moneyReversed = pos.type === 'long'
          ? (flow.netInflowUSD < 0 && flow.largeTradeNetUSD < 0)
          : (flow.netInflowUSD > 0 && flow.largeTradeNetUSD > 0);

        const lastFlows = flowHistoryMap[symbol] || [];
        const recentAdverse = lastFlows.slice(-3);
        const adverseCount = recentAdverse.filter((x: any) =>
          pos.type === 'long'
            ? x.gap <= 0 && x.netInflowUSD < 0 && x.largeTradeNetUSD < 0
            : x.gap >= 0 && x.netInflowUSD > 0 && x.largeTradeNetUSD > 0
        ).length;
        const recoveryCount = recentAdverse.filter((x: any) =>
          pos.type === 'long'
            ? x.gap > PROFIT_PROTECTION_GAP && x.netInflowUSD > 0
            : x.gap < -PROFIT_PROTECTION_GAP && x.netInflowUSD < 0
        ).length;

        // If a profitable position has surrendered a meaningful part of its peak
        // while the flow is repeatedly adverse, exit before net PnL reaches zero.
        const peakErosion = peakNet > 0 ? (peakNet - netPnlUSD) / peakNet : 0;
        if (!shouldExit && profitable && peakNet >= PROFIT_PROTECTION_MIN_NET_USD &&
            netPnlUSD <= protectionFloor && peakErosion >= (1 - PROFIT_PROTECTION_PEAK_RETENTION) &&
            sideGap <= 0 && adverseCount >= PROFIT_PROTECTION_CONFIRMATIONS && recoveryCount === 0) {
          shouldExit = true;
          exitReason = `Kâr Koruma: Net kâr $${netPnlUSD.toFixed(2)} seviyesine eridi; zirve $${peakNet.toFixed(2)}, Order Flow + para akışı ters`;
        }

        // Strong reversal can justify earlier exit even before the floor is reached.
        if (!shouldExit && profitable && sideGap < -PROFIT_PROTECTION_GAP &&
            moneyReversed && adverseCount >= PROFIT_PROTECTION_CONFIRMATIONS && recoveryCount === 0) {
          shouldExit = true;
          exitReason = `Kâr Koruma: güçlü ters akış doğrulandı (Net PnL +$${netPnlUSD.toFixed(2)})`;
        }

        // Peak protection no longer waits for 15% ROE; it is based on actual net PnL.
        if (!shouldExit && profitable && peakNet >= 1 &&
            netPnlUSD < peakNet * 0.50 &&
            sideGap <= 0 && adverseCount >= 2 && recoveryCount === 0) {
          shouldExit = true;
          exitReason = `Dinamik Kâr Koruma: zirve net kârının %50'sinden fazlası geri verildi (Zirve +$${peakNet.toFixed(2)})`;
        }

        // Protective loss stop.
        if (!shouldExit && priceMovePct <= -activeStopLossPct) {
          shouldExit = true;
          exitReason = `Zarar Kes (Stop Loss: %${activeStopLossPct.toFixed(2)})`;
        }

        // Adaptive 3 -> 6 -> 10 confirmation for ambiguous/borderline flow.
        if (!shouldExit) {
          const critical = pos.type === 'long' ? flow.gap <= 2 : flow.gap >= -2;
          if (critical) {
            pos.exitReviewMeasurements.push({ longAdv: flow.longAdvantage, shortAdv: flow.shortAdvantage, gap: flow.gap, netInflowUSD: flow.netInflowUSD, largeTradeNetUSD: flow.largeTradeNetUSD });
            if (pos.exitReviewMeasurements.length > 10) pos.exitReviewMeasurements.shift();
            const count = pos.exitReviewMeasurements.length;
            const recent = pos.exitReviewMeasurements.slice(-Math.min(count, 10));
            const avgGap = recent.reduce((a, x) => a + x.gap, 0) / (recent.length || 1);
            const positiveRecovery = pos.type === 'long' ? recent.filter(x => x.gap > 3 && (x.netInflowUSD || 0) > 0).length : recent.filter(x => x.gap < -3 && (x.netInflowUSD || 0) < 0).length;
            const severeNegative = pos.type === 'long' ? recent.filter(x => x.gap <= -1 && (x.netInflowUSD || 0) < 0).length : recent.filter(x => x.gap >= 1 && (x.netInflowUSD || 0) > 0).length;
            if (positiveRecovery >= 2) {
              pos.exitReviewMeasurements = [];
              pos.exitReviewState = 'none';
            } else if (count >= 10) {
              shouldExit = true;
              exitReason = `10 Ölçüm: Pozitif avantaj geri gelmedi (Net PnL $${pnlUSD.toFixed(2)})`;
            } else if (count >= 6 && severeNegative >= 4) {
              shouldExit = true;
              exitReason = `6 Ölçüm: Negatif eğilim doğrulandı (Net PnL $${pnlUSD.toFixed(2)})`;
            } else if (count >= 3 && Math.abs(avgGap) < 1 && profitable) {
              pos.exitReviewState = '6';
            } else if (count >= 1) {
              pos.exitReviewState = count < 3 ? '3' : (count < 6 ? '6' : '10');
            }
          } else {
            pos.exitReviewMeasurements = [];
            pos.exitReviewState = 'none';
          }
        }

        if (shouldExit) await executeExit(symbol, exitReason, currentPrice);
      }
      // ================= ENTRY: QUANTITATIVE & ORDER FLOW SIGNAL ENGINE =================
      else {
        if (Object.keys(activePositions).length < maxOpenTrades) {
          // Giriş Şartları
          // LONG veya SHORT %80'in üzerinde baskın gelirse && Net Expected PnL > 0
          const longAligned = flow.netInflowUSD > 0 && flow.largeTradeNetUSD > 0 && flow.takerBuyRatio >= 0.55;
          const shortAligned = flow.netInflowUSD < 0 && flow.largeTradeNetUSD < 0 && flow.takerBuyRatio <= 0.45;
          const isLongSignal = flow.longAdvantage >= 62 && flow.longProfitEligible && longAligned && flow.movementPotentialLong >= 0.25 && flow.entryObLong >= 55;
          const isShortSignal = flow.shortAdvantage >= 62 && flow.shortProfitEligible && shortAligned && flow.movementPotentialShort >= 0.25 && flow.entryObShort >= 55;

          if (isLongSignal || isShortSignal) {
            const type = isLongSignal ? "long" : "short";
            const score = isLongSignal ? flow.gap : Math.abs(flow.gap); 
            
            entryCandidates.push({
              symbol,
              score,
              type,
              price: currentPrice,
              predictedProfitPct: flow.predictedProfitPct,
              predictedTimeSec: flow.predictedTimeSec,
              smartTargetPrice: type === "long" ? flow.liquidityMap.firstTargetLong : flow.liquidityMap.firstTargetShort,
              smartStopPrice: type === "long" ? flow.liquidityMap.strongSupport : flow.liquidityMap.strongResistance
            });
          }
        }
      }
    } catch (e: any) {
      console.error(e);
    }
  }

  if (entryCandidates.length > 0 && Object.keys(activePositions).length < maxOpenTrades) {
    entryCandidates.sort((a, b) => b.score - a.score);
    const topCandidate = entryCandidates[0];
    await executeEntry(topCandidate.symbol, topCandidate.type, topCandidate.price);
  }
}

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number) {
  if (activePositions[symbol] || pendingEntries.has(symbol)) return;
  if (!exchange || !isExchangeAuthenticated) {
    throw new Error("Binance API bağlı değil; gerçek işlem için pozisyon açılmadı.");
  }
  pendingEntries.add(symbol);
  try {
    const effectivePrice = currentPrice || latestMetricsPerCoin[symbol]?.currentPrice || 0;
    if (!effectivePrice) throw new Error("Geçerli giriş fiyatı yok.");
    const notionalUSD = activeStakeAmount * targetLeverage;
    if (notionalUSD <= 0) throw new Error("İşlem büyüklüğü geçersiz.");
    const exSymbol = getMarketSymbol(symbol);
    await exchange.loadMarkets();
    let rawAmount = notionalUSD / effectivePrice;
    const market = exchange.markets?.[exSymbol];
    if (market?.limits?.amount?.min && rawAmount < market.limits.amount.min) rawAmount = market.limits.amount.min;
    const formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, rawAmount));
    if (!Number.isFinite(formattedAmount) || formattedAmount <= 0) throw new Error("Geçersiz emir miktarı.");

    try { await exchange.setLeverage(targetLeverage, exSymbol); } catch (e: any) { addEngineLog('WARN', `${symbol} kaldıraç ayarı: ${e.message}`); }
    try { await (exchange as any).setMarginMode('CROSSED', exSymbol); } catch (e: any) {}

    const side = type === 'long' ? 'buy' : 'sell';
    const order = await exchange.createOrder(exSymbol, 'market', side, formattedAmount);
    let filled: any = order;
    try { if (order.id && exchange.fetchOrder) filled = await exchange.fetchOrder(order.id, exSymbol); } catch {}
    const entryPrice = Number(filled.average || filled.price || effectivePrice);
    const filledAmount = Number(filled.filled || filled.amount || formattedAmount);
    if (!entryPrice || !filledAmount) throw new Error('Binance fill bilgisi alınamadı.');

    const stopPriceBase = type === 'long' ? entryPrice * (1 - activeStopLossPct / 100) : entryPrice * (1 + activeStopLossPct / 100);
    const stopPrice = parseFloat(exchange.priceToPrecision(exSymbol, stopPriceBase));
    let stopOrderId: string | undefined;
    try {
      const stopSide = type === 'long' ? 'sell' : 'buy';
      const stopOrder = await exchange.createOrder(exSymbol, 'STOP_MARKET', stopSide, filledAmount, undefined, { stopPrice, reduceOnly: true, workingType: 'MARK_PRICE' });
      stopOrderId = stopOrder.id;
    } catch (e: any) {
      // Never leave a real position without protection.
      try { await exchange.createOrder(exSymbol, 'market', type === 'long' ? 'sell' : 'buy', filledAmount, undefined, { reduceOnly: true }); } catch (closeErr: any) {
        addEngineLog('ERROR', `[KRİTİK] ${symbol} STOP oluşturulamadı ve acil kapatma da başarısız: ${closeErr.message}`);
      }
      throw new Error(`Koruyucu STOP emri oluşturulamadı: ${e.message}`);
    }

    activePositions[symbol] = {
      trade_id: tradeCounter++, pair: symbol, type, entryPrice, amount: filledAmount,
      peakPrice: entryPrice, openDate: Date.now(), leverage: targetLeverage,
      binanceStopOrderId: stopOrderId, unrealizedPnl: 0, percentage: 0,
      exitReviewMeasurements: [], exitReviewState: 'none',
      minExpectedProfitUSD: Number(latestMetricsPerCoin[symbol]?.minimumNetPnlUSD || MIN_EXPECTED_NET_PNL_USD),
      maxExpectedProfitUSD: Number(type === 'long' ? latestMetricsPerCoin[symbol]?.expectedNetPnlUsdLong : latestMetricsPerCoin[symbol]?.expectedNetPnlUsdShort || 0),
      peakNetPnlUSD: 0,
      profitProtectionFloorUSD: 0
    };
    (activePositions[symbol] as any).isRealBinance = true;
    allTrades.unshift({ ...activePositions[symbol], is_open: true });
    addEngineLog('TRADE', `[BINANCE ${isBinanceTestnet ? 'TESTNET' : 'LIVE'}] ${symbol} ${type.toUpperCase()} x${targetLeverage} | Notional: $${(entryPrice*filledAmount).toFixed(2)} | Fill: $${entryPrice}`);
  } finally {
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number) {
  const pos = activePositions[symbol];
  if (!pos || !exchange || !isExchangeAuthenticated) return false;
  const exSymbol = getMarketSymbol(symbol);
  let realizedPrice = currentPrice;
  try {
    const side = pos.type === 'long' ? 'sell' : 'buy';
    const exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, pos.amount));
    const order = await exchange.createOrder(exSymbol, 'market', side, exitAmount, undefined, { reduceOnly: true });
    let filled: any = order;
    try { if (order.id && exchange.fetchOrder) filled = await exchange.fetchOrder(order.id, exSymbol); } catch {}
    realizedPrice = Number(filled.average || filled.price || currentPrice);
    if (pos.binanceStopOrderId) { try { await exchange.cancelOrder(pos.binanceStopOrderId, exSymbol); } catch {} }
  } catch (e: any) {
    addEngineLog('ERROR', `[BINANCE] ${symbol} çıkış emri başarısız; uygulama pozisyonu kapatılmış saymayacak: ${e.message}`);
    return false;
  }

  const grossPnl = pos.type === 'long' ? (realizedPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - realizedPrice) * pos.amount;
  const friction = (pos.entryPrice * pos.amount + realizedPrice * pos.amount) * (ESTIMATED_FEE_PCT / 100) + realizedPrice * pos.amount * (ESTIMATED_SLIPPAGE_PCT / 100);
  const pnlUSD = grossPnl - friction;
  const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
  const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
  const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id);
  if (tradeIndex !== -1) {
    allTrades[tradeIndex].is_open = false;
    allTrades[tradeIndex].close_rate = realizedPrice;
    allTrades[tradeIndex].close_date = Date.now();
    allTrades[tradeIndex].close_reason = reason;
    allTrades[tradeIndex].profit_abs = Number(pnlUSD.toFixed(2));
    allTrades[tradeIndex].profit_pct = Number(roePct.toFixed(2));
  }
  delete activePositions[symbol];
  addEngineLog('TRADE', `[POZİSYON KAPANDI] ${symbol} | ${reason} | Net: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${roePct >= 0 ? '+' : ''}${roePct.toFixed(2)}%)`);
  return true;
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Yüksek Para Girişi & HFT Motoru Başlatıldı.");
  addEngineLog("INFO", `Mod: BINANCE FUTURES ${isBinanceTestnet ? "TESTNET" : "LIVE"}`);
  // Run scan immediately
  setTimeout(updateMarketDataAndExecute, 100);
}

async function stopTradingEngine() {
  botState = "stopped";
  addEngineLog("INFO", "Ticaret Motoru Durduruldu. (Veri izleme devam ediyor)");

  const openSymbols = Object.keys(activePositions);
  if (openSymbols.length > 0) {
    addEngineLog("INFO", `Bot durdurulduğu için ${openSymbols.length} adet açık pozisyon kapatılıyor...`);
    for (const sym of openSymbols) {
      const price = latestMetricsPerCoin[sym]?.currentPrice || activePositions[sym].entryPrice;
      await executeExit(sym, "Bot Durduruldu - Otomatik Kapatma", price);
    }
  }
}

// Background continuous data ticker (Runs every 2.5s for live UI metrics)
dataLoop = setInterval(updateMarketDataAndExecute, 2500);

// =============== API ROUTES ===============
app.use(express.json());

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    trading_mode: isBinanceTestnet ? "testnet" : "live",
    strategy: "High_Inflow_Quant_Futures_v4_50L_MoneyFlow_ProfitFilter",
    timeframe: "1m",
    open_trades: Object.keys(activePositions).length,
    max_open_trades: maxOpenTrades,
    min_expected_net_pnl_usd: MIN_EXPECTED_NET_PNL_USD,
    min_expected_net_pnl_ratio: MIN_EXPECTED_NET_PNL_RATIO,
    server_ip: serverIp,
  });
});

app.get("/api/v1/balance", async (req, res) => {
  if (!exchange || !isExchangeAuthenticated) {
    await initializeExchange();
    if (!exchange || !isExchangeAuthenticated) {
      return res.json({ balance_usdt: 0 });
    }
  }
  try {
    let usdt = 0;
    try {
      const bal = await exchange.fetchBalance();
      usdt = bal.USDT?.total ?? bal.USDT?.free ?? (bal as any).total?.USDT ?? (bal as any).free?.USDT ?? 0;
    } catch (e) {
      const balFut = await exchange.fetchBalance({ type: "future" });
      usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
    }
    res.json({ balance_usdt: usdt });
  } catch (e: any) {
    res.json({ balance_usdt: 0, error: e.message });
  }
});

app.get("/api/v1/config", (req, res) => {
  res.json({
    exchange: { pair_whitelist: whitelistCoins, testnet: isBinanceTestnet },
    dry_run: false,
    leverage: targetLeverage,
    stop_loss_pct: activeStopLossPct,
    
    stake_amount: activeStakeAmount,
    max_open_trades: maxOpenTrades,
    min_expected_net_pnl_usd: MIN_EXPECTED_NET_PNL_USD,
    min_expected_net_pnl_ratio: MIN_EXPECTED_NET_PNL_RATIO
  });
});

app.post("/api/v1/config", (req, res) => {
  const conf = req.body;
  let whitelistChanged = false;
  if (conf.exchange?.pair_whitelist && Array.isArray(conf.exchange.pair_whitelist)) {
    whitelistCoins = conf.exchange.pair_whitelist;
    whitelistChanged = true;
  }
  
  if (conf.leverage) targetLeverage = conf.leverage;
  if (conf.stop_loss_pct) activeStopLossPct = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
  
  if (conf.stake_amount) activeStakeAmount = conf.stake_amount;
  if (conf.max_open_trades) maxOpenTrades = conf.max_open_trades;
  
  fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  addEngineLog("SYSTEM", "Konfigürasyon güncellendi.");
  
  if (whitelistChanged) {
    startBinanceServerWebSocket();
    setTimeout(updateMarketDataAndExecute, 200);
  }

  res.json({ status: "success" });
});

app.get("/api/v1/logs", (req, res) => {
  res.json({ logs: engineLogs });
});

app.get("/api/v1/trades", (req, res) => {
  const mappedTrades = allTrades.map(t => {
    let currentRate = t.entryPrice;
    if (t.is_open && latestMetricsPerCoin[t.pair]) {
      currentRate = latestMetricsPerCoin[t.pair].currentPrice;
    }
    
    // Exact 1:1 Binance PnL formula
    const pnlUSD = t.type === "long" 
      ? (currentRate - t.entryPrice) * t.amount
      : (t.entryPrice - currentRate) * t.amount;

    const initialMargin = (t.entryPrice * t.amount) / (t.leverage || 1);
    const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;

    const stopLossPrice = t.type === "long"
      ? t.entryPrice * (1 - activeStopLossPct / 100)
      : t.entryPrice * (1 + activeStopLossPct / 100);

    return {
      id: t.trade_id.toString(),
      pair: t.pair,
      is_open: t.is_open,
      type: t.type,
      amount: t.amount,
      leverage: t.leverage,
      open_rate: t.entryPrice,
      current_rate: t.close_rate || currentRate,
      close_rate: t.close_rate,
      open_date: new Date(t.openDate).toISOString().replace('T', ' ').slice(0, 19),
      close_date: t.close_date ? new Date(t.close_date).toISOString().replace('T', ' ').slice(0, 19) : undefined,
      close_reason: t.close_reason,
      profit_pct: t.is_open ? Number(roePct.toFixed(2)) : t.profit_pct,
      profit_abs: t.is_open ? Number(pnlUSD.toFixed(2)) : t.profit_abs,
      profit_ratio: (t.is_open ? roePct : t.profit_pct) / 100,
      deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
      target_pct: 0,
      stop_loss_pct: t.stopLossPct || activeStopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: 0
    };
  });
  
  res.json({ trades: mappedTrades });
});

app.get("/api/v1/profit", (req, res) => {
  const closedTrades = allTrades.filter(t => !t.is_open);
  const winning = closedTrades.filter(t => (t.profit_abs || 0) > 0);
  const total = closedTrades.reduce((acc, t) => acc + (t.profit_abs || 0), 0);
  
  res.json({
    profit_closed_coin: Number(total.toFixed(2)),
    winning_trades: winning.length,
    losing_trades: closedTrades.length - winning.length,
    winrate: closedTrades.length > 0 ? winning.length / closedTrades.length : 0
  });
});

app.post("/api/v1/start", (req, res) => {
  startTradingEngine();
  res.json({ status: "success", message: "Node.js Bot Engine Started" });
});

app.post("/api/v1/stop", async (req, res) => {
  await stopTradingEngine();
  res.json({ status: "success", message: "Node.js Bot Engine Stopped" });
});

app.post("/api/v1/forceexit", async (req, res) => {
  const { tradeid } = req.body;
  if (tradeid === "all") {
    for (const sym of Object.keys(activePositions)) {
      await executeExit(sym, "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[sym]?.currentPrice || 0);
    }
    return res.json({ status: "success", message: "Tüm işlemler kapatıldı." });
  } else {
    const posEntry = Object.entries(activePositions).find(([_, p]) => p.trade_id.toString() === tradeid.toString());
    if (posEntry) {
      await executeExit(posEntry[0], "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[posEntry[0]]?.currentPrice || 0);
      return res.json({ status: "success", message: "İşlem kapatıldı." });
    } else {
      // Check for orphaned trades in allTrades
      const orphanedTrade = allTrades.find(t => t.trade_id.toString() === tradeid.toString() && t.is_open);
      if (orphanedTrade) {
        orphanedTrade.is_open = false;
        orphanedTrade.close_date = Date.now();
        orphanedTrade.close_reason = "Hayalet Pozisyon Temizlendi";
        orphanedTrade.close_rate = orphanedTrade.current_rate || orphanedTrade.entryPrice;
        return res.json({ status: "success", message: "Hayalet işlem sistemden temizlendi." });
      }
    }
  }
  res.status(400).json({ error: "İşlem bulunamadı." });
});

app.post("/api/v1/forceentry", async (req, res) => {
  const { symbol, side } = req.body;
  const sym = symbol || whitelistCoins[0] || "BTC/USDT";
  const type = side === "short" ? "short" : "long";
  const currentPrice = latestMetricsPerCoin[sym]?.currentPrice || 0;
  
  if (activePositions[sym]) {
    return res.status(400).json({ error: `${sym} üzerinde zaten açık bir pozisyon var.` });
  }
  
  try {
    await executeEntry(sym, type, currentPrice);
    res.json({ status: "success", message: `${sym} ${type.toUpperCase()} pozisyonu başarıyla açıldı.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Deep Data for UI & OrderBook
app.get("/api/v1/orderbook", async (req, res) => {
  const reqSymbol = (req.query.symbol as string) || whitelistCoins[0] || 'BTC/USDT';
  const ob = await refreshFuturesDepth(reqSymbol);
  const m = latestMetricsPerCoin[reqSymbol];
  if (!ob?.bids?.length || !ob?.asks?.length) return res.status(503).json({ error: 'Gerçek Binance Futures order book verisi hazır değil.' });
  const p = m?.currentPrice || Number(ob.bids[0][0]);
  res.json({
    orderBook: ob,
    metrics: {
      OBI: m?.obi ?? 0, MicroPrice: m?.microPrice || p, MidPrice: m?.midPrice || p,
      currentPrice: p, SpreadPct: m?.spreadPct || 0, deepScore: m?.deepScore || 0,
      takerBuyRatio: m?.takerBuyRatio ?? 0.5, netInflowUSD: m?.netInflowUSD || 0,
      largeTradeNetUSD: m?.largeTradeNetUSD || 0, longAdvantage: m?.longAdvantage || 50,
      shortAdvantage: m?.shortAdvantage || 50, expectedNetPnlUsdLong: m?.expectedNetPnlUsdLong || 0,
      expectedNetPnlUsdShort: m?.expectedNetPnlUsdShort || 0, minimumNetPnlUSD: m?.minimumNetPnlUSD || MIN_EXPECTED_NET_PNL_USD,
      expectedMovePctLong: m?.expectedMovePctLong || 0, expectedMovePctShort: m?.expectedMovePctShort || 0,
      movementPotentialLong: m?.movementPotentialLong || 0, movementPotentialShort: m?.movementPotentialShort || 0,
      source: isBinanceTestnet ? 'BINANCE FUTURES TESTNET' : 'BINANCE FUTURES LIVE'
    }
  });
});

app.get("/api/v1/deepdata", (req, res) => {
  res.json({ metrics: latestMetricsPerCoin, orderbooks: latestOrderBooks });
});

app.get("/api/v1/live-tickers", (req, res) => {
  const results = whitelistCoins.map(sym => {
    const m = latestMetricsPerCoin[sym];
    return {
      symbol: sym,
      price: m?.currentPrice || 0,
      change_24h_pct: m?.change_24h_pct || 0,
      volume_24h_usdt: m?.volume_24h_usdt || 0,
      deepScore: m?.deepScore || 0,
      netInflowUSD: m?.netInflowUSD || 0,
      takerBuyRatio: m?.takerBuyRatio || 0.5,
      updated_at: Date.now()
    };
  });
  res.json({ tickers: results });
});

// Comprehensive Binance Futures USDT Markets Repository
const DEFAULT_BINANCE_FUTURES_PAIRS: string[] = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "SUI/USDT",
  "PEPE/USDT", "SHIB/USDT", "NEAR/USDT", "LINK/USDT", "APT/USDT", "WIF/USDT", "BONK/USDT", "FET/USDT", "RENDER/USDT",
  "TIA/USDT", "INJ/USDT", "FTM/USDT", "BCH/USDT", "BLUR/USDT", "BEAM/USDT", "BOME/USDT", "BIGTIME/USDT", "BAKE/USDT",
  "BAND/USDT", "BAT/USDT", "BEL/USDT", "BNT/USDT", "BAL/USDT", "BICO/USDT", "BADGER/USDT", "BB/USDT", "BANANA/USDT",
  "BRETT/USDT", "1000BONK/USDT", "1000PEPE/USDT", "1000FLOKI/USDT", "1000SATS/USDT", "1000SHIB/USDT", "1000RATS/USDT",
  "1000CAT/USDT", "DOT/USDT", "MATIC/USDT", "LTC/USDT", "UNI/USDT", "ATOM/USDT", "ETC/USDT", "FIL/USDT", "ARB/USDT",
  "OP/USDT", "STX/USDT", "KAS/USDT", "RUNE/USDT", "ICP/USDT", "IMX/USDT", "GRT/USDT", "AAVE/USDT", "MKR/USDT",
  "LDO/USDT", "GALA/USDT", "SAND/USDT", "MANA/USDT", "CHZ/USDT", "AXS/USDT", "CRV/USDT", "DYDX/USDT", "PENDLE/USDT",
  "JUP/USDT", "PYTH/USDT", "W/USDT", "ENA/USDT", "NOT/USDT", "TON/USDT", "ZRO/USDT", "STRK/USDT", "IO/USDT", "ONDO/USDT",
  "LISTA/USDT", "TAO/USDT", "NEIRO/USDT", "TURBO/USDT", "POPCAT/USDT", "MEW/USDT", "HMSTR/USDT", "CATI/USDT",
  "MOODENG/USDT", "GOAT/USDT", "PNUT/USDT", "ACT/USDT", "THE/USDT", "MOVE/USDT", "ME/USDT", "VIRTUAL/USDT", "PENGU/USDT",
  "KAIA/USDT", "DRIFT/USDT", "DEGEN/USDT", "COW/USDT", "CETUS/USDT", "AERO/USDT", "ENS/USDT", "ORDI/USDT", "TRB/USDT",
  "GAS/USDT", "ARK/USDT", "GMX/USDT", "SNX/USDT", "KAVA/USDT", "COMP/USDT", "ZEC/USDT", "DASH/USDT", "XMR/USDT",
  "EOS/USDT", "NEO/USDT", "QTUM/USDT", "IOTA/USDT", "VET/USDT", "THETA/USDT", "ALGO/USDT", "ZIL/USDT", "ENJ/USDT",
  "1INCH/USDT", "SUSHI/USDT", "YFI/USDT", "KSM/USDT", "WAVES/USDT", "CELO/USDT", "ONE/USDT", "HOT/USDT", "ZRX/USDT",
  "OCEAN/USDT", "ANKR/USDT", "SKL/USDT", "CELER/USDT", "CTSI/USDT", "CHR/USDT", "DUSK/USDT", "COTI/USDT", "DGB/USDT",
  "NKN/USDT", "STORJ/USDT", "RSR/USDT", "OGN/USDT", "KNC/USDT", "LRC/USDT", "OMG/USDT", "HBAR/USDT", "RVN/USDT",
  "ZEN/USDT", "NULS/USDT", "FLOW/USDT", "EGLD/USDT", "KLAY/USDT", "MINA/USDT", "RAY/USDT", "GNO/USDT", "SUPER/USDT",
  "WOO/USDT", "JASMY/USDT", "ACH/USDT", "ARKM/USDT", "CYBER/USDT", "SEI/USDT", "MEME/USDT", "BLZ/USDT", "TRU/USDT",
  "LPT/USDT", "PERP/USDT", "API3/USDT", "MAGIC/USDT", "HOOK/USDT", "HIGH/USDT", "ASTR/USDT", "ALPHA/USDT", "SPELL/USDT",
  "SSV/USDT", "CFX/USDT", "LQTY/USDT", "TRX/USDT", "ID/USDT", "EDU/USDT", "SFP/USDT", "MAV/USDT", "XVG/USDT", "WLD/USDT"
];

let allFuturesMarketsList: string[] = [...DEFAULT_BINANCE_FUTURES_PAIRS];

// Dynamically refresh Binance Futures Pairs list from Binance Public API
async function loadBinanceFuturesMarkets() {
  try {
    const base = isBinanceTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const res = await fetch(`${base}/fapi/v1/exchangeInfo`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.symbols)) {
        const set = new Set<string>(DEFAULT_BINANCE_FUTURES_PAIRS);
        for (const s of data.symbols) {
          if (s.quoteAsset === "USDT" && s.status === "TRADING" && s.contractType === "PERPETUAL") {
            const formatted = `${s.baseAsset}/USDT`;
            set.add(formatted);
          }
        }
        allFuturesMarketsList = Array.from(set);
      }
    }
  } catch (e) {}
}

loadBinanceFuturesMarkets();
setInterval(loadBinanceFuturesMarkets, 30 * 60 * 1000);

// Candlestick Klines Proxy Route
app.get("/api/v1/klines", async (req, res) => {
  const rawSymbol = (req.query.symbol as string) || "BTC/USDT";
  const interval = (req.query.interval as string) || "5m";
  const limit = parseInt((req.query.limit as string) || "80", 10);
  const cleanSymbol = rawSymbol.replace("/", "").toUpperCase();

  try {
    const base = isBinanceTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const fapiRes = await fetch(`${base}/fapi/v1/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`);
    if (fapiRes.ok) {
      const data = await fapiRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }
    }
  } catch (e) {}

  try {
    if (exchange) {
      const ohlcv = await exchange.fetchOHLCV(rawSymbol, interval, undefined, limit);
      if (ohlcv && ohlcv.length > 0) {
        const formatted = ohlcv.map(d => [d[0], d[1].toString(), d[2].toString(), d[3].toString(), d[4].toString(), d[5].toString()]);
        return res.json(formatted);
      }
    }
  } catch (e) {}

  return res.json([]);
});

// Futures Search Proxy
app.get("/api/v1/markets/search", (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim().toUpperCase();
    if (!q) {
      return res.json({ markets: allFuturesMarketsList.slice(0, 40) });
    }

    const cleanQ = q.replace("/", "").replace("USDT", "");
    
    // Sort matches: startWith query first, then contains
    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];

    for (const pair of allFuturesMarketsList) {
      const base = pair.split("/")[0];
      if (base === cleanQ || pair === q) {
        startsWithMatches.unshift(pair);
      } else if (base.startsWith(cleanQ)) {
        startsWithMatches.push(pair);
      } else if (base.includes(cleanQ) || pair.includes(q)) {
        containsMatches.push(pair);
      }
    }

    const results = [...startsWithMatches, ...containsMatches].slice(0, 50);
    res.json({ markets: results });
  } catch(e: any) {
    res.json({ markets: DEFAULT_BINANCE_FUTURES_PAIRS.slice(0, 30) });
  }
});

app.get("/api/v1/ping", (req, res) => res.json({ status: "pong" }));
app.get("/api/v1/pairlists", (req, res) => res.json([]));
app.get("/api/v1/strategies", (req, res) => res.json({}));

function translateBinanceError(errMsg: string, ip: string): string {
  if (!errMsg) return "Binance bağlantı hatası oluştu.";
  if (errMsg.includes("-2015") || errMsg.includes("Invalid API-key, IP, or permissions")) {
    return `Binance API Yetki Hatası (-2015): API Key geçersiz, IP kısıtlaması var veya 'Vadeli İşlemleri Etkinleştir' (Enable Futures) yetkisi verilmemiş.\n\nÇözüm: Binance > API Yönetimi ekranında:\n1. 'Vadeli İşlemleri Etkinleştir' (Enable Futures) kutucuğunu işaretleyin.\n2. IP erişim kısıtlamasını 'Kısıtlanmamış' yapın veya Sunucu IP'sini (${ip}) ekleyin.\n3. 'Okuma Yetkisi'nin açık olduğunu doğrulayın.`;
  }
  if (errMsg.includes("-2014") || errMsg.includes("API-key format invalid")) {
    return "Binance API Key Formatı Geçersiz (-2014): API Key veya Secret Key hatalı/eksik girilmiş. Lütfen başında ve sonunda boşluk kalmayacak şekilde kopyalayıp yapıştırın.";
  }
  if (errMsg.includes("-1021") || errMsg.includes("recvWindow") || errMsg.includes("Timestamp")) {
    return "Binance Zaman Senkronizasyonu (-1021): İstek zaman aşımına uğradı veya zaman farkı oluştu. recvWindow ayarı ile tekrar deneniyor.";
  }
  if (errMsg.includes("451") || errMsg.includes("Geofence") || errMsg.includes("restricted location")) {
    return "Binance Bölge Kısıtlaması (451): Binance bu sunucunun bulunduğu bölgeden Vadeli İşlemler erişimini kısıtlıyor.";
  }
  return errMsg;
}

app.post("/api/v1/exchange-keys", async (req, res) => {
  const { apiKey, secretKey, testnet } = req.body;
  if (!apiKey || !secretKey || apiKey.trim() === "" || secretKey.trim() === "") {
    // Clear keys in config.json
    try {
      let conf: any = {};
      if (fs.existsSync("config.json")) {
        conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      }
      if (!conf.exchange) conf.exchange = {};
      conf.exchange.key = "";
      conf.exchange.secret = "";
      conf.exchange.testnet = false;
      fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
    } catch(e) {}
    await initializeExchange();
    return res.json({ success: true, balance_usdt: 0 });
  }
  
  const currentIp = await getServerPublicIp();

  try {
    const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
    const tempExchange = new ExchangeClass({
      apiKey: apiKey.trim(),
      secret: secretKey.trim(),
      enableRateLimit: true,
      options: { 
        defaultType: "future", 
        adjustForTimeDifference: true,
        recvWindow: 60000 
      }
    });
    
    if (testnet === true) {
      if (typeof tempExchange.enableDemoTrading === "function") {
        tempExchange.enableDemoTrading(true);
      } else {
        tempExchange.setSandboxMode(true);
      }
    }
    
    // Test balance fetching directly (Futures first, then Spot fallback)
    let usdt = 0;
    try {
      const balFut = await tempExchange.fetchBalance({ type: "future" });
      usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
    } catch (errFut: any) {
      try {
        const balSpot = await tempExchange.fetchBalance();
        usdt = balSpot.USDT?.total ?? balSpot.USDT?.free ?? (balSpot as any).total?.USDT ?? (balSpot as any).free?.USDT ?? 0;
      } catch (errSpot: any) {
        const rawErr = errFut?.message || errSpot?.message || "Bakiye okunamadı.";
        throw new Error(translateBinanceError(rawErr, currentIp));
      }
    }
    
    // Persist to config.json
    try {
      let conf: any = {};
      if (fs.existsSync("config.json")) {
        conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      }
      if (!conf.exchange) conf.exchange = {};
      conf.exchange.key = apiKey.trim();
      conf.exchange.secret = secretKey.trim();
      conf.exchange.testnet = testnet === true;
      fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
    } catch(e) {}

    await initializeExchange();
    
    return res.json({ success: true, balance_usdt: usdt });
  } catch(e: any) {
    const translated = translateBinanceError(e.message || "", currentIp);
    return res.json({ success: false, message: translated });
  }
});

// Vite middleware in development
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then(vite => app.use(vite.middlewares));
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`High Inflow Quant Futures Engine running at http://0.0.0.0:${PORT}`);
  initializeExchange();
});
