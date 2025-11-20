'use client'
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKitAccount } from "@reown/appkit/react";
import { readContract } from 'wagmi/actions';
import { formatUnits } from 'viem';
import { ConnectButton } from "@/comp/ConnectButton";
import { Card } from "@/comp/Card";
import { StatusBadge } from "@/comp/StatusBadge";
import { Address } from "@/comp/Address";
import { formatNumber } from "@/lib/util";
import { parseStatus } from "@/lib/util";
import { APPKIT_WAGMI } from "@/cfg";
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
  const router = useRouter();
  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const [pendingFunds, setPendingFunds] = useState<Fund[]>([]);
  const [activeFunds, setActiveFunds] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const ChainContracts = useMemo(() => {
    if (!isConnected || !caipAddress) return undefined;
    const chainId = caipAddress.split(':')?.[1];
    return chainId ? Contracts[chainId as unknown as keyof typeof Contracts] : undefined;
  }, [isConnected, caipAddress]);

  useEffect(() => {
    if (isConnected && walletAddress && ChainContracts) {
      loadOracleFunds();
    }
  }, [isConnected, walletAddress, ChainContracts]);

  const loadOracleFunds = async () => {
    if (!ChainContracts || !walletAddress) return;

    setIsLoading(true);
    try {
      console.log('Oracle Dashboard - Connected wallet address:', walletAddress);
      console.log('Oracle Dashboard - CAIP address:', caipAddress);

      // Filter funds where this wallet is the oracle
      const oracleFunds: `0x${string}`[] = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: ChainContracts.FundFactory.address,
        abi: ChainContracts.FundFactory.abi,
        functionName: 'instances',
        args: [walletAddress, 1],
      }) as `0x${string}`[];

      console.log('Found oracle funds for', walletAddress, ':', oracleFunds);

      // Load details for each fund
      const fundDetails = await Promise.all(
        oracleFunds.map(async (fundAddress) => {
          try {
            const [worker, oracle, token, oracleCut, status, fundsAvailable] = await Promise.all([
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
                functionName: 'oracleCut',
                args: [],
              }) as Promise<bigint>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'status',
                args: [],
              }) as Promise<number>,
              readContract(APPKIT_WAGMI.wagmiConfig, {
                address: fundAddress,
                abi: ChainContracts.Fund.abi,
                functionName: 'fundsAvailable',
                args: [],
              }) as Promise<bigint>,
            ]);

            return {
              address: fundAddress,
              worker,
              oracle,
              token,
              oracleCut,
              status: parseStatus(status),
              fundsAvailable,
            };
          } catch (error) {
            console.error(`Error loading fund details for ${fundAddress}:`, error);
            return null;
          }
        })
      );

      const validFunds = fundDetails.filter((fund): fund is Fund => fund !== null);

      // Separate pending (not locked) from active (locked) funds
      const pending = validFunds.filter(fund => (fund.status === 'pending'));
      const active = validFunds.filter(fund => (fund.status === 'active'));

      setPendingFunds(pending);
      setActiveFunds(active);

      console.log('Pending funds:', pending);
      console.log('Active funds:', active);
    } catch (error) {
      console.error('Error loading funds:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="mb-6">Oracle Dashboard</h1>
        <p className="text-gray-600 mb-6">Connect your wallet to review and manage funds</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2">Oracle Dashboard</h1>
        <p className="text-gray-600">Review and approve fund campaigns</p>
      </div>

      {/* Stats Cards */}
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

      {/* Pending Reviews */}
      <div>
        <h2 className="mb-4">Pending Reviews</h2>
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading funds...</div>
        ) : pendingFunds.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No funds pending your review</p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {pendingFunds.map((fund) => (
              <Card
                key={fund.address}
                onClick={() => router.push(`/browser/${fund.address}`)}
                className="hover:border-black cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm text-gray-500">Fund Address</h4>
                      <Address address={fund.address} />
                    </div>
                    <StatusBadge status="pending" />
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-500">Worker</h4>
                    <Address address={fund.worker} />
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-500">Your Cut</h4>
                    <p className="text-lg font-semibold">{formatNumber((Number(fund.oracleCut) / 100).toString())}%</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/browser/${fund.address}`);
                    }}
                    className="w-full mt-4"
                  >
                    Review Terms
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Active Funds */}
      <div>
        <h2 className="mb-4">Active Funds</h2>
        {activeFunds.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No active funds under your oversight</p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {activeFunds.map((fund) => (
              <Card
                key={fund.address}
                onClick={() => router.push(`/browser/${fund.address}`)}
                className="hover:border-black cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm text-gray-500">Fund Address</h4>
                      <Address address={fund.address} />
                    </div>
                    <StatusBadge status="active" />
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-500">Worker</h4>
                    <Address address={fund.worker} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
