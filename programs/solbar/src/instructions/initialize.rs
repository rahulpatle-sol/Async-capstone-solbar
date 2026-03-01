use anchor_lang::prelude::*;
use crate::{
    constants::{SEED_PLATFORM, MAX_FEE_BASIS_POINTS},
    errors::SolbarError,
    state::PlatformConfig,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: initialize
//  Ek baar platform bootstrap karo
//  Caller: Deployer / Super Admin
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Hum sirf treasury pubkey store kar rahe hain
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init,
        payer  = authority,
        space  = PlatformConfig::LEN,
        seeds  = [SEED_PLATFORM],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    fee_basis_points: u16,
) -> Result<()> {
    require!(fee_basis_points <= MAX_FEE_BASIS_POINTS, SolbarError::InvalidFee);

    let clock = Clock::get()?;
    let cfg   = &mut ctx.accounts.platform_config;

    cfg.authority         = ctx.accounts.authority.key();
    cfg.treasury          = ctx.accounts.treasury.key();
    cfg.fee_basis_points  = fee_basis_points;
    cfg.paused            = false;
    cfg.total_assets      = 0;
    cfg.total_whitelisted = 0;
    cfg.created_at        = clock.unix_timestamp;
    cfg.bump              = ctx.bumps.platform_config;

    msg!(
        "[Solbar] ✅ Platform initialized | Authority: {} | Treasury: {} | Fee: {}bps",
        cfg.authority, cfg.treasury, fee_basis_points
    );
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: update_platform
//  Fee / treasury / pause update karo
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
pub struct UpdatePlatform<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: storing pubkey only
    pub new_treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}

pub fn update_platform_handler(
    ctx: Context<UpdatePlatform>,
    new_fee_basis_points: u16,
    paused: bool,
) -> Result<()> {
    require!(new_fee_basis_points <= MAX_FEE_BASIS_POINTS, SolbarError::InvalidFee);

    let cfg              = &mut ctx.accounts.platform_config;
    cfg.fee_basis_points = new_fee_basis_points;
    cfg.treasury         = ctx.accounts.new_treasury.key();
    cfg.paused           = paused;

    msg!("[Solbar] 🔄 Platform updated | Fee: {}bps | Paused: {}", new_fee_basis_points, paused);
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: transfer_authority
//  Authority change karo (wallet → multisig)
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: new authority ka pubkey
    pub new_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let old = ctx.accounts.platform_config.authority;
    ctx.accounts.platform_config.authority = ctx.accounts.new_authority.key();

    msg!("[Solbar] 🔑 Authority transferred: {} → {}", old, ctx.accounts.new_authority.key());
    Ok(())
}