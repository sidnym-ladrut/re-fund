'use client'
import { useRouter } from 'next/navigation';
import { Address } from './Address';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

interface FundCardProps {
  address: `0x${string}`;
  worker: `0x${string}`;
  oracle: `0x${string}`;
  fundsAvailable: string;
  isLocked: boolean;
  tokenSymbol?: string;
}

export function FundCard({ 
  address, 
  worker, 
  oracle, 
  fundsAvailable, 
  isLocked,
  tokenSymbol = 'USDC'
}: FundCardProps) {
  const router = useRouter();

  return (
    <Card onClick={() => router.push(`/fund/${address}`)}>
      <div className="space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-sm text-gray-500">Fund Address</h4>
            <Address address={address} />
          </div>
          <StatusBadge status={isLocked ? 'locked' : 'unlocked'} />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm text-gray-500">Worker</h4>
            <Address address={worker} />
          </div>
          <div>
            <h4 className="text-sm text-gray-500">Oracle</h4>
            <Address address={oracle} />
          </div>
        </div>
        
        <div className="pt-2 border-t border-gray-200">
          <h4 className="text-sm text-gray-500">Available Funds</h4>
          <p className="text-xl font-bold">{fundsAvailable} {tokenSymbol}</p>
        </div>
      </div>
    </Card>
  );
}
