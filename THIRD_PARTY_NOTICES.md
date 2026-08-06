# Third-Party Notices

This project will use third-party software and Verus ecosystem components. Each dependency remains governed by its own licence, notices, attribution, and distribution conditions.

## Current status

The application monorepo has not yet been scaffolded, so there is not yet a complete dependency inventory. This file is a required release-control document, not a claim that the future stack has already been approved.

## Required inventory fields

Before a dependency is used in a release, record:

| Component | Source/version | Purpose | Licence | Distributed? | Required notice/source action | Reviewer |
|---|---|---|---|---|---|---|
| Verus Mobile integration references | Exact upstream commit to be pinned | Wallet request and response compatibility | Confirm from upstream | No copied mobile binary by default | Preserve source references and notices for copied code | Pending |
| Verus daemon/client integration | Exact upstream release/commit to be pinned | VRSCTEST RPC and identity operations | Confirm from upstream and bundled dependencies | Deployment dependent | Review all transitive and build-time licences | Pending |
| `verus-typescript-primitives` | Exact version to be pinned | VDXF and wallet request structures | Confirm from package/repository | Yes if bundled | Preserve applicable notices | Pending |
| `verusid-ts-client` | Exact version to be pinned | VerusID request and verification helpers | Confirm from package/repository | Yes if bundled | Preserve applicable notices | Pending |

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
