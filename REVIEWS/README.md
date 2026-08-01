# Reviews

One file per review. It must **open** with a frontmatter block — the `--- … ---` at the very
top — carrying the commit read and the verdict. Nothing in the body is parsed.

    ---
    reviewed-through: <sha>
    verdict: ship          # or: no-ship
    ---

    <the write-up: any language, any markdown — none of it is read>

`reviewed-through` names the commit the reviewer READ — copy it with
`git rev-parse --short=12 <commit>`, never retype it — not the commit that fixed the findings.
`verdict` is `ship` or `no-ship`.

Only the frontmatter is read, and it must be the first thing in the file — so a review cannot
approve itself by documenting or quoting the format lower down, however it fences or indents it.
No `verdict:` → the review does not count, and the gate says so. If two `verdict:` lines
conflict, `no-ship` wins.
