# 🚀 RENDER.COM'DA DEPLOY - TÜRKÇE REHBER

Render, Node.js uygulamaları için **ücretsiz** hosting sağlayan platform.

---

## 📋 GEREKSINIMLER

- GitHub hesabı (ücretsiz)
- Render hesabı (ücretsiz)
- Binance API Keys (futures)

---

## 🔗 ADIM 1: GitHub'a Yükle

### Lokal Bilgisayarda

```bash
# ZIP'i aç
unzip bot_github_render.zip
cd bot_fixed

# Git setup
git init
git add .
git commit -m "ARGOS AI BOT v3.0 - Render Deploy"

# GitHub'a connect
git remote add origin https://github.com/YOUR_USERNAME/argos-ai-bot.git
git branch -M main
git push -u origin main
```

### GitHub'da

1. **GitHub.com** → "+" → "New repository"
2. **Repository adı:** `argos-ai-bot`
3. **Description:** "Advanced AI-Powered Binance Futures Bot"
4. **Public** seç (Render GitHub'ı okumalı)
5. **Create repository**

---

## 🌐 ADIM 2: Render.com'da Deploy

### 1. Render Hesabı Oluştur

```
1. https://render.com → "Sign up"
2. GitHub ile sign in yap (tavsiye edilir)
3. Email doğrula
```

### 2. Yeni Web Service Oluştur

```
1. Render dashboard → "New +" → "Web Service"
2. "Connect a repository" → GitHub
3. "argos-ai-bot" repo'sunu seç
4. "Connect"
```

### 3. Deployment Ayarlarını Yap

**Settings:**

| Alan | Değer |
|------|-------|
| **Name** | argos-ai-bot |
| **Environment** | Node |
| **Branch** | main |
| **Build Command** | `npm install` |
| **Start Command** | `npm run build && npm run start` |

**Advanced:**
- **Auto-deploy:** Enabled (her push'ta deploy)

### 4. Environment Variables Ekle

**Settings → Environment**

Aşağıdaki 4 taneyi ekle:

```env
BINANCE_API_KEY=your_live_key_here
BINANCE_API_SECRET=your_live_secret_here
BINANCE_TESTNET_KEY=your_testnet_key_here
BINANCE_TESTNET_SECRET=your_testnet_secret_here
```

**Binance'den Key Alma:**

1. **Binance.com** → Account → API Management
2. **Test Network:** "Create Test API Key" → Copy
3. **Live Futures:** "Create API Key" → Copy secret
4. **IP Whitelist:** Render IP'sini ekle (settings'te gösterilir)

### 5. Deploy!

```
1. "Create Web Service" butonuna tıkla
2. Render deploy'ı başlatacak (~5 dakika)
3. Logs'u izle (Deployment sekmesi)
4. "Live" yaşarsa başarılı ✅
```

---

## ✅ Deployment Başarılı mı?

**Logs'ta göreceğin:**

```
✅ npm install complete
✅ npm run build complete
✅ Server running on port 3000
✅ Binance connection established
```

**URL:** https://argos-ai-bot.onrender.com

---

## 🌐 Bot'a Erişim

Şu URL'den erişebilirsin:
```
https://argos-ai-bot.onrender.com
```

İlk yüklenme ~10 saniye sürebilir (Render ücretsiz planı yavaş). Sonrasında hızlı.

---

## 📝 Ayarları Yap

1. **https://argos-ai-bot.onrender.com** aç
2. **Settings → Binance Settings**
3. API Key / Secret gir
4. **Live mi Test mi?** seç
5. **İşlem Ayarları → Manuel/Algoritma** seç
6. **BOT BAŞLA** ✅

---

## 🔄 Güncellemeler

Bot'u update etmek istersen:

```bash
# Lokal'de
git add .
git commit -m "v3.0.1 - improvements"
git push origin main

# Render otomatik deploy eder (~5 dakika)
# https://argos-ai-bot.onrender.com yeni versiyonu gösterir
```

---

## ⚠️ Render Limitations (Ücretsiz Plan)

| Özellik | Limit |
|---------|-------|
| **Uptime** | ~99% (yeterli) |
| **RAM** | 512 MB (yeterli) |
| **CPU** | Shared (yeterli) |
| **Storage** | 0.5 GB (data/ klasörü için) |
| **Auto-sleep** | 15 dakika inaktif sonra uyar |
| **Kullanıcı sayısı** | Unlimited |

⚠️ **İnaktivite problemi:**
- Eğer 15 dakika erişim yoksa Render "sleep" moduna girer
- İlk request yavaş olur (~10 saniye)
- Sonra normal

**Çözüm:** Heartbeat endpoint'i ayarla
```javascript
// server.ts'de var zaten
setInterval(() => {
  // Keep-alive ping
}, 14 * 60 * 1000);
```

---

## 🆘 Sorun Çözme

### Deploy başarısız?

**Logs'a bak:**
1. Render → Dashboard → argos-ai-bot
2. "Logs" tab
3. Hataları oku

**Yaygın hatalar:**

```
❌ "npm ERR! missing: technicalindicators"
✅ Çözüm: package.json tüm dependencies'i içeriyor
✅ Render: npm install otomatik yapıyor

❌ "BINANCE_API_KEY is undefined"
✅ Çözüm: Environment Variables ekle (Settings)

❌ "Build failed"
✅ Çözüm: package.json valid mi? npm run build lokal'de çalışıyor mu?
```

### Bot yavaş mı?

1. **Ücretsiz plan:** Normal (pay için upgrade)
2. **Sleep mode:** 15 dakika inaktif sonra uyur
3. **Binance API:** Rate limit? (1200 req/min)

---

## 💰 Paid Plan (Opsiyonel)

Eğer daha güvenilir istersen:

| Plan | Fiyat | Uptime | CPU | RAM |
|------|-------|--------|-----|-----|
| Free | $0 | ~99% | Shared | 512MB |
| Starter | $7/mo | 99.99% | Dedicated | 512MB |
| Standard | $12/mo | 99.99% | Dedicated | 1GB |

Render dashboard → Settings → Plan upgrade

---

## 📌 Deployment Özet

```
1. unzip bot_github_render.zip (lokal)
2. git push origin main (GitHub'a)
3. Render → "New Web Service" (render.com)
4. GitHub repo seç
5. Environment variables ekle (API keys)
6. "Create Web Service"
7. Deploy ~5 dakika
8. https://argos-ai-bot.onrender.com

Tamamı: 30 dakika
```

---

## 🚀 İlk Deploy Checklist

```
[ ] GitHub hesabı var
[ ] Repo oluşturdum
[ ] Bot'u push ettim
[ ] Render hesabı oluşturdum
[ ] Web Service oluşturdum
[ ] Environment variables ekledim
[ ] Build/Start commands doğru
[ ] Deploy başlatıldı
[ ] Logs'ta "running on port 3000"
[ ] https://argos-ai-bot.onrender.com açılıyor
[ ] Settings → Binance keys ekledim
[ ] BOT BAŞLA
```

---

## 📊 Monitoring

Render dashboard'dan bot'u izleyebilirsin:

```
1. https://render.com/dashboard
2. "argos-ai-bot" servisini seç
3. "Metrics" tab
   - CPU usage
   - Memory usage
   - Network I/O
4. "Logs" tab
   - Server output
   - Errors
```

---

## 🎯 Sonra Ne?

- Bot sunucuda çalışıyor ✅
- 24/7 online ✅
- Gerçek Binance futures işlemleri ✅
- Algoritmik trading ✅

---

## 📞 Destek

Render sorunları:
- https://render.com/docs
- https://render.com/support

Bot sorunları:
- Logs'ta hata ara
- .env variables kontrol et
- API keys doğru mu?

---

**Başarılar! 🚀📈**

Bot Render'da live! https://argos-ai-bot.onrender.com

v3.0.0 | Render Deploy Ready | 2024
