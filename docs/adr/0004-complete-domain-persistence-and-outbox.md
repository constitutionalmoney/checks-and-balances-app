# ADR 0004: Complete the policy-neutral domain persistence and outbox core

- Status: Accepted
- Date: 2026-08-07
- Issue: #16

## Context

The protocol needs durable committee, participant, session, decision, attestation, renewal, appeal,
privacy, relying-party, notification, audit, outbox, and VRSCTEST-intent records before any public
workflow can be enabled. Several policy decisions remain unfinished: reviewer roles and quorum,
renewal selection, evidence procedure, appeal deadlines, participant publication, and mainnet.

The persistence core must therefore enforce lifecycle, tenancy, expiry, immutability, idempotency,
and crash recovery without treating an unfinished policy as approved behaviour.

## Decision

1. `@cbc/domain` remains dependency-free and exposes only named lifecycle commands. It contains no
   HTTP, UI, Prisma, RPC, or generic status setter.
2. Reviewer decisions consume a versioned authorization decision. The domain rejects unauthorized,
   conflicted, and cross-committee decisions but does not choose roles or quorum.
3. Every committee-owned operational row carries `committee_id`. Composite foreign keys bind
   requests, sessions, attendance, reviewers, attestations, cycles, and their children to one
   committee tenant.
4. An attestation validity value is immutable and may not exceed 45 days. Both domain code and a
   PostgreSQL check enforce the maximum. A database function/view derives effective status from the
   database clock, so an expiry-worker outage cannot keep an attestation active.
5. Renewal creates a new version with an immutable predecessor reference. Activating the successor
   supersedes the predecessor; its original validity window is never extended.
6. Named repositories use serializable transactions and optimistic versions. Domain state, audit,
   idempotency result, and outbox intent commit together or roll back together.
7. Audit records are append-only. PostgreSQL serializes each chain head and computes the event hash
   from canonical JSON plus the predecessor hash. Prohibited evidence and secret fields are absent.
8. Outbox workers claim with `FOR UPDATE SKIP LOCKED`, owner-bound expiring leases, and heartbeats.
   Expired claims become immutable failed attempts before reassignment. Retry delay is exponential
   and bounded by caller-supplied operational limits; exhaustion becomes a dead letter.
9. Outbox payloads remain opaque references plus digests. Verus and anchor records can represent
   only VRSCTEST and its expected chain ID. No RPC submission is implemented by this issue.
10. Evidence records contain only a category, review result, policy version, and the sole supported
    retention value `not_retained`.

## Consequences

- Controllers and workers can use named repositories but cannot request an arbitrary next state.
- Direct SQL still meets database lifecycle, tenancy, validity, and append-only safeguards.
- Authorization issue #17 must produce the authorization decisions consumed here; it does not need
  to redesign persistence.
- The signing/quorum RFC must define threshold calculation before aggregate approval is enabled.
- Renewal selection artifacts can be stored and transitioned, but no selection algorithm is chosen.
- Verus issue #18 can consume the outbox and VRSCTEST job records without publishing inline.
- Document upload and raw evidence storage remain absent; mainnet remains unrepresentable.

## Migration and rollback

Migration `20260807050000_issue_16_domain_core_complete` is safe for the current non-operational,
synthetic-only environment. It adds records, constraints, triggers, a status function/view, and
`pgcrypto` for audit digests. It backfills opaque consent references deterministically from internal
UUIDs.

Before deployment, rollback is a normal code/migration revert on a disposable environment. After
durable data exists, do not drop the audit, decision, attestation, or outbox tables. Apply a reviewed
forward migration that preserves append-only history and validity windows.

Several PostgreSQL-only constraints and triggers are intentionally migration-defined because Prisma
schema syntax cannot express them. Production and CI use `prisma migrate deploy`; future migration
generation must occur in a disposable database, and reviewers must reject drift SQL that removes
the migration-only tenancy, lifecycle, audit, or outbox safeguards.

## Rejected alternatives

- UI or worker-only expiry: fails closed only while the scheduler is healthy.
- A generic repository status setter: bypasses named domain commands.
- One foreign key per record without tenant composites: permits cross-committee child references.
- Marking work complete on submission: confuses an attempt with external reconciliation.
- Storing arbitrary JSON/RPC payloads in the outbox: expands the evidence and secret leak surface.
- Hard-coded quorum or renewal randomness: converts an unfinished policy into product behaviour.
