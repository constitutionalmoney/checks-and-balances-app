-- Issue #19: one-time, account-bound Verus Mobile challenges and minimum VerusID links.

ALTER TYPE "wallet_challenge_state" ADD VALUE IF NOT EXISTS 'cancelled';

-- Legacy pre-operational fixtures were participant-only. Give any such participant a distinct
-- participant auth account before the challenge/link foreign key becomes mandatory.
INSERT INTO "auth_account" (
  "id", "external_reference", "trust_domain", "state", "participant_id", "created_at", "updated_at"
)
SELECT
  (
    substr(md5('cbc-verus-link:' || p."id"::text), 1, 8) || '-' ||
    substr(md5('cbc-verus-link:' || p."id"::text), 9, 4) || '-' ||
    substr(md5('cbc-verus-link:' || p."id"::text), 13, 4) || '-' ||
    substr(md5('cbc-verus-link:' || p."id"::text), 17, 4) || '-' ||
    substr(md5('cbc-verus-link:' || p."id"::text), 21, 12)
  )::uuid,
  'migrated_verus_' || replace(p."id"::text, '-', ''),
  'participant',
  'active',
  p."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "participant_account" p
WHERE EXISTS (
  SELECT 1 FROM "wallet_challenge" wc WHERE wc."participant_id" = p."id"
  UNION ALL
  SELECT 1 FROM "verus_identity_link" vl WHERE vl."participant_id" = p."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "auth_account" aa
  WHERE aa."participant_id" = p."id" AND aa."trust_domain" = 'participant'
);

ALTER TABLE "verus_identity_link"
  ADD COLUMN "auth_account_id" UUID,
  ADD COLUMN "trust_domain" "auth_trust_domain" NOT NULL DEFAULT 'participant',
  ADD COLUMN "display_name_snapshot" TEXT,
  ADD COLUMN "proof_method" TEXT NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN "request_signer_identity" TEXT NOT NULL DEFAULT 'legacy_unapproved',
  ADD COLUMN "observed_identity_status" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "observed_identity_block_height" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "observed_identity_txid" TEXT NOT NULL DEFAULT repeat('0', 64),
  ADD COLUMN "consented_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "revalidation_reason" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "verus_identity_link" vl
SET "auth_account_id" = aa."id"
FROM "auth_account" aa
WHERE aa."participant_id" = vl."participant_id"
  AND aa."trust_domain" = 'participant';

ALTER TABLE "verus_identity_link"
  ALTER COLUMN "auth_account_id" SET NOT NULL,
  ALTER COLUMN "participant_id" DROP NOT NULL,
  ALTER COLUMN "proof_method" DROP DEFAULT,
  ALTER COLUMN "request_signer_identity" DROP DEFAULT,
  ALTER COLUMN "observed_identity_status" DROP DEFAULT,
  ALTER COLUMN "observed_identity_block_height" DROP DEFAULT,
  ALTER COLUMN "observed_identity_txid" DROP DEFAULT,
  ALTER COLUMN "consented_scopes" DROP DEFAULT;

DROP INDEX "verus_identity_link_participant_id_network_identity_address_key";
CREATE UNIQUE INDEX "verus_identity_link_auth_account_id_network_identity_address_key"
  ON "verus_identity_link"("auth_account_id", "network", "identity_address");
CREATE INDEX "verus_identity_link_identity_address_network_state_idx"
  ON "verus_identity_link"("identity_address", "network", "state");
CREATE INDEX "verus_identity_link_auth_account_id_state_idx"
  ON "verus_identity_link"("auth_account_id", "state");
ALTER TABLE "verus_identity_link"
  ADD CONSTRAINT "verus_identity_link_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "verus_identity_link_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "verus_identity_link_proof_digest_sha256" CHECK ("proof_digest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "verus_identity_link_observed_txid_hex" CHECK ("observed_identity_txid" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "verus_identity_link_unlink_consistent" CHECK (
    ("state" = 'unlinked' AND "unlinked_at" IS NOT NULL) OR
    ("state" <> 'unlinked' AND "unlinked_at" IS NULL)
  );

ALTER TABLE "wallet_challenge"
  ADD COLUMN "auth_account_id" UUID,
  ADD COLUMN "trust_domain" "auth_trust_domain" NOT NULL DEFAULT 'participant',
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "polling_token_digest" TEXT,
  ADD COLUMN "callback_url" TEXT NOT NULL DEFAULT 'https://invalid.local/legacy',
  ADD COLUMN "application_identity_address" TEXT NOT NULL DEFAULT 'legacy_unapproved',
  ADD COLUMN "consented_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "issued_at" TIMESTAMPTZ(6),
  ADD COLUMN "response_digest" TEXT,
  ADD COLUMN "linked_identity_address" TEXT,
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "wallet_challenge" wc
SET
  "auth_account_id" = aa."id",
  "request_id" = wc."external_reference",
  "polling_token_digest" = 'legacy:' || wc."id"::text,
  "issued_at" = wc."created_at"
FROM "auth_account" aa
WHERE aa."participant_id" = wc."participant_id"
  AND aa."trust_domain" = 'participant';

ALTER TABLE "wallet_challenge"
  ALTER COLUMN "participant_id" DROP NOT NULL,
  ALTER COLUMN "trust_domain" SET DEFAULT 'participant';

CREATE UNIQUE INDEX "wallet_challenge_request_id_key" ON "wallet_challenge"("request_id");
CREATE UNIQUE INDEX "wallet_challenge_polling_token_digest_key"
  ON "wallet_challenge"("polling_token_digest");
CREATE INDEX "wallet_challenge_auth_account_id_state_expires_at_idx"
  ON "wallet_challenge"("auth_account_id", "state", "expires_at");
ALTER TABLE "wallet_challenge"
  ADD CONSTRAINT "wallet_challenge_auth_account_id_fkey"
  FOREIGN KEY ("auth_account_id") REFERENCES "auth_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_challenge_time_order" CHECK (
    "issued_at" IS NULL OR "expires_at" > "issued_at"
  ),
  ADD CONSTRAINT "wallet_challenge_link_fields_complete" CHECK (
    "purpose" NOT IN ('link_verusid', 'revalidate_verusid') OR (
      "auth_account_id" IS NOT NULL AND
      "request_id" IS NOT NULL AND
      "polling_token_digest" IS NOT NULL AND
      "callback_url" <> 'https://invalid.local/legacy' AND
      "application_identity_address" <> 'legacy_unapproved' AND
      "consented_scopes" = ARRAY['verusid:link']::TEXT[] AND
      "issued_at" IS NOT NULL AND
      "network" = 'VRSCTEST'
    )
  ),
  ADD CONSTRAINT "wallet_challenge_request_digest_sha256" CHECK ("request_digest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "wallet_challenge_nonce_hash_sha256" CHECK ("nonce_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "wallet_challenge_response_digest_sha256" CHECK (
    "response_digest" IS NULL OR "response_digest" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "wallet_challenge_https_callback" CHECK ("callback_url" ~ '^https://'),
  ADD CONSTRAINT "wallet_challenge_terminal_reason" CHECK (
    ("state" IN ('rejected', 'cancelled') AND "rejection_reason" IS NOT NULL) OR
    ("state" NOT IN ('rejected', 'cancelled') AND "rejection_reason" IS NULL)
  );
