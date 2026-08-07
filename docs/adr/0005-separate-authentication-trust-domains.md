# ADR 0005: Separate application authentication trust domains

- Status: Accepted for synthetic issue #17 implementation
- Date: 2026-08-06
- Issue: #17

## Context

Participant and committee accounts have different risk and authority. Optional VerusID linking is
not a baseline login requirement and cannot grant application roles. The privacy/legal package in
issue #12 is not yet approved for real participants, while issue #17 still needs reproducible
synthetic authentication, recovery, consent, and authorization behaviour.

WebAuthn verification is security-sensitive and should use a current reviewed implementation rather
than locally authored credential parsing or signature validation. Email fallback must work without
placing contact values, bearer tokens, or recovery secrets in logs or durable authentication rows.

## Decision

1. Use distinct participant and committee origins, WebAuthn relying-party IDs, audiences, cookie
   names, secret material, and key-version identifiers. Deployed configurations reject shared trust
   values. Localhost may share the WebAuthn RP ID only for local/CI development.
2. Use opaque random session tokens. Persist only keyed token/CSRF digests. Cookies use `__Host-`
   names, `Path=/`, `Secure`, `HttpOnly`, no `Domain`, and domain-appropriate `SameSite`.
3. Pin `@simplewebauthn/server` 13.3.2 (MIT) for WebAuthn option generation and response
   verification. Require user presence and verification, exact origin/RP ID, single-use challenges,
   and persisted credential counters/device metadata.
4. Allow verified email as a participant fallback and recovery channel. Use a keyed blind lookup
   and opaque delivery reference. Public initiation responses are uniform. Committee login remains
   passkey-only; committee recovery suspends access for independent human approval.
5. Rate-limit both network and account-derived opaque buckets in PostgreSQL. Consume challenges
   atomically. Account recovery atomically revokes active sessions, changes account state, and adds
   an append-only audit event.
6. Implement authorization as a deny-by-default decision over own-resource identity, role,
   committee tenant, active membership/committee, session assignment, conflict, authentication
   strength/recency, enabled feature, current policy receipt, domain state, and any required
   independent approval.
7. Keep scheduler, support, and security capabilities separate from verification approval and
   attestation mutation. A VerusID link is never an authorization input.
8. Preserve consent purpose, policy version, presentation reference/digest, explicit action, and
   presentation/action timestamps. Optional consent is individually presented and never
   preselected or bundled.

## Consequences

- Participant compromise cannot create a committee session or role through the auth package.
- A stolen session can be individually or globally revoked, and expiry is checked server-side.
- Session/device lists reveal only user-chosen device labels and security timestamps, not raw
  tokens or browser fingerprints.
- Email delivery remains an injected edge responsibility; the database stores an opaque
  destination reference, not an address or message secret.
- User interfaces and public endpoints remain non-operational until issues #20/#21 and the issue
  #12 real-use gate. Final recovered/revoked VerusID-link handling remains issue #19.

## Migration and rollback

Migration `20260807060000_issue_17_auth_foundation` creates auth accounts, sessions, challenges,
rate buckets, committee access, and privileged approvals, then extends passkey, contact, consent,
and notification metadata. It refuses to invent public keys or email blind indexes for pre-existing
legacy metadata. That is safe in the current synthetic/pre-operational environment and forces an
explicit migration if such data ever exists.

Before durable use, rollback may recreate a disposable environment from the previous migrations.
After auth records exist, use a forward migration: do not drop active credential/session/recovery or
audit history without an approved invalidation and notification plan.

## Rejected alternatives

- One cookie/key/audience across subdomains: expands session theft and confused-deputy impact.
- Signed stateless bearer sessions: weakens emergency revocation and device inventory.
- Email-only committee login: does not meet the strong-authentication requirement.
- Storing raw recovery tokens for delayed delivery: creates a bearer-secret database.
- Treating VerusID control as a role: confuses wallet control with application authorization.
- Hard-coding legal retention or consent text: would decide unfinished issue #12 policy in code.
