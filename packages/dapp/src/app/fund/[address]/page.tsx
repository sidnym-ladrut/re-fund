'use client'
import { use, useState, useEffect } from 'react'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { ConnectButton } from "@/components/ConnectButton";
import { wagmiConfig } from "@/config";

import Fund from "@/abi/Fund" with { type: 'json' };
import FundToken from "@/abi/FundToken" with { type: 'json' };

interface FundData {
  worker: `0x${string}`;
  oracle: `0x${string}`;
}

function assertValidAddress(value: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    notFound();
  }
}

function formatAddress(address: `0x${string}`): `0x${string}` {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export default function FundPage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address: fundAddress } = use(params);
  assertValidAddress(fundAddress);

  const { address: walletAddress, isConnected } = useAppKitAccount();
  const [fundData, setFundData] = useState<FundData | undefined>(undefined);

  useEffect(() => {
    if (isConnected) {
      Promise.all([
        readContract(wagmiConfig, {
          address: fundAddress,
          abi: Fund.abi,
          functionName: 'worker',
          args: [],
        }),
        readContract(wagmiConfig, {
          address: fundAddress,
          abi: Fund.abi,
          functionName: 'oracle',
          args: [],
        }),
      ]).then(([worker, oracle]) => {
        setFundData({worker, oracle});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [fundAddress, isConnected]);

  return (
    <div className="flex flex-col gap-y-4">
      <h1>Fund @ {formatAddress(fundAddress)}</h1>
      <ConnectButton />
      <div>
        {(fundData === undefined) ? (
          <p>
            Loading...
          </p>
        ) : (
          <ul>
            <li>
              Worker: {formatAddress(fundData.worker)}
            </li>
            <li>
              Oracle: {formatAddress(fundData.oracle)}
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
