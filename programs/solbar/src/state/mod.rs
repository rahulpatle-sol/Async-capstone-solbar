use anchor_lang::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
//  PlatformConfig
//  PDA seeds = ["config"]
//  #[derive(InitSpace)] — Anchor automatically calculates space
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    /// Super admin pubkey
    pub admin:  Pubkey, // 32
    /// Emergency pause switch
    pub paused: bool,   // 1
    /// PDA bump
    pub bump:   u8,     // 1
}
// DISCRIMINATOR (8) + InitSpace (34) = 42 bytes total
// InitSpace handles the addition safely — no manual arithmetic

// ═══════════════════════════════════════════════════════════════════════════════
//  TokenState
//  PDA seeds = ["token_state", mint_pubkey]
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
#[derive(InitSpace)]
pub struct TokenState {
    /// Token-2022 mint address
    pub mint:            Pubkey, // 32
    /// Admin who created this token
    pub admin:           Pubkey, // 32
    /// Lamports per 1 full token (e.g. 1_000_000 = 0.001 SOL per token)
    pub price_per_token: u64,    // 8
    /// Token decimals
    pub decimals:        u8,     // 1
    /// Total tokens currently in circulation
    pub total_minted:    u64,    // 8
    /// Is this token active?
    pub is_active:       bool,   // 1
    /// PDA bump
    pub bump:            u8,     // 1
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WhitelistEntry
//  PDA seeds = ["whitelist", wallet_pubkey]
// ═══════════════════════════════════════════════════════════════════════════════
#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    /// The approved wallet
    pub wallet:    Pubkey, // 32
    /// Active flag — false = revoked
    pub is_active: bool,   // 1
    /// Approval timestamp
    pub added_at:  i64,    // 8
    /// PDA bump
    pub bump:      u8,     // 1
}