import { Queue } from "bullmq";
import { OutboxRepository, Pool, VerusJobRepository } from "@cbc/db";
import {
  CBC_ANCHOR_MANIFEST_V1_POLICY,
  CBC_VRSCTEST_NAMESPACE,
  HttpVerusRpcAdapter,
} from "@cbc/verus";

import { createWorkerServer } from "./app.js";
import { VerusAnchorWorker, VerusWorkerLoop } from "./verus-worker.js";

function redisConnection(urlValue: string) {
  const url = new URL(urlValue);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
  };
}

async function bootstrap(): Promise<void> {
  const { server, config, dependencyChecker, metrics } = await createWorkerServer();
  const report = await dependencyChecker();
  if (!report.ready) {
    const failed = Object.entries(report.dependencies)
      .filter(([, dependency]) => !dependency.ok)
      .map(([name]) => name)
      .join(", ");
    throw new Error(`Startup dependency check failed: ${failed}`);
  }

  const queue = new Queue("cbc-foundation", { connection: redisConnection(config.REDIS_URL) });
  await queue.waitUntilReady();
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const processor = new VerusAnchorWorker({
    outbox: new OutboxRepository(pool),
    jobs: new VerusJobRepository(pool),
    adapter: new HttpVerusRpcAdapter({
      url: config.CBC_VERUS_RPC_URL,
      ...(config.CBC_VERUS_RPC_USER ? { username: config.CBC_VERUS_RPC_USER } : {}),
      ...(config.CBC_VERUS_RPC_PASSWORD ? { password: config.CBC_VERUS_RPC_PASSWORD } : {}),
    }),
    metrics,
    approvedWriteTargets: [
      {
        operationType: "schema_anchor",
        targetIdentity: CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
        vdxfUri: CBC_VRSCTEST_NAMESPACE.keys.anchorSchema.uri,
        vdxfKey: CBC_VRSCTEST_NAMESPACE.keys.anchorSchema.vdxfId,
        manifestPolicyReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
      },
      {
        operationType: "policy_anchor",
        targetIdentity: CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
        vdxfUri: CBC_VRSCTEST_NAMESPACE.keys.anchorPolicy.uri,
        vdxfKey: CBC_VRSCTEST_NAMESPACE.keys.anchorPolicy.vdxfId,
        manifestPolicyReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
      },
      {
        operationType: "cycle_report_anchor",
        targetIdentity: CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress,
        vdxfUri: CBC_VRSCTEST_NAMESPACE.keys.anchorCycleReport.uri,
        vdxfKey: CBC_VRSCTEST_NAMESPACE.keys.anchorCycleReport.vdxfId,
        manifestPolicyReference: CBC_ANCHOR_MANIFEST_V1_POLICY.policyReference,
      },
    ],
    worker: {
      workerReference: `worker_verus_${process.pid}`,
      softwareVersion: process.env.npm_package_version ?? "0.0.0",
      correlationId: `worker_process_${process.pid}`,
    },
    // ADR 0006 approves the fixture, but hosted writes still require a separate release decision.
    writeCapabilityEnabled: config.CBC_VERUS_IDENTITY_UPDATE_ENABLED,
  });
  const loop = new VerusWorkerLoop(processor, 1_000, (error) => {
    server.log.error(
      { errorClass: error instanceof Error ? error.name : "unknown" },
      "Verus worker tick failed",
    );
  });
  loop.start();
  server.addHook("onClose", async () => {
    loop.stop();
    await Promise.all([queue.close(), pool.end()]);
  });
  await server.listen({ port: config.CBC_SERVICE_PORT ?? 4010, host: "0.0.0.0" });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker startup error";
  console.error(message);
  process.exitCode = 1;
});
