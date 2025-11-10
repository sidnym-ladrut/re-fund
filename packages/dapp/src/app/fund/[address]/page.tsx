'use client'
import { use, useState, useEffect, useMemo } from 'react'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { formatUnits } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { Address } from "@/components/Address";
import { ConnectButton } from "@/components/ConnectButton";
import { formatNumber } from "@/lib/util";
import { wagmiConfig } from "@/config";

import Contracts from '@/../chain/contracts'

interface FundData {
  worker: `0x${string}`;
  oracle: `0x${string}`;
  token: `0x${string}`;
}

interface TokenData {
  name: string;
  symbol: string;
  supply: bigint;
  decimals: bigint;
}

function assertValidAddress(value: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    notFound();
  }
}

export default function FundPage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address: fundAddress } = use(params);
  assertValidAddress(fundAddress);

  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const [fundData, setFundData] = useState<FundData | undefined>(undefined);
  const [tokenData, setTokenData] = useState<TokenData | undefined>(undefined);

  const ChainContracts = useMemo<Record<string, any> | undefined>(() => (
    !isConnected ? undefined : Contracts[caipAddress.split(':')?.[1]]
  ), [isConnected, caipAddress]);

  useEffect(() => {
    if (isConnected) {
      Promise.all([
        readContract(wagmiConfig, {
          address: fundAddress,
          abi: ChainContracts.Fund.abi,
          functionName: 'worker',
          args: [],
        }),
        readContract(wagmiConfig, {
          address: fundAddress,
          abi: ChainContracts.Fund.abi,
          functionName: 'oracle',
          args: [],
        }),
        readContract(wagmiConfig, {
          address: fundAddress,
          abi: ChainContracts.Fund.abi,
          functionName: 'payoutToken',
          args: [],
        }),
      ]).then(([worker, oracle, token]) => {
        setFundData({worker, oracle, token});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [fundAddress, isConnected]);

  useEffect(() => {
    if (isConnected && !!fundData) {
      Promise.all([
        readContract(wagmiConfig, {
          address: fundData.token,
          abi: ChainContracts.FundToken.abi,
          functionName: 'name',
          args: [],
        }),
        readContract(wagmiConfig, {
          address: fundData.token,
          abi: ChainContracts.FundToken.abi,
          functionName: 'symbol',
          args: [],
        }),
        readContract(wagmiConfig, {
          address: fundData.token,
          abi: ChainContracts.FundToken.abi,
          functionName: 'balanceOf',
          args: [fundAddress],
        }),
        readContract(wagmiConfig, {
          address: fundData.token,
          abi: ChainContracts.FundToken.abi,
          functionName: 'decimals',
          args: [],
        }),
      ]).then(([name, symbol, supply, decimals]) => {
        setTokenData({name, symbol, supply, decimals});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [fundAddress, fundData]);

  return (
    <div className="flex flex-col gap-y-4">
      <h1>Fund @ <Address address={fundAddress} /></h1>
      <ConnectButton />
      <div>
        {(fundData === undefined) ? (
          <span>Loading...</span>
        ) : (
          <ul>
            <li>
              <strong>Worker: </strong>
              <Address address={fundData.worker} />
            </li>
            <li>
              <strong>Oracle: </strong>
              <Address address={fundData.oracle} />
            </li>
            <li>
              <strong>Token: </strong>
              <Address address={fundData.token} />
              {(tokenData === undefined) ? (
                <span>Loading...</span>
              ) : (
                <ul>
                  <li>
                    <strong>Name: </strong>
                    {tokenData.name}
                  </li>
                  <li>
                    <strong>Symbol: </strong>
                    {tokenData.symbol}
                  </li>
                  <li>
                    <strong>Supply: </strong>
                    {formatNumber(formatUnits(tokenData.supply, tokenData.decimals))} {tokenData.symbol}
                  </li>
                </ul>
              )}
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
