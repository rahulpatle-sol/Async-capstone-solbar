use anchor_lang::prelude::*;
use crate::constants::MAX_APPROVED_ASSETS;

// ═══════════════════════════════════════════════════════════════════════════════
//  KycLevel Enum
//
//  Har wallet ka ek KYC tier hota hai jo determine karta hai:
//    - Kitna invest kar sakta hai
//    - Kaunse assets hold kar sakta hai
//
//  Basic       → Retail investors ($100 minimum)
//  Accredited  → High net worth individuals (higher limits)
//  Institutional → Banks, funds, institutions (no limits)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum KycLevel {
    /// Retail / General public
    /// Min investment: $100
    /// Max holding: configurable per-asset
    Basic,

    /// Accredited investor (e.g. SEBI registered)
    /// Higher limits, access to all asset types
    Accredited,

    /// Institutional (banks, mutual funds, hedge funds)
    /// No holding limits, all assets accessible
    Institutional,
}

impl Default for KycLevel {
    fn default() -> Self {
        KycLevel::Basic
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WhitelistEntry Account
//
//  Har KYC-approved wallet ke liye ek PDA hoti hai.
//  PDA seeds = ["whitelist", wallet_pubkey]
//
//  Bina is PDA ke:
//    - Wallet koi Solbar token RECEIVE nahi kar sakta (hook reject karega)
//    - Wallet koi Solbar token SEND nahi kar sakta (hook reject karega)
//    - Wallet Solbar tokens MINT nahi karwa sakta
//
//  Admin flow:
//    1. add_to_whitelist → WhitelistEntry PDA create
//    2. approve_asset_for_wallet → approved_assets mein mint add
//    3. Ab user us mint ki tokens hold/transfer kar sakta hai
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
#[derive(Default)]
pub struct WhitelistEntry {
    // -----------------------------------------------------------------
    // Wallet identification
    // -----------------------------------------------------------------

    /// KYC-approved wallet ka public key
    pub wallet: Pubkey,

    // -----------------------------------------------------------------
    // KYC Details
    // -----------------------------------------------------------------

    /// KYC tier — Basic | Accredited | Institutional
    pub kyc_level: KycLevel,

    /// Kaun kaun si asset mints is wallet ke liye approved hain
    /// Max 32 assets per wallet (memory limit)
    /// Vec mein Token-2022 mint public keys store hote hain
    pub approved_assets: Vec<Pubkey>,

    /// Kaun se admin ne is wallet ko KYC kiya
    pub approved_by: Pubkey,

    /// KYC approval ka timestamp (Unix)
    pub approved_at: i64,

    /// KYC expiry timestamp — is ke baad token transfers BAND ho jaayenge
    /// Admin ko renew_kyc call karni hogi re-verification ke baad
    pub expiry: i64,

    // -----------------------------------------------------------------
    // Status flags
    // -----------------------------------------------------------------

    /// Active/Inactive switch
    /// false → sabhi transfers band (AML/suspicious activity)
    /// PDA delete nahi hoti — audit trail preserved
    pub is_active: bool,

    // -----------------------------------------------------------------
    // Compliance metadata
    // -----------------------------------------------------------------

    /// ISO 3166-1 alpha-2 country code — 2 bytes
    /// b"IN" = India | b"US" = USA | b"SG" = Singapore
    pub country_code: [u8; 2],

    // -----------------------------------------------------------------
    // PDA bump seed
    // -----------------------------------------------------------------
    pub bump: u8,
}

impl WhitelistEntry {
    /// Account space — DISCRIMINATOR included
    /// Vec<Pubkey> fixed at MAX_APPROVED_ASSETS (32) slots
    pub const LEN: usize =
        8                               // discriminator
        + 32                            // wallet Pubkey
        + 1                             // kyc_level enum
        + (4 + 32 * MAX_APPROVED_ASSETS) // approved_assets Vec (4=len prefix + 32*32)
        + 32                            // approved_by Pubkey
        + 8                             // approved_at i64
        + 8                             // expiry i64
        + 1                             // is_active bool
        + 2                             // country_code [u8; 2]
        + 1;                            // bump u8
    // Total = 8+32+1+1028+32+8+8+1+2+1 = 1121 bytes

    // ─────────────────────────────────────────────────────────────────
    //  Validation helpers
    // ─────────────────────────────────────────────────────────────────

    /// KYC valid hai ya nahi
    /// Active hona chahiye + expiry future mein honi chahiye
    pub fn is_kyc_valid(&self, clock: &Clock) -> bool {
        self.is_active && self.expiry > clock.unix_timestamp
    }

    /// Ye mint is wallet ke liye approved hai?
    pub fn has_asset_approved(&self, mint: &Pubkey) -> bool {
        self.approved_assets.contains(mint)
    }

    /// Kitne din mein KYC expire hoga
    pub fn days_until_expiry(&self, clock: &Clock) -> i64 {
        let remaining_secs = self.expiry.saturating_sub(clock.unix_timestamp);
        remaining_secs / 86_400 // seconds → days
    }

    /// KYC expire ho gaya hai?
    pub fn is_expired(&self, clock: &Clock) -> bool {
        self.expiry <= clock.unix_timestamp
    }

    /// Country code readable string
    pub fn country_str(&self) -> &str {
        std::str::from_utf8(&self.country_code).unwrap_or("??")
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WhitelistEntry Memory Layout Reference
//
//  discriminator     : 0   (8 bytes)
//  wallet            : 8   (32 bytes)
//  kyc_level         : 40  (1 byte)
//  approved_assets   : 41  (4 bytes len + 32*32 = 1028 bytes)
//  approved_by       : 1069 (32 bytes)
//  approved_at       : 1101 (8 bytes)
//  expiry            : 1109 (8 bytes)
//  is_active         : 1117 (1 byte)
//  country_code      : 1118 (2 bytes)
//  bump              : 1120 (1 byte)
// ─────────────────────────────────────────────────────────────────────────────