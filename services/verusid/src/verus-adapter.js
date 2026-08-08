const { randomBytes } = require("node:crypto");

const { IADDRESS_PATTERN, LOGIN_CONSENT_SCHEME, REQUESTED_ACCESS, sha256 } = require("./contract");
const { getIdentityFromChain, validateIdentityActive } = require("./verus-verify");

const I_ADDRESS_VERSION = 102;

class ProductionVerusAdapter {
  constructor(config, sdk = require("verusid-ts-client")) {
    this.config = config;
    this.primitives = sdk.primitives;
    const sdkRpcUrl = new URL(config.rpcUrl);
    if (config.rpcUser) {
      sdkRpcUrl.username = config.rpcUser;
      sdkRpcUrl.password = config.rpcPassword;
    }
    this.client = new sdk.VerusIdInterface("VRSCTEST", sdkRpcUrl.toString());
    if (!this.primitives || !this.primitives.LoginConsentChallenge) {
      throw new Error("Pinned verusid-ts-client did not expose the required primitives");
    }
  }

  async preflight() {
    await this.checkIdentity(this.config.signingIdentity);
    return true;
  }

  async createChallenge(input) {
    const challengeID = this.primitives.toBase58Check(
      Buffer.from(randomBytes(20)),
      I_ADDRESS_VERSION,
    );
    const request = await this.client.createLoginConsentRequest(
      this.config.signingIdentity,
      new this.primitives.LoginConsentChallenge({
        challenge_id: challengeID,
        requested_access: [
          new this.primitives.RequestedPermission(this.primitives.IDENTITY_VIEW.vdxfid),
        ],
        redirect_uris: [
          new this.primitives.RedirectUri(
            this.config.callbackUrl,
            this.primitives.LOGIN_CONSENT_WEBHOOK_VDXF_KEY.vdxfid,
          ),
        ],
        subject: [],
        provisioning_info: [],
        created_at: Math.floor(input.issuedAt.getTime() / 1000),
      }),
      this.config.privateKey,
      null,
      null,
      this.config.chainId,
    );
    const deepLink = request.toWalletDeeplinkUri();
    if (!deepLink.startsWith(LOGIN_CONSENT_SCHEME)) {
      throw new Error("SDK returned an unexpected wallet deep-link scheme");
    }
    const reparsed = this.primitives.LoginConsentRequest.fromWalletDeeplinkUri(deepLink);
    const verified = await this.client.verifyLoginConsentRequest(
      reparsed,
      null,
      this.config.chainId,
    );
    if (!verified) throw new Error("SDK could not verify its signed request");
    return {
      challengeID,
      deepLink,
      requestObjectDigest: sha256(Buffer.from(request.toBuffer())),
    };
  }

  async verifyCallback(payload) {
    const response = new this.primitives.LoginConsentResponse(
      normalizeLoginConsentPayload(payload, this.primitives),
    );
    const decision = response.decision;
    const request = decision && decision.request;
    const challenge = request && request.challenge;
    if (!decision || !request || !challenge || typeof request.toBuffer !== "function") {
      throw new Error("Wallet response omitted the signed request binding");
    }
    const identity = await getIdentityFromChain(response.signing_id, this.config);
    const verified = await this.client.verifyLoginConsentResponse(
      response,
      identity,
      this.config.chainId,
    );
    if (!verified) throw new Error("Wallet response signature was invalid");
    return {
      challengeID: challenge.challenge_id,
      decisionID: decision.decision_id,
      identityAddress: response.signing_id,
      responseSystemID: response.system_id,
      requestSystemID: request.system_id,
      requestSigningIdentity: request.signing_id,
      requestObjectDigest: sha256(Buffer.from(request.toBuffer())),
      decisionCreatedAt: decision.created_at,
      requestedAccess: REQUESTED_ACCESS,
      identity,
    };
  }

  async checkIdentity(identityAddress, prefetched) {
    if (!IADDRESS_PATTERN.test(identityAddress)) throw new Error("Invalid identity address");
    const result = prefetched || (await getIdentityFromChain(identityAddress, this.config));
    return validateIdentityActive(result, identityAddress, this.config.chainId);
  }
}

function normalizeLoginConsentPayload(payload, primitives) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const normalized = { ...payload };
  if (!normalized.decision || typeof normalized.decision !== "object") return normalized;
  const decision = { ...normalized.decision };
  if (decision.context && !(decision.context instanceof primitives.Context)) {
    decision.context = new primitives.Context(decision.context.kv || decision.context);
  }
  if (decision.request && typeof decision.request === "object") {
    const request = { ...decision.request };
    if (request.challenge && typeof request.challenge === "object") {
      const challenge = { ...request.challenge };
      if (challenge.context && !(challenge.context instanceof primitives.Context)) {
        challenge.context = new primitives.Context(challenge.context.kv || challenge.context);
      }
      request.challenge = challenge;
    }
    decision.request = request;
  }
  normalized.decision = decision;
  return normalized;
}

module.exports = { ProductionVerusAdapter, normalizeLoginConsentPayload };
