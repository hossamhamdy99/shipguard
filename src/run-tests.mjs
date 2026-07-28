/**
 * The test runner.
 *
 * ── The one thing it does that `npm test` does not ───────────────────────────────
 * It reports **which suites did not run**, in the summary line, every time.
 *
 * "All green" is a lie in a pleasant colour when two suites were skipped because their
 * credentials are missing. On the project this came from, two live-integration suites had
 * been skipped for weeks and every summary said green. Nobody was lying; the summary was.
 *
 * So the final line here is `N passed · M failed · K skipped` and, when `K > 0`, an explicit
 * sentence saying green does not cover them. A number that flatters you is worse than no
 * number, because you stop looking.
 */

import { spawnSync } from "node:child_process";

/**
 * @param {[name: string, command: string, why: string, opts?: {optional?: boolean}][]} suites
 */
export function runTests(suites, { env = process.env } = {}) {
  const results = [];
  console.log("");

  for (const [name, command, why, opts = {}] of suites) {
    const r = spawnSync(command, { shell: true, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
    const out = (r.stdout ?? "") + (r.stderr ?? "");

    // A suite may opt out by exiting rather than failing — but it must SAY it skipped, and
    // the skip is counted separately. `optional: true` means "missing prerequisites are a
    // skip, not a failure"; anything else is a failure.
    const skipped = opts.optional && /\bskip(?:ped|ping)?\b/i.test(out) && r.status !== 0;

    if (skipped) { console.log(`  ${name} ⏭️  skipped — ${why}`); results.push({ name, state: "skipped", out }); continue; }
    if (r.status === 0) { console.log(`  ${name} … ✅`); results.push({ name, state: "passed", out }); continue; }

    console.log(`  ${name} … ❌`);
    console.log(out.split("\n").slice(-25).map((l) => "     " + l).join("\n"));
    results.push({ name, state: "failed", out });
  }

  const passed = results.filter((r) => r.state === "passed").length;
  const failed = results.filter((r) => r.state === "failed").length;
  const skipped = results.filter((r) => r.state === "skipped");

  console.log("");
  console.log(failed
    ? `❌  ${passed} passed · ${failed} failed · ${skipped.length} skipped`
    : `✅  ${passed} passed · 0 failed · ${skipped.length} skipped`);

  // ⚠️ This sentence is the point of the file. Do not make it conditional on `failed`.
  if (skipped.length) {
    console.log(`   note: ${skipped.length} suite(s) did not run — green here does not cover them:`);
    for (const s of skipped) console.log(`         · ${s.name}`);
  }
  console.log("");

  return { passed, failed, skipped: skipped.length, ok: failed === 0 };
}
