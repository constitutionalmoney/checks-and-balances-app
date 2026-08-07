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

    logger.info({ password: "not-a-real-secret", email: "synthetic@example.test" }, "event");

    await new Promise<void>((resolve) => destination.end(resolve));
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("not-a-real-secret");
    expect(output).not.toContain("synthetic@example.test");
  });
});
