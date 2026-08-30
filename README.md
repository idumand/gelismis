# 🤖 Akışkan Ticaret Algoritması v3.0

**Yapay Zeka Destekli Profesyonel Trading Bot** - Order Flow Analizi ve Dinamik Kar Hesabı

---

## 🎯 Temel Özellikler

### ✨ Yeni v3.0 Özellikleri

- **🧠 Akıllı Matematik Algoritması**
  - Order Flow Imbalance (OFI) - Bid/Ask Dengeleme Analizi
  - Market Microstructure - Piyasa Yapı Analizi
  - Real-time Trade Flow - Alıcı vs Satıcı Analizi
  - Momentum Detection - Piyasa Momentumu Tespiti
  - Long/Short Pressure - Taraf Baskısı Analizi

- **💰 Gelişmiş Kar Hesabı**
  - 1x Bazında Minimum Kar Girişi (Örn: %0.5)
  - Leverage'a Göre Otomatik Hesaplama (1x → 50x)
  - Binance Komisyonu Dahil (%0.1)
  - Gerçekçi Kar Hedefleri
  - Risk-Reward Optimizasyonu

- **🎮 Dual Mode İşletim**
  - **Manual Mod**: Seçili coinler üzerinde işlem
  - **Algoritma Modu**: AI en iyi coinleri otomatik seçer

- **📊 Akıllı İstatistik Paneli**
  - Real-time Market Pressure (3 zaman dilimi)
  - Order Book Analizi (Bid/Ask Oranı)
  - Trade Flow Dominans Tespiti
  - Algoritma Sağlık Göstergesi
  - Pozisyon Açma/Kapama Önerileri

- **🌐 Binance Entegrasyonu**
  - Canlı İşlem Modu (Live Trading)
  - Testnet Modu (Demo)
  - Order Book Verileri
  - 24h Ticker Bilgileri
  - Real-time Price Updates

- **⚙️ Optimize Edilmiş Ayarlar**
  - Leverage Kontrolü (1x - 50x)
  - Minimum Kar Yüzde (0.1% - 5%)
  - Maksimum Açık Pozisyon (1-5)
  - Binance Modu Seçimi (Live/Testnet)
  - Manuel/Algoritma Mode Toggle

---

## 📋 Sistem Gereksinimleri

- **Node.js**: 18.0+
- **npm**: 9.0+
- **Browser**: Chrome, Firefox, Safari (Modern)
- **RAM**: 2GB minimum
- **Internet**: Stabil bağlantı gereklidir

---

## 🚀 Kurulum & Başlama

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Çevre Değişkenlerini Ayarla

```bash
# .env.example dosyasını kontrol et
# Binance API Keys (Testnet'te başla!)
VITE_BINANCE_API_KEY=your_testnet_key
VITE_BINANCE_API_SECRET=your_testnet_secret
```

### 3. Geliştirme Sunucusunu Başlat

```bash
npm run dev
```

Tarayıcıda açın: `http://localhost:5173`

### 4. Üretim İçin Build Et

```bash
npm run build
npm run start
```

---

## 💡 Algoritma Nasıl Çalışır?

### 1️⃣ **Veri Toplama**
- Order Book'tan Bid/Ask Derinliği
- Son 200 işlemden akış analizi
- Technical göstergeler (RSI, MACD, vb)

### 2️⃣ **Analiz Aşaması**
```
Order Book Analizi
├─ Bid/Ask Oranı → Alıcı/Satıcı Baskısı
├─ Spread Kontrolü → Likidite Kalitesi
└─ Derinlik → Order Book Gücü

Trade Flow Analizi
├─ Buy/Sell Volume → Para Akışı
├─ İşlem Sayıları → Momentum
└─ Dominant Side → Taraf Belirleme

Market Pressure
├─ Kısa Vadeli (güncel)
├─ Orta Vadeli (smoothed)
└─ Uzun Vadeli (trend)
```

### 3️⃣ **Karar Verme**
- **Pozisyon Açma Şartları**:
  - Likidite yeterli olmalı
  - Order Flow baskısı açık olmalı
  - Minimum kar potansiyeli sağlanmalı
  
- **Pozisyon Kapama Şartları**:
  - Kar hedefine ulaştı
  - Stop Loss tetiklendi
  - Piyasa yönü değişti (kar ile çık)
  - Likidite çok kötüleşti

### 4️⃣ **Kar Hesabı (Örnek)**

```
Scenario: BTC/USDT, 1x başında %0.5 kar, %0.1 komisyon

1x Kar Hesabı:
- İşlem Fiyatı: $43.000
- Hedef Fiyat: $43.215 (% 0.5 kar)
- Komisyon: 0.1% (giriş + çıkış)
- Net Kar: ~%0.3

5x Leverage Uygulandığında:
- Karlı Hedef: %0.5 × 5 = %2.5
- Komisyon: Aynı kalır (%0.1)
- Net Kar: ~%1.4

Sonuç: 5x ile gerçek kar %1.4 → Eşik: %0.5 ✓
```

---

## 🎮 Kullanım Kılavuzu

### 📱 Ana Dashboard

1. **Market Seçimi**
   - "Coin Verileri" panelinden coin seçin
   - Volume, volatility, order book baskısı görülebilir

2. **Modu Seçin**
   - ⚙️ Ayarlar → Mode seçimi (Manual/Algoritma)
   - **Manual**: Elle seçtiğiniz coinlerle işlem
   - **Algoritma**: Bot en iyi coinleri bulur

3. **Leverage Ayarı**
   - Slider ile 1x - 50x arasında seçin
   - Önerilen: 5-10x (dengeli risk/kar)

4. **Minimum Kar Belirleyin**
   - 1x bazında (örn: %0.5)
   - Algoritma bunu leverage'a göre ölçeklendirir

5. **Binance Modu Seçimi**
   - 🟢 Testnet (İlk başta!)
   - 🔴 Canlı (Sadece test edildikten sonra)

### 📊 Akıllı İstatistik Paneli

- **Momentum Skoru**: 0-100 (ne kadar güçlü)
- **Trend Yönü**: Long/Short/Neutral
- **Order Book Oranı**: Bid/Ask dengesi
- **İşlem Akışı**: Alıcı/Satıcı dominant
- **Likidite**: İşlem yapılabilir mi?

### 🔴 Algoritma Sağlığı

- **> 70%**: Verileri güvenilir, işlem yapabilir
- **40-70%**: Dikkatli olun
- **< 40%**: Likidite kötü, işlem yapma

---

## ⚙️ Gelişmiş Ayarlar

### Order Flow Analizi Parametreleri
```javascript
// Bid/Ask dengeleme
bidAskRatio > 1.5  → Güçlü alıcı baskısı
bidAskRatio < 0.7  → Güçlü satıcı baskısı

// Order book derinliği
Derinlik > 1M USD  → Mükemmel likidite
Derinlik < 100K USD → Kötü likidite
```

### Kar Hedefi Hesabı
```javascript
minProfitAt1x = 0.5%  // Kullanıcı girer
commissionRate = 0.1%  // Binance
leverage = 5

Beklenen Kar = (minProfitAt1x × leverage) - commissionRate
             = (0.5% × 5) - 0.1%
             = 2.4%
```

### Risk-Reward Oranı
```javascript
riskRewardRatio = Kar Potansiyeli / Stop Loss Mesafesi

Örnek:
- Kar: 2.5% (hedef fiyata)
- Zarar: 1.5% (stop loss'a)
- Oran: 2.5/1.5 = 1.67:1  ✓ (iyi)
```

---

## 🔐 Güvenlik Önerileri

1. **Testnet'te Başlayın**
   - Binance Testnet API keys kullanın
   - Gerçek para riskini ortadan kaldırın
   - Algoritma davranışını gözlemleyin

2. **API Keys Yönetimi**
   - Keys'i .env dosyasında saklayın
   - GitHub'a push etmeyin
   - Read-only keys ile başlayın

3. **Risk Yönetimi**
   - Leverage'ı düşük tutun (5-10x)
   - Maksimum açık pozisyon sınırı koyun
   - Stop loss her zaman kullanın

4. **Monitoring**
   - Sık sık algoritmayı izleyin
   - Anormal davranışları not edin
   - Ayarları ihtiyaca göre güncelleyin

---

## 📈 İstatistikler & Performans

### Beklenen Metrikler
- **Win Rate**: 55-65% (market koşullarına bağlı)
- **Avg Win**: %1-2 (leverage'a bağlı)
- **Avg Loss**: %1-1.5 (stop loss)
- **Profit Factor**: 1.5+ (iyi)

### Optimize Etme İpuçları
- Minimum kar yüzdesini artırın (daha güvenilir işlemler)
- Leverage'ı düşürün (risk azalır)
- Order Flow baskısı filtresini sıklaştırın
- Likidite şartını güçlendirin

---

## 🐛 Sorun Giderme

### Problem: Pozisyon Açılmıyor
**Çözüm:**
- Likidite kontrol edin (çok düşük mü?)
- Minimum kar eşiğini düşürün
- Order flow baskısını kontrol edin
- Binance bağlantısını doğrulayın

### Problem: Çok Sık Stop Loss
**Çözüm:**
- Leverage'ı düşürün
- Stop loss yüzdesini artırın (örn: 2%)
- Likidite daha iyi coinleri seçin
- Minimum kar değerini artırın

### Problem: Algoritma Sağlığı Düşük
**Çözüm:**
- Order book derinliğini kontrol edin
- Daha likit coinler seçin
- Testnet/Live modu değiştirmeyi deneyin
- Binance bağlantısını yenileme

---

## 📚 API Endpoints (Backend)

### Market Data
```
GET /api/v1/live-tickers
GET /api/v1/order-book/:pair
GET /api/v1/trades/:pair
GET /api/v1/market-pressure/:pair
```

### Trading
```
POST /api/v1/position/open
POST /api/v1/position/close
GET /api/v1/positions
GET /api/v1/position/:id
```

### Analytics
```
GET /api/v1/algorithm-metrics/:pair
GET /api/v1/statistics
GET /api/v1/performance
```

---

## 📞 Destek & Katkılar

- **Issues**: GitHub Issues'de rapor edin
- **Suggestions**: Diskusyon açın
- **PRs**: Feature branches kullanın

---

## 📄 Lisans

MIT License - Detaylar için `LICENSE` dosyasına bakın

---

## 🎉 Son Notlar

Bu bot **profesyonel ticaret** amacıyla tasarlanmıştır. Yine de:

- ⚠️ **Finansal tavsiye değildir**
- ⚠️ **Her zaman kendi araştırmanızı yapın**
- ⚠️ **Risk aldığınız parayı kaybetmeyi kabul edin**
- ⚠️ **Küçük pozisyonlarla başlayın**

**Başarılı işlemler! 📈**
