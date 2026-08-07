export type AuthErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_DENIED"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_REPLAYED"
  | "CONSENT_INVALID"
  | "ORIGIN_REJECTED"
  | "POLICY_REQUIRED"
  | "RATE_LIMITED"
  | "REAUTHENTICATION_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED";

const publicMessages: Readonly<Record<AuthErrorCode, string>> = Object.freeze({
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  AUTHENTICATION_FAILED: "The authentication attempt could not be completed.",
  AUTHORIZATION_DENIED: "This action is not permitted.",
  CHALLENGE_EXPIRED: "The authentication request expired. Start again.",
  CHALLENGE_REPLAYED: "The authentication request is no longer available. Start again.",
  CONSENT_INVALID: "A separate, explicit choice is required.",
  ORIGIN_REJECTED: "The request origin was rejected.",
  POLICY_REQUIRED: "A current required policy must be acknowledged.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  REAUTHENTICATION_REQUIRED: "Confirm your identity again to continue.",
  SESSION_EXPIRED: "The session expired. Sign in again.",
  SESSION_REVOKED: "The session is no longer active. Sign in again.",
});

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(publicMessages[code]);
    this.name = "AuthError";
  }
}
