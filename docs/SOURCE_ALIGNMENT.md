---
title: Website and Development Guide Alignment Matrix
version: 1.0
status: Active source traceability
last_updated: 2026-08-05
---

# Source Alignment Matrix

This document shows how the current **Checks & Balances Protocol** website and the **Checks and Balances Verification Protocol — Verus Development Guide** map into the repository’s product requirements, architecture, schemas, and GitHub issues.

It exists to prevent three failures:

1. building from an older cached grievance-oriented version of the website;
2. treating an historical issue or mockup as an approved protocol rule; and
3. implementing technically plausible Verus behaviour that contradicts the current privacy, lifecycle, or release posture.

## 1. Source priority

Use this order when sources conflict:

1. approved, versioned protocol/policy decisions and `docs/PROTOCOL_STATUS.md`;
2. the current public pages branded **Checks & Balances Protocol**;
3. the current PRD, architecture, privacy, threat, Verus Mobile, and implementation documents;
4. approved GitHub issue/RFC decisions;
5. the attached Verus Development Guide as technical planning and audit input;
6. historical archive material and superseded issue language.

Historical material remains context. It does not override current public commitments, privacy boundaries, or explicit unfinished status.

## 2. Current website identity and route inventory

The current site navigation contains these eleven project pages:

```text
/
/how-we-check-power/
/how-verification-works/
/start-a-committee/
/find-a-committee/
/verified-humans/
/developers/
/protocol-foundations/
/civic-roadmap/
/privacy-and-data/
/archive/
```

The repository README and issue #8 require those routes, the application status endpoint, and deployed product copy to remain synchronized.

## 3. Page-by-page traceability

### 3.1 Home — `checksandbalances.services/`

**Current public commitments**

- Bots, fake accounts, and manufactured participation are the motivating problem.
- Twelve local neighbours are the public-facing committee model.
- Verification occurs face to face.
- A participant receives a portable credential they control.
- Every attestation expires after 45 days.
- Random community renewal is part of the intended lifecycle, while exact group size, thresholds, appeals, and recovery remain unfinished.
- Government ID may be one evidence pathway but is not necessarily the only pathway.
- Connected uses include petitions, public comment, votes, job boards, mutual aid, civic platforms, cooperatives, and human-directed agents.
- Rate My Representatives is the connected accountability application, but credential integration is planned rather than operational.
- British Columbia/Kelowna is the first pilot area being prepared; the directory and sessions are not live.
- Identity documents are not collected on the public site.
- Baseline verification does not automatically prove legal residence, community consensus, truth, or political agreement.

**Repository implementation**

- `README.md` current status, product boundaries, lifecycle, and release gates.
- `docs/PRD.md` goals, non-goals, user journeys, 45-day lifecycle, RMR boundary, and release phases.
- `docs/PROTOCOL_STATUS.md` fixed versus unfinished status.
- `docs/PRIVACY_AND_DATA.md` no public document upload and minimum disclosure.
- `schemas/cbc-human-attestation.schema.json` explicit claim limitations.

**Tracking issues**

- #3 committee formation.
- #4 renewal rules.
- #8 website/status synchronization.
- #10 in-person session workflow.
- #11 Kelowna pilot.
- #20 participant PWA.
- #29 uniqueness.
- #30 locality.
- #31 quorum/signing.

### 3.2 How We Check Power — `/how-we-check-power/`

**Current product relationship represented across the current site**

- Checks & Balances Protocol verifies the people participating in accountability.
- Rate My Representatives is the separate application that organizes representative profiles, public records, evidence, citizen evaluations, official responses, corrections, and outcomes.
- A verified-human status does not make a civic statement true or prove what a whole community thinks.
- Representative-accountability methodology and moderation belong to RMR, not to the verification committee.

**Repository implementation**

- `README.md` “Product boundaries”.
- `docs/PRD.md` sections 1, 4, 6, 7, and FR-RP requirements.
- `docs/PRIVACY_AND_DATA.md` RMR boundary.
- `schemas/cbc-public-status.schema.json` minimum typed status and claim limitations.

**Tracking issues**

- #6 verifier/status API.
- #7 relying-party terms and RMR adapter.
- #8 current website alignment.
- #14 master roadmap.

### 3.3 How Verification Works — `/how-verification-works/`

**Current public commitments**

- Baseline human attestation means a real person appeared and matched the credential photo or approved evidence pathway.
- Uniqueness is conditional on a separately defined duplicate-prevention method.
- Local connection is separately defined and is not automatically legal residence.
- Constituency eligibility requires separate geographic/application rules.
- Baseline verification does not automatically establish legal residence, citizenship, voting eligibility, constituency eligibility, or truth.
- Initial approval is followed by universal 45-day expiry and a planned randomly assigned renewal process.
- Exact renewal group size, signature thresholds, appeals, and recovery remain unfinished.

**Repository implementation**

- `docs/PRD.md` claim separation, lifecycle, FR-EVID/DEC/ATT/CYC/APR.
- `docs/PROTOCOL_STATUS.md` status matrix.
- `schemas/cbc-human-attestation.schema.json` typed assurance and explicit `legalResidenceClaim: false`.
- `docs/THREAT_MODEL.md` false assurance, duplicate, locality, and state-machine threats.

**Tracking issues**

- #2 schemas/VDXF.
- #4 renewal.
- #10 session workflow.
- #12 policy/legal/privacy.
- #22 attestation lifecycle.
- #29 uniqueness.
- #30 locality.
- #31 quorum/signing.

### 3.4 Start a Committee — `/start-a-committee/`

**Current public commitments**

- A committee is a public responsibility, not merely a software account.
- Formation requires trusted volunteers, clear session procedures, accessibility planning, and local accountability.
- Evidence is broader than one document; acceptable pathways, exceptions, and appeals remain unfinished.
- Kelowna is forming; directory listings, calendars, legal documents, and privacy rules are not operational until explicitly published.

**Repository implementation**

- `GOVERNANCE.md` roles and decision classes.
- `docs/PRD.md` FR-COM and committee lifecycle.
- `docs/ARCHITECTURE.md` committee registry and role boundaries.
- `docs/PRIVACY_AND_DATA.md` evidence non-retention.
- `docs/THREAT_MODEL.md` committee capture, conflict, and physical-session threats.

**Tracking issues**

- #3 committee formation/recognition.
- #9 committee VerusID.
- #12 legal/privacy documents.
- #21 committee console.
- #31 quorum/signing/anti-capture.

### 3.5 Find a Committee — `/find-a-committee/`

**Current public commitments**

- The directory is not live.
- Kelowna is the first pilot area being prepared and no verification sessions are open.
- A future listing should identify jurisdiction, responsible organizers, session status, accessibility notes, and approval of privacy/evidence rules.
- Identity documents should not be sent online; review is designed to occur in person.

**Repository implementation**

- `README.md` planned application surfaces.
- `docs/SUBDOMAINS.md` directory host and route design.
- `docs/PRD.md` FR-DIR and session publication rules.
- `schemas/auth.md` committee discovery template.

**Tracking issues**

- #3 recognition gates.
- #5 `auth.md`.
- #8 website/status synchronization.
- #11 Kelowna pilot.
- #23 governed public directory.

### 3.6 What Verification Enables — `/verified-humans/`

**Current public commitments**

- Portable proof of human may support petitions, member votes, public comment, mutual-aid boards, local platforms, and accountable software without making every service an identity authority.
- Verification may help limit bots and Sybil attacks while keeping credential control with the participant.
- APIs, integrations, relying-party rules, and production credentials are not live.

**Repository implementation**

- `docs/PRD.md` goals, non-goals, relying-party and developer requirements.
- `docs/ARCHITECTURE.md` relying-party trust boundary.
- `schemas/cbc-public-status.schema.json` minimum response.
- `docs/PROTOCOL_STATUS.md` non-operational feature flags.

**Tracking issues**

- #6 verifier/status.
- #7 relying-party/RMR.
- #23 directory.
- #24 optional participant public proof.

### 3.7 Applications and Developers — `/developers/`

**Current public commitments**

- The architecture is conceptual and non-operational.
- A connected application should receive only minimum status: valid/expired/revoked/unavailable, human-attestation status, expiry/renewal, optional separately authorized locality, and a privacy-preserving proof/reference.
- Utility bills, identity documents, address dossiers, and committee evidence packages should not be shared.
- APIs, SDKs, schemas, test credentials, integrations, relying-party terms, and RMR integration are not live.

**Repository implementation**

- `docs/ARCHITECTURE.md` API, status, credential, and trust boundaries.
- `docs/PRD.md` FR-RP and FR-DEV.
- `docs/VERUS_MOBILE_INTEGRATION.md` participant-controlled wallet requests.
- `schemas/cbc-public-status.schema.json` and `schemas/auth.md`.
- `CODEX.md` implementation discipline.

**Tracking issues**

- #2 schemas.
- #5 discovery.
- #6 status API.
- #7 RMR adapter.
- #15–#19 foundation and Verus/wallet spine.
- #24 optional public proof.

### 3.8 Protocol Foundations — `/protocol-foundations/`

**Current public commitments**

- The core lifecycle is committee approval, expiring attestation, and random peer renewal.
- Direct Republic, Mirror-State, and Civic SOUL are wider foundations/roadmap concepts, not current lifecycle steps.
- Local responsibility for formation, evidence, privacy, and disputes must be understandable before scale.
- Group assignment, signature thresholds, privacy-preserving proofs, governance documents, and legal structures remain unfinished.

**Repository implementation**

- `docs/PROTOCOL_STATUS.md` distinguishes current protocol from roadmap concepts.
- `GOVERNANCE.md` RFC and decision classes.
- `docs/PRD.md` release gates and open decisions.
- `docs/THREAT_MODEL.md` local accountability and capture risks.

**Tracking issues**

- #3, #4, #12, #29, #30, and #31.
- #14 master roadmap.

### 3.9 Civic Roadmap — `/civic-roadmap/`

**Current public stages**

1. Prepare the pilot: formation, evidence, privacy, legal review, accessibility, and sessions.
2. Prove universal expiry and random community renewal.
3. Connect the first accountability application, RMR, while preserving system boundaries.
4. Test representative-accountability features and methodology.
5. Only later broaden to additional civic infrastructure and wider concepts.

**Repository implementation**

- `docs/IMPLEMENTATION_PLAN.md` WP-00 through WP-18.
- `docs/ISSUE_ROADMAP.md` phase and dependency mapping.
- issue #14 live master tracker.
- issue #32 separate mainnet decision prevents “blockchain deployment” from replacing staged proof.

**Tracking issues**

- #11 pilot.
- #13 renewal implementation.
- #7 RMR integration.
- #26–#28 deployment, assurance, rehearsal.
- #32 mainnet decision.

### 3.10 Privacy and Data — `/privacy-and-data/`

**Current public commitments**

- Identity is not the product.
- Locality rules must decide method, evidence handling, storage/hashing/return, precision, visibility, expiry, correction, and whether connected applications see evidence or only the result.
- Connected applications should receive the minimum attestation result, not the private evidence package.
- Planned RMR integration must not receive private committee evidence absent a future explicit lawful consent-based rule.

**Repository implementation**

- `docs/PRIVACY_AND_DATA.md` complete field/purpose/access/retention/disclosure model.
- `docs/THREAT_MODEL.md` enumeration, correlation, evidence leak, relying-party abuse, and chain privacy threats.
- `schemas/cbc-human-attestation.schema.json` and `cbc-public-status.schema.json` forbidden-field structure.
- `CONTRIBUTING.md` and `SECURITY.md` prohibit public sensitive submissions.

**Tracking issues**

- #6 anti-enumeration status.
- #7 RMR boundary.
- #10 no-image session workflow.
- #12 legal/privacy package.
- #24 optional public-chain proof.
- #25 retention/privacy operations.
- #30 locality.

### 3.11 Historical Archive — `/archive/`

**Current public rule**

- Historical claims and earlier ideas are preserved as context, not independent validation.
- Current public protocol commitments control when older material conflicts.
- The current core remains committee initial approval, 45-day expiry, and unfinished peer-renewal parameters.

**Repository implementation**

- `README.md` source-of-truth statement.
- `docs/PROTOCOL_STATUS.md` explicit current/archived distinction.
- issue #8 archive/canonical/caching safeguards.
- revised issues remove or explicitly supersede older assumptions about raw image capture, shareholder/silver-coin qualifications, unexplained two-of-three signing, unapproved namespace use, and numeric trust weighting.

## 4. Verus Development Guide traceability

### 4.1 Scope and claim discipline

**Guide direction**

- Separate proof of human, locality, uniqueness, constituency status, and public-accountability functions.
- Do not overstate what the baseline credential proves.

**Implemented in**

- `docs/PRD.md` problem, goals, non-goals, typed claims, and open decisions.
- `docs/PROTOCOL_STATUS.md` claim/status matrix.
- schemas and issues #29/#30.

### 4.2 Private canonical data plus minimum Verus provenance

**Guide direction**

- Use a private transactional database for people, meetings, decisions, expiry, appeals, and status.
- Use Verus for identity control, compact proofs, policy/schema/report anchors, and participant-approved references—not as an evidence database.

**Implemented in**

- `docs/ARCHITECTURE.md` PostgreSQL canonical store, trust boundaries, and publishing patterns.
- `docs/PRIVACY_AND_DATA.md` chain prohibitions.
- issue #18 private RPC/outbox worker.
- issue #2 VDXF/schema design.

### 4.3 Browser/API/worker/RPC boundary

**Guide direction**

```text
browser -> API -> database/outbox -> Verus worker -> private verusd RPC
```

**Implemented in**

- `README.md`, `docs/ARCHITECTURE.md`, and `docs/IMPLEMENTATION_PLAN.md`.
- issue #18.
- `docs/SUBDOMAINS.md` explicitly rejects a public RPC host.

### 4.4 Verus Mobile permissions and identity updates

**Guide direction**

- Use signed GenericRequest/GenericResponse flows for optional VerusID control/authentication.
- Use a separate explicit IdentityUpdateRequest only for participant-approved identity changes.
- Verify signer, network, nonce, expiry, identity state, callback, transaction, and readback.
- Never collect keys or seeds.

**Implemented in**

- `docs/VERUS_MOBILE_INTEGRATION.md` complete ceremonies and compatibility matrix.
- issue #19 optional account link.
- issue #24 optional public proof.
- issue #31 committee signing compatibility and custody.

### 4.5 VDXF namespace and contentmultimap discipline

**Guide direction**

- Derive VDXF IDs on VRSCTEST, use an owned namespace, preserve supported value structure, byte-size test, and read back exact content.
- Do not assume the older `vrsc::...` namespace is authorized.

**Implemented in**

- issue #2.
- `docs/VERUS_MOBILE_INTEGRATION.md` namespace rules.
- draft schemas.
- issue #18 worker guards and readback.

### 4.6 Forty-five-day expiry and renewal

**Guide direction**

- Expiry is universal and server-enforced.
- Renewal requires a reproducible, privacy-conscious selection method with public entropy/commitment and no private operator targeting.

**Implemented in**

- PRD FR-CYC and exact-expiry requirements.
- issues #4 and #13.
- `docs/THREAT_MODEL.md` selection manipulation, privacy leak, no-show, clock, and reorg threats.

### 4.7 Committee authority and recovery

**Guide direction**

- Distinguish committee members, reviewers, signers, authorities, recovery, revocation, and operational custody.
- Do not assume mobile multisig capability.

**Implemented in**

- issues #3, #9, and #31.
- `docs/ARCHITECTURE.md` role and trust boundaries.
- `GOVERNANCE.md` decision classes.

### 4.8 Developer and relying-party interfaces

**Guide direction**

- Version OpenAPI, schemas, `auth.md`, SDKs, fixtures, status semantics, and relying-party terms.
- RMR receives minimum status only.

**Implemented in**

- PRD FR-RP/FR-DEV.
- issues #5, #6, #7, and #23.
- `schemas/auth.md` and `cbc-public-status.schema.json`.

### 4.9 Testnet, security, and release gates

**Guide direction**

- VRSCTEST first.
- Test expired/revoked/recovered identities, duplicate writes, reorgs, RPC failures, wallet compatibility, privacy, security, backups, accessibility, and operations.
- Do not open a pilot because code exists.

**Implemented in**

- `docs/THREAT_MODEL.md` forty threat classes.
- `docs/IMPLEMENTATION_PLAN.md` WP-15 through WP-18.
- issues #26, #27, #28, #11, and #32.

## 5. Superseded legacy assumptions

These are not authoritative current requirements:

| Legacy assumption | Current treatment |
|---|---|
| Capture and store photo ID plus live participant photo | Rejected for MVP; in-person review with minimum metadata and no upload/camera module. See #10. |
| Every committee member must be a shareholder or hold a silver coin | Not supported by current public protocol; excluded unless a future reviewed policy expressly adopts it. See #3. |
| Fixed “2-of-3 from 12” | Incomplete proposal; blocked on explicit reviewer/quorum/signing/capture/recovery RFC #31. |
| `vrsc::identity.attestation.cbc.*` namespace | Not assumed authorized; use a project-controlled namespace after issue #2. |
| Numeric `trust_weight` values for citizens or committee members | Not approved; CBC returns typed attestation status, not a social-credit/reputation score. See #7. |
| Public VerusID status lookup for anyone | Replaced by participant-presented or approved anti-enumeration status flows. See #6. |
| Per-person public chain record required | Not required; private canonical status plus signed proof/anchors first. Optional participant public reference is issue #24. |
| Mainnet after testnet as an automatic step | Rejected; issue #32 requires a separate evidence-based necessity decision. |

## 6. Change-control rule

When a website page, PRD rule, schema, GitHub issue, or implementation changes materially:

1. identify the source and affected claim;
2. update `docs/PROTOCOL_STATUS.md` first where status changes;
3. update this matrix, the PRD/architecture/privacy/threat documents, and schemas as applicable;
4. update issue #14 and `docs/ISSUE_ROADMAP.md`;
5. add migration, compatibility, public-copy, and release implications;
6. obtain the required RFC/steward/legal/privacy/security/accessibility approval; and
7. enable the feature only through an approved release record.

A commit or deployed route does not change protocol status by itself.
