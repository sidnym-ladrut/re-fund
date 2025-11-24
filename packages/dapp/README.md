# Reown AppKit Example using wagmi (next.js with App Router)

This is a Next.js project.

## Usage

1. Go to [Reown Dashboard](https://dashboard.reown.com) and create a new project
2. Copy your `Project ID`
3. Rename `.env.example` to `.env` and paste your `Project ID` as the value for
   `NEXT_PUBLIC_PROJECT_ID`
4. Sign up for [Pinata](https://pinata.cloud) and copy your gateway url to
   `NEXT_PUBLIC_GATEWAY_URL` and your JWT key to `NEXT_PUBLIC_PINATA_JWT` (be
   sure to generate an admin key!).
5. Sign up for [Infura](https://infura.io) and create an RPC endpoint to use
   on Ethereum and Sepolia, copying the URLs to `NEXT_PUBLIC_MAINNET_RPC` and
   `NEXT_PUBLIC_SEPOLIA_RPC`, respectively.
6. Run `npm install` to install dependencies
7. Run `npm run dev` to start the development server

## Resources

- [Reown — Docs](https://docs.reown.com)
- [Next.js — Docs](https://nextjs.org/docs)
