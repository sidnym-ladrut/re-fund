'use client'
import { useState } from 'react';
import Link from 'next/link'
import { useAppKitAccount } from "@reown/appkit/react";
import { useReadContracts } from 'wagmi';
import { ConnectButton } from "@/comp/ConnectButton";
import { Card } from "@/comp/Card";
import { Address } from "@/comp/Address";
import { StatusBadge } from "@/comp/StatusBadge";
import { useAllFunds, useFundStaticData, useTokenData, useFundEvents, useFundEventWatcher, DepositEvent } from "@/hook/useFundData";
import { formatUnits } from 'viem';
import { formatNumber } from '@/lib/util';
import type { Address as AddressType } from 'viem';
import { useChainContracts } from '@/hook/wallet';

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

export default function FundTracker() {
  const { isConnected } = useAppKitAccount();
  const [selectedFund, setSelectedFund] = useState<AddressType | null>(null);

  const { data: allFunds, isLoading: fundsLoading } = useAllFunds();

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="mb-6">Fund Tracker</h1>
        <p className="text-gray-600 mb-6">Connect your wallet to track all funds</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2">Global Browser</h1>
        <p className="text-gray-600">Monitor all crowdfunding campaigns in one place</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center justify-between text-sm text-blue-800">
        <div className="flex items-center gap-2">
          <span className="text-blue-500">💡</span>
          <span><strong>Live Updates:</strong> Auto-refreshes when events occur</span>
        </div>
        <div className="font-semibold">
          Total Funds: {allFunds?.length || 0}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Fund List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg overflow-hidden">
            {fundsLoading ? (
              <div className="text-center py-12 text-gray-500">Loading funds...</div>
            ) : !allFunds || allFunds.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No funds found</div>
            ) : (
              <div>
                {/* Table Headers */}
                <div className="hidden sm:grid sm:grid-cols-6 gap-2 px-3 py-2 bg-gray-100 text-xs font-bold text-gray-700">
                  <div>Fund</div>
                  <div>Worker</div>
                  <div>Payout Token</div>
                  <div className="text-right">Remaining</div>
                  <div className="text-right"># Funders</div>
                  <div className="text-right">Status</div>
                </div>

                {/* Fund Rows */}
                <div>
                  {allFunds.map((fundAddress, idx) => (
                    <FundListItem
                      key={fundAddress}
                      address={fundAddress}
                      isSelected={selectedFund === fundAddress}
                      onClick={() => setSelectedFund(fundAddress)}
                      isEven={idx % 2 === 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Fund Details */}
        <div className="lg:col-span-2">
          {selectedFund ? (
            <FundDetailView fundAddress={selectedFund} />
          ) : (
            <Card>
              <div className="text-center py-12 text-gray-500">
                <p className="mb-2">👈 Select a fund from the list to view details</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Fund list item with full details
function FundListItem({
  address,
  isSelected,
  onClick,
  isEven
}: {
  address: AddressType;
  isSelected: boolean;
  onClick: () => void;
  isEven: boolean;
}) {
  const { data: fundData, isLoading: fundLoading } = useFundStaticData(address);
  const { data: tokenData } = useTokenData(fundData?.payoutToken || null);
  const { data: events } = useFundEvents(address);

  if (fundLoading) {
    return (
      <div className={`p-3 animate-pulse ${isEven ? 'bg-white' : 'bg-gray-50'}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!fundData || !tokenData) return null;

  // Use the contract's on-chain calculated value (handles multi-token + price conversions)
  const remaining = fundData.fundsAvailable;

  // Count unique funders from events (this is just a count, not affected by decimals)
  const deposits = events?.deposits || [];
  const uniqueFunders = new Set(deposits.map(d => d.funder)).size;

  // NOTE: Naive off-chain aggregation - DO NOT USE for multi-token funds!
  // This breaks when deposits use different tokens with different decimals.
  // Example: 100 USDC (6 dec) + 100 DAI (18 dec) = wrong sum displayed as $100 trillion
  // const withdrawals = events?.withdrawals || [];
  // const refunds = events?.refunds || [];
  // const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, 0n);
  // const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0n);
  // const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0n);
  // const remaining = totalDeposited - totalWithdrawn - totalRefunded;

  // Compute background color class
  let bgClass = '';
  if (isSelected) {
    bgClass = 'bg-blue-100';
  } else if (isEven) {
    bgClass = 'bg-white hover:bg-gray-50';
  } else {
    bgClass = 'bg-gray-50 hover:bg-gray-100';
  }

  return (
    <button
      onClick={onClick}
      className={`w-full grid grid-cols-2 sm:grid-cols-6 gap-2 px-3 py-2 transition-all text-xs items-center ${bgClass}`}
      style={{ textAlign: 'left', border: 'none', outline: 'none' }}
    >
      <div className="col-span-2 sm:col-span-1 truncate">
        <Address address={address} short className="text-xs" />
      </div>
      <div className="col-span-2 sm:col-span-1 truncate">
        <Address address={fundData.worker} short className="text-xs" />
      </div>
      <div className="col-span-1 font-medium whitespace-nowrap">
        {tokenData.symbol}
      </div>
      <div className="col-span-1 text-right font-medium text-green-600 whitespace-nowrap">
        {remaining === 0n ? '0' : formatNumber(formatUnits(remaining, Number(tokenData.decimals)))}
      </div>
      <div className="col-span-1 text-right font-medium whitespace-nowrap">
        {uniqueFunders}
      </div>
      <div className="col-span-2 sm:col-span-1 flex items-center justify-start sm:justify-end">
        <StatusBadge status={fundData.status} />
      </div>
    </button>
  );
}

// Component to display a deposit with its original token info
function DepositItem({ 
  deposit, 
  payoutTokenData,
  fundAddress,
  payoutToken,
}: { 
  deposit: DepositEvent; 
  payoutTokenData: { symbol: string; decimals: bigint };
  fundAddress: AddressType;
  payoutToken: AddressType;
}) {
  const { data: depositTokenData } = useTokenData(deposit.token);
  const chainContracts = useChainContracts();

  const depositDecimals = depositTokenData?.decimals ?? payoutTokenData.decimals;
  const depositSymbol = depositTokenData?.symbol ?? payoutTokenData.symbol;
  const isDifferentToken = deposit.token.toLowerCase() !== payoutToken.toLowerCase();

  // Fetch price feeds for both tokens to calculate conversion
  const { data: priceData } = useReadContracts({
    contracts: [
      // Get the feed address for the deposit token
      {
        address: fundAddress,
        abi: chainContracts?.Fund?.abi || [],
        functionName: 'tokenFeeds',
        args: [deposit.token],
      },
      // Get the feed address for the payout token  
      {
        address: fundAddress,
        abi: chainContracts?.Fund?.abi || [],
        functionName: 'tokenFeeds',
        args: [payoutToken],
      },
    ],
    query: {
      enabled: isDifferentToken && !!chainContracts?.Fund?.abi,
    },
  });

  const depositFeedAddress = priceData?.[0]?.result as AddressType | undefined;
  const payoutFeedAddress = priceData?.[1]?.result as AddressType | undefined;

  // Fetch actual prices from the feeds
  const { data: feedData } = useReadContracts({
    contracts: [
      // Deposit token price
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
      // Payout token price
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
      enabled: isDifferentToken && !!depositFeedAddress && !!payoutFeedAddress,
    },
  });

  // Calculate converted value
  let convertedValue: string | null = null;
  if (isDifferentToken && feedData) {
    const depositPriceData = feedData[0]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
    const depositFeedDecimals = feedData[1]?.result as number | undefined;
    const payoutPriceData = feedData[2]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
    const payoutFeedDecimals = feedData[3]?.result as number | undefined;

    if (depositPriceData && payoutPriceData && depositFeedDecimals !== undefined && payoutFeedDecimals !== undefined) {
      const depositPrice = depositPriceData[1]; // answer is at index 1
      const payoutPrice = payoutPriceData[1];

      if (depositPrice > 0n && payoutPrice > 0n) {
        // Convert: (amount * depositPrice / 10^depositFeedDecimals) / (payoutPrice / 10^payoutFeedDecimals)
        // Simplified: amount * depositPrice * 10^payoutFeedDecimals / (payoutPrice * 10^depositFeedDecimals)
        // Also need to adjust for token decimals difference
        const depositTokenDecimals = Number(depositDecimals);
        const payoutTokenDecimals = Number(payoutTokenData.decimals);
        
        // Value in USD = amount * price / 10^(tokenDecimals + feedDecimals)
        // Then convert to payout token = valueInUSD * 10^(payoutDecimals + feedDecimals) / payoutPrice
        const valueInPayout = (deposit.amount * depositPrice * BigInt(10 ** payoutTokenDecimals)) / 
                              (payoutPrice * BigInt(10 ** depositTokenDecimals));
        
        convertedValue = formatNumber(formatUnits(valueInPayout, payoutTokenDecimals));
      }
    }
  }

  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
      <div className="flex justify-between items-start mb-1">
        <div>
          <span className="font-medium">
            {formatNumber(formatUnits(deposit.amount, Number(depositDecimals)))} {depositSymbol}
          </span>
          {isDifferentToken && (
            <span className="text-xs text-gray-500 ml-2">
              (≈ {convertedValue ?? '...'} {payoutTokenData.symbol})
            </span>
          )}
        </div>
        {deposit.timestamp && (
          <span className="text-xs text-gray-500">
            {new Date(deposit.timestamp * 1000).toLocaleString()}
          </span>
        )}
      </div>
      <div className="text-sm text-gray-600">
        From: <Address address={deposit.funder} short />
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Tx: {deposit.transactionHash.slice(0, 10)}...{deposit.transactionHash.slice(-8)}
      </div>
    </div>
  );
}

// Detail view - Events loaded ONLY for selected fund
function FundDetailView({ fundAddress }: { fundAddress: AddressType }) {
  const { data: fundData, isLoading: fundLoading } = useFundStaticData(fundAddress);
  const { data: tokenData, isLoading: tokenLoading } = useTokenData(fundData?.payoutToken || null);
  const { data: events, isLoading: eventsLoading } = useFundEvents(fundAddress);

  // Watch for real-time updates
  useFundEventWatcher(fundAddress);

  if (fundLoading || tokenLoading) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-500">Loading fund details...</div>
      </Card>
    );
  }

  if (!fundData || !tokenData) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-500">Failed to load fund data</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fund Overview */}
      <Card>
        <div className="mb-4 flex flex-row gap-x-4 items-start justify-between">
          <Link
            href={`/browser/${fundAddress}`}
            className="flex-1 text-blue-600 hover:text-blue-800 underline font-mono text-sm break-all"
          >
            {fundAddress}
          </Link>
          <div className="shrink-0">
            <StatusBadge status={fundData.status} />
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Worker</span>
            <Address address={fundData.worker} className="text-sm" />
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Oracle</span>
            <Address address={fundData.oracle} className="text-sm" />
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Oracle Cut</span>
            <span className="font-medium">{(Number(fundData.oracleCut) / 100).toFixed(2)}%</span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Payout Token</span>
            <span className="font-medium">{tokenData.symbol}</span>
          </div>

          {!!fundData.terms && (
            <div className="flex justify-between items-start">
              <span className="font-semibold text-gray-700 whitespace-nowrap mr-4">Terms CID</span>
              <Link
                href={`https://gateway.pinata.cloud/ipfs/${fundData.terms}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-right font-mono text-sm break-all"
              >
                {fundData.terms}
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* Transaction History */}
      <Card title="Transaction History">
        {eventsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading events...</div>
        ) : !events ? (
          <div className="text-center py-8 text-gray-500">No events found</div>
        ) : (
          <div className="space-y-4">
            {/* Deposits */}
            {events.deposits.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 text-green-700">💰 Deposits ({events.deposits.length})</h4>
                <div className="space-y-2">
                  {events.deposits.map((deposit, idx) => (
                    <DepositItem 
                      key={`deposit-${idx}`} 
                      deposit={deposit} 
                      payoutTokenData={tokenData}
                      fundAddress={fundAddress}
                      payoutToken={fundData.payoutToken}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Withdrawals */}
            {events.withdrawals.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 text-blue-700">📤 Withdrawals ({events.withdrawals.length})</h4>
                <div className="space-y-2">
                  {events.withdrawals.map((withdrawal, idx) => (
                    <div key={`withdrawal-${idx}`} className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-medium">
                            {formatNumber(formatUnits(withdrawal.amount, Number(tokenData.decimals)))} {tokenData.symbol}
                          </span>
                        </div>
                        {withdrawal.timestamp && (
                          <span className="text-xs text-gray-500">
                            {new Date(withdrawal.timestamp * 1000).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Tx: {withdrawal.transactionHash.slice(0, 10)}...{withdrawal.transactionHash.slice(-8)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refunds */}
            {events.refunds.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 text-red-700">↩️ Refunds ({events.refunds.length})</h4>
                <div className="space-y-2">
                  {events.refunds.map((refund, idx) => (
                    <div key={`refund-${idx}`} className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-medium">
                            {formatNumber(formatUnits(refund.amount, Number(tokenData.decimals)))} {tokenData.symbol}
                          </span>
                        </div>
                        {refund.timestamp && (
                          <span className="text-xs text-gray-500">
                            {new Date(refund.timestamp * 1000).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        To: <Address address={refund.refunder} short />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Tx: {refund.transactionHash.slice(0, 10)}...{refund.transactionHash.slice(-8)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {events.deposits.length === 0 && events.withdrawals.length === 0 && events.refunds.length === 0 && (
              <div className="text-center py-8 text-gray-500">No transactions yet</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
