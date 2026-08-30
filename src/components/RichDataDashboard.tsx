import React, { useState, useEffect } from 'react';
import { BarChart3, Activity, Zap, AlertTriangle } from 'lucide-react';

interface CoinData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  orderBookScore: number; // 0-100, 50=balanced
  viabilityScore: number;
  suggestedAction: 'ENTER' | 'WATCH' | 'SKIP' | 'CLOSE';
  estimatedProfit: number;
  confidence: number;
}

interface RichDataDashboardProps {
  coins: CoinData[];
  selectedCoin?: string;
  onCoinSelect: (symbol: string) => void;
  isLoading?: boolean;
}

export function RichDataDashboard({
  coins,
  selectedCoin,
  onCoinSelect,
  isLoading = false
}: RichDataDashboardProps) {
  const [sortBy, setSortBy] = useState<'viability' | 'profit' | 'volume' | 'change'>('viability');
  const [filterAction, setFilterAction] = useState<'ALL' | 'ENTER' | 'WATCH' | 'SKIP' | 'CLOSE'>('ALL');

  const sortedCoins = [...coins].sort((a, b) => {
    switch (sortBy) {
      case 'viability':
        return b.viabilityScore - a.viabilityScore;
      case 'profit':
        return b.estimatedProfit - a.estimatedProfit;
      case 'volume':
        return b.volume24h - a.volume24h;
      case 'change':
        return Math.abs(b.change24h) - Math.abs(a.change24h);
      default:
        return 0;
    }
  });

  const filteredCoins = sortBy === 'viability' 
    ? sortedCoins.filter(c => filterAction === 'ALL' || c.suggestedAction === filterAction)
    : sortedCoins;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'ENTER':
        return 'bg-green-50 border-green-300 text-green-900';
      case 'WATCH':
        return 'bg-blue-50 border-blue-300 text-blue-900';
      case 'SKIP':
        return 'bg-red-50 border-red-300 text-red-900';
      case 'CLOSE':
        return 'bg-yellow-50 border-yellow-300 text-yellow-900';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-900';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'ENTER': return '✅';
      case 'WATCH': return '👀';
      case 'SKIP': return '❌';
      case 'CLOSE': return '⚠️';
      default: return '❓';
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="text-indigo-600" size={28} />
        <h2 className="text-2xl font-bold text-gray-900">Canlı Veri Akışı</h2>
        {isLoading && <div className="ml-auto flex items-center gap-2 text-sm text-indigo-600">
          <Activity size={16} className="animate-pulse" />
          Güncelleniyor...
        </div>}
      </div>

      {/* Controls */}
      <div className="mb-6 bg-white rounded-lg p-4 border border-gray-300 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">Sırala:</label>
            <div className="flex gap-2">
              {['viability', 'profit', 'volume', 'change'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setSortBy(opt as any)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    sortBy === opt
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {opt === 'viability' && '📊 Uygunluk'}
                  {opt === 'profit' && '💰 Kar'}
                  {opt === 'volume' && '📈 Hacim'}
                  {opt === 'change' && '📉 Değişim'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">Filtre:</label>
            <div className="flex gap-2">
              {['ALL', 'ENTER', 'WATCH', 'SKIP'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterAction(opt as any)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    filterAction === opt
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {opt === 'ALL' && 'Hepsi'}
                  {opt === 'ENTER' && '✅ Gir'}
                  {opt === 'WATCH' && '👀 İzle'}
                  {opt === 'SKIP' && '❌ Atla'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Coins Table */}
      <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
        {filteredCoins.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            <AlertTriangle className="mx-auto mb-3 text-yellow-500" size={32} />
            <p className="font-semibold mb-1">Veri bulunamadı</p>
            <p className="text-sm">Filtreleri kontrol edin veya bekleyin...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700">Coin</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-700">Fiyat</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-700">24h %</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-700">Hacim (24h)</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-700">Baskınlık</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-700">Uygunluk</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-700">Tahmini Kar</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-700">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoins.map((coin, idx) => (
                  <tr
                    key={coin.symbol}
                    onClick={() => onCoinSelect(coin.symbol)}
                    className={`border-b border-gray-200 cursor-pointer transition-all hover:bg-indigo-50 ${
                      selectedCoin === coin.symbol ? 'bg-indigo-100' : ''
                    } ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-bold text-gray-900">{coin.symbol}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                      ${coin.price.toFixed(4)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      coin.change24h > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {coin.change24h > 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 text-sm">
                      ${(coin.volume24h / 1e6).toFixed(1)}M
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-block">
                        <div className="flex h-6 w-20 rounded overflow-hidden bg-gray-200">
                          <div
                            className="bg-red-400"
                            style={{ width: `${50 - (coin.orderBookScore - 50) / 2}%` }}
                          />
                          <div
                            className="bg-green-400"
                            style={{ width: `${50 + (coin.orderBookScore - 50) / 2}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-600 text-center mt-1">
                          {coin.orderBookScore > 50 ? '↑' : coin.orderBookScore < 50 ? '↓' : '↕'} {Math.abs(coin.orderBookScore - 50).toFixed(0)}%
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-block">
                        <div className="w-12 h-6 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              coin.viabilityScore >= 75 ? 'bg-green-500' :
                              coin.viabilityScore >= 50 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${coin.viabilityScore}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-600 text-center mt-1 font-bold">
                          {coin.viabilityScore.toFixed(0)}%
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${
                      coin.estimatedProfit > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ${coin.estimatedProfit.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-center border-l-4 ${getActionColor(coin.suggestedAction)}`}>
                      <span className="text-lg">{getActionIcon(coin.suggestedAction)}</span>
                      <div className="text-xs font-semibold mt-1">
                        {coin.suggestedAction === 'ENTER' && 'GİR'}
                        {coin.suggestedAction === 'WATCH' && 'İZLE'}
                        {coin.suggestedAction === 'SKIP' && 'ATLA'}
                        {coin.suggestedAction === 'CLOSE' && 'KAPAT'}
                      </div>
                      <div className="text-xs text-gray-600">{coin.confidence}%</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
          <div className="text-xs text-green-700 font-semibold mb-1">GİREBİLECEK</div>
          <div className="text-2xl font-bold text-green-600">
            {filteredCoins.filter(c => c.suggestedAction === 'ENTER').length}
          </div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
          <div className="text-xs text-blue-700 font-semibold mb-1">İZLEMELİ</div>
          <div className="text-2xl font-bold text-blue-600">
            {filteredCoins.filter(c => c.suggestedAction === 'WATCH').length}
          </div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-xs text-red-700 font-semibold mb-1">ATLANACAK</div>
          <div className="text-2xl font-bold text-red-600">
            {filteredCoins.filter(c => c.suggestedAction === 'SKIP').length}
          </div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
          <div className="text-xs text-yellow-700 font-semibold mb-1">KAPATILACAK</div>
          <div className="text-2xl font-bold text-yellow-600">
            {filteredCoins.filter(c => c.suggestedAction === 'CLOSE').length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RichDataDashboard;
