import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  Zap,
  Brain,
  BarChart3,
  DollarSign,
  Shield,
  Percent,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';

interface AdvancedSettingsProps {
  leverage: number;
  onLeverageChange: (value: number) => void;
  
  minimumProfitPct: number;
  onMinimumProfitChange: (value: number) => void;
  
  stakeAmount: number;
  onStakeAmountChange: (value: number) => void;
  
  maxOpenTrades: number;
  onMaxOpenTradesChange: (value: number) => void;
  
  commission: number;
  onCommissionChange: (value: number) => void;
  
  slippage: number;
  onSlippageChange: (value: number) => void;
  
  maxSpread: number;
  onMaxSpreadChange: (value: number) => void;
  
  mode: 'manual' | 'algorithm';
  onModeChange: (mode: 'manual' | 'algorithm') => void;
  
  selectedCoins?: string[];
  onSelectedCoinsChange?: (coins: string[]) => void;
  
  allAvailableCoins?: string[];
}

interface LeveragePreset {
  label: string;
  value: number;
  riskLevel: 'low' | 'medium' | 'high';
}

const LEVERAGE_PRESETS: LeveragePreset[] = [
  { label: '1x (Spot)', value: 1, riskLevel: 'low' },
  { label: '2x', value: 2, riskLevel: 'low' },
  { label: '5x', value: 5, riskLevel: 'low' },
  { label: '10x', value: 10, riskLevel: 'medium' },
  { label: '15x', value: 15, riskLevel: 'medium' },
  { label: '20x', value: 20, riskLevel: 'high' },
  { label: '50x', value: 50, riskLevel: 'high' },
  { label: '100x', value: 100, riskLevel: 'high' },
];

const DEFAULT_COINS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];

export function AdvancedSettings({
  leverage,
  onLeverageChange,
  minimumProfitPct,
  onMinimumProfitChange,
  stakeAmount,
  onStakeAmountChange,
  maxOpenTrades,
  onMaxOpenTradesChange,
  commission,
  onCommissionChange,
  slippage,
  onSlippageChange,
  maxSpread,
  onMaxSpreadChange,
  mode,
  onModeChange,
  selectedCoins = DEFAULT_COINS,
  onSelectedCoinsChange,
  allAvailableCoins = DEFAULT_COINS
}: AdvancedSettingsProps) {
  const [expandedSection, setExpandedSection] = useState<'mode' | 'leverage' | 'profit' | 'position' | 'market' | null>('mode');

  // Calculate expected profit with commission for display
  const expectedProfitAfterCommission = minimumProfitPct - commission - slippage;

  return (
    <div className="space-y-3 bg-slate-900 rounded-lg border border-slate-700 p-4">
      {/* Mode Selection */}
      <SettingSection
        icon={<Brain className="w-5 h-5" />}
        title="Mod Seçimi"
        expanded={expandedSection === 'mode'}
        onToggle={() => setExpandedSection(expandedSection === 'mode' ? null : 'mode')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onModeChange('manual')}
              className={clsx(
                'p-4 rounded-lg border-2 transition-all',
                mode === 'manual'
                  ? 'border-blue-500 bg-blue-900 bg-opacity-30'
                  : 'border-slate-600 bg-slate-800 hover:border-slate-500'
              )}
            >
              <div className="text-sm font-semibold mb-1">Manuel Mod</div>
              <p className="text-xs text-slate-400">Seçtiğin coinlerle işlem yap</p>
            </button>
            
            <button
              onClick={() => onModeChange('algorithm')}
              className={clsx(
                'p-4 rounded-lg border-2 transition-all',
                mode === 'algorithm'
                  ? 'border-purple-500 bg-purple-900 bg-opacity-30'
                  : 'border-slate-600 bg-slate-800 hover:border-slate-500'
              )}
            >
              <div className="text-sm font-semibold mb-1">Algoritma Modu</div>
              <p className="text-xs text-slate-400">AI en iyi coini seç</p>
            </button>
          </div>

          {/* Coin Selection for Manual Mode */}
          {mode === 'manual' && onSelectedCoinsChange && (
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-600">
              <p className="text-sm font-semibold mb-3 text-slate-200">
                İşlem Yapılacak Coinler
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {allAvailableCoins.map((coin) => (
                  <label
                    key={coin}
                    className="flex items-center gap-2 p-2 rounded hover:bg-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCoins.includes(coin)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedCoinsChange([...selectedCoins, coin]);
                        } else {
                          onSelectedCoinsChange(selectedCoins.filter(c => c !== coin));
                        }
                      }}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    <span className="text-sm">{coin}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === 'algorithm' && (
            <div className="p-3 bg-purple-900 bg-opacity-20 border border-purple-600 rounded-lg text-sm text-purple-200">
              🤖 Algoritma tüm coinleri analiz edip en iyi fırsatı seçecektir.
            </div>
          )}
        </div>
      </SettingSection>

      {/* Leverage Settings */}
      <SettingSection
        icon={<Zap className="w-5 h-5" />}
        title={`Kaldıraç: ${leverage}x`}
        expanded={expandedSection === 'leverage'}
        onToggle={() => setExpandedSection(expandedSection === 'leverage' ? null : 'leverage')}
      >
        <div className="space-y-4">
          {/* Leverage Presets */}
          <div className="grid grid-cols-4 gap-2">
            {LEVERAGE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => onLeverageChange(preset.value)}
                className={clsx(
                  'py-2 px-2 rounded text-sm font-semibold transition-all border',
                  leverage === preset.value
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
                )}
                title={`Risk Level: ${preset.riskLevel}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Leverage */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Özel Kaldıraç</span>
              <span className="text-blue-400 font-semibold">{leverage}x</span>
            </label>
            <input
              type="range"
              min="1"
              max="125"
              value={leverage}
              onChange={(e) => onLeverageChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Risk Warning */}
          <div className={clsx(
            'p-3 rounded-lg text-sm',
            leverage >= 50
              ? 'bg-red-900 bg-opacity-30 border border-red-600 text-red-200'
              : leverage >= 20
              ? 'bg-orange-900 bg-opacity-30 border border-orange-600 text-orange-200'
              : 'bg-green-900 bg-opacity-30 border border-green-600 text-green-200'
          )}>
            {leverage >= 50
              ? '⚠️ Çok Yüksek Risk - Hesap Tasfiyesi Riski!'
              : leverage >= 20
              ? '⚠️ Yüksek Risk'
              : '✓ Düşük Risk'}
          </div>
        </div>
      </SettingSection>

      {/* Profit Settings */}
      <SettingSection
        icon={<DollarSign className="w-5 h-5" />}
        title="Kar Hedefleri"
        expanded={expandedSection === 'profit'}
        onToggle={() => setExpandedSection(expandedSection === 'profit' ? null : 'profit')}
      >
        <div className="space-y-4">
          {/* Minimum Profit at 1x */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Percent className="w-4 h-4" />
                Minimum Kar (1x'te)
              </span>
              <span className="text-blue-400 font-semibold">{minimumProfitPct.toFixed(2)}%</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={minimumProfitPct}
              onChange={(e) => onMinimumProfitChange(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-2">
              0.1% ile 10% arasında ayarla
            </p>
          </div>

          {/* Commission Impact */}
          <div className="p-3 bg-slate-800 rounded-lg border border-slate-600">
            <p className="text-sm font-semibold text-slate-200 mb-3">Maliyet Analizi</p>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>Hedeflenen Kar:</span>
                <span className="text-blue-400 font-semibold">{minimumProfitPct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Komisyon:</span>
                <span className="text-red-400">-{commission.toFixed(3)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Slipaj:</span>
                <span className="text-orange-400">-{slippage.toFixed(3)}%</span>
              </div>
              <div className="border-t border-slate-600 pt-2 flex justify-between font-semibold">
                <span>Net Kar ({leverage}x):</span>
                <span className={
                  expectedProfitAfterCommission > 0 ? 'text-green-400' : 'text-red-400'
                }>
                  {(expectedProfitAfterCommission * leverage).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Warning if profit is too low */}
          {expectedProfitAfterCommission < 0 && (
            <div className="p-3 bg-red-900 bg-opacity-30 border border-red-600 rounded-lg text-sm text-red-200">
              ⚠️ Minimum kar hedefi komisyon ve slipajdan az! Hedefinizi artırın.
            </div>
          )}
        </div>
      </SettingSection>

      {/* Position Settings */}
      <SettingSection
        icon={<Shield className="w-5 h-5" />}
        title="Pozisyon Ayarları"
        expanded={expandedSection === 'position'}
        onToggle={() => setExpandedSection(expandedSection === 'position' ? null : 'position')}
      >
        <div className="space-y-4">
          {/* Stake Amount */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Açılış Miktarı (USDT)</span>
              <span className="text-blue-400 font-semibold">${stakeAmount.toFixed(2)}</span>
            </label>
            <input
              type="number"
              min="10"
              max="10000"
              step="10"
              value={stakeAmount}
              onChange={(e) => onStakeAmountChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
            />
            <p className="text-xs text-slate-500 mt-2">
              Her pozisyon açılışında bu miktar kullanılacak
            </p>
          </div>

          {/* Max Open Trades */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Maksimum Açık Pozisyon</span>
              <span className="text-blue-400 font-semibold">{maxOpenTrades}</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 5, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => onMaxOpenTradesChange(num)}
                  className={clsx(
                    'py-2 rounded text-sm font-semibold transition-all border',
                    maxOpenTrades === num
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-800 rounded-lg border border-slate-600 text-sm text-slate-300">
            💡 Toplam Marj Riski: <span className="font-semibold text-blue-400">
              ${(stakeAmount * leverage * maxOpenTrades).toFixed(2)}
            </span>
          </div>
        </div>
      </SettingSection>

      {/* Market Settings */}
      <SettingSection
        icon={<BarChart3 className="w-5 h-5" />}
        title="Pazar Ayarları"
        expanded={expandedSection === 'market'}
        onToggle={() => setExpandedSection(expandedSection === 'market' ? null : 'market')}
      >
        <div className="space-y-4">
          {/* Commission */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Toplam Komisyon (%)</span>
              <span className="text-blue-400 font-semibold">{commission.toFixed(3)}%</span>
            </label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={commission}
              onChange={(e) => onCommissionChange(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-2">
              Binance'te genellikle 0.04% taker + 0.04% maker = 0.08%
            </p>
          </div>

          {/* Slippage */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Slipaj (%)</span>
              <span className="text-blue-400 font-semibold">{slippage.toFixed(3)}%</span>
            </label>
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={slippage}
              onChange={(e) => onSlippageChange(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-2">
              Pazar volatilitesi sırasında ortaya çıkabilecek fiyat farkı
            </p>
          </div>

          {/* Max Spread */}
          <div>
            <label className="text-sm text-slate-300 mb-2 flex items-center justify-between">
              <span>Maksimum Spread (%)</span>
              <span className="text-blue-400 font-semibold">{maxSpread.toFixed(4)}%</span>
            </label>
            <input
              type="range"
              min="0.001"
              max="1"
              step="0.001"
              value={maxSpread}
              onChange={(e) => onMaxSpreadChange(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-500 mt-2">
              Spread bu değerden yüksekse işlem açılmayacak
            </p>
          </div>
        </div>
      </SettingSection>

      {/* Save Notice */}
      <div className="p-3 bg-green-900 bg-opacity-20 border border-green-600 rounded-lg text-sm text-green-200 flex items-center gap-2">
        <CheckIcon className="w-4 h-4" />
        Ayarlar otomatik kaydedilmektedir
      </div>
    </div>
  );
}

interface SettingSectionProps {
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SettingSection({ icon, title, expanded, onToggle, children }: SettingSectionProps) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-blue-400">{icon}</div>
          <span className="font-semibold text-slate-200">{title}</span>
        </div>
        <ChevronDown
          className={clsx(
            'w-5 h-5 text-slate-400 transition-transform',
            expanded && 'transform rotate-180'
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 py-4 bg-slate-900 bg-opacity-50 border-t border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
