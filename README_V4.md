# 🚀 Advanced Trading Bot V4.0.0

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](https://github.com/yourusername/trading-bot)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-20+-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.2-blue.svg)](https://www.typescriptlang.org/)

> **Yapay Zeka Destekli, Gerçek Zamanlı Para Akışı Analitikleri ve Gelişmiş Scalping Stratejisi ile Binance Futures Ticaret Botu**

## 🌟 Özellikler

### 🧠 Gelişmiş Algoritma (V4)
- **8 Teknik Gösterge**: RSI, MACD, Bollinger Bands, ATR, ADX, OBV, CCI, SMA
- **Makine Öğrenme Desteği**: Desen tanıma ve tahmin modelleri
- **Para Akışı Analizi**: Order book derin analizi ve net akış hesaplaması
- **Dinamik Risk Yönetimi**: ATR tabanlı stop loss ve optimal leverage
- **Sinyal Kombinasyonu**: 7+ göstergeden akıllı sinyal üretimi

### 📊 Gerçek Zamanlı Veri
- **Live Ticker Verileri**: 24 saatlik fiyat, hacim, yüksek/düşük
- **Order Book Analizi**: Büyük siparişlerin yönü ve basınç
- **Hacim Profili**: Satın almak vs. satmak hacmi
- **Momentum Metrikleri**: Fiyat momentumu ve hız

### ⚡ Scalping Stratejisi (Vur & Kaç)
- **Mikro-Kar Hedefleri**: 0.3% - 1% kâr aralığı
- **Hızlı Giriş/Çıkış**: 1-5 dakika pozisyon süresi
- **Para Akışı Ters Dönüş Algılaması**: Kâr alınırken kapasite en yüksek
- **ATR-Optimized Stop Levels**: Volatilite tabanlı risk

### 🎯 Akıllı Pozisyon Yönetimi
- **Otomatik Kapatma Tetikleri**:
  - Hızlı kâr al (1:1 ratio)
  - MACD negatif dönerek
  - Para akışı tersine dönüş
  - ATR stop loss
  - Zaman sınırı (Scalping)
- **Multi-Target Profit Taking**:
  - TP1, TP2, TP3 seviyeleri
  - Kademeli pozisyon kapanışı

### 🌐 Binance Futures Entegrasyonu
- **CCXT Kütüphanesi**: Merkezi ve güvenilir API bağlantısı
- **Testnet Desteği**: Riskli olmayan test ortamı
- **WebSocket Ready**: Gerçek zamanlı veri akışı
- **100+ Trading Pair**: Tüm popüler coinler

### 📱 Zengin Dashboard
- **İnteraktif Grafikler**: Recharts ile profesyonel görselleştirme
- **Gerçek Zamanlı Sinyaller**: Aktif sinyalleri anında göster
- **Risk/Ödül Analizi**: Her işlem için ratio gösterimi
- **İstatistik Panelleri**: Performans metrikleri

### 🔧 Gelişmiş Ayarlar
```
Algoritma:
  ├─ Minimum Güven: 50% - 95%
  ├─ Max Risk Per Trade: 0.5% - 5%
  ├─ Scaling Faktörü: 0.5x - 2x
  └─ ML Özelliği: Aç/Kapat

Ticaret:
  ├─ Leverage: 1x - 125x
  ├─ Max Açık Pozisyon: 1 - 20
  ├─ Risk Per Position: 0.5% - 5%
  └─ Scalping:
      ├─ Min Kâr: 0.1% - 1%
      └─ Max Süre: 1 - 30 dakika
```

### 🐳 Cloud Deployment
- **Docker Support**: Konteyner ortamında çalıştırma
- **Docker Compose**: Redis, PostgreSQL, Nginx ile tam stack
- **Render.com**: 1-click production deployment
- **GitHub Actions**: Otomatik CI/CD pipeline

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- **Node.js**: 18+ veya 20+
- **npm**: 9+
- **Binance Futures API Keys** (opsiyonel, testnet çalışabilir)
- **Docker** (opsiyonel, production için)

### Yerel Kurulum

```bash
# 1. Repository'i klonla
git clone https://github.com/yourusername/advanced-trading-bot-v4.git
cd advanced-trading-bot-v4

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını düzenle: BINANCE_API_KEY ve BINANCE_API_SECRET ekle

# 4. Geliştirme sunucusunu başlat
npm run dev

# 5. Tarayıcıda aç
# http://localhost:5173 (Frontend)
# http://localhost:3000 (API)
```

### Docker ile Çalıştırma

```bash
# Single Container
docker build -t trading-bot:latest .
docker run -p 3000:3000 -e BINANCE_API_KEY=xxx trading-bot:latest

# Full Stack (Bot + DB + Cache)
docker-compose up -d

# Logs
docker-compose logs -f trading-bot
```

### Production Build

```bash
npm run build
npm start

# Veya
NODE_ENV=production npm start
```

---

## 📚 API Referans

### Health Check
```bash
curl http://localhost:3000/api/health

{
  "status": "operational",
  "timestamp": 1724100000000,
  "binanceConnected": true,
  "algorithmVersion": "v4.0.0",
  "uptime": 3600
}
```

### Canlı Fiyatlar (Tickers)
```bash
curl http://localhost:3000/api/v1/live-tickers

{
  "tickers": [
    {
      "symbol": "BTC/USDT",
      "price": 67500.50,
      "priceChangePercent": 2.45,
      "quoteVolume": 45000000000,
      "timestamp": 1724100000000
    }
  ],
  "count": 10
}
```

### Coin Para Akışı Analizi
```bash
curl -X POST http://localhost:3000/api/v1/analyze-coin-flow \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC/USDT",
    "timeframe": "1h"
  }'

{
  "symbol": "BTC/USDT",
  "flowData": {
    "currentPrice": 67500.50,
    "buyPressure": 1250000,
    "sellPressure": 980000,
    "netFlow": 270000,
    "momentum": 2.34,
    "trend": "up",
    "confidence": 0.78
  },
  "signal": {
    "action": "STRONG_BUY",
    "confidence": 0.85,
    "riskLevel": "MEDIUM",
    "entryPrice": 67500.50,
    "takeProfit1": 67750.00,
    "takeProfit2": 68000.00,
    "takeProfit3": 68250.00,
    "stopLoss": 67200.00,
    "leverage": 15,
    "riskRewardRatio": 3.2
  }
}
```

### Batch Analiz (Tüm Coinler)
```bash
curl -X POST http://localhost:3000/api/v1/analyze-multiple \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["BTC/USDT", "ETH/USDT", "BNB/USDT"],
    "timeframe": "1h"
  }'

{
  "topSignals": [
    {
      "symbol": "BTC/USDT",
      "signal": { /* signal object */ }
    }
  ],
  "total": 3
}
```

### Pozisyon Yönetimi
```bash
curl -X POST http://localhost:3000/api/v1/manage-position \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC/USDT",
    "entryPrice": 67500.00,
    "currentPrice": 67650.00,
    "profitPct": 0.22
  }'

{
  "symbol": "BTC/USDT",
  "management": {
    "shouldClose": true,
    "closeReason": "Hızlı Kâr Al - RSI Aşırı Alım",
    "profitPct": 0.22,
    "riskPct": 0.45
  },
  "recommendation": "Hızlı Kâr Al - RSI Aşırı Alım"
}
```

---

## ⚙️ Yapılandırma

### environment.json
```json
{
  "algorithm": {
    "minConfidence": 0.65,
    "maxRiskPerTrade": 2,
    "scalingFactor": 1.0,
    "useML": true
  },
  "trading": {
    "leverage": 20,
    "maxOpenPositions": 5,
    "riskPerPosition": 2,
    "scalping": {
      "enabled": true,
      "minProfitPct": 0.3,
      "maxTimeMinutes": 5
    }
  },
  "binance": {
    "useTestnet": true,
    "enableRateLimit": true
  }
}
```

### Ortam Değişkenleri
```bash
# API Credentials
BINANCE_API_KEY=your_key_here
BINANCE_API_SECRET=your_secret_here

# Server
NODE_ENV=production
PORT=3000

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=trader
DB_PASSWORD=secure_password

# Redis
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_MONITORING=true

# Notifications
TELEGRAM_BOT_TOKEN=xxx
DISCORD_WEBHOOK_URL=xxx
```

---

## 📊 Algoritma Detayları

### Teknik Göstergeler

| Gösterge | Periyot | Kullanım |
|----------|---------|----------|
| RSI | 14 | Aşırı alım/satım tespiti |
| MACD | 12,26,9 | Momentum ve trend değişimi |
| Bollinger Bands | 20,2 | Volatilite ve fiyat seviyeleri |
| ATR | 14 | Stop loss ve risk hesapı |
| ADX | 14 | Trend gücü ölçümü |
| OBV | - | Hacim onayı |
| CCI | 20 | Uyumsuzluk tespiti |
| SMA | 20,50 | Trend yönü |

### Sinyal Sistemi

```
1. Teknik Göstergeler Analiz (7 gösterge)
   └─ Her gösterge: 0-3 puan
   
2. Para Akışı Analizi
   ├─ Order book TOP 10 analiz
   ├─ Büyük siparişleri tespit
   └─ Net alım/satış basıncı
   
3. Trend Analizi
   ├─ Fiyat momentumu
   ├─ SMA yönü
   └─ Volatilite
   
4. Risk Hesaplaması
   ├─ ATR tabanlı stop
   ├─ Optimal leverage
   └─ Risk/Reward ratio
   
5. Final Sinyal
   ├─ STRONG_BUY (confidence > 85%)
   ├─ BUY (confidence > 75%)
   ├─ HOLD
   ├─ SELL
   └─ STRONG_SELL
```

### Kapatma Kuralları

1. **Hızlı Kâr Al** (Scalping)
   - Şart: Kâr ≥ 0.5% + RSI > 75
   - Aksiyon: Pozisyonu kapat

2. **MACD Negatif Dönerek**
   - Şart: Kâr > 0.3% + MACD cross down
   - Aksiyon: Kâr al

3. **Para Akışı Ters Dönüş**
   - Şart: Kâr > 0.2% + netFlow < -threshold
   - Aksiyon: Pozisyonu kapat

4. **ATR Stop Loss**
   - Şart: Loss ≤ -ATR * 1.5
   - Aksiyon: Otomatik stop

5. **Zaman Sınırı**
   - Şart: Pozisyon açık > 5 dakika + kâr > 0
   - Aksiyon: Kapatma önerisi

---

## 🔒 Güvenlik

- ✅ Environment variables ile credential yönetimi
- ✅ HTTPS/SSL desteği
- ✅ Input validation ve sanitization
- ✅ Rate limiting
- ✅ CORS configuration
- ✅ SQL Injection koruması
- ✅ XSS prevention
- ❌ **Canlı işlem yapmadan testnet'te test edin!**

---

## 🐛 Sorun Giderme

### Binance Bağlantı Hatası
```bash
# 1. API Keys'i kontrol et
echo $BINANCE_API_KEY

# 2. Testnet'i aç
BINANCE_USE_TESTNET=true npm start

# 3. Health check
curl http://localhost:3000/api/health
```

### Memory Hatası
```bash
# Node.js memory limit'ini artır
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### Database Hatası
```bash
# PostgreSQL connection
psql -h localhost -U trader -d trading_bot

# Redis connection
redis-cli ping
```

---

## 📈 Performans Metrikleri

- **Sinyal Üretim Hızı**: < 100ms per coin
- **API Response Time**: < 200ms
- **Memory Usage**: ~150-300MB
- **CPU Usage**: ~5-15%
- **Uptime Target**: 99.5%

---

## 🤝 Katkı Yönergesi

1. Fork repository
2. Feature branch oluştur (`git checkout -b feature/AmazingFeature`)
3. Değişikleşleri commit et (`git commit -m 'Add some AmazingFeature'`)
4. Branch'i push et (`git push origin feature/AmazingFeature`)
5. Pull Request aç

---

## 📝 Lisans

MIT License - Bkz. [LICENSE](LICENSE)

---

## ⚠️ Disclaimer

**Bu uygulama eğitim amaçlı geliştirilmiştir.** Finans danışması değildir. 

- Kendi araştırmanızı yapınız
- Kayıp riskini anlayınız
- Sadece test ortamında başlayınız
- Kendiniz sorumlusunuz

---

## 📞 İletişim

- **GitHub Issues**: Bug raporları ve önerileri
- **Discussions**: Sorular ve fikirler
- **Email**: your.email@example.com

---

## 🙏 Teşekkürler

- Binance API ekibine
- CCXT geliştirme topluluğuna
- Tüm katkıda bulunanlara

---

**Version**: 4.0.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅  

🚀 **Happy Trading!**
