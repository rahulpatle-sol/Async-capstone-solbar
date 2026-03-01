// ── PDA Seeds ─────────────────────────────────────────────────────────────────
pub const SEED_PLATFORM:             &[u8] = b"solbar_platform";
pub const SEED_ASSET_REGISTRY:       &[u8] = b"asset_registry";
pub const SEED_WHITELIST_ENTRY:      &[u8] = b"whitelist";
pub const SEED_EXTRA_ACCOUNT_METAS:  &[u8] = b"extra-account-metas";
pub const SEED_REDEEM_REQUEST:       &[u8] = b"redeem_request";

// ── Token Decimals ────────────────────────────────────────────────────────────
pub const GOLD_DECIMALS:       u8 = 6;
pub const STOCK_DECIMALS:      u8 = 4;
pub const REALESTATE_DECIMALS: u8 = 6;

// ── Platform Limits ───────────────────────────────────────────────────────────
pub const MAX_FEE_BASIS_POINTS:   u16   = 1_000;
pub const MAX_TICKER_LEN:         usize = 12;
pub const MAX_APPROVED_ASSETS:    usize = 32;

// ── Pyth Oracle ───────────────────────────────────────────────────────────────
pub const PRICE_STALENESS_SECS:   i64   = 60;
pub const MAX_CONFIDENCE_RATIO:   f64   = 0.02;

// ── Minimum Redemption (base units) ──────────────────────────────────────────
pub const MIN_GOLD_REDEEM:        u64 = 1_000;
pub const MIN_STOCK_REDEEM:       u64 = 1;
pub const MIN_REALESTATE_REDEEM:  u64 = 1_000;

// ── Default Investment ────────────────────────────────────────────────────────
pub const DEFAULT_MIN_INVESTMENT_USD_CENTS: u64 = 10_000; // $100

// ── KYC ───────────────────────────────────────────────────────────────────────
pub const KYC_VALIDITY_SECS_1_YEAR: i64 = 31_536_000;

// ── Pyth Feed IDs ─────────────────────────────────────────────────────────────
pub const PYTH_FEED_GOLD_XAU_USD: &str =
    "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
pub const PYTH_FEED_SOL_USD: &str =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// ── AssetRegistry byte offsets for batch price update ────────────────────────
// discriminator(8)+asset_type(1)+ticker(12)+mint(32)+mint_authority(32)
// +total_supply(8)+backing_amount(8)+price_feed_id(64) = 165
pub const OFFSET_LAST_PRICE:         usize = 165;
pub const OFFSET_LAST_PRICE_EXPO:    usize = 173;
pub const OFFSET_LAST_PRICE_UPDATED: usize = 177;

// ── Token-2022 Hook Account Indices ──────────────────────────────────────────
pub const HOOK_IDX_SOURCE_AUTHORITY: u8 = 3;
pub const HOOK_IDX_DEST_TOKEN:       u8 = 2;

// ── TokenAccount field offsets ────────────────────────────────────────────────
pub const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 0;