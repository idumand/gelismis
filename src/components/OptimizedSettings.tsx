import React, { useState } from 'react';
import { Settings, Save, X, Zap, Users, Brain } from 'lucide-react';

interface OptimizedSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    mode: 'manual' | 'algorithm';
    leverage: number;
    minProfitThreshold: number;
    maxOpenPositions: number;
    commissionRate: number;
    binanceMode: 'live' | 'testnet';
    selectedCoins: string[];
  };
  onSettingsChange: (settings: any) => void;
}

export function OptimizedSettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: OptimizedSettingsProps) {
  const [mode, setMode] = useState<'manual' | 'algorithm'>(settings.mode);
  const [leverage, setLeverage] = useState(settings.leverage);
  const [minProfit, setMinProfit] = useState(settings.minProfitThreshold);
  const [maxPositions, setMaxPositions] = useState(settings.maxOpenPositions);
  const [binanceMode, setBinanceMode] = useState<'live' | 'testnet'>(
    settings.binanceMode
  );

  const handleSave = () => {
    onSettingsChange({
      ...settings,
      mode,
      leverage,
      minProfitThreshold: minProfit,
      maxOpenPositions: maxPositions,
      binanceMode,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-96 overflow-y-auto">
        {/* Başlık */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-900">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Ayarlar</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="p-6 space-y-6">
          {/* Mode Seçimi */}
          <div>
            <p className="text-sm font-semibold text-gray-300 mb-3">İşlem Modu</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Manual Mode */}
              <button
                onClick={() => setMode('manual')}
                className={`p-4 rounded-lg border-2 transition ${
                  mode === 'manual'
                    ? 'bg-purple-900/50 border-purple-500'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <Users className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                <p className="font-semibold text-white text-sm">Manual</p>
                <p className="text-xs text-gray-400 mt-1">
                  Seçili coinler üzerinde işlem
                </p>
              </button>

              {/* Algorithm Mode */}
              <button
                onClick={() => setMode('algorithm')}
                className={`p-4 rounded-lg border-2 transition ${
                  mode === 'algorithm'
                    ? 'bg-blue-900/50 border-blue-500'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <Brain className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                <p className="font-semibold text-white text-sm">Algoritma</p>
                <p className="text-xs text-gray-400 mt-1">
                  AI en iyi coinleri seçer
                </p>
              </button>
            </div>
          </div>

          {/* Leverage Ayarı */}
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-2 block">
              Leverage: <span className="text-blue-400 font-bold">{leverage}x</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                  ((leverage - 1) / 49) * 100
                }%, #374151 ${((leverage - 1) / 49) * 100}%, #374151 100%)`,
              }}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1x (Spot)</span>
              <span>50x (Max)</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 Yüksek leverage = daha yüksek kâr VEYA kayıp. 5-10x önerilir.
            </p>
          </div>

          {/* Minimum Kar Yüzdesi (1x için) */}
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-2 block">
              Minimum Kar % (1x bazında):
              <span className="text-green-400 font-bold ml-2">%{minProfit.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={minProfit}
              onChange={(e) => setMinProfit(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${
                  (minProfit / 5) * 100
                }%, #374151 ${(minProfit / 5) * 100}%, #374151 100%)`,
              }}
            />
            <p className="text-xs text-gray-400 mt-2">
              📊 Algoritma bu yüzdenin altındaki işlemleri açmaz. Binance komisyonu: 0.1%
            </p>
            {leverage > 1 && (
              <p className="text-xs text-blue-400 mt-1">
                💰 {leverage}x ile beklenen kar: %{(minProfit * leverage).toFixed(2)}
              </p>
            )}
          </div>

          {/* Maksimum Açık Pozisyon */}
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-2 block">
              Maksimum Açık Pozisyon:
              <span className="text-yellow-400 font-bold ml-2">{maxPositions}</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setMaxPositions(num)}
                  className={`px-3 py-2 rounded-lg border-2 text-sm font-semibold transition ${
                    maxPositions === num
                      ? 'bg-yellow-900/50 border-yellow-500 text-yellow-400'
                      : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Binance Modu */}
          <div>
            <p className="text-sm font-semibold text-gray-300 mb-3">Binance Modu</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Live */}
              <button
                onClick={() => setBinanceMode('live')}
                className={`p-3 rounded-lg border-2 transition ${
                  binanceMode === 'live'
                    ? 'bg-red-900/50 border-red-500'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <Zap className="w-5 h-5 mx-auto mb-1 text-red-400" />
                <p className="font-semibold text-white text-sm">Canlı İşlem</p>
                <p className="text-xs text-red-300 mt-1">⚠️ Gerçek para</p>
              </button>

              {/* Testnet */}
              <button
                onClick={() => setBinanceMode('testnet')}
                className={`p-3 rounded-lg border-2 transition ${
                  binanceMode === 'testnet'
                    ? 'bg-green-900/50 border-green-500'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <Zap className="w-5 h-5 mx-auto mb-1 text-green-400" />
                <p className="font-semibold text-white text-sm">Testnet</p>
                <p className="text-xs text-green-300 mt-1">✓ Demo, güvenli</p>
              </button>
            </div>
          </div>

          {/* Uyarı */}
          <div className="bg-orange-900/30 border border-orange-600/50 rounded-lg p-3">
            <p className="text-sm text-orange-300">
              ⚠️ <span className="font-semibold">Önemli:</span> Canlı işlem modunda gerçek paranız kullanılacaktır. Lütfen testnet'te başlayın.
            </p>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex gap-3 p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold transition"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold transition flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
