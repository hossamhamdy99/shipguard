/**
 * Can the secret scanner say "clean" while blind?
 *
 * That question was never asked of `hooks/secret-scan.sh`, and the answer was yes — twice,
 * and both were found by RUNNING it, not by reading it:
 *
 *   1. The `-----BEGIN … PRIVATE KEY-----` pattern begins with dashes, and `grep -nE "$p"`
 *      read them as options. grep errored to stderr and the pattern never ran — so a staged
 *      private key sailed straight through while the scanner reported clean. The single
 *      highest-value secret it claims to catch was the one pattern that never executed.
 *
 *   2. `for f in $FILES` split the file list on whitespace, so a staged file whose name
 *      contains a space was never scanned. Its key passed untouched, while the same key in a
 *      space-free name was caught (and, from the split, scanned twice).
 *
 * So the FIRST assertions here stage exactly those two things and demand a catch. Against the
 * code as it was, they fail. That is the point: a scanner's first test is not whether it
 * finds the key you expected — it is whether it can miss one and still say clean.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "secret-scan.sh");

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const repo = mkdtempSync(join(tmpdir(), "shipguard-secret-"));
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (p, s) => { mkdirSync(join(repo, dirname(p)), { recursive: true }); writeFileSync(join(repo, p), s); };
const scan = () => spawnSync("bash", [SCAN], { cwd: repo, encoding: "utf8" });

// Stage exactly these files, scan, then return the index and working tree to clean so the
// next case cannot contaminate this one (a stray staged key would make "clean passes" lie).
function scanWith(files) {
  for (const [p, s] of files) write(p, s);
  g("add", "-A");
  const r = scan();
  g("reset", "-q");
  for (const [p] of files) rmSync(join(repo, p), { force: true });
  return r;
}

// Realistic-looking but fake. The key body is never a real secret.
const OPENAI = "sk-" + "A".repeat(40);
const PRIVKEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\n" +
  "b3BlbnNzaC1rZXktdjEAAAAA_fake_fake_fake_not_a_real_key_AAAA\n" +
  "-----END OPENSSH PRIVATE KEY-----\n";

try {
  g("init", "-q", "-b", "main");
  write("README.md", "hi");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base");

  console.log("\n▸ The blind spots this file exists for (these fail against the code as it was)");
  let r = scanWith([["id_ed25519", PRIVKEY]]);
  check("a staged PRIVATE KEY is caught (exit 1)", r.status, 1);
  check("…and the file is named", /id_ed25519/.test(r.stdout), true);

  r = scanWith([["my key.txt", `const k = "${OPENAI}";\n`]]);
  check("a key in a file whose name has a space is caught (exit 1)", r.status, 1);
  check("…and that file is named, not swallowed", /my key\.txt/.test(r.stdout), true);

  console.log("\n▸ Controls — the catches that already worked, and the passes that must stay passes");
  r = scanWith([["config.js", `const k = "${OPENAI}";\n`]]);
  check("an sk- key in a normal file is caught", r.status, 1);
  check("and the key itself is never printed (only a redacted excerpt)", r.stdout.includes(OPENAI), false);

  r = scanWith([["hello.js", "export const hi = 1;\n"]]);
  check("a clean staged file passes (exit 0)", r.status, 0);

  // An example file is meant to carry placeholders; flagging it teaches people to --no-verify.
  r = scanWith([["config.example.js", `const k = "${OPENAI}";\n`]]);
  check("an *.example file carrying a key is skipped (exit 0)", r.status, 0);
} finally {
  rmSync(repo, { recursive: true, force: true });
}

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
