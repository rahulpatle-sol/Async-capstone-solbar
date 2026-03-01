use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg");

// ═══════════════════════════════════════════════════════════════════════════════
//
//   ███████╗ ██████╗ ██╗     ██████╗  █████╗ ██████╗ ██████╗
//   ██╔════╝██╔═══██╗██║     ██╔══██╗██╔══██╗██╔══██╗╚════██╗
//   ███████╗██║   ██║██║     ██████╔╝███████║██████╔╝  ▄███╔╝
//   ╚════██║██║   ██║██║     ██╔══██╗██╔══██║██╔══██╗  ▀▀══╝
//   ███████║╚██████╔╝███████╗██████╔╝██║  ██║██║  ██║  ██╗
//   ╚══════╝ ╚═════╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═╝
//
//  RWA Gold Tokenization on Solana
//  Program: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
//
//  5 Instructions:
//    1. initialize        → Platform setup
//    2. create_token      → Token-2022 mint + price bind
//    3. add_to_whitelist  → KYC approve wallet
//    4. swap              → SOL → Tokens
//    5. burn_tokens       → Tokens → SOL
//
//  + remove_from_whitelist (admin)
//  + toggle_pause          (admin)
//
// ═══════════════════════════════════════════════════════════════════════════════

#[program]
pub mod solbar {
    use super::*;

    // ── 1. Initialize ─────────────────────────────────────────────────────────
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    // ── Admin: Toggle Pause ───────────────────────────────────────────────────
    pub fn toggle_pause(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
        instructions::initialize::toggle_pause_handler(ctx, paused)
    }

    // ── 2. Create Token ───────────────────────────────────────────────────────
    pub fn create_token(
        ctx: Context<CreateToken>,
        price_per_token: u64,
        decimals: u8,
    ) -> Result<()> {
        instructions::create_token::handler(ctx, price_per_token, decimals)
    }

    // ── 3. Add to Whitelist ───────────────────────────────────────────────────
    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        wallet: Pubkey,
    ) -> Result<()> {
        instructions::whitelist::add_handler(ctx, wallet)
    }

    // ── Admin: Remove from Whitelist ──────────────────────────────────────────
    pub fn remove_from_whitelist(
        ctx: Context<RemoveFromWhitelist>,
        wallet: Pubkey,
    ) -> Result<()> {
        instructions::whitelist::remove_handler(ctx, wallet)
    }

    // ── 4. Swap (SOL → Token) ─────────────────────────────────────────────────
    pub fn swap(ctx: Context<Swap>, sol_amount: u64) -> Result<()> {
        instructions::swap::handler(ctx, sol_amount)
    }

    // ── 5. Burn Tokens (Token → SOL) ──────────────────────────────────────────
    pub fn burn_tokens(ctx: Context<BurnTokens>, token_amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, token_amount)
    }
}