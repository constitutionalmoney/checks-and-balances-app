import { createHash } from "node:crypto";

import { VerusIntegrationError } from "./errors.js";
import {
  MINIMUM_VERUS_NODE_VERSION,
  PINNED_VERUS_NODE_RELEASE,
  VRSCTEST_CHAIN_ID,
  VRSCTEST_NETWORK,
  type GetIdentityContentRequest,
  type GetIdentityRequest,
  type PreparedIdentityUpdate,
  type SignDataRequest,
  type VdxfBinding,
  type VerifySignatureRequest,
  type VerusBlock,
  type VerusBlockchainInfo,
  type VerusIdentityContentResult,
  type VerusIdentityDefinition,
  type VerusIdentityResult,
  type VerusInfo,
  type VerusRawTransaction,
  type VerusRpcAdapter,
  type VerusRpcMethod,
  type VerusSignatureResult,
  type VerusVdxfId,
} from "./types.js";

const DEFAULT_BLOCK_HASH = "0".repeat(63) + "1";
const DEFAULT_IDENTITY_ADDRESS = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";

export interface FakeVerusRpcAdapterOptions {
  readonly info?: VerusInfo;
  readonly blockchain?: VerusBlockchainInfo;
  readonly identity?: VerusIdentityResult;
  readonly vdxfIds?: Readonly<Record<string, VerusVdxfId>>;
  readonly confirmationsAfterWrite?: number;
}

export class FakeVerusRpcAdapter implements VerusRpcAdapter {
  private info: VerusInfo;
  private blockchain: VerusBlockchainInfo;
  private identity: VerusIdentityResult;
  private readonly vdxfIds: Map<string, VerusVdxfId>;
  private readonly rawTransactions = new Map<string, VerusRawTransaction>();
  private readonly blocks = new Map<string, VerusBlock>();
  private readonly blockHashes = new Map<number, string>();
  private readonly failures = new Map<VerusRpcMethod, VerusIntegrationError[]>();
  private readonly methodCalls: VerusRpcMethod[] = [];
  private readonly confirmationsAfterWrite: number;

  constructor(options: FakeVerusRpcAdapterOptions = {}) {
    this.info = structuredClone(options.info ?? syntheticVerusInfo());
    this.blockchain = structuredClone(options.blockchain ?? syntheticBlockchainInfo());
    this.identity = structuredClone(options.identity ?? syntheticIdentityResult());
    this.vdxfIds = new Map(Object.entries(options.vdxfIds ?? {}));
    this.confirmationsAfterWrite = options.confirmationsAfterWrite ?? 2;
    this.blockHashes.set(this.blockchain.blocks, this.blockchain.bestBlockHash);
    this.blocks.set(this.blockchain.bestBlockHash, {
      hash: this.blockchain.bestBlockHash,
      confirmations: this.confirmationsAfterWrite,
      height: this.blockchain.blocks,
      transactions: [],
    });
  }

  calls(): readonly VerusRpcMethod[] {
    return [...this.methodCalls];
  }

  failNext(method: VerusRpcMethod, error: VerusIntegrationError): void {
    const queue = this.failures.get(method) ?? [];
    queue.push(error);
    this.failures.set(method, queue);
  }

  setInfo(info: VerusInfo): void {
    this.info = structuredClone(info);
  }

  setBlockchainInfo(blockchain: VerusBlockchainInfo): void {
    this.blockchain = structuredClone(blockchain);
  }

  setIdentity(identity: VerusIdentityResult): void {
    this.identity = structuredClone(identity);
  }

  setCanonicalBlockHash(height: number, hash: string): void {
    this.blockHashes.set(height, hash);
  }

  setTransaction(transaction: VerusRawTransaction, block?: VerusBlock): void {
    this.rawTransactions.set(transaction.transactionId, structuredClone(transaction));
    if (block) {
      this.blocks.set(block.hash, structuredClone(block));
      this.blockHashes.set(block.height, block.hash);
    }
  }

  async getInfo(): Promise<VerusInfo> {
    this.before("getinfo");
    return structuredClone(this.info);
  }

  async getBlockchainInfo(): Promise<VerusBlockchainInfo> {
    this.before("getblockchaininfo");
    return structuredClone(this.blockchain);
  }

  async getIdentity(request: GetIdentityRequest): Promise<VerusIdentityResult> {
    this.before("getidentity");
    this.assertIdentity(request.identity);
    return structuredClone(this.identity);
  }

  async getIdentityContent(
    request: GetIdentityContentRequest,
  ): Promise<VerusIdentityContentResult> {
    this.before("getidentitycontent");
    this.assertIdentity(request.identity);
    const result = structuredClone(this.identity);
    if (request.vdxfKey) {
      return {
        ...result,
        identity: {
          ...result.identity,
          contentMultiMap: {
            [request.vdxfKey]: result.identity.contentMultiMap[request.vdxfKey] ?? [],
          },
        },
        fromHeight: request.heightStart ?? 0,
        toHeight: request.heightEnd ?? this.blockchain.blocks,
      };
    }
    return {
      ...result,
      fromHeight: request.heightStart ?? 0,
      toHeight: request.heightEnd ?? this.blockchain.blocks,
    };
  }

  async getVdxfId(uri: string, binding?: VdxfBinding): Promise<VerusVdxfId> {
    this.before("getvdxfid");
    void binding;
    const result = this.vdxfIds.get(uri);
    if (!result) {
      throw new VerusIntegrationError(
        "RPC_METHOD_ERROR",
        "Synthetic VDXF fixture is not registered",
        false,
      );
    }
    return structuredClone(result);
  }

  async updateIdentity(request: PreparedIdentityUpdate): Promise<string> {
    this.before("updateidentity");
    this.identity = {
      ...this.identity,
      identity: structuredClone(request.identity),
      blockHeight: this.blockchain.blocks,
    };
    const transactionId = createHash("sha256")
      .update(`fake-update:${request.manifestDigest}`, "utf8")
      .digest("hex");
    const blockHash = this.blockchain.bestBlockHash;
    this.rawTransactions.set(transactionId, {
      transactionId,
      blockHash,
      confirmations: this.confirmationsAfterWrite,
    });
    const currentBlock = this.blocks.get(blockHash);
    this.blocks.set(blockHash, {
      hash: blockHash,
      confirmations: this.confirmationsAfterWrite,
      height: this.blockchain.blocks,
      transactions: [...(currentBlock?.transactions ?? []), transactionId],
    });
    this.blockHashes.set(this.blockchain.blocks, blockHash);
    return transactionId;
  }

  async signData(request: SignDataRequest): Promise<VerusSignatureResult> {
    this.before("signdata");
    return syntheticSignature(request);
  }

  async verifySignature(request: VerifySignatureRequest): Promise<VerusSignatureResult> {
    this.before("verifysignature");
    const expected = syntheticSignature(request);
    if (request.signature !== expected.signature) {
      throw new VerusIntegrationError(
        "RPC_METHOD_ERROR",
        "Synthetic signature verification failed",
        false,
      );
    }
    return expected;
  }

  async getRawTransaction(transactionId: string): Promise<VerusRawTransaction> {
    this.before("getrawtransaction");
    const result = this.rawTransactions.get(transactionId);
    if (!result) {
      throw new VerusIntegrationError(
        "RPC_METHOD_ERROR",
        "Synthetic transaction is not available",
        true,
      );
    }
    return structuredClone(result);
  }

  async getBlockHash(height: number): Promise<string> {
    this.before("getblockhash");
    const hash = this.blockHashes.get(height);
    if (!hash) {
      throw new VerusIntegrationError(
        "RPC_METHOD_ERROR",
        "Synthetic block height is not available",
        true,
      );
    }
    return hash;
  }

  async getBlock(hashOrHeight: string | number): Promise<VerusBlock> {
    this.before("getblock");
    const hash =
      typeof hashOrHeight === "number" ? this.blockHashes.get(hashOrHeight) : hashOrHeight;
    const result = hash ? this.blocks.get(hash) : undefined;
    if (!result) {
      throw new VerusIntegrationError("RPC_METHOD_ERROR", "Synthetic block is not available", true);
    }
    return structuredClone(result);
  }

  private before(method: VerusRpcMethod): void {
    this.methodCalls.push(method);
    const queue = this.failures.get(method);
    const failure = queue?.shift();
    if (failure) throw failure;
  }

  private assertIdentity(identity: string): void {
    if (
      identity !== this.identity.identity.identityAddress &&
      identity !== this.identity.fullyQualifiedName
    ) {
      throw new VerusIntegrationError(
        "RPC_METHOD_ERROR",
        "Synthetic identity is not available",
        false,
      );
    }
  }
}

export function syntheticVerusInfo(overrides: Partial<VerusInfo> = {}): VerusInfo {
  return {
    release: PINNED_VERUS_NODE_RELEASE,
    version: MINIMUM_VERUS_NODE_VERSION,
    protocolVersion: 170_010,
    chainId: VRSCTEST_CHAIN_ID,
    name: VRSCTEST_NETWORK,
    blocks: 1_000,
    longestChain: 1_000,
    connections: 4,
    testnet: true,
    errors: "",
    ...overrides,
  };
}

export function syntheticBlockchainInfo(
  overrides: Partial<VerusBlockchainInfo> = {},
): VerusBlockchainInfo {
  return {
    chain: "test",
    name: VRSCTEST_NETWORK,
    chainId: VRSCTEST_CHAIN_ID,
    blocks: 1_000,
    headers: 1_000,
    bestBlockHash: DEFAULT_BLOCK_HASH,
    verificationProgress: 1,
    pruned: false,
    ...overrides,
  };
}

export function syntheticIdentityDefinition(
  overrides: Partial<VerusIdentityDefinition> = {},
): VerusIdentityDefinition {
  return {
    version: 3,
    flags: 0,
    primaryAddresses: ["RXKs5Gz8kRqpA52M25AW5FzP3aCNq46yMh"],
    minimumSignatures: 1,
    name: "cbc-synthetic-anchor",
    identityAddress: DEFAULT_IDENTITY_ADDRESS,
    parent: "i3UXS5QPRQGNRDDqVnyWTnmFCTHDbzmsYk",
    systemId: VRSCTEST_CHAIN_ID,
    contentMap: {},
    contentMultiMap: {},
    revocationAuthority: DEFAULT_IDENTITY_ADDRESS,
    recoveryAuthority: DEFAULT_IDENTITY_ADDRESS,
    timelock: 0,
    ...overrides,
  };
}

export function syntheticIdentityResult(
  overrides: Partial<VerusIdentityResult> = {},
): VerusIdentityResult {
  return {
    fullyQualifiedName: "cbc-synthetic-anchor@",
    identity: syntheticIdentityDefinition(),
    status: "active",
    canSpendFor: true,
    canSignFor: true,
    blockHeight: 900,
    transactionId: "a".repeat(64),
    outputIndex: 0,
    ...overrides,
  };
}

function syntheticSignature(request: SignDataRequest): VerusSignatureResult {
  const material = [request.address, request.dataHash, request.hashType, request.prefixString].join(
    "\u001f",
  );
  return {
    hash: request.dataHash,
    signature: Buffer.from(createHash("sha256").update(material, "utf8").digest()).toString(
      "base64",
    ),
  };
}
