import type { Abi } from 'abitype';

export type Nullable<T> = T | null;
export type Loadable<T> = T | false | null | undefined;
export type Version = `${string}.${string}.${string}`;

export type Address = `0x${string}`;
export type AddressType = 'account' | 'transaction' | 'signature';
export type ChainAddress = `${string}:${Address}`;

export type FundStatus = 'pending' | 'active' | 'closed';

// export interface WalletMeta {
//   connected: boolean;
//   address: Address;
//   chain: bigint;
//   contracts:
// }

export interface Contract {
  address: Address;
  abi: Abi;
}
export interface Token extends Contract {
  name: string;
  symbol: string;
  decimals: number;
  deployer?: Address;
}

export interface TokenHolding {
  token: Token;
  balance: bigint;
}
export type TokenHoldings = Record<string, TokenHolding>;
