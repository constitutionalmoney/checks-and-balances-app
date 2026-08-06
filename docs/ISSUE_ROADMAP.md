---
title: Checks & Balances Protocol Issue Roadmap
version: 1.0
status: Active planning index
last_updated: 2026-08-05
---

# Issue Roadmap

This document maps the current GitHub issues to the PRD and implementation phases. The live checklist is [issue #14](https://github.com/constitutionalmoney/checks-and-balances-app/issues/14).

An issue number records work to be done; it does not mean the capability is operational. The repository remains in specification and pilot preparation.

## Build posture

- VRSCTEST before any mainnet decision.
- No public verification sessions or directory are live.
- Every attestation expires after at most 45 days.
- VerusID linking is optional for the baseline pilot.
- No identity-document, selfie, live-photo, or raw-evidence upload module.
- No public authenticated `verusd` RPC.
- No arbitrary participant lookup or numeric trust/social-credit score.
- Unfinished protocol decisions remain disabled and labelled unfinished.

## Phase 0 — Current public truth and engineering foundation

| Issue | Work | Primary output | Unblocks |
|---|---|---|---|
| [#8](https://github.com/constitutionalmoney/checks-and-balances-app/issues/8) | Website/release-status synchronization | Eleven current pages, archive guard, canonical capability status | Honest public launch copy |
| [#15](https://github.com/constitutionalmoney/checks-and-balances-app/issues/15) | Monorepo, local stack, CI | Buildable empty TypeScript workspace | All code work |
| [#16](https://github.com/constitutionalmoney/checks-and-balances-app/issues/16) | Domain, PostgreSQL, audit, idempotency, outbox | Lifecycle and transactional spine | Apps, workers, APIs |
| [#17](https://github.com/constitutionalmoney/checks-and-balances-app/issues/17) | Authentication, roles, recovery, consent | Separate participant/committee trust domains | User and committee features |

**First Codex implementation issue:** #15.

## Phase 1 — Protocol, policy, and schema gates

| Issue | Decision/work | Must remain disabled until complete |
|---|---|---|
| [#2](https://github.com/constitutionalmoney/checks-and-balances-app/issues/2) | VDXF namespace and minimum schemas | Chain/schema publication |
| [#3](https://github.com/constitutionalmoney/checks-and-balances-app/issues/3) | Committee formation, recognition, roles, safeguards | Official committee publication |
| [#4](https://github.com/constitutionalmoney/checks-and-balances-app/issues/4) | Forty-five-day renewal and deterministic selection | Random renewal |
| [#5](https://github.com/constitutionalmoney/checks-and-balances-app/issues/5) | Root/committee `auth.md` | Operational discovery claims |
| [#12](https://github.com/constitutionalmoney/checks-and-balances-app/issues/12) | Legal/privacy/consent/retention/appeal/relying-party documents | Real participant collection |
| [#29](https://github.com/constitutionalmoney/checks-and-balances-app/issues/29) | Duplicate prevention and uniqueness assurance | Any uniqueness claim |
| [#30](https://github.com/constitutionalmoney/checks-and-balances-app/issues/30) | Locality and constituency claims | Any legal-residence/constituency implication |
| [#31](https://github.com/constitutionalmoney/checks-and-balances-app/issues/31) | Reviewer quorum, signing, capture, recovery | Committee signing and production issuance |

Issues #29–#31 may validly conclude that a proposed claim or mechanism should not be implemented. “No” is a protocol decision; silence is not.

## Phase 2 — Verus and wallet spine

| Issue | Work | Key rule |
|---|---|---|
| [#18](https://github.com/constitutionalmoney/checks-and-balances-app/issues/18) | Private typed VRSCTEST RPC worker | Browser never reaches authenticated RPC |
| [#19](https://github.com/constitutionalmoney/checks-and-balances-app/issues/19) | Optional VerusID account linking | Identity control is not human attestation |
| [#9](https://github.com/constitutionalmoney/checks-and-balances-app/issues/9) | Committee VRSCTEST identity | Threshold comes from approved #31 policy |
| [#2](https://github.com/constitutionalmoney/checks-and-balances-app/issues/2) | VDXF fixtures/write/readback | Owned namespace, minimum content |

## Phase 3 — Participant and committee vertical slice

| Issue | Work | Completion evidence |
|---|---|---|
| [#20](https://github.com/constitutionalmoney/checks-and-balances-app/issues/20) | Participant PWA | Synthetic own-account/request/status/appeal E2E |
| [#21](https://github.com/constitutionalmoney/checks-and-balances-app/issues/21) | Committee console | Role/tenant-controlled formation/session operations |
| [#10](https://github.com/constitutionalmoney/checks-and-balances-app/issues/10) | In-person session workflow | No document/photo capture; minimum metadata |
| [#22](https://github.com/constitutionalmoney/checks-and-balances-app/issues/22) | Attestation lifecycle | Exact expiry, revocation, recovery, appeal |

## Phase 4 — Renewal and operations

| Issue | Work | Completion evidence |
|---|---|---|
| [#13](https://github.com/constitutionalmoney/checks-and-balances-app/issues/13) | Cycle scheduler, selection proof, notices, reports | Independent reproducibility and private selected list |
| [#25](https://github.com/constitutionalmoney/checks-and-balances-app/issues/25) | Notifications, policy admin, retention, privacy requests | Rights/retention/incident and report drills |
| [#4](https://github.com/constitutionalmoney/checks-and-balances-app/issues/4) | Approved cycle policy | Code uses versioned policy, not private operator choice |

## Phase 5 — Public discovery and relying parties

| Issue | Work | Privacy boundary |
|---|---|---|
| [#23](https://github.com/constitutionalmoney/checks-and-balances-app/issues/23) | Governed committee directory | No participant/private member/signer list |
| [#6](https://github.com/constitutionalmoney/checks-and-balances-app/issues/6) | Verifier and status API | No arbitrary identity search |
| [#7](https://github.com/constitutionalmoney/checks-and-balances-app/issues/7) | RMR/relying-party adapter | Minimum typed status; no evidence or trust score |
| [#24](https://github.com/constitutionalmoney/checks-and-balances-app/issues/24) | Optional participant public VerusID proof | Explicit wallet-approved public diff; baseline works without it |
| [#5](https://github.com/constitutionalmoney/checks-and-balances-app/issues/5) | Discovery deployment | `auth.md` is descriptive, not self-certifying |

## Phase 6 — Deployment, assurance, rehearsal, and pilot

| Issue | Work | Release effect |
|---|---|---|
| [#26](https://github.com/constitutionalmoney/checks-and-balances-app/issues/26) | Testnet hosts, CI/CD, monitoring, backup, incident controls | Deployable VRSCTEST environment only |
| [#27](https://github.com/constitutionalmoney/checks-and-balances-app/issues/27) | Security/privacy/legal/accessibility assurance | Blocks unresolved critical/high exposure |
| [#28](https://github.com/constitutionalmoney/checks-and-balances-app/issues/28) | Full synthetic/VRSCTEST rehearsal | Reproducible evidence packet; no real people |
| [#11](https://github.com/constitutionalmoney/checks-and-balances-app/issues/11) | Kelowna limited pilot | Requires express corporate/steward approval |

## Phase 7 — Mainnet decision

| Issue | Work | Default |
|---|---|---|
| [#32](https://github.com/constitutionalmoney/checks-and-balances-app/issues/32) | Mainnet necessity/privacy/custody/recovery memorandum | Mainnet remains blocked |

# Dependency graph

```text
#15 -> #16 -> #17

#2  #3  #4  #12  #29  #30  #31  (policy gates in parallel where possible)
 |   |   |    |    |    |    |
 +---+---+----+----+----+----+--> enabled domain behaviour

#16 + #2 -> #18
#17 + #18 -> #19
#3 + #17 + #18 + #31 -> #9

#16 + #17 + approved policies -> #20 + #21
#20 + #21 + #3 + #10 + #31 -> #22
#4 + #22 + #18 + #25 -> #13

#3 + #5 + #21 -> #23
#22 + #2 + #12 -> #6
#6 + #12 -> #7
#19 + #22 + #2 + #18 + #12 -> optional #24

all selected scope -> #26 -> #27 -> #28 -> #11 -> #32
```

# Codex execution sequence

Use one issue or narrow sub-issue per Codex session:

```text
1.  #15 — repository scaffold
2.  #16 — domain/database/audit/outbox
3.  #17 — authentication/authorization/consent
4.  approved and implementation-ready slices of #2/#3/#4/#12/#29/#30/#31
5.  #18 — fake then real VRSCTEST adapter/worker
6.  #19 — Verus Mobile account-linking ceremony
7.  #20 — participant vertical slice
8.  #21 — committee vertical slice
9.  #10 — complete in-person session workflow
10. #22 — attestation lifecycle
11. #13 and #25 — renewal and operations
12. #23 and #5 — directory/discovery
13. #6 — verifier/status API
14. #7 — RMR adapter
15. optional #24 — participant public proof
16. #26 — testnet deployment
17. #27 — assurance
18. #28 — rehearsal
19. #11 — pilot decision and operation
20. #32 — mainnet decision
```

Read `CODEX.md` before every session. Do not ask one session to implement this full sequence.

# Cross-cutting acceptance rules

Every implementation issue must address, where applicable:

- linked PRD requirement and approved policy version;
- positive and negative authorization tests;
- state-machine and idempotency tests;
- privacy field classification, retention, and disclosure;
- security/abuse/threat controls;
- accessibility and non-QR fallback;
- migration and rollback/forward-fix;
- feature flag and public-status impact;
- VRSCTEST network assertion, confirmation, readback, and reorg;
- documentation/OpenAPI/schema update;
- DCO sign-off; and
- exact commands and results.

A route or transaction is not “done” when the happy path works. It is done when its acceptance criteria, failure modes, privacy boundary, recovery path, and public status are verified.

# Closed and historical issues

- [#1](https://github.com/constitutionalmoney/checks-and-balances-app/issues/1) was only a connector-permission test and is not development work.
- Historical language that proposed raw photo-ID/live-photo capture, unexplained `2-of-3`, shareholder/silver-coin committee qualifications, the `vrsc::` namespace without authority, or numeric trust weighting has been superseded by the current issue bodies and protocol-status matrix.
