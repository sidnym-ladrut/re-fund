import "@nomicfoundation/hardhat-toolbox-viem";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http } from "viem";
import { localhost } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Read deployment addresses
  const deployedAddresses = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../ignition/deployments/chain-31337/deployed_addresses.json"),
      "utf-8"
    )
  );

  const factoryAddress = deployedAddresses["FundFactory#FundFactory"] as `0x${string}`;
  
  // Read ABIs
  const factoryAbi = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/FundFactory.sol/FundFactory.json"),
      "utf-8"
    )
  ).abi;
  
  const fundAbi = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/Fund.sol/Fund.json"),
      "utf-8"
    )
  ).abi;
  
  // Create client
  const client = createPublicClient({
    chain: localhost,
    transport: http(),
  });
  
  console.log("Factory address:", factoryAddress);
  console.log("Reading fund instances...\n");
  
  // Call instances() function
  const instances = await client.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'instances',
    args: [],
  }) as any[];
  
  console.log(`Found ${instances.length} fund(s)\n`);
  
  const fundsData = [];
  
  for (let i = 0; i < instances.length; i++) {
    const fundAddress = instances[i] as `0x${string}`;
    console.log(`Reading fund ${i + 1}/${instances.length}: ${fundAddress}`);
    
    // Read fund details
    const [worker, oracle, fundsRegistered, terms] = await Promise.all([
      client.readContract({ address: fundAddress, abi: fundAbi, functionName: 'worker', args: [] }),
      client.readContract({ address: fundAddress, abi: fundAbi, functionName: 'oracle', args: [] }),
      client.readContract({ address: fundAddress, abi: fundAbi, functionName: 'fundsRegistered', args: [] }),
      client.readContract({ address: fundAddress, abi: fundAbi, functionName: 'terms', args: [] }),
    ]);
    
    fundsData.push({
      address: fundAddress,
      worker,
      oracle,
      fundsRegistered: (fundsRegistered as bigint).toString(),
      terms,
    });
  }
  
  // Save to file
  const outputPath = path.join(__dirname, "../funds-dump.json");
  fs.writeFileSync(outputPath, JSON.stringify(fundsData, null, 2));
  
  console.log(`\n✅ Exported ${fundsData.length} fund(s) to funds-dump.json`);
  console.log("\nFund details:");
  fundsData.forEach((fund, i) => {
    console.log(`\nFund ${i + 1}:`);
    console.log(`  Address: ${fund.address}`);
    console.log(`  Worker: ${fund.worker}`);
    console.log(`  Oracle: ${fund.oracle}`);
    console.log(`  Registered: ${fund.fundsRegistered}`);
    console.log(`  Terms: ${fund.terms}`);
  });
}

main().catch(console.error);
