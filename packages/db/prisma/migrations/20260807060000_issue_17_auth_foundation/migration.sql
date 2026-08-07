-- Issue #17: separate trust-domain authentication, recovery, authorization approvals, and consent metadata.
-- No raw email address, bearer token, WebAuthn challenge, or recovery secret is stored.

CREATE TYPE "auth_trust_domain" AS ENUM ('participant', 'committee');
CREATE TYPE "auth_account_state" AS ENUM ('invited', 'active', 'locked', 'suspended', 'closed');
CREATE TYPE "authentication_strength" AS ENUM ('verified_email', 'passkey', 'recovery');
CREATE TYPE "auth_session_state" AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE "auth_challenge_kind" AS ENUM (
  'passkey_registration',
  'passkey_authentication',
  'email_sign_in',
  'account_recovery',
  'recovery_grant',
  'email_change'
);
CREATE TYPE "auth_challenge_state" AS ENUM ('pending', 'consumed', 'expired', 'rejected');
CREATE TYPE "committee_access_state" AS ENUM ('invited', 'approved', 'active', 'suspended', 'revoked');
CREATE TYPE "consent_action" AS ENUM ('accepted', 'declined', 'withdrawn');

CREATE TABLE "auth_account" (
  "id" UUID PRIMARY KEY,
  "external_reference" TEXT NOT NULL UNIQUE,
  "trust_domain" "auth_trust_domain" NOT NULL,
  "state" "auth_account_state" NOT NULL DEFAULT 'invited',
  "participant_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "locked_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6),
  "recovered_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_account_participant_id_fkey" FOREIGN KEY ("participant_id")
    REFERENCES "participant_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "auth_account_version_check" CHECK ("version" > 0),
  CONSTRAINT "auth_account_subject_domain_check" CHECK (
    ("trust_domain" = 'participant' AND "participant_id" IS NOT NULL) OR
    ("trust_domain" = 'committee' AND "participant_id" IS NULL)
  ),
  CONSTRAINT "auth_account_state_timestamp_check" CHECK (
    ("state" <> 'locked' OR "locked_at" IS NOT NULL) AND
    ("state" <> 'suspended' OR "suspended_at" IS NOT NULL) AND
    ("state" <> 'closed' OR "closed_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "auth_account_participant_id_trust_domain_key"
  ON "auth_account"("participant_id", "trust_domain");
CREATE INDEX "auth_account_trust_domain_state_idx" ON "auth_account"("trust_domain", "state");

INSERT INTO "auth_account" (
  "id", "external_reference", "trust_domain", "state", "participant_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'auth:migrated:' || "id"::text,
  'participant'::"auth_trust_domain",
  'active'::"auth_account_state",
  "id",
  "created_at",
  "updated_at"
FROM "participant_account";

CREATE TABLE "auth_session" (
  "id" UUID PRIMARY KEY,
  "account_id" UUID NOT NULL,
  "trust_domain" "auth_trust_domain" NOT NULL,
  "audience" TEXT NOT NULL,
  "token_digest" TEXT NOT NULL UNIQUE,
  "csrf_digest" TEXT NOT NULL,
  "key_version" TEXT NOT NULL,
  "authentication_strength" "authentication_strength" NOT NULL,
  "state" "auth_session_state" NOT NULL DEFAULT 'active',
  "device_label" TEXT NOT NULL,
  "authenticated_at" TIMESTAMPTZ(6) NOT NULL,
  "reauthenticated_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
  "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revocation_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_session_account_id_fkey" FOREIGN KEY ("account_id")
    REFERENCES "auth_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "auth_session_time_check" CHECK (
    "authenticated_at" <= "last_seen_at" AND
    "last_seen_at" < "absolute_expires_at" AND
    "idle_expires_at" <= "absolute_expires_at"
  ),
  CONSTRAINT "auth_session_revocation_check" CHECK (
    ("state" = 'active' AND "revoked_at" IS NULL AND "revocation_reason" IS NULL) OR
    ("state" <> 'active' AND "revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL)
  ),
  CONSTRAINT "auth_session_committee_strength_check" CHECK (
    "trust_domain" <> 'committee' OR "authentication_strength" = 'passkey'
  )
);
CREATE INDEX "auth_session_account_id_state_absolute_expires_at_idx"
  ON "auth_session"("account_id", "state", "absolute_expires_at");
CREATE INDEX "auth_session_trust_domain_token_digest_idx"
  ON "auth_session"("trust_domain", "token_digest");

CREATE TABLE "auth_challenge" (
  "id" UUID PRIMARY KEY,
  "account_id" UUID,
  "trust_domain" "auth_trust_domain" NOT NULL,
  "kind" "auth_challenge_kind" NOT NULL,
  "state" "auth_challenge_state" NOT NULL DEFAULT 'pending',
  "secret_digest" TEXT NOT NULL UNIQUE,
  "destination_reference" TEXT,
  "lookup_digest" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "maximum_attempts" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_challenge_account_id_fkey" FOREIGN KEY ("account_id")
    REFERENCES "auth_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "auth_challenge_attempt_check" CHECK (
    "attempt_count" >= 0 AND "maximum_attempts" > 0 AND "attempt_count" <= "maximum_attempts"
  ),
  CONSTRAINT "auth_challenge_time_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "auth_challenge_account_check" CHECK (
    ("kind" = 'passkey_authentication' AND "account_id" IS NULL) OR
    ("kind" <> 'passkey_authentication' AND "account_id" IS NOT NULL)
  ),
  CONSTRAINT "auth_challenge_destination_check" CHECK (
    ("kind" IN ('email_sign_in', 'account_recovery', 'email_change') AND "destination_reference" IS NOT NULL) OR
    ("kind" NOT IN ('email_sign_in', 'account_recovery', 'email_change') AND "destination_reference" IS NULL)
  ),
  CONSTRAINT "auth_challenge_email_change_lookup_check" CHECK (
    ("kind" = 'email_change' AND "lookup_digest" IS NOT NULL) OR
    ("kind" <> 'email_change' AND "lookup_digest" IS NULL)
  ),
  CONSTRAINT "auth_challenge_consumption_check" CHECK (
    ("state" = 'pending' AND "consumed_at" IS NULL) OR
    ("state" <> 'pending' AND "consumed_at" IS NOT NULL)
  )
);
CREATE INDEX "auth_challenge_trust_domain_kind_state_expires_at_idx"
  ON "auth_challenge"("trust_domain", "kind", "state", "expires_at");
CREATE INDEX "auth_challenge_account_id_kind_state_idx"
  ON "auth_challenge"("account_id", "kind", "state");

CREATE TABLE "auth_rate_limit_bucket" (
  "key_digest" TEXT PRIMARY KEY,
  "bucket" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "window_started_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_rate_limit_bucket_count_check" CHECK ("attempt_count" > 0),
  CONSTRAINT "auth_rate_limit_bucket_time_check" CHECK ("expires_at" > "window_started_at")
);
CREATE INDEX "auth_rate_limit_bucket_expires_at_idx" ON "auth_rate_limit_bucket"("expires_at");

CREATE TABLE "auth_committee_access" (
  "id" UUID PRIMARY KEY,
  "account_id" UUID NOT NULL,
  "committee_id" UUID NOT NULL,
  "member_id" UUID,
  "state" "committee_access_state" NOT NULL DEFAULT 'invited',
  "invited_by_reference" TEXT NOT NULL,
  "approved_by_reference" TEXT,
  "invited_at" TIMESTAMPTZ(6) NOT NULL,
  "approved_at" TIMESTAMPTZ(6),
  "activated_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "auth_committee_access_account_id_fkey" FOREIGN KEY ("account_id")
    REFERENCES "auth_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "auth_committee_access_committee_id_fkey" FOREIGN KEY ("committee_id")
    REFERENCES "committee"("id") ON DELETE RESTRICT,
  CONSTRAINT "auth_committee_access_member_committee_fkey" FOREIGN KEY ("member_id", "committee_id")
    REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT,
  CONSTRAINT "auth_committee_access_approval_check" CHECK (
    "state" = 'invited' OR (
      "approved_by_reference" IS NOT NULL AND
      "approved_at" IS NOT NULL AND
      "approved_by_reference" <> "invited_by_reference"
    )
  ),
  CONSTRAINT "auth_committee_access_activation_check" CHECK (
    "state" <> 'active' OR ("member_id" IS NOT NULL AND "activated_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "auth_committee_access_account_id_committee_id_key"
  ON "auth_committee_access"("account_id", "committee_id");
CREATE INDEX "auth_committee_access_committee_id_state_idx"
  ON "auth_committee_access"("committee_id", "state");

CREATE TABLE "reviewer_session_assignment" (
  "id" UUID PRIMARY KEY,
  "committee_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "member_id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "state" "membership_state" NOT NULL DEFAULT 'active',
  "assigned_by_reference" TEXT NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "reviewer_session_assignment_committee_id_fkey" FOREIGN KEY ("committee_id")
    REFERENCES "committee"("id") ON DELETE RESTRICT,
  CONSTRAINT "reviewer_session_assignment_session_tenant_fkey" FOREIGN KEY ("session_id", "committee_id")
    REFERENCES "verification_session"("id", "committee_id") ON DELETE RESTRICT,
  CONSTRAINT "reviewer_session_assignment_member_tenant_fkey" FOREIGN KEY ("member_id", "committee_id")
    REFERENCES "committee_member"("id", "committee_id") ON DELETE RESTRICT,
  CONSTRAINT "reviewer_session_assignment_policy_version_id_fkey" FOREIGN KEY ("policy_version_id")
    REFERENCES "policy_version"("id") ON DELETE RESTRICT,
  CONSTRAINT "reviewer_session_assignment_state_check" CHECK (
    ("state" = 'active' AND "revoked_at" IS NULL) OR
    ("state" <> 'active' AND "revoked_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "reviewer_session_assignment_session_id_member_id_key"
  ON "reviewer_session_assignment"("session_id", "member_id");
CREATE INDEX "reviewer_session_assignment_committee_id_state_idx"
  ON "reviewer_session_assignment"("committee_id", "state");

CREATE TABLE "privileged_approval" (
  "id" UUID PRIMARY KEY,
  "operation_reference" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_reference" TEXT NOT NULL,
  "requester_account_id" UUID NOT NULL,
  "approver_account_id" UUID NOT NULL,
  "policy_version_reference" TEXT NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "privileged_approval_requester_account_id_fkey" FOREIGN KEY ("requester_account_id")
    REFERENCES "auth_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "privileged_approval_approver_account_id_fkey" FOREIGN KEY ("approver_account_id")
    REFERENCES "auth_account"("id") ON DELETE RESTRICT,
  CONSTRAINT "privileged_approval_distinct_actor_check" CHECK (
    "requester_account_id" <> "approver_account_id"
  ),
  CONSTRAINT "privileged_approval_time_check" CHECK ("expires_at" > "approved_at")
);
CREATE UNIQUE INDEX "privileged_approval_operation_reference_approver_account_id_key"
  ON "privileged_approval"("operation_reference", "approver_account_id");
CREATE INDEX "privileged_approval_operation_reference_expires_at_idx"
  ON "privileged_approval"("operation_reference", "expires_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "passkey_metadata") THEN
    RAISE EXCEPTION 'Issue #17 cannot infer WebAuthn public keys for pre-existing metadata; migrate those records explicitly';
  END IF;
  IF EXISTS (SELECT 1 FROM "contact_preference") THEN
    RAISE EXCEPTION 'Issue #17 cannot infer email blind indexes for pre-existing contact references; migrate those records explicitly';
  END IF;
END
$$;

ALTER TABLE "contact_preference" ALTER COLUMN "participant_id" DROP NOT NULL;
ALTER TABLE "contact_preference" ADD COLUMN "auth_account_id" UUID NOT NULL;
ALTER TABLE "contact_preference" ADD COLUMN "lookup_digest" TEXT NOT NULL;
ALTER TABLE "contact_preference" ADD CONSTRAINT "contact_preference_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "contact_preference_lookup_digest_key" ON "contact_preference"("lookup_digest");

ALTER TABLE "passkey_metadata" ALTER COLUMN "participant_id" DROP NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "auth_account_id" UUID NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "public_key" BYTEA NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "transports" TEXT[] NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "credential_device_type" TEXT NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "backed_up" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "passkey_metadata" ADD COLUMN "device_label" TEXT NOT NULL;
ALTER TABLE "passkey_metadata" ADD COLUMN "revoked_at" TIMESTAMPTZ(6);
ALTER TABLE "passkey_metadata" ADD CONSTRAINT "passkey_metadata_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT;

ALTER TABLE "consent_receipt" ADD COLUMN "auth_account_id" UUID;
ALTER TABLE "consent_receipt" ADD COLUMN "presentation_reference" TEXT;
ALTER TABLE "consent_receipt" ADD COLUMN "presentation_digest" TEXT;
ALTER TABLE "consent_receipt" ADD COLUMN "action" "consent_action";
ALTER TABLE "consent_receipt" ADD COLUMN "presented_at" TIMESTAMPTZ(6);
ALTER TABLE "consent_receipt" ADD COLUMN "acted_at" TIMESTAMPTZ(6);
UPDATE "consent_receipt" AS receipt
SET
  "auth_account_id" = account."id",
  "presentation_reference" = 'presentation:migrated:' || receipt."id"::text,
  "presentation_digest" = encode(digest(receipt."external_reference" || ':' || receipt."policy_version_id"::text, 'sha256'), 'hex'),
  "action" = CASE
    WHEN receipt."state" = 'withdrawn' THEN 'withdrawn'::"consent_action"
    ELSE 'accepted'::"consent_action"
  END,
  "presented_at" = COALESCE(receipt."acknowledged_at", receipt."created_at"),
  "acted_at" = COALESCE(receipt."withdrawn_at", receipt."acknowledged_at", receipt."created_at")
FROM "auth_account" AS account
WHERE account."participant_id" = receipt."participant_id"
  AND account."trust_domain" = 'participant';
ALTER TABLE "consent_receipt" ALTER COLUMN "participant_id" DROP NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "auth_account_id" SET NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "presentation_reference" SET NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "presentation_digest" SET NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "presented_at" SET NOT NULL;
ALTER TABLE "consent_receipt" ALTER COLUMN "acted_at" SET NOT NULL;
ALTER TABLE "consent_receipt" ADD CONSTRAINT "consent_receipt_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT;
DROP INDEX "consent_receipt_participant_id_policy_version_id_purpose_key";
CREATE UNIQUE INDEX "consent_receipt_account_policy_purpose_action_key"
  ON "consent_receipt"("auth_account_id", "policy_version_id", "purpose", "action");

ALTER TABLE "notification" ADD COLUMN "auth_account_id" UUID;
UPDATE "notification" AS notification
SET "auth_account_id" = account."id"
FROM "auth_account" AS account
WHERE account."participant_id" = notification."participant_id"
  AND account."trust_domain" = 'participant';
ALTER TABLE "notification" ALTER COLUMN "participant_id" DROP NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "auth_account_id" SET NOT NULL;
ALTER TABLE "notification" ADD CONSTRAINT "notification_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_auth_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."account_id", OLD."trust_domain", OLD."audience", OLD."token_digest",
    OLD."csrf_digest", OLD."key_version", OLD."authentication_strength",
    OLD."authenticated_at", OLD."absolute_expires_at", OLD."created_at"
  ) IS DISTINCT FROM ROW(
    NEW."account_id", NEW."trust_domain", NEW."audience", NEW."token_digest",
    NEW."csrf_digest", NEW."key_version", NEW."authentication_strength",
    NEW."authenticated_at", NEW."absolute_expires_at", NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'auth session identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_session_identity_immutable"
BEFORE UPDATE ON "auth_session"
FOR EACH ROW EXECUTE FUNCTION prevent_auth_identity_mutation();

CREATE OR REPLACE FUNCTION prevent_consumed_challenge_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."state" <> 'pending' THEN
    RAISE EXCEPTION 'consumed authentication challenges are immutable';
  END IF;
  IF ROW(
    OLD."account_id", OLD."trust_domain", OLD."kind", OLD."secret_digest",
    OLD."destination_reference", OLD."lookup_digest", OLD."maximum_attempts", OLD."expires_at", OLD."created_at"
  ) IS DISTINCT FROM ROW(
    NEW."account_id", NEW."trust_domain", NEW."kind", NEW."secret_digest",
    NEW."destination_reference", NEW."lookup_digest", NEW."maximum_attempts", NEW."expires_at", NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'authentication challenge identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_challenge_identity_immutable"
BEFORE UPDATE ON "auth_challenge"
FOR EACH ROW EXECUTE FUNCTION prevent_consumed_challenge_mutation();

CREATE OR REPLACE FUNCTION enforce_auth_trust_domain_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_domain "auth_trust_domain";
BEGIN
  SELECT "trust_domain" INTO account_domain FROM "auth_account" WHERE "id" = NEW."account_id";
  IF account_domain IS DISTINCT FROM NEW."trust_domain" THEN
    RAISE EXCEPTION 'authentication record crosses trust domains';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_session_trust_domain_match"
BEFORE INSERT OR UPDATE ON "auth_session"
FOR EACH ROW EXECUTE FUNCTION enforce_auth_trust_domain_match();

CREATE TRIGGER "auth_challenge_trust_domain_match"
BEFORE INSERT OR UPDATE ON "auth_challenge"
FOR EACH ROW WHEN (NEW."account_id" IS NOT NULL)
EXECUTE FUNCTION enforce_auth_trust_domain_match();

CREATE OR REPLACE FUNCTION enforce_auth_subject_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_participant UUID;
BEGIN
  SELECT "participant_id" INTO account_participant FROM "auth_account" WHERE "id" = NEW."auth_account_id";
  IF account_participant IS DISTINCT FROM NEW."participant_id" THEN
    RAISE EXCEPTION 'authentication record crosses participant subjects';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "contact_preference_auth_subject_match"
BEFORE INSERT OR UPDATE ON "contact_preference"
FOR EACH ROW EXECUTE FUNCTION enforce_auth_subject_match();

CREATE TRIGGER "passkey_metadata_auth_subject_match"
BEFORE INSERT OR UPDATE ON "passkey_metadata"
FOR EACH ROW EXECUTE FUNCTION enforce_auth_subject_match();

CREATE TRIGGER "consent_receipt_auth_subject_match"
BEFORE INSERT OR UPDATE ON "consent_receipt"
FOR EACH ROW EXECUTE FUNCTION enforce_auth_subject_match();

CREATE TRIGGER "notification_auth_subject_match"
BEFORE INSERT OR UPDATE ON "notification"
FOR EACH ROW EXECUTE FUNCTION enforce_auth_subject_match();

CREATE OR REPLACE FUNCTION enforce_committee_access_account_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_domain "auth_trust_domain";
BEGIN
  SELECT "trust_domain" INTO account_domain FROM "auth_account" WHERE "id" = NEW."account_id";
  IF account_domain IS DISTINCT FROM 'committee'::"auth_trust_domain" THEN
    RAISE EXCEPTION 'committee access requires a committee authentication account';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_committee_access_account_domain"
BEFORE INSERT OR UPDATE ON "auth_committee_access"
FOR EACH ROW EXECUTE FUNCTION enforce_committee_access_account_domain();

CREATE OR REPLACE FUNCTION enforce_privileged_approval_account_domains()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requester_domain "auth_trust_domain";
  approver_domain "auth_trust_domain";
BEGIN
  SELECT "trust_domain" INTO requester_domain FROM "auth_account" WHERE "id" = NEW."requester_account_id";
  SELECT "trust_domain" INTO approver_domain FROM "auth_account" WHERE "id" = NEW."approver_account_id";
  IF requester_domain IS DISTINCT FROM 'committee'::"auth_trust_domain"
     OR approver_domain IS DISTINCT FROM 'committee'::"auth_trust_domain" THEN
    RAISE EXCEPTION 'privileged approval requires committee authentication accounts';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "privileged_approval_account_domains"
BEFORE INSERT OR UPDATE ON "privileged_approval"
FOR EACH ROW EXECUTE FUNCTION enforce_privileged_approval_account_domains();
