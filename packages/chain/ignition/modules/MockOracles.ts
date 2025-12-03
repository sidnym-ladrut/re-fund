import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MockOraclesModule = buildModule("MockOracles", (m) => {
  // Deploy Mock Price Feeds for local testing
  // All prices use 8 decimals (Chainlink standard)
  // Prices updated: Dec 1, 2025

  // USDC/USD Feed - Price = $1.00
  const usdcFeed = m.contract("MockV3Aggregator", [8, 100000000], { id: "UsdcFeed" });

  // USDT/USD Feed - Price = $1.00
  const usdtFeed = m.contract("MockV3Aggregator", [8, 100000000], { id: "UsdtFeed" });

  // FUND Token Feed - Price = $0.50 (test token)
  const fundFeed = m.contract("MockV3Aggregator", [8, 50000000], { id: "FundFeed" });

  // WETH/USD Feed - Price = $3,638.00
  const wethFeed = m.contract("MockV3Aggregator", [8, 363800000000], { id: "WethFeed" });

  return { usdcFeed, usdtFeed, fundFeed, wethFeed };
});

export default MockOraclesModule;
