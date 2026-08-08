require("dotenv").config();

const { createApp } = require("./app");
const { loadConfig } = require("./config");
const logger = require("./logger");
const { RedisStore } = require("./store");
const { ProductionVerusAdapter } = require("./verus-adapter");

async function main() {
  const config = loadConfig();
  const store = RedisStore.connect(config.redisUrl);
  await store.ping();
  const verus = new ProductionVerusAdapter(config);
  await verus.preflight();
  const app = createApp({ config, store, verus });
  const server = app.listen(config.port, config.host, () => {
    logger.info("service_started");
  });

  async function shutdown() {
    server.close(async () => {
      await store.close().catch(() => undefined);
      process.exit(0);
    });
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch(() => {
    logger.error("startup_failed");
    process.exitCode = 1;
  });
}

module.exports = { createApp, loadConfig };
