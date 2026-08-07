import { generateOpaqueToken, keyedDigest, normalizeEmailForLookup } from "./crypto.js";
import type { AuthChallengeStore } from "./challenge.js";
import { AuthError } from "./errors.js";
import type { RateLimiter } from "./rate-limit.js";
import type { TrustDomain } from "./trust-domain.js";

export interface VerifiedEmailAccount {
  readonly accountReference: string;
  readonly trustDomain: TrustDomain;
  readonly destinationReference: string;
  readonly accountState: "active" | "invited" | "locked" | "suspended" | "closed";
}

export interface VerifiedEmailDirectory {
  findByLookupDigest(
    trustDomain: TrustDomain,
    lookupDigest: string,
  ): Promise<VerifiedEmailAccount | null>;
}

export interface SecurityNotification {
  readonly accountReference: string;
  readonly destinationReference: string;
  readonly kind:
    | "email_sign_in_requested"
    | "account_recovery_requested"
    | "account_recovered"
    | "sessions_revoked"
    | "account_locked"
    | "email_change_requested"
    | "email_changed";
  readonly secret?: string;
  readonly expiresAt?: Date;
}

export interface SecurityNotificationSink {
  enqueue(notification: SecurityNotification): Promise<void>;
}

export interface RecoveryAccountStore {
  recoverAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly committeeReviewRequired: boolean;
    readonly destinationReference: string;
    readonly policyVersionReference: string;
    readonly softwareVersion: string;
    readonly correlationId: string;
    readonly at: Date;
  }): Promise<number>;
}

export interface GenericChallengeResponse {
  readonly accepted: true;
  readonly message: "If the account is eligible, instructions will be sent.";
}

const genericResponse: GenericChallengeResponse = Object.freeze({
  accepted: true,
  message: "If the account is eligible, instructions will be sent.",
});

export class EmailRecoveryService {
  constructor(
    private readonly directory: VerifiedEmailDirectory,
    private readonly challenges: AuthChallengeStore,
    private readonly rateLimiter: RateLimiter,
    private readonly notifications: SecurityNotificationSink,
    private readonly recoveryAccounts: RecoveryAccountStore,
    private readonly secrets: Readonly<Record<TrustDomain, string>>,
    private readonly newId: () => string,
  ) {}

  async begin(input: {
    readonly kind: "email_sign_in" | "account_recovery";
    readonly trustDomain: TrustDomain;
    readonly email: string;
    readonly networkReference: string;
    readonly now: Date;
    readonly lifetimeMs: number;
  }): Promise<GenericChallengeResponse> {
    const secret = this.secrets[input.trustDomain];
    const lookupDigest = normalizeEmailForLookup(input.email, secret);
    const prefix = input.kind === "email_sign_in" ? "login" : "recovery";
    await this.rateLimiter.requireWithinLimit({
      bucket: `${prefix}_network`,
      opaqueSubject: input.networkReference,
      now: input.now,
      windowMs: 15 * 60_000,
      limit: 20,
    });
    try {
      await this.rateLimiter.requireWithinLimit({
        bucket: `${prefix}_account`,
        opaqueSubject: lookupDigest,
        now: input.now,
        windowMs: 15 * 60_000,
        limit: 5,
      });
    } catch (error) {
      if (error instanceof AuthError && error.code === "RATE_LIMITED") return genericResponse;
      throw error;
    }

    const account = await this.directory.findByLookupDigest(input.trustDomain, lookupDigest);
    const eligible =
      account !== null &&
      (input.kind === "email_sign_in"
        ? input.trustDomain === "participant" && account.accountState === "active"
        : account.accountState === "active" || account.accountState === "locked");
    if (!eligible) {
      return genericResponse;
    }
    const token = generateOpaqueToken();
    const expiresAt = new Date(input.now.getTime() + input.lifetimeMs);
    await this.challenges.create({
      id: this.newId(),
      accountReference: account.accountReference,
      trustDomain: input.trustDomain,
      kind: input.kind,
      secretDigest: keyedDigest(secret, token),
      destinationReference: account.destinationReference,
      lookupDigest: null,
      expiresAt,
      createdAt: input.now,
    });
    await this.notifications.enqueue({
      accountReference: account.accountReference,
      destinationReference: account.destinationReference,
      kind:
        input.kind === "email_sign_in" ? "email_sign_in_requested" : "account_recovery_requested",
      secret: token,
      expiresAt,
    });
    return genericResponse;
  }

  async completeEmailSignIn(input: {
    readonly trustDomain: TrustDomain;
    readonly token: string;
    readonly now: Date;
  }): Promise<{ readonly accountReference: string }> {
    const challenge = await this.challenges.consume({
      secretDigest: keyedDigest(this.secrets[input.trustDomain], input.token),
      kind: "email_sign_in",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (!challenge?.accountReference) throw new AuthError("AUTHENTICATION_FAILED");
    if (input.trustDomain === "committee") throw new AuthError("AUTHENTICATION_FAILED");
    return Object.freeze({ accountReference: challenge.accountReference });
  }

  async completeRecovery(input: {
    readonly trustDomain: TrustDomain;
    readonly token: string;
    readonly now: Date;
    readonly grantLifetimeMs: number;
    readonly policyVersionReference: string;
    readonly softwareVersion: string;
    readonly correlationId: string;
  }): Promise<{
    readonly accountReference: string;
    readonly recoveryGrant: string | null;
    readonly committeeReviewRequired: boolean;
  }> {
    const secret = this.secrets[input.trustDomain];
    const challenge = await this.challenges.consume({
      secretDigest: keyedDigest(secret, input.token),
      kind: "account_recovery",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (!challenge?.accountReference || !challenge.destinationReference) {
      throw new AuthError("AUTHENTICATION_FAILED");
    }

    const committeeReviewRequired = input.trustDomain === "committee";
    await this.recoveryAccounts.recoverAndRevokeSessions({
      accountReference: challenge.accountReference,
      trustDomain: input.trustDomain,
      committeeReviewRequired,
      destinationReference: challenge.destinationReference,
      policyVersionReference: input.policyVersionReference,
      softwareVersion: input.softwareVersion,
      correlationId: input.correlationId,
      at: input.now,
    });
    await this.notifications.enqueue({
      accountReference: challenge.accountReference,
      destinationReference: challenge.destinationReference,
      kind: "account_recovered",
    });

    if (committeeReviewRequired) {
      return Object.freeze({
        accountReference: challenge.accountReference,
        recoveryGrant: null,
        committeeReviewRequired: true,
      });
    }

    const recoveryGrant = generateOpaqueToken();
    await this.challenges.create({
      id: this.newId(),
      accountReference: challenge.accountReference,
      trustDomain: input.trustDomain,
      kind: "recovery_grant",
      secretDigest: keyedDigest(secret, recoveryGrant),
      destinationReference: null,
      lookupDigest: null,
      expiresAt: new Date(input.now.getTime() + input.grantLifetimeMs),
      createdAt: input.now,
    });
    return Object.freeze({
      accountReference: challenge.accountReference,
      recoveryGrant,
      committeeReviewRequired: false,
    });
  }

  async consumeRecoveryGrant(input: {
    readonly trustDomain: TrustDomain;
    readonly recoveryGrant: string;
    readonly now: Date;
  }): Promise<string> {
    const challenge = await this.challenges.consume({
      secretDigest: keyedDigest(this.secrets[input.trustDomain], input.recoveryGrant),
      kind: "recovery_grant",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (!challenge?.accountReference) throw new AuthError("AUTHENTICATION_FAILED");
    return challenge.accountReference;
  }
}
