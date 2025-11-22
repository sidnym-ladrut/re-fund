import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { readContract, getPublicClient, watchContractEvent } from '@wagmi/core';
import { parseAbiItem, type Address } from 'viem';
import { useEffect } from 'react';
import { useChainContracts } from './wallet';
import { encodeRole, parseStatus, isObject } from "@/lib/util";
import { APPKIT_WAGMI, PINATA } from "@/cfg";
import { FundStaticData, FundFullData, TermsData, TokenData, FundRole } from "@/type";

export interface DepositEvent {
  token: Address;
  funder: Address;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: string;
  timestamp?: number;
}

export interface WithdrawalEvent {
  amount: bigint;
  blockNumber: bigint;
  transactionHash: string;
  timestamp?: number;
}

export interface RefundEvent {
  refunder: Address;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: string;
  timestamp?: number;
}

// Hook to get all deployed fund addresses from FundFactory
export function useAllFunds() {
  const chainContracts = useChainContracts();

  return useQuery({
    queryKey: ['allFunds'],
    queryFn: async () => {
      if (!chainContracts) throw new Error('Chain contracts not loaded');

      const factoryAddress = chainContracts.FundFactory.address as Address;
      const instances = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: factoryAddress,
        abi: chainContracts.FundFactory.abi,
        functionName: 'instances',
        args: [],
      }) as Address[];

      return instances;
    },
    enabled: !!chainContracts,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useRoleFunds(address: Address | null, role: FundRole) {
  const chainContracts = useChainContracts();

  return useQuery({
    queryKey: ['roleFunds', address, role],
    queryFn: async () => {
      if (!chainContracts) throw new Error('Chain contracts not loaded');

      const factoryAddress = chainContracts.FundFactory.address as Address;
      const instances = await readContract(APPKIT_WAGMI.wagmiConfig, {
        address: factoryAddress,
        abi: chainContracts.FundFactory.abi,
        functionName: 'instances',
        args: [address, encodeRole(role)],
      }) as Address[];

      return instances;
    },
    enabled: !!chainContracts && !!address,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useRoleFundsFull(address: Address | null, role: FundRole) {
  const chainContracts = useChainContracts();
  const { data: roleFunds, isSuccess: isRoleFundsAvailable } = useRoleFunds(address, role);

  const { data: roleFullFunds, isSuccess: isRoleFullFundsAvailable, ...rolesFullQuery } = useQueries({
    queries: (roleFunds || [])?.map((fundAddress) => ({
      queryKey: ['fundStatic', fundAddress],
      queryFn: async () => {
        if (!chainContracts || !fundAddress) throw new Error('Missing dependencies');
        const fundData = await queryFundStaticData({
          address: fundAddress,
          contracts: chainContracts,
        });
        return fundData;
      },
      enabled: !!chainContracts && isRoleFundsAvailable,
      staleTime: 30000, // Cache for 30 seconds
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      isPending: results.some((result) => result.isPending),
      isLoading: results.some((result) => (!result.data || result.isLoading)),
      isSuccess: results.every((result, i) => (!!result.data && result.isSuccess)),
      isError: results.some((result) => result.isError),
    }),
  });

  const { data: roleFundTerms, ...rolesFundTermsQuery } = useQueries({
    queries: (roleFullFunds || [])?.map((fund) => ({
      queryKey: ['terms', fund?.terms],
      queryFn: async () => {
        if (!fund?.terms) throw new Error('Missing dependencies');
        const termsData = await queryTermsData({ cid: fund.terms });
        return termsData;
      },
      enabled: isRoleFullFundsAvailable,
      staleTime: 300000, // Cache for 5 minute (static data doesn't change often)
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      errors: results.map((result) => result.error),
      isPending: results.some((result) => result.isPending),
      isLoading: results.some((result) => (!result.data || result.isLoading)),
      isSuccess: results.every((result) => (!!result.data && result.isSuccess)),
      isError: results.some((result) => result.isError),
    }),
  });
  const { data: roleFundTokens, ...rolesFundTokensQuery } = useQueries({
    queries: (roleFullFunds || [])?.map((fund) => ({
      queryKey: ['token', fund?.payoutToken],
      queryFn: async () => {
        if (!chainContracts || !fund?.payoutToken) throw new Error('Missing dependencies');
        const tokenData = await queryTokenData({
          address: fund.payoutToken,
          contracts: chainContracts,
        });
        return tokenData;
      },
      enabled: !!chainContracts && isRoleFullFundsAvailable,
      staleTime: 300000, // Cache for 5 minute (static data doesn't change often)
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      errors: results.map((result) => result.error),
      isPending: results.some((result) => result.isPending),
      isLoading: results.some((result) => (!result.data || result.isLoading)),
      isSuccess: results.every((result) => (!!result.data && result.isSuccess)),
      isError: results.some((result) => result.isError),
    }),
  });

  return {
    data: (roleFullFunds || []).map((f, i) => ({
      termsData: (roleFundTerms || [])?.[i],
      tokenData: (roleFundTokens || [])?.[i],
      ...f,
    })),
    isPending: [rolesFullQuery, rolesFundTermsQuery, rolesFundTokensQuery].some((q) => q.isPending),
    isLoading: [rolesFullQuery, rolesFundTermsQuery, rolesFundTokensQuery].some((q) => q.isLoading),
    isSuccess: [rolesFullQuery, rolesFundTermsQuery, rolesFundTokensQuery].every((q) => q.isSuccess),
    isError: [rolesFullQuery, rolesFundTermsQuery, rolesFundTokensQuery].some((q) => q.isError),
  };
}

export function useFundFullData(fundAddress: Address | null) {
  return null; // TODO
}

// Hook to get static fund data (cached with React Query)
export function useFundStaticData(fundAddress: Address | null) {
  const chainContracts = useChainContracts();

  return useQuery({
    queryKey: ['fundStatic', fundAddress],
    queryFn: async () => {
      if (!chainContracts || !fundAddress) throw new Error('Missing dependencies');
      const fundData = await queryFundStaticData({
        address: fundAddress,
        contracts: chainContracts,
      });
      return fundData;
    },
    enabled: !!chainContracts && !!fundAddress,
    staleTime: 60000, // Cache for 1 minute (static data doesn't change often)
  });
}

export function useTermsData(termsCid: string | null) {
  return useQuery({
    queryKey: ['terms', termsCid],
    queryFn: async () => {
      if (!termsCid) throw new Error('Missing dependencies');
      const termsData = await queryTermsData({ cid: termsCid });
      return termsData;
    },
    enabled: !!termsCid,
    staleTime: 300000, // Cache for 5 minute (static data doesn't change often)
  });
}

// Hook to get token data (cached)
export function useTokenData(tokenAddress: Address | null) {
  const chainContracts = useChainContracts();

  return useQuery({
    queryKey: ['token', tokenAddress],
    queryFn: async () => {
      if (!chainContracts || !tokenAddress) throw new Error('Missing dependencies');
      const tokenData = await queryTokenData({
        address: tokenAddress,
        contracts: chainContracts,
      });
      return tokenData;
    },
    enabled: !!chainContracts && !!tokenAddress,
    staleTime: Infinity, // Token data never changes
  });
}

// Hook to get fund events (deposits, withdrawals, refunds)
export function useFundEvents(fundAddress: Address | null) {
  const chainContracts = useChainContracts();

  return useQuery({
    queryKey: ['fundEvents', fundAddress],
    queryFn: async () => {
      if (!chainContracts || !fundAddress) throw new Error('Missing dependencies');

      const publicClient = getPublicClient(APPKIT_WAGMI.wagmiConfig);
      if (!publicClient) throw new Error('Public client not available');

      // Query all events
      const [depositLogs, withdrawalLogs, refundLogs] = await Promise.all([
        publicClient.getLogs({
          address: fundAddress,
          event: parseAbiItem('event Deposit(address indexed token, address indexed from, uint256 amount)'),
          fromBlock: BigInt(0),
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: fundAddress,
          event: parseAbiItem('event Withdrawal(uint256 amount)'),
          fromBlock: BigInt(0),
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: fundAddress,
          event: parseAbiItem('event Refund(address indexed refunder, uint256 amount)'),
          fromBlock: BigInt(0),
          toBlock: 'latest',
        }),
      ]);

      // Convert to typed events
      const deposits: DepositEvent[] = depositLogs.map(log => ({
        token: log.args.token as Address,
        funder: log.args.from as Address,
        amount: log.args.amount as bigint,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      }));

      const withdrawals: WithdrawalEvent[] = withdrawalLogs.map(log => ({
        amount: log.args.amount as bigint,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      }));

      const refunds: RefundEvent[] = refundLogs.map(log => ({
        refunder: log.args.refunder as Address,
        amount: log.args.amount as bigint,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      }));

      // Get unique block numbers
      const allBlocks = new Set([
        ...deposits.map(e => e.blockNumber),
        ...withdrawals.map(e => e.blockNumber),
        ...refunds.map(e => e.blockNumber),
      ]);

      // Fetch timestamps for all blocks
      const blockTimestamps = new Map<bigint, number>();
      await Promise.all(
        Array.from(allBlocks).map(async (blockNum) => {
          const block = await publicClient.getBlock({ blockNumber: blockNum });
          blockTimestamps.set(blockNum, Number(block.timestamp));
        })
      );

      // Add timestamps
      deposits.forEach(e => e.timestamp = blockTimestamps.get(e.blockNumber));
      withdrawals.forEach(e => e.timestamp = blockTimestamps.get(e.blockNumber));
      refunds.forEach(e => e.timestamp = blockTimestamps.get(e.blockNumber));

      return { deposits, withdrawals, refunds };
    },
    enabled: !!chainContracts && !!fundAddress,
    staleTime: 10000, // Cache for 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Hook to watch for real-time events
export function useFundEventWatcher(fundAddress: Address | null) {
  const chainContracts = useChainContracts();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chainContracts || !fundAddress) return;

    // Watch for Deposit events
    const unwatchDeposit = watchContractEvent(APPKIT_WAGMI.wagmiConfig, {
      address: fundAddress,
      abi: chainContracts.Fund.abi,
      eventName: 'Deposit',
      onLogs: (logs) => {
        console.log('New Deposit event:', logs);
        // Invalidate queries to refetch data
        queryClient.invalidateQueries({ queryKey: ['fundEvents', fundAddress] });
      },
    });

    // Watch for Withdrawal events
    const unwatchWithdrawal = watchContractEvent(APPKIT_WAGMI.wagmiConfig, {
      address: fundAddress,
      abi: chainContracts.Fund.abi,
      eventName: 'Withdrawal',
      onLogs: (logs) => {
        console.log('New Withdrawal event:', logs);
        queryClient.invalidateQueries({ queryKey: ['fundEvents', fundAddress] });
      },
    });

    // Watch for Refund events
    const unwatchRefund = watchContractEvent(APPKIT_WAGMI.wagmiConfig, {
      address: fundAddress,
      abi: chainContracts.Fund.abi,
      eventName: 'Refund',
      onLogs: (logs) => {
        console.log('New Refund event:', logs);
        queryClient.invalidateQueries({ queryKey: ['fundEvents', fundAddress] });
      },
    });

    // Cleanup watchers on unmount
    return () => {
      unwatchDeposit();
      unwatchWithdrawal();
      unwatchRefund();
    };
  }, [chainContracts, fundAddress, queryClient]);
}

async function queryFundStaticData({
  address,
  contracts,
}): Promise<FundStaticData> {
  const [worker, oracle, oracleCut, payoutToken, funds, terms, status] = await Promise.all([
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'worker',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'oracle',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'oracleCut',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'payoutToken',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'funds',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'terms',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.Fund.abi,
      functionName: 'status',
      args: [],
    }),
  ]);

  return {
    address: address,
    worker: worker as Address,
    oracle: oracle as Address,
    oracleCut: oracleCut as bigint,
    payoutToken: payoutToken as Address,
    fundsAvailable: funds as bigint,
    terms: terms as string,
    status: parseStatus(status),
  } as FundStaticData;
}

async function queryTermsData({
  cid,
}): Promise<TermsData> {
  let termsData: TermsData = { cid: cid, text: cid };

  try {
    const { data, contentType: mime } = await PINATA.gateways.public.get(cid);
    if (mime === "application/json" && isObject(data)) {
      const dataUrl = await PINATA.gateways.public.convert(cid);
      termsData.url = dataUrl;

      const jsonData = data as any;
      if (jsonData?.schema === "fund-plaintext" && jsonData?.version === 0) {
        termsData = {
          ...termsData,
          title: jsonData?.terms?.title,
          text: jsonData?.terms?.text ?? termsData.text,
        };
      } else if (jsonData?.schema === "fund-milestones" && jsonData?.version === 0) {
        const summary = jsonData.meta?.summary;
        const milestones = jsonData.meta?.milestones || [];
        // Format the milestones text
        const milestonesList = milestones.map((m: any, idx: number) => {
          return `${idx + 1}. ${m.terms} (Target: ${m.target})`;
        }).join('\n');

        const termsText = `${
          !summary ? '' : `${`Summary: ${summary}\n\n`}`
        }Milestones:\n${milestonesList}`;

        termsData = {
          ...termsData,
          title: jsonData.meta?.title,
          text: termsText,
        };
      }
    }
  } catch (err: any) {
    console.error('Unable to fetch terms:', err);
  }

  return termsData;
}

async function queryTokenData({
  address,
  contracts,
}): Promise<TokenData> {
  const [name, symbol, decimals] = await Promise.all([
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.FundToken.abi,
      functionName: 'name',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.FundToken.abi,
      functionName: 'symbol',
      args: [],
    }),
    readContract(APPKIT_WAGMI.wagmiConfig, {
      address: address,
      abi: contracts.FundToken.abi,
      functionName: 'decimals',
      args: [],
    }),
  ]);

  return {
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as bigint,
  } as TokenData;
}
