// ── Pyth Hermes API — Realtime Price Feeds ─────────────────────────────────
// Docs: https://hermes.pyth.network/docs

export const PYTH_FEEDS = {
  SOL_USD:  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC_USD:  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH_USD:  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  GOLD_USD: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
  // Land/Real estate proxy — using an index
  RE_INDEX: "f3bd52a97fd14c60d23b2ff49a64c7de59df3c0a67b8e56c7e8b17e98a18e8b8",
};

export const HERMES_URL = "https://hermes.pyth.network";

export interface PythPrice {
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
}

export interface AssetPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume: string;
  icon: string;
  color: string;
  category: "crypto" | "commodity" | "rwa";
}

// Fetch latest prices from Pyth Hermes
export async function fetchPythPrices(): Promise<Record<string, PythPrice>> {
  try {
    const ids = Object.values(PYTH_FEEDS).map(id => `ids[]=${id}`).join("&");
    const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${ids}`);
    if (!res.ok) throw new Error("Pyth fetch failed");
    const data = await res.json();

    const prices: Record<string, PythPrice> = {};
    const keys = Object.keys(PYTH_FEEDS);

    data.parsed?.forEach((item: any, i: number) => {
      const p = item.price;
      prices[keys[i]] = {
        price: Number(p.price) * Math.pow(10, p.expo),
        confidence: Number(p.conf) * Math.pow(10, p.expo),
        expo: p.expo,
        publishTime: p.publish_time,
      };
    });

    return prices;
  } catch (err) {
    console.warn("Pyth fetch failed, using mock data:", err);
    return getMockPrices();
  }
}

// Mock prices fallback
function getMockPrices(): Record<string, PythPrice> {
  return {
    SOL_USD:  { price: 142.35, confidence: 0.12, expo: -8, publishTime: Date.now() / 1000 },
    BTC_USD:  { price: 67450.0, confidence: 25.0, expo: -8, publishTime: Date.now() / 1000 },
    ETH_USD:  { price: 3280.50, confidence: 1.5, expo: -8, publishTime: Date.now() / 1000 },
    GOLD_USD: { price: 2341.80, confidence: 0.5, expo: -8, publishTime: Date.now() / 1000 },
    RE_INDEX: { price: 1250.0, confidence: 2.0, expo: -8, publishTime: Date.now() / 1000 },
  };
}

// Build asset list from prices
export function buildAssets(prices: Record<string, PythPrice>): AssetPrice[] {
  return [
    {
      symbol: "SOL",
      price: prices.SOL_USD?.price || 142.35,
      change24h: 3.24,
      volume: "$4.2B",
      icon: "◎",
      color: "#9945FF",
      category: "crypto",
    },
    {
      symbol: "BTC",
      price: prices.BTC_USD?.price || 67450,
      change24h: 1.82,
      volume: "$28.5B",
      icon: "₿",
      color: "#f7931a",
      category: "crypto",
    },
    {
      symbol: "ETH",
      price: prices.ETH_USD?.price || 3280.50,
      change24h: -0.94,
      volume: "$12.1B",
      icon: "Ξ",
      color: "#627eea",
      category: "crypto",
    },
    {
      symbol: "GOLD",
      price: prices.GOLD_USD?.price || 2341.80,
      change24h: 0.45,
      volume: "$1.8B",
      icon: "⬡",
      color: "#f0b429",
      category: "commodity",
    },
    {
      symbol: "LAND",
      price: prices.RE_INDEX?.price || 1250,
      change24h: 0.12,
      volume: "$340M",
      icon: "⌘",
      color: "#14F195",
      category: "rwa",
    },
  ];
}

// Generate chart candles for an asset
export function generateCandles(basePrice: number, count = 60) {
  const data = [];
  let price = basePrice * 0.97;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const vol = (Math.random() - 0.48) * basePrice * 0.015;
    const open = price;
    const close = Math.max(basePrice * 0.5, open + vol);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    data.push({
      time: new Date(now - i * 3600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      open: +open.toFixed(4),
      close: +close.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      volume: Math.floor(Math.random() * 5000 + 500),
      bullish: close >= open,
    });
    price = close;
  }
  return data;
}