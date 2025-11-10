import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia, hardhat } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { PinataSDK } from 'pinata'

export const pinata = new PinataSDK({
  pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
  pinataGateway: process.env.NEXT_PUBLIC_GATEWAY_URL!,
});

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) {
  throw new Error('Project ID is not defined')
}

export const networks = [mainnet, sepolia, hardhat] as [AppKitNetwork, ...AppKitNetwork[]]
export const wagmiAdapter = new WagmiAdapter({
  ssr: true,
  projectId,
  networks,
})

export const wagmiConfig = wagmiAdapter.wagmiConfig
