import { VerusIntegrationError } from "./errors.js";
import type {
  GetIdentityContentRequest,
  GetIdentityRequest,
  JsonObject,
  JsonValue,
  PreparedIdentityUpdate,
  SignDataRequest,
  VdxfBinding,
  VerifySignatureRequest,
  VerusBlock,
  VerusBlockchainInfo,
  VerusIdentityContentResult,
  VerusIdentityDefinition,
  VerusIdentityResult,
  VerusInfo,
  VerusRawTransaction,
  VerusRpcAdapter,
  VerusRpcMethod,
  VerusSignatureResult,
  VerusVdxfId,
} from "./types.js";
import {
  requireBoolean,
  requireInteger,
  requireJsonObject,
  requireJsonValue,
  requireNumber,
  requireObject,
  requireString,
  requireStringArray,
} from "./validation.js";

export interface HttpVerusRpcAdapterOptions {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly timeoutMs?: number;
  readonly writeTimeoutMs?: number;
  readonly fetchImplementation?: typeof fetch;
}

interface RpcEnvelope {
  readonly result?: unknown;
  readonly error?: unknown;
}

export class HttpVerusRpcAdapter implements VerusRpcAdapter {
  private readonly fetchImplementation: typeof fetch;
  private nextId = 1;

  constructor(private readonly options: HttpVerusRpcAdapterOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getInfo(): Promise<VerusInfo> {
    const raw = requireObject(await this.call("getinfo", []), "getinfo result");
    return {
      release: requireString(raw.VRSCversion, "VRSCversion"),
      version: requireInteger(raw.version, "version"),
      protocolVersion: requireInteger(raw.protocolversion, "protocolversion"),
      chainId: requireString(raw.chainid, "chainid"),
      name: requireString(raw.name, "name"),
      blocks: requireInteger(raw.blocks, "blocks"),
      longestChain: requireInteger(raw.longestchain ?? raw.blocks, "longestchain"),
      connections: requireInteger(raw.connections, "connections"),
      testnet: requireBoolean(raw.testnet, "testnet"),
      errors: requireString(raw.errors, "errors"),
    };
  }

  async getBlockchainInfo(): Promise<VerusBlockchainInfo> {
    const raw = requireObject(await this.call("getblockchaininfo", []), "getblockchaininfo result");
    return {
      chain: requireString(raw.chain, "chain"),
      name: requireString(raw.name, "name"),
      chainId: requireString(raw.chainid, "chainid"),
      blocks: requireInteger(raw.blocks, "blocks"),
      headers: requireInteger(raw.headers, "headers"),
      bestBlockHash: requireString(raw.bestblockhash, "bestblockhash"),
      verificationProgress: requireNumber(raw.verificationprogress, "verificationprogress"),
      pruned: requireBoolean(raw.pruned, "pruned"),
    };
  }

  async getIdentity(request: GetIdentityRequest): Promise<VerusIdentityResult> {
    const params: JsonValue[] = [request.identity];
    if (request.height !== undefined) params.push(request.height);
    if (request.transactionProof !== undefined) params.push(request.transactionProof);
    if (request.transactionProofHeight !== undefined) params.push(request.transactionProofHeight);
    return parseIdentityResult(await this.call("getidentity", params));
  }

  async getIdentityContent(
    request: GetIdentityContentRequest,
  ): Promise<VerusIdentityContentResult> {
    const params: JsonValue[] = [request.identity];
    const optional = [
      request.heightStart,
      request.heightEnd,
      request.transactionProofs,
      request.transactionProofHeight,
      request.vdxfKey,
      request.keepDeleted,
    ] as const;
    const lastDefined = optional.findLastIndex((value) => value !== undefined);
    const defaults: readonly JsonValue[] = [0, 0, false, 0, "", false];
    for (let index = 0; index <= lastDefined; index += 1) {
      params.push(optional[index] ?? defaults[index]!);
    }
    const raw = requireObject(
      await this.call("getidentitycontent", params),
      "getidentitycontent result",
    );
    return {
      ...parseIdentityResult(raw),
      fromHeight: requireInteger(raw.fromheight, "fromheight"),
      toHeight: requireInteger(raw.toheight, "toheight"),
    };
  }

  async getVdxfId(uri: string, binding?: VdxfBinding): Promise<VerusVdxfId> {
    const params: JsonValue[] = [uri];
    if (binding) {
      params.push({
        ...(binding.vdxfKey ? { vdxfkey: binding.vdxfKey } : {}),
        ...(binding.uint256 ? { uint256: binding.uint256 } : {}),
        ...(binding.indexNumber !== undefined ? { indexnum: binding.indexNumber } : {}),
      });
    }
    const raw = requireObject(await this.call("getvdxfid", params), "getvdxfid result");
    const boundData = raw.bounddata;
    return {
      vdxfId: requireString(raw.vdxfid, "vdxfid"),
      hash160Result: requireString(raw.hash160result, "hash160result"),
      qualifiedName: requireJsonObject(raw.qualifiedname, "qualifiedname"),
      ...(boundData === undefined ? {} : { boundData: requireJsonObject(boundData, "bounddata") }),
    };
  }

  async updateIdentity(request: PreparedIdentityUpdate): Promise<string> {
    const result = await this.call(
      "updateidentity",
      [identityToRpc(request.identity), false, false],
      true,
    );
    if (typeof result !== "string" || !/^[0-9a-f]{64}$/i.test(result)) {
      throw new VerusIntegrationError(
        "AMBIGUOUS_SUBMISSION",
        "Verus write returned no usable transaction identifier and requires readback reconciliation",
        true,
        true,
      );
    }
    return result.toLowerCase();
  }

  async signData(request: SignDataRequest): Promise<VerusSignatureResult> {
    return parseSignatureResult(
      await this.call("signdata", [signatureRequestToRpc(request)]),
      "signdata result",
    );
  }

  async verifySignature(request: VerifySignatureRequest): Promise<VerusSignatureResult> {
    return parseSignatureResult(
      await this.call("verifysignature", [
        {
          ...signatureRequestToRpc(request),
          signature: request.signature,
          checklatest: request.checkLatest,
        },
      ]),
      "verifysignature result",
    );
  }

  async getRawTransaction(transactionId: string): Promise<VerusRawTransaction> {
    const raw = requireObject(
      await this.call("getrawtransaction", [transactionId, 1]),
      "getrawtransaction result",
    );
    const blockHash = raw.blockhash;
    return {
      transactionId: requireString(raw.txid, "txid"),
      confirmations: requireInteger(raw.confirmations ?? 0, "confirmations"),
      ...(blockHash === undefined ? {} : { blockHash: requireString(blockHash, "blockhash") }),
    };
  }

  async getBlockHash(height: number): Promise<string> {
    return requireString(await this.call("getblockhash", [height]), "getblockhash result");
  }

  async getBlock(hashOrHeight: string | number): Promise<VerusBlock> {
    const raw = requireObject(await this.call("getblock", [hashOrHeight, 1]), "getblock result");
    return {
      hash: requireString(raw.hash, "hash"),
      confirmations: requireInteger(raw.confirmations, "confirmations"),
      height: requireInteger(raw.height, "height"),
      transactions: requireStringArray(raw.tx, "tx"),
    };
  }

  private async call(
    method: VerusRpcMethod,
    params: readonly JsonValue[],
    write = false,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      write ? (this.options.writeTimeoutMs ?? 60_000) : (this.options.timeoutMs ?? 2_000),
    );
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.username && this.options.password) {
      headers.authorization = `Basic ${Buffer.from(`${this.options.username}:${this.options.password}`).toString("base64")}`;
    }

    try {
      const response = await this.fetchImplementation(this.options.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "1.0", id: `cbc-${this.nextId++}`, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (write && response.status >= 500) {
          throw new VerusIntegrationError(
            "AMBIGUOUS_SUBMISSION",
            "Verus write outcome is ambiguous and requires readback reconciliation",
            true,
            true,
          );
        }
        throw new VerusIntegrationError(
          "RPC_HTTP_ERROR",
          "Private Verus RPC returned an HTTP error",
          response.status >= 500,
        );
      }

      let payload: RpcEnvelope;
      try {
        payload = requireObject(await response.json(), "JSON-RPC envelope") as RpcEnvelope;
      } catch (error) {
        if (error instanceof VerusIntegrationError && !write) throw error;
        if (write) {
          throw new VerusIntegrationError(
            "AMBIGUOUS_SUBMISSION",
            "Verus write outcome is ambiguous and requires readback reconciliation",
            true,
            true,
          );
        }
        throw new VerusIntegrationError(
          "RPC_PROTOCOL_ERROR",
          "Private Verus RPC returned malformed JSON",
          false,
        );
      }

      if (payload.error !== null && payload.error !== undefined) {
        const rpcError = requireObject(payload.error, "JSON-RPC error");
        const code = typeof rpcError.code === "number" ? rpcError.code : 0;
        throw new VerusIntegrationError(
          "RPC_METHOD_ERROR",
          "Private Verus RPC rejected an allowlisted method",
          code === -28 || code === -9 || code === -5,
        );
      }
      if (!("result" in payload)) {
        if (write) {
          throw new VerusIntegrationError(
            "AMBIGUOUS_SUBMISSION",
            "Verus write outcome is ambiguous and requires readback reconciliation",
            true,
            true,
          );
        }
        throw new VerusIntegrationError(
          "RPC_PROTOCOL_ERROR",
          "Private Verus RPC response did not contain a result",
          false,
        );
      }
      return payload.result;
    } catch (error) {
      if (error instanceof VerusIntegrationError) throw error;
      if (write) {
        throw new VerusIntegrationError(
          "AMBIGUOUS_SUBMISSION",
          "Verus write outcome is ambiguous and requires readback reconciliation",
          true,
          true,
        );
      }
      throw new VerusIntegrationError(
        timedOut ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE",
        timedOut ? "Private Verus RPC timed out" : "Private Verus RPC is unavailable",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseIdentityResult(value: unknown): VerusIdentityResult {
  const raw = requireObject(value, "identity result");
  return {
    fullyQualifiedName: requireString(raw.fullyqualifiedname, "fullyqualifiedname"),
    identity: parseIdentityDefinition(raw.identity),
    status: requireString(raw.status, "status"),
    canSpendFor: requireBoolean(raw.canspendfor, "canspendfor"),
    canSignFor: requireBoolean(raw.cansignfor, "cansignfor"),
    blockHeight: requireInteger(raw.blockheight, "blockheight"),
    transactionId: requireString(raw.txid, "txid"),
    outputIndex: requireInteger(raw.vout, "vout"),
  };
}

function parseIdentityDefinition(value: unknown): VerusIdentityDefinition {
  const raw = requireObject(value, "identity");
  const contentMap = requireObject(raw.contentmap, "contentmap");
  const contentMultiMap = requireObject(raw.contentmultimap, "contentmultimap");
  const parsedContentMap: Record<string, JsonValue> = {};
  const parsedContentMultiMap: Record<string, readonly JsonValue[]> = {};
  for (const [key, item] of Object.entries(contentMap)) {
    parsedContentMap[key] = requireJsonValue(item, "contentmap value");
  }
  for (const [key, item] of Object.entries(contentMultiMap)) {
    if (!Array.isArray(item)) {
      throw new VerusIntegrationError(
        "RPC_INVALID_RESULT",
        "Verus RPC returned a non-array contentmultimap value",
        false,
      );
    }
    parsedContentMultiMap[key] = item.map((entry) =>
      requireJsonValue(entry, "contentmultimap value"),
    );
  }
  return {
    version: requireInteger(raw.version, "identity.version"),
    flags: requireInteger(raw.flags, "identity.flags"),
    primaryAddresses: requireStringArray(raw.primaryaddresses, "identity.primaryaddresses"),
    minimumSignatures: requireInteger(raw.minimumsignatures, "identity.minimumsignatures"),
    name: requireString(raw.name, "identity.name"),
    identityAddress: requireString(raw.identityaddress, "identity.identityaddress"),
    parent: requireString(raw.parent, "identity.parent"),
    systemId: requireString(raw.systemid, "identity.systemid"),
    contentMap: parsedContentMap,
    contentMultiMap: parsedContentMultiMap,
    revocationAuthority: requireString(raw.revocationauthority, "identity.revocationauthority"),
    recoveryAuthority: requireString(raw.recoveryauthority, "identity.recoveryauthority"),
    timelock: requireInteger(raw.timelock, "identity.timelock"),
  };
}

function identityToRpc(identity: VerusIdentityDefinition): JsonValue {
  return {
    version: identity.version,
    flags: identity.flags,
    primaryaddresses: identity.primaryAddresses,
    minimumsignatures: identity.minimumSignatures,
    name: identity.name,
    identityaddress: identity.identityAddress,
    parent: identity.parent,
    systemid: identity.systemId,
    contentmap: identity.contentMap,
    contentmultimap: identity.contentMultiMap,
    revocationauthority: identity.revocationAuthority,
    recoveryauthority: identity.recoveryAuthority,
    timelock: identity.timelock,
  };
}

function signatureRequestToRpc(request: SignDataRequest): JsonObject {
  return {
    address: request.address,
    datahash: request.dataHash,
    hashtype: request.hashType,
    prefixstring: request.prefixString,
  };
}

function parseSignatureResult(value: unknown, field: string): VerusSignatureResult {
  const raw = requireObject(value, field);
  return {
    hash: requireString(raw.hash, "hash"),
    signature: requireString(raw.signature, "signature"),
  };
}
