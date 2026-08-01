import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packageUrl = new URL("../package.json", import.meta.url);
const originalVersion = JSON.parse(readFileSync(packageUrl, "utf8")).version;

function runNpm(args) {
  const result = spawnSync(npmCommand, args, { stdio: "inherit" });
  return result.status ?? 1;
}

const bumpStatus = runNpm(["version", "patch", "--no-git-tag-version"]);
if (bumpStatus !== 0) process.exit(bumpStatus);

const buildStatus = runNpm(["run", "build"]);
if (buildStatus === 0) process.exit(0);

console.error(`Production build failed; restoring local version v${originalVersion}.`);
const restoreStatus = runNpm(["version", originalVersion, "--no-git-tag-version"]);
if (restoreStatus === 0) {
  console.error("Rebuilding the previous version so the browser directory is not left stale.");
  runNpm(["run", "build"]);
} else {
  console.error("Automatic version rollback failed; inspect package.json and package-lock.json.");
}

process.exit(buildStatus);
