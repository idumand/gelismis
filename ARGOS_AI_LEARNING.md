# ARGOS AI Learning Engine

## Amaç
ARGOS'un karar motoru, kapanmış işlemlerden öğrenir. AI doğrudan emir üretmez; giriş sinyalinin kalitesini tahmin eder ve mevcut V8 karar motorunun ağırlıklandırmasını adaptif hale getirir.

## Öğrenme akışı
1. Pozisyon açılırken order-flow, liquidity, path, edge, movement, spread, volatility ve data-quality gibi özellikler snapshot olarak kaydedilir.
2. Pozisyon kapandığında gerçek PnL `label` olarak kullanılır: kâr > 0 ise 1, aksi halde 0.
3. Örnekler `data/argos_ai_trades.json` içinde kalıcı tutulur.
4. En az 20 örnekten sonra online logistic model yeniden eğitilir.
5. `AI İyileştir` düğmesi en az 30 örnek olduğunda kronolojik %70 eğitim / %30 out-of-sample test çalıştırır.
6. Yeni model Brier skoru ve doğruluğu eski modelden belirgin şekilde iyiyse etkinleştirilir; değilse eski model korunur.
7. Model sürümü `data/argos_ai_model.json` içinde saklanır.

## Önemli güvenlik ilkesi
AI kaynak kodunu kendi kendine yazıp değiştirmez ve canlı emir katmanına doğrudan erişmez. Kendisini geliştirme, ölçülebilir model parametreleri üzerinden yapılır. Böylece hatalı tek bir işlem bütün stratejiyi bozmaz.

## Binance entegrasyonu
Gerçek hesap pozisyonları zaten Binance Futures üzerinden senkronize ediliyor. Binance'in resmi API'sinde özel hesap/işlem verileri için User Data Stream ve ayrı `USER_DATA` / `USER_STREAM` yetkileri bulunur. API anahtarları hassas kabul edilmelidir.  

## Sonraki aşama
Yeterli gerçek veri biriktikten sonra model; coin, long/short ve piyasa rejimi bazında ayrı kalibrasyonlara, triple-barrier etiketlemeye, walk-forward değerlendirmeye, absorption/spoofing özelliklerine ve daha gelişmiş modellerin gölge testine genişletilebilir.
