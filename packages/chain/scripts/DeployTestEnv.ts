import { network } from "hardhat";
import { getAddress, encodeAbiParameters, parseAbiParameters, keccak256 } from "viem";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import FundFactory from "../ignition/modules/FundFactory.ts";
import FundToken from "../ignition/modules/FundToken.ts";
import TestUSDT from "../ignition/modules/TestUSDT.ts";
import TestUSDC from "../ignition/modules/TestUSDC.ts";
import TestWETH from "../ignition/modules/TestWETH.ts";
import MockRouter from "../ignition/modules/MockRouter.ts";

// Mock oracles deployed manually to avoid Ignition address collision
const __dirname = dirname(fileURLToPath(import.meta.url));
const MockV3Aggregator = JSON.parse(
  readFileSync(join(__dirname, "../artifacts/contracts/MockV3Aggregator.sol/MockV3Aggregator.json"), "utf-8")
);

const FUND_TERMS: string = "bafkreie7525ywkhwglluidqr3ule3jsd22bfyfs7yx6jgtlc3v34enosji";
const FUND_TOKEN_DRIP: bigint = 1000000n;
const TEST_USDT_DRIP: bigint = 100000n; // 100k tUSDT (6 decimals)
const TEST_USDC_DRIP: bigint = 100000n; // 100k tUSDC (6 decimals)
const TEST_WETH_DRIP: bigint = 10n; // 10 WETH (18 decimals) - worth ~$36,380

// Price feed values (8 decimals, Chainlink standard)
const FEED_DECIMALS = 8;
const FUND_PRICE = 50000000n;       // $0.50
const USDC_PRICE = 100000000n;      // $1.00
const USDT_PRICE = 100000000n;      // $1.00
const WETH_PRICE = 363800000000n;   // $3,638.00

async function main() {
  const { ignition, viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClient = await viem.getWalletClient();
  const [deployer, ...accounts] = await walletClient.getAddresses();
  const chainId = await publicClient.getChainId();

  // FIXME: `create2` just doesn't seem to work when using ignition scripts...
  // const deployArgs = { defaultSender: getAddress(deployer), strategy: 'create2' };
  const deployArgs = {};
  
  // Deploy MockSwapRouter for localhost testing
  const { router: mockRouter } = await ignition.deploy(MockRouter, deployArgs);
  console.log(`\n=== Mock Swap Router ===`);
  console.log(`MockSwapRouter @ ${mockRouter.address}`);
  console.log(`========================\n`);
  
  // Deploy FundFactory with MockRouter address
  const { fundImplementation, fundFactory } = await ignition.deploy(FundFactory, {
    ...deployArgs,
    parameters: {
      FundFactory: {
        swapRouter: mockRouter.address
      }
    }
  });
  const { fundToken } = await ignition.deploy(FundToken, deployArgs);
  const { testUSDT } = await ignition.deploy(TestUSDT, deployArgs);
  const { testUSDC } = await ignition.deploy(TestUSDC, deployArgs);
  const { testWETH } = await ignition.deploy(TestWETH, deployArgs);

  console.log(`\n=== Deployed Tokens ===`);
  console.log(`Type 1a (ERC20Permit 18dec): FundToken @ ${fundToken.address}`);
  console.log(`Type 1b (ERC20Permit 6dec):  TestUSDC  @ ${testUSDC.address}`);
  console.log(`Type 1c (ERC20Permit 18dec): TestWETH  @ ${testWETH.address}`);
  console.log(`Type 2  (Standard ERC20):    TestUSDT  @ ${testUSDT.address}`);
  console.log(`========================\n`);

  // Helper to deploy mock price feeds (defined here, called later after all token ops)
  const deployFeed = async (name: string, price: bigint) => {
    const hash = await walletClient.deployContract({
      abi: MockV3Aggregator.abi,
      bytecode: MockV3Aggregator.bytecode as `0x${string}`,
      args: [FEED_DECIMALS, price],
      account: deployer,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`> ${name} deployed @ ${receipt.contractAddress}`);
    return receipt.contractAddress!;
  };

  {
    console.log(`Distributing FundToken (permit)...`);
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
        console.log(`> ${FUND_TOKEN_DRIP} $FUND => ${account} (${receipt.status})`);
      }
    }
  }

  {
    console.log(`Distributing TestUSDT (no permit)...`);
    for (const account of accounts) {
      const accountBalance = (await publicClient.readContract({
        address: testUSDT.address,
        abi: testUSDT.abi,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;

      if (accountBalance === 0n) {
        const hash = await walletClient.writeContract({
          account: deployer,
          address: testUSDT.address,
          abi: testUSDT.abi,
          functionName: 'mint',
          args: [account, TEST_USDT_DRIP * 10n ** 6n],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`> ${TEST_USDT_DRIP} $tUSDT => ${account} (${receipt.status})`);
      }
    }
  }

  {
    console.log(`Distributing TestUSDC (permit, 6 decimals)...`);
    for (const account of accounts) {
      const accountBalance = (await publicClient.readContract({
        address: testUSDC.address,
        abi: testUSDC.abi,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;

      if (accountBalance === 0n) {
        const hash = await walletClient.writeContract({
          account: deployer,
          address: testUSDC.address,
          abi: testUSDC.abi,
          functionName: 'mint',
          args: [account, TEST_USDC_DRIP * 10n ** 6n],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`> ${TEST_USDC_DRIP} $tUSDC => ${account} (${receipt.status})`);
      }
    }
  }

  {
    console.log(`Distributing TestWETH (permit, 18 decimals)...`);
    for (const account of accounts) {
      const accountBalance = (await publicClient.readContract({
        address: testWETH.address,
        abi: testWETH.abi,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;

      if (accountBalance === 0n) {
        const hash = await walletClient.writeContract({
          account: deployer,
          address: testWETH.address,
          abi: testWETH.abi,
          functionName: 'mint',
          args: [account, TEST_WETH_DRIP * 10n ** 18n],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`> ${TEST_WETH_DRIP} $WETH => ${account} (${receipt.status})`);
      }
    }
  }

  {
    console.log(`Funding MockSwapRouter with all token types...`);
    
    // Fund with FUND tokens
    const fundRouterAmount = 10000000n * 10n ** 18n; // 10M $FUND
    let hash = await walletClient.writeContract({
      account: deployer,
      address: fundToken.address,
      abi: fundToken.abi,
      functionName: 'transfer',
      args: [mockRouter.address, fundRouterAmount],
    });
    let receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`> ${10000000n} $FUND => MockRouter (${receipt.status})`);

    // Fund with USDC tokens
    const usdcRouterAmount = 10000000n * 10n ** 6n; // 10M USDC (6 decimals)
    hash = await walletClient.writeContract({
      account: deployer,
      address: testUSDC.address,
      abi: testUSDC.abi,
      functionName: 'mint',
      args: [mockRouter.address, usdcRouterAmount],
    });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`> ${10000000n} USDC => MockRouter (${receipt.status})`);

    // Fund with USDT tokens
    const usdtRouterAmount = 10000000n * 10n ** 6n; // 10M USDT (6 decimals)
    hash = await walletClient.writeContract({
      account: deployer,
      address: testUSDT.address,
      abi: testUSDT.abi,
      functionName: 'mint',
      args: [mockRouter.address, usdtRouterAmount],
    });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`> ${10000000n} USDT => MockRouter (${receipt.status})`);

    // Fund with WETH tokens
    const wethRouterAmount = 1000n * 10n ** 18n; // 1000 WETH (18 decimals, worth ~$3.6M)
    hash = await walletClient.writeContract({
      account: deployer,
      address: testWETH.address,
      abi: testWETH.abi,
      functionName: 'mint',
      args: [mockRouter.address, wethRouterAmount],
    });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`> ${1000n} WETH => MockRouter (${receipt.status})`);
  }

  {
    console.log(`Deploying test funds (one per token type)...`);
    let existingFunds = (await publicClient.readContract({
      address: fundFactory.address,
      abi: fundFactory.abi,
      functionName: "instances",
      args: [],
    })) as any[];

    // Define test funds for each token type
    const testFunds = [
      { token: fundToken.address, name: "FundToken (⚡permit 18dec, $0.50)" },
      { token: testUSDC.address, name: "TestUSDC (⚡permit 6dec, $1.00)" },
      { token: testUSDT.address, name: "TestUSDT (standard, $1.00)" },
      { token: testWETH.address, name: "TestWETH (⚡permit 18dec, $3638)" },
    ];

    // Create a fund for each token if not enough funds exist
    for (let i = existingFunds.length; i < testFunds.length; i++) {
      const { token, name } = testFunds[i];
      const fundInitArgs = encodeAbiParameters(
        parseAbiParameters('address worker, address oracle, uint256 cut, address token, string terms'),
        [deployer, deployer, 0, token, FUND_TERMS],
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
      console.log(`> Fund #${i + 1} (${name}) => ${result} (${receipt.status})`);
    }

    // Lock terms for any unlocked funds
    for (let i = 0; i < existingFunds.length; i++) {
      const fundSignature = (await publicClient.readContract({
        address: existingFunds[i],
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
            verifyingContract: existingFunds[i],
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
          address: existingFunds[i],
          abi: fundImplementation.abi,
          functionName: 'lockTerms',
          args: [termsSign],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`> Locking Fund #${i + 1} => (${receipt.status})`);
      }
    }

    // Deploy mock price feeds AFTER all other contract interactions
    // This ensures nonces don't collide with Ignition-deployed contracts
    console.log(`\n=== Deploying Mock Price Feeds ===`);
    const fundFeedAddress = await deployFeed("FundToken Feed ($0.50)", FUND_PRICE);
    const usdcFeedAddress = await deployFeed("TestUSDC Feed ($1.00)", USDC_PRICE);
    const usdtFeedAddress = await deployFeed("TestUSDT Feed ($1.00)", USDT_PRICE);
    const wethFeedAddress = await deployFeed("TestWETH Feed ($3638)", WETH_PRICE);
    console.log(`==================================\n`);

    // Wire up mock price feeds to MockSwapRouter so it can calculate proper swap amounts
    console.log(`Setting up price feeds for MockSwapRouter...`);
    const tokenFeedMap = [
      { token: fundToken.address, feed: fundFeedAddress },
      { token: testUSDC.address, feed: usdcFeedAddress },
      { token: testUSDT.address, feed: usdtFeedAddress },
      { token: testWETH.address, feed: wethFeedAddress },
    ];

    for (const { token, feed } of tokenFeedMap) {
      const hash = await walletClient.writeContract({
        account: deployer,
        address: mockRouter.address,
        abi: mockRouter.abi,
        functionName: 'setPriceFeed',
        args: [token, feed],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`> MockRouter: Set feed for ${token.slice(0, 10)}... => (${receipt.status})`);
    }

    // Wire up mock price feeds for each fund so refund/withdraw work correctly
    console.log(`Setting up mock price feeds for funds...`);

    for (let i = 0; i < existingFunds.length; i++) {
      // Set price feeds for ALL tokens on EACH fund (so cross-token deposits work)
      for (const { token, feed } of tokenFeedMap) {
        try {
          const hash = await walletClient.writeContract({
            account: deployer,
            address: existingFunds[i],
            abi: fundImplementation.abi,
            functionName: 'setTokenFeed',
            args: [token, feed],
          });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          console.log(`> Fund #${i + 1}: Set feed for token ${token.slice(0, 10)}... => (${receipt.status})`);
        } catch (e: any) {
          // May fail if already set or not manager - that's okay
          console.log(`> Fund #${i + 1}: Feed already set or skipped for ${token.slice(0, 10)}...`);
        }
      }
    }

    console.log(`\n=== Test Environment Ready ===`);
    console.log(`FundFactory:       ${fundFactory.address}`);
    console.log(`Worker/Oracle:     ${deployer}`);
    console.log(`\nTest Funds Created:`);
    for (let i = 0; i < existingFunds.length; i++) {
      console.log(`  Fund #${i + 1}: ${existingFunds[i]} (${testFunds[i]?.name || 'unknown'})`);
    }
    console.log(`\nTokens for Testing:`);
    console.log(`  FundToken (⚡permit 18dec): ${fundToken.address}`);
    console.log(`  TestUSDC  (⚡permit 6dec):  ${testUSDC.address}`);
    console.log(`  TestUSDT  (standard 6dec):  ${testUSDT.address}`);
    console.log(`  TestWETH  (⚡permit 18dec): ${testWETH.address}`);
    console.log(`\nMock Price Feeds:`);
    console.log(`  FundToken Feed ($0.50):  ${fundFeedAddress}`);
    console.log(`  TestUSDC Feed ($1.00):   ${usdcFeedAddress}`);
    console.log(`  TestUSDT Feed ($1.00):   ${usdtFeedAddress}`);
    console.log(`  TestWETH Feed ($3638):   ${wethFeedAddress}`);
    console.log(`==============================\n`);
  }
}

main().catch(console.error);
