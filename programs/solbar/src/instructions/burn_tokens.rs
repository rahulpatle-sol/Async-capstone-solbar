use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_2022::Token2022, token_interface::{burn, Burn, Mint, TokenAccount}};
use crate::{constants::{SEED_CONFIG, SEED_TOKEN, SEED_WHITELIST}, errors::SolbarError, state::{PlatformConfig, TokenState, WhitelistEntry}};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut, seeds = [SEED_TOKEN, mint.key().as_ref()], bump = token_state.bump, has_one = mint @ SolbarError::MintMismatch)]
    pub token_state: Account<'info, TokenState>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = user, associated_token::token_program = token_program)]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(seeds = [SEED_WHITELIST, user.key().as_ref()], bump = whitelist_entry.bump)]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn burn_tokens_handler(ctx: Context<BurnTokens>, token_amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    require!(ctx.accounts.token_state.is_active, SolbarError::TokenInactive);
    require!(token_amount > 0, SolbarError::ZeroAmount);
    require!(ctx.accounts.whitelist_entry.is_active, SolbarError::NotWhitelisted);

    let price    = ctx.accounts.token_state.price_per_token;
    let decimals = ctx.accounts.token_state.decimals;
    let scale    = 10_u64.pow(decimals as u32);
    let sol_amount = (token_amount as u128)
        .checked_mul(price as u128).ok_or(SolbarError::Overflow)?
        .checked_div(scale as u128).ok_or(SolbarError::Overflow)? as u64;
    require!(sol_amount > 0, SolbarError::ZeroAmount);

    let vault_lamports = ctx.accounts.token_state.to_account_info().lamports();
    require!(vault_lamports >= sol_amount, SolbarError::InsufficientFunds);

    burn(CpiContext::new(ctx.accounts.token_program.to_account_info(),
        Burn {
            mint:      ctx.accounts.mint.to_account_info(),
            from:      ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        }), token_amount)?;

    let vault_info = ctx.accounts.token_state.to_account_info();
    let user_info  = ctx.accounts.user.to_account_info();
    **vault_info.try_borrow_mut_lamports()? -= sol_amount;
    **user_info.try_borrow_mut_lamports()?  += sol_amount;

    ctx.accounts.token_state.total_minted = ctx.accounts.token_state.total_minted
        .checked_sub(token_amount).ok_or(SolbarError::Overflow)?;
    msg!("[Solbar] Burn! Tokens:{} SOL:{} User:{}", token_amount, sol_amount, ctx.accounts.user.key());
    Ok(())
}