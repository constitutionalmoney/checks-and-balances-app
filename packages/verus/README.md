# `@cbc/verus`

Owner: `@constitutionalmoney`

Private, typed VRSCTEST integration boundary. It exposes only the approved RPC methods, validates
RPC response shapes, classifies failures and ambiguous writes, enforces node/network/identity/VDXF
preflight, creates deterministic canonical manifests, and confirms plus reads back exact identity
content. The deterministic fake supports worker contract tests without Docker or wallet secrets.

There is no arbitrary RPC forwarding, browser credential path, mainnet method, participant data
collection, or wallet-secret persistence. ADR 0006 approves the dedicated VRSCTEST namespace,
server allowlist, and synthetic anchor-manifest fixture. That approval permits explicit local
VRSCTEST verification; it does not open the deployed worker write gate or authorize mainnet.
