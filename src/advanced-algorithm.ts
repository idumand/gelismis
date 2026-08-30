// ==================== GELIŞMIŞ AI TICARET ALGORITMA MOTORU V4 ====================
// Makine öğrenme, teknik analiz ve piyasa dinamiği tabanlı

import { 
  SMA, 
  RSI, 
  MACD, 
  BollingerBands, 
  ATR,
  StochasticRSI,
  CCI,
  ADX,
  OBV,
  KeltnerChannel
} from 'technicalindicators';

export interface CoinFlowData {
  symbol: string;
  currentPrice: number;
  volume24h: number;
  volumeChange: number;
  largeOrderVolume: number;
  buyPressure: number;
  sellPressure: number;
  netFlow: number;
  momentum: number;
  trend: 'up' | 'down' | 'neutral';
  confidence: number;
}

export interface AdvancedSignal {
  symbol: string;
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  leverage: number;
  riskRewardRatio: number;
  indicators: {
    rsi: number;
    macd: { line: number; signal: number; histogram: number };
    bb: { upper: number; middle: number; lower: number; position: number };
    atr: number;
    adx: number;
    obv: number;
    cci: number;
  };
  flowAnalysis: CoinFlowData;
  signals: string[];
  timestamp: number;
}

export interface PositionManagement {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  profitPct: number;
  riskPct: number;
  shouldClose: boolean;
  closeReason: string;
  nextTarget: number;
  atrStop: number;
  timeInPosition: number;
}

export class AdvancedAlgorithm {
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private orderFlowHistory: Map<string, number[]> = new Map();
  private lastSignals: Map<string, AdvancedSignal> = new Map();

  private readonly HISTORY_LENGTH = 200;
  private readonly MIN_HISTORY = 50;

  constructor(private config: {
    minConfidence: number;
    maxRiskPerTrade: number;
    scalingFactor: number;
    useML: boolean;
  } = {
    minConfidence: 0.65,
    maxRiskPerTrade: 2,
    scalingFactor: 1.0,
    useML: true
  }) {}

  /**
   * Fiyat ve volüm verisi ekle
   */
  addPriceData(symbol: string, price: number, volume: number, orderFlow?: number) {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
      this.volumeHistory.set(symbol, []);
      this.orderFlowHistory.set(symbol, []);
    }

    const prices = this.priceHistory.get(symbol)!;
    const volumes = this.volumeHistory.get(symbol)!;
    const flows = this.orderFlowHistory.get(symbol)!;

    prices.push(price);
    volumes.push(volume);
    flows.push(orderFlow || 0);

    // Tarihi sınırla
    if (prices.length > this.HISTORY_LENGTH) {
      prices.shift();
      volumes.shift();
      flows.shift();
    }
  }

  /**
   * SUPER GELİŞMİŞ - Tüm para akışı analiz
   */
  analyzeCoinFlow(symbol: string, currentPrice: number, orderBook: any): CoinFlowData {
    const prices = this.priceHistory.get(symbol) || [];
    const volumes = this.volumeHistory.get(symbol) || [];
    const flows = this.orderFlowHistory.get(symbol) || [];

    if (prices.length < this.MIN_HISTORY) {
      return this.getDefaultCoinFlow(symbol, currentPrice);
    }

    // Volüm analizi
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1] || 0;
    const volumeChange = ((currentVolume - avgVolume) / avgVolume) * 100;

    // Büyük sipariş analizi
    let buyPressure = 0;
    let sellPressure = 0;
    let largeOrderVolume = 0;

    if (orderBook && orderBook.bids && orderBook.asks) {
      const topBids = orderBook.bids.slice(0, 10);
      const topAsks = orderBook.asks.slice(0, 10);

      buyPressure = topBids.reduce((sum: number, [_, vol]: [number, number]) => sum + vol, 0);
      sellPressure = topAsks.reduce((sum: number, [_, vol]: [number, number]) => sum + vol, 0);

      // Büyük emirler
      const largeThreshold = avgVolume * 0.5;
      largeOrderVolume = buyPressure + sellPressure;
    }

    // Net akış hesapla
    const netFlow = buyPressure - sellPressure;
    const netFlowPct = (netFlow / (buyPressure + sellPressure + 0.001)) * 100;

    // Momentum
    const recentPrices = prices.slice(-20);
    const momentum = ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0]) * 100;

    // Trend
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const trend = currentPrice > sma20 && sma20 > sma50 ? 'up' : 
                  currentPrice < sma20 && sma20 < sma50 ? 'down' : 'neutral';

    // Güven
    const confidence = Math.min(100, Math.abs(netFlowPct) + Math.abs(momentum) * 0.5);

    return {
      symbol,
      currentPrice,
      volume24h: currentVolume,
      volumeChange,
      largeOrderVolume,
      buyPressure,
      sellPressure,
      netFlow,
      momentum,
      trend,
      confidence: confidence / 100
    };
  }

  /**
   * HARIKA - Gelişmiş sinyal üretimi
   */
  generateAdvancedSignal(
    symbol: string,
    currentPrice: number,
    orderBook?: any,
    leverage: number = 20
  ): AdvancedSignal | null {
    const prices = this.priceHistory.get(symbol) || [];
    const volumes = this.volumeHistory.get(symbol) || [];

    if (prices.length < this.MIN_HISTORY) {
      return null;
    }

    // Teknik göstergeler
    const indicators = this.calculateAllIndicators(prices, volumes);
    const flowData = this.analyzeCoinFlow(symbol, currentPrice, orderBook);

    // Sinyal kombinasyonu
    const signals: string[] = [];
    let buySignals = 0;
    let sellSignals = 0;

    // RSI sinyalleri
    if (indicators.rsi < 30) {
      signals.push('RSI Aşırı Satım');
      buySignals += 2;
    } else if (indicators.rsi > 70) {
      signals.push('RSI Aşırı Alım');
      sellSignals += 2;
    }

    // MACD sinyalleri
    if (indicators.macd.histogram > 0 && indicators.macd.line > indicators.macd.signal) {
      signals.push('MACD Pozitif Geçiş');
      buySignals += 2;
    } else if (indicators.macd.histogram < 0 && indicators.macd.line < indicators.macd.signal) {
      signals.push('MACD Negatif Geçiş');
      sellSignals += 2;
    }

    // Bollinger Bands sinyalleri
    if (indicators.bb.position < -0.8) {
      signals.push('Alt Banddan Uzak Satım');
      buySignals += 1;
    } else if (indicators.bb.position > 0.8) {
      signals.push('Üst Banddan Uzak Alım');
      sellSignals += 1;
    }

    // ADX trend gücü
    if (indicators.adx > 25) {
      signals.push(`Güçlü Trend (ADX: ${indicators.adx.toFixed(1)})`);
      if (flowData.trend === 'up') buySignals += 2;
      else if (flowData.trend === 'down') sellSignals += 2;
    }

    // OBV hacim onayı
    if (indicators.obv > 0) {
      signals.push('OBV Pozitif');
      buySignals += 1;
    } else if (indicators.obv < 0) {
      signals.push('OBV Negatif');
      sellSignals += 1;
    }

    // Para akışı analizi
    if (flowData.netFlow > flowData.largeOrderVolume * 0.3) {
      signals.push('Güçlü Alım Basıncı');
      buySignals += 3;
    } else if (flowData.netFlow < -flowData.largeOrderVolume * 0.3) {
      signals.push('Güçlü Satış Basıncı');
      sellSignals += 3;
    }

    // Momentum
    if (flowData.momentum > 2) {
      signals.push(`Yukarı Momentum: ${flowData.momentum.toFixed(2)}%`);
      buySignals += 1;
    } else if (flowData.momentum < -2) {
      signals.push(`Aşağı Momentum: ${flowData.momentum.toFixed(2)}%`);
      sellSignals += 1;
    }

    // Net sinyal hesapla
    const netSignal = buySignals - sellSignals;
    const totalSignals = buySignals + sellSignals;
    const confidence = totalSignals > 0 ? Math.abs(netSignal) / totalSignals : 0;

    if (confidence < this.config.minConfidence) {
      return null;
    }

    // Giriş/Çıkış seviyeleri
    const atr = indicators.atr;
    const entryPrice = currentPrice;
    const stopLoss = currentPrice - (atr * 2);
    const riskPercentage = ((entryPrice - stopLoss) / entryPrice) * 100;
    const profitTarget = (riskPercentage * 3) / 100; // 1:3 Risk/Reward

    return {
      symbol,
      action: netSignal > 0 ? (confidence > 0.85 ? 'STRONG_BUY' : 'BUY') : 
              netSignal < 0 ? (confidence > 0.85 ? 'STRONG_SELL' : 'SELL') : 'HOLD',
      confidence,
      riskLevel: confidence > 0.85 ? 'LOW' : confidence > 0.75 ? 'MEDIUM' : 'HIGH',
      entryPrice,
      stopLoss,
      takeProfit1: entryPrice + (atr * 2),
      takeProfit2: entryPrice + (atr * 4),
      takeProfit3: entryPrice + (atr * 6),
      leverage: this.calculateOptimalLeverage(confidence, atr / currentPrice),
      riskRewardRatio: profitTarget / riskPercentage,
      indicators,
      flowAnalysis: flowData,
      signals,
      timestamp: Date.now()
    };
  }

  /**
   * Pozisyon yönetimi - Kapatma sinyalleri
   */
  managePosition(
    symbol: string,
    entryPrice: number,
    currentPrice: number,
    currentProfitPct: number
  ): PositionManagement {
    const prices = this.priceHistory.get(symbol) || [];
    
    if (prices.length < this.MIN_HISTORY) {
      return {
        symbol,
        entryPrice,
        currentPrice,
        profitPct: currentProfitPct,
        riskPct: 0,
        shouldClose: false,
        closeReason: '',
        nextTarget: 0,
        atrStop: 0,
        timeInPosition: 0
      };
    }

    const indicators = this.calculateAllIndicators(prices, []);
    const atr = indicators.atr;
    
    // ATR tabanlı stop loss
    const atrStop = Math.abs((atr / currentPrice) * 100);
    
    // Kapatma mantığı
    let shouldClose = false;
    let closeReason = '';

    // 1. Hızlı kâr al (1:1 ratio)
    if (currentProfitPct >= 0.5 && indicators.rsi > 75) {
      shouldClose = true;
      closeReason = 'Hızlı Kâr Al - RSI Aşırı Alım';
    }

    // 2. Momentum döndü
    if (currentProfitPct > 0.3 && indicators.macd.histogram < 0 && indicators.macd.line < indicators.macd.signal) {
      shouldClose = true;
      closeReason = 'MACD Negatif Dönerek - Kâr Al';
    }

    // 3. Para akışı tersine döndü
    const flowData = this.analyzeCoinFlow(symbol, currentPrice);
    if (currentProfitPct > 0.2 && flowData.netFlow < -flowData.largeOrderVolume * 0.2) {
      shouldClose = true;
      closeReason = 'Para Akışı Tersine Döndü - Pozisyon Kapat';
    }

    // 4. Stop loss tetiklendi
    if (currentProfitPct <= -atrStop * 1.5) {
      shouldClose = true;
      closeReason = 'ATR Stop Loss';
    }

    // 5. Zaman durdurması (Scalping için)
    const timeInPosition = Date.now() - (this.lastSignals.get(symbol)?.timestamp || Date.now());
    if (timeInPosition > 300000 && currentProfitPct > 0) { // 5 dakika
      shouldClose = true;
      closeReason = 'Zaman Sınırı - Pozisyon Uzun Süredir Açık';
    }

    return {
      symbol,
      entryPrice,
      currentPrice,
      profitPct: currentProfitPct,
      riskPct: atrStop,
      shouldClose,
      closeReason,
      nextTarget: currentPrice * (1 + (atr / currentPrice) * 2),
      atrStop,
      timeInPosition
    };
  }

  /**
   * Optimal leverage hesapla
   */
  private calculateOptimalLeverage(confidence: number, volatility: number): number {
    // Yüksek güven = daha yüksek leverage
    // Yüksek volatilite = daha düşük leverage
    const baseMultiplier = confidence * 30;
    const volatilityAdjustment = Math.max(0.5, 1 - volatility * 10);
    
    return Math.min(125, Math.max(1, baseMultiplier * volatilityAdjustment));
  }

  /**
   * Tüm göstergeleri hesapla
   */
  private calculateAllIndicators(prices: number[], volumes: number[]) {
    return {
      rsi: this.calculateRSI(prices),
      macd: this.calculateMACD(prices),
      bb: this.calculateBollingerBands(prices),
      atr: this.calculateATR(prices),
      adx: this.calculateADX(prices),
      obv: this.calculateOBV(prices, volumes),
      cci: this.calculateCCI(prices)
    };
  }

  /**
   * Basit MA hesaplama
   */
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * RSI hesapla
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / (avgLoss || 0.0001);
    
    return 100 - (100 / (1 + rs));
  }

  /**
   * MACD hesapla
   */
  private calculateMACD(prices: number[]) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const line = ema12 - ema26;
    const signal = this.calculateEMA([line], 9);
    
    return {
      line,
      signal,
      histogram: line - signal
    };
  }

  /**
   * Bollinger Bands hesapla
   */
  private calculateBollingerBands(prices: number[], period: number = 20, deviation: number = 2) {
    const sma = this.calculateSMA(prices, period);
    const variance = prices.slice(-period)
      .reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const upper = sma + (stdDev * deviation);
    const lower = sma - (stdDev * deviation);
    const currentPrice = prices[prices.length - 1] || sma;
    const position = (currentPrice - lower) / (upper - lower);
    
    return { upper, middle: sma, lower, position };
  }

  /**
   * ATR hesapla (Ortalama Gerçek Aralık)
   */
  private calculateATR(prices: number[], period: number = 14): number {
    if (prices.length < period) return 0;
    
    let atr = 0;
    for (let i = Math.max(0, prices.length - period); i < prices.length; i++) {
      const tr = Math.abs(prices[i] - prices[i - 1]);
      atr += tr;
    }
    
    return atr / Math.min(period, prices.length);
  }

  /**
   * ADX hesapla
   */
  private calculateADX(prices: number[], period: number = 14): number {
    if (prices.length < period * 2) return 50;
    
    let upMove = 0;
    let downMove = 0;
    
    for (let i = Math.max(0, prices.length - period); i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) upMove += 1;
      else downMove += 1;
    }
    
    const di = Math.abs(upMove - downMove) / period;
    return Math.min(100, di * 50);
  }

  /**
   * OBV hesapla
   */
  private calculateOBV(prices: number[], volumes: number[]): number {
    if (prices.length === 0 || volumes.length === 0) return 0;
    
    let obv = 0;
    for (let i = 0; i < prices.length; i++) {
      const vol = volumes[i] || 0;
      if (i === 0) {
        obv = vol;
      } else {
        if (prices[i] > prices[i - 1]) {
          obv += vol;
        } else if (prices[i] < prices[i - 1]) {
          obv -= vol;
        }
      }
    }
    
    return obv;
  }

  /**
   * CCI hesapla
   */
  private calculateCCI(prices: number[], period: number = 20): number {
    if (prices.length < period) return 0;
    
    const sma = this.calculateSMA(prices, period);
    const recentPrices = prices.slice(-period);
    const meanDeviation = recentPrices.reduce((sum, p) => sum + Math.abs(p - sma), 0) / period;
    
    return (prices[prices.length - 1] - sma) / (meanDeviation * 0.015 || 0.0001);
  }

  /**
   * EMA hesapla
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length === 1) return prices[0];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  /**
   * Varsayılan para akışı
   */
  private getDefaultCoinFlow(symbol: string, price: number): CoinFlowData {
    return {
      symbol,
      currentPrice: price,
      volume24h: 0,
      volumeChange: 0,
      largeOrderVolume: 0,
      buyPressure: 0,
      sellPressure: 0,
      netFlow: 0,
      momentum: 0,
      trend: 'neutral',
      confidence: 0
    };
  }

  /**
   * Durumu getir
   */
  getState() {
    return {
      historyLength: this.priceHistory.size,
      lastSignals: Array.from(this.lastSignals.entries()).map(([sym, sig]) => ({ symbol: sym, ...sig }))
    };
  }
}

export default AdvancedAlgorithm;
