use anchor_lang::prelude::*;
use crate::{
    constants::{SEED_CONFIG, SEED_WHITELIST},
    errors::SolbarError,
    state::{PlatformConfig, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: add_to_whitelist
//
//  KYC-approve a wallet.
//  Bina WhitelistEntry PDA ke wallet koi bhi token buy/sell NAHI kar sakta.
//  PDA exist nahi karti → Anchor automatically transaction reject karta hai.
//
//  Caller: Admin
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds   = [SEED_CONFIG],
        bump    = config.bump,
        has_one = admin @ SolbarError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,

    /// WhitelistEntry PDA for this wallet
    #[account(
        init,
        payer  = admin,
        space  = 8 + WhitelistEntry::INIT_SPACE,
        seeds  = [SEED_WHITELIST, wallet.as_ref()],
        bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_handler(
    ctx: Context<AddToWhitelist>,
    wallet: Pubkey,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, SolbarError::Paused);

    let entry      = &mut ctx.accounts.whitelist_entry;
    entry.wallet   = wallet;
    entry.is_active = true;
    entry.added_at = Clock::get()?.unix_timestamp;
    entry.bump     = ctx.bumps.whitelist_entry;

    emit!(WalletWhitelisted {
        wallet,
        added_at: entry.added_at,
    });

    msg!("[Solbar] ✅ Whitelisted: {}", wallet);
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: remove_from_whitelist
//
//  Wallet ki access revoke karo (AML / compliance action).
//  PDA delete nahi hoti — audit trail preserve rehta hai.
//  is_active = false → swap aur burn fail ho jaayenge.
//
//  Caller: Admin
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RemoveFromWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds   = [SEED_CONFIG],
        bump    = config.bump,
        has_one = admin @ SolbarError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [SEED_WHITELIST, wallet.as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn remove_handler(
    ctx: Context<RemoveFromWhitelist>,
    wallet: Pubkey,
) -> Result<()> {
    ctx.accounts.whitelist_entry.is_active = false;

    msg!("[Solbar] 🚫 Removed from whitelist: {}", wallet);
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────
#[event]
pub struct WalletWhitelisted {
    pub wallet:   Pubkey,
    pub added_at: i64,
}