# Futures-only algorithm update

- Spot Order Book and Spot trade feeds removed from the trading decision path.
- Binance Futures is the authoritative market-data source for LIVE and TESTNET environments.
- Futures local order book uses a REST snapshot plus diff-depth WebSocket reconstruction and exposes the top 50 levels.
- Levels 1-5, 6-15 and 16-30 receive tiered decision weights; levels 31-50 are used for deeper liquidity / movement-range analysis.
- Small order noise is down-weighted; large and very large executed trades receive higher money-flow weight.
- Money-flow direction, momentum and acceleration are used together with order-book pressure.
- Expected movement is derived from observed volatility and deeper liquidity instead of a fixed 0.5% assumption.
- A dynamic minimum meaningful net-profit filter is required before entry.
- Position sizing uses stake x leverage for real notional PnL.
- Profit protection monitors Futures Order Flow and real money flow while in profit.
- Adaptive 3 -> 6 -> 10 confirmation remains available for ambiguous reversals.
- Real entry and exit fills are used for final PnL; stop creation failure does not leave an unprotected position.
- Fake market data fallbacks were removed from the trading path.


## Entry-time quantitative profit target
- At every entry, the engine snapshots a model-estimated target price, expected gross PnL, expected net PnL after estimated friction, target move %, and confidence.
- These values are frozen at entry so the UI can show what the algorithm predicted at the moment of entry rather than rewriting history as the market moves.
- The UI labels this as a **model estimate, not a guarantee**.
- On close, the engine records whether the target price was actually reached and the maximum favorable PnL relative to the entry-time expected net PnL, allowing target-quality evaluation.
