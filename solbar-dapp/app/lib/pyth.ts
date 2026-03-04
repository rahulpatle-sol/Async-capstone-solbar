// src/app/lib/pyth.ts
export interface AssetPrice {
  symbol:     string;
  name:       string;
  price:      number;       // USD
  change24h:  number;       // %
  volume:     string;
  icon:       string;
  color:      string;
  category:   "crypto" | "commodity" | "rwa";
  priceInSol: number;       // How many SOL = 1 token of this asset
}

// ── Client-side cache — avoid hammering API route ─────────────────────────────
let clientCache: { data: Record<string, number>; ts: number } | null = null;
const CLIENT_TTL = 15_000; // 15s

export async function fetchPythPrices(): Promise<Record<string, number>> {
  if (clientCache && Date.now() - clientCache.ts < CLIENT_TTL) {
    return clientCache.data;
  }
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) throw new Error("API failed");
    const data = await res.json();
    clientCache = { data, ts: Date.now() };
    return data;
  } catch {
    // Return stale cache if available
    if (clientCache) return clientCache.data;
    return {
      SOL_USD: 142.35, BTC_USD: 84500, ETH_USD: 3280,
      GOLD_USD: 3100.0, RE_USD: 1250,
      SOL_CHG: 1.2, BTC_CHG: 0.8, ETH_CHG: -0.5,
      GOLD_CHG: 1.14, RE_CHG: 0.12,
    };
  }
}

export function buildAssets(prices: Record<string, number>): AssetPrice[] {
  const sol = prices.SOL_USD || 142.35;
  return [
    {
      symbol: "SOL",  name: "Solana",
      price: sol,     change24h: prices.SOL_CHG,
      volume: "$4.2B", icon: "◎", color: "#9945FF", category: "crypto",
      priceInSol: 1,
    },
    {
      symbol: "BTC",  name: "Bitcoin",
      price: prices.BTC_USD,  change24h: prices.BTC_CHG,
      volume: "$28.5B", icon: "₿", color: "#f7931a", category: "crypto",
      priceInSol: prices.BTC_USD / sol,
    },
    {
      symbol: "ETH",  name: "Ethereum",
      price: prices.ETH_USD,  change24h: prices.ETH_CHG,
      volume: "$12.1B", icon: "Ξ", color: "#627eea", category: "crypto",
      priceInSol: prices.ETH_USD / sol,
    },
    {
      symbol: "GOLD", name: "Gold (XAU/USD)",
      price: prices.GOLD_USD, change24h: prices.GOLD_CHG,
      volume: "$1.8B", icon: "⬡", color: "#f0b429", category: "commodity",
      priceInSol: prices.GOLD_USD / sol,
    },
    {
      symbol: "LAND", name: "Real Estate Index",
      price: prices.RE_USD || 1250, change24h: prices.RE_CHG,
      volume: "$340M", icon: "⌘", color: "#14F195", category: "rwa",
      priceInSol: (prices.RE_USD || 1250) / sol,
    },
  ];
}

// ── How many tokens you get for X SOL ────────────────────────────────────────
// e.g. 0.002 GOLD tokens if you pay (0.002 * GOLD_priceInSol) SOL
export function calcTokensForSol(solAmount: number, asset: AssetPrice): number {
  if (!asset.priceInSol || asset.priceInSol === 0) return 0;
  return solAmount / asset.priceInSol;
}

// How much SOL for X tokens
export function calcSolForTokens(tokenAmount: number, asset: AssetPrice): number {
  return tokenAmount * (asset.priceInSol || 0);
}

export function solToUsd(sol: number, solPrice: number): number {
  return sol * solPrice;
}

export function usdToSol(usd: number, solPrice: number): number {
  return solPrice > 0 ? usd / solPrice : 0;
}

// ── Candle data ───────────────────────────────────────────────────────────────
export function generateCandles(basePrice: number, count = 60) {
  const data = [];
  let price = basePrice * 0.97;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const vol   = (Math.random() - 0.47) * basePrice * 0.01;
    const open  = price;
    const close = Math.max(basePrice * 0.6, open + vol);
    const high  = Math.max(open, close) * (1 + Math.random() * 0.003);
    const low   = Math.min(open, close) * (1 - Math.random() * 0.003);
    data.push({
      time:    new Date(now - i * 3_600_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      open:    +open.toFixed(2),
      close:   +close.toFixed(2),
      high:    +high.toFixed(2),
      low:     +low.toFixed(2),
      volume:  Math.floor(Math.random() * 8000 + 1000),
      bullish: close >= open,
    });
    price = close;
  }
  return data;
}