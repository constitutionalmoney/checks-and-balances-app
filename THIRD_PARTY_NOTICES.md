# Third-Party Notices

This project will use third-party software and Verus ecosystem components. Each dependency remains governed by its own licence, notices, attribution, and distribution conditions.

## Direct dependency inventory

Exact JavaScript dependency resolution and transitive metadata are recorded in `pnpm-lock.yaml`.
The table below records the direct application, authentication, build, test, CI, and local-container
components selected for the non-operational foundation and subsequent completed issues.

| Component                           |                    Version | Purpose                                              | Licence                             | Distribution/use note                               |
| ----------------------------------- | -------------------------: | ---------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| Node.js                             |                    24.19.0 | LTS runtime and container base                       | MIT                                 | Runtime/container base                              |
| pnpm                                |                    11.20.0 | Workspace package manager                            | MIT                                 | Development and CI                                  |
| Turborepo                           |                     2.10.8 | Workspace task graph                                 | MIT                                 | Development and CI                                  |
| TypeScript                          |                      6.0.3 | Strict type system/compiler                          | Apache-2.0                          | Build tooling                                       |
| Next.js                             |                     16.3.0 | Participant, committee, verifier, and docs shells    | MIT                                 | Bundled application runtime                         |
| React / React DOM                   |                     19.2.8 | Next.js shell rendering                              | MIT                                 | Bundled application runtime                         |
| NestJS packages                     |                    11.1.28 | API shell                                            | MIT                                 | Bundled application runtime                         |
| NestJS Swagger                      |                     11.4.6 | Health/status OpenAPI generation                     | MIT                                 | Bundled application runtime                         |
| Fastify                             |                     5.10.0 | NestJS-compatible API/worker HTTP runtime            | MIT                                 | Bundled application runtime                         |
| `@fastify/cors` / `@fastify/helmet` |            11.3.0 / 13.1.0 | CORS and security headers                            | MIT                                 | Bundled application runtime                         |
| Prisma packages                     |                      7.9.1 | Model-free PostgreSQL schema/migration foundation    | Apache-2.0                          | Build/runtime dependency                            |
| `pg` / `@types/pg`                  |            8.22.0 / 8.20.4 | PostgreSQL readiness                                 | MIT                                 | Runtime/build types                                 |
| ioredis                             |                      6.0.0 | Redis readiness                                      | MIT                                 | Bundled application runtime                         |
| BullMQ                              |                      6.0.8 | Empty worker/queue shell                             | MIT                                 | Bundled application runtime                         |
| Zod                                 |                      4.4.3 | Runtime configuration validation                     | MIT                                 | Bundled application runtime                         |
| Pino                                |                     10.3.1 | Structured redacted logging                          | MIT                                 | Bundled application runtime                         |
| RxJS / reflect-metadata             |              7.8.2 / 0.2.2 | NestJS runtime peers                                 | Apache-2.0                          | Bundled application runtime                         |
| Ajv / ajv-formats                   |             8.20.0 / 3.0.1 | JSON Schema validation                               | MIT                                 | CI/build tooling                                    |
| Swagger Parser                      |                     12.1.0 | OpenAPI validation                                   | MIT                                 | CI/build tooling                                    |
| ESLint / `@eslint/js`               |            10.8.0 / 10.0.1 | Source linting                                       | MIT                                 | CI/build tooling                                    |
| typescript-eslint                   |                     8.66.0 | TypeScript ESLint support                            | MIT                                 | CI/build tooling                                    |
| globals                             |                     17.9.0 | ESLint runtime globals                               | MIT                                 | CI/build tooling                                    |
| Prettier                            |                      3.9.6 | Formatting checks                                    | MIT                                 | CI/build tooling                                    |
| Vitest                              |                     4.1.10 | Unit, integration, and HTTP shell tests              | MIT                                 | CI/build tooling                                    |
| `@simplewebauthn/server`            |                     13.3.2 | WebAuthn option generation and response verification | MIT                                 | Bundled authentication runtime                      |
| tsx                                 |                     4.23.9 | TypeScript development/scripts                       | MIT                                 | Development and CI                                  |
| DefinitelyTyped React/Node types    | 19.2.18 / 19.2.4 / 24.13.3 | Compile-time declarations                            | MIT                                 | Build tooling                                       |
| PostgreSQL container                |              18.1-bookworm | Synthetic local database                             | PostgreSQL Licence                  | Local development service                           |
| Redis container                     |             8.2.3-bookworm | Synthetic local queue/cache                          | RSALv2 OR SSPL-1.0 OR AGPL-3.0-only | Local service; deployment licensing requires review |
| Mailpit container                   |                     1.30.6 | Local mail capture                                   | MIT                                 | Local development service                           |
| WireMock container                  |                     3.13.2 | Fake allowlisted Verus readiness RPC                 | Apache-2.0                          | Local/CI test service                               |
| Express                             |                      5.2.1 | Hosted VerusID HTTP contract                         | MIT                                 | Bundled hosted-auth runtime                         |
| express-rate-limit                  |                      8.6.2 | Hosted-auth abuse limits                             | MIT                                 | Bundled hosted-auth runtime                         |
| dotenv                              |                     17.4.2 | Hosted-auth local configuration                      | BSD-2-Clause                        | Bundled hosted-auth runtime                         |
| jsonwebtoken                        |                      9.0.3 | Bound short-lived hosted result JWTs                 | MIT                                 | Bundled hosted-auth runtime                         |
| Jest / Supertest                    |             30.4.2 / 7.2.2 | Hosted-auth contract tests                           | MIT                                 | Development and CI                                  |

GitHub Actions are pinned by full commit SHA in `.github/workflows/ci.yml`. Checkout, Node setup,
pnpm setup, dependency review, Gitleaks, Docker Buildx/build-push, and Trivy retain their upstream
MIT or Apache-2.0 licences and notices. CI receives no production secrets.

## Required inventory fields

Before a dependency is used in a release, record:

| Component                       | Source/version                                                               | Purpose                                           | Licence        | Distributed?         | Required notice/source action                                                        | Reviewer                  |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- | -------------- | -------------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| Verus Mobile                    | Pending exact Google Play/App Store versions                                 | Hosted VRSCTEST LoginConsent compatibility        | Pending review | No                   | Record observed store versions and notices in issue #19                              | Pending device evidence   |
| Verus daemon/client integration | Verus CLI `v1.2.17-3`; RPC client `fd2c6b0d35d468ee6174bcdd569f5aa990b05282` | Private VRSCTEST readback                         | MIT            | No                   | Pin daemon and client in deployed health metadata                                    | Deployment review pending |
| `verus-typescript-primitives`   | `30c951804228a285546a45457be57ead39d90888`                                   | Hosted-service LoginConsent primitives            | MIT            | Yes, in hosted image | Preserve upstream licence and commit metadata                                        | Deployment review pending |
| `verusid-ts-client`             | `48a1d48a5d076f313022a5891986339851ad7c0c`                                   | Hosted-service LoginConsent signing/verification  | MIT            | Yes, in hosted image | Preserve licence and commit metadata; legacy LoginConsent compatibility is temporary | Deployment review pending |
| VerusCoin BitGoJS fork          | `7c754d4a5920198d9fe6827d3e23bd5cf431f264`                                   | Verus signature primitives used by hosted service | Apache-2.0     | Yes, in hosted image | Preserve upstream notices and exact commit metadata                                  | Deployment review pending |
| VerusCoin `blake2b`             | `578dc12b7b68a3ce76d1e1add1402b28a5890a6b`                                   | Transitive Verus hashing dependency               | MIT            | Yes, in hosted image | Preserve upstream licence and exact commit metadata                                  | Deployment review pending |
| `bitcoin-ops`                   | Vendored `1.4.1`                                                             | BitGoJS opcode dependency                         | MIT            | Yes, in hosted image | Preserve vendored licence/package metadata                                           | Deployment review pending |

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
