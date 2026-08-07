# ADR 0006: VRSCTEST VDXF namespace and anchor manifest

- Status: accepted for VRSCTEST
- Date: 2026-08-07
- Decision scope: Issue #2 namespace ownership, URI versioning, and the Issue #18 synthetic anchor manifest
- Mainnet effect: none; mainnet writes remain prohibited

## Context

CBC needs deterministic application-owned VDXF keys before its private RPC worker can write and
read back a synthetic anchor. The historical `vrsc::identity.attestation.cbc.*` proposal does not
carry documented authority. Reusing the broader `CONSTITUTION.VRSCTEST@` identity would also couple
the protocol to an identity with responsibilities outside this application.

VRSCTEST qualifies a root identity with its chain name. The abbreviated
`cbc-protocol-test::...` form does not resolve to the CBC identity namespace. The daemon-returned
namespace is correct only for the fully qualified form
`cbc-protocol-test.VRSCTEST::...`.

## Decision

### Namespace owner and custody

`cbc-protocol-test.VRSCTEST@` owns the CBC v1 application namespace on VRSCTEST.

- Immutable identity address: `iC7jT1JAJJZHrS4JnHRbgLn9qUQokMsedM`.
- Network/system: VRSCTEST, `iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq`.
- Registration transaction: `1791d7b56c7f3a4248025cbf4110586fbe65b79216d05191e434a28361ef5413`.
- Active identity readback: block `1180058`; the node reported `active` and signing authority.
- Primary authority: one key held by the local private VRSCTEST wallet; the address and all wallet
  secrets stay outside application configuration and repository fixtures.
- Recovery and revocation authority: `CONSTITUTION.VRSCTEST@`, immutable identity address
  `iMUw5xvWkC7qsCzgxi2um9YRCmugmBhBfm`.
- Minimum signatures: one. This is a development/testnet custody posture, not approval for a pilot
  committee or mainnet.
- Access path: allowlisted RPC calls from the private worker network only. Authenticated `verusd`
  RPC must never be public.

Friendly names are presentation metadata. Runtime preflight compares the immutable identity,
system ID, active state, signing capability, and VDXF IDs.

### URI and version rules

The approved v1 URI set is:

```text
cbc-protocol-test.VRSCTEST::v1.attestation.human
cbc-protocol-test.VRSCTEST::v1.attestation.method
cbc-protocol-test.VRSCTEST::v1.attestation.validity
cbc-protocol-test.VRSCTEST::v1.attestation.revocation
cbc-protocol-test.VRSCTEST::v1.attestation.policy
cbc-protocol-test.VRSCTEST::v1.proof.reference
cbc-protocol-test.VRSCTEST::v1.anchor.schema
cbc-protocol-test.VRSCTEST::v1.anchor.policy
cbc-protocol-test.VRSCTEST::v1.anchor.cycle_report
```

The first path segment is an immutable major version. A breaking interpretation, privacy change,
or incompatible encoding requires a new `v2` URI. Compatible artifact changes retain the v1 URI
and increment the artifact's semantic version. Published keys are never reinterpreted or deleted.

The daemon-derived values are recorded in
`fixtures/verus/vrsctest-vdxf-v1.json`. Server code selects these values; a client cannot submit an
arbitrary identity, URI, VDXF ID, or field set.

### Record placement

| Record                                                             | Placement                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Human, method, validity, revocation, and attestation-policy fields | Private signed credential and private PostgreSQL canonical state; no baseline participant public write                                                             |
| Public proof reference                                             | Optional participant-held public reference only after an explicit wallet-approved flow; disabled by default                                                        |
| Schema and policy anchor manifests                                 | Public protocol-identity commitments containing public artifact metadata and digests only                                                                          |
| Cycle report anchor manifest                                       | Public aggregate committee commitment; no participant identifiers, evidence, private locations, notes, or small-cell data                                          |
| Revocation/status list                                             | Private canonical status; a future privacy-reviewed aggregate commitment may use an approved policy anchor, but this ADR does not approve a per-person public list |

Verus is an asynchronous commitment/readback surface. PostgreSQL remains canonical for people,
sessions, decisions, appeals, and status.

### Canonical encoding and digest

`cbc-json-v1` means:

1. accept only a JSON value that passed its versioned schema and server allowlist;
2. normalize every string and object key to Unicode NFC;
3. recursively sort object keys by code-unit lexical order;
4. preserve array order and JSON boolean, null, string, and finite-number semantics;
5. serialize without insignificant whitespace as UTF-8; and
6. compute lowercase hexadecimal SHA-256 over those exact UTF-8 bytes.

This is the repository's pinned canonicalizer, not a claim of full RFC 8785 compatibility. A
canonicalizer change is breaking and requires a new name/version.

The v1 anchor-manifest payload limit is 2,048 canonical UTF-8 bytes. Its only allowed and required
top-level fields are `schema`, `environment`, `anchorType`, `artifact`, `namespace`, and
`supersedes`. Nested schema validation and the repository's recursive privacy-field denylist also
apply.

The supported identity content representation is array form:

```json
{
  "contentmultimap": {
    "<approved-vdxf-id>": ["<lowercase-hex-of-canonical-utf8-manifest>"]
  }
}
```

The pinned daemon accepts each array string as a raw byte vector under the application VDXF key.
The worker preserves other identity content, submits the lowercase hex encoding of the exact
approved canonical bytes, waits for the required confirmations, decodes `getidentitycontent`
readback, rejects non-canonical JSON, and recomputes the digest from the exact decoded bytes.

### Supersession and migration

`supersedes` is either `null` for the first artifact or the lowercase SHA-256 digest of the exact
prior manifest. Supersession appends a new contentmultimap value and never mutates the meaning of a
prior digest. Consumers reject loops and cross-type supersession. Breaking schema or encoding
changes publish under a new major URI while the old URI remains readable.

### Baseline privacy rule

No baseline participant record or participant VerusID update is required. Raw evidence, evidence
hashes, face or document data, exact addresses, private session data, committee notes, appeal
facts, political activity, and wallet secrets are prohibited from manifests and fixtures.

## Approved synthetic fixture

`fixtures/verus/cbc-anchor-manifest.v1.fixture.json` anchors the canonical digest of the public
human-attestation JSON Schema under the `v1.anchor.schema` key. It contains no participant data.
Its payload is 577 canonical bytes and has digest
`f6807399ff037eb92fb3b60aa67c1f2ee34e4f412d709801c4d21576d44fc0ce`.

The live VRSCTEST readback is verified at block `1180085` in transaction
`a8f9a1108ebc58408b08ac79e7520658b2c580bf59e3cf0e29a265f7613287a6`, block hash
`00000000075a6a75e54cef329b093239a02ac719e34859b6a0db6b07163514ab`. The durable
outbox record recovered the transaction from exact digest readback after an ambiguous submission
result, then persisted confirmation and readback evidence without resubmitting the manifest.

The live-write deployment gate remains fail-closed. The fixture may be used by the explicit local
VRSCTEST verification harness and may be enabled in a hosted environment only through a separate
reviewed release decision.

## Alternatives considered

- `vrsc::identity.attestation.cbc.*`: rejected because CBC has no documented authority over the
  Verus system namespace.
- `CONSTITUTION.VRSCTEST::cbc.*`: rejected because it couples the application protocol to a broader
  Constitutional Money identity.
- `cbc-protocol-test::...`: rejected because it is not fully qualified and derives a different
  namespace on VRSCTEST.
- Per-participant public records: rejected as a baseline because they create linkability and are
  unnecessary for private canonical status.
- Raw JSON string or opaque evidence hash: rejected because it weakens interoperability or creates
  privacy/correlation risk.

## Consequences

- VRSCTEST preflight and fixtures can bind to immutable identity/key values.
- The first live record is intentionally public, synthetic, and reproducible.
- Testnet single-key custody is an explicit limitation and must not be represented as committee
  threshold governance.
- Issue #2 still requires the remaining versioned schemas and state fixtures before it is complete.
- Mainnet and participant public-proof writes remain technically and procedurally blocked.
