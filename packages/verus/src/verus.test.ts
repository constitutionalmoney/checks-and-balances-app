import { describe, expect, it } from "vitest";

import {
  deterministicVerusIdempotencyKey,
  FakeVerusRpcAdapter,
  HttpVerusRpcAdapter,
  inspectTransactionConfirmation,
  MINIMUM_VERUS_NODE_VERSION,
  PINNED_VERUS_NODE_RELEASE,
  prepareCanonicalPayload,
  prepareIdentityContentUpdate,
  runVerusWritePreflight,
  searchReadbackBeforeResubmission,
  syntheticBlockchainInfo,
  syntheticIdentityDefinition,
  syntheticIdentityResult,
  syntheticVerusInfo,
  verifyIdentityContentReadback,
  VRSCTEST_CHAIN_ID,
  type JsonValue,
  type VerusRpcMethod,
  type VerusVdxfId,
} from "./index.js";

const VDXF_URI = "cbc-synthetic::v1.anchor.test";
const VDXF_ID = VRSCTEST_CHAIN_ID;
const VDXF_FIXTURE: VerusVdxfId = {
  vdxfId: VDXF_ID,
  hash160Result: "ab".repeat(20),
  qualifiedName: { name: "test", namespace: "cbc-synthetic" },
};
const PAYLOAD_POLICY = {
  policyReference: "synthetic-policy-v1",
  allowedTopLevelFields: ["schema", "environment", "digest"],
  requiredTopLevelFields: ["schema", "environment", "digest"],
  maximumBytes: 512,
} as const;

describe("typed Verus RPC contract", () => {
  it("uses only the pinned allowlisted JSON-RPC methods and parses their result shapes", async () => {
    const requests: Array<{ method: string; params: JsonValue[] }> = [];
    const identity = rpcIdentity();
    const results: Record<VerusRpcMethod, unknown> = {
      getinfo: rpcInfo(),
      getblockchaininfo: rpcBlockchain(),
      getidentity: rpcIdentityResult(identity),
      getidentitycontent: {
        ...rpcIdentityResult(identity),
        fromheight: 0,
        toheight: 1_000,
      },
      getvdxfid: {
        vdxfid: VDXF_ID,
        hash160result: "ab".repeat(20),
        qualifiedname: { name: "test", namespace: "cbc-synthetic" },
      },
      updateidentity: "b".repeat(64),
      signdata: { hash: "c".repeat(64), signature: "synthetic-signature" },
      verifysignature: { hash: "c".repeat(64), signature: "synthetic-signature" },
      getrawtransaction: {
        txid: "b".repeat(64),
        blockhash: "d".repeat(64),
        confirmations: 2,
      },
      getblockhash: "d".repeat(64),
      getblock: {
        hash: "d".repeat(64),
        confirmations: 2,
        height: 1_000,
        tx: ["b".repeat(64)],
      },
    };
    const adapter = new HttpVerusRpcAdapter({
      url: "http://127.0.0.1:18843",
      username: "private-user",
      password: "private-password",
      fetchImplementation: stubFetch(async (method, params) => {
        requests.push({ method, params });
        return results[method as VerusRpcMethod];
      }),
    });

    await expect(adapter.getInfo()).resolves.toMatchObject({
      name: "VRSCTEST",
      chainId: VRSCTEST_CHAIN_ID,
    });
    await expect(adapter.getBlockchainInfo()).resolves.toMatchObject({
      verificationProgress: 1,
    });
    const identityResult = await adapter.getIdentity({ identity: VRSCTEST_CHAIN_ID });
    await adapter.getIdentityContent({ identity: VRSCTEST_CHAIN_ID, vdxfKey: VDXF_ID });
    await adapter.getVdxfId(VDXF_URI);
    const payload = prepareCanonicalPayload(
      { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );
    await adapter.updateIdentity(
      prepareIdentityContentUpdate(identityResult.identity, VDXF_ID, payload),
    );
    const signRequest = {
      address: VRSCTEST_CHAIN_ID,
      dataHash: "c".repeat(64),
      hashType: "sha256" as const,
      prefixString: "cbc.synthetic.v1",
    };
    await adapter.signData(signRequest);
    await adapter.verifySignature({
      ...signRequest,
      signature: "synthetic-signature",
      checkLatest: true,
    });
    await adapter.getRawTransaction("b".repeat(64));
    await adapter.getBlockHash(1_000);
    await adapter.getBlock("d".repeat(64));

    expect(requests.map(({ method }) => method)).toEqual([
      "getinfo",
      "getblockchaininfo",
      "getidentity",
      "getidentitycontent",
      "getvdxfid",
      "updateidentity",
      "signdata",
      "verifysignature",
      "getrawtransaction",
      "getblockhash",
      "getblock",
    ]);
    expect(requests.find(({ method }) => method === "updateidentity")?.params).toHaveLength(3);
    expect(
      requests.some(({ method }) => method === "stop" || method === "sendrawtransaction"),
    ).toBe(false);
  });

  it("classifies a write timeout as ambiguous without leaking the RPC body or credentials", async () => {
    const adapter = new HttpVerusRpcAdapter({
      url: "http://127.0.0.1:18843",
      username: "private-user",
      password: "private-password",
      timeoutMs: 5,
      writeTimeoutMs: 5,
      fetchImplementation: abortingFetch(),
    });
    const payload = prepareCanonicalPayload(
      { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );

    await expect(
      adapter.updateIdentity(
        prepareIdentityContentUpdate(syntheticIdentityDefinition(), VDXF_ID, payload),
      ),
    ).rejects.toMatchObject({
      code: "AMBIGUOUS_SUBMISSION",
      retryable: true,
      submissionAmbiguous: true,
    });
    await expect(
      adapter.updateIdentity(
        prepareIdentityContentUpdate(syntheticIdentityDefinition(), VDXF_ID, payload),
      ),
    ).rejects.not.toThrow(/private-user|private-password|synthetic\.v1/i);
  });

  it("redacts daemon error messages into stable classifications", async () => {
    const adapter = new HttpVerusRpcAdapter({
      url: "http://127.0.0.1:18843",
      fetchImplementation: stubEnvelopeFetch({
        result: null,
        error: { code: -1, message: "secret wallet path and request body" },
      }),
    });
    await expect(adapter.getInfo()).rejects.toMatchObject({ code: "RPC_METHOD_ERROR" });
    await expect(adapter.getInfo()).rejects.not.toThrow(/secret wallet path|request body/i);
  });
});

describe("VRSCTEST write preflight", () => {
  const enabledPolicy = {
    serverSelectedNetwork: "VRSCTEST",
    expectedIdentity: {
      identityAddress: VRSCTEST_CHAIN_ID,
      systemId: VRSCTEST_CHAIN_ID,
      allowedStatuses: ["active"],
      mustBeSignableByNode: true,
    },
    expectedVdxf: { uri: VDXF_URI, vdxfId: VDXF_ID },
    writeCapabilityEnabled: true,
  } as const;

  it("validates the pinned node, synchronization, identity state, and VDXF fixture", async () => {
    const adapter = fakeAdapter();
    await expect(runVerusWritePreflight(adapter, enabledPolicy)).resolves.toMatchObject({
      info: { release: PINNED_VERUS_NODE_RELEASE, version: MINIMUM_VERUS_NODE_VERSION },
      blockchain: { chainId: VRSCTEST_CHAIN_ID },
      identity: { status: "active" },
      vdxf: { vdxfId: VDXF_ID },
    });
  });

  it.each([
    [
      "client-selected or mainnet network",
      fakeAdapter(),
      { ...enabledPolicy, serverSelectedNetwork: "VRSC" },
      "WRONG_NETWORK",
    ],
    [
      "wrong chain response",
      new FakeVerusRpcAdapter({
        info: syntheticVerusInfo({ chainId: "iWrongChain", name: "VRSC", testnet: false }),
        vdxfIds: { [VDXF_URI]: VDXF_FIXTURE },
      }),
      enabledPolicy,
      "WRONG_NETWORK",
    ],
    [
      "unsynchronized node",
      new FakeVerusRpcAdapter({
        blockchain: syntheticBlockchainInfo({ headers: 1_001, verificationProgress: 0.99 }),
        vdxfIds: { [VDXF_URI]: VDXF_FIXTURE },
      }),
      enabledPolicy,
      "NODE_UNSYNCED",
    ],
    [
      "unsupported node",
      new FakeVerusRpcAdapter({
        info: syntheticVerusInfo({ version: MINIMUM_VERUS_NODE_VERSION - 1 }),
        vdxfIds: { [VDXF_URI]: VDXF_FIXTURE },
      }),
      enabledPolicy,
      "NODE_VERSION_UNSUPPORTED",
    ],
    [
      "recovered or revoked identity",
      new FakeVerusRpcAdapter({
        identity: syntheticIdentityResult({ status: "revoked", canSignFor: false }),
        vdxfIds: { [VDXF_URI]: VDXF_FIXTURE },
      }),
      enabledPolicy,
      "IDENTITY_STATE_INVALID",
    ],
    [
      "mismatched derived VDXF identifier",
      new FakeVerusRpcAdapter({
        vdxfIds: {
          [VDXF_URI]: { ...VDXF_FIXTURE, vdxfId: "iWrongVdxfIdentifier1111111111111111" },
        },
      }),
      enabledPolicy,
      "VDXF_ID_MISMATCH",
    ],
    [
      "disabled release gate",
      fakeAdapter(),
      { ...enabledPolicy, writeCapabilityEnabled: false },
      "POLICY_GATE_DISABLED",
    ],
  ])("fails closed for %s", async (_label, adapter, policy, code) => {
    await expect(runVerusWritePreflight(adapter, policy)).rejects.toMatchObject({ code });
  });
});

describe("canonical content and reconciliation", () => {
  it("canonicalizes deterministically and creates a stable idempotency key", () => {
    const first = prepareCanonicalPayload(
      { digest: "e".repeat(64), schema: "synthetic.v1", environment: "vrsctest" },
      PAYLOAD_POLICY,
    );
    const second = prepareCanonicalPayload(
      { environment: "vrsctest", schema: "synthetic.v1", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );
    expect(first.digest).toBe(second.digest);
    expect(new TextDecoder().decode(first.bytes)).toBe(
      `{"digest":"${"e".repeat(64)}","environment":"vrsctest","schema":"synthetic.v1"}`,
    );
    expect(
      deterministicVerusIdempotencyKey({
        operationType: "synthetic_anchor",
        subjectReference: "synthetic-subject-reference-0001",
        vdxfKey: VDXF_ID,
        manifestDigest: first.digest,
      }),
    ).toBe(
      deterministicVerusIdempotencyKey({
        operationType: "synthetic_anchor",
        subjectReference: "synthetic-subject-reference-0001",
        vdxfKey: VDXF_ID,
        manifestDigest: second.digest,
      }),
    );
  });

  it("rejects unapproved, private, and oversized fields", () => {
    expect(() =>
      prepareCanonicalPayload(
        {
          schema: "synthetic.v1",
          environment: "vrsctest",
          digest: "e".repeat(64),
          extra: true,
        },
        PAYLOAD_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "PAYLOAD_FORBIDDEN" }));
    expect(() =>
      prepareCanonicalPayload(
        {
          schema: "synthetic.v1",
          environment: "vrsctest",
          digest: { exactAddress: "forbidden" },
        },
        PAYLOAD_POLICY,
      ),
    ).toThrowError(expect.objectContaining({ code: "PAYLOAD_FORBIDDEN" }));
    expect(() =>
      prepareCanonicalPayload(
        { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
        { ...PAYLOAD_POLICY, maximumBytes: 10 },
      ),
    ).toThrowError(expect.objectContaining({ code: "PAYLOAD_OVERSIZE" }));
  });

  it("writes, confirms, and verifies exact array-form identity content with the fake adapter", async () => {
    const adapter = fakeAdapter();
    const payload = prepareCanonicalPayload(
      { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );
    const transactionId = await adapter.updateIdentity(
      prepareIdentityContentUpdate(syntheticIdentityDefinition(), VDXF_ID, payload),
    );
    await expect(adapter.getIdentity({ identity: VRSCTEST_CHAIN_ID })).resolves.toMatchObject({
      identity: {
        contentMultiMap: {
          [VDXF_ID]: [Buffer.from(payload.bytes).toString("hex")],
        },
      },
    });
    await expect(
      inspectTransactionConfirmation(adapter, transactionId, { minimumConfirmations: 2 }),
    ).resolves.toMatchObject({ state: "confirmed", blockHeight: 1_000 });
    await expect(
      verifyIdentityContentReadback(adapter, VRSCTEST_CHAIN_ID, VDXF_ID, payload.digest),
    ).resolves.toEqual({ state: "verified", readbackDigest: payload.digest });
  });

  it("searches readback before resubmitting an ambiguously accepted digest", async () => {
    const adapter = fakeAdapter();
    const payload = prepareCanonicalPayload(
      { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );
    const prepared = prepareIdentityContentUpdate(syntheticIdentityDefinition(), VDXF_ID, payload);
    adapter.setIdentity(syntheticIdentityResult({ identity: prepared.identity }));
    await expect(
      searchReadbackBeforeResubmission(adapter, VRSCTEST_CHAIN_ID, VDXF_ID, payload.digest),
    ).resolves.toBe("found");
    expect(adapter.calls()).toEqual(["getidentitycontent"]);
  });

  it("detects a canonical-block mismatch as reorg_pending without changing identity content", async () => {
    const adapter = fakeAdapter();
    const payload = prepareCanonicalPayload(
      { schema: "synthetic.v1", environment: "vrsctest", digest: "e".repeat(64) },
      PAYLOAD_POLICY,
    );
    const transactionId = await adapter.updateIdentity(
      prepareIdentityContentUpdate(syntheticIdentityDefinition(), VDXF_ID, payload),
    );
    adapter.setCanonicalBlockHash(1_000, "f".repeat(64));
    await expect(
      inspectTransactionConfirmation(adapter, transactionId, { minimumConfirmations: 2 }),
    ).resolves.toMatchObject({ state: "reorg_pending", blockHeight: 1_000 });
    await expect(
      verifyIdentityContentReadback(adapter, VRSCTEST_CHAIN_ID, VDXF_ID, payload.digest),
    ).resolves.toMatchObject({ state: "verified" });
  });

  it("reports an exact readback mismatch without including payload values in the error surface", async () => {
    const adapter = fakeAdapter();
    await expect(
      verifyIdentityContentReadback(adapter, VRSCTEST_CHAIN_ID, VDXF_ID, "f".repeat(64)),
    ).resolves.toEqual({ state: "mismatch", observedDigests: [] });
  });
});

function fakeAdapter(): FakeVerusRpcAdapter {
  return new FakeVerusRpcAdapter({ vdxfIds: { [VDXF_URI]: VDXF_FIXTURE } });
}

function rpcInfo(): Record<string, unknown> {
  return {
    VRSCversion: PINNED_VERUS_NODE_RELEASE,
    version: MINIMUM_VERUS_NODE_VERSION,
    protocolversion: 170_010,
    chainid: VRSCTEST_CHAIN_ID,
    name: "VRSCTEST",
    blocks: 1_000,
    longestchain: 1_000,
    connections: 4,
    testnet: true,
    errors: "",
  };
}

function rpcBlockchain(): Record<string, unknown> {
  return {
    chain: "test",
    name: "VRSCTEST",
    chainid: VRSCTEST_CHAIN_ID,
    blocks: 1_000,
    headers: 1_000,
    bestblockhash: "d".repeat(64),
    verificationprogress: 1,
    pruned: false,
  };
}

function rpcIdentity(): Record<string, unknown> {
  return {
    version: 3,
    flags: 0,
    primaryaddresses: ["RXKs5Gz8kRqpA52M25AW5FzP3aCNq46yMh"],
    minimumsignatures: 1,
    name: "cbc-synthetic-anchor",
    identityaddress: VRSCTEST_CHAIN_ID,
    parent: "i3UXS5QPRQGNRDDqVnyWTnmFCTHDbzmsYk",
    systemid: VRSCTEST_CHAIN_ID,
    contentmap: {},
    contentmultimap: {},
    revocationauthority: VRSCTEST_CHAIN_ID,
    recoveryauthority: VRSCTEST_CHAIN_ID,
    timelock: 0,
  };
}

function rpcIdentityResult(identity: Record<string, unknown>): Record<string, unknown> {
  return {
    fullyqualifiedname: "cbc-synthetic-anchor@",
    identity,
    status: "active",
    canspendfor: true,
    cansignfor: true,
    blockheight: 900,
    txid: "a".repeat(64),
    vout: 0,
  };
}

function stubFetch(
  resultFor: (method: string, params: JsonValue[]) => Promise<unknown>,
): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: JsonValue[] };
    const result = await resultFor(body.method, body.params);
    return new Response(JSON.stringify({ result, error: null, id: "cbc-test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function stubEnvelopeFetch(envelope: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function abortingFetch(): typeof fetch {
  return ((_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    })) as typeof fetch;
}
