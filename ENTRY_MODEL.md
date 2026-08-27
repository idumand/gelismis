# Futures Entry Model v8

- Primary entry zone: first 10 order-book levels.
- Confirmation: levels 11-20 and 21-30.
- Movement/room: levels 31-50.
- The first 10 levels dominate entry scoring (62%); 11-20 contribute 23%; 21-30 contribute 15%.
- Entry requires both primary 10-level advantage and the broader 1-30 confirmation to agree.
- Long entry threshold: entryLongAdvantage >= 66%, entryGap >= 14 points, broader long advantage >= 68%, broader gap >= 12, plus existing money-flow, movement and minimum-net-profit filters.
- Short entry is symmetric.
- No external AI API is required for this layer. The deterministic model is intentionally kept on the server for low latency and reproducibility; an AI API can be added later as an advisory/ranking layer without overriding hard risk and profit gates.
