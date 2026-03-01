use anchor_lang::prelude::*;
pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;
pub mod hooks;

use instructions::*;
use hooks::transfer_hook::{TransferHookExecute, InitializeExtraAccountMetas};
use state::{AssetType, KycLevel};

declare_id!("DJ93cETS4yvu8e4SnySFkAwknXzLFJwYNd46EcH7WsUg");

#[program]
pub mod solbar {
    use super::*;

    // ── Platform ──────────────────────────────────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>, fee_basis_points: u16) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, fee_basis_points)
    }

    pub fn update_platform(ctx: Context<UpdatePlatform>, new_fee_basis_points: u16, paused: bool) -> Result<()> {
        instructions::initialize::update_platform_handler(ctx, new_fee_basis_points, paused)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::initialize::transfer_authority_handler(ctx)
    }

    // ── Assets ────────────────────────────────────────────────────────────────

    pub fn create_asset(
        ctx: Context<CreateAsset>,
        ticker: [u8; 12],
        asset_type: AssetType,
        price_feed_id: [u8; 64],
        min_investment_usd_cents: u64,
        asset_name: String,
        asset_symbol: String,
    ) -> Result<()> {
        instructions::create_asset::create_asset_handler(
            ctx, ticker, asset_type, price_feed_id,
            min_investment_usd_cents, asset_name, asset_symbol,
        )
    }

    pub fn toggle_asset(ctx: Context<ToggleAsset>, ticker: [u8; 12], active: bool) -> Result<()> {
        instructions::create_asset::toggle_asset_handler(ctx, ticker, active)
    }

    // ── Whitelist / KYC ───────────────────────────────────────────────────────

    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        wallet: Pubkey,
        kyc_level: KycLevel,
        kyc_expiry: i64,
        country_code: [u8; 2],
    ) -> Result<()> {
        instructions::whitelist::add_whitelist_handler(ctx, wallet, kyc_level, kyc_expiry, country_code)
    }

    pub fn approve_asset_for_wallet(ctx: Context<ApproveAssetForWallet>, wallet: Pubkey, ticker: [u8; 12]) -> Result<()> {
        instructions::whitelist::approve_asset_handler(ctx, wallet, ticker)
    }

    pub fn revoke_asset_for_wallet(ctx: Context<RevokeAssetForWallet>, wallet: Pubkey, ticker: [u8; 12]) -> Result<()> {
        instructions::whitelist::revoke_asset_handler(ctx, wallet, ticker)
    }

    pub fn deactivate_whitelist(ctx: Context<DeactivateWhitelist>, wallet: Pubkey) -> Result<()> {
        instructions::whitelist::deactivate_handler(ctx, wallet)
    }

    pub fn renew_kyc(ctx: Context<RenewKyc>, wallet: Pubkey, new_expiry: i64, new_kyc_level: KycLevel) -> Result<()> {
        instructions::whitelist::renew_kyc_handler(ctx, wallet, new_expiry, new_kyc_level)
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    pub fn mint_asset(ctx: Context<MintAsset>, ticker: [u8; 12], amount: u64, backing_units: u64) -> Result<()> {
        instructions::mint_asset::mint_asset_handler(ctx, ticker, amount, backing_units)
    }

    // ── Price Oracle ──────────────────────────────────────────────────────────

    pub fn update_price(
        ctx: Context<UpdatePrice>,
        ticker: [u8; 12],
        raw_price: i64,
        price_expo: i32,
        confidence: u64,
        publish_time: i64,
    ) -> Result<()> {
        instructions::update_price::update_price_handler(ctx, ticker, raw_price, price_expo, confidence, publish_time)
    }

    pub fn update_price_batch(
        ctx: Context<UpdatePriceBatch>,
        raw_prices: Vec<i64>,
        price_expos: Vec<i32>,
        confidences: Vec<u64>,
        publish_times: Vec<i64>,
    ) -> Result<()> {
        instructions::update_price::update_price_batch_handler(ctx, raw_prices, price_expos, confidences, publish_times)
    }

    // ── Redemption ────────────────────────────────────────────────────────────

    pub fn burn_and_redeem(ctx: Context<BurnAndRedeem>, ticker: [u8; 12], amount: u64, nonce: u64) -> Result<()> {
        instructions::burn_redeem::burn_and_redeem_handler(ctx, ticker, amount, nonce)
    }

    pub fn confirm_redemption(
        ctx: Context<ConfirmRedemption>,
        ticker: [u8; 12],
        nonce: u64,
        fulfillment_note: [u8; 64],
        backing_units_released: u64,
    ) -> Result<()> {
        instructions::burn_redeem::confirm_redemption_handler(ctx, ticker, nonce, fulfillment_note, backing_units_released)
    }

    pub fn emergency_burn(ctx: Context<EmergencyBurn>, ticker: [u8; 12], amount: u64) -> Result<()> {
        instructions::burn_redeem::emergency_burn_handler(ctx, ticker, amount)
    }

    // ── Transfer Hook ─────────────────────────────────────────────────────────

    /// MUST be named `execute` — Token-2022 interface requirement
    pub fn execute(ctx: Context<TransferHookExecute>, amount: u64) -> Result<()> {
        hooks::transfer_hook::execute_hook(ctx, amount)
    }

    pub fn initialize_extra_account_metas(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
        hooks::transfer_hook::init_extra_metas_handler(ctx)
    }
}