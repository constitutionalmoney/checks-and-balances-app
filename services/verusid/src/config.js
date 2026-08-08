const packageJson = require("../package.json");
const {
  APPROVED_CALLBACK_URL,
  APPROVED_SERVER_URL,
  APPROVED_SIGNING_IDENTITY,
  CHAIN,
  CONTRACT_VERSION,
  JWT_ISSUER,
  VRSCTEST_CHAIN_ID,
} = require("./contract");

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/;

function required(environment, key) {
  const value = environment[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required configuration: ${key}`);
  }
  return value.trim();
}

function exact(environment, key, expected) {
  const value = required(environment, key);
  if (value !== expected) throw new Error(`${key} must be ${expected}`);
  return value;
}

function secret(environment, key) {
  const value = required(environment, key);
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${key} must contain at least 32 bytes`);
  }
  return value;
}

function commit(environment, key) {
  const value = required(environment, key).toLowerCase();
  if (!COMMIT_PATTERN.test(value)) throw new Error(`${key} must be a full Git commit`);
  return value;
}

function validatedUrl(environment, key, protocols) {
  const value = required(environment, key);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol) || parsed.hash) {
    throw new Error(`${key} uses an unsupported URL`);
  }
  return value;
}

function loadConfig(environment = process.env) {
  const clientSecret = secret(environment, "CBC_CLIENT_SECRET");
  const jwtSecret = secret(environment, "JWT_SECRET");
  const privateKey = required(environment, "PRIVATE_KEY");
  if (clientSecret === jwtSecret || clientSecret === privateKey || jwtSecret === privateKey) {
    throw new Error("CBC_CLIENT_SECRET, JWT_SECRET, and PRIVATE_KEY must be distinct");
  }

  const imageDigest = required(environment, "IMAGE_DIGEST").toLowerCase();
  if (!IMAGE_PATTERN.test(imageDigest)) {
    throw new Error("IMAGE_DIGEST must be an immutable sha256 image digest");
  }

  const allowedAudiences = new Set(
    required(environment, "CBC_ALLOWED_AUDIENCES")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (
    allowedAudiences.size !== 2 ||
    !allowedAudiences.has("cbc-participant-app") ||
    !allowedAudiences.has("cbc-committee-console")
  ) {
    throw new Error("CBC_ALLOWED_AUDIENCES must contain only the two approved CBC audiences");
  }

  const port = Number(environment.PORT || "3001");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  const trustProxy = Number(environment.TRUST_PROXY_HOPS || "1");
  if (!Number.isSafeInteger(trustProxy) || trustProxy < 0 || trustProxy > 3) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 3");
  }

  return Object.freeze({
    port,
    host: environment.HOST || "0.0.0.0",
    trustProxy,
    chain: exact(environment, "CHAIN", CHAIN),
    chainId: exact(environment, "CHAIN_IADDRESS", VRSCTEST_CHAIN_ID),
    signingIdentity: exact(environment, "SIGNING_IADDRESS", APPROVED_SIGNING_IDENTITY),
    privateKey,
    serverUrl: exact(environment, "SERVER_URL", APPROVED_SERVER_URL),
    callbackUrl: exact(environment, "CALLBACK_URL", APPROVED_CALLBACK_URL),
    contractVersion: exact(environment, "CONTRACT_VERSION", CONTRACT_VERSION),
    jwtIssuer: exact(environment, "JWT_ISSUER", JWT_ISSUER),
    jwtSecret,
    clientSecret,
    allowedAudiences,
    redisUrl: validatedUrl(environment, "REDIS_URL", ["redis:", "rediss:"]),
    rpcUrl: validatedUrl(environment, "VERUS_RPC_URL", ["http:", "https:"]),
    rpcUser: environment.VERUS_RPC_USER || "",
    rpcPassword: environment.VERUS_RPC_PASSWORD || "",
    serviceVersion: packageJson.version,
    serviceSourceRevision: commit(environment, "SERVICE_SOURCE_REVISION"),
    imageDigest,
    sdkCommit: commit(environment, "VERUSID_TS_CLIENT_COMMIT"),
    primitivesCommit: commit(environment, "VERUS_PRIMITIVES_COMMIT"),
    rpcClientCommit: commit(environment, "VERUSD_RPC_CLIENT_COMMIT"),
    bitgoCommit: commit(environment, "VERUS_BITGO_COMMIT"),
    daemonVersion: required(environment, "VERUSD_VERSION"),
    challengeLifetimeMs: 5 * 60_000,
    resultTokenMaxLifetimeSeconds: 120,
  });
}

module.exports = { loadConfig };
