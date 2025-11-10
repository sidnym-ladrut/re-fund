'use client'

import { useDisconnect, useAppKit, useAppKitNetwork  } from '@reown/appkit/react'
import { APPKIT_NETWORKS } from '@/cfg'

export const ActionButtonList = () => {
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const { switchNetwork } = useAppKitNetwork();

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }

  return (
    <div className="flex flex-row gap-x-4">
      <button onClick={() => open()}>Open</button>
      <button onClick={handleDisconnect}>Disconnect</button>
      <button onClick={() => switchNetwork(APPKIT_NETWORKS[1]) }>Switch</button>
    </div>
  )
}
