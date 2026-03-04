// src/app/api/prices/route.ts
import { NextResponse } from "next/server";

// Server-side in-memory cache — survives across requests
let cache: { data: Record<string, number>; ts: number } | null = null;
const CACHE_TTL = 20_000; // 20 seconds

export async function GET() {
  // Return cached if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=10",
      },
    });
  }

  try {
    const [cryptoRes, goldRes] = await Promise.allSettled([
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
        { next: { revalidate: 20 } }
      ),
      fetch("https://api.metals.live/v1/spot/gold", {
        next: { revalidate: 30 },
      }),
    ]);

    // Parse crypto
    let crypto: any = {};
    if (cryptoRes.status === "fulfilled" && cryptoRes.value.ok) {
      crypto = await cryptoRes.value.json();
    }

    // Parse gold — metals.live gives troy oz price in USD
    let goldUsd = 3100.0; // realistic 2026 fallback
    if (goldRes.status === "fulfilled" && goldRes.value.ok) {
      const g = await goldRes.value.json();
      const raw = Array.isArray(g) ? g[0]?.gold : g?.gold;
      if (typeof raw === "number" && raw > 500) goldUsd = raw;
    }

    const data: Record<string, number> = {
      SOL_USD:  crypto?.solana?.usd               || 142.35,
      BTC_USD:  crypto?.bitcoin?.usd              || 84500,
      ETH_USD:  crypto?.ethereum?.usd             || 3280,
      GOLD_USD: goldUsd,
      RE_USD:   1250.0,
      SOL_CHG:  +(crypto?.solana?.usd_24h_change  || 1.2).toFixed(2),
      BTC_CHG:  +(crypto?.bitcoin?.usd_24h_change || 0.8).toFixed(2),
      ETH_CHG:  +(crypto?.ethereum?.usd_24h_change|| -0.5).toFixed(2),
      GOLD_CHG: 1.14,
      RE_CHG:   0.12,
      ts:       Date.now(),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=10",
      },
    });
  } catch (err) {
    console.error("Price fetch error:", err);
    const fallback: Record<string, number> = {
      SOL_USD: 142.35, BTC_USD: 84500, ETH_USD: 3280,
      GOLD_USD: 3100.0, RE_USD: 1250,
      SOL_CHG: 1.2, BTC_CHG: 0.8, ETH_CHG: -0.5,
      GOLD_CHG: 1.14, RE_CHG: 0.12, ts: Date.now(),
    };
    return NextResponse.json(fallback);
  }
}