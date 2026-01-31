# Solana USDC Paywall

A paywall that accepts **USDC on Solana**. Users connect **any wallet**, choose a **recipient wallet** to send USDC to, and the application verifies the transaction on-chain via an external library before granting access.

- **Frontend**: Next.js 14 (App Router) — wallet connection, paywall UI, and transaction verification.
- **Verification**: Handled client-side via integrated external SDK/library.

## Project structure

```text
solana_paywall/
├── src/
│   ├── app/             # App Router pages and layout
│   ├── components/      # React components (wallet, paywall, payment)
│   └── lib/             # Solana config and library integration
├── public/
├── package.json
└── .env.local.example
```

## Prerequisites

- **Node.js** 18+
- **Solana wallet** (e.g. Phantom, Solflare) with devnet USDC for testing

## Frontend (Next.js)

### Setup

1. Copy environment file and point to backend + merchant wallet:

   ```bash
   cd frontend
   cp .env.local.example .env.local
   # Edit .env.local:
   #   NEXT_PUBLIC_API_URL=http://localhost:8080
   #   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com  (or mainnet)
   #   NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (use https://faucet.circle.com/ for devnet usdc airdrop)
   ```

2. Install dependencies and run:

   ```bash
   npm install
   npm run dev
   ```

   App runs at `http://localhost:3000`.

### Environment variables

| Variable                     | Description                    | Default                    |
|-----------------------------|--------------------------------|----------------------------|
| `NEXT_PUBLIC_SOLANA_RPC_URL`| Solana RPC for wallet/transactions | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_USDC_MINT`     | USDC mint (optional)            | Mainnet USDC mint          |

## Flow

1. User opens the Next.js app and sees the paywall.
2. User connects **any** Solana wallet (Phantom, Solflare, etc.).
3. User enters the **recipient wallet address** (user choice) and clicks “Pay {input} USDC”; frontend builds an SPL token transfer to that recipient.
4. User signs the transaction in the wallet.

## Development

- Use **Solana devnet** and devnet USDC for testing; set `SOLANA_RPC_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL` to a devnet RPC.
- For production, use mainnet RPC and mainnet USDC mint; ensure the recipient wallet has a valid USDC (SPL) token account.
- Consider storing verified payments (e.g. signature + payer) in a database to prevent replay and to persist access.

## License

MIT
