import { Redis } from "ioredis";
import { Client } from "pg";

export { Pool } from "pg";

export {
  AuthRepository,
  type CommitteeInvitationInput,
  type CommitteePrincipalSnapshot,
  type CreateAuthAccountInput,
  type RegisterVerifiedEmailInput,
} from "./auth-repository.js";

export {
  AttestationRepository,
  type AttestationRecord,
  type IssueAttestationInput,
  type MutateAttestationInput,
  type RevokeAttestationInput,
} from "./attestation-repository.js";
export {
  OutboxRepository,
  type OutboxClaim,
  type OutboxWorkerContext,
  type RetryFailureOptions,
} from "./outbox-repository.js";
export {
  LifecycleRepository,
  type AppealLifecycleCommand,
  type CommitteeLifecycleCommand,
  type LifecycleRecord,
  type LifecycleTransitionInput,
  type NotificationLifecycleCommand,
  type PrivacyLifecycleCommand,
  type RelyingPartyLifecycleCommand,
  type RenewalLifecycleCommand,
  type WalletChallengeCommand,
} from "./lifecycle-repository.js";
export {
  IdempotencyConflictError,
  RepositoryConflictError,
  TenantBoundaryError,
  type CommandActor,
  type CommandContext,
} from "./repository-types.js";
export {
  VerificationRepository,
  type CreateVerificationRequestInput,
  type RecordReviewDecisionInput,
  type VerificationRecord,
} from "./verification-repository.js";

export interface DependencyCheck {
  readonly ok: boolean;
  readonly detail: string;
}

export async function checkPostgres(connectionString: string): Promise<DependencyCheck> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true, detail: "PostgreSQL is reachable" };
  } catch {
    return { ok: false, detail: "PostgreSQL is unavailable" };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function checkRedis(url: string): Promise<DependencyCheck> {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    await client.ping();
    return { ok: true, detail: "Redis is reachable" };
  } catch {
    return { ok: false, detail: "Redis is unavailable" };
  } finally {
    client.disconnect();
  }
}
