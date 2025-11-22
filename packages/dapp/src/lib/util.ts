import { FundStatus, FundRole } from "@/type";

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function trimAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export function formatNumber(x: string): string {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

export function isObject(v: any): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function encodeRole(s: FundRole): number {
  if (s === 'worker') {
    return 0;
  } else if (s === 'oracle') {
    return 1;
  } else if (s === 'funder') {
    return 2;
  } else {
    return 3;
  }
}

export function parseStatus(s: number): FundStatus {
  if (s === 0) {
    return 'pending';
  } else if (s === 1) {
    return 'active';
  } else {
    return 'closed';
  }
}

export function nextPermitTime(): bigint {
  // const nowTime = Date.now();
  // const tomTime = new Date(Date.UTC(nowTime.getUTCFullYear(), nowTime.getUTCMonth(), nowTime.getUTCDate() + 1, 0, 0, 0, 0));
  // const timestamp = Math.floor(tomTime.getTime() / 1000);
  const timestamp = Math.floor(Date.now() / 1000) + 3600;
  return BigInt(timestamp);
}
