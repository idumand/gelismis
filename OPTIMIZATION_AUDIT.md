# ARGOS optimization / bug-fix audit

- Settings numeric inputs are normalized and bounded server-side; invalid values no longer become NaN.
- Minimum expected move can now be set below 1% (down to 0.1%), so values such as 0.5% persist.
- Added a Defaults button in Settings. It resets strategy settings without erasing API credentials.
- `/api/v1/config` now returns the saved scan mode and auto-universe status so Settings does not silently revert to Auto.
- Settings saves no longer erase API credentials that are intentionally hidden by GET `/api/v1/config`.
- Normal operation no longer creates fake/simulation positions when Binance Futures credentials are missing.
- Exit failures no longer mark a real Binance position as closed locally.
- Binance leverage failure now aborts the entry rather than opening a position whose local ROE could be based on the wrong leverage.
- Added `/api/v1/universe` because the Settings UI depended on it.
- Auto mode now builds a high-liquidity Futures scan universe from Binance 24h ticker data, refreshed every 30 seconds.
- Auto universe refresh restarts the websocket only when membership actually changes, not on every ranking reorder.
- Real Futures market discovery no longer permanently injects stale/delisted symbols after a successful exchange-info refresh.
- Scan loop now has a concurrency limit and overlap guard to reduce request bursts and duplicated work.
- Added support for open-position symbols to remain in the active scan universe so exits continue to be monitored.
- Added minor state immutability fixes in Settings coin editing to avoid mutating nested React state in place.
