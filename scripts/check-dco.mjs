import { spawnSync } from "node:child_process";

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD^";
const range = `${base}..HEAD`;
const log = spawnSync("git", ["log", "--format=%H%x1f%B%x1e", range], { encoding: "utf8" });

if (log.status !== 0) {
  console.error(log.stderr || `Unable to inspect DCO range ${range}`);
  process.exit(log.status ?? 1);
}

const failures = log.stdout
  .split("\x1e")
  .filter((entry) => entry.trim().length > 0)
  .flatMap((entry) => {
    const [sha = "unknown", body = ""] = entry.split("\x1f");
    return /^Signed-off-by:\s+.+\s+<[^>]+>\s*$/im.test(body) ? [] : [sha.trim()];
  });

if (failures.length > 0) {
  console.error(`Commits missing DCO sign-off: ${failures.join(", ")}`);
  process.exit(1);
}

console.warn(`DCO sign-off verified for ${range}.`);
