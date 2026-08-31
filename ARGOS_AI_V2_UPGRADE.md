# ARGOS AI v2 — Güçlendirilmiş Yapay Zeka Motoru

Bu sürüm, önceki tek lojistik model + sert eşik yaklaşımını genişletir.

## Ana değişiklikler

- 12 yerine 24 özellikli AI özellik vektörü.
- Öğrenilmiş lojistik model + deterministik piyasa önceliği (ensemble).
- Model olgunluğu (kaç örnekle öğrendi) hesaba katılıyor.
- Belirsizlik, veri kalitesi, spread ve sinyal uyuşmazlığı ayrı ölçülüyor.
- Order-flow, para akışı, büyük işlemler, likidite tüketimi ve hedef yolu birlikte ele alınıyor.
- RSI/EMA tabanlı yön hizalaması destekleniyor.
- Volatilite + trend ilişkisi ile yüksek volatilite/range karmaşası cezalandırılıyor.
- LONG ve SHORT bağımsız AI olasılığı üretiyor; güçlü taraf seçimi daha sonra yapılıyor.
- AI kararı `ENTER_NOW / ENTER_BETTER / WATCH / IGNORE` olarak ayrılıyor.
- Canlı pozisyonlarda AI tekrar değerlendirilerek kâr erimesi ve kötüleşen zarar senaryoları daha erken yakalanabiliyor.
- Eski v1 model dosyaları yeni 24 özellikli modele güvenilmeden soğuk başlangıca alınır.
- Eski 12 özellikli eğitim kayıtları yeni modele karıştırılmaz.
- AI modeli en az 50 örnekle out-of-sample iyileştirme onayı alır; testte anlamlı avantaj yoksa mevcut model korunur.
- AI, sert veri/ekonomi/risk güvenlik kapılarını atlayamaz.

## Önemli sınır

Bu motor olasılık tahmini yapar; geleceği garanti etmez. Gerçek performans ancak yeterli kapanmış işlem verisi, doğru canlı piyasa verisi ve out-of-sample sonuçlarla ölçülebilir.
