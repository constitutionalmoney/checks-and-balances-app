import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export interface CommandActor {
  readonly type: string;
  readonly reference: string;
  readonly authenticationStrength: string;
}

export interface CommandContext {
  readonly actor: CommandActor;
  readonly committeeReference: string;
  readonly policyVersionReference: string;
  readonly softwareVersion: string;
  readonly reasonCategory: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
}

export class RepositoryConflictError extends Error {
  readonly code = "REPOSITORY_CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

export class TenantBoundaryError extends Error {
  readonly code = "TENANT_BOUNDARY_VIOLATION" as const;
  constructor() {
    super("record is not available in the requested committee tenant");
    this.name = "TenantBoundaryError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("idempotency key was already used for a different command or request");
    this.name = "IdempotencyConflictError";
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newId(): string {
  return randomUUID();
}

export async function inSerializableTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = (error as { code?: string }).code;
      if (attempt === 3 || (code !== "40001" && code !== "40P01")) throw error;
    } finally {
      client.release();
    }
  }
  throw new RepositoryConflictError("serializable transaction retry budget was exhausted");
}

const opaqueReferencePattern = /^[a-z][a-z0-9_:-]{7,199}$/;

export function requireOpaqueReference(value: string, field: string): void {
  if (!opaqueReferencePattern.test(value) || value.includes("@")) {
    throw new RepositoryConflictError(`${field} must be an opaque reference`);
  }
}
