const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("This workspace requires pnpm 11.20.0. Run: corepack pnpm install");
  process.exit(1);
}
