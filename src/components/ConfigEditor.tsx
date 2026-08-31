import React, { useEffect, useState } from 'react';
import { Settings, Save, Shield, Search, X, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Zap, Target, Brain, Gauge } from 'lucide-react';

interface Props {
  initialConfigJson: string;
  onSaveConfig: (json: string) => Promise<void>;
  serverIp?: string;
  onBalanceUpdated?: (balance:number)=>void;
}

export const ConfigEditor: React.FC<Props> = ({initialConfigJson,onSaveConfig,serverIp='-',onBalanceUpdated}) => {
  const [cfg,setCfg]=useState<any>({});
  const [tab,setTab]=useState<'manual'|'algorithm'>('algorithm');
  const [stake,setStake]=useState('25');
  const [lev,setLev]=useState('12');
  const [minProfit,setMinProfit]=useState('0.5');
  const [maxPos,setMaxPos]=useState('1');
  const [stop,setStop]=useState('1.5');
  const [scan,setScan]=useState('12');
  const [score,setScore]=useState('56');
  const [search,setSearch]=useState('');
  const [results,setResults]=useState<string[]>([]);
  const [showKey,setShowKey]=useState(false);
  const [showSecret,setShowSecret]=useState(false);
  const [apiTest,setApiTest]=useState<any>(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    try{
      const c=JSON.parse(initialConfigJson||'{}');
      setCfg(c);
      setTab(c.entry_mode==='manual'?'manual':'algorithm');
      if(c.stake_amount!=null)setStake(String(c.stake_amount));
      if(c.leverage!=null)setLev(String(c.leverage));
      if(c.min_profit_pct_1x!=null)setMinProfit(String(c.min_profit_pct_1x));
      if(c.max_open_trades!=null)setMaxPos(String(c.max_open_trades));
      if(c.stop_loss_pct!=null)setStop(String(c.stop_loss_pct));
      if(c.max_scan_coins!=null)setScan(String(c.max_scan_coins));
      if(c.min_signal_score!=null)setScore(String(c.min_signal_score));
    }catch{}
  },[initialConfigJson]);

  useEffect(()=>{
    if(!search.trim()){setResults([]);return;}
    const timer=setTimeout(async()=>{
      try{
        const r=await fetch(`/api/v1/markets/search?q=${encodeURIComponent(search.trim())}`);
        const d=await r.json(); setResults(Array.isArray(d.markets)?d.markets.slice(0,20):[]);
      }catch{setResults([]);}
    },120);
    return ()=>clearTimeout(timer);
  },[search]);

  const update=(patch:any)=>setCfg((p:any)=>({...p,...patch}));
  const coins=cfg.exchange?.pair_whitelist||[];
  const addCoin=(c:string)=>{
    const pair=c.includes('/')?c.toUpperCase():`${c.toUpperCase()}/USDT`;
    const list=Array.from(new Set([...coins,pair]));
    setCfg((p:any)=>({...p,exchange:{...(p.exchange||{}),pair_whitelist:list}})); setSearch('');setResults([]);
  };
  const removeCoin=(c:string)=>setCfg((p:any)=>({...p,exchange:{...(p.exchange||{}),pair_whitelist:coins.filter((x:string)=>x!==c)}}));

  const save=async()=>{
    setSaving(true);
    try{
      const next={
        ...cfg,
        environment:cfg.environment==='live'?'live':'demo',
        entry_mode:tab,
        stake_amount:Math.max(1,Number(stake)||25),
        leverage:Math.min(125,Math.max(1,Number(lev)||15)),
        min_profit_pct_1x:Math.max(0.05,Number(minProfit)||0.5),
        max_open_trades:Math.min(8,Math.max(1,Number(maxPos)||1)),
        stop_loss_pct:Math.max(0.1,Number(stop)||1.5),
        max_scan_coins:Math.min(20,Math.max(8,Number(scan)||12)),
        min_signal_score:Math.min(90,Math.max(45,Number(score)||56))
      };
      setCfg(next); await onSaveConfig(JSON.stringify(next,null,2));
    }finally{setSaving(false);}
  };

  const testApi=async()=>{
    const key=(cfg.exchange?.key||'').trim(), secret=(cfg.exchange?.secret||'').trim();
    if(!key||!secret){setApiTest({success:false,message:'API Key ve Secret gerekli.'});return;}
    setApiTest(null);
    try{
      const r=await fetch('/api/v1/exchange-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:key,secretKey:secret})});
      const d=await r.json();setApiTest(d);if(d.success&&onBalanceUpdated)onBalanceUpdated(Number(d.balance_usdt||0));
    }catch{setApiTest({success:false,message:'Sunucuya bağlanılamadı.'});}
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between border-b border-[#1e232f] pb-3">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5 text-emerald-400"/> İşlem Motoru Ayarları</h2>
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm disabled:opacity-50"><Save className="w-4 h-4 inline mr-1"/>{saving?'Kaydediliyor':'Kaydet'}</button>
    </div>

    <div className="grid grid-cols-2 gap-2 p-1 bg-[#0b0e14] rounded-xl border border-[#2a3142]">
      <button onClick={()=>setTab('manual')} className={`py-3 rounded-lg font-bold text-sm ${tab==='manual'?'bg-blue-500/20 text-blue-300 border border-blue-500/40':'text-slate-400'}`}>MANUEL</button>
      <button onClick={()=>setTab('algorithm')} className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 ${tab==='algorithm'?'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40':'text-slate-400'}`}><Brain className="w-4 h-4"/> ALGORİTMA</button>
    </div>

    <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div><div className="text-sm font-bold text-white">Binance Futures Ortamı</div><div className="text-[11px] text-slate-500">Emir ve hesap ortamı; market verisi yalnızca Futures'tan gelir.</div></div>
        <select value={cfg.environment||'demo'} onChange={e=>update({environment:e.target.value})} className="bg-[#0b0e14] border border-slate-700 text-white rounded-lg px-3 py-2 text-sm font-mono">
          <option value="demo">DEMO / TEST</option><option value="live">LIVE</option>
        </select>
      </div>
      <div className={`p-3 rounded-lg border text-xs ${cfg.environment==='live'?'border-rose-500/40 bg-rose-500/10 text-rose-300':'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
        {cfg.environment==='live'?'LIVE: gerçek Binance Futures hesabına emir gönderilebilir.':'DEMO: gerçek para riski olmadan Binance Futures Demo Trading execution.'}
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-400"/> Sermaye & Kaldıraç</h3>
        <label className="text-xs text-slate-400">İşlem marjini (USDT)<input value={stake} onChange={e=>setStake(e.target.value)} type="number" min="1" step="any" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
        <label className="text-xs text-slate-400">Kaldıraç<input value={lev} onChange={e=>setLev(e.target.value)} type="number" min="1" max="125" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
        <label className="text-xs text-slate-400">Maksimum açık pozisyon<input value={maxPos} onChange={e=>setMaxPos(e.target.value)} type="number" min="1" max="8" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
      </div>

      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400"/> Kâr & Koruma</h3>
        <label className="text-xs text-slate-400">Minimum kâr hedefi — 1x fiyat hareketi %<input value={minProfit} onChange={e=>setMinProfit(e.target.value)} type="number" min="0.05" step="0.05" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
        <div className="text-[11px] text-emerald-300 bg-emerald-500/10 rounded-lg p-3">Örn. %0.50 girersen giriş için en az %0.50 ham fiyat hareketi aranır. x50 seçilirse arayüzde teorik ROE hedefi +%25 gösterilir. Komisyon ve slippage ayrıca düşülür.</div>
        <label className="text-xs text-slate-400">Acil zarar kes — 1x %<input value={stop} onChange={e=>setStop(e.target.value)} type="number" min="0.1" step="0.1" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
      </div>
    </div>

    {tab==='algorithm' ? <div className="bg-[#151921] border border-emerald-500/20 rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-sm text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-emerald-400"/> Algoritma Tarama</h3>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs text-slate-400">Tarama derinliği<input value={scan} onChange={e=>setScan(e.target.value)} type="number" min="8" max="20" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
        <label className="text-xs text-slate-400">Sinyal skoru<input value={score} onChange={e=>setScore(e.target.value)} type="number" min="45" max="90" className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 text-white font-mono"/></label>
      </div>
      <p className="text-[11px] text-slate-500">Algoritma önce Futures 24s hacim liderlerini seçer, sonra order book + taker akışı + likidite bariyerleriyle daha derin analiz yapar. Aşırı sıkı tek-indikatör filtresi kullanılmaz.</p>
    </div> :
    <div className="bg-[#151921] border border-blue-500/20 rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-sm text-white">Manuel işlem pariteleri</h3>
      <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="BTC, ETH, SOL..." className="w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 pl-9 text-white font-mono"/>
      {results.length>0&&<div className="absolute z-30 top-full left-0 right-0 bg-[#11141b] border border-slate-700 rounded-lg mt-1 max-h-48 overflow-auto">{results.map(x=><button key={x} onClick={()=>addCoin(x)} className="block w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-emerald-500/10">{x}</button>)}</div>}</div>
      <div className="flex flex-wrap gap-2">{coins.map((c:string)=><span key={c} className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono">{c}<button onClick={()=>removeCoin(c)} className="ml-2 text-slate-500 hover:text-rose-400"><X className="inline w-3 h-3"/></button></span>)}</div>
      <p className="text-[11px] text-slate-500">Manuel modda otomatik seçim yapılmaz; seçtiğin coinler üzerinden manuel LONG/SHORT emirleri kullanılır.</p>
    </div>}

    <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between"><h3 className="font-bold text-sm text-white flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400"/> Binance Futures API</h3><button onClick={testApi} className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs"><RefreshCw className="inline w-3 h-3 mr-1"/> Test</button></div>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="text-xs text-slate-400">API Key<div className="relative"><input type={showKey?'text':'password'} value={cfg.exchange?.key||''} onChange={e=>setCfg((p:any)=>({...p,exchange:{...(p.exchange||{}),key:e.target.value}}))} className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 pr-9 text-white font-mono"/><button type="button" onClick={()=>setShowKey(!showKey)} className="absolute right-2 top-3 text-slate-500">{showKey?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div></label>
        <label className="text-xs text-slate-400">API Secret<div className="relative"><input type={showSecret?'text':'password'} value={cfg.exchange?.secret||''} onChange={e=>setCfg((p:any)=>({...p,exchange:{...(p.exchange||{}),secret:e.target.value}}))} className="mt-1 w-full bg-[#0b0e14] border border-slate-700 rounded-lg p-3 pr-9 text-white font-mono"/><button type="button" onClick={()=>setShowSecret(!showSecret)} className="absolute right-2 top-3 text-slate-500">{showSecret?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div></label>
      </div>
      <div className="text-[11px] text-slate-500">Render IP: <span className="font-mono text-slate-300">{serverIp}</span> · Withdrawal yetkisini kapalı tut.</div>
      {apiTest&&<div className={`p-3 rounded-lg border text-xs ${apiTest.success?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>{apiTest.message|| (apiTest.success?'Bağlantı başarılı.':'Bağlantı başarısız.')}</div>}
    </div>
  </div>;
};
