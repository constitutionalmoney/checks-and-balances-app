import pino, { type DestinationStream, type Logger } from "pino";

const REDACTED_PATHS = [
  "password",
  "secret",
  "seed",
  "privateKey",
  "wif",
  "rpcPassword",
  "authorization",
  "headers.authorization",
  "headers.cookie",
  "request.body",
  "evidence",
  "exactAddress",
  "email",
] as const;

export function createLogger(
  service: string,
  level = "info",
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      base: { service },
      level,
      redact: { paths: [...REDACTED_PATHS], censor: "[REDACTED]" },
    },
    destination,
  );
}

export class StructuredApplicationLogger {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
}
