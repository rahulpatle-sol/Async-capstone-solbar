"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Line, AreaChart, Area,
} from "recharts";
import {
  fetchPythPrices, buildAssets, generateCandles,
  calcTokensForSol, calcSolForTokens, solToUsd, usdToSol, AssetPrice,
} from "../lib/pyth";
import { useSolbar } from "../hooks/useSolbar";

// ─────────────────────────────────────────────────────────────────────────────
const TABS = ["SWAP", "BURN", "PORTFOLIO"] as const;
type Tab = typeof TABS[number];

interface Holding {
  asset:      AssetPrice;
  tokens:     number;
  costSol:    number;
  costUsd:    number;
  buyPrice:   number; // price at time of purchase
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtUsd(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  return `$${p.toFixed(8)}`;
}
function yFmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  if (v >= 1)         return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function fmtSol(n: number): string {
  return n < 0.0001 ? n.toExponential(4) : n.toFixed(6);
}

// ── Candle Tooltip ────────────────────────────────────────────────────────────
const CandleTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "#08081a", border: "1px solid rgba(153,69,255,0.35)", borderRadius: 10, padding: "12px 16px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", minWidth: 160 }}>
      <div style={{ color: "#444", marginBottom: 6, fontSize: 10 }}>{d.time}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
        <span style={{ color: "#555" }}>O</span><span style={{ color: "#aaa" }}>{yFmt(d.open)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
        <span style={{ color: "#555" }}>H</span><span style={{ color: "#14F195" }}>{yFmt(d.high)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
        <span style={{ color: "#555" }}>L</span><span style={{ color: "#ff4d6a" }}>{yFmt(d.low)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderTop: "1px solid #111", paddingTop: 6, marginTop: 4 }}>
        <span style={{ color: "#555" }}>C</span>
        <span style={{ color: d.bullish ? "#14F195" : "#ff4d6a", fontWeight: 700 }}>{yFmt(d.close)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 4, color: "#333" }}>
        <span>Vol</span><span>{(d.volume || 0).toLocaleString()}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const wallet = useWallet();
  const solbar = useSolbar();

  const [assets,      setAssets]      = useState<AssetPrice[]>([]);
  const [solPrice,    setSolPrice]    = useState(142.35);
  const [selected,    setSelected]    = useState<AssetPrice | null>(null);
  const [candles,     setCandles]     = useState<any[]>([]);
  const [tab,         setTab]         = useState<Tab>("SWAP");
  const [solInput,    setSolInput]    = useState("");
  const [tokenInput,  setTokenInput]  = useState("");
  const [usdInput,    setUsdInput]    = useState("");
  const [inputMode,   setInputMode]   = useState<"sol"|"usd">("sol");
  const [txStatus,    setTxStatus]    = useState<"idle"|"loading"|"success"|"error">("idle");
  const [txMsg,       setTxMsg]       = useState("");
  const [search,      setSearch]      = useState("");
  const [holdings,    setHoldings]    = useState<Holding[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [timeframe,   setTimeframe]   = useState("1H");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load prices with 15s interval ─────────────────────────────────────────
  const loadPrices = useCallback(async () => {
    const prices = await fetchPythPrices();
    const list   = buildAssets(prices);
    setAssets(list);
    setSolPrice(prices.SOL_USD || 142.35);
    setLastUpdated(new Date().toLocaleTimeString());
    setSelected(prev => {
      if (!prev) return list.find(a => a.symbol === "GOLD") || list[0];
      return list.find(a => a.symbol === prev.symbol) || prev;
    });
    // Update holdings with new prices
    setHoldings(prev => prev.map(h => ({
      ...h,
      asset: list.find(a => a.symbol === h.asset.symbol) || h.asset,
    })));
  }, []);

  useEffect(() => {
    loadPrices();
    timerRef.current = setInterval(loadPrices, 15_000);
   return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadPrices]);

  // Regenerate candles on asset change
  useEffect(() => {
    if (selected) setCandles(generateCandles(selected.price));
  }, [selected?.symbol]);

  // ── Chart values ──────────────────────────────────────────────────────────
  const currentClose = candles[candles.length - 1]?.close || selected?.price || 0;
  const prevClose    = candles[candles.length - 2]?.close || currentClose;
  const bullish      = currentClose >= prevClose;
  const priceDelta   = prevClose > 0 ? (((currentClose - prevClose) / prevClose) * 100) : 0;

  // ── Smart input — SOL or USD ───────────────────────────────────────────────
  const effectiveSol = inputMode === "sol"
    ? +solInput || 0
    : usdToSol(+usdInput || 0, solPrice);

  const previewTokens = selected && effectiveSol > 0
    ? calcTokensForSol(effectiveSol, selected)
    : null;

  const previewSolBack = selected && +tokenInput > 0
    ? calcSolForTokens(+tokenInput, selected)
    : null;

  // ── Search filter ─────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredAssets = assets.filter(a =>
    a.symbol.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q)
  );

  // ── Swap ──────────────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!wallet.connected) { setTxMsg("Connect wallet first!"); setTxStatus("error"); return; }
    if (effectiveSol <= 0) { setTxMsg("Enter a valid amount"); setTxStatus("error"); return; }
    if (!selected) { setTxMsg("Select an asset"); setTxStatus("error"); return; }

    setTxStatus("loading"); setTxMsg("Sending transaction...");
    try {
      const sig = await solbar.swap(effectiveSol);
      const tokensReceived = calcTokensForSol(effectiveSol, selected);

      // Update portfolio
      setHoldings(prev => {
        const idx = prev.findIndex(h => h.asset.symbol === selected.symbol);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            tokens:  updated[idx].tokens  + tokensReceived,
            costSol: updated[idx].costSol + effectiveSol,
            costUsd: updated[idx].costUsd + solToUsd(effectiveSol, solPrice),
          };
          return updated;
        }
        return [...prev, {
          asset:    selected,
          tokens:   tokensReceived,
          costSol:  effectiveSol,
          costUsd:  solToUsd(effectiveSol, solPrice),
          buyPrice: selected.price,
        }];
      });

      setTxStatus("success");
      const tokenStr = tokensReceived < 0.001
        ? tokensReceived.toExponential(4)
        : tokensReceived.toFixed(6);
      setTxMsg(`✓ Got ${tokenStr} ${selected.symbol}! Tx: ${sig?.slice(0, 10)}...`);
      setSolInput(""); setUsdInput("");
    } catch (e: unknown) {
      setTxStatus("error");
      setTxMsg((e as Error)?.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleBurn = async () => {
    if (!wallet.connected) { setTxMsg("Connect wallet first!"); setTxStatus("error"); return; }
    if (!tokenInput || +tokenInput <= 0) { setTxMsg("Enter valid amount"); setTxStatus("error"); return; }

    setTxStatus("loading"); setTxMsg("Burning tokens...");
    try {
      const sig = await solbar.burnTokens(+tokenInput);
      setTxStatus("success");
      setTxMsg(`✓ Burned! SOL returned. Tx: ${sig?.slice(0, 10)}...`);
      setTokenInput("");
    } catch (e: unknown) {
      setTxStatus("error");
      setTxMsg((e as Error)?.message?.slice(0, 100) || "Transaction failed");
    }
  };

  // ── Portfolio totals ──────────────────────────────────────────────────────
  const portfolioUsd = holdings.reduce((sum, h) => {
    return sum + (h.asset.priceInSol * h.tokens * solPrice);
  }, solbar.solBal * solPrice);

  const totalCostUsd = holdings.reduce((s, h) => s + h.costUsd, 0);
  const totalPnlUsd  = holdings.reduce((s, h) => {
    const now = h.asset.priceInSol * h.tokens * solPrice;
    return s + now - h.costUsd;
  }, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", background: "var(--sol-darker)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
      <nav style={{ height: 52, flexShrink: 0, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--sol-border)", background: "var(--sol-card)", gap: 16 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <div onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <svg width="24" height="24" viewBox="0 0 32 32">
              <polygon points="16,2 30,24 2,24" fill="none" stroke="#9945FF" strokeWidth="2"/>
              <polygon points="16,8 26,24 6,24" fill="rgba(153,69,255,0.15)" stroke="#14F195" strokeWidth="1"/>
            </svg>
            <span style={{ fontFamily: "Syne", fontSize: 15, fontWeight: 800, letterSpacing: 2, color: "#fff" }}>SOLBAR</span>
          </div>
          <button onClick={() => router.push("/admin")}
            style={{ padding: "4px 12px", borderRadius: 6, background: "transparent", border: "1px solid var(--sol-border)", color: "var(--sol-muted)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            Admin
          </button>
        </div>

        {/* Live ticker */}
        <div style={{ display: "flex", gap: 24, fontSize: 11, fontFamily: "JetBrains Mono, monospace", overflow: "hidden" }}>
          {assets.map(a => (
            <span key={a.symbol} style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ color: a.color }}>{a.icon}</span>
              <span style={{ color: "#777" }}>{a.symbol}</span>
              <span style={{ color: "#fff" }}>{fmtUsd(a.price)}</span>
              <span style={{ color: a.change24h >= 0 ? "#14F195" : "#ff4d6a" }}>
                {a.change24h >= 0 ? "▲" : "▼"}{Math.abs(a.change24h).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>

        {/* Wallet info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {wallet.connected && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ color: "#777" }}>SOL <span style={{ color: "#fff" }}>{solbar.solBal.toFixed(3)}</span></span>
              <span style={{ color: "#777" }}>≈<span style={{ color: "#14F195" }}>${solToUsd(solbar.solBal, solPrice).toFixed(0)}</span></span>
              <span style={{ color: solbar.isWhitelisted ? "#14F195" : "#ff4d6a", fontSize: 10, border: `1px solid ${solbar.isWhitelisted ? "rgba(20,241,149,0.3)" : "rgba(255,77,106,0.3)"}`, padding: "2px 8px", borderRadius: 100 }}>
                {solbar.isWhitelisted ? "● KYC OK" : "⚠ NO KYC"}
              </span>
            </div>
          )}
          <WalletMultiButton />
        </div>
      </nav>

      {/* ── MAIN BODY ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: ASSET LIST ─────────────────────────────────────────── */}
        <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--sol-border)", background: "var(--sol-card)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Search */}
          <div style={{ padding: "10px 10px 6px" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search..."
              style={{ width: "100%", padding: "7px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--sol-border)", borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--sol-purple)"}
              onBlur={e  => e.currentTarget.style.borderColor = "var(--sol-border)"} />
          </div>

          {/* Grouped list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {(["crypto", "commodity", "rwa"] as const).map(cat => {
              const items = filteredAssets.filter(a => a.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <div style={{ padding: "8px 10px 3px", fontSize: 9, letterSpacing: 2, color: "#2a2a3a", textTransform: "uppercase" }}>
                    {cat === "crypto" ? "Crypto" : cat === "commodity" ? "Commodities" : "Real World"}
                  </div>
                  {items.map(a => (
                    <div key={a.symbol} onClick={() => setSelected(a)}
                      style={{ padding: "9px 10px", cursor: "pointer", borderLeft: selected?.symbol === a.symbol ? "2px solid var(--sol-purple)" : "2px solid transparent", background: selected?.symbol === a.symbol ? "rgba(153,69,255,0.08)" : "transparent", transition: "all 0.15s" }}
                      onMouseEnter={e => { if (selected?.symbol !== a.symbol) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { if (selected?.symbol !== a.symbol) e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ color: a.color, fontSize: 15 }}>{a.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{a.symbol}</span>
                        <span style={{ fontSize: 9, color: a.change24h >= 0 ? "#14F195" : "#ff4d6a" }}>
                          {a.change24h >= 0 ? "▲" : "▼"}{Math.abs(a.change24h).toFixed(2)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--sol-muted)", fontFamily: "JetBrains Mono, monospace", paddingLeft: 22, marginTop: 2 }}>
                        {fmtUsd(a.price)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--sol-border)", fontSize: 9, color: "#222" }}>
            ↻ {lastUpdated || "—"}
          </div>
        </div>

        {/* ── CENTER: CHART ────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Chart header bar */}
          <div style={{ height: 52, flexShrink: 0, padding: "0 16px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid var(--sol-border)" }}>
            {selected ? (
              <>
                <span style={{ color: selected.color, fontSize: 20 }}>{selected.icon}</span>
                <div>
                  <span style={{ fontFamily: "Syne", fontSize: 15, fontWeight: 800 }}>{selected.symbol}/USD</span>
                  <span style={{ fontSize: 9, color: "#444", letterSpacing: 1, marginLeft: 8 }}>{selected.name.toUpperCase()}</span>
                </div>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, fontWeight: 700, color: "#fff" }}>
                  {fmtUsd(currentClose)}
                </span>
                <span style={{ color: bullish ? "#14F195" : "#ff4d6a", fontSize: 13, fontWeight: 700 }}>
                  {bullish ? "▲" : "▼"} {Math.abs(priceDelta).toFixed(3)}%
                </span>

                {/* Stats */}
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#444", marginLeft: 4 }}>
                  <span>SOL: <span style={{ color: "#777" }}>{fmtSol(selected.priceInSol)}</span></span>
                  <span>Vol: <span style={{ color: "#777" }}>{selected.volume}</span></span>
                  <span>Cat: <span style={{ color: selected.color }}>{selected.category}</span></span>
                </div>

                {/* Timeframe */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  {["1H", "4H", "1D", "1W"].map(t => (
                    <button key={t} onClick={() => { setTimeframe(t); setCandles(generateCandles(selected.price)); }}
                      style={{ padding: "3px 9px", borderRadius: 5, background: timeframe === t ? "rgba(153,69,255,0.25)" : "transparent", border: `1px solid ${timeframe === t ? "rgba(153,69,255,0.5)" : "rgba(153,69,255,0.1)"}`, color: timeframe === t ? "#fff" : "#444", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span style={{ color: "#333" }}>← Select an asset</span>
            )}
          </div>

          {/* Candlestick chart */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={candles} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                <XAxis dataKey="time" tick={{ fill: "#2a2a3a", fontSize: 9 }} tickLine={false} axisLine={false} interval={8} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#2a2a3a", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={yFmt} width={72} />
                <Tooltip content={<CandleTooltip />} />
                <Bar dataKey="close" barSize={7} radius={[1, 1, 0, 0]}>
                  {candles.map((c, i) => <Cell key={i} fill={c.bullish ? "#14F195" : "#ff4d6a"} opacity={0.85} />)}
                </Bar>
                <Line dataKey="close" dot={false} stroke={selected?.color || "#9945FF"} strokeWidth={1} opacity={0.3} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Volume mini chart */}
          <div style={{ height: 48, flexShrink: 0, padding: "0 4px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={candles} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <Bar dataKey="volume" barSize={7} radius={[2, 2, 0, 0]}>
                  {candles.map((c, i) => <Cell key={i} fill={c.bullish ? "rgba(20,241,149,0.12)" : "rgba(255,77,106,0.12)"} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Oracle strip */}
          <div style={{ height: 24, flexShrink: 0, padding: "0 16px", borderTop: "1px solid var(--sol-border)", display: "flex", alignItems: "center", gap: 8, fontSize: 9, color: "#222" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#14F195", display: "inline-block" }} />
            COINGECKO + METALS.LIVE · 15S CACHE · LAST: {lastUpdated}
          </div>
        </div>

        {/* ── RIGHT: TRADE PANEL ───────────────────────────────────────── */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--sol-border)", background: "var(--sol-card)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--sol-border)", flexShrink: 0 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "12px 0", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid var(--sol-purple)" : "2px solid transparent", color: tab === t ? "#fff" : "var(--sol-muted)", fontSize: 10, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit", transition: "color 0.2s" }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

            {/* Balance cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ padding: "10px 12px", background: "rgba(153,69,255,0.08)", borderRadius: 10, border: "1px solid rgba(153,69,255,0.15)" }}>
                <div style={{ fontSize: 9, color: "#555", marginBottom: 3 }}>SOL BALANCE</div>
                <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: "#fff", fontSize: 14 }}>{solbar.solBal.toFixed(3)}</div>
                <div style={{ fontSize: 10, color: "#14F195" }}>${solToUsd(solbar.solBal, solPrice).toFixed(2)}</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(240,180,41,0.08)", borderRadius: 10, border: "1px solid rgba(240,180,41,0.15)" }}>
                <div style={{ fontSize: 9, color: "#555", marginBottom: 3 }}>SOLBAR TOKEN</div>
                <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: "#f0b429", fontSize: 14 }}>{solbar.tokenBal.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: "#f0b429" }}>on-chain</div>
              </div>
            </div>

            {/* ─── SWAP TAB ─────────────────────────────────────────────── */}
            {tab === "SWAP" && selected && (
              <>
                {/* Asset badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: `${selected.color}10`, borderRadius: 8, border: `1px solid ${selected.color}20`, marginBottom: 12 }}>
                  <span style={{ color: selected.color, fontSize: 18 }}>{selected.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{selected.name}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>{fmtUsd(selected.price)} · {fmtSol(selected.priceInSol)} SOL</div>
                  </div>
                  <span style={{ fontSize: 10, color: selected.change24h >= 0 ? "#14F195" : "#ff4d6a" }}>
                    {selected.change24h >= 0 ? "▲" : "▼"}{Math.abs(selected.change24h).toFixed(2)}%
                  </span>
                </div>

                {/* Input mode toggle */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button onClick={() => setInputMode("sol")}
                    style={{ flex: 1, padding: "5px", borderRadius: 6, background: inputMode === "sol" ? "rgba(153,69,255,0.2)" : "transparent", border: "1px solid rgba(153,69,255,0.2)", color: inputMode === "sol" ? "#fff" : "#555", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    Pay in SOL
                  </button>
                  <button onClick={() => setInputMode("usd")}
                    style={{ flex: 1, padding: "5px", borderRadius: 6, background: inputMode === "usd" ? "rgba(20,241,149,0.15)" : "transparent", border: "1px solid rgba(20,241,149,0.15)", color: inputMode === "usd" ? "#14F195" : "#555", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    Pay in USD
                  </button>
                </div>

                {/* SOL/USD input */}
                <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", display: "block", marginBottom: 5 }}>
                  YOU PAY ({inputMode === "sol" ? "SOL" : "USD"})
                </label>
                <div style={{ position: "relative", marginBottom: 4 }}>
                  <input
                    value={inputMode === "sol" ? solInput : usdInput}
                    onChange={e => inputMode === "sol" ? setSolInput(e.target.value) : setUsdInput(e.target.value)}
                    type="number" placeholder="0.00"
                    style={{ width: "100%", padding: "10px 50px 10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--sol-border)", borderRadius: 9, color: "#fff", fontSize: 16, fontFamily: "JetBrains Mono, monospace", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.currentTarget.style.borderColor = "var(--sol-purple)"}
                    onBlur={e  => e.currentTarget.style.borderColor = "var(--sol-border)"} />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9945FF", fontWeight: 700 }}>
                    {inputMode === "sol" ? "SOL" : "USD"}
                  </span>
                </div>
                {/* Conversion hint */}
                {effectiveSol > 0 && (
                  <div style={{ fontSize: 10, color: "#444", marginBottom: 8, fontFamily: "JetBrains Mono", textAlign: "right" }}>
                    {inputMode === "sol"
                      ? `≈ $${solToUsd(effectiveSol, solPrice).toFixed(2)}`
                      : `≈ ${effectiveSol.toFixed(6)} SOL`}
                  </div>
                )}

                <div style={{ textAlign: "center", color: "#222", margin: "6px 0" }}>↓</div>

                {/* Token output */}
                <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", display: "block", marginBottom: 5 }}>
                  YOU RECEIVE ({selected.symbol} TOKENS)
                </label>
                <div style={{ padding: "10px 12px", background: `${selected.color}08`, border: `1px solid ${selected.color}20`, borderRadius: 9, fontFamily: "JetBrains Mono, monospace", fontSize: 16, color: selected.color, marginBottom: 10 }}>
                  {previewTokens != null
                    ? (previewTokens < 0.0001 ? previewTokens.toExponential(4) : previewTokens.toFixed(6))
                    : "—"}
                </div>

                {/* Rate breakdown */}
                <div style={{ padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 12, fontSize: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#444", marginBottom: 3 }}>
                    <span>1 {selected.symbol} =</span>
                    <span style={{ color: "#777" }}>{fmtSol(selected.priceInSol)} SOL</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#444", marginBottom: 3 }}>
                    <span>Market price</span>
                    <span style={{ color: "#fff", fontFamily: "JetBrains Mono" }}>{fmtUsd(selected.price)}</span>
                  </div>
                  {previewTokens != null && effectiveSol > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#444", borderTop: "1px solid #0f0f1a", paddingTop: 4, marginTop: 4 }}>
                      <span>You get</span>
                      <span style={{ color: selected.color, fontFamily: "JetBrains Mono", fontWeight: 700 }}>
                        {previewTokens < 0.001 ? previewTokens.toExponential(4) : previewTokens.toFixed(6)} {selected.symbol}
                      </span>
                    </div>
                  )}
                </div>

                <button onClick={handleSwap} disabled={txStatus === "loading" || !wallet.connected || effectiveSol <= 0}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: txStatus === "loading" ? "rgba(153,69,255,0.25)" : effectiveSol <= 0 ? "#111" : "linear-gradient(135deg,#9945FF,#6b2fd1)", border: "none", color: effectiveSol <= 0 ? "#333" : "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: txStatus === "loading" || effectiveSol <= 0 ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
                  {txStatus === "loading" ? "PROCESSING..." : wallet.connected ? `BUY ${selected.symbol}` : "CONNECT WALLET"}
                </button>
              </>
            )}

            {/* ─── BURN TAB ─────────────────────────────────────────────── */}
            {tab === "BURN" && selected && (
              <>
                <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", display: "block", marginBottom: 5 }}>
                  BURN ({selected.symbol} TOKENS)
                </label>
                <div style={{ position: "relative", marginBottom: 6 }}>
                  <input value={tokenInput} onChange={e => setTokenInput(e.target.value)} type="number" placeholder="0.000000"
                    style={{ width: "100%", padding: "10px 70px 10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--sol-border)", borderRadius: 9, color: "#fff", fontSize: 16, fontFamily: "JetBrains Mono, monospace", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.currentTarget.style.borderColor = "#f0b429"}
                    onBlur={e  => e.currentTarget.style.borderColor = "var(--sol-border)"} />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#f0b429", fontWeight: 700 }}>{selected.symbol}</span>
                </div>

                <div style={{ textAlign: "center", color: "#222", margin: "6px 0" }}>↓</div>

                <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", display: "block", marginBottom: 5 }}>YOU RECEIVE (SOL)</label>
                <div style={{ padding: "10px 12px", background: "rgba(153,69,255,0.06)", border: "1px solid rgba(153,69,255,0.2)", borderRadius: 9, fontFamily: "JetBrains Mono, monospace", fontSize: 16, color: "#9945FF", marginBottom: 10 }}>
                  {previewSolBack != null ? fmtSol(previewSolBack) : "—"}
                </div>
                {previewSolBack != null && previewSolBack > 0 && (
                  <div style={{ textAlign: "right", fontSize: 10, color: "#444", marginBottom: 10, fontFamily: "JetBrains Mono" }}>
                    ≈ ${solToUsd(previewSolBack, solPrice).toFixed(2)}
                  </div>
                )}

                <button onClick={handleBurn} disabled={txStatus === "loading" || !wallet.connected}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: txStatus === "loading" ? "#300" : "linear-gradient(135deg,#7f0000,#cc0000)", border: "none", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: txStatus === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {txStatus === "loading" ? "PROCESSING..." : wallet.connected ? "🔥 BURN → SOL" : "CONNECT WALLET"}
                </button>
              </>
            )}

            {/* ─── PORTFOLIO TAB ────────────────────────────────────────── */}
            {tab === "PORTFOLIO" && (
              <>
                {/* Summary card */}
                <div style={{ padding: 14, background: "rgba(153,69,255,0.08)", borderRadius: 12, border: "1px solid rgba(153,69,255,0.15)", marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#555", marginBottom: 4 }}>TOTAL PORTFOLIO VALUE</div>
                  <div style={{ fontSize: 26, fontFamily: "Syne, sans-serif", fontWeight: 800, color: "#fff" }}>
                    ${portfolioUsd.toFixed(2)}
                  </div>
                  {totalCostUsd > 0 && (
                    <div style={{ fontSize: 11, color: totalPnlUsd >= 0 ? "#14F195" : "#ff4d6a", marginTop: 4, fontFamily: "JetBrains Mono" }}>
                      {totalPnlUsd >= 0 ? "▲ +" : "▼ "} ${Math.abs(totalPnlUsd).toFixed(2)} P&L
                      <span style={{ fontSize: 10, color: "#444", marginLeft: 8 }}>
                        ({totalCostUsd > 0 ? ((totalPnlUsd / totalCostUsd) * 100).toFixed(2) : "0.00"}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* SOL holding */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6, border: "1px solid var(--sol-border)" }}>
                  <span style={{ fontSize: 18, color: "#9945FF" }}>◎</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>SOL</div>
                    <div style={{ fontSize: 10, color: "#555" }}>Solana</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700 }}>{solbar.solBal.toFixed(4)}</div>
                    <div style={{ fontSize: 10, color: "#14F195" }}>${solToUsd(solbar.solBal, solPrice).toFixed(2)}</div>
                  </div>
                </div>

                {/* On-chain SOLBAR */}
                {solbar.tokenBal > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6, border: "1px solid var(--sol-border)" }}>
                    <span style={{ fontSize: 18, color: "#f0b429" }}>⬡</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>SOLBAR</div>
                      <div style={{ fontSize: 10, color: "#555" }}>Gold Token (on-chain)</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700, color: "#f0b429" }}>{solbar.tokenBal.toFixed(4)}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>Token-2022</div>
                    </div>
                  </div>
                )}

                {/* Session holdings with P&L */}
                {holdings.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, color: "#222", letterSpacing: 2, margin: "10px 0 6px" }}>SESSION TRADES</div>
                    {holdings.map((h, i) => {
                      const nowSol  = h.asset.priceInSol * h.tokens;
                      const nowUsd  = nowSol * solPrice;
                      const pnlUsd  = nowUsd - h.costUsd;
                      const pnlPct  = h.costUsd > 0 ? ((pnlUsd / h.costUsd) * 100).toFixed(2) : "0.00";
                      return (
                        <div key={i} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 6, border: "1px solid var(--sol-border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ color: h.asset.color, fontSize: 16 }}>{h.asset.icon}</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 700, fontSize: 12 }}>{h.asset.symbol}</span>
                              <span style={{ fontSize: 10, color: "#444", marginLeft: 8 }}>{h.tokens < 0.001 ? h.tokens.toExponential(3) : h.tokens.toFixed(6)} tokens</span>
                            </div>
                            <span style={{ fontSize: 10, color: pnlUsd >= 0 ? "#14F195" : "#ff4d6a", fontFamily: "JetBrains Mono", fontWeight: 700 }}>
                              {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 9, color: "#444" }}>
                            <div>
                              <div>Cost</div>
                              <div style={{ color: "#777", fontFamily: "JetBrains Mono" }}>${h.costUsd.toFixed(2)}</div>
                            </div>
                            <div>
                              <div>Now</div>
                              <div style={{ color: "#fff", fontFamily: "JetBrains Mono" }}>${nowUsd.toFixed(2)}</div>
                            </div>
                            <div>
                              <div>P&L %</div>
                              <div style={{ color: pnlUsd >= 0 ? "#14F195" : "#ff4d6a", fontFamily: "JetBrains Mono" }}>{pnlPct}%</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {holdings.length === 0 && solbar.tokenBal === 0 && (
                  <div style={{ textAlign: "center", color: "#222", fontSize: 12, padding: "20px 0" }}>
                    No trades yet.<br/>Buy an asset to track P&L!
                  </div>
                )}

                {/* KYC status */}
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: solbar.isWhitelisted ? "rgba(20,241,149,0.06)" : "rgba(255,77,106,0.06)", border: `1px solid ${solbar.isWhitelisted ? "rgba(20,241,149,0.2)" : "rgba(255,77,106,0.2)"}` }}>
                  <div style={{ fontSize: 10, color: solbar.isWhitelisted ? "#14F195" : "#ff4d6a", fontWeight: 600 }}>
                    {solbar.isWhitelisted ? "✓ KYC Verified — Trading enabled" : "⚠ Not Whitelisted — Ask admin to approve"}
                  </div>
                </div>
              </>
            )}

            {/* TX Status message */}
            {txMsg && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: txStatus === "success" ? "rgba(20,241,149,0.08)" : txStatus === "error" ? "rgba(255,77,106,0.08)" : "rgba(153,69,255,0.08)", border: `1px solid ${txStatus === "success" ? "rgba(20,241,149,0.25)" : txStatus === "error" ? "rgba(255,77,106,0.25)" : "rgba(153,69,255,0.25)"}`, fontSize: 11, color: txStatus === "success" ? "#14F195" : txStatus === "error" ? "#ff4d6a" : "#9945FF", wordBreak: "break-all", lineHeight: 1.5 }}>
                {txMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}