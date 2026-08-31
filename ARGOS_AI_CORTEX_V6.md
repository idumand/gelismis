# ARGOS AI CORTEX V6

ARGOS AI CORTEX V6 converts the previous agent into a layered market-intelligence system.

## 1. Data plane
- Tier 0: all USDⓈ-M perpetual symbols via all-market ticker stream and all-book-ticker stream.
- Tier 1: full universe indexed in memory for relative-strength, breadth and ranking.
- Tier 2: selective depth + aggTrade streams for scan universe and all open positions.
- Tier 3: portfolio / account position observations.
- Liquidation context is added from the all-market force-order stream when Binance emits it.

The design deliberately avoids opening a heavy depth/trade stream for every symbol. All symbols stay visible while expensive microstructure data is concentrated where it matters most.

## 2. Cognitive layer
The CORTEX runs:
1. money-flow expert
2. order-flow expert
3. trend/momentum expert
4. liquidity-path expert
5. crowding/funding/OI expert
6. volatility expert
7. cross-sectional relative-strength expert
8. data-quality expert
9. disagreement / uncertainty engine
10. counter-thesis engine
11. scenario engine
12. memory prior engine
13. portfolio concentration penalty
14. full-universe ranking

The output is not hidden reasoning; it is a structured, auditable decision record with reasons, warnings, probabilities, confidence, uncertainty and scenarios.

## 3. Portfolio brain
Every open position is evaluated against:
- its own live thesis
- opposing thesis
- current PnL and peak-PnL erosion
- shared market regime
- exposure concentration
- correlation proxies
- overall portfolio heat

## 4. Conversation and recommendations
The LLM receives the CORTEX market breadth, top decisions, portfolio context and a large live coin snapshot. It may explain and advise, while deterministic safety and execution code remain authoritative.

## 5. Binance compatibility
The data plane follows Binance's current Futures WebSocket structure. All-market book tickers are suitable for lightweight coverage, while depth and trade streams remain selective. The implementation keeps stream count below Binance's documented per-connection maximum where possible.
