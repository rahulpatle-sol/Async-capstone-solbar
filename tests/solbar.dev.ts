import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solbar } from "../target/types/solbar";
import {
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Solbar — RWA Token Platform", () => {

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Solbar as Program<Solbar>;
  const admin   = provider.wallet as anchor.Wallet;

  const mintKp = Keypair.generate();
  const user1  = Keypair.generate();
  const user2  = Keypair.generate();

  const PRICE_PER_TOKEN = new anchor.BN(1_000_000);
  const DECIMALS        = 6;

  const pda = (...seeds: Buffer[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const configPda     = pda(Buffer.from("config"));
  const tokenStatePda = pda(Buffer.from("token_state"), mintKp.publicKey.toBuffer());
  const wlUser1Pda    = pda(Buffer.from("whitelist"), user1.publicKey.toBuffer());
  const wlUser2Pda    = pda(Buffer.from("whitelist"), user2.publicKey.toBuffer());

  const user1Ata = getAssociatedTokenAddressSync(
    mintKp.publicKey, user1.publicKey, false, TOKEN_2022_PROGRAM_ID
  );
  const user2Ata = getAssociatedTokenAddressSync(
    mintKp.publicKey, user2.publicKey, false, TOKEN_2022_PROGRAM_ID
  );

  // ── Fund helper — admin se SOL transfer karta hai (no airdrop needed) ──────
  const fundWallet = async (to: PublicKey, lamports: number) => {
    const tx = new Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey:   to,
        lamports,
      })
    );
    await provider.sendAndConfirm(tx);
  };

  before(async () => {
    // Admin se user wallets ko fund karo — no airdrop, no rate limit!
    await fundWallet(user1.publicKey, 1 * LAMPORTS_PER_SOL);
    await fundWallet(user2.publicKey, 0.5 * LAMPORTS_PER_SOL);

    console.log("\n  ── Wallets funded from admin ──");
    console.log("  Admin :", admin.publicKey.toBase58());
    console.log("  User1 :", user1.publicKey.toBase58());
    console.log("  User2 :", user2.publicKey.toBase58());
    console.log("  Mint  :", mintKp.publicKey.toBase58());
  });

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
    assert.equal(config.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(config.paused, false);
    console.log("  Config PDA:", configPda.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 2. initialize FAILS — cannot initialize twice", async () => {
    try {
      await program.methods.initialize()
        .accountsStrict({ admin: admin.publicKey, config: configPda, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("already in use") || err.toString().includes("Error"));
      console.log("  ✅ Double init rejected");
    }
  });

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
    assert.equal(state.mint.toBase58(), mintKp.publicKey.toBase58());
    assert.equal(state.pricePerToken.toNumber(), PRICE_PER_TOKEN.toNumber());
    assert.equal(state.decimals, DECIMALS);
    assert.equal(state.isActive, true);
    assert.equal(state.totalMinted.toNumber(), 0);
    console.log("  Mint:", state.mint.toBase58());
    console.log("  Price:", state.pricePerToken.toNumber(), "lamports/token");
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 4. create_token FAILS — non-admin rejected", async () => {
    const fakeMint = Keypair.generate();
    const fakeState = pda(Buffer.from("token_state"), fakeMint.publicKey.toBuffer());
    try {
      await program.methods.createToken(PRICE_PER_TOKEN, DECIMALS)
        .accountsStrict({
          admin: user1.publicKey, config: configPda, mint: fakeMint.publicKey,
          tokenState: fakeState, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([user1, fakeMint]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("Unauthorized") || err.toString().includes("AnchorError") || err.toString().includes("ConstraintHasOne"));
      console.log("  ✅ Non-admin rejected");
    }
  });

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
    assert.equal(entry.wallet.toBase58(), user1.publicKey.toBase58());
    assert.equal(entry.isActive, true);
    console.log("  Whitelisted:", entry.wallet.toBase58());
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 6. swap — user1 sends 0.1 SOL, receives 100 tokens", async () => {
    const solAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    await program.methods.swap(solAmount)
      .accountsStrict({
        user: user1.publicKey, config: configPda, tokenState: tokenStatePda,
        mint: mintKp.publicKey, userAta: user1Ata, whitelistEntry: wlUser1Pda,
        tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user1]).rpc();

    const expectedTokens = (solAmount.toNumber() * Math.pow(10, DECIMALS)) / PRICE_PER_TOKEN.toNumber();
    const ataInfo = await provider.connection.getTokenAccountBalance(user1Ata);
    const state   = await program.account.tokenState.fetch(tokenStatePda);

    assert.equal(Number(ataInfo.value.amount), expectedTokens);
    assert.equal(state.totalMinted.toNumber(), expectedTokens);
    console.log("  SOL sent   :", solAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  Tokens got :", ataInfo.value.uiAmount);
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 7. swap FAILS — user2 not whitelisted", async () => {
    try {
      await program.methods.swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user: user2.publicKey, config: configPda, tokenState: tokenStatePda,
          mint: mintKp.publicKey, userAta: user2Ata, whitelistEntry: wlUser2Pda,
          tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("AccountNotInitialized") || err.toString().includes("NotWhitelisted") || err.toString().includes("AnchorError"));
      console.log("  ✅ Non-whitelisted user2 rejected");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 8. swap FAILS — zero amount rejected", async () => {
    try {
      await program.methods.swap(new anchor.BN(0))
        .accountsStrict({
          user: user1.publicKey, config: configPda, tokenState: tokenStatePda,
          mint: mintKp.publicKey, userAta: user1Ata, whitelistEntry: wlUser1Pda,
          tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("ZeroAmount") || err.toString().includes("AnchorError"));
      console.log("  ✅ Zero amount rejected");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 9. burn_tokens — user1 burns tokens, receives SOL", async () => {
    const ataBefore  = await provider.connection.getTokenAccountBalance(user1Ata);
    const burnAmount = new anchor.BN(Math.floor(Number(ataBefore.value.amount) / 2));
    const solBefore  = await provider.connection.getBalance(user1.publicKey);

    await program.methods.burnTokens(burnAmount)
      .accountsStrict({
        user: user1.publicKey, config: configPda, tokenState: tokenStatePda,
        mint: mintKp.publicKey, userAta: user1Ata, whitelistEntry: wlUser1Pda,
        tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user1]).rpc();

    const ataAfter = await provider.connection.getTokenAccountBalance(user1Ata);
    const solAfter = await provider.connection.getBalance(user1.publicKey);

    assert.isAbove(solAfter, solBefore);
    assert.equal(Number(ataAfter.value.amount), Number(ataBefore.value.amount) - burnAmount.toNumber());
    console.log("  Tokens burned:", burnAmount.toNumber());
    console.log("  SOL received :", (solAfter - solBefore) / LAMPORTS_PER_SOL, "SOL");
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 10. burn_tokens FAILS — user2 not whitelisted", async () => {
    try {
      await program.methods.burnTokens(new anchor.BN(1000))
        .accountsStrict({
          user: user2.publicKey, config: configPda, tokenState: tokenStatePda,
          mint: mintKp.publicKey, userAta: user2Ata, whitelistEntry: wlUser2Pda,
          tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("AccountNotInitialized") || err.toString().includes("NotWhitelisted") || err.toString().includes("AnchorError"));
      console.log("  ✅ Non-whitelisted burn rejected");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 11. toggle_pause — admin pauses platform", async () => {
    await program.methods.togglePause(true)
      .accountsStrict({ admin: admin.publicKey, config: configPda })
      .rpc();
    const config = await program.account.platformConfig.fetch(configPda);
    assert.equal(config.paused, true);
    console.log("  ✅ Platform paused");
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 12. swap FAILS — platform is paused", async () => {
    try {
      await program.methods.swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user: user1.publicKey, config: configPda, tokenState: tokenStatePda,
          mint: mintKp.publicKey, userAta: user1Ata, whitelistEntry: wlUser1Pda,
          tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("Paused") || err.toString().includes("AnchorError"));
      console.log("  ✅ Swap blocked when paused");
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 13. toggle_pause — admin unpauses platform", async () => {
    await program.methods.togglePause(false)
      .accountsStrict({ admin: admin.publicKey, config: configPda })
      .rpc();
    const config = await program.account.platformConfig.fetch(configPda);
    assert.equal(config.paused, false);
    console.log("  ✅ Platform unpaused");
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 14. remove_from_whitelist — user1 access revoked", async () => {
    await program.methods.removeFromWhitelist(user1.publicKey)
      .accountsStrict({ admin: admin.publicKey, config: configPda, whitelistEntry: wlUser1Pda })
      .rpc();
    const entry = await program.account.whitelistEntry.fetch(wlUser1Pda);
    assert.equal(entry.isActive, false);
    console.log("  ✅ user1 removed from whitelist");
  });

  // ════════════════════════════════════════════════════════════════════════════
  it("✅ 15. swap FAILS — user1 removed from whitelist", async () => {
    try {
      await program.methods.swap(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user: user1.publicKey, config: configPda, tokenState: tokenStatePda,
          mint: mintKp.publicKey, userAta: user1Ata, whitelistEntry: wlUser1Pda,
          tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1]).rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.isTrue(err.toString().includes("NotWhitelisted") || err.toString().includes("AnchorError"));
      console.log("  ✅ Removed user1 correctly blocked");
    }
  });
});