'use client'
import { use, useState, useEffect, useMemo } from 'react'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { formatUnits } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { Address } from "@/comp/Address";
import { formatNumber } from "@/lib/util";
import { useChainContracts } from "@/hook/wallet";
import { APPKIT_WAGMI } from "@/cfg";

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

  const chainContracts = useChainContracts();
  const [fundData, setFundData] = useState<FundData | undefined>(undefined);
  const [tokenData, setTokenData] = useState<TokenData | undefined>(undefined);

  useEffect(() => {
    if (!!chainContracts) {
      Promise.all([
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'worker',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'oracle',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'payoutToken',
          args: [],
        }),
      ]).then(([worker, oracle, token]) => {
        setFundData({worker, oracle, token});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [fundAddress, chainContracts]);

  useEffect(() => {
    if (!!chainContracts && !!fundData) {
      Promise.all([
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'name',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'symbol',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'balanceOf',
          args: [fundAddress],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'decimals',
          args: [],
        }),
      ]).then(([name, symbol, supply, decimals]) => {
        setTokenData({name, symbol, supply, decimals});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [chainContracts, fundAddress, fundData]);

  return (
    <div className="flex flex-col gap-y-4">
      <h2>Fund @ <Address address={fundAddress} /></h2>
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
