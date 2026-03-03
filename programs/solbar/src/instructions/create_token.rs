use anchor_lang::prelude::*;
use anchor_spl::{token_2022::Token2022, token_interface::Mint};
use crate::{constants::{SEED_CONFIG, SEED_TOKEN}, errors::SolbarError, state::{PlatformConfig, TokenState}};

#[derive(Accounts)]
#[instruction(price_per_token: u64, decimals: u8)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump, has_one = admin @ SolbarError::Unauthorized)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        init, payer = admin,
        mint::decimals = decimals,
        mint::authority = token_state,
        mint::freeze_authority = admin,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = admin,
        space = 8 + TokenState::INIT_SPACE,
        seeds = [SEED_TOKEN, mint.key().as_ref()], bump,
    )]
    pub token_state: Account<'info, TokenState>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn create_token_handler(ctx: Context<CreateToken>, price_per_token: u64, decimals: u8) -> Result<()> {
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    require!(price_per_token > 0, SolbarError::InvalidPrice);
    require!(decimals <= 9, SolbarError::InvalidDecimals);
    let state             = &mut ctx.accounts.token_state;
    state.mint            = ctx.accounts.mint.key();
    state.admin           = ctx.accounts.admin.key();
    state.price_per_token = price_per_token;
    state.decimals        = decimals;
    state.total_minted    = 0;
    state.is_active       = true;
    state.bump            = ctx.bumps.token_state;
    msg!("[Solbar] Token created. Mint:{} Price:{} Decimals:{}", state.mint, price_per_token, decimals);
    Ok(())
}