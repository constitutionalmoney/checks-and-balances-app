---
title: Checks & Balances Protocol Application Architecture
version: 1.0
status: Proposed implementation architecture
last_updated: 2026-08-05
---

# System Architecture

## 1. Architectural objective

Build a multi-committee, privacy-minimized application in which:

- human and committee decisions are enforced by explicit domain state machines;
- private operational records remain in a transactional database;
- participant wallet approval remains under the participant’s control;
- Verus writes occur through an isolated asynchronous service;
- public status reveals the minimum approved claims;
- the system can run entirely on VRSCTEST before any mainnet decision; and
- every public capability is controlled by release status and feature gates.

The architecture below is a recommended technical implementation. It does not convert unfinished protocol decisions into approved rules.

## 2. Recommended stack

| Layer | Recommendation | Reason |
|---|---|---|
| Language | TypeScript, strict mode | Shared contracts across browser, API, worker, tests, and SDK |
| Monorepo | `pnpm` workspaces + Turborepo | Reproducible builds and shared packages without premature microservices |
| Participant app | Next.js PWA | Responsive mobile-first flow, server rendering, accessibility, installability |
| Committee console | Next.js | Desktop/tablet operations with shared design system |
| Public verifier | Next.js | Separate security/caching posture from authenticated applications |
| API | NestJS with Fastify adapter | Structured modules, OpenAPI, guards, validation, Fastify performance |
| Domain layer | Framework-independent TypeScript | State transitions and policy rules testable without HTTP or database |
| Database | PostgreSQL | Transactions, row-level integrity, auditability, strong relational model |
| ORM/migrations | Prisma initially | Typed schema and migrations; raw SQL permitted for integrity/audit features |
| Queue | Redis + BullMQ | Outbox-driven Verus, notifications, expiry, reconciliation, and reports |
| Object storage | S3-compatible, narrowly scoped | Approved exports and public artifacts only; no evidence files by default |
| Authentication | WebAuthn/passkeys + verified email fallback | Strong user authentication independent of optional VerusID linking |
| API contracts | OpenAPI 3.1 + JSON Schema | Versioned first-party and relying-party contracts |
| Observability | OpenTelemetry + structured JSON logs + metrics | Traceability with field redaction |
| Local development | Docker Compose | Reproducible PostgreSQL, Redis, mail capture, and test services |
| Deployment | OCI containers behind managed ingress/reverse proxy | Portable staging and production deployment |
| Secrets | Deployment secret manager | No committed credentials or plaintext production `.env` |
| CI | GitHub Actions | Lint, typecheck, tests, dependency/licence/security scans, builds |

The first build should remain a modular monolith plus workers. Splitting into networked microservices before domain boundaries stabilize would add failure modes without improving the protocol.

## 3. Logical components

```text
Internet
  |
  +-- checksandbalances.services              Public explanation website
  +-- app.checksandbalances.services          Participant PWA
  +-- committee.checksandbalances.services    Committee console
  +-- verify.checksandbalances.services       Public verifier
  +-- docs.checksandbalances.services         Developer documentation
  +-- status.checksandbalances.services       Independent service status
  |
  +-- api.checksandbalances.services
         |
         +-- Edge/WAF/rate limits
         +-- API application
               |
               +-- Domain services
               +-- Authorization and policy engine
               +-- PostgreSQL
               +-- Redis/BullMQ
               +-- Transactional outbox
                       |
                       +-- Verus worker ------ private RPC ------ verusd (VRSCTEST)
                       +-- Notification worker
                       +-- Expiry/cycle worker
                       +-- Report/anchor worker
```

No browser, public website, relying party, or participant wallet connects to authenticated `verusd` RPC through a public endpoint.

## 4. Monorepo target

```text
apps/
  participant/             # Next.js participant PWA
  committee/               # Next.js committee operations console
  verify/                  # Next.js public verifier
  api/                     # NestJS/Fastify API
  worker/                  # BullMQ workers and schedulers
  docs/                    # Developer documentation site
packages/
  domain/                  # Entities, value objects, state machines, policy rules
  db/                      # Prisma schema, migrations, repositories, test factories
  auth/                    # Passkeys, email, sessions, roles, Verus link proofs
  verus/                   # RPC adapter, wallet envelopes, VDXF, manifests, fixtures
  contracts/               # OpenAPI, JSON Schemas, generated clients
  ui/                      # Shared accessible components and design tokens
  config/                  # Runtime validation and environment profiles
  observability/           # Logs, traces, metrics, redaction
  testkit/                 # Synthetic fixtures, fake clocks, fake RPC, builders
schemas/
  cbc-human-attestation.schema.json
  cbc-public-status.schema.json
  cbc-cycle-report.schema.json
  auth.md
infra/
  docker/
  deployment/
  monitoring/
docs/
  adr/
  runbooks/
```

## 5. Trust boundaries

### Boundary A — Public web

Anonymous traffic may access public protocol status, approved committee metadata, public policies, public schemas, privacy-safe aggregate reports, and verifier initiation. It must not enumerate participants or private sessions.

Controls:

- WAF and rate limits;
- strict input validation;
- cache only non-personal public resources;
- bot/abuse detection that does not itself create invasive identity profiling;
- no sensitive analytics payloads; and
- CSP, HSTS, secure headers, and dependency isolation.

### Boundary B — Participant account

Contains account authentication, contact preference, broad jurisdiction/session request, consent receipts, optional VerusID link, status, renewal, correction, and appeal.

Controls:

- passkey preferred;
- secure session cookie;
- re-authentication for link, unlink, appeal, recovery, or public-proof changes;
- CSRF and origin validation;
- privacy-aware support access;
- no raw evidence upload.

### Boundary C — Committee operations

Contains rosters, precise sessions, check-ins, evidence-path metadata, decisions, conflicts, signatures, appeals, and restricted reports.

Controls:

- separate host and session audience;
- mandatory strong authentication;
- role and committee tenancy checks;
- re-authentication for issuance/revocation/export/role changes;
- least privilege and four-eyes controls for steward actions;
- device/session inventory and rapid revocation;
- append-only audit events.

### Boundary D — Private data services

PostgreSQL, Redis, backups, and internal APIs.

Controls:

- private network;
- encryption in transit and at rest;
- separate database roles;
- field-level or application-level encryption for selected contact or sensitive metadata;
- backup encryption and restoration tests;
- no public database endpoint.

### Boundary E — Verus services

`verusd`, wallet-compatible request creation, signing workers, transaction submission, confirmation, and readback.

Controls:

- private network or localhost RPC;
- per-environment credentials;
- VRSCTEST allowlist;
- no browser RPC;
- no participant private keys;
- isolated worker identity and signing policy;
- payload allowlist and size guard;
- transactional outbox and idempotency;
- confirmation/reorg handling;
- post-write readback.

### Boundary F — Relying parties

Approved applications checking status.

Controls:

- opaque subject reference or participant-mediated proof;
- client registration and keys for non-public use cases;
- scopes, terms version, rate limits, audience binding, and audit;
- response-field allowlist;
- anti-enumeration and correlation monitoring;
- no evidence package.

## 6. Domain modules

### 6.1 Protocol registry

Owns:

- protocol releases;
- feature status;
- policy documents and versions;
- schema versions;
- supported environments;
- compatibility matrix; and
- public claims.

It is the source for user-facing status labels. A deployed route is not “operational” unless the registry says so.

### 6.2 Accounts and identity links

Owns:

- participant account;
- passkey/email authentication;
- sessions and recovery;
- consent receipts;
- optional VerusID links;
- wallet challenge lifecycle; and
- revalidation after identity recovery/revocation.

A VerusID link proves control of the selected identity at a defined time and network. It does not automatically grant committee roles or attest human presence.

### 6.3 Committee registry

Owns:

- committee proposal and recognition;
- jurisdiction boundary reference;
- members and roles;
- conflicts;
- policy approvals;
- committee VerusID and signer inventory;
- public metadata; and
- suspension/retirement.

### 6.4 Session operations

Owns:

- schedules and capacity;
- location visibility;
- accessibility notes;
- requests, appointments, check-in, and attendance;
- evidence-path review metadata; and
- cancellations and exceptions.

### 6.5 Decisions and attestations

Owns:

- reviewer decisions;
- threshold evaluation under a versioned policy;
- issuance, expiry, revocation, supersession, and recovery;
- typed assurance claims;
- participant status; and
- public status projection.

### 6.6 Renewal cycles

Owns:

- eligible-population snapshots;
- digest commitment;
- entropy and deterministic selection;
- notices and deferrals;
- renewal outcomes;
- aggregate reports; and
- public report anchors.

### 6.7 Appeals and privacy rights

Owns:

- appeal cases;
- independent assignment;
- outcomes and remedies;
- access/correction/deletion requests;
- legal holds; and
- disclosure history.

### 6.8 Relying-party access

Owns:

- client registration;
- scopes and audiences;
- status-check consent or proof;
- anti-enumeration controls;
- usage audit;
- Rate My Representatives adapter; and
- key/credential rotation.

### 6.9 Provenance and Verus

Owns:

- VDXF registry and derived identifiers;
- canonical manifests;
- signed packets;
- optional participant identity-update requests;
- committee/policy/schema/cycle anchors;
- transaction records;
- confirmation and readback; and
- reconciliation.

## 7. Database strategy

PostgreSQL is the canonical operational store. It holds private records required to run sessions, status, expiry, appeals, and audit. Verus is not the primary database for these records.

### Integrity requirements

- UUID or ULID primary identifiers, plus opaque external references distinct from internal IDs.
- Foreign keys and check constraints for tenancy, validity windows, and required policy versions.
- Unique idempotency records for write commands.
- Optimistic concurrency or row locking for state transitions.
- Database clock or injected canonical clock for expiry logic.
- Append-only audit table with integrity chaining or periodic digest anchoring.
- Soft deletion only where required for operational records; legal/privacy erasure should use field deletion, tombstones, or crypto-shredding according to record type.
- No mutable overwrite of an attestation’s original validity window or decision history.

### Data separation

Use separate schemas or tightly separated tables/roles for:

- `identity_contact` — account and communication data;
- `committee_ops` — sessions, attendance, evidence metadata, decisions;
- `attestation` — canonical status and typed claims;
- `public_registry` — approved committee/policy/report projections;
- `integration` — relying parties, wallet requests, outbox, anchors;
- `audit` — append-only privileged events.

A public projection must be constructed from an explicit allowlist, never by serializing an internal record.

## 8. Command and event model

Use synchronous commands for domain validation and durable database state, then asynchronous events for external side effects.

```text
HTTP command
  -> authenticate and authorize
  -> validate idempotency key
  -> execute domain transition
  -> write domain record
  -> append audit event
  -> insert outbox event
  -> commit
  -> return accepted/current state

Worker
  -> claim outbox event
  -> perform side effect
  -> record attempt
  -> reconcile result
  -> emit follow-up event
```

Example events:

```text
VerificationRequested
SessionScheduled
ParticipantCheckedIn
ReviewDecisionRecorded
AttestationApproved
AttestationIssuanceRequested
AttestationActivated
AttestationExpired
AttestationRevoked
RenewalCycleCommitted
RenewalSelectionDerived
CycleReportPublished
VerusAnchorRequested
VerusAnchorVerified
WalletIdentityUpdateRequested
WalletIdentityUpdateConfirmed
AppealOpened
AppealResolved
CommitteeSuspended
```

Events are internal facts, not public claims. External event publication requires a separate contract and privacy review.

## 9. Verus integration pattern

### 9.1 Read operations

The Verus package exposes typed adapters for approved methods such as:

- `getinfo`;
- `getblockchaininfo`;
- `getidentity`;
- `getidentitycontent`;
- `getvdxfid`;
- `getrawtransaction`;
- `getblockhash` and `getblock`;
- signature verification methods supported by the selected client path.

Every read records network, node version, observed height, timestamp, and error class where relevant.

### 9.2 Write operations

No request handler publishes directly.

```text
BEGIN
  validate approved state transition
  build canonical private/public record
  append audit event
  insert outbox event with deterministic idempotency key
COMMIT

worker:
  verify VRSCTEST and node synchronization
  derive/confirm VDXF key
  build canonical compact manifest
  reject forbidden fields and oversize payload
  submit approved transaction/update/signature
  record txid or ambiguity state
  wait for confirmation policy
  read back exact content
  compare digest and semantic fields
  mark verified or reconcile/retry
```

Recommended idempotency key:

```text
network + operation_type + subject_identity_or_committee + vdxf_key + manifest_digest
```

After an RPC timeout, search identity content/transaction history for the digest before resubmitting.

The durable implementation stores the canonical manifest and server-selected policy snapshot on
the immutable Verus job, while the outbox retains only an opaque reference and digest. Leases and
attempts survive restarts; active work is serialized per target identity; known transaction IDs are
reconfirmed rather than resubmitted; and ambiguous submissions cannot automatically resubmit until
exact digest readback proves the prior outcome. Worker metrics use bounded state/error labels only.
Operational response is defined in [`runbooks/verus-worker.md`](./runbooks/verus-worker.md).

### 9.3 Publishing patterns

MVP uses:

- **Pattern A:** private canonical status plus signed credential/proof packet; and
- **Pattern B:** privacy-safe committee anchors for schema, policy, status-list/revocation commitments, and aggregate cycle reports.

Optional later:

- **Pattern C:** participant explicitly approves an IdentityUpdateRequest to add a public proof reference to the participant’s own VerusID.

Pattern C cannot be required for baseline verification and remains disabled until privacy and mobile compatibility gates pass.

## 10. Wallet request architecture

Wallet requests are ephemeral authorization ceremonies, not long-lived login tokens.

```text
Browser -> POST /auth/verus/challenges
API -> create challenge record + signed request envelope
API -> browser receives deep-link/QR payload and polling token
Participant -> reviews request in Verus Mobile
Verus Mobile -> signed callback/response
API -> verify state, nonce, expiry, audience, network, signer, signature, identity state
API -> consume challenge once and create/update identity link
Browser -> poll or resume to success/failure result
```

The callback endpoint must be public HTTPS, narrowly scoped, rate limited, and safe to call more than once. A response does not bypass application role or committee-policy authorization.

## 11. Public status architecture

Avoid a public endpoint that accepts arbitrary VerusID or personal identifiers and reveals membership.

Preferred modes:

1. participant presents an opaque, high-entropy reference;
2. participant creates a short-lived consented status token for a specific relying-party audience;
3. relying party verifies a signed credential and checks revocation/freshness through an approved endpoint; or
4. public verifier scans a participant-presented QR and shows only approved status.

The status service computes:

```text
active = issuance_complete
      AND now < expires_at
      AND revocation_effective_at IS NULL
      AND superseded_by IS NULL
      AND issuer/committee is not suspended for status purposes
```

The exact consequence of committee suspension for already-issued credentials is a protocol decision and must be versioned.

## 12. Multi-tenancy and authorization

Every committee-owned operational record includes `committee_id`. Domain repositories require an explicit actor and tenancy context; they must not expose generic unrestricted query methods to controllers.

Suggested role capabilities:

| Role | Capabilities |
|---|---|
| participant | Own account, request, consent, status, appeal, presented proof |
| committee_scheduler | Sessions, capacity, notifications; no decision authority by default |
| committee_reviewer | Check-in/review/decision for authorized sessions; no member management |
| committee_signer | Approved signing action under policy; may be distinct from reviewer |
| committee_admin | Roster and operations; cannot silently change protocol policy |
| privacy_officer | Access/correction/retention requests with restricted evidence access |
| security_officer | Sessions, credentials, incident suspension; no ordinary evidence access |
| protocol_steward | Official committee/release/policy approval with four-eyes controls |
| relying_party | Scoped status checks only |
| support | Limited participant support views; no evidence/decision override |

Roles do not replace policy conditions. A user with a role still needs the correct committee, session, conflict status, authentication strength, and state transition.

Issue #17 implements this matrix as a framework-independent deny-by-default decision. PostgreSQL
loads only active account/access/member/role state inside the requested committee tenant and marks
unresolved target conflicts. Session, challenge, recovery, rate-limit, passkey, and consent records
retain opaque references/digests; controllers must not reconstruct authorization from client claims.

## 13. Deployment environments

| Environment | Network | Data | Public assurance |
|---|---|---|---|
| local | Fake RPC or isolated VRSCTEST | Synthetic | None |
| CI | Fake RPC + deterministic fixtures | Synthetic | None |
| testnet | VRSCTEST | Synthetic or expressly consented test users | Test only |
| pilot | VRSCTEST unless separately approved | Limited real participants under approved documents | Limited published scope |
| production | Decision pending | Decision pending | None until approved |

Environment configuration must be runtime validated. A production hostname does not itself authorize mainnet.

## 14. Observability and privacy

Use structured events with an explicit classification:

- `public`;
- `operational_nonpersonal`;
- `personal_restricted`;
- `security_sensitive`; or
- `secret_never_log`.

Default logs include correlation ID, operation, actor type, committee reference, result class, duration, and software version. They exclude evidence details, face/document data, exact address, contact values, wallet payload bodies, private RPC credentials, keys, and status-query identifiers unless a narrowly justified hashed/opaque form is approved.

Metrics use aggregate counts with small-cell safeguards. Tracing must not capture request bodies on sensitive routes.

## 15. Failure and degradation rules

| Dependency failure | Required behaviour |
|---|---|
| Verus node unavailable | Canonical private status continues; new anchor/update jobs remain pending; do not falsely mark chain verification complete. |
| Node unsynced/wrong chain | Pause writes; raise incident; never fall through to another network. |
| Wallet callback interrupted | Browser polls challenge state; callback is idempotent. |
| Email provider unavailable | Queue/retry; show in-app status; do not lose expiry correctness. |
| Redis unavailable | Reject or safely defer side-effect commands; domain transaction must not claim external work completed. |
| Public verifier under abuse | Tighten limits or suspend lookup without affecting canonical expiry/revocation. |
| Committee console unavailable | Preserve records and provide operational contingency; do not issue from ad hoc notes without approved recovery entry. |
| RMR unavailable | CBC remains independent; no status or evidence is pushed without an approved request. |
| Committee compromised | Suspend committee operations, rotate/revoke access, apply protocol rule for existing attestations, preserve incident audit. |
| Reorg after anchor | Move anchor to `reorg_pending`, re-evaluate confirmation, do not change private attestation history automatically. |

## 16. Architecture decision records required

Before or during implementation, create ADRs for:

1. monorepo and modular-monolith choice;
2. application/API framework;
3. authentication and recovery;
4. canonical status and Verus publishing patterns;
5. wallet request and callback envelope;
6. committee signing path and mobile compatibility;
7. VDXF namespace ownership;
8. anti-enumeration status model;
9. renewal entropy and deterministic selection;
10. audit-log integrity;
11. sensitive-field encryption and deletion; and
12. deployment and mainnet guardrails.

## 17. Architecture definition of done

- [x] Trust boundaries are represented in deployment configuration and tests.
- [ ] Domain transitions cannot be bypassed through controllers, scripts, or jobs.
- [ ] Public serializers use explicit allowlists.
- [x] Participant and committee authentication audiences are separate.
- [ ] Every privileged action is authorized and audited.
- [ ] PostgreSQL state, audit event, and outbox event commit atomically.
- [ ] Verus writes are private-network, VRSCTEST-gated, idempotent, and read back.
- [ ] No raw evidence, exact-address dossier, wallet secret, or private RPC secret enters logs or chain payloads.
- [ ] Status lookup resists enumeration and returns minimum approved fields.
- [ ] Service failure never silently converts an unknown state into active or invalid.
- [ ] Backups restore successfully and incident controls can suspend affected functions.
