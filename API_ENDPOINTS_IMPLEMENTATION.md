# API Endpoints İmplementasyon Rehberi

Bu dosya, `server.ts` dosyasında eklenmesi gereken yeni API endpoints'lerini gösterir.

## Gerekli Endpoints

### 1. Algorithm Metrics Endpoint

```typescript
app.get("/api/v1/algorithm-metrics", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTC/USDT";
  
  try {
    // 1. Order book ve trades al
    const orderBook = latestOrderBooks[symbol];
    const trades = latestTradeHistory[symbol] || [];
    
    // 2. AdvancedAlgorithm kullan
    const algorithm = new AdvancedAlgorithm();
    
    // 3. Analizler yap
    const orderFlow = algorithm.analyzeOrderFlow(orderBook, trades);
    const microstructure = algorithm.analyzeMarketStructure(orderBook);
    
    // 4. Technical Signals (mevcut kod kullan)
    const technicalSignals = {
      rsi: latestMetricsPerCoin[symbol]?.rsi || 50,
      macd: latestMetricsPerCoin[symbol]?.macd || 0,
      bollingerBands: latestMetricsPerCoin[symbol]?.bb || {},
      vwap: latestMetricsPerCoin[symbol]?.vwap || 0,
      sma200: latestMetricsPerCoin[symbol]?.sma200 || 0,
      ema50: latestMetricsPerCoin[symbol]?.ema50 || 0,
      trend: latestMetricsPerCoin[symbol]?.trend || "neutral",
      trendStrength: latestMetricsPerCoin[symbol]?.trendStrength || 0,
    };
    
    // 5. Position analizi (aktif pozisyon varsa)
    let positionAnalysis = null;
    if (activePositions[symbol]) {
      const pos = activePositions[symbol];
      positionAnalysis = algorithm.analyzePosition(
        pos.entryPrice,
        latestMetricsPerCoin[symbol].currentPrice,
        pos.stopLossPct ? pos.entryPrice * (1 - pos.stopLossPct / 100) : pos.baseStopPrice,
        pos.amount,
        pos.leverage
      );
    }
    
    // 6. Score hesapla
    const algorithmScore = algorithm.calculateAlgorithmScore({
      orderFlow,
      microstructure,
      technicalSignals,
      positionAnalysis,
    });
    
    // 7. Recommendation belirle
    let recommendation = "HOLD";
    if (algorithmScore >= 75) recommendation = "STRONG_BUY";
    else if (algorithmScore >= 60) recommendation = "BUY";
    else if (algorithmScore <= 25) recommendation = "STRONG_SELL";
    else if (algorithmScore <= 40) recommendation = "SELL";
    
    res.json({
      timestamp: Date.now(),
      pair: symbol,
      orderFlow,
      microstructure,
      technicalSignals,
      positionAnalysis,
      recommendation,
      algorithmScore,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### 2. Binance Market Data Endpoint

```typescript
app.get("/api/v1/binance/market-data", async (req, res) => {
  try {
    const algorithm = new AdvancedAlgorithm();
    const activePairs = getActiveTradingPairs();
    
    const coinDataList = activePairs.map((pair) => {
      const metrics = latestMetricsPerCoin[pair];
      const orderBook = latestOrderBooks[pair];
      const trades = latestTradeHistory[pair] || [];
      
      if (!metrics) return null;
      
      const orderFlow = algorithm.analyzeOrderFlow(orderBook, trades);
      
      return {
        symbol: pair.split("/")[0],
        pair,
        price: metrics.currentPrice,
        change24h: metrics.change24h || 0,
        change1h: metrics.change1h || 0,
        volume24h: metrics.volume24h || 0,
        marketCap: metrics.marketCap || 0,
        high24h: metrics.high24h || 0,
        low24h: metrics.low24h || 0,
        lastUpdate: Date.now(),
        buyPressure: (orderFlow.pressureScore + 1) / 2,
        sellPressure: (1 - orderFlow.pressureScore) / 2,
        algorithmScore: metrics.algorithmScore || 50,
      };
    });
    
    res.json(coinDataList.filter((x) => x !== null));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### 3. Coin Details Endpoint

```typescript
app.get("/api/v1/binance/coin-details", async (req, res) => {
  const pair = (req.query.pair as string) || "BTC/USDT";
  
  try {
    const metrics = latestMetricsPerCoin[pair];
    const orderBook = latestOrderBooks[pair];
    
    if (!metrics) {
      return res.status(404).json({ error: "Coin data not found" });
    }
    
    // Price history (son 20 veri noktası)
    const priceHistory = (
      latestMetricsPerCoin[pair]?.priceHistory || []
    ).slice(-20);
    
    res.json({
      symbol: pair.split("/")[0],
      pair,
      price: metrics.currentPrice,
      change24h: metrics.change24h || 0,
      change1h: metrics.change1h || 0,
      volume24h: metrics.volume24h || 0,
      marketCap: metrics.marketCap || 0,
      high24h: metrics.high24h || 0,
      low24h: metrics.low24h || 0,
      lastUpdate: Date.now(),
      buyPressure: 0.5,
      sellPressure: 0.5,
      algorithmScore: metrics.algorithmScore || 50,
      priceHistory: priceHistory.map((p: any) => ({
        time: new Date(p.timestamp).toLocaleTimeString(),
        price: p.price,
      })),
      volumeHistory: [],
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### 4. Set Minimum Profit Endpoint

```typescript
app.post("/api/v1/algorithm/set-min-profit", (req, res) => {
  const { minProfitPct } = req.body;
  
  if (typeof minProfitPct !== "number" || minProfitPct < 0) {
    return res.status(400).json({ error: "Invalid minProfitPct value" });
  }
  
  activeMinExpectedMovePct = minProfitPct;
  
  engineLogs.push({
    timestamp: Date.now(),
    level: "INFO",
    message: `Minimum profit threshold updated to ${minProfitPct}%`,
  });
  
  res.json({
    status: "success",
    minProfitThresholdPct: activeMinExpectedMovePct,
  });
});
```

### 5. Settings Endpoint (GET)

```typescript
app.get("/api/v1/settings", (req, res) => {
  res.json({
    minProfitThresholdPct: activeMinExpectedMovePct,
    maxOpenTrades,
    stakeAmount: activeStakeAmount,
    leverage: targetLeverage,
    stopLossPct: activeStopLossPct,
    takeProfitPct: activeTakeProfitPct,
    environment: activeExchangeEnvironment,
    coinSelectionMode,
    marginMode: activeMarginMode,
  });
});
```

### 6. Settings Endpoint (POST)

```typescript
app.post("/api/v1/settings", (req, res) => {
  const {
    minProfitThresholdPct,
    maxOpenTrades: maxTrades,
    stakeAmount,
    leverage,
    stopLossPct,
    takeProfitPct,
    environment,
    coinSelectionMode: mode,
    marginMode,
  } = req.body;
  
  // Validasyon
  if (typeof minProfitThresholdPct === "number") {
    activeMinExpectedMovePct = Math.max(0, minProfitThresholdPct);
  }
  
  if (typeof maxTrades === "number") {
    maxOpenTrades = Math.max(1, Math.min(5, maxTrades));
  }
  
  if (typeof stakeAmount === "number") {
    activeStakeAmount = Math.max(1, stakeAmount);
  }
  
  if (typeof leverage === "number") {
    targetLeverage = Math.max(1, Math.min(20, leverage));
  }
  
  if (typeof stopLossPct === "number") {
    activeStopLossPct = Math.max(0.1, stopLossPct);
  }
  
  if (typeof takeProfitPct === "number") {
    activeTakeProfitPct = Math.max(0.1, takeProfitPct);
  }
  
  if (mode === "manual" || mode === "algorithm") {
    coinSelectionMode = mode;
  }
  
  if (marginMode === "isolated" || marginMode === "cross") {
    activeMarginMode = marginMode;
  }
  
  engineLogs.push({
    timestamp: Date.now(),
    level: "INFO",
    message: `Settings updated: min=${activeMinExpectedMovePct}%, maxTrades=${maxOpenTrades}, leverage=${targetLeverage}x`,
  });
  
  res.json({
    status: "success",
    settings: {
      minProfitThresholdPct: activeMinExpectedMovePct,
      maxOpenTrades,
      stakeAmount: activeStakeAmount,
      leverage: targetLeverage,
      stopLossPct: activeStopLossPct,
      takeProfitPct: activeTakeProfitPct,
      environment: activeExchangeEnvironment,
      coinSelectionMode,
      marginMode: activeMarginMode,
    },
  });
});
```

## Server.ts'e Eklenecek Import

```typescript
import { AdvancedAlgorithm } from "./src/lib/AdvancedAlgorithm";

// Global değişkenler
let advancedAlgorithm = new AdvancedAlgorithm(activeMinExpectedMovePct);
```

## Veri Yapıları (TypeScript)

Aşağıdaki interfaces `latestMetricsPerCoin` içinde bulunmalı:

```typescript
interface CoinMetrics {
  currentPrice: number;
  change24h: number;
  change1h: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
  rsi: number;
  macd: number;
  bb: BollingerBand;
  vwap: number;
  sma200: number;
  ema50: number;
  trend: string;
  trendStrength: number;
  algorithmScore: number;
  priceHistory: PricePoint[];
}

interface PricePoint {
  timestamp: number;
  price: number;
}
```

## Entegrasyon Adımları

1. **AdvancedAlgorithm.ts'i import et**
   ```typescript
   import { AdvancedAlgorithm } from "./src/lib/AdvancedAlgorithm";
   ```

2. **Global instance oluştur**
   ```typescript
   const algorithm = new AdvancedAlgorithm();
   ```

3. **Endpoints'i server.ts'e ekle**
   - Her bir endpoint kodu kopyala
   - Router'a yerleştir
   - Veri yapılarını doğru uyarla

4. **UI bileşenlerini App.tsx'e ekle**
   ```typescript
   import { AlgorithmAnalyzer } from "./components/AlgorithmAnalyzer";
   import { BinanceCoinData } from "./components/BinanceCoinData";
   import { AdvancedSettings } from "./components/AdvancedSettings";
   
   // Template'te ekle
   <AlgorithmAnalyzer symbol="BTC/USDT" />
   <BinanceCoinData />
   <AdvancedSettings />
   ```

5. **Test et**
   - Testnet'te başla
   - API endpoints'lerini kontrol et
   - UI'ın veri aldığını doğrula

## Hata Ayıklama

- Browser console'da hataları kontrol et
- Server logs'a bak (`/api/v1/logs`)
- Network tab'da API çağrılarını görüştür
- WebSocket bağlantısını kontrol et

## İletişim

Bu endpoints'lerin implement edilmesi tamamlandıktan sonra tüm özellikler çalışır duruma gelecektir!
