import type { AITradeSample } from './ai-learning.ts';

export type LLMProvider = 'ollama' | 'openai-compatible' | 'none';

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
}

export interface AIContext {
  now: string;
  environment: string;
  botState: string;
  directive: Record<string, unknown>;
  account: Record<string, unknown>;
  positions: unknown[];
  coins: unknown[];
  news: unknown[];
  engine: Record<string, unknown>;
  chatHistory?: unknown[];
  recommendation?: unknown;
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getLLMConfig(env = process.env): LLMConfig {
  const provider = String(env.ARGOS_LLM_PROVIDER || 'ollama').toLowerCase();
  return {
    provider: provider === 'openai-compatible' ? 'openai-compatible' : provider === 'none' ? 'none' : 'ollama',
    baseUrl: String(env.ARGOS_LLM_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: String(env.ARGOS_LLM_MODEL || 'qwen3:8b'),
    apiKey: env.ARGOS_LLM_API_KEY ? String(env.ARGOS_LLM_API_KEY) : undefined,
    temperature: Math.min(1, Math.max(0, num(env.ARGOS_LLM_TEMPERATURE, 0.15))),
    maxTokens: Math.min(12000, Math.max(300, Math.floor(num(env.ARGOS_LLM_MAX_TOKENS, 3000)))),
  };
}

export function systemPrompt() {
  return [
    'Sen ARGOS V6 CORTEX adlı canlı kripto futures analiz, danışmanlık ve kontrollü işlem ajanısın. Tüm Binance Futures evreninin hafif canlı piyasa akışını, derin akış katmanını ve kullanıcının tüm açık pozisyonlarını birlikte yorumlayan bir karar asistanısın.',
    'Amacın tahmin satmak değil; canlı veriyi sentezlemek, kullanıcının niyetini doğru anlamak, belirsizliği açıkça belirtmek ve mevcut güvenlik politikaları içindeki en iyi uygulanabilir kararı üretmektir.',
    'Kararlarını tek indikatöre dayandırma. Piyasa rejimi, trend/momentum, net para akışı, büyük işlemler, taker/order-flow, order-book dengesizliği, likidite tüketimi, hedefe giden likidite yolu, volatilite, funding/open-interest, spread, risk/getiri, beklenen değer ve veri tazeliğini birlikte değerlendir.',
    'Bir coin hakkında konuşurken onu tüm canlı futures evrenine göre kıyasla: göreceli güç, hacim, akış, volatilite, likidite, piyasa genişliği ve rejim dağılımını dikkate al. Tek coin verisi eksikse bunu evren bağlamı ile tamamla ama veri yokmuş gibi davranma.',
    'Birden fazla açık pozisyon varsa bunları tek tek değil portföy olarak da değerlendir: ortak piyasa betası, aynı yöne yığılma, korelasyon yoğunlaşması, toplam ısı ve birbirini dengeleyen/çatışan pozisyonları göz önüne al.',
    'Bir LONG görüşünde SHORT karşı-tezini; bir SHORT görüşünde LONG karşı-tezini özellikle ara. En az iki bağımsız veri ailesi ters yöndeyse güveni düşür.',
    'Giriş kararı için üç ayrı kavramı birbirinden ayır: olasılık (tez lehine sonuç ihtimali), güven (verinin sağlamlığı ve modellerin anlaşması), belirsizlik (veri eksikliği/çatışması).',
    'Pozisyon açıldığında analiz bitmez. Pozisyon tezinin korunup korunmadığını takip etmeyi, para akışı/order-flow/trend değişimlerini ve kâr geri verilmesini izlemeyi varsayılan davranış kabul et.',
    'Kullanıcı bir çalışma kuralı verdiğinde bunu açık bir politika olarak yorumla. Örnek: sadece para girişine göre aç = para akışı uzmanını ana filtre yap; derin analiz yap = tüm uzmanlar + senaryo + karşı-tez; sadece long = short girişlerini kapat.',
    'Kullanıcı emir aç/kapat komutu verdiğinde canlı veride olmayan bilgiyi uydurma. Sembol, yön, miktar, kaldıraç, veri tazeliği ve risk durumunu doğrula; gerçek emir için sunucu güvenlik kapılarının son otorite olduğunu kabul et.',
    'Kullanıcı sohbet içinde risk, kaldıraç, stop, minimum güven, minimum olasılık ve pozisyon limitlerini değiştirmek isterse bunları açık politika değişikliği olarak yorumla; fakat kritik güvenlik kilitlerini asla kapatma veya aşma.',
    'Kullanıcı tavsiye isterse sadece genel eğitim vermek yerine canlı uygulama bağlamındaki mevcut sıralamayı değerlendir; en güçlü adayları, karşı sinyalleri, riskleri ve neden beklemenin daha iyi olabileceğini açıkça belirt. Kesin kâr garantisi verme.',
    'Kullanıcı bir komut verip pozisyon açılmasını istiyorsa, komutun niyetini tekrar et, mevcut canlı veri kararını ve uygulanacak risk politikasını özetle. Gerçek emir için sunucu güvenlik kapılarının son otorite olduğunu kabul et.',
    'Gizli chain-of-thought verme. Bunun yerine kısa ve denetlenebilir karar özeti sun: veri durumu, ana sinyaller, karşı sinyaller, rejim, senaryolar, risk ve sonuç.',
    'Kripto piyasasında kesinlik yoktur. Kâr veya başarı garantisi verme; olasılık ve risk dili kullan.',
    'Yanıtlarını Türkçe ver. Sayısal olarak mevcut bağlamda olmayan değerleri uydurma.'
  ].join(' ');
}


function compactContext(context: AIContext) {
  return JSON.stringify({
    ...context,
    governance: context.engine?.governance,
    recommendation: context.recommendation,
    positions: context.positions,
    cortex: context.engine?.cortex,
    coins: context.coins.slice(0, 300).map((c: any) => ({
      symbol: c.symbol,
      price: num(c.price), change24hPct: num(c.change_24h_pct), volume24hUSDT: num(c.volume_24h_usdt),
      netInflowUSDT: num(c.netInflowUSDT ?? c.net_inflow_usdt),
      longPressure: num(c.longPressure ?? c.longAdvantage), shortPressure: num(c.shortPressure ?? c.shortAdvantage),
      largeLongUSDT: num(c.largeLongUSDT), largeShortUSDT: num(c.largeShortUSDT),
      obi: num(c.obi), deepScore: num(c.deepScore), expectedMovePct: num(c.expectedMovePct),
      targetConfidence: num(c.targetConfidence), agentScore:num(c.agentScore), agentProbability:num(c.agentProbability), agentConfidence:num(c.agentConfidence), agentUncertainty:num(c.agentUncertainty), agentAction:c.agentAction, marketRegime:c.marketRegime, orderFlowGap:num(c.orderFlowGap), inflowMomentum:num(c.inflowMomentum), selectedExpectedValueUSD:num(c.selectedExpectedValueUSD), selectedRiskReward:num(c.selectedRiskReward), dataQuality:num(c.dataQuality), signal: c.signal,
    })),
  });
}

export function localFallback(userMessage: string, context: AIContext) {
  const coins: any[] = Array.isArray(context.coins) ? context.coins : [];
  const ranked = [...coins].sort((a, b) => {
    const scoreA = num(a.longPressure ?? a.longAdvantage) - num(a.shortPressure ?? a.shortAdvantage) + num(a.netInflowUSDT ?? a.net_inflow_usdt) / 1e7;
    const scoreB = num(b.longPressure ?? b.longAdvantage) - num(b.shortPressure ?? b.shortAdvantage) + num(b.netInflowUSDT ?? b.net_inflow_usdt) / 1e7;
    return scoreB - scoreA;
  }).slice(0, 5);
  const top = ranked.map((x) => `${x.symbol}: L ${num(x.longPressure ?? x.longAdvantage).toFixed(1)} / S ${num(x.shortPressure ?? x.shortAdvantage).toFixed(1)} / net ${num(x.netInflowUSDT ?? x.net_inflow_usdt).toFixed(0)} USDT`).join('\n');
  return `Yerel LLM şu anda erişilebilir değil; mevcut piyasa motoru üzerinden ön analiz yaptım.\n\nTalimat: ${userMessage}\n\nÖne çıkan LONG tarafı coinleri:\n${top || 'Yeterli canlı veri yok.'}\n\nGerçek emir kararı için canlı futures verisi ve risk kuralları birlikte doğrulanmalıdır.`;
}

async function ollamaChat(config: LLMConfig, messages: any[]) {
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, stream: false, options: { temperature: config.temperature, num_predict: config.maxTokens } }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data: any = await response.json();
  return String(data?.message?.content || '').trim();
}

async function openAICompatible(config: LLMConfig, messages: any[]) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: config.model, messages, temperature: config.temperature, max_tokens: config.maxTokens }),
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const data: any = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

export async function askLLM(userMessage: string, context: AIContext, config = getLLMConfig()) {
  if (config.provider === 'none') return { ok: false, content: localFallback(userMessage, context), provider: 'fallback', model: 'rule-engine' };
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'system', content: `CANLI UYGULAMA BAĞLAMI:\n${compactContext(context)}` },
    { role: 'user', content: userMessage },
  ];
  try {
    const content = config.provider === 'ollama' ? await ollamaChat(config, messages) : await openAICompatible(config, messages);
    if (!content) throw new Error('LLM boş yanıt döndürdü.');
    return { ok: true, content, provider: config.provider, model: config.model };
  } catch (error: any) {
    return { ok: false, content: `${localFallback(userMessage, context)}\n\nLLM bağlantısı: ${error?.message || error}`, provider: 'fallback', model: 'rule-engine' };
  }
}

export function interpretDirective(text: string) {
  const s = text.toLocaleLowerCase('tr-TR');
  const directive: Record<string, unknown> = {};
  const profit = s.match(/(?:%|yüzde\s*)(\d+(?:[.,]\d+)?)\s*(?:kâr|kar|profit)/i);
  if (profit) directive.takeProfitPct = Number(profit[1].replace(',', '.'));
  const stop = s.match(/stop(?:\s*loss)?[^\d]{0,12}(?:%|yüzde\s*)(\d+(?:[.,]\d+)?)/i);
  if (stop) directive.stopLossPct = Number(stop[1].replace(',', '.'));
  const max = s.match(/(?:maksimum|max|en fazla)\s*(\d+)\s*pozisyon/i);
  if (max) directive.maxOpenTrades = Number(max[1]);
  if (s.includes('sadece long') || s.includes('yalnızca long')) directive.side = 'long';
  else if (s.includes('sadece short') || s.includes('yalnızca short')) directive.side = 'short';
  if (s.includes('vur kaç') || s.includes('vur-kaç') || s.includes('scalp')) directive.mode = 'scalp';
  if (s.includes('hızlı') || s.includes('agresif')) directive.aggressiveness = 'high';
  if (s.includes('temkinli') || s.includes('düşük risk')) directive.aggressiveness = 'low';
  directive.originalText = text;
  directive.updatedAt = Date.now();
  return directive;
}
