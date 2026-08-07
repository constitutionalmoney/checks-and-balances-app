---
title: Checks & Balances Protocol Verus App — Product Requirements Document
version: 1.0
status: Proposed
last_updated: 2026-08-05
owner: Checks and Balances Committee Ltd.
target_network: VRSCTEST before any mainnet use
---

# Product Requirements Document

## 1. Executive summary

The Checks & Balances Protocol is a local-first human-verification system. A local committee verifies that a real person appeared in person, completed the approved local process, matched the credential photo or another approved evidence pathway, and holds a current expiring attestation. Connected applications may check the minimum attestation result without receiving the participant’s underlying private evidence.

The first connected accountability application is planned to be Rate My Representatives, but the systems remain separate:

- **Checks & Balances Protocol** verifies current human participation and, where separately defined, a limited locality claim.
- **Rate My Representatives** organizes representative profiles, public records, evidence-linked citizen evaluations, official responses, corrections, and outcomes.

This repository will implement five separable surfaces:

1. participant PWA;
2. committee operations console;
3. public committee directory and verifier;
4. versioned API and developer documentation; and
5. asynchronous Verus integration and provenance services.

The product is currently in specification and pilot preparation. It does not claim that public committees, verification sessions, APIs, SDKs, production credentials, VerusID attestations, Rate My Representatives integration, or mainnet operations are live.

## 2. Source basis and controlling posture

This PRD is derived from:

- the current `checksandbalances.services` pages branded **Checks & Balances Protocol**;
- the Checks and Balances Verification Protocol — Verus Development Guide dated 2026-08-05; and
- current Verus Mobile implementation references for signed generic requests, authentication details, identity-update request validation, and user-reviewed identity updates.

Where historical archived website material conflicts with the current protocol pages, the current protocol pages control. Where this PRD describes a technical implementation choice not fixed by the source material, it is labelled a recommendation or proposed decision.

## 3. Product status

| Capability | Status at PRD publication |
|---|---|
| Public explanation website | Live |
| Public committee directory | Not live |
| Kelowna pilot | Forming; no open sessions |
| In-person human-verification process | Proposed and being specified |
| Universal 45-day expiry | Current public commitment |
| Random peer renewal | Required concept; exact mechanism unfinished |
| Twelve-person committee formation | Current public-facing model; formal rule and quorum details require approval |
| Two-of-three signing | Proposed in older repository issues; not final |
| Evidence, locality, retention, appeal, and recovery policies | Unfinished |
| VerusID account linking | Planned |
| Verus Mobile permission flow | Planned |
| Participant-controlled identity update | Optional future capability; not required for baseline verification |
| VDXF schema and namespace | VRSCTEST namespace and anchor-manifest v1 approved in ADR 0006; remaining schemas/fixtures planned |
| Status API, SDK, relying-party terms | Not live |
| Rate My Representatives integration | Planned; disabled by default |
| Mainnet writes | Prohibited until a separate production gate |

## 4. Problem statement

Online civic participation is vulnerable to bots, duplicate accounts, manufactured volume, and systems that require users to surrender identity control to a centralized platform. Existing identity-verification products often over-collect personal data, create reusable dossiers, or make one company the permanent identity authority.

The product must establish a current human-attestation signal through accountable local review while minimizing the information exposed to connected applications. It must preserve the difference between:

- proof that a real person appeared;
- any duplicate-prevention or uniqueness assurance;
- a declared or document-supported local connection;
- legal residence, citizenship, voting eligibility, or constituency eligibility; and
- the truth or popularity of a participant’s civic statement.

Conflating those claims would create false assurance and legal, privacy, and governance risk.

## 5. Product vision

> Build a portable, expiring, community-attested proof-of-human layer that people control, committees can administer transparently, and connected applications can verify without becoming owners of private identity evidence.

## 6. Goals

### G1 — Verify human presence responsibly

Support an in-person process in which authorized committee members determine whether a real person appeared and matched the approved evidence pathway.

### G2 — Keep attestations current

Enforce a 45-day maximum validity window at the domain and status-service layers. Renewal creates a new attestation version; it does not silently extend an old record.

### G3 — Preserve participant control

Allow a participant to use a normal account and optionally link a VerusID. The application never receives wallet private keys or seed material.

### G4 — Minimize disclosure

Connected applications receive only the status and claims required for an approved use case. They do not receive identity documents, utility bills, exact-address dossiers, face images, or committee evidence packages.

### G5 — Make committee operations auditable

Track formation, roles, sessions, decisions, conflicts, signatures, policy versions, expiry, revocation, appeals, and public aggregate reports.

### G6 — Use Verus for identity control and provenance

Use VRSCTEST first for participant-controlled authentication, committee identity, signed requests, compact proof references, policy/schema anchors, public cycle-report anchors, and readback verification.

### G7 — Enable independent integration

Publish versioned schemas, OpenAPI definitions, `auth.md`, test fixtures, SDKs, status semantics, and relying-party rules only after they pass release gates.

## 7. Non-goals

The baseline product does not:

- prove legal residence, citizenship, voting eligibility, or constituency eligibility;
- declare that one person has only one credential unless a separately approved uniqueness method supports that claim;
- determine whether a participant’s statement is true;
- establish community consensus or representative popularity;
- rate representatives;
- store a public registry of identity documents or home addresses;
- require every participant to publish a proof reference on their VerusID;
- require VerusID ownership to request an in-person verification during the pilot;
- replace government identification systems;
- automate committee approval through AI;
- allow an agent to appear, consent, sign, vote, or express civic intent for a human;
- make a fork or compatible deployment an official committee; or
- write to Verus mainnet during development or pilot preparation.

## 8. Product principles

1. **Human acts require human confirmation.**
2. **No dossier by default.**
3. **Claims remain separate and explicitly labelled.**
4. **Expiry is enforced, not merely displayed.**
5. **Policy versions travel with decisions.**
6. **The private transactional database is canonical for operations.**
7. **Verus is used for identity control and compact provenance—not as the database for people, evidence, meetings, or appeals.**
8. **Every on-chain write is asynchronous, idempotent, size-checked, and read back.**
9. **Public status must resist enumeration and correlation.**
10. **No public claim becomes “live” merely because a code path exists.**
11. **Accessible evidence pathways and exceptions are first-class protocol concerns.**
12. **Rate My Representatives remains a separate relying party.**

## 9. Users and roles

### 9.1 Participant

A person who creates an account, optionally links a VerusID, requests a session, attends in person, reviews consent, receives an attestation status, renews, corrects, recovers, or appeals.

### 9.2 Committee organizer

A person responsible for proposed committee formation, jurisdiction definition, member onboarding, policies, locations, accessibility, and readiness documentation.

### 9.3 Committee member/reviewer

An authorized human who attends a session, reviews the person and approved evidence pathway, discloses conflicts, records a decision, and signs only within approved authority.

### 9.4 Committee administrator

An operational role that schedules sessions, manages rosters and capacity, sends notices, handles check-in, supports appeals, and finalizes aggregate reports. Administrative access does not automatically confer decision-signing authority.

### 9.5 Protocol steward

Checks and Balances Committee Ltd. personnel or appointed maintainers who approve official committees, policy/schema versions, releases, API clients, incident actions, and production gates.

### 9.6 Relying-party developer

A developer integrating a petition, member vote, public-comment tool, cooperative, local board, civic platform, or Rate My Representatives with the minimum status interface.

### 9.7 Public observer/auditor

A person who views official committee metadata, availability, policy versions, public aggregate cycle reports, schema anchors, and service status without enumerating participants.

### 9.8 Privacy/security/support officer

A restricted role that handles access requests, corrections, incidents, appeals, retention, deletion, breach response, and vulnerability reports.

## 10. Product surfaces

| Surface | Core users | Core responsibility |
|---|---|---|
| Public website | Everyone | Explain protocol, limitations, status, safeguards, roadmap |
| Participant PWA | Participants | Account, consent, VerusID link, session request, status, renewal, appeal |
| Committee console | Organizers, members, administrators | Formation, sessions, decisions, signing, cycles, appeals, audit |
| Public verifier | Participants and relying parties | Validate a presented reference or consented status request |
| Public directory | Everyone | List only approved committees and published sessions |
| Versioned API | First-party apps and approved relying parties | Account, operations, status, discovery, policy, schema, proof |
| Developer docs | Developers | OpenAPI, schemas, SDKs, test fixtures, terms, compatibility |
| Status service | Everyone | Availability and incident communications |
| Verus worker | Internal | RPC, wallet-request signing support, anchors, readback, reconciliation |

The recommended hosts are defined in [SUBDOMAINS.md](./SUBDOMAINS.md).

## 11. Primary user journeys

### 11.1 Create account and optionally link VerusID

1. Participant creates an account with a passkey or verified email.
2. Participant is shown what account data is stored.
3. Participant chooses whether to link a VerusID.
4. Server generates a one-time, signed, expiring VRSCTEST wallet request.
5. Same-device users open Verus Mobile; desktop users scan a QR code.
6. Verus Mobile displays the requesting application, network, requested identity action, and callback.
7. Participant selects and approves an identity.
8. Backend validates nonce, expiry, audience, callback state, network, signer, identity state, and response signature.
9. Backend stores the identity i-address and proof metadata—not keys.
10. Participant may unlink the local account association without rewriting chain history.

### 11.2 Request and attend verification

1. Participant chooses broad jurisdiction or an approved session.
2. Application shows evidence, privacy, accessibility, attendance, appeal, and cancellation policies by version.
3. Participant consents and requests an appointment or queue position.
4. No identity document is uploaded through the public application.
5. Participant receives a code and scheduled-session information.
6. At the physical session, a committee administrator checks in the participant.
7. Authorized reviewers inspect the person and approved evidence pathway in person.
8. The tool records only permitted metadata.
9. Reviewers disclose conflicts and record independent decisions.
10. The approved threshold is applied by the domain service.
11. An approved decision creates an issuance job and an audit event.

### 11.3 Receive and use an attestation

1. Canonical status becomes active only after issuance requirements pass.
2. Participant sees validity start, 45-day expiry, issuer, assurance level, policy versions, and what relying parties may see.
3. Participant may present an opaque reference or authorize a status check.
4. Relying party receives a normalized minimum response.
5. Optional public proof reference on the participant’s VerusID requires a separate explicit wallet-approved identity-update flow.

### 11.4 Renew

1. System creates a renewal cycle and eligible-population snapshot.
2. Approved deterministic selection is committed and later derived from agreed public entropy.
3. Selected participants receive private notices; public reporting never identifies them by default.
4. Participant attends or follows an approved deferral/accessibility path.
5. Successful renewal creates a new attestation version.
6. Prior validity windows remain immutable in audit history.
7. No-show, expiry, deferral, and appeal are applied under published rules.

### 11.5 Correct, revoke, recover, or appeal

1. Participant or authorized operator opens the applicable request.
2. System preserves the original record and reason category.
3. Access is separated between support, committee decision-makers, privacy, and security roles.
4. Revocation takes effect in canonical status immediately after authorized approval.
5. Verus anchors or optional public references are reconciled asynchronously.
6. Appeal outcomes create new records; they do not erase the original decision.

## 12. Functional requirements

### 12.1 Account and authentication

- **FR-AUTH-001:** Support passkey authentication as the preferred account method.
- **FR-AUTH-002:** Support verified email recovery or sign-in where passkeys are unavailable, subject to rate limiting and abuse controls.
- **FR-AUTH-003:** Make VerusID linking optional for baseline pilot account creation.
- **FR-AUTH-004:** Store sessions in secure, HttpOnly, SameSite cookies scoped to the relevant application host.
- **FR-AUTH-005:** Require strong authentication and re-authentication for committee and steward actions.
- **FR-AUTH-006:** Separate application role authorization from Verus identity ownership.
- **FR-AUTH-007:** Record consent version, authentication method, and relevant security events.
- **FR-AUTH-008:** Support account lock, recovery, unlinking, and security-notification workflows.

### 12.2 VerusID linking and permission

- **FR-VLINK-001:** Generate one-time signed GenericRequest-compatible authentication challenges for VRSCTEST.
- **FR-VLINK-002:** Provide same-device deep-link and desktop QR paths, plus a browser recovery/polling path.
- **FR-VLINK-003:** Validate challenge nonce, audience, expiry, requested network, callback binding, request signer, response signer, signature, and current identity state.
- **FR-VLINK-004:** Prevent replay and reject previously consumed challenges.
- **FR-VLINK-005:** Record identity i-address, network, proof time, observed identity state, and consented scopes.
- **FR-VLINK-006:** Never request or receive wallet key material.
- **FR-VLINK-007:** Maintain a pinned Android/iOS/mobile-wallet compatibility matrix before pilot.
- **FR-VLINK-008:** Treat identity recovery or revocation as a reason to revalidate the local link.

### 12.3 Committee formation and recognition

- **FR-COM-001:** Create proposed committees with a defined jurisdiction boundary and public status.
- **FR-COM-002:** Track formation checklist, organizers, member roles, conflicts, policy approvals, accessibility plan, location readiness, security readiness, and legal/privacy review.
- **FR-COM-003:** Support the current twelve-member formation model while keeping quorum and decision-signing thresholds configuration-disabled until formally approved.
- **FR-COM-004:** Do not include unsupported historical qualifications such as shareholder status or possession of a silver coin unless a future approved policy expressly adopts them.
- **FR-COM-005:** Provision a committee VerusID on VRSCTEST with separate revocation and recovery authorities.
- **FR-COM-006:** Record signer inventory, rotation, removal, threshold test, and readback results.
- **FR-COM-007:** Publish a committee only after every required readiness gate passes.
- **FR-COM-008:** Distinguish `proposed`, `forming`, `testnet_ready`, `pilot_approved`, `suspended`, and `retired` states.

### 12.4 Directory and discovery

- **FR-DIR-001:** Do not show a public operating committee unless it is approved for publication.
- **FR-DIR-002:** Show jurisdiction, responsible organization, public contacts, status, session availability, accessibility summary, approved policy versions, and last reviewed date.
- **FR-DIR-003:** Publish root and committee `/.well-known/auth.md` discovery documents.
- **FR-DIR-004:** Avoid exposing private member addresses, signer details, participant lists, or precise unpublished session locations.
- **FR-DIR-005:** Allow emergency suspension and display an accurate suspension reason category.

### 12.5 Session scheduling

- **FR-SES-001:** A session has committee, jurisdiction, location, time, capacity, accessibility, evidence policy, privacy notice, appeal policy, roster, cancellation path, and publication state.
- **FR-SES-002:** Exact address visibility may be restricted to confirmed participants until publication is safe.
- **FR-SES-003:** Support appointments, local queue numbers, capacity, waitlist, cancellation, and accessible accommodation requests.
- **FR-SES-004:** Do not accept identity-document uploads.
- **FR-SES-005:** Send privacy-safe reminders by approved contact channels.
- **FR-SES-006:** Preserve policy versions accepted when the request and session were created.

### 12.6 In-person check-in and evidence review

- **FR-EVID-001:** Check-in uses an appointment code, queue code, or approved local process without displaying a public participant list.
- **FR-EVID-002:** Evidence is reviewed in person under a versioned policy.
- **FR-EVID-003:** Government ID may be one pathway but must not be the only assumed pathway unless an approved policy says so.
- **FR-EVID-004:** Store only evidence-path category, policy version, review result, whether evidence was returned/copied/hashed/not retained, and other expressly permitted metadata.
- **FR-EVID-005:** Default to `not retained`; document/photo capture modules remain absent unless separately approved.
- **FR-EVID-006:** Support accessibility, exceptions, and `needs_more_information` without forcing a false approve/reject decision.
- **FR-EVID-007:** Record reviewer conflict declarations.

### 12.7 Decision and signing

- **FR-DEC-001:** Implement the explicit state machine in section 13.
- **FR-DEC-002:** Require session attendance before approval.
- **FR-DEC-003:** Require the approved number and type of independent reviewer decisions.
- **FR-DEC-004:** Do not hard-code two-of-three until the protocol RFC defines whether it applies to selected reviewers, operational signers, initial approval, renewal, or a chain transaction.
- **FR-DEC-005:** Separate human review decisions from Verus transaction submission.
- **FR-DEC-006:** Prevent a conflicted member from contributing to the affected threshold.
- **FR-DEC-007:** Record decision reason category, policy versions, signers/reviewers, timestamps, and audit reference.

### 12.8 Attestation issuance and status

- **FR-ATT-001:** Issue the minimum approved attestation fields.
- **FR-ATT-002:** `active` requires current time before `expires_at`, successful issuance, and no effective revocation or supersession.
- **FR-ATT-003:** Enforce a maximum 45-day validity period server-side.
- **FR-ATT-004:** Renewal creates a new version linked through `supersedes`/`superseded_by`.
- **FR-ATT-005:** Return normalized `active`, `expired`, `revoked`, or `unknown` externally; optional internal states must not leak private process detail.
- **FR-ATT-006:** Keep human, uniqueness, locality, and constituency claims separately typed.
- **FR-ATT-007:** Do not return underlying evidence to relying parties.
- **FR-ATT-008:** Preserve immutable original validity windows and decision history.

### 12.9 Forty-five-day cycle and random renewal

- **FR-CYC-001:** Create a cycle object with period, committee, jurisdiction, policies, status, and public-report controls.
- **FR-CYC-002:** Snapshot the eligible population and commit to its digest before entropy is known.
- **FR-CYC-003:** Use an approved deterministic selection method and public entropy, proposed initially as a future Verus block hash plus a committed salt.
- **FR-CYC-004:** Produce a reproducible proof without exposing selected participant identities.
- **FR-CYC-005:** Support replacement, deferral, accessibility, no-show, cancellation, and appeal rules only as approved.
- **FR-CYC-006:** Produce privacy-thresholded aggregate reports.
- **FR-CYC-007:** Do not allow private manual selection to be labelled random.

### 12.10 Appeals, correction, revocation, and recovery

- **FR-APR-001:** Publish who may appeal, what may be appealed, deadlines, evidence routes, and independent reviewer requirements.
- **FR-APR-002:** Preserve original decisions and append outcomes.
- **FR-APR-003:** Apply authorized revocation to status promptly and audit the reason category.
- **FR-APR-004:** Support compromised-account, compromised-VerusID, compromised-committee, error-correction, and identity-recovery scenarios.
- **FR-APR-005:** Do not reveal sensitive appeal grounds through public status.
- **FR-APR-006:** Provide data-access and correction workflows consistent with applicable privacy obligations.

### 12.11 Public verifier and relying-party API

- **FR-RP-001:** Support a consented opaque-reference or proof-verification flow rather than open participant lookup.
- **FR-RP-002:** Return status, attestation type, issuer, assurance level, approved broad scopes, validity window, revocation state, policy versions, and opaque reference only where authorized.
- **FR-RP-003:** Apply rate limits, client authentication where needed, anti-enumeration controls, abuse detection, and privacy budgets.
- **FR-RP-004:** Publish relying-party terms and field semantics before issuing production credentials.
- **FR-RP-005:** Provide a disabled-by-default Rate My Representatives adapter.
- **FR-RP-006:** Do not generate a composite trust weight from status.
- **FR-RP-007:** Make stale, unavailable, or unverifiable results explicit rather than converting them to false negatives or positives.

### 12.12 Verus identity update and provenance

- **FR-VRS-001:** Use a private RPC boundary and asynchronous outbox worker.
- **FR-VRS-002:** Verify expected chain and node synchronization before write work.
- **FR-VRS-003:** Derive VDXF keys with `getvdxfid`, keep values in supported array form, and read back with `getidentity`/`getidentitycontent`.
- **FR-VRS-004:** Use a project-controlled namespace unless authority to use another namespace is documented.
- **FR-VRS-005:** MVP uses private canonical status plus signed credential/proof material and privacy-safe committee anchors.
- **FR-VRS-006:** An optional participant-held public proof reference requires explicit, revocable informed consent and a Verus Mobile identity-update request reviewed by the participant.
- **FR-VRS-007:** A public proof reference must contain no raw evidence, exact address, document identifier, face image, or private committee note.
- **FR-VRS-008:** Do not assume Verus Mobile can complete arbitrary committee multisig identity updates; implement a compatibility spike and supported fallback.
- **FR-VRS-009:** Every write is idempotent, confirmation-aware, reorg-aware, and read back before it is marked verified.
- **FR-VRS-010:** Mainnet write code is compile-time or configuration-gated, disabled by default, and separately approved.

### 12.13 Notifications

- **FR-NOT-001:** Support verified email initially; SMS or other channels require separate provider/privacy approval.
- **FR-NOT-002:** Never include private evidence or sensitive status detail in notification previews.
- **FR-NOT-003:** Record message type, policy basis, template version, delivery state, and opt-out/required-service distinction.
- **FR-NOT-004:** Send expiry, renewal, cancellation, appeal, security, and consent-change notices as required.

### 12.14 Audit and administration

- **FR-AUD-001:** Append an audit event for every privileged read or write, policy change, status transition, wallet link, committee decision, Verus job, and export.
- **FR-AUD-002:** Audit events are append-only and integrity-protected.
- **FR-AUD-003:** Separate business data from audit data and redact secrets and unnecessary personal data.
- **FR-AUD-004:** Provide steward views for protocol versions, committee readiness, incident suspensions, client access, and release flags.
- **FR-AUD-005:** Require reason and re-authentication for sensitive administrative overrides.

### 12.15 Public aggregate reporting

- **FR-REP-001:** Report eligible count, selected count, renewed, expired, revoked, deferred, appealed, errors/exceptions, and policy versions.
- **FR-REP-002:** Apply small-cell suppression and generalization.
- **FR-REP-003:** Do not name participants without an explicit lawful policy and consent.
- **FR-REP-004:** Optionally anchor the exact public report digest on VRSCTEST and provide readback verification.

### 12.16 Developer experience

- **FR-DEV-001:** Publish OpenAPI and JSON Schema from version-controlled source.
- **FR-DEV-002:** Publish TypeScript client libraries after the API stabilizes.
- **FR-DEV-003:** Provide synthetic fixtures for active, expired, revoked, unknown, recovered, superseded, and unavailable states.
- **FR-DEV-004:** Provide `auth.md`, integration examples, error semantics, rate limits, privacy requirements, and deprecation policy.
- **FR-DEV-005:** Clearly label testnet endpoints and prohibit production interpretation of test credentials.

## 13. Domain state machines

### 13.1 Verification request and attestation

```text
requested -> scheduled -> checked_in -> under_review
under_review -> approved | rejected | needs_more_information | withdrawn
approved -> issuance_pending -> issued -> active
active -> expired | revoked | superseded
rejected -> appealed -> appeal_upheld | appeal_denied | appeal_remanded
needs_more_information -> scheduled | withdrawn | rejected
```

No path may skip directly from `requested` to `active`.

### 13.2 Committee

```text
proposed -> forming -> policy_review -> testnet_provisioning
-> testnet_ready -> pilot_review -> pilot_approved
pilot_approved -> active | suspended | retired
suspended -> active | retired
```

### 13.3 Verus job

```text
pending -> claimed -> preflight -> submitted -> confirming -> readback
readback -> verified | retryable_failed | terminal_failed | reorg_pending
```

## 14. Minimum data model

| Entity | Purpose |
|---|---|
| `committee` | Identity, jurisdiction, public status, policy versions, recognition |
| `committee_member` | Person reference, role, status, conflict flags, signer state |
| `participant_account` | Account security and contact preferences |
| `verus_identity_link` | Optional i-address, network, proof metadata, scopes |
| `consent_receipt` | Document/version/action accepted and timestamp |
| `verification_request` | Participant request and routing |
| `verification_session` | Time, location, capacity, roster, policy versions |
| `session_attendance` | Private check-in state and outcome |
| `evidence_review_record` | Minimum allowed evidence-path metadata |
| `attestation_decision` | Human decisions, threshold evaluation, signatures |
| `attestation` | Versioned issued attestation metadata |
| `attestation_status` | Canonical current state and validity |
| `renewal_cycle` | Forty-five-day cycle object |
| `eligible_snapshot` | Private canonical eligible set and public digest |
| `cycle_selection` | Selection proof and private selected references |
| `cycle_report` | Privacy-safe public aggregate report |
| `appeal` | Appeal, reviewer assignment, and result |
| `policy_document` | Versioned evidence/privacy/appeal/accessibility rules |
| `outbox_event` | Durable asynchronous work |
| `anchor_record` | Network, txid, VDXF key, digest, confirmation/readback |
| `relying_party_client` | Approved client, scopes, keys, limits, terms version |
| `audit_event` | Append-only operational record |
| `notification` | Message intent, template, channel, and delivery state |

Precise schema and retention rules belong in migrations and [PRIVACY_AND_DATA.md](./PRIVACY_AND_DATA.md).

## 15. External API baseline

All external APIs are versioned from the start.

### Public

```text
GET  /.well-known/auth.md
GET  /api/v1/protocol/status
GET  /api/v1/committees
GET  /api/v1/committees/{committeeId}
GET  /api/v1/committees/{committeeId}/sessions
GET  /api/v1/schemas/{schemaId}
GET  /api/v1/policies/{policyId}
GET  /api/v1/cycle-reports/{reportId}
```

### Participant

```text
POST /api/v1/accounts
POST /api/v1/auth/passkey/*
POST /api/v1/auth/verus/challenges
POST /api/v1/auth/verus/callback
DELETE /api/v1/account/verus-links/{linkId}
POST /api/v1/verification-requests
GET  /api/v1/verification-requests/{requestId}
POST /api/v1/verification-requests/{requestId}/cancel
GET  /api/v1/account/attestations
POST /api/v1/account/attestations/{attestationId}/appeals
POST /api/v1/account/attestations/{attestationId}/public-proof-requests
```

### Committee operations

```text
POST /api/v1/committee/sessions
POST /api/v1/committee/sessions/{sessionId}/check-ins
POST /api/v1/committee/sessions/{sessionId}/decisions
POST /api/v1/committee/attestations/{attestationId}/issue
POST /api/v1/committee/attestations/{attestationId}/revoke
POST /api/v1/committee/cycles
POST /api/v1/committee/cycles/{cycleId}/commit-snapshot
POST /api/v1/committee/cycles/{cycleId}/derive-selection
POST /api/v1/committee/cycles/{cycleId}/publish-report
```

### Relying party

```text
POST /api/v1/attestations/status
GET  /api/v1/attestations/{opaqueReference}/public
GET  /api/v1/provenance/anchors/{anchorId}
GET  /api/v1/provenance/verify/{anchorId}
```

Every write requires actor type, authorization, idempotency key, rate limit, domain-state validation, and audit event.

## 16. Privacy requirements

- No identity-document upload on the public site or PWA.
- No raw evidence on-chain.
- No hidden exact-address dossier.
- No public participant list by default.
- No relying-party access to evidence packages.
- No private evidence in logs, traces, analytics, queues, notifications, or error reports.
- Collect broad jurisdiction only when required for routing.
- Separate contact data, attendance, evidence metadata, status, and public reports into security domains.
- Publish purpose, access, retention, correction, deletion, and disclosure rules before collection.
- Identify a privacy-responsible role and public contact before pilot.
- Complete jurisdiction-specific legal/privacy review before real participants.

## 17. Security requirements

- Threat-model replay, QR/deep-link substitution, callback forgery, wrong-chain response, stale identity state, signer compromise, committee collusion, selection manipulation, evidence leak, enumeration, public correlation, oversized payloads, accidental mainnet writes, duplicate writes, and chain reorganizations.
- Use TLS, secure cookies, CSRF protection, strict CORS, content-security policy, input validation, parameterized data access, secret management, and least privilege.
- Require strong authentication, re-authentication, and role separation for committee and steward actions.
- Keep `verusd` RPC on localhost or a private network.
- Redact RPC bodies and wallet payloads from logs where they may contain sensitive information.
- Use transactional outbox and immutable audit history.
- Test backup restoration and emergency revocation/suspension.
- Establish private security reporting before public deployment.

## 18. Accessibility and inclusion

The participant PWA, public verifier, directory, and committee console target WCAG 2.2 AA.

Requirements include:

- keyboard and screen-reader operation;
- sufficient contrast and scalable text;
- plain-language status and error explanations;
- no QR-only critical path;
- alternatives to a smartphone where operationally possible;
- accommodation requests without unnecessary medical detail;
- accessible physical-session information;
- non-government-ID pathways where approved; and
- review of exclusion risk in every evidence, locality, uniqueness, and renewal RFC.

## 19. Non-functional requirements

### Reliability

- Idempotent writes and retry-safe jobs.
- Database transactions for state, audit, and outbox.
- Verus readback and reconciliation.
- Backup and restore testing.
- Graceful degradation when Verus, email, or a relying party is unavailable.

### Performance

Proposed pilot targets, subject to load testing:

- authenticated application reads: p95 under 500 ms excluding third-party calls;
- public status decision from canonical database: p95 under 400 ms;
- wallet callback acknowledgement: under 2 seconds before asynchronous reconciliation;
- no synchronous wait for chain confirmation in a browser request.

### Scalability

- Multi-committee data model from the start.
- Queue-backed notifications and Verus work.
- Read-only caching for public policy/schema data.
- No participant enumeration cache.

### Maintainability

- TypeScript strict mode.
- OpenAPI-generated clients.
- domain logic independent of UI and transport.
- migrations with rollback/forward-fix plan.
- architecture decision records.
- pinned versions for security-sensitive wallet and daemon compatibility.

## 20. Success measures

Pilot success is not measured by maximizing the number of identities collected. It is measured by safe, accurate execution.

### Readiness measures

- 100% of public claims map to approved status or are labelled planned.
- 100% of active attestations expire server-side at or before 45 days.
- 0 identity documents uploaded through the public application.
- 0 private keys or seed material processed by the service.
- 0 mainnet writes before approval.
- 100% of Verus writes read back and reconciled.
- 100% of committee decisions linked to policy versions and audit events.
- Complete accessibility, privacy, legal, security, backup, and incident gates.

### Pilot operational measures

- appointment completion and no-show rates;
- median session processing time without incentivizing rushed review;
- percentage of decisions needing more information;
- appeal and correction rates;
- expiry and renewal correctness;
- selection reproducibility;
- notification delivery;
- wallet-flow success by pinned Android/iOS version;
- status API correctness and privacy-abuse events;
- incidents, near misses, and participant complaints.

## 21. Release phases and gates

### Phase 0 — Repository and governance

Deliver licence, DCO, governance, contribution, security, accurate README, PRD, architecture, subdomain plan, and issue roadmap.

**Exit:** no repository document claims missing software is live.

### Phase 1 — Protocol specification

Deliver committee formation, evidence, privacy/retention, accessibility, appeals/recovery, uniqueness/locality boundaries, 45-day selection, signing threshold, VDXF namespace, schemas, and `auth.md`.

**Exit:** every product claim maps to an approved rule or remains disabled and labelled unfinished.

### Phase 2 — VRSCTEST spine

Deliver app and committee test identities, wallet authentication, RPC adapter, outbox, VDXF derivation, signed fixtures, anchor/write/readback fixtures, revoked/expired fixtures, and compatibility matrix.

**Exit:** deterministic test fixtures verify end to end without mainnet.

### Phase 3 — Participant and committee prototype

Deliver account, optional Verus link, request/schedule/check-in/review/decision/issue/status/expire/revoke/appeal flows with synthetic data.

**Exit:** a simulated session completes the lifecycle with no raw evidence storage.

### Phase 4 — Forty-five-day renewal

Deliver cycle objects, snapshot commitment, deterministic selection, private notices, no-show/deferral logic, renewal, and aggregate reports.

**Exit:** selection is reproducible and does not disclose private participants.

### Phase 5 — Verifier and relying-party integration

Deliver anti-enumeration status flow, public verifier, client registration, schemas, SDK, terms, and disabled RMR adapter.

**Exit:** an authorized RMR test client receives minimum status and no evidence.

### Phase 6 — Pilot readiness

Complete legal, privacy, security, accessibility, incident, backup, operational staffing, VRSCTEST rehearsal, and public status review.

**Exit:** steward expressly approves a limited pilot; no session opens automatically.

### Phase 7 — Mainnet decision

Evaluate whether any mainnet function is necessary, proportionate, consented, recoverable, and operationally supportable.

**Exit:** separate written decision. Mainnet remains disabled if the case is not proven.

## 22. Open protocol decisions

The application must not hard-code these until approved:

1. final twelve-member formation rule and jurisdiction exceptions;
2. initial decision quorum and whether two-of-three applies;
3. renewal group size and signer selection;
4. uniqueness/duplicate-prevention method and assurance label;
5. locality evidence, precision, visibility, and independent validation;
6. constituency mapping responsibility;
7. random selection rate, entropy, salt, replacement, and proof publication;
8. no-show grace, deferral, accessibility, and remote exception rules;
9. evidence metadata, copying, hashing, retention, and destruction;
10. appeal independence, deadlines, and remedies;
11. participant and committee recovery/revocation procedures;
12. public proof-reference contents and opt-in withdrawal consequences;
13. committee mobile multisig support versus controlled worker fallback;
14. relying-party authorization and anti-enumeration model;
15. pilot jurisdiction and publication of precise locations; and
16. whether any mainnet write is needed at all.

## 23. Definition of done

The product is pilot-ready only when:

- [ ] website, README, protocol status, and deployed feature flags agree;
- [ ] all protocol decisions used by code are approved and versioned;
- [ ] account and committee authorization are independently tested;
- [ ] VerusID linking is optional and wallet keys never reach the server;
- [ ] no raw evidence is uploaded or written on-chain;
- [ ] 45-day expiry is enforced server-side;
- [ ] renewal selection is reproducible and privacy-safe;
- [ ] status cannot be used to enumerate participants by default;
- [ ] RMR receives only approved minimum status;
- [ ] Verus work is asynchronous, idempotent, testnet-gated, and read back;
- [ ] Android and iOS flows pass the pinned compatibility matrix;
- [ ] revocation, recovery, appeal, suspension, and incident drills pass;
- [ ] backup restoration passes;
- [ ] WCAG 2.2 AA review passes;
- [ ] legal and privacy review approves the pilot documents and operations;
- [ ] monitored security, privacy, conduct, and support contacts are published;
- [ ] no planned capability is presented as operational; and
- [ ] Checks and Balances Committee Ltd. expressly approves the pilot release.
