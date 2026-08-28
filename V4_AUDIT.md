ARGOS V4 DEEP AUDIT

Additional issues found and fixed:
1. forceentry could return success when executeEntry silently skipped due to missing authentication; executeEntry now returns boolean and forceentry checks it.
2. Real-order quantity precision previously had heuristic rounding fallbacks; these could violate Binance lot/step filters. Authenticated orders now fail safely if exchange precision conversion fails.
3. Minimum notional was re-rounded without a final verification; orders are now rejected if the rounded result still violates min cost or max amount.
4. Config writes now return HTTP 500 when config.json cannot be persisted instead of claiming success.
5. Historical/open stop-loss display now uses the trade's stored stop-loss percentage, not the current global setting.
6. Binance connection initialization no longer reports success when authentication/initialization failed.
7. Binance environment defaults to Demo when no environment is specified, matching the UI safety default; invalid environment values are rejected rather than silently mapped to Live.
8. Force-entry now rejects requests when no valid live market price is available.
9. Local futures order-book snapshot buffering now triggers a resync when a sequence gap is detected instead of leaving a stale initialized book.
10. PnL wording was corrected to gross trading PnL; fees/funding are not included unless obtained separately from Binance.

Remaining deployment-level risk identified:
- Trading/config/force-exit API endpoints do not have an authentication layer. On a publicly reachable deployment, a third party who can reach the server can call these endpoints. This should be protected by an application authentication/token layer before exposing the service publicly.

Validation:
- Brace/parenthesis balance checked.
- No node_modules were present in the provided archive, so full dependency-backed tsc/vite build could not be completed in this environment. The source-level audit therefore does not claim an end-to-end build or live Binance order test.
