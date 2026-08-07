import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  OutboxRepository,
  Pool,
  RepositoryConflictError,
  VerusJobRepository,
  type CommandContext,
  type OutboxWorkerContext,
} from "@cbc/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL is required for Verus persistence verification");

const pool = new Pool({ connectionString, max: 4 });
const outbox = new OutboxRepository(pool);
const jobs = new VerusJobRepository(pool);
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const identity = syntheticIAddress(`identity-${suffix}`);
const vdxfKey = "i9nwxtKuVYX4MSbeULLiK2ttVi6rUEhh4X";
const start = new Date("2026-08-07T18:00:00.000Z");

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function syntheticIAddress(seed: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = createHash("sha256").update(seed, "utf8").digest();
  return `i${[...bytes].map((value) => alphabet[value % alphabet.length]).join("")}`;
}

function context(key: string, requestDigest: string): CommandContext {
  return {
    actor: {
      type: "synthetic_test_actor",
      reference: `actor_verus_synthetic_${suffix}`,
      authenticationStrength: "synthetic_strong_auth",
    },
    committeeReference: "global_synthetic_scope",
    policyVersionReference: "policy_issue_2_synthetic_fixture_v1",
    softwareVersion: "issue-18-persistence-verification",
    reasonCategory: "synthetic_test",
    correlationId: `correlation_verus_synthetic_${suffix}_${key}`,
    idempotencyKey: `idempotency_verus_synthetic_${suffix}_${key}`,
    requestDigest,
  };
}

function worker(name: string): OutboxWorkerContext {
  return {
    workerReference: `worker_verus_synthetic_${suffix}_${name}`,
    softwareVersion: "issue-18-persistence-verification",
    correlationId: `correlation_verus_worker_${suffix}_${name}`,
  };
}

async function enqueue(key: string, reference: string) {
  const manifest = { kind: "synthetic_anchor", reference };
  const canonical = JSON.stringify(manifest);
  const manifestDigest = digest(canonical);
  const input = {
    externalReference: `anchor_verus_synthetic_${suffix}_${key}`,
    operationType: "synthetic_anchor",
    subjectReference: `subject_verus_synthetic_${suffix}_${key}`,
    targetIdentity: identity,
    vdxfUri: "vrsc::cbc.synthetic.anchor",
    vdxfKey,
    manifest,
    manifestCanonical: canonical,
    manifestDigest,
    manifestPolicyReference: "policy_issue_2_synthetic_fixture_v1",
    manifestAllowedFields: ["kind", "reference"],
    manifestRequiredFields: ["kind", "reference"],
    manifestMaximumBytes: 512,
    confirmationRequirement: 2,
  } as const;
  const command = context(key, manifestDigest);
  const first = await jobs.enqueueAnchor(input, command);
  const replay = await jobs.enqueueAnchor(input, command);
  assert.equal(replay.id, first.id);
  return first;
}

async function verifyPersistencePayloadGuard(): Promise<void> {
  const manifest = { kind: "synthetic_anchor", exactAddress: "prohibited_synthetic_value" };
  const canonical = JSON.stringify(manifest);
  const manifestDigest = digest(canonical);
  await assert.rejects(
    jobs.enqueueAnchor(
      {
        externalReference: `anchor_verus_synthetic_${suffix}_rejected`,
        operationType: "synthetic_anchor",
        subjectReference: `subject_verus_synthetic_${suffix}_rejected`,
        targetIdentity: identity,
        vdxfUri: "vrsc::cbc.synthetic.anchor",
        vdxfKey,
        manifest,
        manifestCanonical: canonical,
        manifestDigest,
        manifestPolicyReference: "policy_issue_2_synthetic_fixture_v1",
        manifestAllowedFields: ["kind", "exactAddress"],
        manifestRequiredFields: ["kind"],
        manifestMaximumBytes: 512,
        confirmationRequirement: 2,
      },
      context("rejected", manifestDigest),
    ),
    RepositoryConflictError,
  );
}

try {
  await verifyPersistencePayloadGuard();
  const first = await enqueue("one", "record_synthetic_one");
  const second = await enqueue("two", "record_synthetic_two");
  const workerA = worker("a");
  const workerB = worker("b");

  const firstClaim = await outbox.claimNext(workerA, start, 1_000, {
    eventTypes: ["verus.anchor.requested"],
    singleWriterByAggregate: true,
  });
  assert(firstClaim);
  assert([first.outboxEventId, second.outboxEventId].includes(firstClaim.id));
  assert.equal(
    await outbox.claimNext(workerB, new Date(start.getTime() + 500), 1_000, {
      eventTypes: ["verus.anchor.requested"],
      singleWriterByAggregate: true,
    }),
    null,
  );

  let record = await jobs.loadForClaim(firstClaim.id, workerA, start);
  record = await jobs.claim(firstClaim.id, workerA, start);
  record = await jobs.beginPreflight(firstClaim.id, workerA, start);
  assert.equal(record.state, "preflight");

  const recovered = await outbox.claimNext(workerB, new Date(start.getTime() + 2_000), 10_000, {
    eventTypes: ["verus.anchor.requested"],
    singleWriterByAggregate: true,
  });
  assert.equal(recovered?.id, firstClaim.id);
  record = await jobs.loadForClaim(firstClaim.id, workerB, new Date(start.getTime() + 2_000));
  assert.equal(record.state, "preflight");

  const transactionId = "a".repeat(64);
  const blockHash = "b".repeat(64);
  record = await jobs.recordSubmission(
    firstClaim.id,
    workerB,
    new Date(start.getTime() + 2_100),
    transactionId,
  );
  record = await jobs.beginConfirmation(firstClaim.id, workerB, new Date(start.getTime() + 2_200));
  record = await jobs.beginReadback(
    firstClaim.id,
    workerB,
    new Date(start.getTime() + 2_300),
    1_000,
    blockHash,
  );
  record = await jobs.verifyReadback(
    firstClaim.id,
    workerB,
    new Date(start.getTime() + 2_400),
    record.manifestDigest,
  );
  await outbox.succeed(firstClaim.id, workerB, new Date(start.getTime() + 2_500));
  assert.equal(record.state, "verified");
  assert.equal(record.readbackDigest, record.manifestDigest);

  const anchor = await pool.query<{
    state: string;
    transaction_id: string;
    block_height: string;
    block_hash: string;
    readback_digest: string;
  }>(
    `SELECT "state", "transaction_id", "block_height", "block_hash", "readback_digest"
     FROM "anchor_record" WHERE "outbox_event_id" = $1`,
    [firstClaim.id],
  );
  assert.deepEqual(anchor.rows[0], {
    state: "verified",
    transaction_id: transactionId,
    block_height: "1000",
    block_hash: blockHash,
    readback_digest: record.manifestDigest,
  });

  const next = await outbox.claimNext(workerB, new Date(start.getTime() + 2_600), 10_000, {
    eventTypes: ["verus.anchor.requested"],
    singleWriterByAggregate: true,
  });
  assert(next);
  assert.notEqual(next.id, firstClaim.id);
  console.log("issue #18 Verus persistence verification passed with synthetic data");
} finally {
  await pool.end();
}
