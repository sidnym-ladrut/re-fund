'use client'
import { useState } from 'react';
import Link from 'next/link'
import { useAppKitAccount } from "@reown/appkit/react";
import { Card } from "@/comp/Card";
import { Address } from "@/comp/Address";
import { StatusBadge } from "@/comp/StatusBadge";
import { useAllFundsFull, useFundEvents, useFundEventWatcher } from "@/hook/useFundData";
import { formatUnits } from 'viem';
import { formatNumber } from '@/lib/util';
import type { FundStaticData, FundFullData, TermsData, TokenData, FundRole } from "@/type";

export default function FundTracker() {
  const { isConnected } = useAppKitAccount();
  const [selectedFund, setSelectedFund] = useState<Address | null>(null);
  const { data: funds, isPending: isFundsPending, isLoading: isFundsLoading } = useAllFundsFull();

  return (!isConnected) ? (
    <div className="text-center py-12">
      <h1 className="mb-6">Fund Tracker</h1>
      <p className="text-gray-600 mb-6">Connect your wallet to track all funds</p>
    </div>
  ) : (
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
          Total Funds: {(funds || [])?.length || 0}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Fund List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg overflow-hidden">
            {(isFundsPending || isFundsLoading) ? (
              <div className="text-center py-12 text-gray-500">Loading funds...</div>
            ) : ((funds || []).length === 0) ? (
              <div className="text-center py-12 text-gray-500">No funds found</div>
            ) : (
              <div>
                {/* Table Headers */}
                <div className="hidden sm:grid sm:grid-cols-6 gap-2 px-3 py-2 bg-gray-100 text-xs font-bold text-gray-700">
                  <div className="col-span-1 sm:col-span-2">Title</div>
                  <div>Worker</div>
                  <div className="text-right">Treasury</div>
                  <div className="text-right"># Funders</div>
                  <div className="text-right">Status</div>
                </div>

                {/* Fund Rows */}
                <div>
                  {funds.map((fund, idx) => (
                    <FundListItem
                      key={fund.address}
                      fund={fund}
                      isSelected={selectedFund === (fund.address)}
                      onClick={() => setSelectedFund(fund.address)}
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
          {!!selectedFund ? (
            <FundDetailView fund={funds.find((f) => (f.address === selectedFund))} />
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
  fund,
  isSelected,
  onClick,
  isEven
}: {
  fund: FundFullData;
  isSelected: boolean;
  onClick: () => void;
  isEven: boolean;
}) {
  const { data: events } = useFundEvents(fund.address);

  // Calculate stats from events
  const deposits = events?.deposits || [];
  const withdrawals = events?.withdrawals || [];
  const refunds = events?.refunds || [];

  const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, BigInt(0));
  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, BigInt(0));
  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, BigInt(0));
  const remaining = totalDeposited - totalWithdrawn - totalRefunded;

  const uniqueFunders = new Set(deposits.map(d => d.funder)).size;

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
    <div
      onClick={onClick}
      className={`w-full grid grid-cols-2 sm:grid-cols-6 gap-2 px-3 py-2 transition-all text-xs items-center hover:cursor-pointer ${bgClass}`}
      style={{ textAlign: 'left', border: 'none', outline: 'none' }}
    >
      <div className="col-span-2 sm:col-span-2 truncate">
        {fund.termsData?.title ?? "Untitled"}
      </div>
      <div className="col-span-2 sm:col-span-1 truncate">
        <Address address={fund.worker} short className="text-xs" />
      </div>
      <div className="col-span-1 text-right font-medium text-green-600 whitespace-nowrap">
        ${remaining === BigInt(0) ? '0' : formatNumber(formatUnits(remaining, Number(fund.tokenData.decimals)))}
      </div>
      <div className="col-span-1 text-right font-medium whitespace-nowrap">
        {uniqueFunders}
      </div>
      <div className="col-span-2 sm:col-span-1 flex items-center justify-start sm:justify-end">
        <StatusBadge status={fund.status} />
      </div>
    </div>
  );
}

// Detail view - Events loaded ONLY for selected fund
function FundDetailView({ fund }: { fund: FundFullData }) {
  const { data: events, isLoading: eventsLoading } = useFundEvents(fund.address);

  // Watch for real-time updates
  useFundEventWatcher(fund.address);

  return (
    <div className="space-y-6">
      {/* Fund Overview */}
      <Card>
        <div className="mb-4 flex flex-row gap-x-4 items-start justify-between">
          <h3 className="flex-1">{fund.termsData?.title ?? "Untitled"}</h3>
          <div className="shrink-0">
            <StatusBadge status={fund.status} />
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-700 mr-4">Contract</span>
            <Link
              href={`/browser/${fund.address}`}
              className="text-blue-600 hover:text-blue-800 underline font-mono text-sm break-all"
            >
              {fund.address}
            </Link>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Worker</span>
            <Address address={fund.worker} className="text-sm" />
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Oracle</span>
            <Address address={fund.oracle} className="text-sm" />
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Oracle Cut</span>
            <span className="font-medium">{(Number(fund.oracleCut) / 100).toFixed(2)}%</span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-700">Payout Token</span>
            <span className="font-medium">{fund.tokenData.symbol}</span>
          </div>

          {!!fund.terms && (
            <div className="flex justify-between items-start">
              <span className="font-semibold text-gray-700 whitespace-nowrap mr-4">Terms CID</span>
              <Link
                href={`https://gateway.pinata.cloud/ipfs/${fund.terms}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-right font-mono text-sm break-all"
              >
                {fund.terms}
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
                    <div key={`deposit-${idx}`} className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-medium">
                            ${formatNumber(formatUnits(deposit.amount, Number(fund.tokenData.decimals)))}
                          </span>
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
                            ${formatNumber(formatUnits(withdrawal.amount, Number(fund.tokenData.decimals)))}
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
                            ${formatNumber(formatUnits(refund.amount, Number(fund.tokenData.decimals)))}
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
