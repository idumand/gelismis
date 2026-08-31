# ARGOS V8 Adaptive Decision Engine

## Amaç

V8, pozisyon açmayı tek bir sabit eşik duvarına bağlamak yerine; yön, order-flow, likidite yolu, volatilite, işlem maliyeti, beklenen değer ve giriş aciliyetini birlikte değerlendirir. Bu bir kâr garantisi değildir.

## Karar modeli

- `ENTER_NOW`: güçlü setup + yeterli olasılık + pozitif EV + yüksek urgency.
- `ENTER_BETTER`: setup yeterli, ancak giriş fiyatı/akış daha iyi bir noktayı beklemeyi hak ediyor.
- `WATCH`: sınırda setup; işlem açılmaz.
- `IGNORE`: güvenlik, veri, spread, erosion veya negatif EV nedeniyle işlem açılmaz.

## Adaptif hedef ve stop

Hedef; order-book likidite yolu, kısa dönem ATR/volatilite ve işlem maliyetinden türetilir. Stop; normal piyasa gürültüsünü karşılamak için ATR/volatilite ve friction tabanlıdır. Böylece tüm coinler için aynı `%5 hedef` ve `%1.5 stop` zorunluluğu yoktur.

## Beklenen değer

Temel karar metriği:

`EV = P(win) * net_reward - (1-P(win)) * net_risk`

Ayrıca hedefe ulaşmak için gerekli başa-baş olasılığı (`break-even probability`) hesaplanır.

## Kalibrasyon

Motor, kapatılan işlemlerden olasılık tahminlerini `argos_calibration.json` içinde tutar ve yeterli örnek olduğunda olasılık bucket kalibrasyonu uygular. Kalibrasyon sonucu gelecek kârı garanti etmez.

## Pozisyon yönetimi

Her yeni pozisyon adaptif stop oranını ve adaptif hedefini kendi üzerinde taşır. Açık pozisyonlarda V7'nin position-health / money-flow koruma mekanizması korunmuştur.

Gerçek Binance işlemlerinde margin modu `ISOLATED` olarak istenir.

## Test

Üretim hesabında kullanmadan önce testnet/paper trading, komisyon + slippage dahil walk-forward backtest ve yeterli örneklemle kalibrasyon kontrolü yapılmalıdır.
