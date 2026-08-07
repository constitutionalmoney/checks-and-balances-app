import type {
  OutboxClaim,
  OutboxClaimOptions,
  OutboxQueueStats,
  OutboxWorkerContext,
  PersistedVerusJobState,
  RetryFailureOptions,
  VerusJobRecord,
} from "@cbc/db";
import {
  FakeVerusRpcAdapter,
  prepareCanonicalPayload,
  syntheticIdentityResult,
  VerusIntegrationError,
  VRSCTEST_CHAIN_ID,
  type GetIdentityContentRequest,
  type PreparedIdentityUpdate,
  type VerusIdentityContentResult,
} from "@cbc/verus";
import { describe, expect, it } from "vitest";

import { VerusWorkerMetrics } from "./verus-metrics.js";
import { VerusAnchorWorker, type VerusJobStore, type VerusOutboxStore } from "./verus-worker.js";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const VDXF_URI = "vrsc::cbc.synthetic.anchor";
const APPROVED_TARGET = {
  operationType: "synthetic_anchor",
  targetIdentity: VRSCTEST_CHAIN_ID,
  vdxfUri: VDXF_URI,
  vdxfKey: VRSCTEST_CHAIN_ID,
  manifestPolicyReference: "policy_issue_2_fixture_v1",
} as const;
const WORKER: OutboxWorkerContext = {
  workerReference: "worker_verus_test",
  softwareVersion: "test_v1",
  correlationId: "correlation_verus_test",
};

describe("durable Verus anchor worker", () => {
  it("writes, confirms, reads back, and verifies an exact synthetic anchor", async () => {
    const fixture = createFixture();
    const result = await fixture.worker.processNext();

    expect(result).toBe("verified");
    expect(fixture.jobs.record.state).toBe("verified");
    expect(fixture.outbox.state).toBe("succeeded");
    expect(fixture.adapter.calls()).toContain("updateidentity");
    expect(fixture.adapter.calls()).toContain("getidentitycontent");
  });

  it("does not claim work while the release and policy gate is closed", async () => {
    const fixture = createFixture({ enabled: false });
    expect(await fixture.worker.processNext()).toBe("paused");
    expect(fixture.outbox.claims).toBe(0);
    expect(fixture.metrics.render()).toContain("cbc_verus_worker_paused 1");
  });

  it("rejects a persisted identity, URI, key, operation, or policy outside the server allowlist", async () => {
    const fixture = createFixture({
      job: { ...syntheticJob(), vdxfUri: "unapproved::v1.anchor.test" },
    });
    expect(await fixture.worker.processNext()).toBe("terminal_failed");
    expect(fixture.adapter.calls()).not.toContain("updateidentity");
  });

  it("searches an ambiguous result and never performs an unbounded duplicate write", async () => {
    const fixture = createFixture();
    fixture.adapter.failNext(
      "updateidentity",
      new VerusIntegrationError("AMBIGUOUS_SUBMISSION", "synthetic timeout", true, true),
    );

    expect(await fixture.worker.processNext()).toBe("retryable_failed");
    expect(await fixture.worker.processNext()).toBe("retryable_failed");
    expect(fixture.adapter.calls().filter((call) => call === "updateidentity")).toHaveLength(1);
    expect(fixture.adapter.calls()).toContain("getidentitycontent");
  });

  it("records an exact readback mismatch as terminal without leaking payload labels", async () => {
    const fixture = createFixture({ adapter: new MismatchFakeAdapter(fakeOptions()) });
    expect(await fixture.worker.processNext()).toBe("terminal_failed");
    const metrics = fixture.metrics.render();
    expect(metrics).toContain("cbc_verus_readback_mismatch_total 1");
    expect(metrics).not.toContain(fixture.jobs.record.targetIdentity);
    expect(metrics).not.toContain(fixture.jobs.record.manifestDigest);
    expect(metrics).not.toContain("record_private_test_value");
  });

  it("moves a reorganized transaction to explicit reconciliation state", async () => {
    const fixture = createFixture({ adapter: new ReorgFakeAdapter(fakeOptions()) });
    expect(await fixture.worker.processNext()).toBe("reorg_pending");
    expect(fixture.jobs.record.state).toBe("reorg_pending");
    expect(fixture.metrics.render()).toContain("cbc_verus_reorg_total 1");
  });
});

function createFixture(
  options: { enabled?: boolean; adapter?: FakeVerusRpcAdapter; job?: VerusJobRecord } = {},
) {
  const job = options.job ?? syntheticJob();
  const outbox = new MemoryOutbox(job);
  const jobs = new MemoryJobs(job);
  const metrics = new VerusWorkerMetrics();
  const adapter = options.adapter ?? new FakeVerusRpcAdapter(fakeOptions());
  return {
    adapter,
    jobs,
    metrics,
    outbox,
    worker: new VerusAnchorWorker({
      adapter,
      jobs,
      metrics,
      outbox,
      approvedWriteTargets: [APPROVED_TARGET],
      worker: WORKER,
      writeCapabilityEnabled: options.enabled ?? true,
      now: () => NOW,
    }),
  };
}

function fakeOptions() {
  return {
    vdxfIds: {
      [VDXF_URI]: {
        vdxfId: VRSCTEST_CHAIN_ID,
        hash160Result: "1".repeat(40),
        qualifiedName: {},
      },
    },
  };
}

function syntheticJob(): VerusJobRecord {
  const manifest = { kind: "synthetic_anchor", reference: "record_private_test_value" };
  const payload = prepareCanonicalPayload(manifest, {
    policyReference: "policy_issue_2_fixture_v1",
    allowedTopLevelFields: ["kind", "reference"],
    requiredTopLevelFields: ["kind", "reference"],
    maximumBytes: 512,
  });
  return {
    id: "00000000-0000-4000-8000-000000000101",
    outboxEventId: "00000000-0000-4000-8000-000000000102",
    operationType: "synthetic_anchor",
    subjectReference: "subject_synthetic_001",
    targetIdentity: syntheticIdentityResult().identity.identityAddress,
    vdxfUri: VDXF_URI,
    vdxfKey: VRSCTEST_CHAIN_ID,
    manifest,
    manifestCanonical: new TextDecoder().decode(payload.bytes),
    manifestDigest: payload.digest,
    manifestPolicyReference: payload.policyReference,
    manifestAllowedFields: ["kind", "reference"],
    manifestRequiredFields: ["kind", "reference"],
    manifestMaximumBytes: 512,
    confirmationRequirement: 2,
    state: "pending",
    submissionAmbiguous: false,
    version: 1,
    createdAt: new Date(NOW.getTime() - 5_000),
    updatedAt: NOW,
  };
}

class MemoryOutbox implements VerusOutboxStore {
  state:
    "pending" | "retryable_failed" | "claimed" | "succeeded" | "terminal_failed" | "dead_letter" =
    "pending";
  claims = 0;

  constructor(private readonly job: VerusJobRecord) {}

  async claimNext(
    _worker: OutboxWorkerContext,
    _at: Date,
    _lease: number,
    options?: OutboxClaimOptions,
  ): Promise<OutboxClaim | null> {
    expect(options?.eventTypes).toEqual(["verus.anchor.requested"]);
    if (this.state !== "pending" && this.state !== "retryable_failed") return null;
    this.state = "claimed";
    this.claims += 1;
    return {
      id: this.job.outboxEventId,
      eventType: "verus.anchor.requested",
      aggregateType: "verus_identity",
      aggregateReference: this.job.targetIdentity,
      schemaVersion: this.job.manifestPolicyReference,
      payloadReference: `verus_job:${this.job.id}`,
      payloadDigest: this.job.manifestDigest,
      attempt: this.claims,
      createdAt: this.job.createdAt,
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    };
  }

  async heartbeat(): Promise<Date> {
    return new Date(NOW.getTime() + 60_000);
  }

  async succeed(): Promise<void> {
    this.state = "succeeded";
  }

  async failRetryable(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    options: RetryFailureOptions,
  ): Promise<"retryable_failed" | "dead_letter"> {
    this.state = this.claims >= options.maxAttempts ? "dead_letter" : "retryable_failed";
    return this.state;
  }

  async failTerminal(): Promise<void> {
    this.state = "terminal_failed";
  }

  async queueStats(): Promise<OutboxQueueStats> {
    return this.state === "pending" || this.state === "retryable_failed"
      ? { readyCount: 1, oldestReadyAt: this.job.createdAt }
      : { readyCount: 0 };
  }
}

class MemoryJobs implements VerusJobStore {
  constructor(public record: VerusJobRecord) {}

  async loadForClaim(): Promise<VerusJobRecord> {
    return this.record;
  }

  claim(): Promise<VerusJobRecord> {
    return this.move("claimed");
  }

  beginPreflight(): Promise<VerusJobRecord> {
    return this.move("preflight");
  }

  recordSubmission(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    transactionId: string,
  ): Promise<VerusJobRecord> {
    return this.move("submitted", { transactionId, submissionAmbiguous: false });
  }

  beginConfirmation(): Promise<VerusJobRecord> {
    return this.move("confirming");
  }

  beginReadback(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    blockHeight: number,
    blockHash: string,
  ): Promise<VerusJobRecord> {
    return this.move("readback", { blockHeight, blockHash });
  }

  verifyReadback(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    readbackDigest: string,
  ): Promise<VerusJobRecord> {
    return this.move("verified", { readbackDigest });
  }

  retryableFailure(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    lastErrorClass: string,
    submissionAmbiguous = false,
  ): Promise<VerusJobRecord> {
    return this.move("retryable_failed", { lastErrorClass, submissionAmbiguous });
  }

  terminalFailure(
    _id: string,
    _worker: OutboxWorkerContext,
    _at: Date,
    lastErrorClass: string,
  ): Promise<VerusJobRecord> {
    return this.move("terminal_failed", { lastErrorClass });
  }

  markDeadLetter(): Promise<VerusJobRecord> {
    return this.move("terminal_failed", { lastErrorClass: "dead_letter" });
  }

  reorg(): Promise<VerusJobRecord> {
    return this.move("reorg_pending", { lastErrorClass: "reorg_detected" });
  }

  private async move(
    state: PersistedVerusJobState,
    evidence: Partial<VerusJobRecord> = {},
  ): Promise<VerusJobRecord> {
    this.record = { ...this.record, ...evidence, state, version: this.record.version + 1 };
    return this.record;
  }
}

class MismatchFakeAdapter extends FakeVerusRpcAdapter {
  override async getIdentityContent(
    request: GetIdentityContentRequest,
  ): Promise<VerusIdentityContentResult> {
    const result = await super.getIdentityContent(request);
    return { ...result, identity: { ...result.identity, contentMultiMap: {} } };
  }
}

class ReorgFakeAdapter extends FakeVerusRpcAdapter {
  override async updateIdentity(request: PreparedIdentityUpdate): Promise<string> {
    const transactionId = await super.updateIdentity(request);
    this.setCanonicalBlockHash(1_000, "f".repeat(64));
    return transactionId;
  }
}
