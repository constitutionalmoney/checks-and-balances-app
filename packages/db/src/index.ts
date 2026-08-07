import Redis from "ioredis";
import { Client } from "pg";

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
