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

describe("Solbar2 — Gold Token Platform", () => {
  // ── Setup ──────────────────────────────────────────────────────────────────
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program  = anchor.workspace.Solbar2 as Program<Solbar2>;
  const admin    = provider.wallet as anchor.Wallet;

  // Fresh keypairs for each test run
  const mintKp   = Keypair.generate();
  const user1    = Keypair.generate();
  const user2    = Keypair.generate(); // NOT whitelisted

  // PDAs
  let configPda:       PublicKey;
  let tokenStatePda:   PublicKey;
  let wlUser1Pda:      PublicKey;

  // Token price: 1_000_000 lamports per 1 full token (= 0.001 SOL / token)
  const PRICE_PER_TOKEN = new anchor.BN(1_000_000);
  const DECIMALS        = 6;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getPda = (seeds: Buffer[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const airdrop = async (pk: PublicKey, sol = 2) => {
    const sig = await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  before(async () => {
    // Derive PDAs
    configPda = getPda([Buffer.from("config")]);
    tokenStatePda = getPda([
      Buffer.from("token_state"),
      mintKp.publicKey.toBuffer(),
    ]);
    wlUser1Pda = getPda([
      Buffer.from("whitelist"),
      user1.publicKey.toBuffer(),
    ]);

    // Airdrop SOL to users
    await airdrop(user1.publicKey, 2);
    await airdrop(user2.publicKey, 2);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 1: initialize
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 1: initialize — platform config created", async () => {
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

    console.log("   ✅ Config PDA:", configPda.toBase58());
    console.log("   ✅ Admin:", config.admin.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 2: create_token
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 2: create_token — Token-2022 mint + price bound", async () => {
    await program.methods
      .createToken(PRICE_PER_TOKEN, DECIMALS)
      .accountsStrict({
        admin:        admin.publicKey,
        config:       configPda,
        mint:         mintKp.publicKey,
        tokenState:   tokenStatePda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
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

    console.log("   ✅ Mint:", state.mint.toBase58());
    console.log("   ✅ Price:", state.pricePerToken.toNumber(), "lamports/token");
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 3: add_to_whitelist
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 3: add_to_whitelist — user1 approved", async () => {
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

    console.log("   ✅ Whitelisted:", entry.wallet.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 4: swap — whitelisted user buys tokens
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 4: swap — user1 sends SOL, gets tokens", async () => {
    const solAmount   = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
    const user1Ata    = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const balBefore = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .swap(solAmount)
      .accountsStrict({
        user:                user1.publicKey,
        config:              configPda,
        tokenState:          tokenStatePda,
        mint:                mintKp.publicKey,
        userAta:             user1Ata,
        whitelistEntry:      wlUser1Pda,
        tokenProgram:        TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:       SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    // Verify token balance
    const ataInfo    = await provider.connection.getTokenAccountBalance(user1Ata);
    const state      = await program.account.tokenState.fetch(tokenStatePda);
    const balAfter   = await provider.connection.getBalance(user1.publicKey);

    // tokens = (0.1 SOL * 10^6) / 1_000_000 = 100 tokens
    const expectedTokens = (solAmount.toNumber() * Math.pow(10, DECIMALS)) / PRICE_PER_TOKEN.toNumber();
    assert.equal(
      Number(ataInfo.value.amount),
      expectedTokens,
      `Expected ${expectedTokens} tokens`
    );
    assert.isBelow(balAfter, balBefore, "SOL should have decreased");
    assert.equal(state.totalMinted.toNumber(), expectedTokens, "Total minted mismatch");

    console.log("   ✅ SOL sent:", solAmount.toNumber() / LAMPORTS_PER_SOL);
    console.log("   ✅ Tokens received:", ataInfo.value.uiAmount);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 5: swap FAILS for non-whitelisted user
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 5: swap FAILS for non-whitelisted user2", async () => {
    const solAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const user2Ata  = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      user2.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const wlUser2Pda = getPda([
      Buffer.from("whitelist"),
      user2.publicKey.toBuffer(),
    ]);

    try {
      await program.methods
        .swap(solAmount)
        .accountsStrict({
          user:                user2.publicKey,
          config:              configPda,
          tokenState:          tokenStatePda,
          mint:                mintKp.publicKey,
          userAta:             user2Ata,
          whitelistEntry:      wlUser2Pda,
          tokenProgram:        TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:       SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      assert.fail("Should have thrown — user2 not whitelisted");
    } catch (err: any) {
      // Anchor wraps errors — check for AccountNotInitialized or NotWhitelisted
      const msg = err.toString();
      const isExpected =
        msg.includes("AccountNotInitialized") ||
        msg.includes("NotWhitelisted") ||
        msg.includes("AnchorError");
      assert.isTrue(isExpected, `Unexpected error: ${msg}`);
      console.log("   ✅ Correctly rejected non-whitelisted user2");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 6: burn_tokens — user1 burns tokens, gets SOL back
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 6: burn_tokens — user1 burns tokens, receives SOL", async () => {
    const user1Ata = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    // Burn half the tokens
    const ataBefore    = await provider.connection.getTokenAccountBalance(user1Ata);
    const burnAmount   = new anchor.BN(Math.floor(Number(ataBefore.value.amount) / 2));
    const balBefore    = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .burnTokens(burnAmount)
      .accountsStrict({
        user:                user1.publicKey,
        config:              configPda,
        tokenState:          tokenStatePda,
        mint:                mintKp.publicKey,
        userAta:             user1Ata,
        whitelistEntry:      wlUser1Pda,
        tokenProgram:        TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:       SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    const ataAfter  = await provider.connection.getTokenAccountBalance(user1Ata);
    const balAfter  = await provider.connection.getBalance(user1.publicKey);
    const state     = await program.account.tokenState.fetch(tokenStatePda);

    assert.isAbove(balAfter, balBefore, "User should receive SOL");
    assert.equal(
      Number(ataAfter.value.amount),
      Number(ataBefore.value.amount) - burnAmount.toNumber(),
      "Token balance should decrease"
    );

    console.log("   ✅ Tokens burned:", burnAmount.toNumber());
    console.log("   ✅ SOL received:", (balAfter - balBefore) / LAMPORTS_PER_SOL);
    console.log("   ✅ Remaining supply:", state.totalMinted.toNumber());
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 7: remove_from_whitelist
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 7: remove_from_whitelist — user1 blocked", async () => {
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
    console.log("   ✅ user1 removed from whitelist");
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  TEST 8: swap FAILS after whitelist removal
  // ════════════════════════════════════════════════════════════════════════════
  it("✅ Test 8: swap FAILS after whitelist removal", async () => {
    const solAmount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
    const user1Ata  = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      user1.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    try {
      await program.methods
        .swap(solAmount)
        .accountsStrict({
          user:                user1.publicKey,
          config:              configPda,
          tokenState:          tokenStatePda,
          mint:                mintKp.publicKey,
          userAta:             user1Ata,
          whitelistEntry:      wlUser1Pda,
          tokenProgram:        TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:       SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      assert.fail("Should have thrown — user1 removed from whitelist");
    } catch (err: any) {
      const msg = err.toString();
      assert.isTrue(
        msg.includes("NotWhitelisted") || msg.includes("AnchorError"),
        `Expected NotWhitelisted, got: ${msg}`
      );
      console.log("   ✅ Correctly blocked removed user");
    }
  });
});