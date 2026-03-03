import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solbar } from "../target/types/solbar";
import {
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

// ═══════════════════════════════════════════════════════════════════════════════
//  SOLBAR — Full Test Suite
//  Tests all 5 instructions + 2 admin helpers
//  Run: anchor test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Solbar — RWA Token Platform", () => {

  // ── Provider & Program setup ───────────────────────────────────────────────
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Solbar as Program<Solbar>;
  const admin   = provider.wallet as anchor.Wallet;

  // ── Keypairs ───────────────────────────────────────────────────────────────
  const mintKp = Keypair.generate(); // Token-2022 mint
  const user1  = Keypair.generate(); // whitelisted user
  const user2  = Keypair.generate(); // NOT whitelisted

  // ── Price config ───────────────────────────────────────────────────────────
  // 1_000_000 lamports per 1 full token = 0.001 SOL per token
  const PRICE_PER_TOKEN = new anchor.BN(1_000_000);
  const DECIMALS        = 6;

  // ── PDA helper ────────────────────────────────────────────────────────────
  const pda = (...seeds: Buffer[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  // ── Derive all PDAs ────────────────────────────────────────────────────────
  const configPda     = pda(Buffer.from("config"));
  const tokenStatePda = pda(Buffer.from("token_state"), mintKp.publicKey.toBuffer());
  const wlUser1Pda    = pda(Buffer.from("whitelist"), user1.publicKey.toBuffer());
  const wlUser2Pda    = pda(Buffer.from("whitelist"), user2.publicKey.toBuffer());

  // ── ATAs ──────────────────────────────────────────────────────────────────
  const user1Ata = getAssociatedTokenAddressSync(
    mintKp.publicKey, user1.publicKey, false, TOKEN_2022_PROGRAM_ID
  );
  const user2Ata = getAssociatedTokenAddressSync(
    mintKp.publicKey, user2.publicKey, false, TOKEN_2022_PROGRAM_ID
  );

  // ── Airdrop helper ────────────────────────────────────────────────────────
  const airdrop = async (pk: PublicKey, sol = 2) => {
    const sig = await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  before(async () => {
    await airdrop(user1.publicKey, 5);
    await airdrop(user2.publicKey, 5);
    console.log("\n  ── Test wallets funded ──");
    console.log("  Admin :", admin.publicKey.toBase58());
    console.log("  User1 :", user1.publicKey.toBase58());
    console.log("  User2 :", user2.publicKey.toBase58());
    console.log("  Mint  :", mintKp.publicKey.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 1 — initialize
  //  Platform config PDA create honi chahiye
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 1. initialize — PlatformConfig PDA created", async () => {
    await program.methods
      .initialize()
      .accountsStrict({
        admin:         admin.publicKey,
        config:        configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.platformConfig.fetch(configPda);

    assert.equal(config.admin.toBase58(), admin.publicKey.toBase58(), "Admin mismatch");
    assert.equal(config.paused, false, "Should not be paused");

    console.log("  Config PDA :", configPda.toBase58());
    console.log("  Admin      :", config.admin.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 2 — initialize FAILS if called again (already initialized)
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 2. initialize FAILS — cannot initialize twice", async () => {
    try {
      await program.methods
        .initialize()
        .accountsStrict({
          admin:         admin.publicKey,
          config:        configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("already in use") ||
        err.toString().includes("Error"),
        "Expected already initialized error"
      );
      console.log("  ✅ Correctly rejected double initialization");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 3 — create_token
  //  Token-2022 mint + TokenState PDA create honi chahiye
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 3. create_token — Token-2022 mint created, price bound", async () => {
    await program.methods
      .createToken(PRICE_PER_TOKEN, DECIMALS)
      .accountsStrict({
        admin:         admin.publicKey,
        config:        configPda,
        mint:          mintKp.publicKey,
        tokenState:    tokenStatePda,
        tokenProgram:  TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mintKp])
      .rpc();

    const state = await program.account.tokenState.fetch(tokenStatePda);

    assert.equal(state.mint.toBase58(), mintKp.publicKey.toBase58(), "Mint mismatch");
    assert.equal(state.pricePerToken.toNumber(), PRICE_PER_TOKEN.toNumber(), "Price mismatch");
    assert.equal(state.decimals, DECIMALS, "Decimals mismatch");
    assert.equal(state.isActive, true, "Should be active");
    assert.equal(state.totalMinted.toNumber(), 0, "No tokens minted yet");

    console.log("  Mint       :", state.mint.toBase58());
    console.log("  Price      :", state.pricePerToken.toNumber(), "lamports/token");
    console.log("  Decimals   :", state.decimals);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 4 — create_token FAILS for non-admin
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 4. create_token FAILS — non-admin cannot create token", async () => {
    const fakeMint = Keypair.generate();
    const fakeTokenStatePda = pda(Buffer.from("token_state"), fakeMint.publicKey.toBuffer());

    try {
      await program.methods
        .createToken(PRICE_PER_TOKEN, DECIMALS)
        .accountsStrict({
          admin:         user1.publicKey, // NOT admin
          config:        configPda,
          mint:          fakeMint.publicKey,
          tokenState:    fakeTokenStatePda,
          tokenProgram:  TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1, fakeMint])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("Unauthorized") ||
        err.toString().includes("AnchorError") ||
        err.toString().includes("ConstraintHasOne"),
        "Expected Unauthorized error"
      );
      console.log("  ✅ Correctly rejected non-admin token creation");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 5 — add_to_whitelist
  //  user1 ko approve karo
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 5. add_to_whitelist — user1 approved", async () => {
    await program.methods
      .addToWhitelist(user1.publicKey)
      .accountsStrict({
        admin:          admin.publicKey,
        config:         configPda,
        whitelistEntry: wlUser1Pda,
        systemProgram:  SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(wlUser1Pda);

    assert.equal(entry.wallet.toBase58(), user1.publicKey.toBase58(), "Wallet mismatch");
    assert.equal(entry.isActive, true, "Should be active");
    assert.isAbove(entry.addedAt.toNumber(), 0, "addedAt should be set");

    console.log("  Whitelisted:", entry.wallet.toBase58());
    console.log("  Added at   :", new Date(entry.addedAt.toNumber() * 1000).toISOString());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 6 — swap (whitelisted user1)
  //  SOL deta hai → tokens milte hain
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 6. swap — user1 sends SOL, receives tokens", async () => {
    const solAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

    const solBefore = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .swap(solAmount)
      .accountsStrict({
        user:                   user1.publicKey,
        config:                 configPda,
        tokenState:             tokenStatePda,
        mint:                   mintKp.publicKey,
        userAta:                user1Ata,
        whitelistEntry:         wlUser1Pda,
        tokenProgram:           TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    // tokens = (0.1 SOL * 10^6) / 1_000_000 = 100_000_000 base units = 100 tokens
    const expectedTokens = (solAmount.toNumber() * Math.pow(10, DECIMALS)) / PRICE_PER_TOKEN.toNumber();

    const ataInfo  = await provider.connection.getTokenAccountBalance(user1Ata);
    const state    = await program.account.tokenState.fetch(tokenStatePda);
    const solAfter = await provider.connection.getBalance(user1.publicKey);

    assert.equal(Number(ataInfo.value.amount), expectedTokens, "Token amount mismatch");
    assert.equal(state.totalMinted.toNumber(), expectedTokens, "Total minted mismatch");
    assert.isBelow(solAfter, solBefore, "SOL should have decreased");

    console.log("  SOL sent   :", solAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  Tokens got :", ataInfo.value.uiAmount);
    console.log("  Total mint :", state.totalMinted.toNumber());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 7 — swap FAILS for non-whitelisted user2
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 7. swap FAILS — user2 not whitelisted", async () => {
    try {
      await program.methods
        .swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user:                   user2.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   mintKp.publicKey,
          userAta:                user2Ata,
          whitelistEntry:         wlUser2Pda,
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      const msg = err.toString();
      assert.isTrue(
        msg.includes("AccountNotInitialized") ||
        msg.includes("NotWhitelisted") ||
        msg.includes("AnchorError"),
        `Expected whitelist error, got: ${msg}`
      );
      console.log("  ✅ Correctly rejected non-whitelisted user2");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 8 — swap with zero amount FAILS
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 8. swap FAILS — zero SOL amount rejected", async () => {
    try {
      await program.methods
        .swap(new anchor.BN(0)) // zero amount
        .accountsStrict({
          user:                   user1.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   mintKp.publicKey,
          userAta:                user1Ata,
          whitelistEntry:         wlUser1Pda,
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("ZeroAmount") ||
        err.toString().includes("AnchorError"),
        "Expected ZeroAmount error"
      );
      console.log("  ✅ Correctly rejected zero amount swap");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 9 — burn_tokens
  //  user1 tokens burn karta hai → SOL wapas milta hai
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 9. burn_tokens — user1 burns tokens, receives SOL", async () => {
    const ataBefore  = await provider.connection.getTokenAccountBalance(user1Ata);
    const burnAmount = new anchor.BN(Math.floor(Number(ataBefore.value.amount) / 2));
    const solBefore  = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .burnTokens(burnAmount)
      .accountsStrict({
        user:                   user1.publicKey,
        config:                 configPda,
        tokenState:             tokenStatePda,
        mint:                   mintKp.publicKey,
        userAta:                user1Ata,
        whitelistEntry:         wlUser1Pda,
        tokenProgram:           TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    const ataAfter = await provider.connection.getTokenAccountBalance(user1Ata);
    const solAfter = await provider.connection.getBalance(user1.publicKey);
    const state    = await program.account.tokenState.fetch(tokenStatePda);

    assert.isAbove(solAfter, solBefore, "User should receive SOL back");
    assert.equal(
      Number(ataAfter.value.amount),
      Number(ataBefore.value.amount) - burnAmount.toNumber(),
      "Token balance should decrease by burn amount"
    );
    assert.isBelow(state.totalMinted.toNumber(), Number(ataBefore.value.amount), "Total minted should decrease");

    console.log("  Tokens burned   :", burnAmount.toNumber());
    console.log("  SOL received    :", (solAfter - solBefore) / LAMPORTS_PER_SOL, "SOL");
    console.log("  Remaining supply:", state.totalMinted.toNumber());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 10 — burn_tokens FAILS for non-whitelisted
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 10. burn_tokens FAILS — user2 not whitelisted", async () => {
    try {
      await program.methods
        .burnTokens(new anchor.BN(1000))
        .accountsStrict({
          user:                   user2.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   mintKp.publicKey,
          userAta:                user2Ata,
          whitelistEntry:         wlUser2Pda,
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("AccountNotInitialized") ||
        err.toString().includes("NotWhitelisted") ||
        err.toString().includes("AnchorError"),
        "Expected whitelist error"
      );
      console.log("  ✅ Correctly rejected non-whitelisted burn");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 11 — toggle_pause
  //  Admin platform pause karta hai
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 11. toggle_pause — admin pauses platform", async () => {
    await program.methods
      .togglePause(true)
      .accountsStrict({
        admin:  admin.publicKey,
        config: configPda,
      })
      .rpc();

    const config = await program.account.platformConfig.fetch(configPda);
    assert.equal(config.paused, true, "Platform should be paused");
    console.log("  ✅ Platform paused");
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 12 — swap FAILS when paused
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 12. swap FAILS — platform is paused", async () => {
    try {
      await program.methods
        .swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user:                   user1.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   mintKp.publicKey,
          userAta:                user1Ata,
          whitelistEntry:         wlUser1Pda,
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("Paused") ||
        err.toString().includes("AnchorError"),
        "Expected Paused error"
      );
      console.log("  ✅ Correctly blocked swap when paused");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 13 — toggle_pause (unpause)
  //  Admin platform unpause karta hai
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 13. toggle_pause — admin unpauses platform", async () => {
    await program.methods
      .togglePause(false)
      .accountsStrict({
        admin:  admin.publicKey,
        config: configPda,
      })
      .rpc();

    const config = await program.account.platformConfig.fetch(configPda);
    assert.equal(config.paused, false, "Platform should be unpaused");
    console.log("  ✅ Platform unpaused");
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 14 — remove_from_whitelist
  //  user1 ki access revoke karo
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 14. remove_from_whitelist — user1 access revoked", async () => {
    await program.methods
      .removeFromWhitelist(user1.publicKey)
      .accountsStrict({
        admin:          admin.publicKey,
        config:         configPda,
        whitelistEntry: wlUser1Pda,
      })
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(wlUser1Pda);
    assert.equal(entry.isActive, false, "Should be inactive");
    console.log("  ✅ user1 removed from whitelist");
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 15 — swap FAILS after whitelist removal
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 15. swap FAILS — user1 removed from whitelist", async () => {
    try {
      await program.methods
        .swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user:                   user1.publicKey,
          config:                 configPda,
          tokenState:             tokenStatePda,
          mint:                   mintKp.publicKey,
          userAta:                user1Ata,
          whitelistEntry:         wlUser1Pda,
          tokenProgram:           TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(
        err.toString().includes("NotWhitelisted") ||
        err.toString().includes("AnchorError"),
        "Expected NotWhitelisted error"
      );
      console.log("  ✅ Correctly blocked removed user1");
    }
  });
});