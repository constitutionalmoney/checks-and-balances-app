import {
  approveVerification,
  beginReview,
  checkInParticipant,
  denyAppeal,
  openAppeal,
  recordIssuance,
  rejectAfterMoreInformation,
  rejectVerification,
  remandAppeal,
  requestIssuance,
  requestMoreInformation,
  requireEligibleReviewer,
  rescheduleAfterMoreInformation,
  scheduleRequest,
  upholdAppeal,
  withdrawAfterMoreInformation,
  withdrawVerification,
  type ReviewerAuthorizationDecision,
  type VerificationState,
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

type VerificationCommand = (state: VerificationState) => VerificationState;

export interface VerificationRecord {
  readonly externalReference: string;
  readonly committeeReference: string;
  readonly participantReference: string;
  readonly state: VerificationState;
  readonly version: number;
  readonly replayed: boolean;
}

interface TransitionInput {
  readonly requestReference: string;
  readonly expectedVersion: number;
  readonly context: CommandContext;
}

interface RequestRow {
  readonly id: string;
  readonly external_reference: string;
  readonly participant_reference: string;
  readonly committee_reference: string;
  readonly state: VerificationState;
  readonly version: number;
}

interface IdempotencyResult {
  readonly id: string;
  readonly replayed: boolean;
  readonly resultReference?: string;
  readonly resultState?: string;
  readonly resultVersion?: number;
}

export interface CreateVerificationRequestInput {
  readonly id?: string;
  readonly externalReference: string;
  readonly participantReference: string;
  readonly policyVersionId: string;
  readonly context: CommandContext;
}

export interface RecordReviewDecisionInput {
  readonly id?: string;
  readonly externalReference: string;
  readonly requestReference: string;
  readonly reviewerMemberReference: string;
  readonly policyVersionId: string;
  readonly decision: "approved" | "rejected" | "needs_more_information";
  readonly authorization: ReviewerAuthorizationDecision;
  readonly context: CommandContext;
}

export class VerificationRepository {
  constructor(private readonly pool: Pool) {}

  async createRequest(input: CreateVerificationRequestInput): Promise<VerificationRecord> {
    requireOpaqueReference(input.externalReference, "verification external reference");
    requireOpaqueReference(input.participantReference, "participant reference");
    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(
        client,
        committeeId,
        "createVerificationRequest",
        input.context,
      );
      if (idempotency.replayed) {
        return this.replayRecord(
          await this.loadRecord(client, committeeId, input.externalReference, true),
          idempotency,
        );
      }

      const participant = await client.query<{ id: string }>(
        'SELECT "id" FROM "participant_account" WHERE "external_reference" = $1',
        [input.participantReference],
      );
      if (!participant.rows[0]) throw new RepositoryConflictError("participant does not exist");

      await client.query(
        `INSERT INTO "verification_request" (
          "id", "external_reference", "committee_id", "participant_id", "policy_version_id", "updated_at"
        ) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
        [
          input.id ?? newId(),
          input.externalReference,
          committeeId,
          participant.rows[0].id,
          input.policyVersionId,
        ],
      );
      await appendAudit(client, input.context, committeeId, "createVerificationRequest", {
        type: "verification_request",
        reference: input.externalReference,
        newState: "requested",
      });
      await this.enqueueDomainEvent(
        client,
        committeeId,
        input.externalReference,
        "VerificationRequested",
        1,
        "requested",
        input.context,
      );
      await this.completeIdempotency(
        client,
        idempotency.id,
        input.externalReference,
        1,
        "requested",
      );
      return this.loadRecord(client, committeeId, input.externalReference, false);
    });
  }

  schedule(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("scheduleRequest", scheduleRequest, input);
  }
  checkIn(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("checkInParticipant", checkInParticipant, input);
  }
  beginReview(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("beginReview", beginReview, input);
  }
  approve(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("approveVerification", approveVerification, input);
  }
  reject(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("rejectVerification", rejectVerification, input);
  }
  requestMoreInformation(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("requestMoreInformation", requestMoreInformation, input);
  }
  withdraw(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("withdrawVerification", withdrawVerification, input);
  }
  rescheduleAfterMoreInformation(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("rescheduleAfterMoreInformation", rescheduleAfterMoreInformation, input);
  }
  rejectAfterMoreInformation(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("rejectAfterMoreInformation", rejectAfterMoreInformation, input);
  }
  withdrawAfterMoreInformation(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("withdrawAfterMoreInformation", withdrawAfterMoreInformation, input);
  }
  requestIssuance(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("requestIssuance", requestIssuance, input);
  }
  recordIssuance(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("recordIssuance", recordIssuance, input);
  }
  openAppeal(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("openAppeal", openAppeal, input);
  }
  upholdAppeal(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("upholdAppeal", upholdAppeal, input);
  }
  denyAppeal(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("denyAppeal", denyAppeal, input);
  }
  remandAppeal(input: TransitionInput): Promise<VerificationRecord> {
    return this.transition("remandAppeal", remandAppeal, input);
  }

  async recordReviewDecision(input: RecordReviewDecisionInput): Promise<{ replayed: boolean }> {
    requireOpaqueReference(input.externalReference, "decision external reference");
    const eligible = requireEligibleReviewer(input.authorization);
    if (eligible.actorReference !== input.context.actor.reference) {
      throw new RepositoryConflictError("authorization decision does not match the command actor");
    }

    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(
        client,
        committeeId,
        "recordReviewDecision",
        input.context,
      );
      if (idempotency.replayed) return { replayed: true };

      const request = await this.loadRecord(client, committeeId, input.requestReference, false);
      if (request.state !== "under_review") {
        throw new RepositoryConflictError("review decision requires an under-review request");
      }
      const member = await client.query<{ id: string }>(
        `SELECT "id" FROM "committee_member"
         WHERE "external_reference" = $1 AND "committee_id" = $2 AND "state" = 'active'`,
        [input.reviewerMemberReference, committeeId],
      );
      if (!member.rows[0]) throw new TenantBoundaryError();
      const conflict = await client.query(
        `SELECT 1 FROM "conflict_declaration"
         WHERE "member_id" = $1 AND "committee_id" = $2
           AND "target_type" = 'verification_request' AND "target_reference" = $3
           AND "resolved_at" IS NULL`,
        [member.rows[0].id, committeeId, input.requestReference],
      );
      if (conflict.rowCount)
        throw new RepositoryConflictError("reviewer has an unresolved conflict");

      const requestId = await client.query<{ id: string }>(
        'SELECT "id" FROM "verification_request" WHERE "external_reference" = $1 AND "committee_id" = $2',
        [input.requestReference, committeeId],
      );
      await client.query(
        `INSERT INTO "review_decision" (
          "id", "external_reference", "committee_id", "request_id", "reviewer_member_id",
          "policy_version_id", "state", "reason_category", "authorization_decision_digest",
          "conflict_checked_at", "decided_at"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [
          input.id ?? newId(),
          input.externalReference,
          committeeId,
          requestId.rows[0]!.id,
          member.rows[0].id,
          input.policyVersionId,
          input.decision,
          input.context.reasonCategory,
          sha256(JSON.stringify(input.authorization)),
        ],
      );
      await appendAudit(client, input.context, committeeId, "recordReviewDecision", {
        type: "review_decision",
        reference: input.externalReference,
        newState: input.decision,
      });
      await this.enqueueDomainEvent(
        client,
        committeeId,
        input.externalReference,
        "ReviewDecisionRecorded",
        1,
        input.decision,
        input.context,
      );
      await this.completeIdempotency(
        client,
        idempotency.id,
        input.externalReference,
        1,
        input.decision,
      );
      return { replayed: false };
    });
  }

  private async transition(
    commandName: string,
    command: VerificationCommand,
    input: TransitionInput,
  ): Promise<VerificationRecord> {
    requireOpaqueReference(input.requestReference, "verification request reference");
    return inSerializableTransaction(this.pool, async (client) => {
      const committeeId = await this.committeeId(client, input.context.committeeReference);
      const idempotency = await this.beginIdempotency(
        client,
        committeeId,
        commandName,
        input.context,
      );
      if (idempotency.replayed) {
        return this.replayRecord(
          await this.loadRecord(client, committeeId, input.requestReference, true),
          idempotency,
        );
      }
      const current = await this.loadRecord(
        client,
        committeeId,
        input.requestReference,
        false,
        true,
      );
      if (current.version !== input.expectedVersion) {
        throw new RepositoryConflictError("verification request version is stale");
      }
      const nextState = command(current.state);
      const updated = await client.query<RequestRow>(
        `UPDATE "verification_request"
         SET "state" = $1, "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
         WHERE "external_reference" = $2 AND "committee_id" = $3 AND "version" = $4
         RETURNING "id", "external_reference", "state", "version",
           (SELECT "external_reference" FROM "participant_account" WHERE "id" = "verification_request"."participant_id") AS "participant_reference"`,
        [nextState, input.requestReference, committeeId, input.expectedVersion],
      );
      if (!updated.rows[0])
        throw new RepositoryConflictError("verification request version is stale");

      await appendAudit(client, input.context, committeeId, commandName, {
        type: "verification_request",
        reference: input.requestReference,
        priorState: current.state,
        newState: nextState,
      });
      await this.enqueueDomainEvent(
        client,
        committeeId,
        input.requestReference,
        commandName,
        updated.rows[0].version,
        nextState,
        input.context,
      );
      await this.completeIdempotency(
        client,
        idempotency.id,
        input.requestReference,
        updated.rows[0].version,
        nextState,
      );
      return {
        externalReference: input.requestReference,
        committeeReference: input.context.committeeReference,
        participantReference: updated.rows[0].participant_reference,
        state: nextState,
        version: updated.rows[0].version,
        replayed: false,
      };
    });
  }

  private async committeeId(client: PoolClient, committeeReference: string): Promise<string> {
    requireOpaqueReference(committeeReference, "committee reference");
    const result = await client.query<{ id: string }>(
      'SELECT "id" FROM "committee" WHERE "external_reference" = $1',
      [committeeReference],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return result.rows[0].id;
  }

  private async loadRecord(
    client: PoolClient,
    committeeId: string,
    requestReference: string,
    replayed: boolean,
    lock = false,
  ): Promise<VerificationRecord> {
    const result = await client.query<RequestRow>(
      `SELECT r."id", r."external_reference", r."state", r."version",
        p."external_reference" AS "participant_reference",
        c."external_reference" AS "committee_reference"
       FROM "verification_request" r
       JOIN "participant_account" p ON p."id" = r."participant_id"
       JOIN "committee" c ON c."id" = r."committee_id"
       WHERE r."external_reference" = $1 AND r."committee_id" = $2${lock ? " FOR UPDATE OF r" : ""}`,
      [requestReference, committeeId],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return {
      externalReference: result.rows[0].external_reference,
      committeeReference: result.rows[0].committee_reference,
      participantReference: result.rows[0].participant_reference,
      state: result.rows[0].state,
      version: result.rows[0].version,
      replayed,
    };
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
    record: VerificationRecord,
    idempotency: IdempotencyResult,
  ): VerificationRecord {
    if (
      idempotency.resultReference !== record.externalReference ||
      !idempotency.resultState ||
      !idempotency.resultVersion
    ) {
      throw new IdempotencyConflictError();
    }
    return {
      ...record,
      state: idempotency.resultState as VerificationState,
      version: idempotency.resultVersion,
      replayed: true,
    };
  }

  private async enqueueDomainEvent(
    client: PoolClient,
    committeeId: string,
    reference: string,
    eventType: string,
    version: number,
    state: string,
    context: CommandContext,
  ): Promise<void> {
    const payloadReference = `domain:${reference}:v${version}`;
    const payloadDigest = sha256(`${eventType}|${reference}|${version}|${state}`);
    await client.query(
      `INSERT INTO "outbox_event" (
        "id", "committee_id", "event_type", "aggregate_type", "aggregate_reference",
        "schema_version", "payload_reference", "payload_digest", "idempotency_key_hash"
      ) VALUES ($1,$2,$3,'verification_request',$4,'issue-16-v1',$5,$6,$7)`,
      [
        newId(),
        committeeId,
        eventType,
        reference,
        payloadReference,
        payloadDigest,
        sha256(`${context.committeeReference}|${context.idempotencyKey}|${eventType}`),
      ],
    );
  }
}
