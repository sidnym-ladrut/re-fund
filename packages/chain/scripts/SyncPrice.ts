import { createPublicClient, http, formatUnits } from "viem";
import { mainnet } from "viem/chains";

// Chainlink Price Feed Addresses (Mainnet) - checksummed
const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  "USDT/USD": "0x3E7d1eAB13ad0104EDf4e519B5cB7e28880Be93c", // Fixed checksum
  "USDC/USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
};

const AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  // Use a public mainnet RPC to read real prices
  const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http("https://eth.llamarpc.com"),
  });

  console.log("🌍 Fetching real prices from Mainnet Chainlink feeds...\n");

  for (const [pair, address] of Object.entries(CHAINLINK_FEEDS)) {
    try {
      const [, price, , updatedAt, ] = await mainnetClient.readContract({
        address,
        abi: AGGREGATOR_ABI,
        functionName: "latestRoundData",
      }) as [bigint, bigint, bigint, bigint, bigint];
      
      const decimals = await mainnetClient.readContract({
        address,
        abi: AGGREGATOR_ABI,
        functionName: "decimals",
      }) as number;
      
      const priceFormatted = parseFloat(formatUnits(price, decimals));
      const updatedDate = new Date(Number(updatedAt) * 1000).toLocaleString();
      
      console.log(`${pair}:`);
      console.log(`  Price: $${priceFormatted.toFixed(2)}`);
      console.log(`  Raw (${decimals} decimals): ${price.toString()}`);
      console.log(`  Updated: ${updatedDate}`);
      console.log();
    } catch (error: any) {
      console.log(`${pair}: Error fetching - ${error.message}\n`);
    }
  }

  console.log("💡 To use these prices in DeployTestEnv.ts, update the constants:");
  console.log("   const WETH_PRICE = <raw value>n;  // 8 decimals");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
