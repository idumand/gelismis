# ARGOS V6 — Kapsamlı Tek Geçiş Denetimi

## Bu sürümde düzeltilen ana sınıflar
- Binance emirlerinin gerçekten FILLED olup olmadığının doğrulanması.
- STOP_MARKET koruması ve acil çıkış doğrulaması.
- Çıkış sırasında çift işlem/race-condition kilidi.
- Gerçek fill miktarı/fiyatı üzerinden PnL hesaplama; dışarıdan kapanan işlemlerde mümkünse trade geçmişinden gerçek fill çözümleme, değilse `pnl_estimated` işareti.
- Restart sonrası açık pozisyonların ve trade geçmişinin tekrar/çifte kayıt olmadan senkronizasyonu.
- Restart sonrası eksik protective stop'ların yeniden oluşturulması.
- HEDGE modunda tek-sembol state modelinin iki yönü ezmesini engellemek için long+short çakışmasında yeni girişin bloklanması.
- Pozisyon açıldığı andaki stop-loss değerinin korunması.
- Force Entry'nin max-open-trades sınırına ve gerçek fiyat/precision/min-notional kurallarına uyması.
- Binance USDT perpetual evreninin filtrelenmesi.
- Pairlist whitelist/blacklist değişikliklerinin backend'e kalıcı kaydı.
- Ayar sayısal değerlerinde NaN/boş/geçersiz girişlerin engellenmesi.
- Ayar kaydının diske gerçekten yazıldığı doğrulanmadan başarı döndürülmemesi.
- API test / bağlantı durumlarında sahte başarı döndürülmemesi.
- Frontend start/stop/save işlemlerinde HTTP hata durumlarının doğru gösterilmesi.
- Demo ortamının güvenli varsayılan olması; geçersiz environment değerinin LIVE'a düşmesinin engellenmesi.
- Render benzeri platformlar için `PORT` env desteği.
- Express JSON body limitinin sınırlandırılması.
- AI öğrenilmiş threshold'un karar kapısında gerçekten kullanılması.
- AI model ağırlık/istatistik sanitizasyonu.
- Gerçek piyasa verisi yokken sahte mum üretiminin kaldırılması.
- `config` ve exchange-key yönetiminde kalıcılık hataları.
- CCXT bağımlılığının güncel demo-trading destekli hatta yükseltilmesi.

## Ek güvenlik düzeltmeleri
- Bilinmeyen Binance ortamı artık otomatik olarak LIVE'a çevrilmez; güvenlik amacıyla DEMO kullanılır.
- Environment değişikliği sonrası bağlantı yeniden başlatması başarısız olursa `/config` başarı döndürmez.
- API anahtarlarının temizlenmesi/kaydedilmesi başarısız olursa endpoint başarı vermez.

## Doğrulama
- ZIP bütünlüğü: `unzip -tq` başarılı.
- Kaynak dosya taraması ve kritik arama kontrolleri tamamlandı.
- Global TypeScript kontrolünde gerçek kaynak hatası bulunmadı; kalan TS çıktısı kurulu olmayan npm bağımlılıkları ve Node tipleriyle ilgilidir.
- Tam `npm install` / `npm run build` ortam ağ/cache kısıtları nedeniyle burada tamamlanamadı.
- Gerçek Binance Demo hesabında canlı emir testi bu ortamda yapılmadı; sahte başarı raporlanmadı.

## Bilinen deployment notları
- `config.json` ve `data/argos_trades.json` Render gibi ephemeral filesystem kullanan ortamlarda kalıcı olmayabilir; kalıcı disk veya harici secret/database gerekir.
- API mutation endpoint'leri uygulama içinde kullanıcı/rol kimlik doğrulaması olmadan çalışır. İnternete açık deployment'ta reverse proxy/auth katmanı kullanılmalıdır.
- Current state modeli aynı sembolde HEDGE long+short'u birlikte yönetmek yerine çakışmayı güvenli biçimde bloklar.
- Gösterilen işlem PnL'si gross trading PnL'dir; ücret/funding net hesaba ayrı bir katmandır.
