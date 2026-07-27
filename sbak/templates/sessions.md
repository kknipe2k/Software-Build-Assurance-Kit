# {{PROJECT_NAME}} — Session Register

> Append-only log of every Claude Code session against this repository. Each session adds one row at the bottom. Prior rows are never edited.

---

## Append-only rule

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4): prior rows must be byte-identical to their committed state. The rule always holds. Its **CI diff check is risk-armed** — `.github/workflows/append-only-ledger.yml` carries `docs/sessions.md` in its `LEDGERS` set and generates only when this project declares a risk trigger.

If a row needs correction, **add a new row** noting the correction. Do not edit the original.

---

## Format

| # | Started | Ended | Milestone | Stage | Outcome | Commit | Notes |
|---|---|---|---|---|---|---|---|
| 1 | YYYY-MM-DD HH:MM | YYYY-MM-DD HH:MM | M[NN] | [A-E] | Sound / Sound-but-rough / Friction-heavy / Not-ready / Aborted | `<short-sha>` or `n/a` | one line, max 100 chars |

The Notes column is the operational signal — orchestration sessions on a different machine read this column to understand what's actually on the build machine without needing the full retrospective. Surface the cross-machine state hint (`git log --oneline main..HEAD` summary) if relevant. See `CLAUDE.md` §19 rule 7.

**Outcome values** match the retrospective outcome rubric (`sbak/BUILD-PLAYBOOK.md` §3.5):

- **Sound** — gates clean, retrospective scored well, ready to proceed
- **Sound-but-rough** — proceeded, but protocol iteration recommended before next stage
- **Friction-heavy** — stopped; protocol needs work before proceeding
- **Not-ready** — hard gate failed; recovery session likely
- **Aborted** — session ended without producing a stage commit (e.g., environmental issues, user pivoted away)

**Commit field:**

- `<short-sha>` if the session produced a commit
- `n/a` if no commit (aborted, exploratory, etc.)
- `multiple` if the session somehow produced more than one commit (rare; investigate)

---

## Sessions

| # | Started | Ended | Milestone | Stage | Outcome | Commit | Notes |
|---|---|---|---|---|---|---|---|

<!--
Append new rows below as sessions complete. Example:

| 1 | 2025-01-15 09:30 | 2025-01-15 11:45 | M01 | A | Sound | abc1234 | Workspace skeleton, 2 self-corrections |
| 2 | 2025-01-16 14:00 | 2025-01-16 17:20 | M01 | B | Sound-but-rough | def5678 | TDD loop awkward; iterate on stage prompts |
-->

---

*This register is the project's chronological audit trail at session granularity. Combined with per-stage retrospectives and the gap-analysis ledger, it produces a forensic record that lets anyone reconstruct what happened and why.*
