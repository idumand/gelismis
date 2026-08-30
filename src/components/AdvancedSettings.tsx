import React, { useState } from 'react';
import { Settings, Manual, Zap } from 'lucide-react';

interface AdvancedSettingsProps {
  tradingMode: 'manual' | 'auto';
  onModeChange: (mode: 'manual' | 'auto') => void;
  
  // Manual Mode Settings
  selectedCoins: string[];
  onCoinsChange: (coins: string[]) => void;
  manualLeverage: number;
  onManualLeverageChange: (lev: number) => void;
  manualPositionSize: number;
  onManualPositionSizeChange: (size: number) => void;
  manualMinProfitPct: number;
  onManualMinProfitChange: (pct: number) => void;
  manualStopLossPct: number;
  onManualStopLossChange: (pct: number) => void;
  
  // Auto Algorithm Settings
  algorithmMode: 'conservative' | 'aggressive' | 'balanced';
  onAlgorithmModeChange: (mode: any) => void;
  minProfitPct1X: number;
  onMinProfitChange: (pct: number) => void;
  maxPositions: number;
  onMaxPositionsChange: (max: number) => void;
  autoLeverage: number;
  onAutoLeverageChange: (lev: number) => void;
  orderBookStrengthThreshold: number;
  onOrderBookThresholdChange: (threshold: number) => void;
  availableCoins: string[];
}

export function AdvancedSettings({
  tradingMode,
  onModeChange,
  selectedCoins,
  onCoinsChange,
  manualLeverage,
  onManualLeverageChange,
  manualPositionSize,
  onManualPositionSizeChange,
  manualMinProfitPct,
  onManualMinProfitChange,
  manualStopLossPct,
  onManualStopLossChange,
  algorithmMode,
  onAlgorithmModeChange,
  minProfitPct1X,
  onMinProfitChange,
  maxPositions,
  onMaxPositionsChange,
  autoLeverage,
  onAutoLeverageChange,
  orderBookStrengthThreshold,
  onOrderBookThresholdChange,
  availableCoins
}: AdvancedSettingsProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'algorithm'>('manual');

  return (
    <div className="w-full max-w-4xl mx-auto bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="text-indigo-600" size={28} />
        <h2 className="text-2xl font-bold text-gray-900">İşlem Ayarları</h2>
      </div>

      {/* Trading Mode Selector */}
      <div className="mb-6 bg-white rounded-lg p-4 border-2 border-gray-200">
        <label className="block text-sm font-semibold text-gray-700 mb-4">İşlem Modu</label>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onModeChange('manual')}
            className={`p-4 rounded-lg border-2 transition-all ${
              tradingMode === 'manual'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <Manual size={24} className="mx-auto mb-2" />
            <div className="font-semibold text-gray-900">Manuel</div>
            <div className="text-xs text-gray-600">Seçili coinler üzerinde</div>
          </button>

          <button
            onClick={() => onModeChange('auto')}
            className={`p-4 rounded-lg border-2 transition-all ${
              tradingMode === 'auto'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <Zap size={24} className="mx-auto mb-2" />
            <div className="font-semibold text-gray-900">Algoritma</div>
            <div className="text-xs text-gray-600">En iyi coin otomatik seç</div>
          </button>
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex gap-2 mb-6 bg-white rounded-lg p-2 border border-gray-300">
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
            activeTab === 'manual'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Manuel Ayarlar
        </button>
        <button
          onClick={() => setActiveTab('algorithm')}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
            activeTab === 'algorithm'
              ? 'bg-indigo-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Algoritma Ayarları
        </button>
      </div>

      {/* Manual Settings Tab */}
      {activeTab === 'manual' && (
        <div className="bg-white rounded-lg p-6 border border-gray-300 space-y-6">
          <h3 className="text-lg font-bold text-gray-900">Manuel İşlem Ayarları</h3>

          {/* Coin Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">İşlem Yapacak Coinler</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableCoins.map(coin => (
                <label key={coin} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 border border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedCoins.includes(coin)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onCoinsChange([...selectedCoins, coin]);
                      } else {
                        onCoinsChange(selectedCoins.filter(c => c !== coin));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="font-semibold text-gray-900">{coin}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-600">Seçili: {selectedCoins.length} coin</div>
          </div>

          {/* Manual Parameters */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Leverage</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="125"
                  value={manualLeverage}
                  onChange={(e) => onManualLeverageChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-bold text-gray-900 w-12">{manualLeverage}x</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Pozisyon Boyutu (USD)</label>
              <input
                type="number"
                value={manualPositionSize}
                onChange={(e) => onManualPositionSizeChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Min. Kar % (1x bazında)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={manualMinProfitPct}
                  onChange={(e) => onManualMinProfitChange(Number(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-600">%</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {manualLeverage}x'de: {(manualMinProfitPct * manualLeverage).toFixed(2)}%
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Stop Loss %</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={manualStopLossPct}
                  onChange={(e) => onManualStopLossChange(Number(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-600">%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Algorithm Settings Tab */}
      {activeTab === 'algorithm' && (
        <div className="bg-white rounded-lg p-6 border border-gray-300 space-y-6">
          <h3 className="text-lg font-bold text-gray-900">Algoritma Ayarları</h3>

          {/* Algorithm Mode */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Algoritma Modu</label>
            <div className="grid grid-cols-3 gap-3">
              {['conservative', 'balanced', 'aggressive'].map(mode => (
                <button
                  key={mode}
                  onClick={() => onAlgorithmModeChange(mode)}
                  className={`p-4 rounded-lg border-2 transition-all font-semibold ${
                    algorithmMode === mode
                      ? mode === 'conservative'
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : mode === 'balanced'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-red-500 bg-red-50 text-red-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {mode === 'conservative' && '🛡️ Muhafazakar'}
                  {mode === 'balanced' && '⚖️ Dengeli'}
                  {mode === 'aggressive' && '🚀 Agresif'}
                </button>
              ))}
            </div>
          </div>

          {/* Algorithm Parameters */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Min. Kar % (1x)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={minProfitPct1X}
                  onChange={(e) => onMinProfitChange(Number(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
                <span className="text-gray-600">%</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Komisyon kaybı kompense edecek minimum
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Leverage</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="125"
                  value={autoLeverage}
                  onChange={(e) => onAutoLeverageChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-bold text-gray-900 w-12">{autoLeverage}x</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Max Açık Pozisyon</label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxPositions}
                onChange={(e) => onMaxPositionsChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
              />
              <div className="text-xs text-gray-500 mt-1">Aynı anda kaç pozisyon açılabilir</div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Emir Kitabı Gücü (Min.)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={orderBookStrengthThreshold}
                  onChange={(e) => onOrderBookThresholdChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-bold text-gray-900 w-12">
                  {(orderBookStrengthThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Giriş yapabilmek için gereken order book baskınlığı
              </div>
            </div>
          </div>

          {/* Algorithm Mode Explanations */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-700 space-y-2">
              <div><strong>🛡️ Muhafazakar:</strong> Daha yüksek kar hedefi, güvenli giriş</div>
              <div><strong>⚖️ Dengeli:</strong> Orta düzey hedef ve risk</div>
              <div><strong>🚀 Agresif:</strong> Düşük kar hedefi, sık işlem</div>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdvancedSettings;
