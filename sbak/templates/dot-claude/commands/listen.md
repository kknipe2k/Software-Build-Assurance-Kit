---
description: Put the orchestrator session on listen for a stage (arms the channel watcher once; every later turn re-arms it)
argument-hint: <stage>  — e.g. M30.I
---

You are the **orchestrator session**. Put this session on listen for the named stage: from here on the builder's packets (stage-open, gate-1, red-stop, stage-end, clarification questions) arrive over the terminal channel and wake this session; nothing is copied by hand.

Arguments: `$ARGUMENTS` (the stage id, e.g. `M30.I`).

Steps:

1. Run `node scripts/channel.cjs status` once and show its two lines (role, repo identity, whose turn it is, unread count). If it names a fault or `0 builder worktrees`, stop: the channel starts at the worktree split, and until then packets travel by the human courier.
2. If it reports unread messages, run `node scripts/channel.cjs pickup` and surface what it prints - one plain line per message plus the block itself, verbatim.
3. Arm the watcher in the background: `node scripts/channel.cjs watch`. It blocks until the builder's inbox grows, then exits and wakes this session with `channel: N new from builder (seq a..b, <class>) - run: node scripts/channel.cjs pickup`. Say `listening: builder (<stage>)` and end the turn.
4. On every wake: pickup, adjudicate with the human, surface what needs a decision, and re-arm the watcher as the LAST action of the turn. Every message to the builder leaves ONLY on the human's typed `/send`.
