/**
 * ⚡ AKIŞKAN TİCARET ALGORİTMASI v4.0 PRO - GELİŞTİRİLMİŞ
 * 
 * 🧠 Algoritmanın Beyni:
 * - Gerçek-zamanlı Order Book Analizi
 * - Dinamik Trade Flow Takibi (Alıcı vs Satıcı Baskısı)
 * - Leverage Bazlı Kar Hesabı (1x referans)
 * - Komisyon Dahil Kazanç Analizi
 * - Akıllı Pozisyon Yönetimi
 * - Piyasa Mikro Yapısı Analizi
 * - Risk-Reward Optimizasyonu
 */

export interface OrderBookStats {
  bidAskRatio: number;
  totalBidVolume: number;
  totalAskVolume: number;
  bidAskSpread: number;
  spreadPercentage: number;
  orderBookPressure: number; // -1 to 1
  liquidityQuality: "very_low" | "low" | "medium" | "high" | "excellent";
  liquidityScore: number; // 0-100
}

export interface TradeFlowStats {
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
  flowImbalance: number; // -1 to 1
  dominantSide: "long" | "short" | "balanced";
  flowStrength: number; // 0 to 1
  volumeWeightedDirection: number; // -1 to 1
}

export interface MarketPressure {
  shortTermPressure: number; // -1 to 1
  mediumTermPressure: number; // -1 to 1
  longTermPressure: number; // -1 to 1
  overallPressure: number; // -1 to 1
  trendDirection: "strong_long" | "long" | "neutral" | "short" | "strong_short";
  trendStrength: number; // 0 to 1
  momentumScore: number; // 0 to 100
  pressureHistory: number[];
}

export interface PositionDecision {
  shouldOpen: boolean;
  side: "long" | "short";
  confidence: number; // 0 to 1
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  potentialProfitPct: number; // 1x bazında
  potentialProfitUSD: number;
  potentialLossPct: number;
  riskRewardRatio: number;
  expectedHoldTime: string;
  scalingMultiplier: number;
  reasoning: string[];
  algoThinkingProcess: AlgoThinking;
}

export interface AlgoThinking {
  orderBookAnalysis: string[];
  tradeFlowAnalysis: string[];
  pressureAnalysis: string[];
  riskAssessment: string[];
  finalDecision: string[];
}

export interface PositionMonitor {
  isOpen: boolean;
  currentProfit: number;
  currentProfitPct: number;
  unrealizedPnL: number;
  shouldClose: boolean;
  closeReason: string;
  closePrice: number;
  confidence: number;
  liveThinking: string[];
}

export interface AlgorithmMetrics {
  timestamp: number;
  pair: string;
  currentPrice: number;
  orderBook: OrderBookStats;
  tradeFlow: TradeFlowStats;
  marketPressure: MarketPressure;
  positionDecision: PositionDecision | null;
  positionMonitor: PositionMonitor | null;
  algorithmHealth: number; // 0-100
  dataQualityScore: number; // 0-100
}

export class SmartTradingAlgorithm {
  private minProfitThresholdAt1x: number = 0.5; // 1x için minimum %0.5
  private commissionRate: number = 0.001; // Binance 0.1%
  private historyBuffer: number[] = [];
  private readonly BUFFER_SIZE = 500;
  private lastOrderBookPressure = 0;
  private lastTradeFlowPressure = 0;

  constructor(minProfitAt1x?: number, commissionRate?: number) {
    this.minProfitThresholdAt1x = Math.max(0.1, minProfitAt1x || 0.5);
    this.commissionRate = Math.max(0, Math.min(0.01, commissionRate || 0.001));
  }

  /**
   * 📊 ORDER BOOK DETAYLI ANALİZİ
   */
  analyzeOrderBook(orderBook: {
    bids: [number, number][];
    asks: [number, number][];
  }): OrderBookStats {
    if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
      return {
        bidAskRatio: 1,
        totalBidVolume: 0,
        totalAskVolume: 0,
        bidAskSpread: 0,
        spreadPercentage: 0,
        orderBookPressure: 0,
        liquidityQuality: "very_low",
        liquidityScore: 0,
      };
    }

    // Top 20 level (daha hassas analiz)
    const topBids = orderBook.bids.slice(0, 20);
    const topAsks = orderBook.asks.slice(0, 20);

    // Ağırlıklı volume hesabı (yakındaki order'lar daha önemli)
    const bidWeights = topBids.map((_, i) => 1 - i * 0.03);
    const askWeights = topAsks.map((_, i) => 1 - i * 0.03);

    const totalBidVolume = topBids.reduce((sum, [_, vol], i) => sum + vol * bidWeights[i], 0);
    const totalAskVolume = topAsks.reduce((sum, [_, vol], i) => sum + vol * askWeights[i], 0);

    const bestBid = orderBook.bids[0][0];
    const bestAsk = orderBook.asks[0][0];
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / midPrice) * 100;

    // Bid/Ask oranı
    const bidAskRatio = Math.max(0.1, Math.min(10, totalBidVolume / Math.max(1, totalAskVolume)));

    // Order book baskısı (-1: satıcı, +1: alıcı)
    const obPressure =
      (totalBidVolume - totalAskVolume) / (totalBidVolume + totalAskVolume);

    this.lastOrderBookPressure = obPressure;

    // Likidite kalitesi ve skoru
    let liquidityQuality: "very_low" | "low" | "medium" | "high" | "excellent";
    let liquidityScore = 0;

    if (spreadPct > 0.5) {
      liquidityQuality = "very_low";
      liquidityScore = 10;
    } else if (spreadPct > 0.2) {
      liquidityQuality = "low";
      liquidityScore = 30;
    } else if (spreadPct > 0.1) {
      liquidityQuality = "medium";
      liquidityScore = 50;
    } else if (spreadPct > 0.05) {
      liquidityQuality = "high";
      liquidityScore = 75;
    } else {
      liquidityQuality = "excellent";
      liquidityScore = 95;
    }

    // Volume kalitesi
    const totalVolume = totalBidVolume + totalAskVolume;
    if (totalVolume > 100000) liquidityScore = Math.min(100, liquidityScore + 10);

    return {
      bidAskRatio,
      totalBidVolume,
      totalAskVolume,
      bidAskSpread: spread,
      spreadPercentage: spreadPct,
      orderBookPressure: Math.max(-1, Math.min(1, obPressure)),
      liquidityQuality,
      liquidityScore,
    };
  }

  /**
   * 💾 İŞLEM AKIŞI ANALİZİ (Alıcı vs Satıcı Baskısı)
   */
  analyzeTradeFlow(trades: any[]): TradeFlowStats {
    if (!trades?.length) {
      return {
        buyVolume: 0,
        sellVolume: 0,
        buyCount: 0,
        sellCount: 0,
        flowImbalance: 0,
        dominantSide: "balanced",
        flowStrength: 0,
        volumeWeightedDirection: 0,
      };
    }

    // Son 300 işlemi analiz et
    const recentTrades = trades.slice(-300);
    let buyVolume = 0;
    let sellVolume = 0;
    let buyCount = 0;
    let sellCount = 0;

    recentTrades.forEach((trade) => {
      const volume = (trade.amount || 0) * (trade.price || 0);
      if (trade.side === "buy") {
        buyVolume += volume;
        buyCount++;
      } else {
        sellVolume += volume;
        sellCount++;
      }
    });

    const totalVolume = buyVolume + sellVolume;
    const flowImbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

    // Dominat taraf belirleme (daha hassas)
    let dominantSide: "long" | "short" | "balanced";
    if (flowImbalance > 0.2) dominantSide = "long";
    else if (flowImbalance < -0.2) dominantSide = "short";
    else dominantSide = "balanced";

    // Hacim ağırlıklı yön
    const volumeWeightedDirection = Math.max(-1, Math.min(1, flowImbalance * (buyCount + sellCount) / 100));

    this.lastTradeFlowPressure = flowImbalance;

    return {
      buyVolume,
      sellVolume,
      buyCount,
      sellCount,
      flowImbalance: Math.max(-1, Math.min(1, flowImbalance)),
      dominantSide,
      flowStrength: Math.abs(flowImbalance),
      volumeWeightedDirection,
    };
  }

  /**
   * 🎯 PİYASA BASKISI VE MOMENTUM ANALİZİ
   */
  analyzeMarketPressure(
    orderBook: OrderBookStats,
    tradeFlow: TradeFlowStats,
    technicalIndicators: {
      rsi?: number;
      macd?: number;
      trend?: string;
      bollingerPosition?: number;
    }
  ): MarketPressure {
    // Multi-timeframe baskı hesabı
    const obPressure = orderBook.orderBookPressure * 0.35; // Order book: %35
    const tfPressure = tradeFlow.flowImbalance * 0.45; // Trade flow: %45
    
    // Technical göstergeler
    let techScore = 0;
    if (technicalIndicators.rsi !== undefined) {
      // RSI: 50 merkez, 0-100 range
      techScore += (technicalIndicators.rsi - 50) / 50 * 0.1;
    }
    if (technicalIndicators.trend) {
      const trendMap: any = {
        strong_up: 0.15,
        up: 0.08,
        neutral: 0,
        down: -0.08,
        strong_down: -0.15,
      };
      techScore += trendMap[technicalIndicators.trend] || 0;
    }

    // Kısa vadeli baskı
    const shortTermPressure = Math.max(-1, Math.min(1, obPressure + tfPressure + techScore * 0.2));

    // Tarihçe ekle
    this.historyBuffer.push(shortTermPressure);
    if (this.historyBuffer.length > this.BUFFER_SIZE) {
      this.historyBuffer.shift();
    }

    // Orta vadeli baskı (50 periytik SMA)
    const mediumTermPressure =
      this.historyBuffer.length >= 10
        ? this.historyBuffer.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, this.historyBuffer.slice(-50).length)
        : shortTermPressure;

    // Uzun vadeli baskı (tüm tarihçe)
    const longTermPressure =
      this.historyBuffer.length >= 50
        ? this.historyBuffer.reduce((a, b) => a + b, 0) / this.historyBuffer.length
        : shortTermPressure;

    // Ağırlıklı genel baskı (Kısa: %50, Orta: %35, Uzun: %15)
    const overallPressure =
      shortTermPressure * 0.5 + mediumTermPressure * 0.35 + longTermPressure * 0.15;

    // Trend yönü (daha hassas)
    let trendDirection: "strong_long" | "long" | "neutral" | "short" | "strong_short";
    if (overallPressure > 0.5) trendDirection = "strong_long";
    else if (overallPressure > 0.15) trendDirection = "long";
    else if (overallPressure > -0.15) trendDirection = "neutral";
    else if (overallPressure > -0.5) trendDirection = "short";
    else trendDirection = "strong_short";

    // Momentum skoru (0-100)
    const momentumScore = Math.abs(overallPressure) * 100;

    return {
      shortTermPressure,
      mediumTermPressure: Math.max(-1, Math.min(1, mediumTermPressure)),
      longTermPressure: Math.max(-1, Math.min(1, longTermPressure)),
      overallPressure: Math.max(-1, Math.min(1, overallPressure)),
      trendDirection,
      trendStrength: Math.abs(overallPressure),
      momentumScore,
      pressureHistory: this.historyBuffer.slice(-20),
    };
  }

  /**
   * 🚀 AKILLI POZİSYON AÇMA KARARI
   */
  decidePositionEntry(
    currentPrice: number,
    orderBook: OrderBookStats,
    tradeFlow: TradeFlowStats,
    marketPressure: MarketPressure,
    leverage: number = 1,
    leverage1xProfit: number = 0.5
  ): PositionDecision | null {
    const thinkingProcess: AlgoThinking = {
      orderBookAnalysis: [],
      tradeFlowAnalysis: [],
      pressureAnalysis: [],
      riskAssessment: [],
      finalDecision: [],
    };

    // Likidite kontrolü
    if (orderBook.liquidityQuality === "very_low") {
      thinkingProcess.riskAssessment.push("❌ Likidite çok düşük - işlem açılmaz");
      return null;
    }

    if (orderBook.spreadPercentage > 0.3 && leverage > 5) {
      thinkingProcess.riskAssessment.push("❌ Yüksek leverage + geniş spread = riskli");
      return null;
    }

    // Piyasa yönü
    const side = marketPressure.overallPressure > 0 ? "long" : "short";
    const confidence = Math.abs(marketPressure.overallPressure);

    // Minimum baskı kontrolü
    if (confidence < 0.15) {
      thinkingProcess.pressureAnalysis.push("⚠️ Piyasa baskısı çok zayıf (< 0.15) - nötr faz");
      return null;
    }

    // Order Book analizi
    const obInfo = `OB Baskısı: ${(orderBook.orderBookPressure * 100).toFixed(1)}%, Bid/Ask: ${orderBook.bidAskRatio.toFixed(2)}`;
    thinkingProcess.orderBookAnalysis.push(obInfo);

    // Trade Flow analizi
    const tfInfo = `Flow: ${tradeFlow.dominantSide} (${(tradeFlow.flowImbalance * 100).toFixed(1)}%), Alıcı: ${tradeFlow.buyVolume.toFixed(0)}, Satıcı: ${tradeFlow.sellVolume.toFixed(0)}`;
    thinkingProcess.tradeFlowAnalysis.push(tfInfo);

    // Piyasa baskı analizi
    const pressureInfo = `Trend: ${marketPressure.trendDirection}, Momentum: ${marketPressure.momentumScore.toFixed(0)}%`;
    thinkingProcess.pressureAnalysis.push(pressureInfo);

    // Dinamik Stop Loss ve Target
    const stopLossPercent = 1.2 + (leverage - 1) * 0.1; // Leverage'a göre ayarla
    const baseTarget = 2.0;
    const targetPercent = baseTarget + marketPressure.trendStrength * 1.5; // Trend gücüne göre

    let entryPrice = currentPrice;
    let targetPrice: number;
    let stopLoss: number;

    if (side === "long") {
      targetPrice = currentPrice * (1 + targetPercent / 100);
      stopLoss = currentPrice * (1 - stopLossPercent / 100);
    } else {
      targetPrice = currentPrice * (1 - targetPercent / 100);
      stopLoss = currentPrice * (1 + stopLossPercent / 100);
    }

    // 1x bazında kar hesabı (komisyon dahil)
    const grossProfitPct = ((Math.abs(targetPrice - entryPrice) / entryPrice) * 100);
    const commissionImpact = this.commissionRate * 100 * 2; // Giriş + çıkış
    const profitPct1x = grossProfitPct - commissionImpact;

    thinkingProcess.riskAssessment.push(`Brüt Kar: %${grossProfitPct.toFixed(2)}, Komisyon: %${commissionImpact.toFixed(2)}, Net (1x): %${profitPct1x.toFixed(2)}`);

    // Minimum kar kontrolü
    if (profitPct1x < leverage1xProfit) {
      thinkingProcess.finalDecision.push(`❌ Kar potansiyeli yetersiz (${profitPct1x.toFixed(2)}% < ${leverage1xProfit.toFixed(2)}%)`);
      return null;
    }

    // Risk-Reward
    const risk = Math.abs((stopLoss - entryPrice) / entryPrice) * 100;
    const riskRewardRatio = (targetPercent * leverage) / Math.max(0.1, risk);

    // Scaling multiplier
    const scalingMultiplier = Math.min(2.5, 1 + (leverage - 1) * 0.25);

    // Leverage'd kar
    const scaledProfitPct = profitPct1x * leverage;

    thinkingProcess.finalDecision.push(`✅ Pozisyon açılacak: ${side.toUpperCase()} @ ${currentPrice.toFixed(4)}`);
    thinkingProcess.finalDecision.push(`Hedef: ${targetPrice.toFixed(4)} | Stop: ${stopLoss.toFixed(4)}`);
    thinkingProcess.finalDecision.push(`1x Kar: %${profitPct1x.toFixed(2)} | ${leverage}x Kar: %${scaledProfitPct.toFixed(2)}`);

    return {
      shouldOpen: true,
      side,
      confidence,
      entryPrice,
      targetPrice,
      stopLoss,
      potentialProfitPct: profitPct1x,
      potentialProfitUSD: 0, // Hesaplandı, update'te doldurulur
      potentialLossPct: -(risk * leverage),
      riskRewardRatio,
      expectedHoldTime: this.estimateHoldTime(marketPressure.trendStrength),
      scalingMultiplier,
      reasoning: [
        `🎯 Piyasa: ${side.toUpperCase()} Baskılı (Güç: ${(confidence * 100).toFixed(0)}%)`,
        `📊 Order Book: ${obInfo}`,
        `💾 İşlem Akışı: ${tfInfo}`,
        `🔥 Likidite: ${orderBook.liquidityQuality} (Skor: ${orderBook.liquidityScore})`,
        `📈 Trend: ${marketPressure.trendDirection}`,
        `💰 1x Kar Potansiyeli: %${profitPct1x.toFixed(2)}`,
        `🚀 ${leverage}x Kar: %${scaledProfitPct.toFixed(2)}`,
      ],
      algoThinkingProcess: thinkingProcess,
    };
  }

  /**
   * 🔄 AÇIK POZİSYON TAKİBİ VE KAPAMA KARARI
   */
  monitorPosition(
    entryPrice: number,
    currentPrice: number,
    targetPrice: number,
    stopLoss: number,
    amount: number,
    leverage: number,
    side: "long" | "short",
    marketPressure: MarketPressure,
    orderBook: OrderBookStats
  ): PositionMonitor {
    const isLong = side === "long";
    const priceDiff = currentPrice - entryPrice;

    // Kar/Zarar hesaplaması
    const profitPct = (priceDiff / entryPrice) * 100 * leverage;
    const profitUSD = priceDiff * amount * leverage;

    // Komisyon düşümü
    const netProfitUSD = profitUSD - (amount * currentPrice * this.commissionRate * 2);
    const netProfitPct = (netProfitUSD / (amount * entryPrice)) * 100;

    let shouldClose = false;
    let closeReason = "";
    let confidence = 1;
    const thinking: string[] = [];

    // Kar hedefine ulaşma
    if (isLong && currentPrice >= targetPrice) {
      shouldClose = true;
      closeReason = "✅ Kar hedefine ulaştı";
      thinking.push("Hedef fiyata ulaşıldı - pozisyon kapatılır");
    } else if (!isLong && currentPrice <= targetPrice) {
      shouldClose = true;
      closeReason = "✅ Kar hedefine ulaştı";
      thinking.push("Hedef fiyata ulaşıldı - pozisyon kapatılır");
    }

    // Stop loss tetiklendi
    if (isLong && currentPrice <= stopLoss) {
      shouldClose = true;
      closeReason = "🛑 Stop loss tetiklendi";
      confidence = 0;
      thinking.push("Zarar sınırına ulaşıldı - koruma kapanışı");
    } else if (!isLong && currentPrice >= stopLoss) {
      shouldClose = true;
      closeReason = "🛑 Stop loss tetiklendi";
      confidence = 0;
      thinking.push("Zarar sınırına ulaşıldı - koruma kapanışı");
    }

    // Piyasa yönü değişti (kârla çıkış)
    const trendChanged =
      (isLong && marketPressure.overallPressure < -0.3) ||
      (!isLong && marketPressure.overallPressure > 0.3);

    if (trendChanged && netProfitUSD > 0 && !shouldClose) {
      shouldClose = true;
      closeReason = "📉 Piyasa yönü değişti (kâr ile çıkış)";
      confidence = 0.8;
      thinking.push(`Piyasa yönü tersine döndü, ${(netProfitUSD).toFixed(2)}$ kâr ile çıkılıyor`);
    }

    // Likidite çok kötüleşti
    if (orderBook.liquidityQuality === "very_low" && !shouldClose) {
      shouldClose = true;
      closeReason = "⚠️ Likidite kritik düşüşte";
      confidence = 0.6;
      thinking.push("Likidite önemli ölçüde azaldı - riskli");
    }

    // Pozisyon bekleme süresi çok uzun (15+ dakika)
    // Bu genellikle bir durağan faz gösterir

    return {
      isOpen: !shouldClose,
      currentProfit: netProfitUSD,
      currentProfitPct: netProfitPct,
      unrealizedPnL: profitUSD,
      shouldClose,
      closeReason,
      closePrice: currentPrice,
      confidence,
      liveThinking: thinking,
    };
  }

  /**
   * ⏱️ BEKLENENolding SÜRESİ TAHMİNİ
   */
  private estimateHoldTime(trendStrength: number): string {
    if (trendStrength > 0.75) return "30-60 dakika";
    if (trendStrength > 0.5) return "10-30 dakika";
    if (trendStrength > 0.2) return "5-15 dakika";
    return "2-5 dakika";
  }

  /**
   * 📊 BÜTÜN ALGORİTMA METRİKLERİNİ HESAPLA
   */
  analyzeMarket(
    pair: string,
    currentPrice: number,
    orderBook: any,
    trades: any[],
    technicalIndicators?: any,
    activePosition?: any,
    leverage?: number,
    leverage1xProfit?: number
  ): AlgorithmMetrics {
    const lever = leverage || 1;
    const minProfit = leverage1xProfit || this.minProfitThresholdAt1x;

    const obStats = this.analyzeOrderBook(orderBook);
    const tfStats = this.analyzeTradeFlow(trades);
    const mpStats = this.analyzeMarketPressure(obStats, tfStats, technicalIndicators || {});

    let positionDecision: PositionDecision | null = null;
    let positionMonitor: PositionMonitor | null = null;

    if (!activePosition) {
      positionDecision = this.decidePositionEntry(
        currentPrice,
        obStats,
        tfStats,
        mpStats,
        lever,
        minProfit
      );

      // Potansiyel karı hesapla
      if (positionDecision) {
        const priceDiff = Math.abs(positionDecision.targetPrice - positionDecision.entryPrice);
        positionDecision.potentialProfitUSD = priceDiff; // Birim başına
      }
    } else {
      positionMonitor = this.monitorPosition(
        activePosition.entryPrice,
        currentPrice,
        activePosition.targetPrice,
        activePosition.stopLoss,
        activePosition.amount,
        lever,
        activePosition.side,
        mpStats,
        obStats
      );
    }

    // Veri kalitesi skoru
    let dataQualityScore = 100;
    if (obStats.liquidityQuality === "very_low") dataQualityScore -= 40;
    else if (obStats.liquidityQuality === "low") dataQualityScore -= 20;
    else if (obStats.liquidityQuality === "medium") dataQualityScore -= 10;

    if (tfStats.flowStrength < 0.1) dataQualityScore -= 15;
    dataQualityScore = Math.max(0, Math.min(100, dataQualityScore));

    // Algoritma sağlığı
    let algorithmHealth = Math.round(dataQualityScore * 0.7 + Math.abs(mpStats.overallPressure) * 30);
    algorithmHealth = Math.max(0, Math.min(100, algorithmHealth));

    return {
      timestamp: Date.now(),
      pair,
      currentPrice,
      orderBook: obStats,
      tradeFlow: tfStats,
      marketPressure: mpStats,
      positionDecision,
      positionMonitor,
      algorithmHealth,
      dataQualityScore,
    };
  }

  // Getter/Setter
  setMinimumProfitThreshold(pct: number): void {
    this.minProfitThresholdAt1x = Math.max(0.1, pct);
  }

  getMinimumProfitThreshold(): number {
    return this.minProfitThresholdAt1x;
  }

  setCommissionRate(rate: number): void {
    this.commissionRate = Math.max(0, Math.min(0.01, rate));
  }

  getCommissionRate(): number {
    return this.commissionRate;
  }

  getHistoryBuffer(): number[] {
    return this.historyBuffer.slice();
  }

  clearHistory(): void {
    this.historyBuffer = [];
  }
}
