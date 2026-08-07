# VRSCTEST Verus worker runbook

Owner: protocol operator  
Scope: private `worker` service, PostgreSQL durable outbox, and private VRSCTEST `verusd` RPC  
Not in scope: mainnet, participant wallets, public RPC, or treating chain content as canonical

The application database remains canonical. A Verus anchor is verified only after the recorded
transaction reaches the configured confirmations and `getidentitycontent` contains the exact
canonical manifest digest. Never infer truth, identity ownership, or attestation validity from an
anchor alone.

## First response and emergency pause

1. Set `CBC_VERUS_IDENTITY_UPDATE_ENABLED=false` in the worker's secret/configuration source and
   restart only the worker service. In the current Issue #18 release this gate is permanently
   fail-closed and cannot be enabled by an ordinary runtime value.
2. Confirm `cbc_verus_worker_paused 1` at the private `/metrics` endpoint.
3. Leave PostgreSQL running. Pausing must preserve leases, attempts, jobs, anchors, and audit rows.
4. Capture only stable state/error counts and timestamps. Do not copy RPC bodies, manifests,
   identities, credentials, or private application records into tickets or chat.
5. Do not manually submit `updateidentity`. Resolve the incident and use the controlled retry path.

## Queue age or repeated failures

Read RPC calls use the short readiness timeout. Identity-update submissions use a separate
60-second default write timeout because wallet construction and signing may exceed readiness
latency; an explicit local verification may raise that bound. Any write timeout is still treated as
ambiguous and requires readback before another submission.

Inspect aggregate state without retrieving payload columns:

```sql
SELECT state, last_error_class, count(*)
FROM outbox_event
WHERE event_type = 'verus.anchor.requested'
GROUP BY state, last_error_class
ORDER BY state, last_error_class;

SELECT state, last_error_class, count(*)
FROM verus_job
GROUP BY state, last_error_class
ORDER BY state, last_error_class;
```

Check `/ready`, private network reachability, node sync, database capacity, and the latest
`outbox_attempt` result. An expired lease is recovered automatically. A second worker cannot claim
another active event for the same target identity. Do not edit `attempt_count`, immutable manifest
columns, transaction evidence, or audit history.

## Retry and dead-letter reconciliation

Automatic retry uses bounded exponential backoff and stops after eight attempts. For an ambiguous
submission, every retry searches exact identity content first; if the digest is absent, the worker
does not issue another write and eventually dead-letters the job.

Before a manual retry:

1. Keep the worker paused and identify one outbox UUID using non-payload columns.
2. Confirm the matching `verus_job` and `anchor_record` agree on subject, VDXF key, digest, and
   transaction evidence.
3. If submission was ambiguous, use private RPC read methods to search the approved identity and
   VDXF key. Record the result in the incident record without copying content bodies.
4. If the digest or transaction is found, do not resubmit. Reconciliation tooling must attach that
   evidence and continue confirmation/readback in a reviewed change.
5. If absence is proven and policy permits retry, use a reviewed administrative command that
   creates an audit event and a new outbox attempt. Direct `UPDATE` statements are prohibited:
   immutable guards and transition triggers are intentional.
6. Resume one worker, watch queue age/failure metrics, then unpause the remaining replicas.

Issue #18 intentionally does not provide a force-resubmit command. That action must wait for Issue
#2's approved namespace/manifest and a separately reviewed administration surface.

## Node recovery

1. Pause writes and verify the private RPC endpoint is not exposed through ingress.
2. On the node host, check `getinfo` and `getblockchaininfo`: testnet must be true; name must be
   `VRSCTEST`; chain ID must be `iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq`; blocks and headers must be
   caught up; verification progress must satisfy the worker policy; and peer count must be positive.
3. Repair/restart `verusd` using the node's own operations procedure. Never copy wallet data into
   the app container.
4. Re-run read-only preflight. Resume one worker only after the node is stable.
5. Let expired leases and retryable rows recover normally; do not reset in-progress job state.

## Wrong network

Treat any wrong-network alert as critical. Pause immediately, isolate the worker from RPC, verify
DNS/service routing and the configured private URL, and confirm both node RPC methods report the
expected VRSCTEST chain ID. Mainnet is not a representable database network and the worker has no
mainnet configuration path. Do not bypass this guard.

## Confirmation or reorg

Confirmation-pending rows are retried as reads without repeating a known transaction submission.
For a reorg, the job and anchor move to `reorg_pending`; private attestation/application history is
unchanged. Keep writes paused if reorgs repeat, compare the transaction block to the canonical
`getblockhash(height)`, wait for node consensus, and then use reviewed reconciliation. Never mark a
row verified manually.

## Readback mismatch

Pause immediately. A mismatch is terminal because confirmation alone is insufficient. Verify the
target identity, VDXF derivation, canonical policy version, manifest digest, and RPC semantic shape.
Do not log or paste the returned content. Resume only after explaining the mismatch and adding a
regression fixture; a new write requires a new reviewed outbox event.

## Credential rotation

1. Pause the worker and revoke its private-network RPC access.
2. Create a least-privilege VRSCTEST RPC credential in the secret manager; never place it in a URL,
   Compose file, GitHub variable, log, database, or queue payload.
3. Update `CBC_VERUS_RPC_USER` and `CBC_VERUS_RPC_PASSWORD`, restart the worker, and run readiness
   plus read-only preflight.
4. Revoke the old credential, confirm it fails, then resume one worker and observe metrics.

## Identity compromise or recovery/revocation

Pause and revoke worker RPC access. Preserve database and audit evidence. Verify identity state via
independent trusted tooling and alert the protocol owner. Do not automatically change target
identity, revocation/recovery authority, VDXF key, or manifest: they are immutable job identity.
Quarantine queued work until the replacement identity and migration/reconciliation plan receives
explicit governance approval. Any replacement uses new jobs; old records remain historical.
