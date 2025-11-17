import type { Metadata } from "next";
import { headers } from 'next/headers'
import Link from "next/link";
import './globals.css';

import ContextProvider from '@/comp/ContextProvider'
import { ConnectButton } from "@/comp/ConnectButton";

export const metadata: Metadata = {
  title: "re-fund | home",
  description: "crowdfund cool projects using crypto",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersData = await headers();
  const cookies = headersData.get('cookie');

  return (
    <html lang="en">
      <body className="font-sans flex flex-col min-h-screen antialiased">
        <ContextProvider cookies={cookies}>
          <header className="nav border-b-2">
            <div className="content">
              <h1>
                <Link href="/">re-fund</Link>
              </h1>
              <ConnectButton />
            </div>
          </header>

          <main className="bod w-full flex flex-grow">
            <div className="w-full content flex flex-col gap-4">
              {children}
            </div>
          </main>

          <footer className="nav border-t-2">
            <div className="content text-center">
              <div>Encode EVM 25Q3 T1</div>
              <Link href="https://github.com/sidnym-ladrut/re-fund">
                GitHub
              </Link>
            </div>
          </footer>
        </ContextProvider>
      </body>
    </html>
  );
}
