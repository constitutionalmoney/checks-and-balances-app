# Third-Party Notices

This project will use third-party software and Verus ecosystem components. Each dependency remains governed by its own licence, notices, attribution, and distribution conditions.

## WP-01 direct dependency inventory

Exact JavaScript dependency resolution and transitive metadata are recorded in `pnpm-lock.yaml`.
The table below records the direct application, build, test, CI, and local-container components
selected for the non-operational foundation.

| Component                           |                    Version | Purpose                                           | Licence                             | Distribution/use note                               |
| ----------------------------------- | -------------------------: | ------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| Node.js                             |                    24.19.0 | LTS runtime and container base                    | MIT                                 | Runtime/container base                              |
| pnpm                                |                    11.20.0 | Workspace package manager                         | MIT                                 | Development and CI                                  |
| Turborepo                           |                     2.10.8 | Workspace task graph                              | MIT                                 | Development and CI                                  |
| TypeScript                          |                      6.0.3 | Strict type system/compiler                       | Apache-2.0                          | Build tooling                                       |
| Next.js                             |                     16.3.0 | Participant, committee, verifier, and docs shells | MIT                                 | Bundled application runtime                         |
| React / React DOM                   |                     19.2.8 | Next.js shell rendering                           | MIT                                 | Bundled application runtime                         |
| NestJS packages                     |                    11.1.28 | API shell                                         | MIT                                 | Bundled application runtime                         |
| NestJS Swagger                      |                     11.4.6 | Health/status OpenAPI generation                  | MIT                                 | Bundled application runtime                         |
| Fastify                             |                     5.10.0 | NestJS-compatible API/worker HTTP runtime         | MIT                                 | Bundled application runtime                         |
| `@fastify/cors` / `@fastify/helmet` |            11.3.0 / 13.1.0 | CORS and security headers                         | MIT                                 | Bundled application runtime                         |
| Prisma packages                     |                      7.9.1 | Model-free PostgreSQL schema/migration foundation | Apache-2.0                          | Build/runtime dependency                            |
| `pg` / `@types/pg`                  |            8.22.0 / 8.20.4 | PostgreSQL readiness                              | MIT                                 | Runtime/build types                                 |
| ioredis                             |                      6.0.0 | Redis readiness                                   | MIT                                 | Bundled application runtime                         |
| BullMQ                              |                      6.0.8 | Empty worker/queue shell                          | MIT                                 | Bundled application runtime                         |
| Zod                                 |                      4.4.3 | Runtime configuration validation                  | MIT                                 | Bundled application runtime                         |
| Pino                                |                     10.3.1 | Structured redacted logging                       | MIT                                 | Bundled application runtime                         |
| RxJS / reflect-metadata             |              7.8.2 / 0.2.2 | NestJS runtime peers                              | Apache-2.0                          | Bundled application runtime                         |
| Ajv / ajv-formats                   |             8.20.0 / 3.0.1 | JSON Schema validation                            | MIT                                 | CI/build tooling                                    |
| Swagger Parser                      |                     12.1.0 | OpenAPI validation                                | MIT                                 | CI/build tooling                                    |
| ESLint / `@eslint/js`               |            10.8.0 / 10.0.1 | Source linting                                    | MIT                                 | CI/build tooling                                    |
| typescript-eslint                   |                     8.66.0 | TypeScript ESLint support                         | MIT                                 | CI/build tooling                                    |
| globals                             |                     17.9.0 | ESLint runtime globals                            | MIT                                 | CI/build tooling                                    |
| Prettier                            |                      3.9.6 | Formatting checks                                 | MIT                                 | CI/build tooling                                    |
| Vitest                              |                     4.1.10 | Unit, integration, and HTTP shell tests           | MIT                                 | CI/build tooling                                    |
| tsx                                 |                     4.23.9 | TypeScript development/scripts                    | MIT                                 | Development and CI                                  |
| DefinitelyTyped React/Node types    | 19.2.18 / 19.2.4 / 24.13.3 | Compile-time declarations                         | MIT                                 | Build tooling                                       |
| PostgreSQL container                |              18.1-bookworm | Synthetic local database                          | PostgreSQL Licence                  | Local development service                           |
| Redis container                     |             8.2.3-bookworm | Synthetic local queue/cache                       | RSALv2 OR SSPL-1.0 OR AGPL-3.0-only | Local service; deployment licensing requires review |
| Mailpit container                   |                     1.30.6 | Local mail capture                                | MIT                                 | Local development service                           |
| WireMock container                  |                     3.13.2 | Fake allowlisted Verus readiness RPC              | Apache-2.0                          | Local/CI test service                               |

GitHub Actions are pinned by full commit SHA in `.github/workflows/ci.yml`. Checkout, Node setup,
pnpm setup, dependency review, Gitleaks, Docker Buildx/build-push, and Trivy retain their upstream
MIT or Apache-2.0 licences and notices. CI receives no production secrets.

## Required inventory fields

Before a dependency is used in a release, record:

| Component                           | Source/version    | Purpose                       | Licence          | Distributed? | Required notice/source action | Reviewer             |
| ----------------------------------- | ----------------- | ----------------------------- | ---------------- | ------------ | ----------------------------- | -------------------- |
| Verus Mobile integration references | Not used in WP-01 | Future wallet compatibility   | Not yet selected | No           | Deferred to issue #19         | Pending future issue |
| Verus daemon/client integration     | Not used in WP-01 | Future private VRSCTEST RPC   | Not yet selected | No           | WP-01 uses WireMock only      | Pending future issue |
| `verus-typescript-primitives`       | Not installed     | Future typed Verus structures | Not yet selected | No           | Deferred to issue #18/#19     | Pending future issue |
| `verusid-ts-client`                 | Not installed     | Future wallet helpers         | Not yet selected | No           | Deferred to issue #19         | Pending future issue |

## Rules

- Pin exact versions or commits for security-sensitive Verus compatibility testing.
- Do not assume all Verus-related code or build dependencies share one licence.
- Preserve required copyright, licence, attribution, source-offer, and modification notices.
- Do not copy code from an issue, gist, chat, model output, or undocumented source without verified provenance.
- Review container images, operating-system packages, cryptographic libraries, databases, queues, fonts, icons, and generated assets—not only direct JavaScript dependencies.
- Run automated licence inventory in CI, but require human review for ambiguous, copyleft, source-available, custom, or missing licences.
- Do not approve a release with an unresolved licence marked `UNKNOWN`.

## Relationship to Apache-2.0

Apache-2.0 governs designated original repository content. It does not replace third-party licences. A dependency may impose additional conditions on its own component or on a distributed combined work; those conditions must be assessed before release.
