# `@cbc/db`

Owner: `@constitutionalmoney`

Issue #16 persistence foundation plus PostgreSQL and Redis readiness checks.

The first migration adds privacy-minimized jurisdiction, committee, participant-account,
policy-version, and consent-receipt records. Participant accounts contain only an opaque external
reference in this slice: no name, contact value, address, evidence, document, image, biometric, or
wallet field exists.

Infrastructure records provide:

- hashed idempotency keys with immutable request identity;
- hash-chained append-only audit events;
- immutable outbox work identity plus leased delivery state and append-only attempts; and
- VRSCTEST-only Verus job metadata pinned to the expected chain ID.

The outbox stores an opaque payload reference and digest, not an arbitrary JSON or RPC payload. The
Verus job table is a durable intent record only; it cannot execute a CLI/RPC command. Mainnet is not
a database enum value and is rejected by the migration constraint.

`prisma/persistence-smoke.sql` uses synthetic constants inside a rolled-back transaction to verify
idempotency, audit chaining/immutability, outbox-attempt immutability, Verus job immutability, and
wrong-chain rejection after an empty-database migration.

Business repositories, role/quorum authorization, lifecycle persistence, raw evidence handling,
and RPC submission remain outside this slice. The seed command still writes no records.
