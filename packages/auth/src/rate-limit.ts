import { keyedDigest } from "./crypto.js";
import { AuthError } from "./errors.js";

export interface RateLimitStore {
  increment(input: {
    readonly keyDigest: string;
    readonly bucket: string;
    readonly windowStartedAt: Date;
    readonly expiresAt: Date;
  }): Promise<number>;
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly secret: string,
  ) {}

  async requireWithinLimit(input: {
    readonly bucket: "login_network" | "login_account" | "recovery_network" | "recovery_account";
    readonly opaqueSubject: string;
    readonly now: Date;
    readonly windowMs: number;
    readonly limit: number;
  }): Promise<void> {
    const windowNumber = Math.floor(input.now.getTime() / input.windowMs);
    const windowStartedAt = new Date(windowNumber * input.windowMs);
    const keyDigest = keyedDigest(
      this.secret,
      `${input.bucket}:${input.opaqueSubject}:${windowNumber}`,
    );
    const count = await this.store.increment({
      keyDigest,
      bucket: input.bucket,
      windowStartedAt,
      expiresAt: new Date(windowStartedAt.getTime() + input.windowMs),
    });
    if (count > input.limit) throw new AuthError("RATE_LIMITED");
  }
}
