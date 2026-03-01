use anchor_lang::prelude::*;
use crate::{
    constants::{
        SEED_PLATFORM, SEED_ASSET_REGISTRY,
        SEED_WHITELIST_ENTRY, MAX_APPROVED_ASSETS,
    },
    errors::SolbarError,
    state::{AssetRegistry, KycLevel, PlatformConfig, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: add_to_whitelist
//
//  Ek wallet ko KYC-approve karo platform pe.
//  Bina WhitelistEntry PDA ke koi bhi token receive/send NAHI kar sakta —
//  transfer hook automatically reject karega.
//
//  Caller: Platform Authority
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    // WhitelistEntry PDA — seeds = ["whitelist", wallet_pubkey]
    // Har wallet ke liye ek unique PDA
    #[account(
        init,
        payer  = authority,
        space  = WhitelistEntry::LEN,
        seeds  = [SEED_WHITELIST_ENTRY, wallet.as_ref()],
        bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_whitelist_handler(
    ctx: Context<AddToWhitelist>,
    wallet: Pubkey,
    kyc_level: KycLevel,
    kyc_expiry: i64,        // Unix timestamp — ye date ke baad KYC expire hogi
    country_code: [u8; 2],  // ISO 3166-1 alpha-2 e.g. b"IN" for India
) -> Result<()> {
    let clock = Clock::get()?;

    // KYC expiry future mein honi chahiye
    require!(kyc_expiry > clock.unix_timestamp, SolbarError::KycExpired);

    let entry      = &mut ctx.accounts.whitelist_entry;
    entry.wallet        = wallet;
    entry.kyc_level     = kyc_level.clone();
    entry.approved_assets = Vec::new(); // assets alag se approve honge
    entry.approved_by   = ctx.accounts.authority.key();
    entry.approved_at   = clock.unix_timestamp;
    entry.expiry        = kyc_expiry;
    entry.is_active     = true;
    entry.country_code  = country_code;
    entry.bump          = ctx.bumps.whitelist_entry;

    // Platform counter increment karo
    let cfg            = &mut ctx.accounts.platform_config;
    cfg.total_whitelisted = cfg.total_whitelisted
        .checked_add(1)
        .ok_or(SolbarError::MathOverflow)?;

    let country = std::str::from_utf8(&country_code).unwrap_or("??");
    msg!(
        "[Solbar] ✅ Wallet whitelisted!\n  Wallet  : {}\n  Level   : {:?}\n  Expiry  : {}\n  Country : {}",
        wallet, kyc_level, kyc_expiry, country
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: approve_asset_for_wallet
//
//  Ek specific asset mint ko wallet ke liye approve karo.
//  Fine-grained control:
//    - Wallet globally KYC'd ho sakta hai
//    - Lekin sirf approved assets hold kar sakta hai
//
//  Caller: Platform Authority
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(wallet: Pubkey, ticker: [u8; 12])]
pub struct ApproveAssetForWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    // Konsa asset approve karna hai
    #[account(
        seeds = [SEED_ASSET_REGISTRY, &ticker],
        bump  = asset_registry.bump,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        mut,
        seeds = [SEED_WHITELIST_ENTRY, wallet.as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn approve_asset_handler(
    ctx: Context<ApproveAssetForWallet>,
    wallet: Pubkey,
    _ticker: [u8; 12],
) -> Result<()> {
    let entry = &mut ctx.accounts.whitelist_entry;
    let mint  = ctx.accounts.asset_registry.mint;

    require!(entry.wallet == wallet, SolbarError::Unauthorized);
    require!(
        entry.approved_assets.len() < MAX_APPROVED_ASSETS,
        SolbarError::TooManyApprovedAssets
    );

    if !entry.approved_assets.contains(&mint) {
        entry.approved_assets.push(mint);
        msg!("[Solbar] ✅ Asset approved | Mint: {} → Wallet: {}", mint, wallet);
    } else {
        msg!("[Solbar] ℹ️  Already approved | Mint: {} → Wallet: {}", mint, wallet);
    }

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: revoke_asset_for_wallet
//  Wallet se ek specific asset ki approval hata do (compliance action)
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(wallet: Pubkey, ticker: [u8; 12])]
pub struct RevokeAssetForWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        seeds = [SEED_ASSET_REGISTRY, &ticker],
        bump  = asset_registry.bump,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        mut,
        seeds = [SEED_WHITELIST_ENTRY, wallet.as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn revoke_asset_handler(
    ctx: Context<RevokeAssetForWallet>,
    wallet: Pubkey,
    _ticker: [u8; 12],
) -> Result<()> {
    let entry = &mut ctx.accounts.whitelist_entry;
    let mint  = ctx.accounts.asset_registry.mint;
    require!(entry.wallet == wallet, SolbarError::Unauthorized);

    entry.approved_assets.retain(|&m| m != mint);

    msg!("[Solbar] 🚫 Asset revoked | Mint: {} from Wallet: {}", mint, wallet);
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: deactivate_whitelist
//  Wallet ko deactivate karo (AML/suspicious activity)
//  PDA delete nahi hoti — audit trail preserved rahta hai
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct DeactivateWhitelist<'info> {
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
        seeds = [SEED_WHITELIST_ENTRY, wallet.as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn deactivate_handler(
    ctx: Context<DeactivateWhitelist>,
    wallet: Pubkey,
) -> Result<()> {
    require!(ctx.accounts.whitelist_entry.wallet == wallet, SolbarError::Unauthorized);

    ctx.accounts.whitelist_entry.is_active = false;

    msg!("[Solbar] 🔒 Wallet deactivated: {}", wallet);
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: renew_kyc
//  KYC expiry extend karo (jab user re-verify kare)
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RenewKyc<'info> {
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
        seeds = [SEED_WHITELIST_ENTRY, wallet.as_ref()],
        bump  = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn renew_kyc_handler(
    ctx: Context<RenewKyc>,
    wallet: Pubkey,
    new_expiry: i64,
    new_kyc_level: KycLevel,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(new_expiry > clock.unix_timestamp, SolbarError::KycExpired);
    require!(ctx.accounts.whitelist_entry.wallet == wallet, SolbarError::Unauthorized);

    let entry       = &mut ctx.accounts.whitelist_entry;
    entry.expiry     = new_expiry;
    entry.kyc_level  = new_kyc_level.clone();
    entry.is_active  = true;
    entry.approved_by = ctx.accounts.authority.key();
    entry.approved_at = clock.unix_timestamp;

    msg!(
        "[Solbar] 🔄 KYC renewed | Wallet: {} | Level: {:?} | Expiry: {}",
        wallet, new_kyc_level, new_expiry
    );
    Ok(())
}