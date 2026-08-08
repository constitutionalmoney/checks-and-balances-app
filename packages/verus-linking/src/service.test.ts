import { createHash } from "node:crypto";

import { RateLimiter, type RateLimitStore } from "@cbc/auth";
import {
  type CompleteWalletLinkChallengeInput,
  type CreateWalletLinkChallengeInput,
  type WalletLinkChallengeRecord,
  type WalletLinkPollResult,
} from "@cbc/db";
import {
  FakeVerusRpcAdapter,
  VRSCTEST_CHAIN_ID,
  syntheticVerusInfo,
  type VerusRpcAdapter,
} from "@cbc/verus";
import { describe, expect, it } from "vitest";

import type {
  CreateHostedChallengeInput,
  GetHostedResultInput,
  HostedChallenge,
  HostedResult,
  HostedVerusIdAuthClient,
} from "./hosted-auth-client.js";
import {
  WalletLinkError,
  WalletLinkService,
  type WalletLinkServiceConfig,
  type WalletLinkStore,
} from "./service.js";

const NOW = new Date(1_800_000_000 * 1_000);
const ACCOUNT = "auth_account_synthetic_participant_0001";
const OTHER_ACCOUNT = "auth_account_synthetic_participant_0002";
const APPLICATION_IDENTITY = "iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm";
const CALLBACK_URL = "https://auth.checksandbalances.services/verusidlogin";
const CONFIG: WalletLinkServiceConfig = {
  enabled: true,
  network: "VRSCTEST",
  applicationIdentityAddress: APPLICATION_IDENTITY,
  authServiceCallbackUrl: CALLBACK_URL,
  participantAudience: "cbc-participant-app",
  committeeAudience: "cbc-committee-console",
  bindingSecret: "binding-secret-with-at-least-thirty-two-bytes",
  pollingTokenSecret: "polling-secret-with-at-least-thirty-two-bytes",
};

describe("optional hosted VerusID linking service", () => {
  it("fails closed when the feature is disabled or the network is not VRSCTEST", async () => {
    const store = new MemoryWalletLinkStore();
    await expect(service(store, { enabled: false }).begin(beginInput())).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(service(store, { network: "FAKE" }).begin(beginInput())).rejects.toMatchObject({
      code: "MAINNET_BLOCKED",
    });
  });

  it("presents the exact hosted deep link and stores only its digest", async () => {
    const store = new MemoryWalletLinkStore();
    const hosted = new FakeHostedAuth();
    const presentation = await service(store, {}, new FakeVerusRpcAdapter(), hosted).begin(
      beginInput(),
    );

    expect(presentation.sameDeviceUrl).toBe(hosted.deepLink);
    expect(presentation.qrPayload).toBe(hosted.deepLink);
    expect(presentation.qrPayload).not.toContain(presentation.pollingToken);
    expect(presentation.operational).toBe(false);
    expect(store.rawPollingTokens()).not.toContain(presentation.pollingToken);
    expect(
      JSON.stringify(await store.challengeForPoll(ACCOUNT, store.rawPollingTokens()[0]!)),
    ).not.toContain(hosted.deepLink);
  });

  it("claims a hosted result, independently reads identity state, and consumes locally once", async () => {
    const store = new MemoryWalletLinkStore();
    const hosted = new FakeHostedAuth();
    const linking = service(store, {}, new FakeVerusRpcAdapter(), hosted);
    const presentation = await linking.begin(beginInput());

    await expect(
      linking.poll({
        principal: principal(),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 30_000),
        correlationId: "correlation_poll_000000000001",
      }),
    ).resolves.toMatchObject({
      state: "consumed",
      identityAddress: VRSCTEST_CHAIN_ID,
    });
    await expect(
      linking.poll({
        principal: principal(),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 31_000),
        correlationId: "correlation_poll_000000000002",
      }),
    ).resolves.toMatchObject({ state: "consumed" });
    expect(hosted.resultCalls).toBe(1);
    expect(hosted.acknowledgementCalls).toBe(1);
  });

  it("keeps a pending hosted result account-bound", async () => {
    const store = new MemoryWalletLinkStore();
    const hosted = new FakeHostedAuth();
    hosted.pending = true;
    const linking = service(store, {}, new FakeVerusRpcAdapter(), hosted);
    const presentation = await linking.begin(beginInput());

    await expect(
      linking.poll({
        principal: principal(),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 1_000),
        correlationId: "correlation_poll_pending_00001",
      }),
    ).resolves.toMatchObject({ state: "presented" });
    await expect(
      linking.poll({
        principal: principal(OTHER_ACCOUNT),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 1_000),
        correlationId: "correlation_poll_cross_account_01",
      }),
    ).rejects.toThrow("wallet challenge is unavailable");
  });

  it("rejects a stale or wrong-network identity after hosted verification", async () => {
    const hosted = new FakeHostedAuth();
    const wrongChain = new FakeVerusRpcAdapter({
      info: syntheticVerusInfo({ chainId: "iWrongChainIdentity111111111111111" }),
    });
    const linking = service(new MemoryWalletLinkStore(), {}, wrongChain, hosted);
    const presentation = await linking.begin(beginInput());

    await expect(
      linking.poll({
        principal: principal(),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 30_000),
        correlationId: "correlation_poll_wrong_chain_001",
      }),
    ).rejects.toMatchObject({ code: "WRONG_NETWORK" });
  });

  it("cancels locally without affecting the baseline account", async () => {
    const store = new MemoryWalletLinkStore();
    const linking = service(store);
    const presentation = await linking.begin(beginInput());
    await linking.cancel({
      principal: principal(),
      challengeReference: presentation.challengeReference,
      now: new Date(NOW.getTime() + 10_000),
      correlationId: "correlation_cancel_00000000001",
    });
    await expect(
      linking.poll({
        principal: principal(),
        pollingToken: presentation.pollingToken,
        now: new Date(NOW.getTime() + 11_000),
        correlationId: "correlation_poll_cancelled_001",
      }),
    ).resolves.toMatchObject({ state: "cancelled" });
  });

  it("rejects unsupported scopes before calling the hosted service", async () => {
    const hosted = new FakeHostedAuth();
    await expect(
      service(new MemoryWalletLinkStore(), {}, new FakeVerusRpcAdapter(), hosted).begin({
        ...beginInput(),
        scopes: ["verusid:role"],
      }),
    ).rejects.toBeInstanceOf(WalletLinkError);
    expect(hosted.challengeCalls).toBe(0);
  });
});

function service(
  store: WalletLinkStore,
  config: Partial<WalletLinkServiceConfig> = {},
  adapter: VerusRpcAdapter = new FakeVerusRpcAdapter(),
  hosted: HostedVerusIdAuthClient = new FakeHostedAuth(),
): WalletLinkService {
  return new WalletLinkService(
    { ...CONFIG, ...config },
    store,
    hosted,
    adapter,
    new RateLimiter(new MemoryRateLimitStore(), "rate-limit-secret-with-at-least-thirty-two-bytes"),
  );
}

function principal(accountReference = ACCOUNT) {
  return {
    accountReference,
    trustDomain: "participant" as const,
    authenticationStrength: "passkey",
  };
}

function beginInput() {
  return {
    principal: principal(),
    scopes: ["verusid:link"],
    now: NOW,
    correlationId: "correlation_begin_000000000001",
  };
}

class FakeHostedAuth implements HostedVerusIdAuthClient {
  readonly deepLink = "i5jtwbp6zymeay9llnraglgjqgdrffsau4://x-callback-url/synthetic-request";
  challengeCalls = 0;
  resultCalls = 0;
  acknowledgementCalls = 0;
  pending = false;
  private input?: CreateHostedChallengeInput;

  async createChallenge(input: CreateHostedChallengeInput): Promise<HostedChallenge> {
    this.challengeCalls += 1;
    this.input = input;
    return {
      challengeId: "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq",
      deepLink: this.deepLink,
      presentationDigest: digest(this.deepLink),
      signerIdentityAddress: APPLICATION_IDENTITY,
      callbackUrl: CALLBACK_URL,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    };
  }

  async getResult(input: GetHostedResultInput): Promise<HostedResult> {
    this.resultCalls += 1;
    if (!this.input || input.state !== this.input.state) throw new Error("state mismatch");
    if (this.pending) return { kind: "pending" };
    return {
      kind: "verified",
      identityAddress: VRSCTEST_CHAIN_ID,
      displayNameSnapshot: "IgnoredRemoteRoleAndName@",
      proofDigest: "a".repeat(64),
      tokenIssuedAt: new Date(NOW.getTime() + 1_000),
      tokenExpiresAt: new Date(NOW.getTime() + 60_000),
    };
  }

  async acknowledgeResult(): Promise<void> {
    this.acknowledgementCalls += 1;
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

interface StoredChallenge {
  record: WalletLinkChallengeRecord;
  readonly pollingTokenDigest: string;
  linkReference?: string;
}

class MemoryWalletLinkStore implements WalletLinkStore {
  private readonly challenges = new Map<string, StoredChallenge>();

  async createChallenge(input: CreateWalletLinkChallengeInput): Promise<WalletLinkChallengeRecord> {
    const record: WalletLinkChallengeRecord = {
      externalReference: input.externalReference,
      accountReference: input.accountReference,
      trustDomain: input.trustDomain,
      purpose: input.purpose,
      state: "presented",
      network: input.network,
      nonceHash: input.nonceHash,
      requestId: input.requestId,
      requestDigest: input.requestDigest,
      audience: input.audience,
      callbackUrl: input.callbackUrl,
      applicationIdentityAddress: input.applicationIdentityAddress,
      consentedScopes: [...input.consentedScopes],
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      version: 0,
    };
    this.challenges.set(input.requestId, { record, pollingTokenDigest: input.pollingTokenDigest });
    return record;
  }

  async challengeForPoll(
    accountReference: string,
    pollingTokenDigest: string,
  ): Promise<WalletLinkChallengeRecord> {
    const stored = this.find(accountReference, pollingTokenDigest);
    if (!stored) throw new Error("wallet challenge is unavailable");
    return stored.record;
  }

  async completeChallenge(input: CompleteWalletLinkChallengeInput) {
    const stored = this.challenges.get(input.requestId);
    if (!stored) throw new Error("wallet challenge is unavailable");
    if (stored.record.state === "consumed") {
      return {
        kind: "completed" as const,
        replayed: true,
        linkReference: stored.linkReference!,
        identityAddress: input.identityAddress,
        state: "active" as const,
      };
    }
    if (input.completedAt >= stored.record.expiresAt) return { kind: "expired" as const };
    stored.linkReference = "verus_link_synthetic_000000000001";
    stored.record = {
      ...stored.record,
      state: "consumed",
      responseDigest: input.responseDigest,
      linkedIdentityAddress: input.identityAddress,
      version: stored.record.version + 1,
    };
    return {
      kind: "completed" as const,
      replayed: false,
      linkReference: stored.linkReference,
      identityAddress: input.identityAddress,
      state: "active" as const,
    };
  }

  async pollChallenge(
    accountReference: string,
    pollingTokenDigest: string,
    now: Date,
  ): Promise<WalletLinkPollResult> {
    const stored = this.find(accountReference, pollingTokenDigest);
    if (!stored) throw new Error("wallet challenge is unavailable");
    if (stored.record.state === "presented" && now >= stored.record.expiresAt) {
      stored.record = { ...stored.record, state: "expired", version: stored.record.version + 1 };
    }
    return {
      challengeReference: stored.record.externalReference,
      state: stored.record.state,
      expiresAt: stored.record.expiresAt,
      ...(stored.linkReference ? { linkReference: stored.linkReference } : {}),
      ...(stored.record.linkedIdentityAddress
        ? { identityAddress: stored.record.linkedIdentityAddress }
        : {}),
    };
  }

  async cancelChallenge(accountReference: string, challengeReference: string): Promise<void> {
    const stored = [...this.challenges.values()].find(
      (candidate) =>
        candidate.record.accountReference === accountReference &&
        candidate.record.externalReference === challengeReference,
    );
    if (!stored || stored.record.state !== "presented") {
      throw new Error("wallet challenge is unavailable");
    }
    stored.record = { ...stored.record, state: "cancelled", version: stored.record.version + 1 };
  }

  async unlink(): Promise<void> {}

  rawPollingTokens(): readonly string[] {
    return [...this.challenges.values()].map((stored) => stored.pollingTokenDigest);
  }

  private find(accountReference: string, pollingTokenDigest: string): StoredChallenge | undefined {
    return [...this.challenges.values()].find(
      (candidate) =>
        candidate.record.accountReference === accountReference &&
        candidate.pollingTokenDigest === pollingTokenDigest,
    );
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
