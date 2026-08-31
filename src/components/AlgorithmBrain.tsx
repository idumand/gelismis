import React, { useEffect, useState } from 'react';
import { Brain, ArrowUp, ArrowDown, Target, Activity, ShieldAlert, Zap } from 'lucide-react';

export const AlgorithmBrain: React.FC<{selectedPair?:string}> = ({selectedPair='BTC/USDT'}) => {
  const [data,setData]=useState<any>(null);
  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const r=await fetch(`/api/v1/brain?symbol=${encodeURIComponent(selectedPair)}`);
        const d=await r.json(); if(live)setData(d);
      }catch{}
    };
    load(); const t=setInterval(load,1200);
    return()=>{live=false;clearInterval(t)};
  },[selectedPair]);

  const best=data?.best;
  const pct=(v:number)=>`${Math.round(Number(v||0))}%`;
  return <section className="bg-[#0a101b] border border-cyan-500/20 rounded-2xl shadow-xl overflow-hidden">
    <div className="px-4 py-3 border-b border-[#1e2a3a] flex items-center justify-between">
      <div className="flex items-center gap-2"><Brain className="w-5 h-5 text-cyan-300"/><div><div className="font-bold text-white text-sm">Algoritmanın Beyni · Akıllı İstatistik</div><div className="text-[10px] text-slate-500">Order-flow + likidite + hedef matematiği</div></div></div>
      <div className="flex gap-2 text-[10px] font-mono"><span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300">{data?.environment?.toUpperCase()||'—'}</span><span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300">{data?.entry_mode?.toUpperCase()||'—'}</span></div>
    </div>
    <div className="p-4">
      {!best ? <div className="py-8 text-center text-xs text-slate-500">Quant brain verisi hazırlanıyor…</div> :
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Card title="En iyi coin" value={best.symbol||'—'} />
          <Card title="Yön" value={best.side?.toUpperCase()||'NEUTRAL'} icon={best.side==='long'?<ArrowUp className="w-4 h-4 text-emerald-400"/>:<ArrowDown className="w-4 h-4 text-rose-400"/>}/>
          <Card title="Skor" value={Number(best.score||0).toFixed(1)}/>
          <Card title="Long baskı" value={pct(best.longPressurePct)}/>
          <Card title="Short baskı" value={pct(best.shortPressurePct)}/>
          <Card title="Hedef 1x" value={`+${Number(best.target1x||0).toFixed(2)}%`}/>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Pressure title="Long para akışı" buy={best.longPressurePct||0} sell={best.shortPressurePct||0}/>
          <Pressure title="Emir defteri" buy={best.bookBuyRatio?best.bookBuyRatio*100:50} sell={best.bookBuyRatio?100-best.bookBuyRatio*100:50}/>
          <div className="rounded-xl border border-[#243044] bg-[#0b111c] p-3">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Matematiksel hedef</div>
            <div className="mt-1 text-sm font-mono text-white">Entry → {Number(best.targetPrice||0).toPrecision(8)}</div>
            <div className="text-xs text-emerald-300 mt-1">1x +%{Number(best.target1x||0).toFixed(2)} · x{data.leverage||1} ROE +%{Number((best.target1x||0)*(data.leverage||1)).toFixed(2)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Net edge: %{Number(best.edge||0).toFixed(2)} · Tahmini süre: {Number(best.timeSec||0).toFixed(0)}s</div>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#243044] bg-[#0b111c] p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><Activity className="w-4 h-4 text-cyan-300"/> Canlı akış</div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] font-mono">
              <Stat n="Taker buy" v={`$${Number(best.takerBuy||0).toLocaleString()}`}/>
              <Stat n="Taker sell" v={`$${Number(best.takerSell||0).toLocaleString()}`}/>
              <Stat n="Net giriş" v={`$${Number(best.netInflow||0).toLocaleString()}`}/>
              <Stat n="OBI" v={Number(best.obi||0).toFixed(3)}/>
              <Stat n="Absorption" v={pct(best.absorption)}/>
              <Stat n="Karşı baskı" v={pct(best.oppositePressure)}/><Stat n="MTF bias" v={Number(best.mtfBias||0).toFixed(2)}/>
            </div>
          </div>
          <div className="rounded-xl border border-[#243044] bg-[#0b111c] p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><Target className="w-4 h-4 text-amber-300"/> Çıkış zekâsı</div>
            <div className="text-[11px] text-slate-400 mt-2 leading-relaxed">Pozisyon kârdayken karşı tarafın baskısı hızla yükselirse, hedef beklenmeden çıkış tetiklenir. Kârın tepe dönüşü ve akış yön değişimi de izlenir.</div>
            <div className="mt-2 text-[10px] text-amber-300">Minimum giriş eşiği: 1x %{data.min_profit_pct_1x||0} + komisyon/slippage payı</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">En güçlü adaylar</div>
          <div className="space-y-1.5">{(data.candidates||[]).slice(0,8).map((x:any)=><div key={x.symbol} className="grid grid-cols-6 gap-2 px-3 py-2 rounded-lg bg-[#0b111c] border border-[#1b2635] text-[10px] font-mono"><span className="text-white font-bold">{x.symbol}</span><span className={x.side==='long'?'text-emerald-300':'text-rose-300'}>{x.side}</span><span>Skor {Number(x.score||0).toFixed(0)}</span><span>L {pct(x.longPressurePct)}</span><span>S {pct(x.shortPressurePct)}</span><span className="text-amber-300">+{Number(x.target1x||0).toFixed(2)}%</span></div>)}</div>
        </div>
      </div>}
    </div>
  </section>
};
const Card=({title,value,icon}:{title:string,value:string,icon?:React.ReactNode})=><div className="rounded-xl bg-[#0b111c] border border-[#1b2635] p-3"><div className="text-[9px] uppercase text-slate-500 font-bold">{title}</div><div className="mt-1 text-sm text-white font-mono font-bold flex items-center gap-1">{icon}{value}</div></div>;
const Pressure=({title,buy,sell}:{title:string,buy:number,sell:number})=><div className="rounded-xl border border-[#243044] bg-[#0b111c] p-3"><div className="text-[10px] text-slate-500 uppercase font-bold mb-2">{title}</div><div className="flex justify-between text-[10px] font-mono"><span className="text-emerald-300">LONG {Math.round(buy)}%</span><span className="text-rose-300">SHORT {Math.round(sell)}%</span></div><div className="mt-2 h-2 rounded-full bg-rose-500/40 overflow-hidden"><div className="h-full bg-emerald-400" style={{width:`${Math.max(0,Math.min(100,buy))}%`}}/></div></div>;
const Stat=({n,v}:{n:string,v:string})=><div className="p-2 rounded bg-[#101827]"><div className="text-slate-500">{n}</div><div className="text-slate-200 mt-0.5">{v}</div></div>;
