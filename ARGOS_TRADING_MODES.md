# Argos Trading Modes

## MANUAL
- `trading_mode: "manual"`
- Only `exchange.pair_whitelist` is eligible for entries.
- `max_open_trades` controls the maximum number of concurrent positions.
- When capacity is 1, the highest-scoring eligible manual coin is selected.

## AUTO
- `trading_mode: "auto"`
- Binance Futures `exchangeInfo` + 24h ticker data are used to discover active USDT perpetual contracts dynamically.
- The full discovered universe is retained; `MAX_SCAN_SYMBOLS` is only the expensive deep-analysis ceiling (default 300).
- `max_open_trades` selects the top-ranked eligible candidates up to the configured concurrent-position limit.
- The manual coin list is preserved separately and is not used for entries while AUTO is active.

## API
- `GET /api/v1/universe` returns current mode, universe count and deep-analysis count.
- `POST /api/v1/universe/refresh` refreshes the AUTO universe immediately.
