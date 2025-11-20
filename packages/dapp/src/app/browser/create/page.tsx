'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { useChainContracts } from "@/hook/wallet";
import { simulateContract, writeContract } from '@wagmi/core'
import {
  encodeAbiParameters, parseAbiParameters,
  keccak256, fromHex, toHex, fromBytes, toBytes,
} from "viem";
import { APPKIT_WAGMI } from "@/cfg";

function TermsInput({
  input,
  setInput,
  placeholder,
} : {
  input: string;
  setInput: (string) => void;
  placeholder: string;
}) {
  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setInput(value);
  }, [setInput]);

  return (
    <div className="flex flex-col gap-1">
      <h3>Terms (Number)</h3>
      <input
        className="border-black border-1 px-2 py-1"
        type="number"
        min="0"
        step="1"
        value={input}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

function CutInput({
  input,
  setInput,
  placeholder,
} : {
  input: string;
  setInput: (string) => void;
  placeholder: string;
}) {
  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setInput(value);
  }, [setInput]);

  return (
    <div className="flex flex-col gap-1">
      <h3>Cut (Percentage)</h3>
      <input
        className="border-black border-1 px-2 py-1"
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={input}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

function AddressInput({
  title,
  input,
  setInput,
  placeholder,
} : {
  title: string;
  input: string;
  setInput: (string) => void;
  placeholder: string;
}) {
  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setInput(value);
  }, [setInput]);

  return (
    <div className="flex flex-col gap-1">
      <h3>{title} (Address)</h3>
      <input
        className="border-black border-1 px-2 py-1"
        pattern="^0x[a-fA-F0-9]{40}$"
        value={input}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function CreatePage() {
  const [oracle, setOracle] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [terms, setTerms] = useState<string>("");
  const [cut, setCut] = useState<string>("");

  const { open: openWallet } = useAppKit();
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const router = useRouter();
  const chainContracts = useChainContracts();

  const oracleDefault = useMemo(() => (
    !isConnected ? `0x${'0'.repeat(64)}` : address
  ), [isConnected, address]);

  const tokenDefault = useMemo(() => {
    return chainContracts?.FundToken?.address ?? `0x${'0'.repeat(64)}`;
  }, [isConnected, address, caipAddress]);

  const onSubmit = useCallback(() => {
    const createFund = async () => {
      if (!isConnected) {
        openWallet();
      } else {
        const args = encodeAbiParameters(
          parseAbiParameters('address worker, address oracle, uint256 cut, address token, bytes32 terms'),
          [address, oracle || oracleDefault, 0, token || tokenDefault, keccak256(toHex(terms))],
        );
        const salt = keccak256(toHex(Date.now()));
        const { result, request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: chainContracts.FundFactory.address,
          abi: chainContracts.FundFactory.abi,
          functionName: 'deploy',
          args: [args, salt],
        });
        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        router.push(`/fund/${result}`);
      }
    };
    createFund();
  }, [
    isConnected, address, openWallet, router,
    oracle, token, terms, cut,
    oracleDefault, tokenDefault,
  ]);

  return (
    <div className="flex flex-col gap-y-4">
      <h2>Create New Fund</h2>
      <AddressInput
        title="Oracle"
        input={oracle}
        setInput={setOracle}
        placeholder={oracleDefault}
      />
      <AddressInput
        title="Payout Token"
        input={token}
        setInput={setToken}
        placeholder={tokenDefault}
      />
      <TermsInput
        input={terms}
        setInput={setTerms}
        placeholder="0"
      />
      <CutInput
        input={cut}
        setInput={setCut}
        placeholder="0%"
      />
      <button onClick={onSubmit}>
        Launch
      </button>
    </div>
  )
}
