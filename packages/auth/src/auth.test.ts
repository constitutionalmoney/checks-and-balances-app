import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  AuthError,
  AccountSecurityService,
  EmailRecoveryService,
  PasskeyService,
  RateLimiter,
  SessionService,
  authorize,
  expiredSessionCookie,
  normalizeEmailForLookup,
  recordConsentChoice,
  requireCurrentPolicyReceipts,
  sessionCookie,
  validateTrustDomains,
} from "./index.js";
import type {
  AuthChallengeRecord,
  AuthChallengeStore,
  AccountSecurityStore,
  AuthorizationAction,
  AuthorizationRequest,
  AuthorizationRole,
  ConsumedAuthChallenge,
  PasskeyRepository,
  RateLimitStore,
  RecoveryAccountStore,
  SecurityNotification,
  SecurityNotificationSink,
  SecurityMutationContext,
  SessionRecord,
  SessionStore,
  StoredPasskeyCredential,
  TrustDomain,
  TrustDomainConfig,
  VerifiedEmailAccount,
  VerifiedEmailDirectory,
  WebAuthnAdapter,
} from "./index.js";

const now = new Date("2026-08-07T12:00:00.000Z");

const participantConfig: TrustDomainConfig = Object.freeze({
  domain: "participant",
  audience: "cbc-participant-app",
  cookieName: "__Host-cbc-participant",
  origin: "https://app.example.test",
  relyingPartyId: "app.example.test",
  sessionSecret: "participant-secret-that-is-longer-than-32-bytes",
  idleTimeoutMs: 30 * 60_000,
  absoluteTimeoutMs: 12 * 60 * 60_000,
  privilegedReauthenticationMs: 5 * 60_000,
  sameSite: "Lax",
});

const committeeConfig: TrustDomainConfig = Object.freeze({
  domain: "committee",
  audience: "cbc-committee-console",
  cookieName: "__Host-cbc-committee",
  origin: "https://committee.example.test",
  relyingPartyId: "committee.example.test",
  sessionSecret: "committee-secret-that-is-different-and-long",
  idleTimeoutMs: 15 * 60_000,
  absoluteTimeoutMs: 60 * 60_000,
  privilegedReauthenticationMs: 5 * 60_000,
  sameSite: "Strict",
});

class MemorySessionStore implements SessionStore {
  readonly records = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async findByTokenDigest(
    trustDomain: TrustDomain,
    tokenDigest: string,
  ): Promise<SessionRecord | null> {
    return (
      [...this.records.values()].find(
        (record) => record.trustDomain === trustDomain && record.tokenDigest === tokenDigest,
      ) ?? null
    );
  }

  async revoke(sessionId: string, _reasonCategory: string, at: Date): Promise<void> {
    const record = this.records.get(sessionId);
    if (record) this.records.set(sessionId, { ...record, revokedAt: at });
  }

  async revokeAll(
    accountReference: string,
    trustDomain: TrustDomain,
    _reasonCategory: string,
    at: Date,
  ): Promise<number> {
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.accountReference === accountReference && record.trustDomain === trustDomain) {
        this.records.set(id, { ...record, revokedAt: at });
        count += 1;
      }
    }
    return count;
  }

  async touch(sessionId: string, idleExpiresAt: Date): Promise<void> {
    const record = this.records.get(sessionId);
    if (record) this.records.set(sessionId, { ...record, idleExpiresAt });
  }

  async list(
    accountReference: string,
    trustDomain: TrustDomain,
  ): Promise<readonly SessionRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.accountReference === accountReference && record.trustDomain === trustDomain,
    );
  }
}

class MemoryChallengeStore implements AuthChallengeStore {
  readonly records = new Map<string, AuthChallengeRecord & { consumedAt: Date | null }>();

  async create(record: AuthChallengeRecord): Promise<void> {
    this.records.set(record.id, { ...record, consumedAt: null });
  }

  async consume(input: {
    readonly challengeId?: string;
    readonly secretDigest?: string;
    readonly kind: AuthChallengeRecord["kind"];
    readonly trustDomain: TrustDomain;
    readonly at: Date;
  }): Promise<ConsumedAuthChallenge | null> {
    const record = [...this.records.values()].find(
      (candidate) =>
        (input.challengeId === undefined || candidate.id === input.challengeId) &&
        (input.secretDigest === undefined || candidate.secretDigest === input.secretDigest) &&
        candidate.kind === input.kind &&
        candidate.trustDomain === input.trustDomain,
    );
    if (!record || record.consumedAt || record.expiresAt <= input.at) return null;
    const consumed = { ...record, consumedAt: input.at };
    this.records.set(record.id, consumed);
    return consumed;
  }
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly counts = new Map<string, number>();

  async increment(input: { readonly keyDigest: string }): Promise<number> {
    const count = (this.counts.get(input.keyDigest) ?? 0) + 1;
    this.counts.set(input.keyDigest, count);
    return count;
  }
}

describe("separate trust-domain sessions", () => {
  it("uses distinct host-only hardened cookies and rejects shared trust material", () => {
    expect(() => validateTrustDomains(participantConfig, committeeConfig)).not.toThrow();
    const participant = sessionCookie(participantConfig, "synthetic-token", 300);
    const committee = sessionCookie(committeeConfig, "synthetic-token", 300);

    for (const value of [participant, committee, expiredSessionCookie(participantConfig)]) {
      expect(value).toContain("Path=/");
      expect(value).toContain("Secure");
      expect(value).toContain("HttpOnly");
      expect(value).not.toContain("Domain=");
    }
    expect(participant).toContain("__Host-cbc-participant=");
    expect(committee).toContain("__Host-cbc-committee=");
    expect(() =>
      validateTrustDomains(participantConfig, {
        ...committeeConfig,
        sessionSecret: participantConfig.sessionSecret,
      }),
    ).toThrow(AuthError);
  });

  it("rotates fixation-prone sessions and rejects stolen, revoked, and expired tokens", async () => {
    const store = new MemorySessionStore();
    const service = new SessionService(
      store,
      { participant: participantConfig, committee: committeeConfig },
      randomUUID,
    );
    const first = await service.issue({
      accountReference: "acct:synthetic-participant",
      trustDomain: "participant",
      authenticationStrength: "verified_email",
      deviceLabel: "Synthetic desktop browser",
      now,
    });
    const rotated = await service.issue({
      accountReference: first.record.accountReference,
      trustDomain: "participant",
      authenticationStrength: "passkey",
      deviceLabel: first.record.deviceLabel,
      now: new Date(now.getTime() + 1_000),
      priorSessionId: first.record.id,
    });

    await expect(
      service.authenticate({ trustDomain: "participant", token: first.token, now }),
    ).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    await expect(
      service.authenticate({ trustDomain: "committee", token: rotated.token, now }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(
      service.authenticate({
        trustDomain: "participant",
        token: rotated.token,
        now: new Date(rotated.record.absoluteExpiresAt.getTime() + 1),
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("enforces origin-bound CSRF and fresh passkey reauthentication", async () => {
    const store = new MemorySessionStore();
    const service = new SessionService(
      store,
      { participant: participantConfig, committee: committeeConfig },
      randomUUID,
    );
    const issued = await service.issue({
      accountReference: "acct:synthetic",
      trustDomain: "participant",
      authenticationStrength: "passkey",
      deviceLabel: "Synthetic security key",
      now,
    });
    expect(() =>
      service.requireCsrf({
        session: issued.record,
        method: "POST",
        origin: participantConfig.origin,
        csrfToken: issued.csrfToken,
      }),
    ).not.toThrow();
    expect(() =>
      service.requireCsrf({
        session: issued.record,
        method: "POST",
        origin: "https://attacker.invalid",
        csrfToken: issued.csrfToken,
      }),
    ).toThrow(/origin was rejected/i);
    expect(() =>
      service.requireRecentStrongAuthentication(
        issued.record,
        new Date(now.getTime() + participantConfig.privilegedReauthenticationMs + 1),
      ),
    ).toThrow(/confirm your identity/i);
  });

  it("requires passkeys for committee sessions", async () => {
    const service = new SessionService(
      new MemorySessionStore(),
      { participant: participantConfig, committee: committeeConfig },
      randomUUID,
    );
    await expect(
      service.issue({
        accountReference: "acct:committee-user",
        trustDomain: "committee",
        authenticationStrength: "verified_email",
        deviceLabel: "Synthetic browser",
        now,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});

const roleExamples: Readonly<Record<AuthorizationRole, AuthorizationAction>> = Object.freeze({
  scheduler: "session.schedule",
  reviewer: "verification.approve",
  signer: "attestation.sign",
  administrator: "attestation.revoke",
  privacy: "privacy.fulfil_request",
  security: "security.revoke_sessions",
  support: "support.recover_account",
  steward: "client.rotate_key",
  relying_party: "relying_party.read_status",
});

function authorizationRequest(
  action: AuthorizationAction,
  role: AuthorizationRole,
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  const service = role === "relying_party";
  return {
    action,
    actorReference: `actor:${role}`,
    actorAccountState: "active",
    actorTrustDomain: service ? "service" : "committee",
    roles: [role],
    authenticationStrength: "passkey",
    reauthenticatedAt: now,
    now,
    reauthenticationWindowMs: 5 * 60_000,
    actorCommitteeReference: service ? null : "committee:kelowna",
    targetCommitteeReference: service ? null : "committee:kelowna",
    resourceOwnerReference: null,
    membershipState: service ? null : "active",
    committeeState: service ? null : "active",
    assignedToSession: true,
    conflicted: false,
    enabledFeatures: ["synthetic_feature"],
    requiredFeatures: [],
    requiredPolicyKeys: ["synthetic_policy"],
    policies: [
      {
        policyKey: "synthetic_policy",
        version: "draft-test-v1",
        effectiveAt: new Date(now.getTime() - 1_000),
        expiresAt: new Date(now.getTime() + 60_000),
        acknowledgedVersion: "draft-test-v1",
      },
    ],
    statePreconditionsSatisfied: true,
    ...overrides,
  };
}

describe("deny-by-default authorization", () => {
  it("has a positive and negative capability decision for every role", () => {
    for (const [role, action] of Object.entries(roleExamples) as [
      AuthorizationRole,
      AuthorizationAction,
    ][]) {
      expect(authorize(authorizationRequest(action, role)).allowed, role).toBe(true);
      expect(
        authorize(authorizationRequest("verification.approve", role)).allowed,
        `${role} cannot inherit reviewer approval`,
      ).toBe(role === "reviewer");
    }
  });

  it("permits only participant-owned resources and blocks cross-committee access", () => {
    const own = authorizationRequest("participant.read_own", "support", {
      actorReference: "acct:participant",
      actorTrustDomain: "participant",
      roles: [],
      actorCommitteeReference: null,
      targetCommitteeReference: null,
      resourceOwnerReference: "acct:participant",
      membershipState: null,
      committeeState: null,
    });
    expect(authorize(own).allowed).toBe(true);
    expect(authorize({ ...own, resourceOwnerReference: "acct:another-participant" }).denial).toBe(
      "not_own_resource",
    );
    expect(
      authorize(
        authorizationRequest("verification.approve", "reviewer", {
          targetCommitteeReference: "committee:other",
        }),
      ).denial,
    ).toBe("cross_committee");
  });

  it("excludes conflicted, inactive, and unassigned reviewers from counted decisions", () => {
    expect(
      authorize(authorizationRequest("verification.approve", "reviewer", { conflicted: true }))
        .denial,
    ).toBe("conflict_declared");
    expect(
      authorize(
        authorizationRequest("verification.approve", "reviewer", {
          membershipState: "suspended",
        }),
      ).denial,
    ).toBe("membership_inactive");
    expect(
      authorize(
        authorizationRequest("verification.approve", "reviewer", {
          assignedToSession: false,
        }),
      ).denial,
    ).toBe("session_not_assigned");
  });

  it("requires current policy, feature, state, strong reauthentication, and four eyes", () => {
    expect(
      authorize(
        authorizationRequest("attestation.issue", "signer", {
          requiredFeatures: ["issuance"],
        }),
      ).denial,
    ).toBe("feature_disabled");
    expect(
      authorize(
        authorizationRequest("attestation.issue", "signer", {
          policies: [],
        }),
      ).denial,
    ).toBe("policy_missing_or_expired");
    expect(
      authorize(
        authorizationRequest("attestation.issue", "signer", {
          requiredPolicyKeys: ["issuance"],
          policies: [
            {
              policyKey: "issuance",
              version: "draft-test-v1",
              effectiveAt: new Date(now.getTime() - 2_000),
              expiresAt: new Date(now.getTime() - 1_000),
              acknowledgedVersion: "draft-test-v1",
            },
          ],
        }),
      ).denial,
    ).toBe("policy_missing_or_expired");
    expect(
      authorize(
        authorizationRequest("attestation.issue", "signer", {
          authenticationStrength: "verified_email",
          reauthenticatedAt: null,
        }),
      ).denial,
    ).toBe("reauthentication_required");
    expect(authorize(authorizationRequest("release.manage", "steward")).denial).toBe(
      "four_eyes_required",
    );
    expect(
      authorize(
        authorizationRequest("release.manage", "steward", {
          fourEyesApproval: {
            approverReference: "actor:second-steward",
            approverRoles: ["steward"],
            active: true,
            authenticationStrength: "passkey",
            reauthenticatedAt: now,
          },
        }),
      ).allowed,
    ).toBe(true);
  });

  it("never grants attestation approval to scheduler, support, or security", () => {
    for (const role of ["scheduler", "support", "security"] as const) {
      expect(authorize(authorizationRequest("verification.approve", role)).allowed).toBe(false);
      expect(authorize(authorizationRequest("attestation.issue", role)).allowed).toBe(false);
      expect(authorize(authorizationRequest("attestation.revoke", role)).allowed).toBe(false);
    }
  });
});

describe("versioned consent", () => {
  const presentation = {
    presentationReference: "presentation:synthetic-privacy-v1",
    purpose: "privacy_notice" as const,
    policyVersionReference: "policy:privacy:draft-test-v1",
    contentDigest: "a".repeat(64),
    presentedAt: now,
    preselected: false,
    bundledPurposes: ["privacy_notice" as const],
  };

  it("records exact presentation, version, action, and timestamps", () => {
    const receipt = recordConsentChoice({
      accountReference: "acct:synthetic",
      committeeReference: null,
      presentation,
      choice: { action: "accepted", actedAt: new Date(now.getTime() + 500) },
    });
    expect(receipt).toMatchObject({
      purpose: "privacy_notice",
      policyVersionReference: "policy:privacy:draft-test-v1",
      action: "accepted",
      presentedAt: now,
    });
    expect(receipt.presentationDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects preselected, bundled, and declined required consent", () => {
    for (const invalid of [
      { ...presentation, preselected: true },
      { ...presentation, bundledPurposes: ["privacy_notice", "session_attendance"] as const },
    ]) {
      expect(() =>
        recordConsentChoice({
          accountReference: "acct:synthetic",
          committeeReference: null,
          presentation: invalid,
          choice: { action: "accepted", actedAt: now },
        }),
      ).toThrow(/explicit choice/i);
    }
    expect(() =>
      recordConsentChoice({
        accountReference: "acct:synthetic",
        committeeReference: null,
        presentation,
        choice: { action: "declined", actedAt: now },
      }),
    ).toThrow(/explicit choice/i);
  });

  it("allows an explicit optional decline and blocks missing or expired required policy", () => {
    const optional = recordConsentChoice({
      accountReference: "acct:synthetic",
      committeeReference: null,
      presentation: {
        ...presentation,
        purpose: "optional_verus_link",
        bundledPurposes: ["optional_verus_link"],
      },
      choice: { action: "declined", actedAt: now },
    });
    expect(optional.action).toBe("declined");

    expect(() =>
      requireCurrentPolicyReceipts({
        requirements: [
          {
            purpose: "privacy_notice",
            policyVersionReference: presentation.policyVersionReference,
            effectiveAt: new Date(now.getTime() - 1_000),
            expiresAt: new Date(now.getTime() - 1),
            optional: false,
          },
        ],
        receipts: [],
        now,
      }),
    ).toThrow(/current required policy/i);
  });
});

class MemoryEmailDirectory implements VerifiedEmailDirectory {
  constructor(private readonly account: VerifiedEmailAccount | null) {}
  async findByLookupDigest(): Promise<VerifiedEmailAccount | null> {
    return this.account;
  }
}

class MemoryNotifications implements SecurityNotificationSink {
  readonly values: SecurityNotification[] = [];
  async enqueue(notification: SecurityNotification): Promise<void> {
    this.values.push(notification);
  }
}

class MemoryRecoveryAccounts implements RecoveryAccountStore {
  readonly values: { accountReference: string; committeeReviewRequired: boolean }[] = [];
  constructor(private readonly sessions?: MemorySessionStore) {}
  async recoverAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly trustDomain: TrustDomain;
    readonly committeeReviewRequired: boolean;
    readonly at: Date;
  }): Promise<number> {
    this.values.push(input);
    return (
      this.sessions?.revokeAll(
        input.accountReference,
        input.trustDomain,
        "account_recovery",
        input.at,
      ) ?? 0
    );
  }
}

function emailService(input: {
  readonly account: VerifiedEmailAccount | null;
  readonly challenges?: MemoryChallengeStore;
  readonly sessions?: MemorySessionStore;
  readonly notifications?: MemoryNotifications;
}) {
  const challenges = input.challenges ?? new MemoryChallengeStore();
  const sessions = input.sessions ?? new MemorySessionStore();
  const notifications = input.notifications ?? new MemoryNotifications();
  const recovery = new MemoryRecoveryAccounts(sessions);
  const service = new EmailRecoveryService(
    new MemoryEmailDirectory(input.account),
    challenges,
    new RateLimiter(new MemoryRateLimitStore(), "rate-limit-secret-long-enough-for-tests"),
    notifications,
    recovery,
    {
      participant: participantConfig.sessionSecret,
      committee: committeeConfig.sessionSecret,
    },
    randomUUID,
  );
  return { service, challenges, sessions, notifications, recovery };
}

describe("enumeration-safe email fallback and recovery", () => {
  const participantAccount: VerifiedEmailAccount = {
    accountReference: "acct:synthetic-participant",
    trustDomain: "participant",
    destinationReference: "contact:vault:synthetic-1",
    accountState: "active",
  };

  it("returns the same public response for known and unknown accounts", async () => {
    const known = emailService({ account: participantAccount });
    const unknown = emailService({ account: null });
    const request = {
      kind: "email_sign_in" as const,
      trustDomain: "participant" as const,
      email: "synthetic@example.invalid",
      networkReference: "network:synthetic",
      now,
      lifetimeMs: 10 * 60_000,
    };
    expect(await known.service.begin(request)).toEqual(await unknown.service.begin(request));
    expect(known.notifications.values).toHaveLength(1);
    expect(unknown.notifications.values).toHaveLength(0);
  });

  it("rate limits credential stuffing without revealing account existence", async () => {
    const fixture = emailService({ account: participantAccount });
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await expect(
        fixture.service.begin({
          kind: "email_sign_in",
          trustDomain: "participant",
          email: "synthetic@example.invalid",
          networkReference: "network:synthetic",
          now,
          lifetimeMs: 600_000,
        }),
      ).resolves.toMatchObject({ accepted: true });
    }
    expect(fixture.notifications.values).toHaveLength(5);
  });

  it("does not issue sign-in challenges to locked participants or committee accounts", async () => {
    const locked = emailService({
      account: { ...participantAccount, accountState: "locked" },
    });
    const committee = emailService({
      account: { ...participantAccount, trustDomain: "committee" },
    });
    const request = {
      kind: "email_sign_in" as const,
      email: "synthetic@example.invalid",
      networkReference: "network:synthetic",
      now,
      lifetimeMs: 600_000,
    };
    await expect(
      locked.service.begin({ ...request, trustDomain: "participant" }),
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      committee.service.begin({ ...request, trustDomain: "committee" }),
    ).resolves.toMatchObject({ accepted: true });
    expect(locked.notifications.values).toHaveLength(0);
    expect(committee.notifications.values).toHaveLength(0);
  });

  it("revokes stolen sessions during recovery and makes grants single use", async () => {
    const sessions = new MemorySessionStore();
    const sessionService = new SessionService(
      sessions,
      { participant: participantConfig, committee: committeeConfig },
      randomUUID,
    );
    const activeSession = await sessionService.issue({
      accountReference: participantAccount.accountReference,
      trustDomain: "participant",
      authenticationStrength: "verified_email",
      deviceLabel: "Lost synthetic device",
      now,
    });
    const fixture = emailService({ account: participantAccount, sessions });
    await fixture.service.begin({
      kind: "account_recovery",
      trustDomain: "participant",
      email: "synthetic@example.invalid",
      networkReference: "network:synthetic",
      now,
      lifetimeMs: 600_000,
    });
    const token = fixture.notifications.values[0]?.secret;
    expect(token).toBeDefined();
    const completed = await fixture.service.completeRecovery({
      trustDomain: "participant",
      token: token ?? "missing",
      now: new Date(now.getTime() + 1_000),
      grantLifetimeMs: 300_000,
      policyVersionReference: "policy:recovery:draft-test-v1",
      softwareVersion: "test",
      correlationId: "correlation:recovery-1",
    });
    expect(completed.committeeReviewRequired).toBe(false);
    expect(sessions.records.get(activeSession.record.id)?.revokedAt).not.toBeNull();
    await expect(
      fixture.service.consumeRecoveryGrant({
        trustDomain: "participant",
        recoveryGrant: completed.recoveryGrant ?? "missing",
        now: new Date(now.getTime() + 2_000),
      }),
    ).resolves.toBe(participantAccount.accountReference);
    await expect(
      fixture.service.consumeRecoveryGrant({
        trustDomain: "participant",
        recoveryGrant: completed.recoveryGrant ?? "missing",
        now: new Date(now.getTime() + 3_000),
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("requires human approval instead of issuing a committee recovery grant", async () => {
    const fixture = emailService({
      account: { ...participantAccount, trustDomain: "committee" },
    });
    await fixture.service.begin({
      kind: "account_recovery",
      trustDomain: "committee",
      email: "committee-synthetic@example.invalid",
      networkReference: "network:synthetic",
      now,
      lifetimeMs: 600_000,
    });
    const completed = await fixture.service.completeRecovery({
      trustDomain: "committee",
      token: fixture.notifications.values[0]?.secret ?? "missing",
      now: new Date(now.getTime() + 1_000),
      grantLifetimeMs: 300_000,
      policyVersionReference: "policy:recovery:draft-test-v1",
      softwareVersion: "test",
      correlationId: "correlation:recovery-2",
    });
    expect(completed).toMatchObject({ committeeReviewRequired: true, recoveryGrant: null });
  });

  it("keeps tokens and contact values out of public errors", async () => {
    const fixture = emailService({ account: participantAccount });
    const token = "sensitive-recovery-token";
    let message = "";
    try {
      await fixture.service.completeRecovery({
        trustDomain: "participant",
        token,
        now,
        grantLifetimeMs: 300_000,
        policyVersionReference: "policy:recovery:draft-test-v1",
        softwareVersion: "test",
        correlationId: "correlation:recovery-3",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(token);
    expect(message).not.toContain("synthetic@example.invalid");
  });
});

class MemoryAccountSecurity implements AccountSecurityStore {
  readonly changes: { destination: string; lookupDigest: string }[] = [];
  readonly locks: string[] = [];

  async lockAndRevokeSessions(input: {
    readonly accountReference: string;
    readonly reasonCategory: string;
  }): Promise<number> {
    this.locks.push(`${input.accountReference}:${input.reasonCategory}`);
    return 2;
  }

  async changeVerifiedEmail(input: {
    readonly newDestinationReference: string;
    readonly newLookupDigest: string;
  }): Promise<{
    readonly oldDestinationReferences: readonly string[];
    readonly revokedSessions: number;
  }> {
    this.changes.push({
      destination: input.newDestinationReference,
      lookupDigest: input.newLookupDigest,
    });
    return { oldDestinationReferences: ["contact:vault:old"], revokedSessions: 2 };
  }
}

const securityContext: SecurityMutationContext = {
  actorReference: "acct:synthetic-participant",
  authenticationStrength: "passkey",
  policyVersionReference: "policy:security:draft-test-v1",
  softwareVersion: "test",
  correlationId: "correlation:security-1",
};

describe("account compromise controls", () => {
  it("requires reauthentication and confirmation before changing verified email", async () => {
    const store = new MemoryAccountSecurity();
    const challenges = new MemoryChallengeStore();
    const notifications = new MemoryNotifications();
    const service = new AccountSecurityService(
      store,
      challenges,
      notifications,
      { participant: participantConfig.sessionSecret, committee: committeeConfig.sessionSecret },
      randomUUID,
    );
    const request = {
      accountReference: "acct:synthetic-participant",
      trustDomain: "participant" as const,
      newEmail: "changed-synthetic@example.invalid",
      newDestinationReference: "contact:vault:new",
      now,
      lifetimeMs: 300_000,
    };
    await expect(
      service.beginEmailChange({ ...request, recentlyReauthenticated: false }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await service.beginEmailChange({ ...request, recentlyReauthenticated: true });
    const token = notifications.values[0]?.secret ?? "missing";
    await service.confirmEmailChange({
      trustDomain: "participant",
      token,
      context: securityContext,
      now: new Date(now.getTime() + 1_000),
    });
    expect(store.changes).toHaveLength(1);
    expect(store.changes[0]?.destination).toBe("contact:vault:new");
    expect(store.changes[0]?.lookupDigest).toBe(
      normalizeEmailForLookup(request.newEmail, participantConfig.sessionSecret),
    );
    expect(notifications.values.filter(({ kind }) => kind === "email_changed")).toHaveLength(2);
    await expect(
      service.confirmEmailChange({
        trustDomain: "participant",
        token,
        context: securityContext,
        now: new Date(now.getTime() + 2_000),
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("locks an account, revokes its sessions, and sends a security notification", async () => {
    const store = new MemoryAccountSecurity();
    const notifications = new MemoryNotifications();
    const service = new AccountSecurityService(
      store,
      new MemoryChallengeStore(),
      notifications,
      { participant: participantConfig.sessionSecret, committee: committeeConfig.sessionSecret },
      randomUUID,
    );
    await expect(
      service.lockAccount({
        accountReference: "acct:synthetic-participant",
        trustDomain: "participant",
        destinationReference: "contact:vault:old",
        reasonCategory: "suspected_compromise",
        context: securityContext,
        now,
      }),
    ).resolves.toBe(2);
    expect(store.locks).toEqual(["acct:synthetic-participant:suspected_compromise"]);
    expect(notifications.values[0]?.kind).toBe("account_locked");
  });
});

class MemoryPasskeys implements PasskeyRepository {
  readonly records = new Map<string, StoredPasskeyCredential>();
  async listActive(accountReference: string, trustDomain: TrustDomain) {
    return [...this.records.values()].filter(
      (value) =>
        value.accountReference === accountReference &&
        value.trustDomain === trustDomain &&
        value.state === "active",
    );
  }
  async findActive(credentialReference: string, trustDomain: TrustDomain) {
    const value = this.records.get(credentialReference);
    return value?.trustDomain === trustDomain && value.state === "active" ? value : null;
  }
  async save(credential: StoredPasskeyCredential): Promise<void> {
    this.records.set(credential.credentialReference, credential);
  }
  async updateUsage(input: {
    readonly credentialReference: string;
    readonly counter: number;
    readonly deviceType: "singleDevice" | "multiDevice";
    readonly backedUp: boolean;
  }): Promise<void> {
    const value = this.records.get(input.credentialReference);
    if (value) this.records.set(input.credentialReference, { ...value, ...input });
  }
  async revokeCredential(credentialReference: string): Promise<void> {
    const value = this.records.get(credentialReference);
    if (value) this.records.set(credentialReference, { ...value, state: "revoked" });
  }
}

const registrationOptions = {
  challenge: "registration-challenge",
  rp: { id: "app.example.test", name: "Checks & Balances" },
  user: { id: "dXNlcg", name: "acct:synthetic", displayName: "" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
  timeout: 60_000,
  attestation: "none",
  excludeCredentials: [],
  authenticatorSelection: { userVerification: "required" },
} as PublicKeyCredentialCreationOptionsJSON;

const authenticationOptions = {
  challenge: "authentication-challenge",
  rpId: "app.example.test",
  timeout: 60_000,
  userVerification: "required",
} as PublicKeyCredentialRequestOptionsJSON;

const fakeWebAuthn: WebAuthnAdapter = {
  generateRegistrationOptions: async () => registrationOptions,
  generateAuthenticationOptions: async () => authenticationOptions,
  verifyRegistrationResponse: async () =>
    ({
      verified: true,
      registrationInfo: {
        fmt: "none",
        aaguid: "00000000-0000-0000-0000-000000000000",
        credential: {
          id: "credential-synthetic",
          publicKey: Uint8Array.from([1, 2, 3]),
          counter: 0,
          transports: ["internal"],
        },
        credentialType: "public-key",
        attestationObject: Uint8Array.from([]),
        userVerified: true,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        origin: participantConfig.origin,
        rpID: participantConfig.relyingPartyId,
      },
    }) as VerifiedRegistrationResponse,
  verifyAuthenticationResponse: async () =>
    ({
      verified: true,
      authenticationInfo: {
        credentialID: "credential-synthetic",
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        origin: participantConfig.origin,
        rpID: participantConfig.relyingPartyId,
      },
    }) as VerifiedAuthenticationResponse,
};

describe("passkey ceremonies", () => {
  it("uses user verification, one-time challenges, and counter updates", async () => {
    const repository = new MemoryPasskeys();
    const challenges = new MemoryChallengeStore();
    const service = new PasskeyService(
      repository,
      challenges,
      {
        participant: {
          relyingPartyName: "Checks & Balances participant",
          relyingPartyId: participantConfig.relyingPartyId,
          origin: participantConfig.origin,
          challengeSecret: participantConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
        committee: {
          relyingPartyName: "Checks & Balances committee",
          relyingPartyId: committeeConfig.relyingPartyId,
          origin: committeeConfig.origin,
          challengeSecret: committeeConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
      },
      randomUUID,
      fakeWebAuthn,
    );
    const registration = await service.beginRegistration({
      accountReference: "acct:synthetic",
      trustDomain: "participant",
      authorizedBy: "initial_verified_email",
      now,
    });
    expect(registration.options.authenticatorSelection?.userVerification).toBe("required");
    await service.finishRegistration({
      trustDomain: "participant",
      challengeReference: registration.challengeReference,
      response: { response: { transports: ["internal"] } } as unknown as RegistrationResponseJSON,
      deviceLabel: "Synthetic passkey",
      now: new Date(now.getTime() + 1_000),
    });
    await expect(
      service.finishRegistration({
        trustDomain: "participant",
        challengeReference: registration.challengeReference,
        response: {} as RegistrationResponseJSON,
        deviceLabel: "Synthetic passkey",
        now: new Date(now.getTime() + 2_000),
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_REPLAYED" });
    await expect(
      service.beginRegistration({
        accountReference: "acct:synthetic",
        trustDomain: "participant",
        authorizedBy: "initial_verified_email",
        now: new Date(now.getTime() + 3_000),
      }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });

    const authentication = await service.beginAuthentication({ trustDomain: "participant", now });
    expect(authentication.options.userVerification).toBe("required");
    await expect(
      service.finishAuthentication({
        trustDomain: "participant",
        challengeReference: authentication.challengeReference,
        response: { id: "credential-synthetic" } as AuthenticationResponseJSON,
        now: new Date(now.getTime() + 1_000),
      }),
    ).resolves.toMatchObject({ accountReference: "acct:synthetic" });
    expect(repository.records.get("credential-synthetic")?.counter).toBe(1);
  });

  it("does not allow email alone to enroll a committee passkey", async () => {
    const service = new PasskeyService(
      new MemoryPasskeys(),
      new MemoryChallengeStore(),
      {
        participant: {
          relyingPartyName: "Participant",
          relyingPartyId: participantConfig.relyingPartyId,
          origin: participantConfig.origin,
          challengeSecret: participantConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
        committee: {
          relyingPartyName: "Committee",
          relyingPartyId: committeeConfig.relyingPartyId,
          origin: committeeConfig.origin,
          challengeSecret: committeeConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
      },
      randomUUID,
      fakeWebAuthn,
    );
    await expect(
      service.beginRegistration({
        accountReference: "acct:committee",
        trustDomain: "committee",
        authorizedBy: "initial_verified_email",
        now,
      }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await expect(
      service.beginRegistration({
        accountReference: "acct:committee",
        trustDomain: "committee",
        authorizedBy: "approved_invitation",
        now,
      }),
    ).resolves.toMatchObject({ options: registrationOptions });
  });

  it("requires recent authentication and a safe alternate before removing a passkey", async () => {
    const repository = new MemoryPasskeys();
    repository.records.set("credential-synthetic", {
      credentialReference: "credential-synthetic",
      accountReference: "acct:synthetic",
      trustDomain: "participant",
      relyingPartyId: participantConfig.relyingPartyId,
      publicKey: Uint8Array.from([1, 2, 3]),
      counter: 1,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
      deviceLabel: "Synthetic passkey",
      state: "active",
    });
    const service = new PasskeyService(
      repository,
      new MemoryChallengeStore(),
      {
        participant: {
          relyingPartyName: "Participant",
          relyingPartyId: participantConfig.relyingPartyId,
          origin: participantConfig.origin,
          challengeSecret: participantConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
        committee: {
          relyingPartyName: "Committee",
          relyingPartyId: committeeConfig.relyingPartyId,
          origin: committeeConfig.origin,
          challengeSecret: committeeConfig.sessionSecret,
          challengeLifetimeMs: 300_000,
        },
      },
      randomUUID,
      fakeWebAuthn,
    );
    const request = {
      credentialReference: "credential-synthetic",
      accountReference: "acct:synthetic",
      trustDomain: "participant" as const,
      now,
    };
    await expect(
      service.revokeCredential({
        ...request,
        recentlyReauthenticated: false,
        alternateRecoveryAvailable: true,
      }),
    ).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await expect(
      service.revokeCredential({
        ...request,
        recentlyReauthenticated: true,
        alternateRecoveryAvailable: false,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      service.revokeCredential({
        ...request,
        recentlyReauthenticated: true,
        alternateRecoveryAvailable: true,
      }),
    ).resolves.toBeUndefined();
    expect(repository.records.get("credential-synthetic")?.state).toBe("revoked");
  });
});
