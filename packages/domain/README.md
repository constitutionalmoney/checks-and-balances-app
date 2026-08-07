# `@cbc/domain`

Owner: `@constitutionalmoney`

Framework-independent state machines for issue #16. Consumers receive named commands rather than a
generic status setter; invalid transitions fail with `InvalidTransitionError`.

Issue #16 includes verification/attestation, committee, Verus-job, renewal-cycle, wallet-challenge,
consent, appeal, privacy-request, notification, and relying-party-client lifecycles. Exact 45-day
validity, public projection allowlisting, and the reviewer-eligibility boundary are also enforced.

The package does not choose quorum, authorization roles, renewal selection, uniqueness, locality,
evidence procedure, appeal deadlines, committee suspension consequences, Verus RPC behaviour, or
mainnet policy. Those behaviours remain disabled until their controlling issues are approved.
