# Security Policy

## Current support status

The Checks & Balances Protocol application is in specification and pilot preparation. No production credential, public verification session, production API, or mainnet integration is represented as live.

Security support applies to the current default branch and any release explicitly designated as supported by project maintainers.

## Reporting a vulnerability

Do **not** open a public GitHub issue for:

- authentication or authorization bypass;
- wallet request or callback forgery;
- replay, QR substitution, deep-link substitution, or wrong-chain attacks;
- private-key, seed, RPC credential, or signing-key exposure;
- participant or committee personal-information exposure;
- status enumeration or correlation attacks;
- committee signer compromise or collusion techniques;
- Verus transaction duplication or unintended mainnet writes;
- evidence-retention leaks;
- vulnerabilities that could create, extend, revoke, or falsify attestations; or
- denial-of-service methods against sessions, expiry, renewal, appeals, or status checks.

Send a private report to:

```text
[SECURITY CONTACT EMAIL TO BE ADDED BEFORE PUBLIC DEPLOYMENT]
```

Until that address is published, do not submit real secrets or sensitive personal data through GitHub or Discord. The project steward must establish and monitor a private security channel before any public test credential or pilot account is offered.

## Report contents

Include only the minimum necessary information:

- affected component and environment;
- version, commit, or deployment;
- impact;
- reproducible steps using synthetic data;
- relevant logs with secrets and personal information removed;
- whether the issue was tested on VRSCTEST or local infrastructure; and
- safe remediation ideas, if known.

Never include real identity documents, face images, exact home addresses, private keys, seed phrases, WIFs, wallet files, spending keys, RPC passwords, or production evidence.

## Response process

Maintainers will:

1. acknowledge receipt through the private channel;
2. assess scope and immediate containment;
3. rotate or revoke affected credentials where necessary;
4. reproduce using synthetic data or VRSCTEST;
5. develop and validate a fix;
6. coordinate affected-user and regulatory notification where legally required;
7. publish a security advisory when disclosure is safe; and
8. preserve an internal incident record and lessons learned.

The exact service levels will be published before pilot operation.

## Security boundaries

Non-negotiable boundaries include:

- browsers do not connect directly to authenticated `verusd` RPC;
- development writes target VRSCTEST;
- mainnet writes require a separate explicit production gate;
- wallet responses require nonce, expiry, audience, network, signer, identity-state, and signature validation;
- no private key or seed material reaches the application;
- no raw evidence or private dossier is written on-chain;
- public status endpoints must resist enumeration and correlation;
- all privileged writes require authorization, idempotency, audit events, and domain-state validation; and
- every Verus write must be read back and verified.

## Disclosure safe harbour

The project intends to establish a responsible-disclosure safe-harbour policy before public pilot operation. Until it is approved, researchers must avoid privacy invasion, service disruption, social engineering, physical-session interference, accessing data beyond what is required to demonstrate the issue, and testing against mainnet or real participants without written authorization.
