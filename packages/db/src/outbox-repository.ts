import type { Pool, PoolClient } from "pg";

import { appendAudit } from "./audit.js";
import {
  inSerializableTransaction,
  newId,
  RepositoryConflictError,
  requireOpaqueReference,
  type CommandContext,
} from "./repository-types.js";

export interface OutboxWorkerContext {
  readonly workerReference: string;
  readonly softwareVersion: string;
  readonly correlationId: string;
}

export interface OutboxClaim {
  readonly id: string;
  readonly committeeReference?: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateReference: string;
  readonly schemaVersion: string;
  readonly payloadReference: string;
  readonly payloadDigest: string;
  readonly attempt: number;
  readonly createdAt: Date;
  readonly leaseExpiresAt: Date;
}

export interface OutboxClaimOptions {
  readonly eventTypes?: readonly string[];
  /** Serializes active work sharing the same event type and aggregate identity. */
  readonly singleWriterByAggregate?: boolean;
}

export interface OutboxQueueStats {
  readonly readyCount: number;
  readonly oldestReadyAt?: Date;
}

interface OutboxRow {
  readonly id: string;
  readonly committee_id: string | null;
  readonly committee_reference: string | null;
  readonly event_type: string;
  readonly aggregate_type: string;
  readonly aggregate_reference: string;
  readonly schema_version: string;
  readonly payload_reference: string;
  readonly payload_digest: string;
  readonly state: string;
  readonly lease_owner: string | null;
  readonly lease_acquired_at: Date | null;
  readonly lease_expires_at: Date | null;
  readonly attempt_count: number;
  readonly created_at: Date;
}

export interface RetryFailureOptions {
  readonly errorClass: string;
  readonly maxAttempts: number;
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;
}

export class OutboxRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(
    worker: OutboxWorkerContext,
    observedAt: Date,
    leaseDurationMs: number,
    options: OutboxClaimOptions = {},
  ): Promise<OutboxClaim | null> {
    requireOpaqueReference(worker.workerReference, "worker reference");
    if (!Number.isInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new RepositoryConflictError("lease duration must be a positive integer");
    }
    const eventTypes = this.validateEventTypes(options.eventTypes);

    return inSerializableTransaction(this.pool, async (client) => {
      const candidate = await client.query<OutboxRow>(
        `SELECT o.*, c."external_reference" AS "committee_reference"
         FROM "outbox_event" o
         LEFT JOIN "committee" c ON c."id" = o."committee_id"
         WHERE ((o."state" IN ('pending','retryable_failed') AND o."available_at" <= $1)
            OR (o."state" = 'claimed' AND o."lease_expires_at" <= $1))
           AND ($2::text[] IS NULL OR o."event_type" = ANY($2))
           AND (NOT $3::boolean OR NOT EXISTS (
             SELECT 1 FROM "outbox_event" active
             WHERE active."id" <> o."id"
               AND active."event_type" = o."event_type"
               AND active."aggregate_type" = o."aggregate_type"
               AND active."aggregate_reference" = o."aggregate_reference"
               AND active."state" = 'claimed'
               AND active."lease_expires_at" > $1
           ))
         ORDER BY o."available_at", o."created_at", o."id"
         FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
        [observedAt, eventTypes ?? null, options.singleWriterByAggregate ?? false],
      );
      const row = candidate.rows[0];
      if (!row) return null;

      if (row.state === "claimed") {
        await this.recordAttempt(
          client,
          row,
          row.lease_owner!,
          row.attempt_count,
          "failed",
          "lease_expired",
          row.lease_acquired_at!,
          observedAt,
        );
        await appendAudit(
          client,
          this.auditContext(worker, row, "recoverExpiredOutboxLease", "lease_expired"),
          row.committee_id,
          "recoverExpiredOutboxLease",
          {
            type: "outbox_event",
            reference: row.id,
            priorState: "claimed",
            newState: "claimed",
          },
        );
      }

      const leaseExpiresAt = new Date(observedAt.getTime() + leaseDurationMs);
      const claimed = await client.query<{ attempt_count: number }>(
        `UPDATE "outbox_event" SET "state" = 'claimed', "lease_owner" = $1,
          "lease_acquired_at" = $2, "lease_expires_at" = $3,
          "attempt_count" = "attempt_count" + 1, "last_error_class" = NULL
         WHERE "id" = $4 RETURNING "attempt_count"`,
        [worker.workerReference, observedAt, leaseExpiresAt, row.id],
      );
      await appendAudit(
        client,
        this.auditContext(worker, row, "claimOutboxEvent", "worker_claim"),
        row.committee_id,
        "claimOutboxEvent",
        {
          type: "outbox_event",
          reference: row.id,
          priorState: row.state,
          newState: "claimed",
        },
      );
      return {
        id: row.id,
        ...(row.committee_reference ? { committeeReference: row.committee_reference } : undefined),
        eventType: row.event_type,
        aggregateType: row.aggregate_type,
        aggregateReference: row.aggregate_reference,
        schemaVersion: row.schema_version,
        payloadReference: row.payload_reference,
        payloadDigest: row.payload_digest,
        attempt: claimed.rows[0]!.attempt_count,
        createdAt: row.created_at,
        leaseExpiresAt,
      };
    });
  }

  async queueStats(observedAt: Date, eventTypes?: readonly string[]): Promise<OutboxQueueStats> {
    const allowedTypes = this.validateEventTypes(eventTypes);
    const result = await this.pool.query<{ ready_count: string; oldest_ready_at: Date | null }>(
      `SELECT COUNT(*)::text AS "ready_count", MIN("created_at") AS "oldest_ready_at"
       FROM "outbox_event"
       WHERE (("state" IN ('pending','retryable_failed') AND "available_at" <= $1)
          OR ("state" = 'claimed' AND "lease_expires_at" <= $1))
         AND ($2::text[] IS NULL OR "event_type" = ANY($2))`,
      [observedAt, allowedTypes ?? null],
    );
    const row = result.rows[0]!;
    return {
      readyCount: Number(row.ready_count),
      ...(row.oldest_ready_at ? { oldestReadyAt: row.oldest_ready_at } : undefined),
    };
  }

  async heartbeat(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    leaseDurationMs: number,
  ): Promise<Date> {
    return inSerializableTransaction(this.pool, async (client) => {
      const row = await this.loadClaim(client, eventId, worker.workerReference, observedAt);
      const leaseExpiresAt = new Date(observedAt.getTime() + leaseDurationMs);
      if (leaseExpiresAt <= observedAt) {
        throw new RepositoryConflictError("lease duration must be positive");
      }
      await client.query(
        `UPDATE "outbox_event" SET "lease_expires_at" = $1
         WHERE "id" = $2 AND "state" = 'claimed' AND "lease_owner" = $3`,
        [leaseExpiresAt, eventId, worker.workerReference],
      );
      await appendAudit(
        client,
        this.auditContext(worker, row, "heartbeatOutboxLease", "worker_heartbeat"),
        row.committee_id,
        "heartbeatOutboxLease",
        { type: "outbox_event", reference: row.id, priorState: "claimed", newState: "claimed" },
      );
      return leaseExpiresAt;
    });
  }

  async succeed(eventId: string, worker: OutboxWorkerContext, observedAt: Date): Promise<void> {
    await inSerializableTransaction(this.pool, async (client) => {
      const row = await this.loadClaim(client, eventId, worker.workerReference, observedAt);
      await this.recordAttempt(
        client,
        row,
        worker.workerReference,
        row.attempt_count,
        "succeeded",
        null,
        row.lease_acquired_at!,
        observedAt,
      );
      await client.query(
        `UPDATE "outbox_event" SET "state" = 'succeeded', "lease_owner" = NULL,
          "lease_acquired_at" = NULL, "lease_expires_at" = NULL, "completed_at" = $1
         WHERE "id" = $2`,
        [observedAt, eventId],
      );
      await appendAudit(
        client,
        this.auditContext(worker, row, "completeOutboxEvent", "worker_success"),
        row.committee_id,
        "completeOutboxEvent",
        { type: "outbox_event", reference: row.id, priorState: "claimed", newState: "succeeded" },
      );
    });
  }

  async failRetryable(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    options: RetryFailureOptions,
  ): Promise<"retryable_failed" | "dead_letter"> {
    this.validateFailureOptions(options);
    return inSerializableTransaction(this.pool, async (client) => {
      const row = await this.loadClaim(client, eventId, worker.workerReference, observedAt);
      await this.recordAttempt(
        client,
        row,
        worker.workerReference,
        row.attempt_count,
        "failed",
        options.errorClass,
        row.lease_acquired_at!,
        observedAt,
      );
      const exhausted = row.attempt_count >= options.maxAttempts;
      const state = exhausted ? "dead_letter" : "retryable_failed";
      const delay = Math.min(
        options.baseBackoffMs * 2 ** Math.max(0, row.attempt_count - 1),
        options.maxBackoffMs,
      );
      const availableAt = new Date(observedAt.getTime() + delay);
      await client.query(
        `UPDATE "outbox_event" SET "state" = $1, "available_at" = $2,
          "lease_owner" = NULL, "lease_acquired_at" = NULL, "lease_expires_at" = NULL,
          "last_error_class" = $3, "completed_at" = $4 WHERE "id" = $5`,
        [state, availableAt, options.errorClass, exhausted ? observedAt : null, eventId],
      );
      await appendAudit(
        client,
        this.auditContext(worker, row, "failOutboxEvent", options.errorClass),
        row.committee_id,
        "failOutboxEvent",
        { type: "outbox_event", reference: row.id, priorState: "claimed", newState: state },
        "failed",
      );
      return state;
    });
  }

  async failTerminal(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    errorClass: string,
  ): Promise<void> {
    this.requireErrorClass(errorClass);
    await inSerializableTransaction(this.pool, async (client) => {
      const row = await this.loadClaim(client, eventId, worker.workerReference, observedAt);
      await this.recordAttempt(
        client,
        row,
        worker.workerReference,
        row.attempt_count,
        "failed",
        errorClass,
        row.lease_acquired_at!,
        observedAt,
      );
      await client.query(
        `UPDATE "outbox_event" SET "state" = 'terminal_failed',
          "lease_owner" = NULL, "lease_acquired_at" = NULL, "lease_expires_at" = NULL,
          "last_error_class" = $1, "completed_at" = $2 WHERE "id" = $3`,
        [errorClass, observedAt, eventId],
      );
      await appendAudit(
        client,
        this.auditContext(worker, row, "terminallyFailOutboxEvent", errorClass),
        row.committee_id,
        "terminallyFailOutboxEvent",
        {
          type: "outbox_event",
          reference: row.id,
          priorState: "claimed",
          newState: "terminal_failed",
        },
        "failed",
      );
    });
  }

  private async loadClaim(
    client: PoolClient,
    eventId: string,
    workerReference: string,
    observedAt: Date,
  ): Promise<OutboxRow> {
    const result = await client.query<OutboxRow>(
      `SELECT o.*, c."external_reference" AS "committee_reference"
       FROM "outbox_event" o LEFT JOIN "committee" c ON c."id" = o."committee_id"
       WHERE o."id" = $1 FOR UPDATE OF o`,
      [eventId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.state !== "claimed" ||
      row.lease_owner !== workerReference ||
      !row.lease_expires_at ||
      row.lease_expires_at <= observedAt
    ) {
      throw new RepositoryConflictError(
        "outbox lease is missing, expired, or owned by another worker",
      );
    }
    return row;
  }

  private async recordAttempt(
    client: PoolClient,
    row: OutboxRow,
    workerReference: string,
    attempt: number,
    result: "succeeded" | "failed",
    errorClass: string | null,
    startedAt: Date,
    finishedAt: Date,
  ): Promise<void> {
    await client.query(
      `INSERT INTO "outbox_attempt" (
        "id", "outbox_event_id", "attempt", "worker", "result", "error_class",
        "started_at", "finished_at"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [newId(), row.id, attempt, workerReference, result, errorClass, startedAt, finishedAt],
    );
  }

  private auditContext(
    worker: OutboxWorkerContext,
    row: OutboxRow,
    command: string,
    reasonCategory: string,
  ): CommandContext {
    return {
      actor: {
        type: "worker",
        reference: worker.workerReference,
        authenticationStrength: "internal_worker",
      },
      committeeReference: row.committee_reference ?? "global_synthetic_scope",
      policyVersionReference: `schema:${row.schema_version}`,
      softwareVersion: worker.softwareVersion,
      reasonCategory,
      correlationId: worker.correlationId,
      idempotencyKey: `${row.id}:${row.attempt_count}:${command}`,
      requestDigest: row.payload_digest,
    };
  }

  private validateFailureOptions(options: RetryFailureOptions): void {
    this.requireErrorClass(options.errorClass);
    if (
      !Number.isInteger(options.maxAttempts) ||
      options.maxAttempts < 1 ||
      !Number.isInteger(options.baseBackoffMs) ||
      options.baseBackoffMs < 1 ||
      !Number.isInteger(options.maxBackoffMs) ||
      options.maxBackoffMs < options.baseBackoffMs
    ) {
      throw new RepositoryConflictError("retry settings must be positive and bounded");
    }
  }

  private requireErrorClass(errorClass: string): void {
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(errorClass)) {
      throw new RepositoryConflictError("error class must be a non-sensitive stable code");
    }
  }

  private validateEventTypes(eventTypes?: readonly string[]): readonly string[] | undefined {
    if (eventTypes === undefined) return undefined;
    if (
      eventTypes.length === 0 ||
      eventTypes.some((value) => !/^[a-z][a-z0-9_.-]{2,127}$/.test(value))
    ) {
      throw new RepositoryConflictError("event type filters must be non-empty stable codes");
    }
    return [...new Set(eventTypes)];
  }
}
