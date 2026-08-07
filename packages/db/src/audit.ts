import type { PoolClient } from "pg";

import { newId, sha256, type CommandContext } from "./repository-types.js";

export interface AuditTarget {
  readonly type: string;
  readonly reference: string;
  readonly priorState?: string;
  readonly newState?: string;
}

export async function appendAudit(
  client: PoolClient,
  context: CommandContext,
  committeeId: string | null,
  command: string,
  target: AuditTarget,
  result: "succeeded" | "rejected" | "failed" = "succeeded",
): Promise<string> {
  const chainKey = committeeId ? `committee:${context.committeeReference}` : "global";
  const head = await client.query<{ event_hash: string | null }>(
    'SELECT "event_hash" FROM "audit_chain_head" WHERE "chain_key" = $1 FOR UPDATE',
    [chainKey],
  );
  const previousHash = head.rows[0]?.event_hash ?? null;
  const id = newId();

  const inserted = await client.query<{ event_hash: string }>(
    `INSERT INTO "audit_event" (
      "id", "chain_key", "previous_hash", "event_hash", "actor_type", "actor_reference",
      "committee_id", "command", "target_type", "target_reference", "prior_state", "new_state",
      "policy_version", "software_version", "reason_category", "authentication_strength",
      "correlation_id", "idempotency_key_hash", "result"
    ) VALUES ($1,$2,$3,'AUTO',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING "event_hash"`,
    [
      id,
      chainKey,
      previousHash,
      context.actor.type,
      context.actor.reference,
      committeeId,
      command,
      target.type,
      target.reference,
      target.priorState ?? null,
      target.newState ?? null,
      context.policyVersionReference,
      context.softwareVersion,
      context.reasonCategory,
      context.actor.authenticationStrength,
      context.correlationId,
      sha256(context.idempotencyKey),
      result,
    ],
  );
  return inserted.rows[0]!.event_hash;
}
