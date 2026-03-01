use anchor_lang::prelude::*;
use crate::{
    constants::{
        SEED_PLATFORM, SEED_ASSET_REGISTRY,
        PRICE_STALENESS_SECS, MAX_CONFIDENCE_RATIO,
    },
    errors::SolbarError,
    state::{AssetRegistry, PlatformConfig},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: update_price
//
//  AssetRegistry pe Pyth ka latest price likho.
//
//  Ye instruction ek trusted "price cranker" backend service call karta hai.
//  Tumhara Rust price_feeder app (jo Pyth Hermes HTTP se price fetch karta hai)
//  yahi instruction call karta hai on-chain price update karne ke liye.
//
//  Price feeder flow (off-chain):
//    Pyth Hermes API → get_price() → update_price instruction → AssetRegistry
//
//  Pyth fields jo pass karne hain:
//    raw_price    = price.price    (e.g. 295000000000)
//    price_expo   = price.expo     (e.g. -8)
//    confidence   = price.conf     (absolute confidence interval)
//    publish_time = price.publish_time (unix timestamp)
//
//  Actual price = raw_price * 10^price_expo
//  e.g. 295000000000 * 10^-8 = $2950.00 (gold price)
//
//  Caller: Platform Authority OR designated price-updater keypair
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
#[instruction(ticker: [u8; 12])]
pub struct UpdatePrice<'info> {
    // -----------------------------------------------------------------
    // Price updater — sirf platform authority (production mein alag
    // oracle keypair hona chahiye kam privilege ke saath)
    // -----------------------------------------------------------------
    #[account(mut)]
    pub price_updater: Signer<'info>,

    #[account(
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    // -----------------------------------------------------------------
    // Asset Registry — yahan price write hogi
    // -----------------------------------------------------------------
    #[account(
        mut,
        seeds = [SEED_ASSET_REGISTRY, &ticker],
        bump  = asset_registry.bump,
    )]
    pub asset_registry: Account<'info, AssetRegistry>,
}

// has_one = authority constraint ke liye authority field chahiye
// Hum price_updater ko authority ke roop mein use karte hain
// Production mein: platform_config mein `oracle_authority: Pubkey` field add karo
impl<'info> UpdatePrice<'info> {
    fn authority(&self) -> &Pubkey {
        &self.platform_config.authority
    }
}

pub fn update_price_handler(
    ctx: Context<UpdatePrice>,
    ticker: [u8; 12],
    raw_price: i64,      // Pyth: price.price
    price_expo: i32,     // Pyth: price.expo
    confidence: u64,     // Pyth: price.conf
    publish_time: i64,   // Pyth: price.publish_time
) -> Result<()> {
    let clock = Clock::get()?;

    // ── Authority check ───────────────────────────────────────────────────
    require!(
        ctx.accounts.price_updater.key() == ctx.accounts.platform_config.authority,
        SolbarError::Unauthorized
    );

    // ── 1. Staleness check ────────────────────────────────────────────────
    // Pyth publish_time must be within PRICE_STALENESS_SECS of now
    // (60 seconds — Pyth usually updates every 400ms)
    let age = clock.unix_timestamp.saturating_sub(publish_time);
    require!(age <= PRICE_STALENESS_SECS, SolbarError::StalePrice);

    // ── 2. Confidence interval check ──────────────────────────────────────
    // conf / |price| < 2% hona chahiye
    // Agar confidence bahut wide hai toh price unreliable hai
    if raw_price != 0 {
        let conf_ratio = (confidence as f64) / (raw_price.unsigned_abs() as f64);
        require!(conf_ratio < MAX_CONFIDENCE_RATIO, SolbarError::LowPriceConfidence);
    }

    // ── 3. Price write karo ───────────────────────────────────────────────
    let registry             = &mut ctx.accounts.asset_registry;
    registry.last_price       = raw_price;
    registry.last_price_expo  = price_expo;
    registry.last_price_updated = publish_time;

    // Actual price calculate karo for logging
    let actual_price = registry.actual_price();
    let ticker_str = std::str::from_utf8(
        &ticker[..ticker.iter().position(|&b| b == 0).unwrap_or(12)]
    ).unwrap_or("??");

    msg!(
        "[Solbar] 📈 Price updated!\n  Asset       : {}\n  RawPrice    : {}\n  Exponent    : {}\n  ActualPrice : ${:.4}\n  Confidence  : ±{}\n  PublishTime : {}",
        ticker_str, raw_price, price_expo, actual_price, confidence, publish_time
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: update_price_batch
//
//  Ek transaction mein multiple assets ki prices update karo.
//  Cranker ke liye useful — ek tx mein gold + stocks + land sab update ho.
//
//  remaining_accounts: [AssetRegistry_0, AssetRegistry_1, ...]
//  (har ek account AssetRegistry hona chahiye)
//
//  Caller: Platform Authority
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
pub struct UpdatePriceBatch<'info> {
    #[account(mut)]
    pub price_updater: Signer<'info>,

    #[account(
        seeds = [SEED_PLATFORM],
        bump  = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    // remaining_accounts mein AssetRegistry accounts pass karo
}

pub fn update_price_batch_handler(
    ctx: Context<UpdatePriceBatch>,
    raw_prices:    Vec<i64>,
    price_expos:   Vec<i32>,
    confidences:   Vec<u64>,
    publish_times: Vec<i64>,
) -> Result<()> {
    // ── Authority check ───────────────────────────────────────────────────
    require!(
        ctx.accounts.price_updater.key() == ctx.accounts.platform_config.authority,
        SolbarError::Unauthorized
    );

    let n = raw_prices.len();
    require!(
        price_expos.len() == n && confidences.len() == n && publish_times.len() == n,
        SolbarError::InvalidPriceFeed
    );
    require!(ctx.remaining_accounts.len() == n, SolbarError::InvalidPriceFeed);

    let clock = Clock::get()?;

    for i in 0..n {
        // ── Staleness check ───────────────────────────────────────────────
        let age = clock.unix_timestamp.saturating_sub(publish_times[i]);
        require!(age <= PRICE_STALENESS_SECS, SolbarError::StalePrice);

        // ── Confidence check ──────────────────────────────────────────────
        if raw_prices[i] != 0 {
            let conf_ratio = (confidences[i] as f64) / (raw_prices[i].unsigned_abs() as f64);
            require!(conf_ratio < MAX_CONFIDENCE_RATIO, SolbarError::LowPriceConfidence);
        }

        // ── Account deserialize karo aur price write karo ─────────────────
        // Safety: Anchor ke remaining_accounts mutable nahi hote by default
        // Production mein typed accounts use karo
        let registry_info = &ctx.remaining_accounts[i];

        // Discriminator skip karo (8 bytes) aur account data parse karo
        let mut account_data: std::cell::RefMut<'_, &mut [u8]> =
            registry_info.try_borrow_mut_data()?;

        // 8 (discriminator) + field offsets mein price fields update karo
        // AssetRegistry struct mein last_price offset:
        //   asset_type(1) + ticker(12) + mint(32) + mint_authority(32)
        //   + total_supply(8) + backing_amount(8) + price_feed_id(64) = 157 bytes
        // last_price starts at offset 8 + 157 = 165
        const LAST_PRICE_OFFSET: usize = 8 + 1 + 12 + 32 + 32 + 8 + 8 + 64; // = 165

        // last_price (i64, 8 bytes)
        account_data[LAST_PRICE_OFFSET..LAST_PRICE_OFFSET + 8]
            .copy_from_slice(&raw_prices[i].to_le_bytes());
        // last_price_expo (i32, 4 bytes) at offset 165+8=173
        account_data[LAST_PRICE_OFFSET + 8..LAST_PRICE_OFFSET + 12]
            .copy_from_slice(&price_expos[i].to_le_bytes());
        // last_price_updated (i64, 8 bytes) at offset 165+12=177
        account_data[LAST_PRICE_OFFSET + 12..LAST_PRICE_OFFSET + 20]
            .copy_from_slice(&publish_times[i].to_le_bytes());

        msg!(
            "[Solbar] 📈 Batch price[{}] | RawPrice: {} | Expo: {} | Age: {}s",
            i, raw_prices[i], price_expos[i], age
        );
    }

    msg!("[Solbar] ✅ Batch price update done. {} assets updated.", n);
    Ok(())
}