import { createHash } from "node:crypto";

import { canonicalizeJson } from "./canonical-content.js";
import { VerusIntegrationError } from "./errors.js";
import type { JsonValue, VerusRpcAdapter } from "./types.js";

export interface ConfirmationPolicy {
  readonly minimumConfirmations: number;
}

export type ConfirmationResult =
  | { readonly state: "confirming"; readonly confirmations: number }
  | {
      readonly state: "confirmed";
      readonly confirmations: number;
      readonly blockHeight: number;
      readonly blockHash: string;
    }
  | {
      readonly state: "reorg_pending";
      readonly confirmations: number;
      readonly blockHeight?: number;
      readonly blockHash?: string;
    };

export type ReadbackResult =
  | { readonly state: "verified"; readonly readbackDigest: string }
  | { readonly state: "mismatch"; readonly observedDigests: readonly string[] };

export async function inspectTransactionConfirmation(
  adapter: VerusRpcAdapter,
  transactionId: string,
  policy: ConfirmationPolicy,
): Promise<ConfirmationResult> {
  if (!Number.isSafeInteger(policy.minimumConfirmations) || policy.minimumConfirmations < 1) {
    throw new VerusIntegrationError(
      "RPC_INVALID_RESULT",
      "Confirmation policy must require at least one confirmation",
      false,
    );
  }
  const transaction = await adapter.getRawTransaction(transactionId);
  if (transaction.confirmations < 0) {
    return { state: "reorg_pending", confirmations: transaction.confirmations };
  }
  if (transaction.confirmations < policy.minimumConfirmations || !transaction.blockHash) {
    return { state: "confirming", confirmations: transaction.confirmations };
  }
  const block = await adapter.getBlock(transaction.blockHash);
  const canonicalHash = await adapter.getBlockHash(block.height);
  if (
    block.hash !== transaction.blockHash ||
    canonicalHash !== transaction.blockHash ||
    block.confirmations < policy.minimumConfirmations ||
    !block.transactions.includes(transactionId)
  ) {
    return {
      state: "reorg_pending",
      confirmations: transaction.confirmations,
      blockHeight: block.height,
      blockHash: transaction.blockHash,
    };
  }
  return {
    state: "confirmed",
    confirmations: transaction.confirmations,
    blockHeight: block.height,
    blockHash: block.hash,
  };
}

export async function verifyIdentityContentReadback(
  adapter: VerusRpcAdapter,
  identityAddress: string,
  vdxfKey: string,
  expectedDigest: string,
): Promise<ReadbackResult> {
  const content = await adapter.getIdentityContent({ identity: identityAddress, vdxfKey });
  const entries = content.identity.contentMultiMap[vdxfKey] ?? [];
  const digests = entries
    .map((entry) => digestCanonicalHexEntry(entry))
    .filter((digest): digest is string => digest !== undefined);
  if (digests.includes(expectedDigest)) {
    return { state: "verified", readbackDigest: expectedDigest };
  }
  return { state: "mismatch", observedDigests: digests };
}

export async function searchReadbackBeforeResubmission(
  adapter: VerusRpcAdapter,
  identityAddress: string,
  vdxfKey: string,
  expectedDigest: string,
): Promise<"found" | "not_found"> {
  const result = await findReadbackEvidenceBeforeResubmission(
    adapter,
    identityAddress,
    vdxfKey,
    expectedDigest,
  );
  return result.found ? "found" : "not_found";
}

export type ReadbackSearchEvidence =
  | { readonly found: false }
  | { readonly found: true; readonly transactionId: string; readonly blockHeight: number };

export async function findReadbackEvidenceBeforeResubmission(
  adapter: VerusRpcAdapter,
  identityAddress: string,
  vdxfKey: string,
  expectedDigest: string,
): Promise<ReadbackSearchEvidence> {
  const content = await adapter.getIdentityContent({ identity: identityAddress, vdxfKey });
  const entries = content.identity.contentMultiMap[vdxfKey] ?? [];
  const found = entries.some((entry) => digestCanonicalHexEntry(entry) === expectedDigest);
  return found
    ? { found: true, transactionId: content.transactionId, blockHeight: content.blockHeight }
    : { found: false };
}

function digestCanonicalHexEntry(entry: JsonValue): string | undefined {
  try {
    if (typeof entry !== "string" || entry.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(entry)) {
      return undefined;
    }
    const bytes = Buffer.from(entry, "hex");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text) as JsonValue;
    if (canonicalizeJson(value) !== text) return undefined;
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}
