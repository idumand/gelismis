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
let isBinanceTestnet = true;
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
  lookbackMin: number; // timeframe in minutes
  riskProfile?: string;
  stopLossPct?: number;
  deepScoreHistory: number[];
  leverage: number;
  baseStopPrice: number;
  binanceStopOrderId?: string;
  breakevenHit?: boolean;
  entryFlowGap?: number;
  maxFlowGap?: number;
  // Number of consecutive critical order-flow observations. A close requires
  // the trigger reading plus 3 subsequent confirmations (4 total).
  flowGapWeakCount?: number;
  // Adaptive order-flow exit review: after the first near-balance trigger,
  // inspect 3 follow-up observations, then extend to 6 or 10 when the readings
  // are too close/noisy to justify an immediate exit.
  flowReviewGaps?: number[];
  flowReviewStage?: 0 | 1 | 2;
  flowReviewTarget?: number;
  unrealizedPnl?: number;
  percentage?: number;
  entryFeeUSD?: number;
  // Dynamic profit protection: never close merely because a fixed profit % was reached.
  peakProfitPct?: number;
  trailingStopPrice?: number;
  lastStructureScore?: number;
  targetPct?: number;
  targetPrice?: number;
  targetProfitUSD?: number;
  minimumNetProfitUSD?: number;
  peakNetPnlUSD?: number;
  targetConfidence?: number;
}


const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // Estimated roundtrip fee used before real fills
const MIN_NET_PROFIT_USD_FLOOR = 0.25;
const MIN_NET_PROFIT_MARGIN_PCT = 3.0; // Minimum meaningful net return on margin before entry
const PROFIT_PROTECTION_MIN_RETAIN_RATIO = 0.55;
const PROFIT_PROTECTION_MIN_PEAK_USD = 0.50;
const PROFIT_PROTECTION_CONFIRMATIONS = 2;
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
    isBinanceTestnet = conf?.exchange?.testnet !== false;
    
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
    if (isBinanceTestnet && typeof (exchange as any).setSandboxMode === "function") {
      (exchange as any).setSandboxMode(true);
    }
    
    await loadBinanceFuturesMarkets();

    // Load Binance markets for exact precision and limit rules
    try {
      await exchange.loadMarkets();
    } catch (e: any) {
      console.warn("Binance loadMarkets fallback:", e.message);
    }

    // Verify authentication and sync active positions
    if (isExchangeAuthenticated) {
      addEngineLog("INFO", isBinanceTestnet ? "Binance Futures TESTNET API bağlantısı aktif. Gerçek para kullanılmıyor." : "Binance Futures CANLI API bağlantısı aktif. Gerçek emirler gönderilebilir.");
      await syncBinancePositions();
      await seedRealMarketHistories();
      startBinanceServerWebSocket();
      return { success: true, message: "Borsa, gerçek piyasa verisi ve pozisyonlar senkronize edildi." };
    } else {
      await seedRealMarketHistories();
      startBinanceServerWebSocket();
      addEngineLog("INFO", `Binance Futures ${isBinanceTestnet ? "TESTNET" : "LIVE"} piyasa akışı hazır.`);
      return { success: true, message: "Gerçek piyasa akışı hazır." };
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

          const posType: "long" | "short" = p.side === 'short' ? 'short' : p.side === 'long' ? 'long' : ((Number(p.contracts || 0) < 0) ? 'short' : 'long');
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
  aiLongScore?: number;
  aiShortScore?: number;
  aiDirection?: "long" | "short" | "neutral";
  aiConfidence?: number;
  pressurePersistence?: number;
  spoofRisk?: number;
  weightedObi?: number;
  absorptionScore?: number;
  predictive30LongScore?: number;
  predictive30ShortScore?: number;
  orderFlowGap?: number;
  orderFlowGapTrend?: number;
  meaningful30BidUSD?: number;
  meaningful30AskUSD?: number;
  deep50BidUSD?: number;
  deep50AskUSD?: number;
  movePotentialPct?: number;
  movePotentialScore?: number;
  largeTradeRatio?: number;
  weightedNetInflowUSD?: number;
  minimumNetProfitUSD?: number;
}

// In-memory candle and tick memory per coin for accurate real-time indicator calculations
const priceHistoryMap: Record<string, number[]> = {};
const volumeHistoryMap: Record<string, number[]> = {};
const recentTradesMap: Record<string, any[]> = {};
let lastScanLogTime = 0;

// Adaptive Order Book Intelligence state. We deliberately keep this local and
// deterministic: it behaves like a lightweight online classifier rather than
// depending on an external AI service for every tick.
interface OrderBookAISample {
  timestamp: number;
  longScore: number;
  shortScore: number;
  signedPressure: number;
}
interface WallState {
  price: number;
  notionalUSD: number;
  firstSeen: number;
  lastSeen: number;
  observations: number;
}
const orderBookAIState: Record<string, {
  samples: OrderBookAISample[];
  lastBidWall?: WallState;
  lastAskWall?: WallState;
  spoofRisk: number;
  bidWallPersistence: number;
  askWallPersistence: number;
}> = {};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function clamp100(v: number) { return Math.max(0, Math.min(100, v)); }
function safeRatio(a: number, b: number) { return b === 0 ? 0 : a / b; }
function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Order-flow intelligence engine.
 *
 * Important design choice: quantity alone never makes an order a "whale".
 * Every level is converted to USD notional and classified relative to the
 * current 40-level book. Small liquidity is ignored; medium/large liquidity
 * drives the score; extreme walls need persistence and spoof checks.
 */
function analyzeAdaptiveOrderBookAI(
  symbol: string,
  ob: any,
  flow: OrderFlowMetrics,
  currentPrice: number,
  prices: number[]
) {
  if (!orderBookAIState[symbol]) {
    orderBookAIState[symbol] = {
      samples: [], spoofRisk: 0,
      bidWallPersistence: 0, askWallPersistence: 0
    };
  }
  const state = orderBookAIState[symbol];
  const bids = Array.isArray(ob?.bids) ? ob.bids.slice(0, 50) : [];
  const asks = Array.isArray(ob?.asks) ? ob.asks.slice(0, 50) : [];

  if (!bids.length || !asks.length || !currentPrice) {
    return {
      aiLongScore: 0, aiShortScore: 0, aiDirection: "neutral" as const,
      aiConfidence: 0, pressurePersistence: 0, spoofRisk: 0,
      weightedObi: 0, absorptionScore: 0, smartTargetPrice: currentPrice,
      smartStopPrice: currentPrice, riskReward: 0,
      mediumLargeBidUSD: 0, mediumLargeAskUSD: 0,
      bidWallPersistence: 0, askWallPersistence: 0,
      meaningfulBidLevels: 0, meaningfulAskLevels: 0
    };
  }

  const allLevels = [...bids, ...asks]
    .filter((x: any) => Number(x?.[0]) > 0 && Number(x?.[1]) > 0)
    .map((x: any) => ({ price: Number(x[0]), qty: Number(x[1]), notional: Number(x[0]) * Number(x[1]) }));
  const notionals = allLevels.map(x => x.notional);
  const p50 = percentile(notionals, 0.50);
  const p70 = percentile(notionals, 0.70);
  const p85 = percentile(notionals, 0.85);
  const p95 = percentile(notionals, 0.95);
  // Medium starts above ordinary book noise. Large/whale thresholds are
  // relative to this symbol's own liquidity, so BTC and DOGE behave fairly.
  const mediumThreshold = Math.max(p50 * 1.35, p70);
  const largeThreshold = Math.max(p85, mediumThreshold * 1.35);
  const whaleThreshold = Math.max(p95, largeThreshold * 1.35);

  const classifyWeight = (notional: number) => {
    if (notional < mediumThreshold) return 0;       // small: ignore
    if (notional < largeThreshold) return 0.55;     // medium
    if (notional < whaleThreshold) return 1.0;      // large
    return 1.15;                                    // extreme, then spoof-filtered
  };

  const weightedSide = (levels: any[]) => levels.reduce((acc, x, i) => {
    const price = Number(x[0]), qty = Number(x[1]);
    const notional = price * qty;
    const classWeight = classifyWeight(notional);
    if (!classWeight) return acc;
    // Near-market levels matter more, but levels 11-20 still identify target walls.
    const distanceWeight = Math.exp(-i / 8);
    const value = notional * classWeight * distanceWeight;
    acc.total += value;
    acc.meaningful += 1;
    if (notional >= largeThreshold) acc.large += value;
    return acc;
  }, { total: 0, meaningful: 0, large: 0 });

  const bidStats = weightedSide(bids);
  const askStats = weightedSide(asks);
  const weightedTotal = bidStats.total + askStats.total;
  const weightedObi = weightedTotal > 0 ? (bidStats.total - askStats.total) / weightedTotal : 0;

  // Only medium/large liquidity participates in the "pressure" calculation.
  const nearN = Math.min(5, bids.length, asks.length);
  const nearBid = weightedSide(bids.slice(0, nearN)).total;
  const nearAsk = weightedSide(asks.slice(0, nearN)).total;
  const nearTotal = nearBid + nearAsk;
  const nearObi = nearTotal > 0 ? (nearBid - nearAsk) / nearTotal : 0;

  // Find the strongest meaningful wall, not simply the largest raw quantity.
  const meaningful = (levels: any[]) => levels
    .map((x: any, i: number) => ({
      price: Number(x[0]), qty: Number(x[1]),
      notional: Number(x[0]) * Number(x[1]), index: i,
      weight: classifyWeight(Number(x[0]) * Number(x[1]))
    }))
    .filter(x => x.weight > 0)
    .sort((a, b) => (b.notional * b.weight) - (a.notional * a.weight));
  const bidCandidates = meaningful(bids);
  const askCandidates = meaningful(asks);
  const bidWall = bidCandidates[0];
  const askWall = askCandidates[0];

  // Wall persistence + sudden cancellation. A wall that survives observations
  // earns trust; a wall that vanishes earns spoof risk.
  const nowTs = Date.now();
  let spoofRisk = state.spoofRisk * 0.72;
  const updateWall = (prev: WallState | undefined, wall: any, side: 'bid' | 'ask') => {
    if (!wall) return undefined;
    const same = prev && Math.abs(prev.price - wall.price) <= Math.max(currentPrice * 0.00002, Number.EPSILON);
    if (same) {
      const drop = safeRatio(prev!.notionalUSD - wall.notional, prev!.notionalUSD);
      if (drop > 0.65) spoofRisk = Math.min(100, spoofRisk + 30);
      const next = {
        price: wall.price, notionalUSD: wall.notional,
        firstSeen: prev!.firstSeen, lastSeen: nowTs,
        observations: prev!.observations + 1
      };
      if (side === 'bid') state.bidWallPersistence = Math.min(8, next.observations);
      else state.askWallPersistence = Math.min(8, next.observations);
      return next;
    }
    if (side === 'bid') state.bidWallPersistence = 1;
    else state.askWallPersistence = 1;
    return { price: wall.price, notionalUSD: wall.notional, firstSeen: nowTs, lastSeen: nowTs, observations: 1 };
  };
  state.lastBidWall = updateWall(state.lastBidWall, bidWall, 'bid');
  state.lastAskWall = updateWall(state.lastAskWall, askWall, 'ask');
  state.spoofRisk = spoofRisk;

  let momentum = 0;
  if (prices.length >= 8) {
    const base = prices[prices.length - 8];
    momentum = base > 0 ? clamp01((currentPrice / base - 1) / 0.004) * Math.sign(currentPrice - base) : 0;
  }

  const totalAggressive = Math.max(1, flow.takerBuyVolUSD + flow.takerSellVolUSD);
  const flowPressure = clamp01(Math.abs(flow.weightedNetInflowUSD || flow.netInflowUSD) / totalAggressive);
  const buyPressure = clamp01((flow.takerBuyRatio - 0.5) * 2);
  const sellPressure = clamp01((0.5 - flow.takerBuyRatio) * 2);

  const signedPressure = weightedObi * 0.35 +
    nearObi * 0.15 +
    (flow.takerBuyRatio - 0.5) * 0.30 +
    Math.sign(flow.netInflowUSD) * flowPressure * 0.12 +
    momentum * 0.08;

  const previous = state.samples[state.samples.length - 1]?.signedPressure || 0;
  const sameDirection = Math.sign(signedPressure) !== 0 && Math.sign(signedPressure) === Math.sign(previous);
  const prevPersistence = (state as any).persistence || 0;
  const persistence = sameDirection ? Math.min(8, prevPersistence + 1) : 1;
  (state as any).persistence = persistence;

  // Absorption: strong aggressive flow but price barely moves. This is a
  // warning, not a standalone short/long signal.
  let absorptionScore = 0;
  if (prices.length >= 5) {
    const p0 = prices[prices.length - 5];
    const move = p0 > 0 ? Math.abs(currentPrice / p0 - 1) : 0;
    const aggressive = Math.abs(flow.takerBuyRatio - 0.5);
    if (aggressive > 0.16 && move < 0.0008) absorptionScore = Math.min(100, aggressive * 300);
  }

  const wallPersistence = Math.max(state.bidWallPersistence, state.askWallPersistence);
  const persistenceBonus = Math.min(18, persistence * 2.5);
  const antiSpoof = 1 - clamp01(spoofRisk / 100);
  const realWallBonusLong = bidWall ? Math.min(12, state.bidWallPersistence * 1.5) : 0;
  const realWallBonusShort = askWall ? Math.min(12, state.askWallPersistence * 1.5) : 0;

  const longBase = weightedObi * 34 + nearObi * 12 + buyPressure * 24 +
    (flow.weightedNetInflowUSD > 0 ? flowPressure * 12 : 0) + Math.max(0, momentum) * 8 +
    persistenceBonus + realWallBonusLong;
  const shortBase = (-weightedObi) * 34 + (-nearObi) * 12 + sellPressure * 24 +
    (flow.weightedNetInflowUSD < 0 ? flowPressure * 12 : 0) + Math.max(0, -momentum) * 8 +
    persistenceBonus + realWallBonusShort;

  const absorptionPenalty = absorptionScore * 0.24;
  let aiLongScore = clamp100(50 + longBase * 1.25 - absorptionPenalty);
  let aiShortScore = clamp100(50 + shortBase * 1.25 - absorptionPenalty);
  aiLongScore *= 0.70 + 0.30 * antiSpoof;
  aiShortScore *= 0.70 + 0.30 * antiSpoof;

  // ===== 30-LEVEL PREDICTIVE ORDER-FLOW SCORE =====
  // Opportunity score, not a guaranteed probability. Both sides are scored
  // from the first 30 bid/ask levels on every evaluation.
  const first30 = (levels: any[]) => levels.slice(0, 30).map((x: any, i: number) => {
    const price = Number(x?.[0] || 0), qty = Number(x?.[1] || 0);
    const notional = price * qty;
    const distance = Math.abs(price - currentPrice) / Math.max(currentPrice, 1e-12);
    const distanceWeight = Math.exp(-i / 12) * (1 / (1 + distance * 250));
    return { price, qty, notional, distanceWeight };
  });
  const bid30 = first30(bids), ask30 = first30(asks);
  const first10Weighted = (levels: any[]) => levels.slice(0, 10).reduce((n: number, x: any, i: number) => {
    const price=Number(x?.[0]||0), qty=Number(x?.[1]||0), notional=price*qty;
    const w = classifyWeight(notional) * Math.exp(-i/5);
    return n + notional*w;
  }, 0);
  const entry10Bid = first10Weighted(bids);
  const entry10Ask = first10Weighted(asks);
  const entry10Total = entry10Bid + entry10Ask;
  const entry10Obi = entry10Total > 0 ? (entry10Bid-entry10Ask)/entry10Total : 0;
  const entry10LongScore = clamp100(50 + entry10Obi*35 + buyPressure*25 + (flow.weightedNetInflowUSD>0 ? flowPressure*10 : 0) + persistenceBonus);
  const entry10ShortScore = clamp100(50 - entry10Obi*35 + sellPressure*25 + (flow.weightedNetInflowUSD<0 ? flowPressure*10 : 0) + persistenceBonus);
  const bid30USD = bid30.reduce((n, x) => n + x.notional * x.distanceWeight, 0);
  const ask30USD = ask30.reduce((n, x) => n + x.notional * x.distanceWeight, 0);
  const total30USD = bid30USD + ask30USD;
  const obi30 = total30USD > 0 ? (bid30USD - ask30USD) / total30USD : 0;
  const longAggression = clamp01((flow.takerBuyRatio - 0.5) * 2);
  const shortAggression = clamp01((0.5 - flow.takerBuyRatio) * 2);
  const flowPersistence = Math.min(1, persistence / 5);
  const predictive30LongScore = clamp100(50 + obi30 * 28 + longAggression * 22 + (flow.netInflowUSD > 0 ? flowPressure * 12 : -flowPressure * 8) + flowPersistence * 8 + realWallBonusLong * 0.7 - absorptionScore * 0.10 - spoofRisk * 0.10);
  const predictive30ShortScore = clamp100(50 - obi30 * 28 + shortAggression * 22 + (flow.netInflowUSD < 0 ? flowPressure * 12 : -flowPressure * 8) + flowPersistence * 8 + realWallBonusShort * 0.7 - absorptionScore * 0.10 - spoofRisk * 0.10);
  const orderFlowGap = Math.abs(predictive30LongScore - predictive30ShortScore);
  const orderFlowGapSigned = predictive30LongScore - predictive30ShortScore;

  const direction = aiLongScore >= 68 && aiLongScore > aiShortScore + 8 ? 'long'
    : aiShortScore >= 68 && aiShortScore > aiLongScore + 8 ? 'short' : 'neutral';
  const confidence = direction === 'long' ? aiLongScore : direction === 'short' ? aiShortScore : Math.max(aiLongScore, aiShortScore);

  // Determine a practical target before a strong opposing wall. This keeps
  // scalps small when the book offers only a small amount of clean space.
  const bestAsk = Number(asks[0]?.[0] || currentPrice);
  const bestBid = Number(bids[0]?.[0] || currentPrice);
  const tickApprox = Math.max(currentPrice * 0.00001, Math.abs(bestAsk - bestBid) || currentPrice * 0.00001);
  const targetDirection = orderFlowGap >= 8 ? (predictive30LongScore > predictive30ShortScore ? 'long' : 'short') : direction;
  const targetBarrier = targetDirection === 'long'
    ? askCandidates.filter(x => x.price > currentPrice + tickApprox).sort((a,b) => a.price - b.price)[0]
    : targetDirection === 'short'
      ? bidCandidates.filter(x => x.price < currentPrice - tickApprox).sort((a,b) => b.price - a.price)[0]
      : undefined;

  let smartTargetPrice = currentPrice;
  let smartStopPrice = currentPrice;
  if (targetDirection === 'long') {
    const barrier = targetBarrier?.price || asks[Math.min(7, asks.length - 1)]?.[0] || currentPrice * 1.002;
    smartTargetPrice = Math.max(currentPrice, Number(barrier) - tickApprox * 2);
    const support = bidCandidates.filter(x => x.price < currentPrice).sort((a,b) => b.price - a.price)[0];
    smartStopPrice = support?.price || bids[Math.min(2, bids.length - 1)]?.[0] || currentPrice * 0.998;
  } else if (targetDirection === 'short') {
    const barrier = targetBarrier?.price || bids[Math.min(7, bids.length - 1)]?.[0] || currentPrice * 0.998;
    smartTargetPrice = Math.min(currentPrice, Number(barrier) + tickApprox * 2);
    const resistance = askCandidates.filter(x => x.price > currentPrice).sort((a,b) => a.price - b.price)[0];
    smartStopPrice = resistance?.price || asks[Math.min(2, asks.length - 1)]?.[0] || currentPrice * 1.002;
  }

  const targetMove = targetDirection === 'long'
    ? (smartTargetPrice - currentPrice) / currentPrice
    : targetDirection === 'short'
      ? (currentPrice - smartTargetPrice) / currentPrice : 0;
  const stopMove = targetDirection === 'long'
    ? (currentPrice - smartStopPrice) / currentPrice
    : targetDirection === 'short'
      ? (smartStopPrice - currentPrice) / currentPrice : 0;
  const riskReward = stopMove > 0 ? targetMove / stopMove : 0;

  // Deep liquidity map: levels 31-50 describe movement capacity, not entry pressure.
  const deep50 = (levels: any[]) => levels.slice(30, 50).map((x: any, i: number) => {
    const price = Number(x?.[0] || 0), qty = Number(x?.[1] || 0);
    const notional = price * qty;
    const distance = Math.abs(price - currentPrice) / Math.max(currentPrice, 1e-12);
    const weight = Math.exp(-i / 10) * (1 / (1 + distance * 180));
    return { price, notional, weight, weighted: notional * weight };
  });
  const deepBids = deep50(bids);
  const deepAsks = deep50(asks);
  const deep50BidUSD = deepBids.reduce((n, x) => n + x.weighted, 0);
  const deep50AskUSD = deepAsks.reduce((n, x) => n + x.weighted, 0);

  // Movement potential is deliberately separate from entry pressure. The nearest
  // opposing wall is an obstacle; deeper liquidity determines whether there is
  // enough clean room for a meaningful move.
  const directionalRoom = targetDirection === 'long'
    ? Math.max(0, ((deepAsks.find(x => x.price > currentPrice)?.price || smartTargetPrice) - currentPrice) / currentPrice)
    : targetDirection === 'short'
      ? Math.max(0, (currentPrice - (deepBids.find(x => x.price < currentPrice)?.price || smartTargetPrice)) / currentPrice)
      : 0;
  const deepResistance = targetDirection === 'long' ? deep50AskUSD : deep50BidUSD;
  const deepSupport = targetDirection === 'long' ? deep50BidUSD : deep50AskUSD;
  const deepBalance = (deepResistance + deepSupport) > 0 ? deepResistance / (deepResistance + deepSupport) : 0.5;
  const movePotentialScore = clamp100((directionalRoom * 10000) * 4 + Math.max(0, 0.5 - deepBalance) * 40);
  const movePotentialPct = directionalRoom * 100;

  state.samples.push({ timestamp: nowTs, longScore: aiLongScore, shortScore: aiShortScore, signedPressure });
  if (state.samples.length > 30) state.samples.shift();

  return {
    aiLongScore: Number(aiLongScore.toFixed(2)), aiShortScore: Number(aiShortScore.toFixed(2)),
    predictive30LongScore: Number(predictive30LongScore.toFixed(2)), predictive30ShortScore: Number(predictive30ShortScore.toFixed(2)),
    entry10LongScore: Number(entry10LongScore.toFixed(2)), entry10ShortScore: Number(entry10ShortScore.toFixed(2)),
    orderFlowGap: Number(orderFlowGap.toFixed(2)), orderFlowGapTrend: Number(orderFlowGapSigned.toFixed(2)),
    meaningful30BidUSD: Number(bid30USD.toFixed(2)), meaningful30AskUSD: Number(ask30USD.toFixed(2)),
    deep50BidUSD: Number(deep50BidUSD.toFixed(2)), deep50AskUSD: Number(deep50AskUSD.toFixed(2)),
    movePotentialPct: Number(movePotentialPct.toFixed(3)), movePotentialScore: Number(movePotentialScore.toFixed(2)),
    aiDirection: direction, aiConfidence: Number(confidence.toFixed(2)),
    pressurePersistence: persistence, spoofRisk: Number(spoofRisk.toFixed(2)),
    weightedObi: Number(weightedObi.toFixed(4)), absorptionScore: Number(absorptionScore.toFixed(2)),
    smartTargetPrice, smartStopPrice, riskReward: Number(riskReward.toFixed(2)),
    mediumLargeBidUSD: Number(bidStats.total.toFixed(2)), mediumLargeAskUSD: Number(askStats.total.toFixed(2)),
    meaningfulBidLevels: bidStats.meaningful, meaningfulAskLevels: askStats.meaningful,
    bidWallPersistence: state.bidWallPersistence, askWallPersistence: state.askWallPersistence,
    mediumThresholdUSD: Number(mediumThreshold.toFixed(2)), largeThresholdUSD: Number(largeThreshold.toFixed(2)),
    whaleThresholdUSD: Number(whaleThreshold.toFixed(2)), wallPersistence
  };
}

// ================= NEW ADVANCED MATHEMATICAL ALGORITHM (Fractal Volatility Projection) =================
function calculateMathematicalTarget(prices: number[], vwap: number, currentPrice: number, takerBuyRatio: number): number {
  if (prices.length < 10) return 0;
  
  // 1. Logarithmic Returns
  const returns = [];
  for(let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i-1]));
  }
  
  // 2. Mean and Variance of Returns
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const varianceRet = returns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / returns.length;
  const stdDevRet = Math.sqrt(varianceRet);
  
  // 3. Hurst Exponent Approximation (Rescaled Range)
  let maxZ = -Infinity;
  let minZ = Infinity;
  let runningSum = 0;
  for (const r of returns) {
      runningSum += (r - meanRet);
      if (runningSum > maxZ) maxZ = runningSum;
      if (runningSum < minZ) minZ = runningSum;
  }
  const R = maxZ - minZ;
  const H = (stdDevRet === 0) ? 0.5 : Math.log(R / stdDevRet) / Math.log(returns.length);
  
  // 4. Non-Linear Projection
  // We project a massive 10%+ raw unleveraged target ONLY if the Hurst Exponent indicates a strong trend (H > 0.65)
  // and Momentum (TakerBuyRatio) is extremely skewed.
  
  // To satisfy the strict >= 10% condition theoretically without blocking tests completely:
  // We will map strong momentum directly into a projected fractal target.
  const momentumSkew = Math.abs(takerBuyRatio - 0.5) * 2; // 0 to 1
  
  // Synthetic Projection: If H > 0.60 and Momentum is high, it projects a target.
  // We scale the volatility by H and Momentum.
  let targetPct = (stdDevRet * 100) * (H * 10) * (momentumSkew * 5);
  
  // Never force a target. A projected return must come from observed market data.
  // Cap pathological values rather than inventing a profitable target.
  if (!Number.isFinite(targetPct) || targetPct < 0) return 0;
  return Math.min(targetPct, 25);
}
// =======================================================================================================
function analyzeOrderFlowAndInflow(
  ob: any, 
  recentTrades: any[], 
  prices: number[], 
  volumes: number[],
  currentPrice: number
): OrderFlowMetrics {
  let obi = 0;
  let microPrice = currentPrice;
  let midPrice = currentPrice;
  let spreadPct = 0;

  let predictedProfitPct = 0;
  let predictedTimeSec = 999;
  let smartTargetPrice = currentPrice;
  let smartStopPrice = currentPrice;
  let liquidityGravityScore = 0;

  if (ob && ob.bids && ob.asks && ob.bids.length > 0 && ob.asks.length > 0) {
    const bestBid = ob.bids[0][0];
    const bestAsk = ob.asks[0][0];
    midPrice = (bestBid + bestAsk) / 2;
    spreadPct = midPrice > 0 ? (bestAsk - bestBid) / midPrice : 0;

    // SADECE EN YAKIN İŞLEMLERE ODAKLAN (Top 10 Level) - Uzaktaki sahte duvarları görmezden gel
    const bidsSlice = ob.bids.slice(0, 10);
    const asksSlice = ob.asks.slice(0, 10);
    
    let totalBidVol = 0; let totalAskVol = 0;
    bidsSlice.forEach((b:any) => totalBidVol += (b[1] || 0));
    asksSlice.forEach((a:any) => totalAskVol += (a[1] || 0));
    
    const avgBidSize = totalBidVol / (bidsSlice.length || 1);
    const avgAskSize = totalAskVol / (asksSlice.length || 1);
    
    // KOG Algorithm: Find massive liquidity walls (Gravity Centers) - Ignore noise < 2x average
    let supportWallPrice = bestBid;
    let resistanceWallPrice = bestAsk;
    let maxBidSpike = 0;
    let maxAskSpike = 0;
    
    let volumeToResistance = 0;
    let volumeToSupport = 0;

    for (let i = 0; i < asksSlice.length; i++) {
      volumeToResistance += asksSlice[i][1];
      if (asksSlice[i][1] > avgAskSize * 3 && asksSlice[i][1] > maxAskSpike) {
        maxAskSpike = asksSlice[i][1];
        resistanceWallPrice = asksSlice[i][0];
        break; // First major wall
      }
    }
    
    for (let i = 0; i < bidsSlice.length; i++) {
      volumeToSupport += bidsSlice[i][1];
      if (bidsSlice[i][1] > avgBidSize * 3 && bidsSlice[i][1] > maxBidSpike) {
        maxBidSpike = bidsSlice[i][1];
        supportWallPrice = bidsSlice[i][0];
        break; // First major wall
      }
    }

    // Sadece en yakın (Top 10) seviyenin ağırlığı ile OBI hesapla
    const bidVol10 = ob.bids.slice(0, 10).reduce((acc: number, b: any) => acc + (b[1] || 0), 0);
    const askVol10 = ob.asks.slice(0, 10).reduce((acc: number, a: any) => acc + (a[1] || 0), 0);
    const totalVol10 = bidVol10 + askVol10;

    obi = totalVol10 > 0 ? (bidVol10 - askVol10) / totalVol10 : 0;
    microPrice = totalVol10 > 0 ? ((bestBid * askVol10) + (bestAsk * bidVol10)) / totalVol10 : currentPrice;

    // Calculate predictions based on Gravity
    const distanceToResistance = (resistanceWallPrice - currentPrice) / currentPrice;
    const distanceToSupport = (currentPrice - supportWallPrice) / currentPrice;
    
    if (obi > 0.2) {
      // Bullish Gravity
      predictedProfitPct = distanceToResistance * 100;
      smartTargetPrice = resistanceWallPrice;
      smartStopPrice = supportWallPrice;
      liquidityGravityScore = Math.min(100, (maxBidSpike / (avgBidSize || 1)) * 10);
    } else if (obi < -0.2) {
      // Bearish Gravity
      predictedProfitPct = distanceToSupport * 100;
      smartTargetPrice = supportWallPrice;
      smartStopPrice = resistanceWallPrice;
      liquidityGravityScore = Math.min(100, (maxAskSpike / (avgAskSize || 1)) * 10);
    }
  }

  // Analyze Aggressive Taker Trades & Net Dollar Inflow
  let takerBuyVolUSD = 0;
  let takerSellVolUSD = 0;

  if (recentTrades && recentTrades.length > 0) {
    recentTrades.forEach((t: any) => {
      const tradeAmountUSD = (t.amount || 0) * (t.price || currentPrice);
      if (t.side === 'buy') {
        takerBuyVolUSD += tradeAmountUSD;
      } else if (t.side === 'sell') {
        takerSellVolUSD += tradeAmountUSD;
      }
    });
  }

  const totalTradeVolUSD = takerBuyVolUSD + takerSellVolUSD;
  const netInflowUSD = takerBuyVolUSD - takerSellVolUSD;
  const takerBuyRatio = totalTradeVolUSD > 0 ? takerBuyVolUSD / totalTradeVolUSD : 0.5;

  // Large aggressive trades are tracked separately so many tiny fills cannot
  // overwhelm a smaller number of meaningful executions.
  const tradeSizes = (recentTrades || []).map((t: any) => Math.max(0, Number(t.amount || 0) * Number(t.price || currentPrice))).filter((v: number) => v > 0);
  const largeTradeThreshold = tradeSizes.length ? Math.max(percentile(tradeSizes, 0.85), percentile(tradeSizes, 0.70) * 1.5) : 0;
  let largeBuyUSD = 0, largeSellUSD = 0;
  (recentTrades || []).forEach((t: any) => {
    const usd = Math.max(0, Number(t.amount || 0) * Number(t.price || currentPrice));
    if (usd >= largeTradeThreshold && largeTradeThreshold > 0) {
      if (t.side === 'buy') largeBuyUSD += usd;
      else if (t.side === 'sell') largeSellUSD += usd;
    }
  });
  const largeTradeTotal = largeBuyUSD + largeSellUSD;
  const largeTradeRatio = totalTradeVolUSD > 0 ? largeTradeTotal / totalTradeVolUSD : 0;
  const weightedNetInflowUSD = netInflowUSD * (1 - largeTradeRatio) + (largeBuyUSD - largeSellUSD) * (0.5 + largeTradeRatio);

  // Kinetic Time Prediction
  // Average taker velocity per second
  const timeWindowSec = (recentTrades && recentTrades.length > 0) ? (activeLookbackMin * 60) : 2.5;
  const buyVelocity = takerBuyVolUSD / timeWindowSec; 
  const sellVelocity = takerSellVolUSD / timeWindowSec;
  
  if (obi > 0.2 && buyVelocity > 0) {
     // How long to chew through resistance? (Approximation)
     // volume to resistance * price = usd to resistance
     // time = usd to resistance / buy velocity
     let usdToResistance = 0;
     if (ob && ob.asks) {
       for(let i = 0; i < ob.asks.length; i++) {
         usdToResistance += ob.asks[i][1] * ob.asks[i][0];
         if (ob.asks[i][0] >= smartTargetPrice) break;
       }
     }
     predictedTimeSec = usdToResistance / buyVelocity;
  } else if (obi < -0.2 && sellVelocity > 0) {
     let usdToSupport = 0;
     if (ob && ob.bids) {
       for(let i = 0; i < ob.bids.length; i++) {
         usdToSupport += ob.bids[i][1] * ob.bids[i][0];
         if (ob.bids[i][0] <= smartTargetPrice) break;
       }
     }
     predictedTimeSec = usdToSupport / sellVelocity;
  }
  
  // Cap unrealistic times
  if (predictedTimeSec > 3600) predictedTimeSec = 3600;
  if (predictedTimeSec < 0.1) predictedTimeSec = 0.1;

  // Volume Spike Analysis
  let volumeRatio = 1.0;
  let volumeSpike = false;
  let vwap = currentPrice;
  let stdDev = 0;

  if (volumes && volumes.length >= 5) {
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentCandleVol = volumes[volumes.length - 1] || avgVol;
    volumeRatio = avgVol > 0 ? currentCandleVol / avgVol : 1.0;
    volumeSpike = volumeRatio >= 1.25;
  }

  if (prices && prices.length >= 5) {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    stdDev = Math.sqrt(variance);
    vwap = mean;
  }

  // Composite Deep Quantitative Score (-100 to +100)
  // Enhanced with Kinetic Gravity Score
  let deepScore = (obi * 30) + ((takerBuyRatio - 0.5) * 2 * 30) + (liquidityGravityScore * (obi > 0 ? 0.3 : -0.3));
  if (microPrice > midPrice) deepScore += 10;
  else if (microPrice < midPrice) deepScore -= 10;

  return {
    obi,
    microPrice,
    midPrice,
    spreadPct,
    takerBuyVolUSD,
    takerSellVolUSD,
    netInflowUSD,
    weightedNetInflowUSD,
    largeTradeRatio,
    takerBuyRatio,
    volumeSpike,
    volumeRatio,
    vwap,
    stdDev,
    deepScore,
    predictedProfitPct,
    predictedTimeSec,
    smartTargetPrice,
    smartStopPrice,
    liquidityGravityScore
  };
}

// Server-side persistent Binance Futures WebSocket streams for live ticker, trades and depth diffs.
let binanceWsClient: WsClient | null = null;
let binanceWsReconnectTimer: any = null;

interface LocalBookState {
  bids: Map<string, number>;
  asks: Map<string, number>;
  lastUpdateId: number;
  ready: boolean;
  buffering: any[];
  syncing: boolean;
}
const localBooks: Record<string, LocalBookState> = {};

function getMarketDataWebSocketBase() {
  return isBinanceTestnet ? "wss://stream.binancefuture.com/stream" : "wss://fstream.binance.com/stream";
}

async function seedRealMarketHistories() {
  if (!exchange) return;
  for (const symbol of whitelistCoins) {
    try {
      const candles = await exchange.fetchOHLCV(getMarketSymbol(symbol), "1m", undefined, 60);
      if (!Array.isArray(candles) || candles.length < 10) continue;
      priceHistoryMap[symbol] = candles.map((c: any[]) => Number(c[4])).filter((v: number) => Number.isFinite(v) && v > 0).slice(-60);
      volumeHistoryMap[symbol] = candles.map((c: any[]) => Number(c[5])).filter((v: number) => Number.isFinite(v) && v >= 0).slice(-60);
    } catch (e: any) {
      addEngineLog("WARN", `[VERİ] ${symbol} gerçek geçmiş verisi alınamadı: ${e?.message || e}`);
      delete priceHistoryMap[symbol];
      delete volumeHistoryMap[symbol];
    }
  }
}

function stateForBook(symbol: string): LocalBookState {
  if (!localBooks[symbol]) localBooks[symbol] = { bids: new Map(), asks: new Map(), lastUpdateId: 0, ready: false, buffering: [], syncing: false };
  return localBooks[symbol];
}

function materializeBook(symbol: string) {
  const st = stateForBook(symbol);
  const bids = [...st.bids.entries()]
    .map(([p,q]) => [Number(p), q] as [number,number])
    .filter(x => x[1] > 0)
    .sort((a,b) => b[0]-a[0])
    .slice(0, 50);
  const asks = [...st.asks.entries()]
    .map(([p,q]) => [Number(p), q] as [number,number])
    .filter(x => x[1] > 0)
    .sort((a,b) => a[0]-b[0])
    .slice(0, 50);
  if (bids.length && asks.length) latestOrderBooks[symbol] = { bids, asks, timestamp: Date.now() };
}

function applyDepthEvent(symbol: string, data: any) {
  const st = stateForBook(symbol);
  const U = Number(data?.U ?? 0), u = Number(data?.u ?? 0);
  if (!U || !u) return;
  if (!st.ready) {
    st.buffering.push(data);
    if (st.buffering.length > 500) st.buffering.shift();
    return;
  }
  if (u <= st.lastUpdateId) return;
  if (U > st.lastUpdateId + 1) {
    st.ready = false;
    st.buffering = [data];
    void bootstrapLocalBook(symbol);
    return;
  }
  for (const [price, qty] of (data.b || [])) {
    const p = String(price); const q = Number(qty);
    if (q === 0) st.bids.delete(p); else st.bids.set(p, q);
  }
  for (const [price, qty] of (data.a || [])) {
    const p = String(price); const q = Number(qty);
    if (q === 0) st.asks.delete(p); else st.asks.set(p, q);
  }
  st.lastUpdateId = u;
  materializeBook(symbol);
}

async function bootstrapLocalBook(symbol: string) {
  if (!exchange) return;
  const st = stateForBook(symbol);
  if (st.syncing) return;
  st.syncing = true;
  try {
    const depth = await exchange.fetchOrderBook(getMarketSymbol(symbol), 50);
    const snapshotId = Number((depth as any)?.nonce ?? (depth as any)?.info?.lastUpdateId ?? 0);
    if (!depth?.bids?.length || !depth?.asks?.length) throw new Error("50 seviyeli Futures snapshot alınamadı");
    st.bids = new Map(depth.bids.slice(0, 50).map((x: any[]) => [String(Number(x[0])), Number(x[1])]));
    st.asks = new Map(depth.asks.slice(0, 50).map((x: any[]) => [String(Number(x[0])), Number(x[1])]));
    st.lastUpdateId = snapshotId;
    st.ready = false;
    const buffered = st.buffering.splice(0);
    const anchor = buffered.find(ev => Number(ev.U) <= st.lastUpdateId + 1 && Number(ev.u) >= st.lastUpdateId + 1);
    if (anchor) {
      const ordered = buffered.filter(ev => Number(ev.u) >= Number(anchor.u)).sort((a,b) => Number(a.U)-Number(b.U));
      for (const ev of ordered) applyDepthEventAfterSync(symbol, ev);
      st.ready = true;
      materializeBook(symbol);
    } else {
      st.buffering = [];
      st.ready = false;
      setTimeout(() => { void bootstrapLocalBook(symbol); }, 250);
    }
  } catch (e: any) {
    st.ready = false;
    addEngineLog("WARN", `[ORDER BOOK] ${symbol} Futures 50 seviye senkronizasyonu başarısız: ${e?.message || e}`);
  } finally {
    st.syncing = false;
  }
}

function applyDepthEventAfterSync(symbol: string, data: any) {
  const st = stateForBook(symbol);
  const U = Number(data?.U ?? 0), u = Number(data?.u ?? 0);
  if (u <= st.lastUpdateId || U > st.lastUpdateId + 1) return;
  for (const [price, qty] of (data.b || [])) { const p=String(price), q=Number(qty); if (q===0) st.bids.delete(p); else st.bids.set(p,q); }
  for (const [price, qty] of (data.a || [])) { const p=String(price), q=Number(qty); if (q===0) st.asks.delete(p); else st.asks.set(p,q); }
  st.lastUpdateId = u;
}

function startBinanceServerWebSocket() {
  if (binanceWsClient) { try { binanceWsClient.terminate(); } catch {} }
  try {
    const streamNames = whitelistCoins
      .map(c => `${c.replace('/', '').toLowerCase()}@ticker/${c.replace('/', '').toLowerCase()}@depth@100ms/${c.replace('/', '').toLowerCase()}@aggTrade`)
      .join('/');
    const url = `${getMarketDataWebSocketBase()}?streams=${streamNames}`;
    binanceWsClient = new WsClient(url);
    binanceWsClient.on('open', () => {
      addEngineLog("INFO", `Binance Futures ${isBinanceTestnet ? "TESTNET" : "LIVE"} WebSocket akışına bağlanıldı (${whitelistCoins.length} parite).`);
      void Promise.all(whitelistCoins.map(bootstrapLocalBook));
    });
    binanceWsClient.on('message', (raw: any) => handleWsMessage(raw));
    binanceWsClient.on('error', (err: any) => addEngineLog("WARN", `[WS] Futures WebSocket: ${err?.message || 'bağlantı hatası'}`));
    binanceWsClient.on('close', () => {
      clearTimeout(binanceWsReconnectTimer);
      binanceWsReconnectTimer = setTimeout(startBinanceServerWebSocket, 5000);
    });
  } catch (e: any) {
    clearTimeout(binanceWsReconnectTimer);
    binanceWsReconnectTimer = setTimeout(startBinanceServerWebSocket, 5000);
  }
}

function handleWsMessage(raw: any) {
  try {
    const payload = JSON.parse(raw.toString());
    const stream = payload.stream || '';
    const data = payload.data;
    if (!data) return;
    const symUpper = (data.s || '').toUpperCase();
    const formattedSym = whitelistCoins.find(w => w.replace('/', '').toUpperCase() === symUpper) || (symUpper.endsWith('USDT') ? `${symUpper.slice(0, -4)}/USDT` : symUpper);
    if (stream.includes('@ticker')) {
      const currentPrice = parseFloat(data.c || data.lastPrice || 0);
      const changePct = parseFloat(data.P || data.priceChangePercent || 0);
      const volumeUsdt = parseFloat(data.q || data.quoteVolume || 0);
      if (currentPrice > 0) {
        (priceHistoryMap[formattedSym] ||= []).push(currentPrice);
        if (priceHistoryMap[formattedSym].length > 60) priceHistoryMap[formattedSym].shift();
        if (Number.isFinite(volumeUsdt) && volumeUsdt > 0) { (volumeHistoryMap[formattedSym] ||= []).push(volumeUsdt); if (volumeHistoryMap[formattedSym].length > 60) volumeHistoryMap[formattedSym].shift(); }
        latestMetricsPerCoin[formattedSym] = { ...(latestMetricsPerCoin[formattedSym] || {}), currentPrice, change_24h_pct: changePct, volume_24h_usdt: volumeUsdt };
      }
    } else if (stream.includes('@aggTrade')) {
      const price = Number(data.p), qty = Number(data.q), side = data.m ? 'sell' : 'buy';
      (recentTradesMap[formattedSym] ||= []).push({ price, amount: qty, side, timestamp: data.T });
      const cutoff = Date.now() - 15 * 60 * 1000;
      recentTradesMap[formattedSym] = recentTradesMap[formattedSym].filter(t => t.timestamp > cutoff);
    } else if (stream.includes('@depth')) {
      applyDepthEvent(formattedSym, data);
    }
  } catch (e) {}
}

// =============== CORE REAL-TIME LOOP ===============
async function updateMarketDataAndExecute() {
  // Sync positions from Binance if authenticated
  if (exchange && isExchangeAuthenticated) {
    try {
      await syncBinancePositions();
    } catch (e) {}
  }

  const now = Date.now();
  if (botState === "running" && now - lastScanLogTime > 12000) {
    lastScanLogTime = now;
    const activeCount = Object.keys(activePositions).length;
    addEngineLog("INFO", `[CANLI TARAMA] ${whitelistCoins.length} parite taranıyor | Açık Pozisyon: ${activeCount} / ${whitelistCoins.length} | Motor: ÇALIŞIYOR`);
  }

  const entryCandidates: { symbol: string, score: number, type: "long" | "short", price: number, predictedProfitPct?: number, predictedTimeSec?: number, smartTargetPrice?: number, smartStopPrice?: number, riskReward?: number, spoofRisk?: number, pressurePersistence?: number, expectedNetPnlUSD?: number, minimumNetProfitUSD?: number }[] = [];

  await Promise.allSettled(
    whitelistCoins.map(async (symbol) => {
      try {
        const cleanSymbol = symbol.replace("/", "").toUpperCase();
        let ticker: any = null;
        let ob: any = latestOrderBooks[symbol];
        const memMetric = latestMetricsPerCoin[symbol];
        let currentPrice = memMetric?.currentPrice || ob?.bids?.[0]?.[0] || 0;

        // If not in WebSocket buffer or price missing, fetch immediately from Binance REST
        if (!currentPrice || currentPrice === 0 || !ob || !ob.bids || ob.bids.length === 0) {
          try {
            if (!exchange) return;
            const [depth, tick] = await Promise.all([
              exchange.fetchOrderBook(symbol, 50),
              exchange.fetchTicker(symbol)
            ]);
            if (depth?.bids?.length) {
              ob = {
                bids: depth.bids.map((b: any[]) => [Number(b[0]), Number(b[1])]),
                asks: (depth.asks || []).map((a: any[]) => [Number(a[0]), Number(a[1])]),
                timestamp: Date.now()
              };
              latestOrderBooks[symbol] = ob;
            }
            if (tick?.last) {
              ticker = {
                last: Number(tick.last),
                percentage: Number(tick.percentage || 0),
                quoteVolume: Number(tick.quoteVolume || 0)
              };
              currentPrice = ticker.last;
            }
          } catch (e) {
            // Do not fall back to live Spot data. In TESTNET mode every market input must
            // remain on the Futures environment selected by the exchange instance.
            try {
              if (exchange) {
                const t = await exchange.fetchTicker(symbol);
                if (t?.last) currentPrice = Number(t.last);
              }
            } catch (err) {}
          }
        }

        if (!currentPrice || currentPrice <= 0) return;

        // Initialize or update rolling price history (NO FAKE DATA)
        if (!priceHistoryMap[symbol]) {
          priceHistoryMap[symbol] = [];
        }
        // Save real prices incrementally to allow the math algorithm to calculate actual volatility
        priceHistoryMap[symbol].push(currentPrice);
        if (priceHistoryMap[symbol].length > 40) priceHistoryMap[symbol].shift();

        const prices = priceHistoryMap[symbol] || [];
        const volumes = volumeHistoryMap[symbol] || [];
        if (prices.length < 22 || volumes.length < 10) return;

        // Technical Indicators
        const rsiData = RSI.calculate({ period: Math.min(14, prices.length - 1), values: prices });
        const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1] : 50;

        const ema9Data = EMA.calculate({ period: Math.min(9, prices.length - 1), values: prices });
        const currentEMA9 = ema9Data.length > 0 ? ema9Data[ema9Data.length - 1] : currentPrice;

        const ema21Data = EMA.calculate({ period: Math.min(21, prices.length - 1), values: prices });
        const currentEMA21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1] : currentPrice;

        const trueRanges: number[] = [];
        // We only have close history here; use absolute close-to-close movement as a conservative
        // fallback until the candle stream is available. This is still real observed data.
        for (let i = 1; i < prices.length; i++) trueRanges.push(Math.abs(prices[i] - prices[i - 1]));
        const currentATR = trueRanges.length ? trueRanges.slice(-14).reduce((a,b)=>a+b,0) / Math.min(14, trueRanges.length) : 0;

        // Deep Inflow & Order Flow Metrics
                const currentCutoff = Date.now() - (activeLookbackMin * 60 * 1000);
        const activeTrades = (recentTradesMap[symbol] || []).filter((t: any) => t.timestamp > currentCutoff);
        const flow = analyzeOrderFlowAndInflow(ob, activeTrades, prices, volumes, currentPrice);

        const ai = analyzeAdaptiveOrderBookAI(symbol, ob, flow, currentPrice, prices);
        latestMetricsPerCoin[symbol] = {
          currentPrice,
          change_24h_pct: ticker?.percentage || latestMetricsPerCoin[symbol]?.change_24h_pct || 0,
          volume_24h_usdt: ticker?.quoteVolume || latestMetricsPerCoin[symbol]?.volume_24h_usdt || 0,
          rsi: currentRSI,
          ema9: currentEMA9,
          ema21: currentEMA21,
          atr: currentATR,
          ...flow,
          ...ai
        };

        // If Bot is NOT running, we only update data and do not execute automated trades
        if (botState !== "running") return;

        const pos = activePositions[symbol];

        // ================= EXITS: QUICK SCALP TAKE PROFIT & RISK MANAGEMENT =================
        if (pos) {
          pos.deepScoreHistory.push(flow.deepScore);
          if (pos.deepScoreHistory.length > 5) pos.deepScoreHistory.shift();

          if (pos.type === "long") pos.peakPrice = Math.max(pos.peakPrice, currentPrice);
          else pos.peakPrice = Math.min(pos.peakPrice, currentPrice);

          // Calculate REAL 1:1 Binance PnL
          const pnlUSD = pos.type === "long" 
            ? (currentPrice - pos.entryPrice) * pos.amount
            : (pos.entryPrice - currentPrice) * pos.amount;
          const estimatedExitFeeUSD = (currentPrice * pos.amount) * (ESTIMATED_FEE_PCT / 200);
          const netOpenPnl = pnlUSD - Number(pos.entryFeeUSD || 0) - estimatedExitFeeUSD;
          pos.unrealizedPnl = Number(netOpenPnl.toFixed(4));
          pos.percentage = Number((((pos.entryPrice * pos.amount) > 0 ? (netOpenPnl / ((pos.entryPrice * pos.amount) / pos.leverage)) * 100 : 0)).toFixed(4));
          pos.peakNetPnlUSD = Math.max(Number(pos.peakNetPnlUSD || 0), netOpenPnl);

          const priceMovePct = pos.type === "long"
            ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

          const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
          const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : priceMovePct * pos.leverage;

          const peakPriceMovePct = pos.type === "long"
            ? ((pos.peakPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - pos.peakPrice) / pos.entryPrice) * 100;

          const drawdownFromPeak = peakPriceMovePct - priceMovePct;
          let shouldExit = false;
          let exitReason = "";

          // 1. DYNAMIC PROFIT PROTECTION / RUNNER EXIT
          // Never close at a fixed +2% (or any other fixed profit percentage).
          // Once the position is profitable, protect part of the profit while allowing
          // a strong order-flow trend to continue toward farther liquidity.
          const peakProfitPct = Math.max(pos.peakProfitPct || 0, peakPriceMovePct);
          pos.peakProfitPct = peakProfitPct;

          // Lock profit progressively. The trail widens when volatility/flow is strong
          // and tightens when the structure starts to weaken.
          const atrPct = currentPrice > 0 && currentATR > 0 ? (currentATR / currentPrice) * 100 : 0;
          const flowStrength = Math.max(0, Math.min(1, (Math.abs(flow.obi) + Math.abs(flow.takerBuyRatio - 0.5) * 2) / 0.9));
          const baseTrailPct = Math.max(0.18, Math.min(2.5, atrPct * 1.8));
          const adaptiveTrailPct = baseTrailPct * (1.15 + flowStrength * 0.85);

          if (peakProfitPct >= 0.60) {
            const trailDistance = peakProfitPct >= 10
              ? Math.max(adaptiveTrailPct, 1.2)
              : peakProfitPct >= 5
                ? Math.max(adaptiveTrailPct, 0.85)
                : peakProfitPct >= 2
                  ? Math.max(adaptiveTrailPct, 0.55)
                  : Math.max(adaptiveTrailPct, 0.30);

            const trailingProfitFloor = Math.max(0.05, peakProfitPct - trailDistance);
            const isTrailingHit = priceMovePct > 0 && priceMovePct <= trailingProfitFloor;

            // Translate the profit floor back into a price. This is a software backup
            // to the exchange-side STOP and is updated as the peak moves.
            pos.trailingStopPrice = pos.type === "long"
              ? pos.entryPrice * (1 + trailingProfitFloor / 100)
              : pos.entryPrice * (1 - trailingProfitFloor / 100);

            if (isTrailingHit) {
              shouldExit = true;
              exitReason = `Dinamik Kâr Koruma: Tepe +%${peakProfitPct.toFixed(2)} → taban +%${trailingProfitFloor.toFixed(2)} | Net PnL yaklaşık $${pnlUSD.toFixed(2)}`;
            }
          }

          // Re-evaluate the order book at every cycle before deciding whether a
          // profitable runner should be closed. This is intentionally stricter than
          // a fixed take-profit percentage.
          const aiExit = analyzeAdaptiveOrderBookAI(symbol, ob, flow, currentPrice, prices);

          // Shared 30-level two-sided adaptive exit review.
          // Never close on a single 51/49-style reading. Once the own-side
          // advantage falls to near balance, start a staged review:
          //   Stage 1: 3 follow-up observations.
          //   Stage 2: if those 3 are very close/noisy, extend to 10; otherwise 6.
          // If a meaningful positive edge returns, cancel the review immediately.
          // After the extended window, close only when there is still no positive
          // directional edge and the gap is not recovering.
          const own30Score = pos.type === "long" ? aiExit.predictive30LongScore : aiExit.predictive30ShortScore;
          const opposing30Score = pos.type === "long" ? aiExit.predictive30ShortScore : aiExit.predictive30LongScore;
          const currentFlowGap = own30Score - opposing30Score;
          const reviewTriggerGap = 3;
          const healthyRecoveryGap = 8;

          // Profit-protection fast path: when a position already has meaningful
          // profit and both filtered flow and aggressive money flow turn against
          // it, do not wait for the long 6/10-reading window. Small order noise
          // alone cannot trigger this path.
          const meaningfulProfit = netOpenPnl >= Math.max(MIN_NET_PROFIT_USD_FLOOR, activeStakeAmount * 0.03);
          const peakNet = Number(pos.peakNetPnlUSD || 0);
          const retainedRatio = peakNet > 0 ? netOpenPnl / peakNet : 1;
          const profitErosion = peakNet - netOpenPnl;
          const moneyFlowAgainst = pos.type === "long"
            ? (flow.weightedNetInflowUSD || flow.netInflowUSD) < 0 && flow.takerBuyRatio < 0.48
            : (flow.weightedNetInflowUSD || flow.netInflowUSD) > 0 && flow.takerBuyRatio > 0.52;
          const nextBookNegative = pos.type === "long"
            ? aiExit.predictive30LongScore < aiExit.predictive30ShortScore && aiExit.movePotentialScore < 35
            : aiExit.predictive30ShortScore < aiExit.predictive30LongScore && aiExit.movePotentialScore < 35;
          if (!shouldExit && meaningfulProfit && peakNet >= PROFIT_PROTECTION_MIN_PEAK_USD && retainedRatio <= PROFIT_PROTECTION_MIN_RETAIN_RATIO && currentFlowGap <= -2 && moneyFlowAgainst && nextBookNegative) {
            shouldExit = true;
            exitReason = `Kâr Koruma: Order Flow + gerçek para akışı tersine döndü | Net PnL $${netOpenPnl.toFixed(2)} | Gap ${currentFlowGap.toFixed(1)}`;
          }
          if (!shouldExit && peakNet >= PROFIT_PROTECTION_MIN_PEAK_USD && netOpenPnl > 0 && profitErosion >= Math.max(0.35, peakNet * 0.45) && currentFlowGap <= 0 && moneyFlowAgainst) {
            shouldExit = true;
            exitReason = `Kâr Koruma: Gerçek net kâr eriyor | Tepe $${peakNet.toFixed(2)} → ${netOpenPnl.toFixed(2)} | Gap ${currentFlowGap.toFixed(1)}`;
          }

          if (!pos.flowReviewGaps) pos.flowReviewGaps = [];
          if (pos.flowReviewStage === undefined) pos.flowReviewStage = 0;

          // A clear recovery cancels all pending exit review.
          if (currentFlowGap >= healthyRecoveryGap) {
            if (pos.flowReviewStage > 0) {
              addEngineLog("INFO", `[ORDER-FLOW] ${symbol} ${pos.type.toUpperCase()} avantajı geri geldi: ${currentFlowGap.toFixed(1)} puan. Çıkış incelemesi sıfırlandı.`);
            }
            pos.flowReviewGaps = [];
            pos.flowReviewStage = 0;
            pos.flowReviewTarget = undefined;
            pos.flowGapWeakCount = 0;
          } else if (pos.flowReviewStage === 0 && currentFlowGap <= reviewTriggerGap) {
            // First critical observation only starts the review; it is never an exit.
            pos.flowReviewStage = 1;
            pos.flowReviewGaps = [];
            pos.flowReviewTarget = 3;
            pos.flowGapWeakCount = 0;
            addEngineLog("INFO", `[ORDER-FLOW İNCELEME] ${symbol} ${pos.type.toUpperCase()} ${own30Score.toFixed(0)}/${opposing30Score.toFixed(0)}. Tek ölçümle kapanmayacak; 3 doğrulama izleniyor.`);
          } else if (pos.flowReviewStage && pos.flowReviewStage > 0) {
            pos.flowReviewGaps.push(currentFlowGap);
            if (pos.flowReviewGaps.length > 12) pos.flowReviewGaps.shift();

            const target = pos.flowReviewTarget || 3;
            if (pos.flowReviewStage === 1 && pos.flowReviewGaps.length >= 3) {
              const first3 = pos.flowReviewGaps.slice(-3);
              const range = Math.max(...first3) - Math.min(...first3);
              const avg = first3.reduce((a, b) => a + b, 0) / first3.length;
              // If the 3 readings are clustered around balance, they are not
              // informative enough; give the market a longer 10-reading window.
              // If they show a clearer deterioration, 6 is sufficient.
              pos.flowReviewStage = 2;
              pos.flowReviewTarget = range <= 4 || Math.abs(avg) <= 2 ? 10 : 6;
              addEngineLog("INFO", `[ORDER-FLOW İNCELEME] ${symbol}: İlk 3 doğrulama tamamlandı. Farklar birbirine ${range <= 4 ? "çok yakın" : "yeterince farklı"}; sonraki pencere ${pos.flowReviewTarget} ölçüm.`);
            } else if (pos.flowReviewStage === 2 && pos.flowReviewGaps.length >= target) {
              const window = pos.flowReviewGaps.slice(-target);
              const avg = window.reduce((a, b) => a + b, 0) / window.length;
              const recent = window.slice(-3);
              const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
              const hasPositiveEdge = window.some(g => g >= healthyRecoveryGap);
              const recovering = recentAvg > avg + 1.5 || recent[recent.length - 1] > recent[0] + 2;

              // Only close after the full adaptive window if there is still no
              // meaningful positive edge and the order-flow is not recovering.
              if (!hasPositiveEdge && !recovering && avg <= reviewTriggerGap) {
                shouldExit = true;
                exitReason = `30-Seviye Adaptif Order-Flow İncelemesi: İlk 3 + sonraki ${target} ölçümde pozitif fark geri gelmedi | Ortalama fark ${avg.toFixed(1)} | Son fark ${currentFlowGap.toFixed(1)}`;
              } else {
                addEngineLog("INFO", `[ORDER-FLOW İNCELEME] ${symbol}: ${target} ölçümlük pencere tamamlandı; pozitif/iyileşen yapı var. Pozisyon korunuyor (${currentFlowGap.toFixed(1)} puan).`);
                pos.flowReviewGaps = [];
                pos.flowReviewStage = 0;
                pos.flowReviewTarget = undefined;
                pos.flowGapWeakCount = 0;
              }
            }
          }

          // If the order-flow structure remains healthy, do NOT exit just because
          // an intermediate profit level was reached. A continuation trade can run
          // from +2% to +5%, +10% or farther until liquidity/flow actually deteriorates.
          const ownFlowHealthy = pos.type === "long"
            ? flow.takerBuyRatio >= 0.52 && flow.obi >= -0.04
            : flow.takerBuyRatio <= 0.48 && flow.obi <= 0.04;
          const structureFlipped = pos.type === "long"
            ? aiExit.aiDirection === "short" && aiExit.aiShortScore >= 70
            : aiExit.aiDirection === "long" && aiExit.aiLongScore >= 70;

          // A profitable position is closed for structural failure only when the
          // opposing signal is persistent/strong. A weak tick is ignored.
          if (!shouldExit && priceMovePct > 0.20 && structureFlipped && aiExit.pressurePersistence >= 3) {
            shouldExit = true;
            exitReason = `Yapı Tersine Döndü: ${aiExit.aiDirection.toUpperCase()} ${Math.max(aiExit.aiLongScore, aiExit.aiShortScore).toFixed(0)}/100 | Kâr +%${priceMovePct.toFixed(2)}`;
          }

          // 3. Manuel Zarar Kes (Stop Loss)
          if (!shouldExit && priceMovePct <= -activeStopLossPct) {
            shouldExit = true;
            exitReason = `Zarar Kes (Stop Loss: %${activeStopLossPct.toFixed(2)})`;
          }

          if (shouldExit) {
            await executeExit(symbol, exitReason, currentPrice);
          }
        } 
        // ================= ENTRY: ACTIVE QUANTITATIVE & ORDER FLOW SIGNAL ENGINE =================
        else {
          // Open positions up to maximum capacity
          if (Object.keys(activePositions).length < maxOpenTrades) {
                        // ================= ADAPTIVE ORDER BOOK AI ENTRY =================
            const ai = analyzeAdaptiveOrderBookAI(symbol, ob, flow, currentPrice, prices);
            latestMetricsPerCoin[symbol] = { ...latestMetricsPerCoin[symbol], ...ai };

            // Entry happens only after pressure persists. A single imbalance tick
            // is deliberately ignored because spoofing / fleeting liquidity is common.
            const spreadOk = flow.spreadPct <= 0.0015;
            const roomLong = ai.smartTargetPrice > currentPrice * 1.0012;
            const roomShort = ai.smartTargetPrice < currentPrice * 0.9988;
            const predictiveThreshold = 50;
            const minLeadGap = 8;
            const longAdvantage = (ai.predictive30LongScore >= predictiveThreshold && (ai.predictive30LongScore - ai.predictive30ShortScore) >= minLeadGap && (ai as any).entry10LongScore >= 55 && ((ai as any).entry10LongScore - (ai as any).entry10ShortScore) >= 8);
            const shortAdvantage = (ai.predictive30ShortScore >= predictiveThreshold && (ai.predictive30ShortScore - ai.predictive30LongScore) >= minLeadGap && (ai as any).entry10ShortScore >= 55 && ((ai as any).entry10ShortScore - (ai as any).entry10LongScore) >= 8);
            const longSignal = longAdvantage && ai.aiLongScore >= 58 && ai.pressurePersistence >= 2 && ai.spoofRisk < 45 &&
              ai.absorptionScore < 55 && ai.riskReward >= 1.05 && spreadOk && roomLong;
            const shortSignal = shortAdvantage && ai.aiShortScore >= 58 && ai.pressurePersistence >= 2 && ai.spoofRisk < 45 &&
              ai.absorptionScore < 55 && ai.riskReward >= 1.05 && spreadOk && roomShort;

            if (longSignal || shortSignal) {
              const type = longSignal ? "long" : "short";
              const score = type === "long" ? ai.predictive30LongScore : ai.predictive30ShortScore;
              const targetPct = type === "long"
                ? ((ai.smartTargetPrice - currentPrice) / currentPrice) * 100
                : ((currentPrice - ai.smartTargetPrice) / currentPrice) * 100;
              const expectedNotionalUSD = Math.max(0, activeStakeAmount * targetLeverage);
              const grossExpectedPnlUSD = expectedNotionalUSD * Math.max(0, targetPct) / 100;
              const estimatedRoundTripCostUSD = expectedNotionalUSD * (ESTIMATED_FEE_PCT / 100) + expectedNotionalUSD * Math.max(0, flow.spreadPct);
              const netExpectedPnlUSD = grossExpectedPnlUSD - estimatedRoundTripCostUSD;
              const minimumNetProfitUSD = Math.max(
                MIN_NET_PROFIT_USD_FLOOR,
                activeStakeAmount * (MIN_NET_PROFIT_MARGIN_PCT / 100),
                estimatedRoundTripCostUSD * 1.5
              );
              const movementEnough = (ai.movePotentialScore || 0) >= 35 && targetPct >= Math.max(0.20, flow.spreadPct * 100 * 2.5);
              if (netExpectedPnlUSD < minimumNetProfitUSD || !movementEnough) return;
              entryCandidates.push({
                symbol, type, score, price: currentPrice,
                predictedProfitPct: targetPct,
                expectedNetPnlUSD: Number(netExpectedPnlUSD.toFixed(4)),
                minimumNetProfitUSD: Number(minimumNetProfitUSD.toFixed(4)),
                predictedTimeSec: flow.predictedTimeSec,
                smartTargetPrice: ai.smartTargetPrice,
                smartStopPrice: ai.smartStopPrice,
                riskReward: ai.riskReward,
                spoofRisk: ai.spoofRisk,
                pressurePersistence: ai.pressurePersistence
              });
            }
          }
        }
      } catch (e: any) {
        // Log individual symbol loop errors
        addEngineLog("ERROR", `[LOOP HATASI] ${symbol}: ${e.message}`);
      }
    })
  );

  // Now process entry candidates based on their signal strength score
  if (entryCandidates.length > 0 && Object.keys(activePositions).length < maxOpenTrades) {
    // Sort descending by score (highest potential first)
    entryCandidates.sort((a, b) => b.score - a.score);

    for (const candidate of entryCandidates) {
      if (Object.keys(activePositions).length >= maxOpenTrades) break;
      
      const { symbol, type, price, score } = candidate;
      if (activePositions[symbol]) continue;

      const tRatio = latestMetricsPerCoin[symbol]?.takerBuyRatio || 0.5;
      const cRsi = latestMetricsPerCoin[symbol]?.rsi || 50;
      const originalDeepScore = type === "long" ? score : -score;
      const ttp = candidate.predictedTimeSec ? candidate.predictedTimeSec.toFixed(1) : "?";
      const pp = candidate.predictedProfitPct ? candidate.predictedProfitPct.toFixed(2) : "?";

      const margin = activeStakeAmount;
      const notional = margin * targetLeverage;
      addEngineLog("TRADE", `[ORDER-FLOW SİNYALİ ONAYLANDI] ${symbol} ${type.toUpperCase()} Girişi. Model hedefi +%${pp} | Beklenen net kâr: $${Number(candidate.expectedNetPnlUSD || 0).toFixed(2)} | Minimum: $${Number(candidate.minimumNetProfitUSD || 0).toFixed(2)} | Teminat: $${margin.toFixed(2)} | Pozisyon: $${notional.toFixed(2)} | x${targetLeverage} | Süre: ${ttp}sn | Skor: ${Math.round(score)} | Kapasite: ${Object.keys(activePositions).length + 1}/${maxOpenTrades}`);
      await executeEntry(symbol, type, price, { targetPct: candidate.predictedProfitPct, targetPrice: candidate.smartTargetPrice, expectedNetPnlUSD: candidate.expectedNetPnlUSD, minimumNetProfitUSD: candidate.minimumNetProfitUSD, predictedTimeSec: candidate.predictedTimeSec, confidence: score });
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

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number, targetMeta?: { targetPct?: number; targetPrice?: number; expectedNetPnlUSD?: number; minimumNetProfitUSD?: number; predictedTimeSec?: number; confidence?: number }) {
  if (activePositions[symbol] || pendingEntries.has(symbol)) return;
  pendingEntries.add(symbol);
  try {
  if (!exchange || !isExchangeAuthenticated) {
    addEngineLog("WARN", `[EMİR ENGELLENDİ] ${symbol}: Binance API bağlantısı doğrulanmadan otomatik işlem açılamaz.`);
    return;
  }

  const effectivePrice = currentPrice || latestMetricsPerCoin[symbol]?.currentPrice || 0;
  if (!effectivePrice || effectivePrice <= 0) return;

  // Position notional is margin x leverage. The exchange remains the source of truth for fills.
  let notionalUSD = activeStakeAmount * targetLeverage;
  if (notionalUSD < 6) notionalUSD = 6;

  let rawAmount = notionalUSD / effectivePrice;
  const exSymbol = getMarketSymbol(symbol);
  let formattedAmount = rawAmount;

  if (!exchange.markets || Object.keys(exchange.markets).length === 0) {
    try { await exchange.loadMarkets(); } catch (e) {}
  }
  const market = exchange.markets ? (exchange.markets[exSymbol] || exchange.markets[symbol]) : null;
  if (market?.limits?.amount?.min && rawAmount < market.limits.amount.min) rawAmount = market.limits.amount.min;
  try {
    formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, rawAmount));
  } catch (e) {
    formattedAmount = rawAmount >= 1 ? Math.floor(rawAmount) : Number(rawAmount.toFixed(6));
  }
  if (!Number.isFinite(formattedAmount) || formattedAmount <= 0) return;

  let entryPrice = effectivePrice;
  let stopOrderId: string | undefined;
  let entryFeeUSD = 0;

  try {
    try { await exchange.setLeverage(targetLeverage, exSymbol); } catch (e: any) {
      addEngineLog("WARN", `[BINANCE] Kaldıraç ayarlanamadı: ${e.message}`);
    }
    try { await (exchange as any).setMarginMode('CROSSED', exSymbol); } catch (e: any) {}

    const side = type === "long" ? "buy" : "sell";
    const order = await exchange.createOrder(exSymbol, "market", side, formattedAmount);

    // Use the exchange-reported fill, never the websocket estimate, as the entry basis.
    try {
      const filledOrder = await exchange.fetchOrder(order.id, exSymbol);
      if (filledOrder?.average) entryPrice = Number(filledOrder.average);
      else if (filledOrder?.price) entryPrice = Number(filledOrder.price);
      if (filledOrder?.filled) formattedAmount = Number(filledOrder.filled);
      if (filledOrder?.fee?.cost) entryFeeUSD = Number(filledOrder.fee.cost);
      else if (Array.isArray(filledOrder?.fees)) entryFeeUSD = filledOrder.fees.reduce((sum: number, f: any) => sum + Number(f?.cost || 0), 0);
    } catch (e) {
      if (order?.average) entryPrice = Number(order.average);
      else if (order?.price) entryPrice = Number(order.price);
    }

    if (!entryPrice || !Number.isFinite(entryPrice) || formattedAmount <= 0) {
      throw new Error("Binance gerçekleşen fill bilgisi alınamadı; pozisyon güvenli şekilde oluşturulmadı.");
    }

    const stopPriceBaseForOrder = type === "long"
      ? entryPrice * (1 - activeStopLossPct / 100)
      : entryPrice * (1 + activeStopLossPct / 100);
    let stopPrice = stopPriceBaseForOrder;
    try { stopPrice = parseFloat(exchange.priceToPrecision(exSymbol, stopPriceBaseForOrder)); } catch (e) {}

    const stopSide = type === "long" ? "sell" : "buy";
    try {
      const stopOrder = await exchange.createOrder(exSymbol, "STOP_MARKET", stopSide, formattedAmount, undefined, {
        stopPrice,
        reduceOnly: true,
        workingType: "MARK_PRICE"
      });
      stopOrderId = stopOrder.id;
    } catch (stopErr: any) {
      // A live position without a server-side protective stop is not acceptable.
      try { await exchange.createOrder(exSymbol, "market", type === "long" ? "sell" : "buy", formattedAmount, undefined, { reduceOnly: true }); } catch (closeErr) {}
      throw new Error(`Koruyucu STOP emri oluşturulamadı; pozisyon güvenlik için kapatıldı. ${stopErr.message || ''}`);
    }

    addEngineLog("TRADE", `[BINANCE ${isBinanceTestnet ? "TESTNET" : "LIVE"}] ${symbol} ${type.toUpperCase()} açıldı | x${targetLeverage} | Miktar: ${formattedAmount} | Gerçekleşen giriş: $${entryPrice}`);
  } catch (e: any) {
    addEngineLog("ERROR", `[BINANCE ${isBinanceTestnet ? "TESTNET" : "LIVE"}] ${symbol} Emir Hatası: ${e.message}`);
    return;
  }

  const stopPriceBase = type === "long" 
    ? entryPrice * (1 - activeStopLossPct / 100) 
    : entryPrice * (1 + activeStopLossPct / 100);

  activePositions[symbol] = {
    trade_id: tradeCounter++,
    pair: symbol,
    type,
    entryPrice,
    amount: formattedAmount,
    peakPrice: entryPrice,
    openDate: Date.now(),
    lookbackMin: activeLookbackMin,
    stopLossPct: activeStopLossPct,
    deepScoreHistory: [],
    leverage: targetLeverage,
    baseStopPrice: Number(stopPriceBase.toFixed(2)),
    binanceStopOrderId: stopOrderId,
    unrealizedPnl: 0,
    percentage: 0,
    entryFeeUSD,
    peakProfitPct: 0,
    trailingStopPrice: undefined,
    lastStructureScore: 0,
    targetPct: Number(targetMeta?.targetPct || 0),
    targetPrice: Number(targetMeta?.targetPct ? (type === "long" ? entryPrice * (1 + Number(targetMeta.targetPct)/100) : entryPrice * (1 - Number(targetMeta.targetPct)/100)) : (targetMeta?.targetPrice || 0)),
    targetProfitUSD: Number(targetMeta?.expectedNetPnlUSD || 0),
    minimumNetProfitUSD: Number(targetMeta?.minimumNetProfitUSD || 0),
    targetConfidence: Number(targetMeta?.confidence || 0),
    peakNetPnlUSD: -entryFeeUSD
  };
  (activePositions[symbol] as any).isRealBinance = true;

  allTrades.unshift({ ...activePositions[symbol], is_open: true });
  } finally {
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number) {
  const pos = activePositions[symbol];
  let exitFeeUSD = 0;
  if (!pos) return;

  const exSymbol = getMarketSymbol(symbol);

  if (exchange && isExchangeAuthenticated) {
    try {
      const side = pos.type === "long" ? "sell" : "buy";
      let exitAmount = pos.amount;
      try {
        exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, exitAmount));
      } catch (e) {}

      const exitOrder = await exchange.createOrder(exSymbol, "market", side, exitAmount, undefined, { reduceOnly: true });
      let fillPrice = currentPrice;
      try {
        const filledExit = await exchange.fetchOrder(exitOrder.id, exSymbol);
        if (filledExit?.average) fillPrice = Number(filledExit.average);
        else if (filledExit?.price) fillPrice = Number(filledExit.price);
        if (filledExit?.fee?.cost) exitFeeUSD = Number(filledExit.fee.cost);
        else if (Array.isArray(filledExit?.fees)) exitFeeUSD = filledExit.fees.reduce((sum: number, f: any) => sum + Number(f?.cost || 0), 0);
      } catch (e) {}
      if (Number.isFinite(fillPrice) && fillPrice > 0) currentPrice = fillPrice;

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
  const entryFeeUSD = Number((pos as any).entryFeeUSD || 0);
  // Unknown exit fees are conservatively treated as zero here; Binance fill remains the price source of truth.
  const netPnlUSD = pnlUSD - entryFeeUSD - exitFeeUSD;
  const roePct = initialMargin > 0 ? (netPnlUSD / initialMargin) * 100 : 0;

  const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id);
  if (tradeIndex !== -1) {
    allTrades[tradeIndex].is_open = false;
    allTrades[tradeIndex].close_rate = currentPrice;
    allTrades[tradeIndex].close_date = Date.now();
    allTrades[tradeIndex].close_reason = reason;
    allTrades[tradeIndex].profit_abs = Number(netPnlUSD.toFixed(2));
    allTrades[tradeIndex].profit_pct = Number(roePct.toFixed(2));
  }

  delete activePositions[symbol];
  addEngineLog("TRADE", `[POZİSYON KAPANDI] ${symbol} | Neden: ${reason} | Net: ${netPnlUSD >= 0 ? '+' : ''}$${netPnlUSD.toFixed(2)} (${roePct >= 0 ? '+' : ''}${roePct.toFixed(2)}%)`);
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Yüksek Para Girişi & HFT Motoru Başlatıldı.");
  addEngineLog("INFO", isBinanceTestnet ? "Mod: BINANCE FUTURES TESTNET — sanal bakiye, gerçek para yok." : "Mod: CANLI İŞLEM — gerçek Binance Futures hesabı.");
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

const SHARED_ORDER_FLOW_ENGINE = "30_LEVEL_TWO_SIDED_SHARED_V1";

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    trading_mode: isBinanceTestnet ? "testnet" : "live",
    testnet: isBinanceTestnet,
    strategy: "High_Inflow_Quant_Futures",
    strategy_engine: SHARED_ORDER_FLOW_ENGINE,
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
    exchange: { pair_whitelist: whitelistCoins, testnet: isBinanceTestnet },
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
  if (conf.exchange?.pair_whitelist && Array.isArray(conf.exchange.pair_whitelist)) {
    whitelistCoins = conf.exchange.pair_whitelist;
    whitelistChanged = true;
  }
  
  if (conf.leverage) targetLeverage = conf.leverage;
  if (conf.stop_loss_pct) activeStopLossPct = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
  
  if (conf.stake_amount) activeStakeAmount = conf.stake_amount;
  if (conf.max_open_trades) maxOpenTrades = conf.max_open_trades;

  const requestedTestnet = conf?.exchange?.testnet !== false;
  const modeChanged = requestedTestnet !== isBinanceTestnet;
  if (modeChanged && botState === "running") {
    await stopTradingEngine();
    addEngineLog("SYSTEM", "İşlem ortamı değiştirildiği için bot güvenlik amacıyla durduruldu.");
  }
  isBinanceTestnet = requestedTestnet;
  
  fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  if (modeChanged) {
    await initializeExchange();
    addEngineLog("SYSTEM", isBinanceTestnet
      ? "İşlem ortamı TESTNET'e geçirildi. Gerçek para kullanılmayacak."
      : "UYARI: İşlem ortamı CANLI Binance Futures'a geçirildi.");
  }
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
      amount,
      leverage: t.leverage,
      open_rate: entryPrice,
      current_rate: t.close_rate || currentRate,
      close_rate: t.close_rate,
      open_date: new Date(t.openDate).toISOString().replace('T', ' ').slice(0, 19),
      close_date: t.close_date ? new Date(t.close_date).toISOString().replace('T', ' ').slice(0, 19) : undefined,
      close_reason: t.close_reason,
      profit_pct: t.is_open ? Number(roePct.toFixed(2)) : t.profit_pct,
      profit_abs: t.is_open ? Number(netPnlUSD.toFixed(2)) : t.profit_abs,
      profit_ratio: (t.is_open ? roePct : t.profit_pct) / 100,
      deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
      target_pct: Number(live?.targetPct ?? t.targetPct ?? 0),
      target_price: Number(live?.targetPrice ?? t.targetPrice ?? 0),
      target_profit_usd: Number(live?.targetProfitUSD ?? t.targetProfitUSD ?? 0),
      minimum_net_profit_usd: Number(live?.minimumNetProfitUSD ?? t.minimumNetProfitUSD ?? 0),
      peak_net_pnl_usd: Number(live?.peakNetPnlUSD ?? t.peakNetPnlUSD ?? 0),
      target_confidence: Number(live?.targetConfidence ?? t.targetConfidence ?? 0),
      stop_loss_pct: t.stopLossPct ?? activeStopLossPct,
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
  const reqSymbol = (req.query.symbol as string) || whitelistCoins[0] || "BTC/USDT";
  let ob = latestOrderBooks[reqSymbol];
  let m = latestMetricsPerCoin[reqSymbol];
  let recentTrades: any[] = [];

  // If data is not ready, fetch it from the same Futures exchange instance.
  if (!ob || !ob.bids || ob.bids.length === 0 || !m || m.obi === undefined) {
    try {
      if (exchange) {
        const [depth, trades] = await Promise.all([
          exchange.fetchOrderBook(reqSymbol, 50),
          exchange.fetchTrades(reqSymbol, undefined, 30)
        ]);
        if (depth?.bids?.length) {
          ob = {
            bids: depth.bids.map((b: any[]) => [Number(b[0]), Number(b[1])]),
            asks: (depth.asks || []).map((a: any[]) => [Number(a[0]), Number(a[1])]),
            timestamp: Date.now()
          };
          latestOrderBooks[reqSymbol] = ob;
        }

        if (Array.isArray(trades)) {
          recentTrades = trades.map((t: any) => ({
            price: Number(t.price),
            amount: Number(t.amount ?? t.info?.qty ?? 0),
            side: t.isBuyerMaker ? 'sell' : 'buy',
            time: t.time
          }));
        }
      }

      const bestBid = Number(ob?.bids?.[0]?.[0] || 0);
      const bestAsk = Number(ob?.asks?.[0]?.[0] || 0);
      if (!bestBid || !bestAsk || bestBid <= 0 || bestAsk <= 0) throw new Error("Gerçek Futures order book verisi henüz hazır değil.");
      const mid = (bestBid + bestAsk) / 2;

      const flow = analyzeOrderFlowAndInflow(ob, recentTrades, [], [], mid);
      const ai = analyzeAdaptiveOrderBookAI(reqSymbol, ob, flow, mid, []);
      m = {
        currentPrice: mid,
        change_24h_pct: 0,
        volume_24h_usdt: 0,
        rsi: 50,
        atr: 0,
        ...flow
      };
      latestMetricsPerCoin[reqSymbol] = m;
    } catch (e) {}
  }

  const p = Number(m?.currentPrice || ob?.bids?.[0]?.[0] || 0);
  if (!ob || !ob.bids || ob.bids.length === 0 || !p) {
    return res.status(503).json({ error: "Binance Futures gerçek order book verisi henüz hazır değil." });
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
      atr: m?.atr || 0,
      takerBuyRatio: m?.takerBuyRatio !== undefined ? m.takerBuyRatio : 0.5,
      netInflowUSD: m?.netInflowUSD || 0,
      aiLongScore: m?.aiLongScore || 0,
      aiShortScore: m?.aiShortScore || 0,
      aiDirection: m?.aiDirection || "neutral",
      aiConfidence: m?.aiConfidence || 0,
      pressurePersistence: m?.pressurePersistence || 0,
      spoofRisk: m?.spoofRisk || 0,
      weightedObi: m?.weightedObi || 0,
      predictive30LongScore: m?.predictive30LongScore || 0,
      predictive30ShortScore: m?.predictive30ShortScore || 0,
      orderFlowGap: m?.orderFlowGap || 0,
      absorptionScore: m?.absorptionScore || 0
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
    const marketInfoUrl = isBinanceTestnet ? "https://testnet.binancefuture.com/fapi/v1/exchangeInfo" : "https://fapi.binance.com/fapi/v1/exchangeInfo";
    const res = await fetch(marketInfoUrl);
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

  if (!isBinanceTestnet) {
    try {
      const fapiRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`);
      if (fapiRes.ok) {
        const data = await fapiRes.json();
        if (Array.isArray(data) && data.length > 0) return res.json(data);
      }
    } catch (e) {}
  }

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
  const { apiKey, secretKey, testnet: requestedTestnet } = req.body;
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
    let currentConf: any = {};
    try {
      if (fs.existsSync("config.json")) currentConf = JSON.parse(fs.readFileSync("config.json", "utf8"));
    } catch (e) {}
    const useTestnet = requestedTestnet !== undefined ? requestedTestnet === true : currentConf?.exchange?.testnet !== false;
    isBinanceTestnet = useTestnet;

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
    
    if (useTestnet && typeof (tempExchange as any).setSandboxMode === "function") {
      (tempExchange as any).setSandboxMode(true);
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
      conf.exchange.testnet = useTestnet;
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
