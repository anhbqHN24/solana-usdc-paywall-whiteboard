## 🔍 Deep Dive: Phase 1 - Wallet Integration

In this phase, we established the frontend foundation. The goal was to interact with the Solana blockchain from the browser.

### Key Features Implemented:
- **Wallet Adapter:** Configured `ConnectionProvider` and `WalletProvider` to support Phantom, Solflare, etc.
- **USDC Balance Fetching:** Implemented logic to query the Solana Devnet for the user's SPL Token Account (USDC Mint) and parse the balance.
- **Reactive UI:** The UI updates automatically when a user connects, disconnects, or changes accounts.

### Technical Highlights:
- Used `@solana/web3.js` to create connections to the Devnet cluster.
- Implemented safe dependency injection for the Wallet Button to avoid hydration errors in Next.js.
