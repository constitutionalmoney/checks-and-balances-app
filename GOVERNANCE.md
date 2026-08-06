# Governance

## 1. Project steward

**Checks and Balances Committee Ltd.** is the steward of the official Checks & Balances Protocol repository, roadmap, maintainer appointments, release process, hosted services, domains, security response, and recognition of official protocol deployments.

Open source does not mean that every fork, deployment, committee, credential, or release is official. Apache-2.0 rights and official project recognition are separate matters.

## 2. Governance principles

The official project will operate according to these principles:

1. **Protocol accuracy before promotion.** Planned work remains labelled planned.
2. **Privacy before data accumulation.** The protocol should prove the minimum necessary claim without creating an identity dossier.
3. **Human authority for human acts.** Software and agents may assist but may not impersonate attendance, approval, committee consent, or civic intent.
4. **Local accountability before scale.** A committee must have identifiable operators, policies, dispute handling, accessibility, and security before opening sessions.
5. **Testnet before mainnet.** VRSCTEST is mandatory until a documented production decision.
6. **Separation of systems.** Checks & Balances verifies participants; Rate My Representatives handles representative-accountability functions.
7. **Auditable change.** Protocol, schema, policy, and release versions must be reviewable and reproducible.

## 3. Decision classes

### A. Routine implementation decisions

Maintainers may approve implementation details that do not change protocol meaning, privacy boundaries, legal posture, user rights, or public claims.

Examples:

- refactoring;
- dependency maintenance;
- test coverage;
- user-interface improvements that preserve approved behaviour;
- performance and observability work; and
- documentation corrections.

### B. Architecture decisions

Architecture decisions require a written ADR or issue decision and maintainer approval.

Examples:

- database, queue, storage, or authentication architecture;
- public API contract changes;
- Verus RPC and wallet-integration design;
- deployment and trust-boundary changes; and
- changes affecting cross-committee tenancy.

### C. Protocol and policy decisions

These require an RFC, documented alternatives, privacy/security review, and approval by the project steward before implementation is treated as authoritative.

Examples:

- committee membership and quorum;
- the meaning of an attestation;
- acceptable evidence pathways;
- duplicate-prevention or uniqueness claims;
- locality or constituency claims;
- 45-day selection and renewal mechanics;
- signature thresholds;
- revocation, recovery, correction, and appeal;
- public status fields;
- retention and deletion; and
- mainnet activation.

Code must not settle a Class C decision by accident.

## 4. Roles

### Project steward

The corporation:

- appoints and removes maintainers;
- approves official releases and deployments;
- controls official domains and trademarks;
- approves protocol and policy decisions;
- coordinates legal, privacy, security, and pilot review; and
- may enter commercial, grant, service, or implementation agreements.

### Maintainers

Maintainers:

- triage issues and pull requests;
- enforce release gates;
- review architecture and code;
- protect repository and deployment security;
- keep public status accurate; and
- may reject technically sound work that conflicts with policy, privacy, or protocol boundaries.

### Contributors

Contributors may propose, discuss, document, test, and implement work under the repository licence and contribution policy. Contribution does not automatically confer maintainer status, committee membership, verification authority, employment, compensation, equity, fiduciary status, or voting rights.

### Local committees

A local committee is an operational protocol participant only after completing the approved formation and recognition process. Repository access or a software fork does not establish an official committee.

## 5. RFC process

A protocol or policy RFC must state:

- problem and scope;
- current public claim;
- proposed rule;
- alternatives and reasons rejected;
- privacy and data impact;
- security and abuse impact;
- accessibility and exclusion impact;
- Verus/on-chain impact;
- migration and rollback plan;
- testnet validation plan;
- legal-review status; and
- unresolved questions.

The steward may accept, reject, request revision, or keep an RFC experimental. Experimental work must remain disabled by default and labelled non-operational.

## 6. Release channels

- `development`: local and automated tests; no public assurance.
- `testnet`: VRSCTEST deployments and simulated or consented pilot rehearsals.
- `pilot`: expressly approved limited deployment with published safeguards.
- `production`: mainnet or production assurance only after every production gate passes.

A version number alone does not confer production status.

## 7. Official releases and forks

Official releases are tagged or otherwise designated by maintainers under corporate control. Forks may exercise Apache-2.0 rights but must use distinct branding and may not imply endorsement, certification, official committee status, or compatibility that has not been verified.

## 8. Security and emergency authority

Maintainers may temporarily disable wallet requests, Verus writes, status responses, committee access, API keys, or other functions where necessary to contain security, privacy, legal, or integrity risk. Emergency action must be documented after containment without publishing exploitable details prematurely.

## 9. Changes to governance

Material changes to this document require steward approval and a public repository change. Previously released Apache-2.0 rights are not revoked by a later governance change.
