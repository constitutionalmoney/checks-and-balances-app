import { createHash } from "node:crypto";

import { VerusIntegrationError } from "./errors.js";
import {
  markIdentityUpdatePrepared,
  type JsonObject,
  type JsonValue,
  type PreparedIdentityUpdate,
  type VerusIdentityDefinition,
} from "./types.js";

const ALWAYS_FORBIDDEN_FIELDS = new Set([
  "appealdetail",
  "appealfacts",
  "committeeevidence",
  "committeenotes",
  "dateofbirth",
  "documentimage",
  "documentnumber",
  "evidencehash",
  "exactaddress",
  "faceimage",
  "identitydocument",
  "privatekey",
  "privatesessionlocation",
  "rpcpassword",
  "seedphrase",
  "sessiontoken",
  "utilitybill",
  "walletbackup",
  "walletseed",
  "wif",
  "zseed",
]);

export interface CanonicalPayloadPolicy {
  readonly policyReference: string;
  readonly allowedTopLevelFields: readonly string[];
  readonly requiredTopLevelFields: readonly string[];
  readonly maximumBytes: number;
}

export interface CanonicalPayload {
  readonly value: JsonObject;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly policyReference: string;
}

export function prepareCanonicalPayload(
  value: JsonObject,
  policy: CanonicalPayloadPolicy,
): CanonicalPayload {
  if (!Number.isSafeInteger(policy.maximumBytes) || policy.maximumBytes < 1) {
    throw new VerusIntegrationError(
      "PAYLOAD_OVERSIZE",
      "Server payload byte limit is invalid",
      false,
    );
  }
  const allowed = new Set(policy.allowedTopLevelFields);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.has(key)) ||
    policy.requiredTopLevelFields.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new VerusIntegrationError(
      "PAYLOAD_FORBIDDEN",
      "Anchor payload contains a field not present in the server-selected allowlist",
      false,
    );
  }
  rejectForbiddenFields(value);
  const canonical = canonicalizeJson(value);
  const bytes = new TextEncoder().encode(canonical);
  if (bytes.byteLength > policy.maximumBytes) {
    throw new VerusIntegrationError(
      "PAYLOAD_OVERSIZE",
      "Anchor payload exceeds the server-selected byte limit",
      false,
    );
  }
  return {
    value,
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
    policyReference: policy.policyReference,
  };
}

export function prepareIdentityContentUpdate(
  identity: VerusIdentityDefinition,
  vdxfKey: string,
  payload: CanonicalPayload,
): PreparedIdentityUpdate {
  if (!/^i[1-9A-HJ-NP-Za-km-z]{20,63}$/.test(vdxfKey)) {
    throw new VerusIntegrationError(
      "VDXF_ID_MISMATCH",
      "VDXF key is not an approved i-address-shaped identifier",
      false,
    );
  }
  const contentMultiMap = {
    ...identity.contentMultiMap,
    [vdxfKey]: [Buffer.from(payload.bytes).toString("hex")],
  };
  return markIdentityUpdatePrepared(
    {
      ...identity,
      contentMultiMap,
    },
    vdxfKey,
    payload.digest,
  );
}

export function canonicalizeJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new VerusIntegrationError(
        "PAYLOAD_FORBIDDEN",
        "Anchor payload contains a non-finite number",
        false,
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key.normalize("NFC"))}:${canonicalizeJson(item)}`)
    .join(",")}}`;
}

export function deterministicVerusIdempotencyKey(input: {
  readonly operationType: string;
  readonly subjectReference: string;
  readonly vdxfKey: string;
  readonly manifestDigest: string;
}): string {
  const material = [
    "VRSCTEST",
    input.operationType,
    input.subjectReference,
    input.vdxfKey,
    input.manifestDigest,
  ].join("\u001f");
  return `verus:v1:${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

function rejectForbiddenFields(value: JsonValue, depth = 0): void {
  if (depth > 32) {
    throw new VerusIntegrationError(
      "PAYLOAD_FORBIDDEN",
      "Anchor payload nesting exceeds the server limit",
      false,
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenFields(item, depth + 1);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      ALWAYS_FORBIDDEN_FIELDS.has(normalized) ||
      normalized === "proto" ||
      normalized === "constructor" ||
      normalized === "prototype"
    ) {
      throw new VerusIntegrationError(
        "PAYLOAD_FORBIDDEN",
        "Anchor payload contains a prohibited private or security-sensitive field",
        false,
      );
    }
    rejectForbiddenFields(item, depth + 1);
  }
}
