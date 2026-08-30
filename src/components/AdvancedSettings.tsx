import React, { useState, useEffect } from "react";
import { Settings, Save, AlertCircle, RotateCcw } from "lucide-react";

interface SettingsState {
  minProfitThresholdPct: number;
  maxOpenTrades: number;
  stakeAmount: number;
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  environment: "testnet" | "live";
  coinSelectionMode: "manual" | "algorithm";
  marginMode: "isolated" | "cross";
}

export const AdvancedSettings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    minProfitThresholdPct: 0.5,
    maxOpenTrades: 1,
    stakeAmount: 10,
    leverage: 15,
    stopLossPct: 1.0,
    takeProfitPct: 0.5,
    environment: "testnet",
    coinSelectionMode: "algorithm",
    marginMode: "isolated",
  });

  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ayarları yükle
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/v1/settings");
        if (response.ok) {
          const data = await response.json();
          setSettings(data);
        }
      } catch (error) {
        console.error("Settings fetch error:", error);
      }
    };
    fetchSettings();
  }, []);

  // Ayarları kaydet
  const saveSettings = async () => {
    setLoading(true);
    setSavedStatus(null);
    try {
      const response = await fetch("/api/v1/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSavedStatus("✓ Ayarlar başarıyla kaydedildi");
        setTimeout(() => setSavedStatus(null), 3000);
      } else {
        setSavedStatus("✗ Ayarlar kaydedilemedi");
      }
    } catch (error) {
      setSavedStatus("✗ Hata: " + (error as Error).message);
    }
    setLoading(false);
  };

  // Varsayılan ayarlara sıfırla
  const resetSettings = async () => {
    if (confirm("Tüm ayarları varsayılana sıfırlamak istiyor musunuz?")) {
      setSettings({
        minProfitThresholdPct: 0.5,
        maxOpenTrades: 1,
        stakeAmount: 10,
        leverage: 15,
        stopLossPct: 1.0,
        takeProfitPct: 0.5,
        environment: "testnet",
        coinSelectionMode: "algorithm",
        marginMode: "isolated",
      });
      setSavedStatus("⟳ Varsayılan ayarlar yüklendi");
      setTimeout(() => setSavedStatus(null), 3000);
    }
  };

  const updateSetting = (key: keyof SettingsState, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-400" />
          Gelişmiş Ayarlar
        </h2>
        {savedStatus && (
          <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            savedStatus.includes("✓") ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
          }`}>
            {savedStatus}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Minimum Kar Filtresi */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            💰 Minimum Kar Yüzdesi
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.minProfitThresholdPct}
              onChange={(e) =>
                updateSetting("minProfitThresholdPct", parseFloat(e.target.value))
              }
              step="0.1"
              min="0"
              max="10"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400">%</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum {settings.minProfitThresholdPct.toFixed(2)}% kar beklentisine göre işlem aç
          </p>
        </div>

        {/* Maksimum Açık İşlem */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            📊 Maks. Açık İşlem
          </label>
          <select
            value={settings.maxOpenTrades}
            onChange={(e) =>
              updateSetting("maxOpenTrades", parseInt(e.target.value))
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} İşlem
              </option>
            ))}
          </select>
        </div>

        {/* Stake Amount */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            💵 İşlem Başına Miktar (USDT)
          </label>
          <input
            type="number"
            value={settings.stakeAmount}
            onChange={(e) =>
              updateSetting("stakeAmount", parseFloat(e.target.value))
            }
            step="5"
            min="1"
            max="1000"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Leverage */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            📈 Kaldıraç (Leverage)
          </label>
          <select
            value={settings.leverage}
            onChange={(e) =>
              updateSetting("leverage", parseInt(e.target.value))
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            {[1, 2, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}x Kaldıraç
              </option>
            ))}
          </select>
        </div>

        {/* Stop Loss */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            ⛔ Stop Loss Yüzdesi
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.stopLossPct}
              onChange={(e) =>
                updateSetting("stopLossPct", parseFloat(e.target.value))
              }
              step="0.1"
              min="0.1"
              max="10"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400">%</span>
          </div>
        </div>

        {/* Take Profit */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            ✅ Take Profit Yüzdesi
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.takeProfitPct}
              onChange={(e) =>
                updateSetting("takeProfitPct", parseFloat(e.target.value))
              }
              step="0.1"
              min="0.1"
              max="10"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400">%</span>
          </div>
        </div>

        {/* Environment */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            🌐 Ortam (Environment)
          </label>
          <select
            value={settings.environment}
            onChange={(e) =>
              updateSetting("environment", e.target.value as "testnet" | "live")
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            <option value="testnet">🧪 Testnet (Demo)</option>
            <option value="live">💰 Live (Gerçek Para!)</option>
          </select>
          {settings.environment === "live" && (
            <div className="mt-2 p-2 bg-red-900 border border-red-700 rounded text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Dikkat: Gerçek para ile işlem yapılacak!</span>
            </div>
          )}
        </div>

        {/* Koin Seçim Modu */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            🤖 Koin Seçim Modu
          </label>
          <select
            value={settings.coinSelectionMode}
            onChange={(e) =>
              updateSetting(
                "coinSelectionMode",
                e.target.value as "manual" | "algorithm"
              )
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            <option value="manual">✋ Manuel (Whitelist)</option>
            <option value="algorithm">🧠 Algoritma (Otomatik)</option>
          </select>
        </div>

        {/* Margin Modu */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <label className="block text-sm font-semibold text-white mb-2">
            💳 Margin Modu
          </label>
          <select
            value={settings.marginMode}
            onChange={(e) =>
              updateSetting("marginMode", e.target.value as "isolated" | "cross")
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            <option value="isolated">🔒 İzole (Isolated)</option>
            <option value="cross">🔗 Çapraz (Cross)</option>
          </select>
        </div>
      </div>

      {/* Bilgi Kutusu */}
      <div className="mt-6 p-4 bg-blue-900 border border-blue-700 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-300 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-200">
          <p className="font-semibold mb-1">💡 Ayarlar Hakkında</p>
          <ul className="space-y-1 text-xs opacity-90">
            <li>• <span className="font-semibold">Minimum Kar Yüzdesi:</span> Beklenen kar bu yüzdenin altındaysa işlem açılmaz</li>
            <li>• <span className="font-semibold">Kaldıraç:</span> Testnet'te güvenli şekilde yüksek kaldıraç deneyebilirsiniz</li>
            <li>• <span className="font-semibold">Ortam:</span> Testnet'te başlayın, başarılı sonraç Live'ye geçin</li>
            <li>• <span className="font-semibold">Koin Seçimi:</span> Algoritma modu, en iyi fırsatları otomatik bulur</li>
          </ul>
        </div>
      </div>

      {/* Butonlar */}
      <div className="mt-6 flex gap-3 justify-end">
        <button
          onClick={resetSettings}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Sıfırla
        </button>
        <button
          onClick={saveSettings}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {loading ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
};
