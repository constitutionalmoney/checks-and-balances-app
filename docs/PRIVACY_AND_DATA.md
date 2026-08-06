---
title: Privacy and Data Requirements
version: 1.0
status: Proposed; legal and privacy review required
last_updated: 2026-08-05
jurisdiction_focus: British Columbia, Canada pilot preparation
---

# Privacy and Data Requirements

> **DRAFT — NOT LEGAL ADVICE.** This document is a product and engineering control specification. It requires review by qualified privacy/legal counsel and the organization’s designated privacy-responsible person before real participant data is collected.

## 1. Privacy objective

The Checks & Balances Protocol should establish and maintain the minimum current attestation needed by an approved use case without creating a reusable identity dossier.

The system must preserve these separations:

- account identity versus in-person human review;
- human presence versus uniqueness;
- human presence versus locality or legal residence;
- private evidence versus public status;
- operational records versus public aggregate reports;
- Checks & Balances Protocol status versus Rate My Representatives activity; and
- optional Verus public proof versus baseline private status.

## 2. Non-negotiable rules

1. No identity-document upload through the public website, participant PWA, public verifier, or ordinary support channel.
2. No private keys, seed phrases, WIFs, z-seeds, wallet files, spending keys, or RPC secrets in application data.
3. No raw evidence, face image, document number, exact address, utility bill, private committee note, or appeal detail on-chain.
4. No relying-party access to the evidence package.
5. No public participant directory by default.
6. No unrestricted status lookup by name, email, address, VerusID, or other enumerable identifier.
7. No analytics, logging, tracing, or notification system may receive sensitive fields merely because the application can access them.
8. No claim of legal residence, citizenship, voting eligibility, constituency eligibility, uniqueness, or political intent without a separately approved purpose and method.
9. No real participant collection before the privacy notice, consent records, retention schedule, access/correction process, breach plan, processor contracts, and responsible contact are approved.
10. No raw production data in development, test fixtures, screenshots, issue reports, pull requests, or AI prompts.

## 3. Data inventory and classification

| Class | Examples | Default access | Public/on-chain rule |
|---|---|---|---|
| `PUBLIC_PROTOCOL` | Approved schema, policies, protocol status, public committee metadata, aggregate reports | Public | May be published/anchored after approval |
| `ACCOUNT_CONTACT` | Email, passkey credential metadata, contact preference | Participant, narrowly authorized support/security | Never public or on-chain |
| `IDENTITY_LINK` | VerusID i-address, proof time, app signer, consented scope | Participant, auth/security services | Public only if already public through Verus; local linkage remains private |
| `SESSION_ROUTING` | Broad jurisdiction, appointment, exact session location, accessibility request | Participant, authorized committee operations | Exact/private details not public by default |
| `EVIDENCE_REVIEW` | Evidence-path category, policy version, return/copy/hash status, reviewer result | Authorized reviewers/privacy/appeal roles | Never public or on-chain as raw record |
| `ATTESTATION_PRIVATE` | Internal subject ref, issuer, status, validity, typed claims, audit reference | Participant and authorized status services | Minimum projection only |
| `APPEAL_RESTRICTED` | Grounds, submissions, reviewer notes, outcome rationale | Participant and independent authorized roles | Public status exposes no sensitive grounds |
| `SECURITY_SENSITIVE` | Session tokens, recovery state, rate-limit signals, incident data | Security systems/personnel | Never public; redact logs |
| `SECRET_NEVER_STORE_OR_LOG` | Private keys, seeds, RPC passwords in request bodies | No application user/data store | Prohibited |

Every database field, event payload, API response, log field, metric label, queue message, export, and on-chain manifest must have a classification.

## 4. Purpose limitation

### Participant account

Purpose:

- authenticate the participant;
- communicate about requested sessions, expiry, renewal, appeal, security, and privacy rights; and
- display the participant’s own records.

Do not reuse contact data for political profiling, unrelated marketing, representative ratings, fundraising, or public matching without a separate lawful purpose and consent where required.

### Optional VerusID link

Purpose:

- prove control of a selected VerusID for the application request;
- provide participant-controlled authentication or portability; and
- support an optional public-proof request if later enabled.

It does not establish human presence or committee approval.

### Session routing

Purpose:

- identify an appropriate approved session;
- manage capacity, accessibility, cancellation, and safety; and
- document attendance privately.

Collect broad jurisdiction or chosen session rather than a home address wherever possible.

### Evidence review

Purpose:

- let authorized reviewers apply the approved evidence pathway in person; and
- record enough metadata to audit the decision and support appeal.

The product must begin with no document/photo capture module. Seeing evidence does not imply copying it.

### Attestation and status

Purpose:

- maintain current validity, expiry, revocation, supersession, and policy versions;
- allow the participant to understand and present status; and
- answer approved minimum relying-party checks.

### Aggregate reporting

Purpose:

- demonstrate that cycles and safeguards operated; and
- enable public accountability without exposing participants.

Apply small-cell suppression and generalization.

## 5. Collection specification

### Pre-registration may collect

- internal account identifier;
- verified email or passkey metadata;
- preferred contact channel;
- broad jurisdiction or chosen session;
- accessibility/accommodation request in minimum form;
- optional VerusID link;
- consent and notice versions; and
- security metadata required for abuse prevention.

### Pre-registration must not collect

- identity-document scan or photo;
- selfie/live face image;
- document number;
- date of birth unless a separately approved age rule requires it;
- social insurance number;
- complete home address by default;
- utility-bill copy;
- political affiliation or representative rating;
- private wallet material; or
- unrelated profile data.

### In-person review may record only under approved policy

- evidence-path type;
- policy version;
- whether the evidence was visually inspected;
- whether locality was declared, document-supported, or not assessed;
- whether any material was returned, copied, hashed, or not retained;
- authorized reviewer result;
- conflict declaration;
- reason category; and
- appeal availability.

Default retention state: `not_retained`.

## 6. Evidence handling

### Default design

The application is a decision-recording tool, not a document repository.

At the session:

1. participant presents approved evidence directly to human reviewers;
2. reviewers inspect under the versioned policy;
3. reviewers return the evidence;
4. application records the allowed category/result, not the document contents;
5. no camera or upload button is present; and
6. no document data appears in audit logs or notifications.

### Any future copy/hash proposal

Before implementing copying or hashing, the RFC must establish:

- necessity and less-invasive alternatives;
- legal authority and notice;
- exact data elements;
- access roles;
- encryption and key management;
- retention and deletion deadline;
- breach consequences;
- participant rights;
- dictionary/correlation risk of hashes;
- backup deletion behaviour;
- cross-border processor/storage location; and
- prohibition or controls for on-chain publication.

A hash of predictable personal data is not automatically anonymous.

## 7. Consent and notice records

Consent cannot cure every privacy problem, but the system must record meaningful user acknowledgement where consent is the selected basis.

A consent receipt includes:

```json
{
  "subjectRef": "internal-or-opaque-reference",
  "documentType": "privacy_notice | evidence_policy | verus_link | public_proof | relying_party_disclosure",
  "documentVersion": "version",
  "purpose": "specific-purpose",
  "action": "accepted | declined | withdrawn",
  "presentedAt": "RFC3339",
  "actedAt": "RFC3339",
  "language": "en-CA",
  "interfaceVersion": "version",
  "proof": "minimum-audit-metadata"
}
```

Requirements:

- provide plain-language summary and complete document;
- separate required operations from optional Verus linking/public proof;
- no pre-checked optional consent;
- preserve the version presented;
- explain withdrawal consequences honestly;
- re-consent where a material new purpose is introduced; and
- do not make public chain publication sound fully erasable.

## 8. Access model

### Participant

May view own account, requests, sessions, consent receipts, attestation status, expiry, approved public projection, appeals, and disclosed relying-party activity where policy allows.

### Committee scheduler

May access scheduling/contact details required for the assigned committee/session. No evidence or decision access unless separately authorized.

### Reviewer

May access the session participant at check-in/review time and permitted prior records required by policy. No bulk participant search.

### Privacy officer

May access data required to answer rights requests and investigate privacy incidents. Access is audited and purpose-bound.

### Security officer

May access security metadata and suspend credentials/sessions. Evidence access is not automatic.

### Support

Uses masked/minimum views. Support cannot approve, revoke, alter evidence results, or disclose another participant’s status.

### Relying party

Receives only approved minimum status through an opaque, consented, or credential-based flow.

## 9. Retention schedule framework

Exact periods require legal and operational review. The engineering system must support per-record rules rather than one global “keep forever” policy.

| Record | Proposed baseline | Trigger | Disposal |
|---|---|---|---|
| Failed/expired wallet challenge payload | Hours to limited days | Terminal challenge | Delete payload; retain minimal security audit as approved |
| Active account/contact | While account active and needed | Closure/inactivity | Delete or de-identify subject to obligations |
| Passkey credential metadata | While credential active | Removal/account closure | Delete after security retention window |
| Session request not attended | Short operational period | Cancellation/no-show | Delete/minimize after appeal/fraud window |
| Evidence review metadata | Minimum period needed for appeal/audit | Final decision | Delete/minimize according to approved schedule |
| Raw evidence/document copy | None by default | N/A | Prohibited unless separate policy |
| Attestation validity/status history | Period needed for audit, dispute, and integrity | Expiry/revocation | Retain minimum immutable history; remove unnecessary personal linkages where permitted |
| Appeal file | Defined legal/appeal period | Final outcome | Delete/minimize after obligations |
| Security logs | Short risk-based period | Event time | Rotate/delete with incident holds |
| Audit events | Longer integrity period | Event time | Minimize fields; retain under approved governance schedule |
| Public aggregate report | Long-term public record | Publication | Retain; contains no private participant data |
| On-chain anchor/reference | Effectively persistent | Publication | Publish only minimum approved content; supersede rather than promise deletion |
| Backups | Short rolling window | Backup creation | Expire automatically; document restoration/deletion lag |

Do not implement final durations as arbitrary constants. Store retention policy/version and calculate disposition dates.

## 10. Deletion, correction, and legal hold

The data service must support:

- participant access request;
- correction of inaccurate account/contact data;
- correction process for decision/status records without rewriting history;
- deletion or de-identification where permitted;
- unlinking optional local VerusID association;
- withdrawal of optional disclosures;
- legal/incident hold with recorded authority and scope;
- backup-expiry disclosure; and
- response tracking and audit.

An immutable audit or on-chain record may not be deletable in the ordinary sense. The system must minimize before publication, explain the limitation, and use revocation/supersession where appropriate.

## 11. Public status and anti-enumeration

Do not expose:

```text
GET /status?verusId=...
GET /status?email=...
GET /status?name=...
GET /status?address=...
```

Preferred patterns:

- high-entropy opaque reference presented by participant;
- short-lived audience-bound status token approved by participant;
- signed credential plus revocation/freshness check;
- QR generated in the participant app; or
- authenticated relying-party request with purpose, scope, and proof.

Controls:

- minimum response fields;
- rate limits per client/IP/risk signal;
- response uniformity for invalid references;
- no search or prefix matching;
- high-entropy references;
- audit and anomaly detection;
- client suspension; and
- privacy review of caching and observability.

## 12. Rate My Representatives boundary

The RMR adapter may receive only approved fields such as:

```json
{
  "status": "active | expired | revoked | unknown",
  "attestationType": "cbc.human.v1",
  "assuranceLevel": "pilot",
  "issuer": "approved-issuer-reference",
  "jurisdictionScopes": ["approved-broad-scope"],
  "validFrom": "RFC3339",
  "validUntil": "RFC3339",
  "policyVersions": {
    "evidence": "version",
    "privacy": "version"
  },
  "opaqueReference": "reference"
}
```

RMR must not receive:

- identity document or number;
- utility bill;
- exact home address;
- face image;
- committee notes;
- rejected evidence details;
- appeal grounds;
- complete session attendance history;
- private contact details; or
- numeric “trust weight” generated by CBC.

RMR use requires its own purpose, terms, privacy notice, security controls, and participant-facing explanation.

## 13. Verus and public-chain privacy

Use Verus for:

- participant-controlled identity authentication;
- committee identity and authority;
- compact signed proof/credential material;
- schema and policy anchors;
- privacy-safe cycle-report anchors;
- revocation/status-list commitments; and
- optional participant public reference after explicit approval.

Do not use Verus for:

- evidence storage;
- participant registry;
- exact-address record;
- complete status history by person;
- meeting attendance list;
- political activity; or
- internal appeal/audit dossier.

Before any on-chain field is approved, ask recursively:

```text
Is it necessary?
  If no -> do not publish.
  If yes -> can a digest/commitment prove the same thing?
      If yes -> publish only the commitment.
      If no -> can the participant present it privately instead?
          If yes -> keep it off-chain.
          If no -> document permanence, correlation, consent, and abuse risks before approval.
```

## 14. Vendors and processors

Before using an email, SMS, hosting, storage, observability, support, analytics, or security vendor, document:

- service and exact data fields;
- purpose;
- storage/processing location;
- subprocessors;
- security and breach terms;
- retention and deletion;
- access/support personnel;
- encryption;
- contract and privacy terms;
- export/exit plan; and
- whether the vendor uses data for its own training, advertising, profiling, or product purposes.

Do not place sensitive participant data in general-purpose analytics or AI services.

## 15. Logging, analytics, and support

### Never log

- request/response wallet payload bodies unless a temporary redacted debug mode is expressly approved;
- private keys/seeds;
- identity documents;
- face images;
- exact addresses;
- complete contact values;
- evidence notes;
- session tokens;
- RPC credentials; or
- appeal narratives.

### Safe operational fields

- correlation ID;
- actor type;
- operation;
- opaque committee/session/reference;
- result class;
- software version;
- latency;
- environment/network; and
- redacted error code.

Support exports use synthetic or redacted data. Screenshots must be reviewed before attachment to GitHub issues.

## 16. Privacy incidents

The incident plan must cover:

1. detection and internal escalation;
2. containment and credential/session revocation;
3. preservation of necessary incident evidence;
4. assessment of affected fields, people, systems, jurisdictions, and processors;
5. legal/regulatory and participant notification assessment;
6. recovery and monitoring;
7. public communication without compounding exposure;
8. root-cause and control correction; and
9. retention/disposal of incident records.

A public pilot cannot open until a monitored privacy contact and incident owner exist.

## 17. Required policy documents before pilot

- public privacy policy;
- in-person participant privacy notice;
- evidence review and non-retention policy;
- consent language and versions;
- committee confidentiality/access policy;
- retention and destruction schedule;
- access/correction/deletion request procedure;
- appeal policy;
- breach response plan;
- relying-party data-use terms;
- vendor/processor register;
- public-chain/Verus disclosure notice; and
- privacy impact assessment.

## 18. Privacy tests

- identity documents are absent from public routes, database schema, logs, traces, analytics, queues, object storage, fixtures, backups, and chain manifests;
- exact addresses are absent from relying-party responses;
- public status cannot enumerate participants;
- RMR client cannot access evidence endpoints or fields;
- role tests prevent scheduler/support/security overreach;
- exports use allowlists and audit every generation/download;
- failed wallet payloads expire as configured;
- deletion and correction apply by record type;
- backups expire and restoration does not silently resurrect disposed active records without reconciliation;
- small public cycle counts are suppressed/generalized;
- optional public-proof consent is separate and revocable prospectively; and
- production data cannot be loaded into local/CI environments.

## 19. Privacy release gate

- [ ] Designated responsible privacy role and public contact published.
- [ ] Data inventory/classification complete.
- [ ] Every collected field has documented purpose, access, retention, and disclosure.
- [ ] No document/photo upload exists by default.
- [ ] Participant notices and consent records approved.
- [ ] Evidence, locality, uniqueness, appeal, retention, and on-chain policies approved.
- [ ] Vendor register and contracts reviewed.
- [ ] Rights-request and incident drills completed.
- [ ] RMR and other relying-party contracts return minimum fields only.
- [ ] Anti-enumeration and privacy-abuse tests pass.
- [ ] Legal/privacy review approves the limited pilot.
