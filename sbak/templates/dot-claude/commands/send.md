---
description: Send the block you just surfaced to the builder over the channel (orchestrator only; the human's keystroke is the record)
argument-hint: [--approval]  — add --approval when the block is the RED verdict carrying the RED-RELEASE line
---

You are the **orchestrator session**. The human just typed `/send`: that keystroke is the adjudication record, and the session's UserPromptSubmit hook has stamped it. Now carry the block you surfaced in your previous reply to the builder over the terminal channel - byte-identical, never re-worded.

Arguments: `$ARGUMENTS` - empty (a `courier` message: the build prompt, an answer, a verdict without a release) or `--approval` (an `approval-request`: the RED verdict packet whose last line is the RED-RELEASE line; the builder's pickup surfaces it and WAITS for the human's `/approve-red`).

Steps:

1. Write the exact block you surfaced (the one the human adjudicated) to `.claude/channel/outgoing.md` - no edits, no trimming.
2. Run `node scripts/channel.cjs send --kind <build-prompt|red-verdict|answer|message> --body-file .claude/channel/outgoing.md`, adding `--approval` when the argument says so. The script stamps your role from `.claude/role`, sequence-numbers and hashes the block, and prints one line: `channel: sent seq N to builder (<class>, <bytes> bytes, sha256 <12 hex>) - turn: <holder>`. Show that line; the builder's pickup prints the same hash, which is how the human sees both renderings agree.
3. End the turn by arming the watcher in the background: `node scripts/channel.cjs watch` - it exits when the builder's next packet lands and wakes this session; say `listening: builder (<stage>)`.

If the script refuses (`channel: send refused - no human action behind it`), do not retry: the human types `/send` again. If it names a fault (cursor gap, unparseable line, role or hash mismatch, no builder worktree), surface the line and fall back to the human courier for this one block.
