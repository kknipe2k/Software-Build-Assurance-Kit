# Bug Fix — `{{BUG_ID}}` — Phase Doc (operating_mode: `bug_fix`)

> The build prompt for a **bug fix**, not a greenfield milestone. Markdown wrapper for human readability + XML stage CLI prompts (per `sbak/STAGE-PROMPT-PROTOCOL.md`) for paste-into-session execution.
>
> **Why this shape.** A bug fix is not a small build (`OPERATING-MODES.md` §4.2). There is no spec, no scope matrix, no milestone breakdown — three short **phases**, run once, surfaced once, landed. The framework's value here is the *discipline* (a regression test FIRST, no unrelated changes) and the *verification* (did the fix break anything that was working?), plus the **impact-analysis** step the TDAD finding says is the real differentiator: a smaller model benefits more from "which existing tests to re-run after the change" than from a bare "do TDD" instruction.
>
> **No new schema.** Phase A and Phase B reuse `<work_stage_prompt>` (`role: work`); Phase C reuses `<verifier_stage_prompt>` (`role: verifier`). `operating_mode: bug_fix` adds read-first **lists** and **phase shapes** — it never adds a 3-brain `role` value. The session-mode set stays `{work, verifier, orchestrator, refactor}`.
>
> **No closeout.** There is no Stage E. The summary is a one-line `CHANGELOG.md` entry plus the PR description.

**Protocol version:** v1.9 (per `sbak/STAGE-PROMPT-PROTOCOL.md` changelog).

**Placeholders the bootstrap fills:** `{{BUG_ID}}` (the bug's tracking id — e.g., issue number or a local `B01`), `[NN]` in each stage id (the same id, as a 2-digit number so the prompts validate against the strict `M\d{2}\.[A-Z]` pattern), `{{AFFECTED_SURFACE}}`, `{{TEST_GLOB}}`.

---

## Background

A known defect exists in working code. The bug is reproducible, or there is enough information to write a reproducer. The deliverable is a **minimal targeted fix plus a regression test**, with no other behavior change. Time horizon is hours to a few days — never weeks (a multi-week "fix" has lost the regression-test bound; that is a `greenfield` refactor milestone or an `audit`, not a `bug_fix`).

The bug is documented in `docs/bugfix/{{BUG_ID}}.md`: observed vs. expected behavior, the exact reproducer, the affected surface, and (after Phase A) the impact-analysis test list and the fix summary.

---

## Phase shape (three phases, no milestones)

| Phase | Schema | `role` | What it delivers |
|---|---|---|---|
| A — Reproducer + impact analysis | `work_stage_prompt` | `work` | A regression test that fails for the *right reason*; a fan-out grep of the affected surface; the **impact-analysis list** of existing tests to re-run after the fix. |
| B — Minimal fix | `work_stage_prompt` | `work` | The smallest change that turns the regression test red→green; the Phase-A impact list re-run green; out-of-scope improvements deferred, never folded in. |
| C — Verifier (single pass) | `verifier_stage_prompt` | `verifier` | One Stage-V pass (Hooks / 5-step data-path trace on the changed surface; + Behavior if a harness exists). No closeout — a `CHANGELOG.md` one-liner + the PR description is the summary. |
| D — owner-directed close-out addendum (**optional**) | `work_stage_prompt` | `work` | Only when the owner directs acting NOW on a Phase-C 🟡 finding instead of ledgering it — see the Phase D section below. Never self-initiated. |

**Retrospective filename convention (UAT #14):** each phase's retrospective is written as
`retrospectives/M[NN].<X>-retrospective.md` — the **instantiated stage id** (e.g. `M01.A-retrospective.md`),
never the bug id (`B01.A-…`). The pre-commit stamp gate's trigger matches the `M[NN]` form; a
`B<id>`-named retro escaped it in IRL testing. (The gate's grep is also widened to catch `B`-names as
defense-in-depth, but the convention is the contract.) The Phase-C *findings* file keeps its
`{{BUG_ID}}.C-findings.md` name — findings are not retros and carry no user stamp.

---

## Key constraints (scope locks, all phases)

- **Minimal fix only.** No unrelated refactors, no "while we're here" cleanups, no style fixes outside the bug's immediate area (G_BUGFIX_B1). Out-of-scope improvements append to `docs/tech-debt.md` (or `CHANGELOG.md` if Lite) — they are never folded into the fix.
- **Regression test FIRST, and it must fail for the right reason** (G_BUGFIX_A1) — the assertion you care about, not a setup error / missing import / skipped test.
- **No new stage-prompt schema** — Phase A/B are `work_stage_prompt`, Phase C is `verifier_stage_prompt`; no new `role` value.
- **The impact-analysis list is re-run before the PR** (G_BUGFIX_C1) — all green. This is the data-driven version of "we didn't break anything."

---

## Phase A — Reproducer + impact analysis

### A.1 Problem Statement

Pin the bug with a failing regression test, then map the blast radius. Without a test that fails for the right reason, there is no proof the bug was the bug; with it, the behavior is pinned permanently. The fan-out grep + impact-analysis list is what lets Phase B change the minimum and Phase C confirm nothing else broke.

### A.2 Intended layout

> Advisory rails, not a contract.

**New:**

- `{{TEST_GLOB}}` — the regression test reproducing the bug.
- `docs/bugfix/{{BUG_ID}}.md` — bug description, reproducer, and (this phase's output) the impact-analysis list.

### A.3 Detailed Changes

- Write a regression test that reproduces the bug. It MUST fail for the **right reason** — the assertion about the buggy behavior, not a setup error, missing import, or skipped test (**G_BUGFIX_A1**). Confirm RED before writing any fix code.
- **The red-stop release (M22 ruling 5).** Surface the RED test and STOP. In the two-brain flow the release comes back in the orchestrator's verdict packet ending with the explicit line `RED-RELEASE: approved — builder, run node scripts/approve-red.cjs` — act **only on that line** (the fence's ask prompt is the human's release click). Approval language without the line **is not a release**: stop and tell the user `/approve-red` is required before any fix code.
- Run a **fan-out grep** across the names / fields / types involved in the bug (`sbak/STAGE-PROMPT-PROTOCOL.md` §7 `<fan_out_grep>`). Surface every file that touches the affected surface.
- Produce the **impact-analysis list**: the existing tests that exercise the affected surface and must be re-run after the fix. Record it in `docs/bugfix/{{BUG_ID}}.md`. This is the TDAD differentiator — contextual "which tests to re-run," not a bare "do TDD."

### A.4 Tests

**Acceptance criteria:**

1. A regression test exists and fails for the right reason (the buggy-behavior assertion) before any fix code is written.
2. A fan-out grep of the affected surface is recorded; every touching file is listed.
3. The impact-analysis list (existing tests to re-run) is written to `docs/bugfix/{{BUG_ID}}.md`.

### A.5 CLI Prompt

```xml
<work_stage_prompt id="M[NN].A">
  <context>
    Phase A of bug fix {{BUG_ID}} (operating_mode: bug_fix; role: work).
    Reproduce the bug with a regression test that fails for the RIGHT reason
    (G_BUGFIX_A1), fan-out grep the affected surface, and produce the
    impact-analysis list of existing tests to re-run after the fix. No fix code
    this phase. This is NOT a greenfield milestone — there is no spec/scope.
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md §3.7 (bug_fix workflow)</file>
    <file>docs/bugfix/{{BUG_ID}}.md (observed vs expected, reproducer, affected surface)</file>
    <file>docs/gotchas.md</file>
    <file>sbak/STAGE-PROMPT-PROTOCOL.md §7 (fan_out_grep)</file>
  </read_first>

  <deliverable ref="docs/bugfix/{{BUG_ID}}.md" section="A.3 Detailed Changes"/>

  <test_plan_required>true</test_plan_required>

  <execution_steps>
    <step name="write_failing_tests" budget="1"/>
    <step name="impact_analysis" budget="1"/>
    <step name="fill_retrospective"/>
    <step name="surface"/>
  </execution_steps>

  <acceptance_criteria ref="docs/bugfix/{{BUG_ID}}.md" section="A.4 Tests"/>

  <scope_locks ref="docs/bugfix/{{BUG_ID}}.md" section="Key constraints"/>

  <fan_out_grep>
    <grep pattern="{{AFFECTED_SURFACE}}" purpose="find every file touching the bug's surface; seed the impact-analysis list"/>
  </fan_out_grep>

  <test_honesty>
    Mutation: the unfixed bug itself is the mutant — the regression test must FAIL on current
    code for the right reason (G_BUGFIX_A1) and may pass only once Phase B lands. Effectiveness:
    the test asserts the EXPECTED behavior from docs/bugfix/{{BUG_ID}}.md, not merely "no error";
    a test that errors on a missing import or skips is not a reproducer.
  </test_honesty>

  <gates>
    <gate>G_BUGFIX_A1: regression test fails for the right reason before any fix code (the buggy-behavior assertion, not a setup error)</gate>
    <gate>impact-analysis list recorded in docs/bugfix/{{BUG_ID}}.md</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>The test must fail for the RIGHT reason — a test that errors on a missing import or skips is not a reproducer.</trap>
    <trap>No fix code in Phase A — only the failing test + the impact map.</trap>
  </gotchas>

  <time_box estimate_hours="1"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md">
    <special_log>The impact-analysis list (which existing tests Phase B must re-run) and decisions for Phase B.</special_log>
    <!-- Retro filename: retrospectives/M[NN].<X>-retrospective.md — the INSTANTIATED stage id
         (M01.A), never the bug id (a B01.A-named retro escaped the stamp gate; UAT #14). -->
  </retrospective_requirements>

  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/bugfix/{{BUG_ID}}.md" section="A.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD`</item>
    <item>diff stat (the failing regression test + the bug doc)</item>
    <item>the impact-analysis list</item>
    <item>retrospective ([END] with decisions for Phase B)</item>
    <item>draft commit message</item>
    <item>explicit: "Phase A is ready. I will not commit until you approve."</item>
  </approval_surface>
</work_stage_prompt>
```

### A.6 Commit Message

```
fix({{BUG_ID}}): failing regression test + impact analysis

Reproduce {{BUG_ID}} with a regression test that fails for the right reason
(G_BUGFIX_A1); fan-out grep the affected surface; record the impact-analysis
list of existing tests to re-run after the fix.

Phase: A — Reproducer + impact analysis (operating_mode: bug_fix)
Session: {{filled at commit time}}
```

---

## Phase B — Minimal fix

### B.1 Problem Statement

Make the smallest change that turns the regression test green, change nothing else, and prove the rest of the affected surface still works by re-running the Phase-A impact list.

### B.2 Files to Change

The minimal set the fan-out grep identified — typically one file, plus the regression test from Phase A (which now passes).

### B.3 Detailed Changes

- Make the **smallest** change that turns the Phase-A regression test red→green.
- **Scope lock (G_BUGFIX_B1):** no unrelated refactors, no "while we're here" cleanups, no style fixes outside the bug's immediate area. Out-of-scope improvements append to `docs/tech-debt.md` (or `CHANGELOG.md` at Lite) — never folded into the fix.
- Re-run the **impact-analysis list** from Phase A. All must pass.

### B.4 Tests

**Acceptance criteria:**

1. The Phase-A regression test passes; the change is the minimal one that makes it pass.
2. The full impact-analysis list re-runs green (no regression on the affected surface).
3. No out-of-scope change is in the diff; any deferred improvement is logged to `docs/tech-debt.md` / `CHANGELOG.md`.

### B.5 CLI Prompt

```xml
<work_stage_prompt id="M[NN].B">
  <context>
    Phase B of bug fix {{BUG_ID}} (operating_mode: bug_fix; role: work).
    Make the smallest change that turns the Phase-A regression test red→green,
    then re-run the impact-analysis list. SCOPE LOCK (G_BUGFIX_B1): no unrelated
    refactors or cleanups — defer them to docs/tech-debt.md / CHANGELOG.md.
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md §3.7 (bug_fix workflow)</file>
    <file>docs/bugfix/{{BUG_ID}}.md (reproducer + the impact-analysis list)</file>
    <file>docs/gotchas.md</file>
  </read_first>

  <read_prior_stages>
    <retrospective stage="M[NN].A" section="[END] Decisions for the next stage"/>
  </read_prior_stages>

  <deliverable ref="docs/bugfix/{{BUG_ID}}.md" section="B.3 Detailed Changes"/>

  <test_plan_required>true</test_plan_required>

  <execution_steps>
    <step name="implement" budget="1"/>
    <step name="rerun_impact_list" budget="1"/>
    <step name="fill_retrospective"/>
    <step name="surface"/>
  </execution_steps>

  <acceptance_criteria ref="docs/bugfix/{{BUG_ID}}.md" section="B.4 Tests"/>

  <scope_locks ref="docs/bugfix/{{BUG_ID}}.md" section="Key constraints"/>

  <test_honesty>
    Mutation: revert the fix hunk → the Phase-A regression test must go RED again. Effectiveness:
    the regression test asserts the expected behavior (not "no error"), and the impact-analysis
    list re-runs green so no existing behavior silently changed.
  </test_honesty>

  <gates>
    <gate>G_BUGFIX_B1: scope lock — no out-of-scope changes in the diff; deferred improvements appended to docs/tech-debt.md / CHANGELOG.md</gate>
    <gate>Phase-A regression test passes; the change is minimal</gate>
    <gate>the impact-analysis list re-runs green</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope creep destroys the regression-test bound — the smallest fix, nothing else.</trap>
    <trap>If the "fix" balloons past the affected surface, stop: this may be an audit or a greenfield refactor, not a bug_fix.</trap>
  </gotchas>

  <time_box estimate_hours="1"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md">
    <special_log>Decisions for Phase C (what the Verifier must exercise on the changed surface).</special_log>
    <!-- Retro filename: retrospectives/M[NN].<X>-retrospective.md — the INSTANTIATED stage id
         (M01.B), never the bug id (UAT #14). -->
  </retrospective_requirements>

  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/bugfix/{{BUG_ID}}.md" section="B.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD`</item>
    <item>diff stat (proves minimality — affected surface only)</item>
    <item>impact-analysis list result (all green)</item>
    <item>retrospective ([END] with decisions for Phase C)</item>
    <item>draft commit message</item>
    <item>explicit: "Phase B is ready. I will not commit until you approve."</item>
  </approval_surface>
</work_stage_prompt>
```

### B.6 Commit Message

```
fix({{BUG_ID}}): minimal fix, impact list green

Smallest change that turns the Phase-A regression test red→green; scope-locked
(G_BUGFIX_B1) — no unrelated changes; the impact-analysis list re-runs green.

Phase: B — Minimal fix (operating_mode: bug_fix)
Session: {{filled at commit time}}
```

---

## Phase C — Verifier (single pass)

### C.1 Problem Statement

Confirm, with fresh context, that the wire connecting the fix to the rest of the system is correct and nothing observable regressed. One Stage-V pass on the changed surface. There is **no closeout** — the `CHANGELOG.md` one-liner and the PR description are the summary.

### C.2 Scope to verify

- The changed surface (the file(s) Phase B touched) and the regression test.
- Out of scope: anything the bug fix did not touch.

### C.3 Verification passes

1. **Hooks** — 5-step data-path trace on the changed surface: the fix's source event → projector → consumer wire → verify the consumer reads what the fix writes. A no-consumer / ambiguous-consumer wire is a 🔴.
2. **Behavior** (if a harness exists for the affected surface) — exercise the fixed behavior and assert the observable output; confirm the impact-analysis list is green.

### C.4 Findings format

Output: summarize to the owner (or `retrospectives/{{BUG_ID}}.C-findings.md` if requested), using `sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md`. Required tier-coverage caveat naming which passes ran and which bug classes are NOT checked.

### C.5 CLI Prompt

```xml
<verifier_stage_prompt id="M[NN].C">
  <context>
    Phase C of bug fix {{BUG_ID}} (operating_mode: bug_fix; role: verifier).
    Fresh CLI session — prior retrospectives deliberately excluded (bias guard).
    One Stage-V pass on the CHANGED SURFACE only: Hooks (5-step data-path trace),
    + Behavior if a harness exists. No closeout — a CHANGELOG one-liner + the PR
    description is the summary.
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md §3.4 (verifier protocol), §3.7 (bug_fix workflow)</file>
    <file>docs/bugfix/{{BUG_ID}}.md (reproducer + impact-analysis list)</file>
    <file>docs/gotchas.md</file>
    <!-- DELIBERATELY OMITTED: prior retrospectives. The bias guard. -->
  </read_first>

  <scope_to_verify>
    <code_paths>
      <path>{{AFFECTED_SURFACE}}</path>
    </code_paths>
    <spec_sections>docs/bugfix/{{BUG_ID}}.md (the bug contract: observed vs expected)</spec_sections>
  </scope_to_verify>

  <verification_passes>
    <pass name="calibration_self_test" harness="run the plan-challenge against prompts/calibration/ — FNR must be 0 (catch every seeded defect) before any real finding counts; record seeds-caught / FNR (G14). Required even for a bug_fix's single verifier pass — the verifier-proof is universal."/>
    <pass name="hooks"/>
    <pass name="behavior" harness="{{project harness, if any}}; re-run the impact-analysis list (G_BUGFIX_C1)"/>
    <pass name="plan_challenge" harness="anchored on the declared risk matrix (which dangerous properties of the changed surface did the fix + its impact-analysis leave unproven?) + the standing escape catalog (an n/a that's false / a prose-dodged count / assert-a-constant / always-matching-snapshot / mock-only / under-declared-trigger / toy-path-confinement / bare-startsWith / dropped-fence-caveat). Bounded: against the declared properties, not arbitrary threats."/>
  </verification_passes>

  <findings_format ref="sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md">
    <output>summarize to owner (or retrospectives/{{BUG_ID}}.C-findings.md if requested)</output>
    <severity_model>
      <level>🔴 critical — blocks the fix PR</level>
      <level>🟡 important — fix before merge or log to tech-debt</level>
      <level>🟢 nice-to-have — note it</level>
    </severity_model>
    <coverage_caveat_required>true</coverage_caveat_required>
  </findings_format>

  <merge_gate>
    <on_critical_finding>open a fix note scoped to the finding; builder fixes in a Phase-B-shaped pass; re-run Phase C</on_critical_finding>
    <iteration_cap rounds="2">After 2 fix iterations, escalate to the owner</iteration_cap>
    <structural_signal>If a fix introduces a 🔴 outside the affected surface, stop — the fix scope was wrong; reassess.</structural_signal>
  </merge_gate>

  <gates>
    <gate>G_BUGFIX_C1: the impact-analysis list re-runs green before the PR</gate>
    <gate>Hooks pass clean on the changed surface (no no-consumer wire)</gate>
  </gates>

  <retrospective_requirements ref="prompts/VERIFIER-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/bugfix/{{BUG_ID}}.md" section="C.6 Commit Message"/>

  <approval_surface>
    <item>per-pass summary (hook traces verified, behavior assertions / impact list result)</item>
    <item>findings sorted by severity</item>
    <item>the proposed CHANGELOG.md one-liner</item>
    <item>recommendation: land the fix / open a fix note</item>
    <item>explicit: "I will not commit until you approve."</item>
  </approval_surface>
</verifier_stage_prompt>
```

### C.6 Commit Message

```
(Phase C is summarize-to-owner. The fix lands with a one-line CHANGELOG.md entry
and the PR description as the summary — there is no closeout / Stage E.)

CHANGELOG one-liner (example):
  - Fixed {{BUG_ID}}: {{observed behavior}} now {{expected behavior}}. (regression test added)
```

> **The IRL close-gate (owner ruling): observable change → an IRL drive of the running thing is recorded before the PR.** The CHANGELOG one-liner + PR description close only after the fixed behavior has been driven for real: run the reproducer against the running thing and record the observed output in the PR description (or the Phase-C findings). A green regression test alone does not close an observable change.

> **CI-red triage (UAT #19): check the ledgers for a known flake before treating a red check as new signal.** Before diagnosing a red CI run on the fix PR as fallout from the fix, check `docs/gotchas.md` and `docs/tech-debt.md` — in a brownfield repo the imported entries record the flakes the host already knew about (TD-labeled titles, `.skip`/retry-marked tests). A known flake gets cited by its ledger entry, not re-investigated; a red with no ledger match is real signal.

---

## Phase D — owner-directed close-out addendum (optional; UAT #21)

The mode ends at Phase C. But when Phase C surfaces a 🟡 finding and the **owner chooses to act
NOW instead of ledgering it**, this is the sanctioned slot — codified from the shape an IRL run
improvised well, so acting-now is no longer drift:

1. **Owner-directed only.** Phase D exists when the owner says "close finding N by test/fix now."
   The agent never proposes opening it as a convenience; the default disposition for a 🟡 stays
   *ledger it* (`docs/tech-debt.md`, or `CHANGELOG.md` at Lite).
2. **Author the §D stage section FIRST.** Before any work: append a `### D.1–D.6` section to this
   doc (same `work_stage_prompt` schema, id `M[NN].D`) scoped to exactly the named finding —
   then the **owner approves the section** — then execute from its own prompt in the normal
   three-gate loop. Improvising the work from chat context voids the paper trail.
3. **Test-only gates.** Phase D's gates are the finding's own test(s) going green plus the
   Phase-A impact list re-run — nothing broader. If the work grows past the finding's surface,
   stop: that is a new bug_fix (or a milestone), not an addendum.
4. **No fourth verify pass by default.** Phase C already verified the fix surface; Phase D's
   test-only gates carry it. The owner may explicitly request a re-verify of the changed surface
   — that is the exception, not the shape.
5. **Retro + close as usual.** `retrospectives/M[NN].D-retrospective.md`, and the CHANGELOG
   one-liner gains the addendum's clause.

---

*This Phase doc is the single source of truth for bug fix `{{BUG_ID}}`. There is no spec, scope, milestone plan, or closeout — three phases, one PR (plus the optional owner-directed Phase D above). Keep `docs/bugfix/{{BUG_ID}}.md` current; it is the bug's contract.*
