import { PublicKey } from "@solana/web3.js";

// ----------------------------------------------------------------------
// NOTE: Ensure this is the correct USDC Mint address.
// The standard Circle USDC Devnet mint is often:
// '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
// ----------------------------------------------------------------------
export const USDC_MINT_ADDRESS = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ||
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
/** Returns true if the string is a valid Solana base58 public key. */
export function isValidSolanaAddress(value: string): boolean {
  if (!value || value.length < 32 || value.length > 44) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
