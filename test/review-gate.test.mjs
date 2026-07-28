/**
 * Can the review gate say ✅ while being wrong?
 *
 * The gate is tested against a REAL throwaway git repo built in a temp directory, not against
 * mocks — because two of the three holes it has had were in the interaction with git itself
 * (an uncommitted file counting as a review; a marker git could not resolve being discarded
 * in silence), and a mock would have reproduced neither.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewGate, riskOf } from "../src/review-gate.mjs";

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const CONFIG = {
  reviewsDir: "REVIEWS",
  risky: [
    { match: "src/money/**", why: "money" },
    { match: "lib/permissions.*", why: "who can see what" },
  ],
};

// ── a real repo ────────────────────────────────────────────────────────────────────
const repo = mkdtempSync(join(tmpdir(), "shipguard-"));
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (p, s) => { mkdirSync(join(repo, p, ".."), { recursive: true }); writeFileSync(join(repo, p), s); };
const commit = (m) => { g("add", "-A"); g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", m); return g("rev-parse", "HEAD"); };
const gate = () => reviewGate(CONFIG, { cwd: repo });
const inRepo = (fn) => { const old = process.cwd(); process.chdir(repo); try { return fn(); } finally { process.chdir(old); } };

try {
  g("init", "-q", "-b", "main");
  write("README.md", "hi");
  const base = commit("base");

  console.log("\n▸ Glob matching");
  check("src/money/checkout.ts is risky", riskOf("src/money/checkout.ts", CONFIG.risky)?.why, "money");
  check("src/money/deep/nested/x.ts is risky (** any depth)", riskOf("src/money/deep/nested/x.ts", CONFIG.risky)?.why, "money");
  check("lib/permissions.ts is risky", riskOf("lib/permissions.ts", CONFIG.risky)?.why, "who can see what");
  check("src/ui/button.tsx is not", riskOf("src/ui/button.tsx", CONFIG.risky), null);
  // `*` must not cross a slash — otherwise `lib/permissions.*` would match a whole subtree.
  check("lib/permissions/secret.ts is NOT matched by lib/permissions.*",
    riskOf("lib/permissions/secret.ts", CONFIG.risky), null);

  console.log("\n▸ No review at all → refuses");
  check("refuses", inRepo(() => gate().ok), false);
  check("and says why", inRepo(() => gate().reason), "no-review");

  console.log("\n▸ An UNCOMMITTED review does not count (hole 1)");
  // The original gate read the working tree, so merely writing the file turned it green —
  // while that same file said DO NOT SHIP.
  write("REVIEWS/r1.md", `<!-- reviewed-through: ${base} -->\n\n**Verdict: ships.**\n`);
  check("still refuses", inRepo(() => gate().ok), false);
  check("and names the file as not counting",
    inRepo(() => gate().lines.some((l) => l.includes("r1.md") && l.includes("not committed"))), true);

  console.log("\n▸ A committed, passing review at HEAD → passes");
  const withReview = commit("add review");
  write("REVIEWS/r1.md", `<!-- reviewed-through: ${withReview} -->\n\n**Verdict: ships.**\n`);
  commit("point review at itself");
  // The review now names an ancestor, and nothing risky changed since.
  check("passes", inRepo(() => gate().ok), true);

  console.log("\n▸ A risky file changed after the review → refuses");
  write("src/money/checkout.ts", "export const total = 1;");
  commit("touch money");
  check("refuses", inRepo(() => gate().ok), false);
  check("reason", inRepo(() => gate().reason), "risky-unreviewed");
  check("names the file", inRepo(() => gate().lines.some((l) => l.includes("src/money/checkout.ts"))), true);
  check("and says why it matters", inRepo(() => gate().lines.some((l) => l.includes("money:"))), true);

  console.log("\n▸ A non-risky file changed → passes");
  const at = g("rev-parse", "HEAD");
  write("REVIEWS/r2.md", `<!-- reviewed-through: ${at} -->\n\n**Verdict: ships.**\n`);
  commit("review the money change");
  write("src/ui/button.tsx", "export const B = 1;");
  commit("touch ui");
  check("passes", inRepo(() => gate().ok), true);
  check("reason", inRepo(() => gate().reason), "nothing-risky");

  console.log("\n▸ A DO-NOT-SHIP review is not clearance (hole 2)");
  write("src/money/refund.ts", "export const r = 1;");
  const risky2 = commit("touch money again");
  write("REVIEWS/r3.md", `<!-- reviewed-through: ${risky2} -->\n\n**Verdict: DO NOT SHIP.**\n\nFound a real problem.\n`);
  commit("add rejecting review");
  check("refuses", inRepo(() => gate().ok), false);
  check("and says the verdict is the reason it did not count",
    inRepo(() => gate().lines.some((l) => l.includes("r3.md") && l.includes("DO NOT SHIP"))), true);

  console.log("\n▸ An unresolvable marker is reported, not swallowed (hole 3)");
  write("REVIEWS/r4.md", "<!-- reviewed-through: deadbeefdead -->\n\n**Verdict: ships.**\n");
  commit("add review with a retyped sha");
  check("names the file and the sha",
    inRepo(() => gate().lines.some((l) => l.includes("r4.md") && l.includes("deadbeefdead"))), true);

  console.log("\n▸ An unreadable verdict is reported (the four-bypass bug)");
  write("REVIEWS/r5.md", `<!-- reviewed-through: ${risky2} -->\n\nLooks fine to me.\n`);
  commit("add review with no verdict line");
  check("names it as not counting",
    inRepo(() => gate().lines.some((l) => l.includes("r5.md") && l.includes("verdict line"))), true);

  console.log("\n▸ An Arabic verdict counts — the bug that motivated the whole package");
  write("REVIEWS/r6.md", `<!-- reviewed-through: ${g("rev-parse", "HEAD")} -->\n\n**الحكم: ينشر.**\n`);
  commit("Arabic review");
  check("passes on an Arabic approval", inRepo(() => gate().ok), true);
} finally {
  rmSync(repo, { recursive: true, force: true });
}

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
