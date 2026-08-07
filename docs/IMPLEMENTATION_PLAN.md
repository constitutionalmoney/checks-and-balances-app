---
title: Checks & Balances Protocol End-to-End Implementation Plan
version: 1.0
status: Proposed execution plan
last_updated: 2026-08-05
owner: Checks and Balances Committee Ltd.
---

# End-to-End Implementation Plan

## 1. Purpose

This plan turns the PRD into sequenced work that Codex and human contributors can implement without silently deciding unfinished protocol questions. It covers repository foundation, product design, participant and committee applications, Verus Mobile, VRSCTEST RPC, renewal cycles, status verification, Rate My Representatives integration, deployment, and pilot gates.

The implementation is complete only when the applicable definition-of-done and release gates pass. “Code exists” is not a release state.

## 2. Execution rules

1. Work from a GitHub issue with explicit dependencies and acceptance criteria.
2. Keep protocol decisions in RFCs/policies, not hidden constants.
3. Target VRSCTEST. Mainnet remains blocked.
4. Use synthetic data until an approved pilot environment and documents exist.
5. Do not implement identity-document/photo upload.
6. Do not expose authenticated `verusd` RPC publicly.
7. Do not make VerusID mandatory for baseline pilot account creation.
8. Keep participant, committee, public verifier, and API trust boundaries separate.
9. Add tests and documentation in the same pull request as behaviour.
10. No issue is complete while its public status, privacy, security, migration, or rollback implications remain undocumented.

## 3. Target repository and stack

```text
pnpm + Turborepo
TypeScript strict mode
Next.js participant/committee/verifier/docs apps
NestJS with Fastify adapter for API
PostgreSQL + Prisma
Redis + BullMQ
WebAuthn/passkeys + verified email fallback
OpenAPI 3.1 + JSON Schema
OpenTelemetry structured observability
Docker Compose local stack
OCI containers and GitHub Actions
Private VRSCTEST verusd RPC reachable only by Verus worker
```

Use current stable versions at scaffold time, pinned through lockfiles. Before installation, verify licence, maintenance, security support, Node compatibility, and framework interoperability. Do not hard-code version numbers from this plan.

## 4. Work-package map

| Work package | Outcome | Hard blockers |
|---|---|---|
| WP-00 | Repository governance and honest status | None |
| WP-01 | Monorepo, local environment, CI, quality gates | WP-00 |
| WP-02 | Protocol RFCs, policies, schemas, status registry | WP-00 |
| WP-03 | Domain model, database, audit, outbox | WP-01, relevant WP-02 rules |
| WP-04 | Accounts, passkeys/email, roles, consent | WP-03, privacy policy |
| WP-05 | Verus RPC spine and VRSCTEST identities | WP-01, namespace/signing decisions |
| WP-06 | Verus Mobile account-linking flow | WP-04, WP-05 |
| WP-07 | Participant PWA | WP-03, WP-04 |
| WP-08 | Committee formation and operations console | WP-03, committee/evidence policies |
| WP-09 | Decision, issuance, expiry, revocation, appeal | WP-03, signing/quorum rules |
| WP-10 | Forty-five-day renewal scheduler | WP-09, renewal RFC |
| WP-11 | Directory, verifier, status API, developer contracts | WP-09, relying-party/privacy rules |
| WP-12 | Optional participant VerusID public proof | WP-05, WP-06, WP-09, privacy/schema approval |
| WP-13 | Notifications, reports, operational administration | WP-03 onward |
| WP-14 | RMR adapter and integration tests | WP-11, RMR contract |
| WP-15 | Infrastructure, deployment, monitoring, backup | WP-01 and component readiness |
| WP-16 | Security, privacy, accessibility, legal, pilot rehearsal | All pilot-scope packages |
| WP-17 | Pilot and post-pilot evaluation | WP-16 approval |
| WP-18 | Mainnet decision | Successful pilot; separate approval |

## 5. WP-00 — Repository governance and status

### Deliverables

- accurate README and route inventory;
- Apache-2.0 `LICENSE`, `NOTICE`, DCO, contributing, governance, security, conduct, trademark, and third-party notice files;
- PRD, architecture, privacy, threat model, subdomain, Verus Mobile, protocol status, implementation, and Codex documents;
- issue templates and pull-request template;
- issue roadmap replacing legacy assumptions;
- branch protection and required reviews/checks; and
- monitored security/privacy/conduct contacts before public testing.

### Exit criteria

- every README link resolves;
- repository tree is described as present versus planned accurately;
- no `TBD licence` remains;
- no issue treats a historical proposal as final; and
- public website and repository describe the same stage.

## 6. WP-01 — Monorepo, local environment, and CI

### Tasks

1. Initialize `pnpm-workspace.yaml`, root `package.json`, Turborepo configuration, strict TypeScript base config, ESLint, Prettier, EditorConfig, Node version file, and lockfile.
2. Scaffold:
   - `apps/participant`;
   - `apps/committee`;
   - `apps/verify`;
   - `apps/api`;
   - `apps/worker`;
   - `apps/docs`;
   - shared packages listed in architecture.
3. Add runtime configuration validation with separate local, CI, testnet, pilot, and future production profiles.
4. Add Docker Compose for PostgreSQL, Redis, mail-capture service, optional S3-compatible local service, fake Verus RPC, API, worker, and apps.
5. Add health/readiness endpoints.
6. Add CI jobs:
   - dependency install with frozen lockfile;
   - lint;
   - formatting check;
   - typecheck;
   - unit/integration tests;
   - database migration validation;
   - OpenAPI/schema validation;
   - build;
   - dependency and licence review;
   - secret scan;
   - container scan;
   - DCO check.
7. Pin GitHub Actions by commit SHA and use minimum permissions.
8. Add test coverage reporting without requiring arbitrary 100% coverage; require critical domain-path coverage.

### Initial commands

Codex should determine exact current CLI syntax from official package documentation, then produce an auditable scaffold. The intended developer interface is:

```bash
corepack enable
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:migrate
pnpm db:seed
```

### Exit criteria

A clean clone can run the documented local stack and all CI checks without production secrets or Verus mainnet access.

## 7. WP-02 — Protocol RFCs, policies, schemas, and release status

### Required RFCs/policies

1. committee formation and twelve-member rule;
2. review/signing quorum and anti-capture controls;
3. evidence pathways and default non-retention;
4. privacy, retention, rights, and processor rules;
5. accessibility and exception policy;
6. appeal, correction, revocation, and recovery;
7. forty-five-day eligibility, entropy, selection, no-show, deferral, and reporting;
8. uniqueness/duplicate-prevention claim;
9. locality/constituency claims;
10. VDXF namespace and schema ownership;
11. relying-party status and anti-enumeration;
12. optional participant public proof;
13. committee/app Verus identity custody and recovery;
14. public pilot and incident/suspension policy; and
15. mainnet decision criteria.

### Status registry

Create database/config records for:

- protocol release;
- capability status;
- schema/policy versions;
- approved environment;
- public labels;
- effective dates; and
- compatibility matrix.

Expose a read-only endpoint:

```text
GET /api/v1/protocol/status
```

Build website/app status components from the same contract.

### Schemas

Deliver draft and then approved versions of:

- human attestation;
- public status response;
- committee public profile;
- cycle object/report;
- wallet request application metadata;
- public proof reference;
- `auth.md`; and
- anchor manifest.

### Exit criteria

No enabled feature depends on an unfinished rule. Unfinished capabilities remain behind server-side flags.

## 8. WP-03 — Domain model, PostgreSQL, audit, and outbox

### Domain package

Implement value objects and state machines independent of NestJS/Prisma:

- `CommitteeId`, `ParticipantId`, `SessionId`, `AttestationId`, `OpaqueReference`;
- `Environment`, `Network`, `PolicyVersion`, `AssuranceClaim`;
- committee lifecycle;
- verification request lifecycle;
- attestation lifecycle;
- appeal lifecycle;
- Verus job lifecycle;
- renewal cycle lifecycle; and
- authorization policy inputs.

Avoid generic `setStatus` methods. Expose named commands such as:

```text
scheduleRequest
checkInParticipant
recordReviewDecision
approveAttestation
requestIssuance
activateAttestation
expireAttestation
revokeAttestation
openAppeal
resolveAppeal
commitEligibleSnapshot
deriveSelection
publishCycleReport
```

### Database

Create migrations for the PRD entities. Add:

- foreign keys and uniqueness;
- policy-version requirements;
- maximum 45-day validity constraint where practical;
- immutable original decision/validity fields;
- idempotency table;
- append-only audit permissions/trigger strategy;
- outbox claiming and retry state;
- opaque external references; and
- indexes designed from query plans, not guesses.

### Audit

Every privileged operation records:

- actor type and opaque actor reference;
- committee/tenant;
- command and target;
- previous/new state summary;
- policy and software versions;
- reason category;
- authentication strength;
- correlation/idempotency IDs;
- result; and
- timestamp.

Exclude secrets and private evidence.

### Outbox

State, audit, and outbox commit in one transaction. Workers use leases, attempt records, exponential backoff, dead-letter state, and idempotent handlers.

### Exit criteria

Domain negative tests prove prohibited transitions, cross-committee access, expiry extension, direct activation, and duplicate commands fail.

## 9. WP-04 — Authentication, authorization, and consent

### Participant authentication

- passkey registration/authentication;
- verified email fallback and recovery;
- secure host-only session cookie;
- CSRF/origin protections;
- session/device list and revocation;
- re-authentication for sensitive actions;
- account lock/recovery;
- rate limits and abuse controls.

### Committee authentication

- separate session audience and keys;
- mandatory strong authentication;
- invitation/approval workflow;
- committee/role scoping;
- privilege elevation and re-authentication;
- device/session inventory;
- emergency suspension.

### Authorization

Implement policy checks in domain/application services, not UI only. Add negative tests for every role and tenant boundary.

### Consent

Implement versioned consent receipts for:

- privacy notice;
- evidence process;
- session attendance;
- optional VerusID link;
- optional public proof;
- relying-party disclosure; and
- material policy change.

### Exit criteria

Security review confirms participant compromise cannot create committee authority and committee roles cannot bypass domain rules.

### Implementation evidence (issue #17)

The framework-independent service core and PostgreSQL adapter now implement synthetic passkey/email
authentication, separate revocable sessions, recovery, durable rate limits, invitation approval,
role/tenant/conflict checks, privileged re-authentication/four-eyes rules, and versioned consent.
Public endpoints and participant/committee user interfaces remain later vertical slices. Real use
remains blocked on issue #12, and Verus-link recovery interaction remains issue #19.

## 10. WP-05 — Verus RPC spine and VRSCTEST identities

### Environment

- deploy isolated VRSCTEST node;
- pin daemon/client version;
- confirm sync/readiness methods;
- keep RPC private;
- create distinct application/protocol/committee test identities;
- document recovery/revocation and signer inventory.

### Typed RPC adapter

Implement approved methods behind an interface and fake adapter:

```text
getinfo
getblockchaininfo
getidentity
getidentitycontent
getvdxfid
updateidentity
signdata/verifysignature where selected
getrawtransaction
getblockhash/getblock
```

Do not expose arbitrary method forwarding.

### Guardrails

- assert VRSCTEST before every write;
- verify synchronization;
- strict timeouts and error classification;
- no request body logging;
- deterministic canonical manifests;
- field and size allowlist;
- idempotency/reconciliation;
- confirmation and reorg handling;
- mandatory readback.

### Fixtures

Create deterministic fixtures for:

- VDXF identifiers;
- active/expired/revoked/superseded attestation packets;
- schema/policy/cycle anchors;
- timeout-after-submit;
- readback mismatch;
- reorg; and
- wrong-chain rejection.

### Exit criteria

Automated VRSCTEST job writes an approved synthetic anchor, confirms it, reads it back, and verifies exact canonical digest without enabling mainnet.

## 11. WP-06 — Verus Mobile account-linking flow

Implement [VERUS_MOBILE_INTEGRATION.md](./VERUS_MOBILE_INTEGRATION.md):

1. pin versions and licences;
2. provision app auth identity;
3. build deterministic GenericRequest adapter;
4. create challenge store;
5. create signed short-lived request;
6. render tested same-device and QR options;
7. implement callback parsing and verification;
8. validate nonce, expiry, audience, network, request signer, response signer, identity state, and one-time consumption;
9. store minimum identity-link proof;
10. build browser polling/recovery;
11. build unlink/revalidation;
12. run fake-wallet and device tests; and
13. publish compatibility matrix.

### Exit criteria

Pinned Android and iOS versions pass authentication/linking tests on VRSCTEST. No wallet secret reaches the service.

## 12. WP-07 — Participant PWA

### Pages

```text
/
/sign-in
/onboarding
/request
/request/{id}
/sessions/{id}
/status
/status/{attestationId}
/renew
/appeals
/appeals/{id}
/settings/security
/settings/contact
/settings/verus
/privacy
/help
```

### Features

- accessible account/onboarding;
- protocol status and “not live” labels;
- broad jurisdiction/session selection;
- versioned privacy/evidence/accessibility information;
- request, appointment, waitlist, cancellation;
- no document upload;
- optional VerusID link;
- status, validity, typed claims, issuer, policy versions;
- renewal and private notices;
- correction/appeal;
- consent history;
- account/security controls;
- clear explanation of relying-party fields; and
- installable PWA with non-QR fallback.

### Exit criteria

A synthetic participant completes request-to-status lifecycle in end-to-end tests and cannot access another participant’s records.

## 13. WP-08 — Committee formation and operations console

### Formation

- proposed committee and jurisdiction;
- member invitations and role approval;
- twelve-member policy status;
- conflict-of-interest records;
- covenants/policies acknowledged;
- accessibility/location/security readiness;
- VRSCTEST committee identity provisioning status;
- signer inventory, recovery/revocation, and threshold tests;
- steward recognition and suspension.

### Operations pages

```text
/dashboard
/formation
/members
/policies
/sessions
/sessions/{id}
/sessions/{id}/check-in
/sessions/{id}/review
/cycles
/attestations
/appeals
/audit
/settings/verus
```

### Session workflow

- schedule with policy versions/capacity/location visibility;
- roster and authorized reviewers;
- appointment/queue check-in;
- in-person evidence-path prompts;
- minimal metadata only;
- independent decisions and conflict checks;
- threshold evaluation under approved policy;
- issuance request; and
- finalized aggregate session report.

### Exit criteria

A simulated committee runs a complete session with synthetic participants, no raw evidence capture, and complete audit records.

## 14. WP-09 — Attestation, expiry, revocation, recovery, and appeal

### Issuance

- approved decision creates `issuance_pending`;
- construct minimum canonical envelope;
- create signed credential/proof packet if approved;
- enqueue optional privacy-safe anchor;
- activate only after required local issuance steps;
- keep chain state and private status distinct.

### Expiry

- calculate `expires_at <= issued_at + 45 days`;
- status service evaluates current time on every decision;
- scheduled worker materializes expiry for notifications/reporting;
- cache TTL never extends beyond expiry;
- renewal creates new version.

### Revocation/recovery

- authorized reason categories;
- immediate canonical status change;
- audit and participant notice;
- optional revocation-root/status-list update;
- incident and committee suspension interactions;
- VerusID recovery/revalidation.

### Appeals

- participant initiation;
- deadline and policy version;
- independent assignment;
- append-only submissions/decisions;
- upheld/denied/remanded outcomes;
- no public sensitive rationale.

### Exit criteria

Automated tests cover issuance, active check, exact expiry boundary, renewal, revocation, supersession, appeal, compromised issuer, and dependency outage.

## 15. WP-10 — Forty-five-day cycle scheduler

### Cycle creation

- period and committee;
- eligible snapshot rules;
- policy versions;
- location/accessibility/publication controls;
- cancellation and contingency.

### Deterministic selection

Proposed pilot pattern, subject to RFC:

1. build canonical eligible list using opaque IDs;
2. sort and hash exact bytes;
3. publish/record commitment before entropy;
4. select a future Verus block height;
5. after finality threshold, combine block hash with committed salt/domain separator;
6. run open deterministic selection algorithm;
7. record private selected references and public proof; and
8. permit independent reproduction without participant disclosure.

Implement alternative/fallback entropy rules before use; do not permit entropy shopping.

### Operational flow

- private notices;
- acceptance/deferral/accommodation;
- no-show/grace/appeal under policy;
- renewal session linkage;
- selected-frequency safeguards;
- aggregate report;
- optional report anchor.

### Exit criteria

Given the same snapshot, commitment, entropy, salt reveal, and policy, independent code returns the same selected indexes. Public artifacts identify no participant.

## 16. WP-11 — Directory, verifier, status API, and developer contracts

### Committee directory

- only approved committees;
- public status and responsible organization;
- broad jurisdiction;
- published session availability;
- accessibility summary;
- policy/schema/release versions;
- last reviewed; and
- suspension/retirement state.

### Verifier

- participant-presented QR/opaque reference/credential;
- no arbitrary VerusID/name/email search;
- minimum human-readable result;
- issuer recognition and environment warning;
- freshness and unavailable state;
- accessible error explanations.

### Status API

- high-entropy or participant-mediated query;
- approved client scopes/audience;
- anti-enumeration and uniform errors;
- rate limits and audit;
- normalized minimum response;
- no evidence or numeric trust score;
- OpenAPI and synthetic fixtures.

### Developer materials

- `auth.md`;
- OpenAPI 3.1;
- JSON Schemas;
- TypeScript SDK;
- integration guide;
- test credentials/fixtures only after controls;
- compatibility/deprecation policy;
- relying-party terms.

### Exit criteria

A test relying party verifies active/expired/revoked/unknown/unavailable states and cannot enumerate participants or retrieve private evidence.

## 17. WP-12 — Optional participant VerusID public proof

Keep disabled until all blockers pass.

### Tasks

- approve public-proof schema and privacy impact;
- implement explicit separate consent;
- display exact public permanence/linkability warning;
- build allowlisted IdentityUpdateRequest;
- sign request with approved application/issuer identity;
- show exact old/new content diff in participant app and Verus Mobile;
- participant approves and pays/signs in wallet;
- callback/polling records transaction evidence;
- wait for confirmation and read back identity content;
- verify digest and mark complete;
- support superseding/removing reference through a new wallet action; and
- explain that historical chain data cannot be promised deleted.

### Exit criteria

Android/iOS tests pass; no forbidden fields appear; feature remains opt-in; baseline status works without it.

## 18. WP-13 — Notifications, reports, and operational administration

### Notifications

- verify sending domain, SPF/DKIM/DMARC;
- privacy-safe templates;
- versioned message intents;
- queue/retry/bounce/complaint handling;
- expiry, renewal, cancellation, appeal, consent-change, and security notices;
- no sensitive subject-line detail.

### Reports

- session operational report;
- forty-five-day aggregate report;
- committee readiness report;
- protocol/release status;
- privacy/security/admin audit reports;
- small-cell suppression;
- optional public digest anchor.

### Administration

- feature/release status management with four-eyes controls;
- client keys/scopes;
- committee recognition/suspension;
- policy/schema version management;
- incident switches;
- retention jobs and rights requests;
- audit search with restricted export.

### Exit criteria

Operational staff can run the approved pilot scope without direct database editing or ad hoc scripts.

## 19. WP-14 — Rate My Representatives adapter

### Contract

CBC returns only approved minimum status. It does not return raw evidence or a trust score.

### Tasks

- define RMR client identity, audience, scopes, keys, terms, limits, and callback/error handling;
- implement provider interface in CBC SDK;
- create disabled feature flag;
- create synthetic integration environment;
- test consent/presentation model;
- test stale/unavailable/revoked states;
- audit every check;
- provide client suspension and rotation;
- document no data-push assumption unless separately approved.

### Exit criteria

RMR receives exactly the approved response fields and cannot access evidence, exact address, contact, appeal, or attendance data.

## 20. WP-15 — Infrastructure and deployment

### Infrastructure

- DNS/TLS per [SUBDOMAINS.md](./SUBDOMAINS.md);
- separate testnet services/data/secrets;
- private app and Verus networks;
- managed PostgreSQL/Redis or hardened equivalents;
- encrypted backup and restoration;
- object storage only for approved artifacts;
- ingress/WAF/rate limits;
- service identity and least privilege;
- secrets manager;
- container image registry and provenance;
- migrations as controlled release step;
- independent status page.

### CI/CD

```text
PR -> checks only, no sensitive deployment
main -> build signed immutable images
approved testnet release -> deploy testnet + migrations + smoke tests
approved pilot release -> gated promotion of exact artifact
rollback -> previous compatible artifact or forward fix with migration plan
```

No branch preview receives production secrets or real participant data.

### Monitoring

- service health/readiness;
- auth and abuse anomalies;
- queue age/dead letters;
- expiry/revocation correctness;
- wallet callback failures;
- Verus sync/network/write/readback/reorg;
- status API abuse;
- backup success and restore age;
- certificate/domain health;
- public status drift.

### Exit criteria

Testnet deploy, migration, rollback/forward-fix, secret rotation, backup restore, and incident suspension are rehearsed.

## 21. WP-16 — Verification and pilot-readiness programme

### Automated

- domain unit/property tests;
- authorization matrix;
- API integration/contract tests;
- browser end-to-end tests;
- wallet fake/device tests;
- VRSCTEST fixtures;
- renewal determinism tests;
- privacy leakage tests;
- accessibility automated checks;
- load/abuse tests;
- dependency/container/secret/licence scans.

### Manual/independent

- architecture/security review;
- penetration test;
- privacy impact assessment;
- legal review of pilot documents;
- accessibility audit and physical-session review;
- threat-model tabletop;
- compromised signer/revocation drill;
- data-access/correction/deletion drill;
- backup restoration;
- incident communication;
- simulated full session/cycle/appeal.

### Release packet

- exact code commit and images;
- protocol/policy/schema versions;
- compatibility matrix;
- test evidence;
- unresolved/accepted risks;
- operator roster and contacts;
- incident and rollback plan;
- public status copy;
- steward approval.

### Exit criteria

Every PRD pilot gate passes or is explicitly excluded from the limited scope with a documented reason that does not create a hidden risk.

## 22. WP-17 — Limited pilot

### Before opening

- publish approved committee and pilot status;
- publish contact/privacy/security/accessibility/appeal information;
- confirm location, capacity, staffing, devices, connectivity, contingency, and safety;
- freeze/pin software and wallet compatibility;
- verify VRSCTEST identities and node;
- run same-day dry run;
- confirm no document-upload path and default non-retention.

### During pilot

- monitor incidents and queue/Verus status;
- preserve consent/policy versions and audit;
- record exceptions and near misses;
- avoid changing rules mid-session;
- suspend rather than improvise unsafe workarounds.

### After each cycle

- reconcile attendance, decisions, expiry, revocation, appeals, and Verus jobs;
- produce privacy-safe aggregate report;
- collect participant/operator feedback;
- assess exclusion, false approval/denial, and operational burden;
- update RFCs through change control;
- decide whether to continue, pause, or redesign.

## 23. WP-18 — Mainnet decision

Mainnet is not the default “next step.” Prepare a decision memorandum addressing:

- which exact function needs mainnet rather than VRSCTEST/private signed credentials;
- privacy and permanence;
- participant consent;
- fees/funding;
- issuer/signing custody;
- revocation/recovery;
- compatibility and support;
- legal and reputational implications;
- incident response;
- migration from testnet; and
- rollback limitations.

No mainnet code path is enabled without separate written approval and a release designed specifically for it.

## 24. Pull-request sizing and order

Recommended early PR sequence:

1. monorepo and quality tooling;
2. local Docker stack and runtime config;
3. domain value objects/state machines;
4. database schema/migrations and repositories;
5. audit/outbox and fake workers;
6. authentication/passkeys and authorization skeleton;
7. protocol-status registry and shared UI;
8. fake Verus adapter and fixtures;
9. real read-only VRSCTEST adapter;
10. Verus write/readback worker;
11. wallet challenge/callback fake integration;
12. device-compatible Verus Mobile authentication;
13. participant request/status vertical slice;
14. committee session vertical slice;
15. issuance/expiry/revocation/appeal vertical slice;
16. renewal cycle vertical slice;
17. verifier/status API;
18. optional public-proof spike behind flag;
19. deployment/monitoring; and
20. end-to-end pilot rehearsal.

Prefer vertical slices after the foundational domain work. Avoid building every UI screen before one complete synthetic lifecycle works.

## 25. Codex issue completion checklist

For each issue, Codex must report:

```text
Issue and acceptance criteria addressed
Files changed
Architecture/protocol decision used
Tests added and commands run
Migration/configuration impact
Privacy/security/accessibility analysis
Feature flag and public-status impact
Verus network and compatibility impact
Documentation updated
Known limitations or blockers
```

Do not mark an issue complete if tests were not run; say what prevented them.

## 26. Full-build definition of done

- [ ] Clean clone builds and tests reproducibly.
- [ ] Public website and deployed release status agree.
- [ ] Protocol decisions are versioned and no unfinished rule is hard-coded.
- [ ] Participant and committee trust boundaries are independently protected.
- [ ] No raw evidence/document upload or wallet-secret path exists.
- [ ] VerusID linking is optional, replay-safe, and device tested.
- [ ] Human review and approved threshold control issuance.
- [ ] Forty-five-day expiry is exact and server enforced.
- [ ] Renewal selection is reproducible, fair under policy, and private.
- [ ] Revocation, recovery, correction, and appeal work end to end.
- [ ] Status API and verifier resist enumeration and return minimum fields.
- [ ] RMR integration remains separate and privacy-minimized.
- [ ] Verus writes are VRSCTEST-only, asynchronous, idempotent, confirmed, and read back.
- [ ] Optional identity update is explicit, public-diff reviewed, and not required.
- [ ] Audit, notifications, reports, retention, and rights workflows operate.
- [ ] Accessibility, privacy, legal, security, backup, and incident gates pass.
- [ ] Exact pilot release is approved by Checks and Balances Committee Ltd.
- [ ] Mainnet remains disabled unless separately approved.
