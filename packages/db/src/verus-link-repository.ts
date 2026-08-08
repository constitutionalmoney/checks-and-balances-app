import type { Pool, PoolClient } from "pg";

import { appendAudit } from "./audit.js";
import {
  RepositoryConflictError,
  inSerializableTransaction,
  newId,
  requireOpaqueReference,
  type CommandContext,
} from "./repository-types.js";

export type VerusLinkTrustDomain = "participant" | "committee";
export type WalletLinkPurpose = "link_verusid" | "revalidate_verusid";
export type PersistedWalletChallengeState =
  "presented" | "consumed" | "expired" | "cancelled" | "rejected";
export type PersistedIdentityLinkState = "active" | "revalidation_required" | "unlinked";

export interface CreateWalletLinkChallengeInput {
  readonly externalReference: string;
  readonly accountReference: string;
  readonly trustDomain: VerusLinkTrustDomain;
  readonly purpose: WalletLinkPurpose;
  readonly network: "VRSCTEST";
  readonly nonceHash: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly pollingTokenDigest: string;
  readonly audience: string;
  readonly callbackUrl: string;
  readonly applicationIdentityAddress: string;
  readonly consentedScopes: readonly string[];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface WalletLinkChallengeRecord {
  readonly externalReference: string;
  readonly accountReference: string;
  readonly participantReference?: string;
  readonly trustDomain: VerusLinkTrustDomain;
  readonly purpose: WalletLinkPurpose;
  readonly state: PersistedWalletChallengeState;
  readonly network: "VRSCTEST";
  readonly nonceHash: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly audience: string;
  readonly callbackUrl: string;
  readonly applicationIdentityAddress: string;
  readonly consentedScopes: readonly string[];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly responseDigest?: string;
  readonly linkedIdentityAddress?: string;
  readonly version: number;
}

export interface CompleteWalletLinkChallengeInput {
  readonly requestId: string;
  readonly responseDigest: string;
  readonly identityAddress: string;
  readonly displayNameSnapshot?: string;
  readonly proofDigest: string;
  readonly proofMethod: "hosted_verusid_login_consent_v1";
  readonly requestSignerIdentity: string;
  readonly observedIdentityStatus: string;
  readonly observedIdentityBlockHeight: number;
  readonly observedIdentityTxid: string;
  readonly completedAt: Date;
}

export interface CompletedWalletLink {
  readonly kind: "completed";
  readonly replayed: boolean;
  readonly linkReference: string;
  readonly identityAddress: string;
  readonly state: "active";
}

export interface ExpiredWalletLinkChallenge {
  readonly kind: "expired";
}

export interface WalletLinkPollResult {
  readonly challengeReference: string;
  readonly state: PersistedWalletChallengeState;
  readonly expiresAt: Date;
  readonly linkReference?: string;
  readonly identityAddress?: string;
}

interface ChallengeRow {
  id: string;
  external_reference: string;
  account_id: string;
  account_reference: string;
  participant_reference: string | null;
  trust_domain: VerusLinkTrustDomain;
  purpose: WalletLinkPurpose;
  state: PersistedWalletChallengeState;
  network: "VRSCTEST";
  nonce_hash: string;
  request_id: string;
  request_digest: string;
  audience: string;
  callback_url: string;
  application_identity_address: string;
  consented_scopes: string[];
  issued_at: Date;
  expires_at: Date;
  response_digest: string | null;
  linked_identity_address: string | null;
  version: number;
}

export class VerusLinkRepository {
  constructor(private readonly pool: Pool) {}

  async createChallenge(
    input: CreateWalletLinkChallengeInput,
    context: CommandContext,
  ): Promise<WalletLinkChallengeRecord> {
    requireOpaqueReference(input.externalReference, "wallet challenge reference");
    requireOpaqueReference(input.accountReference, "account reference");
    requireDigest(input.nonceHash, "nonce hash");
    requireDigest(input.requestDigest, "request digest");
    requireDigest(input.pollingTokenDigest, "polling token digest");
    if (input.expiresAt <= input.issuedAt) {
      throw new RepositoryConflictError("wallet challenge expiry must follow issuance");
    }
    if (input.network !== "VRSCTEST") {
      throw new RepositoryConflictError("wallet challenge network is unsupported");
    }

    return inSerializableTransaction(this.pool, async (client) => {
      const account = await this.account(client, input.accountReference, input.trustDomain);
      const challengeId = newId();
      await client.query(
        `INSERT INTO "wallet_challenge" (
          "id", "external_reference", "auth_account_id", "participant_id", "trust_domain",
          "state", "network", "purpose", "nonce_hash", "request_id", "request_digest",
          "polling_token_digest", "audience", "callback_url",
          "application_identity_address", "consented_scopes", "issued_at", "expires_at",
          "created_at", "updated_at"
        ) VALUES (
          $1,$2,$3,$4,$5,'presented','VRSCTEST',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$15,$15
        )`,
        [
          challengeId,
          input.externalReference,
          account.id,
          account.participant_id,
          input.trustDomain,
          input.purpose,
          input.nonceHash,
          input.requestId,
          input.requestDigest,
          input.pollingTokenDigest,
          input.audience,
          input.callbackUrl,
          input.applicationIdentityAddress,
          [...input.consentedScopes].sort(),
          input.issuedAt,
          input.expiresAt,
        ],
      );
      await appendAudit(client, context, null, "createWalletLinkChallenge", {
        type: "wallet_challenge",
        reference: input.externalReference,
        newState: "presented",
      });
      return this.challengeById(client, challengeId, false);
    });
  }

  async challengeForPoll(
    accountReference: string,
    pollingTokenDigest: string,
  ): Promise<WalletLinkChallengeRecord> {
    requireOpaqueReference(accountReference, "account reference");
    requireDigest(pollingTokenDigest, "polling token digest");
    const result = await this.pool.query<ChallengeRow>(
      challengeSelect('aa."external_reference" = $1 AND wc."polling_token_digest" = $2'),
      [accountReference, pollingTokenDigest],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("wallet challenge is unavailable");
    return mapChallenge(row);
  }

  async completeChallenge(
    input: CompleteWalletLinkChallengeInput,
    context: CommandContext,
  ): Promise<CompletedWalletLink | ExpiredWalletLinkChallenge> {
    requireDigest(input.responseDigest, "response digest");
    requireDigest(input.proofDigest, "proof digest");
    requireDigest(input.observedIdentityTxid, "observed identity transaction identifier");

    return inSerializableTransaction(this.pool, async (client) => {
      const challengeResult = await client.query<ChallengeRow>(
        `${challengeSelect('wc."request_id" = $1')} FOR UPDATE OF wc`,
        [input.requestId],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge) throw new RepositoryConflictError("wallet challenge is unavailable");

      if (challenge.state === "consumed") {
        if (
          challenge.response_digest !== input.responseDigest ||
          challenge.linked_identity_address !== input.identityAddress
        ) {
          throw new RepositoryConflictError("wallet challenge was already consumed");
        }
        const link = await this.linkForAccountAndIdentity(
          client,
          challenge.account_id,
          input.identityAddress,
        );
        return {
          kind: "completed",
          replayed: true,
          linkReference: link.external_reference,
          identityAddress: input.identityAddress,
          state: "active",
        };
      }
      if (challenge.state !== "presented") {
        throw new RepositoryConflictError("wallet challenge is unavailable");
      }
      if (input.completedAt >= challenge.expires_at) {
        await client.query(
          `UPDATE "wallet_challenge"
           SET "state" = 'expired', "version" = "version" + 1, "updated_at" = $2
           WHERE "id" = $1`,
          [challenge.id, input.completedAt],
        );
        await appendAudit(client, context, null, "expireWalletLinkChallenge", {
          type: "wallet_challenge",
          reference: challenge.external_reference,
          priorState: "presented",
          newState: "expired",
        });
        return { kind: "expired" };
      }

      const existing = await client.query<{
        id: string;
        external_reference: string;
        state: PersistedIdentityLinkState;
      }>(
        `SELECT "id", "external_reference", "state"
         FROM "verus_identity_link"
         WHERE "auth_account_id" = $1 AND "network" = 'VRSCTEST' AND "identity_address" = $2
         FOR UPDATE`,
        [challenge.account_id, input.identityAddress],
      );
      const existingLink = existing.rows[0];
      const linkId = existingLink?.id ?? newId();
      const linkReference =
        existingLink?.external_reference ?? `verus_link_${newId().replaceAll("-", "")}`;
      if (existingLink) {
        await client.query(
          `UPDATE "verus_identity_link"
           SET "display_name_snapshot" = $2, "proof_method" = $3, "proof_digest" = $4,
             "request_signer_identity" = $5, "observed_identity_status" = $6,
             "observed_identity_block_height" = $7, "observed_identity_txid" = $8,
             "consented_scopes" = $9, "state" = 'active', "revalidated_at" = $10,
             "revalidation_reason" = NULL, "unlinked_at" = NULL,
             "version" = "version" + 1, "updated_at" = $10
           WHERE "id" = $1`,
          [
            linkId,
            input.displayNameSnapshot ?? null,
            input.proofMethod,
            input.proofDigest,
            input.requestSignerIdentity,
            input.observedIdentityStatus,
            input.observedIdentityBlockHeight,
            input.observedIdentityTxid,
            challenge.consented_scopes,
            input.completedAt,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO "verus_identity_link" (
            "id", "external_reference", "auth_account_id", "participant_id", "trust_domain",
            "identity_address", "display_name_snapshot", "network", "proof_method", "proof_digest",
            "request_signer_identity", "observed_identity_status", "observed_identity_block_height",
            "observed_identity_txid", "consented_scopes", "state", "linked_at", "created_at", "updated_at"
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,'VRSCTEST',$8,$9,$10,$11,$12,$13,$14,'active',$15,$15,$15)`,
          [
            linkId,
            linkReference,
            challenge.account_id,
            challenge.participant_reference
              ? await this.participantId(client, challenge.participant_reference)
              : null,
            challenge.trust_domain,
            input.identityAddress,
            input.displayNameSnapshot ?? null,
            input.proofMethod,
            input.proofDigest,
            input.requestSignerIdentity,
            input.observedIdentityStatus,
            input.observedIdentityBlockHeight,
            input.observedIdentityTxid,
            challenge.consented_scopes,
            input.completedAt,
          ],
        );
      }

      await client.query(
        `UPDATE "wallet_challenge"
         SET "state" = 'consumed', "response_digest" = $2, "linked_identity_address" = $3,
           "consumed_at" = $4, "version" = "version" + 1, "updated_at" = $4
         WHERE "id" = $1`,
        [challenge.id, input.responseDigest, input.identityAddress, input.completedAt],
      );
      await appendAudit(client, context, null, "consumeWalletLinkChallenge", {
        type: "wallet_challenge",
        reference: challenge.external_reference,
        priorState: "presented",
        newState: "consumed",
      });
      await appendAudit(
        client,
        context,
        null,
        existingLink ? "revalidateVerusIdentityLink" : "createVerusIdentityLink",
        {
          type: "verus_identity_link",
          reference: linkReference,
          ...(existingLink ? { priorState: existingLink.state } : {}),
          newState: "active",
        },
      );
      return {
        kind: "completed",
        replayed: false,
        linkReference,
        identityAddress: input.identityAddress,
        state: "active",
      };
    });
  }

  async pollChallenge(
    accountReference: string,
    pollingTokenDigest: string,
    now: Date,
    context: CommandContext,
  ): Promise<WalletLinkPollResult> {
    requireOpaqueReference(accountReference, "account reference");
    requireDigest(pollingTokenDigest, "polling token digest");
    return inSerializableTransaction(this.pool, async (client) => {
      const result = await client.query<ChallengeRow>(
        `${challengeSelect(
          'aa."external_reference" = $1 AND wc."polling_token_digest" = $2',
        )} FOR UPDATE OF wc`,
        [accountReference, pollingTokenDigest],
      );
      const challenge = result.rows[0];
      if (!challenge) throw new RepositoryConflictError("wallet challenge is unavailable");
      let state = challenge.state;
      if (state === "presented" && now >= challenge.expires_at) {
        await client.query(
          `UPDATE "wallet_challenge"
           SET "state" = 'expired', "version" = "version" + 1, "updated_at" = $2
           WHERE "id" = $1`,
          [challenge.id, now],
        );
        await appendAudit(client, context, null, "expireWalletLinkChallenge", {
          type: "wallet_challenge",
          reference: challenge.external_reference,
          priorState: "presented",
          newState: "expired",
        });
        state = "expired";
      }
      const link =
        state === "consumed" && challenge.linked_identity_address
          ? await this.linkForAccountAndIdentity(
              client,
              challenge.account_id,
              challenge.linked_identity_address,
            )
          : undefined;
      return {
        challengeReference: challenge.external_reference,
        state,
        expiresAt: challenge.expires_at,
        ...(link
          ? {
              linkReference: link.external_reference,
              identityAddress: challenge.linked_identity_address!,
            }
          : {}),
      };
    });
  }

  async cancelChallenge(
    accountReference: string,
    challengeReference: string,
    cancelledAt: Date,
    context: CommandContext,
  ): Promise<void> {
    requireOpaqueReference(accountReference, "account reference");
    requireOpaqueReference(challengeReference, "wallet challenge reference");
    await inSerializableTransaction(this.pool, async (client) => {
      const result = await client.query<ChallengeRow>(
        `${challengeSelect(
          'aa."external_reference" = $1 AND wc."external_reference" = $2',
        )} FOR UPDATE OF wc`,
        [accountReference, challengeReference],
      );
      const challenge = result.rows[0];
      if (!challenge) throw new RepositoryConflictError("wallet challenge is unavailable");
      if (challenge.state === "cancelled") return;
      if (challenge.state !== "presented") {
        throw new RepositoryConflictError("wallet challenge is unavailable");
      }
      if (cancelledAt >= challenge.expires_at) {
        await client.query(
          `UPDATE "wallet_challenge"
           SET "state" = 'expired', "version" = "version" + 1, "updated_at" = $2
           WHERE "id" = $1`,
          [challenge.id, cancelledAt],
        );
        await appendAudit(client, context, null, "expireWalletLinkChallenge", {
          type: "wallet_challenge",
          reference: challenge.external_reference,
          priorState: "presented",
          newState: "expired",
        });
        return;
      }
      await client.query(
        `UPDATE "wallet_challenge"
         SET "state" = 'cancelled', "rejection_reason" = 'user_cancelled',
           "version" = "version" + 1, "updated_at" = $2
         WHERE "id" = $1`,
        [challenge.id, cancelledAt],
      );
      await appendAudit(client, context, null, "cancelWalletLinkChallenge", {
        type: "wallet_challenge",
        reference: challenge.external_reference,
        priorState: "presented",
        newState: "cancelled",
      });
    });
  }

  async unlink(
    accountReference: string,
    linkReference: string,
    unlinkedAt: Date,
    context: CommandContext,
  ): Promise<void> {
    requireOpaqueReference(accountReference, "account reference");
    requireOpaqueReference(linkReference, "Verus identity link reference");
    await inSerializableTransaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        state: PersistedIdentityLinkState;
      }>(
        `SELECT vl."id", vl."state"
         FROM "verus_identity_link" vl
         JOIN "auth_account" aa ON aa."id" = vl."auth_account_id"
         WHERE aa."external_reference" = $1 AND vl."external_reference" = $2
         FOR UPDATE OF vl`,
        [accountReference, linkReference],
      );
      const link = result.rows[0];
      if (!link || link.state === "unlinked") {
        throw new RepositoryConflictError("Verus identity link is unavailable");
      }
      await client.query(
        `UPDATE "verus_identity_link"
         SET "state" = 'unlinked', "unlinked_at" = $2, "version" = "version" + 1,
           "updated_at" = $2
         WHERE "id" = $1`,
        [link.id, unlinkedAt],
      );
      await appendAudit(client, context, null, "unlinkVerusIdentity", {
        type: "verus_identity_link",
        reference: linkReference,
        priorState: link.state,
        newState: "unlinked",
      });
    });
  }

  async requireRevalidation(
    identityAddress: string,
    reason: "identity_recovered" | "identity_revoked" | "identity_revision_changed",
    observedAt: Date,
    context: CommandContext,
  ): Promise<number> {
    return inSerializableTransaction(this.pool, async (client) => {
      const links = await client.query<{ id: string; external_reference: string }>(
        `SELECT "id", "external_reference"
         FROM "verus_identity_link"
         WHERE "network" = 'VRSCTEST' AND "identity_address" = $1 AND "state" = 'active'
         FOR UPDATE`,
        [identityAddress],
      );
      for (const link of links.rows) {
        await client.query(
          `UPDATE "verus_identity_link"
           SET "state" = 'revalidation_required', "revalidation_reason" = $2,
             "version" = "version" + 1, "updated_at" = $3
           WHERE "id" = $1`,
          [link.id, reason, observedAt],
        );
        await appendAudit(client, context, null, "requireVerusIdentityRevalidation", {
          type: "verus_identity_link",
          reference: link.external_reference,
          priorState: "active",
          newState: "revalidation_required",
        });
      }
      return links.rowCount ?? 0;
    });
  }

  private async challengeById(
    client: PoolClient,
    challengeId: string,
    lock: boolean,
  ): Promise<WalletLinkChallengeRecord> {
    const result = await client.query<ChallengeRow>(
      `${challengeSelect('wc."id" = $1')}${lock ? " FOR UPDATE OF wc" : ""}`,
      [challengeId],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("wallet challenge is unavailable");
    return mapChallenge(row);
  }

  private async account(
    client: PoolClient,
    accountReference: string,
    trustDomain: VerusLinkTrustDomain,
  ): Promise<{ id: string; participant_id: string | null }> {
    const result = await client.query<{ id: string; participant_id: string | null }>(
      `SELECT "id", "participant_id"
       FROM "auth_account"
       WHERE "external_reference" = $1 AND "trust_domain" = $2 AND "state" = 'active'`,
      [accountReference, trustDomain],
    );
    const account = result.rows[0];
    if (!account) throw new RepositoryConflictError("account is unavailable");
    if (trustDomain === "participant" && !account.participant_id) {
      throw new RepositoryConflictError("participant account binding is unavailable");
    }
    return account;
  }

  private async participantId(client: PoolClient, reference: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      'SELECT "id" FROM "participant_account" WHERE "external_reference" = $1',
      [reference],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("participant is unavailable");
    return row.id;
  }

  private async linkForAccountAndIdentity(
    client: PoolClient,
    accountId: string,
    identityAddress: string,
  ): Promise<{ external_reference: string }> {
    const result = await client.query<{ external_reference: string }>(
      `SELECT "external_reference" FROM "verus_identity_link"
       WHERE "auth_account_id" = $1 AND "network" = 'VRSCTEST' AND "identity_address" = $2`,
      [accountId, identityAddress],
    );
    const row = result.rows[0];
    if (!row) throw new RepositoryConflictError("Verus identity link is unavailable");
    return row;
  }
}

function challengeSelect(predicate: string): string {
  return `SELECT wc."id", wc."external_reference", wc."auth_account_id" AS "account_id",
    aa."external_reference" AS "account_reference",
    pa."external_reference" AS "participant_reference", wc."trust_domain", wc."purpose",
    wc."state", wc."network", wc."nonce_hash", wc."request_id", wc."request_digest",
    wc."audience", wc."callback_url", wc."application_identity_address",
    wc."consented_scopes", wc."issued_at", wc."expires_at", wc."response_digest",
    wc."linked_identity_address", wc."version"
    FROM "wallet_challenge" wc
    JOIN "auth_account" aa ON aa."id" = wc."auth_account_id"
    LEFT JOIN "participant_account" pa ON pa."id" = wc."participant_id"
    WHERE ${predicate}`;
}

function mapChallenge(row: ChallengeRow): WalletLinkChallengeRecord {
  return Object.freeze({
    externalReference: row.external_reference,
    accountReference: row.account_reference,
    ...(row.participant_reference ? { participantReference: row.participant_reference } : {}),
    trustDomain: row.trust_domain,
    purpose: row.purpose,
    state: row.state,
    network: row.network,
    nonceHash: row.nonce_hash,
    requestId: row.request_id,
    requestDigest: row.request_digest,
    audience: row.audience,
    callbackUrl: row.callback_url,
    applicationIdentityAddress: row.application_identity_address,
    consentedScopes: Object.freeze([...row.consented_scopes]),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    ...(row.response_digest ? { responseDigest: row.response_digest } : {}),
    ...(row.linked_identity_address ? { linkedIdentityAddress: row.linked_identity_address } : {}),
    version: row.version,
  });
}

function requireDigest(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new RepositoryConflictError(`${field} must be a lowercase SHA-256 digest`);
  }
}
