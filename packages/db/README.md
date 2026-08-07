# `@cbc/db`

Owner: `@constitutionalmoney`

Canonical PostgreSQL persistence for issue #16, plus PostgreSQL and Redis readiness checks.

The package exposes named verification, attestation, supporting-lifecycle, and leased-outbox
repositories. Serializable transactions bind domain state, idempotency, append-only audit, and
opaque outbox intent. Composite foreign keys enforce committee tenancy; immutable validity and a
database-clock status function enforce the exact 45-day boundary even if a worker is unavailable.

The schema stores only privacy-minimized metadata. Evidence retention is `not_retained`; outbox
payloads are opaque references and digests; Verus intent is VRSCTEST-only. No document upload, raw
evidence, RPC submission, or mainnet representation is present.

For a migrated PostgreSQL database, run:

```bash
pnpm test:persistence
```

The verification creates randomized synthetic references only. CI runs it after an empty migration
and the rolled-back SQL constraint suite. The seed command still writes no records.

Deploy checked-in migrations with `pnpm db:migrate:deploy`. The Issue #16 migration deliberately
contains PostgreSQL-only tenant foreign keys, transition triggers, append-only guards, and status
functions that Prisma schema syntax cannot represent. Do not accept a `prisma migrate dev` drift
proposal that removes those reviewed constraints; generate future migrations in a disposable
database and review the SQL against this migration before deployment.
