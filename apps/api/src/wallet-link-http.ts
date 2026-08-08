import {
  AuthError,
  RateLimiter,
  SessionService,
  type SessionRecord,
  type TrustDomain,
  type TrustDomainConfig,
} from "@cbc/auth";
import type { RuntimeConfig } from "@cbc/config";
import { AuthRepository, Pool, VerusLinkRepository } from "@cbc/db";
import { HttpVerusRpcAdapter } from "@cbc/verus";
import {
  HostedVerusIdAuthHttpClient,
  WalletLinkError,
  WalletLinkService,
  type WalletLinkPresentation,
  type WalletLinkPrincipal,
} from "@cbc/verus-linking";

export interface RequestAuthentication {
  readonly method: string;
  readonly cookieHeader?: string;
  readonly origin?: string;
  readonly csrfToken?: string;
}

export interface WalletLinkHttpFacade {
  begin(input: {
    readonly authentication: RequestAuthentication;
    readonly consented: boolean;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<WalletLinkPresentation>;
  poll(input: {
    readonly authentication: RequestAuthentication;
    readonly pollingToken: string | undefined;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<{
    readonly challengeReference: string;
    readonly state: string;
    readonly expiresAt: string;
    readonly linkReference?: string;
    readonly identityAddress?: string;
  }>;
  cancel(input: {
    readonly authentication: RequestAuthentication;
    readonly challengeReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void>;
  unlink(input: {
    readonly authentication: RequestAuthentication;
    readonly linkReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void>;
  close(): Promise<void>;
}

export function createWalletLinkHttpFacade(config: RuntimeConfig): WalletLinkHttpFacade {
  if (!config.CBC_VERUS_LINKING_ENABLED) return new DisabledWalletLinkHttpFacade();

  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 8 });
  const trustDomains = createTrustDomains(config);
  const authRepository = new AuthRepository(pool, {
    participant: config.CBC_PARTICIPANT_SESSION_KEY_VERSION,
    committee: config.CBC_COMMITTEE_SESSION_KEY_VERSION,
  });
  const sessions = new SessionService(authRepository, trustDomains, () => "unused_wallet_link_id");
  const rpc = new HttpVerusRpcAdapter({
    url: config.CBC_VERUS_RPC_URL,
    ...(config.CBC_VERUS_RPC_USER ? { username: config.CBC_VERUS_RPC_USER } : {}),
    ...(config.CBC_VERUS_RPC_PASSWORD ? { password: config.CBC_VERUS_RPC_PASSWORD } : {}),
  });
  const hostedAuth = new HostedVerusIdAuthHttpClient({
    baseUrl: config.CBC_VERUS_AUTH_URL!,
    contractVersion: "cbc-verusid-auth.v1",
    serviceVersion: config.CBC_VERUS_AUTH_SERVICE_VERSION!,
    serviceSourceRevision: config.CBC_VERUS_AUTH_SOURCE_REVISION!,
    imageDigest: config.CBC_VERUS_AUTH_IMAGE_DIGEST!,
    sdkCommit: config.CBC_VERUS_AUTH_SDK_COMMIT!,
    primitivesCommit: config.CBC_VERUS_AUTH_PRIMITIVES_COMMIT!,
    rpcClientCommit: config.CBC_VERUS_AUTH_RPC_CLIENT_COMMIT!,
    bitgoCommit: config.CBC_VERUS_AUTH_BITGO_COMMIT!,
    daemonVersion: config.CBC_VERUS_AUTH_DAEMON_VERSION!,
    applicationIdentityAddress: config.CBC_VERUS_LINK_APPLICATION_IDENTITY!,
    callbackUrl: config.CBC_VERUS_AUTH_CALLBACK_URL!,
    issuer: config.CBC_VERUS_AUTH_ISSUER!,
    clientSecret: config.CBC_VERUS_AUTH_CLIENT_SECRET!,
    jwtSecret: config.CBC_VERUS_AUTH_JWT_SECRET!,
  });
  const linking = new WalletLinkService(
    {
      enabled: true,
      network: "VRSCTEST",
      applicationIdentityAddress: config.CBC_VERUS_LINK_APPLICATION_IDENTITY!,
      authServiceCallbackUrl: config.CBC_VERUS_AUTH_CALLBACK_URL!,
      participantAudience: config.CBC_PARTICIPANT_SESSION_AUDIENCE,
      committeeAudience: config.CBC_COMMITTEE_SESSION_AUDIENCE,
      bindingSecret: config.CBC_VERUS_LINK_BINDING_SECRET!,
      pollingTokenSecret: config.CBC_VERUS_LINK_POLLING_SECRET!,
    },
    new VerusLinkRepository(pool),
    hostedAuth,
    rpc,
    new RateLimiter(authRepository, config.CBC_RATE_LIMIT_SECRET),
  );
  return new AuthenticatedWalletLinkHttpFacade(pool, sessions, trustDomains, linking);
}

class AuthenticatedWalletLinkHttpFacade implements WalletLinkHttpFacade {
  constructor(
    private readonly pool: Pool,
    private readonly sessions: SessionService,
    private readonly trustDomains: Readonly<Record<TrustDomain, TrustDomainConfig>>,
    private readonly linking: WalletLinkService,
  ) {}

  async begin(input: {
    readonly authentication: RequestAuthentication;
    readonly consented: boolean;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<WalletLinkPresentation> {
    if (!input.consented) throw new WalletLinkError("INVALID_REQUEST");
    const principal = await this.authenticate(input.authentication, input.now);
    return this.linking.begin({
      principal,
      scopes: ["verusid:link"],
      now: input.now,
      correlationId: input.correlationId,
    });
  }

  async poll(input: {
    readonly authentication: RequestAuthentication;
    readonly pollingToken: string | undefined;
    readonly now: Date;
    readonly correlationId: string;
  }) {
    if (!input.pollingToken) throw new WalletLinkError("CHALLENGE_UNAVAILABLE");
    const principal = await this.authenticate(input.authentication, input.now);
    const result = await this.linking.poll({
      principal,
      pollingToken: input.pollingToken,
      now: input.now,
      correlationId: input.correlationId,
    });
    return {
      ...result,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  async unlink(input: {
    readonly authentication: RequestAuthentication;
    readonly linkReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void> {
    const principal = await this.authenticate(input.authentication, input.now);
    await this.linking.unlink({
      principal,
      linkReference: input.linkReference,
      now: input.now,
      correlationId: input.correlationId,
    });
  }

  async cancel(input: {
    readonly authentication: RequestAuthentication;
    readonly challengeReference: string;
    readonly now: Date;
    readonly correlationId: string;
  }): Promise<void> {
    const principal = await this.authenticate(input.authentication, input.now);
    await this.linking.cancel({
      principal,
      challengeReference: input.challengeReference,
      now: input.now,
      correlationId: input.correlationId,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async authenticate(
    request: RequestAuthentication,
    now: Date,
  ): Promise<WalletLinkPrincipal> {
    const cookies = parseCookies(request.cookieHeader);
    const candidates = (Object.keys(this.trustDomains) as TrustDomain[])
      .map((domain) => ({
        domain,
        token: cookies.get(this.trustDomains[domain].cookieName),
      }))
      .filter((candidate): candidate is { domain: TrustDomain; token: string } =>
        Boolean(candidate.token),
      );
    if (candidates.length !== 1) throw new AuthError("AUTHENTICATION_REQUIRED");
    const candidate = candidates[0]!;
    const session = await this.sessions.authenticate({
      trustDomain: candidate.domain,
      token: candidate.token,
      now,
    });
    this.sessions.requireCsrf({
      session,
      method: request.method,
      origin: request.origin,
      csrfToken: request.csrfToken,
    });
    return principalFromSession(session);
  }
}

class DisabledWalletLinkHttpFacade implements WalletLinkHttpFacade {
  async begin(): Promise<never> {
    throw new WalletLinkError("FEATURE_DISABLED");
  }

  async poll(): Promise<never> {
    throw new WalletLinkError("FEATURE_DISABLED");
  }

  async unlink(): Promise<never> {
    throw new WalletLinkError("FEATURE_DISABLED");
  }

  async cancel(): Promise<never> {
    throw new WalletLinkError("FEATURE_DISABLED");
  }

  async close(): Promise<void> {}
}

function createTrustDomains(
  config: RuntimeConfig,
): Readonly<Record<TrustDomain, TrustDomainConfig>> {
  return Object.freeze({
    participant: {
      domain: "participant",
      audience: config.CBC_PARTICIPANT_SESSION_AUDIENCE,
      cookieName: "__Host-cbc-participant",
      origin: config.CBC_PARTICIPANT_ORIGIN,
      relyingPartyId: config.CBC_PARTICIPANT_RELYING_PARTY_ID,
      sessionSecret: config.CBC_PARTICIPANT_AUTH_SECRET,
      idleTimeoutMs: 30 * 60_000,
      absoluteTimeoutMs: 12 * 60 * 60_000,
      privilegedReauthenticationMs: 5 * 60_000,
      sameSite: "Lax",
    },
    committee: {
      domain: "committee",
      audience: config.CBC_COMMITTEE_SESSION_AUDIENCE,
      cookieName: "__Host-cbc-committee",
      origin: config.CBC_COMMITTEE_ORIGIN,
      relyingPartyId: config.CBC_COMMITTEE_RELYING_PARTY_ID,
      sessionSecret: config.CBC_COMMITTEE_AUTH_SECRET,
      idleTimeoutMs: 15 * 60_000,
      absoluteTimeoutMs: 60 * 60_000,
      privilegedReauthenticationMs: 5 * 60_000,
      sameSite: "Strict",
    },
  });
}

function parseCookies(header: string | undefined): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && value && !cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

function principalFromSession(session: SessionRecord): WalletLinkPrincipal {
  return {
    accountReference: session.accountReference,
    trustDomain: session.trustDomain,
    authenticationStrength: session.authenticationStrength,
  };
}
