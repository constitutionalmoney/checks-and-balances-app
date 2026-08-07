\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "jurisdiction" (
  "id", "external_reference", "kind", "display_name", "boundary_reference"
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'jurisdiction_synthetic_001',
  'synthetic_test_area',
  'Synthetic Test Jurisdiction',
  'synthetic-boundary-v1'
);

INSERT INTO "committee" (
  "id", "external_reference", "slug", "display_name", "jurisdiction_id", "updated_at"
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  'committee_synthetic_001',
  'synthetic-committee',
  'Synthetic Committee',
  '00000000-0000-4000-8000-000000000001',
  CURRENT_TIMESTAMP
);

INSERT INTO "participant_account" (
  "id", "external_reference", "updated_at"
) VALUES (
  '00000000-0000-4000-8000-000000000003',
  'participant_synthetic_001',
  CURRENT_TIMESTAMP
);

INSERT INTO "auth_account" (
  "id", "external_reference", "trust_domain", "state", "participant_id", "updated_at"
) VALUES (
  '00000000-0000-4000-8000-000000000030',
  'auth_participant_synthetic_001',
  'participant',
  'active',
  '00000000-0000-4000-8000-000000000003',
  CURRENT_TIMESTAMP
);

INSERT INTO "policy_document" (
  "id", "policy_key", "title"
) VALUES (
  '00000000-0000-4000-8000-000000000004',
  'cbc.synthetic.persistence-smoke',
  'Synthetic persistence smoke policy'
);

INSERT INTO "policy_version" (
  "id", "policy_document_id", "version", "content_digest", "content_reference"
) VALUES (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000004',
  'draft-smoke-v1',
  'sha256:synthetic-policy-digest',
  'repo:synthetic-policy-reference'
);

INSERT INTO "consent_receipt" (
  "id", "external_reference", "participant_id", "auth_account_id", "committee_id",
  "policy_version_id", "purpose", "presentation_reference", "presentation_digest", "action",
  "acknowledged_at", "presented_at", "acted_at"
) VALUES (
  '00000000-0000-4000-8000-000000000006',
  'consent_synthetic_001',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000005',
  'synthetic_persistence_test',
  'presentation_synthetic_001',
  'sha256:synthetic-presentation-digest',
  'accepted',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "idempotency_record" (
  "id", "scope", "key_hash", "request_digest", "command", "actor_type",
  "actor_reference", "committee_id"
) VALUES (
  '00000000-0000-4000-8000-000000000007',
  'synthetic.committee',
  'sha256:synthetic-key',
  'sha256:synthetic-request',
  'createSyntheticRecord',
  'test_harness',
  'actor_synthetic_001',
  '00000000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "idempotency_record" (
      "id", "scope", "key_hash", "request_digest", "command", "actor_type", "actor_reference"
    ) VALUES (
      '00000000-0000-4000-8000-000000000008',
      'synthetic.committee',
      'sha256:synthetic-key',
      'sha256:different-request',
      'createSyntheticRecord',
      'test_harness',
      'actor_synthetic_001'
    );
    RAISE EXCEPTION 'duplicate idempotency key was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END;
$$;

INSERT INTO "audit_event" (
  "id", "chain_key", "previous_hash", "event_hash", "actor_type", "actor_reference",
  "committee_id", "command", "target_type", "target_reference", "new_state",
  "software_version", "authentication_strength", "correlation_id", "idempotency_key_hash", "result"
) VALUES (
  '00000000-0000-4000-8000-000000000009',
  'committee:committee_synthetic_001',
  NULL,
  'AUTO',
  'test_harness',
  'actor_synthetic_001',
  '00000000-0000-4000-8000-000000000002',
  'createSyntheticRecord',
  'participant_account',
  'participant_synthetic_001',
  'created',
  'persistence-smoke',
  'synthetic',
  'correlation_synthetic_001',
  'sha256:synthetic-key',
  'succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "audit_event" (
      "id", "chain_key", "previous_hash", "event_hash", "actor_type", "actor_reference",
      "command", "target_type", "target_reference", "software_version",
      "authentication_strength", "correlation_id", "result"
    ) VALUES (
      '00000000-0000-4000-8000-000000000010',
      'committee:committee_synthetic_001',
      'sha256:wrong-previous-hash',
      'sha256:synthetic-audit-event-2',
      'test_harness',
      'actor_synthetic_001',
      'tamperSyntheticRecord',
      'participant_account',
      'participant_synthetic_001',
      'persistence-smoke',
      'synthetic',
      'correlation_synthetic_002',
      'rejected'
    );
    RAISE EXCEPTION 'audit chain mismatch was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE "audit_event" SET "new_state" = 'tampered' WHERE "id" = '00000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'audit event mutation was accepted';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

INSERT INTO "outbox_event" (
  "id", "committee_id", "event_type", "aggregate_type", "aggregate_reference",
  "schema_version", "payload_reference", "payload_digest", "idempotency_key_hash"
) VALUES (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000002',
  'synthetic.verus.anchor',
  'synthetic_record',
  'record_synthetic_001',
  'draft-smoke-v1',
  'opaque:synthetic-payload-001',
  'sha256:synthetic-manifest',
  'sha256:synthetic-outbox-key'
);

INSERT INTO "verus_job" (
  "id", "outbox_event_id", "committee_id", "chain_id", "operation_type",
  "subject_reference", "vdxf_key", "manifest_digest", "updated_at"
) VALUES (
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000002',
  'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
  'synthetic_anchor',
  'record_synthetic_001',
  'vdxf:synthetic-only',
  'sha256:synthetic-manifest',
  CURRENT_TIMESTAMP
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "outbox_event" (
      "id", "event_type", "aggregate_type", "aggregate_reference", "schema_version",
      "payload_reference", "payload_digest", "idempotency_key_hash"
    ) VALUES (
      '00000000-0000-4000-8000-000000000013',
      'synthetic.verus.anchor',
      'synthetic_record',
      'record_synthetic_002',
      'draft-smoke-v1',
      'opaque:synthetic-payload-002',
      'sha256:synthetic-manifest-2',
      'sha256:synthetic-outbox-key-2'
    );

    INSERT INTO "verus_job" (
      "id", "outbox_event_id", "chain_id", "operation_type", "subject_reference",
      "manifest_digest", "updated_at"
    ) VALUES (
      '00000000-0000-4000-8000-000000000014',
      '00000000-0000-4000-8000-000000000013',
      'mainnet-is-not-allowed',
      'synthetic_anchor',
      'record_synthetic_002',
      'sha256:synthetic-manifest-2',
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'wrong-chain Verus job was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE "verus_job"
    SET "manifest_digest" = 'sha256:tampered-manifest'
    WHERE "id" = '00000000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'Verus job identity mutation was accepted';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

INSERT INTO "outbox_attempt" (
  "id", "outbox_event_id", "attempt", "worker", "result", "started_at", "finished_at"
) VALUES (
  '00000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000011',
  1,
  'synthetic-worker',
  'succeeded',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

DO $$
BEGIN
  BEGIN
    UPDATE "outbox_attempt" SET "worker" = 'tampered-worker'
    WHERE "id" = '00000000-0000-4000-8000-000000000015';
    RAISE EXCEPTION 'outbox attempt mutation was accepted';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

SELECT 'persistence foundation smoke passed' AS result;

ROLLBACK;
