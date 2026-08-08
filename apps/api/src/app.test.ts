import { loadRuntimeConfig } from "@cbc/config";
import { describe, expect, it } from "vitest";

import { createApiApp } from "./app.js";
import type { ReadinessReport } from "./readiness.js";
import type { WalletLinkHttpFacade } from "./wallet-link-http.js";

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

  it("keeps optional wallet linking disabled and exposes no local wallet callback", async () => {
    const { app } = await createApiApp({
      config: loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" }),
      dependencyChecker: async () => ready,
    });
    const instance = app.getHttpAdapter().getInstance();
    const begin = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/verus/challenges",
      payload: { consent: true },
    });
    const callback = await instance.inject({ method: "POST", url: "/api/v1/auth/verus/callback" });

    expect(begin.statusCode).toBe(503);
    expect(begin.headers["cache-control"]).toBe("no-store");
    expect(callback.statusCode).toBe(404);
    await app.close();
  });

  it("returns only the hosted wallet presentation from an injected facade", async () => {
    const facade: WalletLinkHttpFacade = {
      async begin() {
        return {
          challengeReference: "wallet_challenge_synthetic0001",
          network: "VRSCTEST",
          requesterIdentity: "iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP",
          purpose: "link_verusid",
          scopes: ["verusid:link"],
          expiresAt: "2027-01-15T08:05:00.000Z",
          sameDeviceUrl: "i5jtwbp6zymeay9llnraglgjqgdrffsau4://x-callback-url/request",
          qrPayload: "i5jtwbp6zymeay9llnraglgjqgdrffsau4://x-callback-url/request",
          pollingToken: "synthetic-polling-token",
          operational: false,
          limitations: [],
        };
      },
      async poll() {
        throw new Error("not used");
      },
      async cancel() {},
      async unlink() {},
      async close() {},
    };
    const { app } = await createApiApp({
      config: loadRuntimeConfig({ CBC_ENVIRONMENT: "ci" }),
      dependencyChecker: async () => ready,
      walletLinkFacade: facade,
    });
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "POST",
        url: "/api/v1/auth/verus/challenges",
        payload: { consent: true },
      });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      network: "VRSCTEST",
      requesterIdentity: "iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP",
      operational: false,
    });
    expect(response.body).not.toContain("JWT");
    await app.close();
  });
});
