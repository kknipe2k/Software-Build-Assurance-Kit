---
description: On-demand off-track review against docs/backlog.md (e.g. /on-track or /on-track M03)
argument-hint: [milestone]  — optional, e.g. M03 to scope the review to one milestone's commits
---

You are running an **on-demand off-track check** — a fast, in-session gut-check on whether the build is working the backlog top-down or has drifted onto lower-value work. This is invocation path (c) of the off-track check (`proposals/OFF-TRACK-CHECK.md` §4.2c; gate G8).

**This command runs IN THE CURRENT SESSION. It sets NO `role`.** Do **not** `echo` anything into `.claude/role`, do **not** ask the user to open a fresh CLI session, and do **not** treat this as a stage prompt. `/on-track` is deliberately *not* a verifier/refactor-style fresh-context stage — it is an ad-hoc slash command, so the `user-prompt-submit-mode-check.cjs` hook never blocks it (that hook guards pasted *stage* prompts whose mode disagrees with `role`; this is neither).

> **Known trade-off (state it if drift is subtle).** Because this runs in the work session that chose the current work, it inherits that session's self-justification bias — it reliably catches *gross* drift ("three ⏳-backlog items shipped while #2 sits untouched") but may rationalize *subtle* drift. The rigorous backstops are the mandatory paths: the per-stage retro line (every stage) and the full closeout check (every milestone). `/on-track` is the convenience escape hatch, not a replacement for those.

Arguments: `$ARGUMENTS` — optional milestone id (e.g. `M03`) to scope the commit review; absent → review against all recent work.

Steps:

1. Read `docs/backlog.md` (the ranked, HITL-co-authored backlog) and `docs/scope.md` (the milestone plan). **First, sanity-check freshness:** if the ranking looks stale (priorities clearly shifted since the last re-rank), say so before judging — a review is only as good as the doc's currency. Do not re-rank it yourself; flag it for the user.
2. Read recent commits — `git log --oneline` scoped to `$ARGUMENTS` if a milestone was given (e.g. that milestone's commits), else the recent history.
3. Run the off-track question (`OFF-TRACK-CHECK.md` §4.1): is the highest-priority story that is **unblocked and in scope** the one being built? For any inversion (a lower-ranked story built ahead of a higher-ranked backlogged one), is it justified by a build-sequence necessity (HARD DEPENDENCY / FOUNDATIONAL SCAFFOLDING / COST-OF-CHANGE / RISK DE-RISKING) recorded in `docs/off-track-log.md`? An **unlogged inversion is off track by default**.
4. Produce the review **inline** (this is not a findings file): for each relevant inversion, state highest-priority-unblocked `#N` · built `#M` · justified? Y/N (reason / log ref). End with a one-line verdict: **on track** / **off track — surface and redirect**.
5. Do **not** edit `docs/backlog.md` or `docs/off-track-log.md` yourself. If the review concludes a re-rank or a new log entry is warranted, *propose* it and let the user ratify (G8 clause b — HITL co-authorship; no AI-only backlog edits).
