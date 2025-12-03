import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TestUSDT", (m) => {
  const testUSDT = m.contract("TestUSDT", []);
  return { testUSDT };
});
