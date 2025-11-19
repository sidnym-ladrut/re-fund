import { network } from "hardhat";
import { getAddress } from "viem";
import FundFactory from "../ignition/modules/FundFactory";

const FUND_ADDRESS = "0x0773Ae4b75190d037Bb8946942466bbBc5F97A2F"; // Your fund address

async function main() {
  const { ignition, viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClient = await viem.getWalletClient();
  const [deployer, ...accounts] = await walletClient.getAddresses();

  console.log(`Using account: ${deployer}`);
  console.log(`Fund address: ${FUND_ADDRESS}`);
  
  // Get the deployed fund implementation ABI
  const { fundImplementation } = await ignition.deploy(FundFactory, {});
  
  try {
    // Step 1: Read current fund state
    console.log("\n=== Reading Fund State ===");
    
    const [worker, oracle, termsCID, termsSignature] = await Promise.all([
      publicClient.readContract({
        address: FUND_ADDRESS as `0x${string}`,
        abi: fundImplementation.abi,
        functionName: 'worker',
        args: [],
      }),
      publicClient.readContract({
        address: FUND_ADDRESS as `0x${string}`,
        abi: fundImplementation.abi,
        functionName: 'oracle',
        args: [],
      }),
      publicClient.readContract({
        address: FUND_ADDRESS as `0x${string}`,
        abi: fundImplementation.abi,
        functionName: 'termsCID',
        args: [],
      }),
      publicClient.readContract({
        address: FUND_ADDRESS as `0x${string}`,
        abi: fundImplementation.abi,
        functionName: 'termsSignature',
        args: [],
      }),
    ]);

    console.log(`Worker: ${worker}`);
    console.log(`Oracle: ${oracle}`);
    console.log(`Terms CID: ${termsCID}`);
    console.log(`Current Signature: ${termsSignature}`);
    console.log(`Is Locked: ${termsSignature !== "0x"}`);

    // Check if already locked
    if (termsSignature !== "0x") {
      console.log("\n❌ Fund is already locked!");
      return;
    }

    // Step 2: Generate oracle signature
    console.log("\n=== Generating Oracle Signature ===");
    console.log(`Signing message: ${termsCID}`);
    
    const oracleSignature = await walletClient.signMessage({
      account: deployer, // Assuming deployer is the oracle
      message: { raw: termsCID as `0x${string}` },
    });

    console.log(`Oracle signature: ${oracleSignature}`);
    console.log(`Signature length: ${oracleSignature.length}`);

    // Step 3: Simulate lockTerms call
    console.log("\n=== Simulating lockTerms Call ===");
    
    try {
      const { request, result } = await publicClient.simulateContract({
        account: deployer, // Worker calls lockTerms
        address: FUND_ADDRESS as `0x${string}`,
        abi: fundArtifact.abi,
        functionName: 'lockTerms',
        args: [oracleSignature],
      });

      console.log("✅ Simulation successful!");
      console.log("Simulation result:", result);

      // Step 4: Execute the actual transaction
      console.log("\n=== Executing lockTerms Transaction ===");
      
      const hash = await walletClient.writeContract(request);
      console.log(`Transaction hash: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Transaction status: ${receipt.status}`);
      console.log(`Gas used: ${receipt.gasUsed}`);

      if (receipt.status === 'success') {
        console.log("\n🎉 Fund successfully locked!");
        
        // Verify the new state
        const newSignature = await publicClient.readContract({
          address: FUND_ADDRESS as `0x${string}`,
          abi: fundArtifact.abi,
          functionName: 'termsSignature',
          args: [],
        });
        console.log(`New signature: ${newSignature}`);
      } else {
        console.log("\n❌ Transaction failed!");
      }

    } catch (simulationError) {
      console.log("\n❌ Simulation failed!");
      console.error("Error details:", simulationError);
      
      // Try to get more specific error information
      if (simulationError.message) {
        console.log("Error message:", simulationError.message);
      }
      if (simulationError.cause) {
        console.log("Error cause:", simulationError.cause);
      }
    }

  } catch (error) {
    console.error("Script failed:", error);
  }
}

main().catch(console.error);