import { BotMetrics, StrategyInfo, Trade, MarketPairInfo, LogEntry } from '../types';

export const INITIAL_METRICS: BotMetrics = {
  total_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  win_rate: 0,
  total_pnl_usdt: 0,
  total_pnl_pct: 0,
  daily_pnl_usdt: 0,
  balance_usdt: 0,
  starting_balance: 0,
  max_drawdown_pct: 0,
  sharpe_ratio: 0,
  profit_factor: 0,
  open_trades_count: 0,
  max_open_trades: 1,
  stake_amount: 25,
  fiat_symbol: 'USD',
  fiat_ratio: 1.0,
};

export const INITIAL_TRADES: Trade[] = [];

export const INITIAL_MARKETS: MarketPairInfo[] = [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 62840.00, change_24h_pct: 3.42, volume_24h_usdt: 1845000000, high_24h: 63400.00, low_24h: 60500.00, in_whitelist: true, in_blacklist: false, signal: 'BUY' },
  { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 3415.50, change_24h_pct: 2.85, volume_24h_usdt: 980000000, high_24h: 3460.00, low_24h: 3300.00, in_whitelist: true, in_blacklist: false, signal: 'BUY' },
  { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: 151.80, change_24h_pct: -1.20, volume_24h_usdt: 420000000, high_24h: 156.50, low_24h: 149.20, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: 578.50, change_24h_pct: 1.90, volume_24h_usdt: 210000000, high_24h: 585.00, low_24h: 565.00, in_whitelist: true, in_blacklist: false, signal: 'BUY' },
  { symbol: 'XRP/USDT', base: 'XRP', quote: 'USDT', price: 0.572, change_24h_pct: -0.80, volume_24h_usdt: 180000000, high_24h: 0.590, low_24h: 0.562, in_whitelist: true, in_blacklist: false, signal: 'SELL' },
  { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', price: 0.368, change_24h_pct: 2.10, volume_24h_usdt: 95000000, high_24h: 0.380, low_24h: 0.352, in_whitelist: true, in_blacklist: false, signal: 'BUY' },
  { symbol: 'AVAX/USDT', base: 'AVAX', quote: 'USDT', price: 24.50, change_24h_pct: 4.15, volume_24h_usdt: 110000000, high_24h: 25.20, low_24h: 23.10, in_whitelist: true, in_blacklist: false, signal: 'BUY' },
  { symbol: 'DOGE/USDT', base: 'DOGE', quote: 'USDT', price: 0.104, change_24h_pct: -2.30, volume_24h_usdt: 140000000, high_24h: 0.108, low_24h: 0.101, in_whitelist: false, in_blacklist: true, signal: 'SELL' },
];

export const STRATEGIES: Record<string, StrategyInfo> = {
  OrderFlow_Quantitative: {
    name: 'OrderFlow_Quantitative_V1',
    description: 'Yüksek frekanslı (HFT) mikroyapı analizi yapan nicel motor. Order Book Imbalance (OBI), Micro-Price ve Hacim Deltasını kullanarak pozisyon yönetir.',
    timeframe: 'tick',
    minimal_roi: {
      '0': 0.05,
      '30': 0.02,
      '60': 0.01
    },
    stoploss: -0.02,
    trailing_stop: true,
    trailing_stop_positive: 0.01,
    process_only_new_candles: false,
    use_exit_signal: true,
    code_python: `# --- OrderFlow Quantitative Engine (Node.js Ported) ---
# Bu strateji matematiksel emir defteri okuması (Order Book Imbalance) yapar.
# Python kod blokları sadece görsel temsildir. Gerçek algoritmik yürütme 
# server.ts içindeki 'executeRealTradeLogic' üzerinden yapılmaktadır.

# 1. Order Book Imbalance (OBI) Hesaplaması
# OBI = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
# Giriş Kriteri: OBI > +0.35 (Alış Baskısı) veya OBI < -0.35 (Satış Baskısı)

# 2. Micro-Price Hesaplaması
# MicroPrice = (V_b * P_a + V_a * P_b) / (V_b + V_a)
# Giriş Kriteri: MicroPrice > MidPrice (Long)

# 3. Hacim Deltası
# Delta = V_taker_buy - V_taker_sell
# Giriş Kriteri: Delta ile OBI'nin aynı yönü teyit etmesi

# 4. Dinamik Kâr Koruma ve Erime (Trailing Stop)
# Zirve fiyattan %1 geri çekilme tespit edildiğinde pozisyon kapatılır.

# 5. Hızlı Negatife Dönüş ve Hard Stop Loss
# Eğer OBI ters yönde -0.20'ye düşerse veya fiyat %2 zarar ederse derhal stop olur.
`
  }
};
export const INITIAL_CONFIG_JSON = JSON.stringify({
  max_open_trades: 1,
  stake_currency: "USDT",
  stake_amount: 25,
  tradable_balance_ratio: 0.99,
  fiat_display_currency: "USD",
  timeframe: "5m",
  dry_run: false,
  cancel_open_orders_on_exit: false,
  trading_mode: "spot",
  margin_mode: "isolated",
  unfilledtimeout: {
    entry: 10,
    exit: 10,
    exit_timeout_count: 0,
    unit: "minutes"
  },
  entry_pricing: {
    price_side: "same",
    use_order_book: true,
    order_book_top: 1
  },
  exit_pricing: {
    price_side: "same",
    use_order_book: true
  },
  exchange: {
    name: "binance",
    key: "",
    secret: "",
    ccxt_config: { "enableRateLimit": true },
    ccxt_async_config: { "enableRateLimit": true },
    pair_whitelist: [
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
      "BNB/USDT",
      "XRP/USDT",
      "ADA/USDT"
    ],
    pair_blacklist: [
      "DOGE/USDT"
    ]
  },
  pairlists: [
    { "method": "StaticPairList" },
    { "method": "VolumePairList", "number_assets": 20, "sort_key": "quoteVolume" }
  ],
  api_server: {
    enabled: true,
    listen_ip_address: "0.0.0.0",
    listen_port: 3000,
    verbosity: "info"
  },
  bot_name: "freqtrade_sfeef_bot",
  initial_state: "running"
}, null, 2);

export const INITIAL_LOGS: LogEntry[] = [];
