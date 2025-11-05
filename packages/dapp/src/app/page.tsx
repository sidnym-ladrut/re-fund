// import { cookieStorage, createStorage, http } from '@wagmi/core'
import { ConnectButton } from "@/components/ConnectButton";
import { InfoList } from "@/components/InfoList";
import { ActionButtonList } from "@/components/ActionButtonList";
import { SignMessageModule } from "@/components/SignMessageModule";
import { Pinata } from "@/components/Pinata";

export default function Home() {
  return (
    <div className="pages">
      <h1>re-fund</h1>
      <ConnectButton />
      <Pinata />
      <ActionButtonList />
      <SignMessageModule />
      <InfoList />
    </div>
  );
}
