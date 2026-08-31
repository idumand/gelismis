import React, {useEffect, useState} from 'react';
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';

type AIStatus={samples:number; trainedSamples:number; brier:number|null; threshold:number; version:number; updatedAt:number|null; mode:string; topWeights:{name:string;weight:number}[]};

export const AIImprove:React.FC=()=>{
 const [status,setStatus]=useState<AIStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<any>(null);
 const load=async()=>{try{const r=await fetch('/api/v1/ai/status');setStatus(await r.json())}catch{}};
 useEffect(()=>{load(); const id=setInterval(load,5000); return()=>clearInterval(id)},[]);
 const improve=async()=>{setBusy(true);setResult(null);try{const r=await fetch('/api/v1/ai/improve',{method:'POST'});const d=await r.json();setResult(d);await load()}finally{setBusy(false)}};
 return <div className="space-y-4">
   <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-5">
    <div className="flex items-start justify-between gap-4">
     <div><div className="flex items-center gap-2"><BrainCircuit className="text-violet-400"/><h2 className="text-lg font-bold">AI Öğrenme & İyileştirme</h2></div>
      <p className="text-sm text-slate-400 mt-2">Kapanmış işlemlerden öğrenir, yeni modeli geçmiş verinin zaman sırasını bozmadan test eder ve yalnızca doğrulaması geçen değişikliği etkinleştirir.</p></div>
     <button onClick={improve} disabled={busy} className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-400/40 text-violet-200 font-semibold text-sm disabled:opacity-50 flex items-center gap-2"><Sparkles className="w-4 h-4"/>{busy?'Analiz ediliyor...':'İyileştir'}</button>
    </div>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
    {[
      ['Örnek',status?.samples ?? 0],['Model',`V${status?.version ?? 1}`],['Brier',status?.brier!=null?status.brier.toFixed(4):'—'],['Eşik',status?.threshold!=null?`${(status.threshold*100).toFixed(0)}%`:'—'],['Durum',status?.mode==='ready'?'Hazır':'Öğreniyor']
    ].map(([k,v])=><div key={String(k)} className="bg-[#151921] border border-[#1e232f] rounded-xl p-4"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-bold mt-1">{v}</div></div>)}
   </div>
   <div className="grid md:grid-cols-2 gap-4">
    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-5"><div className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400"/>Modelin en etkili sinyalleri</div><div className="mt-4 space-y-3">{(status?.topWeights||[]).map(w=><div key={w.name} className="flex items-center justify-between text-sm"><span className="text-slate-300">{w.name}</span><span className={w.weight>=0?'text-emerald-300':'text-rose-300'}>{w.weight>=0?'+':''}{w.weight}</span></div>)}</div></div>
    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-5"><div className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400"/>Güvenlik</div><p className="text-sm text-slate-400 mt-3">AI doğrudan emir vermez. Önce eğitim verisini zaman sırasına göre böler, out-of-sample sonuçları karşılaştırır ve anlamlı iyileşme yoksa eski modeli korur.</p><button onClick={load} className="mt-4 px-3 py-2 rounded-lg bg-[#1e232f] text-slate-300 text-sm flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5"/>Durumu yenile</button></div>
   </div>
   {result && <pre className="bg-black/30 border border-[#1e232f] rounded-xl p-4 text-xs text-slate-300 overflow-auto">{JSON.stringify(result,null,2)}</pre>}
 </div>
}
