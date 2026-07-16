---
description: Run a build stage from its Phase doc (e.g. /stage M01 A)
argument-hint: <milestone> <stage>  — e.g. M01 A
---

You are a **build/work session**. Execute the named stage from its Phase doc instead of having the XML pasted in by hand.

Arguments: `$ARGUMENTS` (milestone id then stage letter, e.g. `M01 A`).

Steps:

1. Confirm orientation loaded — the SessionStart hook should have emitted a `[read-first stamp] mode=work …` line. If it didn't, stop and tell the user orientation failed (don't run a stage blind).
2. Confirm `.claude/role` is `work` (or absent). If it's `verifier`/`orchestrator`, stop — the UserPromptSubmit guard would block a stage prompt anyway; the user is in the wrong session type.
3. Open the milestone Phase doc: `docs/build-prompts/<milestone>-*.md` (match by the milestone id from the arguments).
4. Mark the stage open for the PROC-001 red-gate: run `node scripts/stage-active.cjs <milestone>.<stage>` (e.g. `M01.A`). This writes `.claude/stage-active` and clears any stale `.claude/red-approved` — a fresh stage starts un-approved, so the hard red-gate now blocks implementation edits until the human runs `/approve-red`.
5. Find the stage's CLI-prompt section — the `### <stage>.5 CLI Prompt` heading — and read the fenced ` ```xml ` `<work_stage_prompt>` (or `<closeout_stage_prompt>`) block inside it.
6. Execute that stage prompt exactly as if it had been pasted into a fresh session: state your deliverable + test plan and wait for approval (gate 1); write the failing tests, then **stop at the red-stop** (gate 2) and wait for the human's `/approve-red` — under the hard red-gate your implementation edits are blocked until then; do the work, fill the retrospective, then surface the stage-end packet and wait — **do not commit without approval** (gate 3). At commit/stage close, clear the markers: `node scripts/stage-active.cjs --clear`.

If the Phase doc or the named stage section doesn't exist, say so and stop. If the milestone has no XML stage prompts (Lite tier), work from the markdown task list in the Phase doc instead.
