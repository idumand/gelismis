# ARGOS Two-Sided Money Engine

V5 compares long and short capital pressure before entry. It measures aggressive money, opposing liquidity, price response, persistence and erosion.

## Core decisions
- Dominant money side
- Pressure dominance
- Pressure durability
- Opposing resistance / absorption
- Erosion risk when flow is not producing price response

Entry is blocked when the dominant side conflicts with the proposed direction, durability is weak, resistance is excessive, or erosion risk is excessive. These metrics are risk filters, not profit guarantees.
