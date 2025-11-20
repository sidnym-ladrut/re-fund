'use client'
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKitAccount } from "@reown/appkit/react";
import { ConnectButton } from "@/comp/ConnectButton";
import { FundCard } from "@/comp/FundCard";
import { Card } from "@/comp/Card";
import Contracts from '@/../chain/contracts';

interface Fund {
  address: `0x${string}`;
  worker: `0x${string}`;
  oracle: `0x${string}`;
  token: `0x${string}`;
  fundsAvailable: string;
  isLocked: boolean;
  tokenSymbol: string;
}

export default function BrowseFunds() {
  const router = useRouter();
  const { isConnected, caipAddress } = useAppKitAccount();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'locked' | 'unlocked'>('all');

  const ChainContracts = useMemo(() => {
    if (!isConnected || !caipAddress) return undefined;
    const chainId = caipAddress.split(':')?.[1];
    return chainId ? Contracts[chainId as unknown as keyof typeof Contracts] : undefined;
  }, [isConnected, caipAddress]);

  useEffect(() => {
    if (ChainContracts) {
      loadAllFunds();
    }
  }, [ChainContracts]);

  const loadAllFunds = async () => {
    if (!ChainContracts || !caipAddress) return;
    
    setIsLoading(true);
    try {
      // Import required functions
      const { readContract } = await import('wagmi/actions');
      const { formatUnits } = await import('viem');
      const { APPKIT_WAGMI } = await import("@/cfg");

      // Extract wallet address from CAIP address (format: "eip155:31337:0x...")
      const walletAddress = caipAddress.split(':')[2] as `0x${string}`;
      if (!walletAddress) {
        setFunds([]);
        setIsLoading(false);
        return;
      }

      // Get all funds from FundFactory
      const allFunds = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: ChainContracts.FundFactory.address,
        abi: ChainContracts.FundFactory.abi,
        functionName: 'instances',
        args: [], // Get all funds (no role filter)
      }) as `0x${string}`[];

      console.log('All funds for browse:', allFunds);

      // Load details for each fund
      const fundDetails = await Promise.all(
        allFunds.map(async (fundAddress) => {
          try {
            const [worker, oracle, token, termsSignature, fundsAvailable] = await Promise.all([
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'worker',
                args: [],
              }) as Promise<`0x${string}`>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'oracle',
                args: [],
              }) as Promise<`0x${string}`>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'payoutToken',
                args: [],
              }) as Promise<`0x${string}`>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'termsSignature',
                args: [],
              }) as Promise<string>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'fundsAvailable',
                args: [],
              }) as Promise<bigint>,
            ]);

            const isLocked = termsSignature && termsSignature !== '0x';

            return {
              address: fundAddress,
              worker,
              oracle,
              token,
              fundsAvailable: formatUnits(fundsAvailable, 18),
              isLocked,
              tokenSymbol: 'FTK', // Default symbol, could be fetched from token contract
            };
          } catch (error) {
            console.error(`Error loading fund details for ${fundAddress}:`, error);
            return null;
          }
        })
      );

      const validFunds = fundDetails.filter((fund): fund is Fund => fund !== null);
      setFunds(validFunds);
      
      console.log('Browse funds loaded:', validFunds);
    } catch (error) {
      console.error('Error loading funds:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFunds = funds.filter((fund) => {
    const matchesSearch = 
      fund.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fund.worker.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = 
      filterStatus === 'all' || 
      (filterStatus === 'locked' && fund.isLocked) ||
      (filterStatus === 'unlocked' && !fund.isLocked);
    
    return matchesSearch && matchesFilter;
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
            onClick={() => setFilterStatus('locked')}
            className={filterStatus === 'locked' ? 'bg-black text-white' : ''}
          >
            Active
          </button>
          <button
            onClick={() => setFilterStatus('unlocked')}
            className={filterStatus === 'unlocked' ? 'bg-black text-white' : ''}
          >
            Pending
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
            {filteredFunds.map((fund) => (
              <FundCard
                key={fund.address}
                address={fund.address}
                worker={fund.worker}
                oracle={fund.oracle}
                fundsAvailable={fund.fundsAvailable}
                isLocked={fund.isLocked}
                tokenSymbol={fund.tokenSymbol}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <Card className="bg-blue-50 border-blue-200">
        <h3 className="mb-3">💡 How to Fund a Campaign</h3>
        <ol className="space-y-2 text-gray-700">
          <li><strong>1.</strong> Click on a fund card to view details</li>
          <li><strong>2.</strong> Ensure the fund is locked (approved by oracle)</li>
          <li><strong>3.</strong> Review the project terms and milestones</li>
          <li><strong>4.</strong> Deposit your tokens to support the project</li>
        </ol>
      </Card>
    </div>
  );
}
