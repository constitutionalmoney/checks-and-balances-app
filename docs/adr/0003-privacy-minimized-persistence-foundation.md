# ADR 0003: Privacy-minimized persistence foundation

- Status: accepted for the second issue #16 implementation slice
- Date: 2026-08-06
- Issue: #16

## Context

The domain state machines need a durable PostgreSQL foundation before controllers, authorization,
session workflows, or external workers can be connected. The repository must establish tenant,
privacy, idempotency, audit, and outbox boundaries without deciding unfinished quorum or evidence
policy and without creating a document repository or executable chain-write path.

A local VRSCTEST node is available for later integration work. Node availability does not remove
the need for typed RPC allowlists, approved schemas, outbox reconciliation, confirmation, readback,
or a mainnet decision gate.

## Decision

Create the first versioned Prisma/PostgreSQL migration with:

- public-facing jurisdiction and committee identity records;
- an opaque participant-account record with no personal-contact or evidence fields;
- immutable policy-version content identity and minimal versioned consent receipts;
- hashed idempotency keys and request digests;
- explicit, hash-chained audit fields with append-only database triggers;
- outbox event identity separated from mutable lease/delivery state;
- append-only delivery attempts; and
- durable Verus job intent metadata restricted to `VRSCTEST` and its expected chain ID.

Do not put arbitrary JSON payloads into the outbox. Persist an opaque internal payload reference,
schema version, and digest so later allowlisted handlers can load and validate their own minimum
record. Do not store raw idempotency keys, RPC credentials, wallet material, exact addresses,
evidence, private narratives, or document contents in these infrastructure records.

Use application-generated UUIDs and separate opaque external references. The migration adds
database checks and immutable-identity triggers beyond what Prisma can express. A synthetic SQL
smoke test runs after migration and rolls back all test records.

## Consequences

- Mainnet cannot be represented in the Verus job network enum, and the verified VRSCTEST chain ID
  is enforced independently.
- Audit and attempt rows reject update/delete operations; audit insertion serializes each chain
  head and rejects an incorrect previous hash.
- Idempotency, outbox, policy-version, and Verus-job identity fields cannot be changed after insert.
- The local and Dokploy stacks migrate before API/worker startup.
- This slice creates durable primitives but does not yet claim atomic business-state/audit/outbox
  repositories, crash-safe worker leasing, authorization, quorum, participant collection, or a
  completed issue #16.
