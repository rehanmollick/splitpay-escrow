# SplitPay: Decentralized Multi-Party Escrow

## Problem Statement
Freelance and contract work often lacks trustless payment infrastructure. There is no way to prove payment agreements on-chain, clients can refuse to pay after work is delivered, manual payment splitting is error-prone, and there is no automatic refund if work isn't delivered. Centralized escrow services charge high fees and require trust.

## Solution Statement
SplitPay is a decentralized escrow protocol for Ethereum that enables trustless, multi-party payment agreements. Funds are locked in a smart contract with a customizable deadline, payments are split automatically to multiple recipients based on predefined percentages, and refunds are executed if work is not delivered by the deadline. All agreements are provable and immutable on-chain. No intermediaries, no fees, fully transparent.

---
Built with Solidity and deployed on the Sepolia testnet, this demo includes a Next.js frontend for easy interaction.

## Features
- Trustless escrow for freelance/contract work
- Automatic payment splitting to multiple recipients
- Refunds if work is not delivered by deadline
- On-chain proof of agreement and payment
- No intermediaries or platform fees (standard Ethereum gas fees apply)

## Tech Stack
- Solidity (smart contract)
- ethers.js (frontend contract interaction)
- Next.js 14 (React, TypeScript, Tailwind CSS)
- Sepolia Ethereum testnet

## Smart Contract Development and Testing
The SplitPaymentEscrow smart contract was developed and tested using the Remix IDE on the Remix virtual machine environment. 
You can deploy and interact with the contract directly in Remix by copying the Solidity file from `contracts/SplitPaymentEscrow.sol`.

## Getting Started
You can use the live demo at: [https://splitpay-escrow-pwqu-bbx53h5y2-rehanmollicks-projects.vercel.app/](https://splitpay-escrow-13jh.vercel.app/)

You should have MetaMask downloaded and be on the Sepolia testnet. Ideally you have 3 or more accounts, each with SepoliaETH tokens so that you can functionally test the app. 
You can get free tokens at https://sepolia-faucet.pk910.de/. 

Or run locally:
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the local dev server:
   ```bash
   npm run dev
   ```
4. Connect MetaMask (Sepolia network) and interact with the app at `http://localhost:3000`

## Usage
- Create a new escrow contract by specifying recipients, their shares, and a deadline.
- Deposit ETH into the contract as the buyer.
- Confirm delivery to release funds to recipients, or refund if the deadline passes without delivery.
- Manage contracts by pasting the contract address on the manage page.

## License
MIT
