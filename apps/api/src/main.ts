import { createApiApp, assertReady } from "./app";

async function bootstrap(): Promise<void> {
  const { app, config, dependencyChecker } = await createApiApp();
  await assertReady(dependencyChecker);
  await app.listen({ port: config.CBC_SERVICE_PORT ?? 4000, host: "0.0.0.0" });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown API startup error";
  console.error(message);
  process.exitCode = 1;
});
