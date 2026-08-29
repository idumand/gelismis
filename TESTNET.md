# Binance Futures Demo Trading

Binance Futures Sandbox/Testnet eski ortamı artık kullanılmamalıdır. Uygulama, `testnet` seçimini geriye dönük uyumluluk için kabul eder ancak bunu otomatik olarak Binance **Demo Trading** ortamına çevirir.

- `live`: gerçek Binance Futures hesabı ve gerçek para.
- `demo`: Binance Demo Trading, sanal para.
- `testnet`: eski ayar adı; backend tarafından `demo` olarak eşlenir.

## Demo kullanımı

1. Binance **Demo Trading** için yeni API key/secret oluşturun. Eski Futures Testnet/Sandbox anahtarlarını kullanmayın.
2. Uygulamada **DEMO — Sanal para** ortamını seçin.
3. Demo API key ve secret girin.
4. **Bağlantıyı Test Et** ile Futures bakiyesini doğrulayın.
5. Ancak bağlantı başarılı olduktan sonra trading motorunu başlatın.

Demo ve Live anahtarları birbirinden ayrıdır. Uygulama Demo modunda eski `testnet.binancefuture.com` adresine gitmez; CCXT Demo Trading ve `demo-fapi.binance.com` kullanır.
