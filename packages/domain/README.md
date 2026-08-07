# `@cbc/domain`

Owner: `@constitutionalmoney`

Framework-independent state machines for issue #16. Consumers receive named commands rather than a
generic status setter; invalid transitions fail with `InvalidTransitionError`.

The first slice implements only the verification/attestation, committee, and Verus-job transitions
spelled out in issue #16. It does not choose quorum, renewal selection, uniqueness, locality,
evidence, appeal procedure, committee suspension consequences, or mainnet policy. Those behaviours
remain disabled until their controlling issues are approved.
