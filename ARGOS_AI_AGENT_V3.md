# ARGOS AI Agent V3

ARGOS AI V3 is no longer just a prediction widget. It is an orchestration layer around the live futures engine.

## Core layers

1. Live universe: all loaded perpetual symbols are represented from the exchange ticker cache; the deep scanner enriches the active liquid universe with order book, trade flow, volatility and target-path data.
2. Feature engine: combines net money flow, taker imbalance, large-trade pressure, order-book imbalance, liquidity consumption, trend, volatility, target path, expected value and data freshness.
3. Ensemble decision: learned adaptive model + deterministic market prior + agent strategy weights.
4. Strategy directives: `balanced`, `money_flow_only`, `deep_analysis`, `order_flow`, `trend`, `scalp`.
5. Command interpreter: natural-language commands are parsed into explicit intents such as scan, analyze, open, close, stop, start and autopilot.
6. Execution guard: real orders require the trading engine to be running and Binance authentication to be valid; exchange-side stop protection remains mandatory.
7. Position agent: every live cycle re-evaluates the open trade thesis and can request a protective exit when money flow/order flow reverses or the thesis materially deteriorates.
8. Autonomous loop: when the user explicitly enables Autopilot, V3 ranks the live market and can execute the best approved candidate subject to the same safety gates.

## Example commands

- `Sadece para girişine göre pozisyon aç`
- `Derin analiz yap ve en güçlü coin için pozisyon aç`
- `BTC long aç $12 10x`
- `Maksimum 3 pozisyon sadece short`
- `En iyi fırsatı tara`
- `BTC analiz et`
- `Açık pozisyonlarımı izle`
- `Tüm pozisyonları kapat`
- `Otonomu aç`
- `Otonomu kapat`

## Important behavior

AI does not have privileged access to hidden chain-of-thought. Its reasoning is implemented as auditable factors, confidence, uncertainty, warnings and safety gates. This makes the behavior observable and easier to test.

AI does not promise profit. A high score is a probabilistic ranking, not a guarantee.

## New endpoints

- `GET /api/v1/ai/context`
- `POST /api/v1/ai/chat`
- `POST /api/v1/ai/command`
- `GET /api/v1/ai/ranking?top=50`
- `GET /api/v1/ai/positions`
- `GET /api/v1/ai/market/:symbol`
- `POST /api/v1/ai/directive/reset`
- `POST /api/v1/ai/autopilot`

## Persistent data

- `data/argos_agent_directive.json`: active user directive
- `data/argos_agent_journal.json`: concise agent observations
- existing `argos_ai_trades.json` / `argos_ai_model.json`: adaptive learning data/model
