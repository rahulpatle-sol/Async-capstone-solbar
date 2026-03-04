"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Line,
} from "recharts";
import { fetchPythPrices, buildAssets, generateCandles, AssetPrice } from "../lib/pyth";
import { useSolbar } from "../hooks/useSolbar";

const TABS = ["SWAP", "BURN", "PORTFOLIO"] as const;
type Tab = typeof TABS[number];

// ── Candle tooltip ────────────────────────────────────────────────────────────
const CandleTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "#0d0d1a", border: "1px solid rgba(153,69,255,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
      <div style={{ color: "#666", marginBottom: 4 }}>{d.time}</div>
      <div style={{ color: "#fff" }}>O: {fmtPrice(d.open)}</div>
      <div style={{ color: d.bullish ? "#14F195" : "#ff4d6a" }}>C: {fmtPrice(d.close)}</div>
      <div style={{ color: "#888" }}>H: {fmtPrice(d.high)} | L: {fmtPrice(d.low)}</div>
      <div style={{ color: "#555", marginTop: 4 }}>Vol: {d.volume?.toLocaleString()}</div>
    </div>
  );
};

// ── Price formatter ───────────────────────────────────────────────────────────
function fmtPrice(p: number): string {
  if (p > 100) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}

// ── Y-axis tick formatter ─────────────────────────────────────────────────────
function yAxisFmt(v: number): string {
  return v > 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(4)}`;
}

export default function Dashboard() {
  const router = useRouter();
  const wallet = useWallet();
  const solbar = useSolbar();

  const [assets,     setAssets]     = useState<AssetPrice[]>([]);
  const [selected,   setSelected]   = useState<AssetPrice | null>(null);
  const [candles,    setCandles]    = useState<any[]>([]);
  const [tab,        setTab]        = useState<Tab>("SWAP");
  const [solInput,   setSolInput]   = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [txStatus,   setTxStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");
  const [txMsg,      setTxMsg]      = useState("");

  // Load Pyth prices every 10s
  useEffect(() => {
    const load = async () => {
      const prices = await fetchPythPrices();
      const list   = buildAssets(prices);
      setAssets(list);
      if (!selected && list.length > 0) {
        setSelected(list.find((a) => a.symbol === "GOLD") || list[0]);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regenerate candles when selected asset changes
  useEffect(() => {
    if (selected) setCandles(generateCandles(selected.price));
  }, [selected]);

  const currentPrice = candles[candles.length - 1]?.close || selected?.price || 0;
  const prevPrice    = candles[candles.length - 2]?.close || 1;
  const bullish      = currentPrice >= prevPrice;
  const priceDelta   = (((currentPrice - prevPrice) / prevPrice) * 100).toFixed(3);

  const PRICE_SOL     = 0.001;
  const previewTokens = solInput   ? (+solInput    / PRICE_SOL).toFixed(4) : "—";
  const previewSol    = tokenInput ? (+tokenInput  * PRICE_SOL).toFixed(6) : "—";

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!wallet.connected) { setTxMsg("Connect wallet first!"); setTxStatus("error"); return; }
    if (!solInput || isNaN(+solInput) || +solInput <= 0) { setTxMsg("Enter valid SOL amount"); setTxStatus("error"); return; }
    setTxStatus("loading"); setTxMsg("Sending transaction...");
    try {
      const sig = await solbar.swap(+solInput);
      setTxStatus("success");
      setTxMsg(`✓ Swap confirmed! ${sig?.slice(0, 12)}...`);
      setSolInput("");
    } catch (e: unknown) {
      setTxStatus("error");
      setTxMsg((e as Error)?.message?.slice(0, 80) || "Transaction failed");
    }
  };

  const handleBurn = async () => {
    if (!wallet.connected) { setTxMsg("Connect wallet first!"); setTxStatus("error"); return; }
    if (!tokenInput || isNaN(+tokenInput) || +tokenInput <= 0) { setTxMsg("Enter valid token amount"); setTxStatus("error"); return; }
    setTxStatus("loading"); setTxMsg("Burning tokens...");
    try {
      const sig = await solbar.burnTokens(+tokenInput);
      setTxStatus("success");
      setTxMsg(`✓ Burn confirmed! ${sig?.slice(0, 12)}...`);
      setTokenInput("");
    } catch (e: unknown) {
      setTxStatus("error");
      setTxMsg((e as Error)?.message?.slice(0, 80) || "Transaction failed");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sol-darker)", display: "flex", flexDirection: "column" }}>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav style={{ padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--sol-border)", background: "var(--sol-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <svg width="28" height="28" viewBox="0 0 32 32">
              <polygon points="16,2 30,24 2,24" fill="none" stroke="#9945FF" strokeWidth="2" />
              <polygon points="16,8 26,24 6,24" fill="rgba(153,69,255,0.15)" stroke="#14F195" strokeWidth="1" />
            </svg>
            <span style={{ fontFamily: "Syne", fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#fff" }}>SOLBAR</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Dashboard", "Admin"].map((l) => (
              <button key={l}
                onClick={() => l === "Admin" ? router.push("/admin") : null}
                style={{ padding: "6px 16px", borderRadius: 8, background: l === "Dashboard" ? "rgba(153,69,255,0.15)" : "transparent", border: l === "Dashboard" ? "1px solid rgba(153,69,255,0.3)" : "1px solid transparent", color: l === "Dashboard" ? "#fff" : "var(--sol-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {wallet.connected && (
            <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ color: "var(--sol-muted)" }}>SOL: <span style={{ color: "#fff" }}>{solbar.solBal.toFixed(4)}</span></span>
              <span style={{ color: "var(--sol-muted)" }}>SOLBAR: <span style={{ color: "#f0b429" }}>{solbar.tokenBal.toFixed(2)}</span></span>
              {solbar.isWhitelisted
                ? <span style={{ color: "#14F195", fontSize: 11, border: "1px solid rgba(20,241,149,0.3)", padding: "2px 8px", borderRadius: 100 }}>● KYC VERIFIED</span>
                : <span style={{ color: "#ff4d6a", fontSize: 11, border: "1px solid rgba(255,77,106,0.3)", padding: "2px 8px", borderRadius: 100 }}>⚠ NOT WHITELISTED</span>
              }
            </div>
          )}
          <WalletMultiButton />
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1 }}>

        {/* ── ASSET SIDEBAR ──────────────────────────────────────────────── */}
        <div style={{ width: 240, borderRight: "1px solid var(--sol-border)", padding: "16px 0", background: "var(--sol-card)" }}>
          <div style={{ padding: "0 16px 12px", fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)" }}>MARKETS</div>
          {assets.map((a) => (
            <div key={a.symbol} onClick={() => setSelected(a)}
              style={{ padding: "12px 16px", cursor: "pointer", background: selected?.symbol === a.symbol ? "rgba(153,69,255,0.1)" : "transparent", borderLeft: selected?.symbol === a.symbol ? "2px solid var(--sol-purple)" : "2px solid transparent", transition: "all 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ color: a.color, fontSize: 18 }}>{a.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{a.symbol}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: a.change24h >= 0 ? "#14F195" : "#ff4d6a" }}>
                  {a.change24h >= 0 ? "▲" : "▼"}{Math.abs(a.change24h)}%
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--sol-muted)", fontFamily: "JetBrains Mono, monospace", paddingLeft: 28 }}>
                {fmtPrice(a.price)}
              </div>
            </div>
          ))}
        </div>

        {/* ── CHART ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Chart header */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--sol-border)", display: "flex", alignItems: "center", gap: 24 }}>
            {selected && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: selected.color, fontSize: 24 }}>{selected.icon}</span>
                  <span style={{ fontFamily: "Syne", fontSize: 20, fontWeight: 800 }}>{selected.symbol}/USD</span>
                </div>
                <div style={{ fontSize: 28, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#fff" }}>
                  {fmtPrice(currentPrice)}
                </div>
                <div style={{ color: bullish ? "#14F195" : "#ff4d6a", fontSize: 14, fontWeight: 600 }}>
                  {bullish ? "▲" : "▼"} {Math.abs(+priceDelta)}%
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {["1H", "4H", "1D", "1W"].map((t) => (
                    <button key={t} style={{ padding: "4px 12px", borderRadius: 6, background: t === "1H" ? "rgba(153,69,255,0.2)" : "transparent", border: "1px solid rgba(153,69,255,0.2)", color: t === "1H" ? "#fff" : "var(--sol-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Candlestick chart */}
          <div style={{ flex: 1, padding: "16px 8px 8px", minHeight: 320 }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={candles} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="time" tick={{ fill: "#333", fontSize: 10 }} tickLine={false} axisLine={false} interval={9} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#333", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={yAxisFmt}   // ✅ typed function — no implicit any
                  width={75}
                />
                <Tooltip content={<CandleTooltip />} />
                <Bar dataKey="close" barSize={7} radius={[1, 1, 0, 0]}>
                  {candles.map((c, i) => <Cell key={i} fill={c.bullish ? "#14F195" : "#ff4d6a"} opacity={0.9} />)}
                </Bar>
                <Line dataKey="close" dot={false} stroke={selected?.color || "#9945FF"} strokeWidth={1} opacity={0.4} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Volume bars */}
          <div style={{ padding: "0 8px 8px", height: 60 }}>
            <ResponsiveContainer width="100%" height={60}>
              <ComposedChart data={candles} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                <Bar dataKey="volume" barSize={7} radius={[2, 2, 0, 0]}>
                  {candles.map((c, i) => <Cell key={i} fill={c.bullish ? "rgba(20,241,149,0.2)" : "rgba(255,77,106,0.2)"} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Pyth badge */}
          <div style={{ padding: "8px 24px", borderTop: "1px solid var(--sol-border)", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--sol-muted)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#14F195", display: "inline-block" }} />
            PRICE DATA · PYTH NETWORK ORACLE · REFRESHES EVERY 10S
          </div>
        </div>

        {/* ── TRADE PANEL ────────────────────────────────────────────────── */}
        <div style={{ width: 340, borderLeft: "1px solid var(--sol-border)", background: "var(--sol-card)", display: "flex", flexDirection: "column" }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--sol-border)" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "14px 0", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid var(--sol-purple)" : "2px solid transparent", color: tab === t ? "#fff" : "var(--sol-muted)", fontSize: 11, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>

            {/* Balances */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div style={{ padding: 12, background: "rgba(153,69,255,0.08)", borderRadius: 10, border: "1px solid rgba(153,69,255,0.15)" }}>
                <div style={{ fontSize: 11, color: "var(--sol-muted)", marginBottom: 4 }}>SOL</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#fff" }}>{solbar.solBal.toFixed(4)}</div>
              </div>
              <div style={{ padding: 12, background: "rgba(240,180,41,0.08)", borderRadius: 10, border: "1px solid rgba(240,180,41,0.15)" }}>
                <div style={{ fontSize: 11, color: "var(--sol-muted)", marginBottom: 4 }}>SOLBAR</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#f0b429" }}>{solbar.tokenBal.toFixed(2)}</div>
              </div>
            </div>

            {/* ── SWAP ── */}
            {tab === "SWAP" && (
              <>
                <label style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", display: "block", marginBottom: 8 }}>YOU PAY (SOL)</label>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input value={solInput} onChange={(e) => setSolInput(e.target.value)} type="number" placeholder="0.00"
                    style={{ width: "100%", padding: "12px 60px 12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--sol-border)", borderRadius: 10, color: "#fff", fontSize: 18, fontFamily: "JetBrains Mono, monospace", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--sol-purple)")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--sol-border)")} />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9945FF", fontWeight: 700 }}>SOL</span>
                </div>

                <div style={{ textAlign: "center", color: "var(--sol-muted)", margin: "8px 0" }}>↓</div>

                <label style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", display: "block", marginBottom: 8 }}>YOU RECEIVE (SOLBAR)</label>
                <div style={{ padding: "12px 14px", background: "rgba(240,180,41,0.06)", border: "1px solid rgba(240,180,41,0.2)", borderRadius: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: "#f0b429", marginBottom: 16 }}>
                  {previewTokens}
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 20, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--sol-muted)", marginBottom: 6 }}>
                    <span>Rate</span>
                    <span style={{ color: "#fff" }}>1 SOL = {(1 / PRICE_SOL).toLocaleString()} SOLBAR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--sol-muted)" }}>
                    <span>USD Price</span>
                    <span style={{ color: "#fff" }}>{selected ? fmtPrice(selected.price) : "—"}</span>
                  </div>
                </div>

                <button onClick={handleSwap} disabled={txStatus === "loading" || !wallet.connected}
                  style={{ width: "100%", padding: 14, borderRadius: 12, background: txStatus === "loading" ? "rgba(153,69,255,0.3)" : "linear-gradient(135deg,#9945FF,#6b2fd1)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: txStatus === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {txStatus === "loading" ? "PROCESSING..." : wallet.connected ? "SWAP SOL → SOLBAR" : "CONNECT WALLET"}
                </button>
              </>
            )}

            {/* ── BURN ── */}
            {tab === "BURN" && (
              <>
                <label style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", display: "block", marginBottom: 8 }}>BURN AMOUNT (SOLBAR)</label>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} type="number" placeholder="0.00"
                    style={{ width: "100%", padding: "12px 80px 12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--sol-border)", borderRadius: 10, color: "#fff", fontSize: 18, fontFamily: "JetBrains Mono, monospace", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#f0b429")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--sol-border)")} />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#f0b429", fontWeight: 700 }}>SOLBAR</span>
                </div>

                <div style={{ textAlign: "center", color: "var(--sol-muted)", margin: "8px 0" }}>↓</div>

                <label style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", display: "block", marginBottom: 8 }}>YOU RECEIVE (SOL)</label>
                <div style={{ padding: "12px 14px", background: "rgba(153,69,255,0.06)", border: "1px solid rgba(153,69,255,0.2)", borderRadius: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: "#9945FF", marginBottom: 20 }}>
                  {previewSol}
                </div>

                <button onClick={handleBurn} disabled={txStatus === "loading" || !wallet.connected}
                  style={{ width: "100%", padding: 14, borderRadius: 12, background: txStatus === "loading" ? "#300" : "linear-gradient(135deg,#7f0000,#cc0000)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: txStatus === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {txStatus === "loading" ? "PROCESSING..." : wallet.connected ? "🔥 BURN SOLBAR → SOL" : "CONNECT WALLET"}
                </button>
              </>
            )}

            {/* ── PORTFOLIO ── */}
            {tab === "PORTFOLIO" && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--sol-muted)", marginBottom: 4 }}>TOTAL VALUE (USD)</div>
                  <div style={{ fontSize: 32, fontFamily: "Syne, sans-serif", fontWeight: 800, color: "#fff" }}>
                    ${((solbar.solBal * 142) + (solbar.tokenBal * 0.001 * 142)).toFixed(2)}
                  </div>
                </div>

                {[
                  { name: "Solana",       sym: "SOL",    bal: solbar.solBal.toFixed(4),   usd: `$${(solbar.solBal * 142).toFixed(2)}`,                  color: "#9945FF", icon: "◎" },
                  { name: "SOLBAR Token", sym: "SOLBAR", bal: solbar.tokenBal.toFixed(2),  usd: `$${(solbar.tokenBal * 0.001 * 142).toFixed(2)}`,       color: "#f0b429", icon: "⬡" },
                ].map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${h.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: `1px solid ${h.color}40` }}>
                      {h.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{h.sym}</div>
                      <div style={{ fontSize: 12, color: "var(--sol-muted)" }}>{h.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{h.bal}</div>
                      <div style={{ fontSize: 12, color: "var(--sol-muted)" }}>{h.usd}</div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 10, background: solbar.isWhitelisted ? "rgba(20,241,149,0.08)" : "rgba(255,77,106,0.08)", border: `1px solid ${solbar.isWhitelisted ? "rgba(20,241,149,0.2)" : "rgba(255,77,106,0.2)"}` }}>
                  <div style={{ fontSize: 12, color: solbar.isWhitelisted ? "#14F195" : "#ff4d6a", fontWeight: 600 }}>
                    {solbar.isWhitelisted ? "✓ KYC Verified — You can trade" : "⚠ Not Whitelisted — Contact admin"}
                  </div>
                </div>
              </>
            )}

            {/* TX Status */}
            {txMsg && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: txStatus === "success" ? "rgba(20,241,149,0.1)" : txStatus === "error" ? "rgba(255,77,106,0.1)" : "rgba(153,69,255,0.1)", border: `1px solid ${txStatus === "success" ? "rgba(20,241,149,0.3)" : txStatus === "error" ? "rgba(255,77,106,0.3)" : "rgba(153,69,255,0.3)"}`, fontSize: 12, color: txStatus === "success" ? "#14F195" : txStatus === "error" ? "#ff4d6a" : "var(--sol-purple)", wordBreak: "break-all" }}>
                {txMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}