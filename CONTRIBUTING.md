# Contributing to the Checks & Balances Protocol

Thank you for helping build the Checks & Balances Protocol. This project is in **pilot preparation and specification**, not production operation.

## Before contributing

Read, in order:

1. [README.md](./README.md)
2. [docs/PROTOCOL_STATUS.md](./docs/PROTOCOL_STATUS.md)
3. [docs/PRD.md](./docs/PRD.md)
4. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
5. [docs/PRIVACY_AND_DATA.md](./docs/PRIVACY_AND_DATA.md)
6. [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md)
7. [GOVERNANCE.md](./GOVERNANCE.md)
8. [SECURITY.md](./SECURITY.md)

Some of those documents may initially be specification stubs. An unfinished decision must remain labelled unfinished; code must not silently turn a proposal into protocol law.

## Issue-first workflow

Open or select a GitHub issue before substantial work.

- State the problem and intended user impact.
- Identify the relevant PRD requirement and issue dependencies.
- Resolve protocol questions before implementing assumptions.
- Keep one pull request focused on one coherent issue or work package.
- Link the pull request to the issue and include the acceptance checklist.

Maintainers may close or defer work that bypasses a release gate, creates privacy risk, duplicates another effort, or conflicts with the current protocol status.

## Development rules

- Development targets **VRSCTEST** until an explicit mainnet release gate is approved.
- Do not connect public browser code directly to authenticated `verusd` RPC.
- Do not request, accept, log, transmit, or store private keys, seed phrases, WIFs, z-seeds, wallet files, or spending keys.
- Do not place identity documents, face images, document numbers, exact addresses, utility bills, committee notes, or private evidence on-chain.
- Do not add document or photo uploads unless an approved legal, privacy, security, retention, deletion, and access-control design expressly requires them.
- Do not describe planned APIs, credentials, committees, sessions, schemas, or integrations as live.
- Keep human proof, locality claims, uniqueness claims, constituency status, and political participation as separately defined claims.
- AI and agents may assist development and public navigation; they may not impersonate a participant, appear in person, approve a person, sign as a committee member, or manufacture civic intent.

## Licence and DCO

Repository content identified as such is licensed under [Apache-2.0](./LICENSE). By intentionally submitting a contribution for inclusion, you agree that the accepted contribution is distributed under Apache-2.0 unless a separate signed agreement says otherwise.

Every commit must include a Developer Certificate of Origin 1.1 sign-off:

```text
Signed-off-by: Name <email@example.com>
```

Use:

```bash
git commit -s -m "Describe the change"
```

The sign-off certifies that you have the right to submit the contribution. It is not a copyright assignment. Contributors retain copyright in their contributions unless they separately sign an assignment.

## Third-party and copied code

A contribution must identify:

- copied or adapted source code;
- upstream repository and exact version or commit;
- applicable licence;
- required notices or source-offer obligations; and
- any incompatibility with Apache-2.0 or deployment dependencies.

Do not paste code from a source whose licence or provenance is unknown. Generated dependency lockfiles do not replace licence review.

## AI-assisted contributions

AI use does not transfer responsibility to the model or tool. The contributor must verify:

- provenance and licence compatibility;
- factual and protocol accuracy;
- tests and failure modes;
- security and privacy properties;
- accessibility; and
- absence of fabricated APIs, packages, RPC methods, or wallet capabilities.

State material AI assistance in the pull-request description when it affected architecture, protocol language, security-sensitive code, cryptographic handling, or legal/privacy documentation.

## Pull-request checklist

A pull request should include:

- linked issue and PRD requirement;
- description of what changed and why;
- screenshots or recordings for user-interface changes;
- data migration and rollback notes where applicable;
- threat/privacy analysis for sensitive changes;
- test evidence;
- documentation updates;
- no-mainnet confirmation for Verus work; and
- DCO sign-off on every commit.

Before requesting review, run the repository checks that apply:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The exact commands become authoritative after the monorepo is scaffolded.

## Security reports

Do not disclose vulnerabilities, live participant information, private evidence, credentials, or exploitable abuse methods in a public issue. Follow [SECURITY.md](./SECURITY.md).

## Review and merge

Checks and Balances Committee Ltd. appoints maintainers and controls the official merge and release process. Acceptance of a contribution does not create employment, compensation, equity, committee membership, verification authority, fiduciary status, or governance rights.
