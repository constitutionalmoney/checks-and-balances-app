import "reflect-metadata";

import { loadRuntimeConfig, type RuntimeConfig } from "@cbc/config";
import { createLogger, StructuredApplicationLogger } from "@cbc/observability";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import {
  checkRuntimeDependencies,
  type DependencyChecker,
  type ReadinessReport,
} from "./readiness";

export interface ApiAppOptions {
  readonly config?: RuntimeConfig;
  readonly dependencyChecker?: DependencyChecker;
}

export interface ApiApp {
  readonly app: NestFastifyApplication;
  readonly config: RuntimeConfig;
  readonly dependencyChecker: DependencyChecker;
}

export async function createApiApp(options: ApiAppOptions = {}): Promise<ApiApp> {
  const config = options.config ?? loadRuntimeConfig(process.env);
  const dependencyChecker = options.dependencyChecker ?? (() => checkRuntimeDependencies(config));
  const logger = createLogger("api", config.CBC_LOG_LEVEL);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, dependencyChecker),
    new FastifyAdapter(),
    { logger: new StructuredApplicationLogger(logger) },
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: false });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Checks & Balances Protocol foundation API")
    .setDescription("Health and non-operational status shell only.")
    .setVersion("0.0.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  app
    .getHttpAdapter()
    .getInstance()
    .get("/api/openapi.json", async () => document);

  await app.init();
  return { app, config, dependencyChecker };
}

export async function assertReady(checker: DependencyChecker): Promise<ReadinessReport> {
  const report = await checker();
  if (!report.ready) {
    const failed = Object.entries(report.dependencies)
      .filter(([, dependency]) => !dependency.ok)
      .map(([name]) => name)
      .join(", ");
    throw new Error(`Startup dependency check failed: ${failed}`);
  }
  return report;
}
