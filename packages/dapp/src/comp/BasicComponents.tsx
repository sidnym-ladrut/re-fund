'use client'

import { useRouter } from 'next/navigation'
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppKitAccount } from "@reown/appkit/react";
import { readContract } from '@wagmi/core'
import { useChainContracts } from "@/hook/wallet";
import { APPKIT_WAGMI } from "@/cfg";

export function FundSearch() {
  const [input, setInput] = useState<string>("");
  const router = useRouter()

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setInput(value);
  }, [setInput]);
  const onSubmit = useCallback(() => {
    if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
      router.push(`/fund/${input}`);
    }
  }, [input, router]);
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }, [onSubmit]);

  return (
    <div className="flex flex-col gap-1">
      <h2>Fund Lookup</h2>
      <input
        className="border-black border-1 px-2 py-1"
        pattern="^0x[a-fA-F0-9]{40}$"
        value={input}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      />
    </div>
  );
}

export function WalletDirectory({
  type,
}: {
  type: number;
}) {
  const router = useRouter()
  const { address } = useAppKitAccount();
  const chainContracts = useChainContracts();
  const [funds, setFunds] = useState<string[]>([]);

  const onChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const { value }: { value: string; } = event.target;
    if (!!value) {
      router.push(`/fund/${value}`);
    }
  }, [router]);

  const typeTitle = useMemo(() => (
    (type === 0) ? "Worker" :
    (type === 1) ? "Oracle" :
    "Unknown"
  ), [type]);

  useEffect(() => {
    const getWorkerContracts = async () => {
      if (!!chainContracts) {
        const workerInstances = (await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: chainContracts.FundFactory.address,
          abi: chainContracts.FundFactory.abi,
          functionName: 'instances',
          args: [address, type],
        })) as string[];
        setFunds(workerInstances);
      }
    };
    getWorkerContracts();
  }, [address, chainContracts, setFunds]);

  return !chainContracts ? null : (
    <div className="flex flex-col gap-1">
      <h2>Wallet Funds as {typeTitle}</h2>
      <select
        className="border-black border-1 px-2 py-1"
        onChange={onChange}
      >
        <option value="">
          --Select a Contract--
        </option>
        {funds.map((fundAddress: string) => (
          <option key={fundAddress} value={fundAddress}>
            {fundAddress}
          </option>
        ))}
      </select>
    </div>
  );
}
