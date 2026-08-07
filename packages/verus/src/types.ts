export const VRSCTEST_CHAIN_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq" as const;
export const VRSCTEST_NETWORK = "VRSCTEST" as const;
export const MINIMUM_VERUS_NODE_VERSION = 2_000_753;
export const PINNED_VERUS_NODE_RELEASE = "1.2.17-3" as const;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface VerusInfo {
  readonly release: string;
  readonly version: number;
  readonly protocolVersion: number;
  readonly chainId: string;
  readonly name: string;
  readonly blocks: number;
  readonly longestChain: number;
  readonly connections: number;
  readonly testnet: boolean;
  readonly errors: string;
}

export interface VerusBlockchainInfo {
  readonly chain: string;
  readonly name: string;
  readonly chainId: string;
  readonly blocks: number;
  readonly headers: number;
  readonly bestBlockHash: string;
  readonly verificationProgress: number;
  readonly pruned: boolean;
}

export interface VerusIdentityDefinition {
  readonly version: number;
  readonly flags: number;
  readonly primaryAddresses: readonly string[];
  readonly minimumSignatures: number;
  readonly name: string;
  readonly identityAddress: string;
  readonly parent: string;
  readonly systemId: string;
  readonly contentMap: Readonly<Record<string, JsonValue>>;
  readonly contentMultiMap: Readonly<Record<string, readonly JsonValue[]>>;
  readonly revocationAuthority: string;
  readonly recoveryAuthority: string;
  readonly timelock: number;
}

export interface VerusIdentityResult {
  readonly fullyQualifiedName: string;
  readonly identity: VerusIdentityDefinition;
  readonly status: string;
  readonly canSpendFor: boolean;
  readonly canSignFor: boolean;
  readonly blockHeight: number;
  readonly transactionId: string;
  readonly outputIndex: number;
}

export interface GetIdentityRequest {
  readonly identity: string;
  readonly height?: number;
  readonly transactionProof?: boolean;
  readonly transactionProofHeight?: number;
}

export interface VerusIdentityContentResult extends VerusIdentityResult {
  readonly fromHeight: number;
  readonly toHeight: number;
}

export interface GetIdentityContentRequest {
  readonly identity: string;
  readonly heightStart?: number;
  readonly heightEnd?: number;
  readonly transactionProofs?: boolean;
  readonly transactionProofHeight?: number;
  readonly vdxfKey?: string;
  readonly keepDeleted?: boolean;
}

export interface VdxfBinding {
  readonly vdxfKey?: string;
  readonly uint256?: string;
  readonly indexNumber?: number;
}

export interface VerusVdxfId {
  readonly vdxfId: string;
  readonly hash160Result: string;
  readonly qualifiedName: Readonly<Record<string, JsonValue>>;
  readonly boundData?: Readonly<Record<string, JsonValue>>;
}

const preparedIdentityUpdate: unique symbol = Symbol("preparedIdentityUpdate");

/**
 * Constructed only by the server-side payload guard. Callers cannot pass an arbitrary identity
 * object directly to the RPC adapter.
 */
export interface PreparedIdentityUpdate {
  readonly identity: VerusIdentityDefinition;
  readonly manifestDigest: string;
  readonly vdxfKey: string;
  readonly [preparedIdentityUpdate]: true;
}

export function markIdentityUpdatePrepared(
  identity: VerusIdentityDefinition,
  vdxfKey: string,
  manifestDigest: string,
): PreparedIdentityUpdate {
  return {
    identity,
    vdxfKey,
    manifestDigest,
    [preparedIdentityUpdate]: true,
  };
}

export type VerusHashType = "sha256";

export interface SignDataRequest {
  readonly address: string;
  readonly dataHash: string;
  readonly hashType: VerusHashType;
  readonly prefixString: string;
}

export interface VerifySignatureRequest extends SignDataRequest {
  readonly signature: string;
  readonly checkLatest: boolean;
}

export interface VerusSignatureResult {
  readonly hash: string;
  readonly signature: string;
}

export interface VerusRawTransaction {
  readonly transactionId: string;
  readonly blockHash?: string;
  readonly confirmations: number;
}

export interface VerusBlock {
  readonly hash: string;
  readonly confirmations: number;
  readonly height: number;
  readonly transactions: readonly string[];
}

export type VerusRpcMethod =
  | "getinfo"
  | "getblockchaininfo"
  | "getidentity"
  | "getidentitycontent"
  | "getvdxfid"
  | "updateidentity"
  | "signdata"
  | "verifysignature"
  | "getrawtransaction"
  | "getblockhash"
  | "getblock";

export interface VerusRpcAdapter {
  getInfo(): Promise<VerusInfo>;
  getBlockchainInfo(): Promise<VerusBlockchainInfo>;
  getIdentity(request: GetIdentityRequest): Promise<VerusIdentityResult>;
  getIdentityContent(request: GetIdentityContentRequest): Promise<VerusIdentityContentResult>;
  getVdxfId(uri: string, binding?: VdxfBinding): Promise<VerusVdxfId>;
  updateIdentity(request: PreparedIdentityUpdate): Promise<string>;
  signData(request: SignDataRequest): Promise<VerusSignatureResult>;
  verifySignature(request: VerifySignatureRequest): Promise<VerusSignatureResult>;
  getRawTransaction(transactionId: string): Promise<VerusRawTransaction>;
  getBlockHash(height: number): Promise<string>;
  getBlock(hashOrHeight: string | number): Promise<VerusBlock>;
}
