---
title: Checks & Balances Protocol Subdomain and DNS Plan
version: 1.0
status: Recommended
last_updated: 2026-08-05
---

# Subdomain and Deployment Plan

## 1. Recommendation

Keep `checksandbalances.services` as the public explanation and protocol-status website. Host the application as distinct security surfaces rather than putting participant, committee, verifier, API, and documentation functions into one origin.

### Production-facing names

| Host | Purpose | Authentication | Public launch condition |
|---|---|---|---|
| `checksandbalances.services` | Existing public website and current protocol explanation | None | Already public; content must remain synchronized |
| `www.checksandbalances.services` | Redirect to root | None | Redirect only |
| `app.checksandbalances.services` | Participant PWA: account, optional VerusID link, session request, status, renewal, appeal | Participant session | Publish only when participant release gate passes |
| `committee.checksandbalances.services` | Committee formation and operations console | Strong committee/steward session | Keep inaccessible until authorized test users exist |
| `verify.checksandbalances.services` | Participant-presented public verifier and proof/status display | Usually none; proof/reference required | Publish testnet label first; resist enumeration |
| `api.checksandbalances.services` | Versioned API, wallet callbacks, participant and committee backend | Route-specific | No direct public RPC; publish OpenAPI only for released routes |
| `docs.checksandbalances.services` | Developer documentation, OpenAPI, schemas, SDKs, compatibility matrix | Public for approved material | Label unavailable/planned functions accurately |
| `status.checksandbalances.services` | Independent uptime and incident page | Public | Host separately from primary application infrastructure |
| `committees.checksandbalances.services` | Public committee directory and path-based committee pages | Public | Directory remains disabled until committees are approved |

### Optional later host pattern

```text
{committee-slug}.committees.checksandbalances.services
```

Use this only when committees need separately branded public discovery or `auth.md` documents. A path-based model such as `committees.checksandbalances.services/ca-bc-kelowna` is easier to secure, certificate, cache, and govern for the first pilot.

## 2. Testnet and staging names

Use names that make non-production status impossible to miss:

| Host | Purpose |
|---|---|
| `app.testnet.checksandbalances.services` | Participant VRSCTEST application |
| `committee.testnet.checksandbalances.services` | Committee VRSCTEST console |
| `verify.testnet.checksandbalances.services` | VRSCTEST verifier |
| `api.testnet.checksandbalances.services` | VRSCTEST API and wallet callbacks |
| `docs.testnet.checksandbalances.services` | Preview documentation and contracts |
| `committees.testnet.checksandbalances.services` | Test directory |
| `status.testnet.checksandbalances.services` | Test-environment status if useful |

For temporary review deployments, use provider-generated or tightly controlled names rather than creating permanent DNS for every branch. Never let a preview deployment accept real identity evidence or production wallet permissions.

## 3. Hosts not recommended

### No public `rpc.checksandbalances.services`

Authenticated `verusd` RPC must remain on localhost or a private network. There is no legitimate reason to expose it as a public subdomain.

### No separate `auth.checksandbalances.services` initially

Authentication and Verus Mobile callbacks can live under versioned, narrowly scoped `api` routes. A separate identity-provider origin adds cookie, redirect, key, and incident complexity before it is needed.

### No separate `evidence.checksandbalances.services`

The public product must not become a document-upload portal. Creating an evidence host would signal the wrong architecture and expand the attack surface.

### No mainnet-branded host until a mainnet decision

Do not create `mainnet.*`, `live.*`, or equivalent names that imply an approved production credential before the release decision exists.

## 4. Suggested route ownership

### Root website

```text
https://checksandbalances.services/
https://checksandbalances.services/how-we-check-power/
https://checksandbalances.services/how-verification-works/
https://checksandbalances.services/start-a-committee/
https://checksandbalances.services/find-a-committee/
https://checksandbalances.services/verified-humans/
https://checksandbalances.services/developers/
https://checksandbalances.services/protocol-foundations/
https://checksandbalances.services/civic-roadmap/
https://checksandbalances.services/privacy-and-data/
https://checksandbalances.services/archive/
https://checksandbalances.services/.well-known/auth.md
```

The root `auth.md` may redirect or be generated from the version-controlled template, but the final response should be stable, machine-readable, and accurately state `pilot_preparation` or the later approved status.

### Participant app

```text
https://app.checksandbalances.services/
https://app.checksandbalances.services/request
https://app.checksandbalances.services/status
https://app.checksandbalances.services/renew
https://app.checksandbalances.services/appeals
https://app.checksandbalances.services/settings/security
https://app.checksandbalances.services/settings/verus
```

### Committee console

```text
https://committee.checksandbalances.services/
https://committee.checksandbalances.services/formation
https://committee.checksandbalances.services/sessions
https://committee.checksandbalances.services/cycles
https://committee.checksandbalances.services/attestations
https://committee.checksandbalances.services/appeals
https://committee.checksandbalances.services/audit
https://committee.checksandbalances.services/settings/verus
```

### Verifier

```text
https://verify.checksandbalances.services/
https://verify.checksandbalances.services/present
https://verify.checksandbalances.services/result/{short-lived-reference}
```

Do not provide an unrestricted `/identity/{verusId}` route.

### API

```text
https://api.checksandbalances.services/api/v1/...
https://api.checksandbalances.services/.well-known/jwks.json       # only if signed token design requires it
https://api.checksandbalances.services/api/v1/auth/verus/callback
https://api.checksandbalances.services/api/v1/protocol/status
```

The wallet callback should be a dedicated route with strict body limits, origin/audience/state validation, replay protection, and idempotent response handling.

### Docs

```text
https://docs.checksandbalances.services/
https://docs.checksandbalances.services/openapi
https://docs.checksandbalances.services/schemas
https://docs.checksandbalances.services/sdk
https://docs.checksandbalances.services/verus-mobile
https://docs.checksandbalances.services/compatibility
https://docs.checksandbalances.services/changelog
```

## 5. Cookie and origin policy

Do not set a broad `.checksandbalances.services` authentication cookie.

Recommended cookie scoping:

- participant session: host-only for `app.checksandbalances.services`;
- committee session: host-only for `committee.checksandbalances.services`;
- no authentication cookie on `verify`, `docs`, root website, or `status`;
- API requests use same-site browser sessions through a backend-for-frontend pattern or route-specific tokens, not a universal cross-subdomain cookie.

Cookie defaults:

```text
Secure
HttpOnly
SameSite=Lax or Strict where compatible
Path=/
short idle lifetime for privileged sessions
rotation after authentication and privilege elevation
```

Participant and committee sessions must use different audiences and signing keys or key derivations. Compromise of the participant app must not create a committee session.

## 6. CORS and callback policy

The API should deny cross-origin requests by default and allow an explicit environment-specific origin list:

```text
https://app.checksandbalances.services
https://committee.checksandbalances.services
https://verify.checksandbalances.services
```

Documentation examples and third-party relying parties do not receive browser CORS access merely because they have API credentials. Add an origin only when the client architecture requires it.

The Verus Mobile callback is not protected by browser CORS. It is protected by the signed envelope, nonce, state, expiry, audience, network, signer, current identity lookup, body limit, rate limit, and one-time challenge consumption.

## 7. DNS and TLS

Recommended records:

- root and each stable host use explicit `A`/`AAAA` or `CNAME`/provider records;
- `www` redirects to the apex;
- avoid a broad wildcard for production application traffic unless the ingress and tenant routing are designed for it;
- a wildcard `*.committees.checksandbalances.services` may be added later for approved committee hosts;
- use DNS CAA to restrict certificate authorities;
- enable DNSSEC where supported and operationally maintained;
- enforce HTTPS and HSTS after every required host is valid;
- maintain certificate-expiry monitoring even when using automated certificates.

A wildcard certificate does not replace application-level committee recognition or host validation.

## 8. Reverse proxy and network segmentation

Public ingress may route application containers, but internal services remain private:

```text
public ingress network:
  participant web
  committee web
  verifier web
  API
  docs

application private network:
  API
  workers
  PostgreSQL
  Redis
  object store endpoint

Verus private network:
  Verus worker
  verusd VRSCTEST
```

Only the Verus worker should reach authenticated RPC. The API sends durable jobs through the database/outbox and queue; it does not hold a general RPC tunnel open for browsers.

## 9. Environment isolation

Production and testnet require separate:

- databases;
- Redis instances/namespaces;
- secrets and signing keys;
- email sender domains or clearly marked templates;
- Verus nodes and RPC credentials;
- committee and application VerusIDs;
- object-storage buckets;
- observability projects;
- API client credentials; and
- backup sets.

Never make `network=VRSC` a user-supplied API parameter. The environment selects the allowed network server-side.

## 10. Email and notification domains

Recommended operational mail hosts:

```text
notify.checksandbalances.services     # return-path or sending subdomain
security@checksandbalances.services
privacy@checksandbalances.services
support@checksandbalances.services
conduct@checksandbalances.services
trademarks@checksandbalances.services
```

These are recommendations, not claims that the mailboxes currently exist. Configure SPF, DKIM, DMARC, bounce handling, and complaint processing before sending participant notices. Do not put sensitive status details in subject lines.

## 11. Service-status independence

`status.checksandbalances.services` should be hosted separately enough that it can report an outage of the main stack. It should distinguish:

- public website;
- participant app;
- committee console;
- API;
- verifier;
- notifications;
- VRSCTEST/Verus integration; and
- public directory.

Do not expose internal topology, security controls, participant counts, or active incident exploit details.

## 12. Launch sequence

1. Reserve DNS names without publishing application claims.
2. Deploy testnet hosts with prominent non-production banners and robots controls where appropriate.
3. Publish developer docs and protocol status before interactive wallet or status flows.
4. Enable participant authentication with synthetic test users.
5. Enable VerusID linking on VRSCTEST after mobile compatibility tests.
6. Enable committee console only for approved testers.
7. Enable verifier with synthetic fixtures and anti-enumeration tests.
8. Enable public directory only after an approved committee exists.
9. Enable limited pilot through server-controlled release flags.
10. Consider production/mainnet names only after a separate decision.

## 13. Final recommended set

For the full build, reserve these now:

```text
checksandbalances.services
www.checksandbalances.services
app.checksandbalances.services
committee.checksandbalances.services
verify.checksandbalances.services
api.checksandbalances.services
docs.checksandbalances.services
status.checksandbalances.services
committees.checksandbalances.services

app.testnet.checksandbalances.services
committee.testnet.checksandbalances.services
verify.testnet.checksandbalances.services
api.testnet.checksandbalances.services
docs.testnet.checksandbalances.services
committees.testnet.checksandbalances.services
```

The minimum launch set for the first testnet build is `app.testnet`, `committee.testnet`, `verify.testnet`, `api.testnet`, and `docs.testnet`. The public root website remains the authoritative explanation layer.
