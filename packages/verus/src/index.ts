export interface VerusReadinessOptions {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly timeoutMs?: number;
}

export interface VerusReadinessResult {
  readonly ok: boolean;
  readonly detail: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function checkVerusReadiness(
  options: VerusReadinessOptions,
): Promise<VerusReadinessResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.username && options.password) {
    headers.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  }

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: "cbc-readiness", method: "getinfo", params: [] }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isObject(payload) || !("result" in payload)) {
      return { ok: false, detail: "fake/private Verus RPC returned an invalid readiness response" };
    }
    return { ok: true, detail: "fake/private Verus RPC is reachable" };
  } catch {
    return { ok: false, detail: "fake/private Verus RPC is unavailable" };
  }
}
