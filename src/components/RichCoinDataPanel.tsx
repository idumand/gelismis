import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  Zap,
  BarChart3,
  Activity,
  DollarSign,
} from 'lucide-react';

interface CoinData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap?: number;
  orderBookPressure?: number;
  volumeIn24h?: number;
  dominantSide?: 'long' | 'short' | 'balanced';
  liquidityScore?: number;
}

interface RichCoinDataPanelProps {
  coins: CoinData[];
  selectedCoin?: string;
  onSelectCoin?: (symbol: string) => void;
  mode: 'manual' | 'algorithm';
}

export function RichCoinDataPanel({
  coins,
  selectedCoin,
  onSelectCoin,
  mode,
}: RichCoinDataPanelProps) {
  const [expandedCoin, setExpandedCoin] = useState<string | null>(selectedCoin || null);
  const [showDetails, setShowDetails] = useState(false);

  // Coinleri sırala (volatility + volume)
  const sortedCoins = [...coins].sort((a, b) => {
    if (mode === 'algorithm') {
      // Algoritma modu: oynaklık + volume + order book baskısı
      const scoreA =
        Math.abs(a.change24h) * (a.volume24h / 1000000) * (a.orderBookPressure || 0.5);
      const scoreB =
        Math.abs(b.change24h) * (b.volume24h / 1000000) * (b.orderBookPressure || 0.5);
      return scoreB - scoreA;
    } else {
      // Manual modu: seçili coinler önce, sonra volume
      return (b.volume24h || 0) - (a.volume24h || 0);
    }
  });

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-900/50 to-blue-900/50 border border-indigo-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-white">
            {mode === 'algorithm' ? '🤖 Algoritma Seçkileri' : '📊 Coin Verileri'}
          </h3>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm px-3 py-1 rounded-lg bg-indigo-700/50 hover:bg-indigo-600/50 text-indigo-300 font-semibold transition"
        >
          {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Coin Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {sortedCoins.slice(0, mode === 'algorithm' ? 5 : 10).map((coin) => {
          const isSelected = selectedCoin === coin.symbol;
          const isExpanded = expandedCoin === coin.symbol;
          const liquidityColor =
            (coin.liquidityScore || 0.5) > 0.7
              ? 'text-green-400'
              : (coin.liquidityScore || 0.5) > 0.4
                ? 'text-yellow-400'
                : 'text-red-400';

          return (
            <div
              key={coin.symbol}
              className={`rounded-lg border-2 transition ${
                isSelected
                  ? 'bg-purple-900/40 border-purple-500'
                  : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
              } cursor-pointer`}
              onClick={() => {
                onSelectCoin?.(coin.symbol);
                setExpandedCoin(isExpanded ? null : coin.symbol);
              }}
            >
              {/* Başlık */}
              <div className="p-3 flex items-start justify-between">
                <div>
                  <p className="font-bold text-white">{coin.symbol}</p>
                  <p className="text-xs text-gray-400">
                    ${coin.price.toFixed(coin.price < 1 ? 4 : 2)}
                  </p>
                </div>
                <div className={`text-right ${
                  coin.change24h > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  <div className="flex items-center gap-1 justify-end">
                    {coin.change24h > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="font-bold text-sm">
                      {coin.change24h > 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Hızlı İstatistikler */}
              {showDetails && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50 pt-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Volume */}
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-blue-400" />
                      <span className="text-gray-400">Vol:</span>
                      <span className="text-white font-mono text-[10px]">
                        ${(coin.volume24h / 1000000).toFixed(1)}M
                      </span>
                    </div>

                    {/* 24h Range */}
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span className="text-gray-400">Range:</span>
                      <span className="text-white font-mono text-[10px]">
                        {((coin.high24h - coin.low24h) / coin.low24h * 100).toFixed(1)}%
                      </span>
                    </div>

                    {/* High/Low */}
                    <div className="flex items-start gap-1 col-span-2">
                      <span className="text-gray-400 text-[10px]">H:</span>
                      <span className="text-green-400 text-[10px] font-mono">
                        ${coin.high24h.toFixed(2)}
                      </span>
                      <span className="text-gray-400 text-[10px]">L:</span>
                      <span className="text-red-400 text-[10px] font-mono">
                        ${coin.low24h.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Order Book & Flow (Algorithm modu için) */}
                  {mode === 'algorithm' && (
                    <div className="bg-gray-700/30 rounded p-2 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Order Book:</span>
                        <span className={`font-bold ${
                          (coin.orderBookPressure || 0) > 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {((coin.orderBookPressure || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Akış:</span>
                        <span className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                          coin.dominantSide === 'long'
                            ? 'bg-green-900/50 text-green-400'
                            : coin.dominantSide === 'short'
                              ? 'bg-red-900/50 text-red-400'
                              : 'bg-gray-600/50 text-gray-400'
                        }`}>
                          {coin.dominantSide || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Likidite:</span>
                        <span className={`font-bold text-[10px] ${liquidityColor}`}>
                          {((coin.liquidityScore || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selection Indicator */}
              {isSelected && (
                <div className="h-1 bg-gradient-to-r from-purple-500 to-blue-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* Seçili Coin Detay (Expanded) */}
      {expandedCoin && sortedCoins.find((c) => c.symbol === expandedCoin) && (
        <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-600/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-white text-lg">{expandedCoin} - Detaylı Analiz</h4>
            <button
              onClick={() => setExpandedCoin(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {(() => {
            const coin = sortedCoins.find((c) => c.symbol === expandedCoin);
            if (!coin) return null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-gray-800/50 rounded p-2">
                  <p className="text-gray-400 text-xs">Fiyat</p>
                  <p className="font-bold text-white">
                    ${coin.price.toFixed(coin.price < 1 ? 4 : 2)}
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded p-2">
                  <p className="text-gray-400 text-xs">24h Değişim</p>
                  <p className={`font-bold ${
                    coin.change24h > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {coin.change24h > 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded p-2">
                  <p className="text-gray-400 text-xs">24h Volume</p>
                  <p className="font-bold text-blue-400">
                    ${(coin.volume24h / 1000000).toFixed(1)}M
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded p-2">
                  <p className="text-gray-400 text-xs">Volatility</p>
                  <p className="font-bold text-yellow-400">
                    {((coin.high24h - coin.low24h) / coin.low24h * 100).toFixed(1)}%
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded p-2 sm:col-span-2">
                  <p className="text-gray-400 text-xs">24h High</p>
                  <p className="font-bold text-green-400">
                    ${coin.high24h.toFixed(coin.high24h < 1 ? 4 : 2)}
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded p-2 sm:col-span-2">
                  <p className="text-gray-400 text-xs">24h Low</p>
                  <p className="font-bold text-red-400">
                    ${coin.low24h.toFixed(coin.low24h < 1 ? 4 : 2)}
                  </p>
                </div>
              </div>
            );
          })()}

          {mode === 'algorithm' && (
            <div className="mt-3 p-3 bg-blue-900/30 border border-blue-600/50 rounded">
              <p className="text-xs text-blue-300 mb-2 font-semibold">Algoritma Puanı:</p>
              <div className="flex gap-2 text-xs">
                <div className="flex-1 text-center bg-gray-800/50 rounded p-2">
                  <p className="text-gray-400">OB Baskısı</p>
                  <p className={`font-bold ${
                    sortedCoins.find((c) => c.symbol === expandedCoin)?.orderBookPressure
                      ? (sortedCoins.find((c) => c.symbol === expandedCoin)?.orderBookPressure || 0) > 0
                        ? 'text-green-400'
                        : 'text-red-400'
                      : 'text-gray-400'
                  }`}>
                    {((sortedCoins.find((c) => c.symbol === expandedCoin)?.orderBookPressure || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
