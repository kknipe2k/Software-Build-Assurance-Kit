# M[NN].R Refactor Findings

> Filled by Claude during the Refactor stage (Stage R — the refactor health check). Output artifact for `<findings_format>` per `sbak/STAGE-PROMPT-PROTOCOL.md` §8.6. Reviewed alongside the milestone's code diff. Distinct from `retrospectives/M[NN].V-findings.md` (Stage V — contract fidelity): Stage R asks **"is the code maintainable?"** against the *cumulative* codebase, not "did this milestone do what was promised?"

---

## Coverage caveat — read first

> ⚠️ **Stage R ran at {{TIER}} tier; passes are tier-conditional.**
>
> **Passes run:** {{PASSES_RUN}}
> **Passes NOT run:** {{PASSES_NOT_RUN}}
> **Structural classes NOT checked:** {{CLASSES_NOT_CHECKED}}
>
> "Refactor passed" means the active passes found no 🔴 structural debt — not that the codebase is free of all maintainability issues. Lite skips Stage R entirely; Standard runs Duplication + Drift (Complexity only if a linter integration is named in `docs/gates.md`); Full runs all three plus project-specific passes. Bug classes outside the active passes remain possible. Re-tier or name a linter integration if you need broader coverage.

This caveat is mandatory and must not be removed. Tier-coverage honesty is the difference between a useful refactor health check and false confidence that the codebase is clean.

---

## Scope of this Stage R

| | |
|---|---|
| **Cumulative since** | {{LAST_STAGE_R_OR_PROJECT_START — e.g. "project start" or "M[NN-1].R"}} |
| **Code paths reviewed** | {{src/, validators/, …}} |
| **Trigger** | {{tech-debt count ≥ N / milestone interval — whichever fired}} |
| **`refactor_mode`** | {{skip / trigger_n5 / trigger_n3 / trigger_n2 / every_milestone}} |

Every finding below is grounded in this scope. Anything noticed outside it is flagged "out-of-scope; defer to an explicit audit stage" rather than mixed into the count.

---

## Pass 1 — Duplication

**Status:** ☐ passed / ☐ findings present / ☐ not run

Find ≥3 similar code blocks (helpers, validation logic, fetch/parse patterns) that should be extracted. The "wait for the fourth before extracting" rule means duplication is acceptable at 2 occurrences; flagged at 3+.

| # | Pattern | Occurrences (file:line) | Extraction proposed | Severity | Resolution |
|---|---|---|---|---|---|
| 1 | {{e.g. near-identical input-validation block}} | {{a.ts:40, b.ts:88, c.ts:12}} | {{shared `validateInput()` helper}} | {{🟡}} | {{D.refactor / tech-debt}} |

---

## Pass 2 — Complexity *(Full tier; Standard only if a linter integration is named in `docs/gates.md`)*

**Status:** ☐ passed / ☐ findings present / ☐ not run / ☐ no linter integration (manual analysis)

Functions exceeding the cyclomatic-complexity threshold (default 15) or length threshold (default 80 lines). Either the project names a linter integration in `docs/gates.md` (eslint complexity, ruff, gocyclo, …) or the agent does the analysis manually.

| # | Function (file:line) | Metric | Threshold | Measured | Severity | Resolution |
|---|---|---|---|---|---|---|
| 1 | {{processBatch() — src/x.ts:120}} | cyclomatic | 15 | {{22}} | {{🟡}} | {{D.refactor / tech-debt}} |

**No linter integration:** if Complexity runs manually (no harness named in `docs/gates.md`), say so here and treat findings as 🟡 by default with an explicit "manual analysis" caveat. Don't auto-pass; surface the coverage gap.

---

## Pass 3 — Drift

**Status:** ☐ passed / ☐ findings present / ☐ not run

Dead code (no callers across the codebase), dead dependencies (no imports), version drift (multiple versions of one package), schema drift (generated types vs. source-of-truth).

| # | Kind | Subject (file / package) | Evidence | Severity | Resolution |
|---|---|---|---|---|---|
| 1 | dead code | {{src/legacy/util.ts:formatOld()}} | {{no callers since M[NN-1]}} | {{🟢}} | {{tech-debt}} |
| 2 | dead dependency | {{`left-pad` in package.json}} | {{no imports}} | {{🟢}} | {{tech-debt}} |
| 3 | version drift | {{two `lodash` majors in the tree}} | {{lockfile}} | {{🟡}} | {{D.refactor}} |

---

## Findings summary

- **🔴 Critical (blocks next milestone PR):** {{COUNT}} — rare; only when the structural issue compounds per-milestone or risks data loss / security
- **🟡 Important (open a D.refactor stage before the next milestone):** {{COUNT}}
- **🟢 Nice-to-have (append to `docs/tech-debt.md`):** {{COUNT}}

---

## Resolution plan

For each 🔴:

1. Finding # {{N}}: {{ONE_LINE_DESCRIPTION}}
   - **Path:** ☐ D.refactor stage / ☐ waiver ADR / ☐ re-tier
   - **Owner:** {{NEXT_STAGE_AGENT}}
   - **Re-verify after:** D.refactor commits — **V re-runs first** (confirm the refactor didn't break contracts), **then R re-runs** (confirm the structural issue is closed)

For each 🟡: open a `D.refactor` stage scoped to the finding before the next milestone (or carry forward with an explicit note).

For each 🟢: appended to `docs/tech-debt.md` with date + finding number. **Stage R both reads `docs/tech-debt.md`** (its entry count is one half of the trigger) **and writes to it** (🟢 findings append as new `TD-NNN` entries — append-only; never edit prior entries).

---

## Recommendation

Pick one:

- ☐ Proceed — no 🔴 structural findings
- ☐ Open D.refactor stage(s) for 🔴 findings; re-run V then R before proceeding
- ☐ Pause for maintainer adjudication on filed waiver ADR(s)
- ☐ Re-tier / re-scope — structural signal triggered (a D.refactor introduced a 🔴 outside the original scope)

---

## Sign-off

- **Date:**
- **Milestone:** M[NN]
- **Refactor session URL:** https://claude.ai/code/session_<id>
- **Iteration count:** {{N}} of 2 max (third iteration escalates to maintainer)
