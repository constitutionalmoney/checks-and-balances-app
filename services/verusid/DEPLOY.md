# Dokploy deployment runbook

Deploy this directory as its own Compose application from the GitHub repository, using
`services/verusid/compose.dokploy.yaml`. Route only the `verusid-auth` service on container port
3001 to `auth.checksandbalances.services`; Redis remains on the internal network with no public
port.

## Required Dokploy values

- `VERUSID_AUTH_PRIVATE_KEY`: WIF for the approved `CHECKBALANCE.VRSCTEST@` signer
  (`iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP`). Enter it directly into Dokploy; never expose it through
  Git, logs, support messages, or the CBC application.
- `VERUSID_AUTH_JWT_SECRET`: random value of at least 32 bytes, used only for result JWTs.
- `VERUSID_AUTH_CLIENT_SECRET`: distinct random value of at least 32 bytes, also configured as
  `CBC_VERUS_AUTH_CLIENT_SECRET` on the CBC API.
- `VERUSID_AUTH_RPC_URL`, `VERUSID_AUTH_RPC_USER`, and `VERUSID_AUTH_RPC_PASSWORD`: private,
  read-only-capable VRSCTEST RPC access.
- `SERVICE_SOURCE_REVISION`: full Git commit deployed by Dokploy.
- `VERUSID_AUTH_IMAGE_DIGEST`: immutable digest from the successful main-branch
  `Publish immutable hosted-auth image` job.
- `VERUSID_AUTH_VERUSD_VERSION`: exact daemon version serving the RPC endpoint.

Before inserting the WIF, independently read `CHECKBALANCE.VRSCTEST@` from VRSCTEST and require
identity address `iBN1aqx6nYhm71h9UkGsW9mhU6trADx4WP`, status `active`, primary address
`RDExW3nvnGGrjKgSNXivaTby6bp5wDn2bc`, and recovery/revocation authority
`iEJB55oTeiszJbhaiuCbnjG9YKrz1CWNHY`. Do not deploy the recovery authority's key with this service.

Do not display environment variables from the container. Do not paste WIFs, JWT secrets, client
secrets, RPC credentials, raw wallet callbacks, or result tokens into logs or support messages.

## Immutable image publication

After PR approval and merge, the main workflow publishes
`ghcr.io/constitutionalmoney/checks-and-balances-verusid-auth:<commit>` and scans that exact image
by digest. Copy the `sha256:` digest from the successful workflow summary into
`VERUSID_AUTH_IMAGE_DIGEST`; Compose pulls the image with `@sha256:...` and cannot drift to a
mutable tag. Set `SERVICE_SOURCE_REVISION` to the same full main-branch commit. If the GHCR package
is private, configure Dokploy's GitHub Container Registry credentials with read-package access.
Do not deploy an image from a failed or incomplete publication job.

## DNS and proxy

1. Point `auth.checksandbalances.services` to the Dokploy ingress.
2. Enable HTTPS and redirect HTTP to HTTPS.
3. Route the hostname to `verusid-auth:3001` only.
4. Preserve one trusted proxy hop; do not expose Redis or the private VRSCTEST RPC.
5. Apply request-size and rate limits without changing the wallet callback body.

## Safe validation sequence

1. Leave `CBC_VERUS_LINKING_ENABLED=false` in the CBC application.
2. Confirm Compose resolves with all required values.
3. Confirm `/health` returns HTTP 200 and every pinned field matches the approved deployment.
4. Run an authenticated synthetic challenge/result/ack contract check from the CBC network.
5. Confirm an unauthenticated result request returns 401 and query-string credentials are ignored.
6. Confirm service restart preserves a pending challenge/result through Redis.
7. Complete live VRSCTEST and mobile compatibility acceptance before enabling the CBC feature.

Rollback by restoring the prior immutable image reference while keeping CBC linking disabled. A
healthy process alone is not release approval.
