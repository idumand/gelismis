import express from "express";
import path from "path";
import fs from "fs";
import ccxt from "ccxt";
import { WebSocket as WsClient } from "ws";
import { RSI, MACD, BollingerBands, ATR, SMA, EMA } from "technicalindicators";
import { createServer as createViteServer } from "vite";
import { AdaptiveLogisticAI, extractAIFeatures, AITradeSample } from "./src/ai-learning.ts";
import { originalV7EntryGate } from "./src/original-engine-snapshot.ts";

const app = express();
const rawPort = Number(process.env.PORT || 3000);
const PORT = Number.isFinite(rawPort) && rawPort > 0 && rawPort < 65536 ? Math.floor(rawPort) : 3000;

// =============== STATE & CONFIG ===============
let botState = "stopped";
let dataLoop: NodeJS.Timeout | null = null;
let lastLogId = 0;
const engineLogs: any[] = [];
const pendingEntries = new Set<string>();
const pendingExits = new Set<string>();
const hedgeConflictSymbols = new Set<string>();
let serverIp = "Tespit ediliyor...";
let lastIpFetchTime = 0;

let exchange: ccxt.Exchange | null = null;
let targetLeverage = 15;
let tradeCounter = 1;

let isExchangeAuthenticated = false;
let binanceHedgeMode = false;
let blacklistCoins: string[] = [];
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
let tradingSource: "manual" | "auto" = "auto";
const AUTO_UNIVERSE_SIZE = 120;
let autoScanUniverse: string[] = [];
let dataLoopRunning = false;
let activeStopLossPct = 1.5;
let activeLookbackMin: 1 | 3 | 5 | 15 = 1;
let activeStakeAmount = 25;
let maxOpenTrades = 1;
const tradesPath = path.resolve(process.cwd(), "data", "argos_trades.json");

// =============== ADAPTIVE LEARNING AI ===============
const aiJournalPath = path.resolve(process.cwd(), "data", "argos_ai_trades.json");
let aiJournal: AITradeSample[] = [];
let adaptiveAI = new AdaptiveLogisticAI();
type EngineMode = "original" | "ai" | "shadow";
let engineMode: EngineMode = "ai";
const ORIGINAL_ENGINE_VERSION = "V7-LOCKED";
const engineModePath = path.resolve(process.cwd(), "data", "argos_engine_mode.json");
function loadEngineMode(){
  try {
    fs.mkdirSync(path.dirname(engineModePath), { recursive: true });
    if (fs.existsSync(engineModePath)) {
      const raw = JSON.parse(fs.readFileSync(engineModePath, "utf8"));
      if (["original", "ai", "shadow"].includes(raw?.mode)) engineMode = raw.mode;
    }
  } catch {}
}
function persistEngineMode(){
  try { fs.mkdirSync(path.dirname(engineModePath), { recursive: true }); fs.writeFileSync(engineModePath, JSON.stringify({ mode: engineMode, originalVersion: ORIGINAL_ENGINE_VERSION, originalLocked: true }, null, 2)); } catch {}
}
function loadAIJournal(){
  try {
    fs.mkdirSync(path.dirname(aiJournalPath), { recursive: true });
    if (fs.existsSync(aiJournalPath)) {
      const raw = JSON.parse(fs.readFileSync(aiJournalPath, "utf8"));
      if (Array.isArray(raw)) aiJournal = raw.filter(x => x && Number.isFinite(Number(x.label)));
    }
    const modelPath = path.resolve(process.cwd(), "data", "argos_ai_model.json");
    if (fs.existsSync(modelPath)) { try { adaptiveAI = new AdaptiveLogisticAI(JSON.parse(fs.readFileSync(modelPath,"utf8"))); } catch {} }
    if (aiJournal.length >= 20 && adaptiveAI.state.trainedSamples===0) adaptiveAI.fit(aiJournal);
  } catch (e:any) { addEngineLog?.("WARN", `[AI] Geçmiş veri yüklenemedi: ${e?.message || e}`); }
}
function persistAISample(sample: AITradeSample){
  aiJournal.push(sample);
  if (aiJournal.length > 10000) aiJournal = aiJournal.slice(-10000);
  try { fs.mkdirSync(path.dirname(aiJournalPath), { recursive: true }); fs.writeFileSync(aiJournalPath, JSON.stringify(aiJournal)); } catch {}
}
function persistTrades(){
  try {
    fs.mkdirSync(path.dirname(tradesPath), { recursive: true });
    fs.writeFileSync(tradesPath, JSON.stringify(allTrades, null, 2));
  } catch (e:any) {
    addEngineLog("WARN", `[TRADE STORE] İşlem geçmişi kaydedilemedi: ${e?.message || e}`);
  }
}

function loadTrades(){
  try {
    fs.mkdirSync(path.dirname(tradesPath), { recursive: true });
    if (!fs.existsSync(tradesPath)) return;
    const raw = JSON.parse(fs.readFileSync(tradesPath, "utf8"));
    if (Array.isArray(raw)) {
      allTrades.splice(0, allTrades.length, ...raw.filter((x:any)=>x && typeof x === "object").slice(-5000));
      const maxId = allTrades.reduce((m:any,t:any)=>Math.max(m, Number(t.trade_id)||0), 0);
      if (maxId >= tradeCounter) tradeCounter = maxId + 1;
    }
  } catch (e:any) {
    addEngineLog("WARN", `[TRADE STORE] İşlem geçmişi yüklenemedi: ${e?.message || e}`);
  }
}

function recordAITradeOutcome(trade:any){
  if (!trade || trade.aiLearned) return;
  const f = trade.aiEntryFeatures;
  if (!f) return;
  const pnl=Number(trade.profit_abs ?? 0);
  const sample:AITradeSample={ id:trade.trade_id, symbol:trade.pair, side:trade.type, label:pnl>0?1:0, pnl, timestamp:Number(trade.close_date||Date.now()), ...f };
  persistAISample(sample);
  trade.aiLearned=true;
  if (aiJournal.length >= 20) adaptiveAI.fit(aiJournal);
}
// User-configurable minimum expected market move, measured on a 1x basis.
let activeMinExpectedMovePct = 1;

const SETTINGS_DEFAULTS = {
  stakeAmount: 25,
  leverage: 15,
  maxOpenTrades: 1,
  stopLossPct: 1.5,
  minExpectedMovePct: 1,
};

function toFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(',', '.'));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function sanitizeConfig(input: any) {
  const conf = input && typeof input === 'object' ? { ...input } : {};
  conf.exchange = conf.exchange && typeof conf.exchange === 'object' ? { ...conf.exchange } : {};
  // GET /config intentionally does not expose secrets. Preserve stored credentials when a settings save omits them.
  try {
    if (fs.existsSync("config.json")) {
      const stored = JSON.parse(fs.readFileSync("config.json", "utf8"));
      const storedEx = stored?.exchange || {};
      if (!String(conf.exchange.key || '').trim() && String(storedEx.key || '').trim()) conf.exchange.key = storedEx.key;
      if (!String(conf.exchange.secret || '').trim() && String(storedEx.secret || '').trim()) conf.exchange.secret = storedEx.secret;
    }
  } catch {}
  conf.stake_amount = toFiniteNumber(conf.stake_amount, activeStakeAmount || SETTINGS_DEFAULTS.stakeAmount, 1, 1000000);
  conf.leverage = Math.round(toFiniteNumber(conf.leverage, targetLeverage || SETTINGS_DEFAULTS.leverage, 1, 125));
  conf.max_open_trades = Math.round(toFiniteNumber(conf.max_open_trades, maxOpenTrades || SETTINGS_DEFAULTS.maxOpenTrades, 1, 8));
  conf.stop_loss_pct = toFiniteNumber(conf.stop_loss_pct, activeStopLossPct || SETTINGS_DEFAULTS.stopLossPct, 0.1, 50);
  conf.min_expected_move_pct = toFiniteNumber(conf.min_expected_move_pct, activeMinExpectedMovePct || SETTINGS_DEFAULTS.minExpectedMovePct, 0.1, 20);
  conf.dry_run = false;
  const envValue = String(conf.exchange.environment || process.env.BINANCE_ENVIRONMENT || "demo").toLowerCase();
  if (!["live","testnet","demo","sandbox"].includes(envValue)) throw new Error(`Geçersiz Binance ortamı: ${envValue}`);
  conf.exchange.environment = envValue === "live" ? "live" : "demo";
  if (!Array.isArray(conf.exchange.pair_whitelist)) conf.exchange.pair_whitelist = whitelistCoins.slice();
  conf.exchange.pair_whitelist = [...new Set(conf.exchange.pair_whitelist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))];
  conf.exchange.pair_blacklist = Array.isArray(conf.exchange.pair_blacklist) ? [...new Set(conf.exchange.pair_blacklist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))] : [];
  return conf;
}

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
  orderFlowGapHistory?: number[];
  pnlHistory?: number[];
  peakNetPnl?: number;
  modelTargetPnlUSD?: number;
  modelTargetPrice?: number;
  modelTargetConfidence?: number;
  modelTargetAccuracySample?: number;
  modelTargetAccuracyRate?: number | null;
  leverage: number;
  baseStopPrice: number;
  binanceStopOrderId?: string;
  breakevenHit?: boolean;
  unrealizedPnl?: number;
  percentage?: number;
  aiEntryFeatures?: any;
  aiModelProbability?: number;
  aiDecision?: string;
  lastMarketUpdateAt?: number;
  exitOrderId?: string;
  exitFilledAmount?: number;
  exitFillPrice?: number;
}



const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];
loadTrades();

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};

interface LocalBookState {
  bids: Map<number, number>;
  asks: Map<number, number>;
  lastUpdateId: number;
  initialized: boolean;
  eventBuffer: any[];
  syncing: boolean;
  lastEventAt: number;
}
const localBooks: Record<string, LocalBookState> = {};

function getLocalBookState(symbol: string): LocalBookState {
  return localBooks[symbol] ||= { bids: new Map(), asks: new Map(), lastUpdateId: 0, initialized: false, eventBuffer: [], syncing: false, lastEventAt: 0 };
}

function mapToLevels(map: Map<number, number>, side: "bids"|"asks", limit=50) {
  return [...map.entries()]
    .filter(([,q]) => q > 0)
    .sort((a,b)=> side === "bids" ? b[0]-a[0] : a[0]-b[0])
    .slice(0, limit)
    .map(([p,q])=>[p,q]);
}

function publishLocalBook(symbol:string){
  const st=getLocalBookState(symbol);
  const bids=mapToLevels(st.bids,"bids",50);
  const asks=mapToLevels(st.asks,"asks",50);
  if(bids.length && asks.length){
    latestOrderBooks[symbol]={ bids, asks, timestamp:Date.now(), lastUpdateId:st.lastUpdateId, local:true };
  }
}

async function syncLocalBook(symbol:string){
  const st=getLocalBookState(symbol);
  if(st.syncing) return;
  st.syncing=true;
  try{
    const clean=symbol.replace('/','').toUpperCase();
    const r=await fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${encodeURIComponent(clean)}&limit=100`);
    if(!r.ok) throw new Error(`depth snapshot ${r.status}`);
    const data=await r.json();
    st.bids=new Map((data.bids||[]).map((x:any)=>[Number(x[0]),Number(x[1])]).filter((x:any)=>x[0]>0&&x[1]>=0));
    st.asks=new Map((data.asks||[]).map((x:any)=>[Number(x[0]),Number(x[1])]).filter((x:any)=>x[0]>0&&x[1]>=0));
    st.lastUpdateId=Number(data.lastUpdateId||0);
    st.initialized=true;
    const buffer=st.eventBuffer.splice(0);
    let started=false;
    for(const ev of buffer){
      const U=Number(ev.U||0), u=Number(ev.u||0);
      if(!u) continue;
      if(!started){
        if(U <= st.lastUpdateId+1 && st.lastUpdateId+1 <= u){
          for(const x of (ev.b||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.bids.delete(p); else st.bids.set(p,q); }
          for(const x of (ev.a||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.asks.delete(p); else st.asks.set(p,q); }
          st.lastUpdateId=u; st.lastEventAt=Date.now(); started=true;
        }
        continue;
      }
      if(Number(ev.U||0) > st.lastUpdateId+1){
        st.initialized=false;
        st.eventBuffer=[ev];
        void syncLocalBook(symbol);
        break;
      }
      applyDepthEvent(symbol,ev);
    }
    if(!started && buffer.length>0){ st.initialized=false; st.eventBuffer=buffer.slice(-50); }
    publishLocalBook(symbol);
  }catch(e:any){
    st.initialized=false;
    addEngineLog("WARN",`[ORDER BOOK] ${symbol} senkronizasyonu başarısız: ${e?.message||e}`);
  }finally{ st.syncing=false; }
}

function applyDepthEvent(symbol:string, ev:any){
  const st=getLocalBookState(symbol);
  if(!st.initialized) { if(st.eventBuffer.length<500) st.eventBuffer.push(ev); return; }
  const U=Number(ev.U||0), u=Number(ev.u||0), pu=Number(ev.pu||0);
  if(u < st.lastUpdateId+1) return;
  if(st.lastUpdateId>0 && pu && pu !== st.lastUpdateId){
    st.initialized=false;
    st.eventBuffer=[ev];
    void syncLocalBook(symbol);
    return;
  }
  if(U > st.lastUpdateId+1){
    st.initialized=false;
    st.eventBuffer=[ev];
    void syncLocalBook(symbol);
    return;
  }
  for(const x of (ev.b||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.bids.delete(p); else st.bids.set(p,q); }
  for(const x of (ev.a||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.asks.delete(p); else st.asks.set(p,q); }
  st.lastUpdateId=u; st.lastEventAt=Date.now();
  publishLocalBook(symbol);
}


// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // Estimated roundtrip taker/maker fee (0.04% * 2)
// Risk Profiles removed in favor of manual Stop Loss %

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 150) engineLogs.length = 150;
  console.log(`[${level}] ${timestamp} - ${message}`);
}

loadAIJournal();
loadEngineMode();

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

type BinanceEnvironment = "demo" | "live";

function getBinanceEnvironment(): BinanceEnvironment {
  try {
    if (fs.existsSync("config.json")) {
      const conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      const env = String(conf?.exchange?.environment || process.env.BINANCE_ENVIRONMENT || "demo").toLowerCase();
      if (env === "live") return "live";
      if (env === "demo" || env === "testnet" || env === "sandbox") return "demo";
      console.warn(`[CONFIG] Bilinmeyen Binance ortamı '${env}'; güvenlik nedeniyle DEMO kullanılıyor.`);
      return "demo";
    }
  } catch {}
  const env = String(process.env.BINANCE_ENVIRONMENT || "demo").toLowerCase();
  if (env === "live") return "live";
  if (env === "demo" || env === "testnet" || env === "sandbox") return "demo";
  console.warn(`[ENV] Bilinmeyen BINANCE_ENVIRONMENT '${env}'; güvenlik nedeniyle DEMO kullanılıyor.`);
  return "demo";
}

function futuresRestBase() {
  return getBinanceEnvironment() === "demo" ? "https://demo-fapi.binance.com" : "https://fapi.binance.com";
}

function futuresWsBase() {
  return getBinanceEnvironment() === "demo" ? "wss://demo-fstream.binance.com" : "wss://fstream.binance.com";
}

async function detectBinancePositionMode() {
  binanceHedgeMode = false;
  if (!exchange || !isExchangeAuthenticated) return false;
  try {
    const fn = (exchange as any).fapiPrivateGetPositionSideDual;
    if (typeof fn === "function") {
      const r = await fn.call(exchange);
      binanceHedgeMode = Boolean(r?.dualSidePosition);
    }
  } catch (e: any) {
    addEngineLog("WARN", `[BINANCE] Pozisyon modu okunamadı; ONE-WAY varsayımı kullanılacak: ${e?.message || e}`);
  }
  addEngineLog("INFO", `[BINANCE] Pozisyon modu: ${binanceHedgeMode ? "HEDGE" : "ONE-WAY"}`);
  return binanceHedgeMode;
}

function positionParams(type: "long" | "short", reduceOnly = false) {
  if (binanceHedgeMode) {
    return { positionSide: type === "long" ? "LONG" : "SHORT" };
  }
  return reduceOnly ? { reduceOnly: true } : {};
}

// =============== INITIALIZATION ===============
async function initializeExchange() {
  try {
    let confStr = "{}";
    if (fs.existsSync("config.json")) {
      confStr = fs.readFileSync("config.json", "utf8");
    }
    const conf = JSON.parse(confStr);
    
    const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY;
    const environment = getBinanceEnvironment();
    const isDemo = environment === "demo";
    const secret = conf?.exchange?.secret || process.env.BINANCE_API_SECRET;
    
    targetLeverage = Math.round(toFiniteNumber(conf?.leverage, SETTINGS_DEFAULTS.leverage, 1, 125));
    
    if (conf?.exchange?.pair_whitelist && conf.exchange.pair_whitelist.length > 0) {
      whitelistCoins = Array.from(new Set<string>(conf.exchange.pair_whitelist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean)));
    }
    blacklistCoins = Array.isArray(conf?.exchange?.pair_blacklist) ? Array.from(new Set<string>(conf.exchange.pair_blacklist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))) : [];
    tradingSource = conf?.trading_mode === "manual" || conf?.exchange?.auto_universe === false ? "manual" : "auto";
    
    activeStopLossPct = toFiniteNumber(conf?.stop_loss_pct, SETTINGS_DEFAULTS.stopLossPct, 0.1, 50);
    activeStakeAmount = toFiniteNumber(conf?.stake_amount, SETTINGS_DEFAULTS.stakeAmount, 1, 1000000);
    maxOpenTrades = Math.round(toFiniteNumber(conf?.max_open_trades, SETTINGS_DEFAULTS.maxOpenTrades, 1, 8));
    activeMinExpectedMovePct = toFiniteNumber(conf?.min_expected_move_pct, SETTINGS_DEFAULTS.minExpectedMovePct, 0.1, 20);

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

    const hasCredentials = Boolean(apiKey && secret && apiKey.trim() !== "" && secret.trim() !== "");
    if (hasCredentials) {
      exOpts.apiKey = apiKey.trim();
      exOpts.secret = secret.trim();
    }
    isExchangeAuthenticated = false;

    exchange = new ExchangeClass(exOpts);

    // Binance Futures Sandbox/Testnet was deprecated. The supported replacement is
    // Binance Demo Trading, which uses separate API keys and the demo-fapi endpoint.
    if (isDemo) {
      if (typeof (exchange as any).enableDemoTrading !== "function") {
        throw new Error("Kurulu CCXT sürümü Binance Demo Trading'i desteklemiyor. package.json içindeki ccxt paketini güncelleyin.");
      }
      (exchange as any).enableDemoTrading(true);
      addEngineLog("INFO", "Binance Futures DEMO TRADING etkin. Eski TESTNET/Sandbox anahtarları kabul edilmez.");
    } else {
      addEngineLog("INFO", "Binance Futures LIVE ortamı etkin.");
    }
    
    // Load Binance markets for exact precision and limit rules
    try {
      await exchange.loadMarkets();
    } catch (e: any) {
      console.warn("Binance loadMarkets fallback:", e.message);
    }

    // Verify credentials with a private Futures request before enabling trading.
    if (hasCredentials) {
      try {
        await exchange.fetchBalance({ type: "future" });
      } catch (e:any) {
        isExchangeAuthenticated = false;
        addEngineLog("WARN", `[BINANCE] Özel API doğrulaması başarısız; emir yetkisi kapatıldı: ${e?.message || e}`);
        return { success: false, message: `Binance API doğrulanamadı: ${e?.message || e}` };
      }
      isExchangeAuthenticated = true;
      addEngineLog("INFO", `Binance Vadeli İşlemler API bağlantısı aktif (${environment.toUpperCase()}).`);
      await detectBinancePositionMode();
      await syncBinancePositions();
      return { success: true, message: "Borsa ve pozisyonlar senkronize edildi." };
    } else {
      addEngineLog("INFO", "Binance Canlı Piyasa ve WebSocket Akışı Devrede.");
      return { success: true, message: "Genel piyasa canlı akışı hazır." };
    }
  } catch (error: any) {
    isExchangeAuthenticated = false;
    exchange = null;
    binanceHedgeMode = false;
    addEngineLog("WARN", `Borsa başlatma uyarısı: ${error.message || 'Binance bağlantısı doğrulanamadı'}`);
    return { success: false, message: error.message || "Binance bağlantısı doğrulanamadı." };
  }
}

async function ensureBinanceStopProtection(pos: ActivePosition): Promise<void> {
  if (!exchange || !isExchangeAuthenticated) return;
  const exSymbol = getMarketSymbol(pos.pair);
  if (!pos.entryPrice || pos.amount <= 0) return;
  try {
    if (pos.binanceStopOrderId) return;
    if (typeof (exchange as any).fetchOpenOrders === "function") {
      const openOrders = await (exchange as any).fetchOpenOrders(exSymbol);
      const stopSide = pos.type === "long" ? "sell" : "buy";
      const existing = Array.isArray(openOrders) ? openOrders.find((o:any) => {
        const typ = String(o.type || '').toUpperCase();
        const side = String(o.side || '').toLowerCase();
        const ps = String(o.info?.positionSide || o.positionSide || '').toUpperCase();
        return (typ.includes('STOP') || typ === 'STOP_MARKET') && side === stopSide &&
          (!binanceHedgeMode || ps === (pos.type === 'long' ? 'LONG' : 'SHORT'));
      }) : undefined;
      if (existing?.id) {
        pos.binanceStopOrderId = String(existing.id);
        return;
      }
    }

    let stopPriceBase = pos.type === 'long'
      ? pos.entryPrice * (1 - Number(pos.stopLossPct ?? activeStopLossPct) / 100)
      : pos.entryPrice * (1 + Number(pos.stopLossPct ?? activeStopLossPct) / 100);
    let stopPrice = stopPriceBase;
    try { stopPrice = parseFloat(exchange.priceToPrecision(exSymbol, stopPriceBase)); } catch {}
    const stopSide = pos.type === 'long' ? 'sell' : 'buy';
    const stopParams = binanceHedgeMode
      ? { positionSide: pos.type === 'long' ? 'LONG' : 'SHORT', stopPrice, closePosition: true }
      : { stopPrice, reduceOnly: true };
    const stopOrder = await exchange.createOrder(exSymbol, 'STOP_MARKET', stopSide, binanceHedgeMode ? undefined : pos.amount, undefined, stopParams);
    if (!stopOrder?.id) throw new Error('STOP_MARKET emri ID döndürmedi.');
    pos.binanceStopOrderId = String(stopOrder.id);
    pos.baseStopPrice = stopPrice;
    addEngineLog('INFO', `[SENKRON] ${pos.pair} için eksik STOP_MARKET yeniden oluşturuldu.`);
  } catch (e:any) {
    addEngineLog('ERROR', `[KRİTİK GÜVENLİK] ${pos.pair} yeniden başlatma sonrası STOP koruması doğrulanamadı: ${e?.message || e}`);
  }
}

async function resolveExternalExitFill(pos: ActivePosition, closedAt = Date.now()): Promise<{price:number, amount:number, estimated:boolean}> {
  if (!exchange || typeof (exchange as any).fetchMyTrades !== "function") {
    return { price: Number(latestMetricsPerCoin[pos.pair]?.currentPrice || pos.entryPrice), amount: pos.amount, estimated: true };
  }
  try {
    const exSymbol = getMarketSymbol(pos.pair);
    const trades = await (exchange as any).fetchMyTrades(exSymbol, Math.max(0, pos.openDate - 2000), 100);
    const exitSide = pos.type === 'long' ? 'sell' : 'buy';
    const candidates = Array.isArray(trades) ? trades.filter((t:any) =>
      String(t.side || '').toLowerCase() === exitSide &&
      Number(t.timestamp || 0) >= pos.openDate && Number(t.timestamp || 0) <= closedAt + 5000 &&
      Number(t.amount || 0) > 0 && Number(t.price || t.average || 0) > 0
    ) : [];
    if (!candidates.length) {
      return { price: Number(latestMetricsPerCoin[pos.pair]?.currentPrice || pos.entryPrice), amount: pos.amount, estimated: true };
    }
    const amount = candidates.reduce((sum:number,t:any)=>sum + Number(t.amount || 0), 0);
    const notional = candidates.reduce((sum:number,t:any)=>sum + Number(t.amount || 0) * Number(t.price || t.average || 0), 0);
    const price = amount > 0 ? notional / amount : Number(latestMetricsPerCoin[pos.pair]?.currentPrice || pos.entryPrice);
    return { price, amount: Math.min(amount, pos.amount), estimated: false };
  } catch (e:any) {
    addEngineLog("WARN", `[SENKRON] ${pos.pair} gerçek kapanış fill'i okunamadı; PnL yaklaşık gösterilecek: ${e?.message || e}`);
    return { price: Number(latestMetricsPerCoin[pos.pair]?.currentPrice || pos.entryPrice), amount: pos.amount, estimated: true };
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
        // CCXT contractSize describes the contract unit, not the user's current position size. Never use it as a fallback for open contracts.
        const contractsRaw = p.contracts ?? p.amount ?? 0;
        const contracts = Math.abs(Number(contractsRaw));
        if (Number.isFinite(contracts) && contracts > 0) {
          // Clean symbol format (e.g., DOGE/USDT:USDT -> DOGE/USDT)
          let cleanSymbol = p.symbol ? p.symbol.split(':')[0] : '';
          if (!cleanSymbol.includes('/') && cleanSymbol.endsWith('USDT')) {
            const base = cleanSymbol.slice(0, -4);
            cleanSymbol = `${base}/USDT`;
          }
          activeSymbolsInExchange.add(cleanSymbol);

          const rawSide = String(p.side || '').toLowerCase();
          const rawContracts = Number(p.contracts ?? p.amount ?? 0);
          const posType: "long" | "short" = rawSide === 'short' || rawContracts < 0 ? 'short' : 'long';
          const entryPrice = p.entryPrice || p.markPrice || 0;
          const lev = p.leverage || targetLeverage;
          const unPnl = p.unrealizedPnl !== undefined ? p.unrealizedPnl : 0;
          const roePct = p.percentage !== undefined ? p.percentage : 0;

          if (binanceHedgeMode && activePositions[cleanSymbol] && activePositions[cleanSymbol].type !== posType) {
            hedgeConflictSymbols.add(cleanSymbol);
            addEngineLog("ERROR", `[HEDGE GÜVENLİK] ${cleanSymbol}: LONG ve SHORT aynı anda açık. Tek-kayıtlı motor bu durumu güvenle yönetemez; otomatik girişler bu sembolde kilitlendi.`);
            continue;
          }
          if (!activePositions[cleanSymbol]) {
            const persistedOpen = allTrades.find((t:any) => t.is_open && String(t.pair).toUpperCase() === cleanSymbol);
            activePositions[cleanSymbol] = {
              trade_id: Number(persistedOpen?.trade_id) || tradeCounter++,
              pair: cleanSymbol,
              type: posType,
              entryPrice,
              amount: contracts,
              peakPrice: Number(persistedOpen?.peakPrice) || entryPrice,
              openDate: Number(persistedOpen?.openDate) || Date.now(),
              lookbackMin: Number(persistedOpen?.lookbackMin) || activeLookbackMin,
              stopLossPct: Number(persistedOpen?.stopLossPct) || activeStopLossPct,
              deepScoreHistory: Array.isArray(persistedOpen?.deepScoreHistory) ? persistedOpen.deepScoreHistory : [],
              orderFlowGapHistory: Array.isArray(persistedOpen?.orderFlowGapHistory) ? persistedOpen.orderFlowGapHistory : [],
              pnlHistory: Array.isArray(persistedOpen?.pnlHistory) ? persistedOpen.pnlHistory : [],
              peakNetPnl: Number(persistedOpen?.peakNetPnl) || 0,
              modelTargetPnlUSD: Number(persistedOpen?.modelTargetPnlUSD) || 0,
              modelTargetPrice: Number(persistedOpen?.modelTargetPrice) || entryPrice,
              modelTargetConfidence: Number(persistedOpen?.modelTargetConfidence) || 0,
              modelTargetAccuracySample: Number(persistedOpen?.modelTargetAccuracySample) || 0,
              modelTargetAccuracyRate: persistedOpen?.modelTargetAccuracyRate ?? null,
              leverage: Number(lev) || targetLeverage,
              baseStopPrice: Number(persistedOpen?.baseStopPrice) || 0,
              binanceStopOrderId: persistedOpen?.binanceStopOrderId ? String(persistedOpen.binanceStopOrderId) : undefined,
              unrealizedPnl: Number(unPnl.toFixed(2)),
              percentage: Number(roePct.toFixed(2)),
              aiEntryFeatures: persistedOpen?.aiEntryFeatures,
              aiModelProbability: Number(persistedOpen?.aiModelProbability) || 0,
              aiDecision: persistedOpen?.aiDecision,
              lastMarketUpdateAt: Date.now()
            };
            (activePositions[cleanSymbol] as any).isRealBinance = true;
            if (!persistedOpen) {
              allTrades.unshift({ ...activePositions[cleanSymbol], is_open: true });
              persistTrades();
            } else {
              // Refresh the persisted open trade snapshot with exchange truth without creating a duplicate.
              Object.assign(persistedOpen, activePositions[cleanSymbol], { is_open: true });
              persistTrades();
            }
            addEngineLog("INFO", `[SENKRON] Binance Pozisyonu Eşitlendi: ${cleanSymbol} ${posType.toUpperCase()} x${lev} | Büyüklük: ${contracts} | Giriş: $${entryPrice}`);
          } else {
            // Update live metrics from Binance
            activePositions[cleanSymbol].unrealizedPnl = Number(unPnl.toFixed(2));
            activePositions[cleanSymbol].percentage = Number(roePct.toFixed(2));
            activePositions[cleanSymbol].amount = contracts;
            if (entryPrice > 0) activePositions[cleanSymbol].entryPrice = entryPrice;
            activePositions[cleanSymbol].lastMarketUpdateAt = Date.now();
            (activePositions[cleanSymbol] as any).isRealBinance = true;
          }
          if (activePositions[cleanSymbol]) await ensureBinanceStopProtection(activePositions[cleanSymbol]);
        }
      }

      // If a previous HEDGE conflict no longer exists, unlock that symbol.
      for (const sym of [...hedgeConflictSymbols]) {
        const stillConflicted = positions.filter((p:any) => {
          const cs = p.symbol ? p.symbol.split(':')[0].toUpperCase() : '';
          const base = cs.includes('/') ? cs : (cs.endsWith('USDT') ? `${cs.slice(0,-4)}/USDT` : cs);
          return base === sym;
        }).length > 1;
        if (!stillConflicted) hedgeConflictSymbols.delete(sym);
      }

      // Check if any position closed externally on Binance
      for (const sym of Object.keys(activePositions)) {
        const closedPos = activePositions[sym];
        if ((closedPos as any).isRealBinance && !pendingExits.has(sym) && (Date.now() - closedPos.openDate > 15000) && !activeSymbolsInExchange.has(sym)) {
          const tradeIndex = allTrades.findIndex(t => t.trade_id === closedPos.trade_id && t.is_open);
          if (tradeIndex !== -1) {
            allTrades[tradeIndex].is_open = false;
            allTrades[tradeIndex].close_date = Date.now();
            allTrades[tradeIndex].close_reason = "Binance Üzerinden Kapatıldı";
            const exitFill = await resolveExternalExitFill(closedPos);
            allTrades[tradeIndex].close_rate = Number(exitFill.price.toPrecision(12));
            allTrades[tradeIndex].exit_filled_amount = exitFill.amount;
            allTrades[tradeIndex].pnl_estimated = exitFill.estimated;
            allTrades[tradeIndex].aiEntryFeatures = closedPos.aiEntryFeatures;
            allTrades[tradeIndex].aiModelProbability = closedPos.aiModelProbability;
            allTrades[tradeIndex].aiDecision = closedPos.aiDecision;
            const closeRate = Number(allTrades[tradeIndex].close_rate || closedPos.entryPrice);
            const fillAmount = Number(exitFill.amount || closedPos.amount);
            const pnl = closedPos.type === 'long' ? (closeRate-closedPos.entryPrice)*fillAmount : (closedPos.entryPrice-closeRate)*fillAmount; // gross PnL; fees/funding excluded
            allTrades[tradeIndex].profit_abs = Number(pnl.toFixed(2));
            allTrades[tradeIndex].profit_pct = Number((((closedPos.entryPrice*fillAmount/Math.max(1,closedPos.leverage))>0 ? pnl/(closedPos.entryPrice*fillAmount/Math.max(1,closedPos.leverage))*100 : 0)).toFixed(2));
            recordAITradeOutcome(allTrades[tradeIndex]);
            persistTrades();
          }
          delete activePositions[sym];
          addEngineLog("INFO", `[SENKRON] ${sym} pozisyonunun Binance üzerinde kapandığı tespit edildi.`);
        }
      }
    }
  } catch (e: any) {
    addEngineLog("WARN", `[SENKRON] Binance pozisyon senkronizasyonu başarısız: ${e?.message || e}`);
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
}

// In-memory candle and tick memory per coin for accurate real-time indicator calculations
const priceHistoryMap: Record<string, number[]> = {};
const volumeHistoryMap: Record<string, number[]> = {};
const recentTradesMap: Record<string, any[]> = {};
let lastScanLogTime = 0;


// ================= ADVANCED MICROSTRUCTURE / ORDER-FLOW MODEL =================
const orderbookHistory: Record<string, Array<{
  ts:number; bid10:number; ask10:number; bid30:number; ask30:number; gap:number;
  majorBid:number; majorAsk:number; price:number;
}>> = {};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const a = [...values].sort((x,y)=>x-y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }

function weightedBookSide(levels:any[], maxLevels:number, decay:number, currentPrice:number, minNotionalQuantile:number = 0) {
  const slice = (levels || []).slice(0, maxLevels);
  const notionals = slice.map((x:any)=>Math.max(0, Number(x[0]) * Number(x[1]))).filter(Boolean);
  const q = notionals.length ? percentile(notionals, minNotionalQuantile) : 0;
  let weighted = 0, raw = 0;
  for (let i=0;i<slice.length;i++) {
    const px=Number(slice[i][0]), qty=Number(slice[i][1]);
    if (!(px>0 && qty>0)) continue;
    const notional=px*qty;
    const rel = currentPrice>0 ? Math.abs(px-currentPrice)/currentPrice : 0;
    const distanceWeight = 1/(1 + rel*160);
    const sizeWeight = q>0 && notional<q ? 0.25 : 1;
    const w = Math.pow(decay, i) * distanceWeight * sizeWeight;
    weighted += qty*w;
    raw += qty;
  }
  return { weighted, raw, count:slice.length };
}


// ================= CUSTOM ADAPTIVE LIQUIDITY PATH MODEL (ALP) =================
// A deterministic, explainable microstructure model. It is intentionally not
// described as a guaranteed probability: the score is a reachability/edge score
// that must be calibrated against closed trades before it is interpreted as a rate.
function sigmoid100(x:number){ return 100/(1+Math.exp(-x)); }

function computeAdaptiveLiquidityPath(
  ob:any,
  side:"long"|"short",
  currentPrice:number,
  recentTrades:any[],
  spreadPct:number,
  volatilityPct:number,
  wallPersistenceScore:number,
  liquidityConsumptionScore:number,
  inflowMomentum:number,
  largeTradeScore:number,
  targetCount=8
){
  const sameSide = side === "long" ? (ob?.bids||[]) : (ob?.asks||[]);
  const oppSide = side === "long" ? (ob?.asks||[]) : (ob?.bids||[]);
  if(!currentPrice || !oppSide.length) return {best:null, levels:[], pathScore:0};

  const notionals = recentTrades.map((t:any)=>Math.abs(Number(t.price||currentPrice)*Number(t.amount||0))).filter((n:number)=>n>0);
  const recentTotal = notionals.reduce((a,b)=>a+b,0);
  const firstTs = recentTrades.length ? Number(recentTrades[0]?.timestamp || recentTrades[0]?.time || Date.now()) : Date.now();
  const lastTs = recentTrades.length ? Number(recentTrades[recentTrades.length-1]?.timestamp || recentTrades[recentTrades.length-1]?.time || Date.now()) : Date.now();
  const observedSec = Math.max(1, Math.min(60, (lastTs-firstTs)/1000 || 1));
  const horizonSec = 15;
  const flowPerSec = recentTotal / observedSec;
  const pressure = side === "long"
    ? clamp((inflowMomentum*0.45)+(largeTradeScore*0.45)+(liquidityConsumptionScore*0.10),-100,100)
    : clamp((-inflowMomentum*0.45)+(-largeTradeScore*0.45)+(-liquidityConsumptionScore*0.10),-100,100);
  const basePressure = clamp((pressure+100)/2,0,100);
  const maxScan=Math.min(50,oppSide.length);
  const levels=[] as any[];
  let cumOpp=0;
  for(let i=0;i<maxScan;i++){
    const [px,qty]=oppSide[i]||[];
    const p=Number(px), q=Number(qty);
    if(!(p>0&&q>0)) continue;
    cumOpp += p*q;
    const distPct=Math.abs(p-currentPrice)/currentPrice*100;
    const refVol=Math.max(0.05, volatilityPct||0.05);
    const distanceFit=clamp(1-distPct/Math.max(0.5,refVol*2.2),0,1);
    const depthCapacity=flowPerSec>0 ? clamp(1-cumOpp/(flowPerSec*horizonSec*1.8),0,1) : 0.15;
    const pressureFit=basePressure/100;
    const frictionPenalty=clamp(spreadPct*10000/25,0,1);
    const pathScore=clamp(100*(0.42*pressureFit+0.28*depthCapacity+0.18*distanceFit+0.12*clamp((wallPersistenceScore+50)/100,0,1))*(1-frictionPenalty*0.25),0,100);
    const reach=side === "long" ? p>currentPrice : p<currentPrice;
    if(reach){
      const expectedMovePct=distPct;
      const netEdge=pathScore/100;
      levels.push({price:p,expectedMovePct, cumulativeOppNotional:cumOpp, pathScore, horizonSec, netEdge});
    }
    if(levels.length>=targetCount) break;
  }
  // Prefer the furthest target that still has a strong path score, otherwise the strongest near target.
  const strong=levels.filter(x=>x.pathScore>=65);
  const candidates=(strong.length?strong:levels).slice(-Math.min(3,levels.length));
  const best=candidates.sort((a,b)=> (b.expectedMovePct*b.netEdge)-(a.expectedMovePct*a.netEdge))[0] || null;
  const pathScore=best?.pathScore || 0;
  return {best,levels,pathScore};
}

function getHistoricalTargetAccuracy(symbol:string){
  const closed=allTrades.filter((t:any)=>!t.is_open && t.pair===symbol && Number(t.modelTargetPnlUSD)>0 && Number.isFinite(Number(t.profit_abs)));
  if(!closed.length) return {sample:0, hitRate:null as number|null};
  let hits=0;
  for(const t of closed){ if(Number(t.profit_abs) >= Number(t.modelTargetPnlUSD)*0.9) hits++; }
  return {sample:closed.length, hitRate:hits/closed.length};
}


// =============== DIRECTIONAL CAPITAL BATTLE / EV ENGINE ===============
// Evaluates LONG and SHORT independently. Visible book liquidity is treated as
// resistance/support, not as proof of actual positions. Profit figures are
// model estimates after fees/spread/slippage.
function calculateDirectionalScenario(
  side: "long" | "short",
  args: {
    ob:any;
    currentPrice:number;
    targetModel:any;
    longScore:number;
    shortScore:number;
    takerBuyRatio:number;
    inflowMomentum:number;
    largeTradeScore:number;
    liquidityConsumptionScore:number;
    wallPersistenceScore:number;
    divergenceScore:number;
    spreadPct:number;
    volatilityPct:number;
    nearLong:number;
    nearShort:number;
    deepLong:number;
    deepShort:number;
    notionalReference:number;
    historicalHitRate:number|null;
  }
){
  const {
    currentPrice,targetModel,longScore,shortScore,takerBuyRatio,inflowMomentum,
    largeTradeScore,liquidityConsumptionScore,wallPersistenceScore,divergenceScore,
    spreadPct,volatilityPct,nearLong,nearShort,deepLong,deepShort,
    notionalReference,historicalHitRate
  } = args;

  const score = side === "long" ? longScore : shortScore;
  const oppositeScore = side === "long" ? shortScore : longScore;
  const dominance = clamp(score - oppositeScore + 50, 0, 100);

  const directionalMoney = side === "long"
    ? clamp(takerBuyRatio*100 + inflowMomentum*0.18 + largeTradeScore*0.22,0,100)
    : clamp((1-takerBuyRatio)*100 - inflowMomentum*0.18 - largeTradeScore*0.22,0,100);

  const sameNear = side === "long" ? nearLong : nearShort;
  const oppNear = side === "long" ? nearShort : nearLong;
  const sameDeep = side === "long" ? deepLong : deepShort;
  const oppDeep = side === "long" ? deepShort : deepLong;
  const nearResistanceRaw = oppNear / Math.max(1, oppNear + sameNear);
  const deepResistanceRaw = oppDeep / Math.max(1, oppDeep + sameDeep);

  // Resistance rises with opposing visible liquidity, persistent opposing walls,
  // adverse divergence and weak consumption. Favorable consumption reduces it.
  const sideConsumption = side === "long" ? liquidityConsumptionScore : -liquidityConsumptionScore;
  const sideDivergence = side === "long" ? divergenceScore : -divergenceScore;
  const resistance = clamp(
    100 * (
      0.48*nearResistanceRaw +
      0.22*deepResistanceRaw +
      0.12*clamp((50 - wallPersistenceScore*(side==="long"?-1:1))/100,0,1) +
      0.10*clamp((50 - sideDivergence)/100,0,1) +
      0.08*clamp((50 - sideConsumption)/100,0,1)
    ),
    0,100
  );

  const pressure = clamp(
    0.45*dominance +
    0.35*directionalMoney +
    0.20*clamp(50 + sideConsumption*0.5,0,100),
    0,100
  );

  const rawMove = Number(targetModel?.best?.expectedMovePct || 0);
  const pathScore = clamp(Number(targetModel?.pathScore || 0),0,100);
  // Penalize the target if the road is dominated by opposing liquidity.
  const movementPotentialPct = clamp(
    rawMove * (0.55 + 0.45*pressure/100) * (1 - 0.45*resistance/100),
    0.05, 12
  );
  const targetPrice = Number(targetModel?.best?.price) > 0
    ? Number(targetModel.best.price)
    : side === "long"
      ? currentPrice*(1+movementPotentialPct/100)
      : currentPrice*(1-movementPotentialPct/100);

  const feeUSD = notionalReference*(ESTIMATED_FEE_PCT/100);
  const spreadUSD = notionalReference*spreadPct;
  const liquidityPenaltyPct = clamp(
    0.00015 + spreadPct*0.75 + (resistance/100)*0.001 + (1-pathScore/100)*0.0005,
    0.00015, 0.012
  );
  const grossUSD = notionalReference*(movementPotentialPct/100);
  const slippageUSD = notionalReference*liquidityPenaltyPct;
  const pathPenaltyUSD = notionalReference*(0.0015*(1-pathScore/100));
  const targetNetUSD = grossUSD - feeUSD - spreadUSD - slippageUSD - pathPenaltyUSD;

  const stopMovePct = activeStopLossPct;
  const stopNetUSD = -(notionalReference*(stopMovePct/100) + feeUSD + spreadUSD + slippageUSD*0.65);

  // This is a decision probability, not a statistical guarantee. Historical
  // calibration is blended only when enough closed-trade history exists.
  const modelProbability = clamp(
    50 +
    (pressure-50)*0.30 +
    (dominance-50)*0.25 +
    (pathScore-50)*0.20 -
    (resistance-50)*0.25,
    5,95
  );
  const calibratedProbability = historicalHitRate === null
    ? modelProbability
    : clamp(modelProbability*0.70 + historicalHitRate*100*0.30, 5,95);

  const p = calibratedProbability/100;
  const expectedValueUSD = p*targetNetUSD + (1-p)*stopNetUSD;
  const riskReward = targetNetUSD>0 ? targetNetUSD/Math.max(0.01,Math.abs(stopNetUSD)) : 0;
  const netMarginPct = notionalReference>0 ? targetNetUSD/notionalReference*100 : 0;
  const confidence = clamp(
    0.30*pressure + 0.25*pathScore + 0.20*(100-resistance) +
    0.15*dominance + 0.10*(historicalHitRate===null?50:historicalHitRate*100),
    0,100
  );

  return {
    side,
    dominanceScore:Number(dominance.toFixed(2)),
    pressureScore:Number(pressure.toFixed(2)),
    resistanceScore:Number(resistance.toFixed(2)),
    directionalMoneyScore:Number(directionalMoney.toFixed(2)),
    pathScore:Number(pathScore.toFixed(2)),
    movementPotentialPct:Number(movementPotentialPct.toFixed(4)),
    targetPrice:Number(targetPrice.toFixed(8)),
    targetGrossProfitUSD:Number(grossUSD.toFixed(4)),
    targetNetProfitUSD:Number(targetNetUSD.toFixed(4)),
    stopNetLossUSD:Number(stopNetUSD.toFixed(4)),
    expectedValueUSD:Number(expectedValueUSD.toFixed(4)),
    hitProbabilityPct:Number(calibratedProbability.toFixed(2)),
    riskReward:Number(riskReward.toFixed(3)),
    netMarginPct:Number(netMarginPct.toFixed(4)),
    confidencePct:Number(confidence.toFixed(2)),
    modelLabel: expectedValueUSD>0 && calibratedProbability>=55 && confidence>=60
      ? "ENTER"
      : expectedValueUSD>0 ? "WATCH" : "BLOCK"
  };
}

function analyzeMicrostructure(
  symbol:string,
  ob:any,
  recentTrades:any[],
  prices:number[],
  volumes:number[],
  currentPrice:number
): any {
  if (!ob?.bids?.length || !ob?.asks?.length || !currentPrice) {
    return {
      dataReady:false, dataQuality:0, obi:0, entryLongScore:0, entryShortScore:0,
      orderFlowGap:0, longAdvantage:0, shortAdvantage:0, microPrice:currentPrice,
      midPrice:currentPrice, spreadPct:0, takerBuyVolUSD:0, takerSellVolUSD:0,
      netInflowUSD:0, takerBuyRatio:0.5, inflowMomentum:0, largeTradeScore:0,
      liquidityConsumptionScore:0, wallPersistenceScore:0, divergenceScore:0,
      movementPotentialPct:0, expectedNetProfitUSD:0, expectedTargetPrice:currentPrice,
      predictedProfitPct:0, predictedTimeSec:999, smartTargetPrice:currentPrice,
      smartStopPrice:currentPrice, liquidityGravityScore:0, deepScore:0,
      volumeSpike:false, volumeRatio:1, vwap:currentPrice, stdDev:0
    };
  }

  const bestBid=Number(ob.bids[0][0]), bestAsk=Number(ob.asks[0][0]);
  const mid=(bestBid+bestAsk)/2;
  const spreadPct=mid>0?(bestAsk-bestBid)/mid:0;

  // Tiered book imbalance: 1-10 drives entries; 11-30 validates; 31-50 maps the road ahead.
  const t1b=weightedBookSide(ob.bids,10,0.88,currentPrice,0.20);
  const t1a=weightedBookSide(ob.asks,10,0.88,currentPrice,0.20);
  const t2b=weightedBookSide(ob.bids.slice(10),10,0.91,currentPrice,0.20);
  const t2a=weightedBookSide(ob.asks.slice(10),10,0.91,currentPrice,0.20);
  const t3b=weightedBookSide(ob.bids.slice(20),10,0.94,currentPrice,0.20);
  const t3a=weightedBookSide(ob.asks.slice(20),10,0.94,currentPrice,0.20);
  const deepB=weightedBookSide(ob.bids.slice(30),20,0.97,currentPrice,0.20);
  const deepA=weightedBookSide(ob.asks.slice(30),20,0.97,currentPrice,0.20);

  const imbalance=(b:number,a:number)=> (b+a>0 ? (b-a)/(b+a) : 0);
  const obi10=imbalance(t1b.weighted,t1a.weighted);
  const obi20=imbalance(t1b.weighted+t2b.weighted,t1a.weighted+t2a.weighted);
  const obi30=imbalance(t1b.weighted+t2b.weighted+t3b.weighted,t1a.weighted+t2a.weighted+t3a.weighted);
  const weightedObi=0.62*obi10+0.23*(obi20-obi10)+0.15*(obi30-obi20);
  const microDen=t1b.weighted+t1a.weighted;
  const microPrice=microDen>0 ? ((bestBid*t1a.weighted)+(bestAsk*t1b.weighted))/microDen : mid;

  // Wall persistence / consumption: compare successive compact snapshots, not just a single book image.
  const majorBid=Math.max(0,...(ob.bids.slice(0,30).map((x:any)=>Number(x[0])*Number(x[1]))));
  const majorAsk=Math.max(0,...(ob.asks.slice(0,30).map((x:any)=>Number(x[0])*Number(x[1]))));
  const hist=orderbookHistory[symbol] ||= [];
  const compact={ts:Date.now(),bid10:t1b.weighted,ask10:t1a.weighted,bid30:t1b.weighted+t2b.weighted+t3b.weighted,ask30:t1a.weighted+t2a.weighted+t3a.weighted,gap:obi30,majorBid,majorAsk,price:currentPrice};
  hist.push(compact);
  if(hist.length>30) hist.shift();
  const recent=hist.slice(-10);
  const prev=hist.length>10?hist.slice(-20,-10):hist.slice(0,-10);
  const avg=(arr:any[],k:string)=>arr.length?arr.reduce((a,x)=>a+Number(x[k]||0),0)/arr.length:0;
  const gapNow=avg(recent,'gap'); const gapPrev=avg(prev,'gap');
  const liquidityConsumptionScore=clamp(((gapNow-gapPrev)*700)+((avg(recent,'majorAsk')<avg(prev,'majorAsk')&&obi30>0)?20:0)-((avg(recent,'majorBid')<avg(prev,'majorBid')&&obi30<0)?20:0),-100,100);
  const wallPersistenceScore=clamp(((recent.filter((x:any)=>Math.abs(x.majorBid-avg(recent,'majorBid'))<Math.max(1,avg(recent,'majorBid')*0.25)).length)-(recent.filter((x:any)=>Math.abs(x.majorAsk-avg(recent,'majorAsk'))<Math.max(1,avg(recent,'majorAsk')*0.25)).length))*5,-50,50);

  let takerBuyVolUSD=0,takerSellVolUSD=0;
  const notionals=recentTrades.map((t:any)=>Math.abs(Number(t.amount||0)*Number(t.price||currentPrice))).filter((x:number)=>x>0);
  const p50=percentile(notionals,0.5), p90=percentile(notionals,0.9);
  let largeBuy=0,largeSell=0;
  for(const t of recentTrades){
    const n=Math.abs(Number(t.amount||0)*Number(t.price||currentPrice));
    if(!(n>0)) continue;
    const side=t.side;
    if(side==='buy') takerBuyVolUSD+=n; else if(side==='sell') takerSellVolUSD+=n;
    if(p90>0 && n>=p90){ if(side==='buy') largeBuy+=n; else if(side==='sell') largeSell+=n; }
  }
  const totalTrade=takerBuyVolUSD+takerSellVolUSD;
  const netInflowUSD=takerBuyVolUSD-takerSellVolUSD;
  const takerBuyRatio=totalTrade>0?takerBuyVolUSD/totalTrade:0.5;

  const half=Math.max(1,Math.floor(recentTrades.length/2));
  const first=recentTrades.slice(0,half), last=recentTrades.slice(-half);
  const flowNet=(arr:any[])=>arr.reduce((sum,t)=>sum+(t.side==='buy'?1:-1)*Math.abs(Number(t.amount||0)*Number(t.price||currentPrice)),0);
  const inflowMomentum=clamp((flowNet(last)-flowNet(first))/Math.max(1, totalTrade)*100,-100,100);
  const largeTradeScore=clamp((largeBuy-largeSell)/Math.max(1,largeBuy+largeSell)*100,-100,100);

  // Price/order-book divergence: short price direction vs the change in weighted book advantage.
  const priceRet=prices.length>=8 ? Math.log(prices[prices.length-1]/prices[prices.length-8]) : 0;
  const bookSlope=gapNow-(hist.length>10?avg(hist.slice(-20,-10),'gap'):0);
  const divergenceScore=clamp((bookSlope*900)-(priceRet*1800),-100,100);

  // Volatility from real observed prices only. No synthetic history.
  let stdDev=0,vwap=currentPrice,volumeRatio=1,volumeSpike=false;
  if(prices.length>=8){
    const rets=[]; for(let i=1;i<prices.length;i++) rets.push(Math.log(prices[i]/prices[i-1]));
    const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
    stdDev=Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length);
    vwap=prices.reduce((a,b)=>a+b,0)/prices.length;
  }
  if(volumes.length>=8){
    const avgVol=volumes.reduce((a,b)=>a+b,0)/volumes.length;
    const lastVol=volumes[volumes.length-1]||0;
    volumeRatio=avgVol>0?lastVol/avgVol:1;
    volumeSpike=volumeRatio>=1.25;
  }

  // Entry confidence: 1-10 is the dominant block, 11-30 validate; money flow and execution quality are separate gates.
  const bookLong=(obi10+1)*50;
  const bookShort=(1-obi10)*50;
  const confirmLong=((obi20+1)/2)*0.55+((obi30+1)/2)*0.45;
  const confirmShort=((1-obi20)/2)*0.55+((1-obi30)/2)*0.45;
  const moneyLong=clamp((takerBuyRatio*100)+(inflowMomentum*0.18)+(largeTradeScore*0.22),0,100);
  const moneyShort=clamp(((1-takerBuyRatio)*100)-(inflowMomentum*0.18)-(largeTradeScore*0.22),0,100);
  const executionPenalty=clamp(spreadPct*10000,0,25);
  let longScore=0.62*bookLong+0.23*(confirmLong*100)+0.15*(Math.max(0,confirmLong)*100);
  let shortScore=0.62*bookShort+0.23*(confirmShort*100)+0.15*(Math.max(0,confirmShort)*100);
  longScore=clamp(longScore*0.55+moneyLong*0.25+clamp((liquidityConsumptionScore+50),0,100)*0.10+clamp((divergenceScore+50),0,100)*0.10-executionPenalty,0,100);
  shortScore=clamp(shortScore*0.55+moneyShort*0.25+clamp((50-liquidityConsumptionScore),0,100)*0.10+clamp((50-divergenceScore),0,100)*0.10-executionPenalty,0,100);
  const orderFlowGap=longScore-shortScore;
  const longAdvantage=longScore, shortAdvantage=shortScore;

  // Evaluate LONG and SHORT independently. Do not let a single OBI sign decide the trade.
  const longTargetModel=computeAdaptiveLiquidityPath(ob,"long",currentPrice,recentTrades,spreadPct,stdDev*100,wallPersistenceScore,liquidityConsumptionScore,inflowMomentum,largeTradeScore,8);
  const shortTargetModel=computeAdaptiveLiquidityPath(ob,"short",currentPrice,recentTrades,spreadPct,stdDev*100,wallPersistenceScore,liquidityConsumptionScore,inflowMomentum,largeTradeScore,8);
  const deepLong=deepB.weighted, deepShort=deepA.weighted;
  const nearLong=t2b.weighted+t3b.weighted, nearShort=t2a.weighted+t3a.weighted;
  const notionalReference=Math.max(1,activeStakeAmount*targetLeverage);
  const historicalTargetAccuracy=getHistoricalTargetAccuracy(symbol);
  const longScenario=calculateDirectionalScenario("long",{ob,currentPrice,targetModel:longTargetModel,longScore,shortScore,takerBuyRatio,inflowMomentum,largeTradeScore,liquidityConsumptionScore,wallPersistenceScore,divergenceScore,spreadPct,volatilityPct:stdDev*100,nearLong,nearShort,deepLong,deepShort,notionalReference,historicalHitRate:historicalTargetAccuracy.hitRate});
  const shortScenario=calculateDirectionalScenario("short",{ob,currentPrice,targetModel:shortTargetModel,longScore,shortScore,takerBuyRatio,inflowMomentum,largeTradeScore,liquidityConsumptionScore,wallPersistenceScore,divergenceScore,spreadPct,volatilityPct:stdDev*100,nearLong,nearShort,deepLong,deepShort,notionalReference,historicalHitRate:historicalTargetAccuracy.hitRate});

  const selectedScenario=longScenario.expectedValueUSD>=shortScenario.expectedValueUSD ? longScenario : shortScenario;
  const dir=selectedScenario.side==="long"?1:-1;
  const targetModel=selectedScenario.side==="long"?longTargetModel:shortTargetModel;
  const deepOpp=selectedScenario.side==="long"?deepShort:deepLong;
  const nearOpp=selectedScenario.side==="long"?nearShort:nearLong;
  const pressure=selectedScenario.pressureScore/100;
  const liquidityClearance=nearOpp+deepOpp>0?clamp(1-(nearOpp/(nearOpp+deepOpp)),0,1):0;
  const movementPotentialPct=selectedScenario.movementPotentialPct;
  const expectedTargetPrice=selectedScenario.targetPrice;
  const predictedProfitPct=movementPotentialPct;
  const buyVelocity=totalTrade/Math.max(1,activeLookbackMin*60);
  let predictedTimeSec=targetModel.best?.horizonSec || (buyVelocity>0 ? Math.max(0.2, Math.min(3600,(nearOpp+deepOpp)/buyVelocity)) : 999);


  const roundTripFeeUSD=notionalReference*(ESTIMATED_FEE_PCT/100);
  const spreadCostUSD=notionalReference*spreadPct;
  const slippagePct=clamp(0.00015 + spreadPct*0.75 + (1-liquidityClearance)*0.0005,0.00015,0.01);
  const expectedGrossUSD=selectedScenario.targetGrossProfitUSD;
  const pathQuality=clamp(selectedScenario.pathScore/100,0,1);
  const pathPenaltyUSD=notionalReference*(0.0015*(1-pathQuality));
  const expectedNetProfitUSD=selectedScenario.targetNetProfitUSD;
  const calibratedTargetConfidence=selectedScenario.confidencePct;
  const smartStopPrice=dir>0?currentPrice*(1-activeStopLossPct/100):currentPrice*(1+activeStopLossPct/100);
  const deepScore=clamp(orderFlowGap*0.8 + largeTradeScore*0.1 + liquidityConsumptionScore*0.1 + (targetModel.pathScore-50)*0.1,-100,100);
  // CLP Edge Score: combines directional edge with the quality of the visible liquidity path.
  const direction = longScore >= shortScore ? 1 : -1;
  const flowAlignment = clamp(50 + direction * inflowMomentum * 0.5, 0, 100);
  const consumptionAlignment = clamp(50 + direction * liquidityConsumptionScore * 0.5, 0, 100);
  const strongestScoreForEdge = Math.max(longScore, shortScore);
  const edgeScore = clamp(0.45*strongestScoreForEdge + 0.25*pathQuality + 0.15*flowAlignment + 0.15*consumptionAlignment, 0, 100);

  const dataReady=prices.length>=20 && recentTrades.length>=20 && ob.bids.length>=30 && ob.asks.length>=30;
  return {
    dataReady, dataQuality:clamp((Math.min(1,ob.bids.length/50)+Math.min(1,ob.asks.length/50)+Math.min(1,prices.length/20)+Math.min(1,recentTrades.length/50))/4*100,0,100),
    obi:weightedObi, obi10, obi20, obi30, microPrice, midPrice:mid, spreadPct,
    takerBuyVolUSD,takerSellVolUSD,netInflowUSD,takerBuyRatio,inflowMomentum,largeTradeScore,
    liquidityConsumptionScore,wallPersistenceScore,divergenceScore, longAdvantage,shortAdvantage,orderFlowGap,
    volumeSpike,volumeRatio,vwap,stdDev,deepScore,
    predictedProfitPct,predictedTimeSec,smartTargetPrice:expectedTargetPrice,smartStopPrice,liquidityGravityScore:clamp(pressure*100,0,100),
    movementPotentialPct,expectedNetProfitUSD,expectedTargetPrice, targetPathScore:targetModel.pathScore, targetPathLevels:targetModel.levels, targetConfidence:calibratedTargetConfidence, targetAccuracySample:historicalTargetAccuracy.sample, targetAccuracyRate:historicalTargetAccuracy.hitRate, edgeScore,
    first10LongScore:bookLong, first10ShortScore:bookShort,
    nearOpp,deepOpp,roundTripFeeUSD,spreadCostUSD,slippagePct,p50TradeUSD:p50,
    largeTradeBuyUSD:largeBuy,largeTradeSellUSD:largeSell,
    selectedSide:selectedScenario.side,
    longDominanceScore:longScenario.dominanceScore,
    shortDominanceScore:shortScenario.dominanceScore,
    longPressureScore:longScenario.pressureScore,
    shortPressureScore:shortScenario.pressureScore,
    longResistanceScore:longScenario.resistanceScore,
    shortResistanceScore:shortScenario.resistanceScore,
    longExpectedNetProfitUSD:longScenario.targetNetProfitUSD,
    shortExpectedNetProfitUSD:shortScenario.targetNetProfitUSD,
    longExpectedValueUSD:longScenario.expectedValueUSD,
    shortExpectedValueUSD:shortScenario.expectedValueUSD,
    longHitProbabilityPct:longScenario.hitProbabilityPct,
    shortHitProbabilityPct:shortScenario.hitProbabilityPct,
    longTargetPrice:longScenario.targetPrice,
    shortTargetPrice:shortScenario.targetPrice,
    longMovementPotentialPct:longScenario.movementPotentialPct,
    shortMovementPotentialPct:shortScenario.movementPotentialPct,
    selectedExpectedValueUSD:selectedScenario.expectedValueUSD,
    selectedHitProbabilityPct:selectedScenario.hitProbabilityPct,
    selectedResistanceScore:selectedScenario.resistanceScore,
    selectedDominanceScore:selectedScenario.dominanceScore,
    selectedConfidencePct:selectedScenario.confidencePct,
    selectedRiskReward:selectedScenario.riskReward,
    directionalDecision:selectedScenario.modelLabel
  };
}
// =======================================================================================================
// Server-side persistent Binance WebSocket streams for live ticker & depth updates
let binanceWsClient: WsClient | null = null;
let binanceWsReconnectTimer: any = null;

function getActiveScanSymbols(): string[] {
  const base = tradingSource === "auto" ? autoScanUniverse : whitelistCoins;
  const openSymbols = Object.keys(activePositions);
  return [...new Set([...base].filter(Boolean).filter(s => !blacklistCoins.includes(s)).concat(openSymbols.filter(Boolean)))];
}

async function refreshAutoUniverse() {
  try {
    if (tradingSource !== "auto") return;
    const res = await fetch(`${futuresRestBase()}/fapi/v1/ticker/24hr`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    latestTickersCache = data;
    const validPerpetuals = new Set(allFuturesMarketsList);
    const ranked = data
      .filter((x:any) => {
        const raw = String(x.symbol || '').toUpperCase();
        const pair = raw.endsWith('USDT') ? `${raw.slice(0, -4)}/USDT` : '';
        return validPerpetuals.has(pair) && Number(x.lastPrice || 0) > 0;
      })
      .map((x:any) => ({ symbol: `${String(x.symbol).slice(0, -4)}/USDT`, quoteVolume: Number(x.quoteVolume || 0) }))
      .filter((x:any) => Number.isFinite(x.quoteVolume))
      .sort((a:any,b:any) => b.quoteVolume - a.quoteVolume)
      .slice(0, AUTO_UNIVERSE_SIZE)
      .map((x:any) => x.symbol);
    if (ranked.length === 0) return;
    const oldSet = [...autoScanUniverse].sort().join('|');
    const newSet = [...ranked].sort().join('|');
    const changed = oldSet !== newSet;
    autoScanUniverse = ranked;
    if (changed) {
      addEngineLog("INFO", `[EVREN] Otomatik Futures evreni güncellendi: ${autoScanUniverse.length} yüksek likiditeli parite.`);
      startBinanceServerWebSocket();
    }
  } catch {}
}

function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  let nextIndex = 0;
  const workerLoop = async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try { await worker(items[idx]); } catch {}
    }
  };
  return Promise.all(Array.from({ length: safeLimit }, workerLoop)).then(() => undefined);
}

function startBinanceServerWebSocket() {
  if (binanceWsClient) {
    try { binanceWsClient.terminate(); } catch (e) {}
  }
  try {
    const activeSymbols = getActiveScanSymbols();
    if (activeSymbols.length === 0) return;
    const streamNamesFutures = activeSymbols
      .map(c => `${c.replace('/', '').toLowerCase()}@ticker/${c.replace('/', '').toLowerCase()}@depth@100ms/${c.replace('/', '').toLowerCase()}@aggTrade`)
      .join('/');
    
    // 1. Binance Futures WebSocket
    try {
      const urlFutures = `${futuresWsBase()}/stream?streams=${streamNamesFutures}`;
      binanceWsClient = new WsClient(urlFutures);

      binanceWsClient.on('open', () => {
        addEngineLog("INFO", `Binance Vadeli (Futures) 100ms WebSocket akışına bağlanıldı (${activeSymbols.length} parite).`);
        for (const sym of activeSymbols) void syncLocalBook(sym);
      });

      binanceWsClient.on('message', (raw: any) => {
        handleWsMessage(raw);
      });

      binanceWsClient.on('error', () => {});
      binanceWsClient.on('close', () => {
        clearTimeout(binanceWsReconnectTimer);
        binanceWsReconnectTimer = setTimeout(startBinanceServerWebSocket, 5000);
      });
    } catch (e) {}

    // Spot akışı bilinçli olarak kullanılmıyor: Futures-only mimari.
    clearTimeout(binanceWsReconnectTimer);
  } catch (e: any) {
    addEngineLog("WARN", `Futures WebSocket başlatılamadı: ${e?.message || e}`);
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
    const activeSymbols = getActiveScanSymbols();
    const formattedSym = activeSymbols.find(w => w.replace('/', '').toUpperCase() === symUpper) || 
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
          if (volumeHistoryMap[formattedSym].length > 40) volumeHistoryMap[formattedSym].shift();
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
            takerBuyRatio: 0.5,
            updatedAt: Date.now()
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
    } else if (stream.includes('@depth')) {
      applyDepthEvent(formattedSym, data);
    }
  } catch (err) {}
}

// Start WebSocket stream immediately
startBinanceServerWebSocket();

// =============== CORE REAL-TIME LOOP ===============
async function updateMarketDataAndExecute() {
  if (dataLoopRunning) return;
  dataLoopRunning = true;
  try {
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
    addEngineLog("INFO", `[CANLI TARAMA] ${getActiveScanSymbols().length} parite taranıyor | Açık Pozisyon: ${activeCount} | Motor: ÇALIŞIYOR`);
  }

  const entryCandidates: { symbol: string, score: number, type: "long" | "short", price: number, predictedProfitPct?: number, predictedTimeSec?: number, smartTargetPrice?: number, minExpectedMovePct?: number, targetMeetsMinimum?: boolean, aiProbability?: number, expectedValueUSD?: number, hitProbabilityPct?: number, resistanceScore?: number, dominanceScore?: number, aiDecision?: string }[] = [];

  const scanSymbols = getActiveScanSymbols();

  await runWithConcurrency(scanSymbols, 16, async (symbol) => {
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
              fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${cleanSymbol}&limit=50`),
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
          } catch (e) {
            try {
              const fallbackTicker = await fetch(`${futuresRestBase()}/fapi/v1/ticker/price?symbol=${cleanSymbol}`);
              if (fallbackTicker.ok) {
                const tick = await fallbackTicker.json();
                currentPrice = parseFloat(tick.price);
              }
            } catch (err) {}
          }
        }

        if (!currentPrice || currentPrice <= 0) return;
        if (!ob || ob.bids?.length < 30 || ob.asks?.length < 30) return;
        if (ob.timestamp && Date.now() - ob.timestamp > 2500) {
          return;
        }

        // Initialize or update rolling price history (NO FAKE DATA)
        if (!priceHistoryMap[symbol]) {
          priceHistoryMap[symbol] = [];
        }
        // Save real prices incrementally to allow the math algorithm to calculate actual volatility
        priceHistoryMap[symbol].push(currentPrice);
        if (priceHistoryMap[symbol].length > 40) priceHistoryMap[symbol].shift();

        const prices = priceHistoryMap[symbol];
        const volumes = volumeHistoryMap[symbol] || [];

        // Technical Indicators
        const rsiData = prices.length >= 15 ? RSI.calculate({ period: 14, values: prices }) : [];
        const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1] : 50;

        const ema9Data = prices.length >= 10 ? EMA.calculate({ period: 9, values: prices }) : [];
        const currentEMA9 = ema9Data.length > 0 ? ema9Data[ema9Data.length - 1] : currentPrice;

        const ema21Data = prices.length >= 22 ? EMA.calculate({ period: 21, values: prices }) : [];
        const currentEMA21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1] : currentPrice;

        const currentATR = currentPrice * 0.008;

        // Deep Inflow & Order Flow Metrics
                const currentCutoff = Date.now() - (activeLookbackMin * 60 * 1000);
        const activeTrades = (recentTradesMap[symbol] || []).filter((t: any) => t.timestamp > currentCutoff);
        const flow = analyzeMicrostructure(symbol, ob, activeTrades, prices, volumes, currentPrice);

        latestMetricsPerCoin[symbol] = {
          currentPrice,
          change_24h_pct: ticker?.percentage || latestMetricsPerCoin[symbol]?.change_24h_pct || 0,
          volume_24h_usdt: ticker?.quoteVolume || latestMetricsPerCoin[symbol]?.volume_24h_usdt || 0,
          updatedAt: Date.now(),
          rsi: currentRSI,
          ema9: currentEMA9,
          ema21: currentEMA21,
          atr: currentATR,
          ...flow
        };

        // If Bot is NOT running, we only update data and do not execute automated trades
        if (botState !== "running") return;

        const pos = activePositions[symbol];

        // ================= EXITS: PROFIT PROTECTION + MULTI-SIGNAL REVERSAL =================
        if (pos) {
          pos.deepScoreHistory.push(flow.deepScore);
          if (pos.deepScoreHistory.length > 30) pos.deepScoreHistory.shift();
          pos.orderFlowGapHistory ||= [];
          pos.pnlHistory ||= [];
          pos.orderFlowGapHistory.push(flow.orderFlowGap);
          if (pos.orderFlowGapHistory.length > 30) pos.orderFlowGapHistory.shift();

          if (pos.type === "long") pos.peakPrice = Math.max(pos.peakPrice, currentPrice);
          else pos.peakPrice = Math.min(pos.peakPrice, currentPrice);

          const pnlUSD = pos.type === "long"
            ? (currentPrice - pos.entryPrice) * pos.amount
            : (pos.entryPrice - currentPrice) * pos.amount;
          const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
          const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
          pos.peakNetPnl = Math.max(pos.peakNetPnl ?? pnlUSD, pnlUSD);
          pos.pnlHistory.push(pnlUSD);
          if (pos.pnlHistory.length > 30) pos.pnlHistory.shift();

          const peakPnl = Math.max(0, pos.peakNetPnl || 0);
          const pnlDrawdown = peakPnl > 0 ? (peakPnl - pnlUSD) / peakPnl : 0;
          const positivePnl = pnlUSD > 0;
          const gaps = pos.orderFlowGapHistory;
          const last10 = gaps.slice(-10);
          const avg10 = last10.length ? last10.reduce((a,b)=>a+b,0)/last10.length : flow.orderFlowGap;
          const gapTrend = last10.length >= 4 ? last10[last10.length-1]-last10[0] : 0;
          const sideGap = pos.type === "long" ? flow.orderFlowGap : -flow.orderFlowGap;
          const moneyWeak = pos.type === "long" ? flow.inflowMomentum < -12 : flow.inflowMomentum > 12;
          const bookWeak = sideGap < 5 || avg10 < 5;
          const largeMoneyWeak = pos.type === "long" ? flow.largeTradeScore < -10 : flow.largeTradeScore > 10;
          const consumptionWeak = pos.type === "long" ? flow.liquidityConsumptionScore < -10 : flow.liquidityConsumptionScore > 10;
          const significantPeakGiveback = peakPnl >= Math.max(0.50, activeStakeAmount*0.02) && pnlDrawdown >= 0.20;
          let shouldExit = false;
          let exitReason = "";

          if (positivePnl) {
            const deterioration = [bookWeak, moneyWeak, largeMoneyWeak, consumptionWeak, significantPeakGiveback, gapTrend < -8].filter(Boolean).length;
            if (deterioration >= 3 || (pnlDrawdown >= 0.35 && deterioration >= 2)) {
              shouldExit = true;
              exitReason = `Kâr Koruma: para/Order Flow zayıfladı | Net $${pnlUSD.toFixed(2)} | Zirve $${peakPnl.toFixed(2)} | Erozyon %${(pnlDrawdown*100).toFixed(1)}`;
            }
          }

          // Near-balance exit uses 3 -> 6 -> 10 measurements, but only after a meaningful positive PnL exists.
          if (!shouldExit && positivePnl && sideGap <= 5) {
            const mean=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
            const m3=mean(gaps.slice(-3)), m6=mean(gaps.slice(-6)), m10=mean(gaps.slice(-10));
            const favorableRecovery = pos.type === "long" ? (m3 > 6 || m6 > 8) : (m3 < -6 || m6 < -8);
            const stable3 = gaps.length>=3 && Math.max(...gaps.slice(-3))-Math.min(...gaps.slice(-3))<6;
            const negative6 = gaps.length>=6 && (pos.type === "long" ? m6<=0 : m6>=0);
            const negative10 = gaps.length>=10 && (pos.type === "long" ? m10<=0 : m10>=0);
            if (!favorableRecovery && ((stable3 && negative6) || negative10)) {
              shouldExit=true;
              exitReason=`Adaptif Kâr Koruma: ${gaps.length>=10?'10':'6'} ölçümde pozitif avantaj geri gelmedi | Ort. Gap ${ (gaps.length>=10?m10:m6).toFixed(1) }`;
            }
          }

          if (!shouldExit && positivePnl && flow.expectedNetProfitUSD < Math.max(0.10, peakPnl*0.25) && bookWeak && moneyWeak) {
            shouldExit=true;
            exitReason=`Kâr Koruma: beklenen avantaj çöktü | Net $${pnlUSD.toFixed(2)}`;
          }

          if (shouldExit) {
            await executeExit(symbol, exitReason, currentPrice);
          }
          const priceMovePct = pos.type === "long"
            ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
          if (!activePositions[symbol]) return;

          // 2. Manuel Zarar Kes (Stop Loss)
          const positionStopLossPct = toFiniteNumber(pos.stopLossPct, activeStopLossPct, 0.1, 50);
          if (priceMovePct <= -positionStopLossPct && activePositions[symbol]) {
            shouldExit = true;
            exitReason = `Zarar Kes (Stop Loss: %${positionStopLossPct.toFixed(2)})`;
          }

          if (shouldExit) {
            await executeExit(symbol, exitReason, currentPrice);
          }
        } 
        // ================= ENTRY: ACTIVE QUANTITATIVE & ORDER FLOW SIGNAL ENGINE =================
        else {
          // Open positions up to maximum capacity
          if (Object.keys(activePositions).length < maxOpenTrades) {
                        const notional = Math.max(0, activeStakeAmount * targetLeverage);
            const minExpectedNetProfitUSD = Math.max(0.25, notional * 0.0015);
            const strongest = flow.longExpectedValueUSD >= flow.shortExpectedValueUSD ? "long" : "short";
            const strongestScore = strongest === "long" ? Number(flow.longDominanceScore || flow.longAdvantage || 0) : Number(flow.shortDominanceScore || flow.shortAdvantage || 0);
            const opposingScore = strongest === "long" ? Number(flow.shortDominanceScore || flow.shortAdvantage || 0) : Number(flow.longDominanceScore || flow.longAdvantage || 0);
            const selectedEV = Number(flow.selectedExpectedValueUSD ?? flow.expectedNetProfitUSD ?? 0);
            const selectedProbability = Number(flow.selectedHitProbabilityPct ?? flow.targetConfidence ?? 0);
            const selectedResistance = Number(flow.selectedResistanceScore ?? 100);
            const directionalFlow = strongest === "long" ? flow.takerBuyRatio >= 0.52 : flow.takerBuyRatio <= 0.48;
            const directionalGap = strongestScore - opposingScore;
            const movementOk = Number(flow.movementPotentialPct || 0) >= activeMinExpectedMovePct;
            const profitOk = Number(flow.expectedNetProfitUSD || 0) >= minExpectedNetProfitUSD;
            const evOk = selectedEV > Math.max(0.05, minExpectedNetProfitUSD*0.20);
            const pathOk = Number(flow.targetPathScore || 0) >= 65 && Number(flow.edgeScore || 0) >= 68;
            const dataOk = flow.dataReady && flow.dataQuality >= 70;
            const notOverSpread = flow.spreadPct <= 0.0015;
            const aiFeatures = extractAIFeatures(flow, 50, strongest);
            const aiProbability = adaptiveAI.predict(aiFeatures) * 100;
            const breakeven = Math.max(50, Number(flow.breakevenProbabilityPct || 50));
            const learnedThreshold = Math.max(50, Math.min(85, Number(adaptiveAI.state.threshold || 0.5) * 100));
            const aiPass = aiProbability >= Math.max(learnedThreshold, Math.min(68, breakeven + 8));
            const capitalBattleOk = strongestScore >= 58 && directionalGap >= 10 && selectedResistance <= 58 && selectedProbability >= 55;
            const safetyHard = dataOk && notOverSpread && profitOk && evOk;
            const softScore = (Number(flow.edgeScore||0)*0.22) + (Number(flow.targetPathScore||0)*0.16) + (Math.abs(Number(flow.orderFlowGap||0))*0.12) + (Number(flow.dataQuality||0)*0.08) + (aiProbability*0.14) + (Number(flow.selectedConfidencePct||0)*0.14) + ((100-selectedResistance)*0.14);
            // LOCKED ORIGINAL V7 decision: this expression is intentionally preserved as the baseline.
            const originalEntryOk = originalV7EntryGate({ flow, minExpectedMovePct: activeMinExpectedMovePct, minExpectedNetProfitUSD });
            const adaptiveEntryOk = safetyHard && capitalBattleOk && directionalFlow && pathOk && movementOk && (aiPass || softScore >= 72);
            const entryOk = engineMode === "original" ? originalEntryOk : adaptiveEntryOk;

            if (engineMode === "shadow" && originalEntryOk !== adaptiveEntryOk) {
              // Shadow compares decisions without placing a live order.
              const shadowDirection = adaptiveEntryOk ? "AI_GİRİ" : "AI_BEKLE";
              const originalDirection = originalEntryOk ? "ORJ_GİR" : "ORJ_BEKLE";
              addEngineLog("INFO", `[SHADOW] ${symbol}: ${originalDirection} | ${shadowDirection} | AI %${aiProbability.toFixed(1)}`);
            }

            if (entryOk) {
              const type = strongest;
              const score = engineMode === "original"
                ? Number(flow.edgeScore || strongestScore) + Math.max(0, Math.min(10, flow.movementPotentialPct * 2)) + Math.max(0, Math.min(5, flow.expectedNetProfitUSD))
                : softScore + Math.max(0, Math.min(10, flow.movementPotentialPct * 2)) + Math.max(0, Math.min(5, flow.expectedNetProfitUSD));
              entryCandidates.push({
                symbol, score, type, price: currentPrice,
                predictedProfitPct: flow.movementPotentialPct,
                predictedTimeSec: flow.predictedTimeSec,
                smartTargetPrice: flow.expectedTargetPrice,
                minExpectedMovePct: activeMinExpectedMovePct,
                targetMeetsMinimum: engineMode === "original" ? movementOk : flow.targetMeetsMinimum,
                aiProbability,
                expectedValueUSD: selectedEV,
                hitProbabilityPct: selectedProbability,
                resistanceScore: selectedResistance,
                dominanceScore: strongestScore,
                aiDecision: engineMode === "original" ? 'ORIGINAL' : (aiPass ? 'ENTER_NOW' : 'ENTER_BETTER')
              });
            }
          }
        }
      } catch (e: any) {
        // Log individual symbol loop errors
        addEngineLog("ERROR", `[LOOP HATASI] ${symbol}: ${e.message}`);
      }
  });

  // Now process entry candidates based on their signal strength score
  if (entryCandidates.length > 0 && Object.keys(activePositions).length < maxOpenTrades) {
    // Sort descending by score (highest potential first)
    entryCandidates.sort((a, b) => b.score - a.score);

    if (engineMode === "shadow") {
      const best = entryCandidates[0];
      addEngineLog("INFO", `[SHADOW] En iyi aday: ${best.symbol} ${best.type.toUpperCase()} | Skor ${Number(best.score).toFixed(1)} | AI %${Number(best.aiProbability || 0).toFixed(1)} | GERÇEK EMİR YOK`);
      return;
    }

    for (const candidate of entryCandidates) {
      if (Object.keys(activePositions).length >= maxOpenTrades) break;
      
      const { symbol, type, price, score } = candidate;
      if (activePositions[symbol]) continue;

      const metric = latestMetricsPerCoin[symbol] || {};
        const ttp = candidate.predictedTimeSec ? candidate.predictedTimeSec.toFixed(1) : "?";
      const pp = candidate.predictedProfitPct ? candidate.predictedProfitPct.toFixed(2) : "?";
      const expectedPnl = Number(metric.expectedNetProfitUSD || 0).toFixed(2);

      addEngineLog("TRADE", `[MATEMATİKSEL SİNYAL] ${symbol} ${type.toUpperCase()} Girişi | Baskınlık %${Number(metric.selectedDominanceScore||0).toFixed(1)} | Direnç %${Number(metric.selectedResistanceScore||0).toFixed(1)} | Hedef +%${pp} | Net Kâr $${expectedPnl} | EV $${Number(metric.selectedExpectedValueUSD||0).toFixed(2)} | P(Hedef) %${Number(metric.selectedHitProbabilityPct||0).toFixed(1)} | R/R ${Number(metric.selectedRiskReward||0).toFixed(2)} | Süre ${ttp}sn`);
      await executeEntry(symbol, type, price);
    }
  }
  } finally {
    dataLoopRunning = false;
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

async function confirmOrderFilled(order: any, exSymbol: string, maxWaitMs = 4000): Promise<any> {
  let latest = order || {};
  const started = Date.now();
  while (Date.now() - started <= maxWaitMs) {
    const status = String(latest?.status || "").toLowerCase();
    const filled = Number(latest?.filled ?? 0);
    if (status === "closed" || status === "filled" || (filled > 0 && status !== "open" && status !== "new")) return latest;
    if (status === "canceled" || status === "cancelled" || status === "rejected" || status === "expired") {
      throw new Error(`Emir gerçekleşmedi: ${status}`);
    }
    if (!latest?.id || typeof (exchange as any)?.fetchOrder !== "function") break;
    await new Promise(r => setTimeout(r, 500));
    latest = await (exchange as any).fetchOrder(latest.id, exSymbol);
  }
  const finalStatus = String(latest?.status || "").toLowerCase();
  const finalFilled = Number(latest?.filled ?? 0);
  if (!(finalFilled > 0) || ["open", "new", "pending"].includes(finalStatus)) {
    throw new Error(`Emir gerçekleşmesi doğrulanamadı (status=${finalStatus || "unknown"}, filled=${finalFilled})`);
  }
  return latest;
}

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number): Promise<boolean> {
  if (activePositions[symbol] || pendingEntries.has(symbol)) return false;
  if (binanceHedgeMode && hedgeConflictSymbols.has(symbol)) {
    addEngineLog("ERROR", `[HEDGE GÜVENLİK] ${symbol}: aynı sembolde çakışan HEDGE pozisyonu bulunduğu için yeni işlem engellendi.`);
    return false;
  }
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
    } catch (e: any) {
      throw new Error(`Emir miktarı precision'a çevrilemedi: ${e?.message || e}`);
    }
  }

  // Never guess exchange quantity precision; a guessed amount can violate lot/step filters.
  if (!Number.isFinite(formattedAmount) || formattedAmount <= 0) {
    throw new Error(`Geçersiz emir miktarı: ${formattedAmount}`);
  }

  let entryPrice = effectivePrice;
  let stopOrderId: string | undefined = undefined;
  let isRealOrder = false;

  // Trading requires authenticated Binance Futures. Never create fake/simulated positions in normal mode.
  if (!exchange || !isExchangeAuthenticated) {
    addEngineLog("WARN", `[EMİR ATLANDI] ${symbol}: Binance Futures API kimlik doğrulaması yok; sahte/simülasyon pozisyonu açılmadı.`);
    return false;
  }

  // If real authenticated Binance API is active, send actual market order
  if (exchange && isExchangeAuthenticated) {
    try {
      try {
        await exchange.setLeverage(targetLeverage, exSymbol);
      } catch (e: any) {
        const msg = e?.message || e;
        addEngineLog("ERROR", `[BINANCE] ${symbol} kaldıraç ${targetLeverage} ayarlanamadı; emir gönderilmedi: ${msg}`);
        throw new Error(`Kaldıraç ayarlanamadı (${targetLeverage}x): ${msg}`);
      }

      try {
        if (typeof (exchange as any).setMarginMode === "function") {
          await (exchange as any).setMarginMode("isolated", exSymbol);
        }
      } catch (e: any) {
        // Binance may report "No need to change margin type" when already isolated.
        const msg = String(e?.message || e);
        if (!/no need|margin type cannot be changed|same/i.test(msg)) {
          addEngineLog("WARN", `[BINANCE] ${symbol} ISOLATED margin ayarlanamadı: ${msg}`);
        }
      }

      // Re-precision after min-amount adjustment; never submit zero/under-minimum quantity.
      try {
        const market = exchange.market(exSymbol);
        const minAmount = Number(market?.limits?.amount?.min || 0);
        if (minAmount > 0 && formattedAmount < minAmount) {
          formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, minAmount));
        }
        if (!Number.isFinite(formattedAmount) || formattedAmount <= 0) {
          throw new Error(`Geçersiz emir miktarı: ${formattedAmount}`);
        }
        const minCost = Number(market?.limits?.cost?.min || 0);
        if (minCost > 0 && formattedAmount * effectivePrice < minCost) {
          const required = minCost / effectivePrice;
          formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, required));
        }
        const maxAmount = Number(market?.limits?.amount?.max || 0);
        if (maxAmount > 0 && formattedAmount > maxAmount) {
          throw new Error(`Emir miktarı maksimum lot limitini aşıyor: ${formattedAmount} > ${maxAmount}`);
        }
        if (minCost > 0 && formattedAmount * effectivePrice < minCost) {
          throw new Error(`Emir değeri minimum notional altında kalıyor: $${(formattedAmount * effectivePrice).toFixed(6)} < $${minCost}`);
        }
      } catch (e: any) {
        throw new Error(`Emir miktarı/market limitleri doğrulanamadı: ${e?.message || e}`);
      }

      const side = type === "long" ? "buy" : "sell";
      const order = await exchange.createOrder(exSymbol, "market", side, formattedAmount, undefined, positionParams(type));
      const filledOrder:any = await confirmOrderFilled(order, exSymbol);
      entryPrice = Number(filledOrder?.average || filledOrder?.price || effectivePrice);
      formattedAmount = Number(filledOrder?.filled || 0);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(formattedAmount) || formattedAmount <= 0) {
        throw new Error(`Gerçekleşen emir bilgisi geçersiz: fiyat=${entryPrice}, miktar=${formattedAmount}`);
      }
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
        const stopParams = binanceHedgeMode
          ? { positionSide: type === "long" ? "LONG" : "SHORT", stopPrice, closePosition: true }
          : { stopPrice, reduceOnly: true };
        const stopOrder = await exchange.createOrder(
          exSymbol,
          "STOP_MARKET",
          stopSide,
          binanceHedgeMode ? undefined : formattedAmount,
          undefined,
          stopParams
        );
        stopOrderId = stopOrder.id;
      } catch (e: any) {
        addEngineLog("ERROR", `[GÜVENLİK] ${symbol} STOP_MARKET oluşturulamadı: ${e.message}. Pozisyon güvenli biçimde kapatılmaya çalışılıyor.`);
        try {
          const emergencyOrder = await exchange.createOrder(exSymbol, "market", type === "long" ? "sell" : "buy", formattedAmount, undefined, positionParams(type, true));
          await confirmOrderFilled(emergencyOrder, exSymbol, 5000);
          addEngineLog("WARN", `[GÜVENLİK] ${symbol} STOP_MARKET yerine acil piyasa kapatma gerçekleşti.`);
        } catch (closeErr:any) {
          addEngineLog("ERROR", `[KRİTİK GÜVENLİK] ${symbol} STOP_MARKET ve acil kapatma başarısız: ${closeErr?.message || closeErr}`);
        }
        throw new Error(`STOP_MARKET oluşturulamadı: ${e.message}`);
      }

      addEngineLog("TRADE", `[BINANCE POZİSYONU AÇILDI] ${symbol} ${type.toUpperCase()} x${targetLeverage} | Notional: $${Math.round(entryPrice * formattedAmount)} | Giriş: $${entryPrice}`);
    } catch (e: any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} Emir Hatası: ${e.message}`);
      throw e;
    }
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
    orderFlowGapHistory: [],
    pnlHistory: [],
    peakNetPnl: 0,
    modelTargetPnlUSD: Number(latestMetricsPerCoin[symbol]?.expectedNetProfitUSD || 0),
    modelTargetPrice: Number(latestMetricsPerCoin[symbol]?.expectedTargetPrice || entryPrice),
    modelTargetConfidence: Number(latestMetricsPerCoin[symbol]?.targetConfidence || 0),
    modelTargetAccuracySample: Number(latestMetricsPerCoin[symbol]?.targetAccuracySample || 0),
    modelTargetAccuracyRate: latestMetricsPerCoin[symbol]?.targetAccuracyRate ?? null,
    leverage: targetLeverage,
    baseStopPrice: Number(stopPriceBase.toFixed(2)),
    binanceStopOrderId: stopOrderId,
    unrealizedPnl: 0,
    percentage: 0,
    aiEntryFeatures: extractAIFeatures(latestMetricsPerCoin[symbol], Number(latestMetricsPerCoin[symbol]?.adaptiveUrgency ?? 50), type),
    aiModelProbability: adaptiveAI.predict(extractAIFeatures(latestMetricsPerCoin[symbol], Number(latestMetricsPerCoin[symbol]?.adaptiveUrgency ?? 50), type)),
    aiDecision: String(latestMetricsPerCoin[symbol]?.adaptiveDecision || 'ENTER_NOW'),
    lastMarketUpdateAt: Date.now()
  };
  (activePositions[symbol] as any).isRealBinance = isRealOrder;

  allTrades.unshift({ ...activePositions[symbol], is_open: true });
  persistTrades();
  return true;
  } finally {
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number): Promise<boolean> {
  const pos = activePositions[symbol];
  if (!pos || pendingExits.has(symbol)) return false;
  pendingExits.add(symbol);
  try {
    const exSymbol = getMarketSymbol(symbol);
    if (!exchange || !isExchangeAuthenticated) {
      addEngineLog("WARN", `[ÇIKIŞ ATLANDI] ${symbol}: Binance Futures API bağlantısı yok.`);
      return false;
    }

    const side = pos.type === "long" ? "sell" : "buy";
    let exitAmount = Number(pos.amount);
    if (!Number.isFinite(exitAmount) || exitAmount <= 0) throw new Error(`Geçersiz çıkış miktarı: ${exitAmount}`);
    try { exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, exitAmount)); } catch (e:any) { throw new Error(`Çıkış miktarı precision'a çevrilemedi: ${e?.message || e}`); }
    if (!(exitAmount > 0)) throw new Error(`Çıkış miktarı precision sonrası 0 oldu.`);

    // Cancel protective stop first to prevent a race between STOP_MARKET and manual/engine close.
    if (pos.binanceStopOrderId) {
      try {
        await exchange.cancelOrder(pos.binanceStopOrderId, exSymbol);
        pos.binanceStopOrderId = undefined;
      } catch (e:any) {
        // If it already triggered/closed, let the final exchange position state decide; never fire a blind second close.
        const msg = String(e?.message || e);
        if (/unknown order|order does not exist|not found|filled|closed|canceled|cancelled/i.test(msg)) {
          pos.binanceStopOrderId = undefined;
        } else {
          addEngineLog("WARN", `[GÜVENLİK] ${symbol} STOP emri iptal edilemedi: ${msg}`);
          return false;
        }
      }
    }

    const exitOrder = await exchange.createOrder(exSymbol, "market", side, exitAmount, undefined, positionParams(pos.type, true));
    pos.exitOrderId = String(exitOrder?.id || "");
    const filledExit:any = await confirmOrderFilled(exitOrder, exSymbol, 5000);
    const exitFillPrice = Number(filledExit?.average || filledExit?.price || currentPrice);
    const exitFilledAmount = Number(filledExit?.filled ?? 0);
    if (!(exitFilledAmount > 0) || !(exitFillPrice > 0)) {
      throw new Error(`Çıkış emri gerçekleştiği doğrulanamadı.`);
    }
    currentPrice = exitFillPrice;
    pos.exitFilledAmount = exitFilledAmount;
    pos.exitFillPrice = exitFillPrice;

    // Gross realized PnL must use the actual filled quantity, not the requested quantity.
    const pnlUSD = pos.type === "long"
      ? (currentPrice - pos.entryPrice) * exitFilledAmount
      : (pos.entryPrice - currentPrice) * exitFilledAmount;
    const initialMargin = (pos.entryPrice * exitFilledAmount) / Math.max(1, pos.leverage);
    const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;

    const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id && t.is_open);
    if (tradeIndex !== -1) {
      allTrades[tradeIndex].is_open = false;
      allTrades[tradeIndex].close_rate = currentPrice;
      allTrades[tradeIndex].close_date = Date.now();
      allTrades[tradeIndex].close_reason = reason;
      allTrades[tradeIndex].exit_order_id = pos.exitOrderId;
      allTrades[tradeIndex].exit_filled_amount = exitFilledAmount;
      allTrades[tradeIndex].profit_abs = Number(pnlUSD.toFixed(2));
      allTrades[tradeIndex].profit_pct = Number(roePct.toFixed(2));
      allTrades[tradeIndex].aiEntryFeatures = pos.aiEntryFeatures;
      allTrades[tradeIndex].aiModelProbability = pos.aiModelProbability;
      allTrades[tradeIndex].aiDecision = pos.aiDecision;
      recordAITradeOutcome(allTrades[tradeIndex]);
      persistTrades();
    }

    delete activePositions[symbol];
    addEngineLog("TRADE", `[POZİSYON KAPANDI] ${symbol} | Neden: ${reason} | Dolan miktar: ${exitFilledAmount} | Sonuç: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${roePct >= 0 ? '+' : ''}${roePct.toFixed(2)}%)`);
    return true;
  } catch (e:any) {
    addEngineLog("ERROR", `[BINANCE] ${symbol} Çıkış Emri Hatası: ${e?.message || e}`);
    return false;
  } finally {
    pendingExits.delete(symbol);
  }
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Yüksek Para Girişi & HFT Motoru Başlatıldı.");
  addEngineLog("INFO", getBinanceEnvironment() === "demo" ? "Mod: DEMO TRADING (Sanal Binance Futures)" : "Mod: CANLI İŞLEM (Gerçek Binance Futures)");
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
app.use(express.json({ limit: "256kb" }));

app.get("/api/v1/engine/mode", (req, res) => {
  res.json({ mode: engineMode, originalVersion: ORIGINAL_ENGINE_VERSION, originalLocked: true });
});

app.post("/api/v1/engine/mode", (req, res) => {
  const requested = String(req.body?.mode || "").toLowerCase();
  if (!["original", "ai", "shadow"].includes(requested)) {
    return res.status(400).json({ ok: false, message: "Geçersiz motor modu." });
  }
  engineMode = requested as EngineMode;
  persistEngineMode();
  addEngineLog("SYSTEM", `[MOTOR] ${engineMode.toUpperCase()} modu aktif. Orijinal motor: ${ORIGINAL_ENGINE_VERSION} (KİLİTLİ).`);
  res.json({ ok: true, mode: engineMode, originalVersion: ORIGINAL_ENGINE_VERSION, originalLocked: true });
});

app.get("/api/v1/ai/status", (req, res) => {
  res.json({
    samples: aiJournal.length,
    trainedSamples: adaptiveAI.state.trainedSamples,
    brier: adaptiveAI.state.brier,
    threshold: adaptiveAI.state.threshold,
    version: adaptiveAI.state.version,
    updatedAt: adaptiveAI.state.updatedAt,
    mode: aiJournal.length >= 20 ? "ready" : "learning",
    topWeights: adaptiveAI.explainTopWeights()
  });
});

app.get("/api/v1/ai/analyze", (req, res) => {
  const closed = allTrades.filter(t => !t.is_open && Number.isFinite(Number(t.profit_abs)));
  const byReason:Record<string,{count:number;wins:number;pnl:number}> = {};
  for (const t of closed) {
    const key=String(t.close_reason||'Bilinmiyor').slice(0,80);
    byReason[key] ||= {count:0,wins:0,pnl:0};
    byReason[key].count++; if (Number(t.profit_abs)>0) byReason[key].wins++; byReason[key].pnl+=Number(t.profit_abs)||0;
  }
  res.json({ total:closed.length, pnl:Number(closed.reduce((a,t)=>a+(Number(t.profit_abs)||0),0).toFixed(2)), winRate:closed.length?Number((closed.filter(t=>Number(t.profit_abs)>0).length/closed.length*100).toFixed(2)):0, byReason });
});

app.post("/api/v1/ai/improve", (req, res) => {
  const result = adaptiveAI.improve(aiJournal);
  if ((result as any).approved) {
    try { fs.mkdirSync(path.dirname(aiJournalPath), {recursive:true}); fs.writeFileSync(path.resolve(process.cwd(), "data", "argos_ai_model.json"), JSON.stringify(adaptiveAI.state, null, 2)); } catch {}
    addEngineLog("SYSTEM", `[AI] Model V${adaptiveAI.state.version} out-of-sample doğrulamayı geçti ve etkinleştirildi.`);
  } else {
    addEngineLog("INFO", `[AI] İyileştirme reddedildi/bekliyor: ${(result as any).reason || 'out-of-sample avantaj oluşmadı.'}`);
  }
  res.json(result);
});

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    environment: getBinanceEnvironment(),
    trading_mode: tradingSource,
    strategy: "High_Inflow_Quant_Futures",
    timeframe: "1m",
    engine_mode: engineMode,
    original_engine_version: ORIGINAL_ENGINE_VERSION,
    open_trades: Object.keys(activePositions).length,
    max_open_trades: maxOpenTrades,
    min_expected_move_pct: activeMinExpectedMovePct,
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
    res.status(502).json({ balance_usdt: 0, error: e.message });
  }
});

app.get("/api/v1/config", (req, res) => {
  res.json({
    exchange: {
      pair_whitelist: whitelistCoins,
      environment: getBinanceEnvironment(),
      auto_universe: tradingSource === "auto",
      pair_blacklist: blacklistCoins
    },
    dry_run: false,
    leverage: targetLeverage,
    stop_loss_pct: activeStopLossPct,
    min_expected_move_pct: activeMinExpectedMovePct,
    stake_amount: activeStakeAmount,
    max_open_trades: maxOpenTrades,
    trading_mode: tradingSource,
    exchange_environment: getBinanceEnvironment(),
    defaults: { ...SETTINGS_DEFAULTS }
  });
});

app.post("/api/v1/config", async (req, res) => {
  const conf = sanitizeConfig(req.body);
  let whitelistChanged = false;
  const previousEnvironment = getBinanceEnvironment();
  const requestedEnvironment = String(conf?.exchange?.environment || previousEnvironment || "demo").toLowerCase();
  const nextEnvironment = (requestedEnvironment === "testnet" || requestedEnvironment === "demo" || requestedEnvironment === "sandbox") ? "demo" : "live";
  if (conf.exchange) conf.exchange.environment = nextEnvironment;
  const environmentChanged = previousEnvironment !== nextEnvironment;
  const previousTradingSource = tradingSource;
  tradingSource = conf.trading_mode === "manual" || conf.exchange?.auto_universe === false ? "manual" : "auto";
  if (conf.exchange?.pair_whitelist && Array.isArray(conf.exchange.pair_whitelist)) {
    whitelistCoins = conf.exchange.pair_whitelist;
    whitelistChanged = true;
  }
  
  targetLeverage = Math.round(toFiniteNumber(conf.leverage, targetLeverage, 1, 125));
  activeStopLossPct = toFiniteNumber(conf.stop_loss_pct, activeStopLossPct, 0.1, 50);
  activeMinExpectedMovePct = toFiniteNumber(conf.min_expected_move_pct, activeMinExpectedMovePct, 0.1, 20);
  activeStakeAmount = toFiniteNumber(conf.stake_amount, activeStakeAmount, 1, 1000000);
  maxOpenTrades = Math.round(toFiniteNumber(conf.max_open_trades, maxOpenTrades, 1, 8));
  conf.leverage = targetLeverage;
  conf.stop_loss_pct = activeStopLossPct;
  conf.min_expected_move_pct = activeMinExpectedMovePct;
  conf.stake_amount = activeStakeAmount;
  conf.max_open_trades = maxOpenTrades;
  
  try {
    fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  } catch (e: any) {
    addEngineLog("ERROR", `[CONFIG] Ayarlar diske yazılamadı: ${e?.message || e}`);
    return res.status(500).json({ status: "error", error: "Ayarlar kalıcı olarak kaydedilemedi." });
  }
  addEngineLog("SYSTEM", "Konfigürasyon güncellendi.");
  
  if (whitelistChanged || environmentChanged || previousTradingSource !== tradingSource) {
    if (environmentChanged) {
      try { await initializeExchange(); } catch {}
    }
    let reinitResult: any = { success: true };
    if (environmentChanged) {
      try { reinitResult = await initializeExchange(); } catch (e: any) {
        reinitResult = { success: false, message: e?.message || "Binance yeniden başlatılamadı." };
      }
      if (!reinitResult?.success || (reinitResult?.credentialsPresent && !isExchangeAuthenticated)) {
        return res.status(502).json({ status: "error", error: reinitResult?.message || "Binance bağlantısı başlatılamadı." });
      }
    }
    if (tradingSource === "auto") {
      void refreshAutoUniverse();
    } else {
      startBinanceServerWebSocket();
    }
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
      ? t.entryPrice * (1 - Number(t.stopLossPct ?? activeStopLossPct) / 100)
      : t.entryPrice * (1 + Number(t.stopLossPct ?? activeStopLossPct) / 100);

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
      stop_loss_pct: t.stopLossPct,
      stop_loss_abs: Number(stopLossPrice.toPrecision(12)),
      take_profit_pct: 0,
      model_target_profit_usd: Number(t.modelTargetPnlUSD || 0),
      model_target_price: Number(t.modelTargetPrice || 0),
      model_target_confidence: Number(t.modelTargetConfidence || 0),
      model_target_accuracy_sample: Number(t.modelTargetAccuracySample || 0),
      model_target_accuracy_rate: t.modelTargetAccuracyRate ?? null
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
  try {
    startTradingEngine();
    res.json({ status: "success", message: "Node.js Bot Engine Started", state: botState });
  } catch (e:any) {
    res.status(500).json({ status:"error", message:e?.message || "Motor başlatılamadı." });
  }
});

app.post("/api/v1/stop", async (req, res) => {
  try {
    await stopTradingEngine();
    res.json({ status: "success", message: "Node.js Bot Engine Stopped", state: botState });
  } catch (e:any) {
    res.status(500).json({ status:"error", message:e?.message || "Motor durdurulamadı." });
  }
});

app.post("/api/v1/forceexit", async (req, res) => {
  const { tradeid } = req.body;
  if (tradeid === "all") {
    const symbols = Object.keys(activePositions);
    if (symbols.length === 0) return res.status(400).json({ error: "Açık pozisyon bulunamadı." });
    const results = await Promise.all(symbols.map(async (sym) => ({
      symbol: sym,
      ok: await executeExit(sym, "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[sym]?.currentPrice || 0)
    })));
    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      return res.status(502).json({ status: "error", message: `${failed.length} pozisyon kapatılamadı. Binance emrinin sonucunu kontrol edin.`, failed: failed.map(r => r.symbol) });
    }
    return res.json({ status: "success", message: "Tüm işlemler kapatıldı." });
  }

  const id = String(tradeid ?? "");
  const posEntry = Object.entries(activePositions).find(([_, p]) => String(p.trade_id) === id);
  if (!posEntry) return res.status(400).json({ error: "Açık işlem bulunamadı. Binance pozisyonu ayrıca kontrol edin." });

  const ok = await executeExit(posEntry[0], "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[posEntry[0]]?.currentPrice || 0);
  if (!ok) return res.status(502).json({ error: "Binance pozisyonu kapatılamadı; yerel kayıt kapatılmadı." });
  return res.json({ status: "success", message: "İşlem kapatıldı." });
});

app.post("/api/v1/forceentry", async (req, res) => {
  const { symbol, side } = req.body;
  const sym = symbol || whitelistCoins[0] || "BTC/USDT";
  const type = side === "short" ? "short" : "long";
  const currentPrice = latestMetricsPerCoin[sym]?.currentPrice || 0;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return res.status(503).json({ error: `${sym} için geçerli piyasa fiyatı henüz hazır değil.` });
  }
  if (activePositions[sym]) {
    return res.status(400).json({ error: `${sym} üzerinde zaten açık bir pozisyon var.` });
  }
  if (Object.keys(activePositions).length >= maxOpenTrades) {
    return res.status(409).json({ error: `Maksimum açık işlem sayısına ulaşıldı (${maxOpenTrades}).` });
  }
  
  try {
    const opened = await executeEntry(sym, type, currentPrice);
    if (!opened) {
      return res.status(409).json({ status: "error", error: "Pozisyon açılamadı: Binance API kimlik doğrulaması yok veya işlem zaten beklemede." });
    }
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

  // If ob or detailed metrics are not yet available, immediately fetch live depth & trades from Binance Spot
  if (!ob || !ob.bids || ob.bids.length < 20 || !m || m.obi === undefined) {
    try {
      const clean = reqSymbol.replace('/', '').toUpperCase();
      const [depthRes, tradesRes] = await Promise.all([
        fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${clean}&limit=50`),
        fetch(`${futuresRestBase()}/fapi/v1/trades?symbol=${clean}&limit=30`)
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

      const bestBid = ob?.bids?.[0]?.[0] || 0;
      const bestAsk = ob?.asks?.[0]?.[0] || bestBid;
      const mid = (bestBid + bestAsk) / 2;

      const flow = analyzeMicrostructure(reqSymbol, ob, recentTrades, [], [], mid);
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
  if (!ob?.bids?.length || !ob?.asks?.length || !p) {
    return res.status(503).json({ error: "Gerçek Futures Order Book verisi henüz hazır değil." });
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
      longAdvantage: m?.longAdvantage || 0,
      shortAdvantage: m?.shortAdvantage || 0,
      orderFlowGap: m?.orderFlowGap || 0,
      inflowMomentum: m?.inflowMomentum || 0,
      largeTradeScore: m?.largeTradeScore || 0,
      liquidityConsumptionScore: m?.liquidityConsumptionScore || 0,
      wallPersistenceScore: m?.wallPersistenceScore || 0,
      divergenceScore: m?.divergenceScore || 0,
      movementPotentialPct: m?.movementPotentialPct || 0,
      minExpectedMovePct: m?.minExpectedMovePct || activeMinExpectedMovePct,
      targetMeetsMinimum: m?.targetMeetsMinimum ?? false,
      expectedNetProfitUSD: m?.expectedNetProfitUSD || 0,
      expectedTargetPrice: m?.expectedTargetPrice || p,
      targetPathScore: m?.targetPathScore || 0,
      targetConfidence: m?.targetConfidence || 0,
      targetAccuracySample: m?.targetAccuracySample || 0,
      targetAccuracyRate: m?.targetAccuracyRate ?? null,
      edgeScore: m?.edgeScore || 0,
      dataQuality: m?.dataQuality || 0

    }
  });
});

app.get("/api/v1/deepdata", (req, res) => {
  res.json({ metrics: latestMetricsPerCoin, orderbooks: latestOrderBooks });
});

app.get("/api/v1/futures/orderbook", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(5, Math.floor(requestedLimit))) : 50;
    const r = await fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures order book alınamadı" }); }
});

app.get("/api/v1/futures/trades", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(1, Math.floor(requestedLimit))) : 50;
    const r = await fetch(`${futuresRestBase()}/fapi/v1/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures trades alınamadı" }); }
});

app.get("/api/v1/futures/klines", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const interval = String(req.query.interval || "5m");
    const requestedLimit = Number(req.query.limit || 80);
    const limit = Number.isFinite(requestedLimit) ? Math.min(1500, Math.max(1, Math.floor(requestedLimit))) : 80;
    const r = await fetch(`${futuresRestBase()}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures kline alınamadı" }); }
});

app.get("/api/v1/live-tickers", (req, res) => {
  const results = getActiveScanSymbols().map(sym => {
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
        const livePairs = data.symbols
          .filter((s:any) => s.quoteAsset === "USDT" && s.status === "TRADING" && s.contractType === "PERPETUAL")
          .map((s:any) => `${s.baseAsset}/USDT`);
        if (livePairs.length > 0) allFuturesMarketsList = Array.from(new Set<string>(livePairs)).sort();
      }
    }
  } catch (e) {}
}

loadBinanceFuturesMarkets();
setInterval(loadBinanceFuturesMarkets, 30 * 60 * 1000);
refreshAutoUniverse();
setInterval(refreshAutoUniverse, 30 * 1000);

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

app.get("/api/v1/universe", (req, res) => {
  const auto = tradingSource === "auto";
  res.json({
    universe_count: allFuturesMarketsList.length,
    deep_count: auto ? autoScanUniverse.length : whitelistCoins.length,
    active_count: getActiveScanSymbols().length,
    mode: tradingSource,
    scan_limit: auto ? AUTO_UNIVERSE_SIZE : whitelistCoins.length
  });
});

// Futures Search Proxy
app.get("/api/v1/markets", (req, res) => {
  const white = new Set(whitelistCoins);
  const black = new Set(blacklistCoins);
  const markets = allFuturesMarketsList.map(symbol => {
    const base = symbol.split('/')[0];
    const m = latestMetricsPerCoin[symbol] || {};
    return {
      symbol, base, quote: "USDT",
      price: Number(m.currentPrice || 0),
      change_24h_pct: Number(m.change_24h_pct || 0),
      volume_24h_usdt: Number(m.volume_24h_usdt || 0),
      high_24h: 0, low_24h: 0,
      in_whitelist: white.has(symbol),
      in_blacklist: black.has(symbol),
      signal: Number(m.longAdvantage || 0) >= Number(m.shortAdvantage || 0) ? "BUY" : "SELL"
    };
  });
  res.json({ markets });
});

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
app.get("/api/v1/pairlists", (req, res) => res.json({ whitelist: whitelistCoins, blacklist: blacklistCoins }));
app.post("/api/v1/pairlists", (req, res) => {
  try {
    if (req.body?.action === 'set') {
      const symbol = String(req.body?.symbol || '').trim().toUpperCase();
      const list = req.body?.list === 'blacklist' ? 'blacklist' : req.body?.list === 'whitelist' ? 'whitelist' : '';
      if (!symbol || !list || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ ok:false, error:'Geçersiz pairlist değişikliği.' });
      const whiteSet = new Set(whitelistCoins);
      const blackSet = new Set(blacklistCoins);
      if (list === 'whitelist') {
        req.body.enabled ? whiteSet.add(symbol) : whiteSet.delete(symbol);
        if (req.body.enabled) blackSet.delete(symbol);
      } else {
        req.body.enabled ? blackSet.add(symbol) : blackSet.delete(symbol);
        if (req.body.enabled) whiteSet.delete(symbol);
      }
      whitelistCoins = [...whiteSet];
      blacklistCoins = [...blackSet];
    } else {
      const nextWhite: string[] = Array.isArray(req.body?.whitelist) ? Array.from(new Set<string>(req.body.whitelist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))) : whitelistCoins;
      const nextBlack: string[] = Array.isArray(req.body?.blacklist) ? Array.from(new Set<string>(req.body.blacklist.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))) : blacklistCoins;
      whitelistCoins = nextWhite;
      blacklistCoins = nextBlack.filter((x:string)=>!whitelistCoins.includes(x));
    }
    let conf:any = {};
    if (fs.existsSync("config.json")) conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
    conf.exchange = { ...(conf.exchange || {}), pair_whitelist: whitelistCoins, pair_blacklist: blacklistCoins };
    try { fs.writeFileSync("config.json", JSON.stringify(conf, null, 2)); } catch (e:any) { return res.status(500).json({ ok:false, error:`Pairlist kaydedilemedi: ${e?.message || e}` }); }
    res.json({ ok:true, whitelist:whitelistCoins, blacklist:blacklistCoins });
  } catch (e:any) { res.status(400).json({ ok:false, error:e?.message || "Pairlist geçersiz" }); }
});
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
  const { apiKey, secretKey, environment } = req.body;
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
    } catch(e: any) {
      return res.status(500).json({ success: false, message: "Binance API anahtarları temizlenemedi." });
    }
    try { await initializeExchange(); } catch {}
    return res.json({ success: true, balance_usdt: 0, environment: getBinanceEnvironment() });
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
    const selectedEnv = String(environment || getBinanceEnvironment()).toLowerCase();
    const isDemo = selectedEnv === "testnet" || selectedEnv === "demo" || selectedEnv === "sandbox";
    if (isDemo) {
      if (typeof (tempExchange as any).enableDemoTrading !== "function") {
        throw new Error("CCXT sürümü Binance Demo Trading'i desteklemiyor. `npm install` ile güncel bağımlılıkları kurun.");
      }
      (tempExchange as any).enableDemoTrading(true);
    }
    
    // Test balance fetching directly from Futures only
    let usdt = 0;
    try {
      const balFut = await tempExchange.fetchBalance({ type: "future" });
      usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
    } catch (errFut: any) {
      const rawErr = errFut?.message || "Futures Testnet/Live bakiyesi okunamadı.";
      throw new Error(translateBinanceError(rawErr, currentIp));
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
      conf.exchange.environment = isDemo ? "demo" : "live";
      fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
    } catch(e: any) {
      return res.status(500).json({ success: false, message: "Binance API anahtarları güvenli biçimde kaydedilemedi." });
    }

    const initResult = await initializeExchange();
    if (!initResult?.success || !isExchangeAuthenticated) {
      return res.status(502).json({ success: false, message: initResult?.message || "Binance API kimlik doğrulaması tamamlanamadı." });
    }
    return res.json({ success: true, balance_usdt: usdt, environment: isDemo ? "demo" : "live" });
  } catch(e: any) {
    const translated = translateBinanceError(e.message || "", currentIp);
    return res.status(502).json({ success: false, message: translated });
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
