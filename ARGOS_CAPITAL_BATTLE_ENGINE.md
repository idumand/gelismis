# Argos Capital Battle Engine V6

## Principle
The engine separates two concepts:
1. Aggressive traded capital: actual taker buy/sell notional observed in the rolling window.
2. Visible passive liquidity: bid/ask notional currently resting in the local book.

The second is not treated as actual long/short positions because visible orders can be cancelled.

## Position protection
While a position is open, the engine continuously tracks:
- same-side aggressive money percentage
- opposite-side percentage
- dominance change
- pressure durability
- opposing resistance
- erosion risk
- live target path

If target is reached while same-side money remains strong, the live target may extend instead of closing immediately. If the opposite side becomes dominant and the pressure flips, the engine can trigger an early protective exit.

This is a risk-management model, not a guarantee of future profit.
