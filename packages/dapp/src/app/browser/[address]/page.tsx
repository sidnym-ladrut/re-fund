'use client'
import { use, useState, useEffect, useMemo, useCallback, ChangeEvent } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { useSignTypedData } from 'wagmi'
import { parseUnits, formatUnits, keccak256 } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { Address } from "@/comp/Address";
import { StatusBadge } from '@/comp/StatusBadge';
import { formatNumber, nextPermitTime } from "@/lib/util";
import { useChainContracts } from "@/hook/wallet";
import { simulateContract, writeContract } from '@wagmi/core'
import { useFundStaticData, useTokenData, useTermsData } from "@/hook/useFundData";
import { parseStatus } from "@/lib/util";
import { FundStatus } from "@/type";
import { APPKIT_WAGMI, PINATA } from "@/cfg";

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
  const { signTypedDataAsync: signData } = useSignTypedData();
  const chainContracts = useChainContracts();

  const { data: fundData, isLoading: isFundLoading, isPending: isFundPending } = useFundStaticData(fundAddress);
  const { data: termsData, isLoading: isTermsLoading } = useTermsData(fundData?.terms);
  const { data: tokenData , isLoading: isTokenLoading } = useTokenData(fundData?.payoutToken);

  const [fundTokenSupply, setFundTokenSupply] = useState<bigint>(0n);
  const [oracleSign, setOracleSign] = useState<string>("");
  const [funderDepo, setFunderDepo] = useState<string>("");
  const [workerWith, setWorkerWith] = useState<string>("");

  const chainId: number = useMemo(() => (
    Number(caipAddress?.split(':')?.[1] ?? 0)
  ), [caipAddress]);

  const signOff = useCallback(() => {
    const signOffFun = async () => {
      if (!isFundLoading && !!fundData) {
        const signature = await signData({
          account: walletAddress,
          domain: {
            name: 'Fund',
            version: '1',
            chainId: chainId,
            verifyingContract: fundAddress,
          },
          types: {
            SignTerms: [
              { name: 'terms', type: 'bytes32' },
            ],
          },
          primaryType: 'SignTerms',
          message: {
            terms: keccak256(fundData.terms),
          },
        });

        // Save signature to localStorage for this fund
        const storageKey = `fund-signature-${fundAddress.toLowerCase()}`;
        localStorage.setItem(storageKey, signature);

        if (walletAddress.toLowerCase() === fundData.worker.toLowerCase()) {
          // Auto-fill the signature input field
          setOracleSign(signature);
          alert("Signature generated and filled! You can now click 'Lock In' to activate the fund.");
        } else {
          alert(`Signature saved! The worker can now lock the fund.\n\nSignature: ${signature}`);
        }
      }
    };
    signOffFun();
  }, [walletAddress, chainId, fundData, isFundLoading, fundAddress, signData]);
  const lockIn = useCallback(() => {
    const lockInFun = async () => {
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'lockTerms',
        args: [oracleSign],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);

      // Clear the saved signature after successful lock
      const storageKey = `fund-signature-${fundAddress.toLowerCase()}`;
      localStorage.removeItem(storageKey);

      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    lockInFun();
  }, [oracleSign, chainContracts, fundAddress]);
  const deposit = useCallback(() => {
    const depositFun = async () => {
      if (isFundLoading || isTokenLoading || !chainContracts || !fundData || !tokenData || !walletAddress) {
        alert('Please ensure wallet is connected and data is loaded');
        return;
      }

      try {
        const depoTime: bigint = nextPermitTime();
        const depoAmount: bigint = parseUnits(funderDepo, Number(tokenData.decimals));
        const depoNonce: bigint = (await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.payoutToken,
          abi: chainContracts.FundToken.abi,
          functionName: 'nonces',
          args: [walletAddress],
        })) as bigint;

        const signature = await signData({
          account: walletAddress as `0x${string}`,
          domain: {
            name: tokenData.name,
            version: '1',
            chainId: chainId,
            verifyingContract: fundData.payoutToken,
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
            owner: walletAddress as `0x${string}`,
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
          args: [fundData.payoutToken, walletAddress as `0x${string}`, depoAmount, depoTime, signature],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Deposit successful! Transaction: ${hash}`);
        setFunderDepo(''); // Clear input
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Deposit error:', error);
        alert(`Deposit failed: ${error.message || 'Unknown error'}`);
      }
    };
    depositFun();
  }, [walletAddress, chainId, isFundLoading, isTokenLoading, funderDepo, fundData, tokenData, chainContracts, signData, fundAddress]);
  const signWithdrawal = useCallback(() => {
    const signWithdrawalFun = async () => {
      if (!chainContracts || isTokenLoading || !tokenData || !walletAddress) {
        alert('Please ensure wallet is connected and data is loaded');
        return;
      }

      try {
        const withAmount: bigint = parseUnits(workerWith, Number(tokenData.decimals));
        const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'nonce',
          args: [],
        }) as bigint;

        const signature = await signData({
          account: walletAddress as `0x${string}`,
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

        // Save withdrawal signature AND amount to localStorage
        const storageKey = `fund-withdrawal-${fundAddress.toLowerCase()}-${nonce}`;
        const withdrawalData = {
          signature,
          amount: workerWith,
          nonce: nonce.toString()
        };
        localStorage.setItem(storageKey, JSON.stringify(withdrawalData));

        // Auto-fill the withdrawal signature field
        if (walletAddress.toLowerCase() === fundData?.worker?.toLowerCase()) {
          // Auto-fill the signature input field
          setOracleSign(signature);
          alert("Withdrawal signature generated and filled! You can now execute the withdrawal.");
        } else {
          alert(`Withdrawal signature saved! The worker can now execute the withdrawal for ${workerWith} tokens.\n\nSignature: ${signature}`);
        }
      } catch (error: any) {
        console.error('Sign withdrawal error:', error);
        alert(`Failed to sign withdrawal: ${error.message || 'Unknown error'}`);
      }
    };
    signWithdrawalFun();
  }, [walletAddress, chainId, isTokenLoading, workerWith, fundData, tokenData, chainContracts, fundAddress, signData]);
  const execWithdrawal = useCallback(() => {
    const execWithdrawalFun = async () => {
      if (!chainContracts || isTokenLoading || !tokenData || !oracleSign) {
        alert('Please ensure oracle has signed the withdrawal');
        return;
      }

      if (!workerWith || parseFloat(workerWith) <= 0) {
        alert('Please enter a valid withdrawal amount');
        return;
      }

      try {
        const withAmount: bigint = parseUnits(workerWith, Number(tokenData.decimals));

        // Get the current nonce before withdrawal
        const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'nonce',
          args: [],
        }) as bigint;

        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'withdraw',
          args: [withAmount, oracleSign as `0x${string}`],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);

        // Clear the saved withdrawal signature after successful withdrawal
        const storageKey = `fund-withdrawal-${fundAddress.toLowerCase()}-${nonce}`;
        localStorage.removeItem(storageKey);

        alert(`Withdrawal successful! Transaction: ${hash}`);
        setWorkerWith(''); // Clear input
        setOracleSign(''); // Clear signature
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Withdrawal error:', error);
        alert(`Withdrawal failed: ${error.message || 'Unknown error'}`);
      }
    };
    execWithdrawalFun();
  }, [chainContracts, tokenData, isTokenLoading, workerWith, oracleSign, fundAddress]);
  const refund = useCallback(() => {
    const refundFun = async () => {
      if (!chainContracts) {
        alert('Please ensure wallet is connected');
        return;
      }

      if (!confirm('Are you sure you want to refund all funders? This will return their proportional deposits and cannot be undone.')) {
        return;
      }

      try {
        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'refund',
          args: [],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Refund successful! All funders will receive their proportional deposits back. Transaction: ${hash}`);
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Refund error:', error);
        alert(`Refund failed: ${error.message || 'Unknown error'}`);
      }
    };
    refundFun();
  }, [chainContracts, fundAddress]);
  const closeFund = useCallback(() => {
    const closeFundFun = async () => {
      if (!chainContracts) {
        alert('Please ensure wallet is connected');
        return;
      }

      if (!confirm('Are you sure you want to close the fund? This will prevent future deposits and cannot be undone.')) {
        return;
      }

      try {
        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'close',
          args: [],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Close successful! Transaction: ${hash}`);
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Close error:', error);
        alert(`Close failed: ${error.message || 'Unknown error'}`);
      }
    };
    closeFundFun();
  }, [chainContracts, fundAddress]);

  useEffect(() => {
    const loadWithdrawalSignature = async () => {
      if (!!chainContracts && !isFundLoading && !!fundData && (fundData.status !== 'pending') && walletAddress?.toLowerCase() === fundData.worker.toLowerCase()) {
        try {
          const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
            address: fundAddress,
            abi: chainContracts.Fund.abi,
            functionName: 'nonce',
            args: [],
          }) as bigint;

          const storageKey = `fund-withdrawal-${fundAddress.toLowerCase()}-${nonce}`;
          const savedData = localStorage.getItem(storageKey);
          if (savedData) {
            try {
              const withdrawalData = JSON.parse(savedData);
              setOracleSign(withdrawalData.signature);
              setWorkerWith(withdrawalData.amount);
              console.log('Loaded saved withdrawal signature and amount from localStorage');
            } catch (e) {
              // Old format (just signature string), handle gracefully
              setOracleSign(savedData);
              console.log('Loaded saved withdrawal signature from localStorage (old format)');
            }
          }
        } catch (error) {
          console.error('Error loading withdrawal signature:', error);
        }
      }
    };
    loadWithdrawalSignature();
  }, [chainContracts, fundAddress, fundData, isFundLoading, walletAddress]);
  useEffect(() => {
    if (!!chainContracts && !isFundLoading && !!fundData) {
      readContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundData.payoutToken,
        abi: chainContracts.FundToken.abi,
        functionName: 'balanceOf',
        args: [fundAddress],
      }).then(setFundTokenSupply);
    };
  }, [chainContracts, setFundTokenSupply, fundAddress, fundData, isFundLoading]);

  return (
    <div className="flex flex-col gap-y-4">
      <h2>Fund @ <Address address={fundAddress} /></h2>
      <div className="flex flex-col gap-y-2">
        {(isFundLoading || isFundPending) ? (
          <span>Loading...</span>
        ) : (!fundData) ? (
          <span>Error! Unable to load fund.</span>
        ) : (
          <>
            <>
              <h3>Meta</h3>
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
                  <StatusBadge status={fundData.status} />
                </li>
                <li>
                  <strong>Token: </strong>
                  <Address address={fundData.payoutToken} />
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
                        {formatNumber(formatUnits(fundTokenSupply, Number(tokenData.decimals)))} {tokenData.symbol}
                      </li>
                    </ul>
                  )}
                </li>
              </ul>
            </>
            <>
              <h3>Terms</h3>
              {!termsData ? (
                <span>Loading...</span>
              ) : (
                <>
                  <p>
                    <strong>Reference: </strong>
                    <Link
                      className="transition-colors duration-200 hover:bg-gray-100 underline"
                      href={termsData.url || `https://gateway.pinata.cloud/ipfs/${fundData.terms}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {fundData.terms}
                    </Link>
                  </p>
                  {!termsData?.text ? (
                    <p className="italic">Extended IPFS Data Unavailable</p>
                  ) : (
                    <>
                      <h4>{termsData.title || "Untitled"}</h4>
                      <p className="whitespace-pre-line">{termsData.text}</p>
                    </>
                  )}
                </>
              )}
            </>
            <>
              <h3>Actions</h3>
              {(walletAddress?.toLowerCase() === fundData.oracle.toLowerCase() && (fundData.status === 'pending')) && (
                <button onClick={signOff}>
                  Sign Off
                </button>
              )}
              {(walletAddress?.toLowerCase() === fundData.worker.toLowerCase() && (fundData.status === 'pending')) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Oracle Signature</h3>
                  <p className="text-sm text-gray-600">
                    Cryptographic signature from oracle approving the fund terms (132 chars)
                  </p>
                  <input
                    className="border-black border-1 px-2 py-1"
                    pattern="^0x[a-fA-F0-9]{130}$"
                    value={oracleSign}
                    onChange={(e) => setOracleSign(e.target.value)}
                    placeholder={`0x${'0'.repeat(130)}`}
                  />
                  <button onClick={lockIn} disabled={!oracleSign}>
                    Lock In
                  </button>
                </div>
              )}
              {(isConnected && (fundData.status === 'active')) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Deposit Amount</h3>
                  <input
                    className="border-black border-1 px-2 py-1"
                    type="number"
                    step="0.0001"
                    value={funderDepo}
                    onChange={(e) => setFunderDepo(e.target.value)}
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
                  (fundData.status !== 'pending')
              ) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Withdrawal Amount</h3>
                  <input
                    className="border-black border-1 px-2 py-1"
                    type="number"
                    step="0.0001"
                    value={workerWith}
                    onChange={(e) => setWorkerWith(e.target.value)}
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
                        onChange={(e) => setOracleSign(e.target.value)}
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
                  (fundData.status !== 'pending')
              ) && (
                <button onClick={refund}>
                  Refund
                </button>
              )}
              {(
                  (walletAddress?.toLowerCase() === fundData.worker.toLowerCase() ||
                  walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) &&
                  (fundData.status === 'active')
              ) && (
                <button onClick={closeFund}>
                  Close
                </button>
              )}
            </>
          </>
        )}
      </div>
    </div>
  )
}
