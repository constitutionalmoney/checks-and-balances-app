import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function block(source: string, declaration: string): string {
  const match = source.match(new RegExp(`${declaration}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match?.[1]) {
    throw new Error(`Missing ${declaration}`);
  }
  return match[1];
}

describe("issue #16 persistence foundation contract", () => {
  it("models every issue-required persistence boundary", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    for (const model of [
      "CommitteeMember",
      "CommitteeRole",
      "ConflictDeclaration",
      "ReadinessChecklistItem",
      "ContactPreference",
      "PasskeyMetadata",
      "VerusIdentityLink",
      "WalletChallenge",
      "VerificationRequest",
      "VerificationSession",
      "Appointment",
      "SessionAttendance",
      "EvidenceReviewRecord",
      "ReviewDecision",
      "Attestation",
      "AttestationStatus",
      "AttestationRevocation",
      "RenewalCycle",
      "EligibleSnapshot",
      "CycleSelection",
      "CycleReport",
      "Appeal",
      "CorrectionRequest",
      "PrivacyRightsRequest",
      "RelyingPartyClient",
      "RelyingPartyAccessAudit",
      "Notification",
      "ProtocolRelease",
      "CapabilityStatus",
      "AnchorRecord",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("keeps the domain package independent of frameworks and persistence", async () => {
    const manifest = JSON.parse(await readFile("packages/domain/package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
    const sources = await Promise.all(
      [
        "attestation.ts",
        "committee.ts",
        "renewal-cycle.ts",
        "verification.ts",
        "wallet-challenge.ts",
      ].map((file) => readFile(`packages/domain/src/${file}`, "utf8")),
    );
    expect(sources.join("\n")).not.toMatch(/@prisma|nestjs|next\/|fastify|express|http:/i);
  });

  it("keeps the participant account opaque and free of collection fields", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const participant = block(schema, "model ParticipantAccount");
    const scalarFields = participant
      .split("\n")
      .filter((line) => !line.includes("[]") && !line.includes("@relation"))
      .join("\n");

    expect(participant).toContain("externalReference");
    expect(scalarFields).not.toMatch(
      /name|email|phone|address|birth|document|evidence|image|photo|biometric|wallet|seed|privateKey/i,
    );
  });

  it("stores only an opaque reference and digest for outbox payload identity", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const outbox = block(schema, "model OutboxEvent");

    expect(outbox).toContain("payloadReference");
    expect(outbox).toContain("payloadDigest");
    expect(outbox).not.toMatch(/payload\s+Json|rpcMethod|rpcParams/i);
  });

  it("makes VRSCTEST the only representable Verus network", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const network = block(schema, "enum VerusNetwork");
    const migration = await readFile(
      "packages/db/prisma/migrations/20260807020000_issue_16_persistence_foundation/migration.sql",
      "utf8",
    );

    const networkValues = network
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("@@"));
    expect(networkValues).toEqual(["VRSCTEST"]);
    expect(migration).toContain("iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq");
    expect(migration).toContain("verus_job_vrsctest_chain");
    expect(migration).not.toMatch(/CREATE TYPE "verus_network"[^;]*mainnet/i);
  });

  it("installs append-only and immutable-identity database guards", async () => {
    const migration = await readFile(
      "packages/db/prisma/migrations/20260807020000_issue_16_persistence_foundation/migration.sql",
      "utf8",
    );

    for (const guard of [
      "audit_event_chain_guard",
      "audit_event_append_only",
      "outbox_attempt_append_only",
      "idempotency_identity_guard",
      "outbox_identity_guard",
      "verus_job_identity_guard",
    ]) {
      expect(migration).toContain(guard);
    }
  });

  it("enforces exact expiry, tenant joins, state transitions, and crash-safe leases", async () => {
    const migration = await readFile(
      "packages/db/prisma/migrations/20260807050000_issue_16_domain_core_complete/migration.sql",
      "utf8",
    );
    for (const invariant of [
      "attestation_validity_window",
      "INTERVAL '45 days'",
      "attestation_effective_status",
      "verification_request_transition_guard",
      "committee_transition_guard",
      "outbox_transition_guard",
      "lease_acquired_at",
      "verification_request_tenant_participant_key",
      "review_decision_member_tenant_fkey",
      "attestation_request_tenant_fkey",
      "cbc_validate_attestation_renewal",
      "review_decision_append_only",
      "relying_party_access_audit_append_only",
    ]) {
      expect(migration).toContain(invariant);
    }
  });

  it("exposes named repositories without a generic status mutation API", async () => {
    const index = await readFile("packages/db/src/index.ts", "utf8");
    const verification = await readFile("packages/db/src/verification-repository.ts", "utf8");
    const lifecycle = await readFile("packages/db/src/lifecycle-repository.ts", "utf8");

    expect(index).toContain("VerificationRepository");
    expect(index).toContain("AttestationRepository");
    expect(index).toContain("LifecycleRepository");
    expect(index).toContain("OutboxRepository");
    expect(`${verification}\n${lifecycle}`).not.toMatch(/public\s+(setStatus|updateStatus)/);
  });

  it("keeps audit records and synthetic verification free of prohibited payloads", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const audit = block(schema, "model AuditEvent");
    const verification = await readFile("scripts/verify-domain-persistence.ts", "utf8");

    expect(audit).not.toMatch(
      /evidencePayload|documentNumber|exactAddress|faceImage|privateNarrative|walletSecret|tokenValue/i,
    );
    expect(verification).toContain("synthetic");
    expect(verification).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}|seed phrase|private key/i);
  });
});
