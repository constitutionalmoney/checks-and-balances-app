# Private VRSCTEST worker

Owner: `@constitutionalmoney`

Checks PostgreSQL, Redis/BullMQ, and fake/private Verus RPC readiness and exposes `/health`,
`/ready`, and an internal privacy-safe `/metrics` endpoint. The durable PostgreSQL outbox processor
claims only `verus.anchor.requested` events, serializes active writes per target identity, and
persists preflight, submission, confirmation, exact readback, retry, reorg, and dead-letter state.

ADR 0006 supplies the approved VRSCTEST namespace, identity, and synthetic manifest. The hosted
release/policy write gate remains fail-closed until a separate reviewed deployment decision; the
fixture is available only to the explicit local live-verification path. The worker performs no
notification, expiry, participant, wallet, document, or mainnet work. See
[`docs/runbooks/verus-worker.md`](../../docs/runbooks/verus-worker.md).
