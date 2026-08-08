# ADR 0007: Hosted VRSCTEST Verus Mobile account linking

- Status: architecture accepted; hosted-service and device compatibility gates pending
- Date: 2026-08-07
- Decision scope: Issue #19 optional VerusID account linking
- Mainnet effect: none; VRSC/mainnet is not a representable linking network

## Context

CBC needs an optional way for an already authenticated participant or committee account to prove
control of a selected VerusID. A wallet signature proves control for one bounded request. It does
not prove a person's identity, presence, locality, uniqueness, eligibility, committee role, or
attestation status.

The Constitutional Money platform already operates `verusid-auth` at
`https://auth.checksandbalances.services`. Its source is maintained in `services/verusid`; it
creates VRSCTEST `LoginConsentRequest` presentations,
receives `LoginConsentResponse` wallet webhooks, verifies signatures, reads identity state, and
delivers a JWT result. Duplicating its signing key and request implementation inside CBC would
create a second custody and compatibility surface.

The currently deployed `1.0.0` service is healthy and can create a wallet presentation, but its
public contract does not yet expose the complete fail-closed metadata CBC requires. In particular,
the present health response does not attest the exact SDK/source pins or contract version; result
retrieval is not authenticated separately from the challenge identifier; and current JWTs are not
bound to a CBC audience, opaque state, challenge, or unique token identifier. Those are enablement
blockers, not reasons to weaken CBC verification.

## Decision

CBC consumes the hosted service through a narrow server-to-server client. CBC has no wallet
callback route and no Verus application signing key. The approved request signer is
`CONSTITUTION` on VRSCTEST at immutable i-address
`iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm`.

For each five-minute ceremony CBC:

1. authenticates the existing passkey/email session and records separate optional-link consent;
2. derives an opaque HMAC state from account, trust domain, purpose, audience, and exact times;
3. calls the hosted service with that state and an authenticated client credential;
4. stores the remote challenge reference, exact presentation digest, local account binding,
   local polling-token digest, expected signer/callback/audience, and times—but not the deep link,
   hosted JWT, wallet response, or wallet secret;
5. returns the exact hosted deep link as both same-device and QR presentation;
6. retrieves the hosted result server-to-server with a credential not embedded in the wallet
   presentation;
7. verifies HS256 with a distinct deployment secret and requires exact issuer, CBC audience,
   challenge, opaque state, identity, issued time, expiry, and unique token ID;
8. ignores every remote `role` claim;
9. independently reads the selected immutable identity from the private VRSCTEST adapter; and
10. consumes the local challenge and creates/revalidates the minimum link in one database
    transaction.

Asymmetric result signing plus a pinned JWKS is preferred when the hosted service adds it. Until
then, a distinct HS256 verification secret may be supplied only through both deployments' secret
managers. The browser never receives the hosted result token.

The hosted result must remain retrievable idempotently until CBC acknowledges it or it expires.
This avoids losing the one-time proof if CBC crashes after network receipt but before committing
the local transaction.

Unlinking changes only the local association. Recovery, revocation, or relevant identity revision
moves active links to `revalidation_required`; a fresh ceremony is required to reactivate one.
Neither linking nor revalidation can create a committee role or an attestation.

## Deployment and compatibility gates

`CBC_VERUS_LINKING_ENABLED` defaults to false. Enabling requires all of the following:

- the exact hosted service source revision and immutable deployed image digest;
- pinned `verusid-ts-client`, `verus-typescript-primitives`, daemon/API, and transitive build inputs;
- health metadata satisfying `cbc-verusid-auth.v1`;
- authenticated and idempotent-until-ack result retrieval;
- exact request/signature/callback/network/current-identity checks in the hosted service;
- distinct client, JWT-verification, binding, polling, rate-limit, and session secrets;
- current Android and iOS store versions observed, pinned, and passed for same-device and QR; and
- all issue #19 replay, substitution, result-theft, stale/revoked-identity, privacy, and mainnet
  negative tests.

The current hosted service and unknown future wallet versions do not satisfy these gates yet. The
feature remains `not_operational` and disabled.

## Consequences

- Baseline passkey/email accounts continue without a wallet.
- CBC avoids a second application signing key and does not expose a wallet callback.
- Hosted-service availability cannot make CBC fail open.
- A remote identity or `role` field alone is never authorization; the verified result and local
  session/account binding are both required.
- A lost browser can resume only with its authenticated CBC session and separate polling token.
- Operators must never copy result tokens, deep links, polling tokens, selected identities, or
  service/RPC credentials into logs, tickets, analytics, or fixtures.
- Mainnet support requires a new ADR and code/config changes; it cannot be enabled by changing the
  current network value.
