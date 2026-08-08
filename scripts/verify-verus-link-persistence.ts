import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  Pool,
  RepositoryConflictError,
  VerusLinkRepository,
  type CommandContext,
  type CreateWalletLinkChallengeInput,
} from "@cbc/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Verus-link persistence verification");
}

const pool = new Pool({ connectionString, max: 6 });
const links = new VerusLinkRepository(pool);
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const participantId = randomUUID();
const accountId = randomUUID();
const refs = {
  participant: `participant_verus_link_synthetic_${suffix}`,
  account: `auth_verus_link_synthetic_${suffix}`,
};
const startedAt = new Date("2032-01-01T00:00:00.000Z");
const identityAddress = `iSyntheticVerusIdentity${suffix}`;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function context(key: string, requestDigest: string): CommandContext {
  return {
    actor: {
      type: "auth_account",
      reference: refs.account,
      authenticationStrength: "synthetic_passkey",
    },
    committeeReference: "global_wallet_linking",
    policyVersionReference: "cbc-wallet-link-policy-v1",
    softwareVersion: "issue-19-persistence-verification",
    reasonCategory: "synthetic_wallet_link_test",
    correlationId: `correlation_wallet_link_${suffix}_${key}`,
    idempotencyKey: `idempotency_wallet_link_${suffix}_${key}`,
    requestDigest,
  };
}

function challenge(key: string, purpose = "link_verusid"): CreateWalletLinkChallengeInput {
  const requestDigest = digest(`request-${suffix}-${key}`);
  return {
    externalReference: `wallet_challenge_synthetic_${suffix}_${key}`,
    accountReference: refs.account,
    trustDomain: "participant",
    purpose: purpose === "revalidate_verusid" ? "revalidate_verusid" : "link_verusid",
    network: "VRSCTEST",
    nonceHash: digest(`nonce-${suffix}-${key}`),
    requestId: `iSyntheticRequest${suffix}${key}`,
    requestDigest,
    pollingTokenDigest: digest(`polling-${suffix}-${key}`),
    audience: "cbc-participant-app",
    callbackUrl: "https://auth.checksandbalances.services/verusidlogin",
    applicationIdentityAddress: `iSyntheticApplication${suffix}`,
    consentedScopes: ["verusid:link"],
    issuedAt: startedAt,
    expiresAt: new Date(startedAt.getTime() + 5 * 60_000),
  };
}

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO "participant_account" ("id", "external_reference", "updated_at")
     VALUES ($1, $2, $3)`,
    [participantId, refs.participant, startedAt],
  );
  await pool.query(
    `INSERT INTO "auth_account" (
      "id", "external_reference", "trust_domain", "state", "participant_id", "updated_at"
     ) VALUES ($1, $2, 'participant', 'active', $3, $4)`,
    [accountId, refs.account, participantId, startedAt],
  );
}

async function verifyAtomicConsumption(): Promise<string> {
  const input = challenge("atomic");
  await links.createChallenge(input, context("create_atomic", input.requestDigest));

  await assert.rejects(
    links.pollChallenge(
      `auth_wrong_account_${suffix}`,
      input.pollingTokenDigest,
      startedAt,
      context("cross_account_poll", input.requestDigest),
    ),
    RepositoryConflictError,
  );

  const completion = {
    requestId: input.requestId,
    responseDigest: digest(`response-${suffix}-atomic`),
    identityAddress,
    displayNameSnapshot: "synthetic-link@",
    proofDigest: digest(`proof-${suffix}-atomic`),
    proofMethod: "hosted_verusid_login_consent_v1" as const,
    requestSignerIdentity: input.applicationIdentityAddress,
    observedIdentityStatus: "active",
    observedIdentityBlockHeight: 1234,
    observedIdentityTxid: digest(`identity-tx-${suffix}`),
    completedAt: new Date(startedAt.getTime() + 30_000),
  };
  const results = await Promise.all([
    links.completeChallenge(completion, context("complete_atomic_a", completion.responseDigest)),
    links.completeChallenge(completion, context("complete_atomic_b", completion.responseDigest)),
  ]);
  assert.deepEqual(results.map((result) => result.kind === "completed" && result.replayed).sort(), [
    false,
    true,
  ]);
  const first = results[0];
  assert.equal(first.kind, "completed");
  const linkReference = first.kind === "completed" ? first.linkReference : "";

  await assert.rejects(
    links.completeChallenge(
      { ...completion, responseDigest: digest(`different-response-${suffix}`) },
      context("substitution", completion.responseDigest),
    ),
    RepositoryConflictError,
  );

  const persisted = await pool.query<{
    challenge_count: string;
    link_count: string;
    state: string;
    proof_digest: string;
  }>(
    `SELECT
      (SELECT count(*) FROM "wallet_challenge" WHERE "request_id" = $1) AS "challenge_count",
      (SELECT count(*) FROM "verus_identity_link"
       WHERE "auth_account_id" = $2 AND "identity_address" = $3) AS "link_count",
      vl."state", vl."proof_digest"
     FROM "verus_identity_link" vl
     WHERE vl."auth_account_id" = $2 AND vl."identity_address" = $3`,
    [input.requestId, accountId, identityAddress],
  );
  assert.deepEqual(persisted.rows[0], {
    challenge_count: "1",
    link_count: "1",
    state: "active",
    proof_digest: completion.proofDigest,
  });
  return linkReference;
}

async function verifyLifecycle(linkReference: string): Promise<void> {
  assert.equal(
    await links.requireRevalidation(
      identityAddress,
      "identity_revision_changed",
      new Date(startedAt.getTime() + 60_000),
      context("require_revalidation", digest(identityAddress)),
    ),
    1,
  );

  const revalidation = challenge("revalidate", "revalidate_verusid");
  await links.createChallenge(
    revalidation,
    context("create_revalidation", revalidation.requestDigest),
  );
  const revalidated = await links.completeChallenge(
    {
      requestId: revalidation.requestId,
      responseDigest: digest(`response-${suffix}-revalidate`),
      identityAddress,
      proofDigest: digest(`proof-${suffix}-revalidate`),
      proofMethod: "hosted_verusid_login_consent_v1",
      requestSignerIdentity: revalidation.applicationIdentityAddress,
      observedIdentityStatus: "active",
      observedIdentityBlockHeight: 1240,
      observedIdentityTxid: digest(`identity-tx-revalidated-${suffix}`),
      completedAt: new Date(startedAt.getTime() + 90_000),
    },
    context("complete_revalidation", revalidation.requestDigest),
  );
  assert.equal(revalidated.kind, "completed");

  await links.unlink(
    refs.account,
    linkReference,
    new Date(startedAt.getTime() + 120_000),
    context("unlink", digest(linkReference)),
  );
  const state = await pool.query<{ state: string; unlinked_at: Date | null }>(
    `SELECT "state", "unlinked_at" FROM "verus_identity_link"
     WHERE "external_reference" = $1`,
    [linkReference],
  );
  assert.equal(state.rows[0]?.state, "unlinked");
  assert(state.rows[0]?.unlinked_at);
}

async function verifyExpiry(): Promise<void> {
  const input = challenge("expired");
  await links.createChallenge(input, context("create_expired", input.requestDigest));
  const result = await links.completeChallenge(
    {
      requestId: input.requestId,
      responseDigest: digest(`response-${suffix}-expired`),
      identityAddress,
      proofDigest: digest(`proof-${suffix}-expired`),
      proofMethod: "hosted_verusid_login_consent_v1",
      requestSignerIdentity: input.applicationIdentityAddress,
      observedIdentityStatus: "active",
      observedIdentityBlockHeight: 1250,
      observedIdentityTxid: digest(`identity-tx-expired-${suffix}`),
      completedAt: input.expiresAt,
    },
    context("complete_expired", input.requestDigest),
  );
  assert.deepEqual(result, { kind: "expired" });
}

async function verifyCancellation(): Promise<void> {
  const input = challenge("cancelled");
  await links.createChallenge(input, context("create_cancelled", input.requestDigest));
  const cancelledAt = new Date(startedAt.getTime() + 15_000);
  await links.cancelChallenge(
    refs.account,
    input.externalReference,
    cancelledAt,
    context("cancel", input.requestDigest),
  );
  await links.cancelChallenge(
    refs.account,
    input.externalReference,
    new Date(cancelledAt.getTime() + 1_000),
    context("cancel_replay", input.requestDigest),
  );
  const polled = await links.pollChallenge(
    refs.account,
    input.pollingTokenDigest,
    new Date(cancelledAt.getTime() + 2_000),
    context("poll_cancelled", input.requestDigest),
  );
  assert.equal(polled.state, "cancelled");
}

try {
  await seed();
  const linkReference = await verifyAtomicConsumption();
  await verifyLifecycle(linkReference);
  await verifyExpiry();
  await verifyCancellation();
  console.log("issue #19 Verus-link persistence verification passed with synthetic data");
} finally {
  await pool.end();
}
