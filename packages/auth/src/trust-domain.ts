import { AuthError } from "./errors.js";

export const SESSION_AUDIENCES = Object.freeze({
  participant: "cbc-participant-app",
  committee: "cbc-committee-console",
} as const);

export type TrustDomain = keyof typeof SESSION_AUDIENCES;
export type AuthenticationStrength = "verified_email" | "passkey" | "recovery";

export interface TrustDomainConfig {
  readonly domain: TrustDomain;
  readonly audience: string;
  readonly cookieName: `__Host-${string}`;
  readonly origin: string;
  readonly relyingPartyId: string;
  readonly sessionSecret: string;
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  readonly privilegedReauthenticationMs: number;
  readonly sameSite: "Lax" | "Strict";
}

export function validateTrustDomains(
  participant: TrustDomainConfig,
  committee: TrustDomainConfig,
): void {
  if (
    participant.domain !== "participant" ||
    committee.domain !== "committee" ||
    participant.audience === committee.audience ||
    participant.cookieName === committee.cookieName ||
    participant.sessionSecret === committee.sessionSecret ||
    participant.origin === committee.origin
  ) {
    throw new AuthError("AUTHORIZATION_DENIED");
  }
  for (const config of [participant, committee]) {
    const origin = new URL(config.origin);
    const secureLocalhost =
      origin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
    if (
      !config.cookieName.startsWith("__Host-") ||
      config.sessionSecret.length < 32 ||
      (origin.protocol !== "https:" && !secureLocalhost)
    ) {
      throw new AuthError("AUTHORIZATION_DENIED");
    }
  }
}

export function sessionCookie(
  config: TrustDomainConfig,
  token: string,
  maxAgeSeconds: number,
): string {
  return `${config.cookieName}=${token}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Secure; HttpOnly; SameSite=${config.sameSite}`;
}

export function expiredSessionCookie(config: TrustDomainConfig): string {
  return `${config.cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=${config.sameSite}`;
}
