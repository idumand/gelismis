// Smoke test for ARGOS AI learning engine.
(async()=>{
  const fs=require('fs');
  const ts=require('typescript');
  const source=fs.readFileSync('src/ai-learning.ts','utf8');
  const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const Module=require('module'); const m=new Module('ai'); m.paths=module.paths; m._compile(out,'ai-learning.cjs');
  const {AdaptiveLogisticAI,extractAIFeatures}=m.exports;
  const ai=new AdaptiveLogisticAI();
  const samples=Array.from({length:40},(_,i)=>{const metric={edgeScore:i%10*8,targetPathScore:55+i%12,orderFlowGap:i%2?18:-10,inflowMomentum:i%2?22:-18,largeTradeScore:i%2?14:-12,liquidityConsumptionScore:i%2?12:-8,movementPotentialPct:0.7,dataQuality:90,targetConfidence:72,spreadPct:0.0003,atrPct:0.8};return {...extractAIFeatures(metric,60,i%2?'long':'short'),id:i,symbol:'TEST/USDT',side:i%2?'long':'short',label:i%2?1:0,pnl:i%2?1:-1,timestamp:Date.now()+i}});
  console.log(ai.fit(samples).trained ? 'AI FIT OK' : 'AI FIT FAILED');
  console.log(ai.improve(samples).approved ? 'AI IMPROVE APPROVED' : 'AI IMPROVE REJECTED (safe)');
})();
