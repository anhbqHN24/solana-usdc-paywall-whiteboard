"use client";

import { useEffect, useState, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getUsdcBalance, createUsdcTransfer } from "@/lib/solana";
import {
  PublicKey,
  Connection,
  clusterApiUrl,
  TransactionExpiredBlockheightExceededError,
  ComputeBudgetProgram,
} from "@solana/web3.js";

export function Paywall({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(false);

  //Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null); // Số giây còn lại
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

  // Logic khởi tạo Timer
  useEffect(() => {
    setIsClient(true);
    const pendingPayment = localStorage.getItem("pending_payment_reference");
    const expiryTimestamp = localStorage.getItem("payment_expiry_timestamp");

    if (pendingPayment) {
      if (expiryTimestamp) {
        // Nếu đã có timer lưu trong storage, tính toán lại thời gian còn lại
        const remaining = Math.floor(
          (parseInt(expiryTimestamp) - Date.now()) / 1000,
        );
        if (remaining > 0) {
          setTimeLeft(remaining);
          setPolling(true); // Tiếp tục polling nếu còn thời gian
        } else {
          handleExpire(); // Nếu đã quá hạn thì báo lỗi luôn
        }
      } else {
        // Trường hợp cũ chưa có expiry, set mặc định 5 phút từ bây giờ
        startNewTimer();
      }
    }
  }, []);

  // Logic chạy đồng hồ đếm ngược
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
    const duration = 5 * 60; // 5 phút = 300 giây
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
    // Không auto-alert để tránh phiền, chỉ hiện UI báo hết hạn
  };

  // Reset luồng để thanh toán lại
  const resetPayment = () => {
    setIsExpired(false);
    setTimeLeft(null);
    setLoading(false);
    localStorage.removeItem("pending_payment_reference");
    localStorage.removeItem("payment_expiry_timestamp");
  };

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
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
    console.log("🔥 Đang dùng RPC URL:", rpcUrl);
    const devnetConnection = new Connection(rpcUrl, "confirmed");

    startNewTimer(); //before calling any API, start new timer
    setLoading(true);
    try {
      // 1. Lấy Invoice Reference
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const { reference } = await res.json();
      localStorage.setItem("pending_payment_reference", reference);

      // 2. Tạo Transaction cơ bản (Transfer + Memo)
      const transaction = await createUsdcTransfer(
        devnetConnection,
        publicKey,
        new PublicKey(merchantWallet),
        10,
        reference,
      );

      // 3. THÊM PHÍ ƯU TIÊN (PRIORITY FEE)
      // Quan trọng: Phải chèn vào ĐẦU (unshift) danh sách instructions
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100000,
      });
      transaction.instructions.unshift(addPriorityFee);

      // 4. Lấy Blockhash mới nhất
      const latestBlockhash =
        await devnetConnection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      // 5. Gửi Transaction
      console.log("Sending transaction...");
      const signature = await sendTransaction(transaction, devnetConnection, {
        skipPreflight: true,
        maxRetries: 5,
      });
      console.log("Tx Sent:", signature);

      // 6. Chờ xác nhận & KIỂM TRA LỖI ON-CHAIN
      console.log("Waiting for confirmation...");
      const confirmation = await devnetConnection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      // --- ĐOẠN MỚI: Check xem transaction có fail không ---
      if (confirmation.value.err) {
        console.error("Transaction failed on-chain:", confirmation.value.err);
        throw new Error("Transaction failed on-chain! Please try again.");
      }
      // -----------------------------------------------------

      console.log("Tx Confirmed Success!");

      // 7. Báo Backend
      await fetch("/api/invoice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, signature }),
      });

      setPolling(true);
      // alert("Payment successful! Access unlocking...");
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
        alert(
          "Payment still pending or not found. Please wait a moment and try again.",
        );
      }
    } catch (error) {
      console.error("Recheck failed", error);
      alert("Error checking payment status.");
    } finally {
      resetPayment();
    }
  };

  if (hasAccess) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Header bar cho User quản lý ví */}
        <div className="w-full bg-white shadow-sm p-4 flex justify-between items-center border-b px-8">
          <div className="font-bold text-gray-700">Premium Member Area</div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-green-600 font-medium px-3 py-1 bg-green-50 rounded-full">
              ● Active Access
            </span>
            <WalletMultiButton />
          </div>
        </div>

        {/* Nội dung Premium (Children) */}
        <main className="flex-grow p-8">{children}</main>
      </div>
    );
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

          {/* CASE 1: Đã hết hạn */}
          {isExpired ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4 text-center">
              <p className="font-bold">Transaction Expired</p>
              <p className="text-sm">The 5-minute payment window has closed.</p>
              <button
                onClick={resetPayment}
                className="mt-3 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* CASE 2: Đang trong phiên giao dịch (Có Timer) */}
              {timeLeft !== null && (
                <div className="mb-6 text-center">
                  <div className="text-sm text-gray-500 mb-1">
                    Time Remaining
                  </div>
                  <div className="text-4xl font-mono font-bold text-blue-600">
                    {formatTime(timeLeft)}
                  </div>
                  {loading && (
                    <div className="text-xs text-gray-400 mt-2 animate-pulse">
                      Processing transaction...
                    </div>
                  )}
                </div>
              )}
              {/* Nút Thanh Toán */}
              {!isExpired && (
                <div className="flex flex-col items-center space-y-4">
                  {!isClient ? (
                    <div className="w-full h-12 rounded-lg bg-gray-200 animate-pulse" />
                  ) : (
                    <>
                      <WalletMultiButton />

                      {publicKey && (
                        <div className="text-center">
                          {/* <p className="font-mono">
                      {publicKey.toBase58().slice(0, 4)}...
                      {publicKey.toBase58().slice(-4)}
                    </p> */}
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
                        <>
                          <button
                            onClick={handlePayment}
                            disabled={
                              loading || (timeLeft !== null && timeLeft > 0)
                            }
                            className={`w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 flex justify-center items-center ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {loading || (timeLeft !== null && timeLeft > 0) ? (
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
                          <button
                            onClick={handleRecheck}
                            disabled={loading}
                            className="text-sm text-blue-500 hover:text-blue-700 underline mt-2"
                          >
                            Already paid? Check status
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
