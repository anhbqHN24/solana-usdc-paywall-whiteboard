# 🌍 Wanderlust Guides - Solana USDC Paywall

A premium travel guide platform powered by Solana blockchain. Users pay **10 USDC (Devnet)** to unlock exclusive travel itineraries and hidden gems.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)
![Blockchain](https://img.shields.io/badge/blockchain-Solana%20Devnet-purple)

## 🚀 Features

### Core Payment Flow (Phase 1-3)
- **✨ Init UI:** "Wanderlust Guides" theme - Clean, modern, light-mode travel blog interface.
- **Direct USDC Payment:** Users pay directly from their Phantom/Solflare wallet to the Merchant wallet.
- **On-Chain Verification:** Backend verifies transactions directly on the Solana blockchain (Signature & Memo).
- **Secure Access:** Content is unlocked only after successful payment verification.
- **Anti-Fraud:** Checks destination wallet to prevent self-payment exploits.

### Advanced Features (Phase 4 - Polished)
- **⏳ 5-Minute Payment Window:** Countdown timer ensures payment sessions expire to prevent stale transactions.
- **🔄 Smart Recheck Mechanism:** Users can manually trigger a status check if the websocket/polling misses the confirmation.
- **🛡️ Rate Limiting:** Backend protects the verification API from spam (5 requests/minute/IP).
- **⚡ High Performance:** Optimistic UI updates and Priority Fees ensuring fast transaction processing on Solana.

## 🛠 Tech Stack

### Frontend
- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Wallet Integration:** `@solana/wallet-adapter-react`
- **Icons:** Heroicons

### Backend
- **Language:** Go (Golang) 1.24+
- **Database:** PostgreSQL
- **Blockchain Interaction:** Node.js script (via `exec`) using `@solana/web3.js`
- **Architecture:** - `API Service`: Handles invoice creation and status checks.
  - `Watcher Service`: Background worker that verifies transactions on-chain.

---

## ⚙️ Setup & Installation

### Prerequisites
- Go 1.24+
- Node.js 18+ (for Frontend & Watcher script)
- PostgreSQL
- Solana Wallet (Phantom/Solflare) with **Devnet USDC**.

### 1. Database Setup
Create a PostgreSQL database and run migrations:
```bash
# Connect to your Postgres
psql -U postgres

# Create DB
CREATE DATABASE solana_paywall;

# Run migrations (located in backend/migrations/)
# You can use golang-migrate or execute SQL files manually in order.
```

### 2. Backend Setup
```bash
cd backend

# Install Go dependencies
go mod download

# Install Node.js dependencies for the watcher script
cd watcher
npm install
cd ..

# Configure Environment Variables
cp .env.example .env
# Edit .env with your credentials:
# DB_SOURCE=postgresql://user:password@localhost:5432/solana_paywall?sslmode=disable
# MERCHANT_WALLET=<Your_Solana_Wallet_Address>
# USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (Devnet USDC)
# SOLANA_RPC_URL=[https://api.devnet.solana.com](https://api.devnet.solana.com)

# Start the Server
go run main.go
Server runs on http://localhost:8080
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure Environment Variables
cp .env.local.example .env.local
# Edit .env.local:
# NEXT_PUBLIC_MERCHANT_WALLET=<Same_Wallet_As_Backend>
# NEXT_PUBLIC_SOLANA_RPC_URL=[https://api.devnet.solana.com](https://api.devnet.solana.com)

# Start the Dev Server
npm run dev
```
Frontend runs on ```http://localhost:3000```

## 🧪 Testing Flow
1. **Get Devnet USDC**: Go to Circle Faucet and drip USDC to your Phantom wallet (Devnet).

2. **Connect Wallet**: Open http://localhost:3000 and connect your wallet.

3. **Pay 10 USDC**: Click "Unlock Now".

4. **Approve**: Approve the transaction in Phantom.

5. **Access**: Once confirmed (~2-5s), the UI will unlock the premium travel guide content.

## 📂 Project Structure
```
├── backend/
│   ├── api/             # HTTP Handlers
│   ├── database/        # DB Connection
│   ├── middleware/      # Rate Limiting
│   ├── migrations/      # SQL Migrations
│   ├── watcher/         # Transaction Verification Logic (Go + Node.js)
│   └── main.go          # Entry point
│
└── frontend/
    ├── src/
    │   ├── app/         # Next.js App Router Pages
    │   ├── components/  # UI Components (Paywall, WalletProvider)
    │   └── lib/         # Solana utility functions
    └── public/
```
## ⚠️ Notes
- This project is configured for Solana Devnet. Do not use mainnet funds.

- The watcher uses a hybrid approach (Go calling Node.js) to leverage Solana's robust JavaScript SDK for parsing transaction metadata.

Happy Coding! 🚀