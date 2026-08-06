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

// A review file: frontmatter (the commit read + the verdict) then a free-form body.
const review = (sha, verdict, body = "") => `---\nreviewed-through: ${sha}\nverdict: ${verdict}\n---\n${body}`;

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
  // while that same file's verdict said no-ship.
  write("REVIEWS/r1.md", review(base, "ship"));
  check("still refuses", inRepo(() => gate().ok), false);
  check("and names the file as not counting",
    inRepo(() => gate().lines.some((l) => l.includes("r1.md") && l.includes("not committed"))), true);

  console.log("\n▸ A committed, passing review at HEAD → passes");
  const withReview = commit("add review");
  write("REVIEWS/r1.md", review(withReview, "ship"));
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
  write("REVIEWS/r2.md", review(at, "ship"));
  commit("review the money change");
  write("src/ui/button.tsx", "export const B = 1;");
  commit("touch ui");
  check("passes", inRepo(() => gate().ok), true);
  check("reason", inRepo(() => gate().reason), "nothing-risky");

  console.log("\n▸ A no-ship review is not clearance (hole 2)");
  write("src/money/refund.ts", "export const r = 1;");
  const risky2 = commit("touch money again");
  write("REVIEWS/r3.md", review(risky2, "no-ship", "\nFound a real problem.\n"));
  commit("add rejecting review");
  check("refuses", inRepo(() => gate().ok), false);
  check("and says the verdict is the reason it did not count",
    inRepo(() => gate().lines.some((l) => l.includes("r3.md") && l.includes("no-ship"))), true);

  console.log("\n▸ An unresolvable sha is reported, not swallowed (hole 3)");
  write("REVIEWS/r4.md", review("deadbeefdead", "ship"));
  commit("add review with a retyped sha");
  check("names the file and the sha",
    inRepo(() => gate().lines.some((l) => l.includes("r4.md") && l.includes("deadbeefdead"))), true);

  console.log("\n▸ A missing verdict is reported (the four-bypass bug)");
  write("REVIEWS/r5.md", `---\nreviewed-through: ${risky2}\n---\n\nLooks fine to me.\n`);
  commit("add review with no verdict");
  check("names it as not counting",
    inRepo(() => gate().lines.some((l) => l.includes("r5.md") && l.includes("verdict"))), true);

  console.log("\n▸ A committed frontmatter approval at HEAD passes");
  write("REVIEWS/r6.md", review(g("rev-parse", "HEAD"), "ship"));
  commit("frontmatter review");
  check("passes on a frontmatter approval", inRepo(() => gate().ok), true);

  console.log("\n▸ A risky file dirty in the working tree is not covered by any review (hole 4)");
  // HEAD is fully reviewed (r6 points at HEAD), so the gate is on its ✅ fast path. A risky
  // change that lives only on disk — never committed — can be named by no review.
  write("src/money/checkout.ts", "export const total = 424242;");   // modified, tracked
  check("refuses on an uncommitted edit to a risky file", inRepo(() => gate().ok), false);
  check("reason is risky-uncommitted", inRepo(() => gate().reason), "risky-uncommitted");
  check("names the dirty risky file", inRepo(() => gate().lines.some((l) => l.includes("src/money/checkout.ts"))), true);
  g("checkout", "--", "src/money/checkout.ts");                      // revert
  check("reverting the edit clears the gate", inRepo(() => gate().ok), true);

  write("src/money/scratch.ts", "export const x = 1;");             // untracked, risky
  check("refuses on an untracked risky file", inRepo(() => gate().ok), false);
  check("reason is risky-uncommitted (untracked)", inRepo(() => gate().reason), "risky-uncommitted");
  rmSync(join(repo, "src/money/scratch.ts"), { force: true });

  write("src/ui/scratch.tsx", "export const Z = 1;");               // untracked, NOT risky
  check("a dirty non-risky file does not trip hole 4", inRepo(() => gate().ok), true);
  rmSync(join(repo, "src/ui/scratch.tsx"), { force: true });

  write("src/money/فاتورة.ts", "export const y = 1;");              // untracked risky, non-ASCII name
  check("an untracked risky file with an Arabic name is seen (quotepath off)", inRepo(() => gate().ok), false);
  check("reason is risky-uncommitted (non-ASCII)", inRepo(() => gate().reason), "risky-uncommitted");
  rmSync(join(repo, "src/money/فاتورة.ts"), { force: true });
} finally {
  rmSync(repo, { recursive: true, force: true });
}

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
