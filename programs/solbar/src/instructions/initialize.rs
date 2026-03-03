use anchor_lang::prelude::*;
use crate::{constants::SEED_CONFIG, errors::SolbarError, state::PlatformConfig};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, payer = admin,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [SEED_CONFIG], bump,
    )]
    pub config: Account<'info, PlatformConfig>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let cfg    = &mut ctx.accounts.config;
    cfg.admin  = ctx.accounts.admin.key();
    cfg.paused = false;
    cfg.bump   = ctx.bumps.config;
    msg!("[Solbar] Platform initialized. Admin: {}", cfg.admin);
    Ok(())
}

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut, seeds = [SEED_CONFIG], bump = config.bump,
        has_one = admin @ SolbarError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,
}

pub fn toggle_pause_handler(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    msg!("[Solbar] Platform paused: {}", paused);
    Ok(())
}