# Hosted Verus Mobile authentication compatibility matrix

Scope: Issue #19 optional account linking only

Network: VRSCTEST

Last updated: 2026-08-08

Release status: disabled / not operational

## Current target inventory

| Component                 | Observed target                                                              | Result                                                                           |
| ------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hosted auth service       | `https://auth.checksandbalances.services`, service version `1.1.0`, VRSCTEST | Source hardened in `services/verusid`; deployment and device acceptance pending  |
| Request signer            | `CONSTITUTION`, `iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm`                         | Approved VRSCTEST signer; independent state readback still required per ceremony |
| Android experimental APK  | Pixel 9 Audit; `com.verusmobile` `1.1.0-5`; Android 17/API 37; x86_64 16 KB  | Installed; experimental LoginConsent coverage only, not current-store acceptance |
| Android Verus Mobile      | Current Google Play `org.autonomoussoftwarefoundation.verusmobile.android`   | Version `1.0.34` observed in store; install and device-path evidence pending     |
| iOS Verus Mobile          | BrowserStack App Live real iPhone                                            | Exact App Store version/device pending observed evidence                         |
| Hosted SDK/primitives     | Deployed source and dependency commits unknown                               | Pin and immutable image evidence required                                        |
| `verusd` / chain readback | `1.2.17-3`, VRSCTEST                                                         | Local typed read adapter available; mainnet blocked                              |

The current AVD is named `Pixel 9 Audit`. ADB reports Android 17/API 37 on the
`sdk_gphone16k_x86_64` image and `com.verusmobile` version `1.1.0-5` (version code `1010005`).
That installation may supply an explicitly labelled experimental compatibility row, but it is
not the current Google Play acceptance row. Do not infer the store wallet version from this APK.
The official package and the BrowserStack device must report their actual installed builds before
those rows can be green.

## Hosted-service contract evidence

Verified live without a wallet approval:

- `GET /health` returned `status=ok`, service `verusid-auth`, version `1.0.0`, chain `vrsctest`, and
  configured signing/chain flags.
- `POST /api/auth/verusid/challenge` returned a LoginConsent deep link and challenge reference.
- an immediate result poll returned pending/not found, as expected before wallet approval.

The local client deliberately rejects the present health response for feature enablement because
it does not yet attest:

- `cbc-verusid-auth.v1` contract version;
- exact signing identity in health;
- SDK readiness and exact deployed source/dependency pins;
- authenticated result retrieval separate from the QR-visible challenge ID; or
- idempotent result delivery until CBC acknowledgment.

Current JWTs also need issuer, CBC audience, challenge, opaque state, identity, issued/expiry time,
and unique token-ID bindings. CBC ignores the service's `role` field and never exposes or stores
the raw JWT.

## Device paths

| Client/device                                  | App not installed | Same-device | Desktop QR | Cancel/timeout/disconnect | Wrong network/multiple identities | Result                                             |
| ---------------------------------------------- | ----------------: | ----------: | ---------: | ------------------------: | --------------------------------: | -------------------------------------------------- |
| Experimental `com.verusmobile` / Pixel 9 Audit |           Pending |     Pending |    Pending |                   Pending |                           Pending | **Installed; test after hardened service deploys** |
| Current Play Store wallet / Android AVD        |           Pending |     Pending |    Pending |                   Pending |                           Pending | **Official package install still required**        |
| Latest App Store wallet / BrowserStack iPhone  |           Pending |     Pending |    Pending |                   Pending |                           Pending | **Prepared only; do not start timed session yet**  |

## Automated evidence

- legacy/incomplete hosted health metadata fails closed before challenge creation;
- presentation URL, request digest, signer, callback, network, contract, and exact times are bound;
- HS256 algorithm confusion, bad signature, wrong issuer/audience/challenge/state/identity/time fail;
- hosted `role` is discarded;
- local polling is account-bound and stores only a polling-token digest;
- selected identity is independently read from VRSCTEST before atomic local consumption;
- cancellation, expiry, unlinking, and `revalidation_required` remain local audited states;
- no CBC wallet callback route or browser-visible hosted result token exists; and
- mainnet remains unrepresentable.

## Required before a green row

1. Pin and deploy the hardened hosted service contract and exact immutable dependency/image inputs.
2. Pass request substitution, callback forgery, challenge-only result theft, replay, SDK/chain
   outage, restart, recovered/revoked identity, and crash-before-local-commit tests.
3. After the hardened service is deployed, exercise the experimental Pixel 9 Audit APK row, then
   install the official Play package and record its actual wallet/device version before running
   the current-store same-device and QR rows.
4. Prepare the exact presentation before starting BrowserStack's two-minute real-device session,
   then record the actual iOS wallet/device versions and both flows.
5. Retain only redacted outcomes. Never record profile credentials, wallet secrets, selected
   identities, balances, deep links, hosted JWTs, or raw callback payloads.
