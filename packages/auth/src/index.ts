export { AuthError, type AuthErrorCode } from "./errors.js";
export {
  AccountSecurityService,
  type AccountSecurityStore,
  type SecurityMutationContext,
} from "./account-security.js";
export {
  authorize,
  AUTHORIZATION_ACTIONS,
  AUTHORIZATION_ROLES,
  requireAuthorization,
  type AuthorizationAction,
  type AuthorizationDecision,
  type AuthorizationDenial,
  type AuthorizationRequest,
  type AuthorizationRole,
  type CurrentPolicyGate,
  type FourEyesApproval,
} from "./authorization.js";
export {
  digestMatches,
  generateOpaqueToken,
  keyedDigest,
  normalizeEmailForLookup,
} from "./crypto.js";
export {
  CONSENT_PURPOSES,
  OPTIONAL_CONSENT_PURPOSES,
  recordConsentChoice,
  requireCurrentPolicyReceipts,
  type ConsentAction,
  type ConsentChoice,
  type ConsentPresentation,
  type ConsentPurpose,
  type RequiredPolicy,
  type VersionedConsentReceipt,
} from "./consent.js";
export {
  SessionService,
  type IssuedSession,
  type SessionIdentifierFactory,
  type SessionRecord,
  type SessionStore,
} from "./session.js";
export {
  type AuthChallengeKind,
  type AuthChallengeRecord,
  type AuthChallengeStore,
  type ConsumedAuthChallenge,
} from "./challenge.js";
export {
  EmailRecoveryService,
  type GenericChallengeResponse,
  type RecoveryAccountStore,
  type SecurityNotification,
  type SecurityNotificationSink,
  type VerifiedEmailAccount,
  type VerifiedEmailDirectory,
} from "./email-recovery.js";
export { RateLimiter, type RateLimitStore } from "./rate-limit.js";
export {
  PasskeyService,
  type PasskeyAuthenticationStart,
  type PasskeyDomainConfig,
  type PasskeyRegistrationStart,
  type PasskeyRepository,
  type StoredPasskeyCredential,
  type WebAuthnAdapter,
} from "./passkey.js";
export {
  expiredSessionCookie,
  SESSION_AUDIENCES,
  sessionCookie,
  validateTrustDomains,
  type AuthenticationStrength,
  type TrustDomain,
  type TrustDomainConfig,
} from "./trust-domain.js";
