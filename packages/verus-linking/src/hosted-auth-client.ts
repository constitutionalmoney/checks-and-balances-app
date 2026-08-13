import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_JSON_BYTES = 64 * 1024;
const MAX_DEEP_LINK_BYTES = 16 * 1024;
const MAX_TOKEN_BYTES = 16 * 1024;
const IADDRESS_PATTERN = /^i[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const LOGIN_CONSENT_SCHEME = "i5jtwbp6zymeay9llnraglgjqgdrffsau4:";
const APPROVED_CHAIN_READ_URL = "https://api.verustest.net";

export type HostedAuthErrorCode =
  "UNAVAILABLE" | "INCOMPATIBLE" | "INVALID_RESPONSE" | "INVALID_TOKEN";

export class HostedAuthError extends Error {
  constructor(readonly code: HostedAuthErrorCode) {
    super("The hosted VRSCTEST identity service could not be used safely.");
    this.name = "HostedAuthError";
  }
}

export interface HostedAuthClientConfig {
  readonly baseUrl: string;
  readonly contractVersion: "cbc-verusid-auth.v1";
  readonly serviceVersion: string;
  readonly serviceSourceRevision: string;
  readonly imageDigest: string;
  readonly sdkCommit: string;
  readonly primitivesCommit: string;
  readonly rpcClientCommit: string;
  readonly bitgoCommit: string;
  readonly daemonVersion: string;
  readonly applicationIdentityAddress: string;
  readonly callbackUrl: string;
  readonly issuer: string;
  readonly clientSecret: string;
  readonly jwtSecret: string;
  readonly timeoutMs?: number;
}

export interface CreateHostedChallengeInput {
  readonly state: string;
  readonly audience: string;
  readonly purpose: "link_verusid" | "revalidate_verusid";
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface HostedChallenge {
  readonly challengeId: string;
  readonly deepLink: string;
  readonly presentationDigest: string;
  readonly signerIdentityAddress: string;
  readonly callbackUrl: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface GetHostedResultInput {
  readonly challengeId: string;
  readonly state: string;
  readonly audience: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly now: Date;
}

export type HostedResult =
  | { readonly kind: "pending" }
  | {
      readonly kind: "verified";
      readonly identityAddress: string;
      readonly displayNameSnapshot?: string;
      readonly proofDigest: string;
      readonly tokenIssuedAt: Date;
      readonly tokenExpiresAt: Date;
    };

export interface HostedVerusIdAuthClient {
  createChallenge(input: CreateHostedChallengeInput): Promise<HostedChallenge>;
  getResult(input: GetHostedResultInput): Promise<HostedResult>;
  acknowledgeResult(input: {
    readonly challengeId: string;
    readonly proofDigest: string;
  }): Promise<void>;
}

export class HostedVerusIdAuthHttpClient implements HostedVerusIdAuthClient {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: HostedAuthClientConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.baseUrl = requireHttpsBaseUrl(config.baseUrl);
    requireHttpsCallback(config.callbackUrl);
    requireSecret(config.clientSecret);
    requireSecret(config.jwtSecret);
    requireReleaseMetadata(config);
    if (!IADDRESS_PATTERN.test(config.applicationIdentityAddress)) {
      throw new HostedAuthError("INCOMPATIBLE");
    }
    this.timeoutMs = config.timeoutMs ?? 8_000;
  }

  async createChallenge(input: CreateHostedChallengeInput): Promise<HostedChallenge> {
    await this.preflight();
    if (
      input.expiresAt <= input.issuedAt ||
      input.expiresAt.getTime() - input.issuedAt.getTime() > 5 * 60_000
    ) {
      throw new HostedAuthError("INVALID_RESPONSE");
    }
    const response = await this.request("/api/auth/verusid/challenge", {
      method: "POST",
      body: JSON.stringify({
        state: input.state,
        audience: input.audience,
        purpose: input.purpose,
        issuedAt: input.issuedAt.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
        requestedAccess: ["identity_view"],
      }),
    });
    if (!response.ok) throw new HostedAuthError("UNAVAILABLE");
    const body = await readJson(response);
    const data = objectValue(body, "data");
    if (body.success !== true || data == null) throw new HostedAuthError("INVALID_RESPONSE");

    const challengeId = stringValue(data, "challengeID", 100);
    const deepLink = stringValue(data, "deepLink", MAX_DEEP_LINK_BYTES);
    const reportedDigest = stringValue(data, "requestDigest", 64);
    const signer = stringValue(data, "signingIdentity", 64);
    const callbackUrl = stringValue(data, "callbackUrl", 2_048);
    const network = stringValue(data, "network", 32);
    const contractVersion = stringValue(data, "contractVersion", 64);
    const issuedAt = dateValue(data, "issuedAt");
    const expiresAt = dateValue(data, "expiresAt");
    const presentationDigest = sha256(Buffer.from(deepLink, "utf8"));

    let parsedDeepLink: URL;
    try {
      parsedDeepLink = new URL(deepLink);
    } catch {
      throw new HostedAuthError("INVALID_RESPONSE");
    }
    if (
      !IADDRESS_PATTERN.test(challengeId) ||
      parsedDeepLink.protocol !== LOGIN_CONSENT_SCHEME ||
      reportedDigest !== presentationDigest ||
      signer !== this.config.applicationIdentityAddress ||
      callbackUrl !== this.config.callbackUrl ||
      network !== "VRSCTEST" ||
      contractVersion !== this.config.contractVersion ||
      issuedAt.getTime() !== input.issuedAt.getTime() ||
      expiresAt.getTime() !== input.expiresAt.getTime()
    ) {
      throw new HostedAuthError("INCOMPATIBLE");
    }

    return Object.freeze({
      challengeId,
      deepLink,
      presentationDigest,
      signerIdentityAddress: signer,
      callbackUrl,
      issuedAt,
      expiresAt,
    });
  }

  async getResult(input: GetHostedResultInput): Promise<HostedResult> {
    if (!IADDRESS_PATTERN.test(input.challengeId)) {
      throw new HostedAuthError("INVALID_RESPONSE");
    }
    const response = await this.request(
      `/api/auth/verusid/result/${encodeURIComponent(input.challengeId)}`,
      { method: "GET" },
    );
    if (response.status === 404 || response.status === 202) {
      return Object.freeze({ kind: "pending" });
    }
    if (!response.ok) throw new HostedAuthError("UNAVAILABLE");
    const body = await readJson(response);
    if (body.success !== true) throw new HostedAuthError("INVALID_RESPONSE");
    const token = stringValue(body, "JWT", MAX_TOKEN_BYTES);
    const identityAddress = stringValue(body, "iaddress", 64);
    const verified = verifyJwt(token, this.config.jwtSecret, {
      issuer: this.config.issuer,
      audience: input.audience,
      challengeId: input.challengeId,
      state: input.state,
      identityAddress,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      now: input.now,
    });
    const displayName = optionalStringValue(body, "name", 200);
    return Object.freeze({
      kind: "verified",
      identityAddress,
      ...(displayName ? { displayNameSnapshot: displayName } : {}),
      proofDigest: sha256(Buffer.from(token, "utf8")),
      tokenIssuedAt: new Date(verified.iat * 1_000),
      tokenExpiresAt: new Date(verified.exp * 1_000),
    });
  }

  async acknowledgeResult(input: {
    readonly challengeId: string;
    readonly proofDigest: string;
  }): Promise<void> {
    if (!IADDRESS_PATTERN.test(input.challengeId) || !/^[a-f0-9]{64}$/.test(input.proofDigest)) {
      throw new HostedAuthError("INVALID_RESPONSE");
    }
    const response = await this.request(
      `/api/auth/verusid/result/${encodeURIComponent(input.challengeId)}/ack`,
      {
        method: "POST",
        body: JSON.stringify({ proofDigest: input.proofDigest }),
      },
    );
    if (!response.ok) throw new HostedAuthError("UNAVAILABLE");
  }

  private async preflight(): Promise<void> {
    const response = await this.request("/health", { method: "GET" });
    if (!response.ok) throw new HostedAuthError("UNAVAILABLE");
    const health = await readJson(response);
    if (
      health.status !== "ok" ||
      health.service !== "verusid-auth" ||
      health.version !== this.config.serviceVersion ||
      health.service_source_revision !== this.config.serviceSourceRevision ||
      health.image_digest !== this.config.imageDigest ||
      health.verusid_ts_client_commit !== this.config.sdkCommit ||
      health.verus_primitives_commit !== this.config.primitivesCommit ||
      health.verusd_rpc_client_commit !== this.config.rpcClientCommit ||
      health.verus_bitgo_commit !== this.config.bitgoCommit ||
      health.daemon_version !== this.config.daemonVersion ||
      health.chain_read_url !== APPROVED_CHAIN_READ_URL ||
      health.chain !== "vrsctest" ||
      health.contract_version !== this.config.contractVersion ||
      health.signing_identity !== this.config.applicationIdentityAddress ||
      health.callback_url !== this.config.callbackUrl ||
      health.jwt_issuer !== this.config.issuer ||
      health.signing_identity_configured !== true ||
      health.chain_configured !== true ||
      health.sdk_ready !== true ||
      health.result_authentication !== "client_secret" ||
      health.result_delivery !== "idempotent_until_ack"
    ) {
      throw new HostedAuthError("INCOMPATIBLE");
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImplementation(new URL(path, this.baseUrl), {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.clientSecret}`,
          "content-type": "application/json",
          "x-cbc-auth-contract-version": this.config.contractVersion,
        },
      });
    } catch {
      throw new HostedAuthError("UNAVAILABLE");
    }
  }
}

interface ExpectedJwt {
  readonly issuer: string;
  readonly audience: string;
  readonly challengeId: string;
  readonly state: string;
  readonly identityAddress: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly now: Date;
}

function verifyJwt(
  token: string,
  secret: string,
  expected: ExpectedJwt,
): { readonly iat: number; readonly exp: number } {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new HostedAuthError("INVALID_TOKEN");
  }
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
  const header = parseBase64UrlJson(encodedHeader);
  const claims = parseBase64UrlJson(encodedClaims);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new HostedAuthError("INVALID_TOKEN");
  }
  const suppliedSignature = decodeBase64Url(encodedSignature);
  const expectedSignature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedClaims}`, "utf8")
    .digest();
  if (
    suppliedSignature.byteLength !== expectedSignature.byteLength ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new HostedAuthError("INVALID_TOKEN");
  }

  const iat = integerValue(claims, "iat");
  const exp = integerValue(claims, "exp");
  const nowSeconds = Math.floor(expected.now.getTime() / 1_000);
  const earliestSeconds = Math.floor(expected.issuedAt.getTime() / 1_000) - 60;
  const latestSeconds = Math.floor(expected.expiresAt.getTime() / 1_000) + 60;
  if (
    claims.iss !== expected.issuer ||
    claims.aud !== expected.audience ||
    claims.challengeID !== expected.challengeId ||
    claims.state !== expected.state ||
    claims.idLoggedIn !== expected.identityAddress ||
    typeof claims.jti !== "string" ||
    claims.jti.length < 16 ||
    !IADDRESS_PATTERN.test(expected.identityAddress) ||
    iat < earliestSeconds ||
    iat > nowSeconds + 60 ||
    exp <= nowSeconds ||
    exp > latestSeconds ||
    exp <= iat
  ) {
    throw new HostedAuthError("INVALID_TOKEN");
  }
  return { iat, exp };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const reportedLength = Number(response.headers.get("content-length") ?? 0);
  if (reportedLength > MAX_JSON_BYTES) throw new HostedAuthError("INVALID_RESPONSE");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new HostedAuthError("INVALID_RESPONSE");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new HostedAuthError("INVALID_RESPONSE");
  }
}

function parseBase64UrlJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value).toString("utf8"));
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HostedAuthError("INVALID_TOKEN");
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new HostedAuthError("INVALID_TOKEN");
  return Buffer.from(value, "base64url");
}

function objectValue(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = source[key];
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(source: Record<string, unknown>, key: string, maxLength: number): string {
  const value = source[key];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > maxLength ||
    hasControlCharacter(value)
  ) {
    throw new HostedAuthError("INVALID_RESPONSE");
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function optionalStringValue(
  source: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  if (source[key] == null) return undefined;
  return stringValue(source, key, maxLength);
}

function integerValue(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HostedAuthError("INVALID_TOKEN");
  }
  return value;
}

function dateValue(source: Record<string, unknown>, key: string): Date {
  const value = stringValue(source, key, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new HostedAuthError("INVALID_RESPONSE");
  }
  return parsed;
}

function requireHttpsBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HostedAuthError("INCOMPATIBLE");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new HostedAuthError("INCOMPATIBLE");
  }
  return url;
}

function requireHttpsCallback(value: string): void {
  let callback: URL;
  try {
    callback = new URL(value);
  } catch {
    throw new HostedAuthError("INCOMPATIBLE");
  }
  if (callback.protocol !== "https:" || callback.username || callback.password || callback.hash) {
    throw new HostedAuthError("INCOMPATIBLE");
  }
}

function requireSecret(value: string): void {
  if (value.length < 32) throw new HostedAuthError("INCOMPATIBLE");
}

function requireReleaseMetadata(config: HostedAuthClientConfig): void {
  const commits = [
    config.serviceSourceRevision,
    config.sdkCommit,
    config.primitivesCommit,
    config.rpcClientCommit,
    config.bitgoCommit,
  ];
  if (
    !/^\d+\.\d+\.\d+$/.test(config.serviceVersion) ||
    commits.some((value) => !/^[a-f0-9]{40}$/.test(value)) ||
    !/^sha256:[a-f0-9]{64}$/.test(config.imageDigest) ||
    config.daemonVersion.length === 0
  ) {
    throw new HostedAuthError("INCOMPATIBLE");
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
