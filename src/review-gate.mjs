/**
 * The review gate.
 *
 * Refuses to deploy when a file on your *risky* list changed without a committed review
 * that (a) names the commit it actually read and (b) carries a passing verdict.
 *
 * ── Three holes, each found the expensive way ────────────────────────────────────
 *
 * 1. **A review must be COMMITTED.** The first version read the working tree, and a review
 *    demonstrated the hole by accident: writing the file flipped the gate from red to green
 *    while the file itself said DO NOT SHIP. Only what is in the tree at HEAD is real.
 *
 * 2. **A DO-NOT-SHIP review is not clearance.** It is the opposite. The marker says which
 *    commit was read; the verdict says whether it may ship. Both are required.
 *
 * 3. **The marker must name the commit that was READ, never the commit that fixed the
 *    findings.** Copy it with `git rev-parse --short=12` — retyping a short sha has produced
 *    a marker git could not resolve, which the gate then discarded in silence.
 *    It no longer does: an unresolvable marker is reported loudly, because a review that
 *    does not count is worse than no review — you think you are covered.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readVerdict, readReviewedThrough, REVIEW_FORMAT } from "./verdict.mjs";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * Minimal glob: `**` any depth (including none), `*` within one segment, `?` one character.
 *
 * ⚠️ Written as a tokeniser, not chained `.replace()` calls — because the chained version
 *    was wrong in a way that read perfectly fine. `**` was swapped for a space placeholder
 *    that a later rule turned into an optional "any leading segments" group — so a trailing
 *    `src/money` + double-star compiled to a pattern matching a DIRECTORY and no file
 *    inside it. Every
 *    `**` rule silently protected nothing, and the gate said ✅.
 *
 *    Reading it did not find that. Running it did — which is the whole argument of this
 *    package, arriving on its own first day.
 */
function globToRe(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") { out += "(?:[^/]+/)*"; i += 2; }   // `**/` → any leading segments, or none
      else { out += ".*"; i += 1; }                                 // trailing `**` → anything
    } else if (c === "*") {
      out += "[^/]*";                                              // must not cross a slash
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += /[.+^${}()|[\]\\]/.test(c) ? "\\" + c : c;
    }
  }
  return new RegExp(`^${out}$`);
}



export function riskOf(file, risky) {
  for (const rule of risky) {
    if (globToRe(rule.match).test(file)) return rule;
  }
  return null;
}

/**
 * @returns {{ok: boolean, reason: string, lines: string[]}}
 *   `ok:false` means: do not deploy. `lines` is what to print.
 */
export function reviewGate(config, { cwd = process.cwd() } = {}) {
  const lines = [];
  const dir = config.reviewsDir ?? "REVIEWS";

  // A repository with no commits yet — `git rev-parse HEAD` throws `fatal: ambiguous
  // argument`. Found on shipguard's own first run: `init` then `check` before the first
  // commit, which is the first thing anyone will do.
  let head;
  try { head = git("rev-parse", "HEAD"); }
  catch {
    lines.push("· review gate: this repository has no commits yet — nothing to review.");
    return { ok: true, reason: "no-commits", lines };
  }

  // ── Find the newest commit that a committed, passing review says it covers ──────
  let reviewed = null, reviewedIn = null;
  const ignored = [];

  const files = existsSync(join(cwd, dir))
    ? readdirSync(join(cwd, dir)).filter((f) => f.endsWith(".md"))
    : [];

  for (const f of files) {
    const path = `${dir}/${f}`;
    // Untracked or modified → just text on disk. (Hole 1.)
    try { execFileSync("git", ["ls-files", "--error-unmatch", path], { stdio: "ignore" }); }
    catch { ignored.push([f, "not committed"]); continue; }
    if (git("status", "--porcelain", "--", path) !== "") { ignored.push([f, "has uncommitted edits"]); continue; }

    const body = readFileSync(join(cwd, path), "utf8");
    const rt = readReviewedThrough(body);
    if (!rt) { ignored.push([f, "no `reviewed-through: <sha>` in the frontmatter"]); continue; }

    let sha;
    try { sha = git("rev-parse", rt); }
    catch { ignored.push([f, `reviewed-through \`${rt}\` — git cannot resolve it`]); continue; }

    const verdict = readVerdict(body);
    if (verdict === "no-ship") { ignored.push([f, "verdict is no-ship — the opposite of clearance"]); continue; }
    if (verdict === "unreadable") { ignored.push([f, "no readable `verdict:` in the frontmatter — see REVIEWS/README.md"]); continue; }

    // Newest wins: is this commit a descendant of the best one so far?
    if (reviewed === null || isAncestor(reviewed, sha)) { reviewed = sha; reviewedIn = f; }
  }

  // ⚠️ Ignored reviews are ALWAYS printed, even on success. A review that did not count is
  // the failure this gate is worst at: everything looks fine and nobody is covered.
  if (ignored.length) {
    lines.push("⚠️  reviews that did NOT count:");
    for (const [f, why] of ignored) lines.push(`     · ${dir}/${f} — ${why}`);
    lines.push("");
  }

  if (reviewed === null) {
    lines.push("❌ review gate: no committed, passing review on file.");
    lines.push("   Risky changes need a critical read by someone who did not write them:");
    lines.push(`   a committed ${dir}/*.md that opens with the frontmatter block —`);
    lines.push("");
    for (const fl of REVIEW_FORMAT.split("\n")) lines.push(`       ${fl}`);
    return { ok: false, reason: "no-review", lines };
  }

  if (reviewed === head) {
    lines.push(`✅ review gate: HEAD is reviewed (${reviewedIn}).`);
    return { ok: true, reason: "head-reviewed", lines };
  }

  const changed = git("diff", "--name-only", `${reviewed}..${head}`).split("\n").filter(Boolean);
  const hits = changed.map((f) => ({ f, rule: riskOf(f, config.risky ?? []) })).filter((x) => x.rule);

  if (hits.length === 0) {
    lines.push(`✅ review gate: ${changed.length} file(s) changed since ${reviewed.slice(0, 7)} (${reviewedIn}),`);
    lines.push("   none of them on the risky list.");
    return { ok: true, reason: "nothing-risky", lines };
  }

  lines.push(`❌ review gate: ${hits.length} risky file(s) changed since the last review`);
  lines.push(`   reviewed through ${reviewed.slice(0, 7)} in ${dir}/${reviewedIn}, HEAD is ${head.slice(0, 7)}`);
  lines.push("");
  const byWhy = new Map();
  for (const { f, rule } of hits) {
    if (!byWhy.has(rule.why)) byWhy.set(rule.why, []);
    byWhy.get(rule.why).push(f);
  }
  for (const [why, fs] of byWhy) {
    lines.push(`   ${why}:`);
    for (const f of fs.slice(0, 6)) lines.push(`     · ${f}`);
    if (fs.length > 6) lines.push(`     …and ${fs.length - 6} more`);
  }
  lines.push("");
  lines.push("   These are the paths where a mistake reads as a plausible number instead of an");
  lines.push("   error, so they do not ship on green checks alone. Save the review as");
  lines.push(`   ${dir}/<name>.md with:`);
  lines.push("");
  lines.push("       ---");
  lines.push(`       reviewed-through: ${head.slice(0, 12)}`);
  lines.push("       verdict: ship        (or: no-ship — reject wins)");
  lines.push("       ---");
  lines.push("");
  lines.push("   ⚠️  That sha must be the commit the reviewer READ. Copy it with");
  lines.push("       `git rev-parse --short=12 HEAD` — do not retype it.");
  return { ok: false, reason: "risky-unreviewed", lines };
}

function isAncestor(maybeAncestor, of) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", maybeAncestor, of], { stdio: "ignore" });
    return true;
  } catch { return false; }
}
