import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TestWETH", (m) => {
  const testWETH = m.contract("TestWETH", []);
  return { testWETH };
});
