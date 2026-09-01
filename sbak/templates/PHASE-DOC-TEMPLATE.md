# M[NN] — {{Milestone title}} — Phase Doc

> The build prompt for milestone M[NN]. Markdown wrapper for human readability + XML stage CLI prompts (per `sbak/STAGE-PROMPT-PROTOCOL.md`) for paste-into-session execution. Authored at the prior milestone's closeout (or at project bootstrap for M01).
>
> **Roles (Full):** this Phase doc is authored by the **orchestrator** role (see `ORCHESTRATOR.md` §3); the §X.5 XML stage prompts inside it are executed by **build** sessions. The orchestrator never lists `ORCHESTRATOR.md` in a stage prompt's `<read_first>` — build sessions don't read it. At Lite tier the roles collapse and there is no separate orchestrator.

**Protocol version:** v1.9 (per `sbak/STAGE-PROMPT-PROTOCOL.md` changelog).

> This banner is **load-bearing for two version-gated gates**: **G9** (test-honesty) and **G13** (the risk-matrix). Because it declares **v1.7+**, the Custom path (interview) requires a `<test_honesty>` slot on every work stage below (a named mutation, or the explicit `n/a — no risk surface` sentinel) — on the Full path (the glance, the default) the slot is optional and the mutation naming lives in the handoff note's `mutation:` line (fade 3, M30.I); and because it declares **v1.8+**, a work stage that **touches a risk surface** (a `risk_triggers:` surface, `sbak/FRAMEWORK-CONFIG.md` §4.19) must carry a `<risk_declaration>` covering the 9-property matrix. `validators/validate-test-honesty.cjs` (G9) and `validators/validate-risk-matrix.cjs` (G13) block a non-compliant work stage. **Banner-less docs comply:** a banner-LESS doc is treated as *current* (must comply), not grandfathered — only an *explicit* pre-bump banner (`v1.7`, `v1.6`, …) grandfathers the doc out of the later gates (use only when re-issuing a genuinely older doc).

---

## Background

{{Two to four paragraphs explaining what this milestone is for, why it's needed now, and how it fits in the project's overall arc. Read by someone joining the project mid-stream — they should understand the milestone's purpose without having to read the entire spec first.}}

This milestone advances v{{CURRENT_VERSION}} from {{state at M[NN-1] closeout}} to {{state at M[NN] closeout}}. It does not attempt {{things deferred to M[NN+1] or later}} — those are scope-locked to subsequent milestones per `docs/scope.md`.

---

## Scope

### In scope (this milestone delivers)

- {{deliverable 1}}
- {{deliverable 2}}
- {{deliverable N}}

### Out of scope (deferred to later milestones or out of release)

- {{out-of-scope 1}} — deferred to M[NN+X]
- {{out-of-scope 2}} — out of v{{CURRENT_VERSION}}
- {{...}}

### Key constraints (scope locks for the milestone)

These constraints apply to every stage in this milestone. Stage CLI prompts reference this section via `<scope_locks ref="docs/build-prompts/M[NN]-{{slug}}.md" section="Key constraints"/>`.

- {{constraint 1}} — e.g., "single-process; no IPC additions"
- {{constraint 2}} — e.g., "no new third-party dependencies without ADR"
- {{constraint 3}} — e.g., "{{cross-milestone constraint from docs/scope.md}}"

---

## References

| What | Where | Read for |
|---|---|---|
| Project spec | `spec/project-spec.md` §{{relevant sections}} | What the milestone implements |
| Scope | `docs/scope.md` §M[NN] | Acceptance criteria |
| Gates | `docs/gates.md` §M[NN] | Must-pass list for this milestone |
| Identity | `docs/identity.md` | What the project is, stack |
| Style | `docs/style.md` | Code conventions |
| Gotchas | `docs/gotchas.md` | Project-wide traps |
| ADRs | `docs/adr/{{relevant ADR numbers}}` | Architectural decisions this milestone touches |
| Prior milestone summary | `retrospectives/M[NN-1]-summary.md` (if applicable) | Carry-forward decisions |
| Prior gap-analysis | `docs/gap-analysis.md` (M[NN-1] entry, if applicable) | Open items and severity |

---

## Document structure

This Phase doc has one section per stage (A–E). Each stage section follows the same shape:

- **X.1 Problem Statement** — what this stage exists to solve
- **X.2 Intended layout** — the file inventory (new + modified) as **advisory rails, not a contract**. It's the expected shape so the build (and a weaker model especially) has a concrete starting layout; the build may deviate when it has a better structure. Following it needs no annotation; deviating needs a one-line note in the stage plan, not an ADR. The Verifier does not treat a deviation from this list as drift.
- **X.3 Detailed Changes** — the substantive content (referenced by `<deliverable ref="..." section="X.3 Detailed Changes"/>`)
- **X.4 Tests** — test plan and acceptance criteria (referenced by `<acceptance_criteria ref="..." section="X.4 Tests"/>`)
- **X.5 CLI Prompt** — the XML stage prompt to paste into a fresh Claude Code session
- **X.6 Commit Message** — pre-authored commit message template (referenced by `<commit_message ref="..." section="X.6 Commit Message"/>`)

Stage E (closeout) replaces X.3/X.4 with closeout-specific sections (deliverables, gap-analysis requirements, three-artifact review).

**Deliverable-type deltas (from `deliverable_type` in `project-config.md`).** A stage that touches the type's contract surface carries the matching obligation: `web` — at least one Playwright (or equivalent) browser-load e2e in X.4, `docs/design.md` in the stage's `<read_first>`, and the design pass in Stage V; `service` — a live-request smoke (health + one route) in X.4; `library` — a doctest / example-run so the README example actually executes; `cli` — an arg-parse + exit-code test per command. The Verifier passes are already type-aware (Pass 4 observed-running + Pass 5 design for web); this just makes the *stage's own* tests carry the type's floor.

**App-Map delta (when `app_map: on`).** A stage that ships or changes a drivable surface (any class — `ui` / `command` / `endpoint` / `api`) updates `docs/app-map.md` as a close-gate deliverable — but only the **delta**: new/changed entries for the surfaces *this stage* touched, plus a one-line "what's new this stage." This mirrors the gotchas live-log → graduation split: the fresh, narrowly-scoped build session owns its delta; the whole-map reconcile + the `as-of-commit` refresh are **Stage E's** job, not the build session's. Each `verified` entry cites a test-id the harness already asserts; `manual-only` entries are honest about being human-asserted. The CLI prompt carries this as the `<app_map_delta>` element (see Stage A example below). If the stage touched a surface-source path but legitimately changed no surface (a no-UX refactor), the build session logs an `app-map-unchanged: <reason>` token in its stage surface rather than silently skipping — the currency tripwire's only sanctioned escape.

| Stage | Title | Estimated effort |
|---|---|---|
| A | {{stage A title}} | {{N}} hours |
| B | {{stage B title}} | {{N}} hours |
| C | {{stage C title}} | {{N}} hours |
| D | {{stage D title}} | {{N}} hours |
| E | Closeout | {{N}} hours |

---

## Implementation Workflow

Per `sbak/BUILD-PLAYBOOK.md` §3.2, every stage follows the same loop:

1. **Pre-flight** — read the CLI prompt's `<read_first>` files; absorb prior stage retrospective if applicable.
2. **Plan before code** — surface the implementation plan; user confirms.
3. **RED** — write failing tests per the stage's `X.4 Tests`.
4. **GREEN** — minimum code to pass.
5. **REFACTOR** — clean up under green tests.
6. **Verify gates** — run the milestone's hard gates from `docs/gates.md`. Self-correction budget per the CLI prompt.
7. **Fill retrospective** — `[END]` section per `prompts/RETROSPECTIVE-TEMPLATE.md`.
8. **Surface for approval** — cross-machine state (`git log --oneline main..HEAD` + retrospective file listing) + diff stat + gates + retrospective + draft commit message. State: *"Stage X is ready."* (the one do-not-commit sentence lives at the PROJECT-CLAUDE §8 approval surface)
9. **Commit on approval** — commit on the parent-milestone branch (`claude/m{{NN}}-{{slug}}`); do NOT push between stages — push only at end of Closeout (Stage E).

Closeout (Stage E) replaces steps 3–6 with: cumulative read, milestone summary, gap-analysis entry, PR description draft. See Stage E section below.

---

## Stage A — {{Stage A title}}

### A.1 Problem Statement

{{Two to four sentences. What does this stage solve? Why now? What does it enable for Stage B?}}

### A.2 Intended layout

> Advisory rails, not a contract (see Document structure §X.2). Expected shape; the build may deviate with a one-line note. Same applies to every later stage's `.2` section.

**New:**

- `{{path/to/new/file.ext}}` — {{purpose}}
- `{{path/to/another.ext}}` — {{purpose}}

**Modified:**

- `{{path/to/existing/file.ext}}` — {{nature of change}}

**Deleted:**

- {{none, or list with rationale}}

### A.3 Detailed Changes

{{The substantive content. This section is what `<deliverable ref="..." section="A.3 Detailed Changes"/>` resolves to. Be specific: what data structures, what function signatures, what control flow, what error handling. Code snippets where they clarify; prose where it clarifies more.}}

### A.4 Tests

**Test plan:**

- {{test 1: behavior under test, fixtures needed, expected outcome}}
- {{test 2: ...}}
- {{test N}}

**Acceptance criteria** (referenced by `<acceptance_criteria ref="..." section="A.4 Tests"/>`):

1. {{criterion}}
2. {{criterion}}
3. {{criterion}}

### A.5 CLI Prompt

Paste this into a fresh Claude Code session for Stage A:

```xml
<work_stage_prompt id="M[NN].A">
  <context>
    {{Two to four sentences. What's this stage; what builds on it; what it absorbs from prior milestone if applicable.}}
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md</file>
    <file>docs/identity.md</file>
    <file>docs/gates.md</file>
    <file>spec/project-spec.md §{{relevant sections}}</file>
    <file>docs/scope.md §M[NN]</file>
    <file>docs/build-prompts/M[NN]-{{slug}}.md (Background, Document Structure, Implementation Workflow, Stage A sections A.1–A.4)</file>
    <file>docs/style.md</file>
    <file>docs/gotchas.md</file>
  </read_first>

  <read_reference>
    <!-- Optional: reference files to consult for patterns/archetypes, with a `purpose` attribute. -->
    <file purpose="{{why read this}}">{{src/path/to/reference.ext}}</file>
  </read_reference>

  <!-- For non-first milestones, add: -->
  <!--
  <read_prior_milestones>
    <gap_analysis_carry_forward milestone="M[NN-1]"/>
    <milestone_summary milestone="M[NN-1]" section="Decisions to apply before next parent milestone"/>
  </read_prior_milestones>
  -->

  <deliverable ref="docs/build-prompts/M[NN]-{{slug}}.md" section="A.3 Detailed Changes"/>

  <test_plan_required>true</test_plan_required>

  <!-- v1.7 G9 — REQUIRED on every work stage on the Custom path (interview), where a silent
       omission BLOCKS (validate-test-honesty.cjs); OPTIONAL on the Full path (the glance, the
       default), where the mutation naming lives in the handoff note's `mutation:` line. LEAN
       FORM when carried: one line per named mutation — `test → mutation → killed`; the
       mutation RUN stays part of going green on both paths. -->
  <test_honesty>
    {{test → mutation → killed, one line per named mutation. OR: n/a — no risk surface}}
  </test_honesty>

  <!-- v1.8 G13 — REQUIRED when this stage TOUCHES a risk surface (a
       risk_triggers: surface, sbak/FRAMEWORK-CONFIG.md §4.19: destructive data ops / archives /
       untrusted-metadata fs-writes / credentials / untrusted HTML / installers). Name the
       triggers this stage hits and address ALL NINE matrix properties — each `covered-by:
       … — test: …` or an explicit `n/a — <reason>`. The 9 are BOUNDED (the fixed set; the
       verifier challenges against them, not arbitrary threats). validate-risk-matrix.cjs (G13)
       blocks a declared surface that omits a property or names no covering test. OMIT this
       whole element for a stage that touches NO risk surface (a no-op — under-declaration is
       Stage V's job). Replace `{{...}}` with real values; the placeholder triggers below make
       the example a no-op until filled. -->
  <risk_declaration triggers="{{risk_triggers tokens this stage hits, e.g. archive_extraction}}">
    <property name="normal">{{covered-by: the happy path — test: <name>, OR: n/a — <reason>}}</property>
    <property name="hostile-input">{{covered-by: malformed/adversarial input rejected — test: <name>, OR: n/a — <reason>}}</property>
    <property name="partial-failure">{{covered-by: a mid-op crash leaves a consistent state — test: <name>, OR: n/a — <reason>}}</property>
    <property name="confinement">{{covered-by: writes/extractions stay in-subtree (canonicalize-then-confine) — test: <name>, OR: n/a — <reason>}}</property>
    <property name="authorization">{{covered-by: least authority, checked — test: <name>, OR: n/a — <reason>}}</property>
    <property name="resource-bounds">{{covered-by: size/count/time capped — test: <name>, OR: n/a — <reason>}}</property>
    <property name="recovery">{{covered-by: undoable on failure (rollback) — test: <name>, OR: n/a — <reason>}}</property>
    <property name="observability">{{covered-by: failure logged/surfaced, not swallowed — test: <name>, OR: n/a — <reason>}}</property>
    <property name="cross-platform">{{covered-by: path/encoding/EOL holds on every target OS — test: <name>, OR: n/a — <reason>}}</property>
  </risk_declaration>

  <execution_steps>
    <step name="write_failing_tests" budget="1"/>
    <step name="implement" budget="1"/>
    <step name="verify_gates" budget_iterations="3"/>
    <step name="fill_retrospective"/>
    <step name="surface"/>
  </execution_steps>

  <acceptance_criteria ref="docs/build-prompts/M[NN]-{{slug}}.md" section="A.4 Tests"/>

  <scope_locks ref="docs/build-prompts/M[NN]-{{slug}}.md" section="Key constraints"/>

  <gates milestone="M[NN]"/>

  <self_correction_budget>3</self_correction_budget>

  <!-- v1.3+ optional pre-flight verification tags (uncomment as needed):
  <pre_flight_check>
    <check name="branch_correct">git rev-parse --abbrev-ref HEAD must equal claude/m[NN]-{{slug}}</check>
    <check name="prior_stage_committed">prior stage commit present on branch (omit on Stage A)</check>
    <check name="env_set">required env vars present (e.g., API keys for live-network stages)</check>
  </pre_flight_check>

  <schema_drift_check gate="{{project regen-and-check command, if applicable}}"/>

  <fan_out_grep>
    <grep pattern="{{name about to be renamed}}" purpose="find all callsites needing coordinated update"/>
  </fan_out_grep>

  <dependency_audit_check>
    <dep name="{{package}}" required_features="{{features}}" min_version="{{version}}"/>
  </dependency_audit_check>

  <runtime_environment os="{{windows|linux|macos|any}}" note="{{rationale for OS pin}}"/>
  -->

  <!-- v1.5 optional — include when `app_map: on` AND this stage ships/changes a
       drivable surface. DELTA only: entries for surfaces THIS stage touched, plus
       a "what's new" line. The whole-map reconcile + as-of-commit refresh is Stage E.
  <app_map_delta ref="docs/app-map.md">
    <surface_touched>{{surface name — e.g. command palette / `init` subcommand / POST /tasks}}</surface_touched>
    <whats_new>{{one line: the new/changed drivable affordance this stage shipped}}</whats_new>
    <binding>{{each verified entry cites a test-id the harness asserts; manual-only entries flagged as human-asserted}}</binding>
    <unchanged_escape>{{if a surface-source path changed but no surface did: app-map-unchanged: <reason>}}</unchanged_escape>
  </app_map_delta>
  -->

  <gotchas>
    <trap>{{stage-specific trap to avoid}}</trap>
    <trap>{{another trap, if any}}</trap>
  </gotchas>

  <execution_warnings>
    <!-- Optional: warnings about commands NOT to run in normal flow. -->
    <warning>{{e.g., "DO NOT run integration tests against live services in normal flow"}}</warning>
  </execution_warnings>

  <time_box estimate_hours="{{N}}"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md">
    <special_log>{{anything specific this stage must log beyond the template — usually decisions for Stage B}}</special_log>
  </retrospective_requirements>

  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M[NN]-{{slug}}.md" section="A.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md` (orchestration sessions on a different machine read this to know what's actually on the build machine)</item>
    <item>diff stat (git diff --stat HEAD)</item>
    <item>gate results (each gate, pass/fail, key numbers)</item>
    <item>retrospective (filled-in [END] section with three-axis scoring + verdict + decisions for Stage B)</item>
    <item>draft commit message from M[NN]-{{slug}}.md A.6 Commit Message section (filled with session URL)</item>
    <item>explicit statement: "Stage M[NN].A is ready."</item>
  </approval_surface>
</work_stage_prompt>
```

### A.6 Commit Message

```
M[NN].A: {{one-line summary, ≤72 chars}}

{{Body paragraph: what changed, why, what it enables for Stage B.}}

Stage: M[NN].A — {{stage title}}
Phase doc: docs/build-prompts/M[NN]-{{slug}}.md
Retrospective: retrospectives/M[NN].A-retrospective.md
Session: {{filled in at commit time — Claude session URL}}

Gates passing: {{list from docs/gates.md, all that ran}}
```

---

## Stage B — {{Stage B title}}

### B.1 Problem Statement

{{...}}

### B.2 Files to Change

{{...}}

### B.3 Detailed Changes

{{...}}

### B.4 Tests

{{...}}

### B.5 CLI Prompt

```xml
<work_stage_prompt id="M[NN].B">
  <context>
    {{Two to four sentences. Note: Stage B inherits from Stage A — its `<read_prior_stages>` references Stage A's retrospective.}}
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md</file>
    <file>docs/identity.md</file>
    <file>docs/gates.md</file>
    <file>spec/project-spec.md §{{relevant sections}}</file>
    <file>docs/build-prompts/M[NN]-{{slug}}.md (Stage B sections B.1–B.4)</file>
    <file>docs/style.md</file>
    <file>docs/gotchas.md</file>
  </read_first>

  <read_prior_stages>
    <retrospective stage="M[NN].A" section="[END] Decisions for the next stage"/>
  </read_prior_stages>

  <!-- ... rest of the prompt structure follows Stage A pattern ... -->

  <deliverable ref="docs/build-prompts/M[NN]-{{slug}}.md" section="B.3 Detailed Changes"/>
  <test_plan_required>true</test_plan_required>
  <!-- v1.7 G9: the lean form — `test → mutation → killed`, or `n/a — no risk surface`. Required on the Custom path (interview); optional on the Full path, where the handoff note's `mutation:` line carries it. -->
  <test_honesty>{{test → mutation → killed. OR: n/a — no risk surface}}</test_honesty>
  <execution_steps>
    <step name="write_failing_tests" budget="1"/>
    <step name="implement" budget="1"/>
    <step name="verify_gates" budget_iterations="3"/>
    <step name="fill_retrospective"/>
    <step name="surface"/>
  </execution_steps>
  <acceptance_criteria ref="docs/build-prompts/M[NN]-{{slug}}.md" section="B.4 Tests"/>
  <scope_locks ref="docs/build-prompts/M[NN]-{{slug}}.md" section="Key constraints"/>
  <gates milestone="M[NN]"/>
  <self_correction_budget>3</self_correction_budget>
  <gotchas>
    <trap>{{stage-specific trap}}</trap>
  </gotchas>
  <time_box estimate_hours="{{N}}"/>
  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M[NN]-{{slug}}.md" section="B.6 Commit Message"/>
  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md`</item>
    <item>diff stat</item>
    <item>gate results</item>
    <item>retrospective ([END] with scoring + decisions for Stage C)</item>
    <item>draft commit message</item>
    <item>explicit statement: "Stage M[NN].B is ready."</item>
  </approval_surface>
</work_stage_prompt>
```

### B.6 Commit Message

```
M[NN].B: {{one-line summary, ≤72 chars}}

{{Body paragraph.}}

Stage: M[NN].B — {{stage title}}
Phase doc: docs/build-prompts/M[NN]-{{slug}}.md
Retrospective: retrospectives/M[NN].B-retrospective.md
Session: {{filled in at commit time}}

Gates passing: {{list}}
```

---

## Stage C — {{Stage C title}}

{{Same structure as Stage B. C.1 through C.6.}}

---

## Stage D — {{Stage D title}}

{{Same structure. D.1 through D.6.}}

---

## Stage V — Verifier *(Full tier)*

> Skip if `verifier_mode: skip` in `project-config.md`. For `pass_1_only` (Lite), this section has only V.1, V.2, V.3 inventory pass, V.5, V.6.

### V.1 Problem Statement

Fresh-context contract-fidelity check against the milestone's deliverables. The work-stage retrospectives evaluated process drift; closeout (next stage) will do cumulative product↔spec review with full context. This stage runs in between, with a deliberately narrowed read list (no prior retrospectives) to catch the bug class where "every static test passes but the running thing doesn't do what was promised."

### V.2 Scope to verify

- Phase doc claims (this document, sections A through D)
- Spec sections: §{{relevant sections}}
- Code paths: {{src/foo/, src/bar/}}
- Out of scope: anything not touched by this milestone

### V.3 Verification passes

For `verifier_mode: pass_2_4` (the Full default):

1. **Inventory.** For each "ship X" claim in this Phase doc, confirm file exists with expected shape.
2. **Hooks.** For each wire claim (e.g., "X reads Y from Z"), run 5-step trace: spec claim → source event → projector → consumer wire → verify consumer reads what projector writes. No-consumer or ambiguous-consumer = 🔴.
3. **Behavior.** For each user-visible primitive, exercise via project harness ({{Vitest+jsdom / headless-Tauri / equivalent}}) and assert observable output. Harness absent = 🟡. **When `app_map: on`, `docs/app-map.md` is the drive/test script for this pass** — Pass 4 (observed-running) for `ui`, the run-it equivalent (invoke the command / curl the endpoint / call the export) for `command` / `endpoint` / `api`. Walk each entry for the surfaces this milestone touched; a map entry whose gesture doesn't reproduce live is a finding. The Verifier *uses* the map — it does not author it.

Add for Full (`pass_1_2_3_4`):

4. **Multi-call invariants.** For each public API / IPC method / Tauri command added, assert called twice in sequence works.

### V.4 Findings format

Output: `retrospectives/M[NN].V-findings.md` using `sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md`. Required tier-coverage caveat at top of file naming passes run, passes NOT run, bug classes NOT checked.

### V.5 CLI Prompt

```xml
<verifier_stage_prompt id="M[NN].V">
  <context>
    Verifier stage of M[NN]. Stages A–D have committed on the milestone branch.
    Fresh CLI session — prior retrospectives deliberately excluded from read_first
    to avoid confirmation bias. Goal: contract-fidelity check. Did the code do what
    the spec and phase doc said it would, when actually exercised?
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md §3.4 (verifier protocol)</file>
    <file>sbak/STAGE-PROMPT-PROTOCOL.md §8.5 (verifier-only tags)</file>
    <file>docs/build-prompts/M[NN]-{{slug}}.md (this phase doc, sections A–D + V)</file>
    <file>spec/project-spec.md §{{relevant sections}}</file>
    <file>docs/gates.md (M[NN] row)</file>
    <file>docs/gotchas.md</file>
    <file>docs/app-map.md (when app_map: on — the observed-running drive/test script for the behavior pass)</file>
    <!-- DELIBERATELY OMITTED: retrospectives/, docs/gap-analysis.md carry-forward. The bias guard. -->
  </read_first>

  <scope_to_verify>
    <phase_doc ref="docs/build-prompts/M[NN]-{{slug}}.md"/>
    <spec_sections>§{{...}}</spec_sections>
    <code_paths>
      <path>{{src/foo/}}</path>
    </code_paths>
  </scope_to_verify>

  <verification_passes>
    <!-- G14: the calibration self-test is REQUIRED and runs
         FIRST. The verifier opens by running its plan-challenge against the seeded-defect set
         (prompts/calibration/) and must catch every seed (FNR = 0) before any real finding counts;
         record seeds-caught / FNR as the `calibration` block. A verifier_stage_prompt WITHOUT it
         fails schema validation. Honest locus: the floor only checks the pass is WIRED; the catch
         is the recorded FNR (judgment at V-time, not a pre-commit check). -->
    <pass name="calibration_self_test" harness="run the plan-challenge against prompts/calibration/ — FNR must be 0 (catch every seeded defect) before any real finding counts; record seeds-caught / FNR as the calibration block. Dogfoods G14: if YOU miss a seed, the verifier-proof works and the milestone has a real finding"/>
    <pass name="inventory"/>
    <pass name="hooks"/>
    <pass name="behavior" harness="{{Vitest+jsdom or equivalent}}" drive_script="docs/app-map.md (when app_map: on — a gesture that doesn't reproduce live is a finding)"/>
    <!-- G10 cluster-gate: MANDATORY when the surface class is runtime/drivable
         (ui/command/endpoint) — drive the REAL assembled surface, retain the run reference
         into the App-Map Evidence column. Omit only for a library (api) surface. -->
    <pass name="assembled_execution" drive="docs/app-map.md" observe="real-surface (retain command + result into the Evidence column; a verified drivable entry with no Evidence reference is a G10 finding)"/>
    <!-- plan_challenge is a REQUIRED matrix-anchored verifier pass —
         the standing home for the escape catalog. A
         verifier_stage_prompt WITHOUT it fails schema validation; present-but-hollow (no matrix
         anchor) warns. Stage C's seeded-defect calibration (G14) proves it catches defects. -->
    <pass name="plan_challenge" harness="anchored on the declared risk matrix: which of the 9 properties (normal / hostile-input / partial-failure / confinement / authorization / resource-bounds / recovery / observability / cross-platform) did the plan and acceptance criteria leave unproven? + the standing escape catalog (an n/a that's false; a count/verdict in prose dodging a fenced block; assert-a-constant / always-matching-snapshot / mock-only; a forged ledger that still reconciles; a stub that passes 'assembled'; an under-declared trigger; a toy-path confinement; a bare-startsWith; a quietly-dropped fence caveat; did the milestone follow the gate-design contract). Bounded: against the declared 9, not arbitrary threats. Any presence-as-effectiveness path = finding."/>
    <!-- Add multi_call_invariants for Full tier -->
  </verification_passes>

  <findings_format ref="sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/M[NN].V-findings.md</output_file>
    <severity_model>
      <level>🔴 critical — blocks milestone PR merge</level>
      <level>🟡 important — carry forward to next milestone's Stage A</level>
      <level>🟢 nice-to-have — append to docs/tech-debt.md</level>
    </severity_model>
    <coverage_caveat_required>true</coverage_caveat_required>
  </findings_format>

  <merge_gate>
    <on_critical_finding>open D.fix stage scoped to the finding; re-run V after</on_critical_finding>
    <iteration_cap rounds="2">After 2 D.fix iterations, escalate to maintainer</iteration_cap>
    <structural_signal>If D.fix introduces a 🔴 outside the original scope, stop iterating; consider re-tiering</structural_signal>
    <waiver_path>Build agent files ADR at docs/adr/NNNN-waiver-M[NN]-finding-N.md if disputing a finding on interpretation grounds</waiver_path>
  </merge_gate>

  <gates milestone="M[NN]"/>

  <retrospective_requirements ref="sbak/templates/VERIFIER-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M[NN]-{{slug}}.md" section="V.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*`</item>
    <item>per-pass summary (N inventoried, N hook traces verified, N invariants tested, N behavior assertions)</item>
    <item>findings list sorted by severity (🔴 → 🟡 → 🟢)</item>
    <item>retrospective [END] section (brief — just "did the verification surface what it should")</item>
    <item>recommendation: proceed to E / open D.fix / file waiver / re-tier</item>
    <item>explicit statement: the stage is ready</item>
  </approval_surface>
</verifier_stage_prompt>
```

### V.6 Commit Message

```
verify(M[NN]): findings — {{N}}🔴 {{N}}🟡 {{N}}🟢

{{One-line summary of what was verified and what surfaced.}}

Passes run: {{inventory, hooks, behavior}}.
Passes NOT run: {{multi_call_invariants}}.
Coverage caveat present in findings file: yes.

🔴 findings: {{list of finding IDs and one-line each, or "none"}}
🟡 findings: {{count, carried forward to M[NN+1].A read list}}
🟢 findings: {{count, appended to docs/tech-debt.md}}

Signed-off-by: {{Name}} <{{email}}>

https://claude.ai/code/session_<id>
```

---

## Stage R — Refactor health check *(Full tier; trigger-based)*

> Optional and trigger-based — include this section only when `refactor_mode` is not `skip`. Stage R runs when `docs/tech-debt.md` has ≥ the threshold count OR the milestone interval has elapsed, whichever first (`sbak/FRAMEWORK-CONFIG.md` §4.11, `sbak/BUILD-PLAYBOOK.md` §3.4.5). Parallel to Stage V but asks **"is the code maintainable?"** against the *cumulative* codebase, not "did this milestone do what was promised?"

### R.1 Problem Statement

Fresh-context structural assessment of the cumulative codebase since the last Stage R. Distinct from Stage V (contract fidelity, this milestone's deliverables) and from closeout (cumulative review *with* full context — which carries the bias Stage R exists to remove). Catches duplicate helpers overdue for extraction, complexity creep, dead code, and dependency drift. Read list omits prior retrospectives **and prior R findings** — one step stricter than V's bias guard.

### R.2 Scope to refactor

- Cumulative codebase since: {{last Stage R, or project start}}
- Code paths: {{src/, …}}
- Tech-debt ledger: `docs/tech-debt.md` (read for the trigger count; append 🟢 findings)
- Out of scope: anything outside the named paths — flag "defer to an explicit audit stage"

### R.3 Refactor passes

For the Full default (`trigger_n5`): **Duplication + Drift** (add Complexity only if a linter integration is named in `docs/gates.md`).

1. **Duplication.** ≥3 similar code blocks overdue for extraction (acceptable at 2; flagged at 3+).
2. **Drift.** Dead code (no callers), dead dependencies (no imports), version drift, schema drift.

Add for Full (`trigger_n3`):

3. **Complexity.** Functions over cyclomatic (default 15) or length (default 80-line) threshold; via {{eslint complexity / ruff / gocyclo / manual}}.

### R.4 Findings format

Output: `retrospectives/M[NN].R-findings.md` using `sbak/templates/REFACTOR-FINDINGS-TEMPLATE.md`. Required tier-coverage caveat at top of file naming passes run, passes NOT run, structural classes NOT checked.

### R.5 CLI Prompt

```xml
<refactor_stage_prompt id="M[NN].R">
  <context>
    Refactor health check (Stage R) of M[NN]. Triggered by refactor_mode
    (docs/tech-debt.md count OR milestone interval). Fresh CLI session — prior
    retrospectives AND prior R findings deliberately excluded from read_first to
    avoid "we already cleaned this up" bias. Goal: structural assessment. Is the
    cumulative codebase still maintainable?
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md §3.4.5 (refactor health check)</file>
    <file>sbak/STAGE-PROMPT-PROTOCOL.md §8.6 (refactor-only tags)</file>
    <file>docs/build-prompts/M[NN]-{{slug}}.md (this phase doc, Stage R section)</file>
    <file>docs/gates.md (any named complexity-linter integration)</file>
    <file>docs/gotchas.md</file>
    <!-- DELIBERATELY OMITTED: retrospectives/, prior R findings, milestone summaries. The bias guard (stricter than V). -->
  </read_first>

  <scope_to_refactor>
    <since milestone="M[NN-1]" note="last Stage R (or project start); review everything merged since"/>
    <code_paths>
      <path>{{src/}}</path>
    </code_paths>
    <tech_debt_ledger ref="docs/tech-debt.md"/>
  </scope_to_refactor>

  <refactor_passes>
    <pass name="duplication"/>
    <pass name="drift"/>
    <!-- Add complexity when a linter is named in docs/gates.md (or under an explicit escalation): -->
    <!-- <pass name="complexity" linter="{{eslint --rule complexity}}"/> -->
  </refactor_passes>

  <findings_format ref="sbak/templates/REFACTOR-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/M[NN].R-findings.md</output_file>
    <severity_model>
      <level>🔴 critical — blocks the next milestone PR (rare; compounds per-milestone or risks data loss/security)</level>
      <level>🟡 important — open a D.refactor stage before the next milestone</level>
      <level>🟢 nice-to-have — append to docs/tech-debt.md</level>
    </severity_model>
    <coverage_caveat_required>true</coverage_caveat_required>
  </findings_format>

  <merge_gate>
    <on_critical_finding>open a D.refactor stage scoped to the finding; re-run V (contracts) then R (structure) after</on_critical_finding>
    <iteration_cap rounds="2">After 2 D.refactor iterations, escalate to the maintainer</iteration_cap>
    <structural_signal>If a D.refactor introduces a 🔴 outside the original scope, the refactor scope was wrong; stop and reassess</structural_signal>
    <waiver_path>Build agent files ADR at docs/adr/NNNN-waiver-M[NN]-R-finding-N.md if disputing a finding</waiver_path>
  </merge_gate>

  <gates milestone="M[NN]"/>

  <retrospective_requirements ref="sbak/templates/REFACTOR-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M[NN]-{{slug}}.md" section="R.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].R*`</item>
    <item>per-pass summary (N duplication clusters, N complexity hotspots, N drift items)</item>
    <item>findings list sorted by severity (🔴 → 🟡 → 🟢)</item>
    <item>retrospective [END] section (brief — "did the health check surface what it should")</item>
    <item>recommendation: proceed / open D.refactor / file waiver / re-tier</item>
    <item>explicit statement: the stage is ready</item>
  </approval_surface>
</refactor_stage_prompt>
```

### R.6 Commit Message

```
refactor(M[NN]): findings — {{N}}🔴 {{N}}🟡 {{N}}🟢

{{One-line summary of the structural assessment and what surfaced.}}

Passes run: {{duplication, drift}}.
Passes NOT run: {{complexity}}.
Coverage caveat present in findings file: yes.

🔴 findings: {{list of finding IDs and one-line each, or "none"}}
🟡 findings: {{count, D.refactor before next milestone}}
🟢 findings: {{count, appended to docs/tech-debt.md}}

Signed-off-by: {{Name}} <{{email}}>

https://claude.ai/code/session_<id>
```

---

## Stage E — Closeout

### E.1 Problem Statement

Closeout aggregates the milestone's process record, evaluates the product against the spec, and produces the milestone PR.

### E.2 Files Produced

**New:**

- `retrospectives/M[NN]-summary.md` (per `prompts/SUMMARY-TEMPLATE.md`)
- New entry in `docs/gap-analysis.md` (per `sbak/templates/gap-analysis.md` entry shape — six required sections)
- Draft PR description (in PR description field, not committed)

**Modified:**

- `docs/identity.md` — update Status section (last shipped, next milestone)
- `docs/gates.md` — add per-module coverage baselines if any new safety primitives landed

### E.3 Closeout deliverables

(Replaces "Detailed Changes" for the closeout stage.)

- **Milestone summary** — `retrospectives/M[NN]-summary.md`. Aggregate per-stage retrospectives; score axes across stages; mark verdict.
- **Gap-analysis entry** — append to `docs/gap-analysis.md`. Six required sections. Carry-forward addresses prior milestones' open items.
- **PR description** — draft only. Do not open the PR until user approves the three-artifact review.
- **Off-track check (full path; gate G8)** — re-read `docs/backlog.md` against everything M[NN] shipped, re-confirm the ranking reflects the user's priorities (do not re-rank it yourself — flag a stale ranking for the user), and run the off-track check (`sbak/BUILD-PLAYBOOK.md` §3.5). A standing unjustified priority inversion (a lower-ranked story built ahead of a higher-ranked backlogged one with no build-sequence necessity logged in `docs/off-track-log.md`) **blocks the PR under `off_track_check: enforced` / warns under the Full default (`advisory`)**. Any resulting backlog edit is HITL co-authored — proposed by the agent, ratified by the human.

### E.4 Acceptance criteria

(Replaces "Tests" for the closeout stage.)

1. Milestone summary written per `prompts/SUMMARY-TEMPLATE.md`; all sections complete (no `{{...}}` placeholders left)
2. Gap-analysis entry appended; six required sections present (none replaced with omission); Carry-forward addresses every prior milestone's open items by status
3. Append-only verification: prior `docs/gap-analysis.md` entries byte-identical to committed state (the shared `append-only-ledger.yml` CI gate, which runs `validators/check-append-only.cjs`, passes)
4. Three-artifact surface ready: cumulative diff + summary + gap-analysis entry
5. PR description drafted, not yet pushed
6. `docs/identity.md` Status section updated
7. Off-track check run against `docs/backlog.md` (gate G8): no standing unjustified priority inversion — or one is surfaced (warning under the Full default `advisory` / PR-blocking under `enforced`), with any backlog edit human-ratified

### E.5 CLI Prompt

```xml
<closeout_stage_prompt id="M[NN].E">
  <context>
    Closeout stage of M[NN]. Stages A–D have committed on the milestone branch.
    This stage produces the cumulative artifacts: M[NN] summary aggregating retrospectives,
    the new docs/gap-analysis.md entry, and the draft PR description. The gap-analysis commit
    is the final commit on this branch and gates the PR push.
  </context>

  <read_first>
    <file>sbak/BUILD-PLAYBOOK.md (especially §3.4, §4.6)</file>
    <file>docs/identity.md</file>
    <file>docs/gates.md</file>
    <file>spec/project-spec.md §{{relevant sections}}</file>
    <file>docs/scope.md §M[NN]</file>
  </read_first>

  <cumulative_reads>
    <codebase>entire shipped codebase to date (cumulative across all prior milestones + M[NN].A–M[NN].D commits)</codebase>
    <spec>spec/project-spec.md (end-to-end, focus on M[NN]-touched sections)</spec>
    <gap_analysis>docs/gap-analysis.md (all prior entries; M[NN].E appends the next)</gap_analysis>
    <retrospectives>retrospectives/M[NN].A-retrospective.md, M[NN].B-, M[NN].C-, M[NN].D-retrospective.md (all work stages)</retrospectives>
  </cumulative_reads>

  <deliverables>
    <milestone_summary>retrospectives/M[NN]-summary.md (per prompts/SUMMARY-TEMPLATE.md)</milestone_summary>
    <gap_analysis_entry>docs/gap-analysis.md (append entry; six required sections, none optional)</gap_analysis_entry>
    <pr_description>draft only; PR opens only on explicit human ask after approval</pr_description>
    <!-- v1.5 optional — include when `app_map: on`. The Stage-E counterpart of the
         per-stage <app_map_delta>: reconcile the WHOLE docs/app-map.md (not just this
         milestone's surfaces), confirm no shipped surface is missing, and refresh the
         as-of-commit stamp to the closeout commit.
    <app_map_reconcile ref="docs/app-map.md">
      <whole_map_pass>every surface shipped this milestone has a current entry; no dead verified test-ids</whole_map_pass>
      <as_of_commit_refresh>update the header stamp to the closeout commit</as_of_commit_refresh>
    </app_map_reconcile>
    -->
  </deliverables>

  <gap_analysis_requirements ref="sbak/BUILD-PLAYBOOK.md" section="3.4 Gap Analysis Entry">
    <gotchas_graduation>
      <stage_review id="A">
        <gotcha>{{per-stage gotcha from Stage A}}</gotcha>
        <disposition>{{kept | graduated | resolved | expired}}</disposition>
        <target>{{where it goes — e.g., docs/gotchas.md §N, commit <sha>, M[NN+1].A per-stage gotchas, n/a + rationale}}</target>
      </stage_review>
      <stage_review id="B">
        <gotcha>{{...}}</gotcha>
        <disposition>{{...}}</disposition>
        <target>{{...}}</target>
      </stage_review>
      <stage_review id="C">
        <gotcha>{{...}}</gotcha>
        <disposition>{{...}}</disposition>
        <target>{{...}}</target>
      </stage_review>
      <stage_review id="D">
        <gotcha>{{...}}</gotcha>
        <disposition>{{...}}</disposition>
        <target>{{...}}</target>
      </stage_review>
    </gotchas_graduation>
  </gap_analysis_requirements>

  <append_only_verification>
    <local_check>run validators/check-append-only.cjs: prior content of docs/gap-analysis.md must be a CRLF-normalized prefix of HEAD before commit</local_check>
    <ci_check name="append-only-ledger">the shared append-only-ledger.yml runs check-append-only.cjs; fails if any prior entry is no longer a byte-prefix of the current file</ci_check>
  </append_only_verification>

  <off_track_check gate="G8" ref="sbak/BUILD-PLAYBOOK.md" section="3.5">
    <step>re-read docs/backlog.md against everything M[NN] shipped; re-confirm the ranking reflects the user's priorities (do NOT re-rank it yourself — flag a stale ranking for the user)</step>
    <step>run the full off-track check: was the highest-priority unblocked, in-scope story the one M[NN] built?</step>
    <on_standing_unjustified_inversion>blocks the PR under enforced / warns under the Full default (advisory); resolve via a human-ratified re-prioritization (override-logged) or a build-sequence justification appended to docs/off-track-log.md</on_standing_unjustified_inversion>
    <hitl_co_authorship>any docs/backlog.md edit is proposed by the agent and ratified by the human — never folded silently into the closeout commit (G8 clause b)</hitl_co_authorship>
  </off_track_check>

  <three_artifact_review>
    <artifact>code diff (cumulative M[NN].A through M[NN].E)</artifact>
    <artifact>per-stage retrospectives + M[NN] milestone summary</artifact>
    <artifact>new docs/gap-analysis.md entry</artifact>
    <pushback_blocks_pr>true</pushback_blocks_pr>
  </three_artifact_review>

  <scope_locks>
    <lock>Append-only is a hard rule (sbak/BUILD-PLAYBOOK.md §4.1, §4.6) — no editing prior entries, ever</lock>
    <lock>The `<gotchas_graduation>` subsection must list every prior stage of M[NN], even those with no gotchas (write "None observed.")</lock>
  </scope_locks>

  <gates milestone="M[NN]"/>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>The "Carry-forward" section in the gap-analysis entry is required even when empty — write "None observed." rather than omit (sbak/BUILD-PLAYBOOK.md §3.4)</trap>
    <trap>Severity is non-elastic — if M[NN] has a pile of 🔴 Criticals in the fix backlog, the milestone shouldn't ship; surface this rather than rationalize</trap>
  </gotchas>

  <time_box estimate_hours="{{N}}"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M[NN]-{{slug}}.md" section="E.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md` (full milestone retro chain)</item>
    <item>new gap-analysis entry text (full)</item>
    <item>diff of docs/gap-analysis.md (proves append-only — only new lines at bottom)</item>
    <item>M[NN]-summary.md (full)</item>
    <item>draft PR description (per .github/PULL_REQUEST_TEMPLATE.md if present)</item>
    <item>draft commit message from M[NN]-{{slug}}.md E.6 Commit Message section</item>
    <item>explicit statement: "M[NN] closeout is ready."</item>
  </approval_surface>
</closeout_stage_prompt>
```

### E.6 Commit Message

```
M[NN].E: closeout — gap-analysis entry, milestone summary

{{Body: brief recap of the milestone, the gap-analysis entry's headline finding, the verdict.}}

Stage: M[NN].E — Closeout
Phase doc: docs/build-prompts/M[NN]-{{slug}}.md
Summary: retrospectives/M[NN]-summary.md
Gap analysis: docs/gap-analysis.md (M[NN] entry)
Session: {{filled in at commit time}}

Verdict: {{Strong / Sound / Rough but shipped / Recovery needed}}
Gates passing: all M[NN] hard gates (per docs/gates.md)
```

---

*This Phase doc is the single source of truth for M[NN]. Stage CLI prompts paste from here; retrospectives reference the stage sections; the gap-analysis entry references the milestone-level constraints. Keep it consistent.*
