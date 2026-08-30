# 🚀 ARGOS AI BOT - GitHub & Sunucu Deployment

Bu rehber **GitHub'a yükleme** ve **sunucuda çalıştırma** içindir.

---

## 📋 GitHub'a Yükleme (5 Dakika)

### 1. Repository Oluştur
GitHub.com'da:
```
1. GitHub.com → "New repository" butonuna tıkla
2. Repository adı: argos-ai-bot (veya istediğin ad)
3. Description: "Advanced AI-Powered Binance Futures Trading Bot"
4. Public/Private seç
5. "Create repository" tıkla
```

### 2. Bot'u Push Et
Terminal'de:
```bash
# Zip'i aç
unzip bot_github.zip
cd bot_fixed

# Git initialize
git init
git add .
git commit -m "Initial commit: ARGOS AI BOT v3.0 with order book engine"

# Remote ekle (YOUR_USERNAME yerine kendi GitHub kullanıcı adını yaz)
git remote add origin https://github.com/YOUR_USERNAME/argos-ai-bot.git
git branch -M main
git push -u origin main
```

**Done!** ✅ Bot GitHub'da

---

## 🖥️ Sunucuda Çalıştırma

### Gereksinimler
```
- Node.js 16+ (https://nodejs.org)
- npm 8+ (Node ile gelir)
- Git (https://git-scm.com)
- Binance API Keys (futures)
```

### Kurulum (VPS/Sunucu)

#### 1. Git'ten Clone Et
```bash
# Home directory'de
cd ~
git clone https://github.com/YOUR_USERNAME/argos-ai-bot.git
cd argos-ai-bot
```

#### 2. Dependencies Yükle
```bash
npm install
# 2-3 dakika
```

#### 3. .env Dosyası Oluştur
```bash
cp .env.example .env
nano .env  # veya vim .env
```

**İçerik:**
```env
PORT=3000
NODE_ENV=production
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
BINANCE_TESTNET_KEY=testnet_key_here
BINANCE_TESTNET_SECRET=testnet_secret_here
```

**API Key Alma:**
- Binance.com → Account → API Management
- Test Network → Create Test API Key
- Live → Create API Key (futures)

#### 4. Build Et
```bash
npm run build
```

#### 5. Başlat

**Geliştirme Modu:**
```bash
npm run dev
# http://sunucu-ip:5173 (Vite dev server)
```

**Production Modu:**
```bash
npm run start
# http://sunucu-ip:3000 (Express server)
```

---

## ⚡ PM2 ile Background'da Çalıştır (Recommended)

Sunucu yeniden başlarsa bot otomatik başlasın:

### 1. PM2 Kur
```bash
npm install -g pm2
```

### 2. Bot'u PM2 ile Başlat
```bash
# Proje klasöründe
pm2 start "npm run start" --name argos-bot
pm2 startup
pm2 save
```

### 3. Log'ları İzle
```bash
pm2 logs argos-bot
```

### 4. Durdurmak/Restartlamak
```bash
pm2 stop argos-bot
pm2 restart argos-bot
pm2 delete argos-bot
```

---

## 🔌 Reverse Proxy Kurulumu (Nginx)

Eğer domain üzerinden erişmek istersen:

### 1. Nginx Kur
```bash
sudo apt-get install nginx
```

### 2. Config Dosyası
```bash
sudo nano /etc/nginx/sites-available/argos-bot
```

**İçerik:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Enable et
```bash
sudo ln -s /etc/nginx/sites-available/argos-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. SSL Sertifikası (Certbot)
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📊 Kullanım

### Web Interface
```
http://sunucu-ip:3000
veya
https://your-domain.com
```

### İlk Kurulum
1. **Settings → Binance Settings** → API Key / Secret gir
2. **İşlem Ayarları → Manuel mod** → Coin seç
3. **BOT BAŞLA** → İşlemleri başlat

### Monitoring
- **Dashboard:** İşlem geçmişi, kar/zarar
- **Algoritma Beyni:** Gerçek-zamanlı karar
- **Canlı Veri:** Tüm coinler
- **Logs:** Server hatalarını görmek

---

## 🔄 Git'ten Update Alma

Yeni versiyon çıktığında:
```bash
# Proje klasöründe
git pull origin main
npm install  # Eğer dependencies değiştiyse
pm2 restart argos-bot
```

---

## 🆘 Sorun Çözme

### Port zaten kullanılıyor
```bash
# Başka port kullan
PORT=8000 npm run start
```

### API Key'ler çalışmıyor
```
1. API Key'in doğru mu? (.env dosyasında)
2. IP whitelist ekledin mi? (Binance Settings)
3. Futures enable mi? (Not spot trading)
```

### Bot hiç işlem açmıyor
```
1. Testnet mi live mi? (Settings)
2. Parametreler doğru mu? (İşlem Ayarları)
3. Min kar % çok yüksek mi?
4. Server log'ları kontrol et: pm2 logs argos-bot
```

### Memory/CPU yüksek
```bash
# Process bilgisi
pm2 monit

# Memory leak varsa restart
pm2 restart argos-bot
```

---

## 📈 Production Checklist

```
[ ] .env dosyası oluşturdun
[ ] API Key'ler doğru
[ ] Testnet'te test ettiydin
[ ] PM2 kurulu
[ ] PM2 başlangıçta otomatik start
[ ] Nginx/Reverse proxy yapılandırıldı
[ ] SSL sertifikası kurulu (https)
[ ] Logs monitörü açık (pm2 logs)
[ ] Firewall ayarları doğru (port 80/443 açık)
[ ] Sunucu backup planı var
```

---

## 🎯 Tipik Sunucu Setup

```
Ubuntu 22.04 VPS
├── Node.js 18
├── PM2 (bot manager)
├── Nginx (reverse proxy)
├── Certbot (SSL)
├── Git (version control)
└── ARGOS BOT çalışıyor ✅

Erişim: https://your-domain.com
Automatic restart: Evet ✅
Logging: pm2 logs argos-bot
```

---

## 💰 Sunucu Önerileri

**Düşük bütçe:**
- DigitalOcean: $5/month (1GB RAM, 1 CPU)
- Linode: $5/month
- Vultr: $2.50/month

**Orta bütçe:**
- DigitalOcean: $12/month (2GB RAM, 2 CPU)
- AWS EC2: t3.small

**Yüksek bütçe:**
- Dedicated Server (her zaman açık, yüksek uptime)

---

## 🔐 Güvenlik

1. **API Key'leri Güven'de Tut**
   - .env dosyası .gitignore'da
   - Repository'yi private yap (para ile)
   - API whitelist'le IP address

2. **Sunucu Güvenliği**
   - SSH key kullan (password değil)
   - Firewall açık yap (sadece gerekli portlar)
   - Güncellemeleri yap (sudo apt update && sudo apt upgrade)

3. **Bot Güvenliği**
   - Position size sınırı koy
   - Max leverage belirle
   - Stop loss her zaman aktif

---

## 🚀 Deploy Özet

```bash
# Laptop'ta:
1. unzip bot_github.zip
2. cd bot_fixed
3. git init && git add . && git commit -m "Initial"
4. git remote add origin https://github.com/username/repo.git
5. git push -u origin main

# Sunucu'da:
1. git clone https://github.com/username/repo.git
2. cd argos-ai-bot
3. npm install
4. cp .env.example .env
5. nano .env → API key'leri gir
6. npm run build
7. pm2 start "npm run start" --name argos-bot
8. pm2 startup && pm2 save

# Erişim:
http://server-ip:3000
veya
https://your-domain.com (Nginx ile)
```

---

## 📞 Destek

Sorun mu?
```
1. pm2 logs argos-bot → Server hatalarını gör
2. Settings → Logs tab → İşlem hatalarını gör
3. TESTNET.md (GitHub'da) → Setup sorunları
4. UPGRADE_V3.0_TÜRKÇE.md → Algoritma sorunları
```

---

**Başarılar! 🚀📈**

Bot sunucuda çalışıyor mu? Git push et, arkadaşlarınla paylaş!

```
GitHub URL: https://github.com/YOUR_USERNAME/argos-ai-bot
Sunucu URL: https://your-domain.com
```

v3.0.0 | Production Ready | 2024
