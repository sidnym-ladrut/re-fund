import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FUND_TERMS: string = `0x${'0'.repeat(64)}`;
// FIXME: Retrieved out-of-band through `npx hardhat run -- scripts/SignMessage.ts`
const FUND_SIGN: string = '0xe82ed51b2b3964a6779171ee6589b1b2f5b5ebb77c1555626205d4619cb8df271a3f5c43f6b0ea3c76d852252d8a19539aa3ca2cb9fb66af3ac4dee7e846b4321c';

export default buildModule("FundSample", (m) => {
  const deployer = m.getAccount(0);

  const fundToken = m.contract("FundToken");
  const fund = m.contract("Fund", [deployer, 1e3, fundToken, FUND_TERMS]);

  m.call(fund, "lockTerms", [FUND_SIGN]);
  // FIXME: Use number of active hardhat accounts as the upper limit here.
  for (let i = 1; i < 10; i++) {
    const funder = m.getAccount(i);
    m.call(fundToken, "transfer", [funder, 1000n * 10n ** 18n], {
      id: `FundToken_transfer_${i}`,
    });
  }

  return { fund, fundToken };
});
