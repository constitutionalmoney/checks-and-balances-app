import type { AuthChallengeStore } from "./challenge.js";
import { generateOpaqueToken, keyedDigest, normalizeEmailForLookup } from "./crypto.js";
import type { SecurityNotificationSink } from "./email-recovery.js";
import { AuthError } from "./errors.js";
import type { TrustDomain } from "./trust-domain.js";

export interface SecurityMutationContext {
  readonly actorReference: string;
  readonly authenticationStrength: "verified_email" | "passkey" | "recovery";
  readonly policyVersionReference: string;
  readonly softwareVersion: string;
  readonly correlationId: string;
}

export interface AccountSecurityStore {
  lockAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly reasonCategory: string;
    readonly context: SecurityMutationContext;
    readonly at: Date;
  }): Promise<number>;
  changeVerifiedEmail(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly newDestinationReference: string;
    readonly newLookupDigest: string;
    readonly context: SecurityMutationContext;
    readonly at: Date;
  }): Promise<{
    readonly oldDestinationReferences: readonly string[];
    readonly revokedSessions: number;
  }>;
}

export class AccountSecurityService {
  constructor(
    private readonly store: AccountSecurityStore,
    private readonly challenges: AuthChallengeStore,
    private readonly notifications: SecurityNotificationSink,
    private readonly secrets: Readonly<Record<TrustDomain, string>>,
    private readonly newId: () => string,
  ) {}

  async lockAccount(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly destinationReference: string;
    readonly reasonCategory: string;
    readonly context: SecurityMutationContext;
    readonly now: Date;
  }): Promise<number> {
    const revoked = await this.store.lockAndRevokeSessions({
      accountReference: input.accountReference,
      trustDomain: input.trustDomain,
      reasonCategory: input.reasonCategory,
      context: input.context,
      at: input.now,
    });
    await this.notifications.enqueue({
      accountReference: input.accountReference,
      destinationReference: input.destinationReference,
      kind: "account_locked",
    });
    return revoked;
  }

  async beginEmailChange(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly newEmail: string;
    readonly newDestinationReference: string;
    readonly recentlyReauthenticated: boolean;
    readonly now: Date;
    readonly lifetimeMs: number;
  }): Promise<void> {
    if (!input.recentlyReauthenticated) throw new AuthError("REAUTHENTICATION_REQUIRED");
    const token = generateOpaqueToken();
    const expiresAt = new Date(input.now.getTime() + input.lifetimeMs);
    await this.challenges.create({
      id: this.newId(),
      accountReference: input.accountReference,
      trustDomain: input.trustDomain,
      kind: "email_change",
      secretDigest: keyedDigest(this.secrets[input.trustDomain], token),
      destinationReference: input.newDestinationReference,
      lookupDigest: normalizeEmailForLookup(input.newEmail, this.secrets[input.trustDomain]),
      expiresAt,
      createdAt: input.now,
    });
    await this.notifications.enqueue({
      accountReference: input.accountReference,
      destinationReference: input.newDestinationReference,
      kind: "email_change_requested",
      secret: token,
      expiresAt,
    });
  }

  async confirmEmailChange(input: {
    readonly trustDomain: TrustDomain;
    readonly token: string;
    readonly context: SecurityMutationContext;
    readonly now: Date;
  }): Promise<void> {
    const secret = this.secrets[input.trustDomain];
    const challenge = await this.challenges.consume({
      secretDigest: keyedDigest(secret, input.token),
      kind: "email_change",
      trustDomain: input.trustDomain,
      at: input.now,
    });
    if (
      !challenge?.accountReference ||
      !challenge.destinationReference ||
      !challenge.lookupDigest
    ) {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    const result = await this.store.changeVerifiedEmail({
      accountReference: challenge.accountReference,
      trustDomain: input.trustDomain,
      newDestinationReference: challenge.destinationReference,
      newLookupDigest: challenge.lookupDigest,
      context: input.context,
      at: input.now,
    });
    for (const destinationReference of [
      ...result.oldDestinationReferences,
      challenge.destinationReference,
    ]) {
      await this.notifications.enqueue({
        accountReference: challenge.accountReference,
        destinationReference,
        kind: "email_changed",
      });
    }
  }
}
