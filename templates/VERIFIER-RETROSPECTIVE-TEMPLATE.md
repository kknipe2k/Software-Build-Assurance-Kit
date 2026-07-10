# M[NN].V Verifier Retrospective

> Filled by Claude during/after the Verifier stage. Distinct from work-stage and closeout retrospectives — the Verifier produces *findings*, not code or summaries, so the retrospective is briefer and asks different questions. The findings themselves live in `retrospectives/M[NN].V-findings.md`; this file is the meta-evaluation of whether the verification itself was sound.

---

## Live observation log [LIVE]

Filled in real time as friction surfaces. Severity 1–5 (5 = couldn't proceed).

| Time | Pass | Event | Severity |
|---|---|---|---|
|  |  |  |  |

Common events to log:

- A spec claim couldn't be located (could be spec gap or doc-doc reference broken)
- A pass had no scope to verify (phase doc was silent on something the spec mandated)
- The build agent's choice was ambiguous against the spec (waiver candidate)
- A harness was missing for Pass 4 (Behavior degrades to 🟡)
- A finding's severity was hard to call (downgrade smell)

---

## Verification soundness [END]

Two questions per pass. Score 1–5 (5 = clean; 1 = pass was unable to evaluate).

### Pass 1 — Inventory

- Did every phase-doc "ship X" claim resolve to a real file? Score: __
- Were there files shipped that the phase doc didn't promise? Score: __

### Pass 2 — Hooks

- Did the 5-step data path trace complete for every wire claim? Score: __
- Were "no consumer" or "ambiguous consumer" findings raised honestly (or skipped to keep the report clean)? Score: __

### Pass 3 — Multi-call invariants *(skip if pass not run)*

- Did every public API / IPC method get called at least twice in sequence? Score: __
- Were synthetic stress inputs realistic (not just "call same thing twice")? Score: __

### Pass 4 — Behavior *(skip if pass not run or harness absent)*

- Was the harness exercised on the actual user-visible surface (not a mock of it)? Score: __
- Did 🟡 "no harness" findings get surfaced when harness was missing for a primitive? Score: __

### Plan-challenge *(required)*

- Did the plan-challenge derive its own threat model **anchored on the declared risk matrix** (which of the 9 properties did the plan leave unproven), not just re-verify the stated criteria? Score: __
- Was the full **standing escape catalog** walked (n/a-that's-false / prose-dodged count / assert-a-constant / always-matching-snapshot / mock-only / forged-ledger / stub-passes-assembled / under-declared-trigger / toy-path-confinement / bare-startsWith / dropped-fence-caveat / gate-design-contract-followed)? Score: __

---

## Threshold gates

- **G1 (do-not-commit)**: ☐ held / ☐ violated (date + commit if violated)
- **G6 (fresh context)**: ☐ verifier session opened fresh with retros excluded / ☐ violated (the agent read prior retros)
- **Plan-challenge ran (required)**: ☐ the matrix-anchored plan-challenge pass ran + its result recorded (which declared properties were left unproven; catalog walked) / ☐ not run — verification is incomplete, do not sign off
- **Findings caveat present**: ☐ yes / ☐ no — `retrospectives/M[NN].V-findings.md` must name passes run, passes NOT run, and bug classes NOT checked
- **All 🔴 findings have a resolution path**: ☐ D.fix opened / ☐ waiver ADR filed / ☐ no 🔴 findings

---

## Rework breakdown — the four fixed types (REQUIRED; G15)

> The Verifier records rework HONESTLY across the **four fixed types** — never "0" while iterations happened. For the verifier stage the load-bearing type is **verifier** iterations (each C.fix round this stage drove), plus any **implementation** correction the verifier itself made to a harness, **irl** reversal (a real-run reversed a finding's severity), or **post-merge** discovery. Lump-summing rework, or reporting "0 self-correction rounds" while a C.fix round happened, is the dishonest-transition accounting G15 exists to kill (DORA's 5th metric, project-internal). At closeout `validators/validate-transition.cjs` reconciles the milestone total against the fix-commit evidence.

```rework
implementation: {{N}}
verifier: {{N — C.fix rounds this verification drove}}
irl: {{N}}
post-merge: {{N}}
source: git
range: {{the verification's fix-commit range}}
pattern: {{regex matching the C.fix commits}}
```

If the verification was clean (Sound on the first pass, no C.fix), write the four types as `0` and confirm no fix commits exist on the range.

---

## User experience stamp (REQUIRED at Standard+; the agent does NOT fill this)

> The pass self-checks above are agent-authored. This stamp is the owner's independent verdict on the verification stage (V retros are stamped like any stage retro; the pre-commit validator enforces it). **Default = pass** — fail only if you gave an explicit fix/fail before proceeding; an explicit `fail` forces Friction-heavy (per `PROCESS-VALIDATION.md`). `note:` is optional.

```user-stamp
verdict: {{pass|fail}}
note: {{optional — one sentence; delete this line if nothing to add}}
```

---

## Outcome

Pick one:

- ☐ **Sound** — proceed to closeout (Stage E)
- ☐ **D.fix needed** — open D.fix stage scoped to the 🔴 findings; re-run V after
- ☐ **Waiver pending** — build agent filed `docs/adr/NNNN-waiver-M[NN]-finding-N.md`; maintainer must adjudicate before proceeding
- ☐ **Re-tier** — structural signal triggered (e.g., D.fix introduced finding outside original scope); milestone scope needs reconsidering

---

## Decisions for the next milestone's verifier

Specific, citing file:line + named change + named pass.

-

---

## Sign-off

- **Date:**
- **Milestone:** M[NN]
- **Verifier session URL:** https://claude.ai/code/session_<id>
