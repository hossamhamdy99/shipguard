/**
 * Reading a review's verdict.
 *
 * ── Why this is its own file, and the first one written ──────────────────────────
 * This function was blind for three days on the project shipguard came from, and the
 * blindness was invisible: it kept working, it kept printing, and it kept refusing deploys
 * for a reason that had stopped being true.
 *
 * The parser matched an English verdict line only. The project's reviews are written in
 * Arabic — reviewers are *instructed* to write in Arabic — so every passing review was
 * silently discarded. The gate fell back to the last English review, from four days
 * earlier, and demanded a fresh review of work that had already been reviewed and approved.
 *
 * Measured cost before anyone noticed: four `SKIP_REVIEW` deploys in one night, and
 * `SKIP_REVIEW` becoming a reflex — which is the exact behaviour the gate exists to prevent.
 * A guard that cries wolf teaches people to walk past it.
 *
 * ── The ordering is the whole design ─────────────────────────────────────────────
 * Rejection is matched BEFORE approval, and that is not a stylistic choice:
 *
 *     Arabic:  «ماينشرش» (does not ship)  CONTAINS  «ينشر» (ships)
 *     English: "does not ship"            CONTAINS  "ship"
 *
 * If the positive pattern is tested first, a review that concludes **do not ship** is read
 * as approval. Being too strict costs time. Being too lax ships the bug the reviewer found
 * and wrote down. Those are not symmetric, so the order is not negotiable — and
 * `test/verdict.test.mjs` asserts it against real rejection lines, not invented ones.
 *
 * ── And one more thing that only shows up when you run it ────────────────────────
 * `\b` in JavaScript is defined over ASCII word characters. The boundary between «ر» and
 * «.» is not a word boundary to it, so `/ينشر\b/` does **not** match «ينشر.» — the most
 * common way the word appears. The first version of the Arabic patterns had `\b` on every
 * alternative and matched nothing at all. It was found by running it, not by reading it.
 *
 * The same class of bug was already sitting in the English patterns and had been for
 * months: `/ship\b/` does not match "ships", which is how most reviewers actually write it.
 */

/**
 * Built-in vocabularies. A verdict line is `<label><separator><word>` — the label anchors
 * the match so that quoting "do not ship" inside a finding does not fail an approving review.
 *
 * `no` and `yes` are RegExp source fragments, alternation-ready.
 */
export const VOCABULARIES = {
  en: {
    labels: ["verdict"],
    no: "do[\\s-]*not[\\s-]*ship|don'?t[\\s-]*ship|blocked?|reject(?:ed)?",
    // `ships?` not `ship\b` — see the header.
    yes: "ship(?:s|ped)?(?:\\s+with\\s+fixes)?\\b|approved?\\b|lgtm\\b",
  },
  ar: {
    labels: ["الحكم", "الحُكم"],
    // ⚠️ No `\b` after Arabic — it is an ASCII-only boundary and never matches there.
    no: "ما\\s*ي(?:نزل|نشر|طلع)ش|مش\\s*ه?ي(?:نزل|نشر)|ما\\s*ينفعش|مرفوض",
    yes: "ينفع\\s*ي(?:نشر|نزل)|ي(?:نشر|نزل|طلع)|مقبول",
  },
};

/** Characters allowed between the label and the word: colon, quotes, markdown bold, space. */
const SEP = "[:\\s*«»\"'`\\-–—]*";

function build(vocabs) {
  const labels = vocabs.flatMap((v) => v.labels).join("|");
  const no = vocabs.map((v) => v.no).join("|");
  const yes = vocabs.map((v) => v.yes).join("|");
  return {
    no: new RegExp(`(?:${labels})${SEP}(?:${no})`, "i"),
    yes: new RegExp(`(?:${labels})${SEP}(?:${yes})`, "i"),
  };
}

/**
 * Build a verdict reader.
 *
 * @param {string[]} locales  Which vocabularies to understand. Defaults to ALL of them —
 *   deliberately. A reviewer writing in their own language must never silently invalidate
 *   their own review; that is the bug this file exists because of. Restricting this is
 *   possible but you should have a reason.
 * @param {{labels: string[], no: string, yes: string}[]} extra  Your own vocabularies.
 */
export function verdictReader(locales = Object.keys(VOCABULARIES), extra = []) {
  const vocabs = [...locales.map((l) => {
    const v = VOCABULARIES[l];
    if (!v) throw new Error(`shipguard: unknown verdict vocabulary "${l}"`);
    return v;
  }), ...extra];
  if (vocabs.length === 0) throw new Error("shipguard: no verdict vocabulary configured");

  const { no, yes } = build(vocabs);

  /**
   * @returns {"ship"|"no-ship"|"unreadable"}
   *   `unreadable` matters as much as the other two: a review whose verdict cannot be parsed
   *   was silently DISCARDED in the original implementation. Here it is reported, so the
   *   author finds out that their review did not count while they can still fix the line.
   */
  return function readVerdict(body) {
    if (no.test(body)) return "no-ship";     // ← before `yes`. See the header.
    if (yes.test(body)) return "ship";
    return "unreadable";
  };
}

/** Convenience: the default reader, understanding every built-in vocabulary. */
export const readVerdict = verdictReader();
