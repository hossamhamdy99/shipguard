#!/usr/bin/env node
/**
 * Migrate old review files to the frontmatter format — the MECHANICAL half, and only that.
 *
 * Each old review already carries the commit it read, as `<!-- reviewed-through: <sha> -->`.
 * This tool MOVES that sha into a frontmatter block and DELIBERATELY does not write `verdict:`.
 *
 * A review with frontmatter but no `verdict:` reads as `unreadable`, so the gate refuses it with
 * the "add this block" message. That is the point: a half-migrated repo stays SAFE, and a human
 * is forced to supply the one field that is a judgment — never a script guessing `ship` vs
 * `no-ship` from prose. On a real corpus the verdicts are not all mechanical (an approval that
 * quotes a past `DO NOT SHIP`, a genuine no-ship); a helper that guessed those would be worse
 * than no helper. So it does not guess. It moves what is unambiguous and stops.
 *
 * Usage:  node bin/migrate-reviews.mjs [REVIEWS_DIR] [--dry-run]
 *   REVIEWS_DIR defaults to "REVIEWS". --dry-run prints what would change and writes nothing.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dir = args.find((a) => !a.startsWith("--")) ?? "REVIEWS";

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`migrate-reviews: no such directory: ${dir}`);
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
let moved = 0;
const skipped = [];

for (const f of files) {
  const path = join(dir, f);
  const body = readFileSync(path, "utf8");

  // Already frontmatter'd → leave it. (Makes the tool idempotent: safe to run twice.)
  if (/^﻿?---[ \t]*\r?\n/.test(body)) { skipped.push([f, "already has frontmatter"]); continue; }

  const m = body.match(/reviewed-through:\s*([0-9a-f]{7,40})/i);
  if (!m) { skipped.push([f, "no reviewed-through sha — migrate this one by hand"]); continue; }

  // Move it: drop a standalone `<!-- reviewed-through: … -->` line, prepend the frontmatter.
  const rest = body.replace(/^[ \t]*<!--[ \t]*reviewed-through:[^>]*-->[ \t]*\r?\n?/im, "").replace(/^\s+/, "");
  const out = `---\nreviewed-through: ${m[1]}\n---\n\n${rest}`;

  if (!dryRun) writeFileSync(path, out);
  console.log(`  ${dryRun ? "would move" : "moved   "} ${f}   (reviewed-through: ${m[1]}; verdict: — you add it)`);
  moved++;
}

console.log(`\n${dryRun ? "[dry run] " : ""}${moved} migrated, ${skipped.length} skipped.`);
for (const [f, why] of skipped) console.log(`     · ${f} — ${why}`);
console.log(
  "\nEach migrated file now has `reviewed-through:` but NO `verdict:`, so the gate will refuse it\n" +
  "until a human adds `verdict: ship` or `verdict: no-ship`. That field is a judgment; this tool\n" +
  "does not guess it."
);
process.exit(0);
