import type { RuntimeConfig } from "@cbc/config";
import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";

import type { DependencyChecker } from "./readiness.js";
import { StatusController } from "./status.controller.js";
import { DEPENDENCY_CHECKER, RUNTIME_CONFIG, WALLET_LINK_HTTP_FACADE } from "./tokens.js";
import { WalletLinkController } from "./wallet-link.controller.js";
import type { WalletLinkHttpFacade } from "./wallet-link-http.js";

@Module({})
export class AppModule {
  static register(
    config: RuntimeConfig,
    dependencyChecker: DependencyChecker,
    walletLinkFacade: WalletLinkHttpFacade,
  ): DynamicModule {
    return {
      module: AppModule,
      controllers: [StatusController, WalletLinkController],
      providers: [
        { provide: RUNTIME_CONFIG, useValue: config },
        { provide: DEPENDENCY_CHECKER, useValue: dependencyChecker },
        { provide: WALLET_LINK_HTTP_FACADE, useValue: walletLinkFacade },
      ],
    };
  }
}
