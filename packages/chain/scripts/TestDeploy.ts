import { encodeAbiParameters, parseAbiParameters } from "viem";
import "@nomicfoundation/hardhat-toolbox-viem";
import hre from "hardhat";

async function main() {
  console.log("Testing FundFactory.deploy()...\n");
  
  const fundFactoryAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as `0x${string}`;
  
  // Prepare the same args from frontend
  const oracle = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
  const cut = 100n; // 1% in basis points
  const token = "0x0165878A594ca255338adfa4d48449f69242Eb8F" as `0x${string}`;
  const terms = "0xb68a9e707bc94580080b99b709add9b5938c58f728e0bc48b24721676389a8ee" as `0x${string}`;
  
  // Encode the args
  const args = encodeAbiParameters(
    parseAbiParameters('address oracle, uint256 cut, address token, bytes32 terms'),
    [oracle, cut, token, terms]
  );
  
  console.log("Oracle:", oracle);
  console.log("Cut (bps):", cut.toString());
  console.log("Token:", token);
  console.log("Terms:", terms);
  console.log("Encoded args:", args);
  console.log();
  
  try {
    const publicClient = await hre.viem.getPublicClient();
    const [wallet] = await hre.viem.getWalletClients();
    
    console.log("Wallet address:", wallet.account.address);
    
    // Try to call deploy
    const hash = await wallet.writeContract({
      address: fundFactoryAddress,
      abi: [{
        "inputs": [{"internalType": "bytes", "name": "args", "type": "bytes"}],
        "name": "deploy",
        "outputs": [{"internalType": "address", "name": "proxy", "type": "address"}],
        "stateMutability": "nonpayable",
        "type": "function"
      }],
      functionName: 'deploy',
      args: [args],
    });
    
    console.log("✅ Transaction hash:", hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("✅ Transaction mined in block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
  } catch (error: any) {
    console.error("\n❌ Error deploying fund:");
    console.error("Message:", error.message);
    if (error.shortMessage) {
      console.error("Short message:", error.shortMessage);
    }
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    if (error.details) {
      console.error("Details:", error.details);
    }
  }
}

main().catch(console.error);
