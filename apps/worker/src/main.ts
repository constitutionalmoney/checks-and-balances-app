import { Queue } from "bullmq";

import { createWorkerServer } from "./app";

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
  const { server, config, dependencyChecker } = await createWorkerServer();
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
  server.addHook("onClose", async () => queue.close());
  await server.listen({ port: config.CBC_SERVICE_PORT ?? 4010, host: "0.0.0.0" });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker startup error";
  console.error(message);
  process.exitCode = 1;
});
