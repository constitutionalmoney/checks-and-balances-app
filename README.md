# Checks & Balances Protocol — Verus App

> Local-first, community-attested proof of human with participant-controlled VerusID integration.

This repository is the implementation home for the **Checks & Balances Protocol** application described at [checksandbalances.services](https://checksandbalances.services/). It will contain the participant application, committee operations console, public discovery and status services, Verus integration worker, protocol schemas, and deployment tooling.

## Current status

**Pilot preparation and specification — not operational.**

- Development targets **VRSCTEST before any mainnet use**.
- The public committee directory is not live.
- No public verification sessions are open.
- Production credentials, APIs, SDKs, schemas, test credentials, and Rate My Representatives integration are not live.
- Every attestation is intended to expire after **45 days**.
- Random peer renewal, duplicate prevention, locality rules, signature thresholds, appeals, recovery, evidence retention, and legal documents remain subject to specification and review.
- No planned feature may be described as operational until its release gate has passed.

The website, repository documentation, deployed application, and public API status must tell the same story. Where historical or archived material conflicts with the current protocol documentation, the current protocol documentation controls.

## Protocol goal

A local committee verifies that a real person:

1. appeared in person;
2. completed the approved local process;
3. matched the credential photo or another approved evidence pathway; and
4. holds a current, expiring attestation that connected applications can check without receiving the underlying private evidence.

### What the baseline attestation does not prove

A baseline human attestation does **not** automatically prove:

- legal residence;
- citizenship;
- voting eligibility;
- constituency eligibility;
- uniqueness unless the adopted duplicate-prevention method supports that claim;
- the truth of a participant statement;
- political agreement; or
- community consensus.

Any additional claim must have its own method, evidence rules, label, policy version, expiry rules, appeal path, and review.

## Product boundaries

### Checks & Balances Protocol owns

- committee formation and authority rules;
- in-person human-verification procedures;
- participant consent and privacy controls;
- 45-day expiry and renewal rules;
- issuance, expiry, revocation, supersession, recovery, and appeal;
- committee VerusID and signing infrastructure;
- privacy-minimized status and discovery interfaces; and
- public aggregate cycle reporting.

### Checks & Balances Protocol does not own

- representative ratings or political opinions;
- public evidence review about representatives;
- Rate My Representatives moderation decisions;
- legal residence, citizenship, or voter-eligibility determinations unless separately defined and reviewed; or
- composite civic, trust, reputation, or accountability scores.

[Rate My Representatives](https://ratemyrepresentatives.com/) is a connected but separate project. It may eventually consume a minimum status such as `active`, `expired`, `revoked`, or `unknown`; it must not receive raw identity documents, address dossiers, utility bills, committee notes, or private evidence packages.

## Planned application surfaces

| Surface                 | Purpose                                                                           | Recommended host                               |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Public website          | Explain the protocol, current status, safeguards, and roadmap                     | `checksandbalances.services`                   |
| Participant PWA         | Account, optional VerusID link, session request, status, renewal, appeal, consent | `app.checksandbalances.services`               |
| Committee console       | Formation, rosters, sessions, decisions, cycles, appeals, audit                   | `committee.checksandbalances.services`         |
| Public verifier         | Human-readable status and proof checking without participant enumeration          | `verify.checksandbalances.services`            |
| Versioned API           | Participant, committee, discovery, status, and relying-party APIs                 | `api.checksandbalances.services`               |
| Developer documentation | OpenAPI, schemas, SDKs, integration guides, protocol status                       | `docs.checksandbalances.services`              |
| Service health          | Public uptime and incident status                                                 | `status.checksandbalances.services`            |
| Committee discovery     | Approved public committee directory, pages, and `auth.md`                         | `committees.checksandbalances.services/{slug}` |

An optional later deployment may use `{slug}.committees.checksandbalances.services` after wildcard-host tenancy, certificates, and governance are designed. See [docs/SUBDOMAINS.md](./docs/SUBDOMAINS.md) for the deployment and DNS plan.

## Human-verification lifecycle

```text
requested -> scheduled -> checked_in -> under_review
under_review -> approved | rejected | needs_more_information | withdrawn
approved -> issuance_pending -> issued -> active
active -> expired | revoked | superseded
rejected -> appealed -> appeal_upheld | appeal_denied | appeal_remanded
```

No route may skip directly from `requested` to `active`.

1. **Pre-register:** collect only account, contact, broad jurisdiction/session, accessibility needs, consent versions, and an optional VerusID link.
2. **Schedule:** bind the session to approved evidence, privacy, accessibility, and appeal policy versions.
3. **Review in person:** inspect approved evidence without uploading identity documents through the public application.
4. **Decide:** record the decision, authorized reviewers, conflicts, policy versions, and allowed evidence-path metadata.
5. **Issue:** create a minimum attestation envelope and canonical private status record.
6. **Expire:** enforce expiry at 45 days in the status service—not merely in the interface.
7. **Renew:** create a new attestation version through the adopted recurring process; do not silently extend the old record.
8. **Correct, revoke, recover, or appeal:** preserve the complete decision history and public validity windows.

## Verus and Verus Mobile integration

The browser and public applications must never connect directly to authenticated `verusd` RPC.

```text
participant/committee app -> API -> transactional outbox -> Verus worker -> private verusd RPC
```

Planned wallet flows:

- signed `GenericRequest` / `GenericResponse` for optional VerusID authentication and account linking;
- same-device Verus Mobile deep link where supported;
- desktop QR fallback;
- public HTTPS callback with nonce, expiry, audience, network, signer, identity-state, and signature validation;
- committee-member wallet approval only after compatibility and threshold testing; and
- optional `IdentityUpdateRequest` for an explicit, participant-approved public proof reference only after privacy review and mobile compatibility testing.

The baseline service will use a private canonical database plus privacy-safe committee anchors. A participant must not be required to publish a per-person identity record on-chain.

**Never request or accept private keys, WIFs, seed phrases, wallet files, z-seeds, or spending keys. Never place raw evidence, photos, addresses, document numbers, utility bills, or committee notes on-chain.**

See [docs/VERUS_MOBILE_INTEGRATION.md](./docs/VERUS_MOBILE_INTEGRATION.md).

## Repository structure

```text
apps/
  participant/       Participant PWA
  committee/         Committee operations console
  verify/            Public status and proof verifier
  api/               Versioned HTTP API
  worker/            Verus, notifications, expiry, cycle, and outbox jobs
  docs/              Developer documentation site
packages/
  domain/             Reserved domain boundary; no business logic in WP-01
  db/                 Model-free Prisma foundation and readiness checks
  auth/               Distinct session-audience boundary only
  verus/              Readiness-only fake/private RPC boundary; no writes
  contracts/          Health/status OpenAPI and shared release status
  ui/                 Shared accessible shell and status banner
  config/             Typed fail-closed environment configuration
  observability/      Structured redacted logging
  testkit/            Synthetic-only fixture boundary
schemas/
  cbc-human-attestation.schema.json
  cbc-public-status.schema.json
  auth.md
docs/
  PRD.md
  IMPLEMENTATION_PLAN.md
  ARCHITECTURE.md
  VERUS_MOBILE_INTEGRATION.md
  SUBDOMAINS.md
  PROTOCOL_STATUS.md
  PRIVACY_AND_DATA.md
  THREAT_MODEL.md
  SOURCE_ALIGNMENT.md
  ISSUE_ROADMAP.md
infra/
  docker/
  deployment/
  monitoring/
```

The WP-01 application foundation and issue #16 domain/persistence core are scaffolded. Every app is an empty shell labelled
**Specification / VRSCTEST / Not operational**. The API exposes only health, readiness, generated
OpenAPI, and protocol-status routes; the worker registers no protocol jobs. Public controllers,
accounts, participant collection, committee operations UI, document uploads, wallet flows, Verus
writes, and mainnet support remain absent. Internal packages now provide named lifecycles, exact
expiry, tenant-safe records, append-only audit, idempotency, and a crash-safe outbox for later
vertical slices; this does not make a public workflow operational.

## Development

The workspace pins Node.js `24.19.0` and pnpm `11.20.0`. See
[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for the clean-clone workflow, every root quality
command, environment profiles, local URLs, and Docker Compose instructions.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm local:up
```

The local stack uses synthetic-only PostgreSQL/Redis dependencies, Mailpit, and a fake private
Verus `getinfo` endpoint. It creates no object-storage bucket and requires no wallet, private key,
live RPC credential, production secret, or participant record.

A fail-closed [Dokploy Compose scaffold](./infra/deployment/README.md) is also available for a
future GitHub-backed VRSCTEST deployment. It is not a production or pilot release configuration.

## Source-of-truth documents

- [Product Requirements Document](./docs/PRD.md)
- [End-to-end implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [System architecture](./docs/ARCHITECTURE.md)
- [Verus Mobile integration](./docs/VERUS_MOBILE_INTEGRATION.md)
- [Subdomain and deployment plan](./docs/SUBDOMAINS.md)
- [Protocol status matrix](./docs/PROTOCOL_STATUS.md)
- [Privacy and data requirements](./docs/PRIVACY_AND_DATA.md)
- [Threat model](./docs/THREAT_MODEL.md)
- [Website and development-guide alignment](./docs/SOURCE_ALIGNMENT.md)
- [Issue-by-issue development roadmap](./docs/ISSUE_ROADMAP.md)
- [Codex execution instructions](./CODEX.md)

## Website alignment

The application must remain aligned with the current public pages:

- [Home](https://checksandbalances.services/)
- [How We Check Power](https://checksandbalances.services/how-we-check-power/)
- [How verification works](https://checksandbalances.services/how-verification-works/)
- [Start a committee](https://checksandbalances.services/start-a-committee/)
- [Find a committee](https://checksandbalances.services/find-a-committee/)
- [What verification enables](https://checksandbalances.services/verified-humans/)
- [Applications and developers](https://checksandbalances.services/developers/)
- [Protocol foundations](https://checksandbalances.services/protocol-foundations/)
- [Civic roadmap](https://checksandbalances.services/civic-roadmap/)
- [Privacy and data](https://checksandbalances.services/privacy-and-data/)
- [Historical archive](https://checksandbalances.services/archive/)

The page-by-page requirement mapping is in [docs/SOURCE_ALIGNMENT.md](./docs/SOURCE_ALIGNMENT.md).

## Build phases

0. Repository, licensing, environments, and CI foundation.
1. Protocol, governance, privacy, threat model, schemas, and policy versions.
2. VRSCTEST identities, wallet authentication, RPC adapter, fixtures, and readback.
3. Participant PWA and committee operations prototype.
4. Reproducible 45-day cycle selection, notifications, and aggregate reporting.
5. Privacy-minimized status API, developer interfaces, and disabled-by-default RMR adapter.
6. Legal, privacy, security, accessibility, backup, incident, and pilot-readiness gates.
7. Separate mainnet necessity decision, with mainnet remaining blocked by default.

No public pilot or mainnet write is permitted merely because code exists.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md), [GOVERNANCE.md](./GOVERNANCE.md), [SECURITY.md](./SECURITY.md), and the [Developer Certificate of Origin](./DCO.txt) before contributing.

- Continue implementation with [issue #16](https://github.com/constitutionalmoney/checks-and-balances-app/issues/16), then follow [docs/ISSUE_ROADMAP.md](./docs/ISSUE_ROADMAP.md).
- Open or select an issue before substantial implementation.
- Keep pull requests narrow and tied to an acceptance checklist.
- Sign every commit with `Signed-off-by: Name <email>`.
- Do not submit private evidence, personal information, credentials, private keys, or security vulnerabilities in public issues or pull requests.
- Contributors remain responsible for the provenance, licensing, security, and correctness of AI-assisted work.

## License, stewardship, and trademarks

Repository content identified as such is licensed under the [Apache License 2.0](./LICENSE), except for third-party material expressly identified under another licence.

**Checks and Balances Committee Ltd.** is the steward of the official repository, roadmap, maintainer appointments, releases, and recognition of official protocol deployments.

Checks and Balances Committee Ltd. owns copyright only in material it authored or validly acquired. Individual contributors retain copyright in their contributions unless they separately assign it in a signed written agreement. Accepted contributions are distributed under Apache-2.0 and require DCO 1.1 sign-off.

Apache-2.0 permits use, modification, redistribution, forking, and commercial implementation subject to its terms. It does not grant rights to project names, logos, domains, official badges, credential designs, committee recognition, hosted services, production infrastructure, signing keys, production databases, personal information, or third-party material. See [TRADEMARKS.md](./TRADEMARKS.md).

A fork may truthfully identify its origin but must not imply sponsorship, certification, affiliation, endorsement, official committee status, or operation by Checks and Balances Committee Ltd.

Checks and Balances Committee Ltd. may operate official hosted services, seek grants or investment, enter commercial contracts, and provide paid implementation or support. Those activities do not revoke Apache-2.0 rights already granted for released repository content.

Submitting a contribution does not create employment, compensation, equity, committee membership, verification authority, fiduciary status, or governance rights unless separately granted in a signed written agreement.

This is an independent project designed to integrate with Verus technologies. It must not be represented as an official Verus project or as endorsed by Verus developers or the Verus community without express authorization.
