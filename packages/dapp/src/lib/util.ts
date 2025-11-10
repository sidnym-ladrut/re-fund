export function trimAddress(address: `0x${string}`): `0x${string}` {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export function formatNumber(x: string): string {
    return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}
