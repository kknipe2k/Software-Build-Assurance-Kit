# M[NN].R Refactor Retrospective

> Filled by Claude during/after the Refactor stage. Distinct from work-stage, closeout, and verifier retrospectives — Stage R produces *structural findings*, not code or contract verdicts, so this retrospective is brief and asks different questions. The findings themselves live in `retrospectives/M[NN].R-findings.md`; this file is the meta-evaluation of whether the refactor health check itself was sound.

---

## Live observation log [LIVE]

Filled in real time as friction surfaces. Severity 1–5 (5 = couldn't proceed).

| Time | Pass | Event | Severity |
|---|---|---|---|
|  |  |  |  |

Common events to log:

- A pass had no scope to assess (code paths were narrower than the trigger implied)
- A complexity finding had no linter integration named in `docs/gates.md` (degrades to manual 🟡)
- A duplication finding sat at exactly 2 occurrences (judgment call — flag or wait for the fourth?)
- A finding's severity was hard to call (🟡 D.refactor vs 🟢 tech-debt)
- A finding overlapped a prior Stage V finding (coordination question)

---

## Refactor soundness [END]

Two questions per pass. Score 1–5 (5 = clean; 1 = pass was unable to evaluate).

### Pass 1 — Duplication

- Did the pass actually scan the cumulative codebase (not just this milestone's diff)? Score: __
- Were near-duplicates at 3+ occurrences raised honestly (not waved through)? Score: __

### Pass 2 — Complexity *(skip if pass not run)*

- Was the threshold applied with a real metric (linter or defensible manual count)? Score: __
- Were 🟡 "manual analysis, no linter" caveats surfaced when no integration was named? Score: __

### Pass 3 — Drift *(skip if pass not run)*

- Was dead-code / dead-dep evidence checked against actual call/import sites (not guessed)? Score: __
- Was version/schema drift checked against the lockfile / source-of-truth (not memory)? Score: __

---

## Threshold gates

- **G1 (do-not-commit)**: ☐ held / ☐ violated (date + commit if violated)
- **G7 (Stage R fresh context)**: ☐ refactor session opened fresh with prior retros **and prior R findings** excluded / ☐ violated (the agent read prior retros or prior R findings)
- **Findings caveat present**: ☐ yes / ☐ no — `retrospectives/M[NN].R-findings.md` must name passes run, passes NOT run, and structural classes NOT checked
- **All 🔴 findings have a resolution path**: ☐ D.refactor opened / ☐ waiver ADR filed / ☐ no 🔴 findings
- **🟢 findings appended to `docs/tech-debt.md`**: ☐ yes (append-only) / ☐ no 🟢 findings

---

## User experience stamp (REQUIRED at Standard+; asked-and-transcribed — the verdict's content is exclusively the owner's)

> The pass self-checks above are agent-authored. This stamp is the owner's independent verdict on the refactor stage (R retros are stamped like any stage retro; the pre-commit validator enforces it). **Flow (M22 ruling 4):** the agent **asks** for the verdict at approval, **transcribes the owner's reply verbatim** into the block, and appends a `transcribed:` line marking when it was asked — the owner never hand-edits this file. **Default = pass** — fail only on an explicit owner fix/fail before proceeding; an explicit `fail` forces Friction-heavy (per `sbak/PROCESS-VALIDATION.md`). `note:` is optional.

```user-stamp
verdict: {{pass|fail}}
note: {{optional — one sentence, the owner's words verbatim; delete this line if nothing to add}}
```

---

## Outcome

Pick one:

- ☐ **Sound** — no 🔴 structural findings; proceed
- ☐ **D.refactor needed** — open a D.refactor stage scoped to the 🔴 findings; re-run V (contracts) then R (structure) after
- ☐ **Waiver pending** — build agent filed `docs/adr/NNNN-waiver-M[NN]-R-finding-N.md`; maintainer must adjudicate before proceeding
- ☐ **Re-tier / re-scope** — structural signal triggered (a D.refactor introduced a finding outside the original scope)

---

## Decisions for the next refactor session

Specific, citing file:line + named pattern + named pass.

-

---

## Sign-off

- **Date:**
- **Milestone:** M[NN]
- **Refactor session URL:** https://claude.ai/code/session_<id>
