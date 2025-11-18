export function trimAddress(address: `0x${string}`): `0x${string}` {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export function formatNumber(x: string): string {
    return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

export function nextPermitTime(): bigint {
  // const nowTime = Date.now();
  // const tomTime = new Date(Date.UTC(nowTime.getUTCFullYear(), nowTime.getUTCMonth(), nowTime.getUTCDate() + 1, 0, 0, 0, 0));
  // const timestamp = Math.floor(tomTime.getTime() / 1000);
  const timestamp = Math.floor(Date.now() / 1000) + 3600;
  return BigInt(timestamp);
}
