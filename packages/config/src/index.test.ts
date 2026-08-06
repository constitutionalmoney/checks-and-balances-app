import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./index";

const testnetConfig = {
  CBC_ENVIRONMENT: "testnet",
  CBC_VERUS_NETWORK: "VRSCTEST",
  CBC_VERUS_RPC_URL: "http://verus-rpc.internal:27486",
  CBC_VERUS_RPC_USER: "synthetic-user",
  CBC_VERUS_RPC_PASSWORD: "synthetic-password",
} as const;

describe("loadRuntimeConfig", () => {
  it("creates a safe local profile without secrets", () => {
    const config = loadRuntimeConfig({});

    expect(config.CBC_ENVIRONMENT).toBe("local");
    expect(config.CBC_VERUS_NETWORK).toBe("FAKE");
    expect(config.CBC_MAINNET_WRITES_ENABLED).toBe(false);
    expect(config.CBC_DOCUMENT_UPLOAD_ENABLED).toBe(false);
  });

  it("accepts an explicitly configured private VRSCTEST profile", () => {
    expect(loadRuntimeConfig(testnetConfig).CBC_VERUS_NETWORK).toBe("VRSCTEST");
  });

  it("rejects VRSC/mainnet", () => {
    expect(() =>
      loadRuntimeConfig({ CBC_ENVIRONMENT: "local", CBC_VERUS_NETWORK: "VRSC" }),
    ).toThrow(/CBC_VERUS_NETWORK/);
  });

  it("rejects mainnet writes and unfinished capabilities", () => {
    expect(() => loadRuntimeConfig({ CBC_MAINNET_WRITES_ENABLED: "true" })).toThrow(
      /CBC_MAINNET_WRITES_ENABLED/,
    );
    expect(() => loadRuntimeConfig({ CBC_PUBLIC_SESSIONS_ENABLED: "true" })).toThrow(
      /CBC_PUBLIC_SESSIONS_ENABLED/,
    );
  });

  it("rejects production activation", () => {
    expect(() => loadRuntimeConfig({ CBC_ENVIRONMENT: "production" })).toThrow(
      /reserved.*cannot be activated/,
    );
  });

  it("requires testnet RPC credentials without disclosing their values", () => {
    expect(() =>
      loadRuntimeConfig({
        ...testnetConfig,
        CBC_VERUS_RPC_PASSWORD: undefined,
      }),
    ).toThrow(/CBC_VERUS_RPC_PASSWORD/);
  });

  it("rejects public authenticated RPC", () => {
    expect(() =>
      loadRuntimeConfig({
        ...testnetConfig,
        CBC_VERUS_RPC_URL: "https://rpc.example.com",
      }),
    ).toThrow(/private-network host/);
  });

  it("keeps participant and committee audiences distinct", () => {
    expect(() =>
      loadRuntimeConfig({
        CBC_PARTICIPANT_SESSION_AUDIENCE: "same-audience",
        CBC_COMMITTEE_SESSION_AUDIENCE: "same-audience",
      }),
    ).toThrow(/must be distinct/);
  });
});
