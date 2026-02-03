"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getUsdcBalance } from "@/lib/solana";
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

export function Paywall({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  // --- LOGIC GET WALLET USDC BALANCE ---
  useEffect(() => {
    if (publicKey) {
      getUsdcBalance(connection, publicKey).then(setUsdcBalance);
    } else {
      setUsdcBalance(null);
    }
  }, [publicKey, connection]);

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

  // --- VIEW PAYWALL ---
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

            {/* --- CONTENT UNLOCK PRICE */}
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
            ) : (
              <>
                {/* Pay Button */}
                <button
                  onClick={() => alert("Comming Soon")}
                  className="w-full py-3.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  Unlock Content
                </button>
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
      {/* USDC Devnet Airdrop */}
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
    </div>
  );
}
