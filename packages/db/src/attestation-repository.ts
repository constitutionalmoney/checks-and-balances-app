import {
  activateAttestation,
  createAttestationValidity,
  expireAttestation,
  revokeAttestation,
  supersedeAttestation,
  type CanonicalAttestationStatus,
} from "@cbc/domain";
import type { Pool, PoolClient } from "pg";

import { appendAudit } from "./audit.js";
import {
  IdempotencyConflictError,
  inSerializableTransaction,
  newId,
  RepositoryConflictError,
  requireOpaqueReference,
  sha256,
  TenantBoundaryError,
  type CommandContext,
} from "./repository-types.js";

export interface AttestationRecord {
  readonly externalReference: string;
  readonly committeeReference: string;
  readonly participantReference: string;
  readonly requestReference: string;
  readonly version: number;
  readonly state: "issued" | "active" | "expired" | "revoked" | "superseded";
  readonly validFrom: Date;
  readonly expiresAt: Date;
  readonly supersedesReference?: string;
  readonly statusVersion: number;
  readonly replayed: boolean;
}

interface AttestationRow {
  readonly id: string;
  readonly external_reference: string;
  readonly committee_id: string;
  readonly committee_reference: string;
  readonly participant_id: string;
  readonly participant_reference: string;
  readonly request_id: string;
  readonly request_reference: string;
  readonly request_state: string;
  readonly request_version: number;
  readonly policy_version_id: string;
  readonly version: number;
  readonly state: AttestationRecord["state"];
  readonly valid_from: Date;
  readonly expires_at: Date;
  readonly issuance_complete: boolean;
  readonly supersedes_id: string | null;
  readonly supersedes_reference: string | null;
  readonly status_version: number;
}

interface IdempotencyResult {
  readonly id: string;
  readonly replayed: boolean;
  readonly resultReference?: string;
  readonly resultState?: string;
  readonly resultVersion?: number;
}

export interface IssueAttestationInput {
  readonly id?: string;
  readonly externalReference: string;
  readonly requestReference: string;
  readonly policyVersionId: string;
  readonly validFrom: Date;
  readonly expiresAt: Date;
  readonly supersedesReference?: string;
  readonly context: CommandContext;
}

export interface MutateAttestationInput {
  readonly attestationReference: string;
  readonly expectedStatusVersion: number;
  readonly observedAt: Date;
  readonly context: CommandContext;
}

export interface RevokeAttestationInput extends MutateAttestationInput {
  readonly revocationId?: string;
  readonly policyVersionId: string;
}

export class AttestationRepository {
  constructor(private readonly pool: Pool) {}

  async issue(input: IssueAttestationInput): Promise<AttestationRecord> {
    requireOpaqueReference(input.externalReference, "attestation external reference");
    requireOpaqueReference(input.requestReference, "verification request reference");

    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(
        client,
        committeeId,
        "issueAttestation",
        input.context,
      );
      if (idempotency.replayed)
        return this.replayRecord(
          await this.load(client, committeeId, input.externalReference, true),
          idempotency,
        );

      const request = await client.query<{
        id: string;
        participant_id: string;
        participant_reference: string;
        state: string;
      }>(
        `SELECT r."id", r."participant_id", r."state",
          p."external_reference" AS "participant_reference"
         FROM "verification_request" r
         JOIN "participant_account" p ON p."id" = r."participant_id"
         WHERE r."external_reference" = $1 AND r."committee_id" = $2 FOR UPDATE OF r`,
        [input.requestReference, committeeId],
      );
      const requestRow = request.rows[0];
      if (!requestRow) throw new TenantBoundaryError();
      if (requestRow.state !== "issued") {
        throw new RepositoryConflictError("attestation issuance requires an issued request");
      }

      let version = 1;
      let supersedesId: string | null = null;
      if (input.supersedesReference) {
        const predecessor = await client.query<{
          id: string;
          participant_id: string;
          version: number;
          state: string;
        }>(
          `SELECT "id", "participant_id", "version", "state" FROM "attestation"
           WHERE "external_reference" = $1 AND "committee_id" = $2 FOR UPDATE`,
          [input.supersedesReference, committeeId],
        );
        const prior = predecessor.rows[0];
        if (
          !prior ||
          prior.participant_id !== requestRow.participant_id ||
          prior.state !== "active"
        ) {
          throw new RepositoryConflictError(
            "renewal predecessor must be the active participant attestation",
          );
        }
        version = prior.version + 1;
        supersedesId = prior.id;
      }

      createAttestationValidity({
        version,
        validFrom: input.validFrom,
        expiresAt: input.expiresAt,
        ...(input.supersedesReference
          ? { supersedesReference: input.supersedesReference }
          : undefined),
      });
      const id = input.id ?? newId();
      await client.query(
        `INSERT INTO "attestation" (
          "id", "external_reference", "committee_id", "participant_id", "request_id",
          "policy_version_id", "version", "valid_from", "expires_at", "supersedes_id"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          input.externalReference,
          committeeId,
          requestRow.participant_id,
          requestRow.id,
          input.policyVersionId,
          version,
          input.validFrom,
          input.expiresAt,
          supersedesId,
        ],
      );
      await client.query(
        `INSERT INTO "attestation_status" ("attestation_id", "committee_id", "state", "effective_at")
         VALUES ($1,$2,'issued',$3)`,
        [id, committeeId, input.validFrom],
      );
      await appendAudit(client, input.context, committeeId, "issueAttestation", {
        type: "attestation",
        reference: input.externalReference,
        newState: "issued",
      });
      await this.enqueue(
        client,
        committeeId,
        input.externalReference,
        "AttestationIssued",
        version,
        "issued",
        input.context,
      );
      await this.completeIdempotency(client, idempotency.id, input.externalReference, 1, "issued");
      return this.load(client, committeeId, input.externalReference, false);
    });
  }

  activate(input: MutateAttestationInput): Promise<AttestationRecord> {
    return this.changeActiveState("activateAttestation", "active", input);
  }

  expire(input: MutateAttestationInput): Promise<AttestationRecord> {
    return this.changeActiveState("expireAttestation", "expired", input);
  }

  async revoke(input: RevokeAttestationInput): Promise<AttestationRecord> {
    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(
        client,
        committeeId,
        "revokeAttestation",
        input.context,
      );
      if (idempotency.replayed)
        return this.replayRecord(
          await this.load(client, committeeId, input.attestationReference, true),
          idempotency,
        );
      const row = await this.loadRow(client, committeeId, input.attestationReference, true);
      if (row.status_version !== input.expectedStatusVersion) {
        throw new RepositoryConflictError("attestation status version is stale");
      }
      const next = revokeAttestation(row.state as "active") as "revoked";
      await client.query(
        `INSERT INTO "attestation_revocation" (
          "id", "attestation_id", "committee_id", "policy_version_id", "reason_category", "effective_at"
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.revocationId ?? newId(),
          row.id,
          committeeId,
          input.policyVersionId,
          input.context.reasonCategory,
          input.observedAt,
        ],
      );
      await this.updateAttestationAndRequest(client, row, next, input.observedAt, false);
      await appendAudit(client, input.context, committeeId, "revokeAttestation", {
        type: "attestation",
        reference: input.attestationReference,
        priorState: row.state,
        newState: next,
      });
      await this.enqueue(
        client,
        committeeId,
        input.attestationReference,
        "AttestationRevoked",
        row.version,
        next,
        input.context,
      );
      await this.completeIdempotency(
        client,
        idempotency.id,
        input.attestationReference,
        row.status_version + 1,
        next,
      );
      return this.load(client, committeeId, input.attestationReference, false);
    });
  }

  async statusAt(
    committeeReference: string,
    attestationReference: string,
    observedAt: Date,
  ): Promise<CanonicalAttestationStatus> {
    const result = await this.pool.query<{ status: CanonicalAttestationStatus }>(
      `SELECT "cbc_attestation_status_at"(a."id", $3) AS "status"
       FROM "attestation" a JOIN "committee" c ON c."id" = a."committee_id"
       WHERE c."external_reference" = $1 AND a."external_reference" = $2`,
      [committeeReference, attestationReference, observedAt],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return result.rows[0].status;
  }

  private async changeActiveState(
    command: "activateAttestation" | "expireAttestation",
    targetState: "active" | "expired",
    input: MutateAttestationInput,
  ): Promise<AttestationRecord> {
    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(client, committeeId, command, input.context);
      if (idempotency.replayed)
        return this.replayRecord(
          await this.load(client, committeeId, input.attestationReference, true),
          idempotency,
        );
      const row = await this.loadRow(client, committeeId, input.attestationReference, true);
      if (row.status_version !== input.expectedStatusVersion) {
        throw new RepositoryConflictError("attestation status version is stale");
      }

      let next: "active" | "expired";
      if (targetState === "active") {
        if (input.observedAt < row.valid_from || input.observedAt >= row.expires_at) {
          throw new RepositoryConflictError(
            "attestation cannot activate outside its validity window",
          );
        }
        next = activateAttestation(row.request_state as "issued") as "active";
      } else {
        if (input.observedAt < row.expires_at) {
          throw new RepositoryConflictError("attestation cannot expire before its exact boundary");
        }
        next = expireAttestation(row.request_state as "active") as "expired";
      }

      await this.updateAttestationAndRequest(
        client,
        row,
        next,
        input.observedAt,
        targetState === "active",
      );

      if (targetState === "active" && row.supersedes_id) {
        const predecessor = await this.loadRowById(client, row.supersedes_id, committeeId);
        const superseded = supersedeAttestation(
          predecessor.request_state as "active",
        ) as "superseded";
        await this.updateAttestationAndRequest(
          client,
          predecessor,
          superseded,
          input.observedAt,
          false,
        );
        await appendAudit(client, input.context, committeeId, "supersedePriorAttestation", {
          type: "attestation",
          reference: predecessor.external_reference,
          priorState: predecessor.state,
          newState: superseded,
        });
        await this.enqueue(
          client,
          committeeId,
          predecessor.external_reference,
          "AttestationSuperseded",
          predecessor.version,
          superseded,
          input.context,
        );
      }

      await appendAudit(client, input.context, committeeId, command, {
        type: "attestation",
        reference: input.attestationReference,
        priorState: row.state,
        newState: next,
      });
      await this.enqueue(
        client,
        committeeId,
        input.attestationReference,
        targetState === "active" ? "AttestationActivated" : "AttestationExpired",
        row.version,
        next,
        input.context,
      );
      await this.completeIdempotency(
        client,
        idempotency.id,
        input.attestationReference,
        row.status_version + 1,
        next,
      );
      return this.load(client, committeeId, input.attestationReference, false);
    });
  }

  private async updateAttestationAndRequest(
    client: PoolClient,
    row: AttestationRow,
    state: "active" | "expired" | "revoked" | "superseded",
    effectiveAt: Date,
    issuanceComplete: boolean,
  ): Promise<void> {
    await client.query(
      `UPDATE "attestation" SET "state" = $1,
        "issuance_complete" = CASE WHEN $2 THEN true ELSE "issuance_complete" END
       WHERE "id" = $3`,
      [state, issuanceComplete, row.id],
    );
    await client.query(
      `UPDATE "attestation_status" SET "state" = $1, "effective_at" = $2,
        "version" = "version" + 1 WHERE "attestation_id" = $3`,
      [state, effectiveAt, row.id],
    );
    await client.query(
      `UPDATE "verification_request" SET "state" = $1, "version" = "version" + 1,
        "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "version" = $3`,
      [state, row.request_id, row.request_version],
    );
  }

  private async load(
    client: PoolClient,
    committeeId: string,
    reference: string,
    replayed: boolean,
  ): Promise<AttestationRecord> {
    const row = await this.loadRow(client, committeeId, reference, false);
    return {
      externalReference: row.external_reference,
      committeeReference: row.committee_reference,
      participantReference: row.participant_reference,
      requestReference: row.request_reference,
      version: row.version,
      state: row.state,
      validFrom: row.valid_from,
      expiresAt: row.expires_at,
      ...(row.supersedes_reference ? { supersedesReference: row.supersedes_reference } : undefined),
      statusVersion: row.status_version,
      replayed,
    };
  }

  private async loadRow(
    client: PoolClient,
    committeeId: string,
    reference: string,
    lock: boolean,
  ): Promise<AttestationRow> {
    const result = await client.query<AttestationRow>(
      `SELECT a.*, c."external_reference" AS "committee_reference",
        p."external_reference" AS "participant_reference",
        r."external_reference" AS "request_reference", r."state" AS "request_state",
        r."version" AS "request_version", s."version" AS "status_version",
        prior."external_reference" AS "supersedes_reference"
       FROM "attestation" a
       JOIN "committee" c ON c."id" = a."committee_id"
       JOIN "participant_account" p ON p."id" = a."participant_id"
       JOIN "verification_request" r ON r."id" = a."request_id"
       JOIN "attestation_status" s ON s."attestation_id" = a."id"
       LEFT JOIN "attestation" prior ON prior."id" = a."supersedes_id"
       WHERE a."committee_id" = $1 AND a."external_reference" = $2${lock ? " FOR UPDATE OF a, r, s" : ""}`,
      [committeeId, reference],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return result.rows[0];
  }

  private async loadRowById(
    client: PoolClient,
    id: string,
    committeeId: string,
  ): Promise<AttestationRow> {
    const reference = await client.query<{ external_reference: string }>(
      'SELECT "external_reference" FROM "attestation" WHERE "id" = $1 AND "committee_id" = $2',
      [id, committeeId],
    );
    if (!reference.rows[0]) throw new TenantBoundaryError();
    return this.loadRow(client, committeeId, reference.rows[0].external_reference, true);
  }

  private async committeeId(client: PoolClient, reference: string): Promise<string> {
    requireOpaqueReference(reference, "committee reference");
    const result = await client.query<{ id: string }>(
      'SELECT "id" FROM "committee" WHERE "external_reference" = $1',
      [reference],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return result.rows[0].id;
  }

  private async beginIdempotency(
    client: PoolClient,
    committeeId: string,
    command: string,
    context: CommandContext,
  ): Promise<IdempotencyResult> {
    const scope = `committee:${context.committeeReference}`;
    const keyHash = sha256(context.idempotencyKey);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO "idempotency_record" (
        "id", "scope", "key_hash", "request_digest", "command", "actor_type",
        "actor_reference", "committee_id"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT ("scope", "key_hash") DO NOTHING RETURNING "id"`,
      [
        newId(),
        scope,
        keyHash,
        context.requestDigest,
        command,
        context.actor.type,
        context.actor.reference,
        committeeId,
      ],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, replayed: false };
    const existing = await client.query<{
      id: string;
      request_digest: string;
      command: string;
      committee_id: string;
      state: string;
      result_reference: string | null;
      result_state: string | null;
      result_version: number | null;
    }>(
      `SELECT "id", "request_digest", "command", "committee_id", "state",
        "result_reference", "result_state", "result_version"
       FROM "idempotency_record" WHERE "scope" = $1 AND "key_hash" = $2 FOR UPDATE`,
      [scope, keyHash],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.request_digest !== context.requestDigest ||
      row.command !== command ||
      row.committee_id !== committeeId ||
      row.state !== "completed"
    ) {
      throw new IdempotencyConflictError();
    }
    if (!row.result_reference || !row.result_state || !row.result_version) {
      throw new IdempotencyConflictError();
    }
    return {
      id: row.id,
      replayed: true,
      resultReference: row.result_reference,
      resultState: row.result_state,
      resultVersion: row.result_version,
    };
  }

  private async completeIdempotency(
    client: PoolClient,
    id: string,
    reference: string,
    version: number,
    state: string,
  ): Promise<void> {
    await client.query(
      `UPDATE "idempotency_record" SET "state" = 'completed', "result_digest" = $1,
       "result_reference" = $2, "result_version" = $3, "result_state" = $4,
       "completed_at" = CURRENT_TIMESTAMP WHERE "id" = $5 AND "state" = 'started'`,
      [sha256(`${reference}|${version}|${state}`), reference, version, state, id],
    );
  }

  private replayRecord(
    record: AttestationRecord,
    idempotency: IdempotencyResult,
  ): AttestationRecord {
    if (
      idempotency.resultReference !== record.externalReference ||
      !idempotency.resultState ||
      !idempotency.resultVersion
    ) {
      throw new IdempotencyConflictError();
    }
    return {
      ...record,
      state: idempotency.resultState as AttestationRecord["state"],
      statusVersion: idempotency.resultVersion,
      replayed: true,
    };
  }

  private async enqueue(
    client: PoolClient,
    committeeId: string,
    reference: string,
    eventType: string,
    version: number,
    state: string,
    context: CommandContext,
  ): Promise<void> {
    await client.query(
      `INSERT INTO "outbox_event" (
        "id", "committee_id", "event_type", "aggregate_type", "aggregate_reference",
        "schema_version", "payload_reference", "payload_digest", "idempotency_key_hash"
      ) VALUES ($1,$2,$3,'attestation',$4,'issue-16-v1',$5,$6,$7)`,
      [
        newId(),
        committeeId,
        eventType,
        reference,
        `domain:${reference}:v${version}:${state}`,
        sha256(`${eventType}|${reference}|${version}|${state}`),
        sha256(`${context.committeeReference}|${context.idempotencyKey}|${eventType}`),
      ],
    );
  }
}
