import type { Abi } from 'abitype';

export type Nullable<T> = T | null;
export type Loadable<T> = T | false | null | undefined;
export type Version = `${string}.${string}.${string}`;

export type Address = `0x${string}`;
export type AddressType = 'account' | 'transaction' | 'signature';
export type ChainAddress = `${string}:${Address}`;

export type FundStatus = 'pending' | 'active' | 'closed';
export type FundRole = 'worker' | 'oracle' | 'funder';

export interface TermsData {
  cid: string;
  text: string;
  url?: string;
  title?: string;
}

export interface TokenData {
  name: string;
  symbol: string;
  decimals: bigint;
}

export interface FundStaticData {
  address: Address;
  worker: Address;
  oracle: Address;
  oracleCut: bigint;
  payoutToken: Address;
  fundsAvailable: bigint;
  terms: string;
  status: FundStatus;
}

export interface FundFullData extends FundStaticData {
  termsData: TermsData;
  tokenData: TokenData;
}
