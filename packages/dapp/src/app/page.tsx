'use client'
import Link from 'next/link'
import { useAppKitAccount } from "@reown/appkit/react";
import { ConnectButton } from "@/comp/ConnectButton";

export default function Home() {
  const { isConnected } = useAppKitAccount();

  return (
    <div className="flex flex-col gap-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="mb-4">Simple & Seamless Crowdfunding</h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
          A decentralized crowdfunding platform built on Ethereum where <strong>builders</strong> can propose work,
          <strong> funders</strong> can finance this work, and <strong>oracles</strong> can evaluate and authorize payment.
        </p>
        {!isConnected && (
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        )}
      </section>

      {/* Features Section */}
      <section className="grid md:grid-cols-3 gap-8">
        <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
          <div className="text-4xl mb-4">👷</div>
          <h2 className="mb-3">For Workers</h2>
          <ul className="space-y-2 text-gray-600">
            <li>Propose fund contracts with milestones</li>
            <li>Store project terms on IPFS</li>
            <li>Withdraw funds with oracle approval</li>
            <li>Track all your active campaigns</li>
          </ul>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="mb-3">For Oracles</h2>
          <ul className="space-y-2 text-gray-600">
            <li>Review and approve project terms</li>
            <li>Authorize milestone withdrawals</li>
            <li>Earn a cut for your oversight</li>
            <li>Build reputation as a reviewer</li>
          </ul>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
          <div className="text-4xl mb-4">💰</div>
          <h2 className="mb-3">For Funders</h2>
          <ul className="space-y-2 text-gray-600">
            <li>Browse and fund promising projects</li>
            <li>Deposit ERC20 tokens securely</li>
            <li>Protected by oracle oversight</li>
            <li>Proportional refunds if needed</li>
          </ul>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 border-2 border-gray-200 rounded-lg p-8">
        <h2 className="text-center mb-8">How It Works</h2>
        <div className="grid md:grid-cols-6 gap-4 text-center">
          <div>
            <div className="text-3xl mb-2">1️⃣</div>
            <h3 className="mb-2">Propose</h3>
            <p className="text-sm text-gray-600">Worker creates a fund with terms, milestones, and oracle</p>
          </div>
          <div>
            <div className="text-3xl mb-2">2️⃣</div>
            <h3 className="mb-2">Review</h3>
            <p className="text-sm text-gray-600">Oracle reviews and cryptographically signs the terms</p>
          </div>
          <div>
            <div className="text-3xl mb-2">3️⃣</div>
            <h3 className="mb-2">Lock</h3>
            <p className="text-sm text-gray-600">Worker locks the contract with oracle&apos;s signature</p>
          </div>
          <div>
            <div className="text-3xl mb-2">4️⃣</div>
            <h3 className="mb-2">Deposit</h3>
            <p className="text-sm text-gray-600">Funders deposit ERC20 tokens using gasless permits</p>
          </div>
          <div>
            <div className="text-3xl mb-2">5️⃣</div>
            <h3 className="mb-2">Withdraw</h3>
            <p className="text-sm text-gray-600">Worker requests payment; oracle signs approval; funds released</p>
          </div>
          <div>
            <div className="text-3xl mb-2">6️⃣</div>
            <h3 className="mb-2">Complete or Refund</h3>
            <p className="text-sm text-gray-600">Repeat withdrawals for milestones, or refund funders if needed</p>
          </div>
        </div>
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>✨ All deposits tracked for proportional refunds • Oracle earns a cut on each withdrawal • Cryptographic signatures prevent unauthorized payments</p>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="text-center">
        <h2 className="mb-6">Built with Modern Web3 Tech</h2>
        <div className="flex flex-wrap justify-center gap-4">
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">Solidity ^0.8.28</span>
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">Hardhat v3</span>
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">Next.js 15</span>
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">Wagmi</span>
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">Reown AppKit</span>
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md">IPFS</span>
        </div>
      </section>
    </div>
  );
}
