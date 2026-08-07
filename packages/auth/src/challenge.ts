import type { TrustDomain } from "./trust-domain.js";

export type AuthChallengeKind =
  | "passkey_registration"
  | "passkey_authentication"
  | "email_sign_in"
  | "account_recovery"
  | "recovery_grant"
  | "email_change";

export interface AuthChallengeRecord {
  readonly id: string;
  readonly accountReference: string | null;
  readonly trustDomain: TrustDomain;
  readonly kind: AuthChallengeKind;
  readonly secretDigest: string;
  readonly destinationReference: string | null;
  readonly lookupDigest: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface ConsumedAuthChallenge extends AuthChallengeRecord {
  readonly consumedAt: Date;
}

export interface AuthChallengeStore {
  create(record: AuthChallengeRecord): Promise<void>;
  consume(input: {
    readonly challengeId?: string;
    readonly secretDigest?: string;
    readonly kind: AuthChallengeKind;
    readonly trustDomain: TrustDomain;
    readonly at: Date;
  }): Promise<ConsumedAuthChallenge | null>;
}
