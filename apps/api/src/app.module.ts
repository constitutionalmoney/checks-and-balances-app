import type { RuntimeConfig } from "@cbc/config";
import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";

import type { DependencyChecker } from "./readiness";
import { StatusController } from "./status.controller";
import { DEPENDENCY_CHECKER, RUNTIME_CONFIG } from "./tokens";

@Module({})
export class AppModule {
  static register(config: RuntimeConfig, dependencyChecker: DependencyChecker): DynamicModule {
    return {
      module: AppModule,
      controllers: [StatusController],
      providers: [
        { provide: RUNTIME_CONFIG, useValue: config },
        { provide: DEPENDENCY_CHECKER, useValue: dependencyChecker },
      ],
    };
  }
}
