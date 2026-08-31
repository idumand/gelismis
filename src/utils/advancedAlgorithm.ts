/**
 * Advanced Trading Algorithm v2.0
 * Order Flow + Market Microstructure Analysis
 * Designed for Binance Futures with Professional Risk Management
 */

// ============ TYPES ============
export interface OrderBookData {
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][]; // [price, quantity]
  timestamp: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketMetrics {
  bidVolume: number;
  askVolume: number;
  bidAskRatio: number; // bid volume / ask volume
  spread: number; // (ask - bid) / mid price
  pressure: number; // -1 to 1: negative = selling, positive = buying
  midPrice: number;
  immediatePressure: number; // immediate 5 levels pressure
  depthImbalance: number; // cumulative imbalance
}

export interface TechnicalIndicators {
  rsi: number;
  rsiTrend: 'overbought' | 'oversold' | 'neutral';
  macd: {
    macdLine: number;
    signal: number;
    histogram: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    position: 'upper' | 'middle' | 'lower';
  };
  ema20: number;
  ema50: number;
  trend: 'uptrend' | 'downtrend' | 'sideways';
  vmaScale: number; // Volume momentum scale
}

export interface AlgorithmDecision {
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number; // 0 to 100
  expectedProfitPct: number; // Expected profit percentage (1x basis)
  expectedProfitAtLeverage: number; // After applying leverage
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  reasoning: string[];
  shouldOpen: boolean; // Should we actually open position?
  minimumProfitMet: boolean; // Is expected profit > minimum?
  orderFlowScore: number; // -100 to 100
  technicalScore: number; // -100 to 100
  volatilityAdjustment: number; // Risk adjustment factor
}

export interface AlgorithmConfig {
  minimumProfitPctAt1x: number; // Minimum profit % at 1x leverage
  currentLeverage: number;
  stakeAmount: number; // Entry amount in USDT
  commission: number; // Total roundtrip fee percentage (0.08 for 0.04% maker+taker)
  slippageAdjustment: number; // Additional slippage % to add to calculations
  maxSpreadTolerance: number; // Max spread to accept (%)
  volatilityThreshold: number; // Volatility threshold for signal
}

// ============ INDICATOR CALCULATIONS ============
export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period) return 50;
  
  const changes = closes.slice(-period).reduce((acc, val, idx) => {
    if (idx > 0) {
      acc.push(val - closes[closes.length - period + idx - 1]);
    }
    return acc;
  }, [] as number[]);

  const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;

  const rs = losses === 0 ? 100 : gains === 0 ? 0 : gains / losses;
  return 100 - (100 / (1 + rs));
}

export function calculateMACD(closes: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  if (closes.length < slowPeriod) return { macdLine: 0, signal: 0, histogram: 0 };

  const ema12 = calculateEMA(closes, fastPeriod);
  const ema26 = calculateEMA(closes, slowPeriod);
  const macdLine = ema12 - ema26;

  // Simple calculation for signal line
  const signalLine = (macdLine + (closes[closes.length - 2] ? macdLine * 0.8 : 0)) / 2;
  const histogram = macdLine - signalLine;

  return { macdLine, signal: signalLine, histogram };
}

export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  
  return ema;
}

export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function calculateBollingerBands(closes: number[], period: number = 20, stdDevs: number = 2) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };

  const middle = calculateSMA(closes, period);
  const squaredDiffs = closes.slice(-period).map(c => Math.pow(c - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDev * stdDevs,
    middle,
    lower: middle - stdDev * stdDevs
  };
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period) return 0;

  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }

  return calculateSMA(trs, period);
}

// ============ ORDER FLOW ANALYSIS ============
export function analyzeOrderFlowAndImbalance(orderBook: OrderBookData, previousOrderBook?: OrderBookData): MarketMetrics {
  const { bids, asks } = orderBook;
  
  // Calculate immediate volumes
  const bidLevelsToAnalyze = Math.min(10, bids.length);
  const askLevelsToAnalyze = Math.min(10, asks.length);

  let bidVolume = 0;
  let askVolume = 0;

  // Immediate 5 levels (most critical)
  const immediateBidVolume = bids.slice(0, 5).reduce((sum, [_, qty]) => sum + qty, 0);
  const immediateAskVolume = asks.slice(0, 5).reduce((sum, [_, qty]) => sum + qty, 0);
  const immediatePressure = (immediateBidVolume - immediateAskVolume) / (immediateBidVolume + immediateAskVolume || 1);

  // Deeper analysis
  for (let i = 0; i < bidLevelsToAnalyze; i++) {
    bidVolume += bids[i][1];
  }
  for (let i = 0; i < askLevelsToAnalyze; i++) {
    askVolume += asks[i][1];
  }

  const midPrice = (bids[0]?.[0] + asks[0]?.[0]) / 2 || 0;
  const spread = asks[0]?.[0] && bids[0]?.[0] 
    ? ((asks[0][0] - bids[0][0]) / midPrice) * 100 
    : 0;

  // Pressure calculation: positive = bullish, negative = bearish
  const pressure = (bidVolume - askVolume) / (bidVolume + askVolume || 1);

  // Depth Imbalance: weighted analysis
  let depthImbalance = 0;
  for (let i = 0; i < Math.min(20, bids.length, asks.length); i++) {
    const weight = 1 / (i + 1); // Closer levels have more weight
    const bidQty = bids[i]?.[1] || 0;
    const askQty = asks[i]?.[1] || 0;
    depthImbalance += (bidQty - askQty) * weight;
  }
  depthImbalance = depthImbalance / (bidVolume + askVolume || 1);

  return {
    bidVolume,
    askVolume,
    bidAskRatio: askVolume > 0 ? bidVolume / askVolume : 0,
    spread,
    pressure, // -1 to 1
    midPrice,
    immediatePressure, // focuses on immediate levels
    depthImbalance // normalized
  };
}

// ============ TECHNICAL ANALYSIS ============
export function calculateTechnicalIndicators(candles: CandleData[]): TechnicalIndicators {
  if (candles.length < 50) {
    return {
      rsi: 50,
      rsiTrend: 'neutral',
      macd: { macdLine: 0, signal: 0, histogram: 0, trend: 'neutral' },
      bollingerBands: { upper: 0, middle: 0, lower: 0, position: 'middle' },
      ema20: 0,
      ema50: 0,
      trend: 'sideways',
      vmaScale: 1
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // RSI
  const rsi = calculateRSI(closes, 14);
  const rsiTrend = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';

  // MACD
  const macd = calculateMACD(closes);
  const macdTrend = macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral';

  // Bollinger Bands
  const bb = calculateBollingerBands(closes, 20);
  const lastClose = closes[closes.length - 1];
  const bbPosition = lastClose > bb.upper ? 'upper' : lastClose < bb.lower ? 'lower' : 'middle';

  // EMAs
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  // Trend
  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  if (ema20 > ema50 && closes[closes.length - 1] > ema20) {
    trend = 'uptrend';
  } else if (ema20 < ema50 && closes[closes.length - 1] < ema20) {
    trend = 'downtrend';
  }

  // Volume momentum
  const avgVolume = calculateSMA(volumes, 20);
  const currentVolume = volumes[volumes.length - 1];
  const vmaScale = avgVolume > 0 ? currentVolume / avgVolume : 1;

  return {
    rsi,
    rsiTrend,
    macd: { ...macd, trend: macdTrend },
    bollingerBands: { ...bb, position: bbPosition },
    ema20,
    ema50,
    trend,
    vmaScale: Math.min(vmaScale, 3) // Cap at 3x
  };
}

// ============ PROFIT CALCULATION ============
export function calculateExpectedProfit(
  entryPrice: number,
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  leverage: number = 1,
  commission: number = 0.08,
  slippage: number = 0.05
): { profitPct1x: number; profitAtLeverage: number; afterCommission: number } {
  let profitPct1x: number;

  if (direction === 'LONG') {
    profitPct1x = ((currentPrice - entryPrice) / entryPrice) * 100;
  } else {
    profitPct1x = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  // Subtract slippage and commission from profit
  const slippageCost = slippage;
  const commissionCost = commission;
  const afterCommission = profitPct1x - slippageCost - commissionCost;
  const profitAtLeverage = afterCommission * leverage;

  return {
    profitPct1x,
    profitAtLeverage,
    afterCommission
  };
}

export function calculateProfitTargetPrice(
  entryPrice: number,
  targetProfitPct: number,
  direction: 'LONG' | 'SHORT',
  leverage: number = 1
): number {
  const profitPct = (targetProfitPct / leverage); // Scale down by leverage

  if (direction === 'LONG') {
    return entryPrice * (1 + profitPct / 100);
  } else {
    return entryPrice * (1 - profitPct / 100);
  }
}

// ============ MAIN ALGORITHM ============
export function generateTradingSignal(
  currentPrice: number,
  orderBook: OrderBookData,
  candles: CandleData[],
  config: AlgorithmConfig
): AlgorithmDecision {
  const reasoning: string[] = [];
  let orderFlowScore = 0;
  let technicalScore = 0;

  // 1. Order Flow Analysis
  const orderFlow = analyzeOrderFlowAndImbalance(orderBook);
  
  // Order flow scoring
  const pressureScore = orderFlow.pressure * 100; // -100 to 100
  const imbalanceScore = orderFlow.depthImbalance * 100; // -100 to 100
  const immediatePressureScore = orderFlow.immediatePressure * 100;
  
  orderFlowScore = (pressureScore * 0.5 + immediatePressureScore * 0.5);
  
  if (Math.abs(orderFlowScore) < 20) {
    reasoning.push(`Weak order flow signal (score: ${orderFlowScore.toFixed(1)})`);
  } else if (orderFlowScore > 40) {
    reasoning.push(`Strong buying pressure (score: ${orderFlowScore.toFixed(1)})`);
  } else if (orderFlowScore < -40) {
    reasoning.push(`Strong selling pressure (score: ${orderFlowScore.toFixed(1)})`);
  }

  // 2. Technical Analysis
  const technicals = calculateTechnicalIndicators(candles);
  
  // Technical scoring
  let techScore = 0;
  
  // RSI contribution
  if (technicals.rsiTrend === 'oversold') {
    techScore += 40;
    reasoning.push(`RSI ${technicals.rsi.toFixed(1)} - Oversold`);
  } else if (technicals.rsiTrend === 'overbought') {
    techScore -= 40;
    reasoning.push(`RSI ${technicals.rsi.toFixed(1)} - Overbought`);
  } else {
    techScore += (technicals.rsi - 50) * 0.4;
  }

  // MACD contribution
  if (technicals.macd.trend === 'bullish') {
    techScore += 30;
    reasoning.push(`MACD histogram positive - Bullish`);
  } else if (technicals.macd.trend === 'bearish') {
    techScore -= 30;
    reasoning.push(`MACD histogram negative - Bearish`);
  }

  // Trend contribution
  if (technicals.trend === 'uptrend') {
    techScore += 20;
    reasoning.push(`EMA trend: Uptrend`);
  } else if (technicals.trend === 'downtrend') {
    techScore -= 20;
    reasoning.push(`EMA trend: Downtrend`);
  }

  // Volume contribution
  if (technicals.vmaScale > 1.5) {
    techScore += 15 * (technicals.vmaScale - 1);
    reasoning.push(`Volume surge detected (${technicals.vmaScale.toFixed(2)}x)`);
  }

  technicalScore = Math.max(-100, Math.min(100, techScore));

  // 3. Determine Direction
  let signal: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0;

  const combinedScore = (orderFlowScore * 0.6 + technicalScore * 0.4); // Favor order flow
  
  if (combinedScore > 35) {
    signal = 'LONG';
    confidence = Math.min(95, 50 + Math.abs(combinedScore) / 2);
  } else if (combinedScore < -35) {
    signal = 'SHORT';
    confidence = Math.min(95, 50 + Math.abs(combinedScore) / 2);
  } else {
    signal = 'NEUTRAL';
    confidence = Math.max(0, 50 - Math.abs(combinedScore));
    reasoning.push(`Insufficient signal strength (score: ${combinedScore.toFixed(1)})`);
  }

  // 4. Calculate Entry and Targets
  const atr = calculateATR(
    candles.map(c => c.high),
    candles.map(c => c.low),
    candles.map(c => c.close),
    14
  );

  let entryPrice = currentPrice;
  let stopLossPrice = 0;
  let takeProfitPrice = 0;

  if (signal === 'LONG') {
    stopLossPrice = currentPrice - (atr * 1.5);
    takeProfitPrice = currentPrice + (atr * 3);
  } else if (signal === 'SHORT') {
    stopLossPrice = currentPrice + (atr * 1.5);
    takeProfitPrice = currentPrice - (atr * 3);
  }

  // 5. Calculate Profit
  const profitCalc = calculateExpectedProfit(
    entryPrice,
    takeProfitPrice,
    signal,
    config.currentLeverage,
    config.commission,
    config.slippageAdjustment
  );

  const riskPips = Math.abs(stopLossPrice - entryPrice);
  const profitPips = Math.abs(takeProfitPrice - entryPrice);
  const riskRewardRatio = riskPips > 0 ? profitPips / riskPips : 0;

  // 6. Minimum Profit Check
  const minimumProfitMet = profitCalc.afterCommission >= config.minimumProfitPctAt1x;

  if (!minimumProfitMet && signal !== 'NEUTRAL') {
    reasoning.push(
      `Profit ${profitCalc.afterCommission.toFixed(2)}% < Minimum ${config.minimumProfitPctAt1x}%`
    );
  }

  // 7. Volatility Adjustment
  const volatilityAdjustment = Math.min(2, Math.max(0.5, technicals.vmaScale));

  // 8. Final Decision
  const shouldOpen = signal !== 'NEUTRAL' && 
                     minimumProfitMet && 
                     confidence >= 60 && 
                     orderFlow.spread < config.maxSpreadTolerance &&
                     Math.abs(combinedScore) > 40;

  if (shouldOpen) {
    reasoning.push(`✅ SIGNAL CONFIRMED - Open ${signal} position`);
  } else if (signal !== 'NEUTRAL') {
    reasoning.push(`❌ Conditions not met for entry`);
  }

  return {
    signal,
    confidence,
    expectedProfitPct: profitCalc.profitPct1x,
    expectedProfitAtLeverage: profitCalc.profitAtLeverage,
    entryPrice,
    takeProfitPrice,
    stopLossPrice,
    riskRewardRatio,
    reasoning,
    shouldOpen,
    minimumProfitMet,
    orderFlowScore,
    technicalScore,
    volatilityAdjustment
  };
}

// ============ MARKET QUALITY CHECK ============
export function isMarketQualityAcceptable(orderFlow: MarketMetrics, config: AlgorithmConfig): boolean {
  // Check spread
  if (orderFlow.spread > config.maxSpreadTolerance) {
    return false;
  }

  // Check minimum liquidity (bid+ask volume should be reasonable)
  const totalVolume = orderFlow.bidVolume + orderFlow.askVolume;
  if (totalVolume < 1000) {
    // Less than $1000 in order book depth
    return false;
  }

  return true;
}
