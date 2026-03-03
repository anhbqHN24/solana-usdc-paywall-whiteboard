"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getUsdcBalance, createUsdcTransfer } from "@/lib/solana";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  MapPinIcon,
  LockClosedIcon,
  StarIcon,
} from "@heroicons/react/24/solid";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

// --- NEW: UNIFIED PAYMENT STATE ---
type PaymentState =
  | "idle"
  | "creating_invoice"
  | "sending_transaction"
  | "confirming_transaction"
  | "waiting_for_backend"
  | "confirmed"
  | "error"
  | "expired";

const paymentStatusMessages: { [key in PaymentState]?: string } = {
  creating_invoice: "Initializing...",
  sending_transaction: "Approve in wallet...",
  confirming_transaction: "Finalizing...",
  waiting_for_backend: "Verifying payment...",
};

export function Paywall({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startNewTimer = () => {
    const duration = 5 * 60;
    const expiry = Date.now() + duration * 1000;
    setTimeLeft(duration);
    localStorage.setItem("payment_expiry_timestamp", expiry.toString());
  };

  const resetPaymentState = () => {
    setPaymentState("idle");
    setTimeLeft(null);
    localStorage.removeItem("pending_payment_reference");
    localStorage.removeItem("payment_expiry_timestamp");
  };

  const refreshAccess = useCallback(async (walletAddress: string) => {
    const res = await fetch(`/api/content?walletAddress=${walletAddress}`);
    if (!res.ok) {
      setHasAccess(false);
      return false;
    }

    const data = await res.json();
    const granted = Boolean(data.hasAccess);
    setHasAccess(granted);
    return granted;
  }, []);

  // --- LOGIC GET WALLET USDC BALANCE & CHECK ACCESS RIGHT ---
  useEffect(() => {
    if (publicKey) {
      getUsdcBalance(connection, publicKey).then(setUsdcBalance);
      (async () => {
        try {
          const granted = await refreshAccess(publicKey.toBase58());
          if (granted) {
            setPaymentState("confirmed");
            localStorage.removeItem("pending_payment_reference");
          }
        } catch {
          setHasAccess(false);
        }
      })();
    } else {
      setUsdcBalance(null);
      setHasAccess(false);
    }
  }, [publicKey, connection, refreshAccess]);

  // --- FIX: TIMER LOGIC ---
  useEffect(() => {
    if (timeLeft === null || paymentState === "idle") return;

    if (timeLeft === 0) {
      setPaymentState("expired");
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, paymentState]);

  // --- POLLING LOGIC FOR AMBIGUOUS STATES ---
  useEffect(() => {
    if (paymentState !== "waiting_for_backend" || !publicKey) {
      return;
    }

    const checkStatus = async () => {
      const granted = await refreshAccess(publicKey.toBase58());
      if (granted) {
        setPaymentState("confirmed");
        getUsdcBalance(connection, publicKey).then(setUsdcBalance);
      }
    };

    // Start polling immediately and then every 3 seconds
    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 3000);

    // Stop polling after 60 seconds
    const timeout = setTimeout(() => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // --- FIX: IMPROVE TIMEOUT MESSAGE ---
      if (paymentState === "waiting_for_backend") {
        setPaymentState("error");
        alert(
          "Confirmation is taking longer than expected. Your transaction is likely safe on-chain. Please click 'I already paid' in a minute to re-check.",
        );
      }
    }, 60000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      clearTimeout(timeout);
    };
  }, [paymentState, publicKey, connection, refreshAccess]);

  // --- REFACTORED PAYMENT LOGIC ---
  const handlePayment = async () => {
    if (!publicKey) return;

    const merchantWallet = process.env.NEXT_PUBLIC_MERCHANT_WALLET;
    if (!merchantWallet) {
      alert("Merchant wallet not configured");
      return;
    }

    setPaymentState("creating_invoice");
    startNewTimer();

    try {
      // 1. Create invoice on backend to get a reference
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      if (!res.ok) {
        throw new Error("Unable to create invoice");
      }
      const { reference } = await res.json();
      localStorage.setItem("pending_payment_reference", reference);

      // 2. Create and send the transaction
      setPaymentState("sending_transaction");
      const transaction = await createUsdcTransfer(
        connection,
        publicKey,
        new PublicKey(merchantWallet),
        10,
        reference,
      );

      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100000,
      });
      transaction.instructions.unshift(addPriorityFee);

      transaction.feePayer = publicKey;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
      });

      // 3. Immediately try to confirm with the backend.
      setPaymentState("confirming_transaction");
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (confirmation.value.err) {
        throw new Error("Transaction failed on-chain! Please try again.");
      }

      const confirmRes = await fetch("/api/invoice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, signature }),
        signal: AbortSignal.timeout(8000),
      });

      if (confirmRes.ok) {
        const granted = await refreshAccess(publicKey.toBase58());
        if (granted) {
          setPaymentState("confirmed");
          getUsdcBalance(connection, publicKey).then(setUsdcBalance);
        } else {
          setPaymentState("waiting_for_backend");
        }
      } else {
        console.log(
          "Backend confirmation failed or timed out. Moving to polling state.",
        );
        setPaymentState("waiting_for_backend");
      }
    } catch (error) {
      console.error("Payment failed", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        setPaymentState("waiting_for_backend");
      } else {
        setPaymentState("error");
        resetPaymentState();
      }
    }
  };

  // --- FIX: RECHECK LOGIC ---
  const handleRecheck = async () => {
    const reference = localStorage.getItem("pending_payment_reference");
    if (!reference) {
      alert("No pending payment found to re-check.");
      return;
    }
    if (!publicKey) {
      alert("Connect wallet first.");
      return;
    }

    setPaymentState("confirming_transaction"); // Show loading indicator

    try {
      const res = await fetch("/api/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          walletAddress: publicKey.toBase58(),
        }),
      });

      if (!res.ok) {
        setPaymentState("idle");
        alert("Re-check failed. Please try again.");
        return;
      }

      const data = await res.json();

      if (data.status === "paid") {
        const granted = await refreshAccess(publicKey.toBase58());
        if (granted) {
          setPaymentState("confirmed");
          alert("Payment confirmed successfully! Access granted.");
        } else {
          setPaymentState("waiting_for_backend");
          alert("Payment verified, finalizing access. Please wait.");
        }
      } else if (data.status === "confirmed_on_chain") {
        setPaymentState("waiting_for_backend");
        alert("Transaction found on-chain. Waiting for backend recovery.");
      } else if (data.status === "pending") {
        setPaymentState("waiting_for_backend");
        alert("Payment is still pending. The network is busy. Please wait.");
      } else {
        resetPaymentState();
        alert("Payment not found. The transaction may have failed or expired.");
      }
    } catch (error) {
      console.error("Re-check failed", error);
      setPaymentState("idle");
      alert("An error occurred while re-checking the payment status.");
    }
  };

  const disableUnlock =
    paymentState === "creating_invoice" ||
    paymentState === "sending_transaction" ||
    paymentState === "confirming_transaction" ||
    paymentState === "waiting_for_backend";

  const disableRecheck =
    paymentState === "creating_invoice" ||
    paymentState === "sending_transaction" ||
    paymentState === "confirming_transaction";

  // --- UI COMPONENTS ---
  const Navbar = () => (
    <nav className="border-b border-gray-100 bg-white/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 font-serif text-xl font-bold text-gray-800">
          <MapPinIcon className="w-6 h-6 text-rose-500" />
          <span>
            Wanderlust<span className="text-rose-500">.</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Only display balance after establish connection with wallet */}
          {publicKey && usdcBalance !== null && (
            <span className="hidden sm:block text-sm text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
              {usdcBalance.toFixed(2)} USDC
            </span>
          )}

          <WalletMultiButton className="!bg-gray-900 hover:!bg-gray-800 !h-9 !px-4 !text-sm !font-medium !rounded-full" />
        </div>
      </div>
    </nav>
  );

  // --- CASE 1: DONE PURCHASE -> DISPLAY FULL PREMIUM CONTENT (CHILDREN) ---
  if (hasAccess) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        {/* Premium Content */}
        <main className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
          {children}
        </main>
      </div>
    );
  }

  // --- CASE 2: NOT PURCHASE YET -> VIEW PAYWALL ---
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <Navbar />

      <main className="flex-grow max-w-3xl mx-auto px-4 py-12 w-full">
        {/* News Header */}
        <div className="space-y-4 mb-8">
          <span className="text-rose-600 font-bold text-sm tracking-wider uppercase flex items-center gap-2">
            <StarIcon className="w-4 h-4" /> Premium Guide
          </span>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 leading-tight">
            7 Hidden Gems in Kyoto That Tourists Always Miss
          </h1>
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <div className="w-8 h-8 rounded-full bg-gray-200"></div>
            <span>
              By <strong>Sarah Jenkins</strong>
            </span>
            <span>•</span>
            <span>Updated 2 hours ago</span>
          </div>
        </div>

        {/* News Public Content (Teaser) */}
        <article className="prose prose-lg text-gray-600 leading-relaxed">
          <p>
            Kyoto is arguably the most beautiful city in Japan, but most
            visitors only stick to the Golden Pavilion and Fushimi Inari Shrine.
            While those are breathtaking, they are also incredibly crowded.
          </p>
          <p>
            After living in Kyoto for 3 years, I've discovered a collection of
            secret temples, quiet bamboo groves, and artisanal tea houses that
            aren't on Google Maps.
          </p>

          <div className="my-8 rounded-xl overflow-hidden bg-gray-100 h-64 md:h-80 w-full relative group shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
              <span className="text-white font-medium flex items-center gap-2">
                <MapPinIcon className="w-5 h-5" /> Arashiyama Secret Path
              </span>
            </div>
          </div>

          <p className="blur-mask select-none opacity-50">
            The first spot on our list is actually located just 5 minutes from
            the main station, hidden behind a small wooden gate that looks like
            a private residence. Once you step inside, the noise of the city
            completely disappears...
          </p>
        </article>

        {/* PAYWALL CARD */}
        <div className="relative -mt-20 z-10">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-2xl p-6 md:p-8 text-center max-w-xl mx-auto">
            <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <LockClosedIcon className="w-6 h-6" />
            </div>

            <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">
              Unlock the Full Guide
            </h3>
            <p className="text-gray-500 mb-6">
              Get instant access to all 7 locations, exact GPS coordinates, and
              a downloadable PDF itinerary.
            </p>

            {/* Pricing Display */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="text-4xl font-bold text-gray-900">10 USDC</span>
            </div>

            {/* --- INTERACTION (BUTTONS) --- */}
            {!publicKey ? (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-600 mb-3">
                  Connect your wallet to purchase
                </p>
                <div className="flex justify-center">
                  <WalletMultiButton className="!bg-rose-600 hover:!bg-rose-700 !w-full !justify-center" />
                </div>
              </div>
            ) : paymentState === "expired" ? (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100">
                <p className="font-bold">Session Expired</p>
                <p className="text-sm mb-3">
                  The 5-minute payment window has closed.
                </p>
                <button
                  onClick={resetPaymentState}
                  className="text-sm underline hover:text-red-800 font-medium"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Timer Display */}
                {timeLeft !== null && paymentState !== "idle" && (
                  <div
                    className={`text-xs font-mono font-medium py-1 px-3 rounded-full inline-block mb-2 ${timeLeft < 60 ? "bg-red-50 text-red-500 animate-pulse" : "bg-rose-50 text-rose-500"}`}
                  >
                    Rate expires in: {formatTime(timeLeft)}
                  </div>
                )}

                {/* Pay Button */}
                <button
                  onClick={handlePayment}
                  disabled={disableUnlock}
                  className="w-full py-3.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {disableUnlock ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                      {paymentStatusMessages[paymentState] ?? "Processing..."}
                    </>
                  ) : (
                    "Unlock Now"
                  )}
                </button>

                {/* Recheck Link */}
                <button
                  onClick={handleRecheck}
                  disabled={disableRecheck}
                  className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                >
                  I already paid? Check status
                </button>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6 flex items-center justify-center gap-1">
              Powered by Solana{" "}
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span> Instant
              Access
            </p>
          </div>
        </div>
      </main>
      {/* USDC Devnet Airdrop */}
      <div className="fixed z-10 bottom-4 right-4 bg-gray-800 text-white p-3 rounded-lg shadow-lg text-sm">
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
    </div>
  );
}
