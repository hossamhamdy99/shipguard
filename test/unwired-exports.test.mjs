/**
 * The unwired-export check, against invented fixtures. Nothing here is from any real product.
 *
 * The assertion that carries the whole check: a dead export whose name still appears in a
 * COMMENT in production is STILL dead. That is the exact case a raw-source version passes on.
 * Neuter stripComments in src/unwired-exports.mjs and this file goes red on it — which is how
 * you know the test is doing its job and not decorating.
 */
import { findUnwiredExports } from "../src/index.mjs";

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}
const deadNames = (r) => r.dead.map((d) => d.name).sort();

const files = [
  { path: "src/lib.mjs", source: [
    "export function computeArea(w, h) { return w * h; }",
    "export function internalPad(s) { return ' ' + s + ' '; }",
    "export function label(name, w, h) {",
    "  return internalPad(name + ': ' + computeArea(w, h));",
    "}",
    "export function roundHalfUp(x) { return Math.floor(x + 0.5); }",
    "export const LEGACY_FLAG = 'v1';",
  ].join("\n") },
  { path: "src/app.mjs", source: [
    "import { label, computeArea } from './lib.mjs';",
    "// roundHalfUp is the rounding we standardised on — mentioned on purpose, never called.",
    "export function render(w, h) { return label('area', w, h) + ' ' + computeArea(w, h); }",
  ].join("\n") },
  { path: "src/main.mjs", source: [
    "import { render } from './app.mjs';",
    "console.log(render(2, 3));",
  ].join("\n") },
  { path: "test/lib.test.mjs", source: [
    "import { roundHalfUp } from '../src/lib.mjs';",
    "if (roundHalfUp(1.5) !== 2) throw new Error('bad');",
  ].join("\n") },
];

console.log("\n▸ a wired export is not flagged; a same-file helper counts as wired");
const base = findUnwiredExports(files);
check("computeArea (used across files) is not dead", base.dead.some((d) => d.name === "computeArea"), false);
check("label (called by production) is not dead", base.dead.some((d) => d.name === "label"), false);
check("render (called by main) is not dead", base.dead.some((d) => d.name === "render"), false);
check("internalPad (used only inside its own file) is not dead", base.dead.some((d) => d.name === "internalPad"), false);

console.log("\n▸ exported + tested + comment-mentioned, but called by nothing → dead");
check("roundHalfUp and LEGACY_FLAG are the dead ones", deadNames(base), ["LEGACY_FLAG", "roundHalfUp"]);
check("roundHalfUp is tested-but-unwired", (base.dead.find((d) => d.name === "roundHalfUp") || {}).onlyTests, true);
check("LEGACY_FLAG is a plain orphan (no refs at all)", (base.dead.find((d) => d.name === "LEGACY_FLAG") || {}).onlyTests, false);
check("overall not ok", base.ok, false);

console.log("\n▸ the production comment does NOT rescue roundHalfUp (comments are stripped)");
check("roundHalfUp is dead despite the comment naming it", base.dead.some((d) => d.name === "roundHalfUp"), true);

console.log("\n▸ allowlist exempts a known-dead export — but only with a written reason");
const allowed = findUnwiredExports(files, { allow: [{ name: "roundHalfUp", reason: "wiring lands in the next release" }] });
check("allowed roundHalfUp drops out of the failures", deadNames(allowed), ["LEGACY_FLAG"]);
check("a valid exemption is not reported as stale", allowed.staleAllow, []);

console.log("\n▸ the allowlist self-cleans");
const stale = findUnwiredExports(files, { allow: [{ name: "computeArea", reason: "x" }] });
check("exempting a wired export is reported as stale", stale.staleAllow.some((s) => s.name === "computeArea"), true);
check("and that fails the check", stale.ok, false);

const noReason = findUnwiredExports(files, { allow: [{ name: "roundHalfUp", reason: "  " }] });
check("an exemption with no reason is rejected", noReason.staleAllow.some((s) => s.name === "roundHalfUp"), true);

console.log(fails.length ? "\n❌  " + pass + " passed · " + fails.length + " failed\n" : "\n✅  " + pass + " passed · 0 failed\n");
process.exit(fails.length ? 1 : 0);
