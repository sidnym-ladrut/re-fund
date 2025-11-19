import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const walletClient = await viem.getWalletClient();
  const accounts = await walletClient.getAddresses();
  
  console.log('Available Hardhat accounts:');
  accounts.forEach((account, index) => {
    console.log(`Account ${index}: ${account}`);
  });
}

main().catch(console.error);