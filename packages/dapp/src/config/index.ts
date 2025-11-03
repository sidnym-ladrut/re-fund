import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) {
  throw new Error('Project ID is not defined')
}

export const networks = [mainnet, sepolia] as [AppKitNetwork, ...AppKitNetwork[]]
export const wagmiAdapter = new WagmiAdapter({
  ssr: true,
  projectId,
  networks,
})

export const config = wagmiAdapter.wagmiConfig
