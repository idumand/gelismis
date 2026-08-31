import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Send, RefreshCw, Play, Square, Sparkles, ShieldCheck, Bot, Newspaper, Activity, ScanSearch, Crosshair, WalletCards, Eye, XCircle, Settings2 } from 'lucide-react';

type Coin = Record<string, any>;
type Position = Record<string, any>;

export const AIWorkspace: React.FC = () => {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [directive, setDirective] = useState<any>({});
  const [llm, setLlm] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);
  const [aiMeta, setAiMeta] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [governance, setGovernance] = useState<any>(null);
  const [advice, setAdvice] = useState<any>(null);
  const [cortex, setCortex] = useState<any>(null);
  const [universeView, setUniverseView] = useState<any[]>([]);

  const load = async () => {
    try {
      const [ctxR, posR, rankR, cortexR, universeR] = await Promise.all([
        fetch('/api/v1/ai/context'),
        fetch('/api/v1/ai/positions'),
        fetch('/api/v1/ai/ranking?top=80'),
        fetch('/api/v1/ai/cortex?top=40'),
        fetch('/api/v1/ai/universe?top=300')
      ]);
      const [d, p, r, cx, uv] = await Promise.all([ctxR.json(), posR.json(), rankR.json(), cortexR.json(), universeR.json()]);
      setCoins(Array.isArray(d.coins) ? d.coins : []);
      setNews(Array.isArray(d.news) ? d.news : []);
      setDirective(d.ai?.agentDirective || d.directive || {});
      setLlm(d.llm || null);
      setAutoPilot(Boolean(d.autoPilot));
      setAiMeta(d.ai || null);
      setGovernance(d.ai?.governance || d.directive?.governance || null);
      setPositions(Array.isArray(p.rows) ? p.rows : []);
      setRanking(Array.isArray(r.rankings) ? r.rankings : []);
      setCortex(cx || null);
      setUniverseView(Array.isArray(uv?.markets) ? uv.markets : []);
    } catch {}
  };

  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, []);

  const sortedCoins = useMemo(() => [...coins].sort((a, b) => Number(b.agentScore || b.aiScore || b.deepScore || 0) - Number(a.agentScore || a.aiScore || a.deepScore || 0)), [coins]);
  const bestCandidates = ranking.filter(x => x.action === 'ENTER_NOW').slice(0, 8);

  const send = async (override?: string) => {
    const text = (override ?? message).trim(); if (!text || busy) return;
    if (!override) setMessage('');
    setMessages(m => [...m, { role: 'user', content: text }]); setBusy(true);
    try {
      const r = await fetch('/api/v1/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const d = await r.json();
      let content = d.content || d.message || '';
      if (!content) {
        if (d.executed) content = `Emir sonucu: ${d.ok ? 'başarılı' : 'reddedildi'}\n${JSON.stringify(d.executed)}`;
        else if (d.selected) content = `${d.intent || 'ANALİZ'}\n${d.selected.symbol} ${String(d.selected.side || '').toUpperCase()} | Olasılık %${(Number(d.selected.probability || 0) * 100).toFixed(1)} | Güven %${Number(d.selected.confidence || 0).toFixed(0)}\n${(d.selected.reasons || []).join(' | ')}`;
        else content = d.ok ? 'Komut işlendi.' : 'Komut güvenlik/uygunluk nedeniyle uygulanmadı.';
      }
      setMessages(m => [...m, { role: 'assistant', content, meta: d }]);
      if (d.directive) setDirective(d.directive);
      await load();
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `Hata: ${e?.message || e}` }]);
    } finally { setBusy(false); }
  };

  const getAdvice = async () => {
    try {
      const r = await fetch('/api/v1/ai/advice');
      const d = await r.json();
      setAdvice(d.recommendation || null);
      if (d.recommendation?.summary) setMessages(m => [...m, { role:'assistant', content:`Canlı tavsiyem: ${d.recommendation.summary}\n\n${(d.recommendation.recommendations || []).map((x:any)=>`${x.symbol} ${String(x.side).toUpperCase()} · ${x.action} · olasılık %${x.probability} · güven %${x.confidence} · R/R ${x.riskReward}\n${(x.reasons||[]).slice(0,3).join(' · ')}`).join('\n\n')}` }]);
    } catch {}
  };

  const toggleAutoPilot = async () => {
    try {
      const enabled = !autoPilot;
      const r = await fetch('/api/v1/ai/autopilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Otonom mod değiştirilemedi.');
      await load();
    } catch (e:any) { setMessages(m => [...m, { role:'assistant', content:`Otonom mod hatası: ${e?.message || e}` }]); }
  };

  const quick = [
    ['💰 Sadece para girişi', 'Sadece para girişine göre pozisyon aç. Teknik sinyalleri giriş kriteri yapma; yalnızca veri kalitesi, spread ve temel güvenlik kontrollerini koru.'],
    ['🧠 Derin analiz', 'Derin analiz yap ve en güçlü coin için uygun olan yönde pozisyon aç. Order flow, para akışı, likidite yolu, trend, hedef ve risk/getiri birlikte değerlendirilsin.'],
    ['🔎 En iyi fırsatı tara', 'Canlı tüm Futures evrenini tara ve şu anda gerçekten ENTER_NOW seviyesinde olan en iyi 5 adayı sırala.'],
    ['👁 Pozisyonları izle', 'Açık pozisyonlarımı sürekli gözlemle; tez bozulursa, para akışı ve order flow tersine dönerse veya kâr ciddi erirse koruyucu çıkış uygula.'],
    ['💡 Bana tavsiye ver', 'Canlı tüm Futures piyasasını değerlendir, en iyi fırsatları ve kaçınmam gereken coinleri gerekçeleriyle tavsiye et.'],
    ['🛡️ Güvenliği sıkılaştır', 'AI güvenlik modunu muhafazakâr yap; minimum güveni, minimum olasılığı ve R/R eşiğini artır; kritik güvenlikleri kapatma.'],
  ] as const;

  const cognitiveScore = (c:any) => Number(c?.cognitiveScore || cortex?.decisions?.find((d:any)=>d.symbol===c?.symbol)?.score || 0);
  const cognitiveAction = (c:any) => c?.cognitiveAction || cortex?.decisions?.find((d:any)=>d.symbol===c?.symbol)?.action || '—';

  return <div className="space-y-4">
    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><BrainCircuit className="w-6 h-6 text-violet-400"/><h2 className="text-xl font-bold">ARGOS Yapay Zeka CORTEX V6</h2><span className="text-[11px] px-2 py-1 rounded-full bg-violet-500/10 border border-violet-400/30 text-violet-300">Cortex + Multi-Expert + LLM</span></div>
          <p className="text-sm text-slate-400 mt-2">Canlı Futures evrenini izler, doğal dil komutlarını çalışma direktiflerine çevirir, uygun komutları güvenlik kapılarından geçirir ve açık pozisyon tezini canlı yeniden değerlendirir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-2 rounded-lg bg-slate-800/70 text-xs text-slate-300">LLM: {llm?.model || 'Yok / Fallback'}</span>
          <span className="px-3 py-2 rounded-lg bg-slate-800/70 text-xs text-slate-300">Agent V5</span>
          <button onClick={toggleAutoPilot} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${autoPilot ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{autoPilot ? <><Square className="w-3.5 h-3.5 inline mr-1"/>Otonom Açık</> : <><Play className="w-3.5 h-3.5 inline mr-1"/>Otonom Kapalı</>}</button>
          <button onClick={load} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"><RefreshCw className="w-3.5 h-3.5 inline mr-1"/>Yenile</button>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
      {[
        ['Futures evreni', cortex?.state?.universeSize ?? coins.length],
        ['Canlı ticker', cortex?.state?.liveSymbols ?? universeView.length],
        ['Taze veri', cortex?.state?.freshSymbols ?? '—'],
        ['Pozitif genişlik', cortex?.state ? `%${Number(cortex.state.positiveBreadthPct||0).toFixed(0)}` : '—'],
        ['En iyi', bestCandidates[0] ? `${bestCandidates[0].symbol} %${(bestCandidates[0].probability*100).toFixed(0)}` : '—'],
        ['LLM', llm?.available ? 'Hazır' : 'Fallback'],
        ['Öğrenme', aiMeta?.trainedSamples ?? 0],
        ['Pozisyon', `${positions.length} ${autoPilot ? '· OTO' : ''}`]
      ].map(([k,v]) => <div key={String(k)} className="bg-[#151921] border border-[#1e232f] rounded-xl p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-bold mt-1">{v}</div></div>)}
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-4">
      <div className="flex items-center justify-between"><div className="font-semibold">CORTEX Piyasa Beyni</div><div className="text-[11px] text-slate-500">{cortex?.version || 'ARGOS-V6-CORTEX'} · son tarama {cortex?.lastRunAt ? `${Math.max(0,Math.round((Date.now()-cortex.lastRunAt)/1000))} sn` : '—'} önce</div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mt-3">
        {Object.entries(cortex?.state?.regimeCounts || {}).slice(0,8).map(([k,v]:any)=><div key={k} className="rounded-lg bg-slate-900/50 border border-slate-800 p-2"><div className="text-[10px] text-slate-500">{k}</div><div className="text-xs font-semibold mt-1">{v} coin</div></div>)}
      </div>
      <div className="mt-3 text-xs text-slate-400">Pozitif genişlik %{Number(cortex?.state?.positiveBreadthPct||0).toFixed(1)} · Negatif %{Number(cortex?.state?.negativeBreadthPct||0).toFixed(1)} · Ortalama 24s {Number(cortex?.state?.averageChange24h||0).toFixed(2)}% · Akış ${Number(cortex?.state?.averageFlowScore||0).toFixed(0)}</div>
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-4">
      <div className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-cyan-400"/>Aktif AI Direktifi</div>
      <div className="mt-2 text-xs text-slate-300 font-mono">{directive.strategy || 'balanced'} · {directive.onlyMoneyFlow ? 'SADECE PARA AKIŞI' : 'ensemble'} · min güven %{directive.minConfidence ?? '—'} · min olasılık %{directive.minProbability ? (directive.minProbability*100).toFixed(0) : '—'} · max {directive.maxPositions ?? '—'} pozisyon</div>
      <div className="mt-3 flex flex-wrap gap-2">{quick.map(([label,cmd]) => <button key={label} onClick={() => send(cmd)} disabled={busy} className="px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-200 text-xs hover:bg-violet-500/20 disabled:opacity-40"><Sparkles className="w-3.5 h-3.5 inline mr-1"/>{label}</button>)}</div>
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400"/>AI Güvenlik ve Yetki Politikası</div><div className="text-[11px] text-slate-500 mt-1">Bu ayarlar sohbetten değiştirilebilir. Kritik veri, emir doğrulama ve hard-limit kilitleri AI tarafından kapatılamaz.</div></div>
        <span className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-emerald-300">{governance?.riskMode || 'conservative'}</span>
      </div>
      {governance && <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mt-3">
        {[['Min güven',`%${governance.minConfidence}`],['Min olasılık',`%${(Number(governance.minProbability||0)*100).toFixed(0)}`],['Max belirs.',`%${(Number(governance.maxUncertainty||0)*100).toFixed(0)}`],['Min R/R',Number(governance.minRiskReward||0).toFixed(2)],['Max poz.',governance.maxPositions],['Max kald.',`${governance.maxLeverage}x`],['Risk/işlem',`%${governance.riskPerTradePct}`],['SL',`%${governance.stopLossPct}`]].map(([k,v])=><div key={String(k)} className="rounded-lg bg-slate-900/50 border border-slate-800 p-2"><div className="text-[10px] text-slate-500">{k}</div><div className="text-xs font-semibold mt-1">{v}</div></div>)}
      </div>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={()=>send('Güvenliği muhafazakâr yap')} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs">🛡️ Muhafazakâr</button>
        <button onClick={()=>send('Risk ayarlarını dengeli yap')} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs">⚖️ Dengeli</button>
        <button onClick={()=>send('Maksimum kaldıraç 10x, işlem başına risk %0.5 yap')} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs">🔒 10x / %0.5</button>
        <button onClick={getAdvice} className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-cyan-200 text-xs">💡 Canlı tavsiye</button>
      </div>
      {advice?.summary && <div className="mt-3 text-xs text-slate-300 rounded-lg bg-cyan-500/5 border border-cyan-400/10 p-3">{advice.summary}</div>}
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232f] flex items-center justify-between"><div className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400"/>Tüm Binance Futures Canlı Evrensel Veri</div><span className="text-xs text-slate-500">{universeView.length} gösteriliyor / {cortex?.state?.universeSize || coins.length} canlı</span></div>
      <div className="overflow-auto max-h-[430px]"><table className="w-full text-[11px]"><thead className="sticky top-0 bg-[#151921] text-slate-500"><tr><th className="text-left px-3 py-2">Coin</th><th>Fiyat</th><th>24s</th><th>Hacim</th><th>Bid</th><th>Ask</th><th>Spread</th><th>AI</th><th>Durum</th></tr></thead><tbody>{universeView.map((c:any,i)=><tr key={c.symbol||i} className="border-t border-[#1e232f]"><td className="px-3 py-2 font-semibold">{c.symbol}</td><td>{Number(c.price||0).toLocaleString('en-US',{maximumFractionDigits:8})}</td><td>{Number(c.change_24h_pct||0).toFixed(2)}%</td><td>{Number(c.volume_24h_usdt||0).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2})}</td><td>{Number(c.bestBid||0).toLocaleString('en-US',{maximumFractionDigits:8})}</td><td>{Number(c.bestAsk||0).toLocaleString('en-US',{maximumFractionDigits:8})}</td><td>{Number(c.microSpreadPct||0).toFixed(4)}%</td><td>{Number(cognitiveScore(c)||0).toFixed(1)}</td><td>{String(cognitiveAction(c)||'—')}</td></tr>)}</tbody></table></div>
    </div>

    <div className="grid xl:grid-cols-[1.2fr_.8fr] gap-4">
      <div className="bg-[#151921] border border-[#1e232f] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e232f] flex items-center justify-between"><div className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400"/>Canlı AI Evreni</div><span className="text-xs text-slate-500">{coins.length} coin</span></div>
        <div className="overflow-auto max-h-[520px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-[#151921] text-slate-500"><tr><th className="text-left px-3 py-2">Coin</th><th>AI</th><th>Olas.</th><th>Güven</th><th>Belirs.</th><th>Net Para</th><th>Flow</th><th>Rejim</th><th>Karar</th></tr></thead><tbody>{sortedCoins.slice(0,140).map((c,i)=><tr key={c.symbol || i} className="border-t border-[#1e232f] hover:bg-slate-800/30"><td className="px-3 py-2 font-semibold text-slate-200">{c.symbol}</td><td>{Number(c.agentScore ?? c.aiScore ?? 0).toFixed(1)}</td><td>{Number(c.agentProbability ?? c.aiProbability ?? 0).toFixed(1)}%</td><td>{Number(c.agentConfidence ?? c.aiConfidence ?? 0).toFixed(0)}%</td><td>{Number(c.agentUncertainty ?? c.aiUncertainty ?? 0).toFixed(0)}%</td><td>{Number(c.netInflowUSDT ?? 0).toLocaleString('tr-TR',{maximumFractionDigits:0})}</td><td>{Number(c.orderFlowGap ?? 0).toFixed(1)}</td><td className="text-[10px]">{c.marketRegime || '—'}</td><td className="font-semibold">{c.agentAction || c.aiAction || '—'}</td></tr>)}</tbody></table></div>
      </div>

      <div className="space-y-4">
        <div className="bg-[#151921] border border-[#1e232f] rounded-2xl overflow-hidden"><div className="px-4 py-3 border-b border-[#1e232f] flex items-center gap-2"><Crosshair className="w-4 h-4 text-emerald-300"/>AI Adayları</div><div className="p-3 space-y-2 max-h-64 overflow-auto">{bestCandidates.length ? bestCandidates.map((d,i)=><div key={i} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800"><div className="flex justify-between"><span className="font-semibold">{d.symbol} · {d.side.toUpperCase()}</span><span className="text-emerald-300">%{(d.probability*100).toFixed(1)}</span></div><div className="text-[11px] text-slate-400 mt-1">Güven %{d.confidence.toFixed(0)} · Belirsizlik %{(d.uncertainty*100).toFixed(0)}</div><div className="text-[11px] text-slate-300 mt-1">{d.reasons?.slice(0,3).join(' · ')}</div></div>) : <div className="text-xs text-slate-500">Şu anda ENTER_NOW seviyesinde aday yok.</div>}</div></div>

        <div className="bg-[#151921] border border-[#1e232f] rounded-2xl overflow-hidden"><div className="px-4 py-3 border-b border-[#1e232f] flex items-center gap-2"><Eye className="w-4 h-4 text-cyan-300"/>Açık Pozisyonların Canlı Tezi</div><div className="p-3 space-y-2 max-h-64 overflow-auto">{positions.length ? positions.map((p,i)=><div key={i} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800"><div className="flex justify-between"><span className="font-semibold">{p.symbol} · {String(p.side).toUpperCase()}</span><span className={p.pnlUSD>=0?'text-emerald-300':'text-rose-300'}>{p.pnlUSD>=0?'+':''}${Number(p.pnlUSD||0).toFixed(2)}</span></div><div className="text-[11px] text-slate-400 mt-1">ROE %{Number(p.roePct||0).toFixed(2)} · AI {p.agent?.action || 'HOLD'} · Olas. %{Number((p.agent?.probability||0)*100).toFixed(1)}</div><div className="text-[11px] text-slate-300 mt-1">{p.agent?.reasons?.slice(-3).join(' · ')}</div></div>) : <div className="text-xs text-slate-500">Açık pozisyon yok.</div>}</div></div>

        <div className="bg-[#151921] border border-[#1e232f] rounded-2xl p-4"><div className="font-semibold flex items-center gap-2"><Newspaper className="w-4 h-4 text-amber-300"/>Haber bağlamı</div><div className="mt-3 space-y-2 max-h-36 overflow-auto">{news.length ? news.slice(0,6).map((n:any,i)=><div key={i} className="text-xs text-slate-300 border-b border-[#1e232f] pb-2">{n.title}<div className="text-[10px] text-slate-500 mt-1">{n.source}</div></div>) : <div className="text-xs text-slate-500">RSS verisi yok.</div>}</div></div>
      </div>
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232f] flex items-center gap-2"><Bot className="w-4 h-4 text-violet-300"/><span className="font-semibold">AI ile Konuş / Komut Ver</span><span className="text-xs text-slate-500">Analiz, direktif ve kontrollü emir komutları</span></div>
      <div className="p-4 space-y-3 max-h-[390px] overflow-auto">{messages.length === 0 && <div className="text-sm text-slate-500">Örnek: “Sadece para girişine göre aç.” · “Derin analiz yap ve en güçlü coin için aç.” · “BTC long aç 10 USDT 10x.” · “Maksimum kaldıraç 8x yap.” · “Bana şu an ne tavsiye edersin?”</div>}{messages.map((m,i)=><div key={i} className={`${m.role==='user'?'ml-auto bg-violet-500/10 border-violet-400/20':'mr-auto bg-slate-900/60 border-slate-700/50'} max-w-[94%] rounded-xl border p-3 text-sm whitespace-pre-wrap`}>{m.content}</div>)}</div>
      <div className="p-3 border-t border-[#1e232f] flex gap-2"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Örn: derin analiz yap ve uygun fırsat varsa pozisyon aç..." className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm outline-none focus:border-violet-400/60"/><button onClick={()=>send()} disabled={busy||!message.trim()} className="px-4 rounded-xl bg-violet-500/20 border border-violet-400/30 text-violet-200 disabled:opacity-40"><Send className="w-4 h-4"/></button></div>
    </div>
  </div>;
};
