import type {
  AccountSecurityStore,
  AuthChallengeKind,
  AuthChallengeRecord,
  AuthChallengeStore,
  ConsumedAuthChallenge,
  ConsentAction,
  ConsentPurpose,
  PasskeyRepository,
  RateLimitStore,
  RecoveryAccountStore,
  SecurityMutationContext,
  SessionRecord,
  SessionStore,
  StoredPasskeyCredential,
  TrustDomain,
  VerifiedEmailAccount,
  VerifiedEmailDirectory,
  VersionedConsentReceipt,
} from "@cbc/auth";
import type { Pool, PoolClient } from "pg";

import { appendAudit } from "./audit.js";
import {
  RepositoryConflictError,
  inSerializableTransaction,
  newId,
  requireOpaqueReference,
} from "./repository-types.js";

interface SessionRow {
  id: string;
  account_reference: string;
  trust_domain: TrustDomain;
  audience: string;
  token_digest: string;
  csrf_digest: string;
  authentication_strength: SessionRecord["authenticationStrength"];
  authenticated_at: Date;
  reauthenticated_at: Date | null;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  device_label: string;
}

interface ChallengeRow {
  id: string;
  account_reference: string | null;
  trust_domain: TrustDomain;
  kind: AuthChallengeKind;
  secret_digest: string;
  destination_reference: string | null;
  lookup_digest: string | null;
  expires_at: Date;
  created_at: Date;
  consumed_at: Date;
}

interface PasskeyRow {
  credential_reference: string;
  account_reference: string;
  trust_domain: TrustDomain;
  relying_party_id: string;
  public_key: Buffer;
  sign_count: string;
  transports: string[];
  credential_device_type: "singleDevice" | "multiDevice";
  backed_up: boolean;
  device_label: string;
  state: "active" | "disabled" | "revoked";
}

type AuthenticatorTransportFuture =
  "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

export interface CreateAuthAccountInput {
  readonly externalReference: string;
  readonly trustDomain: TrustDomain;
  readonly participantReference?: string;
  readonly state?: "invited" | "active";
  readonly now: Date;
}

export interface RegisterVerifiedEmailInput {
  readonly accountReference: string;
  readonly participantReference?: string;
  readonly destinationReference: string;
  readonly lookupDigest: string;
  readonly verifiedAt: Date;
}

export interface CommitteeInvitationInput {
  readonly accountReference: string;
  readonly committeeReference: string;
  readonly invitedByReference: string;
  readonly invitedAt: Date;
}

export interface CommitteePrincipalSnapshot {
  readonly accountReference: string;
  readonly accountState: "active" | "invited" | "locked" | "suspended" | "closed";
  readonly committeeReference: string;
  readonly committeeState: string;
  readonly membershipState: string | null;
  readonly roles: readonly string[];
  readonly conflicted: boolean;
  readonly assignedToSession: boolean;
}

function mapSession(row: SessionRow): SessionRecord {
  return Object.freeze({
    id: row.id,
    accountReference: row.account_reference,
    trustDomain: row.trust_domain,
    audience: row.audience,
    tokenDigest: row.token_digest,
    csrfDigest: row.csrf_digest,
    authenticationStrength: row.authentication_strength,
    authenticatedAt: row.authenticated_at,
    reauthenticatedAt: row.reauthenticated_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at,
    deviceLabel: row.device_label,
  });
}

const allowedTransports = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

function mapPasskey(row: PasskeyRow): StoredPasskeyCredential {
  const transports = row.transports.filter((value): value is AuthenticatorTransportFuture =>
    allowedTransports.has(value as AuthenticatorTransportFuture),
  );
  return Object.freeze({
    credentialReference: row.credential_reference,
    accountReference: row.account_reference,
    trustDomain: row.trust_domain,
    relyingPartyId: row.relying_party_id,
    publicKey: Uint8Array.from(row.public_key),
    counter: Number(row.sign_count),
    transports: Object.freeze(transports),
    deviceType: row.credential_device_type,
    backedUp: row.backed_up,
    deviceLabel: row.device_label,
    state: row.state,
  });
}

export class AuthRepository
  implements
    SessionStore,
    AuthChallengeStore,
    RateLimitStore,
    VerifiedEmailDirectory,
    RecoveryAccountStore,
    AccountSecurityStore,
    PasskeyRepository
{
  constructor(
    private readonly pool: Pool,
    private readonly sessionKeyVersions: Readonly<Record<TrustDomain, string>>,
  ) {}

  async createAccount(input: CreateAuthAccountInput): Promise<void> {
    requireOpaqueReference(input.externalReference, "accountReference");
    await inSerializableTransaction(this.pool, async (client) => {
      const participantId = input.participantReference
        ? await this.participantId(client, input.participantReference)
        : null;
      await client.query(
        `INSERT INTO "auth_account" (
          "id", "external_reference", "trust_domain", "state", "participant_id", "created_at", "updated_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [
          newId(),
          input.externalReference,
          input.trustDomain,
          input.state ?? "invited",
          participantId,
          input.now,
        ],
      );
    });
  }

  async registerVerifiedEmail(input: RegisterVerifiedEmailInput): Promise<void> {
    requireOpaqueReference(input.accountReference, "accountReference");
    requireOpaqueReference(input.destinationReference, "destinationReference");
    await inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference);
      const participantId = input.participantReference
        ? await this.participantId(client, input.participantReference)
        : null;
      await client.query(
        `INSERT INTO "contact_preference" (
          "id", "participant_id", "auth_account_id", "channel", "destination_reference",
          "lookup_digest", "verified_at", "created_at"
        ) VALUES ($1,$2,$3,'email',$4,$5,$6,$6)`,
        [
          newId(),
          participantId,
          account.id,
          input.destinationReference,
          input.lookupDigest,
          input.verifiedAt,
        ],
      );
    });
  }

  async inviteCommittee(input: CommitteeInvitationInput): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference, "committee");
      const committee = await this.committee(client, input.committeeReference);
      await client.query(
        `INSERT INTO "auth_committee_access" (
          "id", "account_id", "committee_id", "state", "invited_by_reference", "invited_at"
        ) VALUES ($1,$2,$3,'invited',$4,$5)`,
        [newId(), account.id, committee.id, input.invitedByReference, input.invitedAt],
      );
    });
  }

  async approveCommittee(input: {
    readonly accountReference: string;
    readonly committeeReference: string;
    readonly approvedByReference: string;
    readonly approvedAt: Date;
  }): Promise<void> {
    const result = await this.pool.query(
      `UPDATE "auth_committee_access" AS access
       SET "state" = 'approved', "approved_by_reference" = $3, "approved_at" = $4
       FROM "auth_account" AS account, "committee" AS committee
       WHERE access."account_id" = account."id"
         AND access."committee_id" = committee."id"
         AND account."external_reference" = $1
         AND committee."external_reference" = $2
         AND access."state" = 'invited'`,
      [
        input.accountReference,
        input.committeeReference,
        input.approvedByReference,
        input.approvedAt,
      ],
    );
    if (result.rowCount !== 1)
      throw new RepositoryConflictError("committee invitation is unavailable");
  }

  async activateCommittee(input: {
    readonly accountReference: string;
    readonly committeeReference: string;
    readonly memberReference: string;
    readonly activatedAt: Date;
  }): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE "auth_committee_access" AS access
         SET "state" = 'active', "member_id" = member."id", "activated_at" = $4
         FROM "auth_account" AS account, "committee" AS committee, "committee_member" AS member
         WHERE access."account_id" = account."id"
           AND access."committee_id" = committee."id"
           AND member."committee_id" = committee."id"
           AND account."external_reference" = $1
           AND committee."external_reference" = $2
           AND member."external_reference" = $3
           AND member."state" = 'active'
           AND access."state" = 'approved'`,
        [
          input.accountReference,
          input.committeeReference,
          input.memberReference,
          input.activatedAt,
        ],
      );
      if (result.rowCount !== 1)
        throw new RepositoryConflictError("committee access cannot be activated");
      await client.query(
        `UPDATE "auth_account" SET "state" = 'active', "updated_at" = $2, "version" = "version" + 1
         WHERE "external_reference" = $1 AND "trust_domain" = 'committee'`,
        [input.accountReference, input.activatedAt],
      );
    });
  }

  async loadCommitteePrincipal(input: {
    readonly accountReference: string;
    readonly committeeReference: string;
    readonly targetType: string;
    readonly targetReference: string;
    readonly sessionReference?: string;
  }): Promise<CommitteePrincipalSnapshot | null> {
    const result = await this.pool.query<{
      account_reference: string;
      account_state: CommitteePrincipalSnapshot["accountState"];
      committee_reference: string;
      committee_state: string;
      membership_state: string | null;
      roles: string[];
      conflicted: boolean;
      assigned_to_session: boolean;
    }>(
      `SELECT account."external_reference" AS account_reference,
              account."state" AS account_state,
              committee."external_reference" AS committee_reference,
              committee."state" AS committee_state,
              member."state" AS membership_state,
              COALESCE(array_agg(DISTINCT role."role_key") FILTER (
                WHERE member_role."state" = 'active' AND role."state" = 'active'
              ), ARRAY[]::text[]) AS roles,
              EXISTS (
                SELECT 1 FROM "conflict_declaration" conflict
                WHERE conflict."member_id" = member."id"
                  AND conflict."target_type" = $3
                  AND conflict."target_reference" = $4
                  AND conflict."resolved_at" IS NULL
              ) AS conflicted
              ,CASE WHEN $5::text IS NULL THEN false ELSE EXISTS (
                SELECT 1
                FROM "reviewer_session_assignment" assignment
                JOIN "verification_session" assigned_session
                  ON assigned_session."id" = assignment."session_id"
                 AND assigned_session."committee_id" = assignment."committee_id"
                WHERE assignment."member_id" = member."id"
                  AND assignment."committee_id" = committee."id"
                  AND assignment."state" = 'active'
                  AND assigned_session."external_reference" = $5
              ) END AS assigned_to_session
       FROM "auth_account" account
       JOIN "auth_committee_access" access ON access."account_id" = account."id"
       JOIN "committee" committee ON committee."id" = access."committee_id"
       LEFT JOIN "committee_member" member ON member."id" = access."member_id"
       LEFT JOIN "committee_member_role" member_role ON member_role."member_id" = member."id"
       LEFT JOIN "committee_role" role ON role."id" = member_role."role_id"
       WHERE account."external_reference" = $1
         AND account."trust_domain" = 'committee'
         AND access."state" = 'active'
         AND committee."external_reference" = $2
       GROUP BY account."external_reference", account."state", committee."external_reference",
                committee."state", committee."id", member."state", member."id"`,
      [
        input.accountReference,
        input.committeeReference,
        input.targetType,
        input.targetReference,
        input.sessionReference ?? null,
      ],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          accountReference: row.account_reference,
          accountState: row.account_state,
          committeeReference: row.committee_reference,
          committeeState: row.committee_state,
          membershipState: row.membership_state,
          roles: Object.freeze(row.roles),
          conflicted: row.conflicted,
          assignedToSession: row.assigned_to_session,
        })
      : null;
  }

  async assignReviewer(input: {
    readonly committeeReference: string;
    readonly sessionReference: string;
    readonly memberReference: string;
    readonly policyVersionId: string;
    readonly assignedByReference: string;
    readonly assignedAt: Date;
  }): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO "reviewer_session_assignment" (
        "id", "committee_id", "session_id", "member_id", "policy_version_id", "state",
        "assigned_by_reference", "assigned_at"
       ) SELECT $1, committee."id", session."id", member."id", $5, 'active', $6, $7
         FROM "committee" committee
         JOIN "verification_session" session ON session."committee_id" = committee."id"
         JOIN "committee_member" member ON member."committee_id" = committee."id"
         WHERE committee."external_reference" = $2
           AND session."external_reference" = $3
           AND member."external_reference" = $4
           AND member."state" = 'active'`,
      [
        newId(),
        input.committeeReference,
        input.sessionReference,
        input.memberReference,
        input.policyVersionId,
        input.assignedByReference,
        input.assignedAt,
      ],
    );
    if (result.rowCount !== 1) {
      throw new RepositoryConflictError("reviewer session assignment is unavailable");
    }
  }

  async create(record: SessionRecord | AuthChallengeRecord): Promise<void> {
    if ("tokenDigest" in record) {
      await this.createSession(record);
      return;
    }
    await this.createChallenge(record);
  }

  private async createSession(record: SessionRecord): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, record.accountReference, record.trustDomain);
      if (account.state !== "active") {
        throw new RepositoryConflictError("authentication account is not active");
      }
      await client.query(
        `INSERT INTO "auth_session" (
          "id", "account_id", "trust_domain", "audience", "token_digest", "csrf_digest",
          "key_version", "authentication_strength", "state", "device_label", "authenticated_at",
          "reauthenticated_at", "last_seen_at", "idle_expires_at", "absolute_expires_at", "created_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$10,$12,$13,$10)`,
        [
          record.id,
          account.id,
          record.trustDomain,
          record.audience,
          record.tokenDigest,
          record.csrfDigest,
          this.sessionKeyVersions[record.trustDomain],
          record.authenticationStrength,
          record.deviceLabel,
          record.authenticatedAt,
          record.reauthenticatedAt,
          record.idleExpiresAt,
          record.absoluteExpiresAt,
        ],
      );
    });
  }

  private async createChallenge(record: AuthChallengeRecord): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const accountId = record.accountReference
        ? (await this.account(client, record.accountReference, record.trustDomain)).id
        : null;
      await client.query(
        `INSERT INTO "auth_challenge" (
          "id", "account_id", "trust_domain", "kind", "state", "secret_digest",
          "destination_reference", "lookup_digest", "expires_at", "created_at"
        ) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)`,
        [
          record.id,
          accountId,
          record.trustDomain,
          record.kind,
          record.secretDigest,
          record.destinationReference,
          record.lookupDigest,
          record.expiresAt,
          record.createdAt,
        ],
      );
    });
  }

  async findByTokenDigest(
    trustDomain: TrustDomain,
    tokenDigest: string,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT session.*, account."external_reference" AS account_reference
       FROM "auth_session" session
       JOIN "auth_account" account ON account."id" = session."account_id"
       WHERE session."trust_domain" = $1
         AND session."token_digest" = $2
         AND account."state" = 'active'`,
      [trustDomain, tokenDigest],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async revoke(sessionId: string, reasonCategory: string, at: Date): Promise<void> {
    await this.pool.query(
      `UPDATE "auth_session" SET "state" = 'revoked', "revoked_at" = $2, "revocation_reason" = $3
       WHERE "id" = $1 AND "state" = 'active'`,
      [sessionId, at, reasonCategory],
    );
  }

  async revokeAll(
    accountReference: string,
    trustDomain: TrustDomain,
    reasonCategory: string,
    at: Date,
  ): Promise<number> {
    const result = await this.pool.query(
      `UPDATE "auth_session" session
       SET "state" = 'revoked', "revoked_at" = $3, "revocation_reason" = $4
       FROM "auth_account" account
       WHERE session."account_id" = account."id"
         AND account."external_reference" = $1
         AND session."trust_domain" = $2
         AND session."state" = 'active'`,
      [accountReference, trustDomain, at, reasonCategory],
    );
    return result.rowCount ?? 0;
  }

  async touch(sessionId: string, idleExpiresAt: Date, at: Date): Promise<void> {
    await this.pool.query(
      `UPDATE "auth_session" SET "idle_expires_at" = $2, "last_seen_at" = $3
       WHERE "id" = $1 AND "state" = 'active'`,
      [sessionId, idleExpiresAt, at],
    );
  }

  async list(
    accountReference: string,
    trustDomain: TrustDomain,
  ): Promise<readonly SessionRecord[]> {
    const result = await this.pool.query<SessionRow>(
      `SELECT session.*, account."external_reference" AS account_reference
       FROM "auth_session" session
       JOIN "auth_account" account ON account."id" = session."account_id"
       WHERE account."external_reference" = $1 AND session."trust_domain" = $2
       ORDER BY session."created_at" DESC`,
      [accountReference, trustDomain],
    );
    return Object.freeze(result.rows.map(mapSession));
  }

  async consume(input: {
    readonly challengeId?: string;
    readonly secretDigest?: string;
    readonly kind: AuthChallengeKind;
    readonly trustDomain: TrustDomain;
    readonly at: Date;
  }): Promise<ConsumedAuthChallenge | null> {
    const result = await this.pool.query<ChallengeRow>(
      `WITH consumed AS (
         UPDATE "auth_challenge"
         SET "state" = 'consumed', "consumed_at" = $5, "attempt_count" = "attempt_count" + 1
         WHERE ($1::uuid IS NULL OR "id" = $1)
           AND ($2::text IS NULL OR "secret_digest" = $2)
           AND "kind" = $3::"auth_challenge_kind"
           AND "trust_domain" = $4::"auth_trust_domain"
           AND "state" = 'pending'
           AND "expires_at" > $5
           AND "attempt_count" < "maximum_attempts"
         RETURNING *
       )
       SELECT consumed.*, account."external_reference" AS account_reference
       FROM consumed LEFT JOIN "auth_account" account ON account."id" = consumed."account_id"`,
      [
        input.challengeId ?? null,
        input.secretDigest ?? null,
        input.kind,
        input.trustDomain,
        input.at,
      ],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          id: row.id,
          accountReference: row.account_reference,
          trustDomain: row.trust_domain,
          kind: row.kind,
          secretDigest: row.secret_digest,
          destinationReference: row.destination_reference,
          lookupDigest: row.lookup_digest,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          consumedAt: row.consumed_at,
        })
      : null;
  }

  async increment(input: {
    readonly keyDigest: string;
    readonly bucket: string;
    readonly windowStartedAt: Date;
    readonly expiresAt: Date;
  }): Promise<number> {
    const result = await this.pool.query<{ attempt_count: number }>(
      `INSERT INTO "auth_rate_limit_bucket" (
        "key_digest", "bucket", "attempt_count", "window_started_at", "expires_at"
       ) VALUES ($1,$2,1,$3,$4)
       ON CONFLICT ("key_digest") DO UPDATE
       SET "attempt_count" = "auth_rate_limit_bucket"."attempt_count" + 1
       RETURNING "attempt_count"`,
      [input.keyDigest, input.bucket, input.windowStartedAt, input.expiresAt],
    );
    return result.rows[0]?.attempt_count ?? 1;
  }

  async findByLookupDigest(
    trustDomain: TrustDomain,
    lookupDigest: string,
  ): Promise<VerifiedEmailAccount | null> {
    const result = await this.pool.query<{
      account_reference: string;
      trust_domain: TrustDomain;
      destination_reference: string;
      account_state: VerifiedEmailAccount["accountState"];
    }>(
      `SELECT account."external_reference" AS account_reference,
              account."trust_domain", contact."destination_reference", account."state" AS account_state
       FROM "contact_preference" contact
       JOIN "auth_account" account ON account."id" = contact."auth_account_id"
       WHERE account."trust_domain" = $1
         AND contact."lookup_digest" = $2
         AND contact."verified_at" IS NOT NULL
         AND contact."disabled_at" IS NULL`,
      [trustDomain, lookupDigest],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          accountReference: row.account_reference,
          trustDomain: row.trust_domain,
          destinationReference: row.destination_reference,
          accountState: row.account_state,
        })
      : null;
  }

  async recoverAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly committeeReviewRequired: boolean;
    readonly destinationReference: string;
    readonly policyVersionReference: string;
    readonly softwareVersion: string;
    readonly correlationId: string;
    readonly at: Date;
  }): Promise<number> {
    return inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference, input.trustDomain);
      if (account.state !== "active" && account.state !== "locked") {
        throw new RepositoryConflictError("authentication account cannot be recovered");
      }
      const sessions = await client.query(
        `UPDATE "auth_session"
         SET "state" = 'revoked', "revoked_at" = $2, "revocation_reason" = 'account_recovery'
         WHERE "account_id" = $1 AND "state" = 'active'`,
        [account.id, input.at],
      );
      await client.query(
        `UPDATE "auth_account"
         SET "state" = $2::"auth_account_state", "recovered_at" = $3::timestamptz,
             "suspended_at" = CASE WHEN $2::text = 'suspended' THEN $3::timestamptz ELSE NULL END,
             "locked_at" = NULL, "version" = "version" + 1, "updated_at" = $3::timestamptz
         WHERE "id" = $1`,
        [account.id, input.committeeReviewRequired ? "suspended" : "active", input.at],
      );
      await appendAudit(
        client,
        {
          actor: {
            type: "account_recovery",
            reference: input.accountReference,
            authenticationStrength: "recovery",
          },
          committeeReference: "global-auth",
          policyVersionReference: input.policyVersionReference,
          softwareVersion: input.softwareVersion,
          reasonCategory: input.committeeReviewRequired
            ? "committee_recovery_suspended"
            : "participant_recovered",
          correlationId: input.correlationId,
          idempotencyKey: input.correlationId,
          requestDigest: input.correlationId,
        },
        null,
        "recoverAccount",
        {
          type: "auth_account",
          reference: input.accountReference,
          newState: input.committeeReviewRequired ? "suspended" : "active",
        },
      );
      return sessions.rowCount ?? 0;
    });
  }

  async lockAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly reasonCategory: string;
    readonly context: SecurityMutationContext;
    readonly at: Date;
  }): Promise<number> {
    return inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference, input.trustDomain);
      if (account.state !== "active") {
        throw new RepositoryConflictError("authentication account cannot be locked");
      }
      const sessions = await client.query(
        `UPDATE "auth_session"
         SET "state" = 'revoked', "revoked_at" = $2, "revocation_reason" = $3
         WHERE "account_id" = $1 AND "state" = 'active'`,
        [account.id, input.at, input.reasonCategory],
      );
      await client.query(
        `UPDATE "auth_account"
         SET "state" = 'locked', "locked_at" = $2, "version" = "version" + 1, "updated_at" = $2
         WHERE "id" = $1`,
        [account.id, input.at],
      );
      await this.appendSecurityAudit(client, {
        accountReference: input.accountReference,
        command: "lockAccount",
        newState: "locked",
        reasonCategory: input.reasonCategory,
        context: input.context,
      });
      return sessions.rowCount ?? 0;
    });
  }

  async changeVerifiedEmail(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly newDestinationReference: string;
    readonly newLookupDigest: string;
    readonly context: SecurityMutationContext;
    readonly at: Date;
  }): Promise<{
    readonly oldDestinationReferences: readonly string[];
    readonly revokedSessions: number;
  }> {
    requireOpaqueReference(input.newDestinationReference, "newDestinationReference");
    return inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference, input.trustDomain);
      if (account.state !== "active") {
        throw new RepositoryConflictError("verified email cannot be changed");
      }
      const prior = await client.query<{ destination_reference: string }>(
        `SELECT "destination_reference" FROM "contact_preference"
         WHERE "auth_account_id" = $1 AND "channel" = 'email' AND "disabled_at" IS NULL
         FOR UPDATE`,
        [account.id],
      );
      await client.query(
        `UPDATE "contact_preference" SET "disabled_at" = $2
         WHERE "auth_account_id" = $1 AND "channel" = 'email' AND "disabled_at" IS NULL`,
        [account.id, input.at],
      );
      await client.query(
        `INSERT INTO "contact_preference" (
          "id", "participant_id", "auth_account_id", "channel", "destination_reference",
          "lookup_digest", "verified_at", "created_at"
        ) VALUES ($1,$2,$3,'email',$4,$5,$6,$6)`,
        [
          newId(),
          account.participant_id,
          account.id,
          input.newDestinationReference,
          input.newLookupDigest,
          input.at,
        ],
      );
      const sessions = await client.query(
        `UPDATE "auth_session"
         SET "state" = 'revoked', "revoked_at" = $2, "revocation_reason" = 'verified_email_changed'
         WHERE "account_id" = $1 AND "state" = 'active'`,
        [account.id, input.at],
      );
      await this.appendSecurityAudit(client, {
        accountReference: input.accountReference,
        command: "changeVerifiedEmail",
        reasonCategory: "verified_email_changed",
        context: input.context,
      });
      return Object.freeze({
        oldDestinationReferences: Object.freeze(
          prior.rows.map(({ destination_reference }) => destination_reference),
        ),
        revokedSessions: sessions.rowCount ?? 0,
      });
    });
  }

  async listActive(
    accountReference: string,
    trustDomain: TrustDomain,
  ): Promise<readonly StoredPasskeyCredential[]> {
    const result = await this.pool.query<PasskeyRow>(
      `SELECT passkey.*, account."external_reference" AS account_reference,
              account."trust_domain"
       FROM "passkey_metadata" passkey
       JOIN "auth_account" account ON account."id" = passkey."auth_account_id"
       WHERE account."external_reference" = $1
         AND account."trust_domain" = $2
         AND passkey."state" = 'active'
       ORDER BY passkey."created_at"`,
      [accountReference, trustDomain],
    );
    return Object.freeze(result.rows.map(mapPasskey));
  }

  async findActive(
    credentialReference: string,
    trustDomain: TrustDomain,
  ): Promise<StoredPasskeyCredential | null> {
    const result = await this.pool.query<PasskeyRow>(
      `SELECT passkey.*, account."external_reference" AS account_reference,
              account."trust_domain"
       FROM "passkey_metadata" passkey
       JOIN "auth_account" account ON account."id" = passkey."auth_account_id"
       WHERE passkey."credential_reference" = $1
         AND account."trust_domain" = $2
         AND account."state" = 'active'
         AND passkey."state" = 'active'`,
      [credentialReference, trustDomain],
    );
    return result.rows[0] ? mapPasskey(result.rows[0]) : null;
  }

  async save(credential: StoredPasskeyCredential, createdAt: Date): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(
        client,
        credential.accountReference,
        credential.trustDomain,
      );
      if (account.state !== "active") {
        throw new RepositoryConflictError("authentication account is not active");
      }
      await client.query(
        `INSERT INTO "passkey_metadata" (
          "id", "participant_id", "auth_account_id", "credential_reference", "relying_party_id",
          "public_key", "transports", "credential_device_type", "backed_up", "device_label",
          "state", "sign_count", "created_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12)`,
        [
          newId(),
          account.participant_id,
          account.id,
          credential.credentialReference,
          credential.relyingPartyId,
          Buffer.from(credential.publicKey),
          [...credential.transports],
          credential.deviceType,
          credential.backedUp,
          credential.deviceLabel,
          credential.counter,
          createdAt,
        ],
      );
    });
  }

  async updateUsage(input: {
    readonly credentialReference: string;
    readonly counter: number;
    readonly deviceType: "singleDevice" | "multiDevice";
    readonly backedUp: boolean;
    readonly usedAt: Date;
  }): Promise<void> {
    const result = await this.pool.query(
      `UPDATE "passkey_metadata"
       SET "sign_count" = $2, "credential_device_type" = $3, "backed_up" = $4, "last_used_at" = $5
       WHERE "credential_reference" = $1 AND "state" = 'active' AND "sign_count" <= $2`,
      [input.credentialReference, input.counter, input.deviceType, input.backedUp, input.usedAt],
    );
    if (result.rowCount !== 1)
      throw new RepositoryConflictError("passkey counter update was rejected");
  }

  async revokeCredential(
    credentialReference: string,
    accountReference: string,
    revokedAt: Date,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE "passkey_metadata" passkey
       SET "state" = 'revoked', "revoked_at" = $3
       FROM "auth_account" account
       WHERE passkey."auth_account_id" = account."id"
         AND passkey."credential_reference" = $1
         AND account."external_reference" = $2
         AND passkey."state" = 'active'`,
      [credentialReference, accountReference, revokedAt],
    );
    if (result.rowCount !== 1) throw new RepositoryConflictError("passkey is unavailable");
  }

  async recordConsent(input: {
    readonly receipt: VersionedConsentReceipt;
    readonly policyVersionId: string;
    readonly participantReference?: string;
    readonly acknowledgedAt: Date | null;
  }): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.receipt.accountReference);
      const participantId = input.participantReference
        ? await this.participantId(client, input.participantReference)
        : null;
      const committeeId = input.receipt.committeeReference
        ? (await this.committee(client, input.receipt.committeeReference)).id
        : null;
      const state = input.receipt.action === "withdrawn" ? "withdrawn" : "acknowledged";
      await client.query(
        `INSERT INTO "consent_receipt" (
          "id", "external_reference", "participant_id", "auth_account_id", "committee_id",
          "policy_version_id", "purpose", "presentation_reference", "presentation_digest", "action",
          "state", "acknowledged_at", "presented_at", "acted_at", "withdrawn_at", "created_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$14)`,
        [
          newId(),
          `consent:${newId()}`,
          participantId,
          account.id,
          committeeId,
          input.policyVersionId,
          input.receipt.purpose satisfies ConsentPurpose,
          input.receipt.presentationReference,
          input.receipt.presentationDigest,
          input.receipt.action satisfies ConsentAction,
          state,
          input.acknowledgedAt,
          input.receipt.presentedAt,
          input.receipt.actedAt,
          input.receipt.action === "withdrawn" ? input.receipt.actedAt : null,
        ],
      );
    });
  }

  private async account(
    client: PoolClient,
    externalReference: string,
    trustDomain?: TrustDomain,
  ): Promise<{ id: string; participant_id: string | null; state: string }> {
    const result = await client.query<{ id: string; participant_id: string | null; state: string }>(
      `SELECT "id", "participant_id", "state" FROM "auth_account"
       WHERE "external_reference" = $1
         AND ($2::"auth_trust_domain" IS NULL OR "trust_domain" = $2)`,
      [externalReference, trustDomain ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("authentication account is unavailable");
    return row;
  }

  private async participantId(client: PoolClient, reference: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT "id" FROM "participant_account" WHERE "external_reference" = $1`,
      [reference],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new RepositoryConflictError("participant account is unavailable");
    return id;
  }

  private async committee(client: PoolClient, reference: string): Promise<{ id: string }> {
    const result = await client.query<{ id: string }>(
      `SELECT "id" FROM "committee" WHERE "external_reference" = $1`,
      [reference],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("committee is unavailable");
    return row;
  }

  private async appendSecurityAudit(
    client: PoolClient,
    input: {
      readonly accountReference: string;
      readonly command: string;
      readonly newState?: string;
      readonly reasonCategory: string;
      readonly context: SecurityMutationContext;
    },
  ): Promise<void> {
    await appendAudit(
      client,
      {
        actor: {
          type: "auth_account",
          reference: input.context.actorReference,
          authenticationStrength: input.context.authenticationStrength,
        },
        committeeReference: "global-auth",
        policyVersionReference: input.context.policyVersionReference,
        softwareVersion: input.context.softwareVersion,
        reasonCategory: input.reasonCategory,
        correlationId: input.context.correlationId,
        idempotencyKey: input.context.correlationId,
        requestDigest: input.context.correlationId,
      },
      null,
      input.command,
      {
        type: "auth_account",
        reference: input.accountReference,
        ...(input.newState ? { newState: input.newState } : {}),
      },
    );
  }
}
