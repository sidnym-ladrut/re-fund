'use client'

import React, { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { APPKIT_WAGMI, APPKIT_PID, APPKIT_NETWORKS, RPC_URLS } from '@/cfg'

const queryClient = new QueryClient()

export const modal = createAppKit({
  adapters: [APPKIT_WAGMI],
  projectId: APPKIT_PID,
  networks: APPKIT_NETWORKS,
  customRpcUrls: RPC_URLS,
  metadata: {
    name: 're-fund',
    description: 'crowdfund cool projects using crypto',
    url: 'http://localhost:3000', // origin must match your domain & subdomain
    icons: ['https://avatars.githubusercontent.com/u/179229932']
  },
  themeVariables: {
    '--w3m-accent': '#000000',
  },
})

export default function ContextProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(APPKIT_WAGMI.wagmiConfig as Config, cookies)
  return (
    <WagmiProvider config={APPKIT_WAGMI.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
