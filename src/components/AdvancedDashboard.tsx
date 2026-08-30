import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { AlertCircle, TrendingUp, TrendingDown, Activity, Eye } from 'lucide-react';

interface CoinFlowData {
  symbol: string;
  currentPrice: number;
  volume24h: number;
  volumeChange: number;
  largeOrderVolume: number;
  buyPressure: number;
  sellPressure: number;
  netFlow: number;
  momentum: number;
  trend: 'up' | 'down' | 'neutral';
  confidence: number;
}

interface Signal {
  symbol: string;
  action: string;
  confidence: number;
  riskLevel: string;
  entryPrice: number;
  takeProfit1: number;
  stopLoss: number;
}

export const AdvancedDashboard: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [flowData, setFlowData] = useState<CoinFlowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState('BTC/USDT');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Her 5 saniyede güncelle
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];
      
      const response = await fetch('/api/v1/analyze-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });

      const data = await response.json();
      if (data.topSignals) {
        setSignals(data.topSignals.map((s: any) => s.signal));
      }
    } catch (error) {
      console.error('Veri alma hatası:', error);
    }
    setLoading(false);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-500';
      case 'MEDIUM': return 'text-yellow-500';
      case 'HIGH': return 'text-orange-500';
      case 'CRITICAL': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('BUY')) return 'bg-green-500/20 border-green-500/50 text-green-400';
    if (action.includes('SELL')) return 'bg-red-500/20 border-red-500/50 text-red-400';
    return 'bg-gray-500/20 border-gray-500/50 text-gray-400';
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-xl border border-slate-700 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Activity className="text-cyan-400" size={32} />
          Gelişmiş Ticaret Dashboard V4
        </h1>
        <p className="text-slate-400">Gerçek zamanlı para akışı analizi, sinyal üretimi ve pozisyon yönetimi</p>
      </div>

      {/* Üst İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm font-semibold mb-2">🎯 Aktif Sinyaller</div>
          <div className="text-3xl font-bold text-cyan-400">{signals.length}</div>
          <div className="text-xs text-slate-500 mt-1">Son güncelleme: {new Date().toLocaleTimeString('tr-TR')}</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm font-semibold mb-2">📈 Orta Güven</div>
          <div className="text-3xl font-bold text-green-400">
            {(signals.reduce((sum, s) => sum + s.confidence, 0) / (signals.length || 1)).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Ortalama güven skoru</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm font-semibold mb-2">⚠️ Risk Seviyesi</div>
          <div className="text-3xl font-bold text-orange-400">MEDIUM</div>
          <div className="text-xs text-slate-500 mt-1">Sistem genelinde</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm font-semibold mb-2">💰 Beklenen Oran</div>
          <div className="text-3xl font-bold text-purple-400">1:3.2</div>
          <div className="text-xs text-slate-500 mt-1">Risk/Ödül oranı</div>
        </div>
      </div>

      {/* Sinyal Tablosu */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="text-cyan-400" size={24} />
          Gerçek Zamanlı Sinyaller
        </h2>

        {loading && <div className="text-center text-slate-400 py-4">Yükleniyor...</div>}

        {!loading && signals.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            Henüz sinyal bulunamadı
          </div>
        )}

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {signals.map((signal, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-4 ${getActionColor(signal.action)}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-lg">{signal.symbol}</span>
                  <span className={`ml-3 px-3 py-1 rounded-full text-sm font-semibold ${
                    signal.action.includes('BUY') 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : 'bg-red-500/20 text-red-400 border border-red-500/50'
                  }`}>
                    {signal.action}
                  </span>
                </div>
                <div className={`text-right`}>
                  <div className="text-sm font-semibold">Güven: {(signal.confidence * 100).toFixed(1)}%</div>
                  <div className={`text-sm ${getRiskColor(signal.riskLevel)}`}>
                    Risk: {signal.riskLevel}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-slate-400 text-xs">Giriş</div>
                  <div className="font-semibold text-white">${signal.entryPrice.toFixed(2)}</div>
                </div>
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-slate-400 text-xs">TP1</div>
                  <div className="font-semibold text-green-400">${signal.takeProfit1.toFixed(2)}</div>
                </div>
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-slate-400 text-xs">SL</div>
                  <div className="font-semibold text-red-400">${signal.stopLoss.toFixed(2)}</div>
                </div>
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-slate-400 text-xs">Oran</div>
                  <div className="font-semibold text-purple-400">1:3.0</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grafik Bölümü */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sinyal Dağılımı */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">İşlem Türü Dağılımı</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'STRONG_BUY', value: signals.filter(s => s.action === 'STRONG_BUY').length },
                  { name: 'BUY', value: signals.filter(s => s.action === 'BUY').length },
                  { name: 'HOLD', value: signals.filter(s => s.action === 'HOLD').length },
                  { name: 'SELL', value: signals.filter(s => s.action === 'SELL').length }
                ].filter(item => item.value > 0)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                <Cell fill="#22c55e" />
                <Cell fill="#3b82f6" />
                <Cell fill="#eab308" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Seviyesi Dağılımı */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">Risk Seviyesi Dağılımı</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { name: 'LOW', value: signals.filter(s => s.riskLevel === 'LOW').length, fill: '#22c55e' },
              { name: 'MEDIUM', value: signals.filter(s => s.riskLevel === 'MEDIUM').length, fill: '#eab308' },
              { name: 'HIGH', value: signals.filter(s => s.riskLevel === 'HIGH').length, fill: '#f97316' },
              { name: 'CRITICAL', value: signals.filter(s => s.riskLevel === 'CRITICAL').length, fill: '#ef4444' }
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {[
                  { fill: '#22c55e' },
                  { fill: '#eab308' },
                  { fill: '#f97316' },
                  { fill: '#ef4444' }
                ].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bilgi Kutusu */}
      <div className="mt-8 bg-cyan-500/10 border border-cyan-500/50 rounded-lg p-4 flex gap-3">
        <AlertCircle className="text-cyan-400 mt-1 flex-shrink-0" size={20} />
        <div className="text-sm text-slate-300">
          <span className="font-semibold text-cyan-400">💡 Bilgi:</span> Bu sistem gerçek zamanlı para akışı analizini, 
          teknik göstergeleri ve makine öğrenme yöntemlerini birleştirerek en iyi ticaret fırsatlarını sunmaktadır.
          Lütfen her zaman risk yönetimi kurallarını takip edin.
        </div>
      </div>
    </div>
  );
};

export default AdvancedDashboard;
