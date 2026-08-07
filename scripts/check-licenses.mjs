import { spawnSync } from "node:child_process";

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) {
  console.error("Unable to locate the active pnpm entrypoint.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [pnpmEntrypoint, "licenses", "list", "--json"], {
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error(result.stderr || "pnpm licence inventory failed");
  process.exit(result.status ?? 1);
}

const inventory = JSON.parse(result.stdout);
const serialized = JSON.stringify(inventory);
const unresolved = ["UNKNOWN", "UNLICENSED", "UNLICENCED"].filter((marker) =>
  serialized.toUpperCase().includes(marker),
);

if (unresolved.length > 0) {
  console.error(`Unresolved dependency licence markers: ${unresolved.join(", ")}`);
  process.exit(1);
}

console.warn("Dependency licence inventory contains no unresolved licence marker.");
