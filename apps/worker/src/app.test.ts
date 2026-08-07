import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

import { createWorkerServer } from "./app";

describe("worker foundation shell", () => {
  it("exposes liveness and readiness without registering protocol jobs", async () => {
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
    expect(health.statusCode).toBe(200);
    expect(readiness.json()).toEqual({ ready: true, dependencies: {} });
    await server.close();
    expect(closed).toBe(true);
  });
});
