# V10 güncelleme notları

- AI/Gemini capability metadata kaldırıldı; karar motoru AI kullanmaz.
- Futures-only veri mimarisi korunmuştur.
- 50 seviye Futures depth kullanılmaktadır.
- 1-10 ana giriş, 11-20 doğrulama, 21-30 ikinci doğrulama, 31-50 hareket alanı olarak ağırlıklandırılmıştır.
- Pozisyon sonrası gerçek/net tahmini PnL zirvesi takip edilir.
- Kâr koruma, tek 51/49 ölçümüne göre değil; Order Flow + para akışı + büyük işlem akışı ile tekrarlı doğrulamaya göre çalışır.
- Kârın sıfıra dönmesini beklemeden koruma tabanı tetiklenebilir.
- Entry için ilk 10 seviye avantajı ayrıca doğrulanır.
