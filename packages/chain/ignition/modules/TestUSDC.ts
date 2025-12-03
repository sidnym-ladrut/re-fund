import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TestUSDC", (m) => {
  const testUSDC = m.contract("TestUSDC", []);
  return { testUSDC };
});
