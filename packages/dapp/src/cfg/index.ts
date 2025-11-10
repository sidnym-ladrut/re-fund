import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia, hardhat } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { PinataSDK } from 'pinata'

export const PINATA = new PinataSDK({
  pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
  pinataGateway: process.env.NEXT_PUBLIC_GATEWAY_URL!,
});

export const APPKIT_PID = process.env.NEXT_PUBLIC_PROJECT_ID!;

export const APPKIT_NETWORKS = [mainnet, sepolia, hardhat] as [AppKitNetwork, ...AppKitNetwork[]];

export const APPKIT_WAGMI = new WagmiAdapter({
  ssr: true,
  projectId: APPKIT_PID,
  networks: APPKIT_NETWORKS,
});
