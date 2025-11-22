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
import { Card } from "@/comp/Card";
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
  const { data: termsData, isLoading: isTermsLoading, isPending: isTermsPending } = useTermsData(fundData?.terms);
  const { data: tokenData , isLoading: isTokenLoading, isPending: isTokenPending } = useTokenData(fundData?.payoutToken);

  const [fundTokenSupply, setFundTokenSupply] = useState<bigint>(0n);
  const [termsSignature, setTermsSignature] = useState<string>(""); // For locking terms
  const [withdrawalSignature, setWithdrawalSignature] = useState<string>(""); // For withdrawals
  const [funderDepo, setFunderDepo] = useState<string>("");
  const [workerWith, setWorkerWith] = useState<string>("");
  const [requestedAmount, setRequestedAmount] = useState<string>(""); // Worker's withdrawal request

  const isLoading: boolean = useMemo(() => (
    [isFundLoading, isFundPending, isTermsLoading, isTermsPending, isTokenLoading, isTokenPending].some(v => v)
  ), [isFundLoading, isFundPending, isTermsLoading, isTermsPending, isTokenLoading, isTokenPending]);
  const chainId: number = useMemo(() => (
    Number(caipAddress?.split(':')?.[1] ?? 0)
  ), [caipAddress]);
  const isWorker: boolean = useMemo(() => (
    !!walletAddress && !!fundData && (walletAddress.toLowerCase() === fundData.worker.toLowerCase())
  ), [walletAddress, fundData]);
  const isOracle: boolean = useMemo(() => (
    !!walletAddress && !!fundData && (walletAddress.toLowerCase() === fundData.oracle.toLowerCase())
  ), [walletAddress, fundData]);

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
          setTermsSignature(signature);
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
        args: [termsSignature],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);

      // Clear the saved signature after successful lock
      const storageKey = `fund-signature-${fundAddress.toLowerCase()}`;
      localStorage.removeItem(storageKey);
      setTermsSignature(''); // Clear signature from state

      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    lockInFun();
  }, [termsSignature, chainContracts, fundAddress]);
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
  const requestWithdrawal = useCallback(async () => {
    if (!chainContracts || !fundData) {
      alert('Fund data not loaded');
      return;
    }

    if (!workerWith || parseFloat(workerWith) <= 0) {
      alert('Please enter a valid withdrawal amount');
      return;
    }

    try {
      const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'nonce',
        args: [],
      }) as bigint;

      const requestKey = `fund-withdrawal-request-${fundAddress.toLowerCase()}-${nonce}`;
      localStorage.setItem(requestKey, workerWith);
      setRequestedAmount(workerWith);
      alert(`Withdrawal request for ${workerWith} tokens saved! The oracle can now review and approve.`);
    } catch (error: any) {
      console.error('Request withdrawal error:', error);
      alert(`Failed to save withdrawal request: ${error.message || 'Unknown error'}`);
    }
  }, [chainContracts, fundData, workerWith, fundAddress]);
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

        // Clear the withdrawal request after oracle signs
        const requestKey = `fund-withdrawal-request-${fundAddress.toLowerCase()}-${nonce}`;
        localStorage.removeItem(requestKey);
        setRequestedAmount(''); // Clear from state

        // Auto-fill the withdrawal signature field
        if (walletAddress.toLowerCase() === fundData?.worker?.toLowerCase()) {
          // Auto-fill the signature input field
          setWithdrawalSignature(signature);
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
      if (!chainContracts || isTokenLoading || !tokenData || !withdrawalSignature) {
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
          args: [withAmount, withdrawalSignature as `0x${string}`],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);

        // Clear the saved withdrawal signature after successful withdrawal
        const storageKey = `fund-withdrawal-${fundAddress.toLowerCase()}-${nonce}`;
        localStorage.removeItem(storageKey);

        alert(`Withdrawal successful! Transaction: ${hash}`);
        setWorkerWith(''); // Clear input
        setWithdrawalSignature(''); // Clear signature
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Withdrawal error:', error);
        alert(`Withdrawal failed: ${error.message || 'Unknown error'}`);
      }
    };
    execWithdrawalFun();
  }, [chainContracts, tokenData, isTokenLoading, workerWith, withdrawalSignature, fundAddress]);
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

  // Load terms signature for worker
  useEffect(() => {
    // Always clear first to prevent cross-fund contamination
    setTermsSignature('');
    
    if (!!chainContracts && !isFundLoading && !!fundData && fundData.status === 'pending' && walletAddress?.toLowerCase() === fundData.worker.toLowerCase()) {
      const storageKey = `fund-signature-${fundAddress.toLowerCase()}`;
      const savedSignature = localStorage.getItem(storageKey);
      if (savedSignature) {
        setTermsSignature(savedSignature);
        console.log('Loaded saved terms signature from localStorage');
      }
    }
  }, [chainContracts, fundAddress, fundData, isFundLoading, walletAddress]);

  // Load withdrawal signature and amount for worker
  useEffect(() => {
    // Always clear first to prevent cross-fund contamination
    setWithdrawalSignature('');
    
    const loadWithdrawalSignature = async () => {
      // Only load if not worker for this fund
      if (!isWorker || fundData?.status === 'pending') {
        setWorkerWith('');
        return;
      }

      if (!!chainContracts && !isFundLoading && !!fundData) {
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
              setWithdrawalSignature(withdrawalData.signature);
              setWorkerWith(withdrawalData.amount);
              console.log('Loaded saved withdrawal signature and amount from localStorage');
            } catch (e) {
              // Old format (just signature string), handle gracefully
              setWithdrawalSignature(savedData);
              console.log('Loaded saved withdrawal signature from localStorage (old format)');
            }
          }
        } catch (error) {
          console.error('Error loading withdrawal signature:', error);
        }
      }
    };
    loadWithdrawalSignature();
  }, [chainContracts, fundAddress, fundData, isFundLoading, walletAddress, isWorker]);

  // Load withdrawal request for oracle
  useEffect(() => {
    const loadWithdrawalRequest = async () => {
      if (!isOracle || fundData?.status === 'pending') {
        setRequestedAmount('');
        return;
      }

      if (!!chainContracts && !isFundLoading && !!fundData) {
        try {
          const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
            address: fundAddress,
            abi: chainContracts.Fund.abi,
            functionName: 'nonce',
            args: [],
          }) as bigint;

          const requestKey = `fund-withdrawal-request-${fundAddress.toLowerCase()}-${nonce}`;
          const savedRequest = localStorage.getItem(requestKey);
          if (savedRequest) {
            setRequestedAmount(savedRequest);
            setWorkerWith(savedRequest); // Pre-fill the amount field
            console.log('Loaded worker withdrawal request from localStorage');
          }
        } catch (error) {
          console.error('Error loading withdrawal request:', error);
        }
      }
    };
    loadWithdrawalRequest();
  }, [chainContracts, fundAddress, fundData, isFundLoading, isOracle]);

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

  // Fund @ <Address address={fundAddress} />

  return isLoading ? (
    <span>Loading...</span>
  ) : (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row justify-between items-center gap-2 pb-2 border-b border-gray-200">
        <h2>{termsData?.title ?? "Untitled Fund"}</h2>
        <StatusBadge status={fundData.status} />
      </div>
      <div className="flex flex-col gap-y-2">
        {(!fundData) ? (
          <span>Error! Unable to load fund.</span>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 justify-items-center gap-2 pb-3 border-b border-gray-200">
              <div className="flex flex-col items-center gap-1">
                <h3>Worker</h3>
                <Address address={fundData.worker} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3>Oracle</h3>
                <Address address={fundData.oracle} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3>Contract</h3>
                <Address address={fundAddress} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3>Funds</h3>
                {formatNumber(formatUnits(fundTokenSupply, Number(tokenData.decimals)))} {tokenData.symbol}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[5fr_1fr] gap-4">
              <div className="flex flex-col gap-1">
                <h3>
                  <Link
                    className="underline"
                    href={termsData.url || `https://gateway.pinata.cloud/ipfs/${fundData.terms}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Description
                  </Link>
                </h3>
                <p className="whitespace-pre-line">{termsData.text}</p>
              </div>
              <div className="flex flex-col gap-1">
                <h3>Actions</h3>
                {(fundData.status === 'pending') && (
                  <Card title="Lock In" className="flex flex-col gap-2">
                    {isOracle && (
                      <button onClick={signOff}>
                        Sign Off
                      </button>
                    )}
                    {isWorker && (
                      <div className="flex gap-2">
                        <input
                          className="border-black border-1 px-2 py-1 max-w-[200px]"
                          pattern="^0x[a-fA-F0-9]{130}$"
                          value={termsSignature}
                          onChange={(e) => setTermsSignature(e.target.value)}
                          placeholder="Signature (0x...)"
                        />
                        <button onClick={lockIn} disabled={!termsSignature}>
                          Lock&nbsp;In
                        </button>
                      </div>
                    )}
                  </Card>
                )}
                {(isConnected && !isWorker && !isOracle && (fundData.status === 'active')) && (
                  <Card title="Deposit">
                    <div className="flex gap-2">
                      <input
                        className="border-black border-1 px-2 py-1 max-w-[200px]"
                        type="number"
                        step="0.0001"
                        value={funderDepo}
                        onChange={(e) => setFunderDepo(e.target.value)}
                        placeholder="Amount"
                      />
                      <button onClick={deposit}>
                        Deposit
                      </button>
                    </div>
                  </Card>
                )}
                {((isWorker || isOracle) && (fundData.status !== 'pending') && fundTokenSupply > 0n) && (
                  <Card title="Withdraw" className="flex flex-col gap-2">
                    {requestedAmount && isOracle && (
                      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded">
                        <p className="text-sm">Worker requested: {requestedAmount} tokens</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        className="border-black border-1 px-2 py-1 max-w-[200px]"
                        type="number"
                        step="0.0001"
                        value={workerWith}
                        onChange={(e) => setWorkerWith(e.target.value)}
                        placeholder="Amount"
                      />
                      {isOracle && (
                        <button onClick={signWithdrawal}>
                          Sign Off
                        </button>
                      )}
                    </div>
                    {isWorker && !withdrawalSignature && (
                      <button onClick={requestWithdrawal}>
                        Request Withdrawal
                      </button>
                    )}
                    {isWorker && (
                      <div className="flex gap-2">
                        <input
                          className="border-black border-1 px-2 py-1 max-w-[200px]"
                          pattern="^0x[a-fA-F0-9]{130}$"
                          value={withdrawalSignature}
                          onChange={(e) => setWithdrawalSignature(e.target.value)}
                          placeholder="Signature (0x...)"
                        />
                        <button onClick={execWithdrawal}>
                          Withdraw
                        </button>
                      </div>
                    )}
                  </Card>
                )}
                {((isWorker || isOracle) && (fundData.status !== 'pending') && fundTokenSupply > 0n) && (
                  <Card title="Finalize">
                    <div className="flex justify-around">
                      <button onClick={refund}>
                        Refund
                      </button>
                      {(fundData.status === 'active') && (
                        <button onClick={closeFund}>
                          Close
                        </button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
