use anchor_lang::prelude::*;

#[error_code]
pub enum SolbarError {
    #[msg("Platform is paused")]
    Paused,

    #[msg("Unauthorized — not the admin")]
    Unauthorized,

    #[msg("Wallet is not whitelisted")]
    NotWhitelisted,

    #[msg("Token is inactive")]
    TokenInactive,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Price must be greater than zero")]
    InvalidPrice,

    #[msg("Decimals must be 0 to 9")]
    InvalidDecimals,

    #[msg("Mint mismatch")]
    MintMismatch,

    #[msg("Insufficient funds in vault")]
    InsufficientFunds,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Below minimum investment of $100")]
    BelowMinimum,
}