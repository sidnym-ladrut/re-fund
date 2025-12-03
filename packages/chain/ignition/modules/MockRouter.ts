import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MockRouterModule = buildModule("MockRouter", (m) => {
  const router = m.contract("MockSwapRouter");
  return { router };
});

export default MockRouterModule;
