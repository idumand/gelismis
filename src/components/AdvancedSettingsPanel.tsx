import React, { useState } from 'react';
import { Settings, Save, X, Zap, Brain, Users, DollarSign, TrendingUp } from 'lucide-react';

interface AdvancedSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    mode: 'manual' | 'algorithm';
    leverage: number;
    minProfitThreshold1x: number;
    maxOpenPositions: number;
    commissionRate: number;
    binanceMode: 'live' | 'testnet';
    selectedCoins: string[];
  };
  onSettingsChange: (settings: any) => void;
}

export function AdvancedSettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: AdvancedSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'algorithm'>('manual');
  const [leverage, setLeverage] = useState(settings.leverage);
  const [minProfit1x, setMinProfit1x] = useState(settings.minProfitThreshold1x);
  const [maxPositions, setMaxPositions] = useState(settings.maxOpenPositions);
  const [binanceMode, setBinanceMode] = useState<'live' | 'testnet'>(settings.binanceMode);
  const [selectedCoins, setSelectedCoins] = useState<string[]>(settings.selectedCoins || []);

  const handleSave = () => {
    onSettingsChange({
      ...settings,
      mode: activeTab,
      leverage,
      minProfitThreshold1x: minProfit1x,
      maxOpenPositions: maxPositions,
      binanceMode,
      selectedCoins: activeTab === 'manual' ? selectedCoins : [],
    });
    onClose();
  };

  if (!isOpen) return null;

  // Leverage'a göre beklenen kar hesabı
  const expectedProfitWithLeverage = minProfit1x * leverage;

  // Örnek kar hesapları
  const profitExamples = [
    { amount: 20, profit1x: (minProfit1x / 100) * 20, profitWithLeverage: (expectedProfitWithLeverage / 100) * 20 },
    { amount: 100, profit1x: (minProfit1x / 100) * 100, profitWithLeverage: (expectedProfitWithLeverage / 100) * 100 },
    { amount: 500, profit1x: (minProfit1x / 100) * 500, profitWithLeverage: (expectedProfitWithLeverage / 100) * 500 },
  ];

  const availableCoins = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'SOL/USDT', 'DOGE/USDT', 'PEPE/USDT'];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">⚙️ Gelişmiş Ayarlar</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sekme Seçimi */}
        <div className="flex border-b border-gray-700 bg-gray-800/50">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-semibold transition border-b-2 ${
              activeTab === 'manual'
                ? 'border-purple-500 text-purple-400 bg-purple-900/20'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Manuel Modu
          </button>
          <button
            onClick={() => setActiveTab('algorithm')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-semibold transition border-b-2 ${
              activeTab === 'algorithm'
                ? 'border-blue-500 text-blue-400 bg-blue-900/20'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <Brain className="w-4 h-4" />
            Algoritma Modu
          </button>
        </div>

        {/* İçerik */}
        <div className="overflow-y-auto flex-1">
          <div className="p-6 space-y-6">
            {/* MANUEL SEKME */}
            {activeTab === 'manual' && (
              <div className="space-y-6">
                <div className="bg-purple-900/20 border border-purple-600/50 rounded-lg p-4">
                  <p className="text-sm text-purple-300">
                    <span className="font-semibold">📌 Manuel Mod:</span> Seçtiğiniz coinler üzerinde işlem yapılır. Algoritma bu coinlerin verilerini analiz eder ve en iyi zamanlarda pozisyon açar.
                  </p>
                </div>

                {/* Coin Seçimi */}
                <div>
                  <label className="text-sm font-semibold text-gray-300 mb-3 block">
                    İşlem Yapılacak Coinler
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {availableCoins.map((coin) => (
                      <button
                        key={coin}
                        onClick={() => {
                          if (selectedCoins.includes(coin)) {
                            setSelectedCoins(selectedCoins.filter((c) => c !== coin));
                          } else {
                            setSelectedCoins([...selectedCoins, coin]);
                          }
                        }}
                        className={`p-3 rounded-lg border-2 text-sm font-semibold transition ${
                          selectedCoins.includes(coin)
                            ? 'bg-purple-900/50 border-purple-500 text-purple-300'
                            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        {coin}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Seçili: {selectedCoins.length} coin
                  </p>
                </div>
              </div>
            )}

            {/* ALGORITMA SEKME */}
            {activeTab === 'algorithm' && (
              <div className="space-y-6">
                <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4">
                  <p className="text-sm text-blue-300">
                    <span className="font-semibold">🤖 Algoritma Modu:</span> Algoritma Binance'deki tüm coinleri analiz eder ve en iyi kar potansiyeline sahip olanları seçer.
                  </p>
                </div>

                {/* Algoritma İstatistikleri */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-900/30 border border-blue-600/30 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Tarama Modu</p>
                    <p className="text-lg font-bold text-blue-400">🔍 Tüm Coinler</p>
                  </div>
                  <div className="bg-blue-900/30 border border-blue-600/30 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Seçim Kriteri</p>
                    <p className="text-lg font-bold text-blue-400">📊 Hacim + Trend</p>
                  </div>
                  <div className="bg-blue-900/30 border border-blue-600/30 p-3 rounded-lg">
                    <p className="text-xs text-gray-400">Güncelleme</p>
                    <p className="text-lg font-bold text-blue-400">⚡ Gerçek Zamanlı</p>
                  </div>
                </div>
              </div>
            )}

            {/* ORTAK AYARLAR */}
            <div className="border-t border-gray-700 pt-6 space-y-6">
              <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                İŞLEM AYARLARI
              </h3>

              {/* Minimum Kar Yüzdesi (1x) */}
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-3 flex items-center justify-between">
                  <span>
                    💰 Minimum Kar % (1x Bazında)
                  </span>
                  <span className="text-green-400 font-bold">%{minProfit1x.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={minProfit1x}
                  onChange={(e) => setMinProfit1x(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${
                      (minProfit1x / 10) * 100
                    }%, #374151 ${(minProfit1x / 10) * 100}%, #374151 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Min: 0.1%</span>
                  <span>Max: 10%</span>
                </div>

                {/* Bilgi Kutusı */}
                <div className="mt-3 bg-green-900/20 border border-green-600/30 p-3 rounded-lg text-xs">
                  <p className="text-gray-300 mb-2">
                    <span className="font-semibold">📊 Karma Analiz:</span> Bu ayarı düşük tutmak daha fazla işlem açar. Yüksek tutmak daha yüksek kar potansiyeli gerektirir.
                  </p>
                  <p className="text-gray-400">
                    <span className="font-semibold">Komisyon Etkisi:</span> Binance %0.1 komisyon aldığından, %0.5 kar hedeflemek çoğu zaman zarar olur. Minimum %1-2 tavsiye edilir.
                  </p>
                </div>
              </div>

              {/* Leverage Ayarı */}
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-3 flex items-center justify-between">
                  <span>⚡ Leverage</span>
                  <span className="text-blue-400 font-bold text-lg">{leverage}x</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${leverage <= 10 ? '#3b82f6' : leverage <= 20 ? '#f59e0b' : '#ef4444'} 0%, ${leverage <= 10 ? '#3b82f6' : leverage <= 20 ? '#f59e0b' : '#ef4444'} ${
                      ((leverage - 1) / 49) * 100
                    }%, #374151 ${((leverage - 1) / 49) * 100}%, #374151 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1x (Spot)</span>
                  <span>50x (Max)</span>
                </div>

                {/* Leverage Hesabı */}
                <div className="mt-4 bg-blue-900/20 border border-blue-600/30 p-3 rounded-lg">
                  <p className="text-xs font-semibold text-blue-300 mb-2">📈 {leverage}x İle Beklenen Kar:</p>
                  <p className="text-lg font-bold text-blue-400">
                    %{expectedProfitWithLeverage.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    (1x Kar: %{minProfit1x.toFixed(2)} × {leverage}x Leverage)
                  </p>
                </div>

                {/* Örnek Kar Hesaplaması */}
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-400">💵 Örnek Kar Hesapları:</p>
                  {profitExamples.map((example) => (
                    <div key={example.amount} className="flex justify-between items-center bg-gray-800/50 p-2 rounded text-xs">
                      <span className="text-gray-400">{example.amount}$ işlem:</span>
                      <div className="flex gap-4">
                        <span className="text-gray-400">
                          1x: <span className="font-bold text-blue-300">+${example.profit1x.toFixed(2)}</span>
                        </span>
                        <span className="text-gray-400">
                          {leverage}x: <span className="font-bold text-green-400">+${example.profitWithLeverage.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Maksimum Açık Pozisyon */}
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-3 flex items-center justify-between">
                  <span>📌 Maksimum Açık Pozisyon</span>
                  <span className="text-yellow-400 font-bold text-lg">{maxPositions}</span>
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      onClick={() => setMaxPositions(num)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition ${
                        maxPositions === num
                          ? 'bg-yellow-900/50 border-yellow-500 text-yellow-400'
                          : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  ℹ️ Aynı anda açılabilecek maksimum pozisyon sayısı
                </p>
              </div>

              {/* Binance Modu */}
              <div>
                <label className="text-sm font-semibold text-gray-300 mb-3 block">🌐 Binance Modu</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBinanceMode('live')}
                    className={`p-4 rounded-lg border-2 transition ${
                      binanceMode === 'live'
                        ? 'bg-red-900/50 border-red-500'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Zap className="w-5 h-5 mx-auto mb-1 text-red-400" />
                    <p className="font-semibold text-white text-sm">Canlı İşlem</p>
                    <p className="text-xs text-red-300 mt-1">⚠️ GERÇEK PARA</p>
                  </button>

                  <button
                    onClick={() => setBinanceMode('testnet')}
                    className={`p-4 rounded-lg border-2 transition ${
                      binanceMode === 'testnet'
                        ? 'bg-green-900/50 border-green-500'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Zap className="w-5 h-5 mx-auto mb-1 text-green-400" />
                    <p className="font-semibold text-white text-sm">Testnet</p>
                    <p className="text-xs text-green-300 mt-1">✓ Demo, Güvenli</p>
                  </button>
                </div>
              </div>

              {/* Uyarı */}
              {binanceMode === 'live' && (
                <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
                  <p className="text-sm text-red-300 font-semibold mb-1">
                    ⚠️ ÖNEMLİ UYARI
                  </p>
                  <p className="text-xs text-red-300">
                    Canlı işlem modunda gerçek paranız kullanılacaktır. Lütfen algoritmanızı testnet'te başlayarak emin olduğunuzda canlı geçin. Tüm riskleri kendiniz üstlenirsiniz.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex gap-3 p-4 border-t border-gray-700 bg-gray-800/50 sticky bottom-0">
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
            Ayarları Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
