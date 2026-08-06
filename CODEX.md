# Codex Execution Guide

This file tells Codex how to build the Checks & Balances Protocol application from this repository without converting unfinished protocol questions into accidental product behaviour.

## 1. Read before changing code

Read these files in order:

1. `README.md`
2. `docs/PROTOCOL_STATUS.md`
3. `docs/PRD.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. `docs/ARCHITECTURE.md`
6. `docs/VERUS_MOBILE_INTEGRATION.md`
7. `docs/PRIVACY_AND_DATA.md`
8. `docs/THREAT_MODEL.md`
9. `docs/SUBDOMAINS.md`
10. `CONTRIBUTING.md`
11. `GOVERNANCE.md`
12. the selected GitHub issue and every listed dependency

When these sources disagree:

- current approved protocol status beats historical issue language;
- privacy and security prohibitions beat implementation convenience;
- an unresolved rule remains unresolved;
- do not choose a policy silently; and
- record a blocker or create an RFC rather than inventing certainty.

## 2. Project posture

- Status: specification and pilot preparation.
- Network: VRSCTEST before any mainnet decision.
- Public sessions: not open.
- Public committee directory: not live.
- VerusID linking: planned and optional.
- Every attestation: maximum 45-day validity.
- Random peer renewal: required concept, exact rules unfinished.
- Twelve-person committee: current public model; formal scope/exception rule unfinished.
- Two-of-three signing: legacy proposal, not final.
- Identity documents and photos: no upload/storage module by default.
- RMR integration: separate, planned, disabled by default.
- Numeric trust/social-credit weighting: not approved.

## 3. Absolute engineering constraints

Never:

- request, accept, store, log, or transmit private keys, seed phrases, WIFs, z-seeds, wallet files, spending keys, or wallet backups;
- expose authenticated `verusd` RPC publicly;
- write to mainnet;
- put raw evidence, face images, document numbers, exact addresses, utility bills, private notes, or appeal details on-chain;
- implement arbitrary public status lookup by name, email, address, or VerusID;
- let a route jump directly from `requested` to `active`;
- extend an attestation silently beyond 45 days;
- treat VerusID control as proof of human presence or committee membership;
- treat human attestation as legal residence, citizenship, voting eligibility, uniqueness, truth, consensus, or political intent;
- let an AI/agent actor attend, consent, approve, sign, or express civic intent for a human;
- add document/photo capture because a legacy issue once requested it;
- hard-code quorum, renewal selection, uniqueness, locality, or mainnet rules before approval;
- claim a feature is live because tests pass; or
- mark an issue done without reporting tests and remaining limitations.

## 4. Preferred implementation shape

Use the architecture document unless an approved ADR changes it:

```text
pnpm workspaces + Turborepo
TypeScript strict mode
Next.js participant/committee/verifier/docs
NestJS with Fastify adapter API
PostgreSQL + Prisma
Redis + BullMQ
framework-independent domain package
passkeys + verified email fallback
optional VerusID linking
transactional outbox
private VRSCTEST Verus worker/RPC
OpenAPI 3.1 + JSON Schema
Docker Compose + GitHub Actions
```

Keep a modular monolith plus workers initially. Do not split services merely to mimic an enterprise diagram.

## 5. Task workflow

For every issue:

1. Fetch and read the issue, dependencies, and relevant docs.
2. Inspect the repository; do not assume planned folders already exist.
3. State the smallest coherent implementation slice.
4. Identify unresolved protocol decisions. Stop only that portion; continue all independent work.
5. Create or update an ADR for material architecture choices.
6. Implement domain rules before transport/UI shortcuts.
7. Add migrations/config with rollback or forward-fix notes.
8. Add unit, integration, negative authorization, privacy, and end-to-end tests as applicable.
9. Update OpenAPI/schema/docs/status flags in the same change.
10. Run relevant checks.
11. Review the diff for secrets, personal data, forbidden fields, mainnet configuration, and unsupported public claims.
12. Commit with DCO sign-off and open a narrow pull request.

## 6. Required response after completing an issue

Use this structure:

```markdown
## Result

### Issue
- #<number>: <title>

### Implemented
- ...

### Files changed
- `path`: purpose

### Protocol and architecture
- Approved rule/ADR used
- Unfinished rule left disabled or represented as configuration

### Validation
- `pnpm lint` — pass/fail
- `pnpm typecheck` — pass/fail
- `pnpm test` — pass/fail
- relevant integration/e2e/device/VRSCTEST checks

### Privacy, security, and accessibility
- Data added or removed
- Threats addressed
- Accessibility result

### Deployment and migration
- Environment variables
- Migration/rollback or forward-fix
- Feature flag/public-status impact

### Remaining blockers
- ...
```

Never write “all good” without evidence.

## 7. First Codex task

Use the GitHub issue created for the monorepo scaffold. A suitable initial prompt is:

```text
Work on the Checks & Balances Protocol monorepo scaffold issue only.

Before editing, read README.md, docs/PROTOCOL_STATUS.md, docs/PRD.md,
docs/IMPLEMENTATION_PLAN.md, docs/ARCHITECTURE.md, CONTRIBUTING.md,
SECURITY.md, and the issue body.

Create the smallest reproducible TypeScript monorepo foundation described by
WP-01. Use current stable, mutually compatible package versions verified from
official documentation at implementation time. Do not implement protocol
business logic, Verus writes, participant data collection, document upload,
or mainnet support in this PR.

Deliver pnpm/Turborepo workspace configuration, strict TypeScript, lint/format,
empty application/package shells, runtime configuration validation, Docker
Compose for PostgreSQL/Redis/mail capture/fake Verus RPC, health endpoints,
initial CI, and exact local commands. Include tests that prove configuration
rejects mainnet and missing secrets appropriately. Update documentation and
report every command run. Sign commits under the DCO.
```

## 8. Recommended sequence of Codex sessions

Do not ask one Codex session to build the whole product. Use the issue order and preserve review boundaries.

### Session 1 — Repository scaffold

Output: buildable empty monorepo, local services, CI.

### Session 2 — Domain state machines

Output: framework-independent lifecycle and negative transition tests; no HTTP/database shortcuts.

### Session 3 — Database, audit, and outbox

Output: migrations, repositories, idempotency, append-only audit, worker shell.

### Session 4 — Authentication and authorization

Output: passkeys/email, participant and committee session separation, role/tenant tests.

### Session 5 — Protocol/status registry

Output: versioned policy/schema/capability records and public status endpoint/UI component.

### Session 6 — Fake Verus adapter

Output: typed interface, deterministic fixtures, wrong-chain/mainnet guards.

### Session 7 — Real VRSCTEST read adapter

Output: approved read methods, node readiness, version and chain validation.

### Session 8 — VRSCTEST write/readback worker

Output: outbox, canonical manifest, size guard, idempotency, confirmation/reorg/readback.

### Session 9 — Verus Mobile fake challenge flow

Output: one-time request/callback model, replay and wrong-network tests.

### Session 10 — Device-compatible VerusID linking

Output: pinned Android/iOS compatibility and optional account link.

### Session 11 — Participant vertical slice

Output: account -> request -> schedule -> own status with synthetic data; no evidence upload.

### Session 12 — Committee vertical slice

Output: session -> check-in -> minimal review metadata -> decision -> audit.

### Session 13 — Attestation lifecycle

Output: issuance -> active -> exact expiry -> revoke -> supersede -> appeal.

### Session 14 — Renewal cycle

Output: snapshot commitment -> deterministic selection -> private notices -> aggregate report.

### Session 15 — Verifier/status API

Output: participant-presented reference, anti-enumeration, synthetic SDK fixtures.

### Session 16 — Optional identity update spike

Output: feature-flagged public-proof IdentityUpdateRequest with exact diff/readback; no pilot enablement.

### Session 17 — RMR adapter

Output: disabled-by-default minimum status integration and privacy contract tests.

### Session 18 — Deployment and pilot rehearsal

Output: testnet hosts, monitoring, backups, incident controls, full synthetic/VRSCTEST run.

## 9. Definition-of-ready for an implementation issue

An issue is ready when it has:

- problem and user outcome;
- phase/work package;
- dependencies;
- approved protocol rule or explicit feature-flag treatment;
- acceptance criteria;
- privacy/security constraints;
- tests expected;
- documentation impact; and
- non-goals.

When the issue lacks one of these, improve the issue before coding. Do not fill a protocol-policy gap from intuition.

## 10. Branch and pull-request conventions

- Branch: `agent/<issue-number>-<short-description>`.
- Commit: concise imperative description, signed with `-s`.
- Pull request: one issue or tightly coupled slice.
- Link issue using `Closes #<number>` only when every acceptance criterion is met.
- Draft PR until tests and documentation are complete.
- Do not include unrelated formatting or dependency upgrades.

## 11. Database and migration rules

- Never edit an applied migration.
- Use explicit constraints for lifecycle invariants where feasible.
- Avoid generic repositories that bypass tenancy/domain rules.
- Include seed data only for synthetic/testnet entities.
- Never seed real participant information.
- State whether rollback is safe; where it is not, provide a forward-fix plan.
- Test migration from empty and previous schema.

## 12. API and contract rules

- Version external routes under `/api/v1`.
- Generate OpenAPI from source and validate it in CI.
- Use explicit request/response DTO allowlists.
- Require idempotency keys for privileged writes.
- Return stable machine error codes without personal-data leakage.
- Represent `unknown`, `unavailable`, `expired`, and `revoked` distinctly.
- Do not return numeric trust weights.
- Do not add an arbitrary identity status search route.

## 13. UI rules

- WCAG 2.2 AA target.
- Plain language and visible environment/status labels.
- No QR-only critical path.
- No hidden wallet or chain action.
- Show exact identity-update public diff and permanence warning.
- Do not display an attestation as “verified forever.”
- Explain 45-day expiry and renewal.
- Separate human, locality, uniqueness, and eligibility claims.
- No document upload/camera control.
- Do not expose precise session location before the approved visibility point.

## 14. Verus rules

- VRSCTEST selected server-side; never from arbitrary client input.
- Typed allowlisted RPC adapter only.
- Private RPC network.
- No synchronous chain confirmation in HTTP handlers.
- Canonical bytes and deterministic digest.
- `getvdxfid` fixture for each key.
- Supported array form for contentmultimap values.
- Payload byte-size guard.
- Search/readback before retry after ambiguous submission.
- Confirmation and reorg state.
- Read back with `getidentity`/`getidentitycontent` before marking verified.
- Participant identity update remains optional and wallet-approved.
- Do not assume arbitrary mobile multisig; prove compatibility.

## 15. Security review before every PR

Ask:

```text
Can this issue create or alter active status?
Can it bypass attendance, threshold, conflict, expiry, revocation, or appeal?
Can it expose participant membership, evidence, contact, location, or wallet activity?
Can it be replayed, enumerated, forged, cross-tenant, or run on the wrong chain?
Can a dependency outage make the system fail open?
Can a log, metric, trace, screenshot, fixture, or error leak sensitive data?
Can an agent or automated path perform a human-only act?
Can this code write to mainnet or public identity content unexpectedly?
```

Add tests for every “yes.”

## 16. Stop conditions

Stop and report a blocker for the affected portion when:

- a protocol decision is required but not approved;
- a requested dependency/API/request type is not supported by pinned official sources;
- the only implementation would require raw evidence collection contrary to current policy;
- a migration risks irreversible production loss without an approved plan;
- a security/privacy gate cannot be met; or
- mainnet access is required.

Continue independent work that does not depend on the blocker. A blocker is not permission to abandon the entire issue.

## 17. Final release restraint

Codex may build and test software. It does not declare an official committee, open a public verification session, approve legal/privacy documents, accept residual risk, or enable mainnet. Those are steward decisions recorded through governance and release controls.
