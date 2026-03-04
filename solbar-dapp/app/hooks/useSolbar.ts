"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  PROGRAM_ID, GOLD_MINT, getPDAs,
  getTokenBalance, getSolBalance, checkWhitelist,
  TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from "./../lib/solbar";
import IDL from "./../idl/solbar.json";

export function useSolbar() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [solBal, setSolBal]       = useState(0);
  const [tokenBal, setTokenBal]   = useState(0);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [txSig, setTxSig]         = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Build program
  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as any, provider);
  }, [connection, wallet]);

  // Refresh balances
  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return;
    const [sol, token, wl] = await Promise.all([
      getSolBalance(connection, wallet.publicKey),
      getTokenBalance(connection, wallet.publicKey, GOLD_MINT),
      checkWhitelist(getProgram()!, wallet.publicKey).catch(() => false),
    ]);
    setSolBal(sol);
    setTokenBal(token);
    setIsWhitelisted(wl);
  }, [wallet.publicKey, connection, getProgram]);

  useEffect(() => { if (wallet.connected) refresh(); }, [wallet.connected, refresh]);

  // ── SWAP: SOL → Token ─────────────────────────────────────────────────────
  const swap = async (solAmount: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    setLoading(true); setError(null);
    try {
      const { configPda, tokenStatePda, getWhitelistPda } = getPDAs(GOLD_MINT);
      const userAta = getAssociatedTokenAddressSync(
        GOLD_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
      );
      const lamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

      const sig = await program.methods.swap(lamports)
        .accountsStrict({
          user:                   wallet.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   GOLD_MINT,
          userAta,
          whitelistEntry:         getWhitelistPda(wallet.publicKey),
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      await refresh();
      return sig;
    } catch (e: any) {
      const msg = e?.message || "Transaction failed";
      setError(msg);
      throw e;
    } finally { setLoading(false); }
  };

  // ── BURN: Token → SOL ─────────────────────────────────────────────────────
  const burnTokens = async (tokenAmount: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    setLoading(true); setError(null);
    try {
      const { configPda, tokenStatePda, getWhitelistPda } = getPDAs(GOLD_MINT);
      const userAta = getAssociatedTokenAddressSync(
        GOLD_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
      );
      // 6 decimals
      const amount = new BN(Math.floor(tokenAmount * 1_000_000));

      const sig = await program.methods.burnTokens(amount)
        .accountsStrict({
          user:                   wallet.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   GOLD_MINT,
          userAta,
          whitelistEntry:         getWhitelistPda(wallet.publicKey),
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      await refresh();
      return sig;
    } catch (e: any) {
      setError(e?.message || "Transaction failed");
      throw e;
    } finally { setLoading(false); }
  };

  return {
    solBal, tokenBal, isWhitelisted,
    loading, txSig, error,
    swap, burnTokens, refresh,
    connected: wallet.connected,
    publicKey: wallet.publicKey,
  };
}