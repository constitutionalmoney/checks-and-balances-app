import { randomUUID } from "node:crypto";

import { AuthError } from "@cbc/auth";
import { WalletLinkError } from "@cbc/verus-linking";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import { WALLET_LINK_HTTP_FACADE } from "./tokens.js";
import type { RequestAuthentication, WalletLinkHttpFacade } from "./wallet-link-http.js";

@ApiTags("optional VerusID linking")
@Controller("api/v1")
export class WalletLinkController {
  constructor(
    @Inject(WALLET_LINK_HTTP_FACADE)
    private readonly facade: WalletLinkHttpFacade,
  ) {}

  @Post("auth/verus/challenges")
  @ApiOperation({ summary: "Create an optional, one-time VRSCTEST VerusID-link request" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["consent"],
      properties: { consent: { type: "boolean", enum: [true] } },
    },
  })
  @ApiResponse({ status: 201, description: "Signed same-device and QR presentation." })
  @ApiResponse({ status: 401, description: "A baseline application session is required." })
  @ApiResponse({ status: 503, description: "The optional VRSCTEST feature is disabled." })
  async begin(
    @Body() body: { readonly consent?: boolean },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    response.header("cache-control", "no-store");
    try {
      return await this.facade.begin({
        authentication: authentication(request),
        consented: body.consent === true,
        now: new Date(),
        correlationId: correlationId(request),
      });
    } catch (error) {
      throw publicHttpError(error);
    }
  }

  @Get("auth/verus/challenges/status")
  @ApiOperation({ summary: "Poll an account-bound wallet-link challenge" })
  @ApiResponse({ status: 200, description: "Current challenge state." })
  @ApiResponse({ status: 401, description: "A baseline application session is required." })
  async poll(
    @Headers("x-cbc-wallet-poll-token") pollingToken: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    response.header("cache-control", "no-store");
    try {
      return await this.facade.poll({
        authentication: authentication(request),
        pollingToken,
        now: new Date(),
        correlationId: correlationId(request),
      });
    } catch (error) {
      throw publicHttpError(error);
    }
  }

  @Delete("auth/verus/challenges/:challengeReference")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cancel an account-bound wallet-link challenge" })
  @ApiResponse({ status: 204, description: "The pending challenge was cancelled." })
  async cancel(
    @Param("challengeReference") challengeReference: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    try {
      await this.facade.cancel({
        authentication: authentication(request),
        challengeReference,
        now: new Date(),
        correlationId: correlationId(request),
      });
    } catch (error) {
      throw publicHttpError(error);
    }
  }

  @Delete("account/verus-links/:linkReference")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Unlink a local VerusID association" })
  @ApiResponse({ status: 204, description: "The local association was unlinked." })
  async unlink(
    @Param("linkReference") linkReference: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    try {
      await this.facade.unlink({
        authentication: authentication(request),
        linkReference,
        now: new Date(),
        correlationId: correlationId(request),
      });
    } catch (error) {
      throw publicHttpError(error);
    }
  }
}

function authentication(request: FastifyRequest): RequestAuthentication {
  return {
    method: request.method,
    ...(request.headers.cookie ? { cookieHeader: request.headers.cookie } : {}),
    ...(request.headers.origin ? { origin: request.headers.origin } : {}),
    ...(typeof request.headers["x-cbc-csrf-token"] === "string"
      ? { csrfToken: request.headers["x-cbc-csrf-token"] }
      : {}),
  };
}

function correlationId(request: FastifyRequest): string {
  const supplied = request.headers["x-correlation-id"];
  return typeof supplied === "string" && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : `correlation_wallet_link_${randomUUID().replaceAll("-", "")}`;
}

function publicHttpError(error: unknown): HttpException {
  if (error instanceof AuthError) {
    const status =
      error.code === "RATE_LIMITED"
        ? HttpStatus.TOO_MANY_REQUESTS
        : error.code === "ORIGIN_REJECTED"
          ? HttpStatus.FORBIDDEN
          : HttpStatus.UNAUTHORIZED;
    return new HttpException("The authenticated request could not be accepted.", status);
  }
  if (error instanceof WalletLinkError) {
    const status =
      error.code === "FEATURE_DISABLED" || error.code === "MAINNET_BLOCKED"
        ? HttpStatus.SERVICE_UNAVAILABLE
        : error.code === "AUTH_SERVICE_UNAVAILABLE" || error.code === "AUTH_SERVICE_INCOMPATIBLE"
          ? HttpStatus.SERVICE_UNAVAILABLE
          : error.code === "CHALLENGE_EXPIRED"
            ? HttpStatus.GONE
            : error.code === "INVALID_REQUEST"
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.NOT_FOUND;
    return new HttpException(error.message, status);
  }
  return new HttpException("The request could not be accepted.", HttpStatus.CONFLICT);
}
