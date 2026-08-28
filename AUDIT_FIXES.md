# Binance / Position Execution Audit

## Root cause: Futures Testnet
The original application used the legacy Binance Futures Sandbox/Testnet via `setSandboxMode(true)` and `testnet.binancefuture.com`. Binance deprecated the Futures Sandbox/Testnet and moved Futures testing to Demo Trading. Demo keys are separate from the old Testnet keys.

### Fix
- `testnet`, `sandbox`, and `demo` config values are accepted for backward compatibility and normalized to `demo`.
- CCXT `enableDemoTrading(true)` is used instead of `setSandboxMode(true)`.
- Demo Futures REST: `https://demo-fapi.binance.com`
- Demo Futures stream: `wss://demo-fstream.binance.com`
- UI now presents **DEMO — Sanal para / gerçek emir akışı testi**.
- Old Testnet keys are explicitly rejected with a clear message when the installed CCXT cannot support Demo Trading.

## Position opening fixes
- Added Binance position-mode detection (ONE-WAY vs HEDGE).
- Entry/exit orders now send `positionSide` when Hedge Mode is active.
- Hedge-mode stop orders use `closePosition=true`; One-Way mode uses `reduceOnly=true`.
- Leverage and margin-mode failures are no longer silently swallowed; actionable warnings are logged.
- Quantity is revalidated after precision rounding against Binance market amount/cost limits.
- Invalid/zero order quantities are rejected before sending an order.
- Stop-order creation uses the correct order parameters for the account position mode.

## Entry frequency
The previous default minimum expected movement was **5%** on a 1-minute engine, which is an extremely restrictive gate for normal Futures conditions and could make entries appear stuck. The default is now **1%**. User-configured values are still respected.

## Verification
- Static TypeScript parsing was run with the system TypeScript compiler. No `server.ts` syntax/type diagnostics were produced; the repository does not contain installed npm dependencies in the audit environment, so full dependency-backed build/lint could not be completed here.
- Live account/private API calls cannot be validated without the user's Binance credentials. The code now includes the corrected live/demo routing and better execution diagnostics.

## Important
Use Binance **Demo Trading API keys** for DEMO mode. Do not paste production keys into DEMO mode and do not expect legacy Futures Testnet keys to work after the Binance Sandbox deprecation.
