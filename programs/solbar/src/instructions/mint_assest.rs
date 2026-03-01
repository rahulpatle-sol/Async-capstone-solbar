use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{mint_to, Mint, MintTo, TokenAccount},
};
use crate::{
    constants::{SEED_PLATFORM, SEED_ASSET_REGISTRY, SEED_WHITELIST_ENTRY, PRICE_STALENESS_SECS},
    errors::SolbarError,
    state::{AssetRegistry, PlatformConfig, WhitelistEntry},
};

#[derive(Accounts)]
#[instruction(ticker: [u8; 12])]
pub struct MintAsset<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds   = [SEED_ASSET_REGISTRY, &ticker],
        bump    = asset_registry.bump,
        has_one = mint @ SolbarError::MintMismatch,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: validated via whitelist_entry PDA below
    pub recipient: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer                           = authority,
        associated_token::mint          = mint,
        associated_token::authority     = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [SEED_WHITELIST_ENTRY, recipient.key().as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub token_program:            Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn mint_asset_handler(
    ctx: Context<MintAsset>,
    ticker: [u8; 12],
    amount: u64,
    backing_units: u64,
) -> Result<()> {
    let clock = Clock::get()?;

    // 1. Platform pause check
    require!(!ctx.accounts.platform_config.paused, SolbarError::PlatformPaused);

    // 2. Asset checks
    {
        let registry = &ctx.accounts.asset_registry;
        require!(registry.is_active, SolbarError::AssetInactive);
        if registry.last_price_updated > 0 {
            let age = clock.unix_timestamp.saturating_sub(registry.last_price_updated);
            require!(age <= PRICE_STALENESS_SECS * 60, SolbarError::StalePrice);
        }
    }

    // 3. Whitelist checks
    {
        let entry = &ctx.accounts.whitelist_entry;
        require!(entry.is_active, SolbarError::WhitelistInactive);
        require!(entry.expiry > clock.unix_timestamp, SolbarError::KycExpired);
        require!(
            entry.has_asset_approved(&ctx.accounts.mint.key()),
            SolbarError::AssetNotApproved
        );
    }

    // 4. Minimum investment check
    {
        let registry  = &ctx.accounts.asset_registry;
        let decimals  = ctx.accounts.mint.decimals;
        let price_f64 = registry.actual_price();
        if price_f64 > 0.0 {
            let amount_real = (amount as f64) / 10_f64.powi(decimals as i32);
            let usd_cents   = (amount_real * price_f64 * 100.0) as u64;
            require!(usd_cents >= registry.min_investment_usd_cents, SolbarError::BelowMinimumInvestment);
        }
    }

    // 5. Token-2022 mint_to CPI
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint:      ctx.accounts.mint.to_account_info(),
            to:        ctx.accounts.recipient_ata.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        },
    );
    mint_to(cpi_ctx, amount)?;

    // 6. Update registry
    let registry = &mut ctx.accounts.asset_registry;
    registry.total_supply = registry.total_supply
        .checked_add(amount).ok_or(SolbarError::MathOverflow)?;
    registry.backing_amount = registry.backing_amount
        .checked_add(backing_units).ok_or(SolbarError::BackingOverflow)?;

    let ticker_str = std::str::from_utf8(
        &ticker[..ticker.iter().position(|&b| b == 0).unwrap_or(12)]
    ).unwrap_or("??");
    msg!(
        "[Solbar] ✅ Minted {} units of {} to {} | Supply={} Backing={}",
        amount, ticker_str,
        ctx.accounts.recipient.key(),
        registry.total_supply, registry.backing_amount
    );
    Ok(())
}