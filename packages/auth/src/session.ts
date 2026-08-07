import { digestMatches, generateOpaqueToken, keyedDigest } from "./crypto.js";
import { AuthError } from "./errors.js";
import type { AuthenticationStrength, TrustDomain, TrustDomainConfig } from "./trust-domain.js";

export interface SessionRecord {
  readonly id: string;
  readonly accountReference: string;
  readonly trustDomain: TrustDomain;
  readonly audience: string;
  readonly tokenDigest: string;
  readonly csrfDigest: string;
  readonly authenticationStrength: AuthenticationStrength;
  readonly authenticatedAt: Date;
  readonly reauthenticatedAt: Date | null;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly deviceLabel: string;
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  findByTokenDigest(trustDomain: TrustDomain, tokenDigest: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, reasonCategory: string, at: Date): Promise<void>;
  revokeAll(
    accountReference: string,
    trustDomain: TrustDomain,
    reasonCategory: string,
    at: Date,
  ): Promise<number>;
  touch(sessionId: string, idleExpiresAt: Date, at: Date): Promise<void>;
  list(accountReference: string, trustDomain: TrustDomain): Promise<readonly SessionRecord[]>;
}

export interface SessionIdentifierFactory {
  (): string;
}

export interface IssuedSession {
  readonly record: SessionRecord;
  readonly token: string;
  readonly csrfToken: string;
}

export class SessionService {
  constructor(
    private readonly stores: SessionStore,
    private readonly configs: Readonly<Record<TrustDomain, TrustDomainConfig>>,
    private readonly newId: SessionIdentifierFactory,
  ) {}

  async issue(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly authenticationStrength: AuthenticationStrength;
    readonly deviceLabel: string;
    readonly now: Date;
    readonly priorSessionId?: string;
  }): Promise<IssuedSession> {
    const config = this.configs[input.trustDomain];
    if (input.trustDomain === "committee" && input.authenticationStrength !== "passkey") {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    if (input.priorSessionId) {
      await this.stores.revoke(input.priorSessionId, "session_rotated", input.now);
    }

    const token = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const record: SessionRecord = Object.freeze({
      id: this.newId(),
      accountReference: input.accountReference,
      trustDomain: input.trustDomain,
      audience: config.audience,
      tokenDigest: keyedDigest(config.sessionSecret, token),
      csrfDigest: keyedDigest(config.sessionSecret, csrfToken),
      authenticationStrength: input.authenticationStrength,
      authenticatedAt: input.now,
      reauthenticatedAt: input.authenticationStrength === "passkey" ? input.now : null,
      idleExpiresAt: new Date(input.now.getTime() + config.idleTimeoutMs),
      absoluteExpiresAt: new Date(input.now.getTime() + config.absoluteTimeoutMs),
      revokedAt: null,
      deviceLabel: input.deviceLabel,
    });
    await this.stores.create(record);
    return Object.freeze({ record, token, csrfToken });
  }

  async authenticate(input: {
    readonly trustDomain: TrustDomain;
    readonly token: string | undefined;
    readonly now: Date;
  }): Promise<SessionRecord> {
    if (!input.token) throw new AuthError("AUTHENTICATION_REQUIRED");
    const config = this.configs[input.trustDomain];
    const digest = keyedDigest(config.sessionSecret, input.token);
    const record = await this.stores.findByTokenDigest(input.trustDomain, digest);
    if (!record || record.audience !== config.audience) {
      throw new AuthError("AUTHENTICATION_FAILED");
    }
    if (record.revokedAt) throw new AuthError("SESSION_REVOKED");
    if (record.idleExpiresAt <= input.now || record.absoluteExpiresAt <= input.now) {
      await this.stores.revoke(record.id, "session_expired", input.now);
      throw new AuthError("SESSION_EXPIRED");
    }

    const nextIdle = new Date(
      Math.min(input.now.getTime() + config.idleTimeoutMs, record.absoluteExpiresAt.getTime()),
    );
    await this.stores.touch(record.id, nextIdle, input.now);
    return Object.freeze({ ...record, idleExpiresAt: nextIdle });
  }

  requireRecentStrongAuthentication(session: SessionRecord, now: Date): void {
    const config = this.configs[session.trustDomain];
    if (
      session.authenticationStrength !== "passkey" ||
      !session.reauthenticatedAt ||
      now.getTime() - session.reauthenticatedAt.getTime() > config.privilegedReauthenticationMs
    ) {
      throw new AuthError("REAUTHENTICATION_REQUIRED");
    }
  }

  requireCsrf(input: {
    readonly session: SessionRecord;
    readonly method: string;
    readonly origin: string | undefined;
    readonly csrfToken: string | undefined;
  }): void {
    if (["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) return;
    const config = this.configs[input.session.trustDomain];
    if (input.origin !== config.origin || !input.csrfToken) {
      throw new AuthError("ORIGIN_REJECTED");
    }
    const suppliedDigest = keyedDigest(config.sessionSecret, input.csrfToken);
    if (!digestMatches(input.session.csrfDigest, suppliedDigest)) {
      throw new AuthError("ORIGIN_REJECTED");
    }
  }
}
