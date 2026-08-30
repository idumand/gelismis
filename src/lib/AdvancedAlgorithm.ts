/**
 * GELİŞMİŞ TİCARET ALGORİTMASI v2.0
 * 
 * Özellikler:
 * - Order Flow Imbalance (OFI) Analizi
 * - Market Microstructure (Piyasa Yapısı)
 * - Dinamik Hedef Hesabı
 * - Minimum Kar Filtresi
 * - Risk-Adjusted Position Sizing
 * - Long/Short Taraf Baskı Analizi
 */

export interface OrderFlowData {
  buyVolume: number;
  sellVolume: number;
  volumeImbalance: number;
  pressure: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  pressureScore: number; // -1 to 1
  lastUpdate: number;
}

export interface MarketMicrostructure {
  bidAskSpread: number;
  spreadPercentage: number;
  orderBookDepth: number;
  liquidity: "very_low" | "low" | "medium" | "high" | "very_high";
  microstructureScore: number; // 0-1
}

export interface PositionAnalysis {
  entryPrice: number;
  currentPrice: number;
  potentialProfitUSD: number;
  potentialProfitPct: number;
  targetPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  breakEvenPrice: number;
  expectedMovement: number;
  expectedMovementPct: number;
  exitStrategy: string;
  confidence: number; // 0-1
  minProfitThreshold: boolean;
}

export interface AlgorithmMetrics {
  timestamp: number;
  pair: string;
  orderFlow: OrderFlowData;
  microstructure: MarketMicrostructure;
  technicalSignals: TechnicalSignals;
  positionAnalysis: PositionAnalysis;
  recommendation: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  algorithmScore: number; // 0-100
}

export interface TechnicalSignals {
  rsi: number;
  macd: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    signal: "above" | "middle" | "below";
  };
  vwap: number;
  sma200: number;
  ema50: number;
  trend: "strong_up" | "up" | "neutral" | "down" | "strong_down";
  trendStrength: number; // 0-1
}

export class AdvancedAlgorithm {
  private minProfitThresholdPct: number = 0.5; // Default 0.5%

  constructor(minProfitThresholdPct?: number) {
    if (minProfitThresholdPct !== undefined) {
      this.minProfitThresholdPct = minProfitThresholdPct;
    }
  }

  /**
   * Order Flow Imbalance (OFI) analizi
   * Long/Short para akışını hesaplar
   */
  analyzeOrderFlow(
    orderBook: { bids: [number, number][]; asks: [number, number][] },
    trades: any[]
  ): OrderFlowData {
    if (!orderBook || !trades) {
      return {
        buyVolume: 0,
        sellVolume: 0,
        volumeImbalance: 0,
        pressure: "neutral",
        pressureScore: 0,
        lastUpdate: Date.now(),
      };
    }

    // Bid/Ask Depth Analizi
    const bidVolume = orderBook.bids
      .slice(0, 20)
      .reduce((sum, [_, vol]) => sum + vol, 0);
    const askVolume = orderBook.asks
      .slice(0, 20)
      .reduce((sum, [_, vol]) => sum + vol, 0);

    // Trade Flow Analizi (Son 100 işlem)
    const recentTrades = trades.slice(-100);
    let buyVolume = 0;
    let sellVolume = 0;

    recentTrades.forEach((trade) => {
      if (trade.side === "buy") {
        buyVolume += trade.amount * trade.price;
      } else {
        sellVolume += trade.amount * trade.price;
      }
    });

    // Kombinasyon: Bid-Ask Depth + Trade Flow
    const totalBuyPressure = bidVolume + buyVolume;
    const totalSellPressure = askVolume + sellVolume;
    const totalVolume = totalBuyPressure + totalSellPressure;

    let volumeImbalance = 0;
    let pressureScore = 0;

    if (totalVolume > 0) {
      volumeImbalance = totalBuyPressure - totalSellPressure;
      pressureScore = (totalBuyPressure - totalSellPressure) / totalVolume;
    }

    // Sınıflandırma
    let pressure: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

    if (pressureScore > 0.3) pressure = "strong_buy";
    else if (pressureScore > 0.1) pressure = "buy";
    else if (pressureScore < -0.3) pressure = "strong_sell";
    else if (pressureScore < -0.1) pressure = "sell";
    else pressure = "neutral";

    return {
      buyVolume: totalBuyPressure,
      sellVolume: totalSellPressure,
      volumeImbalance: Math.abs(volumeImbalance),
      pressure,
      pressureScore: Math.max(-1, Math.min(1, pressureScore)),
      lastUpdate: Date.now(),
    };
  }

  /**
   * Market Microstructure (Piyasa Yapısı) Analizi
   */
  analyzeMarketStructure(
    orderBook: { bids: [number, number][]; asks: [number, number][] }
  ): MarketMicrostructure {
    if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
      return {
        bidAskSpread: 0,
        spreadPercentage: 0,
        orderBookDepth: 0,
        liquidity: "very_low",
        microstructureScore: 0,
      };
    }

    const bestBid = orderBook.bids[0][0];
    const bestAsk = orderBook.asks[0][0];
    const midPrice = (bestBid + bestAsk) / 2;

    const bidAskSpread = bestAsk - bestBid;
    const spreadPercentage = (bidAskSpread / midPrice) * 100;

    // Order Book Derinliği (20 level)
    const bidVolume = orderBook.bids
      .slice(0, 20)
      .reduce((sum, [_, vol]) => sum + vol, 0);
    const askVolume = orderBook.asks
      .slice(0, 20)
      .reduce((sum, [_, vol]) => sum + vol, 0);
    const totalDepth = bidVolume + askVolume;

    // Likidite Sınıflandırması
    let liquidity: "very_low" | "low" | "medium" | "high" | "very_high";

    if (spreadPercentage > 0.5) liquidity = "very_low";
    else if (spreadPercentage > 0.2) liquidity = "low";
    else if (spreadPercentage > 0.1) liquidity = "medium";
    else if (spreadPercentage > 0.05) liquidity = "high";
    else liquidity = "very_high";

    // Microstructure Skoru (0-1)
    const depthScore = Math.min(1, totalDepth / 1000000); // 1M+ = mükemmel
    const spreadScore = Math.max(0, 1 - spreadPercentage / 0.5);
    const microstructureScore = (depthScore + spreadScore) / 2;

    return {
      bidAskSpread,
      spreadPercentage,
      orderBookDepth: totalDepth,
      liquidity,
      microstructureScore,
    };
  }

  /**
   * Dinamik Kar Hedefi Hesabı
   * Order flow ve market structure'a göre dinamik hedef belirler
   */
  calculateDynamicTarget(
    entryPrice: number,
    stopLossPrice: number,
    orderFlow: OrderFlowData,
    microstructure: MarketMicrostructure,
    leverage: number = 1
  ): {
    targetPrice: number;
    expectedProfit: number;
    expectedProfitPct: number;
    confidence: number;
  } {
    const riskAmount = Math.abs(entryPrice - stopLossPrice);

    // Order Flow tarafından hedef çarpanı
    const flowMultiplier = Math.abs(orderFlow.pressureScore) * 2 + 1; // 1-3x

    // Microstructure tarafından hedef çarpanı (likidite arttıkça daha geniş hedef)
    const liquidityMultiplier = 0.5 + microstructure.microstructureScore * 1.5; // 0.5-2x

    // Leverage tarafından hedef çarpanı
    const leverageMultiplier = 1 + (leverage - 1) * 0.5; // Conservative adjustment

    // Final Risk Multiplier
    const totalRiskMultiplier =
      flowMultiplier * liquidityMultiplier * leverageMultiplier;

    // Target Price (Risk-Reward = 1:2 base, multiplied by factors)
    const isLong = orderFlow.pressureScore > 0;
    const targetPrice = isLong
      ? entryPrice + riskAmount * totalRiskMultiplier
      : entryPrice - riskAmount * totalRiskMultiplier;

    const expectedProfit = Math.abs(targetPrice - entryPrice);
    const expectedProfitPct = (expectedProfit / entryPrice) * 100;

    // Confidence (Order flow strength)
    const confidence = Math.min(1, Math.abs(orderFlow.pressureScore));

    return {
      targetPrice,
      expectedProfit,
      expectedProfitPct,
      confidence,
    };
  }

  /**
   * Minimum Kar Filtresi
   * Belirlenen minimum kar yüzdesinin altında işlem açmaz
   */
  checkMinimumProfitThreshold(expectedProfitPct: number): boolean {
    return expectedProfitPct >= this.minProfitThresholdPct;
  }

  /**
   * Position Analizi (Gerçek zamanlı)
   */
  analyzePosition(
    entryPrice: number,
    currentPrice: number,
    stopLossPrice: number,
    amount: number,
    leverage: number,
    fees: number = 0.0004
  ): PositionAnalysis {
    const isLong = currentPrice >= entryPrice;
    const priceDifference = currentPrice - entryPrice;
    const potentialProfitPct = (priceDifference / entryPrice) * 100 * leverage;
    const potentialProfitUSD = amount * priceDifference * leverage;

    // Risk-Reward Ratio
    const riskAmount = Math.abs(entryPrice - stopLossPrice) * leverage;
    const rewardAmount = Math.abs(currentPrice - entryPrice) * leverage;
    const riskRewardRatio = riskAmount > 0 ? rewardAmount / riskAmount : 0;

    // Dynamic Target (trailing stop gibi)
    const peakProfit = Math.max(0, potentialProfitUSD);
    const dynamicStopLoss = entryPrice + (currentPrice - entryPrice) * 0.5;

    // Break-even
    const breakEvenPrice = entryPrice * (1 + fees);

    // Expected Movement Analizi
    const expectedMovement = Math.abs(currentPrice - stopLossPrice);
    const expectedMovementPct = (expectedMovement / entryPrice) * 100;

    // Exit Strategy
    let exitStrategy = "HOLD";
    if (potentialProfitPct >= 2) exitStrategy = "TAKE_PROFIT";
    else if (potentialProfitPct <= -1) exitStrategy = "STOP_LOSS";

    // Minimum kar kontrolü
    const minProfitThreshold = this.checkMinimumProfitThreshold(
      potentialProfitPct
    );

    return {
      entryPrice,
      currentPrice,
      potentialProfitUSD: Number(potentialProfitUSD.toFixed(2)),
      potentialProfitPct: Number(potentialProfitPct.toFixed(2)),
      targetPrice: entryPrice + (currentPrice - entryPrice) * 1.5,
      stopLossPrice,
      riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
      breakEvenPrice: Number(breakEvenPrice.toFixed(8)),
      expectedMovement: Number(expectedMovement.toFixed(8)),
      expectedMovementPct: Number(expectedMovementPct.toFixed(2)),
      exitStrategy,
      confidence: Math.min(1, Math.abs(riskRewardRatio) / 2),
      minProfitThreshold,
    };
  }

  /**
   * Bütünleşik Algoritma Skoru (0-100)
   */
  calculateAlgorithmScore(metrics: {
    orderFlow: OrderFlowData;
    microstructure: MarketMicrostructure;
    technicalSignals: TechnicalSignals;
    positionAnalysis?: PositionAnalysis;
  }): number {
    let score = 50; // Base score

    // Order Flow (0-20 puan)
    const orderFlowScore =
      Math.abs(metrics.orderFlow.pressureScore) * 20;
    score += orderFlowScore;

    // Microstructure (0-15 puan)
    const microScore = metrics.microstructure.microstructureScore * 15;
    score += microScore;

    // Technical Signals (0-25 puan)
    const rsiScore = metrics.technicalSignals.rsi > 50 ? 5 : 0;
    const trendScore = metrics.technicalSignals.trendStrength * 15;
    const macdScore = (metrics.technicalSignals.macd > 0 ? 1 : 0) * 5;
    score += rsiScore + trendScore + macdScore;

    // Position Analysis (0-25 puan)
    if (metrics.positionAnalysis) {
      const rrScore = Math.min(
        25,
        metrics.positionAnalysis.riskRewardRatio * 12.5
      );
      score += rrScore;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Minimum kar yüzdesini güncelle
   */
  setMinimumProfitThreshold(minProfitPct: number): void {
    this.minProfitThresholdPct = Math.max(0, minProfitPct);
  }

  /**
   * Güncel minimum kar yüzdesini al
   */
  getMinimumProfitThreshold(): number {
    return this.minProfitThresholdPct;
  }
}
