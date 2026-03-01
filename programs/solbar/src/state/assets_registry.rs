use anchor_lang::prelude::*;

// ═══════════════════════════════════════════════════════════════════════════════
//  AssetType Enum
//
//  Solbar teen tarah ke real-world assets support karta hai:
//    Gold       → Physical gold (grams mein)
//    Stock      → Regulated stock exchange shares
//    RealEstate → Land / property fractions
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum AssetType {
    Gold,
    Stock,
    RealEstate,
}

impl Default for AssetType {
    fn default() -> Self {
        AssetType::Gold
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AssetRegistry Account
//
//  Har ek tokenized asset ke liye ek PDA hoti hai.
//  PDA seeds = ["asset_registry", ticker_bytes]
//
//  Example:
//    Gold   → seeds = ["asset_registry", b"XAU\0\0\0\0\0\0\0\0\0"]
//    AAPL   → seeds = ["asset_registry", b"AAPL\0\0\0\0\0\0\0\0"]
//    LAND01 → seeds = ["asset_registry", b"LAND01\0\0\0\0\0\0"]
//
//  Isme stored hai:
//    - Asset type + ticker
//    - Token-2022 mint ka address
//    - Total circulating supply + physical backing
//    - Pyth oracle price feed ID aur latest price
//    - Minimum investment amount
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
#[derive(Default)]
pub struct AssetRegistry {
    // -----------------------------------------------------------------
    // Asset ki pehchaan
    // -----------------------------------------------------------------

    /// Gold | Stock | RealEstate
    pub asset_type: AssetType,

    /// Short ticker — 12 bytes, null-padded
    /// Examples: b"XAU\0...", b"AAPL\0...", b"LAND_MUM\0..."
    pub ticker: [u8; 12],

    // -----------------------------------------------------------------
    // Token-2022 Mint info
    // -----------------------------------------------------------------

    /// Token-2022 mint ka public key
    /// is_active check ke liye ya transfers ke liye use hota hai
    pub mint: Pubkey,

    /// Kaun naye tokens mint kar sakta hai (usually platform authority)
    pub mint_authority: Pubkey,

    // -----------------------------------------------------------------
    // Supply + Physical Backing
    //
    // Invariant: backing_amount >= total_supply hona chahiye
    //   (physical asset se zyada token nahi hone chahiye)
    // -----------------------------------------------------------------

    /// Total tokens currently in circulation (base units)
    /// Gold example: 1_000_000 = 1 gram (6 decimals)
    pub total_supply: u64,

    /// Physical asset locked in custody (same units as tokens)
    /// Gold: grams * 10^6
    /// Stock: shares * 10^4
    /// Land: sq-ft * 10^6
    pub backing_amount: u64,

    // -----------------------------------------------------------------
    // Pyth Oracle Price Feed
    // -----------------------------------------------------------------

    /// Pyth price feed ID (hex string as bytes)
    /// Gold XAU/USD: 0x765d2ba906dbc32ca17cc11f5310a89e9ee1f642...
    /// 64 bytes = full Pyth feed ID
    pub price_feed_id: [u8; 64],

    /// Latest price from Pyth (raw integer, NOT divided by exponent yet)
    /// Example: 295000000000 (for gold at ~$2950)
    pub last_price: i64,

    /// Pyth price exponent
    /// Example: -8 means actual price = last_price * 10^(-8)
    /// $2950 = 295000000000 * 10^(-8) = 2950.0
    pub last_price_expo: i32,

    /// Unix timestamp jab price last update hua tha
    pub last_price_updated: i64,

    // -----------------------------------------------------------------
    // Asset Status
    // -----------------------------------------------------------------

    /// Kya ye asset active hai?
    /// false → minting band, transfers hook reject karega
    pub is_active: bool,

    /// Minimum investment amount in USD cents
    /// 10_000 = $100 minimum
    pub min_investment_usd_cents: u64,

    // -----------------------------------------------------------------
    // Timestamps
    // -----------------------------------------------------------------

    /// Jab ye asset create hua tha (Unix timestamp)
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl AssetRegistry {
    /// Account space — DISCRIMINATOR included
    pub const LEN: usize =
        8    // discriminator
        + 1   // asset_type enum (1 byte)
        + 12  // ticker [u8; 12]
        + 32  // mint Pubkey
        + 32  // mint_authority Pubkey
        + 8   // total_supply u64
        + 8   // backing_amount u64
        + 64  // price_feed_id [u8; 64]
        + 8   // last_price i64
        + 4   // last_price_expo i32
        + 8   // last_price_updated i64
        + 1   // is_active bool
        + 8   // min_investment_usd_cents u64
        + 8   // created_at i64
        + 1;  // bump u8
    // Total = 204 bytes

    // ─────────────────────────────────────────────────────────────────
    //  Price helpers
    // ─────────────────────────────────────────────────────────────────

    /// Actual price in USD as f64
    /// actual_price = last_price * 10^last_price_expo
    ///
    /// Example:
    ///   last_price = 295000000000
    ///   last_price_expo = -8
    ///   actual_price = 295000000000 * 10^(-8) = $2950.00
    pub fn actual_price(&self) -> f64 {
        (self.last_price as f64) * 10_f64.powi(self.last_price_expo)
    }

    /// USD value (in cents) of a given token amount
    ///
    /// amount    = token base units
    /// decimals  = token decimals (from Mint account)
    ///
    /// Example (Gold, 6 decimals, price = $2950):
    ///   amount = 500_000 (= 0.5 grams)
    ///   usd_cents = (500_000 / 10^6) * 2950 * 100 = 14_750 = $147.50
    pub fn usd_value_cents(&self, amount: u64, decimals: u8) -> u64 {
        let real_amount = (amount as f64) / 10_f64.powi(decimals as i32);
        (real_amount * self.actual_price() * 100.0) as u64
    }

    // ─────────────────────────────────────────────────────────────────
    //  Ticker helpers
    // ─────────────────────────────────────────────────────────────────

    /// Ticker ko human-readable string mein convert karo
    /// [b'X', b'A', b'U', 0, 0, ...] → "XAU"
    pub fn ticker_str(&self) -> &str {
        let end = self.ticker.iter().position(|&b| b == 0).unwrap_or(12);
        std::str::from_utf8(&self.ticker[..end]).unwrap_or("??")
    }

    /// String ticker ko [u8; 12] array mein convert karo
    /// "XAU" → [b'X', b'A', b'U', 0, 0, 0, 0, 0, 0, 0, 0, 0]
    pub fn ticker_from_str(s: &str) -> [u8; 12] {
        let mut arr = [0u8; 12];
        let bytes = s.as_bytes();
        let len = bytes.len().min(12);
        arr[..len].copy_from_slice(&bytes[..len]);
        arr
    }

    // ─────────────────────────────────────────────────────────────────
    //  Backing ratio
    // ─────────────────────────────────────────────────────────────────

    /// Backing ratio check karo — backing_amount >= total_supply hona chahiye
    /// Agar < 1.0 toh under-collateralized (dangerous!)
    pub fn backing_ratio(&self) -> f64 {
        if self.total_supply == 0 {
            return 1.0; // No supply = fully backed (vacuously true)
        }
        self.backing_amount as f64 / self.total_supply as f64
    }

    /// Kya asset fully backed hai?
    pub fn is_fully_backed(&self) -> bool {
        self.backing_amount >= self.total_supply
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quick Reference — AssetRegistry Field Offsets (for batch price update)
//
//  discriminator    : 0  (8 bytes)
//  asset_type       : 8  (1 byte)
//  ticker           : 9  (12 bytes)
//  mint             : 21 (32 bytes)
//  mint_authority   : 53 (32 bytes)
//  total_supply     : 85 (8 bytes)
//  backing_amount   : 93 (8 bytes)
//  price_feed_id    : 101 (64 bytes)
//  last_price       : 165 (8 bytes)  ← price feeder writes here
//  last_price_expo  : 173 (4 bytes)  ← price feeder writes here
//  last_price_updated: 177 (8 bytes) ← price feeder writes here
//  is_active        : 185 (1 byte)
//  min_investment   : 186 (8 bytes)
//  created_at       : 194 (8 bytes)
//  bump             : 202 (1 byte)
// ─────────────────────────────────────────────────────────────────────────────
pub const ASSET_REGISTRY_LAST_PRICE_OFFSET: usize = 165;