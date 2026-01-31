"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { isValidSolanaAddress, USDC_MINT_ADDRESS } from "@/lib/solana";

export function PaymentButton() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handlePayment = async () => {
    if (!connected || !publicKey) {
      setStatus("Please connect your wallet");
      return;
    }

    const recipientTrimmed = recipient.trim();
    if (!recipientTrimmed || !isValidSolanaAddress(recipientTrimmed)) {
      setStatus("Invalid recipient address");
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setStatus("Invalid amount");
      return;
    }

    // USDC uses 6 decimals.
    // 1 USDC = 1,000,000 micro-units
    const amountInSmallestUnit = Math.floor(numericAmount * 1_000_000);

    setLoading(true);
    setStatus("Processing payment...");

    try {
      const transaction = new Transaction();
      const recipientPubKey = new PublicKey(recipientTrimmed);

      // 1. Get the Sender's USDC Associated Token Account (ATA)
      const senderAta = await getAssociatedTokenAddress(
        USDC_MINT_ADDRESS,
        publicKey,
      );

      // 2. Get the Recipient's USDC Associated Token Account (ATA)
      const recipientAta = await getAssociatedTokenAddress(
        USDC_MINT_ADDRESS,
        recipientPubKey,
      );

      // 3. Check if the recipient already has a USDC account
      // We fetch account info to see if it exists.
      const recipientAccountInfo =
        await connection.getAccountInfo(recipientAta);

      // If it doesn't exist, we add an instruction to create it
      if (!recipientAccountInfo) {
        setStatus("Creating recipient token account...");
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // Payer (sender pays the creation fee, ~0.002 SOL)
            recipientAta, // The new account to create
            recipientPubKey, // The owner of the new account
            USDC_MINT_ADDRESS, // The mint (USDC)
          ),
        );
      }

      // 4. Add the Transfer Instruction
      transaction.add(
        createTransferInstruction(
          senderAta, // Source (Sender's ATA)
          recipientAta, // Destination (Recipient's ATA)
          publicKey, // Owner of source (You)
          amountInSmallestUnit, // Amount
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      transaction.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // 5. Send Transaction
      const signature = await sendTransaction(transaction, connection);
      setStatus("Transaction sent. Confirming...");

      await connection.confirmTransaction(signature, "confirmed");
      setStatus("Payment confirmed!");
      console.log("Signature:", signature);
    } catch (error: unknown) {
      console.error("Error during payment:", error);
      const message = error instanceof Error ? error.message : String(error);

      // Helpful error parsing
      if (message.includes("Account")) {
        setStatus("Error: Ensure your wallet has USDC to send.");
      } else {
        setStatus(`Error: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const recipientValid =
    recipient.trim() === "" || isValidSolanaAddress(recipient.trim());
  const amountValid = !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-grow">
          <label
            htmlFor="recipient"
            className="block text-sm font-medium text-gray-700"
          >
            Recipient wallet
          </label>
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. 7xKX...sU"
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            disabled={loading}
          />
        </div>
        <div className="w-full sm:w-28">
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-700"
          >
            Amount (USDC)
          </label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            disabled={loading}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handlePayment}
        disabled={loading || !connected || !recipient.trim() || !amountValid}
        className="px-6 py-3 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
      >
        {loading ? "Processing..." : `Pay ${amount} USDC`}
      </button>
      {status && (
        <p className="text-sm text-center text-gray-600 mt-2">{status}</p>
      )}
    </div>
  );
}
