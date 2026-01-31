"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PaymentButton } from "./PaymentButton";

export function Paywall({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const [hasAccess, setHasAccess] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    const verified =
      typeof window !== "undefined" &&
      localStorage.getItem("payment_verified") === "true";
    setHasAccess(verified);
    setIsClient(true);
  }, []);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">Premium Content</h1>
        <p className="text-gray-600 mb-6">
          Connect any wallet and pay your desired amount of USDC to a recipient
          of your choice to access this content.
        </p>

        <div className="flex flex-col items-center space-y-4">
          {!isClient ? (
            <div className="w-full h-12 rounded-lg bg-gray-200 animate-pulse" />
          ) : (
            <>
              <WalletMultiButton />
              {publicKey && <PaymentButton />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
