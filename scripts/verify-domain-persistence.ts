import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  AttestationRepository,
  LifecycleRepository,
  OutboxRepository,
  Pool,
  RepositoryConflictError,
  TenantBoundaryError,
  VerificationRepository,
  type CommandContext,
  type OutboxWorkerContext,
} from "@cbc/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for persistence verification");

const pool = new Pool({ connectionString, max: 8 });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ids = {
  jurisdiction1: randomUUID(),
  jurisdiction2: randomUUID(),
  committee1: randomUUID(),
  committee2: randomUUID(),
  participant: randomUUID(),
  authAccount: randomUUID(),
  revocationParticipant: randomUUID(),
  policyDocument: randomUUID(),
  policyVersion: randomUUID(),
  member: randomUUID(),
  role: randomUUID(),
  memberRole: randomUUID(),
  readiness: randomUUID(),
};
const refs = {
  committee1: `committee_synthetic_${suffix}_one`,
  committee2: `committee_synthetic_${suffix}_two`,
  participant: `participant_synthetic_${suffix}`,
  revocationParticipant: `participant_synthetic_revoke_${suffix}`,
  member: `member_synthetic_${suffix}`,
  policy: `policy_synthetic_${suffix}_v1`,
  request: `request_synthetic_${suffix}`,
  rollbackRequest: `request_synthetic_rollback_${suffix}`,
  decision: `decision_synthetic_${suffix}`,
  attestation: `attestation_synthetic_${suffix}`,
  revocationRequest: `request_synthetic_revoke_${suffix}`,
  revocationAttestation: `attestation_synthetic_revoke_${suffix}`,
};

const hash = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

function context(key: string, committeeReference = refs.committee1): CommandContext {
  return {
    actor: {
      type: "synthetic_test_actor",
      reference: `actor_synthetic_${suffix}`,
      authenticationStrength: "synthetic_strong_auth",
    },
    committeeReference,
    policyVersionReference: refs.policy,
    softwareVersion: "issue-16-persistence-verification",
    reasonCategory: "synthetic_test",
    correlationId: `correlation_synthetic_${suffix}_${key}`,
    idempotencyKey: `idempotency_synthetic_${suffix}_${key}`,
    requestDigest: hash(`request_synthetic_${suffix}_${key}`),
  };
}

async function expectRejects(
  action: () => Promise<unknown>,
  errorType: new (...args: never[]) => Error,
): Promise<void> {
  await assert.rejects(action, errorType);
}

async function seedSyntheticFoundation(): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO "jurisdiction" ("id","external_reference","kind","display_name")
       VALUES ($1,$2,'synthetic_test_area','Synthetic Jurisdiction One'),
              ($3,$4,'synthetic_test_area','Synthetic Jurisdiction Two')`,
      [
        ids.jurisdiction1,
        `jurisdiction_synthetic_${suffix}_one`,
        ids.jurisdiction2,
        `jurisdiction_synthetic_${suffix}_two`,
      ],
    );
    await pool.query(
      `INSERT INTO "committee" (
        "id","external_reference","slug","display_name","jurisdiction_id","updated_at"
       ) VALUES ($1,$2,$3,'Synthetic Committee One',$4,CURRENT_TIMESTAMP),
                ($5,$6,$7,'Synthetic Committee Two',$8,CURRENT_TIMESTAMP)`,
      [
        ids.committee1,
        refs.committee1,
        `synthetic-${suffix}-one`,
        ids.jurisdiction1,
        ids.committee2,
        refs.committee2,
        `synthetic-${suffix}-two`,
        ids.jurisdiction2,
      ],
    );
    await pool.query(
      `INSERT INTO "participant_account" ("id","external_reference","updated_at")
       VALUES ($1,$2,CURRENT_TIMESTAMP),($3,$4,CURRENT_TIMESTAMP)`,
      [ids.participant, refs.participant, ids.revocationParticipant, refs.revocationParticipant],
    );
    await pool.query(
      `INSERT INTO "auth_account" (
        "id","external_reference","trust_domain","state","participant_id","updated_at"
       ) VALUES ($1,$2,'participant','active',$3,CURRENT_TIMESTAMP)`,
      [ids.authAccount, `auth_synthetic_${suffix}`, ids.participant],
    );
    await pool.query(
      `INSERT INTO "policy_document" ("id","policy_key","title")
       VALUES ($1,$2,'Synthetic Issue 16 Policy')`,
      [ids.policyDocument, `cbc.synthetic.${suffix}`],
    );
    await pool.query(
      `INSERT INTO "policy_version" (
        "id","policy_document_id","version","state","content_digest","content_reference","effective_at"
       ) VALUES ($1,$2,'synthetic-v1','approved',$3,$4,CURRENT_TIMESTAMP)`,
      [ids.policyVersion, ids.policyDocument, hash(`policy-${suffix}`), refs.policy],
    );
    await pool.query(
      `INSERT INTO "committee_member" (
        "id","external_reference","committee_id","participant_id","actor_reference","state","updated_at"
       ) VALUES ($1,$2,$3,$4,$5,'active',CURRENT_TIMESTAMP)`,
      [ids.member, refs.member, ids.committee1, ids.participant, `actor_synthetic_${suffix}`],
    );
    await pool.query(
      `INSERT INTO "committee_role" (
        "id","external_reference","committee_id","role_key","policy_version_id","state"
       ) VALUES ($1,$2,$3,'synthetic_reviewer',$4,'active')`,
      [ids.role, `role_synthetic_${suffix}`, ids.committee1, ids.policyVersion],
    );
    await pool.query(
      `INSERT INTO "committee_member_role" (
        "id","committee_id","member_id","role_id","state","granted_at"
       ) VALUES ($1,$2,$3,$4,'active',CURRENT_TIMESTAMP)`,
      [ids.memberRole, ids.committee1, ids.member, ids.role],
    );
    await pool.query(
      `INSERT INTO "readiness_checklist_item" (
        "id","external_reference","committee_id","item_key","policy_version_id","state"
       ) VALUES ($1,$2,$3,'synthetic_persistence_ready',$4,'satisfied')`,
      [ids.readiness, `readiness_synthetic_${suffix}`, ids.committee1, ids.policyVersion],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function verifyLifecycleAndConcurrency(): Promise<void> {
  const verification = new VerificationRepository(pool);
  const createInput = {
    id: randomUUID(),
    externalReference: refs.request,
    participantReference: refs.participant,
    policyVersionId: ids.policyVersion,
    context: context("create_request"),
  };
  const duplicates = await Promise.all([
    verification.createRequest(createInput),
    verification.createRequest(createInput),
  ]);
  assert.deepEqual(
    duplicates.map(({ replayed }) => replayed).sort(),
    [false, true],
    "concurrent duplicate request must execute exactly once",
  );

  await expectRejects(
    () =>
      verification.schedule({
        requestReference: refs.request,
        expectedVersion: 1,
        context: context("wrong_tenant", refs.committee2),
      }),
    TenantBoundaryError,
  );

  const concurrent = await Promise.allSettled([
    verification.schedule({
      requestReference: refs.request,
      expectedVersion: 1,
      context: context("schedule_a"),
    }),
    verification.schedule({
      requestReference: refs.request,
      expectedVersion: 1,
      context: context("schedule_b"),
    }),
  ]);
  assert.equal(concurrent.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(({ status }) => status === "rejected").length, 1);

  await verification.checkIn({
    requestReference: refs.request,
    expectedVersion: 2,
    context: context("check_in"),
  });
  const lateCreateReplay = await verification.createRequest(createInput);
  assert.deepEqual(
    {
      state: lateCreateReplay.state,
      version: lateCreateReplay.version,
      replayed: lateCreateReplay.replayed,
    },
    { state: "requested", version: 1, replayed: true },
    "late idempotency replay must return the original command result snapshot",
  );
  await verification.beginReview({
    requestReference: refs.request,
    expectedVersion: 3,
    context: context("begin_review"),
  });

  const authorization = {
    actorReference: `actor_synthetic_${suffix}`,
    actorCommitteeReference: refs.committee1,
    targetCommitteeReference: refs.committee1,
    authorized: true,
    conflicted: false,
    policyVersionReference: refs.policy,
  } as const;
  await expectRejects(
    () =>
      verification.recordReviewDecision({
        externalReference: `decision_synthetic_unauthorized_${suffix}`,
        requestReference: refs.request,
        reviewerMemberReference: refs.member,
        policyVersionId: ids.policyVersion,
        decision: "approved",
        authorization: { ...authorization, authorized: false },
        context: context("unauthorized_decision"),
      }),
    Error,
  );
  await expectRejects(
    () =>
      verification.recordReviewDecision({
        externalReference: `decision_synthetic_wrong_actor_${suffix}`,
        requestReference: refs.request,
        reviewerMemberReference: refs.member,
        policyVersionId: ids.policyVersion,
        decision: "approved",
        authorization: {
          ...authorization,
          actorReference: `actor_synthetic_wrong_${suffix}`,
        },
        context: context("wrong_actor_decision"),
      }),
    RepositoryConflictError,
  );

  const conflictId = randomUUID();
  await pool.query(
    `INSERT INTO "conflict_declaration" (
      "id","committee_id","member_id","target_type","target_reference","reason_category","declared_at"
     ) VALUES ($1,$2,$3,'verification_request',$4,'synthetic_conflict',CURRENT_TIMESTAMP)`,
    [conflictId, ids.committee1, ids.member, refs.request],
  );
  await expectRejects(
    () =>
      verification.recordReviewDecision({
        externalReference: `decision_synthetic_conflicted_${suffix}`,
        requestReference: refs.request,
        reviewerMemberReference: refs.member,
        policyVersionId: ids.policyVersion,
        decision: "approved",
        authorization,
        context: context("conflicted_decision"),
      }),
    RepositoryConflictError,
  );
  await pool.query(
    'UPDATE "conflict_declaration" SET "resolved_at" = CURRENT_TIMESTAMP WHERE "id" = $1',
    [conflictId],
  );
  const decisionInput = {
    id: randomUUID(),
    externalReference: refs.decision,
    requestReference: refs.request,
    reviewerMemberReference: refs.member,
    policyVersionId: ids.policyVersion,
    decision: "approved",
    authorization,
    context: context("approved_decision"),
  } as const;
  const duplicateDecisions = await Promise.all([
    verification.recordReviewDecision(decisionInput),
    verification.recordReviewDecision(decisionInput),
  ]);
  assert.deepEqual(
    duplicateDecisions.map(({ replayed }) => replayed).sort(),
    [false, true],
    "concurrent duplicate decision must execute exactly once",
  );
  await verification.approve({
    requestReference: refs.request,
    expectedVersion: 4,
    context: context("approve"),
  });
  await verification.requestIssuance({
    requestReference: refs.request,
    expectedVersion: 5,
    context: context("request_issuance"),
  });
  await verification.recordIssuance({
    requestReference: refs.request,
    expectedVersion: 6,
    context: context("record_issuance"),
  });

  const attestations = new AttestationRepository(pool);
  const validFrom = new Date("2030-01-01T00:00:00.000Z");
  const expiresAt = new Date("2030-02-15T00:00:00.000Z");
  const issueInput = {
    id: randomUUID(),
    externalReference: refs.attestation,
    requestReference: refs.request,
    policyVersionId: ids.policyVersion,
    validFrom,
    expiresAt,
    context: context("issue_attestation"),
  };
  const duplicateIssuance = await Promise.all([
    attestations.issue(issueInput),
    attestations.issue(issueInput),
  ]);
  assert.deepEqual(
    duplicateIssuance.map(({ replayed }) => replayed).sort(),
    [false, true],
    "concurrent duplicate issuance must execute exactly once",
  );
  const issued = duplicateIssuance[0]!;
  assert.equal(issued.state, "issued");
  const active = await attestations.activate({
    attestationReference: refs.attestation,
    expectedStatusVersion: 1,
    observedAt: validFrom,
    context: context("activate_attestation"),
  });
  assert.equal(active.state, "active");
  assert.equal(
    await attestations.statusAt(
      refs.committee1,
      refs.attestation,
      new Date(expiresAt.getTime() - 1),
    ),
    "active",
  );
  assert.equal(
    await attestations.statusAt(refs.committee1, refs.attestation, expiresAt),
    "expired",
  );
  const expired = await attestations.expire({
    attestationReference: refs.attestation,
    expectedStatusVersion: 2,
    observedAt: expiresAt,
    context: context("expire_attestation"),
  });
  assert.equal(expired.state, "expired");
  const lateIssueReplay = await attestations.issue(issueInput);
  assert.deepEqual(
    {
      state: lateIssueReplay.state,
      statusVersion: lateIssueReplay.statusVersion,
      replayed: lateIssueReplay.replayed,
    },
    { state: "issued", statusVersion: 1, replayed: true },
    "attestation replay must retain the original issued snapshot after expiry",
  );

  await verification.createRequest({
    id: randomUUID(),
    externalReference: refs.revocationRequest,
    participantReference: refs.revocationParticipant,
    policyVersionId: ids.policyVersion,
    context: context("create_revocation_request"),
  });
  await verification.schedule({
    requestReference: refs.revocationRequest,
    expectedVersion: 1,
    context: context("schedule_revocation_request"),
  });
  await verification.checkIn({
    requestReference: refs.revocationRequest,
    expectedVersion: 2,
    context: context("check_in_revocation_request"),
  });
  await verification.beginReview({
    requestReference: refs.revocationRequest,
    expectedVersion: 3,
    context: context("review_revocation_request"),
  });
  await verification.approve({
    requestReference: refs.revocationRequest,
    expectedVersion: 4,
    context: context("approve_revocation_request"),
  });
  await verification.requestIssuance({
    requestReference: refs.revocationRequest,
    expectedVersion: 5,
    context: context("queue_revocation_issuance"),
  });
  await verification.recordIssuance({
    requestReference: refs.revocationRequest,
    expectedVersion: 6,
    context: context("record_revocation_issuance"),
  });
  await attestations.issue({
    id: randomUUID(),
    externalReference: refs.revocationAttestation,
    requestReference: refs.revocationRequest,
    policyVersionId: ids.policyVersion,
    validFrom,
    expiresAt,
    context: context("issue_revocation_attestation"),
  });
  await attestations.activate({
    attestationReference: refs.revocationAttestation,
    expectedStatusVersion: 1,
    observedAt: validFrom,
    context: context("activate_revocation_attestation"),
  });
  const revokeInput = {
    revocationId: randomUUID(),
    attestationReference: refs.revocationAttestation,
    expectedStatusVersion: 2,
    observedAt: new Date("2030-01-02T00:00:00.000Z"),
    policyVersionId: ids.policyVersion,
    context: context("revoke_attestation"),
  };
  const duplicateRevocations = await Promise.all([
    attestations.revoke(revokeInput),
    attestations.revoke(revokeInput),
  ]);
  assert.deepEqual(
    duplicateRevocations.map(({ replayed }) => replayed).sort(),
    [false, true],
    "concurrent duplicate revocation must execute exactly once",
  );
}

async function verifySupportingLifecycleRepositories(): Promise<void> {
  const lifecycles = new LifecycleRepository(pool);
  const committeeInput = {
    externalReference: refs.committee1,
    expectedVersion: 1,
    observedAt: new Date("2029-01-01T00:00:00.000Z"),
    context: context("committee_formation"),
  };
  const committee = await lifecycles.transitionCommittee("beginCommitteeFormation", committeeInput);
  assert.equal(committee.state, "forming");
  await lifecycles.transitionCommittee("beginCommitteePolicyReview", {
    externalReference: refs.committee1,
    expectedVersion: 2,
    observedAt: new Date("2029-01-02T00:00:00.000Z"),
    context: context("committee_policy_review"),
  });
  const committeeReplay = await lifecycles.transitionCommittee(
    "beginCommitteeFormation",
    committeeInput,
  );
  assert.deepEqual(
    {
      state: committeeReplay.state,
      version: committeeReplay.version,
      replayed: committeeReplay.replayed,
    },
    { state: "forming", version: 2, replayed: true },
    "supporting lifecycle replay must retain the original transition snapshot",
  );

  const walletReference = `wallet_challenge_synthetic_${suffix}`;
  await pool.query(
    `INSERT INTO "wallet_challenge" (
      "id","external_reference","participant_id","nonce_hash","audience","request_digest","expires_at"
     ) VALUES ($1,$2,$3,$4,'synthetic_wallet_audience',$5,$6)`,
    [
      randomUUID(),
      walletReference,
      ids.participant,
      hash(`nonce-${suffix}`),
      hash(`wallet-request-${suffix}`),
      new Date("2030-01-02T00:00:00.000Z"),
    ],
  );
  const walletContext = (key: string, version: number) => ({
    externalReference: walletReference,
    expectedVersion: version,
    observedAt: new Date("2030-01-01T00:00:00.000Z"),
    context: context(`wallet_${key}`, "global_synthetic_scope"),
  });
  await lifecycles.transitionWalletChallenge("presentWalletChallenge", walletContext("present", 1));
  await lifecycles.transitionWalletChallenge("recordWalletResponse", walletContext("response", 2));
  const consumed = await lifecycles.transitionWalletChallenge(
    "consumeWalletChallenge",
    walletContext("consume", 3),
  );
  assert.equal(consumed.state, "consumed");

  const consentReference = `consent_synthetic_${suffix}`;
  await pool.query(
    `INSERT INTO "consent_receipt" (
      "id","external_reference","participant_id","auth_account_id","committee_id","policy_version_id",
      "purpose","presentation_reference","presentation_digest","action","state",
      "acknowledged_at","presented_at","acted_at"
     ) VALUES ($1,$2,$3,$4,$5,$6,'synthetic_lifecycle_test',$7,$8,'accepted','pending',NULL,$9,$9)`,
    [
      randomUUID(),
      consentReference,
      ids.participant,
      ids.authAccount,
      ids.committee1,
      ids.policyVersion,
      `presentation_synthetic_${suffix}`,
      hash(`presentation-${suffix}`),
      new Date("2030-01-01T00:00:00.000Z"),
    ],
  );
  await lifecycles.transitionConsent("acknowledgeConsent", {
    externalReference: consentReference,
    expectedVersion: 1,
    observedAt: new Date("2030-01-01T00:00:00.000Z"),
    context: context("consent_acknowledge"),
  });
  const withdrawn = await lifecycles.transitionConsent("withdrawConsent", {
    externalReference: consentReference,
    expectedVersion: 2,
    observedAt: new Date("2030-01-02T00:00:00.000Z"),
    context: context("consent_withdraw"),
  });
  assert.equal(withdrawn.state, "withdrawn");
}

async function verifyAtomicRollback(): Promise<void> {
  const verification = new VerificationRepository(pool);
  await verification.createRequest({
    id: randomUUID(),
    externalReference: refs.rollbackRequest,
    participantReference: refs.participant,
    policyVersionId: ids.policyVersion,
    context: context("create_rollback_request"),
  });
  const failingContext = context("rollback_schedule");
  const collision = hash(`${refs.committee1}|${failingContext.idempotencyKey}|scheduleRequest`);
  await pool.query(
    `INSERT INTO "outbox_event" (
      "id","committee_id","event_type","aggregate_type","aggregate_reference",
      "schema_version","payload_reference","payload_digest","idempotency_key_hash"
     ) VALUES ($1,$2,'SyntheticCollision','synthetic_test',$3,'issue-16-v1',$4,$5,$6)`,
    [
      randomUUID(),
      ids.committee1,
      `collision_synthetic_${suffix}`,
      `opaque:collision:${suffix}`,
      hash(`collision-${suffix}`),
      collision,
    ],
  );
  await assert.rejects(() =>
    verification.schedule({
      requestReference: refs.rollbackRequest,
      expectedVersion: 1,
      context: failingContext,
    }),
  );
  const state = await pool.query<{ state: string; version: number }>(
    'SELECT "state", "version" FROM "verification_request" WHERE "external_reference" = $1',
    [refs.rollbackRequest],
  );
  assert.deepEqual(state.rows[0], { state: "requested", version: 1 });
  const audit = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS "count" FROM "audit_event"
     WHERE "target_reference" = $1 AND "command" = 'scheduleRequest'`,
    [refs.rollbackRequest],
  );
  assert.equal(audit.rows[0]!.count, "0");
}

async function verifyCrashSafeOutbox(): Promise<void> {
  const outbox = new OutboxRepository(pool);
  const workerA: OutboxWorkerContext = {
    workerReference: `worker_synthetic_${suffix}_a`,
    softwareVersion: "issue-16-persistence-verification",
    correlationId: `correlation_synthetic_${suffix}_worker_a`,
  };
  const workerB: OutboxWorkerContext = {
    workerReference: `worker_synthetic_${suffix}_b`,
    softwareVersion: "issue-16-persistence-verification",
    correlationId: `correlation_synthetic_${suffix}_worker_b`,
  };
  const start = new Date("2031-01-01T00:00:00.000Z");
  const first = await outbox.claimNext(workerA, start, 1_000);
  assert(first);
  const recovered = await outbox.claimNext(workerB, new Date(start.getTime() + 2_000), 10_000);
  assert.equal(recovered?.id, first.id);
  assert.equal(recovered?.attempt, 2);
  await expectRejects(
    () => outbox.succeed(first.id, workerA, new Date(start.getTime() + 2_100)),
    RepositoryConflictError,
  );
  await outbox.succeed(first.id, workerB, new Date(start.getTime() + 2_100));

  const second = await outbox.claimNext(workerB, new Date(start.getTime() + 3_000), 10_000);
  assert(second);
  await pool.query(
    `UPDATE "outbox_event" SET "available_at" = $1
     WHERE "id" <> $2 AND "state" = 'pending'`,
    [new Date("2032-01-01T00:00:00.000Z"), second.id],
  );
  assert.equal(
    await outbox.failRetryable(second.id, workerB, new Date(start.getTime() + 3_100), {
      errorClass: "synthetic_transient",
      maxAttempts: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 1_000,
    }),
    "retryable_failed",
  );
  const retried = await outbox.claimNext(workerB, new Date(start.getTime() + 3_300), 10_000);
  assert.equal(retried?.id, second.id);
  assert.equal(
    await outbox.failRetryable(second.id, workerB, new Date(start.getTime() + 3_400), {
      errorClass: "synthetic_transient",
      maxAttempts: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 1_000,
    }),
    "dead_letter",
  );

  const attempts = await pool.query<{ attempt: number; error_class: string | null }>(
    `SELECT "attempt", "error_class" FROM "outbox_attempt"
     WHERE "outbox_event_id" = $1 ORDER BY "attempt"`,
    [first.id],
  );
  assert.deepEqual(
    attempts.rows.map(({ attempt, error_class }) => [attempt, error_class]),
    [
      [1, "lease_expired"],
      [2, null],
    ],
  );
  await assert.rejects(() =>
    pool.query('UPDATE "outbox_attempt" SET "worker" = $1 WHERE "outbox_event_id" = $2', [
      `worker_synthetic_${suffix}_tamper`,
      first.id,
    ]),
  );
}

async function verifyAuditChain(): Promise<void> {
  const events = await pool.query<{ previous_hash: string | null; event_hash: string }>(
    `SELECT "previous_hash", "event_hash" FROM "audit_event"
     WHERE "chain_key" = $1 ORDER BY "sequence"`,
    [`committee:${refs.committee1}`],
  );
  assert(events.rowCount && events.rowCount > 5);
  let previous: string | null = null;
  for (const event of events.rows) {
    assert.equal(event.previous_hash, previous);
    assert.match(event.event_hash, /^[a-f0-9]{64}$/);
    previous = event.event_hash;
  }
}

try {
  await seedSyntheticFoundation();
  await verifySupportingLifecycleRepositories();
  await verifyLifecycleAndConcurrency();
  await verifyAtomicRollback();
  await verifyCrashSafeOutbox();
  await verifyAuditChain();
  console.log("issue #16 domain persistence verification passed with synthetic data");
} finally {
  await pool.end();
}
