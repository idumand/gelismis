import express from "express";
import path from "path";
import fs from "fs";
import ccxt from "ccxt";
import { WebSocket as WsClient } from "ws";
import { RSI, MACD, BollingerBands, ATR, SMA, EMA } from "technicalindicators";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
let activeExchangeEnvironment: TradingEnvironment = "demo";
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
type TradingEnvironment = "demo" | "live";
type EntryMode = "manual" | "algorithm";
let tradingEnvironment: TradingEnvironment = "demo";
let entryMode: EntryMode = "algorithm";
let minProfitPct1x = 0.5; // minimum expected PRICE MOVE before fees, 1x basis
let feeRoundTripPct = 0.08;
let maxScanCoins = 12;
let algorithmUniverseCache: {symbols:string[],at:number} = {symbols:[],at:0};
let futuresTickerCache: any[] = [];
let futuresTickerCacheAt = 0;
const mtfTrendCache: Record<string,{at:number,bias:number,details:any}> = {};
let minSignalScore = 56;
let maxSpreadPct = 0.08;
let emergencyOppositeFlowScore = 58;

// Position management per coin
interface ActivePosition {
  trade_id: number;
  pair: string;
  type: "long" | "short";
  entryPrice: number;
  amount: number;
  peakPrice: number;
  openDate: number;
  lookbackMin: number; // timeframe in minutes
  riskProfile?: string;
  stopLossPct: number;
  deepScoreHistory: number[];
  leverage: number;
  baseStopPrice: number;
  binanceStopOrderId?: string;
  breakevenHit?: boolean;
  unrealizedPnl?: number;
  percentage?: number;
}

const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // default round-trip fee estimate in price-percent terms
// Risk Profiles removed in favor of manual Stop Loss %

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 150) engineLogs.length = 150;
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
    
    if (conf?.exchange?.pair_whitelist && conf.exchange.pair_whitelist.length > 0) {
      whitelistCoins = conf.exchange.pair_whitelist;
    }
    
    if (conf?.stop_loss_pct) activeStopLossPct = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
    
    if (conf?.stake_amount) activeStakeAmount = conf.stake_amount;
    if (conf?.max_open_trades) maxOpenTrades = conf.max_open_trades;

    // Initialize Binance Futures (USD-M)
    const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
    
    const exOpts: any = {
      enableRateLimit: true,
      options: {
        defaultType: "future",
        adjustForTimeDifference: true,
        recvWindow: 60000,
      },
    };

    if (apiKey && secret && apiKey.trim() !== "" && secret.trim() !== "") {
      exOpts.apiKey = apiKey.trim();
      exOpts.secret = secret.trim();
      isExchangeAuthenticated = true;
    } else {
      isExchangeAuthenticated = false;
    }

    exchange = new ExchangeClass(exOpts);
    activeExchangeEnvironment = tradingEnvironment;
    
    // Load Binance markets for exact precision and limit rules
    try {
      await exchange.loadMarkets();
    } catch (e: any) {
      console.warn("Binance loadMarkets fallback:", e.message);
    }

    // Verify authentication and sync active positions
    if (isExchangeAuthenticated) {
      addEngineLog("INFO", `Binance Futures API aktif | Ortam: ${tradingEnvironment.toUpperCase()} | Mod: ${entryMode.toUpperCase()}`);
      await syncBinancePositions();
      return { success: true, message: "Borsa ve pozisyonlar senkronize edildi." };
    } else {
      addEngineLog("INFO", `Binance Futures public market data devrede | Ortam: ${tradingEnvironment.toUpperCase()}`);
      return { success: true, message: "Genel piyasa canlı akışı hazır." };
    }
  } catch (error: any) {
    addEngineLog("WARN", `Borsa başlatma uyarısı: ${error.message || 'Canlı akış modunda devam ediliyor'}`);
    return { success: true, message: "Canlı akış devrede." };
  }
}

// Synchronize real live positions directly with Binance
async function syncBinancePositions() {
  if (!exchange || !isExchangeAuthenticated) return;
  try {
    if (typeof exchange.fetchPositions === 'function') {
      const positions = await exchange.fetchPositions();
      if (!Array.isArray(positions)) return;
      const activeSymbolsInExchange = new Set<string>();

      for (const p of positions) {
        const contracts = p.contracts || Math.abs(p.contractSize || 0) || Math.abs(p.amount || 0) || 0;
        if (contracts > 0) {
          // Clean symbol format (e.g., DOGE/USDT:USDT -> DOGE/USDT)
          let cleanSymbol = p.symbol ? p.symbol.split(':')[0] : '';
          if (!cleanSymbol.includes('/') && cleanSymbol.endsWith('USDT')) {
            const base = cleanSymbol.slice(0, -4);
            cleanSymbol = `${base}/USDT`;
          }
          activeSymbolsInExchange.add(cleanSymbol);

          const posType: "long" | "short" = (p.side === 'long' || (p.contracts && p.contracts > 0 && !p.side?.includes('short'))) ? 'long' : 'short';
          const entryPrice = p.entryPrice || p.markPrice || 0;
          const lev = p.leverage || targetLeverage;
          const unPnl = p.unrealizedPnl !== undefined ? p.unrealizedPnl : 0;
          const roePct = p.percentage !== undefined ? p.percentage : 0;

          if (!activePositions[cleanSymbol]) {
            activePositions[cleanSymbol] = {
              trade_id: tradeCounter++,
              pair: cleanSymbol,
              type: posType,
              entryPrice,
              amount: contracts,
              peakPrice: entryPrice,
              openDate: Date.now(),
              lookbackMin: activeLookbackMin,
              stopLossPct: activeStopLossPct,
              deepScoreHistory: [],
              leverage: lev,
              baseStopPrice: 0,
              unrealizedPnl: Number(unPnl.toFixed(2)),
              percentage: Number(roePct.toFixed(2))
            };
            (activePositions[cleanSymbol] as any).isRealBinance = true;
            allTrades.unshift({ ...activePositions[cleanSymbol], is_open: true });
            addEngineLog("INFO", `[SENKRON] Binance Pozisyonu Eşitlendi: ${cleanSymbol} ${posType.toUpperCase()} x${lev} | Büyüklük: ${contracts} | Giriş: $${entryPrice}`);
          } else {
            // Update live metrics from Binance
            activePositions[cleanSymbol].unrealizedPnl = Number(unPnl.toFixed(2));
            activePositions[cleanSymbol].percentage = Number(roePct.toFixed(2));
            activePositions[cleanSymbol].amount = contracts;
            if (entryPrice > 0) activePositions[cleanSymbol].entryPrice = entryPrice;
            (activePositions[cleanSymbol] as any).isRealBinance = true;
          }
        }
      }

      // Check if any position closed externally on Binance
      for (const sym of Object.keys(activePositions)) {
        const closedPos = activePositions[sym];
        if ((closedPos as any).isRealBinance && (Date.now() - closedPos.openDate > 15000) && !activeSymbolsInExchange.has(sym)) {
          const tradeIndex = allTrades.findIndex(t => t.trade_id === closedPos.trade_id && t.is_open);
          if (tradeIndex !== -1) {
            allTrades[tradeIndex].is_open = false;
            allTrades[tradeIndex].close_date = Date.now();
            allTrades[tradeIndex].close_reason = "Binance Üzerinden Kapatıldı";
            allTrades[tradeIndex].close_rate = latestMetricsPerCoin[sym]?.currentPrice || closedPos.entryPrice;
          }
          delete activePositions[sym];
          addEngineLog("INFO", `[SENKRON] ${sym} pozisyonunun Binance üzerinde kapandığı tespit edildi.`);
        }
      }
    }
  } catch (e: any) {
    // Ignore transient sync error
  }
}

// =============== HIGH INFLOW & DEEP ORDER FLOW ENGINE ===============
interface OrderFlowMetrics {
  obi: number;                // Order Book Imbalance (-1.0 to +1.0)
  microPrice: number;         // Micro-price accounting for bid/ask volume weights
  midPrice: number;           // (bestBid + bestAsk) / 2
  spreadPct: number;          // Spread percentage
  takerBuyVolUSD: number;     // Recent taker buy volume in USD
  takerSellVolUSD: number;    // Recent taker sell volume in USD
  netInflowUSD: number;       // Net Capital Inflow (Buy - Sell)
  takerBuyRatio: number;      // Taker buy dominance (0.0 to 1.0)
  volumeSpike: boolean;       // True if current volume is 1.5x+ above 20-period SMA
  volumeRatio: number;        // Current Volume / Volume SMA
  vwap: number;               // Volume Weighted Average Price
  stdDev: number;             // Short-term price volatility
  deepScore: number;          // Composite quantitative score (-100 to +100)
  // Kinetic Orderflow Gravity (KOG) Model Predictive Metrics
  predictedProfitPct: number;
  predictedTimeSec: number;
  smartTargetPrice: number;
  smartStopPrice: number;
  liquidityGravityScore: number;
  bookBuyRatio: number;
  flowImbalance: number;
  flowAcceleration: number;
  priceImpulse: number;
  absorptionScore: number;
  supportPrice: number;
  resistancePrice: number;
  supportLiquidityUSD: number;
  resistanceLiquidityUSD: number;
  longTargetPct: number;
  shortTargetPct: number;
  longPressurePct: number;
  shortPressurePct: number;
  expectedEdgePct: number;
  minProfitPct1x: number;
}

// In-memory candle and tick memory per coin for accurate real-time indicator calculations
const priceHistoryMap: Record<string, number[]> = {};
const volumeHistoryMap: Record<string, number[]> = {};
const recentTradesMap: Record<string, any[]> = {};
let lastScanLogTime = 0;


// ================= ORDER-FLOW QUANT BRAIN =================
// The model is deliberately probabilistic: it does not "know" the future.
// It estimates directional pressure, liquidity barriers, executable target and
// expected net edge after fees/slippage, then acts only when the edge is large enough.
function calculateMathematicalTarget(prices: number[], vwap: number, currentPrice: number, takerBuyRatio: number): number {
  if (!prices || prices.length < 8 || !currentPrice) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (returns.length < 5) return 0;
  const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance = returns.reduce((a,b)=>a+Math.pow(b-mean,2),0)/returns.length;
  const sigma = Math.sqrt(variance);
  const momentum = Math.abs(takerBuyRatio - 0.5) * 2;
  const vwapDistance = vwap > 0 ? Math.abs(currentPrice-vwap)/currentPrice : 0;
  // Volatility envelope + momentum; capped so the model never invents huge targets.
  return Math.max(0, Math.min(8, sigma * Math.sqrt(60) * 100 + momentum * 1.5 + vwapDistance * 100 * 0.35));
}

function analyzeOrderFlowAndInflow(
  ob: any,
  recentTrades: any[],
  prices: number[],
  volumes: number[],
  currentPrice: number
): OrderFlowMetrics {
  const levels = 20;
  let midPrice = currentPrice, microPrice = currentPrice, spreadPct = 0;
  let weightedBid = 0, weightedAsk = 0, bidNotional = 0, askNotional = 0;
  let supportPrice = currentPrice, resistancePrice = currentPrice;
  let supportLiquidityUSD = 0, resistanceLiquidityUSD = 0;
  let maxBidWall = 0, maxAskWall = 0;

  const bids = Array.isArray(ob?.bids) ? ob.bids.slice(0, levels) : [];
  const asks = Array.isArray(ob?.asks) ? ob.asks.slice(0, levels) : [];
  if (bids.length && asks.length) {
    const bestBid = Number(bids[0][0]), bestAsk = Number(asks[0][0]);
    midPrice = (bestBid + bestAsk) / 2;
    spreadPct = midPrice > 0 ? ((bestAsk - bestBid) / midPrice) * 100 : 0;

    for (let i=0;i<Math.min(levels,bids.length);i++) {
      const p=Number(bids[i][0]), q=Number(bids[i][1]);
      const w=Math.exp(-i/7);
      const usd=p*q;
      weightedBid += usd*w;
      bidNotional += usd;
      if (usd>maxBidWall) maxBidWall=usd;
    }
    for (let i=0;i<Math.min(levels,asks.length);i++) {
      const p=Number(asks[i][0]), q=Number(asks[i][1]);
      const w=Math.exp(-i/7);
      const usd=p*q;
      weightedAsk += usd*w;
      askNotional += usd;
      if (usd>maxAskWall) maxAskWall=usd;
    }
    const weightedTotal=weightedBid+weightedAsk;
    const obi=weightedTotal>0 ? (weightedBid-weightedAsk)/weightedTotal : 0;
    microPrice = weightedTotal>0 ? ((bestAsk*weightedBid)+(bestBid*weightedAsk))/weightedTotal : midPrice;

    // Liquidity barriers: use cumulative notional, not a single spoof-looking wall.
    let cum=0;
    for (const [p,q] of asks) {
      cum += Number(p)*Number(q);
      if (cum >= Math.max(1000, resistanceLiquidityUSD || weightedAsk*0.18)) {
        resistancePrice=Number(p); resistanceLiquidityUSD=cum; break;
      }
    }
    if (resistancePrice===currentPrice && asks.length) {
      resistancePrice=Number(asks[Math.min(9,asks.length-1)][0]);
      resistanceLiquidityUSD=asks.slice(0,10).reduce((a:any,x:any)=>a+Number(x[0])*Number(x[1]),0);
    }
    cum=0;
    for (const [p,q] of bids) {
      cum += Number(p)*Number(q);
      if (cum >= Math.max(1000, weightedBid*0.18)) {
        supportPrice=Number(p); supportLiquidityUSD=cum; break;
      }
    }
    if (supportPrice===currentPrice && bids.length) {
      supportPrice=Number(bids[Math.min(9,bids.length-1)][0]);
      supportLiquidityUSD=bids.slice(0,10).reduce((a:any,x:any)=>a+Number(x[0])*Number(x[1]),0);
    }

    const buyRatioBook = weightedTotal>0 ? weightedBid/weightedTotal : 0.5;
    // Keep raw OBI for compatibility; the new score is calculated below.
    (ob as any).__obi = obi;
    (ob as any).__bookBuyRatio = buyRatioBook;
  }

  // Taker flow windows.
  const now=Date.now();
  const trades=(recentTrades||[]).filter(t=>Number(t.timestamp||0)>now-180000);
  let buy60=0,sell60=0,buy15=0,sell15=0,buy180=0,sell180=0;
  for(const t of trades){
    const usd=Math.max(0,Number(t.price||0)*Number(t.amount||0));
    if(Number(t.timestamp||0)>now-60000){ if(t.side==="buy") buy60+=usd; else sell60+=usd; }
    if(Number(t.timestamp||0)>now-15000){ if(t.side==="buy") buy15+=usd; else sell15+=usd; }
    if(t.side==="buy") buy180+=usd; else sell180+=usd;
  }
  const total60=buy60+sell60, total15=buy15+sell15, total180=buy180+sell180;
  const takerBuyRatio=total60>0?buy60/total60:0.5;
  const netInflowUSD=buy60-sell60;
  const flowImbalance=total60>0?(buy60-sell60)/total60:0;
  const shortFlow=total15>0?(buy15-sell15)/total15:0;
  const longFlow=total180>0?(buy180-sell180)/total180:0;
  const flowAcceleration=shortFlow-longFlow;

  // Price response tells us whether aggressive money is actually moving price.
  let priceImpulse=0;
  if(prices?.length>=8){
    const a=prices.slice(-4), b=prices.slice(-8,-4);
    const pa=a.reduce((x,y)=>x+y,0)/a.length;
    const pb=b.reduce((x,y)=>x+y,0)/b.length;
    priceImpulse=pb>0?Math.max(-1,Math.min(1,(pa-pb)/pb*100/0.6)):0;
  }

  let volumeRatio=1, volumeSpike=false;
  if(volumes?.length>=5){
    const avg=volumes.slice(0,-1).reduce((a,b)=>a+b,0)/Math.max(1,volumes.length-1);
    const last=volumes[volumes.length-1]||avg;
    volumeRatio=avg>0?last/avg:1;
    volumeSpike=volumeRatio>=1.25;
  }

  const mean=prices?.length?prices.reduce((a,b)=>a+b,0)/prices.length:currentPrice;
  const variance=prices?.length?prices.reduce((a,b)=>a+Math.pow(b-mean,2),0)/prices.length:0;
  const stdDev=Math.sqrt(variance);
  const vwap=mean||currentPrice;

  const obi=(ob as any).__obi||0;
  const bookBuyRatio=(ob as any).__bookBuyRatio||0.5;
  const bookPressure=obi;
  const directionRaw=(bookPressure*0.38)+(flowImbalance*0.37)+(flowAcceleration*0.12)+(priceImpulse*0.13);
  const direction=Math.max(-1,Math.min(1,directionRaw));

  // Absorption: strong aggressive flow with weak price response can mean the opposite side is absorbing.
  const aggressiveUSD=total60;
  const priceResponseAbs=Math.abs(priceImpulse);
  const flowMagnitude=Math.abs(flowImbalance);
  const absorptionScore=flowMagnitude>0.12
    ? Math.max(0,Math.min(100,(1-Math.min(1,priceResponseAbs/(flowMagnitude*1.5)))*100))
    : 0;

  const supportDist=Math.max(0,(currentPrice-supportPrice)/currentPrice*100);
  const resistanceDist=Math.max(0,(resistancePrice-currentPrice)/currentPrice*100);
  const baseVolTarget=calculateMathematicalTarget(prices,vwap,currentPrice,takerBuyRatio);

  // Expected executable target is the nearer liquidity barrier, adjusted by directional pressure.
  let longTargetPct=Math.max(0,Math.min(8,resistanceDist + Math.max(0,direction)*baseVolTarget*0.35));
  let shortTargetPct=Math.max(0,Math.min(8,supportDist + Math.max(0,-direction)*baseVolTarget*0.35));

  const liquidityGravityScore=Math.round(Math.min(100,
    Math.abs(obi)*45 + Math.abs(flowImbalance)*35 + Math.abs(flowAcceleration)*20
  ));

  const deepScore=Math.round(Math.max(-100,Math.min(100,direction*100)));
  const predictedProfitPct=direction>=0?longTargetPct:shortTargetPct;
  const smartTargetPrice=direction>=0
    ? currentPrice*(1+longTargetPct/100)
    : currentPrice*(1-shortTargetPct/100);
  const smartStopPrice=direction>=0 ? supportPrice : resistancePrice;

  const buyVelocity=buy60/60, sellVelocity=sell60/60;
  const targetLiquidity=direction>=0?Math.max(1,resistanceLiquidityUSD):Math.max(1,supportLiquidityUSD);
  const velocity=Math.max(1,direction>=0?buyVelocity:sellVelocity);
  const predictedTimeSec=Math.max(1,Math.min(3600,targetLiquidity/velocity));

  return {
    obi, microPrice, midPrice, spreadPct,
    takerBuyVolUSD:buy60, takerSellVolUSD:sell60, netInflowUSD, takerBuyRatio,
    volumeSpike, volumeRatio, vwap, stdDev, deepScore,
    predictedProfitPct, predictedTimeSec, smartTargetPrice, smartStopPrice,
    liquidityGravityScore,
    bookBuyRatio, flowImbalance, flowAcceleration, priceImpulse,
    absorptionScore, supportPrice, resistancePrice,
    supportLiquidityUSD, resistanceLiquidityUSD,
    longTargetPct, shortTargetPct,
    longPressurePct:Math.round(Math.max(0,Math.min(100,(direction+1)*50))),
    shortPressurePct:Math.round(Math.max(0,Math.min(100,(1-direction)*50))),
    expectedEdgePct:predictedProfitPct-feeRoundTripPct,
    minProfitPct1x
  } as any;
}

// Server-side persistent Binance WebSocket streams for live ticker & depth updates
let binanceWsClient: WsClient | null = null;
let binanceWsReconnectTimer: any = null;

function getFuturesPublicWsBase(): string {
  // Binance Futures public market stream. Demo trading uses the Futures market stream;
  // execution is separately bound to Demo Trading through CCXT.
  return "wss://fstream.binance.com";
}

function startBinanceServerWebSocket() {
  if (binanceWsClient) { try { binanceWsClient.terminate(); } catch(e){} }
  try {
    const streamNames = whitelistCoins
      .map(c => `${c.replace('/','').toLowerCase()}@ticker/${c.replace('/','').toLowerCase()}@depth20@100ms/${c.replace('/','').toLowerCase()}@aggTrade`)
      .join('/');
    const url = `${getFuturesPublicWsBase()}/stream?streams=${streamNames}`;
    binanceWsClient = new WsClient(url);
    binanceWsClient.on('open',()=>addEngineLog("INFO",`Binance Futures MARKET WS bağlandı | ${tradingEnvironment.toUpperCase()} execution | ${whitelistCoins.length} parite`));
    binanceWsClient.on('message',(raw:any)=>handleWsMessage(raw));
    binanceWsClient.on('error',()=>{});
    binanceWsClient.on('close',()=>{
      clearTimeout(binanceWsReconnectTimer);
      binanceWsReconnectTimer=setTimeout(startBinanceServerWebSocket,5000);
    });
  } catch(e) {
    clearTimeout(binanceWsReconnectTimer);
    binanceWsReconnectTimer=setTimeout(startBinanceServerWebSocket,5000);
  }
}

function handleWsMessage(raw:any) {
  try {
    const payload=JSON.parse(raw.toString()), stream=payload.stream||'', data=payload.data;
    if(!data) return;
    const symUpper=(data.s||'').toUpperCase();
    const formattedSym=whitelistCoins.find(w=>w.replace('/','').toUpperCase()===symUpper) ||
      (symUpper.endsWith('USDT')?`${symUpper.slice(0,-4)}/USDT`:symUpper);

    if(stream.includes('@ticker')){
      const currentPrice=Number(data.c||0), changePct=Number(data.P||0), volumeUsdt=Number(data.q||0);
      if(currentPrice>0){
        priceHistoryMap[formattedSym] ||= [];
        priceHistoryMap[formattedSym].push(currentPrice);
        if(priceHistoryMap[formattedSym].length>120) priceHistoryMap[formattedSym].shift();
        volumeHistoryMap[formattedSym] ||= [];
        volumeHistoryMap[formattedSym].push(volumeUsdt);
        if(volumeHistoryMap[formattedSym].length>60) volumeHistoryMap[formattedSym].shift();
        latestMetricsPerCoin[formattedSym] ||= {};
        Object.assign(latestMetricsPerCoin[formattedSym],{currentPrice,change_24h_pct:changePct,volume_24h_usdt:volumeUsdt});
      }
    } else if(stream.includes('@aggTrade')){
      const price=Number(data.p), qty=Number(data.q), side=data.m?'sell':'buy';
      recentTradesMap[formattedSym] ||= [];
      recentTradesMap[formattedSym].push({price,amount:qty,side,timestamp:Number(data.T||Date.now())});
      const cutoff=Date.now()-180000;
      recentTradesMap[formattedSym]=recentTradesMap[formattedSym].filter(t=>t.timestamp>cutoff);
    } else if(stream.includes('@depth')){
      const bids=(data.b||[]).map((x:any)=>[Number(x[0]),Number(x[1])]).filter((x:any)=>x[0]>0&&x[1]>=0);
      const asks=(data.a||[]).map((x:any)=>[Number(x[0]),Number(x[1])]).filter((x:any)=>x[0]>0&&x[1]>=0);
      if(bids.length&&asks.length) latestOrderBooks[formattedSym]={bids,asks,timestamp:Date.now(),source:"BINANCE_FUTURES_MARKET"};
    }
  } catch(e){}
}

// Start WebSocket stream immediately
startBinanceServerWebSocket();

// =============== CORE REAL-TIME LOOP ===============
async function getFuturesTickerSnapshot(limit=100):Promise<any[]> {
  if(futuresTickerCache.length && Date.now()-futuresTickerCacheAt<10000) return futuresTickerCache.slice(0,limit);
  try{
    const base=tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com";
    const r=await fetch(`${base}/fapi/v1/ticker/24hr`);
    if(r.ok){
      const data=await r.json();
      futuresTickerCache=(Array.isArray(data)?data:[])
        .filter((x:any)=>String(x.symbol||"").endsWith("USDT")&&Number(x.quoteVolume||0)>0)
        .sort((a:any,b:any)=>Number(b.quoteVolume||0)-Number(a.quoteVolume||0));
      futuresTickerCacheAt=Date.now();
    }
  }catch{}
  return futuresTickerCache.slice(0,limit);
}

async function getAlgorithmUniverse(): Promise<string[]> {
  if (algorithmUniverseCache.symbols.length && Date.now()-algorithmUniverseCache.at < 15000) return algorithmUniverseCache.symbols;
  const data=await getFuturesTickerSnapshot(Math.max(maxScanCoins,30));
  const arr=data.slice(0,maxScanCoins).map((x:any)=>`${String(x.symbol).slice(0,-4)}/USDT`);
  const out=arr.length?arr:whitelistCoins.slice(0,maxScanCoins);
  algorithmUniverseCache={symbols:out,at:Date.now()};
  return out;
}

async function fetchFuturesSnapshot(symbol:string):Promise<{ticker:any,ob:any,trades:any[]}|null>{
  const clean=symbol.replace('/','').toUpperCase();
  const base=tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com";
  try{
    const [d,t]=await Promise.all([
      fetch(`${base}/fapi/v1/depth?symbol=${clean}&limit=20`),
      fetch(`${base}/fapi/v1/aggTrades?symbol=${clean}&limit=100`)
    ]);
    if(!d.ok) return null;
    const depth=await d.json();
    const trades=d.ok&&t.ok?await t.json():[];
    const ob={bids:(depth.bids||[]).map((x:any)=>[Number(x[0]),Number(x[1])]),asks:(depth.asks||[]).map((x:any)=>[Number(x[0]),Number(x[1])]),timestamp:Date.now(),source:"BINANCE_FUTURES_REST"};
    const parsedTrades=(Array.isArray(trades)?trades:[]).map((x:any)=>({price:Number(x.p),amount:Number(x.q),side:x.m?"sell":"buy",timestamp:Number(x.T||Date.now())}));
    latestOrderBooks[symbol]=ob;
    recentTradesMap[symbol]=parsedTrades;
    return {ticker:null,ob,trades:parsedTrades};
  }catch(e){ return null; }
}

function evaluateEntry(symbol:string, flow:any, currentPrice:number){
  const direction=flow.deepScore;
  const side: "long"|"short" = direction>=0 ? "long" : "short";
  const pressure=side==="long"?flow.longPressurePct:flow.shortPressurePct;
  const target1x=side==="long"?flow.longTargetPct:flow.shortTargetPct;
  const barrier=side==="long"?flow.resistancePrice:flow.supportPrice;
  const oppositePressure=side==="long"?flow.shortPressurePct:flow.longPressurePct;
  const edge=target1x-feeRoundTripPct;
  const required=minProfitPct1x;
  const spreadPenalty=Math.max(0,flow.spreadPct-maxSpreadPct)*2;
  const score=Math.max(0,Math.min(100,
    pressure*0.45 +
    Math.min(100,Math.abs(flow.flowImbalance)*100)*0.22 +
    Math.min(100,Math.abs(flow.obi)*100)*0.18 +
    Math.min(100,Math.abs(flow.flowAcceleration)*100)*0.08 +
    Math.min(100,flow.liquidityGravityScore)*0.07 -
    spreadPenalty
  ));
  const noAbsorption = (flow.absorptionScore < 82 || Math.abs(flow.priceImpulse) > 0.12);
  const notImmediatelyConsumed = oppositePressure < 47 || Math.abs(flow.flowAcceleration) > 0.08;
  const enoughTarget = target1x >= required + feeRoundTripPct;
  const acceptableSpread = flow.spreadPct <= maxSpreadPct;
  const signal = score>=minSignalScore && enoughTarget && acceptableSpread && noAbsorption && notImmediatelyConsumed && pressure>=54;
  return {
    signal, side, score, target1x, edge, pressure, oppositePressure,
    barrier,
    stopPrice: side==="long" ? flow.supportPrice : flow.resistancePrice,
    expectedTimeSec:flow.predictedTimeSec, required, reason:
      !enoughTarget?"target_below_minimum":
      !acceptableSpread?"spread_too_wide":
      !noAbsorption?"aggressive_flow_absorbed":
      !notImmediatelyConsumed?"opposite_flow_too_strong":
      score<minSignalScore?"score_below_threshold":"ready"
  };
}

async function getMTFBias(symbol:string):Promise<{bias:number,details:any}> {
  const cached=mtfTrendCache[symbol];
  if(cached && Date.now()-cached.at<30000) return cached;
  const base=tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com";
  const frames=["15m","1h","4h"];
  const vals:number[]=[];
  const details:any={};
  for(const tf of frames){
    try{
      const r=await fetch(`${base}/fapi/v1/klines?symbol=${symbol.replace('/','')}&interval=${tf}&limit=40`);
      if(!r.ok) continue;
      const rows=await r.json();
      const closes=(Array.isArray(rows)?rows:[]).map((x:any)=>Number(x[4])).filter((x:number)=>x>0);
      if(closes.length<22) continue;
      const e9=EMA.calculate({period:9,values:closes}).pop()||closes.at(-1);
      const e21=EMA.calculate({period:21,values:closes}).pop()||closes.at(-1);
      const b=e21>0?Math.max(-1,Math.min(1,(e9-e21)/e21*100/0.35)):0;
      vals.push(b); details[tf]=Number(b.toFixed(3));
    }catch{}
  }
  const bias=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  const out={bias,details}; mtfTrendCache[symbol]={at:Date.now(),...out}; return out;
}

async function updateMarketDataAndExecute() {
  if (exchange && isExchangeAuthenticated) { try { await syncBinancePositions(); } catch(e){} }

  const universe = entryMode==="algorithm" ? await getAlgorithmUniverse() : whitelistCoins.slice();
  const scanSymbols = Array.from(new Set(universe));
  if(botState==="running" && Date.now()-lastScanLogTime>12000){
    lastScanLogTime=Date.now();
    addEngineLog("INFO",`[QUANT BRAIN] ${entryMode.toUpperCase()} | ${scanSymbols.length} coin taranıyor | Açık ${Object.keys(activePositions).length}/${maxOpenTrades} | Min kâr 1x: %${minProfitPct1x}`);
  }

  const entryCandidates:any[]=[];
  await Promise.allSettled(scanSymbols.map(async symbol=>{
    try{
      let currentPrice=latestMetricsPerCoin[symbol]?.currentPrice||0;
      let ob=latestOrderBooks[symbol];
      let activeTrades=recentTradesMap[symbol]||[];

      // In algorithm mode, keep the expensive depth/trade requests bounded to the active universe.
      if(!ob || !currentPrice || Date.now()-Number(ob.timestamp||0)>8000){
        const snap=await fetchFuturesSnapshot(symbol);
        if(snap){ob=snap.ob; activeTrades=snap.trades; }
      }
      currentPrice=currentPrice || ob?.bids?.[0]?.[0] || 0;
      if(!currentPrice || !ob?.bids?.length || !ob?.asks?.length) return;

      priceHistoryMap[symbol] ||= [];
      if(!priceHistoryMap[symbol].length || priceHistoryMap[symbol][priceHistoryMap[symbol].length-1]!==currentPrice) priceHistoryMap[symbol].push(currentPrice);
      if(priceHistoryMap[symbol].length>120) priceHistoryMap[symbol].shift();

      volumeHistoryMap[symbol] ||= [];
      const tickerVol=Number(latestMetricsPerCoin[symbol]?.volume_24h_usdt||0);
      if(tickerVol>0) volumeHistoryMap[symbol].push(tickerVol);
      if(volumeHistoryMap[symbol].length>60) volumeHistoryMap[symbol].shift();

      const prices=priceHistoryMap[symbol];
      const rsiData=prices.length>=15?RSI.calculate({period:14,values:prices}):[];
      const ema9Data=prices.length>=9?EMA.calculate({period:9,values:prices}):[];
      const ema21Data=prices.length>=21?EMA.calculate({period:21,values:prices}):[];
      const rsi=rsiData.length?rsiData[rsiData.length-1]:50;
      const ema9=ema9Data.length?ema9Data[ema9Data.length-1]:currentPrice;
      const ema21=ema21Data.length?ema21Data[ema21Data.length-1]:currentPrice;
      const atr=Math.max(currentPrice*0.002,Math.abs(currentPrice-ema21));
      const flow=analyzeOrderFlowAndInflow(ob,activeTrades,prices,volumeHistoryMap[symbol]||[],currentPrice);
      const mtf=await getMTFBias(symbol);
      const rawDecision=evaluateEntry(symbol,flow,currentPrice);
      const mtfAligned=(rawDecision.side==="long" ? mtf.bias : -mtf.bias);
      const decision={
        ...rawDecision,
        score:Math.max(0,Math.min(100,rawDecision.score + mtfAligned*8)),
        mtfBias:mtf.bias,
        mtfAligned,
        signal:rawDecision.signal && mtfAligned>-0.72
      };

      const metric={
        currentPrice, rsi, ema9, ema21, atr,
        change_24h_pct:latestMetricsPerCoin[symbol]?.change_24h_pct||0,
        volume_24h_usdt:latestMetricsPerCoin[symbol]?.volume_24h_usdt||0,
        ...flow,
        ...decision,
        mtfBias:mtf.bias,
        mtfDetails:mtf.details,
        environment:tradingEnvironment,
        dataSource:"BINANCE_FUTURES",
        updatedAt:Date.now()
      };
      latestMetricsPerCoin[symbol]=metric;

      const pos=activePositions[symbol];
      if(botState!=="running") return;

      if(pos){
        if(pos.type==="long") pos.peakPrice=Math.max(pos.peakPrice,currentPrice);
        else pos.peakPrice=Math.min(pos.peakPrice,currentPrice);
        const pnlUSD=pos.type==="long"?(currentPrice-pos.entryPrice)*pos.amount:(pos.entryPrice-currentPrice)*pos.amount;
        const priceMovePct=pos.type==="long"?((currentPrice-pos.entryPrice)/pos.entryPrice)*100:((pos.entryPrice-currentPrice)/pos.entryPrice)*100;
        const initialMargin=(pos.entryPrice*pos.amount)/pos.leverage;
        const roePct=initialMargin>0?pnlUSD/initialMargin*100:priceMovePct*pos.leverage;
        const peakMove=pos.type==="long"?((pos.peakPrice-pos.entryPrice)/pos.entryPrice)*100:((pos.entryPrice-pos.peakPrice)/pos.entryPrice)*100;
        const drawdown=Math.max(0,peakMove-priceMovePct);
        const target1x=Number((pos as any).target1xPct||minProfitPct1x);
        const targetPrice=Number((pos as any).targetPrice||pos.entryPrice);
        const targetHit=pos.type==="long"?currentPrice>=targetPrice:currentPrice<=targetPrice;
        const opposite=pos.type==="long"?flow.shortPressurePct:flow.longPressurePct;
        const aligned=pos.type==="long"?flow.deepScore: -flow.deepScore;
        let reason="";
        // Hard loss protection remains, but the normal exit is adaptive.
        if(priceMovePct <= -activeStopLossPct) reason=`Stop Loss %${activeStopLossPct.toFixed(2)}`;
        else if(targetHit && priceMovePct >= target1x) reason=`Hedef gerçekleşti | 1x +%${target1x.toFixed(2)} | ROE +%${roePct.toFixed(2)}`;
        else if(priceMovePct > 0 && opposite >= emergencyOppositeFlowScore && aligned < 12) reason=`Karşı baskı erken uyarısı | karşı taraf %${opposite}`;
        else if(priceMovePct > 0.15 && drawdown >= Math.max(0.12,peakMove*0.35)) reason=`Kâr erimesi | tepe dönüş %${drawdown.toFixed(2)}`;
        else if(priceMovePct > 0.25 && aligned < -5) reason=`Akış yön değiştirdi | score ${aligned.toFixed(0)}`;
        if(reason) await executeExit(symbol,reason,currentPrice);
        return;
      }

      if(entryMode==="manual") return;
      if(Object.keys(activePositions).length>=maxOpenTrades) return;
      if(decision.signal){
        entryCandidates.push({
          symbol,type:decision.side,score:decision.score,price:currentPrice,
          predictedProfitPct:decision.target1x,predictedTimeSec:decision.expectedTimeSec,
          smartTargetPrice:decision.barrier,
          smartStopPrice:decision.stopPrice,
          pressure:decision.pressure,oppositePressure:decision.oppositePressure
        });
      }
    }catch(e:any){ addEngineLog("ERROR",`[QUANT] ${symbol}: ${e.message}`); }
  }));

  entryCandidates.sort((a,b)=>b.score-a.score);
  for(const c of entryCandidates){
    if(Object.keys(activePositions).length>=maxOpenTrades) break;
    if(activePositions[c.symbol]) continue;
    const m=latestMetricsPerCoin[c.symbol];
    const target1x=Number(c.predictedProfitPct);
    // target must cover configured minimum + estimated round-trip fees + a small execution cushion.
    const executableMin=minProfitPct1x+feeRoundTripPct+0.03;
    if(target1x<executableMin) continue;
    addEngineLog("TRADE",`[QUANT BRAIN] ${c.symbol} ${c.type.toUpperCase()} | Skor ${c.score.toFixed(1)} | Long %${m.longPressurePct} / Short %${m.shortPressurePct} | Hedef 1x +%${target1x.toFixed(2)} | x${targetLeverage} ROE hedefi +%${(target1x*targetLeverage).toFixed(2)}`);
    try {
      await executeEntry(c.symbol,c.type,c.price,{
        target1xPct:target1x,
        targetPrice:c.smartTargetPrice,
        stopPrice:c.smartStopPrice,
        signalScore:c.score,
        pressure:c.pressure,
        oppositePressure:c.oppositePressure
      } as any);
    } catch (e:any) {
      addEngineLog("ERROR", `[ENTRY] ${c.symbol} ${c.type} gönderilemedi: ${e.message}`);
    }
  }
}

// Helper to resolve CCXT market symbols (e.g. DOGE/USDT -> DOGE/USDT:USDT on Binance Futures)
function getMarketSymbol(sym: string): string {
  if (!exchange) return sym;
  try {
    if (exchange.markets && exchange.markets[sym]) return sym;
    const withColon = `${sym}:USDT`;
    if (exchange.markets && exchange.markets[withColon]) return withColon;
    const clean = sym.replace('/', '');
    if (exchange.markets && exchange.markets[clean]) return clean;
    if (typeof (exchange as any).market === 'function') {
      const m = (exchange as any).market(sym);
      if (m && m.symbol) return m.symbol;
    }
  } catch (e) {}
  return sym.includes(':') ? sym : `${sym}:USDT`;
}

async function executeEntry(symbol:string,type:"long"|"short",currentPrice:number,signalMeta:any={}){
  if(activePositions[symbol]||pendingEntries.has(symbol)) return;
  if(!exchange||!isExchangeAuthenticated||activeExchangeEnvironment!==tradingEnvironment){
    addEngineLog("WARN",`[SECURITY] ORDER BLOCKED | env=${tradingEnvironment} active=${activeExchangeEnvironment}`);
    throw new Error("Binance Futures API/environment doğrulanamadı.");
  }
  pendingEntries.add(symbol);
  try{
    const effectivePrice=currentPrice||latestMetricsPerCoin[symbol]?.currentPrice||0;
    if(!effectivePrice) throw new Error("Geçerli Futures fiyatı yok.");

    const notionalUSD=Math.max(6,Number(activeStakeAmount)*targetLeverage);
    let rawAmount=notionalUSD/effectivePrice;
    const exSymbol=getMarketSymbol(symbol);
    try{
      if(!exchange.markets||!Object.keys(exchange.markets).length) await exchange.loadMarkets();
      const market=(exchange.markets as any)?.[exSymbol]||(exchange.markets as any)?.[symbol];
      if(market?.limits?.amount?.min && rawAmount<market.limits.amount.min) rawAmount=market.limits.amount.min;
    }catch{}
    let amount:number;
    try{ amount=parseFloat(exchange.amountToPrecision(exSymbol,rawAmount)); }
    catch{ amount=effectivePrice>100?Number(rawAmount.toFixed(3)):effectivePrice>1?Number(rawAmount.toFixed(1)):Math.round(rawAmount); }
    if(!amount||!isFinite(amount)||amount<=0) throw new Error("Geçersiz emir miktarı.");

    try{ await exchange.setLeverage(targetLeverage,exSymbol); }catch{}
    try{ await (exchange as any).setMarginMode("CROSSED",exSymbol); }catch{}

    const side=type==="long"?"buy":"sell";
    const order=await exchange.createOrder(exSymbol,"market",side,amount);
    const entryPrice=Number(order.price||order.average||effectivePrice);
    if(!entryPrice) throw new Error("Binance emir fiyatı alınamadı.");

    // Smart stop: order-book support/resistance is used only if it is inside the configured risk envelope.
    const configuredStop=Number(signalMeta.stopPrice||0);
    const maxDistance=activeStopLossPct/100;
    const hardStop=type==="long"?entryPrice*(1-maxDistance):entryPrice*(1+maxDistance);
    const validSmartStop=type==="long"
      ? (configuredStop>0&&configuredStop<entryPrice ? Math.max(configuredStop,hardStop):hardStop)
      : (configuredStop>entryPrice ? Math.min(configuredStop,hardStop):hardStop);
    const stopPriceBase=validSmartStop;
    let stopOrderId:string|undefined;
    try{
      const stopPrice=parseFloat(exchange.priceToPrecision(exSymbol,stopPriceBase));
      const stopSide=type==="long"?"sell":"buy";
      const stopOrder=await exchange.createOrder(exSymbol,"STOP_MARKET",stopSide,amount,undefined,{stopPrice,reduceOnly:true,workingType:"MARK_PRICE"});
      stopOrderId=stopOrder.id;
    }catch(e:any){
      // Do not pretend the position is protected if the exchange stop failed.
      addEngineLog("WARN",`[RISK] ${symbol} Binance STOP_MARKET kurulamadı: ${e.message}`);
    }

    const target1x=Number(signalMeta.target1xPct||minProfitPct1x);
    const targetPrice=Number(signalMeta.targetPrice||(
      type==="long"?entryPrice*(1+target1x/100):entryPrice*(1-target1x/100)
    ));

    activePositions[symbol]={
      trade_id:tradeCounter++,pair:symbol,type,entryPrice,amount,
      peakPrice:entryPrice,openDate:Date.now(),lookbackMin:activeLookbackMin,
      stopLossPct:activeStopLossPct,deepScoreHistory:[],leverage:targetLeverage,
      baseStopPrice:Number(stopPriceBase.toPrecision(12)),binanceStopOrderId:stopOrderId,
      unrealizedPnl:0,percentage:0,
      target1xPct:target1x,targetPrice,
      signalScore:Number(signalMeta.signalScore||0),
      entryPressurePct:Number(signalMeta.pressure||50),
      oppositePressurePct:Number(signalMeta.oppositePressure||50)
    } as any;
    (activePositions[symbol] as any).isRealBinance=true;
    allTrades.unshift({...activePositions[symbol],is_open:true});
    addEngineLog("TRADE",`[BINANCE FUTURES ${tradingEnvironment.toUpperCase()}] ${symbol} ${type.toUpperCase()} x${targetLeverage} | Entry ${entryPrice} | 1x hedef +%${target1x.toFixed(2)} | x${targetLeverage} ROE +%${(target1x*targetLeverage).toFixed(2)} | Stop ${stopPriceBase}`);
  }finally{
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number) {
  const pos = activePositions[symbol];
  if (!pos) return;

  const exSymbol = getMarketSymbol(symbol);

  if (exchange && isExchangeAuthenticated) {
    try {
      const side = pos.type === "long" ? "sell" : "buy";
      let exitAmount = pos.amount;
      try {
        exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, exitAmount));
      } catch (e) {}

      await exchange.createOrder(exSymbol, "market", side, exitAmount, undefined, { reduceOnly: true });

      // Cancel associated stop order on Binance
      if (pos.binanceStopOrderId) {
        try {
          await exchange.cancelOrder(pos.binanceStopOrderId, exSymbol);
        } catch (e) {}
      }
    } catch (e: any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} Çıkış Emri Hatası: ${e.message}`);
    }
  }

  // Exact PnL calculation matching Binance 1:1
  const pnlUSD = pos.type === "long"
    ? (currentPrice - pos.entryPrice) * pos.amount
    : (pos.entryPrice - currentPrice) * pos.amount;

  const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
  const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;

  const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id);
  if (tradeIndex !== -1) {
    allTrades[tradeIndex].is_open = false;
    allTrades[tradeIndex].close_rate = currentPrice;
    allTrades[tradeIndex].close_date = Date.now();
    allTrades[tradeIndex].close_reason = reason;
    allTrades[tradeIndex].profit_abs = Number(pnlUSD.toFixed(2));
    allTrades[tradeIndex].profit_pct = Number(roePct.toFixed(2));
  }

  delete activePositions[symbol];
  addEngineLog("TRADE", `[POZİSYON KAPANDI] ${symbol} | Neden: ${reason} | Sonuç: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${roePct >= 0 ? '+' : ''}${roePct.toFixed(2)}%)`);
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", `OrderFlow Quant Brain başlatıldı | ${tradingEnvironment.toUpperCase()} | ${entryMode.toUpperCase()}`);
  addEngineLog("INFO", `Minimum kâr: 1x %${minProfitPct1x} | Kaldıraç: x${targetLeverage}`);
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
    trading_mode: tradingEnvironment,
    entry_mode: entryMode,
    strategy: "OrderFlow_Quant_Brain",
    timeframe: "multi-timeframe + order-flow",
    min_profit_pct_1x: minProfitPct1x,
    leverage: targetLeverage,
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
    const balFut = await exchange.fetchBalance({ type: "future" });
    const usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
    res.json({ balance_usdt: usdt, environment: tradingEnvironment, source: "BINANCE_FUTURES" });
  } catch (e: any) {
    res.json({ balance_usdt: 0, error: e.message });
  }
});

app.get("/api/v1/config", (req,res)=>{
  res.json({
    environment:tradingEnvironment,
    entry_mode:entryMode,
    exchange:{pair_whitelist:whitelistCoins},
    leverage:targetLeverage,
    stake_amount:activeStakeAmount,
    max_open_trades:maxOpenTrades,
    min_profit_pct_1x:minProfitPct1x,
    fee_roundtrip_pct:feeRoundTripPct,
    stop_loss_pct:activeStopLossPct,
    max_scan_coins:maxScanCoins,
    min_signal_score:minSignalScore,
    max_spread_pct:maxSpreadPct
  });
});

app.post("/api/v1/config",(req,res)=>{
  const conf=req.body||{};
  if(conf.environment==="live"||conf.environment==="demo") tradingEnvironment=conf.environment;
  if(conf.entry_mode==="manual"||conf.entry_mode==="algorithm") entryMode=conf.entry_mode;
  if(conf.leverage!==undefined) targetLeverage=Math.min(125,Math.max(1,Number(conf.leverage)||15));
  if(conf.min_profit_pct_1x!==undefined) minProfitPct1x=Math.max(0.05,Number(conf.min_profit_pct_1x)||0.5);
  if(conf.fee_roundtrip_pct!==undefined) feeRoundTripPct=Math.max(0.01,Number(conf.fee_roundtrip_pct)||ESTIMATED_FEE_PCT);
  if(conf.stop_loss_pct!==undefined) activeStopLossPct=Math.max(0.1,Number(conf.stop_loss_pct)||1.5);
  if(conf.stake_amount!==undefined) activeStakeAmount=conf.stake_amount;
  if(conf.max_open_trades!==undefined) maxOpenTrades=Math.min(8,Math.max(1,Number(conf.max_open_trades)||1));
  if(conf.max_scan_coins!==undefined) maxScanCoins=Math.min(20,Math.max(8,Number(conf.max_scan_coins)||12));
  if(conf.min_signal_score!==undefined) minSignalScore=Math.min(90,Math.max(45,Number(conf.min_signal_score)||56));
  if(conf.max_spread_pct!==undefined) maxSpreadPct=Math.min(0.5,Math.max(0.01,Number(conf.max_spread_pct)||0.08));
  if(Array.isArray(conf.exchange?.pair_whitelist)&&conf.exchange.pair_whitelist.length) whitelistCoins=conf.exchange.pair_whitelist;

  const persisted={...conf,environment:tradingEnvironment,entry_mode:entryMode,leverage:targetLeverage,min_profit_pct_1x:minProfitPct1x,fee_roundtrip_pct:feeRoundTripPct,stop_loss_pct:activeStopLossPct,stake_amount:activeStakeAmount,max_open_trades:maxOpenTrades,max_scan_coins:maxScanCoins,min_signal_score:minSignalScore,max_spread_pct:maxSpreadPct};
  fs.writeFileSync("config.json",JSON.stringify(persisted,null,2));
  addEngineLog("SYSTEM",`Konfigürasyon güncellendi | ${tradingEnvironment.toUpperCase()} | ${entryMode.toUpperCase()} | Min 1x kâr %${minProfitPct1x}`);
  initializeExchange().catch(()=>{});
  startBinanceServerWebSocket();
  res.json({status:"success"});
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
      target_pct: Number((t as any).target1xPct || minProfitPct1x),
      stop_loss_pct: t.stopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: Number((t as any).target1xPct || minProfitPct1x)
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
  if (entryMode !== "manual") return res.status(400).json({error:"Manuel emir için MANUEL modunu seçin."});
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

  // If the Futures book is not ready, fetch a verified Futures snapshot
  if (!ob || !ob.bids || ob.bids.length === 0 || !m || m.obi === undefined) {
    try {
      const clean = reqSymbol.replace('/', '').toUpperCase();
      const [depthRes, tradesRes] = await Promise.all([
        fetch(`${tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com"}/fapi/v1/depth?symbol=${clean}&limit=20`),
        fetch(`${tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com"}/fapi/v1/aggTrades?symbol=${clean}&limit=30`)
      ]);

      if (depthRes.ok) {
        const depthData: any = await depthRes.json();
        ob = {
          bids: (depthData.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: (depthData.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]),
          timestamp: Date.now()
        };
        latestOrderBooks[reqSymbol] = ob;
      }

      let recentTrades: any[] = [];
      if (tradesRes.ok) {
        const tradesData: any = await tradesRes.json();
        if (Array.isArray(tradesData)) {
          recentTrades = tradesData.map((t: any) => ({
            price: parseFloat(t.price),
            amount: parseFloat(t.qty),
            side: t.isBuyerMaker ? 'sell' : 'buy',
            time: t.time
          }));
        }
      }

      const bestBid = ob?.bids?.[0]?.[0] || 65000;
      const bestAsk = ob?.asks?.[0]?.[0] || bestBid;
      const mid = (bestBid + bestAsk) / 2;

      const flow = analyzeOrderFlowAndInflow(ob, recentTrades, [], [], mid);
      m = {
        currentPrice: mid,
        change_24h_pct: 0,
        volume_24h_usdt: 0,
        rsi: 50,
        atr: mid * 0.008,
        ...flow
      };
      latestMetricsPerCoin[reqSymbol] = m;
    } catch (e) {}
  }

  const p = m?.currentPrice || ob?.bids?.[0]?.[0] || 0;
  if (!ob || !ob.bids?.length || !ob.asks?.length || !p) {
    return res.status(503).json({error:"Futures order book henüz hazır değil",environment:tradingEnvironment,source:"BINANCE_FUTURES"});
  }
  
  res.json({
    orderBook: ob,
    metrics: {
      OBI: m?.obi !== undefined ? m.obi : 0,
      MicroPrice: m?.microPrice || p,
      MidPrice: m?.midPrice || p,
      deltaV: m?.netInflowUSD !== undefined ? m.netInflowUSD / 1000 : 0,
      currentPrice: p,
      VWAP: m?.vwap || p,
      stdDev: m?.stdDev || 0,
      SpreadPct: m?.spreadPct || 0.0001,
      deepScore: m?.deepScore || 0,
      atr: m?.atr || p * 0.008,
      takerBuyRatio: m?.takerBuyRatio !== undefined ? m.takerBuyRatio : 0.5,
      netInflowUSD: m?.netInflowUSD || 0,
      longPressurePct: m?.longPressurePct || 50,
      shortPressurePct: m?.shortPressurePct || 50,
      resistancePrice: m?.resistancePrice || 0,
      supportPrice: m?.supportPrice || 0,
      predictedProfitPct: m?.predictedProfitPct || 0,
      flowImbalance: m?.flowImbalance || 0,
      flowAcceleration: m?.flowAcceleration || 0,
      absorptionScore: m?.absorptionScore || 0,
      environment: tradingEnvironment,
      source: "BINANCE_FUTURES"
    }
  });
});

app.get("/api/v1/deepdata", (req, res) => {
  res.json({ metrics: latestMetricsPerCoin, orderbooks: latestOrderBooks });
});

app.get("/api/v1/live-tickers", async (req,res)=>{
  const source=await getFuturesTickerSnapshot(100);
  const results=source.map((x:any)=>{
    const sym=`${String(x.symbol).slice(0,-4)}/USDT`;
    const m=latestMetricsPerCoin[sym];
    return {
      symbol:sym,price:Number(x.lastPrice||m?.currentPrice||0),
      change_24h_pct:Number(x.priceChangePercent||0),volume_24h_usdt:Number(x.quoteVolume||0),
      deepScore:Number(m?.deepScore||0),netInflowUSD:Number(m?.netInflowUSD||0),
      takerBuyRatio:Number(m?.takerBuyRatio||0.5),longPressurePct:Number(m?.longPressurePct||50),
      shortPressurePct:Number(m?.shortPressurePct||50),target1x:Number(m?.predictedProfitPct||0),
      signal:m?.side||(Number(m?.deepScore||0)>8?"LONG":Number(m?.deepScore||0)<-8?"SHORT":"NEUTRAL"),
      updated_at:Date.now()
    };
  });
  res.json({tickers:results,environment:tradingEnvironment,source:"BINANCE_FUTURES"});
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
    const res = await fetch(`${tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com"}/fapi/v1/exchangeInfo`);
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
    const fapiRes = await fetch(`${tradingEnvironment==="demo"?"https://demo-fapi.binance.com":"https://fapi.binance.com"}/fapi/v1/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`);
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
  const { apiKey, secretKey } = req.body;
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
      options: { defaultType: "future", adjustForTimeDifference: true, recvWindow: 60000 }
    });
    if (tradingEnvironment === "demo" && typeof (tempExchange as any).enableDemoTrading === "function") {
      (tempExchange as any).enableDemoTrading(true);
    }
    
    // Test Binance USDⓈ-M Futures balance only. Never fall back to Spot.
    let usdt = 0;
    try {
      const balFut = await tempExchange.fetchBalance({ type: "future" });
      usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
    } catch (errFut: any) {
      throw new Error(translateBinanceError(errFut?.message || "Futures bakiye okunamadı.", currentIp));
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
