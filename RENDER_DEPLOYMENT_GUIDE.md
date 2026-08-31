# 🚀 Render.com'a Bot Deployment - Adım Adım Rehberi

## Ön Gereksinimler
- ✅ GitHub hesabı (repo push yapabilmen için)
- ✅ Render.com hesabı (https://render.com)
- ✅ Binance API Keys (testnet veya live)

---

## 1️⃣ GitHub'a Push Et

### Adım 1: Git Yapılandırması (İlk Defasında)
```bash
cd /path/to/your/bot
git init
git config user.email "your_email@example.com"
git config user.name "Your Name"
git add .
git commit -m "Initial commit - Trading bot v2.0"
```

### Adım 2: GitHub'a Bağlan
```bash
# Yeni repo oluştur: https://github.com/new
# Adlandır: binance-trading-bot

git remote add origin https://github.com/YOUR_USERNAME/binance-trading-bot.git
git branch -M main
git push -u origin main
```

---

## 2️⃣ Render.com Setup

### Adım 1: Render'a Giriş
1. https://render.com'a git
2. Sign Up / Log In yap
3. Dashboard'a git

### Adım 2: Yeni Web Service Oluştur
1. "New" butonuna tıkla
2. "Web Service" seç
3. "Connect a repository" tıkla
4. GitHub'u yetkilendir (izin ver)
5. **binance-trading-bot** repo'sunu seç

### Adım 3: Yapılandırma Ayarları

| Ayar | Değer |
|------|-------|
| **Name** | binance-trading-bot |
| **Environment** | Docker |
| **Region** | Frankfurt (EU) veya Singapore (ASIA) |
| **Branch** | main |
| **Plan** | Free tier |

### Adım 4: Environment Variables Ekle

Dashboard'da **Environment** bölümüne git:

```
NODE_ENV = production
PORT = 3000
```

Binance API'si için (eğer bot'ta otomatik API yönetimi varsa):
```
BINANCE_API_KEY = your_actual_key
BINANCE_API_SECRET = your_actual_secret
```

⚠️ **Güvenlik Notu**: Production'da API keys'i şifreli şekilde sakla!

### Adım 5: Deploy Yap
- "Deploy" butonuna tıkla
- Deploy logs'u izle (2-5 dakika sürebilir)
- ✅ "Live" yazısını gör

---

## 3️⃣ Deploy Sonrası

### Adım 1: Bot URL'sini Al
- Dashboard'da "Live" butonuna tıkla
- URL'i kopyala: `https://binance-trading-bot-xxxx.onrender.com`

### Adım 2: Health Check Yap
```bash
curl https://binance-trading-bot-xxxx.onrender.com/api/v1/health
```

Beklenen Yanıt:
```json
{ "status": "ok", "uptime": 123 }
```

### Adım 3: Bot'a Eriş
- Tarayıcıda aç: `https://binance-trading-bot-xxxx.onrender.com`
- Gönderilmeyen bağlantılar için bekle (ilk açılış 30 sn sürebilir)

---

## 4️⃣ Binance Bağlantısı

### UI'da Ayarla
1. Bot dashboard'ı aç
2. "Settings" > "Binance Settings"
3. API Key ve Secret gir
4. Testnet'i seç (güvenli)
5. "Connect" tıkla
6. Status'u kontrol et: "Connected" ✓

### Testnet Üzerinde Test Et
```
Binance Testnet: https://testnet.binance.vision/
API Keys için: https://testnet.binance.vision/key/generate
```

---

## 5️⃣ Otomatik Deploy (GitHub Hooks)

### Adım 1: Deploy Hook Oluştur
1. Render Dashboard > binance-trading-bot
2. "Settings" açıkla
3. "Deploy Hook" bölümüne git
4. URL'i kopyala

### Adım 2: GitHub Webhook Ayarla
1. GitHub repo > Settings > Webhooks
2. "Add webhook"
3. Payload URL: Render Deploy Hook URL
4. Content type: application/json
5. Events: Push events
6. Add webhook

### Adım 3: Test Et
```bash
cd ~/your-bot-repo
git add .
git commit -m "Test auto-deploy"
git push origin main
```

Render Dashboard'da otomatik deploy'u izle ✓

---

## 6️⃣ Monitoring ve Logging

### Adım 1: Logs Görüntüle
- Render Dashboard > binance-trading-bot
- "Logs" sekmesine tıkla
- Gerçek-zamanlı logs izle

### Adım 2: Crash Detection
Render otomatik olarak crashing servisleri yeniden başlatır:
- Status > "Live" (sağlıklı)
- Status > "Deploy in progress" (yeniden başlatılıyor)
- Status > "Failed" (sorun var)

### Adım 3: Sorun Giderme
```bash
# Logs'tan hata mesajlarını oku
# Genellikle:
# - "Port already in use" → PORT ayarını kontrol et
# - "Module not found" → npm install yeniden çalıştır
# - "ECONNREFUSED" → Binance API bağlantısını kontrol et
```

---

## 7️⃣ Üretim Optimizasyonu

### Adım 1: Memory Optimization
Free tier sınırları:
- 512 MB RAM
- 0.5 vCPU
- 750 işletim saati/ay

Optimizasyon:
```javascript
// server.ts'de
NODE_OPTIONS=--max-old-space-size=400
```

### Adım 2: Startup Time
- Node modules'u cache'de tutuyor
- Build cache'i resetlemen gerekebilir:
  - Dashboard > Settings > "Clear build cache"

### Adım 3: Performance Monitoring
- Dashboard'da CPU/Memory kullanımını izle
- Yüksek kullanım varsa paid plan'a geç

---

## 8️⃣ SSL/HTTPS
✅ Render otomatik HTTPS sağlıyor
✅ Herhangi bir konfigürasyon gerekmiyor
✅ API endpoints HTTPS korumalı

---

## 9️⃣ Custom Domain (Opsiyonel)

### Adım 1: Domain Satın Al
- Namecheap, GoDaddy, vb.

### Adım 2: Render'da Ekle
1. Dashboard > Settings > "Custom Domains"
2. Domain'i gir
3. DNS records'u güncelle (CNAME)
4. Propagate'i bekle (24 saat)

---

## 🔟 Troubleshooting

### ❌ "Build failed"
```
Çözüm:
1. Render logs'u oku
2. package.json dependencies kontrol et
3. node-gyp gerektiren modüller varsa:
   - Alpine sorunları yaşayabilir
   - Dockerfile'ı güncelle
```

### ❌ "Service crashed"
```
Çözüm:
1. Restart button'a tıkla
2. Health check endpoint'ini kontrol et
3. Memory limiti aş mı? (Free tier → Paid)
```

### ❌ "API bağlantısı yok"
```
Çözüm:
1. Binance API keys'i kontrol et
2. Testnet mi / Mainnet mi?
3. IP whitelist'i kontrol et
4. API rate limitleri aş mı?
```

### ❌ "Deployment çok yavaş"
```
Çözüm:
1. "Clear build cache" yap
2. node_modules'u sil ve yeniden inşa et
3. Unnecessary dependencies kaldır
4. CDN kullan (static assets için)
```

---

## 📊 Performance Metrics

### Render Free Tier Limitler
| Metrik | Limit |
|--------|-------|
| Memory | 512 MB |
| CPU | 0.5 vCPU (shared) |
| Storage | Ephemeral (restart'ta sıfırlanır) |
| Bandwidth | 100 GB/ay |
| Hours | 750 saat/ay (essentially unlimited 24/7) |

### Optimizasyon İpuçları
- Database cache'leyi küçük tut
- WebSocket'i verimli kullan
- Interval'leri ayarla (too frequent = CPU spike)
- Memory leak'leri kontrol et

---

## 🛡️ Security Best Practices

1. **API Keys**
   - Production'da environment variables kullan
   - GitHub'a commit etme!
   - Render secrets'i şifrele

2. **HTTPS**
   - ✅ Otomatik (Render)
   - API her zaman HTTPS üzerinden

3. **Rate Limiting**
   - Binance rate limits'ini respektle
   - X-MBX-USED-WEIGHT header'ını kontrol et

4. **Monitoring**
   - Render logs'unu düzenli kontrol et
   - Anomalileri tespit et
   - Alert set et (webhook)

---

## 📞 İletişim & Destek

- **Render Support**: https://render.com/support
- **Binance API Docs**: https://binance-docs.github.io/apidocs/
- **Node.js Docs**: https://nodejs.org/docs/

---

## ✅ Başarılı Deployment Kontrol Listesi

- [ ] GitHub repo'su public ve accessible
- [ ] Render hesabı oluşturuldu
- [ ] Docker build hatasız çalışıyor
- [ ] Environment variables ayarlandı
- [ ] Health check endpoint'i 200 döndürüyor
- [ ] Bot dashboard açılıyor
- [ ] Binance API bağlantısı sağlanıyor
- [ ] İlk işlem başarılı oldu
- [ ] Logs'ta hata yok
- [ ] Otomatik deploy webhook'u çalışıyor

---

**Happy Trading! 🚀**

Soruların varsa GitHub Issues'ta aç veya docs'u kontrol et.
