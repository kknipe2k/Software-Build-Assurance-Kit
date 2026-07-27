---
description: Run the Verifier (Stage V) for a milestone (e.g. /verify M01)
argument-hint: <milestone>  — e.g. M01
---

You are a **verifier session** — fresh-context, bias-guarded. Before doing anything, ensure `.claude/role` is `verifier` so the right read-first list loaded (the verifier list deliberately omits prior retrospectives). If the orientation stamp shows `mode=work`, stop and tell the user to set verifier mode (`node scripts/set-mode.cjs verifier`) and reopen the session — running the Verifier with the work orientation defeats the bias guard.

> Always set the mode with `node scripts/set-mode.cjs <token>`, never a shell redirect. The script writes a temp file then atomically renames it over `.claude/role`, so a hook reading concurrently can never observe a half-written/empty file (the truncate-then-write race, ERR-002). `.claude/role` is canonical **bare-token** state: the strict reader accepts only an exact token; an absent file means `work`, and anything present-but-non-canonical fails closed (the prompt is blocked / the SessionStart stamp reads `mode=unresolved`), never silently `work`.

Arguments: `$ARGUMENTS` (the milestone id, e.g. `M01`).

Steps:

1. Open the milestone Phase doc `docs/build-prompts/<milestone>-*.md` and find its Stage V section — the `<verifier_stage_prompt>` block.
2. Run the verification passes named there at the project's `verifier_mode` (default Standard `pass_2_4` = hooks + behavior + security + code_quality — **no inventory pass** (§X.2 is advisory at Standard); add `design` when `deliverable_type: web`; Full `pass_1_2_3_4` adds inventory + multi-call). For `deliverable_type: web`, Pass 4 requires a literal observed-running step and Pass 5 the design-conformance check against `docs/design.md`.
3. Write findings to the findings file using `prompts/VERIFIER-FINDINGS-TEMPLATE.md`, including the mandatory tier-coverage caveat.
4. Do **not** fix anything — the Verifier produces findings; remediation is the build session's job via the D.fix loop.
