import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface AlgorithmBrainProps {
  symbol: string;
  longShortScore: number; // 0-100, 50 = balanced
  profitTarget: number; // %
  positionSize: number; // USD
  leverage: number;
  orderBookStrength: number; // 0-1
  viabilityScore: number; // 0-100
  currentPrice: number;
  entryPrice?: number;
  action: 'ENTER_NOW' | 'ENTER_BETTER_PRICE' | 'WAIT_CONDITIONS' | 'SKIP';
  confidence: number; // 0-100
  estimatedProfit: number; // USD
  commissionCost: number; // USD
}

export function AlgorithmBrain({
  symbol,
  longShortScore,
  profitTarget,
  positionSize,
  leverage,
  orderBookStrength,
  viabilityScore,
  currentPrice,
  entryPrice,
  action,
  confidence,
  estimatedProfit,
  commissionCost
}: AlgorithmBrainProps) {
  const [displayValue, setDisplayValue] = useState(longShortScore);

  useEffect(() => {
    setDisplayValue(longShortScore);
  }, [longShortScore]);

  const dominantSide = displayValue > 55 ? 'long' : displayValue < 45 ? 'short' : 'balanced';
  const dominantPct = Math.abs(displayValue - 50) * 2;

  const getActionColor = () => {
    switch (action) {
      case 'ENTER_NOW': return 'border-green-500 bg-green-50';
      case 'ENTER_BETTER_PRICE': return 'border-yellow-500 bg-yellow-50';
      case 'WAIT_CONDITIONS': return 'border-orange-500 bg-orange-50';
      case 'SKIP': return 'border-red-500 bg-red-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const getActionTextColor = () => {
    switch (action) {
      case 'ENTER_NOW': return 'text-green-700';
      case 'ENTER_BETTER_PRICE': return 'text-yellow-700';
      case 'WAIT_CONDITIONS': return 'text-orange-700';
      case 'SKIP': return 'text-red-700';
      default: return 'text-gray-700';
    }
  };

  return (
    <div className={`border-2 rounded-lg p-6 ${getActionColor()}`}>
      <div className="flex items-center gap-3 mb-6">
        <Brain className="text-indigo-600" size={28} />
        <h3 className="text-lg font-bold text-gray-900">Algoritma Beyni - {symbol}</h3>
      </div>

      {/* Main Decision Display */}
      <div className="mb-6 p-4 bg-white rounded-lg border-2 border-indigo-200">
        <div className={`text-2xl font-bold ${getActionTextColor()} mb-2`}>
          {action === 'ENTER_NOW' && '✅ ŞİMDİ GİR'}
          {action === 'ENTER_BETTER_PRICE' && '⏳ DAHA İYİ FIYATINI BEKLE'}
          {action === 'WAIT_CONDITIONS' && '⚠️ BEKLE'}
          {action === 'SKIP' && '❌ ATLAYACAK'}
        </div>
        <div className="text-sm text-gray-600">
          Güven: <span className="font-bold text-indigo-600">{confidence}%</span>
        </div>
      </div>

      {/* Long/Short Dominance */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <label className="text-sm font-semibold text-gray-700">Emir Defteri Baskınlığı</label>
          <span className={`text-sm font-bold ${
            dominantSide === 'long' ? 'text-green-600' : 
            dominantSide === 'short' ? 'text-red-600' : 
            'text-gray-600'
          }`}>
            {dominantSide.toUpperCase()} %{dominantPct.toFixed(0)}
          </span>
        </div>
        <div className="flex h-8 rounded-full overflow-hidden bg-gray-200">
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${50 - (displayValue - 50)}%` }}
          />
          <div
            className="bg-green-500 transition-all duration-300"
            style={{ width: `${50 + (displayValue - 50)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>SHORT Baskın ← Dengeli → LONG Baskın</span>
        </div>
      </div>

      {/* Order Book Strength */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="bg-white p-3 rounded border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Emir Kitabı Gücü</div>
          <div className="text-2xl font-bold text-indigo-600">
            {(orderBookStrength * 100).toFixed(0)}%
          </div>
        </div>

        <div className="bg-white p-3 rounded border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Viabilite Skoru</div>
          <div className={`text-2xl font-bold ${
            viabilityScore >= 75 ? 'text-green-600' :
            viabilityScore >= 50 ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {viabilityScore.toFixed(0)}%
          </div>
        </div>

        <div className="bg-white p-3 rounded border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Leverage</div>
          <div className="text-2xl font-bold text-blue-600">{leverage}x</div>
        </div>
      </div>

      {/* Profit Analysis */}
      <div className="mb-6 bg-white p-4 rounded border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">Kar Analizi</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Pozisyon Boyutu:</span>
            <span className="font-semibold text-gray-900">${positionSize.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Hedef Kar (1x):</span>
            <span className="font-semibold text-gray-900">{profitTarget.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Hedef Kar ({leverage}x):</span>
            <span className="font-semibold text-green-600">{(profitTarget * leverage).toFixed(2)}%</span>
          </div>
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Tahmini Brüt Kar:</span>
              <span className="font-semibold text-green-600">
                +${(positionSize * (profitTarget * leverage / 100)).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Komisyon Maliyeti:</span>
            <span className="font-semibold text-red-600">-${commissionCost.toFixed(2)}</span>
          </div>
          <div className="border-t pt-2 mt-2 bg-gray-50 p-2 rounded">
            <div className="flex justify-between">
              <span className="font-bold text-gray-900">NET KAR:</span>
              <span className={`font-bold text-lg ${
                estimatedProfit > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${estimatedProfit > 0 ? '+' : ''}{estimatedProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Price vs Entry */}
      {entryPrice && (
        <div className="bg-white p-4 rounded border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-3">Fiyat Analizi</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Giriş Fiyatı:</span>
              <span className="font-semibold text-gray-900">${entryPrice.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Mevcut Fiyat:</span>
              <span className="font-semibold text-gray-900">${currentPrice.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Fiyat Hareketi:</span>
              <span className={`font-semibold ${
                currentPrice > entryPrice ? 'text-green-600' : 'text-red-600'
              }`}>
                {((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlgorithmBrain;
