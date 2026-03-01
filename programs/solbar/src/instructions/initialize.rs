use anchor_lang::prelude::*;
use crate::{
    constants::SEED_CONFIG,
    errors::SolbarError,
    state::PlatformConfig,
};



#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Admin wallet — pays for PDA + becomes platform authority
    #[account(mut)]
    pub admin: Signer<'info>,

    /// PlatformConfig singleton PDA
    #[account(
        init,
        payer  = admin,
        space  = 8 + PlatformConfig::INIT_SPACE,
        seeds  = [SEED_CONFIG],
        bump,
    )]
    pub config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let config    = &mut ctx.accounts.config;
    config.admin  = ctx.accounts.admin.key();
    config.paused = false;
    config.bump   = ctx.bumps.config;

    emit!(PlatformInitialized {
        admin:     config.admin,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "[Solbar] ✅ Platform initialized | Admin: {}",
        config.admin
    );
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────
#[event]
pub struct PlatformInitialized {
    pub admin:     Pubkey,
    pub timestamp: i64,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: toggle_pause
//  Admin platform pause/unpause kar sakta hai
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds   = [SEED_CONFIG],
        bump    = config.bump,
        has_one = admin @ SolbarError::Unauthorized,
    )]
    pub config: Account<'info, PlatformConfig>,
}

pub fn toggle_pause_handler(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    msg!("[Solbar] Platform paused: {}", paused);
    Ok(())
}