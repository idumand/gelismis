# ARGOS AI — V7 Komut / Otonom / Para Akışı Düzeltme

## Bulunan ana sorunlar
1. Doğal dil komut parser'ı `USDT` kelimesini bağımsız bir sembol sanabiliyordu. Örneğin `BTC long aç 10 USDT 10x` komutunda sembol `/USDT`'ye dönüşebiliyordu. Bu düzeltildi; artık `USDT` ve `USD` sembol adayı değil.
2. Açık bir kullanıcı AI komutu, ana ticaret motoru duruyorsa reddediliyordu. Artık açıkça verilen tekil AI giriş komutu için arka plan motorunun `running` olması zorunlu değil; yine de Binance kimlik doğrulaması, giriş izni, pozisyon limiti ve diğer güvenlik kapıları uygulanıyor.
3. Otonom açma endpoint'i ilk canlı taramayı HTTP isteği içinde bekliyordu. Binance/RSS gecikmesi UI'da butonun çalışmıyor gibi görünmesine yol açabiliyordu. Artık aktivasyon hemen cevaplanıyor, ilk tarama arka planda başlıyor.
4. Para akışı modunda klasik AI eşikleri gereğinden fazla etkiliydi. `money_flow_only` için teknik trend/order-flow zorunlulukları gevşetildi; net para yönü ana karar sinyali yapıldı. Spread, veri tazeliği, pozitif beklenen değer ve temel risk kapıları korunuyor.
5. Genel AI/CORTEX giriş eşikleri de dengeli kullanım için gevşetildi: varsayılan score/güven/olasılık/belirsizlik/RR eşikleri aşağı çekildi. Hard safety sınırları aynı şekilde korunuyor.
6. Ayarlardaki minimum beklenen hareket varsayılanı `%1`'den `%0.5`'e çekildi.
7. AI çalışma ekranına bağlantı/WS/engine/autonomous sağlık göstergesi eklendi; otonom modu optimistik UI state ile daha doğru gösteriyor.

## Para akışı modu
`Sadece para girişine göre pozisyon aç` komutu:
- `money_flow_only` stratejisini etkinleştirir.
- Trend ve order-flow zorunlu doğrulamalarını kaldırır.
- Net para girişi long, net para çıkışı short tarafını destekler.
- Veri kalitesi, tazelik, spread ve pozitif EV gibi temel kapılar korunur.

## Otonom davranış
Otonom mod tarama yapmaya motor durdurulmuşken de başlayabilir. Gerçek otomatik emir ise:
- Binance API kimlik doğrulaması,
- AI giriş izni,
- maksimum pozisyon limiti,
- pozisyon bazlı giriş kilidi,
- CORTEX karar kapıları
üzerinden geçmeye devam eder.

Bu nedenle arayüzde `Otonom Açık` görülmesi tek başına emir verileceği anlamına gelmez; canlı emir için API bağlantısı ve ilgili güvenlik kapıları gerekir.

## Testler
- TypeScript/TSX syntax transpile kontrolü: geçti.
- AI komut parser testleri: geçti.
- `BTC long aç 10 USDT 10x` => `OPEN_POSITION`, `BTC/USDT`, `long`, `10 USDT`, `10x`.
- `Sadece para girişine göre pozisyon aç` => `OPEN_POSITION`, `money_flow_only`.
- Para akışı örnek senaryosu => long `ENTER_NOW`, short `IGNORE`.
- Tam proje `tsc` kontrolünde kalan hatalar ağırlıklı olarak pakette `node_modules` bulunmamasından kaynaklanan modül/tip eksikleridir; kod dosyalarının sözdizimi kontrolü ayrıştırılmış olarak temizdir.
