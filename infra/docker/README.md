# Local Docker stack

Owner: `@constitutionalmoney`

`compose.yaml` starts PostgreSQL, Redis, Mailpit, a deterministic fake Verus `getinfo` endpoint,
the API/worker health shells, and four visible Next.js shells. The fake RPC implements no write
method. No object store or document bucket exists.
