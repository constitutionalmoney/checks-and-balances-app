import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("issue #18 durable Verus worker contract", () => {
  it("persists immutable policy, ambiguity, confirmation, and exact-readback evidence", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const migration = await readFile(
      "packages/db/prisma/migrations/20260808030000_issue_18_verus_worker/migration.sql",
      "utf8",
    );

    for (const field of [
      "targetIdentity",
      "vdxfUri",
      "manifestCanonical",
      "manifestPolicyReference",
      "manifestMaximumBytes",
      "confirmationRequirement",
      "submissionAmbiguous",
      "submittedAt",
      "confirmedAt",
      "readbackAt",
      "reorgDetectedAt",
    ]) {
      expect(schema).toContain(field);
    }
    expect(migration).toContain("verus_job_verified_evidence_complete");
    expect(migration).toContain("cbc_guard_verus_job_identity");
    expect(migration).toContain("retryable_failed','reorg_pending");
  });

  it("uses the durable outbox lease and a single writer per identity", async () => {
    const outbox = await readFile("packages/db/src/outbox-repository.ts", "utf8");
    const worker = await readFile("apps/worker/src/verus-worker.ts", "utf8");

    expect(outbox).toContain("singleWriterByAggregate");
    expect(outbox).toContain('active."lease_expires_at" > $1');
    expect(worker).toContain("VERUS_ANCHOR_EVENT_TYPE");
    expect(worker).toContain("findReadbackEvidenceBeforeResubmission");
    expect(worker).toContain("submissionAmbiguous");
    expect(worker).not.toMatch(/console\.log|rpcPassword|request\.body|response\.body/);
  });

  it("keeps write configuration fail-closed and mainnet absent", async () => {
    const config = await readFile("packages/config/src/index.ts", "utf8");
    const main = await readFile("apps/worker/src/main.ts", "utf8");
    const compose = await readFile("compose.dokploy.yaml", "utf8");

    expect(config).toContain('CBC_VERUS_NETWORKS = ["FAKE", "VRSCTEST"]');
    expect(config).not.toMatch(/CBC_VERUS_NETWORKS[^\n]*mainnet/i);
    expect(main).toContain("CBC_VERUS_IDENTITY_UPDATE_ENABLED");
    expect(compose).toContain('CBC_VERUS_IDENTITY_UPDATE_ENABLED: "false"');
    expect(compose).toContain('CBC_MAINNET_WRITES_ENABLED: "false"');
  });

  it("defines privacy-safe metrics, alerts, and all required incident procedures", async () => {
    const metrics = await readFile("apps/worker/src/verus-metrics.ts", "utf8");
    const alerts = await readFile("infra/monitoring/verus-worker-alerts.yaml", "utf8");
    const runbook = await readFile("docs/runbooks/verus-worker.md", "utf8");

    for (const signal of [
      "outbox_oldest_age_seconds",
      "rpc_failures_total",
      "node_synchronized",
      "wrong_network_total",
      "confirmation_count",
      "readback_mismatch_total",
      "reorg_total",
    ]) {
      expect(metrics).toContain(signal);
      expect(alerts).toContain(signal);
    }
    expect(metrics).not.toMatch(/identity|participant|committee|transaction_id|manifest_digest/);
    for (const section of [
      "Emergency pause",
      "Retry and dead-letter reconciliation",
      "Node recovery",
      "Credential rotation",
      "Identity compromise",
    ]) {
      expect(runbook.toLowerCase()).toContain(section.toLowerCase());
    }
  });
});
