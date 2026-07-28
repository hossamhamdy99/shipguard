# Reviews

One file per review. Each must contain the commit it read:

    <!-- reviewed-through: <sha> -->

Copy that sha with `git rev-parse --short=12 <commit>` — never retype it.
It names the commit the reviewer READ, not the commit that fixed the findings.
