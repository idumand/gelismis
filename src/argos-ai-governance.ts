// ARGOS AI Governance V5
// User-editable trading policy with immutable hard safety floors.

export type RiskMode = 'conservative' | 'balanced' | 'aggressive';

export interface AIGovernanceState {
  riskMode: RiskMode;
  allowEntries: boolean;
  autoManagePositions: boolean;
  minConfidence: number;
  minProbability: number;
  maxUncertainty: number;
  minRiskReward: number;
  maxPositions: number;
  maxLeverage: number;
  stakeAmountUSDT: number;
  riskPerTradePct: number;
  stopLossPct: number;
  requireFreshData: boolean;
  maxDataAgeSec: number;
  requireTwoFactorAgreement: boolean;
  requireCounterThesis: boolean;
  requirePositiveEV: boolean;
  allowScaleIn: boolean;
  lastChangedAt: number;
  lastChangedBy: 'user' | 'ai' | 'system';
  lastReason: string;
}

export const HARD_SAFETY = {
  maxLeverage: 50,
  maxRiskPerTradePct: 5,
  minStopLossPct: 0.1,
  maxStopLossPct: 20,
  maxPositions: 8,
  maxStakeUSDT: 100000,
  maxDataAgeSec: 15,
  minConfidence: 50,
  minProbability: 0.52,
  maxUncertainty: 0.55,
};

export const DEFAULT_GOVERNANCE: AIGovernanceState = {
  riskMode: 'conservative',
  allowEntries: true,
  autoManagePositions: true,
  minConfidence: 72,
  minProbability: 0.68,
  maxUncertainty: 0.36,
  minRiskReward: 1.35,
  maxPositions: 1,
  maxLeverage: 15,
  stakeAmountUSDT: 25,
  riskPerTradePct: 1,
  stopLossPct: 1.5,
  requireFreshData: true,
  maxDataAgeSec: 5,
  requireTwoFactorAgreement: true,
  requireCounterThesis: true,
  requirePositiveEV: true,
  allowScaleIn: false,
  lastChangedAt: Date.now(),
  lastChangedBy: 'system',
  lastReason: 'Varsayılan AI güvenlik politikası',
};

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const lower=(s:string)=>String(s||'').toLocaleLowerCase('tr-TR');
const num=(v:unknown,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function has(s:string, words:string[]){return words.some(w=>s.includes(w));}

export function sanitizeGovernance(input: Partial<AIGovernanceState>, base: AIGovernanceState = DEFAULT_GOVERNANCE, actor:'user'|'ai'|'system'='ai', reason='AI komutu'):{state:AIGovernanceState; changed:string[]; blocked:string[]} {
  const next:{[K in keyof AIGovernanceState]:AIGovernanceState[K]} = {...base};
  const changed:string[]=[]; const blocked:string[]=[];
  const set=(key:keyof AIGovernanceState,val:any)=>{ if(JSON.stringify((next as any)[key])!==JSON.stringify(val)){(next as any)[key]=val; changed.push(key);} };
  if(input.riskMode) set('riskMode', ['conservative','balanced','aggressive'].includes(String(input.riskMode))?input.riskMode:base.riskMode);
  if(input.allowEntries!==undefined) set('allowEntries',Boolean(input.allowEntries));
  if(input.autoManagePositions!==undefined) set('autoManagePositions',Boolean(input.autoManagePositions));
  if(input.minConfidence!==undefined) set('minConfidence',clamp(num(input.minConfidence),HARD_SAFETY.minConfidence,96));
  if(input.minProbability!==undefined) set('minProbability',clamp(num(input.minProbability),HARD_SAFETY.minProbability,.95));
  if(input.maxUncertainty!==undefined) set('maxUncertainty',clamp(num(input.maxUncertainty),.10,HARD_SAFETY.maxUncertainty));
  if(input.minRiskReward!==undefined) set('minRiskReward',clamp(num(input.minRiskReward),.5,6));
  if(input.maxPositions!==undefined) set('maxPositions',Math.round(clamp(num(input.maxPositions),1,HARD_SAFETY.maxPositions)));
  if(input.maxLeverage!==undefined){ const requested=num(input.maxLeverage); if(requested>HARD_SAFETY.maxLeverage) blocked.push(`maxLeverage ${requested}x > hard cap ${HARD_SAFETY.maxLeverage}x`); set('maxLeverage',Math.round(clamp(requested,1,HARD_SAFETY.maxLeverage))); }
  if(input.stakeAmountUSDT!==undefined) set('stakeAmountUSDT',clamp(num(input.stakeAmountUSDT),1,HARD_SAFETY.maxStakeUSDT));
  if(input.riskPerTradePct!==undefined){const requested=num(input.riskPerTradePct); if(requested>HARD_SAFETY.maxRiskPerTradePct) blocked.push(`riskPerTradePct ${requested}% > hard cap ${HARD_SAFETY.maxRiskPerTradePct}%`); set('riskPerTradePct',clamp(requested,.1,HARD_SAFETY.maxRiskPerTradePct));}
  if(input.stopLossPct!==undefined) set('stopLossPct',clamp(num(input.stopLossPct),HARD_SAFETY.minStopLossPct,HARD_SAFETY.maxStopLossPct));
  if(input.requireFreshData!==undefined) set('requireFreshData',Boolean(input.requireFreshData));
  if(input.maxDataAgeSec!==undefined) set('maxDataAgeSec',Math.round(clamp(num(input.maxDataAgeSec),1,HARD_SAFETY.maxDataAgeSec)));
  // These critical protections can only be enabled/kept on. User/AI cannot switch them off in chat.
  if(input.requireTwoFactorAgreement===false) blocked.push('requireTwoFactorAgreement cannot be disabled');
  set('requireTwoFactorAgreement',true);
  if(input.requireCounterThesis===false) blocked.push('requireCounterThesis cannot be disabled');
  set('requireCounterThesis',true);
  if(input.requirePositiveEV===false) blocked.push('requirePositiveEV cannot be disabled');
  set('requirePositiveEV',true);
  if(input.allowScaleIn!==undefined) set('allowScaleIn',Boolean(input.allowScaleIn));

  next.lastChangedAt=Date.now(); next.lastChangedBy=actor; next.lastReason=reason;
  // Risk mode is a preset applied after user changes so its behavior is predictable.
  if(input.riskMode){
    if(input.riskMode==='conservative') { set('minConfidence',82); set('minProbability',.74); set('maxUncertainty',.28); set('minRiskReward',1.60); set('maxPositions',Math.min(next.maxPositions,2)); set('riskPerTradePct',Math.min(next.riskPerTradePct,.75)); }
    if(input.riskMode==='balanced') { set('minConfidence',72); set('minProbability',.68); set('maxUncertainty',.36); set('minRiskReward',1.35); set('riskPerTradePct',Math.min(next.riskPerTradePct,1)); }
    if(input.riskMode==='aggressive') { set('minConfidence',65); set('minProbability',.62); set('maxUncertainty',.45); set('minRiskReward',1.10); set('riskPerTradePct',Math.min(next.riskPerTradePct,2)); }
  }
  return {state:next,changed,blocked};
}

export interface GovernanceCommandParse {
  changes: Partial<AIGovernanceState>;
  recognized: boolean;
  requestType: 'SET_SECURITY'|'ADVICE'|'CHAT'|'NONE';
  summary:string;
}

export function parseGovernanceCommand(text:string):GovernanceCommandParse{
  const s=lower(text); const changes:Partial<AIGovernanceState>={};
  const security = has(s,['güvenlik','guvenlik','risk ayar','risk limiti','stop loss','zarar kes','maksimum kaldıraç','maksimum kaldirac','max kaldıraç','max kaldirac','minimum güven','minimum guven','minimum olasılık','minimum olasilik','belirsizlik','pozisyon sayısı','pozisyon sayisi','işlem başına risk','islem basina risk']);
  const advice = has(s,['ne önerirsin','ne onerirsin','tavsiye','öneri','oneri','hangi coin','hangi coinler','long mu','short mu','fırsat var mı','firsat var mi','piyasa nasıl','piyasa nasil','ne yapmalıyım','ne yapmaliyim','görüşün nedir','goruşun nedir','yorumun ne']);
  const pct=(patterns:RegExp[])=>{for(const p of patterns){const m=s.match(p);if(m)return num(String(m[1]).replace(',','.'));}return undefined;};
  const lev=s.match(/(?:maksimum|max|üst sınır|ust sinir)\s*(?:kaldıraç|kaldirac|leverage)?\s*(\d{1,3})\s*x?/i) || s.match(/(?:kaldıraç|kaldirac|leverage)\s*(?:en fazla|max|maksimum)?\s*(\d{1,3})\s*x?/i);
  if(lev) changes.maxLeverage=Number(lev[1]);
  const conf=pct([/(?:minimum|min|en az)\s*(?:güven|guven|confidence)\s*%?\s*(\d+(?:[.,]\d+)?)/i]); if(conf!==undefined) changes.minConfidence=conf;
  const prob=pct([/(?:minimum|min|en az)\s*(?:olasılık|olasilik|probability)\s*%?\s*(\d+(?:[.,]\d+)?)/i]); if(prob!==undefined) changes.minProbability=prob/100;
  const unc=pct([/(?:maksimum|max|en fazla)\s*(?:belirsizlik|uncertainty)\s*%?\s*(\d+(?:[.,]\d+)?)/i]); if(unc!==undefined) changes.maxUncertainty=unc/100;
  const rr=s.match(/(?:minimum|min|en az)\s*(?:r\/r|rr|risk\/getiri|risk getiri)\s*(\d+(?:[.,]\d+)?)/i); if(rr) changes.minRiskReward=Number(rr[1].replace(',','.'));
  const pos=s.match(/(?:maksimum|max|en fazla)\s*(\d+)\s*(?:pozisyon|işlem|islem)/i); if(pos) changes.maxPositions=Number(pos[1]);
  const risk=pct([/(?:işlem başına risk|islem basina risk|risk)\s*%?\s*(\d+(?:[.,]\d+)?)/i]); if(risk!==undefined) changes.riskPerTradePct=risk;
  const stop=pct([/(?:stop loss|zarar kes|stop)\s*%?\s*(\d+(?:[.,]\d+)?)/i]); if(stop!==undefined) changes.stopLossPct=stop;
  const stake=s.match(/(?:işlem başına|islem basina|stake|pozisyon miktarı|pozisyon miktari)\s*(?:\$|usdt)?\s*(\d+(?:[.,]\d+)?)\s*(?:\$|usdt|dolar)?/i); if(stake) changes.stakeAmountUSDT=Number(stake[1].replace(',','.'));
  const age=s.match(/(?:veri|data)[^\d]{0,16}(?:en fazla|max|tazelik)\s*(\d+)\s*(?:sn|saniye|sec)/i); if(age) changes.maxDataAgeSec=Number(age[1]);
  if(has(s,['muhafazakar','korumacı','korumaci','çok güvenli','cok guvenli'])) changes.riskMode='conservative';
  else if(has(s,['orta risk','dengeli','balanced'])) changes.riskMode='balanced';
  else if(has(s,['agresif','yüksek risk','yuksek risk'])) changes.riskMode='aggressive';
  if(has(s,['girişleri durdur','girisleri durdur','pozisyon açmayı durdur','pozisyon acmayi durdur'])) changes.allowEntries=false;
  if(has(s,['girişleri aç','girisleri ac','işlem açmayı etkinleştir','islem acmayi etkinlestir'])) changes.allowEntries=true;
  if(has(s,['pozisyonları otomatik izle','pozisyonlari otomatik izle','açık pozisyonları koru','acik pozisyonlari koru'])) changes.autoManagePositions=true;
  if(has(s,['ölçekleme yap','olcekleme yap','kademeli giriş','kademeli giris'])) changes.allowScaleIn=true;
  if(has(s,['ölçeklemeyi kapat','olcekleme kapat'])) changes.allowScaleIn=false;
  const recognized=Object.keys(changes).length>0 || security;
  const requestType=security?'SET_SECURITY':advice?'ADVICE':'NONE';
  return {changes,recognized,requestType,summary:Object.keys(changes).length?`AI güvenlik/politika değişikliği: ${Object.keys(changes).join(', ')}`:''};
}

export function governanceAdviceText(state:AIGovernanceState){
  return `Risk: ${state.riskMode} | giriş: ${state.allowEntries?'açık':'kapalı'} | auto-manage: ${state.autoManagePositions?'açık':'kapalı'} | min güven %${state.minConfidence} | min olasılık %${(state.minProbability*100).toFixed(0)} | belirsizlik ≤ %${(state.maxUncertainty*100).toFixed(0)} | R/R ≥ ${state.minRiskReward.toFixed(2)} | max ${state.maxPositions} pozisyon | max ${state.maxLeverage}x | risk/işlem %${state.riskPerTradePct} | SL %${state.stopLossPct}. Kritik veri/karar güvenlikleri kilitli.`;
}
