'use client'

import { useAppKitAccount } from '@reown/appkit/react'
import { useSignMessage } from 'wagmi'

export const SignMessageModule = () => {
  const { signMessageAsync } = useSignMessage();
  const { address, isConnected } = useAppKitAccount();

  const handleSignMsg = async () => {
    const sig = await signMessageAsync({
      message: "Hello Reown AppKit!",
      account: address as Address,
    });
    console.log(sig);
  };

  return (
    isConnected && (
      <div>
        <button onClick={handleSignMsg}>Sign Message</button>
      </div>
    )
  );
}
