import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg");
export const GOLD_MINT   = new PublicKey("8ZZBLENTGoqawWycGvNWEkYxmXSxqZAwPaVcQgVa1QVV");

// PDA helpers
export const getPDAs = (mintPubkey: PublicKey) => {
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")], PROGRAM_ID
  );
  const [tokenStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_state"), mintPubkey.toBuffer()], PROGRAM_ID
  );
  const getWhitelistPda = (wallet: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), wallet.toBuffer()], PROGRAM_ID
    );
    return pda;
  };
  return { configPda, tokenStatePda, getWhitelistPda };
};

// Fetch token balance
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey
): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(wallet, mint, false, TOKEN_2022_PROGRAM_ID);
    const info = await connection.getTokenAccountBalance(ata);
    return info.value.uiAmount || 0;
  } catch { return 0; }
}

// Fetch SOL balance
export async function getSolBalance(
  connection: Connection,
  wallet: PublicKey
): Promise<number> {
  const lamports = await connection.getBalance(wallet);
  return lamports / LAMPORTS_PER_SOL;
}

// Fetch token state — use (program.account as any) to bypass IDL typing
export async function getTokenState(program: Program, mint: PublicKey) {
  try {
    const { tokenStatePda } = getPDAs(mint);
    return await (program.account as any).tokenState.fetch(tokenStatePda);
  } catch { return null; }
}

// Check whitelist status — use (program.account as any) to bypass IDL typing
export async function checkWhitelist(program: Program, wallet: PublicKey): Promise<boolean> {
  try {
    const { getWhitelistPda } = getPDAs(GOLD_MINT);
    const entry = await (program.account as any).whitelistEntry.fetch(getWhitelistPda(wallet));
    return entry.isActive as boolean;
  } catch { return false; }
}

export { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync };