import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FundFactory", (m) => {
  // Define a parameter 'swapRouter' with a default value
  // Default is Uniswap V3 SwapRouter (valid for Sepolia/Mainnet/Optimism/Base)
  const swapRouterAddress = m.getParameter("swapRouter", "0xE592427A0AEce92De3Edee1F18E0157C05861564");

  // Pass the router address to the Fund constructor
  const fundImplementation = m.contract("Fund", [swapRouterAddress]);

  // Deploy the factory with the implementation
  const fundFactory = m.contract("FundFactory", [fundImplementation]);

  return { fundImplementation, fundFactory };
});
