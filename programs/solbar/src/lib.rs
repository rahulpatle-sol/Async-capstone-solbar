use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

// Direct path imports — no glob (*) — fixes #[program] macro conflict
use instructions::initialize::{Initialize, TogglePause};
use instructions::create_token::CreateToken;
use instructions::whitelist::{AddToWhitelist, RemoveFromWhitelist};
use instructions::swap::Swap;


declare_id!("7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg");

#[program]
pub mod solbar {
    use super::*;

    // 1. Initialize platform — creates PlatformConfig PDA
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::initialize_handler(ctx)
    }

    // Admin: pause or unpause all platform operations
    pub fn toggle_pause(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
        instructions::initialize::toggle_pause_handler(ctx, paused)
    }

    // 2. Create Token-2022 mint and bind it to a price
    pub fn create_token(
        ctx: Context<CreateToken>,
        price_per_token: u64,
        decimals: u8,
    ) -> Result<()> {
        instructions::create_token::create_token_handler(ctx, price_per_token, decimals)
    }

    // 3. Whitelist a wallet — KYC approval required before any swap
    pub fn add_to_whitelist(ctx: Context<AddToWhitelist>, wallet: Pubkey) -> Result<()> {
        instructions::whitelist::add_handler(ctx, wallet)
    }

    // Admin: revoke wallet access — AML / compliance
    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>, wallet: Pubkey) -> Result<()> {
        instructions::whitelist::remove_handler(ctx, wallet)
    }

    // 4. Swap SOL for tokens — price auto-calculated from TokenState
    pub fn swap(ctx: Context<Swap>, sol_amount: u64) -> Result<()> {
        instructions::swap::swap_handler(ctx, sol_amount)
    }

    // 5. Burn tokens to get SOL back — reverse swap at same price
    pub fn burn_tokens(ctx: Context<BurnTokens>, token_amount: u64) -> Result<()> {
        instructions::burn_tokens::burn_tokens_handler(ctx, token_amount)
    }
}