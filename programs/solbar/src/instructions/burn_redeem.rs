use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{burn, Burn, Mint, TokenAccount},
};
use crate::{
    constants::{
        SEED_PLATFORM, SEED_ASSET_REGISTRY, SEED_WHITELIST_ENTRY,
        MIN_GOLD_REDEEM, MIN_STOCK_REDEEM, MIN_REALESTATE_REDEEM,
    },
    errors::SolbarError,
    state::{AssetRegistry, AssetType, PlatformConfig, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REDEMPTION REQUEST PDA
//
//  Burn ke baad ye PDA create hota hai — physical delivery receipt ka kaam karta hai.
//  Jab platform physical asset deliver kar de, confirm_redemption call karke close karo.
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
pub struct RedemptionRequest {
    pub requester:        Pubkey,     // Konse wallet ne request kiya
    pub mint:             Pubkey,     // Konse asset ki tokens burn ki
    pub ticker:           [u8; 12],  // Asset ticker
    pub amount_burned:    u64,        // Kitne base units burn hue
    pub usd_value_cents:  u64,        // Estimated USD value (cents mein)
    pub requested_at:     i64,        // Request ka timestamp
    pub fulfilled:        bool,       // Platform ne deliver kiya?
    pub fulfillment_note: [u8; 64],   // Tracking ID / courier note
    pub bump:             u8,
}

impl RedemptionRequest {
    pub const LEN: usize = 8 + 32 + 32 + 12 + 8 + 8 + 8 + 1 + 64 + 1;
    pub const SEED: &'static [u8] = b"redeem_request";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: burn_and_redeem
//
//  User apne tokens burn karta hai physical asset redeem karne ke liye.
//
//  Flow:
//    User tokens burn karta hai
//      → RedemptionRequest PDA create hoti hai (receipt)
//      → Platform off-chain physical asset ship karta hai
//      → Platform confirm_redemption call karta hai
//      → PDA close hoti hai, rent user ko wapas milti hai
//
//  Caller: Whitelisted User (token holder)
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12], nonce: u64)]
pub struct BurnAndRedeem<'info> {
    // -----------------------------------------------------------------
    // User jo apne tokens burn kar raha hai
    // -----------------------------------------------------------------
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        seeds = [SEED_PLATFORM],
        bump  = platform_config.bump,
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

    // -----------------------------------------------------------------
    // User ka ATA — tokens yahan se burn honge
    // -----------------------------------------------------------------
    #[account(
        mut,
        associated_token::mint          = mint,
        associated_token::authority     = requester,
        associated_token::token_program = token_program,
    )]
    pub requester_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [SEED_WHITELIST_ENTRY, requester.key().as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    // -----------------------------------------------------------------
    // Redemption Request PDA — burn ka receipt
    // nonce se unique banate hain (ek user multiple redemptions kar sake)
    // -----------------------------------------------------------------
    #[account(
        init,
        payer  = requester,
        space  = RedemptionRequest::LEN,
        seeds  = [
            RedemptionRequest::SEED,
            requester.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub redemption_request: Account<'info, RedemptionRequest>,

    pub token_program:            Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn burn_and_redeem_handler(
    ctx: Context<BurnAndRedeem>,
    ticker: [u8; 12],
    amount: u64,   // Token base units burn karne hain
    nonce: u64,    // Unique nonce per redemption request
) -> Result<()> {
    let clock = Clock::get()?;

    // ── 1. Platform + asset checks ────────────────────────────────────────
    require!(!ctx.accounts.platform_config.paused, SolbarError::PlatformPaused);
    require!(ctx.accounts.asset_registry.is_active, SolbarError::AssetInactive);
    require!(amount > 0, SolbarError::ZeroRedemptionAmount);

    // ── 2. Minimum redemption check ───────────────────────────────────────
    let min_redeem = match ctx.accounts.asset_registry.asset_type {
        AssetType::Gold       => MIN_GOLD_REDEEM,
        AssetType::Stock      => MIN_STOCK_REDEEM,
        AssetType::RealEstate => MIN_REALESTATE_REDEEM,
    };
    require!(amount >= min_redeem, SolbarError::BelowMinimumRedemption);

    // ── 3. Whitelist + KYC checks ─────────────────────────────────────────
    {
        let entry = &ctx.accounts.whitelist_entry;
        require!(entry.is_active, SolbarError::WhitelistInactive);
        require!(entry.expiry > clock.unix_timestamp, SolbarError::KycExpired);
        require!(
            entry.has_asset_approved(&ctx.accounts.mint.key()),
            SolbarError::AssetNotApproved
        );
    }

    // ── 4. Supply check ───────────────────────────────────────────────────
    require!(
        ctx.accounts.asset_registry.total_supply >= amount,
        SolbarError::InsufficientSupply
    );

    // ── 5. USD value estimate ─────────────────────────────────────────────
    let usd_cents = {
        let registry   = &ctx.accounts.asset_registry;
        let decimals   = ctx.accounts.mint.decimals;
        let price_f64  = registry.actual_price();
        let amount_real = (amount as f64) / 10_f64.powi(decimals as i32);
        (amount_real * price_f64 * 100.0) as u64
    };

    // ── 6. Token-2022 Burn CPI ────────────────────────────────────────────
    // User apne tokens burn kar raha hai (requester = authority)
    let cpi_accounts = Burn {
        mint:      ctx.accounts.mint.to_account_info(),
        from:      ctx.accounts.requester_ata.to_account_info(),
        authority: ctx.accounts.requester.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    burn(cpi_ctx, amount)?;

    // ── 7. Registry update (supply kam karo) ──────────────────────────────
    // NOTE: backing_amount tab reduce hoga jab confirm_redemption call ho
    // Physical delivery pehle, phir backing update
    let registry = &mut ctx.accounts.asset_registry;
    registry.total_supply = registry.total_supply
        .checked_sub(amount)
        .ok_or(SolbarError::MathOverflow)?;

    // ── 8. Redemption Request PDA populate karo ───────────────────────────
    let req             = &mut ctx.accounts.redemption_request;
    req.requester        = ctx.accounts.requester.key();
    req.mint             = ctx.accounts.mint.key();
    req.ticker           = ticker;
    req.amount_burned    = amount;
    req.usd_value_cents  = usd_cents;
    req.requested_at     = clock.unix_timestamp;
    req.fulfilled        = false;
    req.fulfillment_note = [0u8; 64];
    req.bump             = ctx.bumps.redemption_request;

    let ticker_str = std::str::from_utf8(
        &ticker[..ticker.iter().position(|&b| b == 0).unwrap_or(12)]
    ).unwrap_or("??");

    msg!(
        "[Solbar] 🔥 Burn + Redeem request!\n  User    : {}\n  Asset   : {}\n  Amount  : {}\n  USD~    : ${:.2}\n  Nonce   : {}",
        ctx.accounts.requester.key(),
        ticker_str,
        amount,
        usd_cents as f64 / 100.0,
        nonce
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: confirm_redemption
//
//  Platform authority call karta hai AFTER physical delivery.
//  RedemptionRequest PDA close hoti hai, rent requester ko wapas jaati hai.
//
//  Caller: Platform Authority
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12], nonce: u64)]
pub struct ConfirmRedemption<'info> {
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

    /// CHECK: Validated by redemption_request.requester — rent yahan wapas jaayegi
    #[account(mut)]
    pub requester: UncheckedAccount<'info>,

    // PDA close karo, rent requester ko wapas do
    #[account(
        mut,
        seeds = [
            RedemptionRequest::SEED,
            requester.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump  = redemption_request.bump,
        close = requester,
        constraint = !redemption_request.fulfilled @ SolbarError::MathOverflow,
        constraint = redemption_request.requester == requester.key() @ SolbarError::Unauthorized,
    )]
    pub redemption_request: Account<'info, RedemptionRequest>,

    pub system_program: Program<'info, System>,
}

pub fn confirm_redemption_handler(
    ctx: Context<ConfirmRedemption>,
    ticker: [u8; 12],
    _nonce: u64,
    fulfillment_note: [u8; 64],      // e.g. courier tracking ID
    backing_units_released: u64,     // kitna physical backing release hua
) -> Result<()> {
    // ── Backing amount update karo ────────────────────────────────────────
    let registry = &mut ctx.accounts.asset_registry;
    registry.backing_amount = registry.backing_amount
        .saturating_sub(backing_units_released);

    // Log for audit trail (PDA close hone se pehle)
    let req     = &ctx.accounts.redemption_request;
    let amt     = req.amount_burned;
    let usd     = req.usd_value_cents;

    let ticker_str = std::str::from_utf8(
        &ticker[..ticker.iter().position(|&b| b == 0).unwrap_or(12)]
    ).unwrap_or("??");

    let note_str = std::str::from_utf8(
        &fulfillment_note[..fulfillment_note.iter().position(|&b| b == 0).unwrap_or(64)]
    ).unwrap_or("no-note");

    msg!(
        "[Solbar] ✅ Redemption confirmed!\n  Requester : {}\n  Asset     : {}\n  Burned    : {}\n  USD~      : ${:.2}\n  Note      : {}\n  Backing   : {}",
        ctx.accounts.requester.key(),
        ticker_str,
        amt,
        usd as f64 / 100.0,
        note_str,
        registry.backing_amount
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: emergency_burn
//
//  Regulator/compliance requirement: admin kisi bhi frozen account se
//  tokens burn kar sakta hai.
//
//  Caller: Platform Authority only
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12])]
pub struct EmergencyBurn<'info> {
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

    // Target token account jahan se burn karna hai
    #[account(
        mut,
        token::mint         = mint,
        token::token_program = token_program,
    )]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn emergency_burn_handler(
    ctx: Context<EmergencyBurn>,
    _ticker: [u8; 12],
    amount: u64,
) -> Result<()> {
    require!(amount > 0, SolbarError::ZeroRedemptionAmount);
    require!(
        ctx.accounts.asset_registry.total_supply >= amount,
        SolbarError::InsufficientSupply
    );

    // Admin as authority — Token-2022 freeze authority se burn
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint:      ctx.accounts.mint.to_account_info(),
            from:      ctx.accounts.target_ata.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        },
    );
    burn(cpi_ctx, amount)?;

    ctx.accounts.asset_registry.total_supply = ctx.accounts.asset_registry
        .total_supply
        .checked_sub(amount)
        .ok_or(SolbarError::MathOverflow)?;

    msg!(
        "[Solbar] 🚨 Emergency burn! Amount: {} | Account: {}",
        amount,
        ctx.accounts.target_ata.key()
    );

    Ok(())
}