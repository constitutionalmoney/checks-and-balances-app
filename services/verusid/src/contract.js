const { createHash, timingSafeEqual } = require("node:crypto");

const CONTRACT_VERSION = "cbc-verusid-auth.v1";
const SERVICE_NAME = "verusid-auth";
const NETWORK = "VRSCTEST";
const CHAIN = "vrsctest";
const VRSCTEST_CHAIN_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";
const APPROVED_SIGNING_IDENTITY = "iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP";
const APPROVED_SERVER_URL = "https://auth.checksandbalances.services";
const APPROVED_CALLBACK_URL = `${APPROVED_SERVER_URL}/verusidlogin`;
const JWT_ISSUER = "checks-and-balances-verusid-auth";
const LOGIN_CONSENT_SCHEME = "i5jtwbp6zymeay9llnraglgjqgdrffsau4:";
const IADDRESS_PATTERN = /^i[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PURPOSES = new Set(["link_verusid", "revalidate_verusid"]);
const REQUESTED_ACCESS = Object.freeze(["identity_view"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  APPROVED_CALLBACK_URL,
  APPROVED_SERVER_URL,
  APPROVED_SIGNING_IDENTITY,
  CHAIN,
  CONTRACT_VERSION,
  IADDRESS_PATTERN,
  JWT_ISSUER,
  LOGIN_CONSENT_SCHEME,
  NETWORK,
  PURPOSES,
  REQUESTED_ACCESS,
  SERVICE_NAME,
  SHA256_PATTERN,
  VRSCTEST_CHAIN_ID,
  constantTimeEqual,
  sha256,
};
