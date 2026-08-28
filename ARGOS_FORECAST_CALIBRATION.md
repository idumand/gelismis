# ARGOS Forecast Calibration

## Amaç

ARGOS, giriş anındaki hedefe ulaşma olasılığını tahmin eder ve işlem kapandıktan sonra tahmini gerçekleşen sonuçla karşılaştırır. Amaç, modelin yüzde tahminlerini zaman içinde kalibre etmek ve beklenen değerin daha gerçekçi olmasını sağlamaktır. Bu sistem gelecekteki kârı garanti etmez.

## Ölçüm

- Her girişte `forecastHitProbabilityPct` saklanır.
- Pozisyon açıkken gerçek fiyat hareketi izlenir.
- Adaptif hedef fiyat görülürse `target_hit=true` olarak işaretlenir.
- Kapanışta gerçekleşen PnL, maksimum olumlu hareket ve maksimum ters hareket saklanır.
- Son 5000 kalibrasyon gözlemi `argos_calibration.json` içinde tutulur.

## Kalibrasyon

Tahminler 10 puanlık olasılık kovalarına ayrılır. Her kova için Beta(2,2) yumuşatması kullanılır; böylece az sayıda işlemde modelin %0 veya %100 gibi aşırı sonuçlara sıçraması engellenir. En az 30 benzer gözlem oluştuğunda canlı kalibrasyon, yapısal model olasılığıyla ağırlıklı biçimde birleştirilir.

## Brier skoru

`/api/v1/calibration` endpoint'i Brier skorunu ve tahmin/gerçekleşen oran kovalarını döndürür. Daha düşük Brier skoru daha iyi olasılık kalibrasyonu anlamına gelir.

## Önemli sınır

Kalibrasyon geçmiş performansa dayanır; piyasa rejimi değiştiğinde geçmiş oranlar geleceği garanti etmez. Bu nedenle pozitif EV, minimum veri kalitesi, spread, likidite ve risk filtreleriyle birlikte kullanılmalıdır.
