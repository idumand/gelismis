import React, { useEffect, useState, useRef } from 'react';
import { Activity, Radio } from 'lucide-react';

interface OrderBookVisualizerProps {
  pair?: string;
}

interface RecentTrade {
  price: number;
  qty: number;
  isBuyerMaker: boolean; // true = taker sell, false = taker buy
  time: number;
}

export const OrderBookVisualizer: React.FC<OrderBookVisualizerProps> = ({ pair = 'BTC/USDT' }) => {
  const [data, setData] = useState<any>(null);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [battleTimeline, setBattleTimeline] = useState<any[]>([]);
  const tradesBufferRef = useRef<RecentTrade[]>([]);
  const lastMetricsRef = useRef<any>(null);

  useEffect(() => {

    tradesBufferRef.current = [];

    // Calculate rolling flow metrics from real-time trades buffer
    const computeFlowMetrics = (currentMidPrice: number) => {
      const now = Date.now();
      // Keep trades from last 60 seconds
      tradesBufferRef.current = tradesBufferRef.current.filter(t => now - t.time <= 60000);
      
      let buyVolUSD = 0;
      let sellVolUSD = 0;
      let cumVolPrice = 0;
      let cumVol = 0;

      tradesBufferRef.current.forEach(t => {
        const valUSD = t.price * t.qty;
        cumVolPrice += t.price * t.qty;
        cumVol += t.qty;
        if (!t.isBuyerMaker) {
          buyVolUSD += valUSD; // Taker Buy
        } else {
          sellVolUSD += valUSD; // Taker Sell
        }
      });

      const totalVolUSD = buyVolUSD + sellVolUSD;
      const netInflowUSD = buyVolUSD - sellVolUSD;
      const takerBuyRatio = totalVolUSD > 0 ? buyVolUSD / totalVolUSD : 0.5;
      const vwap = cumVol > 0 ? cumVolPrice / cumVol : currentMidPrice;

      return {
        netInflowUSD,
        takerBuyRatio,
        vwap,
        totalTradesCount: tradesBufferRef.current.length
      };
    };

    // Futures-only UI: consume the server's validated local order book.
    let cancelled = false;
    const pollServerOrderBook = async () => {
      try {
        const res = await fetch(`/api/v1/orderbook?symbol=${encodeURIComponent(pair)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const ob = json?.orderBook;
        if (!ob?.bids?.length || !ob?.asks?.length) return;
        const nextBids = ob.bids.map((b:any)=>[Number(b[0]), Number(b[1])]);
        const nextAsks = ob.asks.map((a:any)=>[Number(a[0]), Number(a[1])]);
        setData(json);
        setIsLiveConnected(true);
      } catch {
        if (!cancelled) setIsLiveConnected(false);
      }
    };
    pollServerOrderBook();
    const pollTimer = window.setInterval(pollServerOrderBook, 500);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [pair]);

  // Keep a compact rolling capital-battle timeline. This is intentionally UI-side only;
  // the server remains the source of truth for trading decisions.
  React.useEffect(() => {
    const metrics = data?.metrics;
    if (!metrics) return;
    const row = {
      ts: Date.now(),
      long: Number(metrics.aggressiveLongPct || 50),
      short: Number(metrics.aggressiveShortPct || 50),
      delta: Number(metrics.aggressiveMoneyDeltaUSD || 0),
      dominant: metrics.dominantMoneySide || 'BALANCED',
      durability: Number(metrics.pressureDurabilityScore || 0),
      resistance: Number(metrics.opposingResistanceScore || 0),
      erosion: Number(metrics.erosionRiskScore || 0),
      efficiency: Number(metrics.capitalEfficiencyScore || 0),
      target: Number(metrics.liveTargetPrice || metrics.expectedTargetPrice || 0),
    };
    setBattleTimeline(prev => [...prev.slice(-11), row]);
  }, [data?.metrics?.aggressiveLongPct, data?.metrics?.aggressiveShortPct, data?.metrics?.aggressiveMoneyDeltaUSD,
      data?.metrics?.pressureDurabilityScore, data?.metrics?.opposingResistanceScore, data?.metrics?.erosionRiskScore,
      data?.metrics?.capitalEfficiencyScore, data?.metrics?.liveTargetPrice, data?.metrics?.expectedTargetPrice]);

  if (!data || !data.orderBook) {
    return (
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-6 h-64 flex flex-col items-center justify-center space-y-3">
        <Activity className="w-6 h-6 text-emerald-400 animate-spin" />
        <span className="text-xs font-mono text-slate-400">Canlı Derinlik & Emir Defteri Yükleniyor...</span>
      </div>
    );
  }

  const { orderBook, metrics } = data;
  const { 
    OBI = 0,
    aggressiveLongUSD = 0, aggressiveShortUSD = 0,
    aggressiveLongPct = 50, aggressiveShortPct = 50,
    aggressiveMoneyDeltaUSD = 0, aggressiveMoneyDeltaPct = 0,
    visibleBidLiquidityUSD = 0, visibleAskLiquidityUSD = 0,
    visibleBidLiquidityPct = 50, visibleAskLiquidityPct = 50,
    dominantMoneySide = 'BALANCED', pressureDurabilityScore = 0,
    opposingResistanceScore = 0, erosionRiskScore = 0,
    moneyFlowTrend = 0,
    priceMoveSinceFlowStart = 0, capitalEfficiencyScore = 0, directionalPriceResponsePct = 0,
    positionHealthScore = 0, exitThreat = '', liveTargetPrice = 0, targetExtensions = 0, expectedTargetPrice = 0, forecastConservativeUSD = 0, forecastOptimisticUSD = 0, 
    MicroPrice = 0, 
    MidPrice = 0, 
    currentPrice = MidPrice, 
    VWAP = MidPrice, 
    SpreadPct = 0, 
    takerBuyRatio = 0.5, 
    netInflowUSD = 0 
  } = metrics || {};
  
  const asks = (orderBook.asks || []).slice(0, 10).reverse();
  const bids = (orderBook.bids || []).slice(0, 10);
  
  let maxVol = 0.0001;
  asks.forEach((a: any) => { if (a[1] > maxVol) maxVol = a[1]; });
  bids.forEach((b: any) => { if (b[1] > maxVol) maxVol = b[1]; });

  const getWidth = (vol: number) => Math.min(100, (vol / maxVol) * 100) + '%';

  const isNetInflowPositive = (netInflowUSD || 0) >= 0;
  const buyDominancePct = takerBuyRatio !== undefined ? Math.round(takerBuyRatio * 100) : 50;

  return (
    <div className="bg-[#151921] border border-[#1e232f] rounded-xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232f] bg-[#0f1218] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-sm text-slate-200">
            Binance Futures Derin Analiz & Para Girişi Monitörü (Futures Tahta)
          </h3>
          <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
            isLiveConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
          }`}>
            <Radio className={`w-2.5 h-2.5 ${isLiveConnected ? 'animate-pulse' : ''}`} />
            <span>{isLiveConnected ? 'BINANCE FUTURES CANLI' : 'GÜNCELLENİYOR'}</span>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded transition-colors duration-300 ${
            isNetInflowPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
          }`}>
            {isNetInflowPositive ? 'Net Giriş: +' : 'Net Çıkış: '}${Math.abs(Math.round(netInflowUSD || 0)).toLocaleString()}
          </span>
        </div>
      </div>
      
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Metrikler */}
        <div className="space-y-3">
          {/* Para Akışı & Balina Baskısı */}
          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Anlık Para Girişi / Taker Akışı (60sn)</span>
              <span className={`text-xs font-mono font-bold ${buyDominancePct >= 55 ? 'text-emerald-400' : buyDominancePct <= 45 ? 'text-rose-400' : 'text-slate-400'}`}>
                %{buyDominancePct} Alıcı / %{100 - buyDominancePct} Satıcı
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${buyDominancePct}%` }} />
              <div className="h-full bg-rose-500 transition-all duration-200" style={{ width: `${100 - buyDominancePct}%` }} />
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Gerçekleşen Agresif Para (son pencere)</span>
              <span className={`text-[10px] font-bold ${dominantMoneySide==='LONG'?'text-emerald-400':dominantMoneySide==='SHORT'?'text-rose-400':'text-slate-400'}`}>BASKIN: {dominantMoneySide}</span>
            </div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-emerald-400">LONG ${Number(aggressiveLongUSD).toLocaleString(undefined,{maximumFractionDigits:0})} (%{Number(aggressiveLongPct).toFixed(1)})</span>
              <span className="text-rose-400">SHORT ${Number(aggressiveShortUSD).toLocaleString(undefined,{maximumFractionDigits:0})} (%{Number(aggressiveShortPct).toFixed(1)})</span>
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{width:`${Math.max(0,Math.min(100,Number(aggressiveLongPct)))}%`}} />
              <div className="h-full bg-rose-500 transition-all" style={{width:`${Math.max(0,Math.min(100,Number(aggressiveShortPct)))}%`}} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="text-slate-400">Net: <span className={aggressiveMoneyDeltaUSD>=0?'text-emerald-400':'text-rose-400'}>{aggressiveMoneyDeltaUSD>=0?'+':''}${Number(aggressiveMoneyDeltaUSD).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
              <div className="text-slate-400 text-right">Değişim: <span className={moneyFlowTrend>=0?'text-emerald-400':'text-rose-400'}>{moneyFlowTrend>=0?'+':''}{Number(moneyFlowTrend).toFixed(1)} puan</span></div>
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Capital Battle Timeline</span>
              <span className={`text-[10px] font-bold ${dominantMoneySide==='LONG'?'text-emerald-400':dominantMoneySide==='SHORT'?'text-rose-400':'text-slate-400'}`}>
                {dominantMoneySide === 'BALANCED' ? 'DENGE' : `${dominantMoneySide} BASKIN`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-2">
              <div className="text-emerald-400">LONG %{Number(aggressiveLongPct).toFixed(1)}</div>
              <div className="text-rose-400 text-right">SHORT %{Number(aggressiveShortPct).toFixed(1)}</div>
            </div>
            <div className="space-y-1.5">
              {battleTimeline.slice(-6).map((r, i) => (
                <div key={`${r.ts}-${i}`} className="grid grid-cols-[42px_1fr_1fr] gap-2 items-center text-[9px] font-mono">
                  <span className="text-slate-500">-{(battleTimeline.slice(-1)[0]?.ts - r.ts > 0 ? Math.round((battleTimeline.slice(-1)[0].ts-r.ts)/1000) : 0)}s</span>
                  <div className="h-1.5 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{width:`${Math.max(0,Math.min(100,r.long))}%`}} /></div>
                  <div className="h-1.5 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-rose-500" style={{width:`${Math.max(0,Math.min(100,r.short))}%`}} /></div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-mono">
              <div>DAYANIKLILIK <b className="text-white">{pressureDurabilityScore}</b></div>
              <div>ERİME <b className="text-white">{erosionRiskScore}</b></div>
              <div>VERİMLİLİK <b className="text-white">{Number(capitalEfficiencyScore).toFixed(0)}</b></div>
            </div>
            <div className="mt-2 text-[9px] text-slate-500">
              Çok para + az fiyat tepkisi = olası emilim/direnç. Para yön değiştirirse pozisyon risk motoru bunu ayrıca değerlendirir.
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Görünen Emir Defteri Likiditesi</span>
              <span className="text-[10px] text-slate-500">50 seviye</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-emerald-400">BID ${Number(visibleBidLiquidityUSD).toLocaleString(undefined,{maximumFractionDigits:0})} (%{Number(visibleBidLiquidityPct).toFixed(1)})</span>
              <span className="text-rose-400">ASK ${Number(visibleAskLiquidityUSD).toLocaleString(undefined,{maximumFractionDigits:0})} (%{Number(visibleAskLiquidityPct).toFixed(1)})</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="h-full bg-emerald-500/80" style={{width:`${Math.max(0,Math.min(100,Number(visibleBidLiquidityPct)))}%`}} />
              <div className="h-full bg-rose-500/80" style={{width:`${Math.max(0,Math.min(100,Number(visibleAskLiquidityPct)))}%`}} />
            </div>
            <div className="mt-2 text-[10px] text-slate-500">Not: Defterde bekleyen emirler gerçek açık pozisyon değildir; iptal edilebilir.</div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Hedef Sonrası Karar Motoru</span>
              <span className={`text-[10px] font-bold ${Number(capitalEfficiencyScore)>=65?'text-emerald-400':Number(capitalEfficiencyScore)<=30?'text-amber-300':'text-slate-300'}`}>
                {Number(capitalEfficiencyScore)>=65 ? 'DEVAM POTANSİYELİ' : Number(capitalEfficiencyScore)<=30 ? 'DİRENÇ / EMİLİM' : 'İZLE'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>Canlı hedef <b className="text-white">${Number(liveTargetPrice || 0).toFixed(4)}</b></div>
              <div className="text-right">Uzatma <b className="text-emerald-400">{targetExtensions}</b></div>
              <div>Fiyat tepkisi <b className={directionalPriceResponsePct>=0?'text-emerald-400':'text-rose-400'}>{directionalPriceResponsePct>=0?'+':''}{Number(directionalPriceResponsePct).toFixed(3)}%</b></div>
              <div className="text-right">Direnç <b className="text-white">{opposingResistanceScore}/100</b></div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-mono">
              <div className="bg-slate-900/60 rounded px-2 py-1">BAZ <b className="text-white">${Number(expectedTargetPrice||0).toFixed(4)}</b></div>
              <div className="bg-slate-900/60 rounded px-2 py-1">KORUMACI <b className="text-white">${Number(forecastConservativeUSD||0).toFixed(2)}</b></div>
              <div className="bg-slate-900/60 rounded px-2 py-1">İYİ SENARYO <b className="text-white">${Number(forecastOptimisticUSD||0).toFixed(2)}</b></div>
            </div>
            <div className="mt-2 text-[9px] text-slate-500">Hedefe ulaşıldığında para aynı yönde güçlü ve verimli kalıyorsa hedef genişletilebilir; baskı tersine dönerse çıkış/risk azaltma devreye girer.</div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400">Pozisyon Savaşı / Risk</span>
              <span className={`text-xs font-bold ${exitThreat==='REVERSAL'||exitThreat==='HIGH'?'text-rose-400':exitThreat==='LOW'?'text-emerald-400':'text-amber-300'}`}>{exitThreat || 'WATCH'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] font-mono">
              <div>Dayanıklılık <b className="text-white">{pressureDurabilityScore}</b></div>
              <div>Direnç <b className="text-white">{opposingResistanceScore}</b></div>
              <div>Erime <b className="text-white">{erosionRiskScore}</b></div>
            </div>
            {liveTargetPrice > 0 && <div className="mt-2 text-[10px] text-slate-400">Canlı hedef: <b className="text-white">${Number(liveTargetPrice).toFixed(4)}</b> · Uzatma: <b className="text-emerald-400">{targetExtensions}</b></div>}
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Order Book Imbalance (OBI)</span>
            <div className="flex items-end justify-between">
              <span className={`text-xl font-bold font-mono ${OBI > 0.20 ? 'text-emerald-400' : OBI < -0.20 ? 'text-rose-400' : 'text-slate-300'}`}>
                {OBI > 0 ? '+' : ''}{OBI.toFixed(3)}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {OBI > 0.20 ? 'Alış Duvarı Hakim (Boğa Baskısı)' : OBI < -0.20 ? 'Satış Duvarı Hakim (Ayı Baskısı)' : 'Dengeli Defter'}
              </span>
            </div>
            {/* OBI Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 flex">
              <div className="h-full bg-rose-500 rounded-l-full transition-all duration-150" style={{ width: `${Math.max(0, ((-OBI) / 1) * 100)}%` }} />
              <div className="h-full bg-emerald-500 rounded-r-full transition-all duration-150" style={{ width: `${Math.max(0, (OBI / 1) * 100)}%` }} />
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Micro-Price vs Mid-Price (Hacim Ağırlıklı Gerçek Değer)</span>
            <div className="flex flex-col space-y-1">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">Micro-Price:</span>
                <span className={MicroPrice > MidPrice ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>${MicroPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">Mid-Price:</span>
                <span className="text-slate-300">${MidPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          {/* Yeni Matematiksel Metrikler */}
          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1" title="Hacim Ağırlıklı Ortalama Fiyat">VWAP</span>
              <span className="text-sm font-bold font-mono text-blue-400">
                ${VWAP ? VWAP.toFixed(2) : MidPrice.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1" title="Spread (Sürtünme Maliyeti)">SPREAD</span>
              <span className={`text-sm font-bold font-mono ${SpreadPct && SpreadPct > 0.0005 ? 'text-rose-400' : 'text-slate-300'}`}>
                {SpreadPct ? (SpreadPct * 100).toFixed(4) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Emir Defteri (Bids & Asks) */}
        <div className="bg-[#0b0e14] border border-[#2a3142] rounded-lg overflow-hidden flex flex-col font-mono text-[10px]">
          <div className="grid grid-cols-3 px-3 py-1.5 border-b border-[#2a3142] bg-[#151921] text-slate-400 uppercase font-semibold">
            <span>Fiyat (USDT)</span>
            <span className="text-right">Miktar</span>
            <span className="text-right">Hacim</span>
          </div>
          
          <div className="flex flex-col">
            {/* Asks (Sells) */}
            <div className="flex flex-col-reverse">
              {asks.map((ask: any, i: number) => (
                <div key={`ask-${i}`} className="grid grid-cols-3 px-3 py-1 hover:bg-slate-800/50 relative group transition-colors">
                  <div className="absolute top-0 right-0 h-full bg-rose-500/15 z-0 transition-all duration-150" style={{ width: getWidth(ask[1]) }} />
                  <span className="text-rose-400 z-10 font-bold">${Number(ask[0]).toFixed(2)}</span>
                  <span className="text-right text-slate-300 z-10">{Number(ask[1]).toFixed(4)}</span>
                  <span className="text-right text-slate-500 z-10">{(ask[0] * ask[1]).toFixed(0)}</span>
                </div>
              ))}
            </div>

            {/* Spread / Current Price */}
            <div className="py-2 px-3 border-y border-[#2a3142] bg-[#151921]/60 flex items-center justify-between">
              <span className="text-slate-400 font-semibold uppercase text-[9px]">Son İşlem Fiyatı</span>
              <span className="text-base font-bold text-white flex items-center font-mono">
                ${currentPrice.toFixed(2)}
              </span>
            </div>

            {/* Bids (Buys) */}
            <div>
              {bids.map((bid: any, i: number) => (
                <div key={`bid-${i}`} className="grid grid-cols-3 px-3 py-1 hover:bg-slate-800/50 relative group transition-colors">
                  <div className="absolute top-0 right-0 h-full bg-emerald-500/15 z-0 transition-all duration-150" style={{ width: getWidth(bid[1]) }} />
                  <span className="text-emerald-400 z-10 font-bold">${Number(bid[0]).toFixed(2)}</span>
                  <span className="text-right text-slate-300 z-10">{Number(bid[1]).toFixed(4)}</span>
                  <span className="text-right text-slate-500 z-10">{(bid[0] * bid[1]).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


