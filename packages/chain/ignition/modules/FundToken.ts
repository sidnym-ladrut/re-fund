import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FundToken", (m) => {
  const fundToken = m.contract("FundToken");
  return { fundToken };
});
