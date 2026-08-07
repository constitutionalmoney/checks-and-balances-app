import { VerusIntegrationError } from "./errors.js";
import type { JsonObject, JsonValue } from "./types.js";

export function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResult(field);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidResult(field);
  return value;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidResult(field);
  return value;
}

export function requireInteger(value: unknown, field: string): number {
  const result = requireNumber(value, field);
  if (!Number.isSafeInteger(result)) throw invalidResult(field);
  return result;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidResult(field);
  return value;
}

export function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw invalidResult(field);
  }
  return value;
}

export function requireJsonValue(value: unknown, field: string, depth = 0): JsonValue {
  if (depth > 32) throw invalidResult(field);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item) => requireJsonValue(item, field, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = requireJsonValue(item, field, depth + 1);
    }
    return result;
  }
  throw invalidResult(field);
}

export function requireJsonObject(value: unknown, field: string): JsonObject {
  const result = requireJsonValue(value, field);
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw invalidResult(field);
  }
  return result as JsonObject;
}

export function requireHex(value: unknown, field: string, bytes?: number): string {
  const result = requireString(value, field);
  const expected =
    bytes === undefined ? /^[0-9a-f]+$/i : new RegExp(`^[0-9a-f]{${bytes * 2}}$`, "i");
  if (!expected.test(result)) throw invalidResult(field);
  return result.toLowerCase();
}

function invalidResult(field: string): VerusIntegrationError {
  return new VerusIntegrationError(
    "RPC_INVALID_RESULT",
    `Verus RPC returned an invalid ${field} field`,
    false,
  );
}
