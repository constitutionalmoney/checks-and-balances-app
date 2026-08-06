import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../../apps/api/src/app";
import { createWorkerServer } from "../../apps/worker/src/app";

describe("foundation HTTP shells", () => {
  it("serves fail-closed API and worker status over their real HTTP adapters", async () => {
    const config = loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" });
    const { app } = await createApiApp({
      config,
      dependencyChecker: async () => ({
        ready: true,
        dependencies: {
          postgres: { ok: true, detail: "synthetic" },
          redis: { ok: true, detail: "synthetic" },
          verusRpc: { ok: true, detail: "synthetic" },
        },
      }),
    });
    const { server } = await createWorkerServer({
      config,
      dependencyChecker: async () => ({ ready: true, dependencies: {} }),
    });

    const protocol = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/api/v1/protocol/status" });
    const worker = await server.inject({ method: "GET", url: "/health" });

    expect(protocol.statusCode).toBe(200);
    expect(protocol.json()).toMatchObject({ operational: false, network: "VRSCTEST" });
    expect(worker.json()).toEqual({ status: "ok", service: "worker" });

    await app.close();
    await server.close();
  });
});
