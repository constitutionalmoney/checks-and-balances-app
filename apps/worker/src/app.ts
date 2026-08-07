import { loadRuntimeConfig, type RuntimeConfig } from "@cbc/config";
import { checkPostgres, checkRedis } from "@cbc/db";
import { checkVerusReadiness } from "@cbc/verus";
import Fastify, { type FastifyInstance } from "fastify";

import { VerusWorkerMetrics } from "./verus-metrics.js";

export interface WorkerReadinessReport {
  readonly ready: boolean;
  readonly dependencies: Readonly<
    Record<string, { readonly ok: boolean; readonly detail: string }>
  >;
}

export type WorkerDependencyChecker = () => Promise<WorkerReadinessReport>;

export async function checkWorkerDependencies(
  config: RuntimeConfig,
): Promise<WorkerReadinessReport> {
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
  return { ready: Object.values(dependencies).every((result) => result.ok), dependencies };
}

export interface WorkerServerOptions {
  readonly config?: RuntimeConfig;
  readonly dependencyChecker?: WorkerDependencyChecker;
  readonly metrics?: VerusWorkerMetrics;
}

export interface WorkerServer {
  readonly server: FastifyInstance;
  readonly config: RuntimeConfig;
  readonly dependencyChecker: WorkerDependencyChecker;
  readonly metrics: VerusWorkerMetrics;
}

export async function createWorkerServer(options: WorkerServerOptions = {}): Promise<WorkerServer> {
  const config = options.config ?? loadRuntimeConfig(process.env);
  const dependencyChecker = options.dependencyChecker ?? (() => checkWorkerDependencies(config));
  const metrics = options.metrics ?? new VerusWorkerMetrics();
  const server = Fastify({
    logger: {
      level: config.CBC_LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body",
          "password",
          "secret",
          "seed",
          "privateKey",
          "rpcPassword",
          "email",
          "exactAddress",
          "evidence",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  server.get("/health", async () => ({ status: "ok", service: "worker" }));
  server.get("/ready", async (_request, reply) => {
    const report = await dependencyChecker();
    if (!report.ready) {
      reply.status(503);
    }
    return report;
  });
  server.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return metrics.render();
  });

  return { server, config, dependencyChecker, metrics };
}
