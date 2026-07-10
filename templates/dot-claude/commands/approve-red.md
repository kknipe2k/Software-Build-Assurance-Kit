---
description: Approve the open stage's RED tests, unlocking implementation edits (human action)
---

You are confirming, **as the human reviewer**, that you have read the surfaced failing (RED) tests for the open stage and approve their design. This is gate 2 of the three-gate per-stage loop (plan → **red** → stage-end).

This is YOUR action, not the agent's — run it only after you have actually reviewed the test files the agent surfaced at the red-stop.

Steps:

1. Run `node scripts/approve-red.cjs`. It reads `.claude/stage-active` and atomically writes `.claude/red-approved = <that stage id>`.
2. The PROC-001 PreToolUse red-gate now allows implementation edits for **this** stage. A later `/stage` clears the approval (a fresh stage starts un-approved); so does closing the stage at commit (`node scripts/stage-active.cjs --clear`).

If it errors with "no .claude/stage-active", there is no open stage — the gate is dormant and nothing needs approving.

> Honest scope: the gate is a process bar-raise, not a wall. It matches only the edit tools (a `Bash` heredoc write bypasses it) and does not catch test-deletion or test-weakening — it is effective only paired with this red-review and a mutation-kill check.
