// ARGOS Adaptive Learning AI v2
// Explainable ensemble: learned probability + deterministic market quality prior.
// It is intentionally conservative: learning never bypasses hard safety gates.

export interface AIFeatureVector {
  edge: number;
  path: number;
  flowGap: number;
  inflow: number;
  largeMoney: number;
  liquidityConsumption: number;
  movement: number;
  dataQuality: number;
  targetConfidence: number;
  spread: number;
  volatility: number;
  urgency: number;
  dominance: number;
  resistance: number;
  riskReward: number;
  expectedValue: number;
  volumeImpulse: number;
  divergence: number;
  bookDepthQuality: number;
  trendAlignment: number;
  regimeQuality: number;
  signalAgreement: number;
  targetEfficiency: number;
  tradeSizeQuality: number;
}

export interface AITradeSample extends AIFeatureVector {
  id: number | string;
  symbol: string;
  side: 'long' | 'short';
  label: 0 | 1;
  pnl: number;
  timestamp: number;
}

export interface AIModelState {
  version: number;
  weights: number[];
  bias: number;
  mean: number[];
  scale: number[];
  trainedSamples: number;
  brier: number | null;
  threshold: number;
  updatedAt: number | null;
}

export interface AIDecision {
  probability: number;
  learnedProbability: number;
  rulePrior: number;
  confidence: number;
  uncertainty: number;
  score: number;
  action: 'ENTER_NOW' | 'ENTER_BETTER' | 'WATCH' | 'IGNORE';
  reasons: string[];
}

const FEATURE_NAMES = [
  'edge','path','flowGap','inflow','largeMoney','liquidityConsumption','movement','dataQuality',
  'targetConfidence','spread','volatility','urgency','dominance','resistance','riskReward','expectedValue',
  'volumeImpulse','divergence','bookDepthQuality','trendAlignment','regimeQuality','signalAgreement',
  'targetEfficiency','tradeSizeQuality'
] as const;

const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const sigmoid = (x:number)=>1/(1+Math.exp(-clamp(x,-30,30)));
const finite = (v:any,d=0)=>Number.isFinite(Number(v)) ? Number(v) : d;
const normPct = (v:number, max:number) => clamp(v, 0, max) / Math.max(max, 1);

export function extractAIFeatures(metric:any, urgency=50, side:'long'|'short'='long'): AIFeatureVector {
  const sign = side === 'short' ? -1 : 1;
  const flowGap = finite(metric?.orderFlowGap);
  const dominance = finite(side === 'long' ? metric?.longDominanceScore ?? metric?.longAdvantage : metric?.shortDominanceScore ?? metric?.shortAdvantage);
  const resistance = finite(side === 'long' ? metric?.longResistanceScore ?? metric?.selectedResistanceScore : metric?.shortResistanceScore ?? metric?.selectedResistanceScore);
  const directionalFlow = sign * finite(metric?.inflowMomentum);
  const directionalLarge = sign * finite(metric?.largeTradeScore);
  const directionalConsumption = sign * finite(metric?.liquidityConsumptionScore);
  const expectedValue = finite(metric?.[side === 'long' ? 'longExpectedValueUSD' : 'shortExpectedValueUSD'] ?? metric?.selectedExpectedValueUSD);
  const rr = finite(metric?.[side === 'long' ? 'longRiskReward' : 'shortRiskReward'] ?? metric?.selectedRiskReward);
  const hit = finite(metric?.[side === 'long' ? 'longHitProbabilityPct' : 'shortHitProbabilityPct'] ?? metric?.selectedHitProbabilityPct ?? metric?.targetConfidence);
  const move = finite(metric?.[side === 'long' ? 'longMovementPotentialPct' : 'shortMovementPotentialPct'] ?? metric?.movementPotentialPct);
  const emaBias = finite(metric?.ema9) && finite(metric?.ema21) && finite(metric?.currentPrice)
    ? ((finite(metric.ema9) / Math.max(1e-12, finite(metric.ema21)) - 1) * 9000)
    : 0;
  const rsiBias = (finite(metric?.rsi, 50) - 50) * 2;
  const trend = sign * clamp(finite(metric?.trendScore ?? metric?.priceTrendScore ?? metric?.momentumScore) || (emaBias * 0.65 + rsiBias * 0.35), -100, 100);
  const volumeImpulse = finite(metric?.volumeRatio ?? 1) - 1;
  const dataQuality = clamp(finite(metric?.dataQuality), 0, 100);
  const spread = clamp(finite(metric?.spreadPct), 0, 0.02);
  const volatility = clamp(finite(metric?.atrPct ?? metric?.volatilityPct ?? metric?.stdDev * 100), 0, 20);
  const targetEfficiency = move > 0 ? clamp(finite(metric?.targetPathScore, 0) / 100 * Math.min(1, Math.max(0, move / Math.max(0.25, volatility))), 0, 1) : 0;
  const depthQuality = clamp((finite(metric?.nearOpp) + finite(metric?.deepOpp)) / Math.max(1, finite(metric?.p50TradeUSD, 1) * 12), 0, 1);
  const chopPenalty = clamp((volatility / 20) * (1 - normPct(Math.abs(trend), 100)) * 0.45, 0, 0.45);
  const regimeQuality = clamp(
    0.35 * normPct(Math.abs(trend), 100) +
    0.25 * normPct(Math.abs(directionalFlow), 100) +
    0.20 * normPct(Math.abs(directionalConsumption), 100) +
    0.20 * normPct(Math.abs(finite(metric?.divergenceScore)), 100) - chopPenalty,
    0, 1
  );
  const signalAgreement = clamp(
    (0.28 * normPct(Math.abs(flowGap), 100)) +
    (0.24 * clamp(dominance / 100, 0, 1)) +
    (0.20 * clamp(hit / 100, 0, 1)) +
    (0.18 * clamp(1 - resistance / 100, 0, 1)) +
    (0.10 * dataQuality / 100),
    0, 1
  );

  return {
    edge: clamp(finite(metric?.edgeScore), -100, 100) / 100,
    path: clamp(finite(metric?.targetPathScore), 0, 100) / 100,
    flowGap: sign * clamp(flowGap, -100, 100) / 100,
    inflow: directionalFlow / 100,
    largeMoney: directionalLarge / 100,
    liquidityConsumption: directionalConsumption / 100,
    movement: normPct(move, 20),
    dataQuality: dataQuality / 100,
    targetConfidence: clamp(hit, 0, 100) / 100,
    spread: spread / 0.02,
    volatility: volatility / 20,
    urgency: clamp(finite(urgency, 50), 0, 100) / 100,
    dominance: clamp(dominance, 0, 100) / 100,
    resistance: clamp(resistance, 0, 100) / 100,
    riskReward: clamp(rr, 0, 8) / 8,
    expectedValue: clamp(expectedValue, -10, 10) / 10,
    volumeImpulse: clamp(volumeImpulse, -2, 3) / 3,
    divergence: sign * clamp(finite(metric?.divergenceScore), -100, 100) / 100,
    bookDepthQuality: depthQuality,
    trendAlignment: clamp(trend, -100, 100) / 100,
    regimeQuality,
    signalAgreement,
    targetEfficiency,
    tradeSizeQuality: clamp(finite(metric?.p50TradeUSD, 0) > 0 ? Math.min(1, finite(metric?.p50TradeUSD) / Math.max(1, finite(metric?.notionalReference, 1))) : 0.5, 0, 1),
  };
}

function vector(s:AIFeatureVector){ return FEATURE_NAMES.map(k=>finite((s as any)[k])); }

function rulePrior(sample:AIFeatureVector){
  const directional =
    0.16 * sample.edge +
    0.14 * ((sample.path * 2) - 1) +
    0.15 * sample.flowGap +
    0.10 * sample.inflow +
    0.08 * sample.largeMoney +
    0.08 * sample.liquidityConsumption +
    0.08 * (((sample.targetConfidence * 2) - 1)) +
    0.06 * (((sample.signalAgreement * 2) - 1)) +
    0.05 * (((sample.regimeQuality * 2) - 1)) +
    0.05 * (((sample.targetEfficiency * 2) - 1)) +
    0.06 * (((sample.riskReward * 2) - 1));
  const penalties =
    0.10 * sample.resistance +
    0.08 * sample.spread +
    0.05 * (1 - sample.dataQuality) +
    0.05 * Math.max(0, -sample.expectedValue) +
    0.04 * sample.volatility * (1 - sample.regimeQuality);
  return clamp(0.50 + directional * 0.46 - penalties, 0.05, 0.95);
}

export class AdaptiveLogisticAI {
  state: AIModelState;
  private learningRate = 0.035;
  private l2 = 0.0015;

  constructor(saved?:Partial<AIModelState>) {
    const n=FEATURE_NAMES.length;
    const legacy = Array.isArray(saved?.weights) ? saved!.weights.map(v=>finite(v,0)) : [];
    const legacyMean = Array.isArray(saved?.mean) ? saved!.mean.map(v=>finite(v,0.5)) : [];
    const legacyScale = Array.isArray(saved?.scale) ? saved!.scale.map(v=>Math.max(0.01,finite(v,0.25))) : [];
    const sourceVersion = Number(saved?.version || 1);
    const legacyState = sourceVersion < 2;
    this.state = {
      version: 2,
      weights: Array.from({length:n},(_,i)=>legacy[i] ?? 0),
      bias: finite(saved?.bias),
      mean: Array.from({length:n},(_,i)=>legacyMean[i] ?? 0.5),
      scale: Array.from({length:n},(_,i)=>legacyScale[i] ?? 0.25),
      trainedSamples: legacyState ? 0 : Number(saved?.trainedSamples || 0),
      brier: legacyState ? null : (saved?.brier ?? null),
      threshold: legacyState ? 0.5 : clamp(finite(saved?.threshold, 0.5), 0.40, 0.80),
      updatedAt: legacyState ? null : (saved?.updatedAt ?? null),
    };
  }

  private norm(x:number[], mean=this.state.mean, scale=this.state.scale){ return x.map((v,i)=>(v-mean[i])/Math.max(scale[i],0.01)); }

  predict(sample:AIFeatureVector){
    const z=this.norm(vector(sample));
    const score=this.state.bias + z.reduce((s,v,i)=>s+v*this.state.weights[i],0);
    return sigmoid(score);
  }

  predictDetailed(sample:AIFeatureVector): AIDecision {
    const learned = this.predict(sample);
    const prior = rulePrior(sample);
    const learnedMaturity = clamp(this.state.trainedSamples / 200, 0, 1);
    const learnedWeight = 0.22 + 0.40 * learnedMaturity;
    const priorWeight = 1 - learnedWeight;
    const disagreement = Math.abs(learned - prior);
    const dataPenalty = (1 - sample.dataQuality) * 0.32;
    const maturityPenalty = (1 - learnedMaturity) * 0.12;
    const uncertainty = clamp(0.16 + disagreement * (0.25 + 0.30 * learnedMaturity) + dataPenalty + maturityPenalty + sample.spread * 0.10, 0.05, 0.72);
    const ensemble = clamp(learnedWeight * learned + priorWeight * prior, 0.02, 0.98);
    const confidence = clamp(
      100 * (
        0.24 * sample.dataQuality +
        0.20 * sample.signalAgreement +
        0.16 * sample.path +
        0.12 * sample.targetConfidence +
        0.10 * (1-sample.resistance) +
        0.08 * sample.regimeQuality +
        0.06 * sample.targetEfficiency +
        0.04 * sample.riskReward
      ), 0, 100
    );
    const score = clamp(ensemble * 100 + confidence * 0.18 - uncertainty * 22 - sample.spread * 8, 0, 100);
    const threshold = clamp(Number(this.state.threshold || 0.5), 0.40, 0.80);
    const minData = sample.dataQuality >= 0.70 && sample.signalAgreement >= 0.52;
    const positiveEconomics = sample.expectedValue > 0.01 && sample.riskReward >= 0.18;
    const action: AIDecision['action'] =
      !minData || uncertainty > 0.55 ? 'IGNORE' :
      ensemble >= Math.max(threshold, 0.66) && confidence >= 68 && positiveEconomics ? 'ENTER_NOW' :
      ensemble >= Math.max(0.58, threshold - 0.04) && confidence >= 58 && sample.path >= 0.60 ? 'ENTER_BETTER' :
      ensemble >= 0.50 ? 'WATCH' : 'IGNORE';

    const reasons:string[]=[];
    if(sample.flowGap > 0.18) reasons.push('yönlü order-flow üstün');
    if(sample.inflow > 0.12) reasons.push('para akışı destekliyor');
    if(sample.largeMoney > 0.12) reasons.push('büyük işlem akışı destekliyor');
    if(sample.path >= 0.68) reasons.push('hedef likidite yolu güçlü');
    if(sample.resistance >= 0.58) reasons.push('karşı likidite direnci yüksek');
    if(sample.spread >= 0.55) reasons.push('spread yürütme kalitesini düşürüyor');
    if(sample.dataQuality < 0.80) reasons.push('veri kalitesi tam değil');
    if(uncertainty >= 0.40) reasons.push('model belirsizliği yüksek');
    if(!positiveEconomics) reasons.push('beklenen değer/RR yeterince güçlü değil');

    return {
      probability: ensemble,
      learnedProbability: learned,
      rulePrior: prior,
      confidence,
      uncertainty,
      score,
      action,
      reasons,
    };
  }

  private fitStats(samples:AITradeSample[]){
    const xs=samples.map(vector), n=FEATURE_NAMES.length;
    const mean=Array(n).fill(0), scale=Array(n).fill(0);
    xs.forEach(x=>x.forEach((v,i)=>mean[i]+=v));
    for(let i=0;i<n;i++) mean[i]/=Math.max(1,xs.length);
    xs.forEach(x=>x.forEach((v,i)=>scale[i]+=(v-mean[i])**2));
    for(let i=0;i<n;i++) scale[i]=Math.max(Math.sqrt(scale[i]/Math.max(1,xs.length)),0.01);
    return {mean,scale};
  }

  private train(samples:AITradeSample[], initial?:AdaptiveLogisticAI){
    const {mean,scale}=this.fitStats(samples);
    const m=this.state;
    m.mean=mean; m.scale=scale;
    if(initial){ m.weights=initial.state.weights.slice(); m.bias=initial.state.bias; }
    for(let epoch=0;epoch<100;epoch++){
      const shuffled=samples.slice();
      for(let j=shuffled.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1)); [shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
      for(const s of shuffled){
        const z=this.norm(vector(s));
        const p=this.predict(s);
        const err=p-s.label;
        m.bias -= this.learningRate*err;
        z.forEach((v,i)=>{ m.weights[i] = m.weights[i]*(1-this.learningRate*this.l2) - this.learningRate*err*v; });
      }
    }
    m.trainedSamples=samples.length; m.updatedAt=Date.now(); m.version=Math.max(2,m.version);
  }

  fit(samples:AITradeSample[]){
    if(samples.length<30) return {trained:false, reason:'En az 30 kapanmış işlem gerekli.', metrics:null};
    this.train(samples);
    const metrics=evaluate(this,samples);
    this.state.brier=metrics.brier;
    this.state.threshold=metrics.bestThreshold;
    return {trained:true,reason:'Model güncellendi.',metrics};
  }

  improve(samples:AITradeSample[]){
    if(samples.length<50) return {approved:false, reason:'Güvenli iyileştirme için en az 50 kapanmış işlem gerekli.'};
    const split=Math.max(35,Math.floor(samples.length*0.72));
    const trainSet=samples.slice(0,split), testSet=samples.slice(split);
    if(testSet.length<15) return {approved:false,reason:'Out-of-sample test seti çok küçük.'};
    const baseline=new AdaptiveLogisticAI(this.state);
    const candidate=new AdaptiveLogisticAI();
    candidate.fit(trainSet);
    const before=evaluate(baseline,testSet), after=evaluate(candidate,testSet);
    const improvement=before.brier-after.brier;
    const approved=improvement>=0.005 && after.accuracy>=before.accuracy-0.01;
    if(approved){
      this.state=candidate.state;
      this.state.version=Math.max(2,this.state.version+1);
      this.state.brier=after.brier;
      this.state.threshold=after.bestThreshold;
      this.state.updatedAt=Date.now();
    }
    return {approved, before, after, improvement, version:this.state.version};
  }

  explainTopWeights(){
    return FEATURE_NAMES.map((name,i)=>({name,weight:Number(this.state.weights[i].toFixed(4))}))
      .sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight)).slice(0,8);
  }
}

export function evaluate(model:AdaptiveLogisticAI,samples:AITradeSample[]){
  if(!samples.length) return {brier:1,accuracy:0,bestThreshold:0.5,avgProbability:0};
  const probs=samples.map(s=>model.predict(s));
  const brier=probs.reduce((a,p,i)=>a+(p-samples[i].label)**2,0)/samples.length;
  let best={accuracy:0,threshold:0.5};
  for(let t=0.40;t<=0.80;t+=0.01){
    const acc=probs.reduce((a,p,i)=>a+((p>=t?1:0)===samples[i].label?1:0),0)/samples.length;
    if(acc>best.accuracy) best={accuracy:acc,threshold:Number(t.toFixed(2))};
  }
  return {brier:Number(brier.toFixed(5)),accuracy:Number(best.accuracy.toFixed(4)),bestThreshold:best.threshold,avgProbability:Number((probs.reduce((a,b)=>a+b,0)/probs.length).toFixed(4))};
}

export function aiFeatureNames(){return [...FEATURE_NAMES];}
