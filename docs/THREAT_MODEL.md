---
title: Checks & Balances Protocol Threat Model
version: 1.0
status: Proposed; security review required
last_updated: 2026-08-05
target_environment: VRSCTEST pilot preparation
---

# Threat Model

## 1. Scope

This threat model covers:

- public website and protocol-status content;
- participant PWA;
- committee console;
- public verifier and committee directory;
- API, database, queue, workers, notifications, audit, and backups;
- optional VerusID authentication and identity-update requests through Verus Mobile;
- private `verusd` RPC and on-chain anchors;
- forty-five-day renewal selection;
- relying-party status checks, including Rate My Representatives; and
- human/organizational attacks against committees and participants.

It does not replace a penetration test, privacy impact assessment, legal review, physical safety plan, vendor assessment, or incident-response exercise.

## 2. Security objectives

### Integrity

- A person cannot become `active` without the approved lifecycle and threshold.
- A committee decision cannot be forged, silently modified, or attributed to a conflicted/unauthorized actor.
- Expiry, revocation, supersession, and appeal outcomes are applied correctly.
- Random renewal selection is reproducible and not privately manipulated.
- A Verus write is not considered complete until confirmed and read back.
- Public status accurately reflects canonical approved state and does not confuse unknown/unavailable with active or invalid.

### Confidentiality

- Identity evidence, exact address, attendance, private appeal facts, account/contact data, wallet payloads, and operational secrets are disclosed only to approved roles for approved purposes.
- No raw evidence or private dossier is placed on-chain.
- Relying parties receive minimum status, not source evidence.

### Availability

- Participants can access status, expiry, renewal, correction, and appeal within published service expectations.
- A denial-of-service event does not silently extend or revoke status.
- The project can suspend compromised functions and communicate incidents.

### Authenticity and non-repudiation

- Wallet requests are bound to an approved application identity, audience, network, nonce, and expiry.
- Human reviewer actions are attributable to authenticated, authorized actors and policy versions.
- Public anchors and reports can be matched to canonical bytes and issuer identity.

### Safety and due process

- The system does not make unsupported claims.
- A malicious or captured committee cannot quietly deny, target, or expose participants without audit and appeal controls.
- Accessibility and exception paths do not become arbitrary loopholes or exclusion tools.

## 3. Assets

### Critical

- canonical attestation and revocation state;
- committee authority, signer inventory, and recovery/revocation control;
- application and committee Verus identities and signing access;
- participant account and optional VerusID-link integrity;
- policy/schema versions;
- audit history;
- random-selection snapshot and secret salt before reveal;
- RPC credentials and deployment secrets;
- backup integrity; and
- release/feature-status registry.

### Sensitive personal

- contact and authentication metadata;
- session request, attendance, precise location, and accessibility needs;
- evidence-path metadata;
- reviewer decisions and private reason categories;
- appeals and correction requests; and
- relying-party check history.

### Public but integrity-sensitive

- protocol status;
- approved committee directory;
- public policy/schema documents;
- public aggregate cycle reports;
- developer documentation and SDKs;
- status-service information; and
- Verus provenance anchors.

## 4. Actors

### Legitimate

- participant;
- committee organizer, scheduler, reviewer, signer, and administrator;
- privacy/security/support officer;
- protocol steward/maintainer;
- relying-party client;
- Verus Mobile user and Verus node operator;
- system worker and deployment operator.

### Adversarial or compromised

- bot or account farm;
- duplicate participant;
- malicious participant;
- abusive committee member;
- colluding subset of a committee;
- captured entire committee;
- malicious or compromised relying party;
- external attacker;
- malicious insider or support operator;
- compromised developer dependency/build pipeline;
- compromised email/SMS/hosting/observability vendor;
- stolen participant or committee device;
- compromised Verus application/committee identity;
- social engineer or physical-session disruptor;
- scraping/data-broker actor;
- political actor seeking participant lists or manipulation;
- malicious fork impersonating the official protocol.

## 5. Trust assumptions requiring validation

- The pinned Verus Mobile version correctly validates and presents supported request types.
- Application request-signing identities and committee identities are securely controlled and recoverable.
- Committee members can apply the approved process and disclose conflicts.
- Public entropy used for renewal cannot be predicted before the eligible snapshot commitment in a way that enables manipulation.
- Database, queue, backup, and deployment providers enforce configured isolation.
- Passkey/email account recovery is not weaker than the protected action requires.
- Relying parties comply with terms and do not retain/use data beyond approved purpose.

An assumption is not a control. Each requires a test, monitoring, contract, or governance mechanism.

## 6. Threat register

### T01 — Fake or automated account creation

**Attack:** bots create participant accounts or flood session requests.

**Impact:** capacity denial, administrative burden, false appearance of adoption.

**Controls:** verified email/passkey, rate limits, abuse scoring with minimal data, appointment confirmation, queue limits, no attestation without in-person attendance, per-session controls, audit.

**Residual:** account existence is not proof of human; UI must not present it as such.

### T02 — Duplicate human attestations

**Attack:** one person uses multiple accounts/VerusIDs or attends multiple committees.

**Impact:** downstream one-person-one-action assumptions fail.

**Controls:** do not claim uniqueness by default; separate uniqueness assurance; design privacy-preserving duplicate-prevention RFC; cross-committee dispute process; anomaly investigation under policy.

**Residual:** baseline `humanPresence=true` may coexist with multiple credentials until a validated method exists.

### T03 — Reviewer impersonation or stolen committee session

**Attack:** attacker steals credentials/device or reuses a session.

**Controls:** passkey/strong authentication, short privileged sessions, re-authentication, device/session inventory, role/committee scope, optional VerusID proof, rapid revocation, audit, impossible-travel/risk review where proportionate.

**Issue #17 implementation evidence:** separate origins/RP IDs/audiences/keys/cookies, user-verifying
WebAuthn, opaque revocable sessions, single-use challenges, participant recovery session revocation,
and committee recovery suspension are covered by synthetic unit and PostgreSQL tests. UI/device and
pilot operational testing remain open.

### T04 — Committee collusion or capture

**Attack:** reviewers approve fake appearances, deny targeted participants, manipulate evidence results, or hide conflicts.

**Controls:** sufficiently broad formation, independent reviewer assignment, documented quorum, conflict declarations, auditable decisions, random review/quality sampling, appeals outside original decision group, public aggregate anomalies, steward suspension, signer rotation/revocation.

**Open risk:** final quorum and anti-capture model are unfinished; no pilot before approval.

### T05 — Two-of-three ambiguity/capture

**Attack:** a small static subset controls all decisions or chain actions because “two-of-three” is implemented without defining selection or scope.

**Controls:** do not hard-code legacy proposal; signing/quorum RFC; distinguish reviewers from operational transaction signers; rotate/randomize as approved; monitor concentration.

### T06 — Evidence overcollection or retention leak

**Attack:** interface or staff copies IDs/photos “for convenience”; data leaks through storage, logs, support, backups, or screenshots.

**Controls:** no upload/camera module, default `not_retained`, field allowlists, policy prompts, role restrictions, log redaction, DLP/static checks, training, incident response, retention automation.

### T07 — False locality or eligibility inference

**Attack:** downstream app treats human proof as residence, citizenship, voter eligibility, constituency status, or truth.

**Controls:** typed claims, explicit `legalResidenceClaim=false`, field semantics, relying-party contract, separate locality RFC, no unsupported response fields, compatibility tests.

### T08 — Wallet request substitution

**Attack:** malicious page/extension/QR replaces request or callback with attacker request.

**Controls:** signed application request, exact request digest, trusted-domain display, QR from signed bytes, HTTPS, CSP, wallet signer validation, callback correlation, participant preview.

### T09 — Wallet response replay

**Attack:** valid GenericResponse is reused to link another account or repeat an action.

**Controls:** high-entropy nonce, short expiry, account/audience binding, one-time atomic consumption, idempotent terminal result, replay audit, no reusable callback bearer token.

### T10 — Wrong-chain or wrong-identity response

**Attack:** response from VRSC/mainnet or another identity/system is accepted for VRSCTEST request.

**Controls:** server environment network allowlist, request network binding, signer/system validation, fresh identity lookup, immutable i-address comparison, mainnet code guard.

### T11 — Stale identity after revocation/recovery

**Attack:** local link remains trusted after VerusID recovery/revocation/authority change.

**Controls:** fresh lookup for privileged actions, stored observed state, periodic/risk-triggered revalidation, unlink/re-link path, incident suspension, identity-state fixtures.

### T12 — Malicious identity-update request

**Attack:** application asks participant to update unrelated identity fields, add tracking data, change authorities, or publish private data.

**Controls:** update-diff allowlist, owned namespace requirement, no authority/flag/currency changes, exact participant preview, schema validation, payload size, application signer allowlist, testnet, readback, independent security review.

### T13 — Incomplete mobile support

**Attack/failure:** implementation assumes unsupported encryption, multisig, deep-link, or request behaviour, causing unsafe fallback or stuck transactions.

**Controls:** pin exact versions, inspect official source, device compatibility matrix, feature flags, fake-wallet tests, no reliance on unsupported encrypted-response path, separate committee-signing spike, controlled fallback with honest custody model.

### T14 — Public status enumeration

**Attack:** attacker queries names, VerusIDs, sequential IDs, or leaked references to build a participant list.

**Controls:** no arbitrary identity lookup, high-entropy opaque references, participant-mediated tokens/credentials, uniform failure, client authentication/scopes, rate limits, anomaly detection, privacy budgets, no public search.

### T15 — Status correlation and tracking

**Attack:** stable public references let relying parties track a participant across contexts.

**Controls:** audience-bound or rotating presentations where feasible, minimum status, optional public chain reference disabled by default, relying-party purpose restrictions, no analytics sharing, privacy analysis of issuer/jurisdiction fields.

### T16 — Relying-party scope abuse

**Attack:** approved client stores, republishes, scores, or combines status beyond purpose.

**Controls:** contract, scoped credentials, audience-bound responses, field minimization, usage audit, rate limits, key rotation/revocation, participant disclosure, client suspension, technical prevention where possible.

### T17 — Composite social-credit score creep

**Attack:** legacy numeric trust weights or verification history become a generalized reputation score.

**Controls:** no numeric trust-weight endpoint, no public renewal-history score, typed binary/limited assurance result, governance review for every new claim, RMR boundary, public documentation.

### T18 — Renewal selection manipulation

**Attack:** committee selects inconvenient or targeted participants while claiming randomness, changes eligible set after seeing entropy, withholds salt, or shops for entropy.

**Controls:** canonical eligible snapshot, pre-entropy commitment, future public entropy, deterministic open algorithm, deadline and fallback rules, proof publication without identities, independent reproduction, audit and appeal.

### T19 — Renewal privacy leak

**Attack:** selected list or attendance reveals who is attested or targeted.

**Controls:** private notices, opaque subject refs, restricted list access, no participant names in public proof/report, small-cell suppression, minimum message previews, retention limits.

### T20 — No-show denial of service or discriminatory scheduling

**Attack:** malicious scheduling, inaccessible locations, short notice, or repeated selection causes expiry.

**Controls:** notice standards, accessibility policy, deferral/grace rules, appeal, selection-frequency limits, operational metrics, independent review, emergency cancellation path.

### T21 — Direct public RPC exposure

**Attack:** authenticated `verusd` RPC is exposed, allowing data leakage, wallet compromise, or transaction abuse.

**Controls:** no public RPC host, private network/localhost, firewall, distinct RPC credentials, worker-only access, command allowlist, no browser tunnel, monitoring.

### T22 — Accidental mainnet write

**Attack/failure:** configuration or network confusion publishes test/private material to VRSC.

**Controls:** environment-level network allowlist, mainnet disabled in code/release artifact, test identity validation, chain ID assertion before every write, separate secrets, no user-selectable network, approval workflow, alert and incident runbook.

### T23 — Duplicate Verus write after timeout

**Attack/failure:** RPC accepted transaction but response timed out; retry creates duplicate logical content or fees.

**Controls:** deterministic idempotency key, canonical manifest digest, durable attempt record, search/readback before retry, semantic duplicate detection, reconciliation job.

### T24 — Oversized or malicious contentmultimap

**Attack:** payload exceeds practical limits, hides data, causes fee/resource issues, or writes forbidden fields.

**Controls:** strict schema, canonical encoding, byte-size guard before RPC, field allowlist, array-form tests, human-readable diff, testnet fixtures, no arbitrary user-supplied VDXF content.

### T25 — Chain reorganization or insufficient confirmation

**Attack/failure:** anchor considered final then reorganized.

**Controls:** confirmation policy, block hash/height record, reorg monitoring, `reorg_pending` state, readback, no automatic mutation of private attestation decision, relying-party freshness semantics.

### T26 — Compromised application/committee Verus identity

**Attack:** attacker signs malicious requests or updates.

**Controls:** separate identities by purpose/environment, hardware/offline or tightly controlled signing path as appropriate, recovery/revocation authorities, threshold governance, key rotation, signer inventory, request-type allowlist, public incident/suspension status.

### T27 — API authorization/tenant bypass

**Attack:** committee user accesses another committee or support user changes decisions.

**Controls:** domain repository requires actor+committee context, deny-by-default guards, database constraints, separate roles, negative authorization tests, audit, re-authentication for sensitive actions.

### T28 — State-machine bypass

**Attack:** direct endpoint/script/job jumps `requested` to `active`, extends expiry, or issues without attendance.

**Controls:** framework-independent domain commands, no generic status setters, database constraints, event/outbox through domain transaction, tests for prohibited transitions, restricted migrations/scripts.

### T29 — Audit tampering

**Attack:** insider deletes or alters decision/security history.

**Controls:** append-only permissions, integrity chaining/digests, restricted audit admin, separate backup, periodic privacy-safe anchor, alert on gaps, no mutable update route.

### T30 — Notification disclosure/phishing

**Attack:** email/SMS preview reveals status/session; attacker sends fake wallet/session links.

**Controls:** minimum subject/body, signed official domains, no evidence/status detail, direct users to typed official host, SPF/DKIM/DMARC, template/version audit, no wallet seed request, anti-phishing copy.

### T31 — Dependency or CI supply-chain compromise

**Attack:** malicious package/action/build injects code or steals secrets.

**Controls:** lockfiles, pinned Actions SHAs, minimal CI permissions, dependency review, provenance/SBOM, licence scan, secret isolation, protected branches, signed/reviewed releases, reproducible containers, no production secrets in pull-request jobs.

### T32 — Secret leakage through GitHub, logs, or AI tooling

**Attack/failure:** developer posts `.env`, participant data, RPC credentials, screenshots, or prompts.

**Controls:** secret scanning, pre-commit rules, redaction, synthetic fixtures, contributor policy, no production data in AI tools, rotation runbook, private vulnerability channel.

### T33 — Backup loss or over-retention

**Attack/failure:** backups are unavailable, corrupted, exposed, or retain disposed data indefinitely.

**Controls:** encrypted backups, access separation, short documented windows, restoration drills, integrity checks, disposition reconciliation, no raw evidence default, incident monitoring.

### T34 — Physical-session safety/coercion

**Attack:** intimidation, surveillance, coercion, harassment, photography, or political screening at a meeting.

**Controls:** public safety/accessibility plan, code of conduct, no political-view requirement, privacy zones, staff roles, incident/ejection process, alternate/appeal path, minimum public location disclosure, participant notice.

### T35 — Malicious official-looking fork

**Attack:** fork uses brand/badges to collect identity documents or issue fake credentials.

**Controls:** trademark policy, official-directory allowlist, signed/anchored official release metadata, domain education, verifier displays issuer recognition, incident notices, takedown/legal response where appropriate.

### T36 — Website/repository status drift

**Attack/failure:** public site says feature is live while API/repo says planned, or old archive is treated as current policy.

**Controls:** central protocol release registry, automated status checks, current-page header/version, archive disclaimer, release checklist, content tests, steward approval.

### T37 — AI/agent impersonation

**Attack:** an agent submits attendance, consent, committee decision, wallet response, or civic signal as a person.

**Controls:** actor types, human-confirmation requirements, no agent approval role, in-person attendance, wallet/human signing boundaries, audit, terms, abuse detection.

### T38 — Denial of status/revocation service

**Attack:** verifier/status API unavailable, causing relying parties to treat unknown as invalid or active.

**Controls:** signed credential with explicit expiry, cached public policy/issuer data, clear `unavailable/unknown` semantics, redundant read path where justified, status page, rate-limit isolation, never fail open.

### T39 — Clock manipulation

**Attack/failure:** server clock error extends or prematurely expires attestations/challenges.

**Controls:** monitored time synchronization, canonical database/UTC time, injected fake clock tests, maximum-validity constraint, alert on drift, avoid client-clock authority.

### T40 — Small-cell aggregate disclosure

**Attack:** public cycle counts identify individuals in a small committee/session.

**Controls:** minimum thresholds, suppression/generalization, delayed/combined reporting, privacy review, no drill-down to private records.

## 7. Abuse cases for release tests

- Create account farm and request all session capacity.
- Reuse one wallet response for two accounts.
- Change QR payload after page display.
- Submit mainnet response to testnet challenge.
- Recover participant identity between challenge creation and callback.
- Reviewer accesses another committee’s session.
- Scheduler tries to approve an attestation.
- Conflicted reviewer is counted toward threshold.
- Direct API request skips check-in.
- Worker retries an ambiguously submitted transaction.
- Attestation expires while relying-party response is cached.
- Query random opaque references at scale.
- RMR asks for evidence or exact address.
- Committee edits eligible snapshot after entropy is known.
- Report publishes a cell count of one.
- User tries to insert arbitrary VDXF key/private data into identity update.
- Compromised signer creates request from unapproved application identity.
- Archive page is indexed as current protocol rule.
- AI agent attempts committee approval or participant attendance action.

## 8. Security architecture requirements

- threat-driven unit, integration, end-to-end, and device tests;
- protected default branch and required reviews/checks;
- least-privilege GitHub Actions and deployment credentials;
- dependency/SBOM/licence/secret scans;
- separate participant and committee session audiences;
- server-side state machine and field allowlists;
- secure secret manager;
- private database/Redis/RPC networks;
- WAF/rate limits/abuse controls;
- append-only audit and outbox;
- encrypted backups and restore test;
- security headers and CSRF/CORS controls;
- no sensitive logs/traces;
- incident suspension switches;
- VRSCTEST-only write guard;
- mobile compatibility pinning; and
- independent review before pilot.

## 9. Incident severity examples

| Severity | Examples |
|---|---|
| Critical | Private key/RPC compromise; arbitrary attestation issuance/revocation; raw evidence breach; unintended mainnet publication; widespread committee authorization bypass |
| High | Participant enumeration; wallet replay/link takeover; cross-committee data access; selection manipulation; compromised official issuer identity |
| Medium | Limited personal-data exposure; inaccurate expiry for a subset; notification leak; public status drift; audit gap without decision alteration |
| Low | Non-sensitive UI issue, harmless public metadata error, documentation defect without security consequence |

Severity depends on real scope and impact; this table is not a substitute for incident triage.

## 10. Pilot security gate

- [ ] All critical/high threats have tested preventive and detective controls or an expressly accepted residual risk.
- [ ] No raw evidence/document upload path exists.
- [ ] Wallet replay, substitution, wrong-network, stale-identity, and callback-forgery tests pass.
- [ ] Committee authorization, conflict, and state-machine negative tests pass.
- [ ] Status anti-enumeration and correlation tests pass.
- [ ] Renewal selection has an approved reproducible design.
- [ ] VRSCTEST write/readback, timeout, duplicate, oversize, and reorg tests pass.
- [ ] Mainnet writes are technically blocked.
- [ ] Secrets, dependencies, CI, containers, and infrastructure are reviewed.
- [ ] Backup restoration and emergency revocation/suspension drills pass.
- [ ] Private security reporting and incident ownership are operational.
- [ ] External security and privacy review is complete for the limited pilot scope.
