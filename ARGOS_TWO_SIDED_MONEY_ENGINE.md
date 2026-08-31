# ARGOS Two-Sided Money Engine — V8 Directional Capital Battle

V8 evaluates LONG and SHORT independently before entry. It does not choose a side from order-book imbalance alone.

## Per-side calculations
- **Dominance:** side score versus the opposing side score.
- **Pressure:** combines dominance, taker money flow and liquidity consumption.
- **Resistance:** opposing visible liquidity across near/deep levels, opposing wall persistence, adverse divergence and weak consumption.
- **Target path:** scans the visible opposing book for reachable price levels and scores the path to each level.
- **Net target profit:** gross modeled move minus estimated round-trip fees, spread, slippage and path/liquidity penalties.
- **Stop net loss:** estimated loss at the configured stop including execution costs.
- **Hit probability:** conservative model estimate, optionally blended with historical target-hit data; it is not a guarantee.
- **Expected Value (EV):** `P(target) × target_net_profit + P(stop) × stop_net_loss`.
- **Risk/Reward:** `target_net_profit / |stop_net_loss|`.

## Entry policy
The adaptive engine compares LONG EV against SHORT EV, then requires:
- sufficient data quality and acceptable spread,
- positive minimum EV,
- minimum target movement,
- directional capital dominance and flow alignment,
- controlled opposing resistance,
- minimum target probability,
- valid path/edge quality,
- AI confirmation or a sufficiently high composite score.

The side with the better EV is selected only after both sides have been scored. Visible order-book liquidity is treated as resistance/support rather than proof of actual long/short positions because orders can be cancelled.

This is a risk-management and decision model, not a guarantee of profit.
