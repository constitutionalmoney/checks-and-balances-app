export * from "./approved-fixtures.js";
export * from "./canonical-content.js";
export * from "./errors.js";
export * from "./fake-adapter.js";
export * from "./preflight.js";
export * from "./reconciliation.js";
export * from "./rpc-adapter.js";
export * from "./types.js";

import { HttpVerusRpcAdapter, type HttpVerusRpcAdapterOptions } from "./rpc-adapter.js";

export type VerusReadinessOptions = HttpVerusRpcAdapterOptions;

export interface VerusReadinessResult {
  readonly ok: boolean;
  readonly detail: string;
}

export async function checkVerusReadiness(
  options: VerusReadinessOptions,
): Promise<VerusReadinessResult> {
  try {
    const adapter = new HttpVerusRpcAdapter(options);
    await adapter.getInfo();
    return { ok: true, detail: "fake/private Verus RPC is reachable" };
  } catch {
    return { ok: false, detail: "fake/private Verus RPC is unavailable" };
  }
}
