import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia, hardhat } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { PinataSDK } from 'pinata'

export const PINATA = new PinataSDK({
  pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
  pinataGateway: process.env.NEXT_PUBLIC_GATEWAY_URL!,
});

export const RPC_URLS = {
  'eip155:1': [{ url: process.env.NEXT_PUBLIC_MAINNET_RPC }],
  'eip155:11155111': [{ url: process.env.NEXT_PUBLIC_SEPOLIA_RPC }],
}

export const APPKIT_PID = process.env.NEXT_PUBLIC_PROJECT_ID!;

export const APPKIT_NETWORKS = [mainnet, sepolia, hardhat] as [AppKitNetwork, ...AppKitNetwork[]];

export const APPKIT_WAGMI = new WagmiAdapter({
  ssr: true,
  projectId: APPKIT_PID,
  networks: APPKIT_NETWORKS,
  customRpcUrls: RPC_URLS,
});
