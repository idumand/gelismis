// ==================== GELİŞTİRİLMİŞ EXPRESS SUNUCU V4 ====================
// Real-time WebSocket, Binance API, Gelişmiş Veri Analitikleri

import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as ccxt from 'ccxt';
import AdvancedAlgorithm, { AdvancedSignal, CoinFlowData } from './advanced-algorithm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// CCXT Binance entegrasyonu
let binance: any = null;
const initBinance = async () => {
  try {
    binance = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'future' }
    });
    console.log('[✓] Binance Futures bağlantısı kuruldu');
  } catch (e) {
    console.error('[✗] Binance entegrasyonu hatası:', e);
  }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../dist')));

// Algoritma sistemi
const algorithmInstances = new Map<string, AdvancedAlgorithm>();

const getAlgorithm = (userId: string = 'default') => {
  if (!algorithmInstances.has(userId)) {
    algorithmInstances.set(userId, new AdvancedAlgorithm({
      minConfidence: 0.65,
      maxRiskPerTrade: 2,
      scalingFactor: 1.0,
      useML: true
    }));
  }
  return algorithmInstances.get(userId)!;
};

// ==================== API ENDPOINTS ====================

/**
 * Health Check
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'operational',
    timestamp: Date.now(),
    binanceConnected: !!binance,
    algorithmVersion: 'v4.0.0',
    uptime: process.uptime()
  });
});

/**
 * Canlı Ticker Verileri
 */
app.get('/api/v1/live-tickers', async (req: Request, res: Response) => {
  try {
    if (!binance) {
      return res.json({
        tickers: [],
        cached: true,
        message: 'Binance henüz bağlanmadı'
      });
    }

    const symbols = [
      'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT',
      'XRP/USDT', 'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT'
    ];

    const tickers = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const ticker = await binance.fetchTicker(symbol);
          return {
            symbol: ticker.symbol,
            price: ticker.last,
            lastPrice: ticker.last,
            priceChangePercent: ticker.percentage || 0,
            quoteVolume: ticker.quoteVolume || 0,
            highPrice: ticker.high,
            lowPrice: ticker.low,
            volume: ticker.baseVolume || 0,
            timestamp: ticker.timestamp
          };
        } catch (e) {
          return null;
        }
      })
    );

    res.json({
      tickers: tickers.filter(t => t !== null),
      timestamp: Date.now(),
      count: tickers.length
    });
  } catch (error) {
    console.error('Ticker hatası:', error);
    res.status(500).json({ error: 'Ticker alma hatası' });
  }
});

/**
 * Derin Analiz - Coin Para Akışı
 */
app.post('/api/v1/analyze-coin-flow', async (req: Request, res: Response) => {
  try {
    const { symbol, timeframe = '1h' } = req.body;

    if (!binance) {
      return res.status(503).json({ error: 'Binance bağlantısı yok' });
    }

    const algorithm = getAlgorithm();

    try {
      // Son 200 mumdan veri al
      const candles = await binance.fetchOHLCV(symbol, timeframe, undefined, 200);
      
      // Veriyi algoritma modeline ekle
      candles.forEach((candle: any) => {
        const [timestamp, open, high, low, close, volume] = candle;
        algorithm.addPriceData(symbol, close, volume);
      });

      // Order book al
      const orderBook = await binance.fetchOrderBook(symbol, 50);
      
      // Para akışı analiz et
      const flowData = algorithm.analyzeCoinFlow(symbol, candles[candles.length - 1][4], orderBook);

      // Sinyal üret
      const signal = algorithm.generateAdvancedSignal(symbol, flowData.currentPrice, orderBook);

      res.json({
        symbol,
        flowData,
        signal,
        orderBook: {
          bids: orderBook.bids.slice(0, 10),
          asks: orderBook.asks.slice(0, 10),
          timestamp: orderBook.timestamp
        },
        analysisTime: Date.now()
      });
    } catch (binanceError) {
      console.error('Binance API hatası:', binanceError);
      res.status(500).json({ error: 'Binance verisi alınamadı' });
    }
  } catch (error) {
    console.error('Analiz hatası:', error);
    res.status(500).json({ error: 'Analiz hatası' });
  }
});

/**
 * Batch Analiz - Tüm Coinler
 */
app.post('/api/v1/analyze-multiple', async (req: Request, res: Response) => {
  try {
    const { symbols = [], timeframe = '1h' } = req.body;
    const algorithm = getAlgorithm();

    const results = await Promise.all(
      symbols.map(async (symbol: string) => {
        try {
          const candles = await binance.fetchOHLCV(symbol, timeframe, undefined, 200);
          candles.forEach((candle: any) => {
            const [timestamp, open, high, low, close, volume] = candle;
            algorithm.addPriceData(symbol, close, volume);
          });

          const currentPrice = candles[candles.length - 1][4];
          const signal = algorithm.generateAdvancedSignal(symbol, currentPrice);

          return {
            symbol,
            signal,
            success: true
          };
        } catch (e) {
          return {
            symbol,
            success: false,
            error: String(e)
          };
        }
      })
    );

    // En iyi sinyalleri seç
    const topSignals = results
      .filter(r => r.success && r.signal && r.signal.confidence > 0.7)
      .sort((a, b) => (b.signal?.confidence || 0) - (a.signal?.confidence || 0))
      .slice(0, 10);

    res.json({
      topSignals,
      total: results.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Batch analiz hatası:', error);
    res.status(500).json({ error: 'Batch analiz hatası' });
  }
});

/**
 * Pozisyon Yönetimi
 */
app.post('/api/v1/manage-position', (req: Request, res: Response) => {
  try {
    const { symbol, entryPrice, currentPrice, profitPct } = req.body;
    const algorithm = getAlgorithm();

    const management = algorithm.managePosition(
      symbol,
      entryPrice,
      currentPrice,
      profitPct
    );

    res.json({
      symbol,
      management,
      recommendation: management.shouldClose ? management.closeReason : 'Pozisyonu Tut',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Pozisyon yönetimi hatası:', error);
    res.status(500).json({ error: 'Pozisyon hatası' });
  }
});

/**
 * Gelişmiş Ayarlar Endpoint
 */
app.get('/api/v1/config', (req: Request, res: Response) => {
  const configPath = path.join(__dirname, '../data/config.json');
  
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    res.json(JSON.parse(configData));
  } catch (e) {
    res.json({
      algorithm: {
        minConfidence: 0.65,
        maxRiskPerTrade: 2,
        scalingFactor: 1.0,
        useML: true
      },
      trading: {
        leverage: 20,
        maxOpenPositions: 5,
        riskPerPosition: 2,
        scalping: {
          enabled: true,
          minProfitPct: 0.3,
          maxTimeMinutes: 5
        }
      },
      binance: {
        useTestnet: true,
        enableRateLimit: true
      }
    });
  }
});

/**
 * Ayarları Güncelle
 */
app.post('/api/v1/config', (req: Request, res: Response) => {
  try {
    const configPath = path.join(__dirname, '../data/config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));

    res.json({
      success: true,
      message: 'Ayarlar güncellendi',
      config: req.body
    });
  } catch (error) {
    res.status(500).json({ error: 'Ayar hatası' });
  }
});

/**
 * İstatistikler
 */
app.get('/api/v1/stats', (req: Request, res: Response) => {
  const algorithm = getAlgorithm();
  const state = algorithm.getState();

  res.json({
    algorithm: {
      version: 'v4.0.0',
      activeSymbols: state.historyLength,
      lastSignals: state.lastSignals.length,
      uptime: process.uptime()
    },
    server: {
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    },
    timestamp: Date.now()
  });
});

/**
 * SPA Fallback
 */
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ==================== ERROR HANDLING ====================

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Server hatası:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Sunucu hatası oluştu'
  });
});

// ==================== SERVER BAŞLATMA ====================

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Binance'i başlat
    await initBinance();

    // Data klasörü oluştur
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Sunucu başlat
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║       🤖 GELİŞTİRİLMİŞ TICARET BOTU V4 BAŞLANDI 🤖       ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  🌐 Sunucu: http://localhost:${PORT}                 
║  📊 Dashboard: http://localhost:${PORT}/dashboard       
║  📡 API: http://localhost:${PORT}/api/v1              
║  🔧 Ayarlar: http://localhost:${PORT}/api/v1/config   
║                                                            ║
║  ✅ Gelişmiş Algoritma V4 Aktif                           ║
║  ✅ Real-time Para Akışı Analizi                          ║
║  ✅ Multi-Coin Sinyali Üretimi                            ║
║  ✅ Pozisyon Yönetimi Sistemi                             ║
║  ✅ Binance Futures Entegrasyonu                          ║
║                                                            ║
║  📚 Dökümantasyon: /api/docs                             ║
║  🧪 Testler: npm run test                                ║
║  🚀 Production: npm run build && npm start               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Sunucu başlatma hatası:', error);
    process.exit(1);
  }
};

startServer();

export default app;
