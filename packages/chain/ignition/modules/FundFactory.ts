import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FundFactory", (m) => {
  const fundImplementation = m.contract("Fund", []);
  const fundFactory = m.contract("FundFactory", [fundImplementation]);
  return { fundImplementation, fundFactory };
});
