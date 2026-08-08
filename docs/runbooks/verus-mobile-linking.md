# Hosted VRSCTEST Verus Mobile linking runbook

Owner: CBC application and hosted-auth operators

Scope: optional account linking, hosted LoginConsent service, CBC PostgreSQL challenges, and
private VRSCTEST identity readback

Not in scope: mainnet, role assignment, attestation issuance, participant identity updates, or
public evidence

## Safe state

Keep `CBC_VERUS_LINKING_ENABLED=false`. The source in `services/verusid` implements the
`cbc-verusid-auth.v1` trust contract, but the new hostname, immutable image, live VRSCTEST
readback, and mobile compatibility rows are not yet deployment evidence. A healthy endpoint or
generated QR is not release approval.

CBC must not contain the hosted signing WIF/private key. CBC has no public wallet callback route.
The wallet callback is `https://auth.checksandbalances.services/verusidlogin` and is owned by the
hosted service.

## Enablement configuration

Supply through the deployment secret/configuration store, never Compose source or Git:

```text
CBC_VERUS_NETWORK=VRSCTEST
CBC_VERUS_LINKING_ENABLED=true
CBC_VERUS_LINK_APPLICATION_IDENTITY=iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm
CBC_VERUS_AUTH_URL=https://auth.checksandbalances.services
CBC_VERUS_AUTH_CALLBACK_URL=https://auth.checksandbalances.services/verusidlogin
CBC_VERUS_AUTH_SERVICE_VERSION=1.1.0
CBC_VERUS_AUTH_ISSUER=checks-and-balances-verusid-auth
CBC_VERUS_AUTH_CONTRACT_VERSION=cbc-verusid-auth.v1
CBC_VERUS_AUTH_SOURCE_REVISION=<exact 40-character deployed Git commit>
CBC_VERUS_AUTH_IMAGE_DIGEST=<exact sha256 deployed image digest>
CBC_VERUS_AUTH_SDK_COMMIT=48a1d48a5d076f313022a5891986339851ad7c0c
CBC_VERUS_AUTH_PRIMITIVES_COMMIT=30c951804228a285546a45457be57ead39d90888
CBC_VERUS_AUTH_RPC_CLIENT_COMMIT=fd2c6b0d35d468ee6174bcdd569f5aa990b05282
CBC_VERUS_AUTH_BITGO_COMMIT=7c754d4a5920198d9fe6827d3e23bd5cf431f264
CBC_VERUS_AUTH_DAEMON_VERSION=v1.2.17-3
CBC_VERUS_AUTH_CLIENT_SECRET=<independent secret, at least 32 bytes>
CBC_VERUS_AUTH_JWT_SECRET=<independent secret, at least 32 bytes>
CBC_VERUS_LINK_BINDING_SECRET=<independent secret, at least 32 bytes>
CBC_VERUS_LINK_POLLING_SECRET=<independent secret, at least 32 bytes>
```

All secrets above must be distinct from one another and from session/rate-limit/RPC secrets.
Prefer asymmetric result signing and a pinned JWKS over shared HS256 when the hosted service
supports it.

Before enabling:

1. pin the hosted source revision, immutable image digest, SDK/primitives/daemon inputs, and
   licences;
2. confirm health reports the exact contract, signer, SDK readiness, authenticated result mode,
   and idempotent-until-ack delivery;
3. resolve the signer through VRSCTEST and confirm expected recovery/revocation authorities;
4. run service and CBC negative contract tests;
5. run PostgreSQL migration/persistence checks; and
6. pass the exact Android and iOS compatibility rows.

## Rotation

Rotating the hosted client/JWT secret, binding secret, or polling secret invalidates some or all
outstanding ceremonies. Disable linking, allow or explicitly expire the five-minute window,
rotate one secret at a time, restart both affected deployments where applicable, and exercise a
new synthetic ceremony. Never retain old secrets or hosted JWTs in tickets or logs.

## Incident pause

1. Set `CBC_VERUS_LINKING_ENABLED=false` and restart CBC API instances.
2. Disable hosted challenge creation/result delivery if its signer, SDK, callback, result endpoint,
   or chain dependency may be compromised.
3. Preserve PostgreSQL and append-only audit rows; do not reset challenges to `presented`.
4. Revoke/rotate hosted signing or service credentials through that service's custody runbook.
5. Record only aggregate state/error counts, timestamps, pinned versions, and correlation IDs.
   Never capture deep links, tokens, selected identities, IP addresses, or wallet material.

## Result failures and replay

The hosted service must fail closed for an unknown/expired/consumed challenge, substituted request,
wrong callback/signer/network, invalid response, stale/recovered/revoked identity, or unavailable
SDK/chain verification. Result retrieval must require the server credential that is absent from the
wallet presentation and remain idempotently retrievable until CBC acknowledges it or it expires.

CBC verifies the result signature and every local binding, discards remote roles, reads the current
identity independently, and consumes the account-bound local challenge atomically. A crash before
the local commit must not permanently consume the only remote result.

Inspect only privacy-safe aggregates:

```sql
SELECT state, count(*)
FROM wallet_challenge
GROUP BY state
ORDER BY state;

SELECT state, count(*)
FROM verus_identity_link
GROUP BY state
ORDER BY state;
```

## Identity recovery, revocation, or revision

Disable linking if the hosted signer changes state. For a linked participant/committee identity,
move active links to `revalidation_required` through the repository command and retain the audit
chain. Privileged features must not rely on that link until a fresh ceremony observes an active
current identity. Unlinking is local and does not alter the VerusID.

## Device compatibility procedure

Do not start until the user confirms the Pixel 10 wallet/profile is ready. For every exact row,
record only non-sensitive facts:

1. store package/bundle, wallet version, OS/API, device/emulator class, and VRSCTEST profile ready;
2. app-not-installed behavior;
3. same-device launch and return;
4. desktop QR scan and hosted callback/result;
5. cancel/back, timeout, browser disconnect, wrong network, and multiple-identity selection;
6. duplicate result/ack behavior; and
7. whether the wallet displayed the requester, VRSCTEST, purpose, expiry, and selected identity.

Never screen-record profile credentials, seeds, keys, account balances, unrelated identities, or
recovery data. A green result applies only to the exact observed client/version combination. iOS
cannot be inferred from Android.
