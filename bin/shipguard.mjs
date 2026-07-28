#!/usr/bin/env node
/**
 * shipguard — checks that can actually stop a deploy.
 *
 * Everything decides on the EXIT CODE, never by searching output text. "Compiled
 * successfully" prints before the steps that come after it; a grep for it reports success on
 * a build that failed thirty seconds later. That mistake shipped once and is why this note
 * exists.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewGate } from "../src/review-gate.mjs";
import { runTests } from "../src/run-tests.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();
const CONFIG = join(CWD, "shipguard.config.json");

const BYPASS = "SHIPGUARD_SKIP";

function loadConfig() {
  if (!existsSync(CONFIG)) {
    console.error("shipguard: no shipguard.config.json here. Run `npx shipguard init`.");
    process.exit(2);
  }
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); }
  catch (e) {
    console.error(`shipguard: shipguard.config.json is not valid JSON — ${e.message}`);
    process.exit(2);
  }
}

// ── init ──────────────────────────────────────────────────────────────────────────
function init() {
  const changed = [];

  if (existsSync(CONFIG)) {
    console.log("· shipguard.config.json already exists — left alone.");
  } else {
    copyFileSync(join(HERE, "..", "shipguard.config.example.json"), CONFIG);
    changed.push("shipguard.config.json");
  }

  const reviews = join(CWD, "REVIEWS");
  if (!existsSync(reviews)) {
    mkdirSync(reviews, { recursive: true });
    writeFileSync(join(reviews, "README.md"),
      "# Reviews\n\nOne file per review. Each must contain the commit it read:\n\n" +
      "    <!-- reviewed-through: <sha> -->\n\n" +
      "Copy that sha with `git rev-parse --short=12 <commit>` — never retype it.\n" +
      "It names the commit the reviewer READ, not the commit that fixed the findings.\n");
    changed.push("REVIEWS/");
  }

  const hookDir = join(CWD, ".git", "hooks");
  if (existsSync(join(CWD, ".git"))) {
    const hook = join(hookDir, "pre-push");
    if (existsSync(hook)) {
      console.log("· .git/hooks/pre-push already exists — left alone. See hooks/pre-push to merge it in.");
    } else {
      mkdirSync(hookDir, { recursive: true });
      copyFileSync(join(HERE, "..", "hooks", "pre-push"), hook);
      chmodSync(hook, 0o755);
      changed.push(".git/hooks/pre-push");
    }
  } else {
    console.log("· not a git repo — hook not installed.");
  }

  console.log(changed.length ? `\n✅ wrote: ${changed.join(" · ")}` : "\n✅ nothing to do.");
  console.log("\nNext: edit `risky` in shipguard.config.json — the paths where a mistake reads");
  console.log("as a plausible number instead of an error. Then wire `npx shipguard check`");
  console.log("into your deploy script. A check you have to remember to type will only be");
  console.log("typed by someone who is already suspicious, which is always too late.\n");
  return 0;
}

// ── check ─────────────────────────────────────────────────────────────────────────
function check() {
  const cfg = loadConfig();
  let failed = false;

  if (cfg.tests?.length) {
    console.log("▸ tests");
    const r = runTests(cfg.tests);
    if (!r.ok) failed = true;
  }

  for (const [label, cmd] of Object.entries(cfg.commands ?? {})) {
    console.log(`▸ ${label}`);
    const r = spawnSync(cmd, { shell: true, stdio: "inherit" });
    if (r.status !== 0) { console.log(`❌ ${label} failed (exit ${r.status})`); failed = true; }
  }

  console.log("▸ review gate");
  if (process.env[BYPASS]) {
    // Bypassing must be loud. A quiet bypass becomes the default within a week — measured.
    console.log(`⚠️  ${BYPASS} is set — the review gate did NOT run.`);
    console.log("   Write that in the commit message, with the reason. A bypass nobody");
    console.log("   can see is the same as no gate.");
  } else {
    const r = reviewGate(cfg, { cwd: CWD });
    for (const l of r.lines) console.log(l);
    if (!r.ok) failed = true;
  }

  return failed ? 1 : 0;
}

// ── review ────────────────────────────────────────────────────────────────────────
function review() {
  const r = reviewGate(loadConfig(), { cwd: CWD });
  for (const l of r.lines) console.log(l);
  return 0;   // reporting only — never blocks
}

// ⚠️ **An unexpected exception must be a FAILURE, not a silent pass.**
//    shipguard's first run against itself crashed with a stack trace and `exit=0` — the
//    exception escaped before `run()` returned a number, so the shell reported the last
//    successful command. A deploy script would have carried straight on.
//    Which is precisely the thing this package exists to prevent: a check that says fine
//    while being broken. It found it in itself on day one.
process.on("uncaughtException", (e) => {
  console.error(`\n❌ shipguard crashed — treating that as a FAILURE, not a pass.\n   ${e.message}\n`);
  process.exit(3);
});

const cmd = process.argv[2];
const run = { init, check, review }[cmd];
if (!run) {
  console.log("shipguard\n");
  console.log("  npx shipguard init     write config, REVIEWS/, and the pre-push hook");
  console.log("  npx shipguard check    run everything; the exit code decides");
  console.log("  npx shipguard review   what changed since the last passing review\n");
  process.exit(cmd ? 2 : 0);
}
process.exit(run());
