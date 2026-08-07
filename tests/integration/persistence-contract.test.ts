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
  it("keeps the participant account opaque and free of collection fields", async () => {
    const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
    const participant = block(schema, "model ParticipantAccount");

    expect(participant).toContain("externalReference");
    expect(participant).not.toMatch(
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
});
