# ARGOS Yapay Zeka — LLM Kurulumu

Bu sürümde `Yapay Zeka` sekmesi büyük dil modeli katmanı içerir. Varsayılan sağlayıcı **yerel Ollama**'dır; OpenAI/Claude anahtarı zorunlu değildir.

## Yerel LLM

Ollama'yı aynı sunucuda çalıştırıp örneğin `qwen3:8b` modelini indirin. Ardından `.env` içinde:

```env
ARGOS_LLM_PROVIDER=ollama
ARGOS_LLM_BASE_URL=http://127.0.0.1:11434
ARGOS_LLM_MODEL=qwen3:8b
```

ARGOS, tüm Futures evrenini kendi veri katmanından LLM'ye bağlam olarak verir. Bu bağlam; coin, fiyat, 24s değişim, hacim, net para akışı, LONG/SHORT baskısı, büyük para, OBI, derin analiz skoru, hedef güveni, açık pozisyonlar, risk ayarları ve public RSS haberlerini içerir.

## Komutlar

Örnek:

`%5 kâr hedefiyle vur kaç yap, maksimum 2 pozisyon aç, sadece güçlü long para baskısı varsa gir.`

Doğal dil komutu güvenli bir direktife dönüştürülür ve `data/argos_ai_directive.json` içine kaydedilir.

## Otonom mod

`Yapay Zeka` ekranındaki **Otonom Açık** düğmesi, yeni girişlerin AI direktifiyle değerlendirilmesini etkinleştirir. Açık pozisyonların stop/çıkış korumaları AI çalışmasa da devam eder.

## Güvenli kapsam

LLM'nin kaynak kodunu doğrudan değiştirmesine izin verilmez. Uygulama ayarları ve trading direktifleri runtime katmanından yönetilir. Bu, hatalı bir LLM yanıtının uygulamanın server kaynaklarını bozmasını engeller.
