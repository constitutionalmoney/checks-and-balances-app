import { readFile } from "node:fs/promises";

import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

const expectedWorkspaces = [
  "apps/participant",
  "apps/committee",
  "apps/verify",
  "apps/api",
  "apps/worker",
  "apps/docs",
  "packages/domain",
  "packages/db",
  "packages/auth",
  "packages/verus",
  "packages/contracts",
  "packages/ui",
  "packages/config",
  "packages/observability",
  "packages/testkit",
];

describe("WP-01 reproducibility contract", () => {
  it("declares every required app and package as a private workspace", async () => {
    for (const workspace of expectedWorkspaces) {
      const manifest = JSON.parse(await readFile(`${workspace}/package.json`, "utf8")) as {
        private?: boolean;
        license?: string;
      };
      expect(manifest.private, workspace).toBe(true);
      expect(manifest.license, workspace).toBe("Apache-2.0");
    }
  });

  it("keeps local unsafe capabilities disabled", () => {
    const config = loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" });
    expect(config.CBC_MAINNET_WRITES_ENABLED).toBe(false);
    expect(config.CBC_DOCUMENT_UPLOAD_ENABLED).toBe(false);
    expect(config.CBC_PUBLIC_SESSIONS_ENABLED).toBe(false);
    expect(config.CBC_PARTICIPANT_SESSION_AUDIENCE).not.toBe(config.CBC_COMMITTEE_SESSION_AUDIENCE);
  });

  it("declares the complete local dependency stack without object storage", async () => {
    const compose = await readFile("infra/docker/compose.yaml", "utf8");
    for (const service of [
      "postgres:",
      "migrate:",
      "redis:",
      "mailpit:",
      "fake-verus-rpc:",
      "api:",
      "worker:",
      "participant:",
      "committee:",
      "verify:",
      "docs:",
    ]) {
      expect(compose).toContain(service);
    }
    expect(compose).toContain("working_dir: /workspace/packages/db");
    expect(compose).not.toMatch(/minio|s3|object.?store/i);
  });

  it("keeps the Dokploy deployment private and fail-closed", async () => {
    const compose = await readFile("compose.dokploy.yaml", "utf8");
    for (const service of [
      "postgres:",
      "redis:",
      "migrate:",
      "api:",
      "worker:",
      "participant:",
      "committee:",
      "verify:",
      "docs:",
    ]) {
      expect(compose).toContain(service);
    }

    expect(compose).toContain("working_dir: /workspace/packages/db");
    expect(compose).toContain("CBC_ENVIRONMENT: testnet");
    expect(compose).toContain("CBC_VERUS_NETWORK: VRSCTEST");
    expect(compose).toContain('CBC_MAINNET_WRITES_ENABLED: "false"');
    expect(compose).toContain('CBC_DOCUMENT_UPLOAD_ENABLED: "false"');
    expect(compose).toMatch(/private:\s+internal: true/);
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).not.toMatch(/^\s+container_name:/m);
    expect(compose).not.toMatch(/(?:^|\s)-\s+\.\//m);
  });
});
