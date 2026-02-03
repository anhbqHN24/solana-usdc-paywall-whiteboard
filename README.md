# Solana USDC Paywall 🔒💰

A full-stack content monetization system built on Solana. This project demonstrates how to create a "Paywall" where users must pay USDC on the Solana network to unlock premium content. It features real-time payment detection, wallet integration, and a robust backend.

## 🚀 Overview

The **Solana USDC Paywall** allows content creators to gate their content behind a crypto payment.
- **Connect Wallet:** Users connect their Solana wallet (e.g., Phantom).
- **Check Access:** The system checks if the wallet has already paid.
- **Pay to Unlock:** Users sign a USDC transaction. The backend watches the blockchain, confirms the payment, and unlocks the content instantly.

## 🛠 Tech Stack

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Solana Wallet Adapter.
- **Backend:** Go (Golang), Standard Library + Gorilla Mux/Fiber (implied).
- **Database:** PostgreSQL (with migrations).
- **Blockchain:** Solana Web3.js, Solana Go SDK.

## 🗺️ Project Roadmap (4 Phases)

This project was built in 4 distinct phases. You can explore the code at each stage by checking out the corresponding branches.

### [Phase 1: Wallet Connection & Balance](git checkout phase-1-frontend-setup)
*Focus: Frontend Setup & Web3 Integration*
- Implemented Solana Wallet Adapter.
- UI for connecting wallets and displaying user's USDC balance on Devnet.

### [Phase 2: Protected Paywall Foundation](git checkout phase-2-backend-db)
*Focus: Backend Architecture & Database*
- Set up PostgreSQL schema (`paid_wallet`, `invoices`).
- Developed the Go backend API to check payment status (`GET /api/content`).
- Created the "Locked" vs. "Unlocked" UI states.

### [Phase 3: Payment Logic & Blockchain Watcher](git checkout phase-3-core-payment)
*Focus: The Core Payment Flow*
- Invoice generation logic (`POST /api/invoice`).
- **Transaction Watcher:** A background worker monitoring the Solana blockchain for specific memo signals.
- Frontend polling for real-time payment confirmation.

### [Phase 4: Polish & Production Ready](git checkout phase-4-polished)
*Focus: UX, Security & Edge Cases*
- Added "Recheck Payment" flow for manual validation.
- Implemented Rate Limiting to prevent API abuse.
- Handling edge cases (double payments, timeouts) and UI polish.

## 🏁 Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd solana-usdc-paywall
   ```

2. **Setup Environment:**
- Copy ```.env.example``` to ```.env``` in both ```backend``` and ```frontend``` folders.

- Configure your PostgreSQL connection string and Solana RPC URL.

3. **Run Backend:**
```bash
cd backend
make run
```

4. **Run Frontend:**
```bash
cd frontend
npm run dev
```