# ARGOS AI Agent V5

V5 extends the V4 agent with a conversational governance layer and live recommendation path.

## Conversational control

The AI chat accepts natural-language policy changes such as:

- `Güvenliği muhafazakâr yap`
- `Risk ayarlarını dengeli yap`
- `Maksimum kaldıraç 10x yap`
- `İşlem başına risk %0.5 yap`
- `Stop loss %1 yap`
- `Maksimum 3 pozisyon aç`
- `Girişleri durdur`
- `Pozisyonları otomatik izle`

These settings are persisted to `data/argos_ai_governance.json`.

## Hard safety

The AI can change user-configurable policy, but it cannot disable immutable safety controls. Hard limits include maximum leverage, maximum risk per trade, bounded stop-loss range, maximum open positions, data freshness ceiling, and mandatory counter-thesis / positive-EV / two-factor agreement checks.

A user command that asks to bypass those protections is recorded as blocked rather than silently weakening the safety layer.

## Advice mode

Questions such as `Şu an ne yapmamı önerirsin?`, `Hangi coin daha güçlü?`, or `Long mu short mu?` are routed through the live deterministic ranking first. The LLM receives the live recommendation context and explains the result in natural language, while the application keeps the deterministic engine as the source of trade truth.

## Order commands

The existing Agent V4 command engine remains responsible for structured trade execution. Per-command stake and leverage are bounded by the governance limits.
