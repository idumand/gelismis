import React, { useState, useEffect } from "react";
import { Search, TrendingUp, TrendingDown, Zap, DollarSign } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface CoinData {
  symbol: string;
  pair: string;
  price: number;
  change24h: number;
  change1h: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
  lastUpdate: number;
  buyPressure: number;
  sellPressure: number;
  algorithmScore: number;
}

interface SelectedCoin extends CoinData {
  priceHistory?: { time: string; price: number }[];
  volumeHistory?: { time: string; volume: number }[];
}

export const BinanceCoinData: React.FC = () => {
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<SelectedCoin | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"algorithm" | "volume" | "change">("algorithm");

  // Binance verilerini getir
  const fetchCoinData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/binance/market-data");
      if (response.ok) {
        const data = await response.json();
        setCoins(data);
      }
    } catch (error) {
      console.error("Coin data fetch error:", error);
    }
    setLoading(false);
  };

  // Seçili coin detaylarını getir
  const fetchCoinDetails = async (pair: string) => {
    try {
      const response = await fetch(`/api/v1/binance/coin-details?pair=${pair}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedCoin(data);
      }
    } catch (error) {
      console.error("Coin details fetch error:", error);
    }
  };

  useEffect(() => {
    fetchCoinData();
    const interval = setInterval(fetchCoinData, 10000); // Her 10 saniye güncelle
    return () => clearInterval(interval);
  }, []);

  // Sıralama
  const sortedCoins = [...coins].sort((a, b) => {
    if (sortBy === "algorithm") return b.algorithmScore - a.algorithmScore;
    if (sortBy === "volume") return b.volume24h - a.volume24h;
    if (sortBy === "change") return b.change24h - a.change24h;
    return 0;
  });

  // Filtreleme
  const filteredCoins = sortedCoins.filter(
    (coin) =>
      coin.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coin.pair.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Panel: Koin Listesi */}
        <div className="lg:col-span-1">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Koin ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Sıralama Seçenekleri */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSortBy("algorithm")}
              className={`px-3 py-1 rounded text-sm font-semibold transition-all ${
                sortBy === "algorithm"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Algoritma
            </button>
            <button
              onClick={() => setSortBy("volume")}
              className={`px-3 py-1 rounded text-sm font-semibold transition-all ${
                sortBy === "volume"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Hacim
            </button>
            <button
              onClick={() => setSortBy("change")}
              className={`px-3 py-1 rounded text-sm font-semibold transition-all ${
                sortBy === "change"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Değişim
            </button>
          </div>

          {/* Koin Listesi */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {loading && filteredCoins.length === 0 ? (
              <div className="text-center py-4 text-gray-400">
                <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full"></div>
              </div>
            ) : filteredCoins.length === 0 ? (
              <div className="text-center py-4 text-gray-400">Koin bulunamadı</div>
            ) : (
              filteredCoins.map((coin) => (
                <button
                  key={coin.pair}
                  onClick={() => {
                    setSelectedCoin(coin);
                    fetchCoinDetails(coin.pair);
                  }}
                  className={`w-full p-3 rounded-lg transition-all text-left ${
                    selectedCoin?.pair === coin.pair
                      ? "bg-blue-600 border border-blue-500"
                      : "bg-gray-800 border border-gray-700 hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white">{coin.symbol}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        coin.algorithmScore >= 70
                          ? "bg-green-900 text-green-300"
                          : coin.algorithmScore >= 50
                          ? "bg-yellow-900 text-yellow-300"
                          : "bg-red-900 text-red-300"
                      }`}
                    >
                      {coin.algorithmScore.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">${coin.price.toFixed(2)}</span>
                    <span
                      className={
                        coin.change24h >= 0 ? "text-green-400" : "text-red-400"
                      }
                    >
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Vol: ${(coin.volume24h / 1000000).toFixed(0)}M
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçili Koin Detayları */}
        <div className="lg:col-span-2">
          {selectedCoin ? (
            <div className="space-y-4">
              {/* Koin Başlığı */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {selectedCoin.symbol}
                    </h2>
                    <p className="text-gray-400">{selectedCoin.pair}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white">
                      ${selectedCoin.price.toFixed(2)}
                    </p>
                    <p
                      className={`text-lg font-semibold flex items-center justify-end gap-2 ${
                        selectedCoin.change24h >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {selectedCoin.change24h >= 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <TrendingDown className="w-5 h-5" />
                      )}
                      {selectedCoin.change24h >= 0 ? "+" : ""}
                      {selectedCoin.change24h.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Market Verileri */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">24h Change</p>
                  <p className={selectedCoin.change24h >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                    {selectedCoin.change24h >= 0 ? "+" : ""}
                    {selectedCoin.change24h.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">1h Change</p>
                  <p className={selectedCoin.change1h >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                    {selectedCoin.change1h >= 0 ? "+" : ""}
                    {selectedCoin.change1h.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">24h High</p>
                  <p className="text-yellow-400 font-bold">
                    ${selectedCoin.high24h.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">24h Low</p>
                  <p className="text-yellow-400 font-bold">
                    ${selectedCoin.low24h.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">24h Volume</p>
                  <p className="text-blue-400 font-bold">
                    ${(selectedCoin.volume24h / 1000000).toFixed(0)}M
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">Algorithm Score</p>
                  <p className="text-purple-400 font-bold">
                    {selectedCoin.algorithmScore.toFixed(1)}/100
                  </p>
                </div>
              </div>

              {/* Order Flow */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Order Flow
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-400">Buy Pressure</span>
                      <span className="text-green-400 font-bold">
                        {(selectedCoin.buyPressure * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${selectedCoin.buyPressure * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-400">Sell Pressure</span>
                      <span className="text-red-400 font-bold">
                        {(selectedCoin.sellPressure * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all"
                        style={{ width: `${selectedCoin.sellPressure * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fiyat Grafiği */}
              {selectedCoin.priceHistory && selectedCoin.priceHistory.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-3">
                    Fiyat Geçmişi
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={selectedCoin.priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="time" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #444" }} />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#3b82f6"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Detaylara görmek için bir koin seçin</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
