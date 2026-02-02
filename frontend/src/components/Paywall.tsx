"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getUsdcBalance, createUsdcTransfer } from "@/lib/solana";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";

export function Paywall({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const pendingPayment = localStorage.getItem("pending_payment_reference");
    if (pendingPayment) {
      setPolling(true);
    }
  }, []);

  useEffect(() => {
    if (publicKey) {
      getUsdcBalance(connection, publicKey).then(setUsdcBalance);
      fetch(`/api/content?walletAddress=${publicKey.toBase58()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.hasAccess) {
            setHasAccess(true);
            localStorage.removeItem("pending_payment_reference");
          }
        })
        .catch(() => setHasAccess(false));
    } else {
      setUsdcBalance(null);
      setHasAccess(false);
    }
  }, [publicKey, connection]);

  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!publicKey || !polling) return;

    const interval = setInterval(() => {
      fetch(`/api/content?walletAddress=${publicKey.toBase58()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.hasAccess) {
            setHasAccess(true);
            setPolling(false);
            localStorage.removeItem("pending_payment_reference");
          }
        });
    }, 2000);

    const timeout = setTimeout(() => {
      setPolling(false);
      localStorage.removeItem("pending_payment_reference");
      alert("Payment confirmation timed out. Please try again later.");
    }, 60000); // 1 minute timeout

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [publicKey, polling]);

  const handlePayment = async () => {
    if (!publicKey) return;

    const merchantWallet = process.env.NEXT_PUBLIC_MERCHANT_WALLET;
    if (!merchantWallet) {
      alert("Merchant wallet not configured");
      return;
    }

    setLoading(true);
    try {
      // Force Devnet connection to ensure we get a Devnet blockhash and transaction
      const devnetConnection = new Connection(
        clusterApiUrl("devnet"),
        "confirmed",
      );

      console.log(devnetConnection);

      // 1. Get a payment reference
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const { reference } = await res.json();
      localStorage.setItem("pending_payment_reference", reference);

      // 2. Create the transaction with the reference as a memo
      const transaction = await createUsdcTransfer(
        devnetConnection,
        publicKey,
        new PublicKey(merchantWallet),
        10,
        reference,
      );

      // 3. Send the transaction
      const signature = await sendTransaction(transaction, devnetConnection);

      // 4. Send the signature to the backend
      await fetch("/api/invoice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, signature }),
      });

      setPolling(true);
      alert("Payment sent! Please wait for confirmation.");
    } catch (error) {
      console.error("Payment failed", error);
      localStorage.removeItem("pending_payment_reference");
      alert("Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-3 rounded-lg shadow-lg text-sm">
        <p>Need Devnet USDC?</p>
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        >
          Visit Circle's Faucet
        </a>
      </div>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold mb-4">Premium Content</h1>
          <p className="text-gray-600 mb-6">
            Connect your wallet and pay 10 USDC to access this content.
          </p>

          <div className="flex flex-col items-center space-y-4">
            {!isClient ? (
              <div className="w-full h-12 rounded-lg bg-gray-200 animate-pulse" />
            ) : (
              <>
                <WalletMultiButton />

                {publicKey && (
                  <div className="text-center">
                    <p className="font-mono">
                      {publicKey.toBase58().slice(0, 4)}...
                      {publicKey.toBase58().slice(-4)}
                    </p>
                    <p>
                      USDC Balance:{" "}
                      {usdcBalance !== null ? (
                        <span className="font-bold">
                          {usdcBalance.toFixed(2)}
                        </span>
                      ) : (
                        "Loading..."
                      )}
                    </p>
                  </div>
                )}
                {publicKey && (
                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className={`w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 flex justify-center items-center ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {loading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      "Pay 10 USDC"
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
