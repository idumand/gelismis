import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  Zap,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';

export interface CoinMarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number; // USDT
  high24h: number;
  low24h: number;
  bidVolume?: number;
  askVolume?: number;
  spread?: number; // percentage
  pressure?: number; // -1 to 1
  rsi?: number;
  trend?: 'uptrend' | 'downtrend' | 'sideways';
  lastUpdate?: number;
}

interface MarketDataViewerProps {
  coins: CoinMarketData[];
  onCoinSelect?: (symbol: string) => void;
  selectedCoin?: string;
  isLoading?: boolean;
}

type SortBy = 'price' | 'change' | 'volume' | 'spread' | 'pressure';
type SortOrder = 'asc' | 'desc';

export function MarketDataViewer({
  coins,
  onCoinSelect,
  selectedCoin,
  isLoading = false
}: MarketDataViewerProps) {
  const [sortBy, setSortBy] = useState<SortBy>('volume');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [hiddenCoins, setHiddenCoins] = useState<Set<string>>(new Set());

  const sortedCoins = useMemo(() => {
    const visibleCoins = coins.filter(c => !hiddenCoins.has(c.symbol));
    
    return [...visibleCoins].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'price':
          aVal = a.price;
          bVal = b.price;
          break;
        case 'change':
          aVal = a.change24h;
          bVal = b.change24h;
          break;
        case 'volume':
          aVal = a.volume24h;
          bVal = b.volume24h;
          break;
        case 'spread':
          aVal = a.spread || 0;
          bVal = b.spread || 0;
          break;
        case 'pressure':
          aVal = a.pressure || 0;
          bVal = b.pressure || 0;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [coins, sortBy, sortOrder, hiddenCoins]);

  const handleSort = (key: SortBy) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  const toggleCoinVisibility = (symbol: string) => {
    setHiddenCoins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Pazar Verileri ({sortedCoins.length} Coin)
          </h3>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Güncelleniyor...
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800 sticky top-0">
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Coin</th>
              <th
                className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-700 select-none"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center justify-end gap-1">
                  Fiyat {sortBy === 'price' && (
                    sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-700 select-none"
                onClick={() => handleSort('change')}
              >
                <div className="flex items-center justify-end gap-1">
                  24h {sortBy === 'change' && (
                    sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-700 select-none"
                onClick={() => handleSort('volume')}
              >
                <div className="flex items-center justify-end gap-1">
                  Volume {sortBy === 'volume' && (
                    sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-700 select-none"
                onClick={() => handleSort('spread')}
              >
                <div className="flex items-center justify-end gap-1">
                  Spread {sortBy === 'spread' && (
                    sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-700 select-none"
                onClick={() => handleSort('pressure')}
              >
                <div className="flex items-center justify-end gap-1">
                  Baskı {sortBy === 'pressure' && (
                    sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-slate-300">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {sortedCoins.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Coin verisi yok
                </td>
              </tr>
            ) : (
              sortedCoins.map((coin) => (
                <React.Fragment key={coin.symbol}>
                  <tr
                    className={clsx(
                      'border-b border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer',
                      selectedCoin === coin.symbol && 'bg-blue-900 bg-opacity-20'
                    )}
                    onClick={() => onCoinSelect?.(coin.symbol)}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span>{coin.symbol}</span>
                        {coin.trend && (
                          <span className={clsx(
                            'text-xs px-2 py-1 rounded',
                            coin.trend === 'uptrend' ? 'bg-green-900 text-green-300' :
                            coin.trend === 'downtrend' ? 'bg-red-900 text-red-300' :
                            'bg-slate-700 text-slate-300'
                          )}>
                            {coin.trend === 'uptrend' ? '↗' : coin.trend === 'downtrend' ? '↘' : '→'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 font-mono">
                      ${coin.price.toFixed(2)}
                    </td>
                    <td className={clsx(
                      'px-4 py-3 text-right font-semibold font-mono',
                      coin.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                    )}>
                      <div className="flex items-center justify-end gap-1">
                        {coin.change24h >= 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                        {Math.abs(coin.change24h).toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                      ${(coin.volume24h / 1e6).toFixed(2)}M
                    </td>
                    <td className={clsx(
                      'px-4 py-3 text-right font-mono',
                      coin.spread ? coin.spread < 0.01 ? 'text-green-400' : 'text-orange-400' : 'text-slate-400'
                    )}>
                      {coin.spread ? `${(coin.spread * 100).toFixed(4)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PressureBar pressure={coin.pressure ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCoinVisibility(coin.symbol);
                        }}
                        className="text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {hiddenCoins.has(coin.symbol) ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                  
                  {/* Detailed Row */}
                  {showDetails[coin.symbol] && (
                    <tr className="bg-slate-800 border-b border-slate-700">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <DetailItem
                            label="24h Yüksek"
                            value={`$${coin.high24h.toFixed(2)}`}
                          />
                          <DetailItem
                            label="24h Düşük"
                            value={`$${coin.low24h.toFixed(2)}`}
                          />
                          {coin.bidVolume && coin.askVolume && (
                            <>
                              <DetailItem
                                label="Talep (Bid) Hacmi"
                                value={`${coin.bidVolume.toFixed(0)}`}
                              />
                              <DetailItem
                                label="Arz (Ask) Hacmi"
                                value={`${coin.askVolume.toFixed(0)}`}
                              />
                            </>
                          )}
                          {coin.rsi !== undefined && (
                            <DetailItem
                              label="RSI (14)"
                              value={`${coin.rsi.toFixed(1)}`}
                              color={
                                coin.rsi > 70 ? 'text-red-400' :
                                coin.rsi < 30 ? 'text-green-400' :
                                'text-slate-300'
                              }
                            />
                          )}
                          {coin.lastUpdate && (
                            <DetailItem
                              label="Son Güncelleme"
                              value={new Date(coin.lastUpdate).toLocaleTimeString('tr-TR')}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Stats */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-3 grid grid-cols-4 gap-4 text-sm">
        <Stat
          label="Toplam Coin"
          value={coins.length.toString()}
          icon={<Zap className="w-4 h-4" />}
        />
        <Stat
          label="Görünür"
          value={sortedCoins.length.toString()}
          icon={<Eye className="w-4 h-4" />}
        />
        <Stat
          label="Ort. Change"
          value={`${(coins.reduce((sum, c) => sum + c.change24h, 0) / coins.length).toFixed(2)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <Stat
          label="Ort. Volume"
          value={`$${(coins.reduce((sum, c) => sum + c.volume24h, 0) / coins.length / 1e6).toFixed(0)}M`}
          icon={<BarChart3 className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}

function PressureBar({ pressure }: { pressure: number }) {
  // pressure is -1 to 1: negative = selling, positive = buying
  const normalizedPressure = (pressure + 1) / 2; // 0 to 1
  const isPositive = pressure > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-6 bg-slate-900 rounded overflow-hidden border border-slate-700 flex">
        <div
          className={clsx(
            'h-full transition-all duration-300',
            isPositive ? 'bg-green-500' : 'bg-red-500'
          )}
          style={{
            width: `${Math.abs(pressure) * 100}%`,
            marginLeft: pressure < 0 ? `${100 + pressure * 100}%` : '0%'
          }}
        />
      </div>
      <span className="text-xs font-mono text-slate-400 w-12">
        {(pressure * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function DetailItem({
  label,
  value,
  color = 'text-slate-300'
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={clsx('font-mono font-semibold', color)}>{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-slate-400">{icon}</div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="font-semibold text-slate-200">{value}</p>
      </div>
    </div>
  );
}
