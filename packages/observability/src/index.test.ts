import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./index";

describe("createLogger", () => {
  it("redacts sensitive fields in structured output", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger("test", "info", destination);

    logger.info(
      {
        password: "not-a-real-secret",
        email: "synthetic@example.test",
        sessionToken: "synthetic-session-bearer",
        auth: { recoveryToken: "synthetic-recovery-bearer" },
        req: { headers: { cookie: "synthetic-cookie-bearer" } },
      },
      "event",
    );

    await new Promise<void>((resolve) => destination.end(resolve));
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("not-a-real-secret");
    expect(output).not.toContain("synthetic@example.test");
    expect(output).not.toContain("synthetic-session-bearer");
    expect(output).not.toContain("synthetic-recovery-bearer");
    expect(output).not.toContain("synthetic-cookie-bearer");
  });

  it("redacts Verus Mobile request, response, token, and identity fields", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger("test", "info", destination);

    logger.info({
      rawResponse: "raw-wallet-bytes",
      requestId: "iRequest",
      pollingToken: "poll-token",
      qrPayload: "qr-payload",
      sameDeviceUrl: "verus://1/private",
      identityAddress: "iSelectedIdentity",
    });

    await new Promise<void>((resolve) => destination.end(resolve));
    expect(output).not.toContain("raw-wallet-bytes");
    expect(output).not.toContain("poll-token");
    expect(output).not.toContain("iSelectedIdentity");
    expect(output.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
