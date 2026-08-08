---
title: Verus Mobile Integration Specification
version: 1.0
status: Hosted-service integration implemented fail-closed; service and device compatibility pending
last_updated: 2026-08-07
target_network: VRSCTEST
---

# Verus Mobile Integration

## 1. Purpose

This document defines how the Checks & Balances Protocol application should integrate with Verus Mobile for:

1. optional participant VerusID authentication and account linking;
2. committee-member identity authentication;
3. participant review and approval of an optional identity update that places a privacy-safe proof reference on the participant’s VerusID; and
4. signing or authorization experiments required to determine whether committee operational approvals can safely use supported mobile wallet flows.

It does not claim that these flows are live or that every proposed request type works in every current Android/iOS release. The build must pin and test exact Verus Mobile and supporting library versions on VRSCTEST.

## 2. Non-negotiable boundaries

- The app never asks for or receives private keys, seed phrases, WIFs, z-seeds, wallet files, spending keys, or wallet backups.
- The browser never connects to authenticated `verusd` RPC.
- Development and compatibility tests target VRSCTEST.
- A VerusID link is optional for baseline pilot account creation unless an approved protocol release changes that rule.
- Wallet authentication proves control of a selected VerusID for a defined request; it does not prove human presence, committee membership, locality, legal residence, uniqueness, political intent, or eligibility.
- A wallet response does not bypass application authorization, committee tenancy, conflict rules, policy versions, or human review.
- Raw evidence, face images, document numbers, home addresses, utility bills, committee notes, or private appeal facts are never placed in wallet request metadata or on-chain identity content.
- An identity update on the participant’s VerusID is optional, explicit, previewed in Verus Mobile, and disabled by default.

## 3. Source-compatible approach

Issue #19 account linking uses the existing VRSCTEST `verusid-auth` service at
`https://auth.checksandbalances.services`. Its source and Dokploy definition live in
`services/verusid`. That service owns request signing, the wallet HTTPS webhook,
LoginConsent parsing/signature verification, and hosted result issuance. CBC owns its existing
account authentication, consent, opaque account binding, persistence, audit, independent current
identity readback, unlinking, and revalidation. CBC never receives the hosted signing key and never
trusts a hosted `role` claim.

The exact request format is the `LoginConsentRequest`/`LoginConsentResponse` combination emitted by
the pinned hosted release. The exact current Android and iOS store clients, hosted service image,
`verusid-ts-client`, `verus-typescript-primitives`, and daemon/API inputs must be observed and pinned
together before enabling. Do not infer compatibility from an older SDK image or a side-loaded APK,
and do not invent an envelope from prose.

Optional public-proof identity updates remain a separate later flow and may use a different request
type. Issue #19 does not add that functionality.

## 4. Application identities

Use distinct VRSCTEST identities for:

```text
CONSTITUTION@                Hosted service signer for participant/committee LoginConsent requests
cbc-app-proof-test@         Signs optional participant public-proof update requests
cbc-protocol-test.VRSCTEST@ Owns the approved VRSCTEST project VDXF namespace and protocol metadata
cbc-kelowna-committee-test@ Example committee identity for test fixtures
```

The approved hosted request signer is `CONSTITUTION` at immutable VRSCTEST i-address
`iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm`. Persist and compare immutable i-addresses, not display names
alone.

For each application identity, document:

- identity i-address and fully qualified name;
- network;
- purpose;
- primary signing authority;
- recovery authority;
- revocation authority;
- minimum signatures;
- approved server or operator access path;
- rotation/recovery runbook;
- last identity-state readback; and
- allowed request types and audiences.

Never reuse a production/mainnet identity or key in testnet.

## 5. Flow A — Optional VerusID authentication and account linking

### 5.1 User experience

1. Participant signs into `app.checksandbalances.services` or its testnet host using a passkey or email flow.
2. Participant selects **Link a VerusID**.
3. The page explains:
   - linking is optional;
   - which application identity is making the request;
   - VRSCTEST versus VRSC;
   - what will be stored;
   - what linking does and does not prove;
   - expiry of the request; and
   - how to unlink the application association.
4. Mobile browser displays **Open in Verus Mobile** using the tested URI/universal-link encoding.
5. Desktop browser displays the same request as a QR code and a short-lived polling view.
6. Verus Mobile displays the signed request and lets the participant choose a VerusID.
7. Participant approves or declines.
8. The browser receives a success, decline, expiry, or recoverable-interruption state without exposing wallet secrets.

### 5.2 Challenge creation

Endpoint:

```text
POST /api/v1/auth/verus/challenges
```

An authenticated CBC account and separate optional-link consent are required. CBC derives an
opaque account-bound state, calls the hosted service server-to-server, and receives the exact
wallet presentation:

```json
{
  "challengeReference": "cbc-local-opaque-reference",
  "purpose": "link_verusid",
  "audience": "cbc-participant-app",
  "environment": "vrsctest",
  "requestedScopes": ["verusid:link"],
  "requesterIdentity": "iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm",
  "sameDeviceUrl": "exact-hosted-login-consent-uri",
  "qrPayload": "same-exact-hosted-login-consent-uri",
  "expiresAt": "RFC3339-five-minute-window",
  "operational": false
}
```

The database stores the local account/trust-domain binding, remote challenge reference, opaque-state
digest, exact presentation digest, local polling-token digest, expected hosted signer/callback,
network, audience, scope, times, and consumption state. It does not store the deep link, hosted JWT,
wallet response, or wallet secrets.

### 5.3 Hosted request and result contract

The hosted service must cryptographically bind and verify:

- one-time challenge and CBC opaque state;
- purpose and CBC audience;
- its exact HTTPS wallet callback;
- VRSCTEST network/system and approved `CONSTITUTION` signer;
- issued/expiry conditions;
- exact original signed request digest;
- selected response signer and signature; and
- current non-revoked identity state.

Result retrieval is server-to-server, authenticated with a credential absent from the QR/deep link,
and idempotent until CBC acknowledgment or expiry. The result token is signed and bound to exact
issuer, CBC audience, challenge, opaque state, selected immutable identity, issued time, expiry, and
unique token ID. CBC ignores any remote role.

### 5.4 CBC verification and local consumption

Verus Mobile posts directly to `https://auth.checksandbalances.services/verusidlogin`. CBC exposes no
wallet callback endpoint. During authenticated CBC polling:

1. require the owning application session plus separate local polling token;
2. reject expired, cancelled, consumed, unknown, or cross-account local challenges;
3. retrieve the hosted result with the server credential;
4. verify the exact token algorithm/signature, issuer, audience, challenge, state, identity, times,
   and unique token ID;
5. ensure the hosted signer/callback/network/presentation digest match the stored contract;
6. ignore hosted role claims;
7. resolve the selected identity by immutable i-address through private VRSCTEST RPC;
8. reject wrong-system, recovered, revoked, inactive, or mismatched state;
9. atomically consume the local challenge and create/update the minimum link; and
10. append an audit event without retaining the token or wallet response.

A duplicated poll returns the existing terminal result without another hosted result claim or link.
A crash before local commit must not destroy the only remote proof; the hosted result remains
retrievable until explicit acknowledgment or expiry.

### 5.5 Browser completion

The browser receives only the wallet presentation and state through authenticated CBC polling with
a separate short-lived local token. It never receives the hosted result JWT.

Do not place the participant’s VerusID or a reusable authentication token in a query string.

### 5.6 Stored identity-link record

```json
{
  "accountId": "internal-id",
  "network": "VRSCTEST",
  "identityAddress": "i...",
  "identityDisplayNameSnapshot": "optional-display-only",
  "proofMethod": "hosted_verusid_login_consent_v1",
  "provedAt": "RFC3339",
  "requestSignerIdentityAddress": "i...",
  "observedIdentityRevision": "implementation-specific",
  "scopes": ["cbc.account.verusid.link"],
  "status": "active",
  "revalidationRequiredAt": "RFC3339-or-null"
}
```

Never store the participant’s wallet key material. A display-name snapshot is informational; authorization uses the immutable identity address and fresh state where required.

## 6. Flow B — Committee-member authentication

Committee members may link and authenticate with a VerusID through the same basic ceremony, using a distinct purpose and audience:

```text
purpose: authenticate_committee_member
audience: cbc-committee-console
scope: cbc.committee.session.authenticate
```

Additional checks:

- local application account is an active member of the target committee;
- the linked identity matches the approved member/signer inventory where the policy requires it;
- the identity has not been removed, revoked, recovered, or rotated without reauthorization;
- strong local authentication is also present;
- session is scoped to `committee.checksandbalances.services`, not the participant app; and
- authentication does not itself sign an attestation decision.

Role assignment remains an application/steward action. A VerusID cannot self-assert official committee membership through content it controls.

## 7. Flow C — Optional participant-controlled public proof reference

### 7.1 Purpose and privacy posture

The baseline status remains private canonical status plus a participant-presented credential/reference and privacy-safe committee anchors. A participant may later choose to place a compact public proof reference on their own VerusID for portability.

This creates public linkability and cannot be required for baseline verification. Before enabling it, complete:

- privacy impact assessment;
- clear informed consent and withdrawal explanation;
- mobile compatibility tests;
- VDXF namespace and schema approval;
- payload-size and readback tests;
- revocation and supersession design;
- UI review showing exactly what becomes public; and
- relying-party semantics.

### 7.2 Allowed public content

A proof reference may include only approved compact fields such as:

```json
{
  "schema": "cbc.public-proof-reference.v1",
  "environment": "vrsctest",
  "issuer": "committee-i-address",
  "opaqueReference": "high-entropy-reference-or-commitment",
  "assuranceLevel": "pilot",
  "validFrom": "RFC3339",
  "validUntil": "RFC3339",
  "statusEndpoint": "https://api.testnet.checksandbalances.services/api/v1/attestations/status",
  "policyDigest": "digest",
  "privacy": {
    "evidenceOnChain": false,
    "exactAddressOnChain": false
  }
}
```

Depending on the final privacy model, even the issuer or validity fields may be replaced with a more private commitment. The approved schema controls.

Forbidden content includes:

- name beyond what the VerusID already publicly exposes;
- face image;
- identity-document type or number;
- date of birth;
- exact home address;
- utility-bill data;
- private session location;
- evidence hash that enables dictionary or correlation attacks;
- reviewer names or notes;
- political activity;
- appeal facts; and
- hidden tracking identifiers unrelated to verification.

### 7.3 Request preparation

Endpoint:

```text
POST /api/v1/account/attestations/{attestationId}/public-proof-requests
```

Requirements:

- current participant authentication and re-authentication;
- active linked VerusID controlled by the participant;
- active attestation and approved issuer;
- explicit consent version;
- feature enabled for the environment;
- approved VDXF key owned by the request-signing application/issuer namespace;
- exact old/new identity-content preview; and
- short request expiry.

The API prepares and signs an `IdentityUpdateRequest` compatible with the pinned Verus Mobile version. The update must target the participant-selected identity and only the approved contentmultimap change.

### 7.4 Verus Mobile review and permission

Verus Mobile must show enough information for meaningful consent:

- network;
- identity being updated;
- requesting signer;
- fields being added or changed;
- public visibility;
- transaction fee and funding requirement;
- expiry; and
- confirmation action.

The participant approves and signs/pays in the wallet. The server never signs as the participant.

### 7.5 Confirmation and readback

After wallet submission:

1. callback/polling result supplies the supported transaction/response evidence;
2. backend verifies correlation and expected identity/update digest;
3. worker waits for the configured VRSCTEST confirmation policy;
4. worker reads the identity through `getidentity`/`getidentitycontent`;
5. worker compares the approved VDXF value digest and semantic fields;
6. record becomes `verified` only after readback;
7. mismatch, reorg, rejection, expiry, or cancellation produces an explicit state; and
8. the participant app explains that removal/supersession may require another wallet-approved identity update and cannot erase historical chain data.

## 8. Committee approval and signing experiments

Do not assume that Verus Mobile supports the exact multi-party committee signing ceremony the protocol may choose.

The build must run a technical spike covering:

1. Can each reviewer sign a domain decision digest through a supported generic authentication/signature request without exposing private data?
2. Can those signatures be independently verified and bound to committee, session, participant opaque reference, policy version, decision, and expiry?
3. Does the current mobile client support the intended committee VerusID update where minimum signatures exceed one?
4. How are partially signed transactions coordinated, expired, cancelled, and audited?
5. What happens after signer rotation, identity recovery, or device loss?
6. Can the ceremony be completed without a server possessing committee-member private keys?

Until the spike proves a supported design, separate:

- human reviewer decisions in the application;
- individual reviewer wallet proofs where supported; and
- controlled committee Verus transactions through an approved operational signer/worker or offline process.

Any fallback must have documented custody, threshold, approval, rotation, audit, and incident controls. It must not be disguised as participant-controlled multisig if it is not.

## 9. VDXF namespace rules

Older issues proposed `vrsc::identity.attestation.cbc.*`. Do not use that namespace without documented authority.

The approved VRSCTEST namespace is owned by `cbc-protocol-test.VRSCTEST@` as recorded in
ADR 0006. Its v1 URIs are:

```text
cbc-protocol-test.VRSCTEST::v1.attestation.human
cbc-protocol-test.VRSCTEST::v1.attestation.method
cbc-protocol-test.VRSCTEST::v1.attestation.validity
cbc-protocol-test.VRSCTEST::v1.attestation.revocation
cbc-protocol-test.VRSCTEST::v1.attestation.policy
cbc-protocol-test.VRSCTEST::v1.proof.reference
cbc-protocol-test.VRSCTEST::v1.anchor.schema
cbc-protocol-test.VRSCTEST::v1.anchor.policy
cbc-protocol-test.VRSCTEST::v1.anchor.cycle_report
```

The `.VRSCTEST` qualifier is required. The shorter `cbc-protocol-test::...` form derives a
different namespace and is not approved. For every key:

1. define human-readable meaning and privacy classification;
2. derive using `getvdxfid` on VRSCTEST;
3. record expected i-address in a versioned fixture;
4. construct supported array-form contentmultimap value;
5. write only through an approved test identity;
6. read through `getidentity` and `getidentitycontent`;
7. verify exact canonical bytes/digest; and
8. test supersession and invalid/oversize values.

## 10. Request lifecycle model

```text
created -> encoded -> presented
presented -> approved | declined | expired | cancelled
approved -> callback_received -> verifying
verifying -> verified | invalid | replayed | wrong_network | stale_identity
verified -> consumed
```

Identity-update requests add:

```text
verified -> transaction_pending -> confirming -> readback
readback -> completed | mismatch | reorg_pending | failed
```

Terminal states are immutable. A new attempt creates a new challenge.

## 11. Security controls

### Request substitution

- application signs request;
- wallet verifies signer through supported mechanisms;
- browser displays expected app/network before launch;
- QR is generated from the exact signed bytes;
- callback verifies digest of the issued request.

### Replay

- cryptographic nonce;
- short expiry;
- database uniqueness;
- atomic one-time consumption;
- idempotent duplicate callback response;
- no reusable callback bearer credential.

### Wrong network

- request declares VRSCTEST;
- application signer is resolved on expected system;
- response network/system must match;
- server environment rejects VRSC unconditionally during development.

### Stale identity state

- resolve identity at verification time;
- store observed state;
- revalidate before privileged committee actions and public-proof updates;
- trigger re-link review after recovery/revocation/authority change where detectable.

### Callback forgery

- no trust in HTTP source address;
- verify signed response and request correlation;
- strict parser and body size;
- rate limit and abuse detection;
- generic failure responses that do not disclose account/challenge existence.

### Privacy

- minimum request payload;
- no evidence or exact address;
- no sensitive query string;
- short retention for failed/expired wallet payloads;
- redacted logs and traces;
- separate analytics prohibition on callback routes.

## 12. Compatibility matrix

Create a version-controlled matrix before enabling any wallet feature:

| Component | Version/commit | Android tested | iOS tested | VRSCTEST auth | Identity update | QR | Same-device | Known limitations |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Verus Mobile Google Play | Pending Pixel 10 observation | Pending | N/A | Pending | Not in #19 | Pending | Pending | Do not reuse the obsolete Pixel 9 version |
| Verus Mobile App Store | Pending BrowserStack observation | N/A | Pending | Pending | Not in #19 | Pending | Pending | Two-minute BrowserStack session; prepare request first |
| Hosted `verusid-auth` | Health version `1.0.0`; immutable source/image pin pending | N/A | N/A | Health and challenge work; hardened result contract pending | Not in #19 | N/A | N/A | Current health/JWT/result retrieval do not yet satisfy ADR 0007 |
| Hosted SDK/primitives | Exact deployed commits pending | N/A | N/A | Pending immutable deployment evidence | Not in #19 | N/A | N/A | Package manifest/build currently does not prove exact deployed pins |
| `verusd` | `1.2.17-3` | N/A | N/A | Independent current identity readback available | Not in #19 | N/A | N/A | Private RPC only; mainnet blocked |

A green result applies only to the exact combination tested. Upgrade through a compatibility pull request with fixture and device results.

Exact service/device results and blockers are recorded in
`docs/compatibility/verus-mobile-auth-v1.md`. CBC contract tests use sanitized in-memory hosted
responses and never retain a live deep link, JWT, wallet callback, selected identity, or profile
data. See ADR 0007 and the Verus Mobile linking runbook.

## 13. Required automated tests

### Unit/contract

- opaque account state is deterministic and keyed;
- hosted presentation digest and expiry validation;
- application audience, hosted contract, callback, and signer validation;
- wrong-network rejection;
- hosted result signature plus challenge/state correlation;
- replay and duplicate callback handling;
- identity address normalization;
- current identity-state lookup;
- forbidden-field rejection;
- contentmultimap size and array-form validation;
- public-proof update diff allowlist;
- hosted token/deep-link log redaction and ignored remote roles.

### Integration

- fake hosted-service success/pending/expiry;
- hardened hosted-service contract fixture;
- recovered/revoked identity fixture;
- hosted result after browser disconnect and CBC restart;
- transaction ambiguity and readback reconciliation;
- reorg simulation;
- identity-update mismatch;
- unsupported mobile/service version rejection or warning.

### Device tests

- Android same-device launch;
- Android desktop QR;
- iOS same-device launch;
- iOS desktop QR;
- cancel/back/timeout;
- app not installed;
- wrong wallet network;
- multiple eligible identities;
- fee/funding failure for identity update;
- readable preview of every public field;
- no secret or evidence exposure in app-switcher/screenshots beyond unavoidable user-controlled display.

## 14. Operational metrics

Collect privacy-safe aggregates:

- challenge creation and terminal result counts;
- success/failure by request type and pinned client version;
- median completion duration;
- replay/wrong-network/invalid-signature counts;
- callback retry count;
- identity-update submitted/confirmed/readback mismatch;
- incidents and support categories.

Do not expose per-identity wallet activity in public metrics.

## 15. Implementation order

1. Pin hosted source/image/dependency versions and record licences.
2. Approve the hosted VRSCTEST signer and recovery/revocation runbook.
3. Harden and version the hosted LoginConsent/request/result contract.
4. Implement the CBC hosted-service client and one-time local challenge store.
5. Implement synthetic hosted-service and automated integration tests.
6. Run Android/iOS authentication compatibility spike.
7. Enable optional participant linking on the testnet host.
8. Run committee-member authentication spike.
9. Approve VDXF namespace and public-proof schema.
10. Build identity-update request preview, consent, callback, confirmation, and readback.
11. Run Android/iOS identity-update compatibility spike.
12. Keep public-proof feature disabled until privacy/release approval.
13. Investigate committee multi-party approval/signing separately.

## 16. Definition of done

- [ ] Exact mobile/library/daemon versions are pinned and licensed.
- [ ] Application and committee identities exist only on VRSCTEST for development.
- [ ] Authentication request works on supported Android and iOS paths.
- [ ] QR and same-device flows have accessible fallback instructions.
- [ ] Nonce replay, expiry, wrong network, wrong signer, callback forgery, and stale identity tests pass.
- [ ] No wallet secret or raw evidence reaches the service.
- [ ] VerusID linking remains optional and separate from human attestation.
- [ ] Identity update shows the exact public diff and requires wallet approval.
- [ ] Identity update is read back and verified from chain before completion.
- [ ] Participant can understand public permanence and supersession limits.
- [ ] Committee signing capabilities are proven rather than assumed.
- [ ] Mainnet is blocked.
