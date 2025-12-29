"use client";
export const dynamic = "force-dynamic";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, ContractFactory, isAddress, getAddress } from "ethers";
import {
  CONTRACT_ABI,
  CONTRACT_BYTECODE,
  SEPOLIA_CHAIN_ID,
} from "@/lib/contract";

type RecipientRow = {
  address: string;
  share: string;
};

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export default function CreateContractPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [manageAddress, setManageAddress] = useState<string>("");
  const [manageInputError, setManageInputError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([
    { address: "", share: "" },
  ]);
  const [daysUntilDeadline, setDaysUntilDeadline] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdContractAddress, setCreatedContractAddress] = useState<
    string | null
  >(null);
  const [createdDeadlineDate, setCreatedDeadlineDate] = useState<Date | null>(
    null,
  );

  const totalShares = useMemo(
    () =>
      recipients.reduce((sum, r) => {
        const v = Number(r.share);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0),
    [recipients],
  );

  const isSharesValid = totalShares === 100;

  const isFormValid = useMemo(() => {
    if (!account) return false;
    if (!daysUntilDeadline || Number(daysUntilDeadline) <= 0) return false;
    if (!isSharesValid) return false;
    if (recipients.length === 0) return false;
    for (const r of recipients) {
      if (!r.address || !isAddress(r.address)) return false;
      const shareNum = Number(r.share);
      if (!Number.isFinite(shareNum) || shareNum <= 0) return false;
    }
    return true;
  }, [account, daysUntilDeadline, isSharesValid, recipients]);

  useEffect(() => {
    const connectOnLoad = async () => {
      if (!window.ethereum) {
        setError("MetaMask not detected. Please install MetaMask to continue.");
        return;
      }
      setIsConnecting(true);
      setError(null);
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setAccount(addr);

        const network = await provider.getNetwork();
        console.log("[DEBUG] Detected chainId:", network.chainId, "(type:", typeof network.chainId, ")");
        if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
          setNetworkWarning(
            `You are not connected to the Sepolia testnet.\nDetected chainId: ${network.chainId} (expected: ${SEPOLIA_CHAIN_ID}). Please switch network in MetaMask.`,
          );
        } else {
          setNetworkWarning(null);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to connect to MetaMask.");
      } finally {
        setIsConnecting(false);
      }
    };

    void connectOnLoad();
  }, []);

  const handleAddRecipient = () => {
    setRecipients((prev) => [...prev, { address: "", share: "" }]);
  };

  const handleRemoveRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRecipientChange = (
    index: number,
    field: keyof RecipientRow,
    value: string,
  ) => {
    setRecipients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setCreatedContractAddress(null);
    setCreatedDeadlineDate(null);

    if (!window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask to continue.");
      return;
    }
    if (!isFormValid || !account) {
      setError("Please fix validation errors before creating the contract.");
      return;
    }

    try {
      setIsDeploying(true);
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();


      // Use ethers v6 getAddress for payees, convert shares and days to BigInt
      // Import getAddress from ethers at the top of the file
      // import { getAddress } from "ethers";
      const payees = recipients.map((r) => getAddress(r.address));
      const shares = recipients.map((r) => BigInt(r.share));
      const days = BigInt(daysUntilDeadline);

      console.log('[DEBUG] Deploying contract with arguments:', {
        buyer: account,
        payees,
        shares,
        days,
        types: [
          typeof account,
          Array.isArray(payees),
          Array.isArray(shares),
          typeof days,
        ],
      });

      const factory = new ContractFactory(
        CONTRACT_ABI as any,
        CONTRACT_BYTECODE,
        signer,
      );

      const contract = await factory.deploy(
        account,
        payees,
        shares,
        days,
      );

      const deploymentTx = contract.deploymentTransaction();
      if (deploymentTx) {
        await deploymentTx.wait();
      }

      const deployedAddress = await contract.getAddress();
      setCreatedContractAddress(deployedAddress);

      // Convert days (BigInt) to number for JS date math
      const deadlineDate = new Date(
        Date.now() + Number(days) * 24 * 60 * 60 * 1000,
      );
      setCreatedDeadlineDate(deadlineDate);

      setSuccessMessage("Escrow contract created successfully.");
    } catch (e: any) {
      console.error(e);
      if (e?.code === "ACTION_REJECTED") {
        setError("Transaction was rejected in MetaMask.");
      } else {
        setError(e?.reason || e?.message || "Failed to deploy contract.");
      }
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <main className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Split Pay Escrow</h1>
          <p className="mt-1 text-sm text-gray-300">
            Create an escrow contract that splits ETH to multiple recipients
            upon delivery.
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
              <span className="text-red-400">
                {isConnecting ? "Connecting..." : "Not connected"}
              </span>
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

        <h2 className="mb-4 text-xl font-semibold">Create Contract</h2>

        <form className="space-y-6" onSubmit={handleDeploy}>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-200">
              Buyer Address
            </label>
            <input
              type="text"
              value={account ?? ""}
              disabled
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            />
            <p className="mt-1 text-xs text-gray-400">
              Auto-filled from your connected MetaMask account.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-gray-200">
                Recipients &amp; Shares
              </label>
              <span
                className={`text-xs ${
                  isSharesValid ? "text-green-400" : "text-red-400"
                }`}
              >
                Total shares: {totalShares}%{" "}
                {!isSharesValid && "(must equal 100%)"}
              </span>
            </div>

            <div className="space-y-3">
              {recipients.map((row, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border border-gray-700 bg-gray-800 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-gray-300">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      value={row.address}
                      onChange={(e) =>
                        handleRecipientChange(
                          index,
                          "address",
                          e.target.value.trim(),
                        )
                      }
                      placeholder="0x..."
                      className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <label className="mb-1 block text-xs text-gray-300">
                      Share (%)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={row.share}
                      onChange={(e) =>
                        handleRecipientChange(index, "share", e.target.value)
                      }
                      className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div className="flex justify-end sm:mt-5">
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(index)}
                      disabled={recipients.length === 1}
                      className="rounded-md border border-red-600 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddRecipient}
              className="mt-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-100 hover:bg-gray-700"
            >
              + Add Recipient
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-200">
              Deadline (days from now)
            </label>
            <input
              type="number"
              min={1}
              value={daysUntilDeadline}
              onChange={(e) => setDaysUntilDeadline(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              placeholder="e.g. 7"
            />
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isDeploying || isConnecting}
            className="inline-flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-green-500 disabled:opacity-60"
          >
            {isDeploying ? "Creating Contract..." : "Create Contract"}
          </button>
        </form>
      </section>

      {createdContractAddress && (
        <section className="rounded-lg border border-green-700 bg-green-950/40 p-4 text-sm text-green-100">
          <h3 className="mb-2 text-base font-semibold text-green-300">
            Contract Created
          </h3>
          <p>
            <span className="font-medium">Address:</span>{" "}
            <span className="font-mono">{createdContractAddress}</span>
          </p>
          {createdDeadlineDate && (
            <p className="mt-1">
              <span className="font-medium">Deadline:</span>{" "}
              {createdDeadlineDate.toLocaleString()}
            </p>
          )}
          <p className="mt-3">
            Go to the{" "}
            <Link href={`/manage?address=${createdContractAddress}`}>
              manage page
            </Link>{" "}
            to deposit and manage this escrow.
          </p>
        </section>
      )}
      {/* Quick access to Manage Contract (now at the very bottom) */}
      <div className="max-w-xl mx-auto pt-2 pb-8 flex flex-col items-center">
        <div className="w-full bg-gray-800/80 rounded-lg p-4 mt-6 flex flex-col items-center border border-gray-700">
          <div className="font-semibold mb-2 text-lg">Already have a contract?</div>
          <form
            className="flex flex-col sm:flex-row gap-2 w-full items-center"
            onSubmit={e => {
              e.preventDefault();
              if (!manageAddress || !isAddress(manageAddress)) {
                setManageInputError("Enter a valid contract address");
                return;
              }
              setManageInputError(null);
              window.location.href = `/manage?address=${manageAddress}`;
            }}
          >
            <input
              className="flex-1 rounded bg-gray-900 border border-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste contract address..."
              value={manageAddress}
              onChange={e => {
                setManageAddress(e.target.value);
                setManageInputError(null);
              }}
              spellCheck={false}
            />
            <button
              type="submit"
              className="rounded bg-blue-600 hover:bg-blue-700 px-4 py-2 font-semibold text-white disabled:bg-gray-600"
              disabled={!manageAddress || !isAddress(manageAddress)}
            >
              Go to Manage
            </button>
          </form>
          {manageInputError && (
            <div className="text-red-400 text-sm mt-1">{manageInputError}</div>
          )}
        </div>
      </div>
    </main>
  );
}


