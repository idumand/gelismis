# Argos Terminal — OrderFlow Quant Brain

## Execution environments
- `demo`: Binance Futures Demo Trading via CCXT `enableDemoTrading(true)`.
- `live`: Binance USDⓈ-M Futures live account.
- Market data is Futures-only; the browser does not open Spot streams.

## Brain model
The engine combines:
1. Weighted order-book imbalance (20 levels, distance decay)
2. Micro-price
3. Taker buy/sell USD flow
4. 15-second vs 60-second flow acceleration
5. Price response / absorption
6. Liquidity support/resistance barriers
7. Spread and execution cost
8. 15m/1h/4h EMA trend bias
9. Minimum 1x profit target
10. Dynamic exit when opposing pressure overtakes the position

The model estimates an executable target; it does not claim to know the future.

## Profit basis
`min_profit_pct_1x` is a raw price-move requirement at 1x. The UI shows the corresponding theoretical ROE at the selected leverage. Entry also requires an additional fee/slippage cushion.

Example: 0.50% at 1x → 25.0% theoretical ROE at 50x before fees/funding.

## Modes
- **MANUAL:** only the selected Futures pairs are available for manual LONG/SHORT actions.
- **ALGORITHM:** the engine ranks Futures USDT perpetuals by 24h quote volume, deeply analyzes the top configured candidates, and chooses the strongest directional edge.

## Safety
Orders are blocked when Binance API authentication or environment verification is missing. No synthetic order-book or market prices are used.
