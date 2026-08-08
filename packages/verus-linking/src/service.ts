import { createHash, createHmac, randomUUID } from "node:crypto";

import { generateOpaqueToken, keyedDigest } from "@cbc/auth";
import {
  type CompleteWalletLinkChallengeInput,
  type CommandContext,
  type CompletedWalletLink,
  type CreateWalletLinkChallengeInput,
  type ExpiredWalletLinkChallenge,
  type VerusLinkTrustDomain,
  type WalletLinkChallengeRecord,
  type WalletLinkPollResult,
  type WalletLinkPurpose,
} from "@cbc/db";
import {
  VRSCTEST_CHAIN_ID,
  VerusIntegrationError,
  type VerusIdentityResult,
  type VerusRpcAdapter,
} from "@cbc/verus";

import { HostedAuthError, type HostedVerusIdAuthClient } from "./hosted-auth-client.js";

const CHALLENGE_LIFETIME_MS = 5 * 60_000;
const REQUEST_WINDOW_MS = 15 * 60_000;
const REQUEST_LIMIT = 10;
const ALLOWED_SCOPES = new Set(["verusid:link"]);

export type WalletLinkErrorCode =
  | "FEATURE_DISABLED"
  | "MAINNET_BLOCKED"
  | "INVALID_REQUEST"
  | "CHALLENGE_UNAVAILABLE"
  | "CHALLENGE_EXPIRED"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "AUTH_SERVICE_INCOMPATIBLE";

export class WalletLinkError extends Error {
  constructor(readonly code: WalletLinkErrorCode) {
    super(publicMessage(code));
    this.name = "WalletLinkError";
  }
}

export interface WalletLinkServiceConfig {
  readonly enabled: boolean;
  readonly network: "FAKE" | "VRSCTEST";
  readonly applicationIdentityAddress: string;
  readonly authServiceCallbackUrl: string;
  readonly participantAudience: string;
  readonly committeeAudience: string;
  readonly bindingSecret: string;
  readonly pollingTokenSecret: string;
}

export interface WalletLinkPrincipal {
  readonly accountReference: string;
  readonly trustDomain: VerusLinkTrustDomain;
  readonly authenticationStrength: string;
}

export interface BeginWalletLinkInput {
  readonly principal: WalletLinkPrincipal;
  readonly purpose?: WalletLinkPurpose;
  readonly scopes: readonly string[];
  readonly now: Date;
  readonly correlationId: string;
}

export interface WalletLinkPresentation {
  readonly challengeReference: string;
  readonly network: "VRSCTEST";
  readonly requesterIdentity: string;
  readonly purpose: WalletLinkPurpose;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly sameDeviceUrl: string;
  readonly qrPayload: string;
  readonly pollingToken: string;
  readonly operational: false;
  readonly limitations: readonly string[];
}

export interface PollInput {
  readonly principal: WalletLinkPrincipal;
  readonly pollingToken: string;
  readonly now: Date;
  readonly correlationId: string;
}

export interface WalletLinkStore {
  createChallenge(
    input: CreateWalletLinkChallengeInput,
    context: CommandContext,
  ): Promise<WalletLinkChallengeRecord>;
  challengeForPoll(
    accountReference: string,
    pollingTokenDigest: string,
  ): Promise<WalletLinkChallengeRecord>;
  completeChallenge(
    input: CompleteWalletLinkChallengeInput,
    context: CommandContext,
  ): Promise<CompletedWalletLink | ExpiredWalletLinkChallenge>;
  pollChallenge(
    accountReference: string,
    pollingTokenDigest: string,
    now: Date,
    context: CommandContext,
  ): Promise<WalletLinkPollResult>;
  cancelChallenge(
    accountReference: string,
    challengeReference: string,
    cancelledAt: Date,
    context: CommandContext,
  ): Promise<void>;
  unlink(
    accountReference: string,
    linkReference: string,
    unlinkedAt: Date,
    context: CommandContext,
  ): Promise<void>;
}

export interface WalletLinkRateLimiter {
  requireWithinLimit(input: {
    readonly bucket: "wallet_link_account";
    readonly opaqueSubject: string;
    readonly now: Date;
    readonly windowMs: number;
    readonly limit: number;
  }): Promise<void>;
}

export class WalletLinkService {
  constructor(
    private readonly config: WalletLinkServiceConfig,
    private readonly repository: WalletLinkStore,
    private readonly hostedAuth: HostedVerusIdAuthClient,
    private readonly adapter: VerusRpcAdapter,
    private readonly rateLimiter: WalletLinkRateLimiter,
  ) {}

  async begin(input: BeginWalletLinkInput): Promise<WalletLinkPresentation> {
    this.requireEnabled();
    await this.rateLimiter.requireWithinLimit({
      bucket: "wallet_link_account",
      opaqueSubject: input.principal.accountReference,
      now: input.now,
      windowMs: REQUEST_WINDOW_MS,
      limit: REQUEST_LIMIT,
    });
    const purpose = input.purpose ?? "link_verusid";
    const scopes = normalizeScopes(input.scopes);
    const issuedAt = new Date(input.now);
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_LIFETIME_MS);
    const audience = this.audience(input.principal.trustDomain);
    const state = deriveHostedState(Buffer.from(this.config.bindingSecret, "utf8"), {
      accountReference: input.principal.accountReference,
      trustDomain: input.principal.trustDomain,
      purpose,
      audience,
      issuedAt,
      expiresAt,
    });
    const hosted = await this.hostedAuth
      .createChallenge({ state, audience, purpose, issuedAt, expiresAt })
      .catch((error: unknown) => {
        throw hostedError(error);
      });
    if (
      hosted.signerIdentityAddress !== this.config.applicationIdentityAddress ||
      hosted.callbackUrl !== this.config.authServiceCallbackUrl
    ) {
      throw new WalletLinkError("AUTH_SERVICE_INCOMPATIBLE");
    }

    const pollingToken = generateOpaqueToken(32);
    const challengeReference = `wallet_challenge_${randomUUID().replaceAll("-", "")}`;
    await this.repository.createChallenge(
      {
        externalReference: challengeReference,
        accountReference: input.principal.accountReference,
        trustDomain: input.principal.trustDomain,
        purpose,
        network: "VRSCTEST",
        nonceHash: sha256(Buffer.from(state, "utf8")),
        requestId: hosted.challengeId,
        requestDigest: hosted.presentationDigest,
        pollingTokenDigest: keyedDigest(this.config.pollingTokenSecret, pollingToken),
        audience,
        callbackUrl: hosted.callbackUrl,
        applicationIdentityAddress: hosted.signerIdentityAddress,
        consentedScopes: scopes,
        issuedAt: hosted.issuedAt,
        expiresAt: hosted.expiresAt,
      },
      contextFor(
        input.principal,
        input.correlationId,
        hosted.presentationDigest,
        "wallet_link_requested",
      ),
    );
    return Object.freeze({
      challengeReference,
      network: "VRSCTEST",
      requesterIdentity: this.config.applicationIdentityAddress,
      purpose,
      scopes,
      expiresAt: hosted.expiresAt.toISOString(),
      sameDeviceUrl: hosted.deepLink,
      qrPayload: hosted.deepLink,
      pollingToken,
      operational: false,
      limitations: Object.freeze([
        "This optional VRSCTEST link proves control of the selected VerusID only.",
        "It does not prove identity, presence, locality, uniqueness, eligibility, or committee role.",
        "Never enter or send a seed phrase, private key, WIF, wallet file, or spending key.",
      ]),
    });
  }

  async poll(input: PollInput): Promise<WalletLinkPollResult> {
    this.requireEnabled();
    const tokenDigest = keyedDigest(this.config.pollingTokenSecret, input.pollingToken);
    const context = contextFor(
      input.principal,
      input.correlationId,
      tokenDigest,
      "wallet_link_polled",
    );
    const current = await this.repository.pollChallenge(
      input.principal.accountReference,
      tokenDigest,
      input.now,
      context,
    );
    if (current.state !== "presented") return current;

    const challenge = await this.repository.challengeForPoll(
      input.principal.accountReference,
      tokenDigest,
    );
    const state = deriveHostedState(Buffer.from(this.config.bindingSecret, "utf8"), {
      accountReference: challenge.accountReference,
      trustDomain: challenge.trustDomain,
      purpose: challenge.purpose,
      audience: challenge.audience,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    });
    if (sha256(Buffer.from(state, "utf8")) !== challenge.nonceHash) {
      throw new WalletLinkError("INVALID_REQUEST");
    }
    const result = await this.hostedAuth
      .getResult({
        challengeId: challenge.requestId,
        state,
        audience: challenge.audience,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
        now: input.now,
      })
      .catch((error: unknown) => {
        throw hostedError(error);
      });
    if (result.kind === "pending") return current;

    const [info, identity] = await Promise.all([
      this.adapter.getInfo(),
      this.adapter.getIdentity({ identity: result.identityAddress }),
    ]);
    if (info.chainId !== VRSCTEST_CHAIN_ID || info.name !== "VRSCTEST" || !info.testnet) {
      throw new VerusIntegrationError("WRONG_NETWORK", "Identity readback is not VRSCTEST", false);
    }
    validateLinkedIdentity(identity, result.identityAddress);
    const completed = await this.repository.completeChallenge(
      {
        requestId: challenge.requestId,
        responseDigest: result.proofDigest,
        identityAddress: result.identityAddress,
        ...(identity.fullyQualifiedName
          ? { displayNameSnapshot: identity.fullyQualifiedName }
          : {}),
        proofDigest: result.proofDigest,
        proofMethod: "hosted_verusid_login_consent_v1",
        requestSignerIdentity: challenge.applicationIdentityAddress,
        observedIdentityStatus: identity.status,
        observedIdentityBlockHeight: identity.blockHeight,
        observedIdentityTxid: identity.transactionId,
        completedAt: input.now,
      },
      contextFor(input.principal, input.correlationId, result.proofDigest, "wallet_link_verified"),
    );
    if (completed.kind === "expired") throw new WalletLinkError("CHALLENGE_EXPIRED");
    await this.acknowledgeHostedResult(challenge.requestId, result.proofDigest);
    return this.repository.pollChallenge(
      input.principal.accountReference,
      tokenDigest,
      input.now,
      context,
    );
  }

  private async acknowledgeHostedResult(challengeId: string, proofDigest: string): Promise<void> {
    // Local completion is already durable. A failed acknowledgement intentionally leaves the
    // hosted result available only until its short expiry; it must never roll back the link.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.hostedAuth.acknowledgeResult({ challengeId, proofDigest });
        return;
      } catch {
        // Retry immediately within this request. The result endpoint is idempotent until ack.
      }
    }
  }

  async unlink(input: {
    readonly principal: WalletLinkPrincipal;
    readonly linkReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void> {
    this.requireEnabled();
    await this.repository.unlink(
      input.principal.accountReference,
      input.linkReference,
      input.now,
      contextFor(
        input.principal,
        input.correlationId,
        sha256(Buffer.from(input.linkReference, "utf8")),
        "wallet_link_unlinked",
      ),
    );
  }

  async cancel(input: {
    readonly principal: WalletLinkPrincipal;
    readonly challengeReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void> {
    this.requireEnabled();
    await this.repository.cancelChallenge(
      input.principal.accountReference,
      input.challengeReference,
      input.now,
      contextFor(
        input.principal,
        input.correlationId,
        sha256(Buffer.from(input.challengeReference, "utf8")),
        "wallet_link_cancelled",
      ),
    );
  }

  private audience(trustDomain: VerusLinkTrustDomain): string {
    return trustDomain === "participant"
      ? this.config.participantAudience
      : this.config.committeeAudience;
  }

  private requireEnabled(): void {
    if (!this.config.enabled) throw new WalletLinkError("FEATURE_DISABLED");
    if (this.config.network !== "VRSCTEST") throw new WalletLinkError("MAINNET_BLOCKED");
    if (this.config.bindingSecret.length < 32 || this.config.pollingTokenSecret.length < 32) {
      throw new WalletLinkError("FEATURE_DISABLED");
    }
  }
}

interface HostedStateBinding {
  readonly accountReference: string;
  readonly trustDomain: VerusLinkTrustDomain;
  readonly purpose: WalletLinkPurpose;
  readonly audience: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

function deriveHostedState(secret: Uint8Array, binding: HostedStateBinding): string {
  const material = [
    "cbc.hosted-verusid-link.state.v1",
    binding.accountReference,
    binding.trustDomain,
    binding.purpose,
    binding.audience,
    binding.issuedAt.toISOString(),
    binding.expiresAt.toISOString(),
  ].join("\u001f");
  return createHmac("sha256", Buffer.from(secret)).update(material, "utf8").digest("base64url");
}

function normalizeScopes(scopes: readonly string[]): readonly string[] {
  const normalized = [...new Set(scopes)].sort();
  if (normalized.length === 0 || normalized.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new WalletLinkError("INVALID_REQUEST");
  }
  return Object.freeze(normalized);
}

function validateLinkedIdentity(identity: VerusIdentityResult, expectedAddress: string): void {
  if (
    identity.identity.identityAddress !== expectedAddress ||
    identity.identity.systemId !== VRSCTEST_CHAIN_ID ||
    identity.status !== "active"
  ) {
    throw new VerusIntegrationError(
      "IDENTITY_STATE_INVALID",
      "Selected identity is not currently active on VRSCTEST",
      false,
    );
  }
}

function contextFor(
  principal: WalletLinkPrincipal,
  correlationId: string,
  requestDigest: string,
  reasonCategory: string,
): CommandContext {
  return {
    actor: {
      type: "auth_account",
      reference: principal.accountReference,
      authenticationStrength: principal.authenticationStrength,
    },
    committeeReference: "global_wallet_linking",
    policyVersionReference: "cbc-wallet-link-policy-v1",
    softwareVersion: "issue-19",
    reasonCategory,
    correlationId,
    idempotencyKey: `${reasonCategory}:${requestDigest}`,
    requestDigest,
  };
}

function hostedError(error: unknown): WalletLinkError {
  return error instanceof HostedAuthError && error.code === "INCOMPATIBLE"
    ? new WalletLinkError("AUTH_SERVICE_INCOMPATIBLE")
    : new WalletLinkError("AUTH_SERVICE_UNAVAILABLE");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicMessage(code: WalletLinkErrorCode): string {
  switch (code) {
    case "FEATURE_DISABLED":
      return "Optional VRSCTEST VerusID linking is not enabled.";
    case "MAINNET_BLOCKED":
      return "VerusID linking is available on VRSCTEST only.";
    case "CHALLENGE_EXPIRED":
      return "The VerusID linking request expired. Start again.";
    case "CHALLENGE_UNAVAILABLE":
      return "The VerusID linking request is unavailable. Start again.";
    case "AUTH_SERVICE_UNAVAILABLE":
      return "The VRSCTEST identity service is temporarily unavailable.";
    case "AUTH_SERVICE_INCOMPATIBLE":
      return "The VRSCTEST identity service did not meet the approved compatibility contract.";
    case "INVALID_REQUEST":
      return "The VerusID linking result could not be accepted.";
  }
}
