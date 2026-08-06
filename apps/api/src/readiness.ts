import type { RuntimeConfig } from "@cbc/config";
import { checkPostgres, checkRedis, type DependencyCheck } from "@cbc/db";
import { checkVerusReadiness } from "@cbc/verus";

export interface ReadinessReport {
  readonly ready: boolean;
  readonly dependencies: Readonly<Record<"postgres" | "redis" | "verusRpc", DependencyCheck>>;
}

export type DependencyChecker = () => Promise<ReadinessReport>;

export async function checkRuntimeDependencies(config: RuntimeConfig): Promise<ReadinessReport> {
  const [postgres, redis, verusRpc] = await Promise.all([
    checkPostgres(config.DATABASE_URL),
    checkRedis(config.REDIS_URL),
    checkVerusReadiness({
      url: config.CBC_VERUS_RPC_URL,
      ...(config.CBC_VERUS_RPC_USER ? { username: config.CBC_VERUS_RPC_USER } : {}),
      ...(config.CBC_VERUS_RPC_PASSWORD ? { password: config.CBC_VERUS_RPC_PASSWORD } : {}),
    }),
  ]);
  const dependencies = { postgres, redis, verusRpc };
  return {
    ready: Object.values(dependencies).every((dependency) => dependency.ok),
    dependencies,
  };
}
