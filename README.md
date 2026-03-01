# 🥇 Solbar — Real World Asset (RWA) Tokenization on Solana

<div align="center">

![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blue?style=for-the-badge)
![Token-2022](https://img.shields.io/badge/Token--2022-Program-green?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-MVP-orange?style=for-the-badge)

**Tokenize physical gold on-chain. Swap SOL for gold-backed tokens. Whitelist-only access.**

[Program](#-deployed-program) • [Architecture](#-architecture) • [Instructions](#-instructions) • [Tests](#-tests) • [Setup](#-local-setup)

</div>

---

## 📌 What is Solbar?

Solbar is a **Real World Asset (RWA) tokenization platform** built on Solana that enables fractional ownership of physical gold starting from **$100 minimum investment**.

Each token represents a fraction of physical gold held in custody. The platform uses **Token-2022** (the next-generation Solana token standard) and enforces **KYC/whitelist-only access** — only verified wallets can hold or trade tokens.

### 🎯 Problem it Solves

| Problem | Solbar Solution |
|---|---|
| Gold investing requires large capital | Fractional tokens from $100 |
| No transparency in gold custody | On-chain backing tracked via `GoldVault` PDA |
| Anyone can hold unregulated tokens | Whitelist enforcement — KYC required |
| Manual price updates | `update_gold_price` instruction for oracle integration |
| No audit trail for redemptions | Burn instruction with on-chain event emission |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SOLBAR PROGRAM                        │
│              (DJ93cETS4yvu8e4SnySFkAwknXzLFJwYNd46EcH7WsUg) │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────────┐  │
│  │ PlatformState│   │  GoldVault   │  │WhitelistEntry│ │
│  │     PDA      │   │     PDA      │  │    PDA       │  │
│  │              │   │              │  │              │  │
│  │ admin        │   │ mint (T2022) │  │ wallet       │  │
│  │ paused       │   │ total_supply │  │ is_active    │  │
│  │ bump         │   │ backing_mg   │  │ kyc_expiry   │  │
│  └──────────────┘   │ price_cents  │  │ bump         │  │
│                     │ is_active    │  └─────────────┘  │
│                     └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    Admin Controls    Token-2022 Mint    KYC Gating
    Pause/Unpause     MintTo / Burn     Whitelist PDA
```

### PDA Structure

| Account | Seeds | Purpose |
|---|---|---|
| `PlatformState` | `["solbar_platform"]` | Global config, admin, pause switch |
| `GoldVault` | `["gold_vault", mint_pubkey]` | Per-token metadata, supply, backing, price |
| `WhitelistEntry` | `["whitelist", wallet_pubkey]` | KYC approval per wallet |

---

## 🔑 Instructions

### 1. `initialize`
Bootstrap the platform. Creates `PlatformState` PDA with admin authority.

```
Admin wallet ──→ PlatformState PDA
```

### 2. `create_gold`
Creates a **Token-2022** mint and binds it to a gold price (in USD cents). The vault PDA tracks all custody and supply data.

```
Admin ──→ Token-2022 Mint + GoldVault PDA
         (price_usd_cents, backing_grams, total_supply)
```

### 3. `whitelist_wallet`
KYC-approve a wallet. Without a `WhitelistEntry` PDA, the wallet **cannot** receive or send tokens.

```
Admin ──→ WhitelistEntry PDA { wallet, kyc_expiry, is_active }
```

### 4. `mint_gold`
Admin mints tokens to a whitelisted user after physical gold is received in custody.

```
Physical Gold Received
        │
        ▼
Admin calls mint_gold(amount, backing_mg)
        │
        ├── Checks: whitelist ✅ | kyc_expiry ✅ | min_investment ✅
        │
        ├── Token-2022 MintTo CPI → user ATA
        │
        └── GoldVault: total_supply ↑, backing_grams ↑
```

### 5. `redeem_gold`
User burns tokens. Platform ships physical gold. Supply and backing updated.

```
User calls redeem_gold(amount)
        │
        ├── Checks: whitelist ✅ | kyc_expiry ✅ | supply ✅
        │
        ├── Token-2022 Burn CPI ← user ATA
        │
        └── GoldVault: total_supply ↓
            [Off-chain: platform ships physical gold]
```

### Bonus: `update_gold_price`
Admin updates the gold price on-chain (to be integrated with Pyth Network oracle).

---

## 🔐 Security Model

### Whitelist-Only Access
Every `mint_gold` and `redeem_gold` call validates the `WhitelistEntry` PDA:

```rust
let entry = &ctx.accounts.whitelist_entry;
require!(entry.is_active, SolbarError::NotWhitelisted);
require!(entry.kyc_expiry > clock.unix_timestamp, SolbarError::KycExpired);
```

If the PDA does not exist → **transaction fails automatically** (Anchor account constraint).  
If KYC is expired → **transaction rejected** at instruction level.

### Admin Controls
- Only the `admin` stored in `PlatformState` can call privileged instructions
- `has_one = admin` constraint enforced by Anchor on every admin instruction
- Emergency `paused` flag halts all operations instantly

### Token-2022
Solbar uses the **Token-2022 Program** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) instead of legacy SPL Token because:

- Native support for **Transfer Hooks** (whitelist enforcement on every transfer)
- **Transfer Fee Config** (protocol fee collection)
- **Metadata Pointer** (on-chain asset metadata)
- Future-proof standard for regulated tokenized assets

---

## 🧪 Tests

8 test cases covering all happy paths and failure scenarios:

```
Solbar2 — Gold Token Platform
  ✅ Test 1: initialize — platform config created
  ✅ Test 2: create_token — Token-2022 mint + price bound
  ✅ Test 3: add_to_whitelist — user1 approved
  ✅ Test 4: swap — user1 sends SOL, gets tokens
  ✅ Test 5: swap FAILS for non-whitelisted user2
  ✅ Test 6: burn_tokens — user1 burns tokens, receives SOL
  ✅ Test 7: remove_from_whitelist — user1 blocked
  ✅ Test 8: swap FAILS after whitelist removal

  8 passing
```

### Test Coverage

| Scenario | Expected | Tested |
|---|---|---|
| Platform initialize | Config PDA created | ✅ |
| Token creation with price | Mint + vault created | ✅ |
| Whitelist approval | Entry PDA created | ✅ |
| SOL → Token swap | Tokens minted proportionally | ✅ |
| Non-whitelisted swap | Transaction rejected | ✅ |
| Token → SOL burn | SOL returned to user | ✅ |
| Whitelist removal | Entry deactivated | ✅ |
| Removed wallet swap | Transaction rejected | ✅ |

---

## 🚀 Local Setup

### Prerequisites

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1
avm use 0.32.1

# Node.js dependencies
yarn install
```

### Build & Test

```bash
# Clone the repo
git clone https://github.com/rahulpatle-sol/q1_capstone_solbar
cd q1_capstone_solbar

# Build the program
anchor build

# Run tests (localnet)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Environment Setup

```bash
# Generate a new keypair (if needed)
solana-keygen new

# Set to devnet
solana config set --url devnet

# Airdrop SOL for testing
solana airdrop 2
```

---

## 🌐 Deployed Program

| Network | Program ID |
|---|---|
| **Devnet** | `7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg` |
| Localnet | `7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg` |

> View on Explorer:  
> [https://explorer.solana.com/address/7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg?cluster=devnet](https://explorer.solana.com/address/7tEFkPBdbXw4XotSLPiXk2y26NESVEmbk7Jx9LN5uGDg?cluster=devnet)

---

## 📂 Project Structure

```
q1_capstone_solbar/
├── Anchor.toml                      # Anchor config (cluster, wallet, scripts)
├── Cargo.toml                       # Workspace manifest
├── programs/
│   └── solbar/
│       ├── Cargo.toml               # Program dependencies
│       └── src/
│           └── lib.rs               # Full program (single file, clean)
├── tests/
│   └── solbar.ts                    # TypeScript integration tests
└── target/
    ├── idl/solbar.json              # Auto-generated IDL
    └── types/solbar.ts              # Auto-generated TypeScript types
```

---

## 🔭 Roadmap

### MVP (Submitted)
- [x] Platform initialization
- [x] Token-2022 gold mint creation
- [x] KYC whitelist enforcement
- [x] Mint gold (SOL → token)
- [x] Redeem gold (token → SOL)
- [x] 8 passing tests

### V2 (Post-Capstone)
- [ ] **Pyth Oracle integration** — live gold price from [pyth.network](https://pyth.network)
- [ ] **Transfer Hook** — whitelist enforced on every P2P transfer
- [ ] **Transfer Fee Config** — protocol fee on trades
- [ ] **Redemption Request PDA** — track physical delivery on-chain
- [ ] **Multi-asset support** — Silver, Real Estate alongside Gold
- [ ] **Admin dashboard** — Next.js frontend
- [ ] **Squads multisig** — decentralize admin authority

---

## 📚 References & Learning Resources

### Solana Core
- [Solana Documentation](https://docs.solana.com) — Official Solana docs
- [Solana Cookbook](https://solanacookbook.com) — Practical development patterns
- [Solana Program Library](https://github.com/solana-labs/solana-program-library) — Reference implementations

### Anchor Framework
- [Anchor Book](https://book.anchor-lang.com) — Complete Anchor guide
- [Anchor GitHub](https://github.com/coral-xyz/anchor) — Source + examples
- [Anchor Docs](https://docs.rs/anchor-lang/latest/anchor_lang) — API reference

### Token-2022 (Token Extensions Program)
- [Token-2022 Overview](https://spl.solana.com/token-2022) — Official SPL docs
- [Token Extensions Guide](https://solana.com/developers/guides/token-extensions/getting-started) — Getting started
- [Transfer Hook Interface](https://github.com/solana-labs/solana-program-library/tree/master/token/transfer-hook/interface) — Hook implementation reference
- [Transfer Fee Extension](https://spl.solana.com/token-2022/extensions#transfer-fees) — Fee collection docs

### RWA & DeFi References
- [Pyth Network](https://pyth.network) — Decentralized price oracle used for gold pricing
- [Pyth Price Feed IDs](https://pyth.network/developers/price-feed-ids) — XAU/USD and other feeds
- [OpenZeppelin RWA Report](https://blog.openzeppelin.com/real-world-assets-on-chain) — Industry context

### Solana Bootcamp
- [Turbine3 Q1 2025](https://turbin3.com) — This capstone was built as part of Turbine3 Q1 Builders cohort

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Solana** | 1.18+ | Base blockchain |
| **Anchor** | 0.32.1 | Smart contract framework |
| **Token-2022** | Latest | Next-gen token standard |
| **Rust** | 1.85+ | Program language |
| **TypeScript** | 5.x | Test suite |
| **Mocha + Chai** | Latest | Test framework |
| **@solana/web3.js** | Latest | Client SDK |
| **@coral-xyz/anchor** | 0.32.1 | Anchor client |
| **@solana/spl-token** | Latest | Token-2022 helpers |

---

## 👨‍💻 Author

**Rahul Patle**  
Solana Developer | Turbine3 Q1 2025  
GitHub: [@rahulpatle-sol](https://github.com/rahulpatle-sol)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ on Solana during **Turbine3 Q1 2025 Builders Cohort**

⭐ Star this repo if you found it helpful!

</div>
