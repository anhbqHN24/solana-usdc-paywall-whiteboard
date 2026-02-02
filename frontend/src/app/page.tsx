import { Paywall } from "@/components/Paywall";

export default function Home() {
  return (
    <Paywall>
      <div className="min-h-screen p-8">
        <h1 className="text-4xl font-bold mb-4">Welcome to Premium Content</h1>
        <p className="text-lg text-gray-600">
          You have successfully paid with USDC and can access this content.
        </p>
      </div>
    </Paywall>
  );
}
