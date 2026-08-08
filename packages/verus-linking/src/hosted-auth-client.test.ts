import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  HostedAuthError,
  HostedVerusIdAuthHttpClient,
  type HostedAuthClientConfig,
} from "./hosted-auth-client.js";

const NOW = new Date("2027-01-15T08:00:00.000Z");
const EXPIRES = new Date("2027-01-15T08:05:00.000Z");
const CHALLENGE = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";
const IDENTITY = "iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP";
const DEEP_LINK = "i5jtwbp6zymeay9llnraglgjqgdrffsau4://x-callback-url/synthetic-request";
const STATE = "opaque-account-bound-state-with-sufficient-entropy";
const AUDIENCE = "cbc-participant-app";
const CONFIG: HostedAuthClientConfig = {
  baseUrl: "https://auth.checksandbalances.services",
  contractVersion: "cbc-verusid-auth.v1",
  serviceVersion: "1.1.1",
  serviceSourceRevision: "1".repeat(40),
  imageDigest: `sha256:${"2".repeat(64)}`,
  sdkCommit: "3".repeat(40),
  primitivesCommit: "4".repeat(40),
  rpcClientCommit: "5".repeat(40),
  bitgoCommit: "6".repeat(40),
  daemonVersion: "v1.2.17-3",
  applicationIdentityAddress: IDENTITY,
  callbackUrl: "https://auth.checksandbalances.services/verusidlogin",
  issuer: "checks-and-balances-verusid-auth",
  clientSecret: "synthetic-client-secret-with-at-least-thirty-two-bytes",
  jwtSecret: "synthetic-jwt-secret-with-at-least-thirty-two-bytes",
};

describe("hosted VerusID auth client", () => {
  it("fails closed against the legacy health response now deployed", async () => {
    let postCalled = false;
    const client = new HostedVerusIdAuthHttpClient(CONFIG, (async (_url, init) => {
      if (init?.method === "POST") postCalled = true;
      return json({
        status: "ok",
        service: "verusid-auth",
        version: "1.1.1",
        chain: "vrsctest",
        signing_identity_configured: true,
        chain_configured: true,
      });
    }) as typeof fetch);

    await expect(client.createChallenge(challengeInput())).rejects.toMatchObject({
      code: "INCOMPATIBLE",
    });
    expect(postCalled).toBe(false);
  });

  it("accepts only an exact, digest-bound LoginConsent presentation", async () => {
    const seenAuthorization: string[] = [];
    const client = new HostedVerusIdAuthHttpClient(CONFIG, hardenedFetch(seenAuthorization));
    const challenge = await client.createChallenge(challengeInput());

    expect(challenge.challengeId).toBe(CHALLENGE);
    expect(challenge.deepLink).toBe(DEEP_LINK);
    expect(challenge.presentationDigest).toBe(digest(DEEP_LINK));
    expect(seenAuthorization).toEqual([
      `Bearer ${CONFIG.clientSecret}`,
      `Bearer ${CONFIG.clientSecret}`,
    ]);
  });

  it("verifies HS256, issuer, audience, challenge, state, times, and identity", async () => {
    const client = new HostedVerusIdAuthHttpClient(CONFIG, hardenedFetch([]));
    const result = await client.getResult(resultInput());

    expect(result).toMatchObject({ kind: "verified", identityAddress: IDENTITY });
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("role");
  });

  it("rejects algorithm confusion and cross-audience results", async () => {
    const noneToken = encodeJwt({
      alg: "none",
      claims: validClaims(),
      secret: CONFIG.jwtSecret,
    });
    const noneClient = new HostedVerusIdAuthHttpClient(CONFIG, resultOnlyFetch(noneToken));
    await expect(noneClient.getResult(resultInput())).rejects.toBeInstanceOf(HostedAuthError);

    const wrongAudienceToken = encodeJwt({
      alg: "HS256",
      claims: { ...validClaims(), aud: "cbc-committee-console" },
      secret: CONFIG.jwtSecret,
    });
    const wrongAudienceClient = new HostedVerusIdAuthHttpClient(
      CONFIG,
      resultOnlyFetch(wrongAudienceToken),
    );
    await expect(wrongAudienceClient.getResult(resultInput())).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("treats an unavailable one-time result as pending without exposing identity data", async () => {
    const client = new HostedVerusIdAuthHttpClient(
      CONFIG,
      (async () => new Response("", { status: 404 })) as typeof fetch,
    );
    await expect(client.getResult(resultInput())).resolves.toEqual({ kind: "pending" });
  });

  it("acknowledges only the exact accepted token digest", async () => {
    let seenBody = "";
    const client = new HostedVerusIdAuthHttpClient(CONFIG, (async (_request, init) => {
      seenBody = String(init?.body);
      return new Response(null, { status: 204 });
    }) as typeof fetch);
    await client.acknowledgeResult({ challengeId: CHALLENGE, proofDigest: "a".repeat(64) });
    expect(JSON.parse(seenBody)).toEqual({ proofDigest: "a".repeat(64) });
  });
});

function challengeInput() {
  return {
    state: STATE,
    audience: AUDIENCE,
    purpose: "link_verusid" as const,
    issuedAt: NOW,
    expiresAt: EXPIRES,
  };
}

function resultInput() {
  return {
    challengeId: CHALLENGE,
    state: STATE,
    audience: AUDIENCE,
    issuedAt: NOW,
    expiresAt: EXPIRES,
    now: new Date(NOW.getTime() + 30_000),
  };
}

function hardenedFetch(seenAuthorization: string[]): typeof fetch {
  return (async (request, init) => {
    seenAuthorization.push(new Headers(init?.headers).get("authorization") ?? "");
    const url = new URL(typeof request === "string" ? request : request.toString());
    if (url.pathname === "/health") return json(validHealth());
    if (url.pathname === "/api/auth/verusid/challenge") {
      return json({
        success: true,
        data: {
          challengeID: CHALLENGE,
          deepLink: DEEP_LINK,
          requestDigest: digest(DEEP_LINK),
          signingIdentity: IDENTITY,
          callbackUrl: CONFIG.callbackUrl,
          network: "VRSCTEST",
          contractVersion: CONFIG.contractVersion,
          issuedAt: NOW.toISOString(),
          expiresAt: EXPIRES.toISOString(),
        },
      });
    }
    return resultResponse(validToken());
  }) as typeof fetch;
}

function resultOnlyFetch(token: string): typeof fetch {
  return (async () => resultResponse(token)) as typeof fetch;
}

function resultResponse(token: string): Response {
  return json({
    success: true,
    JWT: token,
    iaddress: IDENTITY,
    name: "SyntheticIdentity@",
    role: "admin",
  });
}

function validHealth(): Record<string, unknown> {
  return {
    status: "ok",
    service: "verusid-auth",
    version: CONFIG.serviceVersion,
    service_source_revision: CONFIG.serviceSourceRevision,
    image_digest: CONFIG.imageDigest,
    verusid_ts_client_commit: CONFIG.sdkCommit,
    verus_primitives_commit: CONFIG.primitivesCommit,
    verusd_rpc_client_commit: CONFIG.rpcClientCommit,
    verus_bitgo_commit: CONFIG.bitgoCommit,
    daemon_version: CONFIG.daemonVersion,
    chain: "vrsctest",
    contract_version: CONFIG.contractVersion,
    signing_identity: IDENTITY,
    callback_url: CONFIG.callbackUrl,
    jwt_issuer: CONFIG.issuer,
    signing_identity_configured: true,
    chain_configured: true,
    sdk_ready: true,
    result_authentication: "client_secret",
    result_delivery: "idempotent_until_ack",
  };
}

function validToken(): string {
  return encodeJwt({ alg: "HS256", claims: validClaims(), secret: CONFIG.jwtSecret });
}

function validClaims(): Record<string, unknown> {
  return {
    iss: CONFIG.issuer,
    aud: AUDIENCE,
    challengeID: CHALLENGE,
    state: STATE,
    idLoggedIn: IDENTITY,
    jti: "synthetic-token-identifier-0001",
    iat: Math.floor((NOW.getTime() + 1_000) / 1_000),
    exp: Math.floor((NOW.getTime() + 120_000) / 1_000),
    role: "admin",
  };
}

function encodeJwt(input: {
  readonly alg: string;
  readonly claims: Record<string, unknown>;
  readonly secret: string;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: input.alg, typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify(input.claims)).toString("base64url");
  const signature = createHmac("sha256", input.secret)
    .update(`${header}.${claims}`, "utf8")
    .digest("base64url");
  return `${header}.${claims}.${signature}`;
}

function json(value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
