use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use crate::{
    constants::{SEED_PLATFORM, SEED_WHITELIST_ENTRY, SEED_EXTRA_ACCOUNT_METAS},
    errors::SolbarError,
    state::{PlatformConfig, WhitelistEntry},
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRANSFER HOOK
//  Token-2022 har transfer pe automatically call karta hai
//
//  Standard 5 accounts:
//    [0] source_token_account
//    [1] mint
//    [2] destination_token_account
//    [3] source_authority (sender wallet)
//    [4] extra_account_meta_list
//
//  Our 3 extra accounts:
//    [5] platform_config
//    [6] sender_whitelist
//    [7] receiver_whitelist  (receiver_wallet = [8])
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct TransferHookExecute<'info> {
    #[account(token::token_program = token_program)]
    pub source_token_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(token::token_program = token_program)]
    pub destination_token_account: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    /// CHECK: source authority — Token-2022 validates
    pub source_authority: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetas PDA
    #[account(
        seeds = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    // ── Extra accounts (auto-added via ExtraAccountMetas) ─────────────────────

    #[account(
        seeds = [SEED_PLATFORM],
        bump  = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        seeds = [SEED_WHITELIST_ENTRY, source_authority.key().as_ref()],
        bump  = sender_whitelist.bump,
    )]
    pub sender_whitelist: Account<'info, WhitelistEntry>,

    /// CHECK: receiver wallet — owner of destination ATA, passed by client
    pub receiver_wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_WHITELIST_ENTRY, receiver_wallet.key().as_ref()],
        bump  = receiver_whitelist.bump,
    )]
    pub receiver_whitelist: Account<'info, WhitelistEntry>,

    pub token_program: Program<'info, Token2022>,
}

/// MUST be named `execute` — Token-2022 TransferHook interface
pub fn execute_hook(ctx: Context<TransferHookExecute>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // 1. Platform not paused
    require!(!ctx.accounts.platform_config.paused, SolbarError::HookPlatformPaused);

    // 2. Sender checks
    {
        let s = &ctx.accounts.sender_whitelist;
        require!(s.is_active, SolbarError::HookSenderNotWhitelisted);
        require!(s.expiry > clock.unix_timestamp, SolbarError::HookSenderNotWhitelisted);
        require!(s.has_asset_approved(&ctx.accounts.mint.key()), SolbarError::HookSenderNotWhitelisted);
    }

    // 3. Receiver checks
    {
        let r = &ctx.accounts.receiver_whitelist;
        require!(r.is_active, SolbarError::HookReceiverNotWhitelisted);
        require!(r.expiry > clock.unix_timestamp, SolbarError::HookReceiverNotWhitelisted);
        require!(r.has_asset_approved(&ctx.accounts.mint.key()), SolbarError::HookReceiverNotWhitelisted);
    }

    msg!(
        "[Hook] ✅ Transfer OK | From:{} To:{} Amount:{}",
        ctx.accounts.source_authority.key(),
        ctx.accounts.receiver_wallet.key(),
        amount
    );
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTRUCTION: initialize_extra_account_metas
// ═══════════════════════════════════════════════════════════════════════════════
#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds   = [SEED_PLATFORM],
        bump    = platform_config.bump,
        has_one = authority @ SolbarError::Unauthorized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    /// CHECK: The Token-2022 mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetas PDA — raw TLV data written here
    #[account(
        init,
        payer  = authority,
        space  = ExtraAccountMetaList::size_of(3).unwrap(),
        seeds  = [SEED_EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn init_extra_metas_handler(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();

    // [5] platform_config
    let meta_platform = ExtraAccountMeta::new_with_seeds(
        &[Seed::Literal { bytes: SEED_PLATFORM.to_vec() }],
        false, false,
    )?;

    // [6] sender_whitelist — seeds: ["whitelist", source_authority (index 3)]
    let meta_sender = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal { bytes: SEED_WHITELIST_ENTRY.to_vec() },
            Seed::AccountKey { index: 3 },
        ],
        false, false,
    )?;

    // [7] receiver_wallet — passed directly by client (index 7)
    // This is the owner of destination_token_account
    let meta_receiver_wallet = ExtraAccountMeta::new_external_pda_with_seeds(
        7, // self-referential — client resolves this
        &[],
        false, false,
    )?;

    // [8] receiver_whitelist — seeds: ["whitelist", receiver_wallet (index 7)]
    let meta_receiver_wl = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal { bytes: SEED_WHITELIST_ENTRY.to_vec() },
            Seed::AccountKey { index: 7 },
        ],
        false, false,
    )?;

    let extra_metas = vec![meta_platform, meta_sender, meta_receiver_wallet, meta_receiver_wl];

    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;

    msg!(
        "[Solbar] ✅ ExtraAccountMetas set for mint: {} | {} extras",
        mint_key, extra_metas.len()
    );
    Ok(())
}