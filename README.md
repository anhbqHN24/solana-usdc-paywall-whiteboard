## 🔍 Deep Dive: Phase 2 - Database & Access Control

This phase introduces the server-side logic. We moved from a static frontend to a full-stack application with state management.

### Key Features Implemented:
- **PostgreSQL Schema:** Designed tables:
    - `invoices`: Tracks payment intents (UUID, amount, status).
    - `paid_wallets`: Stores addresses that have successfully unlocked content.
- **Go API Server:** Set up the main HTTP server structure.
- **Access Check Endpoint:** `GET /api/content`
    - Checks the DB to see if `wallet_address` exists in `paid_wallets`.
    - Returns restricted content or a "402 Payment Required" status.

### Technical Highlights:
- **Database Migrations:** SQL scripts to ensure schema consistency (`up` and `down` migrations).
- **Separation of Concerns:** Clean architecture separating `handlers` (HTTP logic) from `database` (SQL queries).
