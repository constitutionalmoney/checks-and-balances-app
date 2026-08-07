import type {
  OutboxClaim,
  OutboxClaimOptions,
  OutboxQueueStats,
  OutboxWorkerContext,
  PersistedVerusJobState,
  RetryFailureOptions,
  VerusJobRecord,
} from "@cbc/db";
import { VERUS_ANCHOR_EVENT_TYPE, VRSCTEST_CHAIN_ID } from "@cbc/db";
import {
  findReadbackEvidenceBeforeResubmission,
  inspectTransactionConfirmation,
  isVerusIntegrationError,
  prepareCanonicalPayload,
  prepareIdentityContentUpdate,
  runVerusWritePreflight,
  verifyIdentityContentReadback,
  VerusIntegrationError,
  type JsonObject,
  type VerusRpcAdapter,
} from "@cbc/verus";

import type { VerusWorkerMetrics } from "./verus-metrics.js";

export interface VerusOutboxStore {
  claimNext(
    worker: OutboxWorkerContext,
    observedAt: Date,
    leaseDurationMs: number,
    options?: OutboxClaimOptions,
  ): Promise<OutboxClaim | null>;
  heartbeat(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    leaseDurationMs: number,
  ): Promise<Date>;
  succeed(eventId: string, worker: OutboxWorkerContext, observedAt: Date): Promise<void>;
  failRetryable(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    options: RetryFailureOptions,
  ): Promise<"retryable_failed" | "dead_letter">;
  failTerminal(
    eventId: string,
    worker: OutboxWorkerContext,
    observedAt: Date,
    errorClass: string,
  ): Promise<void>;
  queueStats(observedAt: Date, eventTypes?: readonly string[]): Promise<OutboxQueueStats>;
}

export interface VerusJobStore {
  loadForClaim(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord>;
  claim(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord>;
  beginPreflight(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord>;
  recordSubmission(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    transactionId: string,
  ): Promise<VerusJobRecord>;
  beginConfirmation(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord>;
  beginReadback(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    blockHeight: number,
    blockHash: string,
  ): Promise<VerusJobRecord>;
  verifyReadback(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    digest: string,
  ): Promise<VerusJobRecord>;
  retryableFailure(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
    submissionAmbiguous?: boolean,
  ): Promise<VerusJobRecord>;
  terminalFailure(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
  ): Promise<VerusJobRecord>;
  markDeadLetter(
    id: string,
    worker: OutboxWorkerContext,
    at: Date,
    errorClass: string,
  ): Promise<VerusJobRecord>;
  reorg(id: string, worker: OutboxWorkerContext, at: Date): Promise<VerusJobRecord>;
}

export interface VerusAnchorWorkerOptions {
  readonly outbox: VerusOutboxStore;
  readonly jobs: VerusJobStore;
  readonly adapter: VerusRpcAdapter;
  readonly metrics: VerusWorkerMetrics;
  readonly worker: OutboxWorkerContext;
  readonly writeCapabilityEnabled: boolean;
  readonly approvedWriteTargets: readonly ApprovedVerusWriteTarget[];
  readonly leaseDurationMs?: number;
  readonly retry?: Omit<RetryFailureOptions, "errorClass">;
  readonly now?: () => Date;
}

export interface ApprovedVerusWriteTarget {
  readonly operationType: string;
  readonly targetIdentity: string;
  readonly vdxfUri: string;
  readonly vdxfKey: string;
  readonly manifestPolicyReference: string;
}

export type VerusWorkerResult =
  | "paused"
  | "idle"
  | "verified"
  | "retryable_failed"
  | "terminal_failed"
  | "dead_letter"
  | "reorg_pending";

export class VerusAnchorWorker {
  private readonly now: () => Date;
  private readonly leaseDurationMs: number;
  private readonly retry: Omit<RetryFailureOptions, "errorClass">;

  constructor(private readonly options: VerusAnchorWorkerOptions) {
    this.now = options.now ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    this.retry = options.retry ?? { maxAttempts: 8, baseBackoffMs: 5_000, maxBackoffMs: 900_000 };
  }

  async processNext(): Promise<VerusWorkerResult> {
    await this.refreshQueueMetrics();
    this.options.metrics.setPaused(!this.options.writeCapabilityEnabled);
    if (!this.options.writeCapabilityEnabled) return "paused";

    const claim = await this.options.outbox.claimNext(
      this.options.worker,
      this.now(),
      this.leaseDurationMs,
      { eventTypes: [VERUS_ANCHOR_EVENT_TYPE], singleWriterByAggregate: true },
    );
    if (!claim) return "idle";
    this.options.metrics.setQueue(
      Math.max(
        0,
        (await this.options.outbox.queueStats(this.now(), [VERUS_ANCHOR_EVENT_TYPE])).readyCount,
      ),
      Math.max(0, (this.now().getTime() - claim.createdAt.getTime()) / 1_000),
    );

    let job: VerusJobRecord | undefined;
    try {
      job = await this.options.jobs.loadForClaim(claim.id, this.options.worker, this.now());
      if (["pending", "retryable_failed", "reorg_pending"].includes(job.state)) {
        job = await this.options.jobs.claim(claim.id, this.options.worker, this.now());
      }
      if (job.state === "claimed") {
        job = await this.options.jobs.beginPreflight(claim.id, this.options.worker, this.now());
      }
      if (job.state === "preflight") {
        job = await this.preflightAndSubmit(claim, job);
      }
      if (job.state === "submitted") {
        await this.heartbeat(claim.id);
        job = await this.options.jobs.beginConfirmation(claim.id, this.options.worker, this.now());
      }
      if (job.state === "confirming") {
        await this.heartbeat(claim.id);
        const confirmation = await inspectTransactionConfirmation(
          this.options.adapter,
          requireTransactionId(job),
          { minimumConfirmations: job.confirmationRequirement },
        );
        this.options.metrics.setConfirmationCount(confirmation.confirmations);
        if (confirmation.state === "confirming") {
          throw new VerusIntegrationError(
            "CONFIRMATION_PENDING",
            "Verus transaction has not reached the configured confirmation requirement",
            true,
          );
        }
        if (confirmation.state === "reorg_pending") {
          await this.options.jobs.reorg(claim.id, this.options.worker, this.now());
          this.options.metrics.recordReorg();
          return this.failOutboxRetryable(claim.id, "reorg_detected", "reorg_pending");
        }
        job = await this.options.jobs.beginReadback(
          claim.id,
          this.options.worker,
          this.now(),
          confirmation.blockHeight,
          confirmation.blockHash,
        );
      }
      if (job.state === "readback") {
        await this.heartbeat(claim.id);
        const readback = await verifyIdentityContentReadback(
          this.options.adapter,
          job.targetIdentity,
          job.vdxfKey,
          job.manifestDigest,
        );
        if (readback.state === "mismatch") {
          this.options.metrics.recordReadbackMismatch();
          throw new VerusIntegrationError(
            "READBACK_MISMATCH",
            "Verus identity readback did not contain the exact canonical manifest digest",
            false,
          );
        }
        job = await this.options.jobs.verifyReadback(
          claim.id,
          this.options.worker,
          this.now(),
          readback.readbackDigest,
        );
      }
      if (job.state !== "verified") {
        throw new VerusIntegrationError(
          "RPC_INVALID_RESULT",
          "Verus job stopped in an invalid state",
          false,
        );
      }
      await this.options.outbox.succeed(claim.id, this.options.worker, this.now());
      this.options.metrics.recordOutcome("verified");
      return "verified";
    } catch (error) {
      if (!job || !isVerusIntegrationError(error)) throw error;
      return this.handleFailure(claim.id, job.state, error);
    }
  }

  private async preflightAndSubmit(
    claim: OutboxClaim,
    job: VerusJobRecord,
  ): Promise<VerusJobRecord> {
    await this.heartbeat(claim.id);
    if (
      !this.options.approvedWriteTargets.some(
        (target) =>
          target.operationType === job.operationType &&
          target.targetIdentity === job.targetIdentity &&
          target.vdxfUri === job.vdxfUri &&
          target.vdxfKey === job.vdxfKey &&
          target.manifestPolicyReference === job.manifestPolicyReference,
      )
    ) {
      throw new VerusIntegrationError(
        "PAYLOAD_FORBIDDEN",
        "Verus job does not match an approved server write target",
        false,
      );
    }
    const payload = prepareCanonicalPayload(job.manifest as JsonObject, {
      policyReference: job.manifestPolicyReference,
      allowedTopLevelFields: job.manifestAllowedFields,
      requiredTopLevelFields: job.manifestRequiredFields,
      maximumBytes: job.manifestMaximumBytes,
    });
    if (
      payload.digest !== job.manifestDigest ||
      new TextDecoder().decode(payload.bytes) !== job.manifestCanonical
    ) {
      throw new VerusIntegrationError(
        "PAYLOAD_FORBIDDEN",
        "Persisted manifest does not match its immutable canonical policy snapshot",
        false,
      );
    }
    const preflight = await runVerusWritePreflight(this.options.adapter, {
      serverSelectedNetwork: "VRSCTEST",
      expectedChainId: VRSCTEST_CHAIN_ID,
      expectedIdentity: {
        identityAddress: job.targetIdentity,
        systemId: VRSCTEST_CHAIN_ID,
        allowedStatuses: ["active"],
        mustBeSignableByNode: true,
      },
      expectedVdxf: { uri: job.vdxfUri, vdxfId: job.vdxfKey },
      writeCapabilityEnabled: this.options.writeCapabilityEnabled,
    });
    this.options.metrics.setNodeSynchronized(true);
    const identity = preflight.identity;
    if (!identity) {
      throw new VerusIntegrationError(
        "IDENTITY_STATE_INVALID",
        "Preflight identity is absent",
        false,
      );
    }

    let transactionId = job.transactionId;
    if (!transactionId && job.submissionAmbiguous) {
      const evidence = await findReadbackEvidenceBeforeResubmission(
        this.options.adapter,
        job.targetIdentity,
        job.vdxfKey,
        job.manifestDigest,
      );
      if (!evidence.found) {
        throw new VerusIntegrationError(
          "AMBIGUOUS_SUBMISSION",
          "Ambiguous Verus submission was not found by readback; automatic resubmission is blocked",
          true,
          true,
        );
      }
      transactionId = evidence.transactionId;
    }
    if (!transactionId) {
      transactionId = await this.options.adapter.updateIdentity(
        prepareIdentityContentUpdate(identity.identity, job.vdxfKey, payload),
      );
    }
    return this.options.jobs.recordSubmission(
      claim.id,
      this.options.worker,
      this.now(),
      transactionId,
    );
  }

  private async handleFailure(
    eventId: string,
    state: PersistedVerusJobState,
    error: VerusIntegrationError,
  ): Promise<VerusWorkerResult> {
    this.options.metrics.recordFailure(error.code);
    if (error.code === "NODE_UNSYNCED") this.options.metrics.setNodeSynchronized(false);
    if (error.code === "WRONG_NETWORK") this.options.metrics.recordWrongNetwork();
    const errorClass = error.code.toLowerCase();
    if (error.retryable) {
      if (["preflight", "submitted", "confirming", "readback"].includes(state)) {
        await this.options.jobs.retryableFailure(
          eventId,
          this.options.worker,
          this.now(),
          errorClass,
          error.submissionAmbiguous,
        );
      }
      return this.failOutboxRetryable(eventId, errorClass, "retryable_failed");
    }
    if (["preflight", "submitted", "confirming", "readback", "retryable_failed"].includes(state)) {
      await this.options.jobs.terminalFailure(eventId, this.options.worker, this.now(), errorClass);
    }
    await this.options.outbox.failTerminal(eventId, this.options.worker, this.now(), errorClass);
    this.options.metrics.recordOutcome("terminal_failed");
    return "terminal_failed";
  }

  private async failOutboxRetryable(
    eventId: string,
    errorClass: string,
    nonExhaustedResult: "retryable_failed" | "reorg_pending",
  ): Promise<VerusWorkerResult> {
    const result = await this.options.outbox.failRetryable(
      eventId,
      this.options.worker,
      this.now(),
      {
        ...this.retry,
        errorClass,
      },
    );
    if (result === "dead_letter") {
      await this.options.jobs.markDeadLetter(eventId, this.options.worker, this.now(), errorClass);
      this.options.metrics.recordOutcome("dead_letter");
      return "dead_letter";
    }
    this.options.metrics.recordOutcome("retryable_failed");
    return nonExhaustedResult;
  }

  private async heartbeat(eventId: string): Promise<void> {
    await this.options.outbox.heartbeat(
      eventId,
      this.options.worker,
      this.now(),
      this.leaseDurationMs,
    );
  }

  private async refreshQueueMetrics(): Promise<void> {
    const now = this.now();
    const stats = await this.options.outbox.queueStats(now, [VERUS_ANCHOR_EVENT_TYPE]);
    this.options.metrics.setQueue(
      stats.readyCount,
      stats.oldestReadyAt
        ? Math.max(0, (now.getTime() - stats.oldestReadyAt.getTime()) / 1_000)
        : 0,
    );
  }
}

export class VerusWorkerLoop {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly worker: VerusAnchorWorker,
    private readonly intervalMs = 1_000,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = () => {
      if (this.running) return;
      this.running = true;
      void this.worker
        .processNext()
        .catch(this.onError)
        .finally(() => {
          this.running = false;
        });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

function requireTransactionId(job: VerusJobRecord): string {
  if (!job.transactionId) {
    throw new VerusIntegrationError(
      "RPC_INVALID_RESULT",
      "Submitted Verus job has no transaction ID",
      false,
    );
  }
  return job.transactionId;
}
