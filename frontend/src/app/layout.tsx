import type { Metadata } from 'next';
import { WalletContextProvider } from '@/components/WalletProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solana USDC Paywall',
  description: 'Pay with USDC on Solana to access premium content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
