from pathlib import Path
p=Path('/mnt/data/v5work/server.ts')
s=p.read_text()
s=s.replace('  entryFee?: number;\n  exitFee?: number;\n}', '''  entryFee?: number;
  exitFee?: number;
  // Snapshot of the quantitative profit target at entry. This is never overwritten by later market changes.
  modelTargetPrice?: number;
  modelTargetMovePct?: number;
  modelExpectedNetPnlUSD?: number;
  modelExpectedGrossPnlUSD?: number;
  modelTargetHit?: boolean;
  modelMaxFavorablePnlUSD?: number;
  modelConfidence?: number;
}''')
# candidate block
old='''              predictedProfitPct: flow.predictedProfitPct,
              predictedTimeSec: flow.predictedTimeSec,
              smartTargetPrice: type === "long" ? flow.liquidityMap.firstTargetLong : flow.liquidityMap.firstTargetShort,
              smartStopPrice: type === "long" ? flow.liquidityMap.strongSupport : flow.liquidityMap.strongResistance
            });'''
new='''              predictedProfitPct: type === "long" ? flow.expectedMovePctLong : -flow.expectedMovePctShort,
              predictedTimeSec: flow.predictedTimeSec,
              expectedNetPnlUSD: type === "long" ? flow.expectedNetPnlUsdLong : flow.expectedNetPnlUsdShort,
              expectedGrossPnlUSD: type === "long" ? flow.expectedGrossPnlUsdLong : flow.expectedGrossPnlUsdShort,
              targetMovePct: type === "long" ? flow.expectedMovePctLong : flow.expectedMovePctShort,
              targetPrice: type === "long" ? flow.modelTargetPriceLong : flow.modelTargetPriceShort,
              modelConfidence: type === "long" ? flow.modelConfidenceLong : flow.modelConfidenceShort,
              smartTargetPrice: type === "long" ? flow.modelTargetPriceLong : flow.modelTargetPriceShort,
              smartStopPrice: type === "long" ? flow.liquidityMap.strongSupport : flow.liquidityMap.strongResistance
            });'''
if old not in s: print('candidate old not found')
s=s.replace(old,new)
s=s.replace('await executeEntry(topCandidate.symbol, topCandidate.type, topCandidate.price);','await executeEntry(topCandidate.symbol, topCandidate.type, topCandidate.price, topCandidate);')
s=s.replace('async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number) {','async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number, model?: any) {')
# Insert target snapshot after actual fill determination, before activePositions assignment
needle='''  activePositions[symbol] = {
    trade_id: tradeCounter++,'''
insert='''  // Snapshot the model target at the actual fill price. The target is an entry-time estimate,
  // not a guarantee and is intentionally kept fixed so the UI can measure model accuracy.
  const modelMovePct = Number(model?.targetMovePct || 0);
  const modelTargetPrice = Number(model?.targetPrice || (type === "long"
    ? entryPrice * (1 + modelMovePct / 100)
    : entryPrice * (1 - modelMovePct / 100)));
  const modelExpectedNetPnlUSD = Number(model?.expectedNetPnlUSD || 0);
  const modelExpectedGrossPnlUSD = Number(model?.expectedGrossPnlUSD || (modelExpectedNetPnlUSD + (entryPrice * formattedAmount) * ((ESTIMATED_FEE_PCT + ESTIMATED_SLIPPAGE_PCT) / 100)));
  const modelConfidence = Number(model?.modelConfidence || 0);

  activePositions[symbol] = {
    trade_id: tradeCounter++,'''
if needle not in s: print('active needle missing')
s=s.replace(needle,insert)
needle2='''    entryFee: typeof entryFee !== "undefined" ? entryFee : 0
  };'''
replace2='''    entryFee: typeof entryFee !== "undefined" ? entryFee : 0,
    modelTargetPrice,
    modelTargetMovePct: modelMovePct,
    modelExpectedNetPnlUSD,
    modelExpectedGrossPnlUSD,
    modelTargetHit: false,
    modelMaxFavorablePnlUSD: 0,
    modelConfidence
  };'''
if needle2 not in s: print('active end missing')
s=s.replace(needle2,replace2,1)
# Update peak/max favorable in exit loop after pnl calc
needle3='''        const priceMovePct = pos.type === "long"
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        const initialMargin'''
replace3='''        const priceMovePct = pos.type === "long"
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        const targetReachedNow = pos.modelTargetPrice
          ? (pos.type === "long" ? currentPrice >= pos.modelTargetPrice : currentPrice <= pos.modelTargetPrice)
          : false;
        if (targetReachedNow) pos.modelTargetHit = true;
        pos.modelMaxFavorablePnlUSD = Math.max(pos.modelMaxFavorablePnlUSD || 0, pnlUSD);

        const initialMargin'''
if needle3 not in s: print('pnl needle missing')
s=s.replace(needle3,replace3)
# add fields on close record; find close assignment
oldclose='''allTrades[tradeIndex].is_open=false; allTrades[tradeIndex].close_rate=exitFillPrice; allTrades[tradeIndex].close_date=Date.now(); allTrades[tradeIndex].close_reason=reason; allTrades[tradeIndex].profit_abs=Number(netPnl.toFixed(4)); allTrades[tradeIndex].profit_pct=Number(roePct.toFixed(2)); allTrades[tradeIndex].gross_profit_abs=Number(grossPnl.toFixed(4)); allTrades[tradeIndex].exit_fee=exitFee;'''
newclose='''allTrades[tradeIndex].is_open=false; allTrades[tradeIndex].close_rate=exitFillPrice; allTrades[tradeIndex].close_date=Date.now(); allTrades[tradeIndex].close_reason=reason; allTrades[tradeIndex].profit_abs=Number(netPnl.toFixed(4)); allTrades[tradeIndex].profit_pct=Number(roePct.toFixed(2)); allTrades[tradeIndex].gross_profit_abs=Number(grossPnl.toFixed(4)); allTrades[tradeIndex].exit_fee=exitFee;
    allTrades[tradeIndex].model_target_hit=Boolean(pos.modelTargetHit);
    allTrades[tradeIndex].model_max_favorable_pnl_usd=Number((pos.modelMaxFavorablePnlUSD || 0).toFixed(4));
    allTrades[tradeIndex].model_target_realization_pct = pos.modelExpectedNetPnlUSD > 0 ? Number(Math.max(0, (pos.modelMaxFavorablePnlUSD || 0) / pos.modelExpectedNetPnlUSD * 100).toFixed(1)) : 0;'''
if oldclose not in s: print('close missing')
s=s.replace(oldclose,newclose)
# API trade fields replace target zeros
oldapi='''      deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
      target_pct: 0,
      stop_loss_pct: t.stopLossPct || activeStopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: 0'''
newapi='''      deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
      target_pct: Number((t.modelTargetMovePct || 0).toFixed(3)),
      model_target_price: t.modelTargetPrice ? Number(t.modelTargetPrice.toFixed(8)) : undefined,
      model_expected_net_pnl_usd: Number((t.modelExpectedNetPnlUSD || 0).toFixed(4)),
      model_expected_gross_pnl_usd: Number((t.modelExpectedGrossPnlUSD || 0).toFixed(4)),
      model_confidence: Number((t.modelConfidence || 0).toFixed(1)),
      model_target_hit: Boolean(t.modelTargetHit || t.model_target_hit),
      model_max_favorable_pnl_usd: Number((t.modelMaxFavorablePnlUSD || t.model_max_favorable_pnl_usd || 0).toFixed(4)),
      model_target_realization_pct: Number((t.model_target_realization_pct || 0).toFixed(1)),
      stop_loss_pct: t.stopLossPct || activeStopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: Number((t.modelTargetMovePct || 0).toFixed(3))'''
if oldapi not in s: print('api missing')
s=s.replace(oldapi,newapi)
# Return extra flow model values
oldret='''    expectedNetPnlUsdLong, expectedNetPnlUsdShort, minimumNetPnlUSD:minNetProfitUSD,
    expectedMovePctLong: longExpectedMovePct, expectedMovePctShort: shortExpectedMovePct,
    movementScoreLong, movementScoreShort, profitScoreLong: longProfitScore, profitScoreShort: shortProfitScore,'''
newret='''    expectedNetPnlUsdLong, expectedNetPnlUsdShort, minimumNetPnlUSD:minNetProfitUSD,
    expectedGrossPnlUsdLong: notionalUSD*(longExpectedMovePct/100),
    expectedGrossPnlUsdShort: notionalUSD*(shortExpectedMovePct/100),
    expectedMovePctLong: longExpectedMovePct, expectedMovePctShort: shortExpectedMovePct,
    modelTargetPriceLong: currentPrice*(1+longExpectedMovePct/100),
    modelTargetPriceShort: currentPrice*(1-shortExpectedMovePct/100),
    modelConfidenceLong: Math.min(100, Math.max(0, longProfitScore*0.45 + movementScoreLong*0.35 + Math.max(0, Math.min(100, (flowLongDataQualityScore||0)))*0.20)),
    modelConfidenceShort: Math.min(100, Math.max(0, shortProfitScore*0.45 + movementScoreShort*0.35 + Math.max(0, Math.min(100, (flowShortDataQualityScore||0)))*0.20)),
    movementScoreLong, movementScoreShort, profitScoreLong: longProfitScore, profitScoreShort: shortProfitScore,'''
# Can't reference undefined flowLongDataQualityScore. use simple confidence from existing scores.
newret=newret.replace("Math.max(0, Math.min(100, (flowLongDataQualityScore||0)))*0.20","longAdvantage*0.20").replace("Math.max(0, Math.min(100, (flowShortDataQualityScore||0)))*0.20","shortAdvantage*0.20")
if oldret not in s: print('return missing')
s=s.replace(oldret,newret)
p.write_text(s)

# App types
p=Path('/mnt/data/v5work/src/types.ts'); s=p.read_text(); s=s.replace('''  take_profit_pct?: number;
  fee_open: number;''','''  take_profit_pct?: number;
  model_target_price?: number;
  model_expected_net_pnl_usd?: number;
  model_expected_gross_pnl_usd?: number;
  model_confidence?: number;
  model_target_hit?: boolean;
  model_max_favorable_pnl_usd?: number;
  model_target_realization_pct?: number;
  fee_open: number;'''); p.write_text(s)

# App live mapping preserve server model fields; no overwrite needed.
# Dashboard: add a target column and target status
p=Path('/mnt/data/v5work/src/components/TradingDashboard.tsx'); s=p.read_text();
s=s.replace('<th className="py-3 px-4">Kâr % (USDT)</th>','<th className="py-3 px-4">Model Kâr Hedefi</th>\n                <th className="py-3 px-4">Kâr % (USDT)</th>')
s=s.replace('<td colSpan={8} className="py-8 text-center text-slate-500 font-sans">','<td colSpan={9} className="py-8 text-center text-slate-500 font-sans">')
needle='''                      <td className="py-3 px-4">
                        <div className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}{t.profit_pct.toFixed(2)}%
                        </div>'''
replacement='''                      <td className="py-3 px-4 min-w-[180px]">
                        {t.model_expected_net_pnl_usd !== undefined ? (
                          <>
                            <div className="font-bold text-amber-300">
                              +${Number(t.model_expected_net_pnl_usd || 0).toFixed(2)} net
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Hedef: ${Number(t.model_target_price || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} · +{Number(t.target_pct || 0).toFixed(2)}%
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Güven: %{Number(t.model_confidence || 0).toFixed(0)} · {t.is_open ? 'Model tahmini' : (t.model_target_hit ? 'Hedef görüldü' : 'Hedef görülmedi')}
                            </div>
                          </>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}{t.profit_pct.toFixed(2)}%
                        </div>'''
if needle not in s: print('dashboard needle missing')
s=s.replace(needle,replacement)
p.write_text(s)

# docs
p=Path('/mnt/data/v5work/ALGORITHM_UPDATE.md'); s=p.read_text(); s += '''\n\n## Entry-time quantitative profit target\n- At every entry, the engine snapshots a model-estimated target price, expected gross PnL, expected net PnL after estimated friction, target move %, and confidence.\n- These values are frozen at entry so the UI can show what the algorithm predicted at the moment of entry rather than rewriting history as the market moves.\n- The UI labels this as a **model estimate, not a guarantee**.\n- On close, the engine records whether the target price was actually reached and the maximum favorable PnL relative to the entry-time expected net PnL, allowing target-quality evaluation.\n'''; p.write_text(s)
