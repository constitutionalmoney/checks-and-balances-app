import type { Pool, PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";

import { appendAudit } from "./audit.js";
import {
  inSerializableTransaction,
  newId,
  RepositoryConflictError,
  requireOpaqueReference,
  sha256,
  type CommandContext,
} from "./repository-types.js";
import type { OutboxWorkerContext } from "./outbox-repository.js";

export const VERUS_ANCHOR_EVENT_TYPE = "verus.anchor.requested" as const;
export const VRSCTEST_CHAIN_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq" as const;

export type PersistedVerusJobState =
  | "pending"
  | "claimed"
  | "preflight"
  | "submitted"
  | "confirming"
  | "readback"
  | "verified"
  | "retryable_failed"
  | "terminal_failed"
  | "reorg_pending";

export interface EnqueueVerusAnchorInput {
  readonly externalReference: string;
  readonly committeeReference?: string;
  readonly operationType: string;
  readonly subjectReference: string;
  readonly targetIdentity: string;
  readonly vdxfUri: string;
  readonly vdxfKey: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly manifestCanonical: string;
  readonly manifestDigest: string;
  readonly manifestPolicyReference: string;
  readonly manifestAllowedFields: readonly string[];
  readonly manifestRequiredFields: readonly string[];
  readonly manifestMaximumBytes: number;
  readonly confirmationRequirement: number;
}

export interface VerusJobRecord {
  readonly id: string;
  readonly outboxEventId: string;
  readonly committeeReference?: string;
  readonly operationType: string;
  readonly subjectReference: string;
  readonly targetIdentity: string;
  readonly vdxfUri: string;
  readonly vdxfKey: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly manifestCanonical: string;
  readonly manifestDigest: string;
  readonly manifestPolicyReference: string;
  readonly manifestAllowedFields: readonly string[];
  readonly manifestRequiredFields: readonly string[];
  readonly manifestMaximumBytes: number;
  readonly confirmationRequirement: number;
  readonly state: PersistedVerusJobState;
  readonly transactionId?: string;
  readonly blockHeight?: number;
  readonly blockHash?: string;
  readonly readbackDigest?: string;
  readonly submissionAmbiguous: boolean;
  readonly lastErrorClass?: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface VerusJobRow {
  readonly id: string;
  readonly outbox_event_id: string;
  readonly committee_id: string | null;
  readonly committee_reference: string | null;
  readonly operation_type: string;
  readonly subject_reference: string;
  readonly target_identity: string | null;
  readonly vdxf_uri: string | null;
  readonly vdxf_key: string;
  readonly manifest_json: unknown;
  readonly manifest_canonical: string | null;
  readonly manifest_digest: string;
  readonly manifest_policy_reference: string | null;
  readonly manifest_allowed_fields: string[];
  readonly manifest_required_fields: string[];
  readonly manifest_maximum_bytes: number | null;
  readonly confirmation_requirement: number;
  readonly state: PersistedVerusJobState;
  readonly transaction_id: string | null;
  readonly block_height: string | null;
  readonly block_hash: string | null;
  readonly readback_digest: string | null;
  readonly submission_ambiguous: boolean;
  readonly last_error_class: string | null;
  readonly version: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface TransitionEvidence {
  readonly transactionId?: string;
  readonly blockHeight?: number;
  readonly blockHash?: string;
  readonly readbackDigest?: string;
  readonly submissionAmbiguous?: boolean;
  readonly errorClass?: string;
  readonly submittedAt?: Date;
  readonly confirmedAt?: Date;
  readonly readbackAt?: Date;
  readonly reorgDetectedAt?: Date;
}

export class VerusJobRepository {
  constructor(private readonly pool: Pool) {}

  async enqueueAnchor(
    input: EnqueueVerusAnchorInput,
    context: CommandContext,
  ): Promise<VerusJobRecord> {
    this.validateInput(input, context);
    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = input.committeeReference
        ? await this.resolveCommittee(client, input.committeeReference)
        : null;
      const keyHash = sha256(context.idempotencyKey);
      const existing = await client.query<VerusJobRow>(
        `${this.selectJob()} WHERE o."idempotency_key_hash" = $1 FOR UPDATE OF o, j`,
        [keyHash],
      );
      if (existing.rows[0]) {
        const replay = this.toRecord(existing.rows[0]);
        if (
          replay.manifestDigest !== input.manifestDigest ||
          replay.targetIdentity !== input.targetIdentity ||
          replay.vdxfKey !== input.vdxfKey
        ) {
          throw new RepositoryConflictError("Verus idempotency key conflicts with existing work");
        }
        return replay;
      }

      const outboxEventId = newId();
      const jobId = newId();
      await client.query(
        `INSERT INTO "outbox_event" (
          "id", "committee_id", "event_type", "aggregate_type", "aggregate_reference",
          "schema_version", "payload_reference", "payload_digest", "idempotency_key_hash"
        ) VALUES ($1,$2,$3,'verus_identity',$4,$5,$6,$7,$8)`,
        [
          outboxEventId,
          committeeId,
          VERUS_ANCHOR_EVENT_TYPE,
          input.targetIdentity,
          input.manifestPolicyReference,
          `verus_job:${input.externalReference}`,
          input.manifestDigest,
          keyHash,
        ],
      );
      await client.query(
        `INSERT INTO "verus_job" (
          "id", "outbox_event_id", "committee_id", "chain_id", "operation_type",
          "subject_reference", "target_identity", "vdxf_uri", "vdxf_key", "manifest_json",
          "manifest_canonical", "manifest_digest", "manifest_policy_reference",
          "manifest_allowed_fields", "manifest_required_fields", "manifest_maximum_bytes",
          "confirmation_requirement", "updated_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,CURRENT_TIMESTAMP)`,
        [
          jobId,
          outboxEventId,
          committeeId,
          VRSCTEST_CHAIN_ID,
          input.operationType,
          input.subjectReference,
          input.targetIdentity,
          input.vdxfUri,
          input.vdxfKey,
          JSON.stringify(input.manifest),
          input.manifestCanonical,
          input.manifestDigest,
          input.manifestPolicyReference,
          input.manifestAllowedFields,
          input.manifestRequiredFields,
          input.manifestMaximumBytes,
          input.confirmationRequirement,
        ],
      );
      await client.query(
        `INSERT INTO "anchor_record" (
          "id", "external_reference", "committee_id", "outbox_event_id", "chain_id",
          "anchor_type", "subject_reference", "vdxf_key", "manifest_digest", "updated_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)`,
        [
          newId(),
          input.externalReference,
          committeeId,
          outboxEventId,
          VRSCTEST_CHAIN_ID,
          input.operationType,
          input.subjectReference,
          input.vdxfKey,
          input.manifestDigest,
        ],
      );
      await appendAudit(client, context, committeeId, "enqueueVerusAnchor", {
        type: "verus_job",
        reference: jobId,
        newState: "pending",
      });
      return this.load(client, outboxEventId);
    });
  }

  async loadForClaim(
    outboxEventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
  ): Promise<VerusJobRecord> {
    return inSerializableTransaction(this.pool, async (client) => {
      await this.requireLease(client, outboxEventId, worker, observedAt);
      return this.load(client, outboxEventId);
    });
  }

  claim(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["pending", "retryable_failed", "reorg_pending"],
      "claimed",
    );
  }

  beginPreflight(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord> {
    return this.transition(id, worker, at, ["claimed"], "preflight");
  }

  recordSubmission(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    transactionId: string,
  ): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["preflight"],
      "submitted",
      {
        transactionId,
        submittedAt: at,
        submissionAmbiguous: false,
      },
      true,
    );
  }

  beginConfirmation(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord> {
    return this.transition(id, worker, at, ["submitted"], "confirming", {}, true);
  }

  beginReadback(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    blockHeight: number,
    blockHash: string,
  ): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["confirming"],
      "readback",
      {
        blockHeight,
        blockHash,
        confirmedAt: at,
      },
      true,
    );
  }

  verifyReadback(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    digest: string,
  ): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["readback"],
      "verified",
      {
        readbackDigest: digest,
        readbackAt: at,
      },
      true,
    );
  }

  retryableFailure(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
    submissionAmbiguous = false,
  ): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["preflight", "submitted", "confirming", "readback"],
      "retryable_failed",
      { errorClass, submissionAmbiguous },
      true,
    );
  }

  terminalFailure(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
  ): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["preflight", "submitted", "confirming", "readback", "retryable_failed"],
      "terminal_failed",
      { errorClass, submissionAmbiguous: false },
      true,
    );
  }

  async markDeadLetter(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
  ): Promise<VerusJobRecord> {
    this.validateEvidence({ errorClass });
    return inSerializableTransaction(this.pool, async (client) => {
      const eligible = await client.query(
        `SELECT 1 FROM "outbox_event" o
         WHERE o."id" = $1 AND o."event_type" = $2 AND o."state" = 'dead_letter'
           AND EXISTS (
             SELECT 1 FROM "outbox_attempt" a WHERE a."outbox_event_id" = o."id"
               AND a."attempt" = o."attempt_count" AND a."worker" = $3
           ) FOR UPDATE`,
        [id, VERUS_ANCHOR_EVENT_TYPE, worker.workerReference],
      );
      if (!eligible.rows[0]) {
        throw new RepositoryConflictError("Verus dead letter is not owned by this attempt");
      }
      const before = await this.load(client, id);
      if (before.state !== "retryable_failed" && before.state !== "reorg_pending") {
        throw new RepositoryConflictError(
          "only a retryable or reorg Verus job can be dead-lettered",
        );
      }
      await client.query(
        `UPDATE "verus_job" SET "state" = 'terminal_failed', "last_error_class" = $1,
          "submission_ambiguous" = FALSE, "version" = "version" + 1, "updated_at" = $2
         WHERE "outbox_event_id" = $3 AND "version" = $4`,
        [errorClass, at, id, before.version],
      );
      await this.transitionAnchor(client, id, "terminal_failed", {}, at);
      await appendAudit(
        client,
        this.workerContext(worker, before, "terminal_failed"),
        await this.committeeId(client, id),
        "deadLetterVerusJob",
        {
          type: "verus_job",
          reference: before.id,
          priorState: before.state,
          newState: "terminal_failed",
        },
        "failed",
      );
      return this.load(client, id);
    });
  }

  reorg(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord> {
    return this.transition(
      id,
      worker,
      at,
      ["confirming", "readback"],
      "reorg_pending",
      {
        errorClass: "reorg_detected",
        reorgDetectedAt: at,
      },
      true,
    );
  }

  private async transition(
    outboxEventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    expected: readonly PersistedVerusJobState[],
    next: PersistedVerusJobState,
    evidence: TransitionEvidence = {},
    syncAnchor = false,
  ): Promise<VerusJobRecord> {
    this.validateEvidence(evidence);
    return inSerializableTransaction(this.pool, async (client) => {
      await this.requireLease(client, outboxEventId, worker, observedAt);
      const before = await this.load(client, outboxEventId);
      if (!expected.includes(before.state)) {
        throw new RepositoryConflictError(`Verus job cannot move from ${before.state} to ${next}`);
      }
      const changed = await client.query(
        `UPDATE "verus_job" SET "state" = $1,
          "transaction_id" = COALESCE($2,"transaction_id"),
          "block_height" = COALESCE($3,"block_height"),
          "block_hash" = COALESCE($4,"block_hash"),
          "readback_digest" = COALESCE($5,"readback_digest"),
          "submission_ambiguous" = $6, "last_error_class" = $7,
          "submitted_at" = COALESCE($8,"submitted_at"),
          "confirmed_at" = COALESCE($9,"confirmed_at"),
          "readback_at" = COALESCE($10,"readback_at"),
          "reorg_detected_at" = COALESCE($11,"reorg_detected_at"),
          "version" = "version" + 1, "updated_at" = $12
         WHERE "outbox_event_id" = $13 AND "version" = $14`,
        [
          next,
          evidence.transactionId ?? null,
          evidence.blockHeight ?? null,
          evidence.blockHash ?? null,
          evidence.readbackDigest ?? null,
          evidence.submissionAmbiguous ?? before.submissionAmbiguous,
          evidence.errorClass ?? null,
          evidence.submittedAt ?? null,
          evidence.confirmedAt ?? null,
          evidence.readbackAt ?? null,
          evidence.reorgDetectedAt ?? null,
          observedAt,
          outboxEventId,
          before.version,
        ],
      );
      if (changed.rowCount !== 1) throw new RepositoryConflictError("Verus job version conflict");
      if (syncAnchor)
        await this.transitionAnchor(client, outboxEventId, next, evidence, observedAt);
      await appendAudit(
        client,
        this.workerContext(worker, before, next),
        await this.committeeId(client, outboxEventId),
        `transitionVerusJob:${next}`,
        { type: "verus_job", reference: before.id, priorState: before.state, newState: next },
        next.endsWith("failed") ? "failed" : "succeeded",
      );
      return this.load(client, outboxEventId);
    });
  }

  private async transitionAnchor(
    client: PoolClient,
    outboxEventId: string,
    next: PersistedVerusJobState,
    evidence: TransitionEvidence,
    observedAt: Date,
  ): Promise<void> {
    if (next === "claimed" || next === "preflight") return;
    const state = next as Exclude<PersistedVerusJobState, "claimed" | "preflight">;
    const changed = await client.query(
      `UPDATE "anchor_record" SET "state" = $1,
        "transaction_id" = COALESCE($2,"transaction_id"),
        "block_height" = COALESCE($3,"block_height"), "block_hash" = COALESCE($4,"block_hash"),
        "readback_digest" = COALESCE($5,"readback_digest"),
        "version" = "version" + 1, "updated_at" = $6
       WHERE "outbox_event_id" = $7`,
      [
        state,
        evidence.transactionId ?? null,
        evidence.blockHeight ?? null,
        evidence.blockHash ?? null,
        evidence.readbackDigest ?? null,
        observedAt,
        outboxEventId,
      ],
    );
    if (changed.rowCount !== 1) {
      throw new RepositoryConflictError("Verus anchor record is missing or conflicted");
    }
  }

  private async requireLease(
    client: PoolClient,
    outboxEventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
  ): Promise<void> {
    const result = await client.query<{ ok: boolean }>(
      `SELECT TRUE AS ok FROM "outbox_event"
       WHERE "id" = $1 AND "event_type" = $2 AND "state" = 'claimed'
         AND "lease_owner" = $3 AND "lease_expires_at" > $4 FOR UPDATE`,
      [outboxEventId, VERUS_ANCHOR_EVENT_TYPE, worker.workerReference, observedAt],
    );
    if (!result.rows[0]) throw new RepositoryConflictError("Verus worker lease is not active");
  }

  private async load(client: PoolClient, outboxEventId: string): Promise<VerusJobRecord> {
    const result = await client.query<VerusJobRow>(
      `${this.selectJob()} WHERE j."outbox_event_id" = $1`,
      [outboxEventId],
    );
    if (!result.rows[0]) throw new RepositoryConflictError("Verus job does not exist");
    return this.toRecord(result.rows[0]);
  }

  private selectJob(): string {
    return `SELECT j.*, c."external_reference" AS "committee_reference"
      FROM "verus_job" j JOIN "outbox_event" o ON o."id" = j."outbox_event_id"
      LEFT JOIN "committee" c ON c."id" = j."committee_id"`;
  }

  private toRecord(row: VerusJobRow): VerusJobRecord {
    if (
      !row.target_identity ||
      !row.vdxf_uri ||
      !row.manifest_canonical ||
      !row.manifest_policy_reference ||
      row.manifest_maximum_bytes === null ||
      typeof row.manifest_json !== "object" ||
      row.manifest_json === null ||
      Array.isArray(row.manifest_json)
    ) {
      throw new RepositoryConflictError("Verus job is missing its immutable policy snapshot");
    }
    const blockHeight = row.block_height === null ? undefined : Number(row.block_height);
    if (blockHeight !== undefined && !Number.isSafeInteger(blockHeight)) {
      throw new RepositoryConflictError("Verus block height is outside the safe integer range");
    }
    return {
      id: row.id,
      outboxEventId: row.outbox_event_id,
      ...(row.committee_reference ? { committeeReference: row.committee_reference } : undefined),
      operationType: row.operation_type,
      subjectReference: row.subject_reference,
      targetIdentity: row.target_identity,
      vdxfUri: row.vdxf_uri,
      vdxfKey: row.vdxf_key,
      manifest: row.manifest_json as Readonly<Record<string, unknown>>,
      manifestCanonical: row.manifest_canonical,
      manifestDigest: row.manifest_digest,
      manifestPolicyReference: row.manifest_policy_reference,
      manifestAllowedFields: row.manifest_allowed_fields,
      manifestRequiredFields: row.manifest_required_fields,
      manifestMaximumBytes: row.manifest_maximum_bytes,
      confirmationRequirement: row.confirmation_requirement,
      state: row.state,
      ...(row.transaction_id ? { transactionId: row.transaction_id } : undefined),
      ...(blockHeight === undefined ? undefined : { blockHeight }),
      ...(row.block_hash ? { blockHash: row.block_hash } : undefined),
      ...(row.readback_digest ? { readbackDigest: row.readback_digest } : undefined),
      submissionAmbiguous: row.submission_ambiguous,
      ...(row.last_error_class ? { lastErrorClass: row.last_error_class } : undefined),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async resolveCommittee(client: PoolClient, reference: string): Promise<string> {
    requireOpaqueReference(reference, "committee reference");
    const result = await client.query<{ id: string }>(
      `SELECT "id" FROM "committee" WHERE "external_reference" = $1`,
      [reference],
    );
    if (!result.rows[0]) throw new RepositoryConflictError("committee does not exist");
    return result.rows[0].id;
  }

  private async committeeId(client: PoolClient, outboxEventId: string): Promise<string | null> {
    const result = await client.query<{ committee_id: string | null }>(
      `SELECT "committee_id" FROM "verus_job" WHERE "outbox_event_id" = $1`,
      [outboxEventId],
    );
    return result.rows[0]?.committee_id ?? null;
  }

  private workerContext(
    worker: OutboxWorkerContext,
    job: VerusJobRecord,
    next: PersistedVerusJobState,
  ): CommandContext {
    return {
      actor: {
        type: "worker",
        reference: worker.workerReference,
        authenticationStrength: "internal_worker",
      },
      committeeReference: job.committeeReference ?? "global_synthetic_scope",
      policyVersionReference: job.manifestPolicyReference,
      softwareVersion: worker.softwareVersion,
      reasonCategory: job.lastErrorClass ?? `verus_${next}`,
      correlationId: worker.correlationId,
      idempotencyKey: `${job.id}:${job.version}:${next}`,
      requestDigest: job.manifestDigest,
    };
  }

  private validateInput(input: EnqueueVerusAnchorInput, context: CommandContext): void {
    requireOpaqueReference(input.externalReference, "anchor reference");
    requireOpaqueReference(input.subjectReference, "subject reference");
    if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(input.operationType)) {
      throw new RepositoryConflictError("operation type must be a stable code");
    }
    if (!/^i[1-9A-HJ-NP-Za-km-z]{20,63}$/.test(input.targetIdentity)) {
      throw new RepositoryConflictError("target identity must be an i-address");
    }
    if (!/^i[1-9A-HJ-NP-Za-km-z]{20,63}$/.test(input.vdxfKey)) {
      throw new RepositoryConflictError("VDXF key must be an i-address");
    }
    if (!/^\S{3,256}$/.test(input.vdxfUri)) {
      throw new RepositoryConflictError("VDXF URI must be a bounded server value");
    }
    if (!/^[0-9a-f]{64}$/.test(input.manifestDigest)) {
      throw new RepositoryConflictError("manifest digest must be lowercase SHA-256");
    }
    if (sha256(input.manifestCanonical) !== input.manifestDigest) {
      throw new RepositoryConflictError("canonical manifest does not match its digest");
    }
    let canonicalValue: unknown;
    try {
      canonicalValue = JSON.parse(input.manifestCanonical);
    } catch {
      throw new RepositoryConflictError("canonical manifest must be valid JSON");
    }
    if (!isDeepStrictEqual(canonicalValue, input.manifest)) {
      throw new RepositoryConflictError("canonical manifest does not match the persisted manifest");
    }
    const byteLength = Buffer.byteLength(input.manifestCanonical, "utf8");
    if (
      !Number.isInteger(input.manifestMaximumBytes) ||
      input.manifestMaximumBytes < 1 ||
      input.manifestMaximumBytes > 1_048_576 ||
      byteLength > input.manifestMaximumBytes
    ) {
      throw new RepositoryConflictError("manifest exceeds its server-selected byte limit");
    }
    if (
      !Number.isInteger(input.confirmationRequirement) ||
      input.confirmationRequirement < 1 ||
      input.confirmationRequirement > 1_000
    ) {
      throw new RepositoryConflictError("confirmation requirement is invalid");
    }
    for (const field of [...input.manifestAllowedFields, ...input.manifestRequiredFields]) {
      if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(field)) {
        throw new RepositoryConflictError("manifest field policy contains an invalid name");
      }
    }
    const allowed = new Set(input.manifestAllowedFields);
    if (
      Object.keys(input.manifest).some((field) => !allowed.has(field)) ||
      input.manifestRequiredFields.some((field) => !Object.hasOwn(input.manifest, field))
    ) {
      throw new RepositoryConflictError("manifest violates its server-selected field policy");
    }
    rejectSensitiveManifestFields(input.manifest);
    if (context.requestDigest !== input.manifestDigest) {
      throw new RepositoryConflictError("command digest does not match the manifest");
    }
    if (context.policyVersionReference !== input.manifestPolicyReference) {
      throw new RepositoryConflictError("command policy does not match the manifest policy");
    }
    if (context.committeeReference !== (input.committeeReference ?? "global_synthetic_scope")) {
      throw new RepositoryConflictError("command tenant does not match the Verus job tenant");
    }
  }

  private validateEvidence(evidence: TransitionEvidence): void {
    for (const value of [evidence.transactionId, evidence.blockHash, evidence.readbackDigest]) {
      if (value !== undefined && !/^[0-9a-f]{64}$/.test(value)) {
        throw new RepositoryConflictError("Verus evidence must be lowercase 32-byte hex");
      }
    }
    if (
      evidence.blockHeight !== undefined &&
      (!Number.isSafeInteger(evidence.blockHeight) || evidence.blockHeight < 0)
    ) {
      throw new RepositoryConflictError("Verus block height is invalid");
    }
    if (evidence.errorClass !== undefined && !/^[a-z][a-z0-9_]{2,63}$/.test(evidence.errorClass)) {
      throw new RepositoryConflictError("Verus error class must be a stable code");
    }
  }
}

const FORBIDDEN_MANIFEST_FIELDS = new Set([
  "appealdetail",
  "appealfacts",
  "committeeevidence",
  "committeenotes",
  "dateofbirth",
  "documentimage",
  "documentnumber",
  "evidencehash",
  "exactaddress",
  "faceimage",
  "identitydocument",
  "privatekey",
  "privatesessionlocation",
  "rpcpassword",
  "seedphrase",
  "sessiontoken",
  "utilitybill",
  "walletbackup",
  "walletseed",
  "wif",
  "zseed",
  "proto",
  "constructor",
  "prototype",
]);

function rejectSensitiveManifestFields(value: unknown, depth = 0): void {
  if (depth > 32) throw new RepositoryConflictError("manifest nesting exceeds the server limit");
  if (Array.isArray(value)) {
    for (const item of value) rejectSensitiveManifestFields(item, depth + 1);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [field, item] of Object.entries(value)) {
    const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_MANIFEST_FIELDS.has(normalized)) {
      throw new RepositoryConflictError("manifest contains a prohibited private field");
    }
    rejectSensitiveManifestFields(item, depth + 1);
  }
}
