import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Brain, Zap, TrendingUp, TrendingDown } from 'lucide-react';

interface AlgorithmBrainProps {
  positionDecision: any;
  positionMonitor: any;
  marketPressure: any;
  orderBook: any;
  tradeFlow: any;
  currentPrice: number;
}

export function AlgorithmBrain({
  positionDecision,
  positionMonitor,
  marketPressure,
  orderBook,
  tradeFlow,
  currentPrice,
}: AlgorithmBrainProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');

  const getTrendColor = (value: number) => {
    if (value > 0.5) return 'text-green-400';
    if (value > 0.15) return 'text-blue-400';
    if (value > -0.15) return 'text-gray-400';
    if (value > -0.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getPressureBar = (pressure: number) => {
    const percentage = ((pressure + 1) / 2) * 100;
    return (
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              pressure > 0.3
                ? 'bg-green-500'
                : pressure > 0.1
                ? 'bg-blue-500'
                : pressure > -0.1
                ? 'bg-gray-500'
                : pressure > -0.3
                ? 'bg-orange-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${Math.abs(percentage - 50) + 50}%` }}
          />
        </div>
        <span className="text-xs font-bold text-gray-300 w-8 text-right">
          {pressure > 0 ? '+' : ''}{(pressure * 100).toFixed(0)}%
        </span>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-b border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-bold text-white">🧠 Algoritmanın Beyni</h3>
          <Zap className="w-4 h-4 text-yellow-400 ml-auto" />
        </div>
        <p className="text-xs text-gray-400">Gerçek zamanlı karar süreci</p>
      </div>

      {/* İçerik */}
      <div className="space-y-2 p-4">
        {/* GENEL DURUM */}
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'overview' ? null : 'overview')}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-white">📊 GENEL DURUM</span>
              <span className="text-xs text-gray-400 ml-2">
                {marketPressure?.trendDirection || 'UNKNOWN'}
              </span>
            </div>
            {expandedSection === 'overview' ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSection === 'overview' && (
            <div className="p-4 space-y-3 border-t border-gray-700">
              {/* Trend */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">TREND YÖNETİ</p>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${getTrendColor(marketPressure?.overallPressure || 0)}`}>
                    {marketPressure?.overallPressure > 0 ? '🔼 LONG' : '🔽 SHORT'}
                    {' '}
                    {marketPressure?.trendDirection || 'NEUTRAL'}
                  </span>
                  <span className="text-xs text-gray-400">
                    Momentum: {marketPressure?.momentumScore.toFixed(0) || 0}%
                  </span>
                </div>
              </div>

              {/* Genel Baskı */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">GENEL PIYASA BASKISI</p>
                {getPressureBar(marketPressure?.overallPressure || 0)}
              </div>

              {/* Trend Gücü */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Trend Gücü</p>
                  <p className="font-bold text-blue-400">
                    {((marketPressure?.trendStrength || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Holding Süresi</p>
                  <p className="font-bold text-purple-400">
                    {positionDecision?.expectedHoldTime || '-'}
                  </p>
                </div>
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Güven Oranı</p>
                  <p className="font-bold text-green-400">
                    {((positionDecision?.confidence || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ORDER BOOK ANALİZİ */}
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'orderbook' ? null : 'orderbook')}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">📖</span>
              <span className="font-semibold text-white">ORDER BOOK ANALİZİ</span>
            </div>
            {expandedSection === 'orderbook' ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSection === 'orderbook' && (
            <div className="p-4 space-y-3 border-t border-gray-700">
              {/* Bid/Ask Oranı */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">BID/ASK ORANI</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between items-end gap-1 h-12">
                      <div className="flex-1 bg-green-500/70 rounded-sm" style={{ height: `${Math.min(100, (orderBook?.bidAskRatio || 1) * 30)}%` }} />
                      <div className="flex-1 bg-red-500/70 rounded-sm" style={{ height: `${Math.min(100, (100 / (orderBook?.bidAskRatio || 1)) * 30)}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white">
                    {(orderBook?.bidAskRatio || 1).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>🟢 Alıcı</span>
                  <span>🔴 Satıcı</span>
                </div>
              </div>

              {/* Spread */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Spread</p>
                  <p className="font-bold text-yellow-400">
                    {(orderBook?.spreadPercentage || 0).toFixed(4)}%
                  </p>
                </div>
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Likidite</p>
                  <p className="font-bold text-blue-400">
                    {orderBook?.liquidityQuality || '-'}
                  </p>
                </div>
              </div>

              {/* OB Baskısı */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">ORDER BOOK BASKISI</p>
                {getPressureBar(orderBook?.orderBookPressure || 0)}
              </div>

              {/* Hacim Bilgisi */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Alıcı Hacmi</p>
                  <p className="font-bold text-green-400">
                    ${((orderBook?.totalBidVolume || 0) / 1000).toFixed(0)}K
                  </p>
                </div>
                <div className="bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-400">Satıcı Hacmi</p>
                  <p className="font-bold text-red-400">
                    ${((orderBook?.totalAskVolume || 0) / 1000).toFixed(0)}K
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* İŞLEM AKIŞI ANALİZİ */}
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'tradeflow' ? null : 'tradeflow')}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">💾</span>
              <span className="font-semibold text-white">İŞLEM AKIŞI</span>
              <span className="text-xs text-gray-400 ml-2">
                {tradeFlow?.dominantSide || '-'}
              </span>
            </div>
            {expandedSection === 'tradeflow' ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSection === 'tradeflow' && (
            <div className="p-4 space-y-3 border-t border-gray-700">
              {/* Alıcı vs Satıcı */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">ALICI vs SATICI</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="flex h-8 rounded-sm overflow-hidden">
                      <div
                        className="bg-green-500/70 flex items-center justify-center text-xs font-bold text-white"
                        style={{
                          width: `${((tradeFlow?.buyVolume || 0) / ((tradeFlow?.buyVolume || 0) + (tradeFlow?.sellVolume || 1))) * 100}%`,
                        }}
                      >
                        {tradeFlow?.buyCount || 0}
                      </div>
                      <div
                        className="bg-red-500/70 flex items-center justify-center text-xs font-bold text-white"
                        style={{
                          width: `${((tradeFlow?.sellVolume || 0) / ((tradeFlow?.buyVolume || 0) + (tradeFlow?.sellVolume || 1))) * 100}%`,
                        }}
                      >
                        {tradeFlow?.sellCount || 0}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>🟢 Alıcı: ${((tradeFlow?.buyVolume || 0) / 1000).toFixed(0)}K</span>
                  <span>🔴 Satıcı: ${((tradeFlow?.sellVolume || 0) / 1000).toFixed(0)}K</span>
                </div>
              </div>

              {/* Flow Dengesizliği */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">AKIŞ DENGESİZLİĞİ</p>
                {getPressureBar(tradeFlow?.flowImbalance || 0)}
              </div>

              {/* Flow Gücü */}
              <div className="bg-gray-700/50 p-3 rounded">
                <p className="text-xs font-semibold text-gray-400 mb-1">AKIŞ GÜCÜ</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${(tradeFlow?.flowStrength || 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-purple-400">
                    {((tradeFlow?.flowStrength || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* POZİSYON KARAR */}
        {positionDecision && (
          <div className="border border-green-600/50 rounded-lg bg-green-900/20 overflow-hidden">
            <div className="p-3 bg-green-900/50 border-b border-green-600/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <span className="font-semibold text-green-400">POZİSYON AÇMA KARARI</span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Karar Detayları */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-green-900/30 p-2 rounded">
                  <p className="text-gray-400">Taraf</p>
                  <p className="font-bold text-lg">
                    {positionDecision.side === 'long' ? '🔼 LONG' : '🔽 SHORT'}
                  </p>
                </div>
                <div className="bg-green-900/30 p-2 rounded">
                  <p className="text-gray-400">Güven</p>
                  <p className="font-bold text-green-400">
                    {(positionDecision.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="bg-green-900/30 p-2 rounded">
                  <p className="text-gray-400">1x Kar</p>
                  <p className="font-bold text-green-400">
                    +{positionDecision.potentialProfitPct.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-green-900/30 p-2 rounded">
                  <p className="text-gray-400">Risk/Reward</p>
                  <p className="font-bold text-yellow-400">
                    {positionDecision.riskRewardRatio.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Fiyat Seviyeleri */}
              <div className="bg-gray-700/50 p-2 rounded text-xs">
                <p className="text-gray-400">Giriş: <span className="font-bold text-blue-400">${currentPrice.toFixed(4)}</span></p>
                <p className="text-gray-400">Hedef: <span className="font-bold text-green-400">${positionDecision.targetPrice.toFixed(4)}</span></p>
                <p className="text-gray-400">Stop: <span className="font-bold text-red-400">${positionDecision.stopLoss.toFixed(4)}</span></p>
              </div>
            </div>
          </div>
        )}

        {/* KAPAMA KARARI */}
        {positionMonitor?.shouldClose && (
          <div className="border border-orange-600/50 rounded-lg bg-orange-900/20 overflow-hidden">
            <div className="p-3 bg-orange-900/50 border-b border-orange-600/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏸️</span>
                <span className="font-semibold text-orange-400">POZİSYON KAPAMA KARARI</span>
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-orange-300 mb-2">
                <span className="font-bold">{positionMonitor.closeReason}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-orange-900/30 p-2 rounded">
                  <p className="text-gray-400">Mevcut Kar</p>
                  <p className={`font-bold ${positionMonitor.currentProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {positionMonitor.currentProfit > 0 ? '+' : ''}${positionMonitor.currentProfit.toFixed(2)}
                  </p>
                </div>
                <div className="bg-orange-900/30 p-2 rounded">
                  <p className="text-gray-400">Yüzde</p>
                  <p className={`font-bold ${positionMonitor.currentProfitPct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {positionMonitor.currentProfitPct > 0 ? '+' : ''}{positionMonitor.currentProfitPct.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
