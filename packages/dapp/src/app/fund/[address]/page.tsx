'use client'
import { use, useState, useEffect, useMemo, useCallback } from 'react'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { useSignMessage, useSignTypedData } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { Address } from "@/comp/Address";
import { formatNumber, nextPermitTime } from "@/lib/util";
import { useChainContracts } from "@/hook/wallet";
import { simulateContract, writeContract } from '@wagmi/core'
import { APPKIT_WAGMI } from "@/cfg";

interface FundData {
  worker: `0x${string}`;
  oracle: `0x${string}`;
  token: `0x${string}`;
  terms: string;
  locked: boolean;
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
  const { signMessageAsync: signMessage } = useSignMessage();
  const { signTypedDataAsync: signData } = useSignTypedData();
  const chainContracts = useChainContracts();
  const [fundData, setFundData] = useState<FundData | undefined>(undefined);
  const [tokenData, setTokenData] = useState<TokenData | undefined>(undefined);
  const [oracleSign, setOracleSign] = useState<string>("");
  const [funderDepo, setFunderDepo] = useState<string>("");
  const [workerWith, setWorkerWith] = useState<string>("");

  const chainId: number = useMemo(() => (
    Number(caipAddress?.split(':')?.[1] ?? 0)
  ), [caipAddress]);

  const signOff = useCallback(() => {
    const signOffFun = async () => {
      const signature = await signMessage({
        account: walletAddress,
        message: { raw: fundData?.terms },
      });
      prompt("Signed! Please send this to the worker:", signature);
    };
    signOffFun();
  }, [walletAddress, fundData, chainContracts, signMessage]);
  const lockIn = useCallback(() => {
    const lockInFun = async () => {
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'lockTerms',
        args: [oracleSign],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    lockInFun();
  }, [oracleSign, chainContracts]);
  const deposit = useCallback(() => {
    const depositFun = async () => {
      const depoTime: bigint = nextPermitTime();
      const depoAmount: bigint = parseUnits(funderDepo, tokenData.decimals);
      const depoNonce: bigint = (await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundData.token,
        abi: chainContracts.FundToken.abi,
        functionName: 'nonces',
        args: [walletAddress],
      })) as bigint;
      const signature = await signData({
        account: walletAddress,
        domain: {
          name: tokenData.name,
          version: '1',
          chainId: chainId,
          verifyingContract: fundData.token,
        },
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: walletAddress,
          spender: fundAddress,
          value: depoAmount,
          nonce: depoNonce,
          deadline: depoTime,
        },
      });
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'deposit',
        args: [fundData.token, walletAddress, depoAmount, depoTime, signature],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    depositFun();
  }, [walletAddress, chainId, funderDepo, fundData, tokenData, chainContracts, signMessage]);
  const signWithdrawal = useCallback(() => {
    const signWithdrawalFun = async () => {
      const withAmount: bigint = parseUnits(workerWith, tokenData.decimals);
      const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'nonce',
        args: [],
      });
      const signature = await signData({
        account: walletAddress,
        domain: {
          name: 'Fund',
          version: '1',
          chainId: chainId,
          verifyingContract: fundAddress,
        },
        types: {
          Withdraw: [
            { name: 'fund', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
          ],
        },
        primaryType: 'Withdraw',
        message: {
          fund: fundAddress,
          amount: withAmount,
          nonce: nonce,
        },
      });
      prompt("Signed! Please send this to the worker:", signature);
    };
    signWithdrawalFun();
  }, [walletAddress, chainContracts, chainId, workerWith, tokenData]);
  const execWithdrawal = useCallback(() => {
    const execWithdrawalFun = async () => {
      const withAmount: bigint = parseUnits(workerWith, tokenData.decimals);
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'withdraw',
        args: [withAmount, oracleSign],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    execWithdrawalFun();
  }, [walletAddress, chainContracts, oracleSign, workerWith, tokenData]);
  const refund = useCallback(() => {
    const refundFun = async () => {
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'refund',
        args: [],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    refundFun();
  }, [chainContracts]);

  const onSignChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setOracleSign(value);
  }, [setOracleSign]);
  const onDepoChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setFunderDepo(value);
  }, [setFunderDepo]);
  const onWithChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setWorkerWith(value);
  }, [setWorkerWith]);

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
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'termsCID',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'termsSignature',
          args: [],
        }),
      ]).then(([worker, oracle, token, terms, termsSignature]) => {
        setFundData({worker, oracle, token, terms, locked: (termsSignature !== "0x")});
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
      <div className="flex flex-col gap-y-2">
        {(fundData === undefined) ? (
          <span>Loading...</span>
        ) : (
          <>
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
                <strong>Status: </strong>
                {fundData.locked ? "Locked" : "Pending"}
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
                      <strong>Supply: </strong>
                      {formatNumber(formatUnits(tokenData.supply, tokenData.decimals))} {tokenData.symbol}
                    </li>
                  </ul>
                )}
              </li>
            </ul>
            {(walletAddress?.toLowerCase() === fundData.oracle.toLowerCase() && !fundData.locked) && (
              <button onClick={signOff}>
                Sign Off
              </button>
            )}
            {(walletAddress?.toLowerCase() === fundData.worker.toLowerCase() && !fundData.locked) && (
              <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                <h3>Oracle Signature</h3>
                <input
                  className="border-black border-1 px-2 py-1"
                  pattern="^0x[a-fA-F0-9]{130}$"
                  value={oracleSign}
                  onChange={onSignChange}
                  placeholder={`0x${'0'.repeat(130)}`}
                />
                <button onClick={lockIn}>
                  Lock In
                </button>
              </div>
            )}
            {(isConnected && !!fundData?.locked) && (
              <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                <h3>Deposit Amount</h3>
                <input
                  className="border-black border-1 px-2 py-1"
                  type="number"
                  step="0.0001"
                  step="0.0001"
                  value={funderDepo}
                  onChange={onDepoChange}
                  placeholder="10"
                />
                <button onClick={deposit}>
                  Deposit
                </button>
              </div>
            )}
            {(
                (walletAddress?.toLowerCase() === fundData.worker.toLowerCase() ||
                walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) &&
                fundData.locked) && (
              <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                <h3>Withdrawal Amount</h3>
                <input
                  className="border-black border-1 px-2 py-1"
                  type="number"
                  step="0.0001"
                  step="0.0001"
                  value={workerWith}
                  onChange={onWithChange}
                  placeholder="10"
                />
                {(walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) && (
                  <button onClick={signWithdrawal}>
                    Sign Off
                  </button>
                )}
                {(walletAddress?.toLowerCase() === fundData.worker.toLowerCase()) && (
                  <>
                    <h3>Withdrawal Signature</h3>
                    <input
                      className="border-black border-1 px-2 py-1"
                      pattern="^0x[a-fA-F0-9]{130}$"
                      value={oracleSign}
                      onChange={onSignChange}
                      placeholder={`0x${'0'.repeat(130)}`}
                    />
                    <button onClick={execWithdrawal}>
                      Withdraw
                    </button>
                  </>
                )}
              </div>
            )}
            {(
                (walletAddress?.toLowerCase() === fundData.worker.toLowerCase() ||
                walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) &&
                fundData.locked) && (
              <button onClick={refund}>
                Refund
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
