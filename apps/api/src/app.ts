import "reflect-metadata";

import { loadRuntimeConfig, type RuntimeConfig } from "@cbc/config";
import { createLogger, StructuredApplicationLogger } from "@cbc/observability";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import {
  checkRuntimeDependencies,
  type DependencyChecker,
  type ReadinessReport,
} from "./readiness.js";
import { createWalletLinkHttpFacade, type WalletLinkHttpFacade } from "./wallet-link-http.js";

export interface ApiAppOptions {
  readonly config?: RuntimeConfig;
  readonly dependencyChecker?: DependencyChecker;
  readonly walletLinkFacade?: WalletLinkHttpFacade;
}

export interface ApiApp {
  readonly app: NestFastifyApplication;
  readonly config: RuntimeConfig;
  readonly dependencyChecker: DependencyChecker;
}

export async function createApiApp(options: ApiAppOptions = {}): Promise<ApiApp> {
  const config = options.config ?? loadRuntimeConfig(process.env);
  const dependencyChecker = options.dependencyChecker ?? (() => checkRuntimeDependencies(config));
  const walletLinkFacade = options.walletLinkFacade ?? createWalletLinkHttpFacade(config);
  const logger = createLogger("api", config.CBC_LOG_LEVEL);
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, dependencyChecker, walletLinkFacade),
    adapter,
    { logger: new StructuredApplicationLogger(logger) },
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: false });
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onClose", async () => walletLinkFacade.close());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Checks & Balances Protocol foundation API")
    .setDescription(
      "Non-operational protocol status plus disabled-by-default VRSCTEST wallet-link contracts.",
    )
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
