import type { Metadata } from "next";
import { headers } from 'next/headers' // added
import './globals.css';
import ContextProvider from '@/comp/ContextProvider'
import { Navigation } from '@/comp/Navigation'

export const metadata: Metadata = {
  title: "re-fund - Decentralized Crowdfunding",
  description: "A simple crowdfunding platform built on Ethereum where builders can propose work, funders can finance this work, and oracles can evaluate and authorize payment.",
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
      <body className="min-h-screen flex flex-col">
        <ContextProvider cookies={cookies}>
          <Navigation />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="bg-gray-50 border-t-2 border-gray-200 py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
              <p>Built for EncodeClub EVM Bootcamp 25Q3 T1</p>
            </div>
          </footer>
        </ContextProvider>
      </body>
    </html>
  );
}
