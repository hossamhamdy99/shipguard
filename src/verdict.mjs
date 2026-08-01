/**
 * Reading a review — from the frontmatter block, not from the prose or the body.
 *
 * ── Why not prose, and why not an inline marker ──────────────────────────────────
 * The first reader parsed the verdict out of the review's PROSE and went blind on the shape of
 * a real rejection (a modifier between the label and the word); an approving line above it read
 * as `ship`. Replacing that with an inline `<!-- verdict: ship -->` marker moved the blindness
 * into markdown itself: a marker shown as documentation — inside a code fence, an unclosed
 * fence, a nested fence of a different type or length, an indented code block — read as a real
 * declaration. An adversarial tester kept finding the next fence shape. The honest conclusion:
 * deciding "is this marker inside code?" IS markdown parsing, and markdown parsing is a rabbit
 * hole with a `ship` at the bottom of it.
 *
 * So the verdict is not anywhere in the document body. It is a field in the **frontmatter** —
 * the `--- … ---` block that must be the very first thing in the file:
 *
 *     ---
 *     reviewed-through: 46c037bc2734
 *     verdict: ship
 *     ---
 *
 *     <the write-up: any language, any markdown, any fenced examples — none of it is read>
 *
 * Frontmatter is position-anchored: it can only exist at the start of the file, so a reviewer
 * who DOCUMENTS the format lower down cannot approve themselves, however they fence or indent
 * it. There is nothing to parse in the body and no code context to model. Both fields the gate
 * trusts — the commit read and the verdict — live here, together, where they cannot be quoted.
 */

/** Parse the leading frontmatter block into `{ key: [values…] }`, keys lower-cased. */
function frontmatter(body) {
  const block = String(body).match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const fields = {};
  if (!block) return fields;
  for (const line of block[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*?)[ \t]*$/);
    if (kv) (fields[kv[1].toLowerCase()] ??= []).push(kv[2]);
  }
  return fields;
}

const SHIP = /^ship$/i;
const NO_SHIP = /^no[\s_-]?ship$/i;

/**
 * @returns {"ship"|"no-ship"|"unreadable"}
 *   `unreadable` — no readable `verdict:` in the frontmatter — is reported by the gate, not
 *   silently discarded, so an author who forgot it finds out while they can still add it.
 *   `no-ship` wins over `ship`; a malformed value ("no  ship", "ship!") is `unreadable`, not
 *   skipped past a valid one.
 */
export function readVerdict(body) {
  const vals = frontmatter(body)["verdict"];
  if (!vals || !vals.length) return "unreadable";
  const kinds = vals.map((v) => (NO_SHIP.test(v) ? "no-ship" : SHIP.test(v) ? "ship" : "malformed"));
  if (kinds.includes("no-ship")) return "no-ship";
  if (kinds.includes("malformed")) return "unreadable";
  return "ship";
}

/**
 * The commit the reviewer read, from frontmatter — returned as its raw token for the caller to
 * resolve against git. `null` unless it is present and shaped like a sha (7–40 hex): a moving
 * ref like `main` is not a review of a fixed commit, so it is not accepted.
 */
export function readReviewedThrough(body) {
  const v = (frontmatter(body)["reviewed-through"] ?? [])[0];
  return v && /^[0-9a-f]{7,40}$/i.test(v) ? v : null;
}

/** The review format, quoted verbatim in the gate's own messages. */
export const REVIEW_FORMAT = "---\nreviewed-through: <sha>\nverdict: ship        (or: no-ship)\n---";
