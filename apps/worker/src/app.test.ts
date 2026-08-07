import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

import { createWorkerServer } from "./app.js";

describe("worker foundation shell", () => {
  it("exposes liveness, readiness, and private privacy-safe metrics", async () => {
    const { server } = await createWorkerServer({
      config: loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" }),
      dependencyChecker: async () => ({ ready: true, dependencies: {} }),
    });
    let closed = false;
    server.addHook("onClose", async () => {
      closed = true;
    });

    const health = await server.inject({ method: "GET", url: "/health" });
    const readiness = await server.inject({ method: "GET", url: "/ready" });
    const metrics = await server.inject({ method: "GET", url: "/metrics" });
    expect(health.statusCode).toBe(200);
    expect(readiness.json()).toEqual({ ready: true, dependencies: {} });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
    expect(metrics.body).toContain("cbc_verus_worker_paused");
    await server.close();
    expect(closed).toBe(true);
  });
});
