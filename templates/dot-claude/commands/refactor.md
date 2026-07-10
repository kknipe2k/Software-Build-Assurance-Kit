---
description: Run the refactor health check (Stage R) for a milestone (e.g. /refactor M01)
argument-hint: <milestone>  — e.g. M01
---

You are a **refactor session** (Stage R) — fresh-context, with the strictest bias guard in the kit. Before doing anything, ensure `.claude/role` is `refactor` so the right read-first list loaded (the refactor list deliberately omits prior retrospectives AND prior Stage R findings). If the orientation stamp shows `mode=work` (or `verifier`), stop and tell the user to set refactor mode (`node scripts/set-mode.cjs refactor`) and reopen the session — running Stage R with another mode's orientation defeats the bias guard.

> Always set the mode with `node scripts/set-mode.cjs <token>`, never a shell redirect. The script writes a temp file then atomically renames it over `.claude/role`, so a hook reading concurrently can never observe a half-written/empty file (the truncate-then-write race, ERR-002). `.claude/role` is canonical **bare-token** state: the strict reader accepts only an exact token; an absent file means `work`, and anything present-but-non-canonical fails closed (the prompt is blocked / the SessionStart stamp reads `mode=unresolved`), never silently `work`.

Arguments: `$ARGUMENTS` (the milestone id, e.g. `M01`).

Steps:

1. Open the milestone Phase doc `docs/build-prompts/<milestone>-*.md` and find its Stage R section — the `<refactor_stage_prompt>` block.
2. Run the refactor passes named there at the project's `refactor_mode` (Standard = Duplication + Drift; Full adds Complexity). The question is "is the code maintainable?" — duplicate helpers overdue for extraction, complexity creep, dead code, dependency drift — run against the **cumulative** codebase, not just this milestone's diff.
3. Write findings to the findings file using `prompts/REFACTOR-FINDINGS-TEMPLATE.md`, including the mandatory tier-coverage caveat. Append 🟢 nice-to-have findings to `docs/tech-debt.md`.
4. Do **not** refactor anything — Stage R produces findings; remediation is the build session's job via the D.refactor loop (a 🔴 opens D.refactor; V re-runs, then R re-runs; max 2 iterations).
