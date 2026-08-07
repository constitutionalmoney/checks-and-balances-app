# `@cbc/auth`

Owner: `@constitutionalmoney`

Issue #17 implements the application authentication and authorization core independently of
VerusID. The package provides:

- distinct participant and committee trust-domain configuration;
- host-only hardened cookie serialization, opaque sessions, rotation, CSRF/origin checks, device
  inventory, revocation, idle expiry, and absolute expiry;
- WebAuthn/passkey registration and authentication through `@simplewebauthn/server`, with user
  verification, one-time hashed challenges, origin/RP validation, and counter persistence;
- enumeration-safe verified-email fallback and recovery contracts, durable rate-limit interfaces,
  stolen-session revocation, and mandatory human review for committee recovery;
- deny-by-default participant/role/tenant/session/conflict/auth-strength/feature/policy/state checks;
- distinct capabilities for scheduler, reviewer, signer, administrator, privacy, security,
  support, steward, and relying-party actors;
- recent strong re-authentication and four-eyes approval for specified privileged actions; and
- exact versioned consent presentations and explicit accept/decline/withdraw choices.

`@cbc/auth` never treats an account, passkey, email, or optional VerusID link as proof of human. It
contains no Verus flow, committee quorum, evidence policy, document upload, or mainnet support.
Raw session, challenge, recovery, and contact values must not be logged. Persistence adapters store
keyed digests and opaque destination references only.

The service/API and accessible user interfaces that call this package are later vertical slices.
Until those issues are complete and the policy/legal gate is approved, this is synthetic,
non-operational engineering infrastructure.
