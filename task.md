# Project Tasks: USDC Paywall

## Phase 1: Connect wallet & check USDC balance
- [x] **Setup Wallet Provider**: Configure Solana Wallet Adapter for Next.js.
- [x] **Wallet Connection UI**: Add connect button to the frontend.
- [x] **Read USDC Balance**: Implement logic to fetch USDC balance from Devnet.
- [x] **Display State**: Show wallet address and balance when connected.

## Phase 2: Protected paywall
- [x] **Database Schema**: Create `paid_wallet` and `invoice` tables in PostgreSQL.
- [x] **Backend Setup**: Initialize Go server and DB connection.
- [x] **API Endpoint**: Implement `GET /api/content` to check payment status.
- [x] **Frontend Integration**: Call API to check access and show locked/unlocked state.

## Phase 3: Pay with USDC
- [ ] **Backend Invoice**: Implement `POST /api/invoice` to generate payment intent.
- [ ] **Transaction Watcher**: Create background worker to monitor blockchain for payments.
- [ ] **Frontend Payment**: Create and sign USDC transfer transaction with memo.
- [ ] **Polling**: Implement frontend polling for payment confirmation.
- [ ] **State Persistence**: Handle page refreshes and transaction storage.

## Phase 4: Polishing the app
- [ ] **Recheck Flow**: Implement `POST /api/recheck` for manual payment validation.
- [ ] **Frontend Polish**: Add "Recheck Payment" button and improve error handling.
- [ ] **Edge Cases**: Handle double payments, invalid memos, and timeouts.
- [ ] **Rate Limiting**: Protect recheck endpoint.
- [ ] **Testing**: Verify all flows on Devnet.
