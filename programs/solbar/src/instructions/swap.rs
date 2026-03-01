use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{mint_to, Mint, MintTo, TokenAccount},
};
use crate::{
    constants::{SEED_CONFIG, SEED_TOKEN, SEED_WHITELIST},
    errors::SolbarError,
    state::{PlatformConfig, TokenState, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: swap  (SOL → Token)
//
//  User SOL deta hai → Tokens milte hain
//  Price automatically calculate hoti hai TokenState.price_per_token se
//
//  Formula:
//    token_amount = (sol_amount * 10^decimals) / price_per_token
//
//  Example (price = 1_000_000, decimals = 6):
//    0.1 SOL = 100_000_000 lamports
//    tokens  = (100_000_000 * 1_000_000) / 1_000_000 = 100_000_000
//    = 100 full tokens (with 6 decimals)
//
//  WHITELIST ENFORCED: Sirf approved wallets kar sakte hain
//  Caller: Any whitelisted user
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct Swap<'info> {
    /// User who is buying tokens
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump  = config.bump,
    )]
    pub config: Account<'info, PlatformConfig>,

    /// TokenState PDA — also the mint authority
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

    /// User's Associated Token Account (created if not exists)
    #[account(
        init_if_needed,
        payer                           = user,
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

pub fn handler(ctx: Context<Swap>, sol_amount: u64) -> Result<()> {
    // ── Checks ────────────────────────────────────────────────────────────────
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    require!(ctx.accounts.token_state.is_active, SolbarError::TokenInactive);
    require!(sol_amount > 0, SolbarError::ZeroAmount);

    // Whitelist check
    require!(ctx.accounts.whitelist_entry.is_active, SolbarError::NotWhitelisted);

    // ── Calculate tokens ──────────────────────────────────────────────────────
    let price    = ctx.accounts.token_state.price_per_token;
    let decimals = ctx.accounts.token_state.decimals;
    let scale    = 10_u64.pow(decimals as u32);

    // tokens = (sol_amount * scale) / price
    let token_amount = (sol_amount as u128)
        .checked_mul(scale as u128)
        .ok_or(SolbarError::Overflow)?
        .checked_div(price as u128)
        .ok_or(SolbarError::Overflow)? as u64;

    require!(token_amount > 0, SolbarError::ZeroAmount);

    // ── SOL Transfer: user → token_state PDA (vault) ─────────────────────────
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to:   ctx.accounts.token_state.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, sol_amount)?;

    // ── Mint tokens to user ATA ───────────────────────────────────────────────
    // token_state PDA is the mint authority → sign with PDA seeds
    let mint_key = ctx.accounts.token_state.mint;
    let bump     = ctx.accounts.token_state.bump;
    let seeds    = &[SEED_TOKEN, mint_key.as_ref(), &[bump]];
    let signer   = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint:      ctx.accounts.mint.to_account_info(),
            to:        ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.token_state.to_account_info(),
        },
        signer,
    );
    mint_to(cpi_ctx, token_amount)?;

    // ── Update state ──────────────────────────────────────────────────────────
    ctx.accounts.token_state.total_minted = ctx.accounts
        .token_state
        .total_minted
        .checked_add(token_amount)
        .ok_or(SolbarError::Overflow)?;

    emit!(SwapExecuted {
        user: ctx.accounts.user.key(),
        sol_amount,
        token_amount,
    });

    msg!(
        "[Solbar] ✅ Swap | SOL: {} → Tokens: {} | User: {}",
        sol_amount, token_amount, ctx.accounts.user.key()
    );
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────
#[event]
pub struct SwapExecuted {
    pub user:         Pubkey,
    pub sol_amount:   u64,
    pub token_amount: u64,
}