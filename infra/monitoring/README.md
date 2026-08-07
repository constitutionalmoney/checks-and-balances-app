# Monitoring

Owner: `@constitutionalmoney`

The private worker exposes Prometheus text at `/metrics` on its internal port. Do not publish the
worker or this endpoint through Dokploy ingress. Metric names and labels are deliberately bounded:
they contain outcomes and stable error classes only—never committee, participant, identity, VDXF,
transaction, manifest, RPC body, or credential values.

Issue #18 provides the focused VRSCTEST worker alerts in
[`verus-worker-alerts.yaml`](./verus-worker-alerts.yaml). Import the rule group into the private
Prometheus-compatible monitor and route warnings to the protocol operator. Page immediately for a
wrong network, exact-readback mismatch, or reorg. The initial thresholds are conservative pilot
defaults and must be reviewed against observed VRSCTEST behavior before an operational release.

| Signal                                | Meaning                                              | Initial alert                                 |
| ------------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `cbc_verus_outbox_oldest_age_seconds` | Oldest durable event waiting or eligible for retry   | More than 5 minutes while unpaused            |
| `cbc_verus_rpc_failures_total{class}` | Stable failure class, with no request/response label | More than 5 failures in 10 minutes            |
| `cbc_verus_node_synchronized`         | Result of the last write preflight                   | Not synchronized for 5 minutes while unpaused |
| `cbc_verus_wrong_network_total`       | Fail-closed chain/network mismatch                   | Any increase                                  |
| `cbc_verus_confirmation_count`        | Most recent observed confirmation count              | Pending failure repeats for 15 minutes        |
| `cbc_verus_readback_mismatch_total`   | Canonical digest absent after confirmation           | Any increase                                  |
| `cbc_verus_reorg_total`               | Canonical block/transaction evidence changed         | Any increase                                  |
| `cbc_verus_worker_paused`             | Administrative/release write gate                    | Informational; suppresses availability alerts |

See [`docs/runbooks/verus-worker.md`](../../docs/runbooks/verus-worker.md) for response steps.
Issue #26 still owns the shared dashboards, retention, incident status, and production monitoring
platform.
