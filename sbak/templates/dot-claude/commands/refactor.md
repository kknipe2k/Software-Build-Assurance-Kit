---
description: Run the refactor health check (Stage R) for a milestone (e.g. /refactor M01)
argument-hint: <milestone>  — e.g. M01
---

You are a **refactor session** (Stage R) — fresh-context, with the strictest bias guard in the kit. Before doing anything, ensure `.claude/role` is `refactor` so the right read-first list loaded (the refactor list deliberately omits prior retrospectives AND prior Stage R findings). If the orientation stamp shows `role=work` (or `verifier`), stop and tell the user to set refactor mode (`node scripts/set-mode.cjs refactor`) and reopen the session — running Stage R with another mode's orientation defeats the bias guard.

> Always set the mode with `node scripts/set-mode.cjs <token>`, never a shell redirect. The script writes a temp file then atomically renames it over `.claude/role`, so a hook reading concurrently can never observe a half-written/empty file (the truncate-then-write race, ERR-002). `.claude/role` is canonical **bare-token** state: the strict reader accepts only an exact token; an absent file means `work`, and anything present-but-non-canonical fails closed (the prompt is blocked / the SessionStart stamp reads `role=unresolved`), never silently `work`.

Arguments: `$ARGUMENTS` (the milestone id, e.g. `M01`).

Steps:

1. Open the milestone Phase doc `proposals/<milestone>-*.md (WORKSHOP-LOCAL: the kit repo keeps its milestone Phase docs in proposals/, e.g. proposals/M22-UAT-HARDENING.md)` and find its Stage R section — the `<refactor_stage_prompt>` block. Then publish the stage-open message so the orchestrator goes on listen, exactly as `/stage` does: `node scripts/channel.cjs publish --class stage-open --body <milestone>.R` (if it reports no channel - before the worktree split - the findings travel by the human courier; say so once).
2. Run the refactor passes named there at the project's `refactor_mode` (Lite skips Stage R; Full = Duplication + Drift, adding Complexity only when a linter integration is named in `docs/gates.md` — `FRAMEWORK-CONFIG.md` §4.11). The question is "is the code maintainable?" — duplicate helpers overdue for extraction, complexity creep, dead code, dependency drift — run against the **cumulative** codebase, not just this milestone's diff.
3. Write findings to the findings file using `templates/REFACTOR-FINDINGS-TEMPLATE.md (WORKSHOP-LOCAL: the kit repo keeps its templates in templates/; generated projects render them to prompts/)`, including the mandatory tier-coverage caveat. Append 🟢 nice-to-have findings to `docs/tech-debt.md`. At surface time publish the findings file as a stage-packet - `node scripts/channel.cjs publish --class stage-packet --kind refactor-findings --body-file <findings file>` - and end the turn by arming the watcher in the background: `node scripts/channel.cjs watch`. The orchestrator's verdict arrives as a courier message; run `node scripts/channel.cjs pickup` when the watcher wakes you and surface what it prints verbatim. Approvals are unchanged.
4. Do **not** refactor anything — Stage R produces findings; remediation is the build session's job via the D.refactor loop (a 🔴 opens D.refactor; V re-runs, then R re-runs; max 2 iterations).
