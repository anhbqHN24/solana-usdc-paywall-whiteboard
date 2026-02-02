"use client";

import { useEffect, useState, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getUsdcBalance, createUsdcTransfer } from "@/lib/solana";
import {
  PublicKey,
  Connection,
  clusterApiUrl,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  MapPinIcon,
  LockClosedIcon,
  CloudArrowDownIcon,
  StarIcon,
} from "@heroicons/react/24/solid";

export function Paywall({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- LOGIC TIMER (GIỮ NGUYÊN TỪ CODE CŨ) ---
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    setIsClient(true);
    const pendingPayment = localStorage.getItem("pending_payment_reference");
    if (pendingPayment) {
      setPolling(true);
    }
  }, []);

  useEffect(() => {
    const pendingPayment = localStorage.getItem("pending_payment_reference");
    const expiryTimestamp = localStorage.getItem("payment_expiry_timestamp");

    if (pendingPayment) {
      if (expiryTimestamp) {
        const remaining = Math.floor(
          (parseInt(expiryTimestamp) - Date.now()) / 1000,
        );
        if (remaining > 0) {
          setTimeLeft(remaining);
          setPolling(true);
        } else {
          handleExpire();
        }
      } else {
        startNewTimer();
      }
    }
  }, []);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) {
      if (timeLeft === 0) handleExpire();
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft]);

  const startNewTimer = () => {
    const duration = 5 * 60;
    const expiry = Date.now() + duration * 1000;
    setTimeLeft(duration);
    setIsExpired(false);
    localStorage.setItem("payment_expiry_timestamp", expiry.toString());
  };

  const handleExpire = () => {
    setIsExpired(true);
    setPolling(false);
    setLoading(false);
    localStorage.removeItem("pending_payment_reference");
    localStorage.removeItem("payment_expiry_timestamp");
  };

  const resetPayment = () => {
    setIsExpired(false);
    setTimeLeft(null);
    setLoading(false);
    localStorage.removeItem("pending_payment_reference");
    localStorage.removeItem("payment_expiry_timestamp");
  };

  // --- LOGIC BALANCE & POLLING (GIỮ NGUYÊN) ---
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
      resetPayment();
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [publicKey, polling]);

  // --- LOGIC THANH TOÁN (GIỮ NGUYÊN) ---
  const handlePayment = async () => {
    if (!publicKey) return;

    const merchantWallet = process.env.NEXT_PUBLIC_MERCHANT_WALLET;
    if (!merchantWallet) {
      alert("Merchant wallet not configured");
      return;
    }
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
    const devnetConnection = new Connection(rpcUrl, "confirmed");

    startNewTimer();
    setLoading(true);
    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const { reference } = await res.json();
      localStorage.setItem("pending_payment_reference", reference);

      const transaction = await createUsdcTransfer(
        devnetConnection,
        publicKey,
        new PublicKey(merchantWallet),
        10,
        reference,
      );

      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100000,
      });
      transaction.instructions.unshift(addPriorityFee);

      const latestBlockhash =
        await devnetConnection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      console.log("Sending transaction...");
      const signature = await sendTransaction(transaction, devnetConnection, {
        skipPreflight: true,
        maxRetries: 5,
      });

      console.log("Waiting for confirmation...");
      const confirmation = await devnetConnection.confirmTransaction(
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

      await fetch("/api/invoice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, signature }),
      });

      setPolling(true);
    } catch (error) {
      console.error("Payment failed", error);
      alert("Payment failed. Please check console for details.");
      resetPayment();
    }
  };

  const handleRecheck = async () => {
    const pendingRef = localStorage.getItem("pending_payment_reference");
    if (!pendingRef) {
      alert("No pending payment found to check.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: pendingRef }),
      });
      const data = await res.json();

      if (data.status === "paid") {
        setHasAccess(true);
        localStorage.removeItem("pending_payment_reference");
        alert("Payment confirmed! Access granted.");
      } else {
        alert("Payment still pending or not found.");
      }
    } catch (error) {
      console.error("Recheck failed", error);
      alert("Error checking payment status.");
    } finally {
      resetPayment();
    }
  };

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
          {/* Chỉ hiển thị số dư khi đã load xong client */}
          {isClient && publicKey && usdcBalance !== null && (
            <span className="hidden sm:block text-sm text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
              {usdcBalance.toFixed(2)} USDC
            </span>
          )}

          {/* --- SỬA LỖI Ở ĐÂY --- */}
          {/* Chỉ render nút Ví khi isClient = true để tránh lỗi Hydration */}
          {isClient && (
            <WalletMultiButton className="!bg-gray-900 hover:!bg-gray-800 !h-9 !px-4 !text-sm !font-medium !rounded-full" />
          )}
        </div>
      </div>
    </nav>
  );

  // --- CASE 1: ĐÃ MUA -> HIỆN FULL BÀI VIẾT (CHILDREN) ---
  if (hasAccess) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        {/* Nội dung Premium */}
        <main className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
          {children}
        </main>
      </div>
    );
  }

  // --- CASE 2: CHƯA MUA -> HIỆN PAYWALL ---
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <Navbar />

      <main className="flex-grow max-w-3xl mx-auto px-4 py-12 w-full">
        {/* Header Bài Viết */}
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

        {/* Nội dung Public (Teaser) */}
        <article className="prose prose-lg text-gray-600 leading-relaxed">
          <p>
            Kyoto is arguably the most beautiful city in Japan, but most
            visitors only stick to the Golden Pavilion and Fushimi Inari Shrine.
            While those are breathtaking, they are also incredibly crowded.
          </p>
          <p>
            After living in Kyoto for 3 years, I’ve discovered a collection of
            secret temples, quiet bamboo groves, and artisanal tea houses that
            aren't on Google Maps.
          </p>

          {/* Ảnh minh họa */}
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

            {/* --- PHẦN TƯƠNG TÁC (BUTTONS) --- */}
            {!isClient ? (
              <div className="w-full h-12 bg-gray-100 rounded-xl animate-pulse"></div>
            ) : (
              <>
                {!publicKey ? (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-sm text-gray-600 mb-3">
                      Connect your wallet to purchase
                    </p>
                    <div className="flex justify-center">
                      <WalletMultiButton className="!bg-rose-600 hover:!bg-rose-700 !w-full !justify-center" />
                    </div>
                  </div>
                ) : isExpired ? (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100">
                    <p className="font-bold">Session Expired</p>
                    <p className="text-sm mb-3">
                      The 5-minute payment window has closed.
                    </p>
                    <button
                      onClick={resetPayment}
                      className="text-sm underline hover:text-red-800 font-medium"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Timer Display */}
                    {timeLeft !== null && (
                      <div
                        className={`text-xs font-mono font-medium py-1 px-3 rounded-full inline-block mb-2 ${timeLeft < 60 ? "bg-red-50 text-red-500 animate-pulse" : "bg-rose-50 text-rose-500"}`}
                      >
                        Rate expires in: {formatTime(timeLeft)}
                      </div>
                    )}

                    {/* Pay Button */}
                    <button
                      onClick={handlePayment}
                      disabled={loading || (timeLeft !== null && timeLeft > 0)}
                      className="w-full py-3.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                    >
                      {loading || (timeLeft !== null && timeLeft > 0) ? (
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
                          Processing...
                        </>
                      ) : (
                        "Unlock Now"
                      )}
                    </button>

                    {/* Recheck Link */}
                    <button
                      onClick={handleRecheck}
                      disabled={loading}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      I already paid? Check status
                    </button>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-gray-400 mt-6 flex items-center justify-center gap-1">
              Powered by Solana{" "}
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span> Instant
              Access
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
