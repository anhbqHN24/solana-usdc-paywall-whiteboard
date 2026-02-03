"use client";

import { WalletContextProvider } from "@/components/WalletProvider";
import { Paywall } from "@/components/Paywall";
import { CloudArrowDownIcon, CheckBadgeIcon } from "@heroicons/react/24/solid";

export default function Home() {
  return (
    <WalletContextProvider>
      <Paywall>
        {/* Premium Content: Display after sucessful payment */}
        <div className="space-y-8 animate-fade-in">
          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800">
            <div className="bg-green-100 p-1 rounded-full">
              <CheckBadgeIcon className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold">Access Granted!</span> You can now
              view the full guide below.
            </div>
          </div>

          {/* Premium Content */}
          <div className="prose prose-lg text-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-rose-100 text-rose-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">
                1
              </span>
              Gio-ji Temple
            </h2>
            <p>
              Unlike the main Arashiyama bamboo grove, Gio-ji is a small nunnery
              with a moss garden that looks like a fairytale. It is incredibly
              quiet.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg text-sm flex flex-col sm:flex-row gap-4 border border-gray-100">
              <div>
                <strong>📍 GPS:</strong> 35.0211° N, 135.6705° E
              </div>
              <div>
                <strong>💴 Entry:</strong> 300 JPY
              </div>
              <div>
                <strong>🕒 Best time:</strong> 9:00 AM
              </div>
            </div>

            <hr className="my-8 border-gray-100" />

            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="bg-rose-100 text-rose-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">
                2
              </span>
              Otagi Nenbutsu-ji
            </h2>
            <p>
              This temple features 1,200 stone statues, each with a different
              facial expression. Some are laughing, some are drinking sake, and
              some are holding cats. It was built by ordinary people, not
              emperors.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg text-sm flex flex-col sm:flex-row gap-4 border border-gray-100">
              <div>
                <strong>📍 GPS:</strong> 35.0289° N, 135.6617° E
              </div>
              <div>
                <strong>💴 Entry:</strong> 500 JPY
              </div>
            </div>

            {/* Download Button */}
            <div className="mt-12 p-8 bg-gray-900 rounded-2xl text-white text-center shadow-xl">
              <h3 className="text-xl font-bold mb-2">
                Download the Full Itinerary PDF
              </h3>
              <p className="text-gray-400 mb-6 text-sm">
                Includes train schedules, map links, and restaurant
                recommendations.
              </p>
              <button className="bg-white text-gray-900 font-bold py-3 px-8 rounded-full hover:bg-gray-100 transition-all flex items-center gap-2 mx-auto">
                <CloudArrowDownIcon className="w-5 h-5" />
                Download PDF (4.2 MB)
              </button>
            </div>
          </div>
        </div>
      </Paywall>
    </WalletContextProvider>
  );
}
