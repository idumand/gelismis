// ==================== GELIŞMIŞ SERVER ALGORİTMASI V3 ====================
// Matematiksel tabanlı entry/exit, dinamik risk yönetimi

import { 
  OrderBookEngine, 
  SmartPositionConfig, 
  DynamicProfitAnalysis,
  MarketAnalysis,
  PositionExitSignal
} from './order-book-engine';

export interface AlgorithmState {
  tradingMode: 'manual' | 'auto';
  algorithmMode: 'dynamic' | 'conservative' | 'aggressive';
  
  // Ayarlar
  minProfitPct1X: number;
  currentLeverage: number;
  maxOpenPositions: number;
  
  // Analiz verileri
  marketAnalysis: Map<string, MarketAnalysis>;
  profitForecasts: Map<string, DynamicProfitAnalysis>;
  lastUpdate: number;
  
  // Pozisyon takibi
  activePositions: Map<string, any>;
  
  // İstatistikler
  totalTrades: number;
  profitableTrades: number;
  totalPNLUSD: number;
  averageRiskRewardRatio: number;
}

export class ServerAlgorithm {
  private orderBookEngine: OrderBookEngine;
  private state: AlgorithmState;

  constructor(initialConfig: SmartPositionConfig) {
    this.orderBookEngine = new OrderBookEngine(initialConfig);
    this.state = {
      tradingMode: 'auto',
      algorithmMode: 'dynamic',
      minProfitPct1X: initialConfig.minProfitPct1X,
      currentLeverage: initialConfig.leverage,
      maxOpenPositions: initialConfig.maxOpenPositions || 5,
      marketAnalysis: new Map(),
      profitForecasts: new Map(),
      lastUpdate: Date.now(),
      activePositions: new Map(),
      totalTrades: 0,
      profitableTrades: 0,
      totalPNLUSD: 0,
      averageRiskRewardRatio: 0
    };
  }

  /**
   * Order book güncelle
   */
  updateOrderBook(
    symbol: string,
    bids: Array<[number, number]>,
    asks: Array<[number, number]>,
    currentPrice: number
  ) {
    this.orderBookEngine.updateOrderBook(symbol, bids, asks, currentPrice);
    this.state.lastUpdate = Date.now();
  }

  /**
   * Coin analiz ve kar hesaplaması
   */
  analyzeCoinForTrading(
    symbol: string,
    currentPrice: number,
    positionSizeUSD: number,
    leverage?: number,
    minProfitPct1X?: number
  ) {
    const lev = leverage || this.state.currentLeverage;
    const minProfit = minProfitPct1X || this.state.minProfitPct1X;

    // Long analiz
    const longAnalysis = this.orderBookEngine.analyzeProfitDynamic(
      symbol,
      currentPrice,
      'long',
      positionSizeUSD,
      lev,
      minProfit
    );

    // Short analiz
    const shortAnalysis = this.orderBookEngine.analyzeProfitDynamic(
      symbol,
      currentPrice,
      'short',
      positionSizeUSD,
      lev,
      minProfit
    );

    // Market analiz
    const market = this.orderBookEngine.analyzeMarket(symbol);
    this.state.marketAnalysis.set(symbol, market);

    // En iyisini kach
    const bestAnalysis = longAnalysis.scores.overallViability >= shortAnalysis.scores.overallViability
      ? longAnalysis
      : shortAnalysis;

    this.state.profitForecasts.set(symbol, bestAnalysis);

    return {
      longAnalysis,
      shortAnalysis,
      bestAnalysis,
      market,
      longDecision: this.orderBookEngine.getSmartEntryDecision(
        symbol,
        currentPrice,
        'long',
        positionSizeUSD,
        lev,
        minProfit
      ),
      shortDecision: this.orderBookEngine.getSmartEntryDecision(
        symbol,
        currentPrice,
        'short',
        positionSizeUSD,
        lev,
        minProfit
      )
    };
  }

  /**
   * AUTO MOD - En iyi coinleri bul ve öner
   */
  getAutoRecommendations(
    symbols: string[],
    prices: Map<string, number>,
    positionSizeUSD: number,
    leverage?: number,
    minProfitPct1X?: number
  ) {
    const results = this.orderBookEngine.getBestCoinForEntry(
      symbols,
      prices,
      positionSizeUSD,
      leverage || this.state.currentLeverage,
      minProfitPct1X || this.state.minProfitPct1X
    );

    return results
      .filter(r => r.decision.action === 'ENTER_NOW' || r.decision.action === 'ENTER_BETTER_PRICE')
      .slice(0, this.state.maxOpenPositions);
  }

  /**
   * Açık pozisyon için çıkış kararı
   */
  getExitSignal(
    symbol: string,
    currentPrice: number,
    entryPrice: number,
    side: 'long' | 'short',
    currentProfitPct: number,
    currentProfitUSD: number,
    leverage?: number
  ): PositionExitSignal {
    return this.orderBookEngine.getSmartExitDecision(
      symbol,
      currentPrice,
      entryPrice,
      side,
      currentProfitPct,
      currentProfitUSD,
      leverage || this.state.currentLeverage
    );
  }

  /**
   * Ayarları güncelle
   */
  updateConfig(newConfig: Partial<SmartPositionConfig>) {
    this.orderBookEngine.updateConfig(newConfig);
    if (newConfig.minProfitPct1X) this.state.minProfitPct1X = newConfig.minProfitPct1X;
    if (newConfig.leverage) this.state.currentLeverage = newConfig.leverage;
    if (newConfig.maxOpenPositions) this.state.maxOpenPositions = newConfig.maxOpenPositions;
  }

  /**
   * Trading modu değiştir
   */
  setTradingMode(mode: 'manual' | 'auto') {
    this.state.tradingMode = mode;
  }

  /**
   * Algoritma modu değiştir
   */
  setAlgorithmMode(mode: 'dynamic' | 'conservative' | 'aggressive') {
    this.state.algorithmMode = mode;

    // Mode ayarları
    const configs = {
      conservative: { minProfitPct1X: 0.8, leverage: 5 },
      balanced: { minProfitPct1X: 0.5, leverage: 10 },
      dynamic: { minProfitPct1X: 0.3, leverage: 20 },
      aggressive: { minProfitPct1X: 0.2, leverage: 50 }
    };

    const config = configs[mode] || configs.dynamic;
    this.updateConfig(config as any);
  }

  /**
   * Durumu getir
   */
  getState(): AlgorithmState {
    return { ...this.state };
  }

  /**
   * Frontend için analiz verisi
   */
  getAnalysisForFrontend(symbol: string) {
    const forecast = this.state.profitForecasts.get(symbol);
    const market = this.state.marketAnalysis.get(symbol);
    const orderBook = this.orderBookEngine.getOrderBookState(symbol);

    return {
      symbol,
      forecast,
      market,
      orderBook,
      state: this.state
    };
  }
}

export default ServerAlgorithm;
