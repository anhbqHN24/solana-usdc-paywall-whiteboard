const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");

(async () => {
  const signature = process.argv[2];
  const merchantWalletArg = process.argv[3];
  const usdcMintArg = process.argv[4];

  if (!signature || !merchantWalletArg || !usdcMintArg) {
    console.error(
      "Usage: node get_transaction.js <signature> <merchant_wallet> <usdc_mint>",
    );
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) {
      console.error(`Transaction not found on ${rpcUrl}`);
      process.exit(1);
    }

    const merchantPublicKey = new PublicKey(merchantWalletArg);
    const usdcMintPublicKey = new PublicKey(usdcMintArg);
    const merchantAta = await getAssociatedTokenAddress(
      usdcMintPublicKey,
      merchantPublicKey,
    );

    console.log(
      JSON.stringify(
        {
          transaction: tx,
          merchantAta: merchantAta.toBase58(),
          rpcUrl: rpcUrl,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("Failed to get transaction:", error);
    process.exit(1);
  }
})();
