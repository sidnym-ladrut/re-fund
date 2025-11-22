'use client'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKitAccount } from "@reown/appkit/react";
import { ConnectButton } from "@/comp/ConnectButton";
import { FundCard2 } from "@/comp/FundCard";
import { Card } from "@/comp/Card";
import { FundStatus } from "@/type";
import { useAllFunds } from "@/hook/useFundData";

export default function BrowseFunds() {
  const router = useRouter();
  const { isConnected } = useAppKitAccount();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | FundStatus>('all');

  const { data: allFundAddresses, isLoading, isPending } = useAllFunds();

  const filteredFunds = (allFundAddresses || []).filter((fundAddress) => {
    if (!searchQuery) return true;
    return fundAddress.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="mb-6">Funder Dashboard</h1>
        <p className="text-gray-600 mb-6">Connect your wallet to browse and fund campaigns</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2">Funder Dashboard</h1>
        <p className="text-gray-600">Discover and support crowdfunding campaigns</p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by address or worker..."
          className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-md focus:border-black outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={filterStatus === 'all' ? 'bg-black text-white' : ''}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={filterStatus === 'pending' ? 'bg-black text-white' : ''}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={filterStatus === 'active' ? 'bg-black text-white' : ''}
          >
            Active
          </button>
          <button
            onClick={() => setFilterStatus('closed')}
            className={filterStatus === 'closed' ? 'bg-black text-white' : ''}
          >
            Closed
          </button>
        </div>
      </div>

      {/* Funds Grid */}
      <div>
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading funds...</div>
        ) : filteredFunds.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">
                {searchQuery || filterStatus !== 'all'
                  ? 'No funds match your search criteria'
                  : 'No funds available yet'}
              </p>
              {(searchQuery || filterStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('all');
                  }}
                  className="link-button"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFunds.map((fundAddress) => (
              <FundCard2 key={fundAddress} address={fundAddress} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
