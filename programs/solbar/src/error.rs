use anchor_lang::prelude::*;

#[error_code]
pub enum SolbarError {
    // Platform
    #[msg("Platform is currently paused")]
    PlatformPaused,
    #[msg("Unauthorized — caller is not the platform authority")]
    Unauthorized,
    #[msg("Invalid fee — basis points must be <= 1000")]
    InvalidFee,
    #[msg("Arithmetic overflow or underflow")]
    MathOverflow,

    // Asset
    #[msg("Asset is currently inactive")]
    AssetInactive,
    #[msg("Invalid ticker — must be 1 to 12 ASCII characters")]
    InvalidTicker,
    #[msg("Mint mismatch — provided mint does not match asset registry")]
    MintMismatch,
    #[msg("Backing amount overflow")]
    BackingOverflow,
    #[msg("Insufficient supply — cannot burn more than total supply")]
    InsufficientSupply,

    // Whitelist / KYC
    #[msg("Wallet is not whitelisted")]
    NotWhitelisted,
    #[msg("Whitelist entry is inactive")]
    WhitelistInactive,
    #[msg("KYC has expired")]
    KycExpired,
    #[msg("Asset not approved for this wallet")]
    AssetNotApproved,
    #[msg("Wallet is already whitelisted")]
    AlreadyWhitelisted,
    #[msg("Maximum asset approvals reached (max 32)")]
    TooManyApprovedAssets,

    // Price / Oracle
    #[msg("Invalid price feed ID")]
    InvalidPriceFeed,
    #[msg("Price is stale — older than 60 seconds")]
    StalePrice,
    #[msg("Price confidence too low — uncertainty exceeds 2%")]
    LowPriceConfidence,

    // Transfer Hook
    #[msg("Transfer blocked — sender is not whitelisted or KYC expired")]
    HookSenderNotWhitelisted,
    #[msg("Transfer blocked — receiver is not whitelisted or KYC expired")]
    HookReceiverNotWhitelisted,
    #[msg("Transfer blocked — platform is paused")]
    HookPlatformPaused,
    #[msg("Transfer blocked — asset is inactive")]
    HookAssetInactive,

    // Redemption
    #[msg("Redemption amount must be greater than zero")]
    ZeroRedemptionAmount,
    #[msg("Redemption amount below minimum")]
    BelowMinimumRedemption,
    #[msg("Redemption already confirmed")]
    AlreadyFulfilled,
    #[msg("Investment amount below minimum $100")]
    BelowMinimumInvestment,
}