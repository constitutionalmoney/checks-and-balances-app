import {
  acknowledgeConsent,
  activateCommittee,
  activateRelyingPartyClient,
  approveCommitteePilot,
  approveRelyingPartyClient,
  assignAppeal,
  beginAppealReview,
  beginClientSecurityReview,
  beginCommitteeFormation,
  beginCommitteePilotReview,
  beginCommitteePolicyReview,
  beginPrivacyRequest,
  beginRenewalCycle,
  beginRenewalReporting,
  beginTestnetProvisioning,
  cancelDraftRenewalCycle,
  cancelPendingNotification,
  claimNotification,
  commitEligibleSnapshot,
  completePrivacyRequest,
  confirmPrivacyRequester,
  consumeWalletChallenge,
  deadLetterNotification,
  denyAppealCase,
  denyPrivacyRequest,
  expireWalletChallenge,
  markCommitteeTestnetReady,
  presentWalletChallenge,
  publishRenewalReport,
  queueRenewalNotices,
  reactivateCommittee,
  recordNotificationDelivery,
  recordRenewalSelection,
  recordRetryableNotificationFailure,
  recordTerminalNotificationFailure,
  recordWalletResponse,
  rejectWalletResponse,
  remandAppealCase,
  requestRenewalSelection,
  retireCommittee,
  retireSuspendedCommittee,
  retryNotification,
  revokeRelyingPartyClient,
  suspendCommittee,
  suspendRelyingPartyClient,
  upholdAppealCase,
  withdrawAppealCase,
  withdrawConsent,
  withdrawPrivacyRequest,
  type AppealState,
  type CommitteeState,
  type ConsentState,
  type NotificationState,
  type PrivacyRequestState,
  type RelyingPartyClientState,
  type RenewalCycleState,
  type WalletChallengeState,
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

export interface LifecycleTransitionInput {
  readonly externalReference: string;
  readonly expectedVersion: number;
  readonly observedAt: Date;
  readonly assignmentReference?: string;
  readonly context: CommandContext;
}

export interface LifecycleRecord<State extends string = string> {
  readonly externalReference: string;
  readonly state: State;
  readonly version: number;
  readonly replayed: boolean;
}

interface IdempotencyResult {
  readonly id: string;
  readonly replayed: boolean;
  readonly resultReference?: string;
  readonly resultState?: string;
  readonly resultVersion?: number;
}

export type CommitteeLifecycleCommand =
  | "beginCommitteeFormation"
  | "beginCommitteePolicyReview"
  | "beginTestnetProvisioning"
  | "markCommitteeTestnetReady"
  | "beginCommitteePilotReview"
  | "approveCommitteePilot"
  | "activateCommittee"
  | "suspendCommittee"
  | "retireCommittee"
  | "reactivateCommittee"
  | "retireSuspendedCommittee";

export type RenewalLifecycleCommand =
  | "commitEligibleSnapshot"
  | "requestRenewalSelection"
  | "recordRenewalSelection"
  | "queueRenewalNotices"
  | "beginRenewalCycle"
  | "beginRenewalReporting"
  | "publishRenewalReport"
  | "cancelDraftRenewalCycle";

export type WalletChallengeCommand =
  | "presentWalletChallenge"
  | "recordWalletResponse"
  | "consumeWalletChallenge"
  | "rejectWalletResponse"
  | "expireWalletChallenge";

export type AppealLifecycleCommand =
  | "assignAppeal"
  | "beginAppealReview"
  | "upholdAppealCase"
  | "denyAppealCase"
  | "remandAppealCase"
  | "withdrawAppealCase";

export type PrivacyLifecycleCommand =
  | "confirmPrivacyRequester"
  | "beginPrivacyRequest"
  | "completePrivacyRequest"
  | "denyPrivacyRequest"
  | "withdrawPrivacyRequest";

export type NotificationLifecycleCommand =
  | "claimNotification"
  | "recordNotificationDelivery"
  | "recordRetryableNotificationFailure"
  | "retryNotification"
  | "recordTerminalNotificationFailure"
  | "deadLetterNotification"
  | "cancelPendingNotification";

export type RelyingPartyLifecycleCommand =
  | "beginClientSecurityReview"
  | "approveRelyingPartyClient"
  | "activateRelyingPartyClient"
  | "suspendRelyingPartyClient"
  | "revokeRelyingPartyClient";

interface TableConfig {
  readonly table: string;
  readonly targetType: string;
  readonly eventAggregate: string;
}

interface LifecycleRow {
  readonly id: string;
  readonly external_reference: string;
  readonly committee_id: string | null;
  readonly committee_reference: string | null;
  readonly state: string;
  readonly version: number;
}

export class LifecycleRepository {
  constructor(private readonly pool: Pool) {}

  transitionCommittee(
    command: CommitteeLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<CommitteeState>> {
    return this.transition(
      { table: "committee", targetType: "committee", eventAggregate: "committee" },
      command,
      input,
      (state) => this.applyCommittee(command, state as CommitteeState),
    ) as Promise<LifecycleRecord<CommitteeState>>;
  }

  transitionRenewalCycle(
    command: RenewalLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<RenewalCycleState>> {
    return this.transition(
      { table: "renewal_cycle", targetType: "renewal_cycle", eventAggregate: "renewal_cycle" },
      command,
      input,
      (state) => this.applyRenewal(command, state as RenewalCycleState),
    ) as Promise<LifecycleRecord<RenewalCycleState>>;
  }

  transitionWalletChallenge(
    command: WalletChallengeCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<WalletChallengeState>> {
    return this.transition(
      {
        table: "wallet_challenge",
        targetType: "wallet_challenge",
        eventAggregate: "wallet_challenge",
      },
      command,
      input,
      (state) => this.applyWalletChallenge(command, state as WalletChallengeState),
    ) as Promise<LifecycleRecord<WalletChallengeState>>;
  }

  transitionConsent(
    command: "acknowledgeConsent" | "withdrawConsent",
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<ConsentState>> {
    return this.transition(
      { table: "consent_receipt", targetType: "consent_receipt", eventAggregate: "consent" },
      command,
      input,
      (state) =>
        command === "acknowledgeConsent"
          ? acknowledgeConsent(state as ConsentState)
          : withdrawConsent(state as ConsentState),
    ) as Promise<LifecycleRecord<ConsentState>>;
  }

  transitionAppeal(
    command: AppealLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<AppealState>> {
    return this.transition(
      { table: "appeal", targetType: "appeal", eventAggregate: "appeal" },
      command,
      input,
      (state) => this.applyAppeal(command, state as AppealState),
    ) as Promise<LifecycleRecord<AppealState>>;
  }

  transitionPrivacyRequest(
    command: PrivacyLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<PrivacyRequestState>> {
    return this.transition(
      {
        table: "privacy_rights_request",
        targetType: "privacy_rights_request",
        eventAggregate: "privacy_request",
      },
      command,
      input,
      (state) => this.applyPrivacy(command, state as PrivacyRequestState),
    ) as Promise<LifecycleRecord<PrivacyRequestState>>;
  }

  transitionNotification(
    command: NotificationLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<NotificationState>> {
    return this.transition(
      { table: "notification", targetType: "notification", eventAggregate: "notification" },
      command,
      input,
      (state) => this.applyNotification(command, state as NotificationState),
    ) as Promise<LifecycleRecord<NotificationState>>;
  }

  transitionRelyingPartyClient(
    command: RelyingPartyLifecycleCommand,
    input: LifecycleTransitionInput,
  ): Promise<LifecycleRecord<RelyingPartyClientState>> {
    return this.transition(
      {
        table: "relying_party_client",
        targetType: "relying_party_client",
        eventAggregate: "relying_party_client",
      },
      command,
      input,
      (state) => this.applyRelyingParty(command, state as RelyingPartyClientState),
    ) as Promise<LifecycleRecord<RelyingPartyClientState>>;
  }

  private async transition(
    config: TableConfig,
    command: string,
    input: LifecycleTransitionInput,
    apply: (state: string) => string,
  ): Promise<LifecycleRecord> {
    requireOpaqueReference(input.externalReference, `${config.targetType} reference`);
    return inSerializableTransaction(this.pool, async (client) => {
      const row = await this.load(client, config, input.externalReference, true);
      if (row.committee_reference && row.committee_reference !== input.context.committeeReference) {
        throw new TenantBoundaryError();
      }
      if (
        config.table === "committee" &&
        row.external_reference !== input.context.committeeReference
      ) {
        throw new TenantBoundaryError();
      }
      const idempotency = await this.beginIdempotency(
        client,
        row.committee_id,
        command,
        input.context,
      );
      if (idempotency.replayed) {
        if (
          idempotency.resultReference !== input.externalReference ||
          !idempotency.resultState ||
          !idempotency.resultVersion
        ) {
          throw new IdempotencyConflictError();
        }
        return {
          externalReference: idempotency.resultReference,
          state: idempotency.resultState,
          version: idempotency.resultVersion,
          replayed: true,
        };
      }
      if (row.version !== input.expectedVersion) {
        throw new RepositoryConflictError(`${config.targetType} version is stale`);
      }
      const next = apply(row.state);
      await this.validatePreconditions(client, config, command, row, input);
      const parameters: unknown[] = [next, row.id, input.expectedVersion];
      let additionalAssignments = "";
      const assign = (column: string, value: unknown): void => {
        parameters.push(value);
        additionalAssignments += `, "${column}" = $${parameters.length}`;
      };
      if (config.table === "wallet_challenge" && next === "consumed") {
        assign("consumed_at", input.observedAt);
      } else if (config.table === "consent_receipt" && next === "acknowledged") {
        assign("acknowledged_at", input.observedAt);
      } else if (config.table === "consent_receipt" && next === "withdrawn") {
        assign("withdrawn_at", input.observedAt);
      } else if (config.table === "appeal" && next === "assigned") {
        assign("assigned_reference", input.assignmentReference);
      } else if (config.table === "appeal" && ["upheld", "denied", "remanded"].includes(next)) {
        assign("resolved_at", input.observedAt);
      } else if (
        config.table === "privacy_rights_request" &&
        ["completed", "denied"].includes(next)
      ) {
        assign("completed_at", input.observedAt);
      } else if (config.table === "notification" && next === "delivered") {
        assign("delivered_at", input.observedAt);
      }
      const updated = await client.query<LifecycleRow>(
        `UPDATE "${config.table}" SET "state" = $1, "version" = "version" + 1${additionalAssignments}
         WHERE "id" = $2 AND "version" = $3
         RETURNING "id", "external_reference", "state", "version", NULL::uuid AS "committee_id", NULL::text AS "committee_reference"`,
        parameters,
      );
      if (!updated.rows[0])
        throw new RepositoryConflictError(`${config.targetType} version is stale`);
      await appendAudit(client, input.context, row.committee_id, command, {
        type: config.targetType,
        reference: input.externalReference,
        priorState: row.state,
        newState: next,
      });
      await client.query(
        `INSERT INTO "outbox_event" (
          "id","committee_id","event_type","aggregate_type","aggregate_reference",
          "schema_version","payload_reference","payload_digest","idempotency_key_hash"
        ) VALUES ($1,$2,$3,$4,$5,'issue-16-v1',$6,$7,$8)`,
        [
          newId(),
          row.committee_id,
          command,
          config.eventAggregate,
          input.externalReference,
          `domain:${input.externalReference}:v${updated.rows[0].version}`,
          sha256(`${command}|${input.externalReference}|${updated.rows[0].version}|${next}`),
          sha256(`${input.context.committeeReference}|${input.context.idempotencyKey}|${command}`),
        ],
      );
      await client.query(
        `UPDATE "idempotency_record" SET "state" = 'completed', "result_digest" = $1,
          "result_reference" = $2, "result_version" = $3, "result_state" = $4,
          "completed_at" = CURRENT_TIMESTAMP WHERE "id" = $5 AND "state" = 'started'`,
        [
          sha256(`${input.externalReference}|${updated.rows[0].version}|${next}`),
          input.externalReference,
          updated.rows[0].version,
          next,
          idempotency.id,
        ],
      );
      return {
        externalReference: input.externalReference,
        state: next,
        version: updated.rows[0].version,
        replayed: false,
      };
    });
  }

  private async load(
    client: PoolClient,
    config: TableConfig,
    reference: string,
    lock: boolean,
  ): Promise<LifecycleRow> {
    if (config.table === "committee") {
      const result = await client.query<LifecycleRow>(
        `SELECT "id", "external_reference", "id" AS "committee_id",
          "external_reference" AS "committee_reference", "state", "version"
         FROM "committee" WHERE "external_reference" = $1${lock ? " FOR UPDATE" : ""}`,
        [reference],
      );
      if (!result.rows[0]) throw new TenantBoundaryError();
      return result.rows[0];
    }
    const hasCommittee = config.table !== "wallet_challenge";
    const committeeColumns = hasCommittee
      ? 't."committee_id", c."external_reference" AS "committee_reference"'
      : 'NULL::uuid AS "committee_id", NULL::text AS "committee_reference"';
    const committeeJoin = hasCommittee
      ? 'LEFT JOIN "committee" c ON c."id" = t."committee_id"'
      : "";
    const result = await client.query<LifecycleRow>(
      `SELECT t."id", t."external_reference", ${committeeColumns}, t."state", t."version"
       FROM "${config.table}" t ${committeeJoin}
       WHERE t."external_reference" = $1${lock ? " FOR UPDATE OF t" : ""}`,
      [reference],
    );
    if (!result.rows[0]) throw new TenantBoundaryError();
    return result.rows[0];
  }

  private async beginIdempotency(
    client: PoolClient,
    committeeId: string | null,
    command: string,
    context: CommandContext,
  ): Promise<IdempotencyResult> {
    const scope = committeeId
      ? `committee:${context.committeeReference}`
      : `global:${context.actor.reference}`;
    const keyHash = sha256(context.idempotencyKey);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO "idempotency_record" (
        "id","scope","key_hash","request_digest","command","actor_type",
        "actor_reference","committee_id"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("scope","key_hash") DO NOTHING RETURNING "id"`,
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
      committee_id: string | null;
      state: string;
      result_reference: string | null;
      result_state: string | null;
      result_version: number | null;
    }>(
      `SELECT "id","request_digest","command","committee_id","state",
        "result_reference","result_state","result_version"
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

  private async validatePreconditions(
    client: PoolClient,
    config: TableConfig,
    command: string,
    row: LifecycleRow,
    input: LifecycleTransitionInput,
  ): Promise<void> {
    if (config.table === "wallet_challenge") {
      const challenge = await client.query<{ expires_at: Date }>(
        'SELECT "expires_at" FROM "wallet_challenge" WHERE "id" = $1',
        [row.id],
      );
      const expiresAt = challenge.rows[0]!.expires_at;
      if (command === "expireWalletChallenge" && input.observedAt < expiresAt) {
        throw new RepositoryConflictError("wallet challenge cannot expire before its boundary");
      }
      if (command !== "expireWalletChallenge" && input.observedAt >= expiresAt) {
        throw new RepositoryConflictError("expired wallet challenge cannot progress");
      }
    }
    if (config.table === "appeal" && command === "assignAppeal") {
      if (!input.assignmentReference) {
        throw new RepositoryConflictError(
          "appeal assignment requires an opaque assignee reference",
        );
      }
      requireOpaqueReference(input.assignmentReference, "appeal assignee reference");
    }
    if (config.table === "renewal_cycle") {
      const artifact =
        command === "commitEligibleSnapshot"
          ? "eligible_snapshot"
          : command === "recordRenewalSelection"
            ? "cycle_selection"
            : command === "publishRenewalReport"
              ? "cycle_report"
              : null;
      if (artifact) {
        const result = await client.query(
          `SELECT 1 FROM "${artifact}" WHERE "renewal_cycle_id" = $1 LIMIT 1`,
          [row.id],
        );
        if (!result.rowCount) {
          throw new RepositoryConflictError(`${command} requires its immutable lifecycle artifact`);
        }
      }
    }
  }

  private toRecord(row: LifecycleRow, replayed: boolean): LifecycleRecord {
    return {
      externalReference: row.external_reference,
      state: row.state,
      version: row.version,
      replayed,
    };
  }

  private applyCommittee(
    command: CommitteeLifecycleCommand,
    state: CommitteeState,
  ): CommitteeState {
    switch (command) {
      case "beginCommitteeFormation":
        return beginCommitteeFormation(state);
      case "beginCommitteePolicyReview":
        return beginCommitteePolicyReview(state);
      case "beginTestnetProvisioning":
        return beginTestnetProvisioning(state);
      case "markCommitteeTestnetReady":
        return markCommitteeTestnetReady(state);
      case "beginCommitteePilotReview":
        return beginCommitteePilotReview(state);
      case "approveCommitteePilot":
        return approveCommitteePilot(state);
      case "activateCommittee":
        return activateCommittee(state);
      case "suspendCommittee":
        return suspendCommittee(state);
      case "retireCommittee":
        return retireCommittee(state);
      case "reactivateCommittee":
        return reactivateCommittee(state);
      case "retireSuspendedCommittee":
        return retireSuspendedCommittee(state);
    }
  }

  private applyRenewal(
    command: RenewalLifecycleCommand,
    state: RenewalCycleState,
  ): RenewalCycleState {
    switch (command) {
      case "commitEligibleSnapshot":
        return commitEligibleSnapshot(state);
      case "requestRenewalSelection":
        return requestRenewalSelection(state);
      case "recordRenewalSelection":
        return recordRenewalSelection(state);
      case "queueRenewalNotices":
        return queueRenewalNotices(state);
      case "beginRenewalCycle":
        return beginRenewalCycle(state);
      case "beginRenewalReporting":
        return beginRenewalReporting(state);
      case "publishRenewalReport":
        return publishRenewalReport(state);
      case "cancelDraftRenewalCycle":
        return cancelDraftRenewalCycle(state);
    }
  }

  private applyWalletChallenge(
    command: WalletChallengeCommand,
    state: WalletChallengeState,
  ): WalletChallengeState {
    switch (command) {
      case "presentWalletChallenge":
        return presentWalletChallenge(state);
      case "recordWalletResponse":
        return recordWalletResponse(state);
      case "consumeWalletChallenge":
        return consumeWalletChallenge(state);
      case "rejectWalletResponse":
        return rejectWalletResponse(state);
      case "expireWalletChallenge":
        return expireWalletChallenge(state);
    }
  }

  private applyAppeal(command: AppealLifecycleCommand, state: AppealState): AppealState {
    switch (command) {
      case "assignAppeal":
        return assignAppeal(state);
      case "beginAppealReview":
        return beginAppealReview(state);
      case "upholdAppealCase":
        return upholdAppealCase(state);
      case "denyAppealCase":
        return denyAppealCase(state);
      case "remandAppealCase":
        return remandAppealCase(state);
      case "withdrawAppealCase":
        return withdrawAppealCase(state);
    }
  }

  private applyPrivacy(
    command: PrivacyLifecycleCommand,
    state: PrivacyRequestState,
  ): PrivacyRequestState {
    switch (command) {
      case "confirmPrivacyRequester":
        return confirmPrivacyRequester(state);
      case "beginPrivacyRequest":
        return beginPrivacyRequest(state);
      case "completePrivacyRequest":
        return completePrivacyRequest(state);
      case "denyPrivacyRequest":
        return denyPrivacyRequest(state);
      case "withdrawPrivacyRequest":
        return withdrawPrivacyRequest(state);
    }
  }

  private applyNotification(
    command: NotificationLifecycleCommand,
    state: NotificationState,
  ): NotificationState {
    switch (command) {
      case "claimNotification":
        return claimNotification(state);
      case "recordNotificationDelivery":
        return recordNotificationDelivery(state);
      case "recordRetryableNotificationFailure":
        return recordRetryableNotificationFailure(state);
      case "retryNotification":
        return retryNotification(state);
      case "recordTerminalNotificationFailure":
        return recordTerminalNotificationFailure(state);
      case "deadLetterNotification":
        return deadLetterNotification(state);
      case "cancelPendingNotification":
        return cancelPendingNotification(state);
    }
  }

  private applyRelyingParty(
    command: RelyingPartyLifecycleCommand,
    state: RelyingPartyClientState,
  ): RelyingPartyClientState {
    switch (command) {
      case "beginClientSecurityReview":
        return beginClientSecurityReview(state);
      case "approveRelyingPartyClient":
        return approveRelyingPartyClient(state);
      case "activateRelyingPartyClient":
        return activateRelyingPartyClient(state);
      case "suspendRelyingPartyClient":
        return suspendRelyingPartyClient(state);
      case "revokeRelyingPartyClient":
        return revokeRelyingPartyClient(state);
    }
  }
}
