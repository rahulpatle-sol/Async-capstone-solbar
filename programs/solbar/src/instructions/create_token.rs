use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::Mint,
};
use crate::{
    constants::{SEED_CONFIG, SEED_TOKEN, MAX_DECIMALS},
    errors::SolbarError,
    state::{PlatformConfig, TokenState},
};


//  Example: 1_000_000 lamports = 0.001 SOL per token
//
//  Caller: Admin
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds   = [SEED_CONFIG],
        bump    = config.bump,
        has_one = admin @ SolbarError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,

    /// Token-2022 mint — Anchor initializes this
    /// mint::authority = token_state PDA (so it can mint during swap)
    #[account(
        init,
        payer                  = admin,
        mint::decimals         = decimals,
        mint::authority        = token_state,
        mint::freeze_authority = admin,
        mint::token_program    = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// TokenState PDA — also acts as mint authority
    #[account(
        init,
        payer  = admin,
        space  = 8 + TokenState::INIT_SPACE,
        seeds  = [SEED_TOKEN, mint.key().as_ref()],
        bump,
    )]
    pub token_state: Account<'info, TokenState>,

    pub token_program:  Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateToken>,
    price_per_token: u64,
    decimals: u8,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    require!(price_per_token > 0, SolbarError::InvalidPrice);
    require!(decimals <= MAX_DECIMALS, SolbarError::InvalidDecimals);

    let state             = &mut ctx.accounts.token_state;
    state.mint            = ctx.accounts.mint.key();
    state.admin           = ctx.accounts.admin.key();
    state.price_per_token = price_per_token;
    state.decimals        = decimals;
    state.total_minted    = 0;
    state.is_active       = true;
    state.bump            = ctx.bumps.token_state;

    emit!(TokenCreated {
        mint:            state.mint,
        price_per_token,
        decimals,
    });

    msg!(
        "[Solbar] ✅ Token created | Mint: {} | Price: {} lamports | Decimals: {}",
        state.mint, price_per_token, decimals
    );
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────
#[event]
pub struct TokenCreated {
    pub mint:            Pubkey,
    pub price_per_token: u64,
    pub decimals:        u8,
}