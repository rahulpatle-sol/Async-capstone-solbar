use anchor_lang::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
//  PlatformConfig Account
//
//  Ye Solbar ka global singleton account hai.
//  PDA seeds = ["solbar_platform"]
//
//  Isme stored hai:
//    - Kaun platform chalata hai (authority)
//    - Fees kahan jaati hain (treasury)
//    - Platform band hai ya nahi (paused)
//    - Kitne assets aur wallets registered hain
//
//  Har doosri instruction is account ko read ya write karti hai.
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
#[derive(Default)]
pub struct PlatformConfig {
    // -----------------------------------------------------------------
    // Super admin — ye production mein Squads multisig hona chahiye
    // Has the power to: create assets, whitelist wallets, update price,
    //                   pause platform, transfer authority
    // -----------------------------------------------------------------
    pub authority: Pubkey,

    // -----------------------------------------------------------------
    // Treasury wallet — yahan protocol fees collect hongi
    // Token-2022 TransferFeeConfig ka "withdraw_authority" bhi ye hai
    // -----------------------------------------------------------------
    pub treasury: Pubkey,

    // -----------------------------------------------------------------
    // Transfer fee in basis points
    // 50 = 0.5% | 100 = 1% | MAX allowed = 1000 (10%)
    // Ye fee Token-2022 TransferFeeConfig mein set hoti hai
    // -----------------------------------------------------------------
    pub fee_basis_points: u16,

    // -----------------------------------------------------------------
    // Emergency pause switch
    // true  → transfer hook REJECT karega SABHI transfers
    // false → normal operation
    // -----------------------------------------------------------------
    pub paused: bool,

    // -----------------------------------------------------------------
    // Counters — stats ke liye
    // -----------------------------------------------------------------
    pub total_assets: u32,       // Kitne AssetRegistry PDAs bane
    pub total_whitelisted: u32,  // Kitne WhitelistEntry PDAs bane

    // -----------------------------------------------------------------
    // Platform creation timestamp (Unix)
    // -----------------------------------------------------------------
    pub created_at: i64,

    // -----------------------------------------------------------------
    // PDA bump seed
    // -----------------------------------------------------------------
    pub bump: u8,
}

impl PlatformConfig {
    /// Account space calculation — DISCRIMINATOR included
    pub const LEN: usize =
        8    // Anchor discriminator
        + 32  // authority
        + 32  // treasury
        + 2   // fee_basis_points (u16)
        + 1   // paused (bool)
        + 4   // total_assets (u32)
        + 4   // total_whitelisted (u32)
        + 8   // created_at (i64)
        + 1;  // bump (u8)
    // Total = 92 bytes

    /// Check karo platform active hai
    pub fn is_active(&self) -> bool {
        !self.paused
    }

    /// Fee amount calculate karo given a transfer amount
    /// Returns fee in token base units
    pub fn calculate_fee(&self, amount: u64) -> u64 {
        (amount as u128)
            .saturating_mul(self.fee_basis_points as u128)
            .saturating_div(10_000)
            as u64
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PlatformConfig ka use sirf read-only check ke liye bhi hota hai:
//
//  // Platform paused hai toh revert
//  require!(!platform_config.paused, SolbarError::PlatformPaused);
//
//  // Sirf authority call kar sakta hai
//  require!(signer == platform_config.authority, SolbarError::Unauthorized);
// ─────────────────────────────────────────────────────────────────────────────