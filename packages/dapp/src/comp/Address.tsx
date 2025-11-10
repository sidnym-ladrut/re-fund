'use client'
import { useMemo } from 'react'
import { trimAddress } from '@/lib/util';

export function Address({
  address,
  short=true,
  className=undefined,
}: {
  address: Address;
  short?: boolean | string;
  className?: string;
}): React.ReactNode {
  const text: string = useMemo(() => (
    (typeof short === "string")
      ? short
      : !short
        ? address
        : trimAddress(address)
  ), [address, short]);

  return (
    <code className={className}>
      {text}
    </code>
  );
}
