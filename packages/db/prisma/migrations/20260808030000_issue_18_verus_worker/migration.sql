-- Issue #18: durable, restart-safe VRSCTEST worker state.
-- Existing specification-only synthetic rows remain nullable; repository-created jobs require all
-- operational fields and the worker fails closed if one is absent.

ALTER TABLE "verus_job"
  ADD COLUMN "vdxf_uri" TEXT,
  ADD COLUMN "target_identity" TEXT,
  ADD COLUMN "manifest_json" JSONB,
  ADD COLUMN "manifest_canonical" TEXT,
  ADD COLUMN "manifest_policy_reference" TEXT,
  ADD COLUMN "manifest_allowed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "manifest_required_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "manifest_maximum_bytes" INTEGER,
  ADD COLUMN "confirmation_requirement" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submission_ambiguous" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "last_error_class" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "readback_at" TIMESTAMPTZ(6),
  ADD COLUMN "reorg_detected_at" TIMESTAMPTZ(6);

ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_confirmation_requirement_valid"
  CHECK ("confirmation_requirement" BETWEEN 1 AND 1000);
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_manifest_limit_valid"
  CHECK ("manifest_maximum_bytes" IS NULL OR "manifest_maximum_bytes" BETWEEN 1 AND 1048576);
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_manifest_size_valid"
  CHECK (
    "manifest_canonical" IS NULL OR
    ("manifest_maximum_bytes" IS NOT NULL AND octet_length(convert_to("manifest_canonical", 'UTF8')) <= "manifest_maximum_bytes")
  );
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_verified_evidence_complete"
  CHECK (
    "state" <> 'verified' OR
    ("transaction_id" IS NOT NULL AND "block_height" IS NOT NULL AND "block_hash" IS NOT NULL
      AND "readback_digest" = "manifest_digest" AND "readback_at" IS NOT NULL)
  );
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_ambiguous_state_valid"
  CHECK (
    NOT "submission_ambiguous" OR
    "state" IN ('retryable_failed','claimed','preflight')
  );

CREATE INDEX "verus_job_target_identity_state_idx"
  ON "verus_job" ("target_identity", "state", "created_at");

CREATE OR REPLACE FUNCTION "cbc_guard_verus_job_identity"() RETURNS TRIGGER AS $$
BEGIN
  IF ROW(OLD."outbox_event_id", OLD."committee_id", OLD."network", OLD."chain_id", OLD."operation_type", OLD."subject_reference", OLD."vdxf_key", OLD."vdxf_uri", OLD."target_identity", OLD."manifest_digest", OLD."manifest_json", OLD."manifest_canonical", OLD."manifest_policy_reference", OLD."manifest_allowed_fields", OLD."manifest_required_fields", OLD."manifest_maximum_bytes", OLD."confirmation_requirement", OLD."created_at")
     IS DISTINCT FROM
     ROW(NEW."outbox_event_id", NEW."committee_id", NEW."network", NEW."chain_id", NEW."operation_type", NEW."subject_reference", NEW."vdxf_key", NEW."vdxf_uri", NEW."target_identity", NEW."manifest_digest", NEW."manifest_json", NEW."manifest_canonical", NEW."manifest_policy_reference", NEW."manifest_allowed_fields", NEW."manifest_required_fields", NEW."manifest_maximum_bytes", NEW."confirmation_requirement", NEW."created_at") THEN
    RAISE EXCEPTION 'Verus job identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "cbc_guard_verus_job_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Verus job version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" IN ('pending','retryable_failed','reorg_pending') AND NEW."state" = 'claimed') OR
    (OLD."state" = 'claimed' AND NEW."state" = 'preflight') OR
    (OLD."state" = 'preflight' AND NEW."state" IN ('submitted','retryable_failed','terminal_failed')) OR
    (OLD."state" = 'submitted' AND NEW."state" IN ('confirming','retryable_failed','terminal_failed')) OR
    (OLD."state" = 'confirming' AND NEW."state" IN ('readback','retryable_failed','terminal_failed','reorg_pending')) OR
    (OLD."state" = 'readback' AND NEW."state" IN ('verified','retryable_failed','terminal_failed','reorg_pending')) OR
    (OLD."state" IN ('retryable_failed','reorg_pending') AND NEW."state" = 'terminal_failed')
  ) THEN
    RAISE EXCEPTION 'invalid Verus job transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "cbc_guard_anchor_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'anchor version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" IN ('pending','retryable_failed','reorg_pending') AND NEW."state" IN ('submitted','retryable_failed','terminal_failed')) OR
    (OLD."state" = 'submitted' AND NEW."state" IN ('confirming','retryable_failed','terminal_failed')) OR
    (OLD."state" = 'confirming' AND NEW."state" IN ('readback','retryable_failed','terminal_failed','reorg_pending')) OR
    (OLD."state" = 'readback' AND NEW."state" IN ('verified','retryable_failed','terminal_failed','reorg_pending')) OR
    (OLD."state" = 'retryable_failed' AND NEW."state" = 'terminal_failed')
  ) THEN
    RAISE EXCEPTION 'invalid anchor transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
