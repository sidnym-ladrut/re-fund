'use client'
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKitAccount } from "@reown/appkit/react";
import { readContract } from 'wagmi/actions';
import { formatUnits } from 'viem';
import { Card } from "@/comp/Card";
import { FundCard3 } from "@/comp/FundCard";
import { StatusBadge } from "@/comp/StatusBadge";
import { Address } from "@/comp/Address";
import { formatNumber } from "@/lib/util";
import { parseStatus } from "@/lib/util";
import { APPKIT_WAGMI } from "@/cfg";
import { useRoleFundsFull } from "@/hook/useFundData";
import { useChainContracts } from "@/hook/wallet";
import { FundStatus } from "@/type";
import Contracts from '@/../chain/contracts';

interface Fund {
  address: `0x${string}`;
  worker: `0x${string}`;
  oracle: `0x${string}`;
  token: `0x${string}`;
  oracleCut: bigint;
  status: FundStatus;
  fundsAvailable: bigint;
}

export default function OracleDashboard() {
  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const { data: funds, isPending: isFundsPending, isLoading: isFundsLoading } = useRoleFundsFull(walletAddress, 'oracle');
  const router = useRouter();

  const pendingFunds = useMemo(() => (
    (isFundsPending || isFundsLoading)
      ? []
      : (funds || []).filter(f => (f.status === 'pending'))
  ), [funds, isFundsPending, isFundsLoading]);
  const activeFunds = useMemo(() => (
    (isFundsPending || isFundsLoading)
      ? []
      : (funds || []).filter(f => (f.status !== 'pending'))
  ), [funds, isFundsPending, isFundsLoading]);

  return (!isConnected) ? (
    <div className="text-center py-12">
      <h1 className="mb-6">Oracle Dashboard</h1>
      <p className="text-gray-600 mb-6">Connect your wallet to review and manage funds</p>
    </div>
  ) : (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2">Oracle Dashboard</h1>
        <p className="text-gray-600">Review and approve fund campaigns</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <h4 className="text-gray-500 mb-2">Pending Review</h4>
          <p className="text-3xl font-bold">{pendingFunds.length}</p>
        </Card>
        <Card>
          <h4 className="text-gray-500 mb-2">Active Funds</h4>
          <p className="text-3xl font-bold">{activeFunds.length}</p>
        </Card>
        <Card>
          <h4 className="text-gray-500 mb-2">Total Earnings</h4>
          <p className="text-3xl font-bold">$0.00</p>
        </Card>
      </div>

      <div>
        <h2 className="mb-4">Pending Reviews</h2>
        {(isFundsLoading || isFundsPending) ? (
          <div className="text-center py-12 text-gray-500">Loading funds...</div>
        ) : (pendingFunds.length === 0) ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No funds pending your review</p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {pendingFunds.map((fund) => (
              <FundCard3 key={fund.address} {...fund} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4">Active Funds</h2>
        {(isFundsLoading || isFundsPending) ? (
          <div className="text-center py-12 text-gray-500">Loading funds...</div>
        ) : (activeFunds.length === 0) ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No active funds under your oversight</p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {activeFunds.map((fund) => (
              <FundCard3 key={fund.address} {...fund} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
