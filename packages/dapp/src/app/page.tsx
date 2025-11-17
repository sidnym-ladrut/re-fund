import Link from 'next/link'
import { FundSearch, WalletDirectory } from "@/comp/BasicComponents";

export default function Home() {
  return (
    <>
      <button>
        <Link href="/fund/create">+ Create Fund</Link>
      </button>
      <FundSearch />
      <WalletDirectory type={0} />
      <WalletDirectory type={1} />
    </>
  );
}
