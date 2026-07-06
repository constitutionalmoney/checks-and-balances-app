# Checks and Balances Committee — Human Verification Protocol

> Non-governmental, community-rooted proof of human for the Mirror-State.

## What this is

This repository contains the protocol, schema, tooling, and reference implementation for the Checks and Balances Committee (CBC) Human Verification Protocol.

The protocol enables **12-person local committees** to verify that individuals are real humans living in a specific geographic area, and to record those attestations on-chain via **VerusID/VDXF**. Attestations expire every **45 days** and are refreshed through a randomized recurring verification process.

This is the foundational identity layer for the broader civic stack:
- [Rate My Representatives](https://github.com/constitutionalmoney/rate-my-representatives)
- Civic Ledger AI
- AxeTax.ai
- Constitutional Money / Nation-State Reserves

## Core idea

| Element | Description |
|---------|-------------|
| **Committee size** | 12 people minimum per local jurisdiction |
| **Signing model** | 2-of-3 from 12 members per attestation |
| **Verification cycle** | 45 days, randomized recurring summons |
| **Identity binding** | VerusID + VDXF contentmultimap |
| **Discovery** | auth.md published by each committee |
| **Portability** | BYOP — bring your own verified profile |

## Repository structure

```
.
├── docs/
│   ├── protocol.md              # Full protocol specification
│   ├── schema.md                # VDXF attestation schema
│   ├── committee-formation.md   # How to start a committee
│   ├── 45-day-cycle.md          # Recurring verification mechanics
│   └── website-plan.md          # checksandbalances.services redesign
├── schemas/
│   ├── vdxf-human-attestation.json
│   ├── committee-identity.json
│   └── auth.md                  # Reference auth.md template
├── legal/
│   ├── committee-formation-agreement.md
│   ├── member-covenant.md
│   └── attestation-affidavit.md
├── toolkit/
│   ├── committee-onboarding-checklist.md
│   ├── cycle-scheduler.md
│   └── verification-session-guide.md
├── reference-implementation/
│   ├── verusid-attestation/     # Scripts for committee attestation
│   ├── status-query/            # Public attestation query service
│   └── trust-weighting/         # Trust weight calculation
├── website/
│   ├── design/                  # Wireframes and content
│   └── auth.md-discovery/       # Committee discovery service
└── README.md
```

## Quick links

- [Protocol Specification](./docs/protocol.md) *(work in progress)*
- [VDXF Schema](./schemas/vdxf-human-attestation.json) *(work in progress)*
- [Committee Formation Guide](./docs/committee-formation.md) *(work in progress)*
- [Website Redesign Plan](./docs/website-plan.md) *(work in progress)*

## Getting involved

1. Read the [protocol specification](./docs/protocol.md)
2. Review the [committee formation guide](./docs/committee-formation.md)
3. Check open issues for `good-first-issue` or `pilot` work
4. Join or form a local committee

## License

TBD — pending governance decision.
