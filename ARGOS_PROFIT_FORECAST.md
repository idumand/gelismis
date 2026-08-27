# Argos Profit Forecast V17

The engine now separates three concepts:

- **Target Net Profit**: expected money if the modeled target is reached, after estimated round-trip fees, spread and slippage.
- **Target Hit Probability**: a calibrated model estimate based on path quality, edge, direction score, MTF confidence, data quality and historical target hits. It is not a guarantee.
- **Expected Value (EV)**: `P(target) × target_net - P(no_target) × stop_loss_net`.

The engine uses symbol-specific history after 10 eligible closed trades and global history after 20 trades when symbol history is insufficient. This is deliberately conservative and avoids presenting a raw signal score as a probability.

Forecast fields exposed by `/api/v1/deepdata` and `/api/v1/orderbook` include:

- `forecastTargetNetUSD`
- `forecastStopLossNetUSD`
- `forecastExpectedValueUSD`
- `forecastHitProbabilityPct`
- `forecastRiskReward`
- `forecastUncertaintyPct`
- `forecastConservativeUSD`
- `forecastOptimisticUSD`
- `forecastLabel`
- `forecastCalibrationSource`

Entry selection now requires positive minimum EV and at least 55% estimated target-hit probability in addition to the existing microstructure/path gates.
