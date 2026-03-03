use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub admin:  Pubkey,
    pub paused: bool,
    pub bump:   u8,
}

#[account]
#[derive(InitSpace)]
pub struct TokenState {
    pub mint:            Pubkey,
    pub admin:           Pubkey,
    pub price_per_token: u64,
    pub decimals:        u8,
    pub total_minted:    u64,
    pub is_active:       bool,
    pub bump:            u8,
}

#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    pub wallet:    Pubkey,
    pub is_active: bool,
    pub added_at:  i64,
    pub bump:      u8,
}