use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{burn, Burn, Mint, TokenAccount},
};
use crate::{
    constants::{SEED_CONFIG, SEED_TOKEN, SEED_WHITELIST},
    errors::SolbarError,
    state::{PlatformConfig, TokenState, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: burn_tokens  (Token → SOL)
//
//  User tokens burn karta hai → SOL wapas milta hai
//  Same price pe reverse swap
//
//  Formula:
//    sol_amount = (token_amount * price_per_token) / 10^decimals
//
//  Example (price = 1_000_000, decimals = 6):
//    Burn 100 tokens = 100_000_000 base units
//    SOL = (100_000_000 * 1_000_000) / 1_000_000 = 100_000_000 lamports = 0.1 SOL
//
//  WHITELIST ENFORCED: Sirf approved wallets kar sakte hain
//  Caller: Any whitelisted token holder
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// User who is redeeming tokens for SOL
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump  = config.bump,
    )]
    pub config: Account<'info, PlatformConfig>,

    /// TokenState PDA — holds SOL vault
    #[account(
        mut,
        seeds   = [SEED_TOKEN, mint.key().as_ref()],
        bump    = token_state.bump,
        has_one = mint @ SolbarError::MintMismatch,
    )]
    pub token_state: Account<'info, TokenState>,

    /// Token-2022 mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// User's ATA — tokens burned from here
    #[account(
        mut,
        associated_token::mint          = mint,
        associated_token::authority     = user,
        associated_token::token_program = token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,

    /// Whitelist PDA — MUST exist and be active
    #[account(
        seeds = [SEED_WHITELIST, user.key().as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub token_program:            Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<BurnTokens>, token_amount: u64) -> Result<()> {
    // ── Checks ────────────────────────────────────────────────────────────────
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    require!(ctx.accounts.token_state.is_active, SolbarError::TokenInactive);
    require!(token_amount > 0, SolbarError::ZeroAmount);

    // Whitelist check
    require!(ctx.accounts.whitelist_entry.is_active, SolbarError::NotWhitelisted);

    // ── Calculate SOL to return ───────────────────────────────────────────────
    let price    = ctx.accounts.token_state.price_per_token;
    let decimals = ctx.accounts.token_state.decimals;
    let scale    = 10_u64.pow(decimals as u32);

    // sol = (token_amount * price) / scale
    let sol_amount = (token_amount as u128)
        .checked_mul(price as u128)
        .ok_or(SolbarError::Overflow)?
        .checked_div(scale as u128)
        .ok_or(SolbarError::Overflow)? as u64;

    require!(sol_amount > 0, SolbarError::ZeroAmount);

    // ── Vault has enough SOL? ─────────────────────────────────────────────────
    let vault_lamports = ctx.accounts.token_state.to_account_info().lamports();
    require!(vault_lamports >= sol_amount, SolbarError::InsufficientFunds);

    // ── Burn Token-2022 tokens ────────────────────────────────────────────────
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint:      ctx.accounts.mint.to_account_info(),
            from:      ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    burn(cpi_ctx, token_amount)?;

    // ── SOL Transfer: vault PDA → user ────────────────────────────────────────
    // Direct lamport transfer from PDA (same program owns it)
    **ctx.accounts.token_state
        .to_account_info()
        .try_borrow_mut_lamports()? -= sol_amount;
    **ctx.accounts.user
        .to_account_info()
        .try_borrow_mut_lamports()? += sol_amount;

    // ── Update state ──────────────────────────────────────────────────────────
    ctx.accounts.token_state.total_minted = ctx.accounts
        .token_state
        .total_minted
        .checked_sub(token_amount)
        .ok_or(SolbarError::Overflow)?;

    emit!(BurnExecuted {
        user: ctx.accounts.user.key(),
        token_amount,
        sol_amount,
    });

    msg!(
        "[Solbar] 🔥 Burn | Tokens: {} → SOL: {} | User: {}",
        token_amount, sol_amount, ctx.accounts.user.key()
    );
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────
#[event]
pub struct BurnExecuted {
    pub user:         Pubkey,
    pub token_amount: u64,
    pub sol_amount:   u64,
}