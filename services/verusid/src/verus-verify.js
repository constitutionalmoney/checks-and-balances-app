const http = require("node:http");
const https = require("node:https");

const MAX_RPC_BYTES = 1024 * 1024;
const REVOKED_FLAG = 0x10000;

async function getIdentityFromChain(iaddress, config) {
  return rpc(config, "getidentity", [iaddress]);
}

async function rpc(config, method, params) {
  const url = new URL(config.rpcUrl);
  const transport = url.protocol === "https:" ? https : http;
  const body = JSON.stringify({ jsonrpc: "2.0", id: "cbc-auth", method, params });
  const username = config.rpcUser || decodeURIComponent(url.username || "");
  const password = config.rpcPassword || decodeURIComponent(url.password || "");

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname || "/"}${url.search}`,
        method: "POST",
        auth: username ? `${username}:${password}` : undefined,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (response) => {
        let received = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > MAX_RPC_BYTES) {
            request.destroy(new Error("Verus RPC response exceeded the size limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error("Verus RPC returned a non-success status"));
            return;
          }
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (parsed.error) reject(new Error("Verus RPC rejected the request"));
            else resolve(parsed.result);
          } catch {
            reject(new Error("Verus RPC returned invalid JSON"));
          }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("Verus RPC timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

function validateIdentityActive(result, expectedIdentity, expectedSystem) {
  const identity = result && result.identity;
  if (
    !identity ||
    result.status !== "active" ||
    identity.identityaddress !== expectedIdentity ||
    identity.systemid !== expectedSystem ||
    !Number.isSafeInteger(identity.flags) ||
    (identity.flags & REVOKED_FLAG) !== 0
  ) {
    throw new Error("Identity is not currently active on the approved chain");
  }
  return {
    identityAddress: identity.identityaddress,
    displayName:
      typeof result.fullyqualifiedname === "string" ? result.fullyqualifiedname : undefined,
    raw: result,
  };
}

module.exports = { getIdentityFromChain, validateIdentityActive };
