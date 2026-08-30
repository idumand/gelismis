import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  BarChart3,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { AlgorithmMetrics } from '../lib/SmartTradingAlgorithm';

interface SmartStatisticsPanelProps {
  metrics: AlgorithmMetrics | null;
  leverage: number;
  minProfitThreshold: number;
}

export function SmartStatisticsPanel({
  metrics,
  leverage,
  minProfitThreshold,
}: SmartStatisticsPanelProps) {
  if (!metrics) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Veri bekleniyor...</p>
        </div>
      </div>
    );
  }

  const mp = metrics.marketPressure;
  const ob = metrics.orderBook;
  const tf = metrics.tradeFlow;
  const pd = metrics.positionDecision;

  // Renkler momentum'a göre
  const momentumColor =
    mp.momentumScore > 70
      ? 'text-green-400'
      : mp.momentumScore > 40
        ? 'text-yellow-400'
        : 'text-red-400';

  const pressureColor =
    mp.overallPressure > 0.3
      ? 'text-green-400'
      : mp.overallPressure < -0.3
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h3 className="font-bold text-white">Akıllı Analiz Motoru</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Algoritma Sağlığı</p>
          <p className={`text-lg font-bold ${
            metrics.algorithmHealth > 70 ? 'text-green-400' :
            metrics.algorithmHealth > 40 ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            {metrics.algorithmHealth.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Market Pressure Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Trend Yönü */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Trend Yönü</p>
          <div className="flex items-center gap-2">
            {mp.overallPressure > 0 ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <p className={`font-semibold ${pressureColor}`}>
              {mp.trendDirection}
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(mp.overallPressure * 100).toFixed(1)}%
          </p>
        </div>

        {/* Momentum Skoru */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Momentum</p>
          <p className={`text-xl font-bold ${momentumColor}`}>
            {mp.momentumScore.toFixed(0)}
          </p>
          <div className="w-full bg-gray-700 rounded-full h-1 mt-2">
            <div
              className={`h-1 rounded-full transition-all ${
                mp.momentumScore > 70
                  ? 'bg-green-500'
                  : mp.momentumScore > 40
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${mp.momentumScore}%` }}
            />
          </div>
        </div>

        {/* Likidite */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Likidite</p>
          <p className="font-semibold text-white text-sm">{ob.liquidityQuality}</p>
          <p className="text-xs text-gray-500 mt-1">
            Spread: {ob.spreadPercentage.toFixed(3)}%
          </p>
        </div>
      </div>

      {/* Order Flow + Trade Flow */}
      <div className="grid grid-cols-2 gap-3">
        {/* Order Book Analizi */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Order Book</p>
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-400">Alıcı:</span>
              <span className="font-mono text-white">
                {ob.totalBidVolume.toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-400">Satıcı:</span>
              <span className="font-mono text-white">
                {ob.totalAskVolume.toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between text-sm bg-gray-700/30 rounded p-2">
              <span className="text-gray-300">Oran:</span>
              <span className={`font-bold ${
                ob.bidAskRatio > 1 ? 'text-green-400' : 'text-red-400'
              }`}>
                {ob.bidAskRatio.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>

        {/* İşlem Akışı */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">İşlem Akışı</p>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-400">Buy:</span>
              <span className="font-mono text-white">
                {tf.buyCount} işlem
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-400">Sell:</span>
              <span className="font-mono text-white">
                {tf.sellCount} işlem
              </span>
            </div>
            <div className="text-sm bg-gray-700/30 rounded p-2 text-center">
              <span className={`font-bold ${
                tf.dominantSide === 'long'
                  ? 'text-green-400'
                  : tf.dominantSide === 'short'
                    ? 'text-red-400'
                    : 'text-gray-400'
              }`}>
                {tf.dominantSide.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pressure Detay */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-3">Piyasa Baskısı (3 Zaman Dilimi)</p>
        <div className="space-y-2">
          {[
            {
              label: 'Kısa Vadeli',
              value: mp.shortTermPressure,
              color: 'from-blue-500 to-blue-600',
            },
            {
              label: 'Orta Vadeli',
              value: mp.mediumTermPressure,
              color: 'from-purple-500 to-purple-600',
            },
            {
              label: 'Uzun Vadeli',
              value: mp.longTermPressure,
              color: 'from-indigo-500 to-indigo-600',
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-400">{item.label}</span>
                <span className={`text-xs font-mono font-bold ${
                  item.value > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(item.value * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${item.color} transition-all`}
                  style={{
                    width: `${Math.abs(item.value) * 100}%`,
                    marginLeft: item.value < 0 ? `${Math.abs(item.value) * 100}%` : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pozisyon Açma Önerisi */}
      {pd ? (
        <div className={`border rounded-lg p-4 ${
          pd.shouldOpen
            ? 'bg-green-900/30 border-green-600/50'
            : 'bg-red-900/30 border-red-600/50'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {pd.shouldOpen ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <p className={`font-bold ${
              pd.shouldOpen ? 'text-green-400' : 'text-red-400'
            }`}>
              {pd.shouldOpen ? 'POZİSYON AÇILMASI TAVSİYE EDİLİYOR' : 'POZİSYON AÇMA UYGUN DEĞİL'}
            </p>
          </div>

          {pd.shouldOpen && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Yön:</span>
                <span className={`font-bold ${
                  pd.side === 'long' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {pd.side.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Giriş:</span>
                <span className="font-mono text-white">${pd.entryPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Hedef:</span>
                <span className="font-mono text-green-400">${pd.targetPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Stop Loss:</span>
                <span className="font-mono text-red-400">${pd.stopLoss.toFixed(2)}</span>
              </div>
              <div className="bg-gray-700/30 rounded p-2 flex justify-between">
                <span className="text-gray-300">1x Kar:</span>
                <span className="font-bold text-yellow-400">
                  {pd.positionDecision ? '...' : '%'}{pd.potentialProfitPct.toFixed(2)}%
                </span>
              </div>
              {leverage > 1 && (
                <div className="bg-blue-700/30 rounded p-2 flex justify-between">
                  <span className="text-gray-300">{leverage}x Kar:</span>
                  <span className="font-bold text-blue-400">
                    {(pd.potentialProfitPct * (leverage / 1)).toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-300">Güven:</span>
                <span className="font-bold text-purple-400">
                  {(pd.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* Reasoning */}
          {pd.reasoning && pd.reasoning.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-600/50">
              <p className="text-xs text-gray-400 mb-2">Analiz Nedenleri:</p>
              <ul className="text-xs text-gray-300 space-y-1">
                {pd.reasoning.slice(0, 4).map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-gray-500 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-400" />
            <p className="text-yellow-400 font-semibold">
              Aktif pozisyon var - yeni pozisyon açılamıyor
            </p>
          </div>
        </div>
      )}

      {/* Ayarlar Özeti */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-3 text-xs">
        <p className="text-gray-400 mb-2">Aktif Ayarlar</p>
        <div className="grid grid-cols-2 gap-2 text-gray-300">
          <div>Leverage: <span className="font-bold text-white">{leverage}x</span></div>
          <div>Min. Kar: <span className="font-bold text-white">%{minProfitThreshold.toFixed(2)}</span></div>
          <div>Zaman: <span className="font-mono text-gray-400">{new Date(metrics.timestamp).toLocaleTimeString()}</span></div>
        </div>
      </div>
    </div>
  );
}
