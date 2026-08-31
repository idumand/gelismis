// ARGOS AI Agent V4 — Autonomous Multi-Expert Crypto Intelligence
// Design goals:
//   • deterministic + learned ensemble; no single indicator can dominate
//   • explicit uncertainty, data-quality and disagreement accounting
//   • natural-language directives converted to persistent, auditable policy
//   • scenario analysis and counter-thesis tests before entry
//   • portfolio-aware ranking and correlation concentration control
//   • position thesis monitoring and adaptive exit logic
//   • bounded self-improvement from outcomes; no hidden chain-of-thought

export type AgentSide = 'long' | 'short';
export type AgentStrategy =
  | 'balanced' | 'money_flow_only' | 'deep_analysis' | 'order_flow' | 'trend' | 'scalp'
  | 'liquidity' | 'mean_reversion' | 'breakout' | 'defensive';
export type AgentIntent =
  | 'CHAT' | 'SET_DIRECTIVE' | 'SCAN' | 'OPEN_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL'
  | 'START_ENGINE' | 'STOP_ENGINE' | 'AUTOPILOT_ON' | 'AUTOPILOT_OFF' | 'STATUS'
  | 'ANALYZE_COIN' | 'ANALYZE_MARKET' | 'WATCH_POSITION' | 'SET_RISK' | 'SET_MODEL';

export interface AgentCommand {
  intent: AgentIntent;
  symbol?: string;
  side?: AgentSide;
  strategy?: AgentStrategy;
  amountUSD?: number;
  leverage?: number;
  confidenceMin?: number;
  maxPositions?: number;
  riskPerTradePct?: number;
  force?: boolean;
  text: string;
  extracted: Record<string, unknown>;
}

export interface LiveCoin { symbol: string; price: number; updatedAt: number; [key: string]: any; }
export interface LivePosition {
  symbol: string; side: AgentSide; entryPrice: number; currentPrice: number;
  pnlUSD: number; roePct: number; openedAt: number; [key: string]: any;
}

export interface AgentDirective {
  strategy: AgentStrategy;
  side?: AgentSide | 'both';
  onlyMoneyFlow: boolean;
  requireDeepAnalysis: boolean;
  requireTrendAlignment: boolean;
  requireOrderFlowAlignment: boolean;
  requireLiquidityPath: boolean;
  requirePositiveEV: boolean;
  avoidCrowdedTrades: boolean;
  antiChop: boolean;
  minConfidence: number;
  minProbability: number;
  minDataQuality: number;
  maxUncertainty: number;
  minRiskReward: number;
  maxPositions: number;
  maxCorrelatedPositions: number;
  riskPerTradePct: number;
  autoManagePositions: boolean;
  allowEntries: boolean;
  allowScaleIn: boolean;
  useScenarioEngine: boolean;
  useCounterThesis: boolean;
  memoryLearning: boolean;
  updatedAt: number;
  rawText?: string;
}

export interface Scenario {
  name: string;
  probability: number;
  pnlBias: number;
  favorable: boolean;
  trigger: string;
  risk: number;
}

export interface AgentDecision {
  symbol: string;
  side: AgentSide;
  action: 'ENTER_NOW' | 'WAIT' | 'IGNORE' | 'EXIT_NOW' | 'HOLD';
  score: number;
  probability: number;
  confidence: number;
  uncertainty: number;
  expectedValue: number;
  riskReward: number;
  reasons: string[];
  warnings: string[];
  factors: Record<string, number | string | boolean>;
  scenarios?: Scenario[];
  generatedAt: number;
}

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const num=(v:any,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const pct=(v:number)=>`${v.toFixed(1)}%`;
const dir=(side:AgentSide,v:number)=>side==='long'?v:-v;
const bool=(v:any)=>Boolean(v===true||v==='true'||v===1||v==='1');
function includesAny(s:string, words:string[]){ return words.some(w=>s.includes(w)); }
function normalizeSymbol(v:string|undefined){
  const s=String(v||'').trim().toUpperCase(); if(!s || s==='USDT' || s==='USD') return undefined;
  if(s.includes('/')) return s.endsWith('/USDT')?s:undefined;
  const base=s.replace(/USDT$/,'');
  if(!base || base==='USDT') return undefined;
  return `${base}/USDT`;
}

export const DEFAULT_AGENT_DIRECTIVE:AgentDirective={
  strategy:'balanced', side:'both', onlyMoneyFlow:false, requireDeepAnalysis:false,
  requireTrendAlignment:false, requireOrderFlowAlignment:true, requireLiquidityPath:true,
  requirePositiveEV:true, avoidCrowdedTrades:true, antiChop:true, minConfidence:72,
  minProbability:.68, minDataQuality:72, maxUncertainty:.36, minRiskReward:1.35,
  maxPositions:1, maxCorrelatedPositions:1, riskPerTradePct:1, autoManagePositions:true,
  allowEntries:true, allowScaleIn:false, useScenarioEngine:true, useCounterThesis:true,
  memoryLearning:true, updatedAt:Date.now()
};

/** Robust natural-language command parser. It is deliberately conservative around destructive actions. */
export function parseAgentCommand(text:string):AgentCommand{
  const raw=String(text||'').trim(); const s=raw.toLocaleLowerCase('tr-TR'); const extracted:Record<string,unknown>={};
  const symbolTokens=raw.match(/\b[A-Z]{2,12}(?:\/USDT|USDT)?\b/g)||[];
  const symbol=symbolTokens.map(normalizeSymbol).find(Boolean);
  const lev=s.match(/(?:kaldıraç|kaldirac|leverage)\s*(?:x|:)?\s*(\d{1,3})|(?:^|\s)(\d{1,3})\s*x(?:\s|$)/i);
  const leverage=lev?Number(lev[1]||lev[2]):undefined;
  const amt=s.match(/(?:\$|usdt|dolar)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:usdt|dolar)/i);
  const amountUSD=amt?Number((amt[1]||amt[2]).replace(',','.')):undefined;
  const max=s.match(/(?:maksimum|max|en fazla)\s*(\d+)\s*(?:pozisyon|işlem|islem)/i); const maxPositions=max?Number(max[1]):undefined;
  const conf=s.match(/(?:en az|minimum)\s*%?\s*(\d+)\s*(?:güven|guven|confidence)/i); const confidenceMin=conf?Number(conf[1]):undefined;
  const risk=s.match(/(?:risk|risk yüzdesi|risk yuzdesi)\s*%?\s*(\d+(?:[.,]\d+)?)/i); const riskPerTradePct=risk?Number(risk[1].replace(',','.')):undefined;
  if(symbol) extracted.symbol=symbol; if(leverage) extracted.leverage=leverage; if(amountUSD) extracted.amountUSD=amountUSD;
  if(maxPositions) extracted.maxPositions=maxPositions; if(confidenceMin) extracted.confidenceMin=confidenceMin; if(riskPerTradePct) extracted.riskPerTradePct=riskPerTradePct;

  let strategy:AgentStrategy|undefined;
  const pairs:[AgentStrategy,string[]][]=[
    ['money_flow_only',['sadece para giriş','sadece para akışı','yalnızca para giriş','yalnizca para giris','net para','money flow only']],
    ['deep_analysis',['derin analiz','çok derin analiz','cok derin analiz','deep analysis','her şeyi değerlendir','her seyi degerlendir']],
    ['order_flow',['order book','orderbook','emir defteri','likidite akışı','likidite akisi','taker']],
    ['liquidity',['likidite yolu','likidite avı','likidite avi','liquidity path','liquidity']],
    ['breakout',['kırılım','kirilim','breakout','direnç kır','direnc kir']],
    ['mean_reversion',['mean reversion','ortalamaya dönüş','ortalamaya donus','aşırı satım','asiri satim']],
    ['trend',['trend','momentum']],
    ['scalp',['scalp','vur kaç','vur-kac','hızlı işlem','hizli islem']],
    ['defensive',['savunmacı','savunmaci','düşük risk','dusuk risk','korumacı','korumaci']]
  ];
  for(const [k,words] of pairs){ if(includesAny(s,words)){strategy=k;break;} }
  let side:AgentSide|undefined;
  if(includesAny(s,['sadece long','yalnızca long','yalnizca long'])||/\blong\s*(?:aç|ac|pozisyon|giriş|giris)/.test(s)) side='long';
  if(includesAny(s,['sadece short','yalnızca short','yalnizca short'])||/\bshort\s*(?:aç|ac|pozisyon|giriş|giris)/.test(s)) side='short';
  if(strategy) extracted.strategy=strategy; if(side) extracted.side=side;

  const isCloseAll=includesAny(s,['tüm pozisyonları kapat','tum pozisyonlari kapat','hepsini kapat','all positions close']);
  const isClose=includesAny(s,['pozisyonu kapat','pozisyon kapat','işlemi kapat','islemi kapat','çık','cik']);
  const isOpen=includesAny(s,['pozisyon aç','pozisyon ac','işlem aç','islem ac','giriş yap','giris yap']) || /(?:^|\s)(?:long|short)\s+(?:aç|ac)(?:\s|$)/.test(s);
  const isStart=includesAny(s,['motoru başlat','motoru baslat','ticareti başlat','ticareti baslat','işlemleri başlat','islemleri baslat']);
  const isStop=includesAny(s,['motoru durdur','ticareti durdur','işlemleri durdur','islemleri durdur']);
  const isAutoOn=includesAny(s,['otonomu aç','otonomu ac','otonom aç','otonom ac','autopilot aç','autopilot ac']);
  const isAutoOff=includesAny(s,['otonomu kapat','otonomu kapat','autopilot kapat']);
  const isScan=includesAny(s,['tara','coin bul','fırsat bul','firsat bul','en iyi coin','hangi coin','aday bul']);
  const isStatus=includesAny(s,['durum nedir','durumunu göster','durumunu goster','pozisyonları göster','pozisyonlari goster','raporla']);
  const isWatch=includesAny(s,['izle','takip et','gözlemle','gozlemle']);
  let intent:AgentIntent='CHAT';
  if(isCloseAll) intent='CLOSE_ALL'; else if(isClose) intent='CLOSE_POSITION'; else if(isOpen) intent='OPEN_POSITION';
  else if(isStart) intent='START_ENGINE'; else if(isStop) intent='STOP_ENGINE'; else if(isAutoOn) intent='AUTOPILOT_ON'; else if(isAutoOff) intent='AUTOPILOT_OFF';
  else if(isStatus) intent='STATUS'; else if(symbol && isWatch) intent='WATCH_POSITION'; else if(symbol&&includesAny(s,['analiz','incele','yorumla','bak'])) intent='ANALYZE_COIN';
  else if(isScan) intent='SCAN'; else if(strategy||side||maxPositions||confidenceMin||riskPerTradePct) intent='SET_DIRECTIVE';
  const force=includesAny(s,['zorla','filtreleri kapat','güvenliksiz','guvenliksiz']); if(force) extracted.force=true;
  return {intent,symbol,side,strategy,amountUSD,leverage,confidenceMin,maxPositions,riskPerTradePct,force,text:raw,extracted};
}

function marketRegime(m:any,side:AgentSide){
  const trend=dir(side,num(m.trendScore)); const vol=Math.abs(num(m.atrPct??m.volatilityPct??m.stdDev*100));
  const adx=num(m.adx); const choppy=bool(m.choppy)||(!adx && Math.abs(trend)<12 && vol>2.5);
  const squeeze=bool(m.squeeze)||num(m.bollingerWidth) < num(m.bollingerWidthP25,0);
  if(choppy) return {name:'CHOPPY',quality:.25};
  if(trend>28 && vol>=1.2) return {name:'TREND',quality:.95};
  if(trend>12) return {name:'MOMENTUM',quality:.78};
  if(trend<-18) return {name:'COUNTERTREND',quality:.22};
  if(squeeze) return {name:'SQUEEZE',quality:.68};
  return {name:'BALANCED',quality:.58};
}

function expertMoneyFlow(m:any,side:AgentSide){
  const net=num(m.netInflowUSDT??m.net_inflow_usdt??m.netCapitalFlow); const mom=dir(side,num(m.inflowMomentum));
  const largeLong=num(m.largeLongUSDT??m.largeBuyUSDT), largeShort=num(m.largeShortUSDT??m.largeSellUSDT);
  const large=side==='long'?largeLong-largeShort:largeShort-largeLong;
  const vol=Math.max(1,num(m.volume_24h_usdt));
  const netN=clamp(net/(vol*.02),-1,1); const largeN=clamp(large/(Math.max(1,vol*.01)),-1,1);
  const score=clamp(.5+.30*clamp(dir(side,netN),-1,1)+.20*clamp(mom/50,-1,1)+.10*clamp(largeN,-1,1),0,1);
  return {score, strength:Math.abs(netN), large:largeN};
}

function expertOrderFlow(m:any,side:AgentSide){
  const gap=dir(side,num(m.orderFlowGap)); const obi=dir(side,num(m.obi??m.orderBookImbalance))*100;
  const lp=dir(side,num(side==='long'?m.longPressure??m.longAdvantage:m.shortPressure??m.shortAdvantage));
  const cons=dir(side,num(m.liquidityConsumptionScore));
  const score=clamp(.5+.0035*gap+.0025*obi+.002*lp+.0015*cons,0,1);
  return {score,imbalance:obi,consumption:cons};
}

function expertTrend(m:any,side:AgentSide){
  const trend=dir(side,num(m.trendScore??m.priceTrendScore)); const emaBias=(num(m.ema9)&&num(m.ema21))?dir(side,(num(m.ema9)/Math.max(1e-12,num(m.ema21))-1)*1000):0;
  const rsi=num(m.rsi,50); const rsiDir=side==='long'?(rsi-50):(50-rsi);
  const macd=dir(side,num(m.macdHistogram??m.macd??0));
  const score=clamp(.5+trend/240+emaBias/220+rsiDir/300+macd/250,0,1);
  return {score,trend,emaBias,rsiDir,macd};
}

function expertLiquidity(m:any,side:AgentSide){
  const path=clamp(num(m.targetPathScore)/100,0,1); const target=clamp(num(m.targetConfidence)/100,0,1);
  const opp=dir(side,num(m.nearOpp??m.oppositeLiquidity)); const support=dir(side,num(m.nearSupport??m.supportLiquidity));
  const wall=dir(side,num(m.wallPressure));
  const score=clamp(.45*.55+path*.25+target*.18+clamp((opp+support+wall)/300+0.5,0,1)*.12,0,1);
  return {score,path,target,opp,support};
}

function expertRisk(m:any,side:AgentSide){
  const rr=num(side==='long'?m.longRiskReward:m.shortRiskReward,m.selectedRiskReward??m.riskReward); const ev=num(side==='long'?m.longExpectedValueUSD:m.shortExpectedValueUSD,m.selectedExpectedValueUSD??m.expectedNetProfitUSD);
  const spread=clamp(num(m.spreadPct)/.01,0,1); const vol=clamp(num(m.atrPct??m.volatilityPct??m.stdDev*100)/12,0,1);
  const rrScore=clamp(rr/3,0,1), evScore=clamp(.5+ev/Math.max(1,Math.abs(num(m.stakeAmount,25))*.15),0,1);
  return {score:clamp(.55*rrScore+.30*evScore+.15*(1-spread)* (1-vol*.45),0,1),rr,ev,spread,vol};
}

function expertMicrostructure(m:any,side:AgentSide){
  const book=clamp((num(m.nearBidUSDT)+num(m.nearAskUSDT))/(Math.max(1,num(m.volume_1m_usdt??m.volume_24h_usdt))*0.00001),0,1);
  const trade=clamp(num(m.largeTradeScore)/100,0,1); const delta=dir(side,num(m.tradeDelta??m.cvd)); const absorption=dir(side,num(m.absorptionScore));
  return {score:clamp(.25*book+.35*trade+.25*clamp(.5+delta/200,0,1)+.15*clamp(.5+absorption/200,0,1),0,1),book,trade};
}

function expertCrowding(m:any,side:AgentSide){
  const funding=dir(side,num(m.fundingRate)*1000); const oi=dir(side,num(m.oiDeltaPct??m.openInterestChangePct)); const crowd=clamp(Math.abs(funding)+Math.abs(oi),0,3)/3;
  const favorable=clamp(.5 + funding*.15 - oi*.05,0,1); return {score:clamp(.55*favorable+.45*(1-crowd),0,1),crowd,funding,oi};
}

function expertVolatility(m:any,side:AgentSide){
  const vol=Math.abs(num(m.atrPct??m.volatilityPct??m.stdDev*100)); const move=Math.abs(num(side==='long'?m.longMovementPotentialPct:m.shortMovementPotentialPct,m.movementPotentialPct));
  const enough=clamp(move/Math.max(.25,vol*0.8),0,1); const tooHot=clamp((vol-10)/10,0,1); const score=clamp(enough*(1-tooHot*.65),0,1);
  return {score,vol,move,tooHot};
}

function dataQualityScore(m:any){
  const q=clamp(num(m.dataQuality)/100,0,1); const age=Math.max(0,(Date.now()-num(m.updatedAt,0))/1000); const freshness=age<=2?1:age<=5?.9:age<=10?.7:age<=20?.35:0;
  const completeness=clamp(Number(m.price>0)+Number(num(m.volume_24h_usdt)>0)+Number(m.orderFlowGap!==undefined)+Number(m.netInflowUSDT!==undefined)+Number(m.targetConfidence!==undefined)/5,0,1);
  return {score:clamp(.55*q+.30*freshness+.15*completeness,0,1),age,q,freshness,completeness};
}

function disagreement(values:number[]){
  if(!values.length) return 1; const mean=values.reduce((a,b)=>a+b,0)/values.length; const variance=values.reduce((a,b)=>a+(b-mean)**2,0)/values.length; return clamp(Math.sqrt(variance)*2,0,1);
}

function scenarios(m:any,side:AgentSide,base:number,uncertainty:number):Scenario[]{
  const trend=dir(side,num(m.trendScore)); const flow=dir(side,num(m.inflowMomentum)); const of=dir(side,num(m.orderFlowGap));
  const bull=clamp(.30+.003*trend+.002*flow+.002*of,0.05,.75); const bear=clamp(.23-.0025*trend-.0015*flow-.0015*of,0.05,.65); const chop=clamp(.18+uncertainty*.35,0.05,.65);
  const sum=bull+bear+chop; const b=bull/sum, br=bear/sum, c=chop/sum;
  return [
    {name:'Tez çalışıyor',probability:b,pnlBias:clamp(.5+base*.7,0,1),favorable:true,trigger:'yön + akış + likidite korunuyor',risk:1-b},
    {name:'Tez bozuluyor',probability:br,pnlBias:clamp(.5-base*.9,0,1),favorable:false,trigger:'para akışı veya order-flow ters dönüyor',risk:br},
    {name:'Yatay/çalkantı',probability:c,pnlBias:.45,favorable:false,trigger:'yön sinyalleri ayrışıyor',risk:c*.8}
  ];
}

function counterThesis(m:any,side:AgentSide){
  const negMoney=side==='long'?num(m.netInflowUSDT??m.netCapitalFlow)<0:num(m.netInflowUSDT??m.netCapitalFlow)>0;
  const negFlow=dir(side,num(m.orderFlowGap))<0; const negTrend=dir(side,num(m.trendScore))<0; const targetBlocked=num(m.targetPathScore)<45;
  const items:string[]=[]; if(negMoney) items.push('net para akışı karşı yönde'); if(negFlow) items.push('order-flow karşı yönde'); if(negTrend) items.push('trend karşı yönde'); if(targetBlocked) items.push('hedefe likidite yolu zayıf');
  return {broken:items.length>=2,items,penalty:clamp(items.length*.12,0,.42)};
}

/** Core V4 multi-expert decision. All numeric details are derived from supplied live metrics. */
export function scoreCoin(m:any,side:AgentSide,directive:AgentDirective,learnedProbability=.5):AgentDecision{
  const data=dataQualityScore(m); const regime=marketRegime(m,side);
  const money=expertMoneyFlow(m,side), flow=expertOrderFlow(m,side), trend=expertTrend(m,side), liquidity=expertLiquidity(m,side);
  const risk=expertRisk(m,side), micro=expertMicrostructure(m,side), crowd=expertCrowding(m,side), vol=expertVolatility(m,side);
  const learned=clamp(learnedProbability,.01,.99);
  const experts=[money.score,flow.score,trend.score,liquidity.score,risk.score,micro.score,crowd.score,vol.score,learned];
  const dis=disagreement(experts); const agreement=1-dis;

  let w={money:.18,flow:.16,trend:.12,liquidity:.12,risk:.12,micro:.09,crowd:.06,vol:.06,learned:.09};
  if(directive.onlyMoneyFlow||directive.strategy==='money_flow_only') w={money:.65,flow:.08,trend:.03,liquidity:.03,risk:.06,micro:.04,crowd:.03,vol:.03,learned:.05};
  else if(directive.strategy==='deep_analysis'||directive.requireDeepAnalysis) w={money:.15,flow:.14,trend:.12,liquidity:.12,risk:.12,micro:.10,crowd:.08,vol:.07,learned:.10};
  else if(directive.strategy==='order_flow') w={money:.12,flow:.34,trend:.10,liquidity:.10,risk:.10,micro:.14,crowd:.04,vol:.04,learned:.02};
  else if(directive.strategy==='liquidity') w={money:.12,flow:.14,trend:.08,liquidity:.34,risk:.12,micro:.10,crowd:.04,vol:.03,learned:.03};
  else if(directive.strategy==='trend') w={money:.10,flow:.10,trend:.34,liquidity:.10,risk:.10,micro:.04,crowd:.05,vol:.09,learned:.08};
  else if(directive.strategy==='defensive') w={money:.12,flow:.10,trend:.08,liquidity:.12,risk:.24,micro:.08,crowd:.10,vol:.10,learned:.06};

  const prior=w.money*money.score+w.flow*flow.score+w.trend*trend.score+w.liquidity*liquidity.score+w.risk*risk.score+w.micro*micro.score+w.crowd*crowd.score+w.vol*vol.score+w.learned*learned;
  const regimeAdj=(regime.quality-.5)*.12; const antiChop=directive.antiChop&&regime.name==='CHOPPY'?-.18:0;
  const dataAdj=(data.score-.72)*.16; const crowdPenalty=directive.avoidCrowdedTrades?Math.max(0,crowd.crowd-.65)*.12:0;
  const counter=directive.useCounterThesis?counterThesis(m,side):{broken:false,items:[],penalty:0};
  const probability=clamp(prior+regimeAdj+dataAdj+antiChop-crowdPenalty-counter.penalty,.01,.99);
  const uncertainty=clamp(.05+data.age/30+(1-data.score)*.42+dis*.38+vol.tooHot*.12+(counter.broken?.10:0),.03,.92);
  const confidence=clamp(100*(.30*data.score+.24*agreement+.16*regime.quality+.10*risk.score+.10*liquidity.score+.10*(1-uncertainty)),0,100);
  const expectedValue=risk.ev; const rr=risk.rr;
  const quality=clamp(.40*probability+.22*(confidence/100)+.12*risk.score+.10*liquidity.score+.08*regime.quality+.08*(1-uncertainty),0,1);
  const score=clamp(quality*100,0,100);

  const reasons:string[]=[]; const warnings:string[]=[];
  if(money.score>=.70) reasons.push(side==='long'?'net para girişi güçlü':'net para çıkışı short lehine güçlü');
  if(flow.score>=.70) reasons.push('order-flow / emir defteri yönle uyumlu');
  if(liquidity.score>=.68) reasons.push('hedefe likidite yolu yeterli');
  if(trend.score>=.68) reasons.push(`trend rejimi destekli (${regime.name})`);
  if(risk.rr>=1.5) reasons.push(`risk/getiri güçlü (${risk.rr.toFixed(2)})`);
  if(crowd.crowd>.72) warnings.push('pozisyon kalabalığı/funding riski yüksek');
  if(data.score<directive.minDataQuality/100) warnings.push('canlı veri kalitesi veya tazeliği yetersiz');
  if(dis>.28) warnings.push('uzman modeller arasında anlamlı görüş ayrılığı var');
  if(counter.items.length) warnings.push(`karşı tez: ${counter.items.join(', ')}`);
  if(regime.name==='CHOPPY') warnings.push('piyasa yatay/çalkantılı; yanlış kırılım riski');
  if(directive.onlyMoneyFlow&&money.score<.72) warnings.push('yalnız para akışı şartı karşılanmadı');

  const hard=data.score>=directive.minDataQuality/100 && uncertainty<=directive.maxUncertainty && (!directive.requireOrderFlowAlignment||flow.score>=.55) && (!directive.requireTrendAlignment||trend.score>=.56) && (!directive.requireLiquidityPath||liquidity.score>=.50) && (!directive.requirePositiveEV||expectedValue>=0) && rr>=directive.minRiskReward && !counter.broken;
  let action:AgentDecision['action']='IGNORE';
  if(hard && probability>=directive.minProbability && confidence>=directive.minConfidence) action='ENTER_NOW';
  else if(hard && probability>=directive.minProbability-.06 && confidence>=directive.minConfidence-10) action='WAIT';
  const scen=directive.useScenarioEngine?scenarios(m,side,probability,uncertainty):undefined;
  return {
    symbol:String(m.symbol||''),side,action,score,probability,confidence,uncertainty,expectedValue,riskReward:rr,
    reasons:reasons.slice(0,10),warnings:warnings.slice(0,10),scenarios:scen,
    factors:{moneyFlow:Number(money.score.toFixed(3)),flow:Number(flow.score.toFixed(3)),trend:Number(trend.score.toFixed(3)),liquidity:Number(liquidity.score.toFixed(3)),risk:Number(risk.score.toFixed(3)),micro:Number(micro.score.toFixed(3)),crowding:Number(crowd.crowd.toFixed(3)),volatility:Number(vol.score.toFixed(3)),learned:Number(learned.toFixed(3)),agreement:Number(agreement.toFixed(3)),dataQuality:Number(data.score.toFixed(3)),dataAgeSec:Number(data.age.toFixed(2)),regime:regime.name,regimeQuality:Number(regime.quality.toFixed(3)),counterThesisBroken:counter.broken,strategy:directive.strategy},
    generatedAt:Date.now()
  };
}

function percentile(values:number[],v:number){
  if(!values.length) return .5; const s=[...values].filter(Number.isFinite).sort((a,b)=>a-b); if(!s.length)return .5;
  let lo=0,hi=s.length; while(lo<hi){const mid=(lo+hi)>>1;if(s[mid]<=v)lo=mid+1;else hi=mid;} return clamp((lo-.5)/s.length,0,1);
}

function crossSectionalProfile(coins:LiveCoin[]){
  const trend=coins.map(c=>num(c.trendScore));
  const flow=coins.map(c=>num(c.inflowMomentum));
  const volume=coins.map(c=>Math.log10(Math.max(1,num(c.volume_24h_usdt))));
  const move=coins.map(c=>num(c.change_24h_pct));
  const spread=coins.map(c=>num(c.spreadPct));
  return {
    trend,flow,volume,move,spread,
    medianTrend:trend.length?trend.slice().sort((a,b)=>a-b)[Math.floor(trend.length/2)]:0,
    medianFlow:flow.length?flow.slice().sort((a,b)=>a-b)[Math.floor(flow.length/2)]:0
  };
}

function enrichWithMarketIntelligence(m:any,side:AgentSide,p:any){
  const relTrend=side==='long'?percentile(p.trend,num(m.trendScore)):1-percentile(p.trend,num(m.trendScore));
  const relFlow=side==='long'?percentile(p.flow,num(m.inflowMomentum)):1-percentile(p.flow,num(m.inflowMomentum));
  const relVolume=percentile(p.volume,Math.log10(Math.max(1,num(m.volume_24h_usdt))));
  const relMove=side==='long'?percentile(p.move,num(m.change_24h_pct)):1-percentile(p.move,num(m.change_24h_pct));
  const spreadQuality=1-percentile(p.spread,num(m.spreadPct));
  const relativeStrength=clamp(.34*relTrend+.30*relFlow+.16*relVolume+.12*relMove+.08*spreadQuality,0,1);
  return {relativeStrength,relTrend,relFlow,relVolume,relMove,spreadQuality};
}

export function rankMarket(coins:LiveCoin[],directive:AgentDirective,learnedResolver:(m:any,side:AgentSide)=>number){
  const results:AgentDecision[]=[]; const sides:AgentSide[]=directive.side==='long'?['long']:directive.side==='short'?['short']:['long','short'];
  const profile=crossSectionalProfile(coins);
  for(const coin of coins){ for(const side of sides){
    const base=scoreCoin(coin,side,directive,learnedResolver(coin,side));
    const x=enrichWithMarketIntelligence(coin,side,profile);
    const crowdPenalty=directive.avoidCrowdedTrades&&x.relativeStrength<.28?.08:0;
    const crossBonus=(x.relativeStrength-.5)*.18;
    const probability=clamp(base.probability+crossBonus-crowdPenalty,.01,.99);
    const confidence=clamp(base.confidence + (x.relativeStrength-.5)*14,0,100);
    const score=clamp(base.score + (x.relativeStrength-.5)*12-crowdPenalty*20,0,100);
    const reasons=[...base.reasons]; const warnings=[...base.warnings];
    if(x.relativeStrength>=.72) reasons.push('evrene göre göreceli güç/akış üstünlüğü yüksek');
    if(x.relativeStrength<=.30) warnings.push('evrene göre göreceli zayıflık');
    results.push({...base,probability,confidence,score,reasons:reasons.slice(0,10),warnings:warnings.slice(0,10),factors:{...base.factors,relativeStrength:Number(x.relativeStrength.toFixed(3)),relativeTrend:Number(x.relTrend.toFixed(3)),relativeFlow:Number(x.relFlow.toFixed(3)),relativeVolume:Number(x.relVolume.toFixed(3)),relativeMove:Number(x.relMove.toFixed(3)),spreadQuality:Number(x.spreadQuality.toFixed(3))}});
  }}
  return results.sort((a,b)=>(b.score-a.score)||(b.confidence-a.confidence)||(b.probability-a.probability));
}

export function analyzePosition(pos:LivePosition,market:any,directive:AgentDirective):AgentDecision{
  const side=pos.side; const live=scoreCoin({...market,symbol:pos.symbol},side,{...directive,minProbability:Math.max(.55,directive.minProbability-.08),minConfidence:Math.max(58,directive.minConfidence-8),minRiskReward:Math.max(1,directive.minRiskReward-.2)});
  const pnl=num(pos.pnlUSD), roe=num(pos.roePct), peak=Math.max(0,num(pos.peakNetPnl,pnl)); const giveback=peak>0?clamp((peak-pnl)/peak,0,1):0;
  const ageMin=Math.max(0,(Date.now()-num(pos.openedAt))/60000); const negMoney=side==='long'?num(market?.inflowMomentum)<-10:num(market?.inflowMomentum)>10; const negFlow=dir(side,num(market?.orderFlowGap))<0;
  const thesisScore=live.probability - (negMoney?.08:0) - (negFlow?.08:0) - (giveback>.35?.08:0) - (ageMin>180?.04:0);
  const thesisBroken=live.factors.counterThesisBroken===true || thesisScore<Math.max(.40,directive.minProbability-.20);
  const reasons=[...live.reasons]; const warnings=[...live.warnings];
  if(giveback>=.20) reasons.push(`zirve kâr geri verildi ${pct(giveback*100)}`); if(negMoney) reasons.push('para akışı pozisyona karşı'); if(negFlow) reasons.push('order-flow pozisyona karşı');
  if(ageMin>180) warnings.push('pozisyon uzun süredir açık; tez yeniden doğrulanmalı');
  let action:AgentDecision['action']='HOLD';
  if(thesisBroken && pnl<0) action='EXIT_NOW';
  else if(giveback>=.45 && pnl>0 && (negMoney||negFlow)) action='EXIT_NOW';
  else if(live.probability<.48 && pnl>0 && giveback>=.22) action='EXIT_NOW';
  else if(negMoney&&negFlow&&pnl>0&&live.probability<.58) action='EXIT_NOW';
  return {...live,action,score:clamp(live.score+roe*.10-giveback*22,0,100),reasons,warnings,factors:{...live.factors,pnlUSD:pnl,roePct:roe,giveback:Number(giveback.toFixed(3)),ageMin:Number(ageMin.toFixed(1)),thesisScore:Number(thesisScore.toFixed(3)),thesisBroken}};
}

export function applyCommandToDirective(current:AgentDirective,cmd:AgentCommand):AgentDirective{
  const next:AgentDirective={...current}; if(cmd.strategy) next.strategy=cmd.strategy; if(cmd.side) next.side=cmd.side;
  if(cmd.maxPositions) next.maxPositions=clamp(Math.round(cmd.maxPositions),1,20); if(cmd.confidenceMin) next.minConfidence=clamp(cmd.confidenceMin,50,96);
  if(cmd.riskPerTradePct) next.riskPerTradePct=clamp(cmd.riskPerTradePct,.1,5);
  if(cmd.strategy==='money_flow_only'){next.onlyMoneyFlow=true;next.requireDeepAnalysis=false;next.requireOrderFlowAlignment=false;next.requireTrendAlignment=false;next.requireLiquidityPath=false;next.requirePositiveEV=true;next.antiChop=false;next.minConfidence=Math.min(next.minConfidence,58);next.minProbability=Math.min(next.minProbability,.56);next.maxUncertainty=Math.max(next.maxUncertainty,.50);next.minRiskReward=Math.min(next.minRiskReward,.95);}
  if(cmd.strategy==='deep_analysis'){next.onlyMoneyFlow=false;next.requireDeepAnalysis=true;next.requireOrderFlowAlignment=true;next.requireTrendAlignment=true;next.requireLiquidityPath=true;next.useScenarioEngine=true;next.useCounterThesis=true;}
  if(cmd.strategy==='order_flow') next.requireOrderFlowAlignment=true;
  if(cmd.strategy==='liquidity') next.requireLiquidityPath=true;
  if(cmd.intent==='SET_DIRECTIVE') next.allowEntries=true;
  if(includesAny(cmd.text.toLocaleLowerCase('tr-TR'),['sadece veri yeterliyse','veri sağlamsa','veri saglamsa'])) next.minDataQuality=Math.max(next.minDataQuality,80);
  next.rawText=cmd.text; next.updatedAt=Date.now(); return next;
}

export function describeDirective(d:AgentDirective){
  const f:string[]=[]; if(d.onlyMoneyFlow)f.push('yalnızca para akışı'); if(d.requireDeepAnalysis)f.push('derin analiz'); if(d.requireOrderFlowAlignment)f.push('order-flow');
  if(d.requireTrendAlignment)f.push('trend'); if(d.requireLiquidityPath)f.push('likidite yolu'); if(d.useScenarioEngine)f.push('senaryo');
  return `${d.strategy} | ${f.join(' + ')||'multi-expert ensemble'} | güven ≥ %${d.minConfidence} | olasılık ≥ %${(d.minProbability*100).toFixed(0)} | belirsizlik ≤ %${(d.maxUncertainty*100).toFixed(0)} | R/R ≥ ${d.minRiskReward.toFixed(2)} | max ${d.maxPositions}`;
}

// ======================= Persistent cognitive memory helpers =======================
export interface AgentMemoryEvent { id:string; type:string; symbol?:string; side?:AgentSide; outcome?:number; weight?:number; timestamp:number; meta?:Record<string,unknown>; }
export interface AgentMemoryState { version:number; events:AgentMemoryEvent[]; symbolStats:Record<string,{trades:number;wins:number;pnl:number;avgScore:number}>; strategyStats:Record<string,{trades:number;wins:number;pnl:number}>; updatedAt:number; }

export function createMemoryState():AgentMemoryState{return{version:1,events:[],symbolStats:{},strategyStats:{},updatedAt:Date.now()};}
export function learnFromOutcome(state:AgentMemoryState,event:AgentMemoryEvent){
  state.events.push(event); if(state.events.length>20000)state.events=state.events.slice(-20000); const sym=event.symbol||'UNKNOWN'; const s=state.symbolStats[sym]||{trades:0,wins:0,pnl:0,avgScore:0}; s.trades++; s.wins+=event.outcome&&event.outcome>0?1:0; s.pnl+=num(event.outcome); s.avgScore=(s.avgScore*(s.trades-1)+num(event.meta?.score))/s.trades; state.symbolStats[sym]=s;
  const st=String(event.meta?.strategy||'balanced'); const z=state.strategyStats[st]||{trades:0,wins:0,pnl:0}; z.trades++; z.wins+=event.outcome&&event.outcome>0?1:0; z.pnl+=num(event.outcome); state.strategyStats[st]=z; state.updatedAt=Date.now();
}
export function memoryPrior(state:AgentMemoryState,symbol:string,strategy:string){
  const s=state.symbolStats[symbol]; const st=state.strategyStats[strategy]; let p=.5; if(s&&s.trades>=8)p+=clamp((s.wins/s.trades-.5)*.22,-.11,.11); if(st&&st.trades>=15)p+=clamp((st.wins/st.trades-.5)*.16,-.08,.08); return clamp(p,.35,.65);
}

// ======================= Portfolio / scenario utilities =======================
export function portfolioConflict(decision:AgentDecision,openPositions:LivePosition[]){
  const same=openPositions.filter(p=>p.symbol!==decision.symbol).filter(p=>p.side===decision.side).length;
  const opposite=openPositions.filter(p=>p.symbol!==decision.symbol).filter(p=>p.side!==decision.side).length;
  const conflict=Math.min(1,same*.18+opposite*.12); return {same,opposite,conflict};
}

export function explainDecision(d:AgentDecision){
  return {
    summary:`${d.symbol} ${d.side.toUpperCase()} → ${d.action}`,
    score:Number(d.score.toFixed(1)), probability:Number((d.probability*100).toFixed(1)), confidence:Number(d.confidence.toFixed(1)), uncertainty:Number((d.uncertainty*100).toFixed(1)),
    expectedValue:Number(d.expectedValue.toFixed(4)), riskReward:Number(d.riskReward.toFixed(2)), reasons:d.reasons, warnings:d.warnings,
    regime:d.factors.regime, agreement:d.factors.agreement, dataQuality:d.factors.dataQuality, scenarios:d.scenarios||[]
  };
}
