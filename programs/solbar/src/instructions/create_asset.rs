use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, system_instruction},
};
use anchor_spl::token_2022::Token2022;
use spl_token_2022::{
    extension::{
        transfer_hook::instruction::initialize as init_transfer_hook_ix,
        transfer_fee::instruction::initialize_transfer_fee_config,
        metadata_pointer::instruction::initialize as init_metadata_pointer_ix,
        ExtensionType,
    },
    instruction::initialize_mint2,
    state::Mint as SplMint,
};
use crate::{
    constants::{
        SEED_PLATFORM, SEED_ASSET_REGISTRY,
        GOLD_DECIMALS, STOCK_DECIMALS, REALESTATE_DECIMALS, MAX_TICKER_LEN,
    },
    errors::SolbarError,
    state::{AssetRegistry, AssetType, PlatformConfig},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: create_asset
//  Token-2022 mint + 3 extensions banata hai:
//    MetadataPointer + TransferHook + TransferFeeConfig
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12])]
pub struct CreateAsset<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        init,
        payer  = authority,
        space  = AssetRegistry::LEN,
        seeds  = [SEED_ASSET_REGISTRY, &ticker],
        bump,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    /// CHECK: manually initialized with Token-2022 extensions below
    #[account(mut)]
    pub mint: Signer<'info>,

    /// CHECK: hook program address stored in mint
    pub hook_program: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

pub fn create_asset_handler(
    ctx: Context<CreateAsset>,
    ticker: [u8; 12],
    asset_type: AssetType,
    price_feed_id: [u8; 64],
    min_investment_usd_cents: u64,
    asset_name: String,
    asset_symbol: String,
) -> Result<()> {
    // Validate ticker
    let ticker_len = ticker.iter().position(|&b| b == 0).unwrap_or(MAX_TICKER_LEN);
    require!(ticker_len > 0, SolbarError::InvalidTicker);
    require!(price_feed_id.iter().any(|&b| b != 0), SolbarError::InvalidPriceFeed);

    let clock     = Clock::get()?;
    let authority = ctx.accounts.authority.key();
    let treasury  = ctx.accounts.platform_config.treasury;
    let fee_bps   = ctx.accounts.platform_config.fee_basis_points;
    let mint_key  = ctx.accounts.mint.key();
    let hook_key  = ctx.accounts.hook_program.key();
    let token_pid = ctx.accounts.token_program.key();

    let decimals = match &asset_type {
        AssetType::Gold       => GOLD_DECIMALS,
        AssetType::Stock      => STOCK_DECIMALS,
        AssetType::RealEstate => REALESTATE_DECIMALS,
    };

    // ── STEP 1: Calculate account size with extensions ────────────────────────
    let extension_types = vec![
        ExtensionType::MetadataPointer,
        ExtensionType::TransferHook,
        ExtensionType::TransferFeeConfig,
    ];
    let mint_len = ExtensionType::try_calculate_account_len::<SplMint>(&extension_types)
        .map_err(|_| error!(SolbarError::MathOverflow))?;
    let lamports = ctx.accounts.rent.minimum_balance(mint_len);

    // ── STEP 2: Create mint account ───────────────────────────────────────────
    invoke(
        &system_instruction::create_account(
            &authority,
            &mint_key,
            lamports,
            mint_len as u64,
            &token_pid,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // ── STEP 3: MetadataPointer ───────────────────────────────────────────────
    invoke(
        &init_metadata_pointer_ix(&token_pid, &mint_key, Some(authority), Some(mint_key))?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── STEP 4: TransferHook ──────────────────────────────────────────────────
    invoke(
        &init_transfer_hook_ix(&token_pid, &mint_key, Some(authority), Some(hook_key))?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── STEP 5: TransferFeeConfig ─────────────────────────────────────────────
    invoke(
        &initialize_transfer_fee_config(
            &token_pid, &mint_key,
            Some(&authority),
            Some(&treasury),
            fee_bps,
            u64::MAX,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
    )?;

    // ── STEP 6: InitializeMint2 ───────────────────────────────────────────────
    invoke(
        &initialize_mint2(&token_pid, &mint_key, &authority, Some(&authority), decimals)?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── STEP 7: Populate AssetRegistry ───────────────────────────────────────
    let registry = &mut ctx.accounts.asset_registry;
    registry.asset_type               = asset_type;
    registry.ticker                   = ticker;
    registry.mint                     = mint_key;
    registry.mint_authority           = authority;
    registry.total_supply             = 0;
    registry.backing_amount           = 0;
    registry.price_feed_id            = price_feed_id;
    registry.last_price               = 0;
    registry.last_price_expo          = 0;
    registry.last_price_updated       = 0;
    registry.is_active                = true;
    registry.min_investment_usd_cents = min_investment_usd_cents;
    registry.created_at               = clock.unix_timestamp;
    registry.bump                     = ctx.bumps.asset_registry;

    let cfg = &mut ctx.accounts.platform_config;
    cfg.total_assets = cfg.total_assets.checked_add(1).ok_or(SolbarError::MathOverflow)?;

    let ticker_str = std::str::from_utf8(&ticker[..ticker_len]).unwrap_or("??");
    msg!(
        "[Solbar] ✅ Asset created | Ticker:{} Mint:{} Decimals:{} Name:{} Symbol:{}",
        ticker_str, mint_key, decimals, asset_name, asset_symbol
    );
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: toggle_asset
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12])]
pub struct ToggleAsset<'info> {
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
        seeds = [SEED_ASSET_REGISTRY, &ticker],
        bump  = asset_registry.bump,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,
}

pub fn toggle_asset_handler(
    ctx: Context<ToggleAsset>,
    _ticker: [u8; 12],
    active: bool,
) -> Result<()> {
    ctx.accounts.asset_registry.is_active = active;
    msg!(
        "[Solbar] {} asset: {}",
        if active { "✅ Activated" } else { "🚫 Deactivated" },
        ctx.accounts.asset_registry.mint
    );
    Ok(())
}