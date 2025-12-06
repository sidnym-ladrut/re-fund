'use client'
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit/react";
import { readContract, writeContract, waitForTransactionReceipt, simulateContract } from 'wagmi/actions';
import { formatUnits, encodeAbiParameters, parseAbiParameters, keccak256, toHex } from 'viem';
import type { Address } from 'viem';
import { ConnectButton } from "@/comp/ConnectButton";
import { Card } from "@/comp/Card";
import { FundCard3 } from "@/comp/FundCard";
import { Modal } from "@/comp/Modal";
import { StatusBadge } from "@/comp/StatusBadge";
import { Address } from "@/comp/Address";
import { formatNumber } from "@/lib/util";
import { parseStatus } from "@/lib/util";
import { FundStatus } from "@/type";
import { useRoleFunds, useRoleFundsFull } from "@/hook/useFundData";
import { useChainContracts } from "@/hook/wallet";
import { APPKIT_WAGMI } from "@/cfg";
import Contracts from '@/../chain/contracts';

// Aggregate funds by token symbol
function aggregateFundsByToken(funds: any[]) {
  const byToken: Record<string, { symbol: string; amount: bigint; decimals: number }> = {};
  
  for (const fund of funds) {
    if (!fund?.tokenData?.symbol || fund.fundsAvailable === undefined) continue;
    
    const symbol = fund.tokenData.symbol;
    if (!byToken[symbol]) {
      byToken[symbol] = {
        symbol,
        amount: 0n,
        decimals: fund.tokenData.decimals || 18,
      };
    }
    byToken[symbol].amount += fund.fundsAvailable;
  }
  
  return Object.values(byToken);
}

export default function WorkerDashboard() {
  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: funds, isPending: isFundsPending, isLoading: isFundsLoading } = useRoleFundsFull(walletAddress, 'worker');
  
  // Compute aggregated totals by token
  const totalsByToken = useMemo(() => aggregateFundsByToken(funds || []), [funds]);

  return (!isConnected) ? (
    <div className="text-center py-12">
      <h1 className="mb-6">Worker Dashboard</h1>
      <p className="text-gray-600 mb-6">Connect your wallet to view and manage your funds</p>
    </div>
  ) : (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="mb-2">Worker Dashboard</h1>
          <p className="text-gray-600">Manage your crowdfunding campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black text-white px-6 py-3 rounded-md hover:bg-gray-800"
        >
          Create New Fund
        </button>
      </div>

      {(isFundsPending || isFundsLoading) ? (
        <div className="text-center py-12 text-gray-500">Loading funds...</div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <h4 className="text-gray-500 mb-2">Total Funds</h4>
              <p className="text-3xl font-bold">{funds.length}</p>
            </Card>
            <Card>
              <h4 className="text-gray-500 mb-2">Active Campaigns</h4>
              <p className="text-3xl font-bold">{funds.filter(f => (f.status === 'active')).length}</p>
            </Card>
            <Card>
              <h4 className="text-gray-500 mb-2">Total Raised</h4>
              {totalsByToken.length === 0 ? (
                <p className="text-3xl font-bold">0</p>
              ) : (
                <div className="space-y-1">
                  {totalsByToken.map(({ symbol, amount, decimals }) => (
                    <p key={symbol} className="text-2xl font-bold">
                      {formatNumber(parseFloat(formatUnits(amount, decimals)))} {symbol}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <div>
            <h2 className="mb-4">Your Funds</h2>
            {(funds.length === 0) ? (
              <Card>
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">You haven't created any funds yet</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="link-button"
                  >
                    Create Your First Fund
                  </button>
                </div>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {funds.map((fund) => (
                  <FundCard3 key={fund.address} {...fund} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Fund"
        size="lg"
      >
        <CreateFundForm onSuccess={() => {
          setShowCreateModal(false);
        }} />
      </Modal>
    </div>
  );
}

function CreateFundForm({ onSuccess }: { onSuccess: () => void }) {
  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>('eip155');
  const [formData, setFormData] = useState({
    oracle: '',
    oracleCut: '',
    token: '',
    tokenType: '', // Tracks dropdown selection: 'fundtoken', 'usdc', 'usdt', 'custom', or ''
    title: '',
    terms: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const chainContracts = useChainContracts();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!chainContracts || !walletAddress || !walletProvider) {
        throw new Error('Wallet not connected');
      }

      // Validate addresses
      if (!/^0x[a-fA-F0-9]{40}$/.test(formData.oracle)) {
        throw new Error('Invalid oracle address');
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(formData.token)) {
        throw new Error('Invalid token address');
      }

      // Convert oracle cut percentage to basis points (e.g., 1% = 100)
      const oracleCutBps = Math.floor(parseFloat(formData.oracleCut) * 100);
      if (oracleCutBps < 0 || oracleCutBps > 10000) {
        throw new Error('Oracle cut must be between 0 and 100%');
      }

      // Upload terms to IPFS via Pinata API route
      const termsJson = {
        schema: "fund-plaintext",
        version: 0,
        terms: { title: formData.title, text: formData.terms },
      };

      console.log('Uploading terms to IPFS...');
      const uploadResponse = await fetch('/api/upload-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsData: termsJson }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(`Failed to upload terms: ${errorData.error || 'Unknown error'}`);
      }

      const { cid: terms } = await uploadResponse.json();
      console.log('Terms uploaded, CID:', terms);

      console.log('Creating fund with:', {
        worker: walletAddress,
        oracle: formData.oracle,
        oracleCut: oracleCutBps,
        token: formData.token,
        terms: terms,
      });

      // Encode the initialization parameters (worker is the connected wallet)
      const fundArgs = encodeAbiParameters(
        parseAbiParameters('address worker, address oracle, uint256 cut, address token, string terms'),
        [
          walletAddress as `0x${string}`,
          formData.oracle as `0x${string}`,
          BigInt(oracleCutBps),
          formData.token as `0x${string}`,
          terms as string,
        ]
      );

      // Use teammate's improved approach with simulation + salt
      const salt = keccak256(toHex(Date.now()));
      const { result, request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: chainContracts.FundFactory.address,
        abi: chainContracts.FundFactory.abi,
        functionName: 'deploy',
        args: [fundArgs],
      });

      console.log('Transaction simulated successfully, deploying...');

      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);

      console.log('Transaction submitted:', hash);

      // Wait for transaction confirmation
      const receipt = await waitForTransactionReceipt(APPKIT_WAGMI.wagmiConfig, {
        hash,
      });

      console.log('Fund created! Receipt:', receipt);
      console.log('Fund address:', result);

      // Success! Close modal and redirect to fund
      onSuccess();
      router.push(`/browser/${result}`);
    } catch (err: any) {
      console.error('Error creating fund:', err);
      setError(err.message || 'Failed to create fund');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Oracle Address</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={formData.oracle}
            onChange={(e) => setFormData({ ...formData, oracle: e.target.value })}
            placeholder="0x..."
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none"
            required
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={() => setFormData({ ...formData, oracle: walletAddress || '', oracleCut: '0' })}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 whitespace-nowrap text-sm"
            disabled={isSubmitting}
          >
            Use Current Wallet
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">The address that will review and approve your work</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Oracle Cut (%)</label>
        <input
          type="number"
          value={formData.oracleCut}
          onChange={(e) => setFormData({ ...formData, oracleCut: e.target.value })}
          placeholder="2.00"
          step="0.01"
          min="0"
          max="100"
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none"
          required
          disabled={isSubmitting}
        />
        <p className="text-sm text-gray-500 mt-1">Percentage the oracle receives on each withdrawal</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Payout Token</label>
        <select
          value={formData.tokenType}
          onChange={(e) => {
            const type = e.target.value;
            let tokenAddress = '';
            if (type === 'fundtoken' && chainContracts?.FundToken) {
              tokenAddress = chainContracts.FundToken.address;
            } else if (type === 'usdc' && chainContracts?.TestUSDC) {
              tokenAddress = chainContracts.TestUSDC.address;
            } else if (type === 'usdt' && chainContracts?.TestUSDT) {
              tokenAddress = chainContracts.TestUSDT.address;
            } else if (type === 'custom') {
              tokenAddress = ''; // Clear for manual input
            }
            setFormData({ ...formData, tokenType: type, token: tokenAddress });
          }}
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none bg-white"
          disabled={isSubmitting}
        >
          <option value="">Select a token...</option>
          {chainContracts?.FundToken && (
            <option value="fundtoken">
              ⚡ FundToken (ERC20Permit, 18 decimals)
            </option>
          )}
          {chainContracts?.TestUSDC && (
            <option value="usdc">
              ⚡ USDC (ERC20Permit, 6 decimals)
            </option>
          )}
          {chainContracts?.TestUSDT && (
            <option value="usdt">
              USDT (Standard ERC20, 6 decimals)
            </option>
          )}
          <option value="custom">Custom token address...</option>
        </select>
        <input
          type="text"
          value={formData.token}
          onChange={(e) => setFormData({ ...formData, token: e.target.value })}
          placeholder="0x... (token address)"
          className="w-full mt-2 px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none font-mono text-sm"
          required
          disabled={isSubmitting}
        />
        <p className="text-sm text-gray-500 mt-1">
          ⚡ = Supports gasless permit deposits
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Project Title & Terms</label>
        <input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Entitle your project"
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none"
          required
          disabled={isSubmitting}
        />
        <textarea
          value={formData.terms}
          onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
          placeholder="Describe your project, milestones, and deliverables..."
          rows={6}
          className="w-full mt-1 px-4 py-2 border-2 border-gray-300 rounded-md focus:border-black outline-none"
          required
          disabled={isSubmitting}
        />
        <p className="text-sm text-gray-500 mt-1">Will be stored on IPFS</p>
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          className="flex-1 bg-black text-white py-3 rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Fund'}
        </button>
      </div>
    </form>
  );
}
