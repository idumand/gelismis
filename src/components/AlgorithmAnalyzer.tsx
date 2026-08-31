import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  AlertCircle,
  CheckCircle,
  Target,
  Shield,
  Activity,
  BarChart3,
  Brain
} from 'lucide-react';
import clsx from 'clsx';

interface AlgorithmData {
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  expectedProfitPct: number;
  expectedProfitAtLeverage: number;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  reasoning: string[];
  shouldOpen: boolean;
  minimumProfitMet: boolean;
  orderFlowScore: number;
  technicalScore: number;
  volatilityAdjustment: number;
  spread: number;
  bidAskRatio: number;
  pressure: number;
  timestamp: number;
}

interface AlgorithmAnalyzerProps {
  data: AlgorithmData | null;
  pair: string;
  currentPrice: number;
  leverage: number;
  minimumProfit: number;
  isLoading?: boolean;
}

export function AlgorithmAnalyzer({
  data,
  pair,
  currentPrice,
  leverage,
  minimumProfit,
  isLoading = false
}: AlgorithmAnalyzerProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const reasoningRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  if (!data) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-6">
        <div className="flex items-center justify-center h-96 text-slate-400">
          <div className="text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Algoritma analiz bekleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  const signalColor = data.signal === 'LONG' ? 'text-green-400' : data.signal === 'SHORT' ? 'text-red-400' : 'text-slate-400';
  const signalBg = data.signal === 'LONG' ? 'bg-green-900 bg-opacity-30' : data.signal === 'SHORT' ? 'bg-red-900 bg-opacity-30' : 'bg-slate-700 bg-opacity-30';
  const confidenceColor = data.confidence > 75 ? 'text-green-400' : data.confidence > 50 ? 'text-yellow-400' : 'text-orange-400';

  const profitPct = (data.expectedProfitAtLeverage * leverage).toFixed(2);
  const profitAmount = ((currentPrice * profitPct) / 100).toFixed(2);

  return (
    <div className="space-y-4">
      {/* Main Signal Box */}
      <div className={clsx(
        'rounded-lg border p-6 transition-all',
        data.signal === 'LONG' 
          ? 'bg-green-900 bg-opacity-20 border-green-600'
          : data.signal === 'SHORT'
          ? 'bg-red-900 bg-opacity-20 border-red-600'
          : 'bg-slate-800 border-slate-600'
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {data.signal === 'LONG' && <TrendingUp className="w-8 h-8 text-green-400" />}
            {data.signal === 'SHORT' && <TrendingDown className="w-8 h-8 text-red-400" />}
            {data.signal === 'NEUTRAL' && <AlertCircle className="w-8 h-8 text-slate-400" />}
            <div>
              <h3 className={clsx('text-2xl font-bold', signalColor)}>
                {data.signal}
              </h3>
              <p className="text-sm text-slate-400">{pair}</p>
            </div>
          </div>
          <div className="text-right">
            <div className={clsx('text-xl font-bold', confidenceColor)}>
              {data.confidence.toFixed(0)}%
            </div>
            <p className="text-sm text-slate-400">Güven</p>
          </div>
        </div>

        {/* Signal Status */}
        <div className="flex items-center gap-2 mb-4">
          {data.shouldOpen ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-orange-400" />
          )}
          <span className={data.shouldOpen ? 'text-green-400' : 'text-orange-400'}>
            {data.shouldOpen ? '✅ Pozisyon Açılabilir' : '⚠️ Koşullar Karşılanmıyor'}
          </span>
        </div>

        {/* Profit Information */}
        <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-black bg-opacity-30 rounded">
          <div>
            <p className="text-xs text-slate-400 mb-1">Beklenen Kar (1x)</p>
            <p className="text-lg font-bold text-blue-400">
              {data.expectedProfitPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">{leverage}x Kaldıraç</p>
            <p className={clsx(
              'text-lg font-bold',
              data.expectedProfitAtLeverage > 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {data.expectedProfitAtLeverage.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Risk/Ödül</p>
            <p className="text-lg font-bold text-purple-400">
              1:{data.riskRewardRatio.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Minimum Profit Check */}
        <div className={clsx(
          'p-3 rounded flex items-center gap-2 text-sm',
          data.minimumProfitMet
            ? 'bg-green-900 bg-opacity-30 text-green-300'
            : 'bg-orange-900 bg-opacity-30 text-orange-300'
        )}>
          {data.minimumProfitMet ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>
            Min. Kar Hedefi: {data.expectedProfitPct.toFixed(2)}% 
            {data.minimumProfitMet ? ' ✓' : ` < ${minimumProfit}% ✗`}
          </span>
        </div>
      </div>

      {/* Entry/Exit Levels */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Giriş Fiyatı
          </p>
          <p className="text-xl font-bold text-blue-400">
            ${data.entryPrice.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Mevcut: ${currentPrice.toFixed(2)}
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" /> Kar Al
          </p>
          <p className="text-xl font-bold text-green-400">
            ${data.takeProfitPrice.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            +{Math.abs(data.takeProfitPrice - data.entryPrice).toFixed(2)} USDT
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 col-span-2">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Zarar Durdur
          </p>
          <p className="text-xl font-bold text-red-400">
            ${data.stopLossPrice.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {Math.abs(data.stopLossPrice - data.entryPrice).toFixed(2)} USDT Risk
          </p>
        </div>
      </div>

      {/* Score Analysis */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <p className="text-xs text-slate-400 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Emir Akışı Skoru
          </p>
          <ScoreBar score={data.orderFlowScore} />
          <p className="text-sm font-bold mt-2 text-center">
            {data.orderFlowScore.toFixed(1)}
          </p>
          <div className="mt-2 p-2 bg-black bg-opacity-30 rounded text-xs text-slate-300">
            <p>Talep/Arz: {data.bidAskRatio.toFixed(2)}x</p>
            <p>Baskı: {(data.pressure * 100).toFixed(1)}%</p>
            <p>Spread: {data.spread.toFixed(4)}%</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <p className="text-xs text-slate-400 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Teknik Analiz Skoru
          </p>
          <ScoreBar score={data.technicalScore} />
          <p className="text-sm font-bold mt-2 text-center">
            {data.technicalScore.toFixed(1)}
          </p>
          <div className="mt-2 p-2 bg-black bg-opacity-30 rounded text-xs text-slate-300">
            <p>Volatilite Ayarı: {data.volatilityAdjustment.toFixed(2)}x</p>
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex flex-col max-h-64">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Algoritma Mantığı
          </p>
          <label className="text-xs text-slate-400 flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            Otomatik Kaydır
          </label>
        </div>
        <div
          ref={reasoningRef}
          className="flex-1 overflow-y-auto p-4 space-y-2 text-sm"
        >
          {data.reasoning.map((reason, idx) => (
            <div
              key={idx}
              className={clsx(
                'p-2 rounded text-sm',
                reason.includes('✅')
                  ? 'bg-green-900 bg-opacity-30 text-green-300'
                  : reason.includes('❌')
                  ? 'bg-orange-900 bg-opacity-30 text-orange-300'
                  : reason.includes('Strong')
                  ? 'bg-blue-900 bg-opacity-30 text-blue-300'
                  : 'bg-slate-900 text-slate-300'
              )}
            >
              {reason}
            </div>
          ))}
        </div>
      </div>

      {/* Timestamp */}
      <p className="text-xs text-slate-500 text-right">
        Son Güncelleme: {new Date(data.timestamp).toLocaleTimeString('tr-TR')}
      </p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const normalizedScore = (score + 100) / 200; // Convert -100 to 100 to 0 to 1
  const color = score > 0 ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="w-full h-6 bg-slate-900 rounded overflow-hidden border border-slate-600">
      <div
        className={clsx(color, 'h-full transition-all duration-300')}
        style={{
          width: `${Math.abs(score)}%`,
          marginLeft: score < 0 ? `${100 + score}%` : '0%'
        }}
      />
      <div className="absolute left-1/2 top-0 w-0.5 h-6 bg-slate-500 opacity-50 transform -translate-x-1/2" />
    </div>
  );
}
