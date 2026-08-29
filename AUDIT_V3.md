# ARGOS V3 Audit

Fixed in this pass:
- Binance CCXT position sync no longer treats `contractSize` as open position quantity.
- `/api/v1/forceexit` no longer reports success when Binance close order fails.
- Removed local/orphan trade cleanup that could mark a real open Binance position as closed without sending an exchange close order.
- Removed duplicate `netInflowUSD` type declaration.
- Default starter configuration is Demo Trading instead of Live Trading for safer first run. Live can be explicitly selected in Settings.
- Removed obsolete backup/patch/test artifacts from the deploy bundle to avoid confusion.

Validation:
- Static source scan completed.
- TypeScript compiler is present, but dependency installation could not complete in the audit environment, so full type/build execution is not claimed.
- No simulated/fake market candle generator remains active; failed candle fetch returns an empty dataset.
