'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation';
import { formatUnits } from 'viem'
import { Address } from './Address';
import { Card } from './Card';
import { formatNumber } from "@/lib/util";
import { StatusBadge } from './StatusBadge';
import { useFundStaticData, useTokenData, useTermsData } from "@/hook/useFundData";
import { FundStaticData, FundFullData, TermsData, TokenData, FundRole } from "@/type";

interface FundCardProps {
  address: `0x${string}`;
  worker: `0x${string}`;
  oracle: `0x${string}`;
  fundsAvailable: bigint;
  status: FundStatus;
  title?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export function FundCard({
  address,
  worker,
  oracle,
  fundsAvailable,
  status,
  title = 'Untitled',
  tokenSymbol = 'USDC',
  tokenDecimals = 0,
}: FundCardProps) {
  const router = useRouter();

  return (
    <Card onClick={() => router.push(`/browser/${address}`)}>
      <div className="space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-gray-200">
          <h3 className="text-sm text-gray-500">{title}</h3>
          <StatusBadge status={status} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm text-gray-500">Address</h4>
            <Address address={address} />
          </div>
          <div>
            <h4 className="text-sm text-gray-500">Funds</h4>
            <p className="text-lg">
              {formatNumber(formatUnits(fundsAvailable, tokenDecimals))} {tokenSymbol}
            </p>
          </div>
          <div>
            <h4 className="text-sm text-gray-500">Worker</h4>
            <Address address={worker} />
          </div>
          <div>
            <h4 className="text-sm text-gray-500">Oracle</h4>
            <Address address={oracle} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function FundCard2({
  address,
}: {
  address: `0x${string}`;
}) {
  const { data: fundData, isLoading: isFundLoading, isPending: isFundPending } = useFundStaticData(address);
  const { data: termsData, isLoading: isTermsLoading, isPending: isTermsPending } = useTermsData(fundData?.terms);
  const { data: tokenData , isLoading: isTokenLoading, isPending: isTokenPending } = useTokenData(fundData?.payoutToken);

  const isLoading: boolean = useMemo(() => (
    [isFundLoading, isFundPending, isTermsLoading, isTermsPending, isTokenLoading, isTokenPending].some(v => v)
  ), [isFundLoading, isFundPending, isTermsLoading, isTermsPending, isTokenLoading, isTokenPending]);

  return isLoading ? (
    <Card>
      <h4>Loading...</h4>
    </Card>
  ) : (
    <FundCard
      address={address}
      title={termsData?.title ?? "Untitled"}
      tokenSymbol={tokenData?.symbol ?? "$???"}
      tokenDecimals={Number(tokenData?.decimals ?? 0)}
      {...fundData}
    />
  );
}

export function FundCard3(props: FundFullData) {
  return (
    <FundCard
      title={props.termsData?.title ?? "Untitled"}
      tokenSymbol={props.tokenData?.symbol ?? "$???"}
      tokenDecimals={Number(props.tokenData?.decimals ?? 0)}
      {...props}
    />
  );
}
