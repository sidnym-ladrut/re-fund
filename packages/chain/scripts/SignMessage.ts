import { network } from "hardhat";

const PAYLOAD: string = `0x${'0'.repeat(64)}`;

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [defaultWallet] = await viem.getWalletClients();
const signature = await defaultWallet.signMessage({message: {raw: PAYLOAD}});

console.log("Signature Summary:");
console.log("  > Signer:", defaultWallet.account.address);
console.log("  > Payload:", PAYLOAD);
console.log("  > Signature:", signature);
