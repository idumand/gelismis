import React, { useEffect, useState } from 'react';
import { Activity, Radio } from 'lucide-react';

interface OrderBookVisualizerProps {
  pair?: string;
}

export const OrderBookVisualizer: React.FC<OrderBookVisualizerProps> = ({ pair = 'BTC/USDT' }) => {
  const [data, setData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchOrderBook = async () => {
      try {
        const res = await fetch(`/api/v1/orderbook?symbol=${encodeURIComponent(pair)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json?.orderBook) throw new Error(json?.error || 'Order book unavailable');
        if (!mounted) return;
        setData(json);
        setIsConnected(true);
      } catch {
        if (mounted) setIsConnected(false);
      }
    };

    fetchOrderBook();
    timer = setInterval(fetchOrderBook, 1000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [pair]);

  if (!data || !data.orderBook) {
    return (
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-6 h-64 flex flex-col items-center justify-center space-y-3">
        <Activity className="w-6 h-6 text-emerald-400 animate-spin" />
        <span className="text-xs font-mono text-slate-400">Binance Futures emir defteri yükleniyor...</span>
      </div>
    );
  }

  const { orderBook, metrics = {} } = data;
  const {
    OBI = 0,
    MicroPrice = 0,
    MidPrice = 0,
    currentPrice = MidPrice,
    VWAP = MidPrice,
    SpreadPct = 0,
    takerBuyRatio = 0.5,
    netInflowUSD = 0,
    predictive30LongScore = 0,
    predictive30ShortScore = 0,
    orderFlowGap = 0,
  } = metrics;

  const asks = (orderBook.asks || []).slice(0, 10).reverse();
  const bids = (orderBook.bids || []).slice(0, 10);
  let maxVol = 0.0001;
  [...asks, ...bids].forEach((x: any) => { if (x[1] > maxVol) maxVol = x[1]; });
  const getWidth = (vol: number) => `${Math.min(100, (vol / maxVol) * 100)}%`;
  const buyDominancePct = Math.round(takerBuyRatio * 100);
  const longScore = Math.round(Number(predictive30LongScore) || 0);
  const shortScore = Math.round(Number(predictive30ShortScore) || 0);

  return (
    <div className="bg-[#151921] border border-[#1e232f] rounded-xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232f] bg-[#0f1218] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-sm text-slate-200">Binance Futures Emir Defteri & Order Flow</h3>
          <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'}`}>
            <Radio className={`w-2.5 h-2.5 ${isConnected ? 'animate-pulse' : ''}`} />
            <span>{isConnected ? 'SUNUCU AKIŞI' : 'BEKLENİYOR'}</span>
          </span>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${netInflowUSD >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          {netInflowUSD >= 0 ? 'Net Giriş: +' : 'Net Çıkış: '}${Math.abs(Math.round(netInflowUSD)).toLocaleString()}
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Taker Akışı</span>
              <span className="text-xs font-mono font-bold text-slate-300">%{buyDominancePct} Alıcı / %{100 - buyDominancePct} Satıcı</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${buyDominancePct}%` }} />
              <div className="h-full bg-rose-500 transition-all duration-200" style={{ width: `${100 - buyDominancePct}%` }} />
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">30 Seviye Çift Taraflı Skor</span>
              <span className="text-xs font-mono text-slate-300">Fark: {Number(orderFlowGap || 0).toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-xs font-mono mb-1"><span className="text-emerald-400">LONG %{longScore}</span><span className="text-rose-400">SHORT %{shortScore}</span></div>
            <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, longScore))}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${Math.max(0, Math.min(100, shortScore))}%` }} />
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 border border-[#2a3142] rounded-lg">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Order Book Imbalance</span>
            <div className="flex items-end justify-between">
              <span className={`text-xl font-bold font-mono ${OBI > 0.2 ? 'text-emerald-400' : OBI < -0.2 ? 'text-rose-400' : 'text-slate-300'}`}>{OBI > 0 ? '+' : ''}{Number(OBI).toFixed(3)}</span>
              <span className="text-xs text-slate-400 font-mono">{OBI > 0.2 ? 'Alış hakim' : OBI < -0.2 ? 'Satış hakim' : 'Dengeli'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
            <div className="bg-[#0b0e14] p-2 rounded border border-[#2a3142]">Mid: {Number(currentPrice).toFixed(4)}</div>
            <div className="bg-[#0b0e14] p-2 rounded border border-[#2a3142]">VWAP: {Number(VWAP).toFixed(4)}</div>
            <div className="bg-[#0b0e14] p-2 rounded border border-[#2a3142]">Spread: {(Number(SpreadPct) * 100).toFixed(4)}%</div>
            <div className="bg-[#0b0e14] p-2 rounded border border-[#2a3142]">Micro: {Number(MicroPrice).toFixed(4)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="text-[10px] uppercase font-bold text-slate-400">Satışlar (ilk 10 gösteriliyor, motor 30 seviye izler)</div>
          {asks.map((a: any, i: number) => (
            <div key={`a-${i}`} className="relative flex items-center justify-between px-2 py-1.5 bg-[#1b1116] rounded border border-rose-900/30 overflow-hidden">
              <div className="absolute inset-y-0 right-0 bg-rose-500/10" style={{ width: getWidth(a[1]) }} />
              <span className="relative z-10 text-xs font-mono text-rose-300">{Number(a[0]).toFixed(4)}</span>
              <span className="relative z-10 text-xs font-mono text-slate-300">{Number(a[1]).toFixed(4)}</span>
            </div>
          ))}
          <div className="h-px bg-slate-700 my-1" />
          <div className="text-[10px] uppercase font-bold text-slate-400">Alışlar</div>
          {bids.map((b: any, i: number) => (
            <div key={`b-${i}`} className="relative flex items-center justify-between px-2 py-1.5 bg-[#101a15] rounded border border-emerald-900/30 overflow-hidden">
              <div className="absolute inset-y-0 right-0 bg-emerald-500/10" style={{ width: getWidth(b[1]) }} />
              <span className="relative z-10 text-xs font-mono text-emerald-300">{Number(b[0]).toFixed(4)}</span>
              <span className="relative z-10 text-xs font-mono text-slate-300">{Number(b[1]).toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
