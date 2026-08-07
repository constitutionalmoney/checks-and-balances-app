import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  SessionService,
  keyedDigest,
  recordConsentChoice,
  type AuthChallengeRecord,
  type StoredPasskeyCredential,
  type TrustDomainConfig,
} from "@cbc/auth";
import { AuthRepository, Pool } from "@cbc/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL is required for auth persistence verification");

const pool = new Pool({ connectionString, max: 4 });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const participantId = randomUUID();
const jurisdictionId = randomUUID();
const committeeId = randomUUID();
const memberId = randomUUID();
const roleId = randomUUID();
const sessionId = randomUUID();
const policyDocumentId = randomUUID();
const policyVersionId = randomUUID();
const refs = {
  participant: `participant_auth_synthetic_${suffix}`,
  participantAccount: `auth_participant_synthetic_${suffix}`,
  committeeAccount: `auth_committee_synthetic_${suffix}`,
  committee: `committee_auth_synthetic_${suffix}`,
  member: `member_auth_synthetic_${suffix}`,
  policy: `policy_auth_synthetic_${suffix}_v1`,
  session: `session_auth_synthetic_${suffix}`,
};
const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const participantConfig: TrustDomainConfig = {
  domain: "participant",
  audience: "cbc-participant-app",
  cookieName: "__Host-cbc-participant",
  origin: "https://participant.synthetic.invalid",
  relyingPartyId: "participant.synthetic.invalid",
  sessionSecret: "participant-synthetic-secret-at-least-thirty-two",
  idleTimeoutMs: 30 * 60_000,
  absoluteTimeoutMs: 12 * 60 * 60_000,
  privilegedReauthenticationMs: 5 * 60_000,
  sameSite: "Lax",
};
const committeeConfig: TrustDomainConfig = {
  domain: "committee",
  audience: "cbc-committee-console",
  cookieName: "__Host-cbc-committee",
  origin: "https://committee.synthetic.invalid",
  relyingPartyId: "committee.synthetic.invalid",
  sessionSecret: "committee-synthetic-secret-at-least-thirty-two",
  idleTimeoutMs: 15 * 60_000,
  absoluteTimeoutMs: 60 * 60_000,
  privilegedReauthenticationMs: 5 * 60_000,
  sameSite: "Strict",
};

const auth = new AuthRepository(pool, { participant: "p-v1", committee: "c-v1" });
const sessions = new SessionService(
  auth,
  { participant: participantConfig, committee: committeeConfig },
  randomUUID,
);
const startedAt = new Date("2032-01-01T00:00:00.000Z");

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO "jurisdiction" ("id","external_reference","kind","display_name")
     VALUES ($1,$2,'synthetic_test_area','Synthetic Auth Jurisdiction')`,
    [jurisdictionId, `jurisdiction_auth_synthetic_${suffix}`],
  );
  await pool.query(
    `INSERT INTO "committee" (
      "id","external_reference","slug","display_name","state","jurisdiction_id","updated_at"
     ) VALUES ($1,$2,$3,'Synthetic Auth Committee','active',$4,$5)`,
    [committeeId, refs.committee, `auth-synthetic-${suffix}`, jurisdictionId, startedAt],
  );
  await pool.query(
    `INSERT INTO "participant_account" ("id","external_reference","updated_at") VALUES ($1,$2,$3)`,
    [participantId, refs.participant, startedAt],
  );
  await pool.query(
    `INSERT INTO "policy_document" ("id","policy_key","title") VALUES ($1,$2,'Synthetic Auth Policy')`,
    [policyDocumentId, `cbc.synthetic.auth.${suffix}`],
  );
  await pool.query(
    `INSERT INTO "policy_version" (
      "id","policy_document_id","version","state","content_digest","content_reference","effective_at"
     ) VALUES ($1,$2,'synthetic-v1','approved',$3,$4,$5)`,
    [policyVersionId, policyDocumentId, digest(`policy-${suffix}`), refs.policy, startedAt],
  );
  await pool.query(
    `INSERT INTO "committee_member" (
      "id","external_reference","committee_id","participant_id","actor_reference","state","updated_at"
     ) VALUES ($1,$2,$3,$4,$5,'active',$6)`,
    [memberId, refs.member, committeeId, participantId, refs.committeeAccount, startedAt],
  );
  await pool.query(
    `INSERT INTO "committee_role" (
      "id","external_reference","committee_id","role_key","policy_version_id","state"
     ) VALUES ($1,$2,$3,'reviewer',$4,'active')`,
    [roleId, `role_auth_synthetic_${suffix}`, committeeId, policyVersionId],
  );
  await pool.query(
    `INSERT INTO "committee_member_role" (
      "id","committee_id","member_id","role_id","state","granted_at"
     ) VALUES ($1,$2,$3,$4,'active',$5)`,
    [randomUUID(), committeeId, memberId, roleId, startedAt],
  );
  await pool.query(
    `INSERT INTO "verification_session" (
      "id","external_reference","committee_id","policy_version_id","state","starts_at","ends_at",
      "location_reference","capacity"
     ) VALUES ($1,$2,$3,$4,'scheduled',$5,$6,$7,12)`,
    [
      sessionId,
      refs.session,
      committeeId,
      policyVersionId,
      new Date(startedAt.getTime() + 60_000),
      new Date(startedAt.getTime() + 120_000),
      `location_synthetic_${suffix}`,
    ],
  );
}

async function verifyAccountsAndCommitteeAccess(): Promise<void> {
  await assert.rejects(() =>
    auth.createAccount({
      externalReference: `acct_participant_without_subject_${suffix}`,
      trustDomain: "participant",
      state: "active",
      now: startedAt,
    }),
  );
  await auth.createAccount({
    externalReference: refs.participantAccount,
    trustDomain: "participant",
    participantReference: refs.participant,
    state: "active",
    now: startedAt,
  });
  await auth.createAccount({
    externalReference: refs.committeeAccount,
    trustDomain: "committee",
    state: "invited",
    now: startedAt,
  });
  await auth.registerVerifiedEmail({
    accountReference: refs.participantAccount,
    participantReference: refs.participant,
    destinationReference: `contact_vault_synthetic_${suffix}`,
    lookupDigest: keyedDigest(participantConfig.sessionSecret, `lookup-${suffix}`),
    verifiedAt: startedAt,
  });
  await auth.inviteCommittee({
    accountReference: refs.committeeAccount,
    committeeReference: refs.committee,
    invitedByReference: `actor_inviter_${suffix}`,
    invitedAt: startedAt,
  });
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO "auth_committee_access" (
        "id", "account_id", "committee_id", "state", "invited_by_reference", "invited_at"
       ) SELECT $1, account."id", committee."id", 'invited', $4, $5
         FROM "auth_account" account, "committee" committee
         WHERE account."external_reference" = $2 AND committee."external_reference" = $3`,
      [
        randomUUID(),
        refs.participantAccount,
        refs.committee,
        `actor_invalid_inviter_${suffix}`,
        startedAt,
      ],
    ),
  );
  await assert.rejects(() =>
    auth.approveCommittee({
      accountReference: refs.committeeAccount,
      committeeReference: refs.committee,
      approvedByReference: `actor_inviter_${suffix}`,
      approvedAt: new Date(startedAt.getTime() + 1_000),
    }),
  );
  await auth.approveCommittee({
    accountReference: refs.committeeAccount,
    committeeReference: refs.committee,
    approvedByReference: `actor_approver_${suffix}`,
    approvedAt: new Date(startedAt.getTime() + 2_000),
  });
  await auth.activateCommittee({
    accountReference: refs.committeeAccount,
    committeeReference: refs.committee,
    memberReference: refs.member,
    activatedAt: new Date(startedAt.getTime() + 3_000),
  });
  await auth.assignReviewer({
    committeeReference: refs.committee,
    sessionReference: refs.session,
    memberReference: refs.member,
    policyVersionId,
    assignedByReference: `actor_scheduler_${suffix}`,
    assignedAt: new Date(startedAt.getTime() + 4_000),
  });
  const principal = await auth.loadCommitteePrincipal({
    accountReference: refs.committeeAccount,
    committeeReference: refs.committee,
    targetType: "verification_request",
    targetReference: `request_synthetic_${suffix}`,
    sessionReference: refs.session,
  });
  assert.deepEqual(principal?.roles, ["reviewer"]);
  assert.equal(principal?.accountState, "active");
  assert.equal(principal?.assignedToSession, true);
  assert.equal(
    await auth.loadCommitteePrincipal({
      accountReference: refs.committeeAccount,
      committeeReference: `committee_other_${suffix}`,
      targetType: "verification_request",
      targetReference: `request_synthetic_${suffix}`,
    }),
    null,
  );
}

async function verifySessionsAndRecovery(): Promise<void> {
  const first = await sessions.issue({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    authenticationStrength: "verified_email",
    deviceLabel: "Synthetic desktop",
    now: startedAt,
  });
  const second = await sessions.issue({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    authenticationStrength: "passkey",
    deviceLabel: "Synthetic security key",
    now: new Date(startedAt.getTime() + 1_000),
  });
  assert.equal(
    (
      await sessions.authenticate({
        trustDomain: "participant",
        token: second.token,
        now: new Date(startedAt.getTime() + 2_000),
      })
    ).id,
    second.record.id,
  );
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO "auth_session" (
        "id","account_id","trust_domain","audience","token_digest","csrf_digest","key_version",
        "authentication_strength","device_label","authenticated_at","last_seen_at","idle_expires_at",
        "absolute_expires_at","created_at"
       ) SELECT $1,"id",'committee','cbc-committee-console',$2,$3,'c-v1','verified_email',
                'Synthetic invalid session',$4,$4,$5,$6,$4
         FROM "auth_account" WHERE "external_reference" = $7`,
      [
        randomUUID(),
        digest(`invalid-token-${suffix}`),
        digest(`invalid-csrf-${suffix}`),
        startedAt,
        new Date(startedAt.getTime() + 60_000),
        new Date(startedAt.getTime() + 120_000),
        refs.committeeAccount,
      ],
    ),
  );

  const revoked = await auth.recoverAndRevokeSessions({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    committeeReviewRequired: false,
    destinationReference: `contact_vault_synthetic_${suffix}`,
    policyVersionReference: refs.policy,
    softwareVersion: "issue-17-auth-persistence-verification",
    correlationId: `correlation_auth_recovery_${suffix}`,
    at: new Date(startedAt.getTime() + 4_000),
  });
  assert.equal(revoked, 2);
  assert.equal(
    (await auth.list(refs.participantAccount, "participant")).filter((s) => s.revokedAt).length,
    2,
  );
  const audit = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "audit_event"
     WHERE "target_reference" = $1 AND "command" = 'recoverAccount'`,
    [refs.participantAccount],
  );
  assert.equal(audit.rows[0]?.count, "1");
  assert(first.token.length > 20);

  await sessions.issue({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    authenticationStrength: "passkey",
    deviceLabel: "Synthetic replacement passkey",
    now: new Date(startedAt.getTime() + 5_000),
  });
  const changed = await auth.changeVerifiedEmail({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    newDestinationReference: `contact_vault_changed_${suffix}`,
    newLookupDigest: keyedDigest(participantConfig.sessionSecret, `changed-lookup-${suffix}`),
    context: {
      actorReference: refs.participantAccount,
      authenticationStrength: "passkey",
      policyVersionReference: refs.policy,
      softwareVersion: "issue-17-auth-persistence-verification",
      correlationId: `correlation_auth_email_change_${suffix}`,
    },
    at: new Date(startedAt.getTime() + 6_000),
  });
  assert.deepEqual(changed.oldDestinationReferences, [`contact_vault_synthetic_${suffix}`]);
  assert.equal(changed.revokedSessions, 1);

  await sessions.issue({
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    authenticationStrength: "passkey",
    deviceLabel: "Synthetic compromised passkey",
    now: new Date(startedAt.getTime() + 7_000),
  });
  assert.equal(
    await auth.lockAndRevokeSessions({
      accountReference: refs.participantAccount,
      trustDomain: "participant",
      reasonCategory: "synthetic_compromise",
      context: {
        actorReference: refs.participantAccount,
        authenticationStrength: "passkey",
        policyVersionReference: refs.policy,
        softwareVersion: "issue-17-auth-persistence-verification",
        correlationId: `correlation_auth_lock_${suffix}`,
      },
      at: new Date(startedAt.getTime() + 8_000),
    }),
    1,
  );
}

async function verifyChallengesAndLimits(): Promise<void> {
  const challenge: AuthChallengeRecord = {
    id: randomUUID(),
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    kind: "account_recovery",
    secretDigest: digest(`challenge-${suffix}`),
    destinationReference: `contact_vault_synthetic_${suffix}`,
    lookupDigest: null,
    expiresAt: new Date(startedAt.getTime() + 60_000),
    createdAt: startedAt,
  };
  await auth.create(challenge);
  assert(
    await auth.consume({
      challengeId: challenge.id,
      kind: challenge.kind,
      trustDomain: challenge.trustDomain,
      at: new Date(startedAt.getTime() + 1_000),
    }),
  );
  assert.equal(
    await auth.consume({
      challengeId: challenge.id,
      kind: challenge.kind,
      trustDomain: challenge.trustDomain,
      at: new Date(startedAt.getTime() + 2_000),
    }),
    null,
  );
  await assert.rejects(() =>
    pool.query(`UPDATE "auth_challenge" SET "attempt_count" = 0 WHERE "id" = $1`, [challenge.id]),
  );
  assert.equal(
    await auth.increment({
      keyDigest: digest(`limit-${suffix}`),
      bucket: "recovery_account",
      windowStartedAt: startedAt,
      expiresAt: new Date(startedAt.getTime() + 60_000),
    }),
    1,
  );
  assert.equal(
    await auth.increment({
      keyDigest: digest(`limit-${suffix}`),
      bucket: "recovery_account",
      windowStartedAt: startedAt,
      expiresAt: new Date(startedAt.getTime() + 60_000),
    }),
    2,
  );
}

async function verifyPasskeyAndConsentInventory(): Promise<void> {
  const passkey: StoredPasskeyCredential = {
    credentialReference: `credential_synthetic_${suffix}`,
    accountReference: refs.participantAccount,
    trustDomain: "participant",
    relyingPartyId: participantConfig.relyingPartyId,
    publicKey: Uint8Array.from([1, 2, 3, 4]),
    counter: 0,
    transports: ["internal"],
    deviceType: "multiDevice",
    backedUp: true,
    deviceLabel: "Synthetic platform passkey",
    state: "active",
  };
  await auth.save(passkey, startedAt);
  assert.equal((await auth.listActive(refs.participantAccount, "participant")).length, 1);
  await auth.updateUsage({
    credentialReference: passkey.credentialReference,
    counter: 1,
    deviceType: "multiDevice",
    backedUp: true,
    usedAt: new Date(startedAt.getTime() + 1_000),
  });
  await assert.rejects(() =>
    auth.updateUsage({
      credentialReference: passkey.credentialReference,
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      usedAt: new Date(startedAt.getTime() + 2_000),
    }),
  );

  const receipt = recordConsentChoice({
    accountReference: refs.participantAccount,
    committeeReference: refs.committee,
    presentation: {
      presentationReference: `presentation_synthetic_${suffix}`,
      purpose: "privacy_notice",
      policyVersionReference: refs.policy,
      contentDigest: digest(`presentation-${suffix}`),
      presentedAt: startedAt,
      preselected: false,
      bundledPurposes: ["privacy_notice"],
    },
    choice: { action: "accepted", actedAt: new Date(startedAt.getTime() + 1_000) },
  });
  await auth.recordConsent({
    receipt,
    policyVersionId,
    participantReference: refs.participant,
    acknowledgedAt: receipt.actedAt,
  });
  const stored = await pool.query<{
    action: string;
    purpose: string;
    presentation_digest: string;
  }>(
    `SELECT "action", "purpose", "presentation_digest" FROM "consent_receipt"
     WHERE "auth_account_id" = (SELECT "id" FROM "auth_account" WHERE "external_reference" = $1)`,
    [refs.participantAccount],
  );
  assert.deepEqual(stored.rows[0], {
    action: "accepted",
    purpose: "privacy_notice",
    presentation_digest: receipt.presentationDigest,
  });
}

try {
  await seed();
  await verifyAccountsAndCommitteeAccess();
  await verifyPasskeyAndConsentInventory();
  await verifySessionsAndRecovery();
  await verifyChallengesAndLimits();
  console.log("issue #17 auth persistence verification passed with synthetic data");
} finally {
  await pool.end();
}
