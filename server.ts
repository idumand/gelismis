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
let engineLoopBusy = false;
let lastLogId = 0;
const engineLogs: any[] = [];
const pendingEntries = new Set<string>();
let serverIp = "Tespit ediliyor...";
let lastIpFetchTime = 0;

let exchange: ccxt.Exchange | null = null;
let exchangeTestnet = false;
const FUTURES_LIVE_REST = "https://fapi.binance.com";
const FUTURES_TESTNET_REST = "https://testnet.binancefuture.com";
const FUTURES_LIVE_WS = "wss://fstream.binance.com/stream";
const FUTURES_TESTNET_WS = "wss://stream.binancefuture.com/stream";

function futuresRestBase() { return exchangeTestnet ? FUTURES_TESTNET_REST : FUTURES_LIVE_REST; }
function futuresWsBase() { return exchangeTestnet ? FUTURES_TESTNET_WS : FUTURES_LIVE_WS; }
let targetLeverage = 15;
let tradeCounter = 1;

let isExchangeAuthenticated = false;
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
  exitReviewMeasurements: { longAdv: number; shortAdv: number; gap: number }[];
  exitReviewState: "none" | "3" | "6" | "10";
  profitProtectionActive?: boolean;
  maxSeenNetPnl?: number;
  entryFee?: number;
  exitFee?: number;
  // Snapshot of the quantitative profit target at entry. This is never overwritten by later market changes.
  modelTargetPrice?: number;
  modelTargetMovePct?: number;
  modelExpectedNetPnlUSD?: number;
  modelExpectedGrossPnlUSD?: number;
  modelTargetHit?: boolean;
  modelMaxFavorablePnlUSD?: number;
  modelConfidence?: number;
  // Profit-protection state: require persistent evidence before closing a profitable trade.
  profitProtectionEvidence?: number;
  profitProtectionPeakNetUSD?: number;
  profitProtectionFloorUSD?: number;
}

interface FuturesBookState {
  bids: Map<string, number>;
  asks: Map<string, number>;
  lastUpdateId: number;
  initialized: boolean;
  syncing: boolean;
  lastEventTime: number;
}


const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};
const futuresBooks: Record<string, FuturesBookState> = {};
let bookResyncLocks: Record<string, boolean> = {};
let moneyFlowHistory: Record<string, { t: number; net: number; buy: number; sell: number }[]> = {};
let priceHistoryMap: Record<string, number[]> = {};
let volumeHistoryMap: Record<string, number[]> = {};
let recentTradesMap: Record<string, any[]> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08;
const ESTIMATED_SLIPPAGE_PCT = 0.10;
const MIN_NET_PROFIT_USD = 0.25;
const MIN_EXPECTED_MOVE_PCT = 0.18;
const LARGE_TRADE_WEIGHT_START_PERCENTILE = 75;
const VERY_LARGE_TRADE_WEIGHT_START_PERCENTILE = 90;

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
    exchangeTestnet = conf?.exchange?.testnet === true;
    
    const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY;
    const secret = conf?.exchange?.secret || process.env.BINANCE_API_SECRET;
    
    targetLeverage = conf?.leverage || 15;
    
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
      if (conf?.exchange?.testnet === true) {
        if (typeof exchange.enableDemoTrading === "function") {
          exchange.enableDemoTrading(true);
        } else {
          exchange.setSandboxMode(true);
        }
        addEngineLog("INFO", "Binance TESTNET modu aktif. Gerçek para KULLANILMAYACAKTIR.");
      } else {
        addEngineLog("INFO", "Binance API bağlantısı kuruldu. Gerçek emirler gönderilecek.");
      }
      isExchangeAuthenticated = true;
      syncBinancePositions(); // Auto-sync open positions on start
    } else {
      exchange = null;
      isExchangeAuthenticated = false;
      addEngineLog("WARN", "API Kimlik Bilgileri eksik. Sistem SİMÜLASYON modunda çalışıyor.");
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
          const type = (pos.side === 'long' || pos.contracts > 0) ? "long" : "short";
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

function analyzeOrderFlowAndInflow(
  ob: any,
  recentTrades: any[],
  prices: number[],
  volumes: number[],
  currentPrice: number
): OrderFlowMetrics & any {
  const rawBids = Array.isArray(ob?.bids) ? ob.bids : [];
  const rawAsks = Array.isArray(ob?.asks) ? ob.asks : [];
  const depth = Math.min(50, rawBids.length, rawAsks.length);
  if (depth < 20) throw new Error("Futures Order Book derinliği yetersiz");

  const bidSlice = rawBids.slice(0, depth), askSlice = rawAsks.slice(0, depth);
  const avgBid = bidSlice.reduce((a,b)=>a+Number(b[1]||0),0)/depth;
  const avgAsk = askSlice.reduce((a,b)=>a+Number(b[1]||0),0)/depth;
  const percentile = (values:number[], p:number) => { if (!values.length) return 0; const v=[...values].sort((a,b)=>a-b); const idx=Math.min(v.length-1, Math.max(0, Math.floor((p/100)*(v.length-1)))); return v[idx]; };
  const bidSizes = bidSlice.map((x:any)=>Number(x[1]||0)), askSizes=askSlice.map((x:any)=>Number(x[1]||0));
  const bidQ75=percentile(bidSizes,75), askQ75=percentile(askSizes,75), bidQ90=percentile(bidSizes,90), askQ90=percentile(askSizes,90);

  const levelScore = (arr:any[], q75:number, q90:number, side:'bid'|'ask') => arr.reduce((sum, level, i) => {
    const size=Number(level[1]||0), rel = size / (side==='bid'?avgBid:avgAsk || 1);
    const noisePenalty = rel < 0.2 ? 0.15 : 1;
    const spoofPenalty = rel > 15 ? 0.35 : 1;
    const zone = i < 5 ? 2.4 : (i < 15 ? 1.35 : 0.7);
    const distanceWeight = 1 / Math.pow(i+1,0.65);
    return sum + size * zone * distanceWeight * noisePenalty * spoofPenalty;
  },0);
  // Entry model: first 10 levels are the primary entry zone.
  // 11-20 validates continuation, 21-30 checks nearby opposing liquidity,
  // and 31-50 estimates the available movement room.
  const bidEntry10 = levelScore(bidSlice.slice(0,10), bidQ75, bidQ90, 'bid');
  const askEntry10 = levelScore(askSlice.slice(0,10), askQ75, askQ90, 'ask');
  const bidConfirm20 = levelScore(bidSlice.slice(10,20), bidQ75, bidQ90, 'bid');
  const askConfirm20 = levelScore(askSlice.slice(10,20), askQ75, askQ90, 'ask');
  const bidConfirm30 = levelScore(bidSlice.slice(20,30), bidQ75, bidQ90, 'bid');
  const askConfirm30 = levelScore(askSlice.slice(20,30), askQ75, askQ90, 'ask');
  // Weighted entry score: primary 10 levels dominate, confirmation zones are supportive only.
  const bidScore30 = bidEntry10 * 0.62 + bidConfirm20 * 0.23 + bidConfirm30 * 0.15;
  const askScore30 = askEntry10 * 0.62 + askConfirm20 * 0.23 + askConfirm30 * 0.15;
  const entryTotal = bidEntry10 + askEntry10 || 1;
  const entryLongAdvantage = bidEntry10 / entryTotal * 100;
  const entryShortAdvantage = askEntry10 / entryTotal * 100;
  const deepBid = levelScore(bidSlice.slice(30,50), bidQ75, bidQ90, 'bid');
  const deepAsk = levelScore(askSlice.slice(30,50), askQ75, askQ90, 'ask');
  const obTotal = bidScore30 + askScore30 || 1;
  const longOBAdvantage = bidScore30 / obTotal * 100;
  const shortOBAdvantage = askScore30 / obTotal * 100;

  const usdTrades=(recentTrades||[]).map((t:any)=>({ ...t, usd:Number(t.usd||((t.amount||0)*(t.price||currentPrice))) })).filter(t=>t.usd>0);
  const sizes=usdTrades.map(t=>t.usd); const q75=percentile(sizes,75), q90=percentile(sizes,90);
  let weightedBuy=0, weightedSell=0;
  for (const t of usdTrades) {
    const w=t.usd>=q90?2.25:t.usd>=q75?1.5:Math.max(0.45, Math.min(1.0,t.usd/(q75||1)));
    if (t.side==='buy') weightedBuy += t.usd*w; else weightedSell += t.usd*w;
  }
  const weightedTotal=weightedBuy+weightedSell||1;
  const takerBuyRatio=weightedBuy/weightedTotal;
  const netInflowUSD=weightedBuy-weightedSell;

  const now=Date.now();
  const recent20=usdTrades.filter(t=>t.timestamp>now-20_000);
  const prev20=usdTrades.filter(t=>t.timestamp>now-40_000 && t.timestamp<=now-20_000);
  const net20=recent20.reduce((a,t)=>a+(t.side==='buy'?t.usd:-t.usd),0);
  const netPrev20=prev20.reduce((a,t)=>a+(t.side==='buy'?t.usd:-t.usd),0);
  const inflowMomentum = net20-netPrev20;
  const buyAcceleration = recent20.filter(t=>t.side==='buy').reduce((a,t)=>a+t.usd,0) - prev20.filter(t=>t.side==='buy').reduce((a,t)=>a+t.usd,0);
  const sellAcceleration = recent20.filter(t=>t.side==='sell').reduce((a,t)=>a+t.usd,0) - prev20.filter(t=>t.side==='sell').reduce((a,t)=>a+t.usd,0);

  const inflowLongScore = 50 + Math.tanh((netInflowUSD/(weightedTotal||1))*3)*50;
  const inflowShortScore = 100-inflowLongScore;
  const rawLongAdvantage = longOBAdvantage*0.42 + inflowLongScore*0.23 + takerBuyRatio*100*0.25 + (inflowMomentum>=0?Math.min(10, Math.abs(inflowMomentum)/(weightedTotal||1)*100):0);
  const rawShortAdvantage = shortOBAdvantage*0.42 + inflowShortScore*0.23 + (1-takerBuyRatio)*100*0.25 + (inflowMomentum<0?Math.min(10, Math.abs(inflowMomentum)/(weightedTotal||1)*100):0);
  const advTotal = rawLongAdvantage + rawShortAdvantage || 1;
  const longAdvantage = rawLongAdvantage / advTotal * 100;
  const shortAdvantage = rawShortAdvantage / advTotal * 100;
  const gap=longAdvantage-shortAdvantage;

  const bestBid=Number(bidSlice[0]?.[0]||currentPrice), bestAsk=Number(askSlice[0]?.[0]||currentPrice);
  const midPrice=(bestBid+bestAsk)/2, spreadPct=midPrice>0?((bestAsk-bestBid)/midPrice)*100:0;
  const microPrice = (bestBid * Number(askSlice[0]?.[1]||0) + bestAsk * Number(bidSlice[0]?.[1]||0)) / (Number(bidSlice[0]?.[1]||0)+Number(askSlice[0]?.[1]||0)||1);

  // Deep movement potential: look past the first wall. First wall is an obstacle, not an automatic TP.
  const deepWallsLong=askSlice.slice(15,50).filter((a:any)=>Number(a[1]) >= askQ75*1.25);
  const deepWallsShort=bidSlice.slice(15,50).filter((b:any)=>Number(b[1]) >= bidQ75*1.25);
  const firstDeepLong=deepWallsLong[0]?.[0];
  const firstDeepShort=deepWallsShort[0]?.[0];
  const longRoomPct = firstDeepLong ? Math.max(0,(Number(firstDeepLong)-currentPrice)/currentPrice*100) : Math.max(0, ((askSlice[49]?.[0]||currentPrice*1.01)-currentPrice)/currentPrice*100);
  const shortRoomPct = firstDeepShort ? Math.max(0,(currentPrice-Number(firstDeepShort))/currentPrice*100) : Math.max(0, (currentPrice-(bidSlice[49]?.[0]||currentPrice*0.99))/currentPrice*100);
  const returns=[]; for(let i=1;i<prices.length;i++){ if(prices[i-1]>0) returns.push((prices[i]-prices[i-1])/prices[i-1]*100); }
  const stdDev = returns.length ? Math.sqrt(returns.reduce((s,r)=>s+(r-(returns.reduce((a,b)=>a+b,0)/returns.length))**2,0)/returns.length) : 0;
  const volatilityMove = Math.max(0.05, stdDev*2.0);
  const longExpectedMovePct = Math.max(0, Math.min(longRoomPct, Math.max(volatilityMove, Math.min(3, longRoomPct))));
  const shortExpectedMovePct = Math.max(0, Math.min(shortRoomPct, Math.max(volatilityMove, Math.min(3, shortRoomPct))));

  const notionalUSD=Math.max(6,activeStakeAmount*targetLeverage);
  const totalFrictionPct=ESTIMATED_FEE_PCT+ESTIMATED_SLIPPAGE_PCT+spreadPct;
  const frictionUSD=notionalUSD*(totalFrictionPct/100);
  const expectedNetPnlUsdLong=notionalUSD*(longExpectedMovePct/100)-frictionUSD;
  const expectedNetPnlUsdShort=notionalUSD*(shortExpectedMovePct/100)-frictionUSD;
  const minNetProfitUSD=Math.max(MIN_NET_PROFIT_USD,notionalUSD*Math.max(0.0015, totalFrictionPct/100*1.25));
  const longProfitScore = expectedNetPnlUsdLong>=minNetProfitUSD ? Math.min(100, expectedNetPnlUsdLong/(minNetProfitUSD||1)*100) : Math.max(0, expectedNetPnlUsdLong/(minNetProfitUSD||1)*100);
  const shortProfitScore = expectedNetPnlUsdShort>=minNetProfitUSD ? Math.min(100, expectedNetPnlUsdShort/(minNetProfitUSD||1)*100) : Math.max(0, expectedNetPnlUsdShort/(minNetProfitUSD||1)*100);
  const movementScoreLong = Math.min(100, longExpectedMovePct/Math.max(MIN_EXPECTED_MOVE_PCT,volatilityMove)*60 + Math.min(40,longRoomPct*12));
  const movementScoreShort = Math.min(100, shortExpectedMovePct/Math.max(MIN_EXPECTED_MOVE_PCT,volatilityMove)*60 + Math.min(40,shortRoomPct*12));

  const strongResistance=firstDeepLong|| (askSlice[29]?.[0]||currentPrice*1.01);
  const strongSupport=firstDeepShort || (bidSlice[29]?.[0]||currentPrice*0.99);
  const obi=(bidScore30-askScore30)/(bidScore30+askScore30||1);

  return {
    longAdvantage: Math.max(0,Math.min(100,longAdvantage)),
    shortAdvantage: Math.max(0,Math.min(100,shortAdvantage)),
    entryLongAdvantage: Math.max(0,Math.min(100,entryLongAdvantage)),
    entryShortAdvantage: Math.max(0,Math.min(100,entryShortAdvantage)),
    entryGap: entryLongAdvantage-entryShortAdvantage,
    entryZoneLevels: 10,
    confirmationLevels: 20,
    movementLevels: 50,
    gap,
    takerBuyRatio, netInflowUSD,
    weightedBuyUSD: weightedBuy, weightedSellUSD: weightedSell,
    inflowMomentumUSD: inflowMomentum, buyAccelerationUSD: buyAcceleration, sellAccelerationUSD: sellAcceleration,
    expectedNetPnlUsdLong, expectedNetPnlUsdShort, minimumNetPnlUSD:minNetProfitUSD,
    expectedGrossPnlUsdLong: notionalUSD*(longExpectedMovePct/100),
    expectedGrossPnlUsdShort: notionalUSD*(shortExpectedMovePct/100),
    expectedMovePctLong: longExpectedMovePct, expectedMovePctShort: shortExpectedMovePct,
    modelTargetPriceLong: currentPrice*(1+longExpectedMovePct/100),
    modelTargetPriceShort: currentPrice*(1-shortExpectedMovePct/100),
    modelConfidenceLong: Math.min(100, Math.max(0, longProfitScore*0.45 + movementScoreLong*0.35 + longAdvantage*0.20)),
    modelConfidenceShort: Math.min(100, Math.max(0, shortProfitScore*0.45 + movementScoreShort*0.35 + shortAdvantage*0.20)),
    movementScoreLong, movementScoreShort, profitScoreLong: longProfitScore, profitScoreShort: shortProfitScore,
    liquidityMap:{firstTargetLong:Number(askSlice[0]?.[0]||currentPrice),strongResistance:Number(strongResistance),firstTargetShort:Number(bidSlice[0]?.[0]||currentPrice),strongSupport:Number(strongSupport)},
    deepLiquidity:{bidScore:deepBid,askScore:deepAsk,longRoomPct,shortRoomPct},
    obi, predictedProfitPct: gap > 0 ? longExpectedMovePct : -shortExpectedMovePct,
    predictedTimeSec: 60, smartTargetPrice: gap > 0 ? Number(strongResistance) : Number(strongSupport), smartStopPrice: gap > 0 ? Number(strongSupport) : Number(strongResistance),
    liquidityGravityScore: Math.abs(obi*100), microPrice, midPrice, spreadPct, volumeSpike:false, volumeRatio:1, vwap:currentPrice, stdDev, deepScore:gap,
    dataQuality:{depth, trades:usdTrades.length, source:ob?.source||'unknown', staleMs:Date.now()-(ob?.timestamp||0)},
  };
}

// =============== FUTURES-ONLY REAL ORDER BOOK ===============
let binanceWsClient: WsClient | null = null;
let binanceWsReconnectTimer: any = null;

function getFuturesBookState(symbol: string): FuturesBookState {
  if (!futuresBooks[symbol]) {
    futuresBooks[symbol] = { bids: new Map(), asks: new Map(), lastUpdateId: 0, initialized: false, syncing: false, lastEventTime: 0 };
  }
  return futuresBooks[symbol];
}

function setBookSnapshot(symbol: string, data: any) {
  const state = getFuturesBookState(symbol);
  state.bids.clear(); state.asks.clear();
  for (const [p, q] of (data.bids || [])) state.bids.set(String(p), Number(q));
  for (const [p, q] of (data.asks || [])) state.asks.set(String(p), Number(q));
  state.lastUpdateId = Number(data.lastUpdateId || 0);
  state.initialized = true;
  state.syncing = false;
  state.lastEventTime = Date.now();
  publishTopBook(symbol);
}

function applyDepthDiff(symbol: string, data: any) {
  const state = getFuturesBookState(symbol);
  if (!state.initialized) return;
  const U = Number(data.U || 0), u = Number(data.u || 0);
  if (u <= state.lastUpdateId) return;
  if (U > state.lastUpdateId + 1) {
    addEngineLog("WARN", `${symbol} Futures order book sequence gap tespit edildi; snapshot yeniden alınıyor.`);
    resyncFuturesBook(symbol).catch(() => {});
    return;
  }
  for (const [p, q] of (data.b || [])) {
    const n = Number(q); n === 0 ? state.bids.delete(String(p)) : state.bids.set(String(p), n);
  }
  for (const [p, q] of (data.a || [])) {
    const n = Number(q); n === 0 ? state.asks.delete(String(p)) : state.asks.set(String(p), n);
  }
  state.lastUpdateId = u;
  state.lastEventTime = Date.now();
  publishTopBook(symbol);
}

function publishTopBook(symbol: string) {
  const state = getFuturesBookState(symbol);
  const bids = [...state.bids.entries()].map(([p,q]) => [Number(p), q] as [number, number]).sort((a,b) => b[0]-a[0]).slice(0, 50);
  const asks = [...state.asks.entries()].map(([p,q]) => [Number(p), q] as [number, number]).sort((a,b) => a[0]-b[0]).slice(0, 50);
  if (bids.length && asks.length) latestOrderBooks[symbol] = { bids, asks, timestamp: state.lastEventTime, source: "binance-futures", depth: 50, lastUpdateId: state.lastUpdateId };
}

async function resyncFuturesBook(symbol: string) {
  if (bookResyncLocks[symbol]) return;
  bookResyncLocks[symbol] = true;
  try {
    const clean = getMarketSymbol(symbol).toUpperCase();
    const res = await fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${clean}&limit=100`);
    if (!res.ok) throw new Error(`Futures depth snapshot HTTP ${res.status}`);
    setBookSnapshot(symbol, await res.json());
  } finally {
    bookResyncLocks[symbol] = false;
  }
}

async function initializeFuturesBooks() {
  await Promise.all(whitelistCoins.map(s => resyncFuturesBook(s).catch(e => addEngineLog("WARN", `${s} Futures order book snapshot alınamadı: ${e.message}`))));
}

async function startBinanceServerWebSocket() {
  try { if (binanceWsClient) binanceWsClient.terminate(); } catch {}
  await initializeFuturesBooks();
  const streamNames = whitelistCoins.map(c => `${c.replace('/', '').toLowerCase()}@ticker/${c.replace('/', '').toLowerCase()}@depth@100ms/${c.replace('/', '').toLowerCase()}@aggTrade`).join('/');
  try {
    const url = `${futuresWsBase()}?streams=${streamNames}`;
    binanceWsClient = new WsClient(url);
    binanceWsClient.on('open', () => addEngineLog("INFO", `Binance Futures ${exchangeTestnet ? 'TESTNET' : 'LIVE'} WebSocket bağlandı (${whitelistCoins.length} parite, diff-depth + 50 seviye local book).`));
    binanceWsClient.on('message', (raw: any) => handleWsMessage(raw));
    binanceWsClient.on('error', (err: any) => addEngineLog("WARN", `Futures WebSocket hatası: ${err?.message || 'bilinmeyen hata'}`));
    binanceWsClient.on('close', () => {
      clearTimeout(binanceWsReconnectTimer);
      binanceWsReconnectTimer = setTimeout(() => { startBinanceServerWebSocket().catch(() => {}); }, 5000);
    });
  } catch (e: any) {
    addEngineLog("WARN", `Futures WebSocket başlatılamadı: ${e.message}`);
    clearTimeout(binanceWsReconnectTimer);
    binanceWsReconnectTimer = setTimeout(() => { startBinanceServerWebSocket().catch(() => {}); }, 5000);
  }
}

function handleWsMessage(raw: any) {
  try {
    const payload = JSON.parse(raw.toString());
    const stream = payload.stream || '';
    const data = payload.data;
    if (!data) return;
    const symUpper = String(data.s || '').toUpperCase();
    const formattedSym = whitelistCoins.find(w => w.replace('/', '').toUpperCase() === symUpper) || (symUpper.endsWith('USDT') ? `${symUpper.slice(0, -4)}/USDT` : symUpper);

    if (stream.includes('@ticker')) {
      const currentPrice = parseFloat(data.c || data.lastPrice || 0);
      const changePct = parseFloat(data.P || data.priceChangePercent || 0);
      const volumeUsdt = parseFloat(data.q || data.quoteVolume || 0);
      if (currentPrice > 0) {
        if (!priceHistoryMap[formattedSym]) priceHistoryMap[formattedSym] = [];
        priceHistoryMap[formattedSym].push(currentPrice);
        if (priceHistoryMap[formattedSym].length > 120) priceHistoryMap[formattedSym].shift();
        if (!volumeHistoryMap[formattedSym]) volumeHistoryMap[formattedSym] = [];
        volumeHistoryMap[formattedSym].push(volumeUsdt);
        if (volumeHistoryMap[formattedSym].length > 120) volumeHistoryMap[formattedSym].shift();
        latestMetricsPerCoin[formattedSym] = { ...(latestMetricsPerCoin[formattedSym] || {}), currentPrice, change_24h_pct: changePct, volume_24h_usdt: volumeUsdt };
      }
    } else if (stream.includes('@aggTrade')) {
      const price = parseFloat(data.p), qty = parseFloat(data.q);
      if (!(price > 0 && qty > 0)) return;
      const side = data.m ? 'sell' : 'buy';
      if (!recentTradesMap[formattedSym]) recentTradesMap[formattedSym] = [];
      recentTradesMap[formattedSym].push({ price, amount: qty, side, timestamp: data.T, usd: price * qty });
      const cutoff = Date.now() - 15 * 60 * 1000;
      recentTradesMap[formattedSym] = recentTradesMap[formattedSym].filter(t => t.timestamp > cutoff);
    } else if (stream.includes('@depth')) {
      applyDepthDiff(formattedSym, data);
    }
  } catch (err) {
    addEngineLog("WARN", "Futures WebSocket mesajı işlenemedi.");
  }
}

// Start WebSocket stream immediately
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

      // If not in WebSocket buffer or price missing, fetch immediately from Binance REST
      if (!currentPrice || currentPrice === 0 || !ob || !ob.bids || ob.bids.length === 0) {
        try {
          const [depthRes, tickerRes] = await Promise.all([
            fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${cleanSymbol}&limit=100`),
            fetch(`${futuresRestBase()}/fapi/v1/ticker/24hr?symbol=${cleanSymbol}`)
          ]);

          if (depthRes.ok) {
            const depthData = await depthRes.json();
            ob = {
              bids: (depthData.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
              asks: (depthData.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]),
              timestamp: Date.now()
            };
            latestOrderBooks[symbol] = ob;
          }

          if (tickerRes.ok) {
            const tick = await tickerRes.json();
            ticker = {
              last: parseFloat(tick.lastPrice),
              percentage: parseFloat(tick.priceChangePercent),
              quoteVolume: parseFloat(tick.quoteVolume)
            };
            currentPrice = ticker.last;
          }
        } catch (e: any) {
          addEngineLog("WARN", `${symbol} Futures REST fallback başarısız: ${e.message}`);
        }
      }

      if (!currentPrice || currentPrice <= 0) continue;

      // Initialize or update rolling price history (NO FAKE DATA)
      if (!priceHistoryMap[symbol]) {
        priceHistoryMap[symbol] = [];
      }
      priceHistoryMap[symbol].push(currentPrice);
      if (priceHistoryMap[symbol].length > 40) priceHistoryMap[symbol].shift();

      const prices = priceHistoryMap[symbol];
      const volumes = volumeHistoryMap[symbol] || [];

      // Deep Inflow & Order Flow Metrics
      const currentCutoff = Date.now() - (60 * 1000);
      const activeTrades = (recentTradesMap[symbol] || []).filter((t: any) => t.timestamp > currentCutoff);
      const flow = analyzeOrderFlowAndInflow(ob, activeTrades, prices, volumes, currentPrice);

      latestMetricsPerCoin[symbol] = {
        currentPrice,
        change_24h_pct: ticker?.percentage || latestMetricsPerCoin[symbol]?.change_24h_pct || 0,
        volume_24h_usdt: ticker?.quoteVolume || latestMetricsPerCoin[symbol]?.volume_24h_usdt || 0,
        ...flow
      };

      const pos = activePositions[symbol];

      // ================= EXITS: ADAPTIVE DYNAMIC TRAILING & OF REVIEW =================
      if (pos) {
        if (currentPrice > pos.peakPrice && pos.type === "long") pos.peakPrice = currentPrice;
        if (currentPrice < pos.peakPrice && pos.type === "short") pos.peakPrice = currentPrice;

        const pnlUSD = pos.type === "long"
          ? (currentPrice - pos.entryPrice) * pos.amount
          : (pos.entryPrice - currentPrice) * pos.amount;

        const priceMovePct = pos.type === "long"
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        const targetReachedNow = pos.modelTargetPrice
          ? (pos.type === "long" ? currentPrice >= pos.modelTargetPrice : currentPrice <= pos.modelTargetPrice)
          : false;
        if (targetReachedNow) pos.modelTargetHit = true;
        pos.modelMaxFavorablePnlUSD = Math.max(pos.modelMaxFavorablePnlUSD || 0, pnlUSD);

        const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
        const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : priceMovePct * pos.leverage;

        let shouldExit = false;
        let exitReason = "";
        const estimatedNetNow = pnlUSD - (pos.entryFee || 0) - (Math.abs(pnlUSD) * Math.max(0, ESTIMATED_SLIPPAGE_PCT/100));
        pos.maxSeenNetPnl = Math.max(pos.maxSeenNetPnl || 0, estimatedNetNow);

        // KÂR KORUMA: Önce gerçek net kâr oluşmasını bekler. Sonra tek bir 51/49
        // değişimine göre değil, art arda gelen piyasa kanıtlarına göre karar verir.
        if (estimatedNetNow >= flow.minimumNetPnlUSD) {
          pos.profitProtectionActive = true;
        }
        if (pos.profitProtectionActive) {
          pos.profitProtectionPeakNetUSD = Math.max(pos.profitProtectionPeakNetUSD || 0, estimatedNetNow);
          // Zirvede elde edilen net kârın en az %55'i korunmaya çalışılır; küçük hedeflerde
          // mutlak minimum kâr filtresi daha baskındır.
          const peakNet = pos.profitProtectionPeakNetUSD || 0;
          pos.profitProtectionFloorUSD = Math.max(flow.minimumNetPnlUSD * 0.50, peakNet * 0.55);

          const reversal = pos.type === "long"
            ? (flow.gap < -3 && flow.netInflowUSD < 0 && flow.takerBuyRatio < 0.47)
            : (flow.gap > 3 && flow.netInflowUSD > 0 && flow.takerBuyRatio > 0.53);
          const moneyEroding = pos.type === "long"
            ? (flow.inflowMomentum < -0.10 || flow.takerBuyRatio < 0.48)
            : (flow.inflowMomentum > 0.10 || flow.takerBuyRatio > 0.52);
          const deepFlowAgainst = pos.type === "long"
            ? (flow.longAdvantage < 50 || flow.shortAdvantage > flow.longAdvantage)
            : (flow.shortAdvantage < 50 || flow.longAdvantage > flow.shortAdvantage);

          // Kanıtı biriktir; tek tick'lik ters hareketler sayılmaz. Güçlenirse sıfırla.
          if (reversal && moneyEroding && deepFlowAgainst) {
            pos.profitProtectionEvidence = Math.min(5, (pos.profitProtectionEvidence || 0) + 1);
          } else if (!reversal && !moneyEroding) {
            pos.profitProtectionEvidence = Math.max(0, (pos.profitProtectionEvidence || 0) - 1);
          }

          const peakDrawdown = peakNet - estimatedNetNow;
          const floorBreached = estimatedNetNow > 0 && estimatedNetNow <= (pos.profitProtectionFloorUSD || 0);
          const meaningfulErosion = peakNet >= flow.minimumNetPnlUSD && peakDrawdown >= Math.max(flow.minimumNetPnlUSD * 0.75, peakNet * 0.25);

          // Kârda iken para gerçekten eriyor ve sonraki ölçümlerde de ters sinyal devam ediyorsa çık.
          if (!shouldExit && estimatedNetNow > 0 && pos.profitProtectionEvidence >= 2 && (floorBreached || meaningfulErosion)) {
            shouldExit = true;
            exitReason = `Kâr Koruma: Net kâr erimesi + Futures para akışı/Order Flow tersine döndü (Net: +$${estimatedNetNow.toFixed(2)}, Zirve: +$${peakNet.toFixed(2)})`;
          }
        }

        const peakPnlUSD = pos.type === "long"
          ? (pos.peakPrice - pos.entryPrice) * pos.amount
          : (pos.entryPrice - pos.peakPrice) * pos.amount;
        const peakRoePct = initialMargin > 0 ? (peakPnlUSD / initialMargin) * 100 : (peakPnlUSD / (pos.amount * pos.entryPrice)) * 100 * pos.leverage;
        const drawdownFromPeakRoe = peakRoePct - roePct;

        // 0. Akıllı Tepe Tespiti (Smart Peak Detection & Liquidity Wall Hit)
        // Eğer kâr %10'u geçtiyse ve alım/satım baskısı aniden tersine dönerse, ya da likidite duvarına çarpılırsa çık.
        if (!shouldExit && roePct >= 10) {
          const isHittingResistance = pos.type === "long" && currentPrice >= flow.liquidityMap?.strongResistance * 0.999;
          const isHittingSupport = pos.type === "short" && currentPrice <= flow.liquidityMap?.strongSupport * 1.001;
          
          // Hacim/Alım Gücü Tükendiyse
          const momentumDiedLong = pos.type === "long" && flow.takerBuyRatio < 0.35 && flow.obi < -0.3;
          const momentumDiedShort = pos.type === "short" && flow.takerBuyRatio > 0.65 && flow.obi > 0.3;

          if (isHittingResistance || momentumDiedLong) {
            shouldExit = true;
            exitReason = `Zirve Tespiti: Direnç/Alıcı Tükenmesi (Kâr: +%${roePct.toFixed(2)})`;
          } else if (isHittingSupport || momentumDiedShort) {
            shouldExit = true;
            exitReason = `Dip Tespiti: Destek/Satıcı Tükenmesi (Kâr: +%${roePct.toFixed(2)})`;
          }
        }

        // 1. Dinamik İzleyen Stop (Trailing Stop) & Breakeven Koruması
        if (peakRoePct >= 15 && roePct <= 2) {
          shouldExit = true;
          exitReason = `Kâr Koruması (Breakeven): Zirveden dönüş tespit edildi (Zirve ROE: +%${peakRoePct.toFixed(2)})`;
        } 
        else if (peakRoePct >= 30 && drawdownFromPeakRoe >= 12) {
          shouldExit = true;
          exitReason = `İzleyen Stop: Zirveden kâr alımı (Zirve ROE: +%${peakRoePct.toFixed(2)}, Kapanış: +%${roePct.toFixed(2)})`;
        }
        else if (peakRoePct >= 60 && drawdownFromPeakRoe >= 20) {
          shouldExit = true;
          exitReason = `İzleyen Stop: Zirveden kâr alımı (Zirve ROE: +%${peakRoePct.toFixed(2)}, Kapanış: +%${roePct.toFixed(2)})`;
        }
        else if (peakRoePct >= 100 && drawdownFromPeakRoe >= 30) {
          shouldExit = true;
          exitReason = `İzleyen Stop (Büyük Kâr): Zirveden kâr alımı (Zirve ROE: +%${peakRoePct.toFixed(2)}, Kapanış: +%${roePct.toFixed(2)})`;
        }

        // 2. Manual Stop Loss (Server-side last resort)
        if (!shouldExit && priceMovePct <= -activeStopLossPct) {
          shouldExit = true;
          exitReason = `Zarar Kes (Stop Loss: %${activeStopLossPct.toFixed(2)})`;
        } 
        // 3. Adaptive Order Flow Exit Review (3 -> 6 -> 10)
        else if (!shouldExit) {
          // Check if position advantage is failing
          const isFailingLong = pos.type === "long" && flow.gap < 2; // Threshold for denge
          const isFailingShort = pos.type === "short" && flow.gap > -2;

          if (isFailingLong || isFailingShort) {
             pos.exitReviewMeasurements.push({ longAdv: flow.longAdvantage, shortAdv: flow.shortAdvantage, gap: flow.gap });
             const count = pos.exitReviewMeasurements.length;
             
             if (count >= 10) {
                 // 10 ölçüm sonunda hala avantaj yoksa çık
                 shouldExit = true;
                 exitReason = `10 Adım Adaptif Analiz: Avantaj Kaybedildi (Kâr: +%${roePct.toFixed(2)})`;
             } else if (count >= 6 && pos.exitReviewState === "6") {
                 // 6 ölçümde net bir toparlanma yoksa ve hala kararsızsa 10'a geçir
                 // Ortalama gap kontrolü
                 const avgGap = pos.exitReviewMeasurements.reduce((acc, m) => acc + m.gap, 0) / count;
                 if ((pos.type === "long" && avgGap < 0) || (pos.type === "short" && avgGap > 0)) {
                     // Negatif eğilim netleştiyse beklemeden çık
                     shouldExit = true;
                     exitReason = `6 Adım Adaptif Analiz: Trend Tersine Döndü (Kâr: +%${roePct.toFixed(2)})`;
                 } else {
                     pos.exitReviewState = "10";
                 }
             } else if (count >= 3 && pos.exitReviewState === "3") {
                 // 3 ölçüm birbirine yakın veya negatifse 6'ya geçir
                 const avgGap = pos.exitReviewMeasurements.reduce((acc, m) => acc + m.gap, 0) / count;
                 if ((pos.type === "long" && avgGap > 2) || (pos.type === "short" && avgGap < -2)) {
                     // Avantaj toparlandı, çıkış incelemesini iptal et
                     pos.exitReviewMeasurements = [];
                     pos.exitReviewState = "none";
                 } else {
                     pos.exitReviewState = "6";
                 }
             } else if (count >= 1 && pos.exitReviewState === "none") {
                 pos.exitReviewState = "3";
             }
          } else {
             // Avantaj güçlüyse incelemeyi sıfırla
             if (pos.exitReviewMeasurements.length > 0) {
                 addEngineLog("INFO", `${symbol} ${pos.type.toUpperCase()} Avantaj Yeniden Güçlendi. Çıkış incelemesi iptal edildi. (Gap: ${flow.gap.toFixed(1)})`);
             }
             pos.exitReviewMeasurements = [];
             pos.exitReviewState = "none";
          }
        }

        if (shouldExit) {
          await executeExit(symbol, exitReason, currentPrice);
        }
      } 
      // ================= ENTRY: QUANTITATIVE & ORDER FLOW SIGNAL ENGINE =================
      else {
        if (Object.keys(activePositions).length < maxOpenTrades) {
          // Giriş Şartları
          // LONG veya SHORT %80'in üzerinde baskın gelirse && Net Expected PnL > 0
          const isLongSignal = flow.entryLongAdvantage >= 66 && flow.entryGap >= 14 && flow.longAdvantage >= 68 && flow.gap >= 12 && flow.expectedNetPnlUsdLong >= flow.minimumNetPnlUSD && flow.expectedMovePctLong >= MIN_EXPECTED_MOVE_PCT && flow.movementScoreLong >= 45 && flow.profitScoreLong >= 100 && flow.netInflowUSD > 0 && flow.takerBuyRatio >= 0.55;
          const isShortSignal = flow.entryShortAdvantage >= 66 && flow.entryGap <= -14 && flow.shortAdvantage >= 68 && flow.gap <= -12 && flow.expectedNetPnlUsdShort >= flow.minimumNetPnlUSD && flow.expectedMovePctShort >= MIN_EXPECTED_MOVE_PCT && flow.movementScoreShort >= 45 && flow.profitScoreShort >= 100 && flow.netInflowUSD < 0 && flow.takerBuyRatio <= 0.45;

          if (isLongSignal || isShortSignal) {
            const type = isLongSignal ? "long" : "short";
            const score = isLongSignal ? flow.gap : Math.abs(flow.gap); 
            
            entryCandidates.push({
              symbol,
              score,
              type,
              price: currentPrice,
              predictedProfitPct: type === "long" ? flow.expectedMovePctLong : -flow.expectedMovePctShort,
              predictedTimeSec: flow.predictedTimeSec,
              expectedNetPnlUSD: type === "long" ? flow.expectedNetPnlUsdLong : flow.expectedNetPnlUsdShort,
              expectedGrossPnlUSD: type === "long" ? flow.expectedGrossPnlUsdLong : flow.expectedGrossPnlUsdShort,
              targetMovePct: type === "long" ? flow.expectedMovePctLong : flow.expectedMovePctShort,
              targetPrice: type === "long" ? flow.modelTargetPriceLong : flow.modelTargetPriceShort,
              modelConfidence: type === "long" ? flow.modelConfidenceLong : flow.modelConfidenceShort,
              smartTargetPrice: type === "long" ? flow.modelTargetPriceLong : flow.modelTargetPriceShort,
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
    await executeEntry(topCandidate.symbol, topCandidate.type, topCandidate.price, topCandidate);
  }
}

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number, model?: any) {
  if (activePositions[symbol] || pendingEntries.has(symbol)) return;
  pendingEntries.add(symbol);
  try {
  const effectivePrice = currentPrice || latestMetricsPerCoin[symbol]?.currentPrice || 1;

  // Calculate position amount adhering strictly to margin and leverage
  let notionalUSD = activeStakeAmount * targetLeverage;
  // Ensure minimum Binance Futures notional (min $5.5 USDT to prevent MIN_NOTIONAL error)
  if (notionalUSD < 6) notionalUSD = 6;

  let rawAmount = notionalUSD / effectivePrice;
  const exSymbol = getMarketSymbol(symbol);
  let formattedAmount = rawAmount;

  if (exchange) {
    if (!exchange.markets || Object.keys(exchange.markets).length === 0) {
      try {
        await exchange.loadMarkets();
      } catch (e) {}
    }

    const market = exchange.markets ? (exchange.markets[exSymbol] || exchange.markets[symbol]) : null;

    if (market?.limits?.amount?.min && rawAmount < market.limits.amount.min) {
      rawAmount = market.limits.amount.min;
    }

    try {
      formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, rawAmount));
    } catch (e) {
      formattedAmount = effectivePrice > 100 
        ? Number(rawAmount.toFixed(3)) 
        : (effectivePrice > 1 ? Number(rawAmount.toFixed(1)) : Math.round(rawAmount));
    }
  }

  // Ensure valid numerical amount
  if (!formattedAmount || formattedAmount <= 0 || isNaN(formattedAmount)) {
    formattedAmount = rawAmount >= 1 ? Math.round(rawAmount) : Number(rawAmount.toFixed(3));
  }

  let entryPrice = effectivePrice;
  let stopOrderId: string | undefined = undefined;
  let isRealOrder = false;
  let entryFee = 0;

  // If real authenticated Binance API is active, send actual market order
  if (exchange && isExchangeAuthenticated) {
    try {
      try {
        await exchange.setLeverage(targetLeverage, exSymbol);
      } catch (e: any) {}

      try {
        await (exchange as any).setMarginMode('CROSSED', exSymbol);
      } catch (e: any) {}

      const side = type === "long" ? "buy" : "sell";
      const order = await exchange.createOrder(exSymbol, "market", side, formattedAmount);
      let filledOrder:any = order;
      try { filledOrder = await exchange.fetchOrder(order.id, exSymbol); } catch {}
      entryPrice = Number(filledOrder.average || filledOrder.price || effectivePrice);
      formattedAmount = Number(filledOrder.filled || formattedAmount);
      entryFee = Number(filledOrder.fee?.cost || 0);
      if (!(entryPrice > 0) || !(formattedAmount > 0)) throw new Error("Gerçekleşen fill bilgisi alınamadı; pozisyon güvenli şekilde oluşturulmadı.");
      isRealOrder = true;
      
      const stopPriceBase = type === "long" 
        ? entryPrice * (1 - activeStopLossPct / 100) 
        : entryPrice * (1 + activeStopLossPct / 100);
      let stopPrice = Number(stopPriceBase.toFixed(4));
      try {
        stopPrice = parseFloat(exchange.priceToPrecision(exSymbol, stopPriceBase));
      } catch (e) {}

      try {
        const stopSide = type === "long" ? "sell" : "buy";
        const stopOrder = await exchange.createOrder(exSymbol, "STOP_MARKET", stopSide, formattedAmount, undefined, { stopPrice, reduceOnly: true });
        stopOrderId = stopOrder.id;
      } catch (e: any) {
        addEngineLog("ERROR", `[BINANCE] ${symbol} STOP_MARKET oluşturulamadı: ${e.message}. Pozisyon güvenlik için kapatılıyor.`);
        try { await exchange.createOrder(exSymbol, "market", type === "long" ? "sell" : "buy", formattedAmount, undefined, { reduceOnly: true }); } catch {}
        throw new Error("STOP_MARKET oluşturulamadı; pozisyon korumasız bırakılmadı.");
      }

      addEngineLog("TRADE", `[CANLI BINANCE POZİSYONU AÇILDI] ${symbol} ${type.toUpperCase()} x${targetLeverage} | Miktar: ${formattedAmount} ($${Math.round(notionalUSD)} Büyüklük) | Giriş: $${entryPrice}`);
    } catch (e: any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} Emir Hatası: ${e.message}`);
    }
  } else {
    throw new Error("Binance Futures kimlik doğrulaması yok; gerçek işlem için pozisyon açılamaz.");
  }

  // Snapshot the model target at the actual fill price. The target is an entry-time estimate,
  // not a guarantee and is intentionally kept fixed so the UI can measure model accuracy.
  const modelMovePct = Math.max(0, Number(model?.targetMovePct || 0));
  // Recalculate the target and PnL from the ACTUAL Binance fill. This prevents the UI
  // from displaying a target based on the pre-entry ticker price or pre-entry quantity.
  const modelTargetPrice = type === "long"
    ? entryPrice * (1 + modelMovePct / 100)
    : entryPrice * (1 - modelMovePct / 100);
  const actualNotionalUSD = entryPrice * formattedAmount;
  const modelGrossFrictionPct = ESTIMATED_FEE_PCT + ESTIMATED_SLIPPAGE_PCT;
  const modelExpectedGrossPnlUSD = actualNotionalUSD * (modelMovePct / 100);
  const modelExpectedNetPnlUSD = Math.max(0, modelExpectedGrossPnlUSD - actualNotionalUSD * (modelGrossFrictionPct / 100));
  const modelConfidence = Math.max(0, Math.min(100, Number(model?.modelConfidence || 0)));

  activePositions[symbol] = {
    trade_id: tradeCounter++,
    pair: symbol,
    type,
    entryPrice,
    amount: formattedAmount,
    peakPrice: entryPrice,
    openDate: Date.now(),
    leverage: targetLeverage,
    binanceStopOrderId: stopOrderId,
    unrealizedPnl: 0,
    percentage: 0,
    exitReviewMeasurements: [],
    exitReviewState: "none",
    profitProtectionActive: false,
    maxSeenNetPnl: 0,
    entryFee: typeof entryFee !== "undefined" ? entryFee : 0,
    modelTargetPrice,
    modelTargetMovePct: modelMovePct,
    modelExpectedNetPnlUSD,
    modelExpectedGrossPnlUSD,
    modelTargetHit: false,
    modelMaxFavorablePnlUSD: 0,
    modelConfidence
  };
  (activePositions[symbol] as any).isRealBinance = isRealOrder;

  allTrades.unshift({ ...activePositions[symbol], is_open: true });
  } finally {
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number) {
  const pos = activePositions[symbol];
  if (!pos) return;
  const exSymbol = getMarketSymbol(symbol);
  let exitFillPrice = currentPrice;
  let exitFee = 0;
  if (exchange && isExchangeAuthenticated) {
    try {
      const side = pos.type === "long" ? "sell" : "buy";
      let exitAmount = pos.amount;
      try { exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, exitAmount)); } catch {}
      const order = await exchange.createOrder(exSymbol, "market", side, exitAmount, undefined, { reduceOnly: true });
      let filled:any=order;
      try { filled=await exchange.fetchOrder(order.id, exSymbol); } catch {}
      exitFillPrice=Number(filled.average || filled.price || currentPrice);
      exitFee=Number(filled.fee?.cost || 0);
      if (!(exitFillPrice>0)) throw new Error("Gerçek çıkış fill fiyatı alınamadı.");
      if (pos.binanceStopOrderId) { try { await exchange.cancelOrder(pos.binanceStopOrderId, exSymbol); } catch {} }
    } catch (e:any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} çıkış emri başarısız: ${e.message}`);
      return;
    }
  }
  const grossPnl = pos.type === "long" ? (exitFillPrice-pos.entryPrice)*pos.amount : (pos.entryPrice-exitFillPrice)*pos.amount;
  const entryFee = pos.entryFee || 0;
  const netPnl = grossPnl - entryFee - exitFee;
  const initialMargin=(pos.entryPrice*pos.amount)/(pos.leverage||1);
  const roePct=initialMargin>0?(netPnl/initialMargin)*100:0;
  const tradeIndex=allTrades.findIndex(t=>t.trade_id===pos.trade_id);
  if(tradeIndex!==-1){
    allTrades[tradeIndex].is_open=false; allTrades[tradeIndex].close_rate=exitFillPrice; allTrades[tradeIndex].close_date=Date.now(); allTrades[tradeIndex].close_reason=reason; allTrades[tradeIndex].profit_abs=Number(netPnl.toFixed(4)); allTrades[tradeIndex].profit_pct=Number(roePct.toFixed(2)); allTrades[tradeIndex].gross_profit_abs=Number(grossPnl.toFixed(4)); allTrades[tradeIndex].exit_fee=exitFee;
    allTrades[tradeIndex].model_target_hit=Boolean(pos.modelTargetHit);
    allTrades[tradeIndex].model_max_favorable_pnl_usd=Number((pos.modelMaxFavorablePnlUSD || 0).toFixed(4));
    allTrades[tradeIndex].model_target_realization_pct = pos.modelExpectedNetPnlUSD > 0 ? Number(Math.max(0, (pos.modelMaxFavorablePnlUSD || 0) / pos.modelExpectedNetPnlUSD * 100).toFixed(1)) : 0;
  }
  delete activePositions[symbol];
  addEngineLog("TRADE", `[POZİSYON KAPANDI] ${symbol} | ${reason} | Net: ${netPnl>=0?'+':''}$${netPnl.toFixed(2)} | Fill: $${exitFillPrice}`);
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Yüksek Para Girişi & HFT Motoru Başlatıldı.");
  addEngineLog("INFO", "Mod: CANLI İŞLEM (Gerçek Binance Futures)");
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

// Background continuous Futures decision loop. Order book updates remain 100ms via WebSocket;
// decisions are evaluated every 1s without overlapping executions.
dataLoop = setInterval(async () => {
  if (engineLoopBusy) return;
  engineLoopBusy = true;
  try { await updateMarketDataAndExecute(); } finally { engineLoopBusy = false; }
}, 1000);

// =============== API ROUTES ===============
app.use(express.json());

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    trading_mode: "live",
    strategy: "Futures_50Level_MoneyFlow_ProfitEngine",
    data_source: `Binance Futures ${exchangeTestnet ? "TESTNET" : "LIVE"}`,
    timeframe: "1m",
    open_trades: Object.keys(activePositions).length,
    max_open_trades: maxOpenTrades,
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
    exchange: { pair_whitelist: whitelistCoins, testnet: exchangeTestnet },
    dry_run: false,
    leverage: targetLeverage,
    stop_loss_pct: activeStopLossPct,
    
    stake_amount: activeStakeAmount,
    max_open_trades: maxOpenTrades
  });
});

app.post("/api/v1/config", async (req, res) => {
  const conf = req.body;
  let whitelistChanged = false;
  const requestedTestnet = conf?.exchange?.testnet !== undefined ? conf.exchange.testnet === true : exchangeTestnet;
  const environmentChanged = requestedTestnet !== exchangeTestnet;
  if (conf.exchange?.pair_whitelist && Array.isArray(conf.exchange.pair_whitelist)) {
    whitelistCoins = conf.exchange.pair_whitelist;
    whitelistChanged = true;
  }
  
  if (conf.leverage) targetLeverage = conf.leverage;
  if (conf.stop_loss_pct) activeStopLossPct = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
  
  if (conf.stake_amount) activeStakeAmount = conf.stake_amount;
  if (conf.max_open_trades) maxOpenTrades = conf.max_open_trades;
  
  if (environmentChanged && Object.keys(activePositions).length > 0) {
    return res.status(409).json({ error: "Ortam değiştirilemez: açık pozisyon bulunuyor. Önce pozisyonları kapat." });
  }
  if (environmentChanged) {
    exchangeTestnet = requestedTestnet;
  }
  fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  if (environmentChanged) {
    await initializeExchange();
  }
  addEngineLog("SYSTEM", `Konfigürasyon güncellendi (${exchangeTestnet ? "TESTNET" : "LIVE"}).`);
  
  if (whitelistChanged || environmentChanged) {
    await startBinanceServerWebSocket();
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
      target_pct: Number((t.modelTargetMovePct || 0).toFixed(3)),
      model_target_price: t.modelTargetPrice ? Number(t.modelTargetPrice.toFixed(8)) : undefined,
      model_expected_net_pnl_usd: Number((t.modelExpectedNetPnlUSD || 0).toFixed(4)),
      model_expected_gross_pnl_usd: Number((t.modelExpectedGrossPnlUSD || 0).toFixed(4)),
      model_confidence: Number((t.modelConfidence || 0).toFixed(1)),
      model_target_hit: Boolean(t.modelTargetHit || t.model_target_hit),
      model_max_favorable_pnl_usd: Number((t.modelMaxFavorablePnlUSD || t.model_max_favorable_pnl_usd || 0).toFixed(4)),
      model_target_realization_pct: Number((t.model_target_realization_pct || 0).toFixed(1)),
      stop_loss_pct: t.stopLossPct || activeStopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: Number((t.modelTargetMovePct || 0).toFixed(3))
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
  const reqSymbol = (req.query.symbol as string) || whitelistCoins[0] || "BTC/USDT";
  let ob = latestOrderBooks[reqSymbol];
  let m = latestMetricsPerCoin[reqSymbol];
  if (!ob || !ob.bids?.length || !m?.obi && m?.obi !== 0) {
    try { await resyncFuturesBook(reqSymbol); ob = latestOrderBooks[reqSymbol]; } catch (e:any) { return res.status(503).json({ error: `Futures Order Book hazır değil: ${e.message}` }); }
  }
  if (!ob?.bids?.length || ob.bids.length < 20) return res.status(503).json({ error: "Futures Order Book derinliği henüz yeterli değil." });
  if (!m) {
    const p=ob.bids[0]?.[0]||0; m=latestMetricsPerCoin[reqSymbol] || { currentPrice:p, ...analyzeOrderFlowAndInflow(ob, recentTradesMap[reqSymbol]||[], priceHistoryMap[reqSymbol]||[], volumeHistoryMap[reqSymbol]||[], p) };
  }
  const p=m?.currentPrice||ob.bids[0]?.[0]||0;
  res.json({ orderBook:ob, metrics:{ OBI:m?.obi||0, MicroPrice:m?.microPrice||p, MidPrice:m?.midPrice||p, deltaV:(m?.netInflowUSD||0)/1000, currentPrice:p, VWAP:m?.vwap||p, stdDev:m?.stdDev||0, SpreadPct:m?.spreadPct||0, deepScore:m?.deepScore||0, atr:m?.atr||p*0.008, takerBuyRatio:m?.takerBuyRatio??0.5, netInflowUSD:m?.netInflowUSD||0, weightedBuyUSD:m?.weightedBuyUSD||0, weightedSellUSD:m?.weightedSellUSD||0, inflowMomentumUSD:m?.inflowMomentumUSD||0, minimumNetPnlUSD:m?.minimumNetPnlUSD||0, expectedNetPnlUsdLong:m?.expectedNetPnlUsdLong||0, expectedNetPnlUsdShort:m?.expectedNetPnlUsdShort||0, expectedMovePctLong:m?.expectedMovePctLong||0, expectedMovePctShort:m?.expectedMovePctShort||0 }});
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
    const res = await fetch(`${futuresRestBase()}/fapi/v1/exchangeInfo`);
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
    const fapiRes = await fetch(`${futuresRestBase()}/fapi/v1/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`);
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
  initializeExchange()
    .then(() => startBinanceServerWebSocket())
    .catch((e:any) => addEngineLog("ERROR", `Başlangıç Futures bağlantı hatası: ${e.message}`));
});
