import { network } from "hardhat";
import { getAddress, encodeAbiParameters, parseAbiParameters, keccak256 } from "viem";
import FundFactory from "../ignition/modules/FundFactory.ts";
import FundToken from "../ignition/modules/FundToken.ts";

const FUND_TERMS: string = "bafkreie7525ywkhwglluidqr3ule3jsd22bfyfs7yx6jgtlc3v34enosji";
const FUND_TOKEN_DRIP: bigint = 1000000n;

async function main() {
  const { ignition, viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClient = await viem.getWalletClient();
  const [deployer, ...accounts] = await walletClient.getAddresses();
  const chainId = await publicClient.getChainId();

  // FIXME: `create2` just doesn't seem to work when using ignition scripts...
  // const deployArgs = { defaultSender: getAddress(deployer), strategy: 'create2' };
  const deployArgs = {};
  const { fundImplementation, fundFactory } = await ignition.deploy(FundFactory, deployArgs);
  const { fundToken } = await ignition.deploy(FundToken, deployArgs);

  {
    console.log(`Distributing test tokens...`);
    for (const account of accounts) {
      const accountBalance = (await publicClient.readContract({
        address: fundToken.address,
        abi: fundToken.abi,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;

      if (accountBalance === 0n) {
        const hash = await walletClient.writeContract({
          account: deployer,
          address: fundToken.address,
          abi: fundToken.abi,
          functionName: 'transfer',
          args: [account, FUND_TOKEN_DRIP * 10n ** 18n],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`> ${FUND_TOKEN_DRIP} $fund => ${account} (${receipt.status})`);
      }
    }
  }

  {
    console.log(`Deploying test contract...`);
    let existingFunds = (await publicClient.readContract({
      address: fundFactory.address,
      abi: fundFactory.abi,
      functionName: "instances",
      args: [],
    })) as any[];

    if (existingFunds.length === 0) {
      const fundInitArgs = encodeAbiParameters(
        parseAbiParameters('address worker, address oracle, uint256 cut, address token, string terms'),
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
      console.log(`> Construct fund => ${result} (${receipt.status})`);
    }

    const fundSignature = (await publicClient.readContract({
      address: existingFunds[0],
      abi: fundImplementation.abi,
      functionName: "termsSignature",
      args: [],
    })) as string;
    if (fundSignature === "0x") {
      const termsSign = await walletClient.signTypedData({
        account: deployer,
        domain: {
          name: 'Fund',
          version: '1',
          chainId: chainId,
          verifyingContract: existingFunds[0],
        },
        types: {
          SignTerms: [
            { name: 'terms', type: 'bytes32' },
          ],
        },
        primaryType: 'SignTerms',
        message: {
          terms: keccak256(FUND_TERMS),
        },
      });
      const hash = await walletClient.writeContract({
        account: deployer,
        address: existingFunds[0],
        abi: fundImplementation.abi,
        functionName: 'lockTerms',
        args: [termsSign],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`> Locking in fund => ${termsSign} (${receipt.status})`);
    }

    console.log(`Finished!`);
    console.log(`> Fund Contract @ ${existingFunds[0]}`);
    console.log(`> Worker @ ${deployer}`);
  }
}

main().catch(console.error);
