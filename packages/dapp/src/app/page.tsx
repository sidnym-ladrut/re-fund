// import { cookieStorage, createStorage, http } from '@wagmi/core'
import Link from 'next/link'
import { ConnectButton } from "@/comp/ConnectButton";
import { InfoList } from "@/comp/InfoList";
import { ActionButtonList } from "@/comp/ActionButtonList";
import { SignMessageModule } from "@/comp/SignMessageModule";

export default function Home() {
  return (
    <div className="flex flex-col gap-y-4">
      <h1>re-fund</h1>
      <ConnectButton />
      <ActionButtonList />
      <SignMessageModule />
      <Link
        href={`/fund/0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`}
        className="link-button"
      >
        Sample Fund
      </Link>
      <InfoList />
    </div>
  );
}
