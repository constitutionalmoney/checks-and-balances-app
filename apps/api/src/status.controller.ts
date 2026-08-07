import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { protocolStatus } from "@cbc/contracts";
import type { RuntimeConfig } from "@cbc/config";
import type { FastifyReply } from "fastify";

import { DEPENDENCY_CHECKER, RUNTIME_CONFIG } from "./tokens.js";
import type { DependencyChecker } from "./readiness.js";

@ApiTags("foundation")
@Controller()
export class StatusController {
  constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(DEPENDENCY_CHECKER) private readonly dependencyChecker: DependencyChecker,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Process liveness" })
  @ApiResponse({ status: 200, description: "The API process is alive." })
  health() {
    return { status: "ok", service: "api" } as const;
  }

  @Get("ready")
  @ApiOperation({ summary: "Runtime dependency readiness" })
  @ApiResponse({ status: 200, description: "All local runtime dependencies are ready." })
  @ApiResponse({ status: 503, description: "One or more dependencies are unavailable." })
  async ready(@Res({ passthrough: true }) response: FastifyReply) {
    const report = await this.dependencyChecker();
    if (!report.ready) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  @Get("api/v1/protocol/status")
  @ApiOperation({ summary: "Non-operational protocol release status" })
  @ApiResponse({ status: 200, description: "Shared specification and VRSCTEST status." })
  status() {
    return {
      ...protocolStatus,
      environment: this.config.CBC_ENVIRONMENT,
    } as const;
  }
}
