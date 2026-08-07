import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://cbc:cbc_local_only@127.0.0.1:55432/cbc",
  },
});
