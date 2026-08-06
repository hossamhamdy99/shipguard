/**
 * unwired-exports — the export that is defined, tested, documented as the right path, and
 * called by NOTHING in production.
 *
 * Why this is worse than an ordinary dead function: test coverage does not save you here, it
 * deceives you. A green test on an unwired export proves the function works IN THE TEST. The
 * real screens keep calling the old path, the new one is never reached, and the passing suite
 * is exactly what stops anyone from re-deriving, by hand, "who actually calls this?".
 *
 * Two decisions make it real instead of decoration:
 *
 *   1. Strip comments before matching. This is the whole thing. A first version that scanned
 *      raw source stayed green after an export was fully unwired, because the function name
 *      was still sitting in a comment that described it as wired. The description is what
 *      lies; it has to be removed from the measurement. Proven by mutation test: neuter
 *      stripComments and test/unwired-exports.test.mjs goes red on exactly that fixture.
 *
 *   2. A symbol used inside its own file is wired, not dead. Exporting an internal helper so
 *      a test can reach it directly is legitimate and common; counting a same-file use as
 *      real is what keeps the check from shouting at healthy code. A checker that cries wolf
 *      is switched off within a week.
 *
 * The allowlist is itself checked: every entry needs a written reason, and the moment an
 * exempted export becomes wired (or stops existing), the entry is reported as stale — so the
 * list can never quietly grow until it cancels the check by instalments.
 *
 * Scope: declaration exports (export function|const|let|var|class NAME). Re-export lists and
 * default exports are intentionally out of scope — a narrow check that is trusted beats a
 * broad one that is switched off.
 */

const DECL = /\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;

/** Remove line and block comments, preserving string and template contents verbatim. */
export function stripComments(src) {
  const s = String(src ?? "");
  let out = "", i = 0, state = "code";
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; i += 2; continue; }
      if (c === "'") { state = "sq"; out += c; i++; continue; }
      if (c === '"') { state = "dq"; out += c; i++; continue; }
      if (c === "`") { state = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += c; } i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { state = "code"; i += 2; continue; } if (c === "\n") out += c; i++; continue; }
    const q = state === "sq" ? "'" : state === "dq" ? '"' : "`";
    if (c === "\\") { out += c + (d ?? ""); i += 2; continue; }
    if (c === q) { state = "code"; out += c; i++; continue; }
    out += c; i++; continue;
  }
  return out;
}

function esc(id) { return id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function refCount(stripped, name) {
  const re = new RegExp("(?<![\\w$])" + esc(name) + "(?![\\w$])", "g");
  let c = 0;
  while (re.exec(stripped) !== null) c++;
  return c;
}

const defaultIsTest = (p) => /(^|\/)tests?(\/|$)/.test(p) || /\.(test|spec)\.[mc]?js$/.test(p);
const defaultIsLib = (p) => /\.[mc]?js$/.test(p);

/**
 * @param {{path:string, source:string}[]} files
 * @param {{ isTest?:(p:string)=>boolean, isLib?:(p:string)=>boolean, allow?:{name:string,reason:string}[] }} opts
 * @returns {{ dead:{name:string,file:string,onlyTests:boolean}[], staleAllow:{name:string,why:string}[], ok:boolean }}
 */
export function findUnwiredExports(files, opts = {}) {
  const isTest = opts.isTest ?? defaultIsTest;
  const isLib = opts.isLib ?? defaultIsLib;
  const allow = Array.isArray(opts.allow) ? opts.allow : [];

  const stripped = new Map();
  for (const f of files) stripped.set(f.path, stripComments(f.source));

  const exportsList = [];
  for (const f of files) {
    if (isTest(f.path) || !isLib(f.path)) continue;
    const src = stripped.get(f.path);
    DECL.lastIndex = 0;
    let m;
    while ((m = DECL.exec(src)) !== null) exportsList.push({ name: m[1], file: f.path });
  }

  const dead = [];
  for (const { name, file } of exportsList) {
    let nonTestRef = false, testRef = false;
    for (const f of files) {
      let c = refCount(stripped.get(f.path), name);
      if (f.path === file) c -= 1;
      if (c <= 0) continue;
      if (isTest(f.path)) testRef = true; else nonTestRef = true;
    }
    if (!nonTestRef) dead.push({ name, file, onlyTests: testRef });
  }

  const allowByName = new Map(allow.map((a) => [a && a.name, a]));
  const deadNames = new Set(dead.map((d) => d.name));
  const staleAllow = [];
  for (const a of allow) {
    if (!a || !a.reason || !String(a.reason).trim()) { staleAllow.push({ name: (a && a.name) || "(unnamed)", why: "allowlist entry has no written reason" }); continue; }
    if (!deadNames.has(a.name)) staleAllow.push({ name: a.name, why: "no longer an unwired export — remove this exemption" });
  }

  const reportedDead = dead.filter((d) => !allowByName.has(d.name));
  return { dead: reportedDead, staleAllow, ok: reportedDead.length === 0 && staleAllow.length === 0 };
}
