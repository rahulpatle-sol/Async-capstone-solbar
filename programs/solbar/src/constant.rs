use anchor_lang::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
//  PlatformConfig
//  PDA seeds = ["config"]
//  Singleton — ek hi platform hogi
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
pub struct PlatformConfig {
    /// Super admin — only this wallet can call privileged instructions
    pub admin:  Pubkey, // 32
    /// Emergency switch — true = all instructions blocked
    pub paused: bool,   // 1
    /// PDA bump
    pub bump:   u8,     // 1
}
impl PlatformConfig {
    pub const LEN: usize = 8 + 32 + 1 + 1; // 42 bytes
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TokenState
//  PDA seeds = ["token_state", mint_pubkey]
//  Ek per Token-2022 mint — price aur supply track karta hai
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
pub struct TokenState {
    /// Token-2022 mint address
    pub mint:            Pubkey, // 32
    /// Admin who created this token
    pub admin:           Pubkey, // 32
    /// Price in lamports per 1 full token (e.g. 1_000_000 = 0.001 SOL)
    pub price_per_token: u64,    // 8
    /// Token decimals (stored for calculations)
    pub decimals:        u8,     // 1
    /// Total tokens currently in circulation
    pub total_minted:    u64,    // 8
    /// Is this token active for trading?
    pub is_active:       bool,   // 1
    /// PDA bump
    pub bump:            u8,     // 1
}
impl TokenState {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 8 + 1 + 1; // 91 bytes
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WhitelistEntry
//  PDA seeds = ["whitelist", wallet_pubkey]
//  Ek per whitelisted wallet — bina is ke koi bhi buy/sell nahi kar sakta
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
pub struct WhitelistEntry {
    /// The wallet that is whitelisted
    pub wallet:    Pubkey, // 32
    /// Is this entry currently active?
    pub is_active: bool,   // 1
    /// When was this wallet approved (unix timestamp)
    pub added_at:  i64,    // 8
    /// PDA bump
    pub bump:      u8,     // 1
}
impl WhitelistEntry {
    pub const LEN: usize = 8 + 32 + 1 + 8 + 1; // 50 bytes
}