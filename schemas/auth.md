---
service: Checks & Balances Protocol
organization: Checks and Balances Committee Ltd.
status: pilot_preparation
protocol_version: cbc.auth.v0.1
environment: vrsctest
production_enabled: false
human_readable_home: https://checksandbalances.services/
repository: https://github.com/constitutionalmoney/checks-and-balances-app
participant_app: https://app.testnet.checksandbalances.services/
committee_console: https://committee.testnet.checksandbalances.services/
verifier: https://verify.testnet.checksandbalances.services/
api_base: https://api.testnet.checksandbalances.services/api/v1
developer_docs: https://docs.testnet.checksandbalances.services/
last_updated: 2026-08-05

identity:
  provider: verusid
  network: VRSCTEST
  optional_for_baseline_account: true
  application_identity_address: PENDING_VRSCTEST_PROVISIONING
  authentication_request_version: cbc.verus.auth.v1
  identity_update_enabled: false

flows:
  - id: create_participant_account
    status: planned
    human_confirmation_required: true
    verusid_required: false
  - id: link_verus_identity
    status: planned
    human_confirmation_required: true
    verusid_required: true
  - id: request_verification
    status: planned
    human_confirmation_required: true
    in_person_completion_required: true
  - id: check_attestation_status
    status: planned
    human_confirmation_required: false
    participant_presentation_or_authorization_required: true
  - id: optional_public_proof_update
    status: planned_disabled
    human_confirmation_required: true
    wallet_approval_required: true
  - id: propose_committee
    status: planned
    human_confirmation_required: true
  - id: committee_member_join
    status: planned
    human_confirmation_required: true
    steward_or_committee_approval_required: true

scopes:
  - cbc.account.verusid.link
  - cbc.human.attestation.request
  - cbc.human.attestation.read
  - cbc.human.attestation.present
  - cbc.human.attestation.appeal
  - cbc.committee.member.join

claims:
  baseline:
    - human_presence_reviewed_in_person
    - approved_evidence_path_matched
    - current_expiring_attestation
  not_proven:
    - legal_residence
    - citizenship
    - voting_eligibility
    - uniqueness
    - truth_of_statement
    - community_consensus
    - political_intent

privacy:
  no_document_upload_on_public_site: true
  raw_evidence_on_chain: false
  exact_address_on_chain: false
  public_participant_registry: false
  relying_parties_receive_private_evidence: false
  arbitrary_identity_status_search: false

attestation:
  maximum_validity_days: 45
  renewal_method: unfinished
  status_values:
    - active
    - expired
    - revoked
    - unknown
    - unavailable

agents:
  may:
    - read_public_documentation
    - help_find_published_sessions
    - prepare_user_reviewable_drafts
  may_not:
    - impersonate_participant
    - submit_in_person_attendance
    - approve_attestation
    - sign_as_committee_member
    - express_civic_intent_for_human

security:
  public_verusd_rpc: false
  mainnet_writes_enabled: false
  vulnerability_reporting: PENDING_PRIVATE_CONTACT
---

# Checks & Balances Protocol `auth.md`

This is a **draft discovery template**, not an operational endpoint or offer of a verification session.

## Status

The project is in pilot preparation. The public committee directory, participant account system, APIs, schemas, wallet flows, test credentials, relying-party integrations, and verification sessions are not represented as live.

## Human confirmation boundary

Software and agents may explain the protocol, locate published information, and help prepare drafts. A human must personally control account consent, wallet approval, in-person attendance, committee review, committee authorization, appeal submissions, and civic intent.

## Committee-specific publication

An approved committee may publish a derived document at:

```text
https://committees.checksandbalances.services/{committee-slug}/.well-known/auth.md
```

or, if later approved:

```text
https://{committee-slug}.committees.checksandbalances.services/.well-known/auth.md
```

The committee document must include its immutable VerusID i-address, recognition status, jurisdiction scope, approved policy versions, session status, public contacts, and suspension/revocation information. A self-published file does not by itself create official committee recognition.
