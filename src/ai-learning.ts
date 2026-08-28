// ARGOS Adaptive Learning AI — dependency-free online logistic learner.
// It learns from closed trades but never sends orders itself.
// Safety principle: model updates are only candidates until an out-of-sample check passes.

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

const FEATURE_NAMES = ['edge','path','flowGap','inflow','largeMoney','liquidityConsumption','movement','dataQuality','targetConfidence','spread','volatility','urgency'];
const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const sigmoid = (x:number)=>1/(1+Math.exp(-clamp(x,-30,30)));
const finite = (v:any,d=0)=>Number.isFinite(Number(v)) ? Number(v) : d;

export function extractAIFeatures(metric:any, urgency=50, side:'long'|'short'='long'): AIFeatureVector {
  const sign = side === 'short' ? -1 : 1;
  return {
    edge: clamp(finite(metric?.edgeScore), -100, 100) / 100,
    path: clamp(finite(metric?.targetPathScore), -100, 100) / 100,
    flowGap: sign * clamp(finite(metric?.orderFlowGap), -100, 100) / 100,
    inflow: sign * clamp(finite(metric?.inflowMomentum), -100, 100) / 100,
    largeMoney: sign * clamp(finite(metric?.largeTradeScore), -100, 100) / 100,
    liquidityConsumption: sign * clamp(finite(metric?.liquidityConsumptionScore), -100, 100) / 100,
    movement: clamp(finite(metric?.movementPotentialPct), 0, 20) / 20,
    dataQuality: clamp(finite(metric?.dataQuality), 0, 100) / 100,
    targetConfidence: clamp(finite(metric?.targetConfidence), 0, 100) / 100,
    spread: clamp(finite(metric?.spreadPct), 0, 0.02) / 0.02,
    volatility: clamp(finite(metric?.atrPct ?? metric?.volatilityPct), 0, 20) / 20,
    urgency: clamp(finite(urgency, 50), 0, 100) / 100,
  };
}

function vector(s:AIFeatureVector){ return FEATURE_NAMES.map(k=>finite((s as any)[k])); }

export class AdaptiveLogisticAI {
  state: AIModelState;
  private learningRate = 0.04;
  private l2 = 0.002;

  constructor(saved?:Partial<AIModelState>) {
    const n=FEATURE_NAMES.length;
    this.state = {
      version: Number(saved?.version || 1),
      weights: Array.isArray(saved?.weights) && saved!.weights.length===n ? saved!.weights.map(v => finite(v, 0)) : Array(n).fill(0),
      bias: finite(saved?.bias),
      mean: Array.isArray(saved?.mean) && saved!.mean.length===n ? saved!.mean.map(v => finite(v, 0.5)) : Array(n).fill(0.5),
      scale: Array.isArray(saved?.scale) && saved!.scale.length===n ? saved!.scale.map(v=>Math.max(0.01,finite(v, 0.25))) : Array(n).fill(0.25),
      trainedSamples: Number(saved?.trainedSamples || 0),
      brier: saved?.brier ?? null,
      threshold: clamp(finite(saved?.threshold, 0.5), 0.35, 0.85),
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  private norm(x:number[], mean=this.state.mean, scale=this.state.scale){ return x.map((v,i)=>(v-mean[i])/Math.max(scale[i],0.01)); }
  predict(sample:AIFeatureVector){
    const z=this.norm(vector(sample));
    const score=this.state.bias + z.reduce((s,v,i)=>s+v*this.state.weights[i],0);
    return sigmoid(score);
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
    const base=initial || new AdaptiveLogisticAI();
    const {mean,scale}=this.fitStats(samples);
    const m=this.state;
    m.mean=mean; m.scale=scale;
    if(initial){ m.weights=initial.state.weights.slice(); m.bias=initial.state.bias; }
    const shuffled=samples.slice();
    for(let epoch=0;epoch<80;epoch++){
      for(let j=shuffled.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1)); [shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
      for(const s of shuffled){
        const z=this.norm(vector(s));
        const p=this.predict(s);
        const err=p-s.label;
        m.bias -= this.learningRate*err;
        z.forEach((v,i)=>{ m.weights[i] = m.weights[i]*(1-this.learningRate*this.l2) - this.learningRate*err*v; });
      }
    }
    m.trainedSamples=samples.length; m.updatedAt=Date.now();
  }

  fit(samples:AITradeSample[]){
    if(samples.length<20) return {trained:false, reason:'En az 20 kapanmış işlem gerekli.', metrics:null};
    this.train(samples);
    const metrics=evaluate(this,samples);
    this.state.brier=metrics.brier;
    this.state.threshold=metrics.bestThreshold;
    return {trained:true,reason:'Model güncellendi.',metrics};
  }

  improve(samples:AITradeSample[]){
    if(samples.length<30) return {approved:false, reason:'Güvenli iyileştirme için en az 30 kapanmış işlem gerekli.'};
    const split=Math.max(20,Math.floor(samples.length*0.7));
    const trainSet=samples.slice(0,split), testSet=samples.slice(split);
    if(testSet.length<10) return {approved:false,reason:'Out-of-sample test seti çok küçük.'};
    const baseline=new AdaptiveLogisticAI(this.state);
    const candidate=new AdaptiveLogisticAI();
    candidate.fit(trainSet);
    const before=evaluate(baseline,testSet), after=evaluate(candidate,testSet);
    const improvement=before.brier-after.brier;
    const approved=improvement>=0.01 && after.accuracy>=before.accuracy-0.01;
    if(approved){
      this.state=candidate.state;
      this.state.version+=1;
      this.state.brier=after.brier;
      this.state.threshold=after.bestThreshold;
      this.state.updatedAt=Date.now();
    }
    return {approved, before, after, improvement, version:this.state.version};
  }

  explainTopWeights(){
    return FEATURE_NAMES.map((name,i)=>({name,weight:Number(this.state.weights[i].toFixed(4))}))
      .sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight)).slice(0,6);
  }
}

export function evaluate(model:AdaptiveLogisticAI,samples:AITradeSample[]){
  if(!samples.length) return {brier:1,accuracy:0,bestThreshold:0.5,avgProbability:0};
  const probs=samples.map(s=>model.predict(s));
  const brier=probs.reduce((a,p,i)=>a+(p-samples[i].label)**2,0)/samples.length;
  let best={accuracy:0,threshold:0.5};
  for(let t=0.35;t<=0.70;t+=0.01){
    const acc=probs.reduce((a,p,i)=>a+((p>=t?1:0)===samples[i].label?1:0),0)/samples.length;
    if(acc>best.accuracy) best={accuracy:acc,threshold:Number(t.toFixed(2))};
  }
  return {brier:Number(brier.toFixed(5)),accuracy:Number(best.accuracy.toFixed(4)),bestThreshold:best.threshold,avgProbability:Number((probs.reduce((a,b)=>a+b,0)/probs.length).toFixed(4))};
}

export function aiFeatureNames(){return FEATURE_NAMES.slice();}
