# ADR 0002: Explicit domain state-machine commands

- Status: accepted for the first issue #16 implementation slice
- Date: 2026-08-06
- Issue: #16

## Context

Issue #16 defines verification/attestation, committee, and Verus-job states and transitions. The
protocol policies that will eventually authorize several of those transitions are not all approved,
and controllers, persistence, quorum evaluation, participant records, and Verus writes are outside
this first slice.

Exposing a generic status setter would let callers bypass the defined lifecycle even if the current
implementation used it correctly.

## Decision

Implement the issue-defined transitions as pure, framework-independent functions in `@cbc/domain`.
Each public function represents one named command, accepts only its expected source state, and
returns its defined destination state. Invalid commands throw `InvalidTransitionError` with a stable
error code and transition context.

Keep the generic transition helper internal to the package. The package root is the only published
export path, and it exposes named commands, state types, state constants, and the typed error only.

This slice models transition legality, not transition authorization. It does not connect these
functions to an API, database, worker, wallet, or chain.

## Consequences

- Callers cannot set a lifecycle state through the public package API.
- Every allowed command and every prohibited source state can be tested exhaustively.
- Adding a transition requires an explicit public command and a policy-backed change.
- Quorum, renewal selection, uniqueness, locality, evidence, appeal procedure, suspension
  consequences, expiry calculation, and production activation remain undecided and disabled.
