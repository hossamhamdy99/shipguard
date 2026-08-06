/**
 * shipguard's own suite, run through shipguard's own runner.
 *
 * Dogfooding is not a slogan here — it is the only reason the skipped-suite reporting is
 * honest. A runner that hides its own skips would hide yours.
 */
import { runTests } from "../src/run-tests.mjs";

const { ok } = runTests([
  ["verdict",     "node test/verdict.test.mjs",     "can the verdict reader approve while blind?"],
  ["review-gate", "node test/review-gate.test.mjs", "built against a real throwaway git repo, not mocks"],
  ["cli",         "node test/cli.test.mjs",         "init is idempotent and check decides on exit codes"],
  ["secret-scan", "node test/secret-scan.test.mjs", "can the secret scanner say clean while blind to a private key?"],
  ["migrate",     "node test/migrate-reviews.test.mjs", "can the migration helper guess a verdict? (it must not)"],
  ["unwired-exports", "node test/unwired-exports.test.mjs", "does a green test on an export nothing calls read as wired?"],
]);

process.exit(ok ? 0 : 1);
