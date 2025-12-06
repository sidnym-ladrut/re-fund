'use client'
import { use, useState, useEffect, useMemo, useCallback, ChangeEvent } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { useSignTypedData, useReadContracts } from 'wagmi'
import { parseUnits, formatUnits, keccak256, type Address as AddressType } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { Address } from "@/comp/Address";
import { StatusBadge } from '@/comp/StatusBadge';
import { Card } from "@/comp/Card";
import { formatNumber, nextPermitTime } from "@/lib/util";
import { useChainContracts } from "@/hook/wallet";
import { simulateContract, writeContract } from '@wagmi/core'
import { useFundStaticData, useTokenData, useTermsData, useFundEvents, type DepositEvent } from "@/hook/useFundData";
import { parseStatus } from "@/lib/util";
import { FundStatus } from "@/type";
import { APPKIT_WAGMI, PINATA } from "@/cfg";

// Minimal ABI for Chainlink price feed
const PRICE_FEED_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function assertValidAddress(value: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    notFound();
  }
}

// Component to display a deposit table row with price conversion
function DepositTableRow({
  deposit,
  fundAddress,
  payoutToken,
  payoutDecimals,
  payoutSymbol,
  allTokenBalances,
  idx,
}: {
  deposit: DepositEvent;
  fundAddress: AddressType;
  payoutToken: AddressType;
  payoutDecimals: number;
  payoutSymbol: string;
  allTokenBalances: Array<{address: AddressType, symbol: string, decimals: number, balance: bigint}>;
  idx: number;
}) {
  const { data: depositTokenData } = useTokenData(deposit.token);
  const chainContracts = useChainContracts();

  const tokenInfo = allTokenBalances.find(t => t.address.toLowerCase() === deposit.token.toLowerCase());
  const depositDecimals = depositTokenData?.decimals ? Number(depositTokenData.decimals) : (tokenInfo?.decimals ?? payoutDecimals);
  const depositSymbol = depositTokenData?.symbol ?? tokenInfo?.symbol ?? payoutSymbol;
  const isPayoutToken = deposit.token.toLowerCase() === payoutToken.toLowerCase();

  // Fetch price feeds for both tokens to calculate conversion
  const { data: priceData } = useReadContracts({
    contracts: [
      {
        address: fundAddress,
        abi: chainContracts?.Fund?.abi || [],
        functionName: 'tokenFeeds',
        args: [deposit.token],
      },
      {
        address: fundAddress,
        abi: chainContracts?.Fund?.abi || [],
        functionName: 'tokenFeeds',
        args: [payoutToken],
      },
    ],
    query: {
      enabled: !isPayoutToken && !!chainContracts?.Fund?.abi,
    },
  });

  const depositFeedAddress = priceData?.[0]?.result as AddressType | undefined;
  const payoutFeedAddress = priceData?.[1]?.result as AddressType | undefined;

  // Fetch actual prices from the feeds
  const { data: feedData } = useReadContracts({
    contracts: [
      {
        address: depositFeedAddress!,
        abi: PRICE_FEED_ABI,
        functionName: 'latestRoundData',
      },
      {
        address: depositFeedAddress!,
        abi: PRICE_FEED_ABI,
        functionName: 'decimals',
      },
      {
        address: payoutFeedAddress!,
        abi: PRICE_FEED_ABI,
        functionName: 'latestRoundData',
      },
      {
        address: payoutFeedAddress!,
        abi: PRICE_FEED_ABI,
        functionName: 'decimals',
      },
    ],
    query: {
      enabled: !isPayoutToken && !!depositFeedAddress && !!payoutFeedAddress,
    },
  });

  // Calculate converted value
  let convertedValue: string;
  if (isPayoutToken) {
    // Same token - no conversion needed
    convertedValue = formatNumber(parseFloat(formatUnits(deposit.amount, depositDecimals)));
  } else if (feedData) {
    const depositPriceData = feedData[0]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
    const depositFeedDecimals = feedData[1]?.result as number | undefined;
    const payoutPriceData = feedData[2]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
    const payoutFeedDecimals = feedData[3]?.result as number | undefined;

    if (depositPriceData && payoutPriceData && depositFeedDecimals !== undefined && payoutFeedDecimals !== undefined) {
      const depositPrice = depositPriceData[1]; // answer is at index 1
      const payoutPrice = payoutPriceData[1];

      if (depositPrice > 0n && payoutPrice > 0n) {
        // Value in payout token = (amount * depositPrice * 10^payoutDecimals) / (payoutPrice * 10^depositDecimals)
        const valueInPayout = (deposit.amount * depositPrice * BigInt(10 ** payoutDecimals)) / 
                              (payoutPrice * BigInt(10 ** depositDecimals));
        
        convertedValue = formatNumber(formatUnits(valueInPayout, payoutDecimals));
      } else {
        convertedValue = '...';
      }
    } else {
      convertedValue = '...';
    }
  } else {
    convertedValue = '...';
  }

  return (
    <tr key={`${deposit.transactionHash}-${idx}`} className="border-b border-gray-100">
      <td className="py-2">
        <Address address={deposit.funder} />
      </td>
      <td className="py-2 text-right">
        {formatNumber(parseFloat(formatUnits(deposit.amount, depositDecimals)))} {depositSymbol}
      </td>
      <td className="py-2 text-right">
        {convertedValue}
      </td>
      <td className="py-2 text-right">
        {deposit.timestamp ? new Date(deposit.timestamp * 1000).toLocaleString() : `Block #${deposit.blockNumber}`}
      </td>
    </tr>
  );
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
  const { data: eventsData, isLoading: isEventsLoading } = useFundEvents(fundAddress);

  const [fundTokenSupply, setFundTokenSupply] = useState<bigint>(0n);
  const [allTokenBalances, setAllTokenBalances] = useState<Array<{address: `0x${string}`, symbol: string, decimals: number, balance: bigint}>>([]);
  const [termsSignature, setTermsSignature] = useState<string>(""); // For locking terms
  const [withdrawalSignature, setWithdrawalSignature] = useState<string>(""); // For withdrawals
  const [funderDepo, setFunderDepo] = useState<string>("");
  const [workerWith, setWorkerWith] = useState<string>("");
  const [requestedAmount, setRequestedAmount] = useState<string>(""); // Worker's withdrawal request
  const [supportsPermit, setSupportsPermit] = useState<boolean | null>(null); // null = checking, true = permit, false = standard
  const [isApproving, setIsApproving] = useState<boolean>(false); // For standard approve step
  const [paymentToken, setPaymentToken] = useState<`0x${string}` | 'custom' | null>(null); // Token user wants to pay with
  const [customTokenAddress, setCustomTokenAddress] = useState<string>(""); // For custom token input

  // Compute effective payment token address
  const effectivePaymentToken: `0x${string}` | null = useMemo(() => {
    if (paymentToken === 'custom') {
      return /^0x[a-fA-F0-9]{40}$/.test(customTokenAddress) ? customTokenAddress as `0x${string}` : null;
    }
    return paymentToken ?? fundData?.payoutToken ?? null;
  }, [paymentToken, customTokenAddress, fundData?.payoutToken]);

  // Fetch data for the selected payment token (may differ from payout token)
  const { data: paymentTokenData, isLoading: isPaymentTokenLoading } = useTokenData(effectivePaymentToken);

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

  // Initialize payment token to payout token when fund data loads
  useEffect(() => {
    if (fundData?.payoutToken && paymentToken === null) {
      setPaymentToken(fundData.payoutToken);
    }
  }, [fundData?.payoutToken, paymentToken]);

  // Detect if PAYMENT token supports ERC20Permit (has nonces function)
  useEffect(() => {
    const checkPermitSupport = async () => {
      if (!effectivePaymentToken || !chainContracts || !walletAddress) {
        setSupportsPermit(null);
        return;
      }
      try {
        await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: effectivePaymentToken,
          abi: chainContracts.FundToken.abi,
          functionName: 'nonces',
          args: [walletAddress],
        });
        setSupportsPermit(true); // Has nonces = supports permit
      } catch {
        setSupportsPermit(false); // No nonces = standard ERC20
      }
    };
    checkPermitSupport();
  }, [effectivePaymentToken, chainContracts, walletAddress]);

  // Check if payment token is the native payout token
  const isNativeToken: boolean = useMemo(() => {
    return !!effectivePaymentToken && !!fundData?.payoutToken &&
      effectivePaymentToken.toLowerCase() === fundData.payoutToken.toLowerCase();
  }, [effectivePaymentToken, fundData?.payoutToken]);

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
      if (isFundLoading || isTokenLoading || isPaymentTokenLoading || !chainContracts || !fundData || !paymentTokenData || !walletAddress || !effectivePaymentToken) {
        alert('Please ensure wallet is connected and data is loaded');
        return;
      }

      try {
        const depoAmount: bigint = parseUnits(funderDepo, Number(paymentTokenData.decimals));

        // PATH A: Native payout token with permit support (gasless)
        if (isNativeToken && supportsPermit) {
          const depoTime: bigint = nextPermitTime();
          const depoNonce: bigint = (await readContract(APPKIT_WAGMI.wagmiConfig, {
            address: effectivePaymentToken,
            abi: chainContracts.FundToken.abi,
            functionName: 'nonces',
            args: [walletAddress],
          })) as bigint;

          const signature = await signData({
            account: walletAddress as `0x${string}`,
            domain: {
              name: paymentTokenData.name,
              version: '1',
              chainId: chainId,
              verifyingContract: effectivePaymentToken,
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
            args: [effectivePaymentToken, walletAddress as `0x${string}`, depoAmount, depoTime, signature],
          });

          const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
          alert(`Deposit successful! Transaction: ${hash}`);
        } else {
          // PATH B & C: Standard ERC20 flow (native without permit OR foreign token)
          // Foreign tokens MUST use approve+deposit since permit is for the token contract, not the fund
          setIsApproving(true);

          // Step 1: Approve the fund contract to spend tokens
          const { request: approveRequest } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
            address: effectivePaymentToken,
            abi: chainContracts.FundToken.abi,
            functionName: 'approve',
            args: [fundAddress, depoAmount],
          });
          const approveHash = await writeContract(APPKIT_WAGMI.wagmiConfig, approveRequest);
          console.log('Approve transaction:', approveHash);

          setIsApproving(false);

          // Step 2: Call the standard deposit function with the selected token
          const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
            address: fundAddress,
            abi: chainContracts.Fund.abi,
            functionName: 'deposit',
            args: [effectivePaymentToken, depoAmount],
          });

          const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
          alert(`Deposit successful! Transaction: ${hash}`);
        }

        setFunderDepo(''); // Clear input
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        setIsApproving(false);
        console.error('Deposit error:', error);
        alert(`Deposit failed: ${error.message || 'Unknown error'}`);
      }
    };
    depositFun();
  }, [walletAddress, chainId, isFundLoading, isTokenLoading, isPaymentTokenLoading, funderDepo, fundData, paymentTokenData, chainContracts, signData, fundAddress, supportsPermit, effectivePaymentToken, isNativeToken]);
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

  // Fetch payout token balance (for backward compatibility)
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

  // Fetch all treasury token balances
  useEffect(() => {
    const fetchAllBalances = async () => {
      if (!chainContracts || isFundLoading || !fundData) return;

      try {
        // Get the number of treasury tokens
        const balances: Array<{address: `0x${string}`, symbol: string, decimals: number, balance: bigint}> = [];
        
        // Try to get treasury tokens (may fail if none deposited yet)
        let tokenIndex = 0;
        while (tokenIndex < 10) { // Max 10 tokens to prevent infinite loop
          try {
            const tokenAddr = await readContract(APPKIT_WAGMI.wagmiConfig, {
              address: fundAddress,
              abi: chainContracts.Fund.abi,
              functionName: 'treasuryTokens',
              args: [BigInt(tokenIndex)],
            }) as `0x${string}`;

            // Get token details
            const [symbol, decimals, balance] = await Promise.all([
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: tokenAddr,
                abi: chainContracts.FundToken.abi,
                functionName: 'symbol',
                args: [],
              }) as Promise<string>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: tokenAddr,
                abi: chainContracts.FundToken.abi,
                functionName: 'decimals',
                args: [],
              }) as Promise<number>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: tokenAddr,
                abi: chainContracts.FundToken.abi,
                functionName: 'balanceOf',
                args: [fundAddress],
              }) as Promise<bigint>,
            ]);

            if (balance > 0n) {
              balances.push({ address: tokenAddr, symbol, decimals, balance });
            }
            tokenIndex++;
          } catch {
            // No more tokens or error - break the loop
            break;
          }
        }
        
        setAllTokenBalances(balances);
      } catch (error) {
        console.error('Error fetching treasury balances:', error);
      }
    };

    fetchAllBalances();
  }, [chainContracts, fundAddress, fundData, isFundLoading]);

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
                {allTokenBalances.length > 0 ? (
                  <div className="flex flex-col items-center text-sm">
                    {allTokenBalances.map(({ address, symbol, decimals, balance }) => (
                      <span key={address}>
                        {formatNumber(parseFloat(formatUnits(balance, decimals)))} {symbol}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span>{formatNumber(parseFloat(formatUnits(fundTokenSupply, Number(tokenData.decimals))))} {tokenData.symbol}</span>
                )}
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
                {(isConnected && (fundData.status === 'active')) && (
                  <Card title="Deposit">
                    {/* Token Selector */}
                    <div className="flex flex-col gap-2 mb-2">
                      <select
                        className="border-black border-1 px-2 py-1"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setPaymentToken('custom');
                          } else {
                            setPaymentToken(val as `0x${string}`);
                            setCustomTokenAddress('');
                          }
                        }}
                        value={paymentToken === 'custom' ? 'custom' : (paymentToken ?? fundData.payoutToken)}
                        disabled={isApproving}
                      >
                        <option value={fundData.payoutToken}>
                          {tokenData.symbol} (Recommended)
                        </option>
                        {chainContracts?.TestUSDC?.address && chainContracts.TestUSDC.address !== fundData.payoutToken && (
                          <option value={chainContracts.TestUSDC.address}>USDC</option>
                        )}
                        {chainContracts?.TestUSDT?.address && chainContracts.TestUSDT.address !== fundData.payoutToken && (
                          <option value={chainContracts.TestUSDT.address}>USDT</option>
                        )}
                        {chainContracts?.FundToken?.address && chainContracts.FundToken.address !== fundData.payoutToken && (
                          <option value={chainContracts.FundToken.address}>FUND</option>
                        )}
                        {chainContracts?.TestWETH?.address && chainContracts.TestWETH.address !== fundData.payoutToken && (
                          <option value={chainContracts.TestWETH.address}>WETH</option>
                        )}
                        <option value="custom">Other / Custom Address...</option>
                      </select>
                      {paymentToken === 'custom' && (
                        <input
                          className="border-black border-1 px-2 py-1"
                          placeholder="Paste Token Address (0x...)"
                          value={customTokenAddress}
                          onChange={(e) => setCustomTokenAddress(e.target.value)}
                          disabled={isApproving}
                        />
                      )}
                      {!isNativeToken && effectivePaymentToken && (
                        <p className="text-xs text-amber-600">
                          ⚠️ Foreign token - will be swapped to {tokenData.symbol} on withdrawal
                        </p>
                      )}
                    </div>
                    {isApproving && (
                      <div className="bg-blue-100 border border-blue-400 text-blue-700 px-3 py-2 rounded mb-2 flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm">Step 1: Approving token transfer...</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        className="border-black border-1 px-2 py-1 max-w-[200px]"
                        type="number"
                        step="0.0001"
                        value={funderDepo}
                        onChange={(e) => setFunderDepo(e.target.value)}
                        placeholder={`Amount${paymentTokenData ? ` (${paymentTokenData.symbol})` : ''}`}
                        disabled={isApproving}
                      />
                      <button onClick={deposit} disabled={isApproving || !effectivePaymentToken} className="flex items-center gap-1">
                        {isNativeToken && supportsPermit && <span title="Gasless permit">⚡</span>}
                        {isApproving ? 'Depositing...' : 'Deposit'}
                      </button>
                    </div>
                    {(isNativeToken && supportsPermit === false) && (
                      <p className="text-xs text-gray-500 mt-1">Requires 2 transactions (approve + deposit)</p>
                    )}
                    {!isNativeToken && (
                      <p className="text-xs text-gray-500 mt-1">Requires 2 transactions (approve + deposit)</p>
                    )}
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
                {(
                  (isWorker || isOracle) &&
                  (fundData.status !== 'pending') &&
                  ((fundTokenSupply > 0n) || (fundData.status === 'active'))
                ) && (
                  <Card title="Finalize">
                    <div className="flex justify-around">
                      {(fundTokenSupply > 0n) && (
                        <button onClick={refund}>
                          Refund
                        </button>
                      )}
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

            {/* Deposit History Section */}
            {eventsData?.deposits && eventsData.deposits.length > 0 && (
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-200">
                <h3>Deposit History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Funder</th>
                        <th className="text-right py-2">Deposited</th>
                        <th className="text-right py-2">Value ({tokenData?.symbol})</th>
                        <th className="text-right py-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundData && tokenData && eventsData.deposits.map((deposit, idx) => (
                        <DepositTableRow
                          key={`${deposit.transactionHash}-${idx}`}
                          deposit={deposit}
                          fundAddress={fundAddress}
                          payoutToken={fundData.payoutToken}
                          payoutDecimals={Number(tokenData.decimals)}
                          payoutSymbol={tokenData.symbol}
                          allTokenBalances={allTokenBalances}
                          idx={idx}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
