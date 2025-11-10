// import { cookieStorage, createStorage, http } from '@wagmi/core'
import { ConnectButton } from "@/components/ConnectButton";
import { InfoList } from "@/components/InfoList";
import { ActionButtonList } from "@/components/ActionButtonList";
import { SignMessageModule } from "@/components/SignMessageModule";

export default function Home() {
  return (
    <div className="flex flex-col gap-y-4">
      <h1>re-fund</h1>
      <ConnectButton />
      <ActionButtonList />
      <SignMessageModule />
      <InfoList />
    </div>
  );
}
