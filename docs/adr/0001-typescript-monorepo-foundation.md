# ADR 0001: TypeScript modular-monolith foundation

- Status: accepted for WP-01
- Date: 2026-08-06
- Issue: #15

## Context

The approved architecture calls for a small reproducible foundation that keeps UI, API, worker,
domain, data, authentication, Verus, contracts, configuration, observability, and testing
boundaries visible without implementing protocol policy.

## Decision

Use Node.js 24 LTS, pnpm workspaces, Turborepo, strict TypeScript 6.0, four Next.js 16 shells,
NestJS 11 with Fastify 5 for the API shell, a BullMQ 6 worker shell, Prisma 7/PostgreSQL, Redis,
and Docker Compose. Runtime configuration is server-validated and rejects mainnet, public RPC,
production activation, sensitive capabilities, and session-audience reuse.

Versions are exact in manifests/lockfile. TypeScript 7 is not used because the selected current
typescript-eslint release officially supports TypeScript below 6.1. GitHub Actions are pinned by
full commit SHA.

## Consequences

- Issue #16 can add framework-independent domain/data behaviour without moving repository roots.
- The scaffold builds without a wallet, private key, live RPC credential, production secret, or
  participant record.
- The empty shells are not microservices or an operational protocol claim.
- Production, mainnet, document upload, and unfinished protocol capabilities remain technically
  blocked until separate approved work changes the guard and release controls.
