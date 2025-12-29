
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BrowserProvider,
  Contract,
  formatEther,
  isAddress,
  parseEther,
} from "ethers";
import { CONTRACT_ABI, SEPOLIA_CHAIN_ID } from "@/lib/contract";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

type RecipientInfo = {
  address: string;
  share: number;
};

type ContractState = 0 | 1 | 2;


function ManageContractPageInner() {
  const searchParams = useSearchParams();

  const [account, setAccount] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [contractInstance, setContractInstance] = useState<Contract | null>(
    null,
  );
  const [currentState, setCurrentState] = useState<ContractState | null>(null);
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [deadlineTs, setDeadlineTs] = useState<bigint | null>(null);
  const [recipients, setRecipients] = useState<RecipientInfo[]>([]);
  const [buyer, setBuyer] = useState<string | null>(null);

  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [txLoading, setTxLoading] = useState<null | "deposit" | "confirm" | "refund">(null);
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isBuyer = useMemo(
    () =>
      buyer &&
      account &&
      buyer.toLowerCase() === account.toLowerCase(),
    [buyer, account],
  );

  const deadlineDate = useMemo(
    () => (deadlineTs ? new Date(Number(deadlineTs) * 1000) : null),
    [deadlineTs],
  );

  const deadlinePassed = useMemo(() => {
    if (!deadlineTs) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec > Number(deadlineTs);
  }, [deadlineTs]);

  const stateLabel = useMemo(() => {
    if (currentState === 0) return "Awaiting Payment";
    if (currentState === 1) return "Awaiting Delivery";
    if (currentState === 2) return "Complete";
    return "Unknown";
  }, [currentState]);

  const canDeposit =
    currentState === 0 && !!isBuyer && !!contractInstance;
  const canConfirm = currentState === 1 && !!isBuyer && !!contractInstance;
  const canRefund =
    currentState === 1 && !!isBuyer && deadlinePassed && !!contractInstance;

  useEffect(() => {
    const presetAddress = searchParams.get("address");
    if (presetAddress && isAddress(presetAddress)) {
      setContractAddress(presetAddress);
    }
  }, [searchParams]);

  useEffect(() => {
    const connectOnLoad = async () => {
      if (!window.ethereum) {
        setError("MetaMask not detected. Please install MetaMask to continue.");
        return;
      }
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setAccount(addr);

        const network = await provider.getNetwork();
        if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
          setNetworkWarning(
            "You are not connected to the Sepolia testnet. Please switch network in MetaMask.",
          );
        } else {
          setNetworkWarning(null);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to connect to MetaMask.");
      }
    };

    void connectOnLoad();
  }, []);

  const loadContractData = async (addr: string) => {
    if (!window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask to continue.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsLoadingContract(true);

    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(addr, CONTRACT_ABI as any, signer);
      setContractInstance(contract);

      const [stateRaw, deadlineRaw, buyerAddr, balanceRaw] =
        await Promise.all([
          contract.currentState(),
          contract.deadline(),
          contract.buyer(),
          contract.getBalance(),
        ]);

      setCurrentState(Number(stateRaw) as ContractState);
      setDeadlineTs(BigInt(deadlineRaw));
      setBuyer(buyerAddr);
      setBalanceEth(formatEther(balanceRaw));

      const loadedRecipients: RecipientInfo[] = [];
      for (let i = 0; ; i++) {
        try {
          const [payee, share] = await Promise.all([
            contract.payees(i),
            contract.shares(i),
          ]);
          loadedRecipients.push({
            address: payee,
            share: Number(share),
          });
        } catch {
          break;
        }
      }
      setRecipients(loadedRecipients);

      setSuccessMessage("Contract loaded successfully.");
    } catch (e: any) {
      console.error(e);
      setContractInstance(null);
      setCurrentState(null);
      setDeadlineTs(null);
      setBuyer(null);
      setBalanceEth(null);
      setRecipients([]);

      if (e?.code === "INVALID_ARGUMENT") {
        setError("Invalid contract address.");
      } else {
        setError(e?.reason || e?.message || "Failed to load contract data.");
      }
    } finally {
      setIsLoadingContract(false);
    }
  };

  const handleLoadClick = async () => {
    if (!isAddress(contractAddress)) {
      setError("Please enter a valid contract address.");
      return;
    }
    await loadContractData(contractAddress);
  };

  const handleDeposit = async () => {
    if (!contractInstance || !canDeposit) return;
    if (!depositAmount || Number(depositAmount) <= 0) {
      setError("Please enter a valid deposit amount in ETH.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      setTxLoading("deposit");
      const tx = await contractInstance.deposit({
        value: parseEther(depositAmount),
      });
      await tx.wait();
      setSuccessMessage("Deposit successful.");
      await loadContractData(contractInstance.target as string);
    } catch (e: any) {
      console.error(e);
      if (e?.code === "ACTION_REJECTED") {
        setError("Deposit transaction was rejected in MetaMask.");
      } else {
        setError(e?.reason || e?.message || "Failed to deposit ETH.");
      }
    } finally {
      setTxLoading(null);
    }
  };

  const handleConfirm = async () => {
    if (!contractInstance || !canConfirm) return;
    setError(null);
    setSuccessMessage(null);
    try {
      setTxLoading("confirm");
      const tx = await contractInstance.confirmDelivery();
      await tx.wait();
      setSuccessMessage("Delivery confirmed and funds distributed.");
      await loadContractData(contractInstance.target as string);
    } catch (e: any) {
      console.error(e);
      if (e?.code === "ACTION_REJECTED") {
        setError("Confirm transaction was rejected in MetaMask.");
      } else {
        setError(
          e?.reason || e?.message || "Failed to confirm delivery transaction.",
        );
      }
    } finally {
      setTxLoading(null);
    }
  };

  const handleRefund = async () => {
    if (!contractInstance || !canRefund) return;
    setError(null);
    setSuccessMessage(null);
    try {
      setTxLoading("refund");
      const tx = await contractInstance.refund();
      await tx.wait();
      setSuccessMessage("Refund successful. Funds returned to buyer.");
      await loadContractData(contractInstance.target as string);
    } catch (e: any) {
      console.error(e);
      if (e?.code === "ACTION_REJECTED") {
        setError("Refund transaction was rejected in MetaMask.");
      } else {
        setError(e?.reason || e?.message || "Failed to refund.");
      }
    } finally {
      setTxLoading(null);
    }
  };

  return (
    <main className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manage Escrow</h1>
          <p className="mt-1 text-sm text-gray-300">
            Load an existing escrow contract to deposit, confirm delivery, or
            refund.
          </p>
        </div>
        <div className="text-right text-sm">
          <div>
            <span className="font-medium">Wallet:</span>{" "}
            {account ? (
              <span className="text-green-400">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            ) : (
              <span className="text-red-400">Not connected</span>
            )}
          </div>
          <div className="text-xs text-gray-400">Network: Sepolia (expected)</div>
        </div>
      </header>

      {networkWarning && (
        <div className="rounded-md border border-yellow-600 bg-yellow-950 px-4 py-3 text-sm text-yellow-200">
          {networkWarning}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-600 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-600 bg-green-950 px-4 py-3 text-sm text-green-200">
          {successMessage}
        </div>
      )}

      <section className="rounded-lg border border-gray-700 bg-gray-900/70 p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold">Load Contract</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value.trim())}
            placeholder="0x... contract address"
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={handleLoadClick}
            disabled={!contractAddress || isLoadingContract}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-500 disabled:opacity-60"
          >
            {isLoadingContract ? "Loading..." : "Load"}
          </button>
        </div>
      </section>

      {contractInstance && (
        <section className="space-y-6 rounded-lg border border-gray-700 bg-gray-900/70 p-6 shadow-lg">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-200">Contract:</span>{" "}
              <span className="font-mono text-gray-100">
                {contractInstance.target as string}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-200">State:</span>{" "}
              <span
                className={
                  currentState === 0
                    ? "text-yellow-300"
                    : currentState === 1
                    ? "text-blue-300"
                    : "text-green-300"
                }
              >
                {stateLabel} ({currentState})
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-200">Balance:</span>{" "}
              <span className="text-gray-100">
                {balanceEth ?? "-"} ETH
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-200">Deadline:</span>{" "}
              {deadlineDate ? (
                <span
                  className={
                    deadlinePassed ? "text-red-300" : "text-gray-100"
                  }
                >
                  {deadlineDate.toLocaleString()} {" "}
                  {deadlinePassed && "(passed)"}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
            <div>
              <span className="font-medium text-gray-200">Buyer:</span>{" "}
              {buyer ? (
                <span
                  className={
                    isBuyer
                      ? "rounded bg-green-900/40 px-2 py-0.5 text-green-300"
                      : "font-mono text-gray-100"
                  }
                >
                  {buyer}
                  {isBuyer && " (you)"}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-200">
              Recipients
            </h3>
            {recipients.length === 0 ? (
              <p className="text-xs text-gray-400">
                No recipients found (this should not happen if the contract was
                created correctly).
              </p>
            ) : (
              <div className="space-y-1 text-xs">
                {recipients.map((r, idx) => (
                  <div
                    key={`${r.address}-${idx}`}
                    className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
                  >
                    <span className="font-mono text-gray-100">
                      {r.address}
                    </span>
                    <span className="text-gray-300">{r.share}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-md border border-gray-700 bg-gray-800 p-3 text-sm">
              <h4 className="text-sm font-semibold text-gray-200">
                Deposit ETH
              </h4>
              <p className="text-xs text-gray-400">
                Only the buyer can deposit while the contract is in state 0
                (Awaiting Payment).
              </p>
              <input
                type="number"
                min={0}
                step={0.0001}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                placeholder="Amount in ETH"
              />
              <button
                type="button"
                onClick={handleDeposit}
                disabled={!canDeposit || txLoading === "deposit"}
                className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {txLoading === "deposit" ? "Depositing..." : "Deposit"}
              </button>
            </div>

            <div className="space-y-2 rounded-md border border-gray-700 bg-gray-800 p-3 text-sm">
              <h4 className="text-sm font-semibold text-gray-200">
                Confirm Delivery
              </h4>
              <p className="text-xs text-gray-400">
                Once work is delivered, the buyer can confirm and release funds
                to recipients.
              </p>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm || txLoading === "confirm"}
                className="mt-4 w-full rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-60"
              >
                {txLoading === "confirm"
                  ? "Confirming..."
                  : "Confirm Delivery"}
              </button>
            </div>

            <div className="space-y-2 rounded-md border border-gray-700 bg-gray-800 p-3 text-sm">
              <h4 className="text-sm font-semibold text-gray-200">Refund</h4>
              <p className="text-xs text-gray-400">
                If the deadline passes without delivery, the buyer can refund
                all funds.
              </p>
              <button
                type="button"
                onClick={handleRefund}
                disabled={!canRefund || txLoading === "refund"}
                className="mt-4 w-full rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {txLoading === "refund" ? "Refunding..." : "Refund"}
              </button>
            </div>
          </div>
        </section>
      )}
      {/* Add Create New Contract button at the bottom */}
      <div className="max-w-xl mx-auto pt-2 pb-8 flex flex-col items-center">
        <button
          className="w-full rounded bg-green-600 hover:bg-green-700 px-4 py-2 font-semibold text-white mt-8"
          onClick={() => { window.location.href = "/"; }}
        >
          Create New Contract
        </button>
      </div>
    </main>
  );
}

export default function ManageContractPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManageContractPageInner />
    </Suspense>
  );
}


