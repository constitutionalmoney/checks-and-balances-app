const { randomUUID } = require("node:crypto");

const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const {
  CONTRACT_VERSION,
  IADDRESS_PATTERN,
  NETWORK,
  PURPOSES,
  REQUESTED_ACCESS,
  SERVICE_NAME,
  SHA256_PATTERN,
  constantTimeEqual,
  sha256,
} = require("./contract");
const logger = require("./logger");

const BODY_LIMIT = "64kb";
const MAX_DEEP_LINK_BYTES = 16 * 1024;
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function createApp({ config, store, verus, now = () => Date.now() }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(express.json({ limit: BODY_LIMIT, strict: true }));

  const challengeLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: "Request limit exceeded" },
  });
  const callbackLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: "Request limit exceeded" },
  });

  app.get("/health", async (_request, response) => {
    const storeReady = await store.ping().catch(() => false);
    const sdkReady = await verus.preflight().catch(() => false);
    const ready = storeReady && sdkReady;
    const status = ready ? "ok" : "degraded";
    response.status(ready ? 200 : 503).json({
      status,
      service: SERVICE_NAME,
      version: config.serviceVersion,
      chain: config.chain,
      network: NETWORK,
      contract_version: config.contractVersion,
      signing_identity: config.signingIdentity,
      signing_identity_configured: true,
      chain_configured: true,
      sdk_ready: sdkReady,
      store_ready: storeReady,
      result_authentication: "client_secret",
      result_delivery: "idempotent_until_ack",
      callback_url: config.callbackUrl,
      jwt_issuer: config.jwtIssuer,
      service_source_revision: config.serviceSourceRevision,
      image_digest: config.imageDigest,
      verusid_ts_client_commit: config.sdkCommit,
      verus_primitives_commit: config.primitivesCommit,
      verusd_rpc_client_commit: config.rpcClientCommit,
      verus_bitgo_commit: config.bitgoCommit,
      daemon_version: config.daemonVersion,
      timestamp: new Date(now()).toISOString(),
    });
  });

  app.post(
    "/api/auth/verusid/challenge",
    requireServiceAuth(config),
    challengeLimiter,
    asyncRoute(async (request, response) => {
      const input = validateChallengeInput(request.body, config, now());
      const presentation = await verus.createChallenge(input);
      if (
        !IADDRESS_PATTERN.test(presentation.challengeID) ||
        typeof presentation.deepLink !== "string" ||
        Buffer.byteLength(presentation.deepLink, "utf8") > MAX_DEEP_LINK_BYTES ||
        !SHA256_PATTERN.test(presentation.requestObjectDigest)
      ) {
        throw new PublicError(503, "The signing dependency returned an invalid request");
      }
      const challenge = Object.freeze({
        challengeID: presentation.challengeID,
        state: input.state,
        audience: input.audience,
        purpose: input.purpose,
        issuedAt: input.issuedAt.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
        signingIdentity: config.signingIdentity,
        callbackUrl: config.callbackUrl,
        network: NETWORK,
        requestDigest: sha256(Buffer.from(presentation.deepLink, "utf8")),
        requestObjectDigest: presentation.requestObjectDigest,
      });
      if (!(await store.createChallenge(challenge))) {
        throw new PublicError(503, "Could not allocate a one-time request");
      }
      response.status(201).json({
        success: true,
        data: {
          deepLink: presentation.deepLink,
          challengeID: challenge.challengeID,
          requestDigest: challenge.requestDigest,
          signingIdentity: challenge.signingIdentity,
          callbackUrl: challenge.callbackUrl,
          network: challenge.network,
          contractVersion: config.contractVersion,
          issuedAt: challenge.issuedAt,
          expiresAt: challenge.expiresAt,
        },
      });
    }),
  );

  app.post(
    "/verusidlogin",
    callbackLimiter,
    asyncRoute(async (request, response) => {
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
        throw new PublicError(400, "Invalid wallet response");
      }
      const verified = await verus.verifyCallback(request.body).catch(() => {
        throw new PublicError(400, "Invalid wallet response");
      });
      if (!IADDRESS_PATTERN.test(verified.challengeID || "")) {
        throw new PublicError(400, "Invalid wallet response");
      }
      const challenge = await store.getChallenge(verified.challengeID);
      if (!challenge || Date.parse(challenge.expiresAt) <= now()) {
        throw new PublicError(400, "Invalid or expired wallet response");
      }
      const decisionTime = Number(verified.decisionCreatedAt) * 1000;
      if (
        verified.decisionID !== challenge.challengeID ||
        verified.requestObjectDigest !== challenge.requestObjectDigest ||
        verified.requestSigningIdentity !== config.signingIdentity ||
        verified.requestSystemID !== config.chainId ||
        verified.responseSystemID !== config.chainId ||
        !IADDRESS_PATTERN.test(verified.identityAddress || "") ||
        !Number.isSafeInteger(decisionTime) ||
        decisionTime < Date.parse(challenge.issuedAt) - 60_000 ||
        decisionTime > Date.parse(challenge.expiresAt) + 60_000
      ) {
        throw new PublicError(400, "Wallet response did not match the signed request");
      }

      const identity = await verus
        .checkIdentity(verified.identityAddress, verified.identity)
        .catch(() => {
          throw new PublicError(400, "Selected identity is not active on VRSCTEST");
        });
      const existing = await store.getResult(challenge.challengeID);
      if (existing) {
        if (existing.identityAddress !== identity.identityAddress) {
          throw new PublicError(409, "A different result already exists");
        }
        response.json({ success: true });
        return;
      }

      const nowSeconds = Math.floor(now() / 1000);
      const challengeExpirySeconds = Math.floor(Date.parse(challenge.expiresAt) / 1000);
      const expiresIn = Math.min(
        config.resultTokenMaxLifetimeSeconds,
        challengeExpirySeconds - nowSeconds,
      );
      if (expiresIn < 1) throw new PublicError(400, "Invalid or expired wallet response");
      const token = jwt.sign(
        {
          challengeID: challenge.challengeID,
          state: challenge.state,
          idLoggedIn: identity.identityAddress,
        },
        config.jwtSecret,
        {
          algorithm: "HS256",
          audience: challenge.audience,
          expiresIn,
          issuer: config.jwtIssuer,
          jwtid: randomUUID(),
          header: { typ: "JWT" },
        },
      );
      const proofDigest = sha256(Buffer.from(token, "utf8"));
      const result = Object.freeze({
        token,
        identityAddress: identity.identityAddress,
        ...(safeDisplayName(identity.displayName)
          ? { displayName: safeDisplayName(identity.displayName) }
          : {}),
        proofDigest,
        expiresAt: new Date((nowSeconds + expiresIn) * 1000).toISOString(),
      });
      const stored = await store.putResult(challenge.challengeID, result);
      if (stored === "conflict") throw new PublicError(409, "A different result already exists");
      if (stored === "consumed") throw new PublicError(409, "Request was already consumed");
      response.json({ success: true });
    }),
  );

  app.get(
    "/api/auth/verusid/result/:challengeID",
    requireServiceAuth(config),
    asyncRoute(async (request, response) => {
      const { challengeID } = request.params;
      if (!IADDRESS_PATTERN.test(challengeID)) throw new PublicError(404, "Result not found");
      const result = await store.getResult(challengeID);
      if (!result) {
        response.status(202).json({ success: false, status: "pending" });
        return;
      }
      response.json({
        success: true,
        JWT: result.token,
        iaddress: result.identityAddress,
        ...(result.displayName ? { name: result.displayName } : {}),
      });
    }),
  );

  app.post(
    "/api/auth/verusid/result/:challengeID/ack",
    requireServiceAuth(config),
    asyncRoute(async (request, response) => {
      const { challengeID } = request.params;
      const proofDigest = request.body && request.body.proofDigest;
      if (!IADDRESS_PATTERN.test(challengeID) || !SHA256_PATTERN.test(proofDigest || "")) {
        throw new PublicError(400, "Invalid acknowledgement");
      }
      const acknowledged = await store.acknowledge(challengeID, proofDigest, now() + 10 * 60_000);
      if (!acknowledged) throw new PublicError(409, "Result could not be acknowledged");
      response.status(204).end();
    }),
  );

  app.use((error, request, response, next) => {
    void request;
    void next;
    const publicError = error instanceof PublicError;
    const status = publicError ? error.status : error.type === "entity.too.large" ? 413 : 503;
    logger.warn("request_rejected", { status });
    response.status(status).json({
      success: false,
      error: publicError ? error.message : "Service unavailable",
    });
  });

  return app;
}

function requireServiceAuth(config) {
  return (request, response, next) => {
    const authorization = request.get("authorization") || "";
    const version = request.get("x-cbc-auth-contract-version") || "";
    const expected = `Bearer ${config.clientSecret}`;
    if (version !== CONTRACT_VERSION || !constantTimeEqual(authorization, expected)) {
      response.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    next();
  };
}

function validateChallengeInput(body, config, currentTime) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PublicError(400, "Invalid request");
  }
  const keys = Object.keys(body).sort();
  const expectedKeys = [
    "audience",
    "expiresAt",
    "issuedAt",
    "purpose",
    "requestedAccess",
    "state",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new PublicError(400, "Invalid request fields");
  }
  const issuedAt = parseIso(body.issuedAt);
  const expiresAt = parseIso(body.expiresAt);
  if (
    !STATE_PATTERN.test(body.state || "") ||
    !config.allowedAudiences.has(body.audience) ||
    !PURPOSES.has(body.purpose) ||
    !Array.isArray(body.requestedAccess) ||
    body.requestedAccess.length !== REQUESTED_ACCESS.length ||
    body.requestedAccess[0] !== REQUESTED_ACCESS[0] ||
    issuedAt.getTime() < currentTime - 60_000 ||
    issuedAt.getTime() > currentTime + 60_000 ||
    expiresAt <= issuedAt ||
    expiresAt.getTime() - issuedAt.getTime() > config.challengeLifetimeMs
  ) {
    throw new PublicError(400, "Invalid request binding");
  }
  return Object.freeze({
    state: body.state,
    audience: body.audience,
    purpose: body.purpose,
    issuedAt,
    expiresAt,
  });
}

function parseIso(value) {
  const parsed = new Date(value);
  if (
    typeof value !== "string" ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    throw new PublicError(400, "Invalid timestamp");
  }
  return parsed;
}

function safeDisplayName(value) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value) > 200)
    return undefined;
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 0x1f || code === 0x7f;
  })
    ? undefined
    : value;
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

class PublicError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { createApp };
