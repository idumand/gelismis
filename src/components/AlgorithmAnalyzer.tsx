import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  BarChart3,
  Zap,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface OrderFlowData {
  buyVolume: number;
  sellVolume: number;
  volumeImbalance: number;
  pressure: string;
  pressureScore: number;
}

interface PositionAnalysis {
  entryPrice: number;
  currentPrice: number;
  potentialProfitUSD: number;
  potentialProfitPct: number;
  targetPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  minProfitThreshold: boolean;
}

interface AlgorithmMetrics {
  orderFlow: OrderFlowData;
  algorithmScore: number;
  recommendation: string;
  positionAnalysis?: PositionAnalysis;
}

export const AlgorithmAnalyzer: React.FC<{ symbol?: string }> = ({
  symbol = "BTC/USDT",
}) => {
  const [metrics, setMetrics] = useState<AlgorithmMetrics | null>(null);
  const [minProfitThreshold, setMinProfitThreshold] = useState(0.5);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch metrics
  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/algorithm-metrics?symbol=${symbol}`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);

        // Chart verisi
        setChartData((prev) => [
          ...prev.slice(-19),
          {
            time: new Date().toLocaleTimeString(),
            score: data.algorithmScore,
            pressure: data.orderFlow.pressureScore * 50 + 50, // -50 to 50 -> 0 to 100
            rrRatio: data.positionAnalysis?.riskRewardRatio || 0,
          },
        ]);
      }
    } catch (error) {
      console.error("Metrics fetch error:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Her 5 saniye güncelle
    return () => clearInterval(interval);
  }, [symbol]);

  // Minimum kar yüzdesini güncelle
  const updateMinProfit = async (value: number) => {
    setMinProfitThreshold(value);
    try {
      await fetch("/api/v1/algorithm/set-min-profit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minProfitPct: value }),
      });
    } catch (error) {
      console.error("Update min profit error:", error);
    }
  };

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full"></div>
        <p className="mt-4 text-gray-400">Algoritma verileri yükleniyor...</p>
      </div>
    );
  }

  const orderFlow = metrics.orderFlow;
  const posAnalysis = metrics.positionAnalysis;

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Algoritma Skoru */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Algoritma Skoru
            </h3>
            <span className="text-3xl font-bold text-blue-400">
              {metrics.algorithmScore.toFixed(1)}/100
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all"
              style={{ width: `${metrics.algorithmScore}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Tavsiye: <span className="font-bold text-blue-400">{metrics.recommendation}</span>
          </p>
        </div>

        {/* Order Flow Analizi */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              Order Flow
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-sm font-bold ${
                orderFlow.pressure === "strong_buy"
                  ? "bg-green-900 text-green-300"
                  : orderFlow.pressure === "buy"
                  ? "bg-emerald-900 text-emerald-300"
                  : orderFlow.pressure === "sell"
                  ? "bg-red-900 text-red-300"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              {orderFlow.pressure.toUpperCase()}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Buy Volume:</span>
              <span className="text-green-400 font-semibold">
                {(orderFlow.buyVolume / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Sell Volume:</span>
              <span className="text-red-400 font-semibold">
                {(orderFlow.sellVolume / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
              <span className="text-gray-400">Pressure Score:</span>
              <span className={orderFlow.pressureScore > 0 ? "text-green-400" : "text-red-400"}>
                {orderFlow.pressureScore > 0 ? "+" : ""}{(orderFlow.pressureScore * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Pozisyon Analizi */}
        {posAnalysis && (
          <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Pozisyon Analizi
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Entry Price</p>
                <p className="text-lg font-bold text-white">
                  ${posAnalysis.entryPrice.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Target Price</p>
                <p className="text-lg font-bold text-green-400">
                  ${posAnalysis.targetPrice.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Stop Loss</p>
                <p className="text-lg font-bold text-red-400">
                  ${posAnalysis.stopLossPrice.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">R:R Ratio</p>
                <p className="text-lg font-bold text-blue-400">
                  1:{posAnalysis.riskRewardRatio.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700">
              <div>
                <p className="text-sm text-gray-400 mb-1">Expected Profit</p>
                <p className={`text-lg font-bold ${posAnalysis.potentialProfitPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                  ${posAnalysis.potentialProfitUSD.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">
                  ({posAnalysis.potentialProfitPct.toFixed(2)}%)
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Min Profit Filter</p>
                <p className={posAnalysis.minProfitThreshold ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                  {posAnalysis.minProfitThreshold ? "✓ PASS" : "✗ FAIL"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Exit Strategy</p>
                <p className="text-lg font-bold text-yellow-400">
                  {posAnalysis.exitStrategy}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Minimum Kar Filtresi */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-400" />
            Minimum Kar Filtresi Ayarları
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Minimum Kar Yüzdesine Göre İşlem Aç: {minProfitThreshold.toFixed(2)}%
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={minProfitThreshold}
                onChange={(e) => updateMinProfit(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>5%</span>
              </div>
            </div>

            <div className="bg-gray-900 rounded p-3 border border-gray-700">
              <p className="text-sm text-gray-300">
                💡 Bu ayar, beklenen karlılığı minimum {minProfitThreshold.toFixed(2)}% altında olan işlemler açılmasını engeller. 
                Daha yüksek bir değer, yalnızca güçlü sinyallerde işlem açılmasını sağlar.
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            Gerçek Zamanlı Algoritma Ölçümleri
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #444" }} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  name="Algorithm Score"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="pressure"
                  stroke="#10b981"
                  name="Order Flow Pressure"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-8">Veriler yükleniyor...</p>
          )}
        </div>
      </div>
    </div>
  );
};
