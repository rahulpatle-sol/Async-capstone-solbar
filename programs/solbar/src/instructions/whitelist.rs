use anchor_lang::prelude::*;
use crate::{constants::{SEED_CONFIG, SEED_WHITELIST}, errors::SolbarError, state::{PlatformConfig, WhitelistEntry}};

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump, has_one = admin @ SolbarError::Unauthorized)]
    pub config: Account<'info, PlatformConfig>,
    #[account(
        init, payer = admin,
        space = 8 + WhitelistEntry::INIT_SPACE,
        seeds = [SEED_WHITELIST, wallet.as_ref()], bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
    pub system_program: Program<'info, System>,
}

pub fn add_handler(ctx: Context<AddToWhitelist>, wallet: Pubkey) -> Result<()> {
    require!(!ctx.accounts.config.paused, SolbarError::Paused);
    let e      = &mut ctx.accounts.whitelist_entry;
    e.wallet   = wallet;
    e.is_active = true;
    e.added_at = Clock::get()?.unix_timestamp;
    e.bump     = ctx.bumps.whitelist_entry;
    msg!("[Solbar] Whitelisted: {}", wallet);
    Ok(())
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RemoveFromWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump, has_one = admin @ SolbarError::Unauthorized)]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut, seeds = [SEED_WHITELIST, wallet.as_ref()], bump = whitelist_entry.bump)]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn remove_handler(ctx: Context<RemoveFromWhitelist>, wallet: Pubkey) -> Result<()> {
    ctx.accounts.whitelist_entry.is_active = false;
    msg!("[Solbar] Removed: {}", wallet);
    Ok(())
}