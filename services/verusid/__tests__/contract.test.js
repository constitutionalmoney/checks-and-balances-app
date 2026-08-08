const jwt = require("jsonwebtoken");
const request = require("supertest");

const { createApp } = require("../src/app");
const {
  APPROVED_CALLBACK_URL,
  APPROVED_SERVER_URL,
  APPROVED_SIGNING_IDENTITY,
  CONTRACT_VERSION,
  JWT_ISSUER,
  LOGIN_CONSENT_SCHEME,
  VRSCTEST_CHAIN_ID,
  sha256,
} = require("../src/contract");
const { loadConfig } = require("../src/config");
const { MemoryStore } = require("../src/store");

const CLIENT_SECRET = "client-secret-for-tests-that-is-long-enough";
const JWT_SECRET = "jwt-secret-for-tests-that-is-distinct-and-long";
const CHALLENGE_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";
const IDENTITY_ID = "iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm";
const DEEP_LINK = `${LOGIN_CONSENT_SCHEME}synthetic-contract-fixture`;
const REQUEST_OBJECT_DIGEST = "a".repeat(64);
const STATE = "state_binding_value_that_is_at_least_32_chars_123";

function config() {
  return Object.freeze({
    trustProxy: 1,
    chain: "vrsctest",
    chainId: VRSCTEST_CHAIN_ID,
    signingIdentity: APPROVED_SIGNING_IDENTITY,
    callbackUrl: APPROVED_CALLBACK_URL,
    contractVersion: CONTRACT_VERSION,
    jwtIssuer: JWT_ISSUER,
    jwtSecret: JWT_SECRET,
    clientSecret: CLIENT_SECRET,
    allowedAudiences: new Set(["cbc-participant-app", "cbc-committee-console"]),
    serviceVersion: "1.1.0",
    serviceSourceRevision: "1".repeat(40),
    imageDigest: `sha256:${"2".repeat(64)}`,
    sdkCommit: "3".repeat(40),
    primitivesCommit: "4".repeat(40),
    rpcClientCommit: "5".repeat(40),
    bitgoCommit: "6".repeat(40),
    daemonVersion: "v1.2.17-3",
    challengeLifetimeMs: 5 * 60_000,
    resultTokenMaxLifetimeSeconds: 120,
  });
}

function fakeVerus(now, overrides = {}) {
  return {
    preflight: jest.fn().mockResolvedValue(true),
    createChallenge: jest.fn().mockResolvedValue({
      challengeID: CHALLENGE_ID,
      deepLink: DEEP_LINK,
      requestObjectDigest: REQUEST_OBJECT_DIGEST,
    }),
    verifyCallback: jest.fn().mockImplementation(async () => ({
      challengeID: CHALLENGE_ID,
      decisionID: CHALLENGE_ID,
      identityAddress: IDENTITY_ID,
      responseSystemID: VRSCTEST_CHAIN_ID,
      requestSystemID: VRSCTEST_CHAIN_ID,
      requestSigningIdentity: APPROVED_SIGNING_IDENTITY,
      requestObjectDigest: REQUEST_OBJECT_DIGEST,
      decisionCreatedAt: Math.floor(now() / 1000),
      identity: { identity: { identityaddress: IDENTITY_ID } },
      ...overrides,
    })),
    checkIdentity: jest.fn().mockResolvedValue({
      identityAddress: IDENTITY_ID,
      displayName: "synthetic.VRSCTEST@",
    }),
  };
}

function auth(agent, method, path) {
  return agent[method](path)
    .set("authorization", `Bearer ${CLIENT_SECRET}`)
    .set("x-cbc-auth-contract-version", CONTRACT_VERSION);
}

function challengeBody(now) {
  return {
    state: STATE,
    audience: "cbc-participant-app",
    purpose: "link_verusid",
    issuedAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + 5 * 60_000).toISOString(),
    requestedAccess: ["identity_view"],
  };
}

describe("CBC hosted VerusID auth contract", () => {
  let currentTime;
  let clock;
  let store;
  let verus;
  let app;

  beforeEach(() => {
    currentTime = Date.now();
    clock = () => currentTime;
    store = new MemoryStore(clock);
    verus = fakeVerus(clock);
    app = createApp({ config: config(), store, verus, now: clock });
  });

  test("publishes fail-closed immutable release metadata", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "verusid-auth",
      version: "1.1.0",
      chain: "vrsctest",
      network: "VRSCTEST",
      contract_version: CONTRACT_VERSION,
      signing_identity: APPROVED_SIGNING_IDENTITY,
      callback_url: APPROVED_CALLBACK_URL,
      jwt_issuer: JWT_ISSUER,
      result_authentication: "client_secret",
      result_delivery: "idempotent_until_ack",
      sdk_ready: true,
      store_ready: true,
    });
  });

  test("fails health when chain preflight is unavailable", async () => {
    verus.preflight.mockRejectedValue(new Error("offline"));
    const response = await request(app).get("/health");
    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.sdk_ready).toBe(false);
  });

  test("requires the out-of-band client secret and contract header", async () => {
    const missing = await request(app)
      .post("/api/auth/verusid/challenge")
      .send(challengeBody(clock));
    expect(missing.status).toBe(401);

    const leakedInQuery = await request(app).get(
      `/api/auth/verusid/result/${CHALLENGE_ID}?token=${CLIENT_SECRET}`,
    );
    expect(leakedInQuery.status).toBe(401);
  });

  test("returns exact signed presentation metadata and stores only its bindings", async () => {
    const response = await auth(request(app), "post", "/api/auth/verusid/challenge").send(
      challengeBody(clock),
    );
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      deepLink: DEEP_LINK,
      challengeID: CHALLENGE_ID,
      requestDigest: sha256(Buffer.from(DEEP_LINK)),
      signingIdentity: APPROVED_SIGNING_IDENTITY,
      callbackUrl: APPROVED_CALLBACK_URL,
      network: "VRSCTEST",
      contractVersion: CONTRACT_VERSION,
      issuedAt: new Date(currentTime).toISOString(),
      expiresAt: new Date(currentTime + 5 * 60_000).toISOString(),
    });
    expect(await store.getChallenge(CHALLENGE_ID)).not.toHaveProperty("deepLink");
  });

  test("keeps an authenticated result idempotent until proof acknowledgement", async () => {
    await auth(request(app), "post", "/api/auth/verusid/challenge").send(challengeBody(clock));
    expect((await request(app).post("/verusidlogin").send({ signed: true })).status).toBe(200);

    const first = await auth(request(app), "get", `/api/auth/verusid/result/${CHALLENGE_ID}`);
    const second = await auth(request(app), "get", `/api/auth/verusid/result/${CHALLENGE_ID}`);
    expect(first.status).toBe(200);
    expect(second.body.JWT).toBe(first.body.JWT);
    expect(first.body).not.toHaveProperty("role");

    const claims = jwt.verify(first.body.JWT, JWT_SECRET, {
      algorithms: ["HS256"],
      audience: "cbc-participant-app",
      issuer: JWT_ISSUER,
    });
    expect(claims).toMatchObject({
      challengeID: CHALLENGE_ID,
      state: STATE,
      idLoggedIn: IDENTITY_ID,
    });
    expect(claims).not.toHaveProperty("role");
    expect(typeof claims.jti).toBe("string");
    expect(typeof claims.iat).toBe("number");
    expect(typeof claims.exp).toBe("number");

    const wrongAck = await auth(
      request(app),
      "post",
      `/api/auth/verusid/result/${CHALLENGE_ID}/ack`,
    ).send({ proofDigest: "0".repeat(64) });
    expect(wrongAck.status).toBe(409);

    const ack = await auth(
      request(app),
      "post",
      `/api/auth/verusid/result/${CHALLENGE_ID}/ack`,
    ).send({ proofDigest: sha256(Buffer.from(first.body.JWT)) });
    expect(ack.status).toBe(204);
    const consumed = await auth(request(app), "get", `/api/auth/verusid/result/${CHALLENGE_ID}`);
    expect(consumed.status).toBe(202);
  });

  test.each([
    ["request digest substitution", { requestObjectDigest: "b".repeat(64) }],
    ["wrong response chain", { responseSystemID: "iWrongChain111111111111111111111" }],
    ["wrong request signer", { requestSigningIdentity: CHALLENGE_ID }],
  ])("rejects %s", async (_name, override) => {
    verus.verifyCallback.mockResolvedValue({
      ...(await fakeVerus(clock).verifyCallback()),
      ...override,
    });
    await auth(request(app), "post", "/api/auth/verusid/challenge").send(challengeBody(clock));
    const callback = await request(app).post("/verusidlogin").send({ signed: true });
    expect(callback.status).toBe(400);
    const result = await auth(request(app), "get", `/api/auth/verusid/result/${CHALLENGE_ID}`);
    expect(result.status).toBe(202);
  });

  test("rejects an expired callback", async () => {
    await auth(request(app), "post", "/api/auth/verusid/challenge").send(challengeBody(clock));
    currentTime += 5 * 60_000 + 1;
    const callback = await request(app).post("/verusidlogin").send({ signed: true });
    expect(callback.status).toBe(400);
  });
});

describe("production configuration", () => {
  function productionEnvironment(overrides = {}) {
    return {
      CBC_CLIENT_SECRET: CLIENT_SECRET,
      JWT_SECRET,
      PRIVATE_KEY: "private-key-material-used-only-by-this-test",
      CBC_ALLOWED_AUDIENCES: "cbc-participant-app,cbc-committee-console",
      CHAIN: "vrsctest",
      CHAIN_IADDRESS: VRSCTEST_CHAIN_ID,
      SIGNING_IADDRESS: APPROVED_SIGNING_IDENTITY,
      SERVER_URL: APPROVED_SERVER_URL,
      CALLBACK_URL: APPROVED_CALLBACK_URL,
      CONTRACT_VERSION,
      JWT_ISSUER,
      REDIS_URL: "redis://redis:6379/0",
      VERUS_RPC_URL: "http://verusd:19998",
      SERVICE_SOURCE_REVISION: "1".repeat(40),
      IMAGE_DIGEST: `sha256:${"2".repeat(64)}`,
      VERUSID_TS_CLIENT_COMMIT: "3".repeat(40),
      VERUS_PRIMITIVES_COMMIT: "4".repeat(40),
      VERUSD_RPC_CLIENT_COMMIT: "5".repeat(40),
      VERUS_BITGO_COMMIT: "6".repeat(40),
      VERUSD_VERSION: "v1.2.17-3",
      ...overrides,
    };
  }

  test("pins the CBC hostname, signer, network, and release inputs", () => {
    const value = loadConfig(productionEnvironment());
    expect(value.serverUrl).toBe(APPROVED_SERVER_URL);
    expect(value.signingIdentity).toBe(APPROVED_SIGNING_IDENTITY);
  });

  test("blocks mainnet and legacy host configuration", () => {
    expect(() => loadConfig(productionEnvironment({ CHAIN: "VRSC" }))).toThrow(
      "CHAIN must be vrsctest",
    );
    expect(() =>
      loadConfig(productionEnvironment({ SERVER_URL: "https://auth.constitution.money" })),
    ).toThrow(`SERVER_URL must be ${APPROVED_SERVER_URL}`);
  });
});
