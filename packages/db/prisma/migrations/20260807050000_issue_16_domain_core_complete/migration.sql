-- CreateEnum
CREATE TYPE "membership_state" AS ENUM ('proposed', 'active', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "readiness_state" AS ENUM ('pending', 'in_review', 'satisfied', 'blocked', 'not_applicable');

-- CreateEnum
CREATE TYPE "verification_state" AS ENUM ('requested', 'scheduled', 'checked_in', 'under_review', 'approved', 'rejected', 'needs_more_information', 'withdrawn', 'issuance_pending', 'issued', 'active', 'expired', 'revoked', 'superseded', 'appealed', 'appeal_upheld', 'appeal_denied', 'appeal_remanded');

-- CreateEnum
CREATE TYPE "session_state" AS ENUM ('draft', 'scheduled', 'open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "appointment_state" AS ENUM ('reserved', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "attendance_state" AS ENUM ('expected', 'checked_in', 'present', 'departed', 'absent');

-- CreateEnum
CREATE TYPE "evidence_review_result" AS ENUM ('matched', 'not_matched', 'needs_more_information');

-- CreateEnum
CREATE TYPE "evidence_retention" AS ENUM ('not_retained');

-- CreateEnum
CREATE TYPE "review_decision_state" AS ENUM ('approved', 'rejected', 'needs_more_information');

-- CreateEnum
CREATE TYPE "attestation_state" AS ENUM ('issued', 'active', 'expired', 'revoked', 'superseded');

-- CreateEnum
CREATE TYPE "renewal_cycle_state" AS ENUM ('draft', 'snapshot_committed', 'selection_pending', 'selection_ready', 'notices_pending', 'in_progress', 'reporting', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "wallet_challenge_state" AS ENUM ('created', 'presented', 'response_received', 'consumed', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "consent_state" AS ENUM ('pending', 'acknowledged', 'withdrawn');

-- CreateEnum
CREATE TYPE "appeal_state" AS ENUM ('opened', 'assigned', 'under_review', 'upheld', 'denied', 'remanded', 'withdrawn');

-- CreateEnum
CREATE TYPE "privacy_request_kind" AS ENUM ('access', 'correction', 'deletion', 'restriction');

-- CreateEnum
CREATE TYPE "privacy_request_state" AS ENUM ('requested', 'identity_confirmed', 'processing', 'completed', 'denied', 'withdrawn');

-- CreateEnum
CREATE TYPE "notification_state" AS ENUM ('pending', 'claimed', 'delivered', 'retryable_failed', 'terminal_failed', 'dead_letter', 'cancelled');

-- CreateEnum
CREATE TYPE "relying_party_client_state" AS ENUM ('proposed', 'security_review', 'approved', 'active', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "contact_channel" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "credential_state" AS ENUM ('active', 'disabled', 'revoked');

-- CreateEnum
CREATE TYPE "identity_link_state" AS ENUM ('active', 'revalidation_required', 'unlinked');

-- CreateEnum
CREATE TYPE "protocol_release_state" AS ENUM ('draft', 'testnet', 'retired');

-- CreateEnum
CREATE TYPE "capability_state" AS ENUM ('disabled', 'specification', 'vrsctest_demo');

-- CreateEnum
CREATE TYPE "anchor_state" AS ENUM ('pending', 'submitted', 'confirming', 'readback', 'verified', 'retryable_failed', 'terminal_failed', 'reorg_pending');

-- AlterTable
ALTER TABLE "consent_receipt" ADD COLUMN     "state" "consent_state" NOT NULL DEFAULT 'acknowledged',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "consent_receipt" ALTER COLUMN "acknowledged_at" DROP NOT NULL;
ALTER TABLE "consent_receipt" ADD COLUMN "external_reference" TEXT;
UPDATE "consent_receipt" SET "external_reference" = 'consent_' || replace("id"::text, '-', '') WHERE "external_reference" IS NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "external_reference" SET NOT NULL;
CREATE UNIQUE INDEX "consent_receipt_external_reference_key" ON "consent_receipt"("external_reference");

-- AlterTable
ALTER TABLE "outbox_event" ADD COLUMN     "lease_acquired_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "idempotency_record"
  ADD COLUMN "result_reference" TEXT,
  ADD COLUMN "result_state" TEXT,
  ADD COLUMN "result_version" INTEGER;

-- AlterTable
ALTER TABLE "verus_job" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "committee_member" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "participant_id" UUID,
    "actor_reference" TEXT NOT NULL,
    "state" "membership_state" NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "committee_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_role" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "membership_state" NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_member_role" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "state" "membership_state" NOT NULL DEFAULT 'proposed',
    "granted_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "committee_member_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_declaration" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_reference" TEXT NOT NULL,
    "reason_category" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "conflict_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_checklist_item" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "readiness_state" NOT NULL DEFAULT 'pending',
    "reviewer_reference" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "readiness_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_preference" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "channel" "contact_channel" NOT NULL,
    "destination_reference" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey_metadata" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "credential_reference" TEXT NOT NULL,
    "relying_party_id" TEXT NOT NULL,
    "state" "credential_state" NOT NULL DEFAULT 'active',
    "sign_count" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "passkey_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verus_identity_link" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "participant_id" UUID NOT NULL,
    "identity_address" TEXT NOT NULL,
    "network" "verus_network" NOT NULL DEFAULT 'VRSCTEST',
    "proof_digest" TEXT NOT NULL,
    "state" "identity_link_state" NOT NULL DEFAULT 'active',
    "linked_at" TIMESTAMPTZ(6) NOT NULL,
    "revalidated_at" TIMESTAMPTZ(6),
    "unlinked_at" TIMESTAMPTZ(6),

    CONSTRAINT "verus_identity_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_challenge" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "participant_id" UUID NOT NULL,
    "state" "wallet_challenge_state" NOT NULL DEFAULT 'created',
    "network" "verus_network" NOT NULL DEFAULT 'VRSCTEST',
    "nonce_hash" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "request_digest" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_request" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "verification_state" NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_session" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "session_state" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "location_reference" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "state" "appointment_state" NOT NULL DEFAULT 'reserved',
    "appointment_code_hash" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_attendance" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "state" "attendance_state" NOT NULL DEFAULT 'expected',
    "checked_in_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_review_record" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "reviewer_member_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "evidence_path_category" TEXT NOT NULL,
    "result" "evidence_review_result" NOT NULL,
    "retention" "evidence_retention" NOT NULL DEFAULT 'not_retained',
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_review_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decision" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "reviewer_member_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "review_decision_state" NOT NULL,
    "reason_category" TEXT NOT NULL,
    "authorization_decision_digest" TEXT NOT NULL,
    "conflict_checked_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "attestation_state" NOT NULL DEFAULT 'issued',
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "issuance_complete" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation_status" (
    "attestation_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "state" "attestation_state" NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "attestation_status_pkey" PRIMARY KEY ("attestation_id")
);

-- CreateTable
CREATE TABLE "attestation_revocation" (
    "id" UUID NOT NULL,
    "attestation_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "reason_category" TEXT NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestation_revocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewal_cycle" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "renewal_cycle_state" NOT NULL DEFAULT 'draft',
    "period_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewal_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligible_snapshot" (
    "id" UUID NOT NULL,
    "renewal_cycle_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "snapshot_digest" TEXT NOT NULL,
    "eligible_count" INTEGER NOT NULL,
    "committed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "eligible_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_selection" (
    "id" UUID NOT NULL,
    "renewal_cycle_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "selected_subject_reference" TEXT NOT NULL,
    "selection_proof_digest" TEXT NOT NULL,
    "algorithm_reference" TEXT NOT NULL,
    "selected_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cycle_selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_report" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "renewal_cycle_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "report_digest" TEXT NOT NULL,
    "eligible_count" INTEGER NOT NULL,
    "selected_count" INTEGER NOT NULL,
    "renewed_count" INTEGER NOT NULL,
    "expired_count" INTEGER NOT NULL,
    "suppressed" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "cycle_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "target_reference" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "appeal_state" NOT NULL DEFAULT 'opened',
    "reason_category" TEXT NOT NULL,
    "assigned_reference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_request" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "participant_id" UUID NOT NULL,
    "committee_id" UUID,
    "target_type" TEXT NOT NULL,
    "target_reference" TEXT NOT NULL,
    "field_category" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "privacy_request_state" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "correction_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_rights_request" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "participant_id" UUID NOT NULL,
    "committee_id" UUID,
    "kind" "privacy_request_kind" NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "privacy_request_state" NOT NULL DEFAULT 'requested',
    "identity_proof_digest" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "privacy_rights_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relying_party_client" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID,
    "policy_version_id" UUID NOT NULL,
    "state" "relying_party_client_state" NOT NULL DEFAULT 'proposed',
    "scopes_reference" TEXT NOT NULL,
    "scopes_digest" TEXT NOT NULL,
    "terms_version" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relying_party_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relying_party_access_audit" (
    "sequence" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "subject_reference" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "result" "audit_result" NOT NULL,
    "policy_version" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relying_party_access_audit_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID,
    "participant_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "state" "notification_state" NOT NULL DEFAULT 'pending',
    "channel" "contact_channel" NOT NULL,
    "destination_reference" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_release" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "state" "protocol_release_state" NOT NULL DEFAULT 'draft',
    "software_version" TEXT NOT NULL,
    "policy_bundle_digest" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_at" TIMESTAMPTZ(6),

    CONSTRAINT "protocol_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_status" (
    "id" UUID NOT NULL,
    "protocol_release_id" UUID NOT NULL,
    "capability_key" TEXT NOT NULL,
    "state" "capability_state" NOT NULL DEFAULT 'disabled',
    "network" "verus_network",
    "reason_category" TEXT NOT NULL,

    CONSTRAINT "capability_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anchor_record" (
    "id" UUID NOT NULL,
    "external_reference" TEXT NOT NULL,
    "committee_id" UUID,
    "outbox_event_id" UUID NOT NULL,
    "network" "verus_network" NOT NULL DEFAULT 'VRSCTEST',
    "chain_id" TEXT NOT NULL,
    "anchor_type" TEXT NOT NULL,
    "subject_reference" TEXT NOT NULL,
    "vdxf_key" TEXT NOT NULL,
    "manifest_digest" TEXT NOT NULL,
    "state" "anchor_state" NOT NULL DEFAULT 'pending',
    "transaction_id" TEXT,
    "block_height" BIGINT,
    "block_hash" TEXT,
    "readback_digest" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "anchor_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "committee_member_external_reference_key" ON "committee_member"("external_reference");

-- CreateIndex
CREATE INDEX "committee_member_committee_id_state_idx" ON "committee_member"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "committee_member_id_committee_id_key" ON "committee_member"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "committee_member_committee_id_actor_reference_key" ON "committee_member"("committee_id", "actor_reference");

-- CreateIndex
CREATE UNIQUE INDEX "committee_role_external_reference_key" ON "committee_role"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "committee_role_id_committee_id_key" ON "committee_role"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "committee_role_committee_id_role_key_policy_version_id_key" ON "committee_role"("committee_id", "role_key", "policy_version_id");

-- CreateIndex
CREATE INDEX "committee_member_role_committee_id_state_idx" ON "committee_member_role"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "committee_member_role_member_id_role_id_key" ON "committee_member_role"("member_id", "role_id");

-- CreateIndex
CREATE INDEX "conflict_declaration_committee_id_target_reference_idx" ON "conflict_declaration"("committee_id", "target_reference");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_declaration_member_id_target_type_target_reference_key" ON "conflict_declaration"("member_id", "target_type", "target_reference");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_checklist_item_external_reference_key" ON "readiness_checklist_item"("external_reference");

-- CreateIndex
CREATE INDEX "readiness_checklist_item_committee_id_state_idx" ON "readiness_checklist_item"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_checklist_item_committee_id_item_key_policy_versi_key" ON "readiness_checklist_item"("committee_id", "item_key", "policy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_preference_participant_id_channel_destination_refer_key" ON "contact_preference"("participant_id", "channel", "destination_reference");

-- CreateIndex
CREATE UNIQUE INDEX "passkey_metadata_credential_reference_key" ON "passkey_metadata"("credential_reference");

-- CreateIndex
CREATE INDEX "passkey_metadata_participant_id_state_idx" ON "passkey_metadata"("participant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "verus_identity_link_external_reference_key" ON "verus_identity_link"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "verus_identity_link_participant_id_network_identity_address_key" ON "verus_identity_link"("participant_id", "network", "identity_address");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_challenge_external_reference_key" ON "wallet_challenge"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_challenge_nonce_hash_key" ON "wallet_challenge"("nonce_hash");

-- CreateIndex
CREATE INDEX "wallet_challenge_participant_id_state_expires_at_idx" ON "wallet_challenge"("participant_id", "state", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_request_external_reference_key" ON "verification_request"("external_reference");

-- CreateIndex
CREATE INDEX "verification_request_committee_id_state_idx" ON "verification_request"("committee_id", "state");

-- CreateIndex
CREATE INDEX "verification_request_participant_id_requested_at_idx" ON "verification_request"("participant_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_request_id_committee_id_key" ON "verification_request"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_session_external_reference_key" ON "verification_session"("external_reference");

-- CreateIndex
CREATE INDEX "verification_session_committee_id_starts_at_idx" ON "verification_session"("committee_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_session_id_committee_id_key" ON "verification_session"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_external_reference_key" ON "appointment"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_appointment_code_hash_key" ON "appointment"("appointment_code_hash");

-- CreateIndex
CREATE INDEX "appointment_committee_id_session_id_state_idx" ON "appointment"("committee_id", "session_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_id_committee_id_key" ON "appointment"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_session_id_request_id_key" ON "appointment"("session_id", "request_id");

-- CreateIndex
CREATE INDEX "session_attendance_committee_id_state_idx" ON "session_attendance"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "session_attendance_session_id_request_id_key" ON "session_attendance"("session_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_review_record_external_reference_key" ON "evidence_review_record"("external_reference");

-- CreateIndex
CREATE INDEX "evidence_review_record_committee_id_reviewed_at_idx" ON "evidence_review_record"("committee_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_review_record_request_id_reviewer_member_id_key" ON "evidence_review_record"("request_id", "reviewer_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_decision_external_reference_key" ON "review_decision"("external_reference");

-- CreateIndex
CREATE INDEX "review_decision_committee_id_decided_at_idx" ON "review_decision"("committee_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_decision_request_id_reviewer_member_id_key" ON "review_decision"("request_id", "reviewer_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_external_reference_key" ON "attestation"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_supersedes_id_key" ON "attestation"("supersedes_id");

-- CreateIndex
CREATE INDEX "attestation_participant_id_expires_at_idx" ON "attestation"("participant_id", "expires_at");

-- CreateIndex
CREATE INDEX "attestation_committee_id_state_idx" ON "attestation"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_id_committee_id_key" ON "attestation"("id", "committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_committee_id_participant_id_version_key" ON "attestation"("committee_id", "participant_id", "version");

-- CreateIndex
CREATE INDEX "attestation_status_committee_id_state_idx" ON "attestation_status"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_revocation_attestation_id_key" ON "attestation_revocation"("attestation_id");

-- CreateIndex
CREATE INDEX "attestation_revocation_committee_id_effective_at_idx" ON "attestation_revocation"("committee_id", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "renewal_cycle_external_reference_key" ON "renewal_cycle"("external_reference");

-- CreateIndex
CREATE INDEX "renewal_cycle_committee_id_period_starts_at_idx" ON "renewal_cycle"("committee_id", "period_starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "renewal_cycle_id_committee_id_key" ON "renewal_cycle"("id", "committee_id");

-- CreateIndex
CREATE INDEX "eligible_snapshot_committee_id_committed_at_idx" ON "eligible_snapshot"("committee_id", "committed_at");

-- CreateIndex
CREATE UNIQUE INDEX "eligible_snapshot_renewal_cycle_id_snapshot_digest_key" ON "eligible_snapshot"("renewal_cycle_id", "snapshot_digest");

-- CreateIndex
CREATE INDEX "cycle_selection_committee_id_selected_at_idx" ON "cycle_selection"("committee_id", "selected_at");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_selection_renewal_cycle_id_selected_subject_reference_key" ON "cycle_selection"("renewal_cycle_id", "selected_subject_reference");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_report_external_reference_key" ON "cycle_report"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_report_renewal_cycle_id_key" ON "cycle_report"("renewal_cycle_id");

-- CreateIndex
CREATE INDEX "cycle_report_committee_id_published_at_idx" ON "cycle_report"("committee_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "appeal_external_reference_key" ON "appeal"("external_reference");

-- CreateIndex
CREATE INDEX "appeal_committee_id_state_idx" ON "appeal"("committee_id", "state");

-- CreateIndex
CREATE INDEX "appeal_participant_id_opened_at_idx" ON "appeal"("participant_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "correction_request_external_reference_key" ON "correction_request"("external_reference");

-- CreateIndex
CREATE INDEX "correction_request_committee_id_state_idx" ON "correction_request"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_rights_request_external_reference_key" ON "privacy_rights_request"("external_reference");

-- CreateIndex
CREATE INDEX "privacy_rights_request_committee_id_state_idx" ON "privacy_rights_request"("committee_id", "state");

-- CreateIndex
CREATE INDEX "privacy_rights_request_participant_id_requested_at_idx" ON "privacy_rights_request"("participant_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "relying_party_client_external_reference_key" ON "relying_party_client"("external_reference");

-- CreateIndex
CREATE INDEX "relying_party_client_committee_id_state_idx" ON "relying_party_client"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "relying_party_access_audit_id_key" ON "relying_party_access_audit"("id");

-- CreateIndex
CREATE INDEX "relying_party_access_audit_client_id_occurred_at_idx" ON "relying_party_access_audit"("client_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_external_reference_key" ON "notification"("external_reference");

-- CreateIndex
CREATE INDEX "notification_state_available_at_idx" ON "notification"("state", "available_at");

-- CreateIndex
CREATE INDEX "notification_committee_id_created_at_idx" ON "notification"("committee_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_release_external_reference_key" ON "protocol_release"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_release_version_key" ON "protocol_release"("version");

-- CreateIndex
CREATE UNIQUE INDEX "capability_status_protocol_release_id_capability_key_key" ON "capability_status"("protocol_release_id", "capability_key");

-- CreateIndex
CREATE UNIQUE INDEX "anchor_record_external_reference_key" ON "anchor_record"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "anchor_record_outbox_event_id_key" ON "anchor_record"("outbox_event_id");

-- CreateIndex
CREATE INDEX "anchor_record_committee_id_state_idx" ON "anchor_record"("committee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "anchor_record_network_anchor_type_subject_reference_vdxf_ke_key" ON "anchor_record"("network", "anchor_type", "subject_reference", "vdxf_key", "manifest_digest");

-- AddForeignKey
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_role" ADD CONSTRAINT "committee_role_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_member_role" ADD CONSTRAINT "committee_member_role_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "committee_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_member_role" ADD CONSTRAINT "committee_member_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "committee_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "committee_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_checklist_item" ADD CONSTRAINT "readiness_checklist_item_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_preference" ADD CONSTRAINT "contact_preference_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkey_metadata" ADD CONSTRAINT "passkey_metadata_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verus_identity_link" ADD CONSTRAINT "verus_identity_link_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_challenge" ADD CONSTRAINT "wallet_challenge_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_session" ADD CONSTRAINT "verification_session_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_review_record" ADD CONSTRAINT "evidence_review_record_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_status" ADD CONSTRAINT "attestation_status_attestation_id_fkey" FOREIGN KEY ("attestation_id") REFERENCES "attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_revocation" ADD CONSTRAINT "attestation_revocation_attestation_id_fkey" FOREIGN KEY ("attestation_id") REFERENCES "attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_cycle" ADD CONSTRAINT "renewal_cycle_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligible_snapshot" ADD CONSTRAINT "eligible_snapshot_renewal_cycle_id_fkey" FOREIGN KEY ("renewal_cycle_id") REFERENCES "renewal_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_selection" ADD CONSTRAINT "cycle_selection_renewal_cycle_id_fkey" FOREIGN KEY ("renewal_cycle_id") REFERENCES "renewal_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_report" ADD CONSTRAINT "cycle_report_renewal_cycle_id_fkey" FOREIGN KEY ("renewal_cycle_id") REFERENCES "renewal_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_rights_request" ADD CONSTRAINT "privacy_rights_request_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_rights_request" ADD CONSTRAINT "privacy_rights_request_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relying_party_client" ADD CONSTRAINT "relying_party_client_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relying_party_access_audit" ADD CONSTRAINT "relying_party_access_audit_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "relying_party_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participant_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_status" ADD CONSTRAINT "capability_status_protocol_release_id_fkey" FOREIGN KEY ("protocol_release_id") REFERENCES "protocol_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anchor_record" ADD CONSTRAINT "anchor_record_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Policy-version and committee-tenancy foreign keys that are intentionally explicit in SQL.
ALTER TABLE "committee_role" ADD CONSTRAINT "committee_role_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "readiness_checklist_item" ADD CONSTRAINT "readiness_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "verification_session" ADD CONSTRAINT "verification_session_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "evidence_review_record" ADD CONSTRAINT "evidence_review_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "attestation_revocation" ADD CONSTRAINT "attestation_revocation_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "renewal_cycle" ADD CONSTRAINT "renewal_cycle_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "privacy_rights_request" ADD CONSTRAINT "privacy_request_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "relying_party_client" ADD CONSTRAINT "relying_party_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;
ALTER TABLE "notification" ADD CONSTRAINT "notification_policy_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "verification_request_tenant_participant_key" ON "verification_request"("id", "committee_id", "participant_id");
CREATE UNIQUE INDEX "verification_session_tenant_key" ON "verification_session"("id", "committee_id");
CREATE UNIQUE INDEX "renewal_cycle_tenant_key" ON "renewal_cycle"("id", "committee_id");
CREATE UNIQUE INDEX "outbox_event_tenant_key" ON "outbox_event"("id", "committee_id");

ALTER TABLE "committee_member_role" DROP CONSTRAINT "committee_member_role_member_id_fkey";
ALTER TABLE "committee_member_role" DROP CONSTRAINT "committee_member_role_role_id_fkey";
ALTER TABLE "committee_member_role" ADD CONSTRAINT "committee_member_role_member_tenant_fkey" FOREIGN KEY ("member_id", "committee_id") REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "committee_member_role" ADD CONSTRAINT "committee_member_role_role_tenant_fkey" FOREIGN KEY ("role_id", "committee_id") REFERENCES "committee_role"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "conflict_declaration" DROP CONSTRAINT "conflict_declaration_member_id_fkey";
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_member_tenant_fkey" FOREIGN KEY ("member_id", "committee_id") REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT;

ALTER TABLE "appointment" ADD CONSTRAINT "appointment_session_tenant_fkey" FOREIGN KEY ("session_id", "committee_id") REFERENCES "verification_session"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_request_tenant_fkey" FOREIGN KEY ("request_id", "committee_id", "participant_id") REFERENCES "verification_request"("id", "committee_id", "participant_id") ON DELETE RESTRICT;
ALTER TABLE "session_attendance" ADD CONSTRAINT "attendance_session_tenant_fkey" FOREIGN KEY ("session_id", "committee_id") REFERENCES "verification_session"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "session_attendance" ADD CONSTRAINT "attendance_request_tenant_fkey" FOREIGN KEY ("request_id", "committee_id", "participant_id") REFERENCES "verification_request"("id", "committee_id", "participant_id") ON DELETE RESTRICT;
ALTER TABLE "evidence_review_record" ADD CONSTRAINT "evidence_review_request_tenant_fkey" FOREIGN KEY ("request_id", "committee_id") REFERENCES "verification_request"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "evidence_review_record" ADD CONSTRAINT "evidence_review_session_tenant_fkey" FOREIGN KEY ("session_id", "committee_id") REFERENCES "verification_session"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "evidence_review_record" ADD CONSTRAINT "evidence_review_member_tenant_fkey" FOREIGN KEY ("reviewer_member_id", "committee_id") REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_request_tenant_fkey" FOREIGN KEY ("request_id", "committee_id") REFERENCES "verification_request"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_member_tenant_fkey" FOREIGN KEY ("reviewer_member_id", "committee_id") REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_request_tenant_fkey" FOREIGN KEY ("request_id", "committee_id", "participant_id") REFERENCES "verification_request"("id", "committee_id", "participant_id") ON DELETE RESTRICT;
ALTER TABLE "attestation_status" ADD CONSTRAINT "attestation_status_tenant_fkey" FOREIGN KEY ("attestation_id", "committee_id") REFERENCES "attestation"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "attestation_revocation" ADD CONSTRAINT "attestation_revocation_tenant_fkey" FOREIGN KEY ("attestation_id", "committee_id") REFERENCES "attestation"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "eligible_snapshot" ADD CONSTRAINT "eligible_snapshot_tenant_fkey" FOREIGN KEY ("renewal_cycle_id", "committee_id") REFERENCES "renewal_cycle"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "cycle_selection" ADD CONSTRAINT "cycle_selection_tenant_fkey" FOREIGN KEY ("renewal_cycle_id", "committee_id") REFERENCES "renewal_cycle"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "cycle_report" ADD CONSTRAINT "cycle_report_tenant_fkey" FOREIGN KEY ("renewal_cycle_id", "committee_id") REFERENCES "renewal_cycle"("id", "committee_id") ON DELETE RESTRICT;
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_committee_fkey" FOREIGN KEY ("committee_id") REFERENCES "committee"("id") ON DELETE RESTRICT;
ALTER TABLE "anchor_record" ADD CONSTRAINT "anchor_outbox_event_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE RESTRICT;

-- Row-level invariants, exact 45-day validity, and VRSCTEST-only anchoring.
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_version_positive" CHECK ("version" > 0);
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_result_version_positive" CHECK ("result_version" IS NULL OR "result_version" > 0);
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_lifecycle_consistent" CHECK (
  ("state" = 'pending' AND "acknowledged_at" IS NULL AND "withdrawn_at" IS NULL) OR
  ("state" = 'acknowledged' AND "acknowledged_at" IS NOT NULL AND "withdrawn_at" IS NULL) OR
  ("state" = 'withdrawn' AND "acknowledged_at" IS NOT NULL AND "withdrawn_at" IS NOT NULL AND "withdrawn_at" >= "acknowledged_at")
);
ALTER TABLE "committee_member" ADD CONSTRAINT "committee_member_version_positive" CHECK ("version" > 0);
ALTER TABLE "committee_member_role" ADD CONSTRAINT "member_role_time_order" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "granted_at");
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_time_order" CHECK ("resolved_at" IS NULL OR "resolved_at" >= "declared_at");
ALTER TABLE "readiness_checklist_item" ADD CONSTRAINT "readiness_version_positive" CHECK ("version" > 0);
ALTER TABLE "passkey_metadata" ADD CONSTRAINT "passkey_sign_count_nonnegative" CHECK ("sign_count" >= 0);
ALTER TABLE "wallet_challenge" ADD CONSTRAINT "wallet_challenge_version_positive" CHECK ("version" > 0);
ALTER TABLE "wallet_challenge" ADD CONSTRAINT "wallet_challenge_consumption_consistent" CHECK (("state" = 'consumed' AND "consumed_at" IS NOT NULL) OR ("state" <> 'consumed' AND "consumed_at" IS NULL));
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_version_positive" CHECK ("version" > 0);
ALTER TABLE "verification_session" ADD CONSTRAINT "verification_session_time_order" CHECK ("ends_at" > "starts_at");
ALTER TABLE "verification_session" ADD CONSTRAINT "verification_session_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "verification_session" ADD CONSTRAINT "verification_session_version_positive" CHECK ("version" > 0);
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_version_positive" CHECK ("version" > 0);
ALTER TABLE "session_attendance" ADD CONSTRAINT "attendance_version_positive" CHECK ("version" > 0);
ALTER TABLE "session_attendance" ADD CONSTRAINT "attendance_time_order" CHECK ("completed_at" IS NULL OR "checked_in_at" IS NOT NULL AND "completed_at" >= "checked_in_at");
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_version_positive" CHECK ("version" > 0);
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_validity_window" CHECK ("expires_at" > "valid_from" AND "expires_at" <= "valid_from" + INTERVAL '45 days');
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_renewal_reference" CHECK (("version" = 1 AND "supersedes_id" IS NULL) OR ("version" > 1 AND "supersedes_id" IS NOT NULL));
ALTER TABLE "attestation_status" ADD CONSTRAINT "attestation_status_version_positive" CHECK ("version" > 0);
ALTER TABLE "renewal_cycle" ADD CONSTRAINT "renewal_cycle_period_order" CHECK ("period_ends_at" > "period_starts_at");
ALTER TABLE "renewal_cycle" ADD CONSTRAINT "renewal_cycle_version_positive" CHECK ("version" > 0);
ALTER TABLE "eligible_snapshot" ADD CONSTRAINT "eligible_snapshot_count_nonnegative" CHECK ("eligible_count" >= 0);
ALTER TABLE "cycle_report" ADD CONSTRAINT "cycle_report_counts_nonnegative" CHECK ("eligible_count" >= 0 AND "selected_count" >= 0 AND "renewed_count" >= 0 AND "expired_count" >= 0);
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_version_positive" CHECK ("version" > 0);
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_resolution_consistent" CHECK (("state" IN ('upheld', 'denied', 'remanded') AND "resolved_at" IS NOT NULL) OR ("state" NOT IN ('upheld', 'denied', 'remanded') AND "resolved_at" IS NULL));
ALTER TABLE "privacy_rights_request" ADD CONSTRAINT "privacy_request_version_positive" CHECK ("version" > 0);
ALTER TABLE "relying_party_client" ADD CONSTRAINT "relying_party_version_positive" CHECK ("version" > 0);
ALTER TABLE "notification" ADD CONSTRAINT "notification_version_positive" CHECK ("version" > 0);
ALTER TABLE "notification" ADD CONSTRAINT "notification_delivery_consistent" CHECK (("state" = 'delivered' AND "delivered_at" IS NOT NULL) OR ("state" <> 'delivered' AND "delivered_at" IS NULL));
ALTER TABLE "anchor_record" ADD CONSTRAINT "anchor_vrsctest_chain" CHECK ("chain_id" = 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq');
ALTER TABLE "anchor_record" ADD CONSTRAINT "anchor_block_height_nonnegative" CHECK ("block_height" IS NULL OR "block_height" >= 0);
ALTER TABLE "anchor_record" ADD CONSTRAINT "anchor_version_positive" CHECK ("version" > 0);
ALTER TABLE "verus_job" ADD CONSTRAINT "verus_job_version_positive" CHECK ("version" > 0);

ALTER TABLE "outbox_event" DROP CONSTRAINT "outbox_lease_consistent";
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_lease_consistent" CHECK (
  ("state" = 'claimed' AND "lease_owner" IS NOT NULL AND "lease_acquired_at" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "lease_expires_at" > "lease_acquired_at") OR
  ("state" <> 'claimed' AND "lease_owner" IS NULL AND "lease_acquired_at" IS NULL AND "lease_expires_at" IS NULL)
);

CREATE FUNCTION "cbc_guard_outbox_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT (
    OLD."state" = NEW."state" OR
    (OLD."state" IN ('pending','retryable_failed') AND NEW."state" = 'claimed') OR
    (OLD."state" = 'claimed' AND NEW."state" IN ('succeeded','retryable_failed','terminal_failed','dead_letter'))
  ) THEN
    RAISE EXCEPTION 'invalid outbox transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outbox_transition_guard"
BEFORE UPDATE OF "state" ON "outbox_event"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_outbox_transition"();

CREATE FUNCTION "cbc_guard_verus_job_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Verus job version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" = 'pending' AND NEW."state" = 'claimed') OR
    (OLD."state" = 'claimed' AND NEW."state" = 'preflight') OR
    (OLD."state" = 'preflight' AND NEW."state" = 'submitted') OR
    (OLD."state" = 'submitted' AND NEW."state" = 'confirming') OR
    (OLD."state" = 'confirming' AND NEW."state" = 'readback') OR
    (OLD."state" = 'readback' AND NEW."state" IN ('verified','retryable_failed','terminal_failed','reorg_pending'))
  ) THEN
    RAISE EXCEPTION 'invalid Verus job transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "verus_job_transition_guard"
BEFORE UPDATE OF "state" ON "verus_job"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_verus_job_transition"();

CREATE FUNCTION "cbc_guard_anchor_identity"() RETURNS TRIGGER AS $$
BEGIN
  IF ROW(OLD."external_reference", OLD."committee_id", OLD."outbox_event_id", OLD."network", OLD."chain_id", OLD."anchor_type", OLD."subject_reference", OLD."vdxf_key", OLD."manifest_digest", OLD."created_at")
     IS DISTINCT FROM
     ROW(NEW."external_reference", NEW."committee_id", NEW."outbox_event_id", NEW."network", NEW."chain_id", NEW."anchor_type", NEW."subject_reference", NEW."vdxf_key", NEW."manifest_digest", NEW."created_at") THEN
    RAISE EXCEPTION 'anchor identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "anchor_record_identity_guard"
BEFORE UPDATE ON "anchor_record"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_anchor_identity"();

CREATE FUNCTION "cbc_guard_anchor_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'anchor version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" = 'pending' AND NEW."state" = 'submitted') OR
    (OLD."state" = 'submitted' AND NEW."state" = 'confirming') OR
    (OLD."state" = 'confirming' AND NEW."state" = 'readback') OR
    (OLD."state" = 'readback' AND NEW."state" IN ('verified','retryable_failed','terminal_failed','reorg_pending'))
  ) THEN
    RAISE EXCEPTION 'invalid anchor transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "anchor_record_transition_guard"
BEFORE UPDATE OF "state" ON "anchor_record"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_anchor_transition"();

-- Named state transitions are enforced below the repository layer as a defence in depth.
CREATE FUNCTION "cbc_guard_verification_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'verification request version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" = 'requested' AND NEW."state" = 'scheduled') OR
    (OLD."state" = 'scheduled' AND NEW."state" = 'checked_in') OR
    (OLD."state" = 'checked_in' AND NEW."state" = 'under_review') OR
    (OLD."state" = 'under_review' AND NEW."state" IN ('approved','rejected','needs_more_information','withdrawn')) OR
    (OLD."state" = 'needs_more_information' AND NEW."state" IN ('scheduled','rejected','withdrawn')) OR
    (OLD."state" = 'approved' AND NEW."state" = 'issuance_pending') OR
    (OLD."state" = 'issuance_pending' AND NEW."state" = 'issued') OR
    (OLD."state" = 'issued' AND NEW."state" = 'active') OR
    (OLD."state" = 'active' AND NEW."state" IN ('expired','revoked','superseded')) OR
    (OLD."state" = 'rejected' AND NEW."state" = 'appealed') OR
    (OLD."state" = 'appealed' AND NEW."state" IN ('appeal_upheld','appeal_denied','appeal_remanded'))
  ) THEN
    RAISE EXCEPTION 'invalid verification request transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "verification_request_transition_guard"
BEFORE UPDATE OF "state" ON "verification_request"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_verification_transition"();

CREATE FUNCTION "cbc_guard_committee_transition"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'committee version conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."state" = 'proposed' AND NEW."state" = 'forming') OR
    (OLD."state" = 'forming' AND NEW."state" = 'policy_review') OR
    (OLD."state" = 'policy_review' AND NEW."state" = 'testnet_provisioning') OR
    (OLD."state" = 'testnet_provisioning' AND NEW."state" = 'testnet_ready') OR
    (OLD."state" = 'testnet_ready' AND NEW."state" = 'pilot_review') OR
    (OLD."state" = 'pilot_review' AND NEW."state" = 'pilot_approved') OR
    (OLD."state" = 'pilot_approved' AND NEW."state" IN ('active','suspended','retired')) OR
    (OLD."state" = 'suspended' AND NEW."state" IN ('active','retired'))
  ) THEN
    RAISE EXCEPTION 'invalid committee transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "committee_transition_guard"
BEFORE UPDATE OF "state" ON "committee"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_committee_transition"();

CREATE FUNCTION "cbc_guard_attestation_identity"() RETURNS TRIGGER AS $$
BEGIN
  IF ROW(OLD."external_reference", OLD."committee_id", OLD."participant_id", OLD."request_id", OLD."policy_version_id", OLD."version", OLD."valid_from", OLD."expires_at", OLD."supersedes_id", OLD."created_at")
     IS DISTINCT FROM
     ROW(NEW."external_reference", NEW."committee_id", NEW."participant_id", NEW."request_id", NEW."policy_version_id", NEW."version", NEW."valid_from", NEW."expires_at", NEW."supersedes_id", NEW."created_at") THEN
    RAISE EXCEPTION 'attestation identity and original validity are immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    OLD."state" = NEW."state" OR
    (OLD."state" = 'issued' AND NEW."state" = 'active') OR
    (OLD."state" = 'active' AND NEW."state" IN ('expired','revoked','superseded'))
  ) THEN
    RAISE EXCEPTION 'invalid attestation transition: % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attestation_identity_transition_guard"
BEFORE UPDATE ON "attestation"
FOR EACH ROW EXECUTE FUNCTION "cbc_guard_attestation_identity"();

CREATE FUNCTION "cbc_validate_attestation_renewal"() RETURNS TRIGGER AS $$
DECLARE predecessor "attestation"%ROWTYPE;
BEGIN
  IF NEW."supersedes_id" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO predecessor FROM "attestation" WHERE "id" = NEW."supersedes_id" FOR UPDATE;
  IF predecessor."id" IS NULL OR predecessor."committee_id" <> NEW."committee_id" OR predecessor."participant_id" <> NEW."participant_id" OR NEW."version" <> predecessor."version" + 1 THEN
    RAISE EXCEPTION 'invalid attestation renewal predecessor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attestation_renewal_guard"
BEFORE INSERT ON "attestation"
FOR EACH ROW EXECUTE FUNCTION "cbc_validate_attestation_renewal"();

CREATE FUNCTION "cbc_attestation_status_at"(attestation_uuid UUID, observed_at TIMESTAMPTZ) RETURNS TEXT AS $$
  SELECT CASE
    WHEN NOT a."issuance_complete" OR observed_at < a."valid_from" THEN 'unavailable'
    WHEN r."effective_at" IS NOT NULL AND r."effective_at" <= observed_at THEN 'revoked'
    WHEN successor."id" IS NOT NULL AND successor."valid_from" <= observed_at THEN 'superseded'
    WHEN observed_at >= a."expires_at" THEN 'expired'
    ELSE 'active'
  END
  FROM "attestation" a
  LEFT JOIN "attestation_revocation" r ON r."attestation_id" = a."id"
  LEFT JOIN "attestation" successor ON successor."supersedes_id" = a."id"
    AND successor."issuance_complete" = true AND successor."state" = 'active'
  WHERE a."id" = attestation_uuid;
$$ LANGUAGE sql STABLE;

CREATE VIEW "attestation_effective_status" AS
SELECT a."id" AS "attestation_id", a."committee_id", a."participant_id", a."external_reference",
       "cbc_attestation_status_at"(a."id", CURRENT_TIMESTAMP) AS "status",
       a."valid_from", a."expires_at", a."policy_version_id"
FROM "attestation" a;

-- Decisions, evidence metadata, revocations, snapshots, selections, reports, and access audits preserve history.
CREATE TRIGGER "evidence_review_append_only" BEFORE UPDATE OR DELETE ON "evidence_review_record" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "review_decision_append_only" BEFORE UPDATE OR DELETE ON "review_decision" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "attestation_revocation_append_only" BEFORE UPDATE OR DELETE ON "attestation_revocation" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "eligible_snapshot_append_only" BEFORE UPDATE OR DELETE ON "eligible_snapshot" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "cycle_selection_append_only" BEFORE UPDATE OR DELETE ON "cycle_selection" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "cycle_report_append_only" BEFORE UPDATE OR DELETE ON "cycle_report" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();
CREATE TRIGGER "relying_party_access_audit_append_only" BEFORE UPDATE OR DELETE ON "relying_party_access_audit" FOR EACH ROW EXECUTE FUNCTION "cbc_reject_append_only_mutation"();

-- The database computes each audit hash from canonical JSON and its serialized predecessor.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION "cbc_enforce_audit_chain"() RETURNS TRIGGER AS $$
DECLARE
  current_hash TEXT;
  computed_hash TEXT;
BEGIN
  INSERT INTO "audit_chain_head" ("chain_key", "event_id", "event_hash")
  VALUES (NEW."chain_key", NULL, NULL)
  ON CONFLICT ("chain_key") DO NOTHING;

  SELECT "event_hash" INTO current_hash FROM "audit_chain_head"
  WHERE "chain_key" = NEW."chain_key" FOR UPDATE;

  IF NEW."previous_hash" IS DISTINCT FROM current_hash THEN
    RAISE EXCEPTION 'audit chain mismatch for %', NEW."chain_key" USING ERRCODE = '23514';
  END IF;

  computed_hash := encode(digest(
    COALESCE(current_hash, '') || '|' ||
    (to_jsonb(NEW) - 'sequence' - 'event_hash')::text,
    'sha256'
  ), 'hex');

  IF NEW."event_hash" <> 'AUTO' AND NEW."event_hash" <> computed_hash THEN
    RAISE EXCEPTION 'audit event hash mismatch' USING ERRCODE = '23514';
  END IF;
  NEW."event_hash" := computed_hash;

  UPDATE "audit_chain_head"
  SET "event_id" = NEW."id", "event_hash" = NEW."event_hash", "updated_at" = CURRENT_TIMESTAMP
  WHERE "chain_key" = NEW."chain_key";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION "cbc_enforce_audit_chain"() FROM PUBLIC;

-- Ordinary application roles cannot mutate append-only records even when triggers are disabled accidentally.
REVOKE UPDATE, DELETE ON "evidence_review_record", "review_decision", "attestation_revocation", "eligible_snapshot", "cycle_selection", "cycle_report", "relying_party_access_audit" FROM PUBLIC;
