"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { PROGRAM_ID, getPDAs } from "../lib/solbar";
import IDL from "../idl/solbar.json";

export default function AdminPage() {
  const router     = useRouter();
  const wallet     = useWallet();
  const { connection } = useConnection();

  const [walletAddr, setWalletAddr] = useState("");
  const [status, setStatus]         = useState<"idle"|"loading"|"success"|"error">("idle");
  const [msg, setMsg]               = useState("");
  const [isPaused, setIsPaused]     = useState(false);

  const getProgram = () => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as any, provider);
  };

  const handleWhitelist = async (add: boolean) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) { setMsg("Connect wallet!"); setStatus("error"); return; }
    if (!walletAddr) { setMsg("Enter wallet address"); setStatus("error"); return; }

    setStatus("loading");
    try {
      const targetWallet = new PublicKey(walletAddr);
      const { configPda, getWhitelistPda } = getPDAs(new PublicKey("11111111111111111111111111111111"));
      const wlPda = getWhitelistPda(targetWallet);

      if (add) {
        const sig = await program.methods.addToWhitelist(targetWallet)
          .accountsStrict({ admin: wallet.publicKey, config: configPda, whitelistEntry: wlPda, systemProgram: SystemProgram.programId })
          .rpc();
        setMsg(`✓ Whitelisted! Sig: ${sig.slice(0, 12)}...`);
      } else {
        const sig = await program.methods.removeFromWhitelist(targetWallet)
          .accountsStrict({ admin: wallet.publicKey, config: configPda, whitelistEntry: wlPda })
          .rpc();
        setMsg(`✓ Removed! Sig: ${sig.slice(0, 12)}...`);
      }
      setStatus("success");
      setWalletAddr("");
    } catch (e: any) {
      setMsg(e?.message?.slice(0, 100) || "Failed");
      setStatus("error");
    }
  };

  const handleTogglePause = async () => {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    setStatus("loading");
    try {
      const { configPda } = getPDAs(new PublicKey("11111111111111111111111111111111"));
      const sig = await program.methods.togglePause(!isPaused)
        .accountsStrict({ admin: wallet.publicKey, config: configPda })
        .rpc();
      setIsPaused(p => !p);
      setMsg(`✓ Platform ${!isPaused ? "PAUSED" : "UNPAUSED"}! Sig: ${sig.slice(0, 12)}...`);
      setStatus("success");
    } catch (e: any) {
      setMsg(e?.message?.slice(0, 100) || "Failed");
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sol-darker)" }}>
      <nav style={{ padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--sol-border)", background: "var(--sol-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span onClick={() => router.push("/")} style={{ cursor: "pointer", fontFamily: "Syne", fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#fff" }}>SOLBAR</span>
          <span style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(255,77,106,0.15)", border: "1px solid rgba(255,77,106,0.3)", color: "#ff4d6a", fontSize: 11, letterSpacing: 1 }}>ADMIN PANEL</span>
        </div>
        <WalletMultiButton />
      </nav>

      <div style={{ maxWidth: 800, margin: "48px auto", padding: "0 24px" }}>
        <h1 style={{ fontFamily: "Syne", fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Platform <span className="grad-text">Admin</span></h1>
        <p style={{ color: "var(--sol-muted)", marginBottom: 48 }}>Manage whitelist and platform settings.</p>

        {/* Whitelist Management */}
        <div className="glass" style={{ padding: 32, marginBottom: 24 }}>
          <h2 style={{ fontFamily: "Syne", fontSize: 22, fontWeight: 700, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#14F195" }}>⌘</span> Whitelist Management
          </h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", display: "block", marginBottom: 8 }}>WALLET ADDRESS</label>
            <input value={walletAddr} onChange={e => setWalletAddr(e.target.value)} placeholder="Enter Solana wallet address..."
              style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--sol-border)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "JetBrains Mono, monospace", outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--sol-purple)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--sol-border)"} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => handleWhitelist(true)} disabled={status === "loading"}
              style={{ flex: 1, padding: "12px", borderRadius: 10, background: "linear-gradient(135deg, #14F195, #0ea572)", border: "none", color: "#000", fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>
              + WHITELIST WALLET
            </button>
            <button onClick={() => handleWhitelist(false)} disabled={status === "loading"}
              style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(255,77,106,0.15)", border: "1px solid rgba(255,77,106,0.3)", color: "#ff4d6a", fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>
              − REMOVE WALLET
            </button>
          </div>
        </div>

        {/* Platform Control */}
        <div className="glass" style={{ padding: 32, marginBottom: 24 }}>
          <h2 style={{ fontFamily: "Syne", fontSize: 22, fontWeight: 700, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#9945FF" }}>◎</span> Platform Control
          </h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Emergency Pause</div>
              <div style={{ fontSize: 13, color: "var(--sol-muted)" }}>Halts all swap and burn operations instantly</div>
            </div>
            <button onClick={handleTogglePause}
              style={{ padding: "10px 24px", borderRadius: 10, background: isPaused ? "rgba(20,241,149,0.15)" : "rgba(255,77,106,0.15)", border: `1px solid ${isPaused ? "rgba(20,241,149,0.3)" : "rgba(255,77,106,0.3)"}`, color: isPaused ? "#14F195" : "#ff4d6a", fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>
              {isPaused ? "UNPAUSE PLATFORM" : "PAUSE PLATFORM"}
            </button>
          </div>
        </div>

        {/* Status */}
        {msg && (
          <div style={{ padding: "14px 20px", borderRadius: 12, background: status === "success" ? "rgba(20,241,149,0.1)" : "rgba(255,77,106,0.1)", border: `1px solid ${status === "success" ? "rgba(20,241,149,0.3)" : "rgba(255,77,106,0.3)"}`, color: status === "success" ? "#14F195" : "#ff4d6a", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            {msg}
          </div>
        )}

        {/* Program Info */}
        <div className="glass" style={{ padding: 24, marginTop: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--sol-muted)", marginBottom: 12 }}>PROGRAM INFO</div>
          {[
            ["Program ID", "7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg"],
            ["Network", "Solana Devnet"],
            ["Standard", "Token-2022"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(153,69,255,0.06)", fontSize: 13 }}>
              <span style={{ color: "var(--sol-muted)" }}>{k}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#9945FF" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}