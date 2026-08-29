# Argos Adaptive Quant Engine

The server has been upgraded from periodic full rescans to an event-driven architecture.

## What changed

- Adaptive market universe: discovers up to 2,000 active USDT perpetual markets from Binance public Futures data.
- Tiered workload: all markets get lightweight ticker monitoring; only the highest-volume/deep candidates receive order-book, trade-flow, 1m candle and liquidation streams.
- WebSocket sharding: subscriptions are split across multiple connections instead of forcing one connection to carry the entire universe.
- Event-driven analysis: ticker, depth, trades, candles and liquidation events mark symbols dirty; the quant engine analyzes changed symbols instead of recalculating every market every 2.5 seconds.
- Real 1m-candle technical input: RSI/EMA prefer actual 1m closes; ATR is true-range based when enough candles exist.
- Real VWAP: uses typical price weighted by candle volume instead of a simple price average.
- MTF/regime layer: 1m, 5m, 15m, 1h and 4h trend proxies are derived from real 1m candles, with regime labels such as TRENDING_UP, TRENDING_DOWN, RECOVERY, REVERSAL_DOWN and HIGH_VOLATILITY.
- Liquidation pressure: recent Futures force-order flow is tracked per symbol.
- Funding/Open Interest cache: sampled for high-quality candidates with a request budget to prevent REST overload.
- Scan safety sweep: a slow fallback scan remains active so the system can recover if an event is missed.

## Configuration

`ARGOS_AUTO_UNIVERSE=true` is the default. Set it to `false`, or set `exchange.auto_universe=false` in `config.json`, to use a manual `exchange.pair_whitelist`.

## Important

The engine remains deterministic/quantitative. These upgrades improve data quality, latency and selection logic; they do not guarantee profitable trades. Real-money execution should be tested on Binance Futures Testnet before live use.
