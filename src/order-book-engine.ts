// ==================== GELIŞMIŞ MATEMATİKSEL ALGORİTMA MOTORU V3 ====================
// Emir defteri analiz, akıllı entry/exit, dinamik risk yönetimi

export interface OrderBookState {
  symbol: string;
  bids: Array<[number, number]>;  // Fiyat, miktar
  asks: Array<[number, number]>;  // Fiyat, miktar
  longVolume: number;
  shortVolume: number;
  longUSD: number;
  shortUSD: number;
  bidAskRatio: number;  // Long/Short hacim oranı
  imbalanceStrength: number; // 0-100, ne kadar baskın
  dominantSide: 'long' | 'short' | 'balanced';
  lastUpdate: number;
  trendStrength: number; // 0-100, trend ne kadar güçlü
  liquidityHealth: number; // 0-100, order book ne kadar sağlıklı
}

export interface SmartPositionConfig {
  minProfitPct1X: number;      // 1x'te minimum kar hedefi (0.3 - 1.0)
  leverage: number;             // Varsayılan leverage
  maxPositionSize: number;      // Max pozisyon USD
  minOrderBookStrength: number; // Gerekli order book gücü (0.2 - 0.8)
  entryConfidenceThreshold: number; // Giriş için %
  maxOpenPositions: number;     // Max eşzamanlı pozisyon
  trailingStopPct?: number;     // Trailing stop (opsiyonel)
  riskPerPosition?: number;     // Pozisyon başı risk %
}

export interface DynamicProfitAnalysis {
  entryPrice: number;
  leverage: number;
  side: 'long' | 'short';
  
  // 1X Bazında Kar
  profitTarget1X: number; // % olarak
  targetPrice1X: number;
  
  // Leverage ile Ölçeklendirilmiş
  profitTargetLevered: number; // %
  targetPriceLevered: number;
  
  // USD Bazında
  positionSizeUSD: number;
  grossProfitUSD: number;
  
  // Komisyon Hesaplaması
  commissionOpen: number; // %
  commissionClose: number; // %
  totalCommissionUSD: number;
  totalCommissionPct: number;
  
  // Net Kar (Komisyon sonrası)
  netProfitUSD: number;
  netProfitPct: number;
  
  // Risk Yönetimi
  stopLossPct: number;
  stopLossPrice: number;
  riskUSD: number;
  riskRewardRatio: number;
  
  // Viabilite
  isViable: boolean;
  profitMarginAfterCommission: number; // Pozitif mi?
  minPriceMoveRequired: number; // %
  
  // Detaylı Skorlama
  scores: {
    profitScore: number;           // Kar potansiyeli
    commissionScore: number;       // Komisyon verimliliği
    riskScore: number;             // Risk/ödül oranı
    orderBookScore: number;        // Order book uyumu
    overallViability: number;      // 0-100
  };
}

export interface MarketAnalysis {
  symbol: string;
  longBias: number;    // % olarak (0-100, 50=dengeli)
  shortBias: number;   // % olarak
  pressureStrength: number; // 0-100
  volumeAcceleration: number; // Hacim artışı trendinde mi?
  entryQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'SKIP';
  urgencyLevel: number; // 0-100, girişin acilığı
}

export interface PositionExitSignal {
  shouldClose: boolean;
  urgency: number; // 0-100
  reason: string;
  confidence: number;
  potentialSlippage: number; // %
}

export class OrderBookEngine {
  private orderBooks: Map<string, OrderBookState> = new Map();
  private config: SmartPositionConfig;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor(config: SmartPositionConfig) {
    this.config = config;
  }

  /**
   * Order Book'u güncelle ve detaylı analiz yap
   */
  updateOrderBook(
    symbol: string,
    bids: Array<[number, number]>,
    asks: Array<[number, number]>,
    currentPrice: number
  ) {
    // Hacim hesaplamaları
    const longVolume = bids.reduce((sum, [_, amount]) => sum + amount, 0);
    const shortVolume = asks.reduce((sum, [_, amount]) => sum + amount, 0);

    // USD Ağırlıklı hacim
    const longUSD = bids.reduce((sum, [price, amount]) => sum + price * amount, 0);
    const shortUSD = asks.reduce((sum, [price, amount]) => sum + price * amount, 0);

    // Oranlar ve Baskınlık
    const bidAskRatio = longVolume > 0 ? shortVolume / longVolume : 1;
    const totalVolume = longVolume + shortVolume;
    const imbalance = totalVolume > 0 ? (longVolume - shortVolume) / totalVolume : 0;
    const imbalanceStrength = Math.abs(imbalance) * 100;

    const dominantSide: 'long' | 'short' | 'balanced' =
      imbalanceStrength > 15
        ? imbalance > 0 ? 'long' : 'short'
        : 'balanced';

    // Trend gücü (fiyat hareketi + hacim ivmesi)
    const trendStrength = this.calculateTrendStrength(symbol, imbalanceStrength);
    
    // Likidite sağlığı (spread + hacim derinliği)
    const liquidityHealth = this.calculateLiquidityHealth(bids, asks);

    const orderBookState: OrderBookState = {
      symbol,
      bids,
      asks,
      longVolume,
      shortVolume,
      longUSD,
      shortUSD,
      bidAskRatio,
      imbalanceStrength,
      dominantSide,
      lastUpdate: Date.now(),
      trendStrength,
      liquidityHealth
    };

    this.orderBooks.set(symbol, orderBookState);

    // Geçmiş veri tut (trend ve momentum için)
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
      this.volumeHistory.set(symbol, []);
    }

    const priceHist = this.priceHistory.get(symbol)!;
    const volHist = this.volumeHistory.get(symbol)!;

    priceHist.push(currentPrice);
    volHist.push(totalVolume);

    // Son 100 kaydı tut
    if (priceHist.length > 100) priceHist.shift();
    if (volHist.length > 100) volHist.shift();
  }

  /**
   * Trend gücü hesapla (0-100)
   */
  private calculateTrendStrength(symbol: string, imbalanceStrength: number): number {
    const priceHist = this.priceHistory.get(symbol) || [];
    const volHist = this.volumeHistory.get(symbol) || [];

    if (priceHist.length < 3 || volHist.length < 3) {
      return imbalanceStrength; // Veri yoksa imbalance'ye bağlı
    }

    // Fiyat momentumu (son 5 bar ortalaması)
    const recentPrices = priceHist.slice(-5);
    const priceMovement = Math.abs(recentPrices[recentPrices.length - 1] - recentPrices[0]) /
      recentPrices[0] * 100;

    // Hacim ivmesi
    const recentVolumes = volHist.slice(-5);
    const volumeAccel = recentVolumes[recentVolumes.length - 1] > 0
      ? (recentVolumes[recentVolumes.length - 1] - recentVolumes[0]) / recentVolumes[0] * 100
      : 0;

    // Kombinasyon: Order book dengesizliği + fiyat hareketi + hacim ivmesi
    return Math.min(100, (imbalanceStrength * 0.4 + priceMovement * 0.3 + Math.abs(volumeAccel) * 0.3));
  }

  /**
   * Likidite sağlığı (0-100, daha yüksek = daha iyi)
   */
  private calculateLiquidityHealth(
    bids: Array<[number, number]>,
    asks: Array<[number, number]>
  ): number {
    if (bids.length === 0 || asks.length === 0) return 0;

    // Spread
    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];
    const spread = (bestAsk - bestBid) / bestBid * 100;

    // Derinlik (ilk 5 level'in topla hacmi)
    const bidDepth = bids.slice(0, 5).reduce((sum, [_, amt]) => sum + amt, 0);
    const askDepth = asks.slice(0, 5).reduce((sum, [_, amt]) => sum + amt, 0);
    const minDepth = Math.min(bidDepth, askDepth);

    // Spread puanı: dar spread = yüksek puan
    const spreadScore = Math.max(0, 100 - spread * 10000); // 0.01% spread = 100 puan

    // Derinlik puanı: büyük derinlik = yüksek puan (minimum 1000 gerekir)
    const depthScore = Math.min(100, minDepth / 10);

    // Kombinasyon
    return (spreadScore * 0.4 + depthScore * 0.6) / 100;
  }

  /**
   * DINAMIK KAR ANALİZİ - Tüm hesaplamalar burada
   */
  analyzeProfitDynamic(
    symbol: string,
    entryPrice: number,
    side: 'long' | 'short',
    positionSizeUSD: number,
    leverage: number,
    minProfitPct1X?: number
  ): DynamicProfitAnalysis {
    const targetPct1X = minProfitPct1X || this.config.minProfitPct1X;

    // 1X Kar Hedefi
    const profitTarget1X = targetPct1X;
    const targetPrice1X = side === 'long'
      ? entryPrice * (1 + profitTarget1X / 100)
      : entryPrice * (1 - profitTarget1X / 100);

    // Leverage ile Ölçeklendirilmiş
    const profitTargetLevered = targetPct1X * leverage;
    const targetPriceLevered = side === 'long'
      ? entryPrice * (1 + profitTargetLevered / 100)
      : entryPrice * (1 - profitTargetLevered / 100);

    // Brüt Kar (komisyon öncesi)
    const grossProfitUSD = positionSizeUSD * (profitTargetLevered / 100);

    // KOMİSYON - Binance ücret tablosu
    // VIP 0: Open 0.1%, Close 0.1% = 0.2% total
    // VIP 5+: Open 0.02%, Close 0.02% = 0.04% total
    // Ortalama: 0.1%
    const commissionOpen = 0.1;   // %
    const commissionClose = 0.1;  // %
    const totalCommissionPct = commissionOpen + commissionClose;
    const totalCommissionUSD = positionSizeUSD * (totalCommissionPct / 100);

    // Net Kar
    const netProfitUSD = grossProfitUSD - totalCommissionUSD;
    const netProfitPct = (netProfitUSD / positionSizeUSD) * 100;

    // Stop Loss Risk
    const stopLossPct = 2.5; // % (leverage'ye göre ayarlanabilir)
    const stopLossPrice = side === 'long'
      ? entryPrice * (1 - stopLossPct / 100)
      : entryPrice * (1 + stopLossPct / 100);
    const riskUSD = positionSizeUSD * (stopLossPct / 100);

    // Risk/Reward Oranı
    const riskRewardRatio = riskUSD > 0 ? netProfitUSD / riskUSD : 0;

    // Viabilite Kontrolleri
    const isViable = netProfitUSD > 2; // En az 2$ net kar
    const profitMarginAfterCommission = netProfitPct;
    const minPriceMoveRequired = Math.abs(targetPriceLevered - entryPrice) / entryPrice * 100;

    // Skorlama Sistemi
    const profitScore = Math.min(100, (netProfitUSD / 50) * 100); // 50$ = 100 puan
    const commissionScore = Math.max(0, 100 - (totalCommissionPct * 500)); // Komisyon %'si düştükçe artır
    const riskScore = Math.min(100, riskRewardRatio * 50); // 1:1 ratio = 50 puan
    const orderBookScore = this.calculateOrderBookScoreForSide(symbol, side);
    
    const overallViability = Math.round(
      profitScore * 0.3 +
      commissionScore * 0.25 +
      riskScore * 0.25 +
      orderBookScore * 0.2
    );

    return {
      entryPrice,
      leverage,
      side,
      profitTarget1X,
      targetPrice1X,
      profitTargetLevered,
      targetPriceLevered,
      positionSizeUSD,
      grossProfitUSD,
      commissionOpen,
      commissionClose,
      totalCommissionUSD,
      totalCommissionPct,
      netProfitUSD,
      netProfitPct,
      stopLossPct,
      stopLossPrice,
      riskUSD,
      riskRewardRatio,
      isViable,
      profitMarginAfterCommission,
      minPriceMoveRequired,
      scores: {
        profitScore,
        commissionScore,
        riskScore,
        orderBookScore,
        overallViability
      }
    };
  }

  /**
   * Order Book uyum skoru bir tarafa göre
   */
  private calculateOrderBookScoreForSide(symbol: string, side: 'long' | 'short'): number {
    const ob = this.orderBooks.get(symbol);
    if (!ob) return 50;

    const isAligned = (side === 'long' && ob.dominantSide === 'long') ||
      (side === 'short' && ob.dominantSide === 'short');

    if (isAligned) {
      return Math.min(100, 50 + ob.imbalanceStrength);
    } else if (ob.dominantSide === 'balanced') {
      return 60;
    } else {
      return Math.max(20, 50 - ob.imbalanceStrength);
    }
  }

  /**
   * Pazar Analizi Raporu
   */
  analyzeMarket(symbol: string): MarketAnalysis {
    const ob = this.orderBooks.get(symbol);
    if (!ob) {
      return {
        symbol,
        longBias: 50,
        shortBias: 50,
        pressureStrength: 0,
        volumeAcceleration: 0,
        entryQuality: 'SKIP',
        urgencyLevel: 0
      };
    }

    const longBias = 50 + ob.imbalanceStrength / 2;
    const shortBias = 50 - ob.imbalanceStrength / 2;
    const pressureStrength = ob.imbalanceStrength;

    // Hacim hızlanması
    const volHist = this.volumeHistory.get(symbol) || [];
    let volumeAcceleration = 0;
    if (volHist.length >= 3) {
      const recent = volHist.slice(-3);
      volumeAcceleration = recent[2] > recent[0] ? 50 : -50;
    }

    // Giriş Kalitesi
    let entryQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'SKIP' = 'SKIP';
    if (pressureStrength > 30 && ob.liquidityHealth > 70) {
      entryQuality = 'EXCELLENT';
    } else if (pressureStrength > 20 && ob.liquidityHealth > 50) {
      entryQuality = 'GOOD';
    } else if (pressureStrength > 10 && ob.liquidityHealth > 40) {
      entryQuality = 'FAIR';
    } else if (ob.liquidityHealth > 30) {
      entryQuality = 'POOR';
    }

    return {
      symbol,
      longBias,
      shortBias,
      pressureStrength,
      volumeAcceleration,
      entryQuality,
      urgencyLevel: Math.min(100, pressureStrength * 1.2)
    };
  }

  /**
   * AKILLI GİRİŞ KARARARI
   */
  getSmartEntryDecision(
    symbol: string,
    currentPrice: number,
    side: 'long' | 'short',
    positionSizeUSD: number,
    leverage: number,
    minProfitPct1X?: number
  ): {
    action: 'ENTER_NOW' | 'ENTER_BETTER_PRICE' | 'WAIT_CONDITIONS' | 'SKIP';
    confidence: number;
    reason: string;
    analysis: DynamicProfitAnalysis;
  } {
    const analysis = this.analyzeProfitDynamic(
      symbol,
      currentPrice,
      side,
      positionSizeUSD,
      leverage,
      minProfitPct1X
    );

    const market = this.analyzeMarket(symbol);
    const ob = this.orderBooks.get(symbol);

    // Viabilite kontrolleri
    if (!analysis.isViable) {
      return {
        action: 'SKIP',
        confidence: 100,
        reason: `Komisyon sonrası zarar: ${analysis.netProfitUSD.toFixed(2)}$ (minimum: 2$)`,
        analysis
      };
    }

    // Side uyumu kontrol
    const sideAligned = (side === 'long' && ob?.dominantSide === 'long') ||
      (side === 'short' && ob?.dominantSide === 'short');

    if (!sideAligned && ob?.dominantSide !== 'balanced') {
      return {
        action: 'WAIT_CONDITIONS',
        confidence: analysis.scores.overallViability * 0.7,
        reason: `${side.toUpperCase()} açılacak fakat ${ob?.dominantSide?.toUpperCase()} baskın. Trend değişmesini bekleyin.`,
        analysis
      };
    }

    // Likidite kontrolleri
    if ((ob?.liquidityHealth || 0) < 30) {
      return {
        action: 'WAIT_CONDITIONS',
        confidence: 40,
        reason: `Order book likiditesi zayıf. Daha iyi koşulları bekleyin.`,
        analysis
      };
    }

    // Viabilite skalası
    const score = analysis.scores.overallViability;

    if (score >= 80) {
      return {
        action: 'ENTER_NOW',
        confidence: score,
        reason: `✅ Mükemmel koşullar. Risk/Reward: ${analysis.riskRewardRatio.toFixed(2)}:1, Net Kar: ${analysis.netProfitUSD.toFixed(2)}$`,
        analysis
      };
    }

    if (score >= 65) {
      return {
        action: 'ENTER_NOW',
        confidence: score,
        reason: `✅ İyi koşullar. Viability: ${score}%, Net Kar: ${analysis.netProfitUSD.toFixed(2)}$`,
        analysis
      };
    }

    if (score >= 50) {
      return {
        action: 'ENTER_BETTER_PRICE',
        confidence: score,
        reason: `⚠️ Orta koşullar. Daha iyi fiyatı beklemek tavsiye edilir. Viability: ${score}%`,
        analysis
      };
    }

    return {
      action: 'WAIT_CONDITIONS',
      confidence: score,
      reason: `❌ Koşullar uygun değil. Viability: ${score}% (minimum 50%)`,
      analysis
    };
  }

  /**
   * AKILLI ÇIKIŞ KARARARI (Dinamik)
   */
  getSmartExitDecision(
    symbol: string,
    currentPrice: number,
    entryPrice: number,
    side: 'long' | 'short',
    currentProfitPct: number,
    currentProfitUSD: number,
    leverage: number
  ): PositionExitSignal {
    const ob = this.orderBooks.get(symbol);
    if (!ob) {
      return {
        shouldClose: false,
        urgency: 0,
        reason: 'Order book verisi yok',
        confidence: 0,
        potentialSlippage: 0
      };
    }

    // Karda ama trend ters dönmüş?
    if (currentProfitUSD > 0 && 
        ((side === 'long' && ob.dominantSide === 'short') ||
         (side === 'short' && ob.dominantSide === 'long'))) {
      return {
        shouldClose: true,
        urgency: 90,
        reason: `Karda (${currentProfitUSD.toFixed(2)}$) ama trend tersine döndü. Hızlıca kapat!`,
        confidence: 95,
        potentialSlippage: 0.1
      };
    }

    // Pozisyon hızla eriyor?
    const priceMoveFromEntry = Math.abs(currentPrice - entryPrice) / entryPrice * 100;
    const oppositeDirectionMove = side === 'long' ? 
      ((entryPrice - currentPrice) / entryPrice * 100) :
      ((currentPrice - entryPrice) / entryPrice * 100);

    if (oppositeDirectionMove > 2 && currentProfitUSD < 0) {
      return {
        shouldClose: true,
        urgency: 75,
        reason: `Pozisyon hızla eriyor (${oppositeDirectionMove.toFixed(2)}% tersi). Kaybı sınırla.`,
        confidence: 80,
        potentialSlippage: 0.15
      };
    }

    // Kar hedeline ulaştı mı?
    if (currentProfitPct >= 2) { // Min 2% kar
      return {
        shouldClose: true,
        urgency: 10,
        reason: `Kar hedefine ulaştı: ${currentProfitPct.toFixed(2)}%`,
        confidence: 85,
        potentialSlippage: 0.05
      };
    }

    // Zarar çok arttı mı?
    if (currentProfitUSD < -(10 * leverage)) { // leverage'e göre stop loss
      return {
        shouldClose: true,
        urgency: 100,
        reason: `Stop loss tetiklendi: ${currentProfitUSD.toFixed(2)}$`,
        confidence: 100,
        potentialSlippage: 0.2
      };
    }

    return {
      shouldClose: false,
      urgency: 0,
      reason: 'Pozisyon kapat sinyali yok',
      confidence: 100,
      potentialSlippage: 0
    };
  }

  /**
   * En İyi Coini Bul (Otomatik mod)
   */
  getBestCoinForEntry(
    coins: string[],
    prices: Map<string, number>,
    positionSizeUSD: number,
    leverage: number,
    minProfitPct1X?: number
  ): Array<{
    symbol: string;
    decision: {
      action: string;
      confidence: number;
    };
    analysis: DynamicProfitAnalysis;
  }> {
    const results = coins.map(symbol => {
      const price = prices.get(symbol);
      if (!price) return null;

      const decision = this.getSmartEntryDecision(
        symbol,
        price,
        'long', // Önce long kontrol
        positionSizeUSD,
        leverage,
        minProfitPct1X
      );

      return {
        symbol,
        decision: {
          action: decision.action,
          confidence: decision.confidence
        },
        analysis: decision.analysis
      };
    }).filter(Boolean) as Array<any>;

    // Viability'e göre sırala
    return results.sort((a, b) => 
      b.analysis.scores.overallViability - a.analysis.scores.overallViability
    );
  }

  /**
   * Güncel state al
   */
  getOrderBookState(symbol: string): OrderBookState | null {
    return this.orderBooks.get(symbol) || null;
  }

  /**
   * Config güncelle
   */
  updateConfig(newConfig: Partial<SmartPositionConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default OrderBookEngine;
