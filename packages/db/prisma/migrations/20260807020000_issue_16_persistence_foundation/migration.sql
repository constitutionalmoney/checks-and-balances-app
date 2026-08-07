-- CreateEnum
CREATE TYPE "committee_state" AS ENUM ('proposed', 'forming', 'policy_review', 'testnet_provisioning', 'testnet_ready', 'pilot_review', 'pilot_approved', 'active', 'suspended', 'retired');

CREATE TYPE "policy_version_state" AS ENUM ('draft', 'approved', 'retired');
CREATE TYPE "idempotency_state" AS ENUM ('started', 'completed', 'rejected', 'failed');
CREATE TYPE "audit_result" AS ENUM ('succeeded', 'rejected', 'failed');
CREATE TYPE "outbox_state" AS ENUM ('pending', 'claimed', 'succeeded', 'retryable_failed', 'terminal_failed', 'dead_letter');
CREATE TYPE "verus_network" AS ENUM ('VRSCTEST');
CREATE TYPE "verus_job_state" AS ENUM ('pending', 'claimed', 'preflight', 'submitted', 'confirming', 'readback', 'verified', 'retryable_failed', 'terminal_failed', 'reorg_pending');

-- CreateTable
CREATE TABLE "jurisdiction" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "boundary_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jurisdiction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "committee" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "state" "committee_state" NOT NULL DEFAULT 'proposed',
    "jurisdiction_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "committee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "committee_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "participant_account" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "participant_account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "participant_account_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "policy_document" (
    "id" UUID NOT NULL,
    "policy_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "policy_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_version" (
    "id" UUID NOT NULL,
    "policy_document_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "state" "policy_version_state" NOT NULL DEFAULT 'draft',
    "content_digest" TEXT NOT NULL,
    "content_reference" TEXT,
    "effective_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "policy_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_version_time_order" CHECK ("retired_at" IS NULL OR "effective_at" IS NOT NULL AND "retired_at" >= "effective_at")
);

CREATE TABLE "consent_receipt" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "committee_id" UUID,
    "policy_version_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_receipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consent_receipt_withdrawal_order" CHECK ("withdrawn_at" IS NULL OR "withdrawn_at" >= "acknowledged_at")
);

CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "request_digest" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_reference" TEXT NOT NULL,
    "committee_id" UUID,
    "state" "idempotency_state" NOT NULL DEFAULT 'started',
    "result_digest" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_completion_consistent" CHECK (
        ("state" = 'started' AND "completed_at" IS NULL) OR
        ("state" <> 'started' AND "completed_at" IS NOT NULL)
    )
);

CREATE TABLE "audit_chain_head" (
    "chain_key" TEXT NOT NULL,
    "event_id" UUID,
    "event_hash" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("chain_key")
);

CREATE TABLE "audit_event" (
    "sequence" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "chain_key" TEXT NOT NULL,
    "previous_hash" TEXT,
    "event_hash" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_reference" TEXT NOT NULL,
    "committee_id" UUID,
    "command" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_reference" TEXT NOT NULL,
    "prior_state" TEXT,
    "new_state" TEXT,
    "policy_version" TEXT,
    "software_version" TEXT NOT NULL,
    "reason_category" TEXT,
    "authentication_strength" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "idempotency_key_hash" TEXT,
    "result" "audit_result" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("sequence")
);

CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "committee_id" UUID,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_reference" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "payload_reference" TEXT NOT NULL,
    "payload_digest" TEXT NOT NULL,
    "idempotency_key_hash" TEXT NOT NULL,
    "state" "outbox_state" NOT NULL DEFAULT 'pending',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_class" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
    CONSTRAINT "outbox_lease_consistent" CHECK (
        ("state" = 'claimed' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL) OR
        ("state" <> 'claimed' AND "lease_owner" IS NULL AND "lease_expires_at" IS NULL)
    ),
    CONSTRAINT "outbox_completion_consistent" CHECK (
        ("state" IN ('succeeded', 'terminal_failed', 'dead_letter') AND "completed_at" IS NOT NULL) OR
        ("state" NOT IN ('succeeded', 'terminal_failed', 'dead_letter') AND "completed_at" IS NULL)
    )
);

CREATE TABLE "outbox_attempt" (
    "id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "worker" TEXT NOT NULL,
    "result" "audit_result" NOT NULL,
    "error_class" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "outbox_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_attempt_positive" CHECK ("attempt" > 0),
    CONSTRAINT "outbox_attempt_time_order" CHECK ("finished_at" >= "started_at")
);

CREATE TABLE "verus_job" (
    "id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "committee_id" UUID,
    "network" "verus_network" NOT NULL DEFAULT 'VRSCTEST',
    "chain_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "subject_reference" TEXT NOT NULL,
    "vdxf_key" TEXT NOT NULL DEFAULT '',
    "manifest_digest" TEXT NOT NULL,
    "state" "verus_job_state" NOT NULL DEFAULT 'pending',
    "transaction_id" TEXT,
    "block_height" BIGINT,
    "block_hash" TEXT,
    "readback_digest" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "verus_job_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verus_job_vrsctest_chain" CHECK ("chain_id" = 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'),
    CONSTRAINT "verus_job_block_height_nonnegative" CHECK ("block_height" IS NULL OR "block_height" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "jurisdiction_external_reference_key" ON "jurisdiction"("external_reference");
CREATE UNIQUE INDEX "committee_external_reference_key" ON "committee"("external_reference");
CREATE UNIQUE INDEX "committee_slug_key" ON "committee"("slug");
CREATE INDEX "committee_jurisdiction_id_state_idx" ON "committee"("jurisdiction_id", "state");
CREATE UNIQUE INDEX "participant_account_external_reference_key" ON "participant_account"("external_reference");
CREATE UNIQUE INDEX "policy_document_policy_key_key" ON "policy_document"("policy_key");
CREATE INDEX "policy_version_state_effective_at_idx" ON "policy_version"("state", "effective_at");
CREATE UNIQUE INDEX "policy_version_policy_document_id_version_key" ON "policy_version"("policy_document_id", "version");
CREATE INDEX "consent_receipt_committee_id_acknowledged_at_idx" ON "consent_receipt"("committee_id", "acknowledged_at");
CREATE UNIQUE INDEX "consent_receipt_participant_id_policy_version_id_purpose_key" ON "consent_receipt"("participant_id", "policy_version_id", "purpose");
CREATE INDEX "idempotency_record_state_expires_at_idx" ON "idempotency_record"("state", "expires_at");
CREATE UNIQUE INDEX "idempotency_record_scope_key_hash_key" ON "idempotency_record"("scope", "key_hash");
CREATE UNIQUE INDEX "audit_event_id_key" ON "audit_event"("id");
CREATE UNIQUE INDEX "audit_event_event_hash_key" ON "audit_event"("event_hash");
CREATE INDEX "audit_event_chain_key_sequence_idx" ON "audit_event"("chain_key", "sequence");
CREATE INDEX "audit_event_committee_id_occurred_at_idx" ON "audit_event"("committee_id", "occurred_at");
CREATE INDEX "audit_event_correlation_id_idx" ON "audit_event"("correlation_id");
CREATE UNIQUE INDEX "outbox_event_idempotency_key_hash_key" ON "outbox_event"("idempotency_key_hash");
CREATE INDEX "outbox_event_state_available_at_idx" ON "outbox_event"("state", "available_at");
CREATE INDEX "outbox_event_lease_expires_at_idx" ON "outbox_event"("lease_expires_at");
CREATE INDEX "outbox_event_committee_id_created_at_idx" ON "outbox_event"("committee_id", "created_at");
CREATE UNIQUE INDEX "outbox_attempt_outbox_event_id_attempt_key" ON "outbox_attempt"("outbox_event_id", "attempt");
CREATE UNIQUE INDEX "verus_job_outbox_event_id_key" ON "verus_job"("outbox_event_id");
CREATE INDEX "verus_job_state_created_at_idx" ON "verus_job"("state", "created_at");
CREATE INDEX "verus_job_committee_id_created_at_idx" ON "verus_job"("committee_id", "created_at");
CREATE UNIQUE INDEX "verus_job_deterministic_identity_key" ON "verus_job"("network", "operation_type", "subject_reference", "vdxf_key", "manifest_digest");

-- AddForeignKey
ALTER TABLE "committee" ADD CONSTRAINT "committee_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_policy_document_id_fkey" FOREIGN KEY ("policy_document_id") REFERENCES "policy_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_receipt_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_receipt_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_receipt_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_attempt" ADD CONSTRAINT "outbox_attempt_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce a serialized hash chain and append-only audit/attempt rows.
CREATE FUNCTION "cbc_enforce_audit_chain"() RETURNS TRIGGER AS $$
DECLARE
    current_hash TEXT;
BEGIN
    INSERT INTO "audit_chain_head" ("chain_key", "event_id", "event_hash")
    VALUES (NEW."chain_key", NULL, NULL)
    ON CONFLICT ("chain_key") DO NOTHING;

    SELECT "event_hash" INTO current_hash
    FROM "audit_chain_head"
    WHERE "chain_key" = NEW."chain_key"
    FOR UPDATE;

    IF NEW."previous_hash" IS DISTINCT FROM current_hash THEN
        RAISE EXCEPTION 'audit chain mismatch for %', NEW."chain_key" USING ERRCODE = '23514';
    END IF;

    UPDATE "audit_chain_head"
    SET "event_id" = NEW."id", "event_hash" = NEW."event_hash", "updated_at" = CURRENT_TIMESTAMP
    WHERE "chain_key" = NEW."chain_key";

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER "audit_event_chain_guard"
BEFORE INSERT ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION "cbc_enforce_audit_chain"();

REVOKE ALL ON FUNCTION "cbc_enforce_audit_chain"() FROM PUBLIC;

CREATE FUNCTION "cbc_reject_append_only_mutation"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_event_append_only"
BEFORE UPDATE OR DELETE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();

CREATE TRIGGER "outbox_attempt_append_only"
BEFORE UPDATE OR DELETE ON "outbox_attempt"
FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();

-- Preserve the identity of policy, idempotency, outbox, and Verus work after creation.
CREATE FUNCTION "cbc_guard_policy_version_identity"() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD."policy_document_id", OLD."version", OLD."content_digest", OLD."content_reference", OLD."created_at")
       IS DISTINCT FROM
       ROW(NEW."policy_document_id", NEW."version", NEW."content_digest", NEW."content_reference", NEW."created_at") THEN
        RAISE EXCEPTION 'policy version identity is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "policy_version_identity_guard"
BEFORE UPDATE ON "policy_version"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_policy_version_identity"();

CREATE FUNCTION "cbc_guard_idempotency_identity"() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD."scope", OLD."key_hash", OLD."request_digest", OLD."command", OLD."actor_type", OLD."actor_reference", OLD."committee_id", OLD."started_at")
       IS DISTINCT FROM
       ROW(NEW."scope", NEW."key_hash", NEW."request_digest", NEW."command", NEW."actor_type", NEW."actor_reference", NEW."committee_id", NEW."started_at") THEN
        RAISE EXCEPTION 'idempotency request identity is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "idempotency_identity_guard"
BEFORE UPDATE ON "idempotency_record"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_idempotency_identity"();

CREATE FUNCTION "cbc_guard_outbox_identity"() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD."committee_id", OLD."event_type", OLD."aggregate_type", OLD."aggregate_reference", OLD."schema_version", OLD."payload_reference", OLD."payload_digest", OLD."idempotency_key_hash", OLD."created_at")
       IS DISTINCT FROM
       ROW(NEW."committee_id", NEW."event_type", NEW."aggregate_type", NEW."aggregate_reference", NEW."schema_version", NEW."payload_reference", NEW."payload_digest", NEW."idempotency_key_hash", NEW."created_at") THEN
        RAISE EXCEPTION 'outbox event identity is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outbox_identity_guard"
BEFORE UPDATE ON "outbox_event"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_outbox_identity"();

CREATE FUNCTION "cbc_guard_verus_job_identity"() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD."outbox_event_id", OLD."committee_id", OLD."network", OLD."chain_id", OLD."operation_type", OLD."subject_reference", OLD."vdxf_key", OLD."manifest_digest", OLD."created_at")
       IS DISTINCT FROM
       ROW(NEW."outbox_event_id", NEW."committee_id", NEW."network", NEW."chain_id", NEW."operation_type", NEW."subject_reference", NEW."vdxf_key", NEW."manifest_digest", NEW."created_at") THEN
        RAISE EXCEPTION 'Verus job identity is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "verus_job_identity_guard"
BEFORE UPDATE ON "verus_job"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_verus_job_identity"();

REVOKE UPDATE, DELETE ON "audit_event", "outbox_attempt" FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON "audit_chain_head" FROM PUBLIC;
