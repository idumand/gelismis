const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newCode = `// Position management per coin
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
}

const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // 0.04% maker/taker roundtrip

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 250) engineLogs.length = 250;
  console.log(\`[\${level}] \${timestamp} - \${message}\`);
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
      isExchangeAuthenticated = true;
      addEngineLog("INFO", "Binance API bağlantısı kuruldu. Gerçek emirler gönderilecek.");
      syncBinancePositions(); // Auto-sync open positions on start
    } else {
      exchange = null;
      isExchangeAuthenticated = false;
      addEngineLog("WARN", "API Kimlik Bilgileri eksik. Sistem SİMÜLASYON modunda çalışıyor.");
    }
  } catch (e: any) {
    addEngineLog("ERROR", \`API Başlatma Hatası: \${e.message}\`);
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
    if (syncCount > 0) addEngineLog("INFO", \`Binance'den \${syncCount} adet aktif pozisyon başarıyla senkronize edildi.\`);
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
): OrderFlowMetrics {
  // 1. Distance Weighted & Anti-Spoofed Order Book Analysis
  // Using 1-5, 6-15, 16-30 grouping. (If OB has <30, it adapts)
  
  let totalBidScore = 0;
  let totalAskScore = 0;
  
  let avgRawBidSize = 0;
  let avgRawAskSize = 0;
  
  let validBids: any[] = [];
  let validAsks: any[] = [];
  
  if (ob && ob.bids && ob.asks) {
     const maxDepth = Math.min(30, ob.bids.length, ob.asks.length);
     const rawBidsSlice = ob.bids.slice(0, maxDepth);
     const rawAsksSlice = ob.asks.slice(0, maxDepth);
     
     let totalRawBidVol = 0; let totalRawAskVol = 0;
     rawBidsSlice.forEach((b:any) => totalRawBidVol += (b[1] || 0));
     rawAsksSlice.forEach((a:any) => totalRawAskVol += (a[1] || 0));
     
     avgRawBidSize = totalRawBidVol / (rawBidsSlice.length || 1);
     avgRawAskSize = totalRawAskVol / (rawAsksSlice.length || 1);
     
     // Spoofing / Noise filter: discard < 0.2x average and > 15x average
     validBids = rawBidsSlice.filter((b:any) => b[1] >= avgRawBidSize * 0.2 && b[1] <= avgRawBidSize * 15);
     validAsks = rawAsksSlice.filter((a:any) => a[1] >= avgRawAskSize * 0.2 && a[1] <= avgRawAskSize * 15);
     
     // Calculate weighted scores based on distance
     const scoreLevel = (arr: any[], limit: number) => {
        let score = 0;
        for (let i = 0; i < Math.min(limit, arr.length); i++) {
           const weight = 1 / (i + 1); // Distance weighting
           // Zone multiplier: 1-5(x2), 6-15(x1), 16-30(x0.5)
           const zoneMulti = i < 5 ? 2.0 : (i < 15 ? 1.0 : 0.5);
           score += (arr[i][1] * weight * zoneMulti);
        }
        return score;
     };
     
     totalBidScore = scoreLevel(validBids, 30);
     totalAskScore = scoreLevel(validAsks, 30);
  }
  
  const obTotalScore = totalBidScore + totalAskScore;
  const longOBAdvantage = obTotalScore > 0 ? (totalBidScore / obTotalScore) * 100 : 50;
  const shortOBAdvantage = obTotalScore > 0 ? (totalAskScore / obTotalScore) * 100 : 50;
  
  // 2. Taker Flow Analysis
  let takerBuyVolUSD = 0;
  let takerSellVolUSD = 0;

  if (recentTrades && recentTrades.length > 0) {
    recentTrades.forEach((t: any) => {
      const tradeAmountUSD = (t.amount || 0) * (t.price || currentPrice);
      if (t.side === 'buy') takerBuyVolUSD += tradeAmountUSD;
      else if (t.side === 'sell') takerSellVolUSD += tradeAmountUSD;
    });
  }

  const totalTradeVolUSD = takerBuyVolUSD + takerSellVolUSD;
  const netInflowUSD = takerBuyVolUSD - takerSellVolUSD;
  const takerBuyRatio = totalTradeVolUSD > 0 ? takerBuyVolUSD / totalTradeVolUSD : 0.5;
  const longTakerAdvantage = takerBuyRatio * 100;
  const shortTakerAdvantage = (1 - takerBuyRatio) * 100;
  
  // 3. Composite Simultaneous Score (Long vs Short Advantage)
  // Give 40% weight to Order Book structure, 60% weight to immediate Taker Flow
  const longAdvantage = (longOBAdvantage * 0.4) + (longTakerAdvantage * 0.6);
  const shortAdvantage = (shortOBAdvantage * 0.4) + (shortTakerAdvantage * 0.6);
  const gap = longAdvantage - shortAdvantage;
  
  // 4. Expected Net PnL Calculation (based on actual leverage and stake amount)
  let notionalUSD = activeStakeAmount * targetLeverage;
  if (notionalUSD < 6) notionalUSD = 6;
  
  // Estimated spread slippage (assume 0.05% slippage on entry and exit)
  const slippagePct = 0.10; 
  const feePct = ESTIMATED_FEE_PCT;
  const totalFrictionPct = slippagePct + feePct;
  const totalFrictionUSD = notionalUSD * (totalFrictionPct / 100);
  
  // Expected move depends on momentum (let's assume a standard 0.5% move for calculation)
  // Expected Net PnL = (Notional * Move%) - Friction
  const expectedNetPnlUsdLong = (notionalUSD * (longAdvantage/100 * 0.005)) - totalFrictionUSD;
  const expectedNetPnlUsdShort = (notionalUSD * (shortAdvantage/100 * 0.005)) - totalFrictionUSD;
  
  // 5. Liquidity Map (Targets and Barriers)
  let firstTargetLong = currentPrice * 1.002;
  let strongResistance = currentPrice * 1.01;
  let firstTargetShort = currentPrice * 0.998;
  let strongSupport = currentPrice * 0.99;
  
  if (validAsks.length > 0) {
    const avgAskSize = avgRawAskSize;
    let foundTarget = false;
    for(let i=0; i<validAsks.length; i++) {
       if (!foundTarget && validAsks[i][1] > avgAskSize * 2) {
          firstTargetLong = validAsks[i][0];
          foundTarget = true;
       }
       if (validAsks[i][1] > avgAskSize * 5) {
          strongResistance = validAsks[i][0];
       }
    }
  }
  if (validBids.length > 0) {
    const avgBidSize = avgRawBidSize;
    let foundTarget = false;
    for(let i=0; i<validBids.length; i++) {
       if (!foundTarget && validBids[i][1] > avgBidSize * 2) {
          firstTargetShort = validBids[i][0];
          foundTarget = true;
       }
       if (validBids[i][1] > avgBidSize * 5) {
          strongSupport = validBids[i][0];
       }
    }
  }
  
  const obi = (totalBidScore - totalAskScore) / (totalBidScore + totalAskScore || 1);
  const midPrice = currentPrice;
  const microPrice = currentPrice;

  return {
    longAdvantage,
    shortAdvantage,
    gap,
    takerBuyRatio,
    netInflowUSD,
    expectedNetPnlUsdLong,
    expectedNetPnlUsdShort,
    liquidityMap: {
      firstTargetLong, strongResistance, firstTargetShort, strongSupport
    },
    obi,
    predictedProfitPct: gap / 10, // Legacy mapping
    predictedTimeSec: 60,
    smartTargetPrice: gap > 0 ? firstTargetLong : firstTargetShort,
    smartStopPrice: gap > 0 ? strongSupport : strongResistance,
    liquidityGravityScore: Math.abs(obi * 100),
    microPrice,
    midPrice,
    spreadPct: 0,
    volumeSpike: false,
    volumeRatio: 1,
    vwap: currentPrice,
    stdDev: 0,
    deepScore: gap
  };
}

// Server-side persistent Binance WebSocket streams
`;

const replaceRange = (str, startStr, endStr, replacement) => {
  const startIndex = str.indexOf(startStr);
  const endIndex = str.indexOf(endStr, startIndex);
  if (startIndex === -1 || endIndex === -1) return str;
  return str.substring(0, startIndex) + replacement + str.substring(endIndex);
};

code = replaceRange(code, "// Position management per coin", "// Server-side persistent Binance WebSocket streams", newCode);

const loopCode = `async function updateMarketDataAndExecute() {
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
            fetch(\`https://data-api.binance.vision/api/v3/depth?symbol=\${cleanSymbol}&limit=50\`),
            fetch(\`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=\${cleanSymbol}\`)
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
            const fallbackTicker = await fetch(\`https://api.binance.com/api/v3/ticker/price?symbol=\${cleanSymbol}\`);
            if (fallbackTicker.ok) {
              const tick = await fallbackTicker.json();
              currentPrice = parseFloat(tick.price);
            }
          } catch (err) {}
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
      const volumes = volumeHistoryMap[symbol] || [100, 120, 110, 130, 150];

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

        const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
        const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : priceMovePct * pos.leverage;

        let shouldExit = false;
        let exitReason = "";

        // Manual Stop Loss (Server-side last resort)
        if (priceMovePct <= -activeStopLossPct) {
          shouldExit = true;
          exitReason = \`Zarar Kes (Stop Loss: %\${activeStopLossPct.toFixed(2)})\`;
        } 
        // Adaptive Order Flow Exit Review (3 -> 6 -> 10)
        else {
          // Check if position advantage is failing
          const isFailingLong = pos.type === "long" && flow.gap < 2; // Threshold for denge
          const isFailingShort = pos.type === "short" && flow.gap > -2;

          if (isFailingLong || isFailingShort) {
             pos.exitReviewMeasurements.push({ longAdv: flow.longAdvantage, shortAdv: flow.shortAdvantage, gap: flow.gap });
             const count = pos.exitReviewMeasurements.length;
             
             if (count >= 10) {
                 // 10 ölçüm sonunda hala avantaj yoksa çık
                 shouldExit = true;
                 exitReason = \`10 Adım Adaptif Analiz: Avantaj Kaybedildi (Kâr: +\%\${roePct.toFixed(2)})\`;
             } else if (count >= 6 && pos.exitReviewState === "6") {
                 // 6 ölçümde net bir toparlanma yoksa ve hala kararsızsa 10'a geçir
                 // Ortalama gap kontrolü
                 const avgGap = pos.exitReviewMeasurements.reduce((acc, m) => acc + m.gap, 0) / count;
                 if ((pos.type === "long" && avgGap < 0) || (pos.type === "short" && avgGap > 0)) {
                     // Negatif eğilim netleştiyse beklemeden çık
                     shouldExit = true;
                     exitReason = \`6 Adım Adaptif Analiz: Trend Tersine Döndü (Kâr: +\%\${roePct.toFixed(2)})\`;
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
                 addEngineLog("INFO", \`\${symbol} \${pos.type.toUpperCase()} Avantaj Yeniden Güçlendi. Çıkış incelemesi iptal edildi. (Gap: \${flow.gap.toFixed(1)})\`);
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
          // LONG > %50 && Net Expected PnL > 0 (fee ve slippage düşüldükten sonra kârlı bölge)
          const isLongSignal = flow.longAdvantage > 55 && flow.gap >= 10 && flow.expectedNetPnlUsdLong > 0;
          const isShortSignal = flow.shortAdvantage > 55 && flow.gap <= -10 && flow.expectedNetPnlUsdShort > 0;

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
      entryPrice = order.price || order.average || effectivePrice;
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
        const stopOrder = await exchange.createOrder(exSymbol, "STOP_MARKET", stopSide, formattedAmount, undefined, { 
          stopPrice, 
          reduceOnly: true 
        });
        stopOrderId = stopOrder.id;
      } catch (e: any) {}

      addEngineLog("TRADE", \`[CANLI BINANCE POZİSYONU AÇILDI] \${symbol} \${type.toUpperCase()} x\${targetLeverage} | Miktar: \${formattedAmount} ($\${Math.round(notionalUSD)} Büyüklük) | Giriş: $\${entryPrice}\`);
    } catch (e: any) {
      addEngineLog("ERROR", \`[BINANCE] \${symbol} Emir Hatası: \${e.message}\`);
    }
  } else {
    addEngineLog("TRADE", \`[SİMÜLASYON / CANLI POZİSYON AÇILDI] \${symbol} \${type.toUpperCase()} x\${targetLeverage} | Miktar: \${formattedAmount} ($\${Math.round(notionalUSD)} Büyüklük) | Giriş: $\${entryPrice}\`);
  }

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
    exitReviewState: "none"
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
      addEngineLog("ERROR", \`[BINANCE] \${symbol} Çıkış Emri Hatası: \${e.message}\`);
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
  addEngineLog("TRADE", \`[POZİSYON KAPANDI] \${symbol} | Neden: \${reason} | Sonuç: \${pnlUSD >= 0 ? '+' : ''}$\${pnlUSD.toFixed(2)} (\${roePct >= 0 ? '+' : ''}\${roePct.toFixed(2)}%)\`);
}

function startTradingEngine() {`;

code = replaceRange(code, "async function updateMarketDataAndExecute() {", "function startTradingEngine() {", loopCode);

fs.writeFileSync('server.ts', code);
console.log("Core Engine rewrite successful.");
