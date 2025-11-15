import Link from 'next/link'
import { ConnectButton } from "@/comp/ConnectButton";
import { FundSearch, WalletDirectory } from "@/comp/BasicComponents";

export default function Home() {
  return (
    <div className="flex flex-col gap-y-4">
      <h1>re-fund</h1>
      <ConnectButton />
      <FundSearch />
      <WalletDirectory type={0} />
      <WalletDirectory type={1} />
    </div>
  );
}
