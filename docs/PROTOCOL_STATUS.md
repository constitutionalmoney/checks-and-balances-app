---
title: Checks & Balances Protocol Status Matrix
version: 1.0
status: Proposed
last_updated: 2026-08-05
---

# Protocol Status Matrix

This document is the repository’s public truth table for what is **fixed**, **proposed**, **unfinished**, **planned**, or **operational**. It prevents a design mockup, issue, code path, test fixture, or historical website statement from being mistaken for an approved protocol rule.

## Status vocabulary

| Status | Meaning |
|---|---|
| `public_commitment` | Current public protocol pages state the rule. Implementation and operational readiness may still be incomplete. |
| `approved_specification` | The steward has approved a versioned rule for implementation. |
| `proposed` | A concrete design exists but has not been approved as protocol. |
| `unfinished` | The question is publicly acknowledged but the rule is not resolved. |
| `planned` | Product or technical capability is on the roadmap and not live. |
| `planned_optional` | Optional roadmap capability that is not required for the baseline protocol and remains disabled by default. |
| `planned_review_required` | Planned document or capability that requires external or jurisdiction-specific review before use. |
| `recommended` | Recommended application implementation choice rather than a protocol claim. |
| `recommended_architecture` | Recommended technical architecture rather than an operational capability or immutable protocol rule. |
| `testnet_only` | Implemented or tested only on VRSCTEST; it conveys no production assurance. |
| `pilot_approved` | Expressly approved for a limited, published pilot. |
| `operational` | Deployed and supported for the stated environment and scope. |
| `limited` | Permitted only within a narrowly defined assistance or operational boundary. |
| `not_required` | The baseline protocol does not require the capability or disclosure. |
| `not_approved` | The proposal exists or existed but has not been approved and must not be implemented as authoritative. |
| `out_of_scope` | The baseline protocol does not make or determine this claim. |
| `prohibited` | The capability or data use is forbidden under the current protocol posture. |
| `prohibited_pending_decision` | Forbidden unless a separate future decision expressly approves a narrowly defined use. |
| `deprecated` | Retained for historical compatibility but not valid for new use. |
| `archived` | Historical context that does not control the current protocol. |

## Current protocol status

| Area | Current status | Controlling statement | Build treatment |
|---|---|---|---|
| Project identity | `public_commitment` | Current site is the **Checks & Balances Protocol** and related committee project. | Use current protocol language; historical archive does not override it. |
| Project stage | `public_commitment` | Pilot preparation; no open public sessions. | All production and public-pilot features disabled. |
| Geographic rollout | `public_commitment` | British Columbia first; Kelowna pilot is forming. | Seed synthetic/testnet Kelowna data only until pilot approval. |
| In-person review | `public_commitment` | Verification includes face-to-face human review. | Required state transition before approval. |
| Forty-five-day expiry | `public_commitment` | Every attestation expires after 45 days. | Enforce in domain and status service; no UI-only expiry. |
| Renewal | `public_commitment` + `unfinished` | Current status must be renewed; random peer mechanics remain unfinished. | Implement framework and feature flags; do not hard-code selection rules before RFC approval. |
| Twelve-person committee | `public_commitment` + `proposed` | Public story uses twelve neighbours/local members; formation rule needs formal scope and exceptions. | Model minimum member policy as a versioned parameter; default test fixture may use 12. |
| Two-of-three signing | `proposed` | Older issues proposed two-of-three without defining which three, for which action, or how selected. | No production constant; blocked on signing/quorum RFC. |
| Committee-member qualifications | `unfinished` | Current protocol pages do not support older requirements such as shareholder status or owning a silver coin. | Exclude those requirements unless a later approved policy adopts them. |
| Human-presence claim | `public_commitment` | A real person appeared and completed the approved process. | Baseline attestation claim. |
| Photo/evidence match | `public_commitment` + `unfinished` | Person matches a credential photo or approved evidence path; exact alternatives remain unfinished. | Versioned evidence-path policy; no document upload. |
| Uniqueness / duplicate prevention | `unfinished` | Baseline proof must not overclaim one-person-one-credential. | Separate assurance claim, disabled until RFC and tests pass. |
| Locality | `unfinished` | Local connection is distinct from human presence and legal residence. | Store separately typed method and precision; no legal-residence inference. |
| Citizenship / voting eligibility | `out_of_scope` | Baseline attestation does not prove either. | Never infer or expose these claims. |
| Civic intent / political view | `out_of_scope` | Verification does not prove agreement, truth, support, opposition, or consensus. | No political field in verification record. |
| Public directory | `planned` | Directory is not live. | Show empty/pilot-preparation state until committees pass recognition gates. |
| Participant account | `planned` | Application account flow is not live. | Build on test/staging with synthetic users first. |
| Passkey/email authentication | `recommended` | Technical implementation choice, not a protocol claim. | Implement as application authentication. |
| VerusID linking | `planned` | Participant-controlled identity integration is planned. | Optional, VRSCTEST-only until approved. |
| Verus Mobile authentication | `planned` | Signed wallet request/response flow is planned. | Compatibility spike and replay-safe implementation required. |
| Participant identity update | `planned_optional` | An opt-in public proof reference may be added only with explicit wallet approval. | Feature flag off by default; never required for baseline status. |
| Committee VerusID | `planned` | Committee identity and authority will use Verus. | Provision and rehearse on VRSCTEST with recovery and revocation. |
| VDXF namespace | `unfinished` | Older `vrsc::...` proposal is not approved; use an owned namespace unless authority is documented. | Block schema finalization until namespace decision and `getvdxfid` fixtures. |
| On-chain raw evidence | `prohibited` | Connected apps receive minimum status, not the evidence dossier. | Schema and worker reject forbidden fields and oversize payloads. |
| Private canonical database | `recommended_architecture` | Operational records require a private transactional store. | PostgreSQL is canonical for people, sessions, decisions, appeals, and status. |
| Privacy-safe anchors | `planned` | Schema/policy/cycle-report provenance may be anchored. | VRSCTEST worker, asynchronous and read back. |
| Public per-person chain record | `not_required` | Baseline verification must not require public linkability. | Use private status plus signed credential/anchor first. |
| Status API | `planned` | APIs and SDKs are not live. | Build versioned anti-enumeration API in staging/testnet. |
| Rate My Representatives integration | `planned` | Separate project; integration is not operational. | Disabled-by-default adapter returns minimum approved status only. |
| Composite trust weighting | `not_approved` | A verification status is not a social-credit or reputation score. | Do not implement legacy numeric trust weights. |
| AI assistance | `limited` | Agents may help navigate and prepare work but cannot perform human acts. | No agent actor can attend, consent, approve, sign, or manufacture civic intent. |
| Legal templates | `planned_review_required` | Drafts require jurisdiction-specific review. | Mark every template `DRAFT — NOT LEGAL ADVICE`. |
| Mainnet | `prohibited_pending_decision` | VRSCTEST precedes any mainnet use. | Mainnet writes blocked by configuration, code guard, and release policy. |

## Feature flags required from first scaffold

```text
CBC_ENVIRONMENT=testnet
CBC_PUBLIC_DIRECTORY_ENABLED=false
CBC_PUBLIC_SESSIONS_ENABLED=false
CBC_VERUS_LINKING_ENABLED=false
CBC_VERUS_IDENTITY_UPDATE_ENABLED=false
CBC_COMMITTEE_SIGNING_ENABLED=false
CBC_RANDOM_RENEWAL_ENABLED=false
CBC_RMR_ADAPTER_ENABLED=false
CBC_MAINNET_WRITES_ENABLED=false
CBC_DOCUMENT_UPLOAD_ENABLED=false
CBC_UNIQUENESS_CLAIM_ENABLED=false
CBC_LOCALITY_CLAIM_ENABLED=false
```

`CBC_DOCUMENT_UPLOAD_ENABLED` must remain false unless legal, privacy, security, retention, deletion, access, and incident requirements are approved. `CBC_MAINNET_WRITES_ENABLED` must not be activated merely through an environment-variable change; production activation also requires an approved release artifact and server-side network allowlist.

## Public-copy rule

Every user-facing capability must be labelled from server-controlled release metadata:

- `Not available`
- `In specification`
- `VRSCTEST demonstration`
- `Limited pilot`
- `Operational`

Do not hand-write “live” into a page or client bundle. The public website, participant app, committee console, API status endpoint, developer documentation, and repository must derive or reconcile against the same release record.

## Change control

A change from `proposed` or `unfinished` to `approved_specification` requires:

1. a linked RFC or policy document;
2. alternatives and risks;
3. privacy, security, accessibility, and exclusion analysis;
4. test plan and rollback path;
5. steward approval; and
6. an update to this matrix before the implementation is enabled.

A code merge alone does not change protocol status.
