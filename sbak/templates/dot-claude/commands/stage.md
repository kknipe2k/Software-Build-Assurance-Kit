---
description: Run a build stage from its Phase doc (e.g. /stage M01 A)
argument-hint: <milestone> <stage>  — e.g. M01 A
---

You are a **build/work session**. Execute the named stage from its Phase doc instead of having the XML pasted in by hand.

Arguments: `$ARGUMENTS` (milestone id then stage letter, e.g. `M01 A`).

Steps:

1. Confirm orientation loaded — the SessionStart hook should have emitted a `[read-first stamp] role=work …` line. If it didn't, stop and tell the user orientation failed (don't run a stage blind).
2. Confirm `.claude/role` is `work` (or absent). If it's `verifier`/`orchestrator`, stop — the UserPromptSubmit guard would block a stage prompt anyway; the user is in the wrong session type.
3. Open the milestone Phase doc: `docs/build-prompts/<milestone>-*.md` (match by the milestone id from the arguments).
4. Mark the stage open for the PROC-001 red-gate: run `node scripts/stage-active.cjs <milestone>.<stage>` (e.g. `M01.A`). This writes `.claude/stage-active` and clears any stale `.claude/red-approved` — a fresh stage starts un-approved, so the hard red-gate now blocks implementation edits until the human runs `/approve-red`. When this repo has an orchestrator worktree, the open is refused unless the orchestrator's watcher is live: it prints one line - type `/listen <milestone>.<stage>` in the orchestrator window, then open the stage again - and opens nothing; stop and say so, never work around it. Every open prints one loud `STAGE OPEN:` line and publishes the stage-open packet itself, carrying that line, so the orchestrator's pickup surfaces it; quote the line in your reply (there is no separate publish). With no orchestrator worktree (Lite, or before the split) the line says the gate did not apply and packets travel by the human courier for this stage; say so once.
5. Find the stage's CLI-prompt section — the `### <stage>.5 CLI Prompt` heading — and read the fenced ` ```xml ` `<work_stage_prompt>` (or `<closeout_stage_prompt>`) block inside it.
6. Execute that stage prompt exactly as if it had been pasted into a fresh session: state your deliverable + test plan (gate 1), publish it as the gate-1 packet — write the packet to a file and run `node scripts/channel.cjs publish --class stage-packet --kind gate-1 --body-file <file>` — and wait for approval; write the failing tests, then **stop at the red-stop** (gate 2) and wait for the human's `/approve-red` — under the hard red-gate your implementation edits are blocked until then; do the work, run the stage-end gate `node scripts/verify-local.cjs --lane stage` (the affected + active tests over the whole milestone diff, plus the always-tagged guards; every push already ran `fast`), fill the retrospective, then surface the stage-end packet and wait — **do not commit without approval** (gate 3). The red-stop and stage-end packets publish the same way (`--kind red-stop`, `--kind stage-end`), and once the stage is committed its record names the commit word seq beside the sha (`committed <sha> on the commit word seq <n>` - the channel seq of the message that carried the commit word); the RED verdict arrives as an approval-request that the pickup surfaces and that only the human's `/approve-red` consumes. End every turn while the stage is open by arming the watcher in the background — `node scripts/channel.cjs watch` — and run `node scripts/channel.cjs pickup` when it wakes you; surface what it prints verbatim. At commit/stage close, clear the markers: `node scripts/stage-active.cjs --clear`.
7. **End every turn with the channel status, two lines, then one loud last line.** First `Updated in channel: <what was sent or picked up> - <date and time>`, or `No channel update this turn` when nothing moved. Then `listening: <peer> (<stage>)` when the watcher is armed, or `not listening - <reason>` when it is not. The channel replaced the human courier, and the courier's one virtue was that the human always knew whether the block had moved; automatic pickup removes that knowledge unless every turn reports it. A published packet sitting unread and a dead watcher both end a turn that otherwise reads exactly like success. Then the third line, in bold: `YOU: <the exact thing to type or do>` when the person is needed, or `YOU: nothing - waiting on <what>` when they are not. The person must never have to read the turn to find out whether they are needed.

Before the first `best_practice_first` lookup of the stage, print one line naming what you will look up and roughly how long it takes (for example: `Looking up 3 things before the plan - the test runner's current release, its coverage flag, the lint preset - about 2 minutes.`); then one progress line as each lookup finishes. A silent five-minute lookup reads as a hung session.

Packet counts are derived, never estimated: every count a packet states names the command it came from (e.g. the smoke run banner, `git diff --stat`, a `grep -c`) beside the number.

Throwaway probes go in your session scratchpad; evidence the stage-end packet cites goes in `.claude/measurements/<stage>/` and is committed with the stage; delete the rest before stage-end.

D.fix iteration stages carry a trailing iteration digit — `M01.D.1` is the first D.fix round of stage D (`/stage M01 D.1`); two fix rounds never share one id.

If the Phase doc or the named stage section doesn't exist, say so and stop. If the milestone has no XML stage prompts (Lite tier), work from the markdown task list in the Phase doc instead.
