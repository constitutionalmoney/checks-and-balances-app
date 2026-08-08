# CBC VerusID authentication service

This directory contains the CBC-scoped, VRSCTEST-only hosted authentication service for issue
#19. Its approved origin is `https://auth.checksandbalances.services`; Verus Mobile posts the
signed response to `/verusidlogin` there.

The service proves control of a selected VerusID for optional CBC account linking. It does not
authenticate a CBC account, assign a role, establish identity or residency, issue an attestation,
write to Verus, accept evidence, or support mainnet.

## Contract

| Method | Route                                       | Caller       | Behavior                                                                                             |
| ------ | ------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                                   | operator/CBC | Pinned release, signer, chain, SDK, store, and contract metadata                                     |
| `POST` | `/api/auth/verusid/challenge`               | CBC server   | Creates an exact signed, five-minute LoginConsent presentation                                       |
| `POST` | `/verusidlogin`                             | Verus Mobile | Verifies request and response signatures, exact request binding, and current VRSCTEST identity state |
| `GET`  | `/api/auth/verusid/result/:challengeID`     | CBC server   | Returns the same short-lived result until acknowledged or expired                                    |
| `POST` | `/api/auth/verusid/result/:challengeID/ack` | CBC server   | Deletes the result only after CBC supplies its exact token digest                                    |

All `/api/auth/verusid/*` routes require both `Authorization: Bearer <CBC_CLIENT_SECRET>` and
`X-CBC-Auth-Contract-Version: cbc-verusid-auth.v1`. The client secret is out-of-band and never
appears in the wallet presentation. The wallet callback is signature-authenticated instead.

The result JWT is HS256 with a distinct deployment secret and binds `iss`, `aud`, `challengeID`,
`state`, `idLoggedIn`, `jti`, `iat`, and `exp`. It intentionally contains no CBC role. The CBC API
verifies the JWT, performs its own VRSCTEST identity readback, commits the account link, and then
acknowledges the result. Redis makes this lifecycle durable across replicas and restarts.

## Local contract tests

The tests inject a synthetic Verus adapter and in-memory store. Runtime code has no automatic
mock mode.

```bash
npm ci
npm test
```

See [DEPLOY.md](DEPLOY.md) and [compose.dokploy.yaml](compose.dokploy.yaml) for deployment. Keep the
CBC feature flag disabled until the deployed digest, live VRSCTEST preflight, and Android/iOS
compatibility rows are approved.
