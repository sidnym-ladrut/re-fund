import hre from "hardhat";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import FundFactory from "../ignition/modules/FundFactory.ts";
import FundToken from "../ignition/modules/FundToken.ts";

const FUND_TERMS: string = `0x${'0'.repeat(64)}`;
const FUND_TOKEN_DRIP: BigInt = 1000000n;

async function main() {
  const connection = await hre.network.connect();
  const { fundImplementation, fundFactory } = await connection.ignition.deploy(FundFactory);
  const { fundToken } = await connection.ignition.deploy(FundToken);

  const publicClient = await connection.viem.getPublicClient();
  const walletClient = await connection.viem.getWalletClient();
  const [deployer, ...accounts] = await walletClient.getAddresses();

  { // Distribute Test Tokens //
    for (const account of accounts) {
      const accountBalance = (await publicClient.readContract({
        address: fundToken.address,
        abi: fundToken.abi,
        functionName: "balanceOf",
        args: [account],
      })) as BigInt;

      if (accountBalance === 0n) {
        const hash = await walletClient.writeContract({
          account: deployer,
          address: fundToken.address,
          abi: fundToken.abi,
          functionName: 'transfer',
          args: [account, FUND_TOKEN_DRIP * 10n ** 18n],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
      }
    }
  }

  { // Deploy Test Fund //
    let existingFunds = (await publicClient.readContract({
      address: fundFactory.address,
      abi: fundFactory.abi,
      functionName: "instances",
      args: [],
    })) as any[];

    if (existingFunds.length === 0) {
      const fundInitArgs = encodeAbiParameters(
        parseAbiParameters('address worker, address oracle, uint256 cut, address token, bytes32 terms'),
        [deployer, deployer, 0, fundToken.address, FUND_TERMS],
      );
      const { request, result } = await publicClient.simulateContract({
        account: deployer,
        address: fundFactory.address,
        abi: fundFactory.abi,
        functionName: 'deploy',
        args: [fundInitArgs],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      existingFunds.push(result);
    }

    const fundSignature = (await publicClient.readContract({
      address: existingFunds[0],
      abi: fundImplementation.abi,
      functionName: "termsSignature",
      args: [],
    })) as string;
    if (fundSignature === "0x") {
      const termsSign = await walletClient.signMessage({
        account: deployer,
        message: { raw: FUND_TERMS },
      });
      const hash = await walletClient.writeContract({
        account: deployer,
        address: existingFunds[0],
        abi: fundImplementation.abi,
        functionName: 'lockTerms',
        args: [termsSign],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
    }

    console.log(`Fund Contract @ ${existingFunds[0]}`);
    console.log(`> Worker @ ${deployer}`);
  }
}

main().catch(console.error);
