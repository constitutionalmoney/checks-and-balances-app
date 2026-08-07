import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import {
  OutboxRepository,
  Pool,
  VerusJobRepository,
  type CommandContext,
  type OutboxWorkerContext,
} from "@cbc/db";
import {
  CBC_ANCHOR_MANIFEST_V1_POLICY,
  CBC_VRSCTEST_NAMESPACE,
  HttpVerusRpcAdapter,
  deterministicVerusIdempotencyKey,
  prepareCanonicalPayload,
  verifyIdentityContentReadback,
  type JsonObject,
} from "../packages/verus/dist/index.js";

import { VerusWorkerMetrics } from "../apps/worker/src/verus-metrics.js";
import { VerusAnchorWorker } from "../apps/worker/src/verus-worker.js";

const connectionString = requiredEnvironment("DATABASE_URL");
const rpcUrl = requiredEnvironment("CBC_VERUS_RPC_URL");
const rpcUser = requiredEnvironment("CBC_VERUS_RPC_USER");
const rpcPassword = requiredEnvironment("CBC_VERUS_RPC_PASSWORD");

interface AnchorFixture {
  readonly fixture: string;
  readonly payload: JsonObject;
  readonly expected: { readonly byteLength: number; readonly sha256: string };
  readonly liveEvidence: {
    readonly network: "VRSCTEST";
    readonly transactionId: string;
    readonly blockHeight: number;
    readonly blockHash: string;
    readonly readbackDigest: string;
    readonly status: "verified";
  };
}

const fixture = JSON.parse(
  await readFile("fixtures/verus/cbc-anchor-manifest.v1.fixture.json", "utf8"),
) as AnchorFixture;
if (process.env.CBC_VERUS_LIVE_FIXTURE_WRITE_APPROVED !== fixture.expected.sha256) {
  throw new Error("CBC_VERUS_LIVE_FIXTURE_WRITE_APPROVED must equal the approved fixture digest");
}

const prepared = prepareCanonicalPayload(fixture.payload, CBC_ANCHOR_MANIFEST_V1_POLICY);
assert.equal(prepared.digest, fixture.expected.sha256);
assert.equal(prepared.bytes.byteLength, fixture.expected.byteLength);

const schemaKey = CBC_VRSCTEST_NAMESPACE.keys.anchorSchema;
const pool = new Pool({ connectionString, max: 4 });
const outbox = new OutboxRepository(pool);
const jobs = new VerusJobRepository(pool);
const baseAdapter = new HttpVerusRpcAdapter({
  url: rpcUrl,
  username: rpcUser,
  password: rpcPassword,
  timeoutMs: 10_000,
  writeTimeoutMs: 120_000,
});
const rpcCalls: string[] = [];
const adapter = new Proxy(baseAdapter, {
  get(target, property) {
    const value = Reflect.get(target, property, target) as unknown;
    if (typeof value !== "function") return value;
    return (...arguments_: unknown[]) => {
      rpcCalls.push(String(property));
      return Reflect.apply(value, target, arguments_);
    };
  },
});
const workerContext: OutboxWorkerContext = {
  workerReference: "worker_vrsctest_fixture_live_v1",
  softwareVersion: "issue-18-live-fixture-v1",
  correlationId: "correlation_vrsctest_fixture_live_v1",
};
const commandContext: CommandContext = {
  actor: {
    type: "repository_fixture_operator",
    reference: "operator_vrsctest_fixture_live_v1",
    authenticationStrength: "local_wallet_and_private_rpc",
  },
  committeeReference: "global_synthetic_scope",
  policyVersionReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
  softwareVersion: "issue-18-live-fixture-v1",
  reasonCategory: "approved_schema_anchor_fixture",
  correlationId: "correlation_vrsctest_fixture_live_v1",
  idempotencyKey: deterministicVerusIdempotencyKey({
    operationType: "schema_anchor",
    subjectReference: "public_schema_cbc_human_attestation_v1",
    vdxfKey: schemaKey.vdxfId,
    manifestDigest: prepared.digest,
  }),
  requestDigest: prepared.digest,
};

try {
  const job = await jobs.enqueueAnchor(
    {
      externalReference: "anchor_vrsctest_schema_fixture_v1",
      operationType: "schema_anchor",
      subjectReference: "public_schema_cbc_human_attestation_v1",
      targetIdentity: CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
      vdxfUri: schemaKey.uri,
      vdxfKey: schemaKey.vdxfId,
      manifest: fixture.payload,
      manifestCanonical: new TextDecoder().decode(prepared.bytes),
      manifestDigest: prepared.digest,
      manifestPolicyReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
      manifestAllowedFields: CBC_ANCHOR_MANIFEST_V1_POLICY.allowedTopLevelFields,
      manifestRequiredFields: CBC_ANCHOR_MANIFEST_V1_POLICY.requiredTopLevelFields,
      manifestMaximumBytes: CBC_ANCHOR_MANIFEST_V1_POLICY.maximumBytes,
      confirmationRequirement: 1,
    },
    commandContext,
  );

  const metrics = new VerusWorkerMetrics();
  const processor = new VerusAnchorWorker({
    outbox,
    jobs,
    adapter,
    metrics,
    approvedWriteTargets: [
      {
        operationType: "schema_anchor",
        targetIdentity: CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
        vdxfUri: schemaKey.uri,
        vdxfKey: schemaKey.vdxfId,
        manifestPolicyReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
      },
    ],
    worker: workerContext,
    writeCapabilityEnabled: true,
    leaseDurationMs: 60_000,
    retry: { maxAttempts: 120, baseBackoffMs: 2_000, maxBackoffMs: 10_000 },
  });
  const deadline = Date.now() + 30 * 60_000;
  let observedCalls = rpcCalls.length;
  let outcome = job.state === "verified" ? "verified" : await processor.processNext();
  while (outcome !== "verified") {
    if (process.env.CBC_VERUS_LIVE_DIAGNOSTICS === "true") {
      console.warn(
        JSON.stringify({ outcome, rpcCalls: rpcCalls.slice(observedCalls), privacySafe: true }),
      );
    }
    observedCalls = rpcCalls.length;
    if (outcome === "terminal_failed" || outcome === "dead_letter") {
      throw new Error(`Live VRSCTEST worker stopped with ${outcome}`);
    }
    if (outcome === "idle") {
      const persisted = await pool.query<{ state: string }>(
        `SELECT "state" FROM "verus_job" WHERE "id" = $1`,
        [job.id],
      );
      if (persisted.rows[0]?.state === "verified") {
        outcome = "verified";
        break;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error("Live VRSCTEST worker did not verify the fixture within 30 minutes");
    }
    await delay(2_000);
    outcome = await processor.processNext();
  }

  const readback = await verifyIdentityContentReadback(
    adapter,
    CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
    schemaKey.vdxfId,
    prepared.digest,
  );
  assert.equal(readback.state, "verified");
  const evidence = await pool.query<{
    state: string;
    transaction_id: string;
    block_height: string;
    block_hash: string;
    readback_digest: string;
  }>(
    `SELECT "state", "transaction_id", "block_height", "block_hash", "readback_digest"
     FROM "anchor_record" WHERE "outbox_event_id" = $1`,
    [job.outboxEventId],
  );
  const row = evidence.rows[0];
  assert(row);
  assert.equal(row.state, "verified");
  assert.equal(row.readback_digest, prepared.digest);
  assert.equal(row.transaction_id, fixture.liveEvidence.transactionId);
  assert.equal(Number(row.block_height), fixture.liveEvidence.blockHeight);
  assert.equal(row.block_hash, fixture.liveEvidence.blockHash);
  assert.equal(row.readback_digest, fixture.liveEvidence.readbackDigest);
  console.warn(
    JSON.stringify({
      fixture: fixture.fixture,
      state: row.state,
      transactionId: row.transaction_id,
      blockHeight: Number(row.block_height),
      blockHash: row.block_hash,
      readbackDigest: row.readback_digest,
      metricsPrivacySafe: !metrics.render().includes(CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress),
    }),
  );
} finally {
  await pool.end();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
