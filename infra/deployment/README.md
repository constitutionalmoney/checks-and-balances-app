# Dokploy deployment scaffold

Owner: `@constitutionalmoney`

[`compose.dokploy.yaml`](../../compose.dokploy.yaml) is a repository-backed Docker Compose
definition for a future Dokploy-hosted VRSCTEST environment. It builds the API, worker, and four
web shells from the current GitHub revision, runs Prisma migrations as a one-shot service, and
keeps PostgreSQL and Redis on an unpublished Compose network with named volumes.

This file is deployment plumbing, not a release approval. Every shell remains labelled
`Specification / VRSCTEST / Not operational`; public sessions, identity linking, Verus writes,
document upload, RMR integration, locality/uniqueness claims, and mainnet remain disabled. Issue
[#26](https://github.com/constitutionalmoney/checks-and-balances-app/issues/26) still owns TLS,
ingress hardening, managed secrets, backups/restores, monitoring, immutable images, rollback,
incident controls, and approval of an actual testnet deployment.

## Dokploy setup

1. Create a **Docker Compose** service and connect the GitHub repository.
2. Select the deployment branch, normally `main`.
3. Set the Compose Path to `./compose.dokploy.yaml`.
4. Prefer Dokploy **Isolated Deployments** and configure domains through Dokploy's Domains tab.
5. Add the required environment values below in Dokploy; do not commit a deployment `.env`.
6. Route only these services through Dokploy Domains:

| Service       | Container port | Intended testnet host                          |
| ------------- | -------------: | ---------------------------------------------- |
| `participant` |           3000 | `app.testnet.checksandbalances.services`       |
| `committee`   |           3001 | `committee.testnet.checksandbalances.services` |
| `verify`      |           3002 | `verify.testnet.checksandbalances.services`    |
| `api`         |           4000 | `api.testnet.checksandbalances.services`       |
| `docs`        |           3003 | `docs.testnet.checksandbalances.services`      |

Do not add a domain to `postgres`, `redis`, `migrate`, or `worker`. Never create a public RPC
domain. Scrape the worker's `/metrics` endpoint only from the private monitoring network; it is not
an ingress route.

## Required Dokploy environment

| Variable                 | Requirement                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `CBC_POSTGRES_PASSWORD`  | Strong generated PostgreSQL password.                                        |
| `DATABASE_URL`           | Full `postgresql://` URL using the same credentials and the `postgres` host. |
| `CBC_VERUS_RPC_URL`      | Private-network URL for an authenticated VRSCTEST node.                      |
| `CBC_VERUS_RPC_USER`     | VRSCTEST RPC user stored only in Dokploy.                                    |
| `CBC_VERUS_RPC_PASSWORD` | VRSCTEST RPC password stored only in Dokploy.                                |

`CBC_POSTGRES_DB` and `CBC_POSTGRES_USER` may be overridden; their defaults are both `cbc`.
`CBC_LOG_LEVEL` defaults to `info`. The Compose definition fixes the environment to `testnet`, the
network to `VRSCTEST`, and all unfinished/sensitive feature flags to `false` so an environment
value cannot silently enable them.

Dokploy writes configured environment values beside the Compose definition but does not inject
them automatically unless the Compose file references them. This definition references only its
explicit allowlist. Named volumes are used because Dokploy warns that repository bind mounts can
be cleared during Git-based AutoDeploys.

## Validation

CI validates interpolation and the Docker Compose model with synthetic, non-secret values:

```bash
docker compose -f compose.dokploy.yaml config --quiet
```

A real deployment must additionally pass issue #26's private-network, TLS, backup, monitoring,
rotation, rollback, and incident drills before it can be described as operational.
