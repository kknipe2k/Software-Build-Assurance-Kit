---
description: Approve the open stage's RED tests, unlocking implementation edits (human action)
---

You are confirming, **as the human reviewer**, that you have read the surfaced failing (RED) tests for the open stage and approve their design. This is gate 2 of the three-gate per-stage loop (plan → **red** → stage-end).

This is YOUR action, not the agent's — run it only after you have actually reviewed the test files the agent surfaced at the red-stop.

> **The RED-RELEASE line (M22 ruling 5).** In the two-brain flow the release arrives in the orchestrator's RED verdict packet as the explicit line `RED-RELEASE: approved — builder, run node scripts/approve-red.cjs`; the agent may run the command **only in response to that line**, with this command's `ask` prompt as your release click. Approval language without the line **is not a release** — the agent stops and tells you `/approve-red` is required. (Running it yourself, here or from your own shell, always works too.)

Steps:

1. Run `node scripts/approve-red.cjs`. It reads `.claude/stage-active` and atomically writes `.claude/red-approved = <that stage id>`.
2. The PROC-001 PreToolUse red-gate now allows implementation edits for **this** stage. A later `/stage` clears the approval (a fresh stage starts un-approved); so does closing the stage at commit (`node scripts/stage-active.cjs --clear`).

If it errors with "no .claude/stage-active", there is no open stage — the gate is dormant and nothing needs approving.

> Honest scope: the gate is a process bar-raise, not a wall. It matches only the edit tools (a `Bash` heredoc write bypasses it) and does not catch test-deletion or test-weakening — it is effective only paired with this red-review and a mutation-kill check.
