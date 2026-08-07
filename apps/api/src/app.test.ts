import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

import { createApiApp } from "./app.js";
import type { ReadinessReport } from "./readiness.js";

const ready: ReadinessReport = {
  ready: true,
  dependencies: {
    postgres: { ok: true, detail: "synthetic" },
    redis: { ok: true, detail: "synthetic" },
    verusRpc: { ok: true, detail: "synthetic" },
  },
};

describe("API foundation shell", () => {
  it("exposes health and non-operational VRSCTEST status", async () => {
    const { app } = await createApiApp({
      config: loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" }),
      dependencyChecker: async () => ready,
    });

    const health = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/health" });
    const status = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/api/v1/protocol/status" });

    expect(health.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      stage: "specification",
      network: "VRSCTEST",
      operational: false,
      environment: "ci",
    });
    await app.close();
  });

  it("fails readiness closed when a dependency is unavailable", async () => {
    const { app } = await createApiApp({
      config: loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" }),
      dependencyChecker: async () => ({
        ...ready,
        ready: false,
        dependencies: {
          ...ready.dependencies,
          redis: { ok: false, detail: "synthetic outage" },
        },
      }),
    });

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ ready: false });
    await app.close();
  });
});
