# Development foundation

WP-01 is a reproducible, non-operational scaffold. It contains no protocol business logic,
participant collection, document upload, wallet flow, Verus write, or mainnet support.

## Prerequisites

- Node.js `24.19.0` (the `.node-version` pin)
- pnpm `11.20.0` (the `packageManager` pin)
- Docker Desktop with Compose for the full local stack

If Corepack is available:

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
```

Otherwise install the same pnpm version using the supported method for your Node distribution.

## Clean-clone workflow

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm local:up
```

The local endpoints are:

| Surface                     | URL                                                                 |
| --------------------------- | ------------------------------------------------------------------- |
| Participant shell           | `http://localhost:3100`                                             |
| Committee shell             | `http://localhost:3101`                                             |
| Verifier shell              | `http://localhost:3102`                                             |
| Developer docs shell        | `http://localhost:3103`                                             |
| API health/readiness/status | `http://localhost:4000/health`, `/ready`, `/api/v1/protocol/status` |
| Worker health/readiness     | `http://localhost:4010/health`, `/ready`                            |
| Mailpit                     | `http://localhost:8025`                                             |
| Fake Verus RPC              | private in Compose; host test port `http://localhost:18080`         |
| PostgreSQL / Redis          | host ports `55432` / `56379`                                        |

Stop the local stack with `pnpm local:down`.

## Root commands

```bash
pnpm dev
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:persistence # requires a migrated synthetic PostgreSQL database
pnpm contracts:validate
pnpm db:validate
pnpm build
pnpm license:check
pnpm db:migrate
pnpm db:seed
```

The database schema contains the issue #16 privacy-minimized domain core. `db:seed` writes no data.
`test:persistence` creates randomized synthetic records to verify lifecycle, tenancy, expiry,
idempotency, atomic rollback, audit chaining, and outbox crash recovery; use it only against a
disposable local/CI database. Compose CI runs it after applying every migration from empty.

## Environment profiles

- `local` and `ci`: fake RPC and synthetic dependencies only.
- `testnet`: VRSCTEST plus explicit private-network RPC credentials.
- `pilot`: defined for validation but still VRSCTEST and disabled capabilities.
- `production`: reserved and rejected by WP-01.

`VRSC`, public RPC hosts, URL-embedded RPC credentials, equal participant/committee session
audiences, mainnet writes, document upload, public sessions, and every unfinished capability fail
configuration validation.
