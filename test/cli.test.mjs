/**
 * The CLI, in a real throwaway project.
 *
 * Two things are asserted that nothing else covers:
 *
 *   · `init` is IDEMPOTENT and never overwrites. Someone will run it twice — on a repo that
 *     already has a pre-push hook of its own. Clobbering that is how a tool gets uninstalled.
 *   · `check` decides on the EXIT CODE. Not on a string in the output. "Compiled
 *     successfully" prints before the steps that follow it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "shipguard.mjs");

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const proj = mkdtempSync(join(tmpdir(), "shipguard-cli-"));
const g = (...a) => execFileSync("git", a, { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sg = (...a) => spawnSync("node", [CLI, ...a], { cwd: proj, encoding: "utf8" });

try {
  g("init", "-q", "-b", "main");
  writeFileSync(join(proj, "README.md"), "x");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base");

  console.log("\n▸ init");
  const r1 = sg("init");
  check("exits 0", r1.status, 0);
  check("writes shipguard.config.json", existsSync(join(proj, "shipguard.config.json")), true);
  check("writes REVIEWS/", existsSync(join(proj, "REVIEWS")), true);
  check("installs the pre-push hook", existsSync(join(proj, ".git", "hooks", "pre-push")), true);

  console.log("\n▸ init twice does not clobber");
  writeFileSync(join(proj, "shipguard.config.json"), JSON.stringify({ risky: [], reviewsDir: "REVIEWS", mine: true }));
  writeFileSync(join(proj, ".git", "hooks", "pre-push"), "#!/bin/sh\necho mine\n");
  const r2 = sg("init");
  check("exits 0", r2.status, 0);
  check("keeps MY config", JSON.parse(readFileSync(join(proj, "shipguard.config.json"), "utf8")).mine, true);
  check("keeps MY hook", readFileSync(join(proj, ".git", "hooks", "pre-push"), "utf8").includes("echo mine"), true);
  check("and says so rather than staying silent", /already exists/.test(r2.stdout), true);

  console.log("\n▸ check decides on the exit code");
  // No review, and a risky file changed → must be non-zero.
  writeFileSync(join(proj, "shipguard.config.json"), JSON.stringify({
    reviewsDir: "REVIEWS",
    risky: [{ match: "money/**", why: "money" }],
    tests: [], commands: {},
  }));
  mkdirSync(join(proj, "money"), { recursive: true });
  writeFileSync(join(proj, "money", "total.js"), "export const t = 1;");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "money");
  const r3 = sg("check");
  check("non-zero with no review", r3.status !== 0, true);

  console.log("\n▸ a failing command fails the check, whatever it printed");
  writeFileSync(join(proj, "shipguard.config.json"), JSON.stringify({
    reviewsDir: "REVIEWS", risky: [], tests: [],
    // Prints a reassuring line, then fails. This is the exact shape that shipped once.
    commands: { build: "echo 'Compiled successfully' && exit 1" },
  }));
  const r4 = sg("check");
  check("says it compiled…", /Compiled successfully/.test(r4.stdout), true);
  check("…and still fails", r4.status !== 0, true);

  console.log("\n▸ the bypass is loud");
  const r5 = spawnSync("node", [CLI, "check"], {
    cwd: proj, encoding: "utf8",
    env: { ...process.env, SHIPGUARD_SKIP: "1" },
  });
  check("warns that the gate did not run", /did NOT run/.test(r5.stdout), true);

  console.log("\n▸ a crash is a FAILURE, not a pass (found on day one, in itself)");
  // shipguard's first run against shipguard crashed with a stack trace and exit 0, because
  // the exception escaped before `run()` returned a number. A deploy script would have
  // carried straight on, past a gate that was not running.
  writeFileSync(join(proj, "shipguard.config.json"), "{ this is not json");
  const r7 = sg("check");
  check("non-zero on unreadable config", r7.status !== 0, true);
  check("and says what is wrong instead of a stack trace",
    /not valid JSON/.test(r7.stdout + r7.stderr), true);

  console.log("\n▸ a repo with no commits does not explode");
  // `init` then `check` before the first commit is the first thing anyone will do.
  const fresh = mkdtempSync(join(tmpdir(), "shipguard-fresh-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: fresh });
    spawnSync("node", [CLI, "init"], { cwd: fresh, encoding: "utf8" });
    writeFileSync(join(fresh, "shipguard.config.json"),
      JSON.stringify({ reviewsDir: "REVIEWS", risky: [], tests: [], commands: {} }));
    const r8 = spawnSync("node", [CLI, "check"], { cwd: fresh, encoding: "utf8" });
    check("exits 0", r8.status, 0);
    check("and says so in words", /no commits yet/.test(r8.stdout), true);
  } finally { rmSync(fresh, { recursive: true, force: true }); }

  console.log("\n▸ review never blocks");
  writeFileSync(join(proj, "shipguard.config.json"),
    JSON.stringify({ reviewsDir: "REVIEWS", risky: [], tests: [], commands: {} }));
  const r6 = sg("review");
  check("exits 0 even when it has nothing good to report", r6.status, 0);
} finally {
  rmSync(proj, { recursive: true, force: true });
}

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
