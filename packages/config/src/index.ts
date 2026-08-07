import { z } from "zod";

export const CBC_ENVIRONMENTS = ["local", "ci", "testnet", "pilot", "production"] as const;
export const CBC_VERUS_NETWORKS = ["FAKE", "VRSCTEST"] as const;

export const DISABLED_FEATURE_FLAGS = [
  "CBC_PUBLIC_DIRECTORY_ENABLED",
  "CBC_PUBLIC_SESSIONS_ENABLED",
  "CBC_VERUS_LINKING_ENABLED",
  "CBC_VERUS_IDENTITY_UPDATE_ENABLED",
  "CBC_COMMITTEE_SIGNING_ENABLED",
  "CBC_RANDOM_RENEWAL_ENABLED",
  "CBC_RMR_ADAPTER_ENABLED",
  "CBC_MAINNET_WRITES_ENABLED",
  "CBC_DOCUMENT_UPLOAD_ENABLED",
  "CBC_UNIQUENESS_CLAIM_ENABLED",
  "CBC_LOCALITY_CLAIM_ENABLED",
] as const;

const disabledFeature = z
  .union([z.literal("false"), z.literal("0"), z.literal(false)])
  .transform(() => false)
  .default(false);

const schema = z.object({
  CBC_ENVIRONMENT: z.enum(CBC_ENVIRONMENTS),
  CBC_PROTOCOL_STAGE: z.literal("specification"),
  CBC_RELEASE_STATUS: z.literal("not_operational"),
  CBC_VERUS_NETWORK: z.enum(CBC_VERUS_NETWORKS),
  CBC_VERUS_RPC_URL: z.string().url(),
  CBC_VERUS_RPC_USER: z.string().optional(),
  CBC_VERUS_RPC_PASSWORD: z.string().optional(),
  DATABASE_URL: z.string().min(1).startsWith("postgresql://"),
  REDIS_URL: z.string().min(1).startsWith("redis://"),
  CBC_PARTICIPANT_SESSION_AUDIENCE: z.string().min(1),
  CBC_COMMITTEE_SESSION_AUDIENCE: z.string().min(1),
  CBC_PARTICIPANT_ORIGIN: z.string().url(),
  CBC_COMMITTEE_ORIGIN: z.string().url(),
  CBC_PARTICIPANT_RELYING_PARTY_ID: z.string().min(1),
  CBC_COMMITTEE_RELYING_PARTY_ID: z.string().min(1),
  CBC_PARTICIPANT_AUTH_SECRET: z.string().min(32),
  CBC_COMMITTEE_AUTH_SECRET: z.string().min(32),
  CBC_RATE_LIMIT_SECRET: z.string().min(32),
  CBC_PARTICIPANT_SESSION_KEY_VERSION: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,31}$/),
  CBC_COMMITTEE_SESSION_KEY_VERSION: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,31}$/),
  CBC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
  CBC_SERVICE_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  CBC_PUBLIC_DIRECTORY_ENABLED: disabledFeature,
  CBC_PUBLIC_SESSIONS_ENABLED: disabledFeature,
  CBC_VERUS_LINKING_ENABLED: disabledFeature,
  CBC_VERUS_IDENTITY_UPDATE_ENABLED: disabledFeature,
  CBC_COMMITTEE_SIGNING_ENABLED: disabledFeature,
  CBC_RANDOM_RENEWAL_ENABLED: disabledFeature,
  CBC_RMR_ADAPTER_ENABLED: disabledFeature,
  CBC_MAINNET_WRITES_ENABLED: disabledFeature,
  CBC_DOCUMENT_UPLOAD_ENABLED: disabledFeature,
  CBC_UNIQUENESS_CLAIM_ENABLED: disabledFeature,
  CBC_LOCALITY_CLAIM_ENABLED: disabledFeature,
});

export type RuntimeConfig = Readonly<z.infer<typeof schema>>;

type EnvironmentInput = Readonly<Record<string, string | boolean | undefined>>;

const LOCAL_DEFAULTS = {
  CBC_PROTOCOL_STAGE: "specification",
  CBC_RELEASE_STATUS: "not_operational",
  CBC_VERUS_NETWORK: "FAKE",
  CBC_VERUS_RPC_URL: "http://127.0.0.1:18080",
  DATABASE_URL: "postgresql://cbc:cbc_local_only@127.0.0.1:55432/cbc",
  REDIS_URL: "redis://127.0.0.1:56379",
  CBC_PARTICIPANT_SESSION_AUDIENCE: "cbc-participant-app",
  CBC_COMMITTEE_SESSION_AUDIENCE: "cbc-committee-console",
  CBC_PARTICIPANT_ORIGIN: "http://localhost:3100",
  CBC_COMMITTEE_ORIGIN: "http://localhost:3101",
  CBC_PARTICIPANT_RELYING_PARTY_ID: "localhost",
  CBC_COMMITTEE_RELYING_PARTY_ID: "localhost",
  CBC_PARTICIPANT_AUTH_SECRET: "local-only-participant-auth-secret-change-me",
  CBC_COMMITTEE_AUTH_SECRET: "local-only-committee-auth-secret-change-me-now",
  CBC_RATE_LIMIT_SECRET: "local-only-rate-limit-secret-change-me-now",
  CBC_PARTICIPANT_SESSION_KEY_VERSION: "local-p-v1",
  CBC_COMMITTEE_SESSION_KEY_VERSION: "local-c-v1",
  CBC_LOG_LEVEL: "info",
} as const;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`)
    .join("; ");
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    !normalized.includes(".") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".svc")
  ) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function loadRuntimeConfig(input: EnvironmentInput = process.env): RuntimeConfig {
  const environmentResult = z.enum(CBC_ENVIRONMENTS).safeParse(input.CBC_ENVIRONMENT ?? "local");

  if (!environmentResult.success) {
    throw new Error(`Invalid runtime configuration: ${formatIssues(environmentResult.error)}`);
  }

  const environment = environmentResult.data;
  if (environment === "production") {
    throw new Error(
      "Invalid runtime configuration: production is reserved and cannot be activated by the WP-01 scaffold",
    );
  }

  const candidate = {
    ...LOCAL_DEFAULTS,
    ...input,
    CBC_ENVIRONMENT: environment,
  };
  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new Error(`Invalid runtime configuration: ${formatIssues(result.error)}`);
  }

  const config = result.data;
  if (config.CBC_PARTICIPANT_SESSION_AUDIENCE === config.CBC_COMMITTEE_SESSION_AUDIENCE) {
    throw new Error(
      "Invalid runtime configuration: participant and committee session audiences must be distinct",
    );
  }
  if (
    config.CBC_PARTICIPANT_AUTH_SECRET === config.CBC_COMMITTEE_AUTH_SECRET ||
    config.CBC_PARTICIPANT_ORIGIN === config.CBC_COMMITTEE_ORIGIN ||
    config.CBC_PARTICIPANT_SESSION_KEY_VERSION === config.CBC_COMMITTEE_SESSION_KEY_VERSION
  ) {
    throw new Error(
      "Invalid runtime configuration: participant and committee authentication trust must be distinct",
    );
  }

  if (environment === "testnet" || environment === "pilot") {
    if (
      [
        config.CBC_PARTICIPANT_AUTH_SECRET,
        config.CBC_COMMITTEE_AUTH_SECRET,
        config.CBC_RATE_LIMIT_SECRET,
      ].some((value) => value.startsWith("local-only-"))
    ) {
      throw new Error(
        "Invalid runtime configuration: deployed authentication secrets must be supplied explicitly",
      );
    }
    for (const [field, value] of [
      ["CBC_PARTICIPANT_ORIGIN", config.CBC_PARTICIPANT_ORIGIN],
      ["CBC_COMMITTEE_ORIGIN", config.CBC_COMMITTEE_ORIGIN],
    ] as const) {
      if (new URL(value).protocol !== "https:") {
        throw new Error(`Invalid runtime configuration: ${field} must use HTTPS outside local/CI`);
      }
    }
    if (config.CBC_PARTICIPANT_RELYING_PARTY_ID === config.CBC_COMMITTEE_RELYING_PARTY_ID) {
      throw new Error(
        "Invalid runtime configuration: deployed participant and committee relying-party IDs must be distinct",
      );
    }
  }

  if (
    (environment === "testnet" || environment === "pilot") &&
    config.CBC_VERUS_NETWORK !== "VRSCTEST"
  ) {
    throw new Error(
      `Invalid runtime configuration: ${environment} requires CBC_VERUS_NETWORK=VRSCTEST`,
    );
  }

  if (config.CBC_VERUS_NETWORK === "VRSCTEST") {
    const missing = [
      !nonEmpty(config.CBC_VERUS_RPC_USER) ? "CBC_VERUS_RPC_USER" : undefined,
      !nonEmpty(config.CBC_VERUS_RPC_PASSWORD) ? "CBC_VERUS_RPC_PASSWORD" : undefined,
    ].filter((value): value is string => value !== undefined);
    if (missing.length > 0) {
      throw new Error(`Invalid runtime configuration: VRSCTEST requires ${missing.join(" and ")}`);
    }
  }

  const rpcUrl = new URL(config.CBC_VERUS_RPC_URL);
  if (!isPrivateHostname(rpcUrl.hostname)) {
    throw new Error(
      "Invalid runtime configuration: CBC_VERUS_RPC_URL must resolve to localhost or a private-network host",
    );
  }
  if (rpcUrl.username || rpcUrl.password) {
    throw new Error(
      "Invalid runtime configuration: RPC credentials must use dedicated variables, not URL user-info",
    );
  }

  return Object.freeze(config);
}
