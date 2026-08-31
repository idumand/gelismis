// ARGOS AI Cognitive Core V6
// Multi-market, portfolio-aware, uncertainty-aware crypto intelligence engine.
// It is deterministic by design and intended to be paired with an LLM for natural
// language interaction. It never exposes hidden chain-of-thought; it emits auditable facts.

export type Side = 'long' | 'short';
export type Regime = 'TREND_UP'|'TREND_DOWN'|'MOMENTUM_UP'|'MOMENTUM_DOWN'|'SQUEEZE'|'EXPANSION'|'MEAN_REVERSION'|'CHOPPY'|'PANIC'|'RECOVERY'|'UNKNOWN';
export type DecisionAction = 'ENTER_NOW'|'ENTER_BETTER'|'WAIT'|'IGNORE'|'EXIT_NOW'|'HOLD';

export interface CognitiveCoin {
  symbol: string;
  price: number;
  change_24h_pct?: number;
  volume_24h_usdt?: number;
  quoteVolume?: number;
  rsi?: number;
  atr?: number;
  atrPct?: number;
  trendScore?: number;
  momentumScore?: number;
  deepScore?: number;
  edgeScore?: number;
  dataQuality?: number;
  targetPathScore?: number;
  selectedRiskReward?: number;
  selectedExpectedValueUSD?: number;
  expectedNetProfitUSD?: number;
  expectedMovePct?: number;
  selectedHitProbabilityPct?: number;
  selectedConfidencePct?: number;
  spreadPct?: number;
  takerBuyRatio?: number;
  netInflowUSD?: number;
  netInflowUSDT?: number;
  inflowMomentum?: number;
  largeTradeScore?: number;
  largeLongUSDT?: number;
  largeShortUSDT?: number;
  liquidityConsumptionScore?: number;
  wallPersistenceScore?: number;
  divergenceScore?: number;
  orderFlowGap?: number;
  obi?: number;
  longAdvantage?: number;
  shortAdvantage?: number;
  longPressure?: number;
  shortPressure?: number;
  fundingRate?: number;
  openInterest?: number;
  openInterestChangePct?: number;
  basisPct?: number;
  liquidationsLongUSD?: number;
  liquidationsShortUSD?: number;
  high_24h?: number;
  low_24h?: number;
  marketRegime?: Regime|string;
  updatedAt?: number;
  [key:string]: unknown;
}

export interface CognitivePosition {
  symbol: string;
  side: Side;
  entryPrice: number;
  currentPrice: number;
  pnlUSD: number;
  roePct: number;
  leverage?: number;
  notionalUSD?: number;
  openedAt?: number;
  peakPnlUSD?: number;
  [key:string]: unknown;
}

export interface CognitivePolicy {
  minScore: number;
  minConfidence: number;
  minProbability: number;
  maxUncertainty: number;
  minRiskReward: number;
  requireFreshDataSec: number;
  antiChop: boolean;
  counterThesis: boolean;
  positiveEV: boolean;
  maxPortfolioHeatPct: number;
  maxCoinHeatPct: number;
  correlationPenalty: number;
  onlyMoneyFlow: boolean;
}

export interface ExpertResult {
  name: string;
  score: number;
  confidence: number;
  reasons: string[];
  warnings: string[];
}

export interface ScenarioResult {
  name: string;
  probability: number;
  payoffBias: number;
  risk: number;
  trigger: string;
}

export interface CognitiveDecision {
  symbol: string;
  side: Side;
  action: DecisionAction;
  score: number;
  probability: number;
  confidence: number;
  uncertainty: number;
  expectedValue: number;
  riskReward: number;
  regime: Regime;
  reasons: string[];
  warnings: string[];
  experts: Record<string, ExpertResult>;
  scenarios: ScenarioResult[];
  factors: Record<string, number|string|boolean>;
  rank?: number;
  generatedAt: number;
}

export interface CognitiveMarketState {
  generatedAt: number;
  universeSize: number;
  liveSymbols: number;
  freshSymbols: number;
  staleSymbols: number;
  positiveBreadthPct: number;
  negativeBreadthPct: number;
  averageChange24h: number;
  averageFlowScore: number;
  averageVolatility: number;
  regimeCounts: Record<string, number>;
  leaders: Array<{symbol:string; side:Side; score:number; probability:number; confidence:number}>;
  laggards: Array<{symbol:string; score:number; reason:string}>;
  portfolio: {
    openPositions: number;
    heatPct: number;
    longExposureUSD: number;
    shortExposureUSD: number;
    concentration: number;
    conflicts: number;
  };
}

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const n=(v:unknown,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const sign=(v:number)=>v>0?1:v<0?-1:0;
const abs=(v:number)=>Math.abs(n(v));

function soft(v:number,scale=1){ return Math.tanh(n(v)/Math.max(1,scale)); }
function pct(v:number){ return `${n(v).toFixed(1)}%`; }
function mean(a:number[]){ return a.length?a.reduce((x,y)=>x+y,0)/a.length:0; }
function stdev(a:number[]){ if(a.length<2)return 0; const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); }

export const DEFAULT_COGNITIVE_POLICY: CognitivePolicy = {
  minScore: 60,
  minConfidence: 64,
  minProbability: .60,
  maxUncertainty: .46,
  minRiskReward: 1.10,
  requireFreshDataSec: 8,
  antiChop: true,
  counterThesis: true,
  positiveEV: true,
  maxPortfolioHeatPct: 6,
  maxCoinHeatPct: 2,
  correlationPenalty: .35,
  onlyMoneyFlow: false,
};

export class CognitiveMemory {
  private bySymbol = new Map<string,{samples:number; wins:number; pnl:number; avgScore:number; last:number}>();
  private byRegime = new Map<string,{samples:number; wins:number; pnl:number}>();
  private byStrategy = new Map<string,{samples:number; wins:number; pnl:number}>();

  learn(symbol:string, regime:string, strategy:string, outcome:number, score:number){
    const up=(m:Map<string,any>,key:string)=>{ const x=m.get(key)||{samples:0,wins:0,pnl:0,avgScore:0,last:0}; x.samples++; x.wins+=outcome>0?1:0; x.pnl+=outcome; x.avgScore += (score-x.avgScore)/x.samples; x.last=Date.now(); m.set(key,x); };
    up(this.bySymbol,symbol); up(this.byRegime,regime); up(this.byStrategy,strategy);
  }

  prior(symbol:string, regime:string, strategy:string){
    const s=this.bySymbol.get(symbol), r=this.byRegime.get(regime), st=this.byStrategy.get(strategy);
    const win=(x:any)=>x&&x.samples?x.wins/x.samples:.5;
    const sample=(s?.samples||0)+(r?.samples||0)+(st?.samples||0);
    return {symbolPrior:win(s),regimePrior:win(r),strategyPrior:win(st),sampleCount:sample, pnl:(s?.pnl||0)+(r?.pnl||0)+(st?.pnl||0)};
  }

  export(){ return {bySymbol:[...this.bySymbol],byRegime:[...this.byRegime],byStrategy:[...this.byStrategy]}; }
  import(raw:any){
    for(const [k,v] of raw?.bySymbol||[]) this.bySymbol.set(k,v);
    for(const [k,v] of raw?.byRegime||[]) this.byRegime.set(k,v);
    for(const [k,v] of raw?.byStrategy||[]) this.byStrategy.set(k,v);
  }
}

function regimeOf(c:CognitiveCoin):Regime{
  const ch=n(c.change_24h_pct), trend=n(c.trendScore), mom=n(c.momentumScore), atr=n(c.atrPct||c.atr && c.price ? n(c.atr)/n(c.price)*100 : 0), rsi=n(c.rsi,50);
  if(ch<=-12 && mom<-35) return 'PANIC';
  if(ch>=2 && mom>35 && trend>15) return 'MOMENTUM_UP';
  if(ch<=-2 && mom<-35 && trend<-15) return 'MOMENTUM_DOWN';
  if(Math.abs(trend)>28 && Math.abs(mom)<22) return trend>0?'TREND_UP':'TREND_DOWN';
  if(atr>4.5 && Math.abs(mom)>45) return 'EXPANSION';
  if(atr<0.7 && Math.abs(mom)<12) return 'SQUEEZE';
  if(Math.abs(trend)<10 && Math.abs(mom)<15) return 'CHOPPY';
  if(ch>0 && trend>0 && rsi<58) return 'RECOVERY';
  if(Math.abs(rsi-50)>18 && sign(trend)!==sign(rsi-50)) return 'MEAN_REVERSION';
  return 'UNKNOWN';
}

function expertMoney(c:CognitiveCoin, side:Side):ExpertResult{
  const flow=n(c.netInflowUSDT??c.netInflowUSD), mom=n(c.inflowMomentum), large=n(c.largeTradeScore), taker=(n(c.takerBuyRatio,.5)-.5)*200;
  const raw=side==='long' ? .46*soft(flow,5e6)*100 + .26*soft(mom,20)*100 + .18*soft(large,25)*100 + .10*taker : -.46*soft(flow,5e6)*100 - .26*soft(mom,20)*100 - .18*soft(large,25)*100 - .10*taker;
  const score=clamp(50+raw/2,0,100);
  return {name:'money-flow',score,confidence:clamp(55+abs(raw)*.35,55,98),reasons:[flow>0?`Net para girişi ${flow.toLocaleString('tr-TR')} USDT`:'Net para çıkışı gözleniyor',`${large>0?'Büyük işlemler alıcı':'Büyük işlemler satıcı'} baskılı`],warnings: flow===0?['Para akışı örneklemi zayıf']:[]};
}

function expertFlow(c:CognitiveCoin, side:Side):ExpertResult{
  const gap=n(c.orderFlowGap), obi=n(c.obi), cons=n(c.liquidityConsumptionScore), wall=n(c.wallPersistenceScore);
  const raw=side==='long'?gap*.9+obi*.55+cons*.35-wall*.15:-gap*.9-obi*.55-cons*.35+wall*.15;
  return {name:'order-flow',score:clamp(50+raw*.42,0,100),confidence:clamp(60+abs(raw)*.45,60,97),reasons:[`Order-flow gap ${gap.toFixed(1)}`,`Book imbalance ${obi.toFixed(2)}`,`Likidite tüketimi ${cons.toFixed(1)}`],warnings:Math.abs(gap)<3?['Order-flow yönü zayıf']:[]};
}

function expertTrend(c:CognitiveCoin, side:Side):ExpertResult{
  const t=n(c.trendScore), m=n(c.momentumScore), r=n(c.rsi,50), ch=n(c.change_24h_pct);
  const raw=side==='long'?t*.55+m*.35+(r-50)*.25+ch*1.3:-t*.55-m*.35-(r-50)*.25-ch*1.3;
  return {name:'trend-momentum',score:clamp(50+raw*1.15,0,100),confidence:clamp(58+abs(raw)*.4,58,95),reasons:[`Trend ${t.toFixed(1)}`,`Momentum ${m.toFixed(1)}`,`RSI ${r.toFixed(1)}`],warnings:(side==='long'&&r>78)||(side==='short'&&r<22)?['Aşırı bölge riski']:[]};
}

function expertLiquidity(c:CognitiveCoin, side:Side):ExpertResult{
  const path=n(c.targetPathScore), rr=n(c.selectedRiskReward), ev=n(c.selectedExpectedValueUSD??c.expectedNetProfitUSD), res=side==='long'?n(c.shortPressure):n(c.longPressure);
  const score=clamp(.5*path+.25*(100-clamp(res,0,100))+.25*clamp(50+rr*22+ev*12,0,100),0,100);
  return {name:'liquidity-path',score,confidence:clamp(55+Math.abs(score-50)*.65,55,98),reasons:[`Hedef yol skoru ${path.toFixed(1)}`,`Risk/getiri ${rr.toFixed(2)}`,`Beklenen değer ${ev.toFixed(2)}`],warnings:rr<1?['Risk/getiri zayıf']:[]};
}

function expertCrowding(c:CognitiveCoin, side:Side):ExpertResult{
  const funding=n(c.fundingRate), oi=n(c.openInterestChangePct), basis=n(c.basisPct);
  const pressure=side==='long'?(funding*1000+oi*0.6+basis*2):-(funding*1000+oi*0.6+basis*2);
  const crowd=Math.abs(pressure);
  const score=clamp(72-crowd*.75,25,90);
  return {name:'crowding',score,confidence:clamp(50+crowd*.7,50,94),reasons:[`Funding ${funding.toFixed(5)}`,`OI değişimi ${oi.toFixed(2)}%`,`Basis ${basis.toFixed(3)}%`],warnings:crowd>28?['Crowding / squeeze riski']:[]};
}

function expertVolatility(c:CognitiveCoin, side:Side):ExpertResult{
  const atr=n(c.atrPct||c.atr && c.price?n(c.atr)/n(c.price)*100:0), move=n(c.expectedMovePct), spread=n(c.spreadPct)*100;
  const capacity=clamp(move/(atr*1.8+0.05),0,2);
  const score=clamp(60+capacity*24-spread*90,20,96);
  return {name:'volatility',score,confidence:clamp(58+Math.abs(capacity-1)*22,58,95),reasons:[`ATR %${atr.toFixed(2)}`,`Beklenen hareket %${move.toFixed(2)}`,`Spread %${spread.toFixed(3)}`],warnings:spread>0.03?['Spread yükseliyor']:[]};
}

function expertRelative(c:CognitiveCoin, universe:CognitiveCoin[], side:Side):ExpertResult{
  const chs=universe.map(x=>n(x.change_24h_pct)).filter(Number.isFinite), flows=universe.map(x=>n(x.netInflowUSDT??x.netInflowUSD));
  const z=(v:number,a:number[])=>{const s=stdev(a);return s?clamp((v-mean(a))/s,-3,3):0};
  const chZ=z(n(c.change_24h_pct),chs), flowZ=z(n(c.netInflowUSDT??c.netInflowUSD),flows);
  const raw=side==='long'?chZ*18+flowZ*14:-chZ*18-flowZ*14;
  return {name:'relative-strength',score:clamp(50+raw,0,100),confidence:clamp(55+Math.abs(raw)*.8,55,97),reasons:[`Göreceli güç z=${chZ.toFixed(2)}`,`Akış z=${flowZ.toFixed(2)}`],warnings:Math.abs(chZ)<.25?['Evrene göre üstünlük zayıf']:[]};
}

function expertDataQuality(c:CognitiveCoin, now:number, policy:CognitivePolicy):ExpertResult{
  const age=Math.max(0,(now-n(c.updatedAt||0))/1000), quality=clamp(n(c.dataQuality, age<=policy.requireFreshDataSec?85:35),0,100);
  return {name:'data-quality',score:quality,confidence:quality,reasons:[`Veri yaşı ${age.toFixed(1)} sn`,`Kalite ${quality.toFixed(0)}`],warnings:age>policy.requireFreshDataSec?['Canlı veri gecikmiş']:[]};
}

function counterThesis(experts:Record<string,ExpertResult>, side:Side):number{
  const money=experts['money-flow']?.score||50, flow=experts['order-flow']?.score||50, trend=experts['trend-momentum']?.score||50, liq=experts['liquidity-path']?.score||50;
  const supports=[money,flow,trend,liq]; const opposite=supports.map(x=>100-x);
  return clamp(mean(opposite)-mean(supports),-50,50);
}

function scenarioPack(decision:{side:Side;score:number;probability:number;uncertainty:number;regime:Regime}, c:CognitiveCoin):ScenarioResult[]{
  const p=clamp(decision.probability,0.05,.95), u=clamp(decision.uncertainty,0,1);
  const move=abs(n(c.expectedMovePct)), rr=abs(n(c.selectedRiskReward));
  const favorable=clamp(p*(1-u*.35),.05,.92);
  const adverse=clamp((1-p)+u*.25,.06,.85);
  const chop=clamp(1-favorable-adverse,.03,.4);
  return [
    {name:'Tez çalışıyor',probability:favorable,payoffBias:move*(rr||1),risk:1-u,trigger:'Akış + trend + likidite aynı yönde kalır'},
    {name:'Tez bozuluyor',probability:adverse,payoffBias:-Math.max(move*.6,0.2),risk:u+.35,trigger:'Karşı akış güçlenir veya hedef yolu kapanır'},
    {name:'Yatay / gürültü',probability:chop,payoffBias:-Math.min(move*.25,1),risk:.55,trigger:'Uzmanlar ayrışır, volatilite sıkışır'},
  ];
}

function correlationPenalty(symbol:string, side:Side, positions:CognitivePosition[], universe:CognitiveCoin[]):number{
  if(!positions.length)return 0;
  const c=universe.find(x=>x.symbol===symbol); if(!c)return 0;
  let penalty=0;
  const flow=n(c.netInflowUSDT??c.netInflowUSD), trend=n(c.trendScore);
  for(const p of positions){
    const pc=universe.find(x=>x.symbol===p.symbol); if(!pc)continue;
    const pf=n(pc.netInflowUSDT??pc.netInflowUSD), pt=n(pc.trendScore);
    const corr=clamp(.5*sign(flow)*sign(pf)+.5*sign(trend)*sign(pt),-1,1);
    if(corr>0.5 && p.side===side) penalty += .18;
    if(corr<-0.5 && p.side!==side) penalty += .08;
  }
  return clamp(penalty,0,.8);
}

export class ArgosCognitiveCoreV6 {
  readonly version='ARGOS-V6-CORTEX';
  readonly memory=new CognitiveMemory();
  private lastState: CognitiveMarketState | null = null;
  private decisionMap=new Map<string,CognitiveDecision>();

  analyzeCoin(c:CognitiveCoin, universe:CognitiveCoin[], positions:CognitivePosition[]=[], policy:CognitivePolicy=DEFAULT_COGNITIVE_POLICY, now=Date.now()):CognitiveDecision[] {
    const regime=regimeOf(c);
    const out: CognitiveDecision[]=[];
    for(const side of ['long','short'] as Side[]){
      const experts:Record<string,ExpertResult>={
        'money-flow':expertMoney(c,side),
        'order-flow':expertFlow(c,side),
        'trend-momentum':expertTrend(c,side),
        'liquidity-path':expertLiquidity(c,side),
        'crowding':expertCrowding(c,side),
        'volatility':expertVolatility(c,side),
        'relative-strength':expertRelative(c,universe,side),
        'data-quality':expertDataQuality(c,now,policy),
      };
      const weights=policy.onlyMoneyFlow
        ? {'money-flow':.76,'order-flow':.05,'trend-momentum':.02,'liquidity-path':.03,'crowding':.04,'volatility':.03,'relative-strength':.05,'data-quality':.02}
        : {'money-flow':.18,'order-flow':.17,'trend-momentum':.15,'liquidity-path':.18,'crowding':.08,'volatility':.08,'relative-strength':.10,'data-quality':.06};
      const base=Object.entries(weights).reduce((s,[k,w])=>s+(experts[k]?.score||50)*w,0);
      const agreement=1-clamp(stdev(Object.values(experts).map(x=>x.score))/28,0,.75);
      const cq=this.memory.prior(c.symbol,regime,'balanced');
      const prior=clamp((cq.symbolPrior*.45+cq.regimePrior*.30+cq.strategyPrior*.25),.25,.75);
      const penalty=correlationPenalty(c.symbol,side,positions,universe);
      const thesis=counterThesis(experts,side);
      const rr=n(c.selectedRiskReward);
      const ev=n(c.selectedExpectedValueUSD??c.expectedNetProfitUSD);
      const quality=experts['data-quality'].score/100;
      const probability=clamp((base/100)*.72+prior*.12+agreement*.08+clamp(ev>0?0.06:-0.08,-.08,.06)+quality*.08-penalty*.12,0.03,.97);
      const uncertainty=clamp(.46*(1-quality)+.24*(1-agreement)+.18*(Math.abs(thesis)/50)+.12*penalty,0,.9);
      const confidence=clamp(52+agreement*28+quality*18-Math.abs(thesis)*.12-penalty*22,35,98);
      const score=clamp(probability*68+confidence*.22+(rr>0?clamp(rr/3,0,1)*10:0)+(ev>0?4:-7)-uncertainty*25,0,100);
      const reasons:string[]=[]; const warnings:string[]=[];
      const sortedExperts=Object.values(experts).sort((a,b)=>b.score-a.score);
      reasons.push(`Rejim ${regime}`,`En güçlü uzman: ${sortedExperts[0]?.name || 'yok'} %${sortedExperts[0]?.score.toFixed(0)}`);
      reasons.push(...sortedExperts.slice(0,3).flatMap(x=>x.reasons.slice(0,1)));
      for(const x of Object.values(experts)) warnings.push(...x.warnings);
      if(policy.counterThesis && thesis>18) warnings.push(`Karşı-tez belirgin: ${thesis.toFixed(1)}`);
      if(policy.antiChop && regime==='CHOPPY') warnings.push('Piyasa chop/kararsız; giriş kalitesi düşürülüyor');
      if(policy.positiveEV && ev<=0) warnings.push('Beklenen değer pozitif değil');
      if(rr>0 && rr<policy.minRiskReward) warnings.push(`R/R ${rr.toFixed(2)} minimum ${policy.minRiskReward.toFixed(2)} altında`);
      if(uncertainty>policy.maxUncertainty) warnings.push(`Belirsizlik %${(uncertainty*100).toFixed(0)} yüksek`);
      const scenarios=scenarioPack({side,score,probability,uncertainty,regime},c);
      const fresh=(now-n(c.updatedAt||0))/1000<=policy.requireFreshDataSec;
      const moneyDirection = side==='long' ? n(c.netInflowUSDT??c.netInflowUSD) > 0 : n(c.netInflowUSDT??c.netInflowUSD) < 0;
      const moneyQuality = experts['money-flow'].score >= (policy.onlyMoneyFlow ? 58 : 0);
      const moneyEntry = policy.onlyMoneyFlow && moneyDirection && moneyQuality && fresh && quality>=.45 && uncertainty<=Math.max(policy.maxUncertainty,.50) && (!policy.positiveEV || ev>=0) && (!rr || rr>=Math.max(.8,policy.minRiskReward));
      let action:DecisionAction='IGNORE';
      if(moneyEntry) action='ENTER_NOW';
      else if(!fresh || quality<.45) action='WAIT';
      else if(policy.antiChop && regime==='CHOPPY' && score<86) action='WAIT';
      else if(policy.positiveEV && ev<=0) action='WAIT';
      else if(rr>0 && rr<policy.minRiskReward) action='WAIT';
      else if(confidence>=policy.minConfidence && probability>=policy.minProbability && uncertainty<=policy.maxUncertainty && score>=policy.minScore && thesis<=18) action='ENTER_NOW';
      else if(confidence>=policy.minConfidence-6 && probability>=policy.minProbability-.05 && uncertainty<=policy.maxUncertainty+.08 && score>=policy.minScore-6) action='ENTER_BETTER';
      else action='IGNORE';
      out.push({symbol:c.symbol,side,action,score,probability,confidence,uncertainty,expectedValue:ev,riskReward:rr,regime,reasons:[...new Set(reasons)].slice(0,10),warnings:[...new Set(warnings)].slice(0,10),experts,scenarios,factors:{agreement,quality,correlationPenalty:penalty,counterThesis:thesis,memoryPrior:prior,regime},generatedAt:now});
    }
    out.sort((a,b)=>b.score-a.score);
    if(out[0]) this.decisionMap.set(`${c.symbol}:${out[0].side}`,out[0]);
    return out;
  }

  analyzeUniverse(coins:CognitiveCoin[], positions:CognitivePosition[]=[], policy:CognitivePolicy=DEFAULT_COGNITIVE_POLICY, top=50, now=Date.now()):CognitiveDecision[]{
    const live=coins.filter(x=>x.price>0);
    const all:CognitiveDecision[]=[];
    for(const c of live) all.push(...this.analyzeCoin(c,live,positions,policy,now));
    all.sort((a,b)=>b.score-a.score);
    const seen=new Set<string>();
    const unique=all.filter(x=>{if(seen.has(x.symbol))return false;seen.add(x.symbol);return true;});
    unique.forEach((x,i)=>x.rank=i+1);
    this.lastState=this.buildState(live,unique,positions,now);
    return unique.slice(0,top);
  }

  buildState(coins:CognitiveCoin[], ranked:CognitiveDecision[], positions:CognitivePosition[], now=Date.now()):CognitiveMarketState{
    const ch=coins.map(x=>n(x.change_24h_pct));
    const flow=coins.map(x=>n(x.netInflowUSDT??x.netInflowUSD));
    const vol=coins.map(x=>n(x.atrPct||x.atr && x.price?n(x.atr)/n(x.price)*100:0)).filter(x=>x>0);
    const regimes:Record<string,number>={}; for(const c of coins){const r=String(regimeOf(c));regimes[r]=(regimes[r]||0)+1;}
    const long=positions.filter(x=>x.side==='long').reduce((s,x)=>s+n(x.notionalUSD||Math.abs(x.pnlUSD)),0);
    const sh=positions.filter(x=>x.side==='short').reduce((s,x)=>s+n(x.notionalUSD||Math.abs(x.pnlUSD)),0);
    const heat=positions.reduce((s,x)=>s+Math.abs(n(x.roePct))*0.05,0);
    return {generatedAt:now,universeSize:coins.length,liveSymbols:coins.filter(x=>x.price>0).length,freshSymbols:coins.filter(x=>(now-n(x.updatedAt||0))/1000<=8).length,staleSymbols:coins.filter(x=>(now-n(x.updatedAt||0))/1000>8).length,positiveBreadthPct:coins.length?ch.filter(x=>x>0).length/coins.length*100:0,negativeBreadthPct:coins.length?ch.filter(x=>x<0).length/coins.length*100:0,averageChange24h:mean(ch),averageFlowScore:flow.length?mean(flow):0,averageVolatility:mean(vol),regimeCounts:regimes,leaders:ranked.slice(0,8).map(x=>({symbol:x.symbol,side:x.side,score:Number(x.score.toFixed(1)),probability:Number(x.probability.toFixed(3)),confidence:Number(x.confidence.toFixed(1))})),laggards:ranked.slice(-5).map(x=>({symbol:x.symbol,score:Number(x.score.toFixed(1)),reason:x.warnings[0]||'Zayıf bileşik sinyal'})),portfolio:{openPositions:positions.length,heatPct:Number(heat.toFixed(2)),longExposureUSD:long,shortExposureUSD:sh,concentration:positions.length?1/Math.min(positions.length,8):0,conflicts:0}};
  }

  positionReview(position:CognitivePosition, coin:CognitiveCoin, universe:CognitiveCoin[], policy:CognitivePolicy=DEFAULT_COGNITIVE_POLICY, now=Date.now()):CognitiveDecision{
    const coinDecision=this.analyzeCoin(coin,universe,[position],policy,now).find(x=>x.side===position.side) || this.analyzeCoin(coin,universe,[position],policy,now)[0];
    const directionPnL=position.side==='long'?n(position.currentPrice)-n(position.entryPrice):n(position.entryPrice)-n(position.currentPrice);
    const peak=n(position.peakPnlUSD); const erosion=peak>0?clamp(1-n(position.pnlUSD/peak),0,1):0;
    const momentumRisk=coinDecision ? (coinDecision.probability<.5 || coinDecision.uncertainty>.5) : true;
    const score=clamp((coinDecision?.score||50)-erosion*22-(momentumRisk?18:0)+(directionPnL>0?5:-5),0,100);
    const exit=directionPnL<0 && momentumRisk && n(position.pnlUSD)<0 || erosion>.45 || (coinDecision?.action==='IGNORE'&&n(position.pnlUSD)>0);
    return {...(coinDecision||{symbol:position.symbol,side:position.side,action:'HOLD',score:50,probability:.5,confidence:50,uncertainty:.5,expectedValue:0,riskReward:0,regime:'UNKNOWN',reasons:[],warnings:[],experts:{},scenarios:[],factors:{},generatedAt:now}), action:exit?'EXIT_NOW':'HOLD', score, reasons:[...(coinDecision?.reasons||[]),`Pozisyon PnL $${n(position.pnlUSD).toFixed(2)}`,`Kâr erimesi %${(erosion*100).toFixed(1)}`], warnings:[...(coinDecision?.warnings||[]),...(exit?['Pozisyon tezi zayıflıyor']:[])],generatedAt:now};
  }

  state(){ return this.lastState; }
  snapshot(){ return {version:this.version,state:this.lastState,decisions:[...this.decisionMap.values()].slice(-500)}; }
}
