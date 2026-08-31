# ARGOS CORTEX V6 Verification

- `src/argos-ai-cognitive-v6.ts`: strict TypeScript compilation passed in isolation.
- Server integration scan: no new TypeScript parse/type errors were reported for `server.ts` or the V6 cognitive core.
- Existing full-project typecheck still reports missing installed runtime/type dependencies such as React and `@types/node` because `node_modules` is not present in this package.
- AI Workspace now requests the CORTEX snapshot, full-universe live table and ranking in parallel.
- Production Futures market stream configuration now includes all-market ticker and book-ticker coverage, plus all-market liquidation snapshots, while deep depth/aggTrade remains selective.

## Data design

Tier 0: all-market ticker + best bid/ask.
Tier 1: all listed USDT perpetual symbols indexed for breadth and cross-sectional intelligence.
Tier 2: depth + aggTrade for active scan symbols and every open position.
Tier 3: live portfolio position review.

This avoids subscribing to a heavy order-book/trade stream for every single symbol while still keeping the full universe visible to the decision layer and interface.
