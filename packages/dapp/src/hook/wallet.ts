import type { Loadable, Nullable, Address, Contract, WalletMeta } from '@/type';
import { useMemo } from 'react';
import { useAppKitAccount } from "@reown/appkit/react";
import Contracts from '@/../chain/contracts';

export function useChainContracts(): Nullable<Record<string, any>> {
  const { address, isConnected, caipAddress } = useAppKitAccount();

  return useMemo<Record<string, any> | null>(() => {
    if (!isConnected || !caipAddress) return null;
    const chainId = caipAddress.split(':')?.[1];
    return chainId ? Contracts[chainId as unknown as keyof typeof Contracts] : null;
  }, [isConnected, caipAddress]);
}

// export function useWalletMeta(): Nullable<WalletMeta> {
//   const [{wallet}, , ] = useConnectWallet();
//   const wagmiConfig = useWagmiConfig();
//
//   return useMemo(() => {
//     const status: string | undefined = wagmiConfig?.state?.status;
//     const chain: bigint = hexToBigInt(((wallet?.chains?.[0]?.id ?? "0x0") as Address));
//     const address: Address = wallet?.accounts?.[0]?.address ?? ACCOUNT.NULL.ETHEREUM;
//
//     return (status === undefined || status === "disconnected")
//       ? null
//       : {
//         wagmi: (wagmiConfig as WagmiConfig),
//         chain: chain,
//         address: address,
//         stateID: `${chain}:${address}`,
//         chainID: (BLOCKCHAIN.TAG?.[Number(chain)] ?? "unknown").toLowerCase(),
//       };
//   }, [wallet?.chains?.[0]?.id, wallet?.accounts?.[0]?.address]);
// }
