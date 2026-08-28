/**
 * ARGOS ORIGINAL ENGINE SNAPSHOT
 * Source of truth for the legacy V7 entry gate.
 * Do not add AI, learning, calibration or adaptive thresholds here.
 */
export interface OriginalEntryInput {
  flow: any;
  minExpectedMovePct: number;
  minExpectedNetProfitUSD: number;
}

export function originalV7EntryGate(input: OriginalEntryInput): boolean {
  const { flow, minExpectedMovePct, minExpectedNetProfitUSD } = input;
  const strongest = flow.longAdvantage >= flow.shortAdvantage ? "long" : "short";
  const strongestScore = strongest === "long" ? flow.longAdvantage : flow.shortAdvantage;
  const directionalFlow = strongest === "long" ? flow.takerBuyRatio >= 0.52 : flow.takerBuyRatio <= 0.48;
  const directionalGap = strongestScore - (strongest === "long" ? flow.shortAdvantage : flow.longAdvantage);
  const movementOk = flow.movementPotentialPct >= minExpectedMovePct;
  const profitOk = flow.expectedNetProfitUSD >= minExpectedNetProfitUSD;
  const pathOk = Number(flow.targetPathScore || 0) >= 65 && Number(flow.edgeScore || 0) >= 68;
  const dataOk = flow.dataReady && flow.dataQuality >= 70;
  const notOverSpread = flow.spreadPct <= 0.0015;

  // This expression intentionally matches the V7 baseline gate exactly.
  return dataOk && strongestScore >= 62 && directionalGap >= 14 && directionalFlow && movementOk && profitOk && pathOk && notOverSpread;
}
