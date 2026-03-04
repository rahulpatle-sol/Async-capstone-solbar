"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchPythPrices, buildAssets, AssetPrice } from "./lib/pyth";

export default function HomePage() {
  const router = useRouter();
  const { connected } = useWallet();
  const heroRef    = useRef<HTMLDivElement>(null);
  const statsRef   = useRef<HTMLDivElement>(null);
  const assetsRef  = useRef<HTMLDivElement>(null);
  const svgRef     = useRef<SVGSVGElement>(null);

  const [assets, setAssets]     = useState<AssetPrice[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cursorRef     = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);

  // Cursor
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (cursorRef.current)     { cursorRef.current.style.left = e.clientX + "px"; cursorRef.current.style.top = e.clientY + "px"; }
      if (cursorRingRef.current) { cursorRingRef.current.style.left = e.clientX + "px"; cursorRingRef.current.style.top = e.clientY + "px"; }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Pyth prices
  useEffect(() => {
    const load = async () => {
      const prices = await fetchPythPrices();
      setAssets(buildAssets(prices));
    };
    load();
    const interval = setInterval(load, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // GSAP
  useEffect(() => {
    let gsap: any, ScrollTrigger: any;
    const init = async () => {
      const g = await import("gsap");
      const st = await import("gsap/ScrollTrigger");
      gsap = g.gsap;
      ScrollTrigger = st.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      // Hero entrance
      gsap.fromTo(".hero-badge",   { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.2 });
      gsap.fromTo(".hero-title",   { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1, delay: 0.4 });
      gsap.fromTo(".hero-sub",     { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.7 });
      gsap.fromTo(".hero-cta",     { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.6, delay: 1 });
      gsap.fromTo(".hero-globe",   { opacity: 0, scale: 0.5, rotation: -20 }, { opacity: 1, scale: 1, rotation: 0, duration: 1.2, delay: 0.3, ease: "back.out(1.7)" });

      // SVG lines draw
      const paths = document.querySelectorAll(".svg-path");
      paths.forEach((p: any, i) => {
        const len = p.getTotalLength?.() || 300;
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(p, { strokeDashoffset: 0, duration: 2, delay: i * 0.3 + 0.5, ease: "power2.inOut" });
      });

      // Stats scroll
      gsap.fromTo(".stat-card",
        { opacity: 0, y: 50, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.1,
          scrollTrigger: { trigger: statsRef.current, start: "top 80%" } }
      );

      // Assets scroll
      gsap.fromTo(".asset-row",
        { opacity: 0, x: -40 },
        { opacity: 1, x: 0, duration: 0.5, stagger: 0.08,
          scrollTrigger: { trigger: assetsRef.current, start: "top 75%" } }
      );

      // Features
      gsap.fromTo(".feature-card",
        { opacity: 0, y: 60, rotateX: 20 },
        { opacity: 1, y: 0, rotateX: 0, duration: 0.7, stagger: 0.15, ease: "back.out(1.4)",
          scrollTrigger: { trigger: ".features-section", start: "top 80%" } }
      );

      // Parallax hero bg
      gsap.to(".hero-orb-1", {
        y: -80, ease: "none",
        scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: 1 }
      });
      gsap.to(".hero-orb-2", {
        y: -120, ease: "none",
        scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: 1.5 }
      });
    };
    init();
    return () => { ScrollTrigger?.getAll?.()?.forEach((t: any) => t.kill()); };
  }, []);

  // Auto redirect on connect
  useEffect(() => {
    if (connected) router.push("/dashboard");
  }, [connected, router]);

  const formatPrice = (p: number) => {
    if (p > 1000) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${p.toFixed(4)}`;
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Custom cursor */}
      <div className="cursor" ref={cursorRef} />
      <div className="cursor-ring" ref={cursorRingRef} />

      {/* ── NAV ──────────────────────────────────────────────────────── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(153,69,255,0.08)", backdropFilter: "blur(20px)", background: "rgba(6,6,10,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <polygon points="16,2 30,24 2,24" fill="none" stroke="#9945FF" strokeWidth="2"/>
            <polygon points="16,8 26,24 6,24" fill="rgba(153,69,255,0.15)" stroke="#14F195" strokeWidth="1"/>
          </svg>
          <span style={{ fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 3, color: "#fff" }}>SOLBAR</span>
        </div>
        <div style={{ display: "flex", gap: 40, fontSize: 13, color: "var(--sol-muted)" }}>
          {["Assets", "Trade", "Protocol", "Docs"].map(l => (
            <a key={l} href="#" style={{ color: "inherit", textDecoration: "none", transition: "color 0.2s" }}
               onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
               onMouseLeave={e => (e.currentTarget.style.color = "")}>
              {l}
            </a>
          ))}
        </div>
        <WalletMultiButton />
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section ref={heroRef} style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "120px 48px 80px" }}>
        {/* Background orbs */}
        <div className="hero-orb-1" style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(153,69,255,0.15) 0%, transparent 70%)", top: "10%", left: "-10%", pointerEvents: "none" }} />
        <div className="hero-orb-2" style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(20,241,149,0.1) 0%, transparent 70%)", bottom: "10%", right: "5%", pointerEvents: "none" }} />

        {/* SVG grid lines */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.15 }} viewBox="0 0 1440 900">
          {[...Array(8)].map((_, i) => (
            <line key={`h${i}`} className="svg-path" x1="0" y1={i * 130} x2="1440" y2={i * 130} stroke="url(#gl)" strokeWidth="0.5" />
          ))}
          {[...Array(12)].map((_, i) => (
            <line key={`v${i}`} className="svg-path" x1={i * 130} y1="0" x2={i * 130} y2="900" stroke="url(#gl)" strokeWidth="0.5" />
          ))}
          <defs>
            <linearGradient id="gl" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent"/>
              <stop offset="50%" stopColor="#9945FF"/>
              <stop offset="100%" stopColor="transparent"/>
            </linearGradient>
          </defs>
        </svg>

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 900 }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 100, border: "1px solid rgba(20,241,149,0.3)", background: "rgba(20,241,149,0.05)", fontSize: 12, color: "var(--sol-green)", letterSpacing: 2, marginBottom: 32 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sol-green)", display: "inline-block", animation: "pulse-ring 1.5s infinite" }} />
            LIVE ON SOLANA DEVNET · POWERED BY PYTH ORACLE
          </div>

          <h1 className="hero-title" style={{ fontFamily: "Syne, sans-serif", fontSize: "clamp(48px, 8vw, 96px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 24 }}>
            <span className="grad-text">Real World Assets</span>
            <br />
            <span style={{ color: "#fff" }}>On-Chain.</span>
          </h1>

          <p className="hero-sub" style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "var(--sol-muted)", lineHeight: 1.7, maxWidth: 580, margin: "0 auto 48px" }}>
            Trade tokenized gold, real estate, and commodities. 
            Real-time Pyth price feeds. Whitelist-gated KYC compliance.
          </p>

          <div className="hero-cta" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <WalletMultiButton />
            <button onClick={() => router.push("/dashboard")}
              style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(153,69,255,0.4)", background: "transparent", color: "#fff", fontSize: 15, fontFamily: "inherit", cursor: "pointer", transition: "all 0.3s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(153,69,255,0.1)"; e.currentTarget.style.borderColor = "var(--sol-purple)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(153,69,255,0.4)"; }}>
              View Dashboard →
            </button>
          </div>
        </div>

        {/* Floating globe/ring SVG */}
        <div className="hero-globe" style={{ position: "absolute", right: "5%", top: "50%", transform: "translateY(-50%)", width: 280, height: 280, animation: "float 4s ease-in-out infinite" }}>
          <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="140" cy="140" r="120" stroke="rgba(153,69,255,0.2)" strokeWidth="1"/>
            <circle cx="140" cy="140" r="90" stroke="rgba(153,69,255,0.3)" strokeWidth="1.5"/>
            <circle cx="140" cy="140" r="60" stroke="rgba(20,241,149,0.4)" strokeWidth="2"/>
            <circle cx="140" cy="140" r="30" fill="rgba(153,69,255,0.15)" stroke="var(--sol-purple)" strokeWidth="2"/>
            <text x="140" y="147" textAnchor="middle" fill="#d4af37" fontSize="20" fontWeight="bold">⬡</text>
            {/* Orbit dots */}
            {[0, 60, 120, 180, 240, 300].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              return (
                <circle key={i} cx={140 + 90 * Math.cos(rad)} cy={140 + 90 * Math.sin(rad)} r="4"
                  fill={i % 2 === 0 ? "var(--sol-purple)" : "var(--sol-green)"} opacity="0.8" />
              );
            })}
          </svg>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.4 }}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: "var(--sol-muted)" }}>SCROLL</span>
          <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom, var(--sol-purple), transparent)" }} />
        </div>
      </section>

      {/* ── LIVE PRICES TICKER ───────────────────────────────────────── */}
      <div style={{ overflow: "hidden", borderTop: "1px solid var(--sol-border)", borderBottom: "1px solid var(--sol-border)", padding: "12px 0", background: "rgba(15,15,26,0.5)" }}>
        <div style={{ display: "flex", gap: 64, animation: "shimmer 8s linear infinite", whiteSpace: "nowrap" }}>
          {[...assets, ...assets].map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ color: a.color, fontSize: 16 }}>{a.icon}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{a.symbol}</span>
              <span style={{ color: "var(--sol-muted)" }}>{formatPrice(a.price)}</span>
              <span style={{ color: a.change24h >= 0 ? "var(--green)" : "var(--red)", fontSize: 12 }}>
                {a.change24h >= 0 ? "▲" : "▼"} {Math.abs(a.change24h)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── STATS ────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{ padding: "100px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
          {[
            { val: "$2.4M", label: "TOTAL VALUE LOCKED", icon: "⬡", color: "#f0b429" },
            { val: "47",    label: "WHITELISTED WALLETS", icon: "◎", color: "#9945FF" },
            { val: "3",     label: "ASSET CLASSES", icon: "⌘", color: "#14F195" },
            { val: "100%",  label: "GOLD BACKED", icon: "★", color: "#f0b429" },
          ].map((s, i) => (
            <div key={i} className="stat-card glass" style={{ padding: "32px 28px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div>
              <div style={{ fontSize: 40, fontFamily: "Syne, sans-serif", fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--sol-muted)", letterSpacing: 2, marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ASSETS TABLE ─────────────────────────────────────────────── */}
      <section ref={assetsRef} style={{ padding: "0 48px 100px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 40, fontWeight: 800, marginBottom: 8 }}>
            <span className="grad-text">Tokenized Assets</span>
          </h2>
          <p style={{ color: "var(--sol-muted)", marginBottom: 48, fontSize: 16 }}>Live prices powered by Pyth Network oracle</p>

          <div className="glass" style={{ overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "16px 28px", borderBottom: "1px solid var(--sol-border)", fontSize: 11, letterSpacing: 2, color: "var(--sol-muted)" }}>
              <span>ASSET</span><span>PRICE</span><span>24H CHANGE</span><span>VOLUME</span><span></span>
            </div>

            {assets.map((a, i) => (
              <div key={i} className="asset-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "20px 28px", borderBottom: i < assets.length - 1 ? "1px solid rgba(153,69,255,0.06)" : "none", alignItems: "center", transition: "background 0.2s", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(153,69,255,0.05)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                onClick={() => router.push("/dashboard")}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${a.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${a.color}40` }}>
                    {a.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{a.symbol}</div>
                    <div style={{ fontSize: 11, color: "var(--sol-muted)", letterSpacing: 1, marginTop: 2 }}>
                      {a.category === "crypto" ? "CRYPTO" : a.category === "commodity" ? "COMMODITY" : "REAL WORLD ASSET"}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 15 }}>{formatPrice(a.price)}</div>
                <div style={{ color: a.change24h >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  {a.change24h >= 0 ? "+" : ""}{a.change24h}%
                </div>
                <div style={{ color: "var(--sol-muted)", fontFamily: "JetBrains Mono, monospace" }}>{a.volume}</div>
                <button onClick={() => router.push("/dashboard")} style={{ padding: "8px 20px", borderRadius: 8, background: `${a.color}20`, border: `1px solid ${a.color}40`, color: a.color, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, letterSpacing: 1 }}>
                  TRADE →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section className="features-section" style={{ padding: "0 48px 100px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: 40, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>
            Why <span className="grad-text">SOLBAR</span>?
          </h2>
          <p style={{ color: "var(--sol-muted)", textAlign: "center", marginBottom: 60, fontSize: 16 }}>Built on Solana. Secured by Pyth.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {[
              { icon: "⬡", title: "Real Gold Backing", desc: "Every token represents real gold. 100% backed, auditable on-chain.", color: "#f0b429" },
              { icon: "◎", title: "Pyth Price Oracle", desc: "Live price feeds from Pyth Network. No manipulation. No lag.", color: "#9945FF" },
              { icon: "⌘", title: "KYC Whitelist", desc: "Compliance-first design. Only verified wallets can trade.", color: "#14F195" },
              { icon: "↗", title: "Instant Settlement", desc: "Trade settles in <400ms on Solana. No bridges. No waiting.", color: "#ff6b6b" },
              { icon: "🔒", title: "Token-2022 Standard", desc: "Transfer hooks enforce whitelist on every P2P transfer.", color: "#4ecdc4" },
              { icon: "★", title: "Multi-Asset", desc: "Gold, real estate, commodities — all in one platform.", color: "#f0b429" },
            ].map((f, i) => (
              <div key={i} className="feature-card glass" style={{ padding: "32px 28px" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${f.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${f.color}30`, marginBottom: 20 }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{f.title}</h3>
                <p style={{ color: "var(--sol-muted)", lineHeight: 1.6, fontSize: 14 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 48px", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, marginBottom: 24 }}>
            Start Trading <span className="grad-text">Real Assets</span>
          </h2>
          <p style={{ color: "var(--sol-muted)", fontSize: 18, marginBottom: 48 }}>Connect your Phantom wallet and start trading in 30 seconds.</p>
          <WalletMultiButton />
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ padding: "40px 48px", borderTop: "1px solid var(--sol-border)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--sol-muted)", fontSize: 13 }}>
        <span style={{ fontFamily: "Syne", fontWeight: 800, color: "#fff" }}>SOLBAR</span>
        <span>Built on Solana · Turbine3 Q1 2025</span>
        <span>Devnet · 7tEFk...uGDg</span>
      </footer>
    </div>
  );
}