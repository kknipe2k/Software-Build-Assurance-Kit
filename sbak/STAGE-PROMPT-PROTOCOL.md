# Stage Prompt Protocol

> **Human reader: you can skip this file.** It is part of the agent's operating manual — a reference the build sessions consult, deliberately exhaustive. Start at `README.md` → `QUICKSTART.md`, and ask questions in-session rather than reading ahead.

> XML schema for stage CLI prompts. Defines required and optional slots, the five schemas (work, verifier, refactor, closeout, audit-pass), where prompts live, and how they're extracted and validated. Companion to `BUILD-PLAYBOOK.md` and `FRAMEWORK-CONFIG.md`.
---

## 0. Tier-conditional applicability

This protocol is **fully active at Full tier**. In Lite tier, stage prompts are usually not XML-structured — Lite milestones use plain markdown task lists in `docs/build-prompts/M[NN]-<title>.md`, and the agent works from the task list directly. The XML schema below applies if a Lite project escalates to Full mid-flight.

**Required tags by tier:**

| Tag category | Lite | Full |
|---|---|---|---|
| `<context>`, `<read_first>`, `<scope_locks>`, `<gates>` | n/a (markdown) | required | required |
| `<retrospective_requirements>`, `<commit_protocol>`, `<commit_message>` | n/a | required | required |
| `<approval_surface>` (with cross-machine state as leading item) | n/a | required (cross-machine state is required from v1.3) | required |
| `<deliverable>`, `<execution_steps>`, `<test_plan_required>`, `<acceptance_criteria>` (work-stage) | n/a | required | required |
| `<read_prior_stages>` (Stage B+) | n/a | required | required |
| `<cumulative_reads>`, `<deliverables>`, `<gap_analysis_requirements>`, `<append_only_verification>`, `<three_artifact_review>` (closeout) | n/a (no closeout) | required |
| `<scope_to_verify>`, `<verification_passes>`, `<findings_format>`, `<merge_gate>` (verifier) | optional (Pass 1 only if used) | required | required |
| `<scope_to_refactor>`, `<refactor_passes>`, `<findings_format>`, `<merge_gate>` (refactor) | n/a (skip Stage R) | required when Stage R runs (trigger-based) | required when Stage R runs (trigger-based) |
| `<pre_flight_check>`, `<schema_drift_check>`, `<fan_out_grep>`, `<dependency_audit_check>`, `<runtime_environment>` (v1.3 additions) | n/a | optional | optional |
| `<read_reference>`, `<execution_warnings>`, `<adr_triggers>`, etc. | n/a | optional | optional |

**Validator.** Required-tag enforcement is no longer documentation-only. The kit ships `validators/validate-stage-prompts.cjs` (Node, ~250 lines, no dependencies) that extracts fenced ```xml blocks, identifies the root element, and verifies required tags per schema. Runs as a pre-commit hook + CI gate. See `validators/README.md` for usage. Adding a new schema variant requires extending the validator's `SCHEMAS` table at the same time — don't ship schema definitions that lack enforcement.

The root-element identification itself lives in **one shared module**, `scripts/lib/stage-structure.cjs`, which the UserPromptSubmit mode-check hook consumes too — so what the validator calls a work prompt can never be a verifier prompt to the role guard. The claim it supports is deliberately narrow: **for this grammar** it identifies the outer stage element; it is not a general XML parser and not a security boundary. "Exactly one root element per block" is enforced from that read, not assumed.

**`ORCHESTRATOR.md` is never a stage-prompt read.** No stage prompt — work, verifier, or closeout — may list `ORCHESTRATOR.md` in `<read_first>` (or reference it anywhere in the prompt). It is the orchestrator role's manual; build sessions follow `CLAUDE.md` + their stage prompt and ignore it. The validator (`validators/validate-stage-prompts.cjs`) errors on any stage prompt that references `ORCHESTRATOR.md`.

**Read-first cap interaction.** The `<read_first>` tag's contents are subject to the project's `read_first_cap` toggle (Lite=4 `small`, Full=8 `medium`; `large`=12 / unlimited by explicit choice — see `FRAMEWORK-CONFIG.md` §4.5). Authors should not write a 12-file `<read_first>` list when the project is configured for `medium` cap — the SessionStart hook will truncate, and the truncated subset may not match what the prompt assumed. If a stage genuinely needs more files than the cap allows, raise the cap for the project, or note the deviation in the stage's `<context>` (e.g., "this stage exceeds the project's read-first cap because cumulative review is the deliverable").

**Closeout exception.** The closeout stage does not suspend the read-first cap — it replaces it with the **bounded closeout read list** (N6): the append-only ledgers + the milestone's own artifacts + the touched spec sections + the cumulative diff, read under the same loud-truncation semantics as any capped list (I7). A closeout prompt populates `<cumulative_reads>` with that bounded set (see `BUILD-PLAYBOOK.md`'s closeout protocol for the enumerated list); it is not a licence to "read everything" regardless of cap.

---

## 1. Purpose
Stage CLI prompts are the structured input pasted into a fresh agent session at the start of each stage. They orient the agent, constrain scope, name the gates, and reference the protocols (retrospective, commit, gate matrix) the stage must follow.
This document defines the schema. It is the canonical reference for how stage prompts are written; the bare templates derived from it live at `prompts/WORK-STAGE-TEMPLATE.md` and `prompts/CLOSEOUT-STAGE-TEMPLATE.md`.
## 2. Why XML inside markdown
The Phase doc has two distinct audiences with different needs.
The human reads it for planning, scope review, and navigation. Markdown is what humans read — headers, tables, links, prose narrative for the milestone.
The agent in a fresh session consumes the structured prompt portion. It benefits from explicit slots (`<context>`, `<deliverable>`, `<gates>`) so nothing required gets dropped, parsing is unambiguous, and stage prompts can be diffed cleanly across milestones to see exactly what evolved.
Pure-markdown prompts lose the slot discipline that makes them parseable and diffable. Pure-XML phase docs become unreadable for the planning purpose. The hybrid — markdown wrapper, XML inside fenced code blocks — gives both audiences what they need.
A second-order benefit: every prompt across all milestones can be extracted programmatically with a single regex over fenced ```xml blocks. This is the bridge to an orchestrator running phases later without rewriting the prompts.
## 3. Where prompts live
Inside fenced ````xml` code blocks within `docs/build-prompts/M[NN]-<title>.md`. One fenced block per stage. The Phase doc's markdown wrapper is for human planning and review; the XML inside the fenced blocks is what gets pasted into a fresh agent session.
The Phase doc looks roughly like this:
```markdown
# M01: Foundation

## Overview
[prose: what this milestone is, why now, what depends on it]

## Scope
**In scope:** ...
**Out of scope:** ...

## References
| File | Read for |
|---|---|
| ... | ... |

## Stage A — Workspace skeleton
[prose: what Stage A is, what it produces, time-box estimate]

### CLI prompt
\`\`\`xml
<work_stage_prompt id="M01.A">
  ...
</work_stage_prompt>
\`\`\`

## Stage B — ...
[same pattern]

## Stage E — Closeout
[prose: closeout responsibilities]

### CLI prompt
\`\`\`xml
<closeout_stage_prompt id="M01.E">
  ...
</closeout_stage_prompt>
\`\`\`
```
## 4. Programmatic extraction
The contract for extraction is simple and stable:
- Every stage prompt is inside a fenced ````xml` block.
- Exactly one root element per block: `<work_stage_prompt>`, `<closeout_stage_prompt>`, `<verifier_stage_prompt>`, `<refactor_stage_prompt>`, or `<audit_pass_prompt>`.
- The root element has an `id` attribute formatted `M[NN].<X>` (e.g., `M01.A`, `M01.E`, `M01.V`, `M01.R`, `M01.P`).
A regex extractor: ````xml\n(<(?:work_stage_prompt|closeout_stage_prompt|verifier_stage_prompt|refactor_stage_prompt|audit_pass_prompt)[\s\S]*?</(?:work_stage_prompt|closeout_stage_prompt|verifier_stage_prompt|refactor_stage_prompt|audit_pass_prompt)>)\n````
A validator should:
- Confirm one and only one root element per block
- Confirm the root tag is one of the five valid schemas
- Confirm `id` attribute matches the format
- Confirm all required tags for the schema are present
- Confirm no foreign tags appear (every tag must be in the protocol)

The kit ships an implementation at `validators/validate-stage-prompts.cjs`. Use it.

## 5. The five schemas
There are exactly five stage prompt schemas. They share most tags but each adds requirements that don't apply to the others.

| Schema | Used for | Distinct requirements |
|---|---|---|
| `<work_stage_prompt>` | Work stages (A, B, C, D, …) | Concrete deliverable, test plan required, acceptance criteria |
| `<verifier_stage_prompt>` | Verifier stage (V, between last work stage and closeout) | Scope to verify, verification passes, findings format, merge gate. Forbids `<read_prior_stages>` — the fresh-context bias guard. |
| `<refactor_stage_prompt>` | Refactor health-check stage (R, trigger-based; runs in a fresh session like V) | Scope to refactor, refactor passes, findings format, merge gate. Forbids `<read_prior_stages>` and omits prior R findings — the fresh-context bias guard, one step stricter than V's. |
| `<closeout_stage_prompt>` | Closeout stage (E, the final stage of every milestone) | Cumulative reads, gap-analysis entry, append-only verification, three-artifact review |
| `<audit_pass_prompt>` | Audit dimension pass + challenge (`operating_mode: audit`; P1–P8 and per-pass challenge, each in a fresh session) | Persona, scope, checklist, mandatory per-file sign-off, output format. **Runs as `role: verifier`** — audit *is* verification; no new role value. The pass's persona + dimension + checklist ride on the prompt. |

The five are genuinely different ceremonies. Closeout does cumulative review and writes the immutable ledger entry. Verifier does fresh-context contract-fidelity checking with a deliberately narrowed read list (no prior retrospectives — see §11). Refactor does fresh-context *structural* assessment — same bias-guard mechanism as the verifier, different question ("is the code maintainable?" vs. "did it do what was promised?"). Work stages produce code with TDD. Forcing them into one schema with optional tags would lose enforcement: a closeout missing `<cumulative_reads>` is broken; a work stage missing it is fine. Four schemas make these differences enforceable.

> **Stage R is the fourth schema.** `<refactor_stage_prompt>` mirrors `<verifier_stage_prompt>` — the only structural deltas are `<scope_to_refactor>` (replacing `<scope_to_verify>`) and `<refactor_passes>` (replacing `<verification_passes>`); `<findings_format>` and `<merge_gate>` are shared shapes pointed at refactor-specific targets (`REFACTOR-FINDINGS-TEMPLATE.md`, `D.refactor`). Keeping the delta to those two tags is deliberate: it makes the add-a-stage recipe generalize (the audit schema is the next consumer). The refactor-only tags are defined in §8.6.

> **`<audit_pass_prompt>` is the fifth schema.** It serves the `audit` operating mode. Unlike Stage R it is **not** a minimal clone of the verifier — an audit pass is persona-driven and checklist-bound, so it swaps the verifier's `<scope_to_verify>` / `<verification_passes>` / `<findings_format>` / `<merge_gate>` for `<persona>` / `<scope>` / `<checklist>` / `<sign_off_requirement>` / `<output_format>`. What it **keeps** is the verifier's *posture*: a fresh-context review session that produces findings, running as **`role: verifier`** with **no new role value** — audit *is* verification. The audit-only tags are defined in §8.7.
## 6. Common tags (used by all schemas)
### Root attribute: `id`

Required. Format `M[NN].<X>`. Examples: `M01.A`, `M01.E`, `M11.D`. Used for retrospective filenames, session register entries, and cross-references.
### `<context>`
Required. Two to four sentences. Why this stage exists, what it builds on, what's about to happen. The orientation paragraph the agent reads first after expanding the prompt.
```xml
<context>
  Stage A of M01 (Foundation). Establish the workspace skeleton — module structure,
  workspace config, pre-commit hook, CI scaffold. No business logic yet; this stage
  exists so subsequent stages have a place to land. Builds on nothing; this is the
  first stage of the project.
</context>
```
### `<read_first>`
Required. Ordered list of files to read before any code. Cardinality: usually 4–8 files. Always includes the playbook, project identity, relevant spec sections, and the gate matrix.
```xml
<read_first>
  <file>BUILD-PLAYBOOK.md</file>
  <file>docs/identity.md</file>
  <file>docs/gates.md</file>
  <file>spec/project-spec.md §1</file>
  <file>docs/scope.md §M01</file>
  <file>docs/style.md</file>
  <file>docs/gotchas.md</file>
</read_first>
```
### `<read_prior_milestones>`
Optional. Used by Stage A of any non-first milestone that absorbs carry-forward work from prior milestones (the canonical pattern: Stage A closes 🟡 Important items from the prior milestone's gap-analysis entry before opening the milestone's real deliverables). Distinct from `<read_first>` (general orientation) and from `<read_prior_stages>` (within-milestone retrospectives, used by Stage B+).
```xml
<read_prior_milestones>
  <gap_analysis_carry_forward milestone="M01"/>
  <milestone_summary milestone="M01" section="Decisions to apply before next parent milestone"/>
</read_prior_milestones>
```
Multiple prior milestones can be referenced:
```xml
<read_prior_milestones>
  <gap_analysis_carry_forward milestone="M01"/>
  <gap_analysis_carry_forward milestone="M02"/>
  <milestone_summary milestone="M02" section="Decisions"/>
</read_prior_milestones>
```
Omit this tag for Stage A of the first milestone (no prior to absorb) and for Stage B+ (which uses `<read_prior_stages>` for within-milestone reads).
### `<scope_locks>`
Required. Constraints from spec or ADRs that apply across this stage. These are the things the agent must not do even if locally tempting. Contrasts with `<acceptance_criteria>` (what must be done) — `<scope_locks>` is what must not.
Inline form (use when no Phase doc section exists for stage scope — e.g., a single-stage milestone or a stage whose locks are uniquely stage-specific):
```xml
<scope_locks>
  <lock>scope-locked feature X is deferred to vN+1; no code paths anticipating it</lock>
  <lock>single operating mode in this release; no mode-routing logic</lock>
  <lock>single integration target in this release; no abstraction layer</lock>
  <lock>primary platform target as named in spec; CI runs on all platforms for drift detection</lock>
</scope_locks>
```
Reference form (required when the Phase doc has a "Key constraints" or equivalent section — strict reference-first per Authoring Rules §10). Section names are resolved by markdown-AST heading lookup, not URI fragments:
```xml
<scope_locks ref="docs/build-prompts/M02-<title>.md" section="Key constraints"/>
```
Use one form or the other, never both. Validator rejects inline content if the named section exists in the Phase doc (strict reference-first; v1.2 hardening).
### `<gates milestone="M[NN]"/>`
Required. Reference to the gate matrix. The agent looks up the milestone row in `docs/gates.md` to see which gates are live. Self-closing tag with `milestone` attribute.
```xml
<gates milestone="M01"/>
```
If a stage temporarily relaxes a gate (rare; requires ADR), use the override form:
```xml
<gates milestone="M01">
  <override gate="coverage_threshold" reason="ADR-N: M01.A produces no testable code; coverage gate activates at M01.B"/>
</gates>
```
### `<self_correction_budget>`
Optional; defaults to 3 per `BUILD-PLAYBOOK.md` §4.3. Override only when the work genuinely warrants it (e.g., a debugging stage where iteration is the deliverable).
```xml
<self_correction_budget>3</self_correction_budget>
```
### `<retrospective_requirements>`
Required. Reference to the per-stage retrospective template. Self-closing.
```xml
<retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md"/>
```
If the stage has retrospective items beyond the template (e.g., specific friction patterns to watch for), add them inline:
```xml
<retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md">
  <special_log>Time spent on workspace-config debugging — flag if &gt;30 min</special_log>
</retrospective_requirements>
```
### `<commit_protocol>`
Required. Reference to the playbook section. Self-closing. The agent re-reads §4.7 to refresh on the do-not-commit rule.
```xml
<commit_protocol ref="BUILD-PLAYBOOK.md#4.7"/>
```
### `<commit_message>`
Required. Reference to the pre-authored commit message in the Phase doc (each stage's `X.6 Commit Message` section). Self-closing. Section names are resolved by markdown-AST heading lookup, not URI fragments — drop the URL anchor form entirely (renderer-dependent slugification: `### A.6 Commit Message` → `#a6-commit-message` on GitHub, `#a-6-commit-message` on GitLab/mdBook, etc.).
```xml
<commit_message ref="docs/build-prompts/M02-<title>.md" section="A.6 Commit Message"/>
```
The agent uses the referenced commit message verbatim (filling in only the `session_<id>` placeholder) when surfacing for approval. Pre-authored commit messages keep audit-trail consistency across stages and let the human review the message as part of the Phase doc rather than re-evaluating each one ad-hoc.
If a stage genuinely cannot have a pre-authored commit message (rare; usually only experimental or recovery stages), inline form is permitted:
```xml
<commit_message inline="true">
  <type>feat</type>
  <scope>workspace</scope>
  <subject>...</subject>
  <body_template>...</body_template>
</commit_message>
```
Default to the reference form. Inline is the exception.

### `<read_reference>`
Optional. Files the agent should read for **archetypal pattern reference** (not orientation, not decisions). Distinct from `<read_first>` (general orientation files) and `<read_prior_stages>` (within-milestone retrospectives' Decisions sections). Use when the stage's implementation should mirror a pattern that already exists in the codebase.
```xml
<read_reference>
  <file purpose="primary archetype for this stage's pattern">src/<module>/<archetype-file>.<ext></file>
  <file purpose="secondary pattern reference">src/<other-module>/<pattern-file>.<ext></file>
</read_reference>
```
The `purpose` attribute is required — names *why* the file is being referenced. Without it, the slot degrades into "miscellaneous reads" and loses its discriminator value. Validator warns if `purpose` is missing (warning, not error, in v1.2; promote to error in v1.3 once usage stabilizes).

### `<execution_warnings>`
Optional. Inline operational warnings — workflow-time guardrails that apply during stage execution (cost concerns, side-effecting commands, environment-dependent behavior). Distinct from `<gotchas>` (pre-flight implementation traps) and `<scope_locks>` (deliverable-shape constraints).
```xml
<execution_warnings>
  <warning>DO NOT run integration tests against live external services in normal flow — incurs cost and/or rate-limit risk. Reserve for explicit smoke-test sessions with credentials in the configured secrets store.</warning>
  <warning>Coverage runs take several minutes on a clean cache — budget accordingly</warning>
</execution_warnings>
```
The distinction matters: a `<gotchas>` entry warns about a code-shape trap the agent might write into a file; an `<execution_warnings>` entry warns about a *command* the agent might run during the stage. Mixing them in `<gotchas>` (the v1.0/v1.1 pattern) loses the action-vs-artifact discriminator.
### `<approval_surface>`
Required. Enumerates what the agent surfaces to the human at stage end and in what order. The order matters — the human reads top-down.

**Cross-machine state is a required leading item from v1.3 onward.** Stages are committed locally on the build machine but not pushed between stages (per `BUILD-PLAYBOOK.md` §4.7). An orchestration session reading only `origin/main` from a different machine sees a partial view of project state. Surfacing the build machine's git log + retro file listing at session end closes the cross-session-blindness gap that produces false-premise rewrites.

For work stages, default order: cross-machine state → diff stat → gate results → retrospective → draft commit message → "I will not commit until you approve."
```xml
<approval_surface>
  <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md`</item>
  <item>diff stat (git diff --stat HEAD)</item>
  <item>gate results (each gate, pass/fail, key numbers)</item>
  <item>retrospective (filled-in [END] section)</item>
  <item>draft commit message (Conventional Commits + DCO + session URL)</item>
  <item>explicit statement: "I will not commit until you approve."</item>
</approval_surface>
```
The cross-machine state item is mandatory in v1.3+. Validator: structural — error if the first `<item>` of an `<approval_surface>` does not name `git log` and retrospective listing in the same item or as the first two items. v1.0–v1.2 grandfathered prompts exempt via header banner.
## 7. Work-stage-only tags
These tags are valid only inside `<work_stage_prompt>`.

v1.3 adds five additive optional tags — `<pre_flight_check>`, `<schema_drift_check>`, `<fan_out_grep>`, `<dependency_audit_check>`, `<runtime_environment>` — informed by cross-stack-integration friction surfaced in early milestones. See sections below.

v1.4 adds one additive optional tag — `<await_red_approval>` — the red-stop gate. See below.

### `<await_red_approval>`
Optional; **default-on at Full** (the agent inserts the red-stop whether or not the tag is present, unless the project has explicitly toggled it off). Present the tag to make the gate explicit in the prompt, or to override the default.

The red-stop adds a third approval gate to the per-stage loop. Without it the loop is two gates (plan-approval → stage-end); the agent writes failing tests, implements to green, and runs straight through. With it the loop is three gates: **plan-approval → red-approval → stage-end.** After the tests are written and confirmed failing (red), the agent stops, surfaces the test files, and waits for the user to approve the *test design* before implementing to green. This catches shallow or wrong-contract tests at the cheapest moment — before the implementation locks them in. It matters most when the build runs on a weaker model, which tends to write shallow tests.

```xml
<await_red_approval>
  After writing the tests and confirming they fail for the right reason, STOP.
  Surface the test files and the failing output. Do not implement until the
  user approves the test design.
</await_red_approval>
```

To turn the red-stop off for a project (e.g., Lite tier, expert solo dev), set `red_review: off` in `project-config.md`; the agent then runs the two-gate loop. The validator treats this tag as optional, so neither presence nor absence is an error — it is a behavioral default, not a structural requirement.

### `<status_log>`
Optional (default-on at Full). The build appends a one-line checkpoint to `.claude/build-status.md` at meaningful moments — red tests written, green achieved, gate results, current step — so an orchestrator consultation can ground in the build's in-flight state without the user hand-carrying routine progress. Uncommitted, gitignored, cleared at stage close. Courier relief, not a contract.

```xml
<status_log file=".claude/build-status.md">
  Append a dated one-line entry at: red confirmed, green achieved, each gate run,
  and stage-end. Don't narrate every micro-step — just the load-bearing moments.
</status_log>
```

### `<test_honesty>`
Optional tag, **required-by-gate** on work stages in v1.7+ Phase docs (the G9 test-honesty gate; enforced by `validators/validate-test-honesty.cjs`). Valid in `<work_stage_prompt>` and `<verifier_stage_prompt>`. It makes the test-honesty standard structural rather than prose: for each enforcement / security / destructive surface the stage touches, it declares **(a)** the **mutation** — the named point to break and which test must then go RED — and **(b)** the **effectiveness** assertion (proves the behavior, not "no error"; cross-boundary agreement uses an *independent* fixture, never one that agrees with itself).

**Risk-tiered, never blanket.** A real mutation is named only where the stage *declares a risk surface*; a pure utility/doc stage uses the explicit sentinel `n/a — no risk surface`. The slot is **never silently omitted** — the omission itself is the tell the gate exists to catch, so an absent slot on a v1.7+ work stage **blocks**. The gate does **not** mandate a global mutation score (that is the cargo-cult current practice warns against); it requires a mutant-killing test only on the declared surface.

Risk surface (names a mutation):
```xml
<test_honesty>
  Mutation: revert the fail-closed guard at validate-foo.cjs:42 back to swallowing
  the error → the smoke "git error → exit non-zero" test must go RED.
  Effectiveness: the test asserts the exit code, not "did not throw"; the
  cross-boundary fixture is independent of the producer.
</test_honesty>
```
Utility/doc stage (no risk surface):
```xml
<test_honesty>n/a — no risk surface</test_honesty>
```

**Grandfathering — banner-less = current.** The slot is required for any Phase doc that is **current**: one declaring **`**Protocol version:** v1.7`** or higher, **or a banner-less doc** — a doc with **no `**Protocol version:**` banner is treated as current (must comply), not grandfathered.** Only an **explicit pre-v1.7 banner** (e.g. `**Protocol version:** v1.0`) exempts a doc — that's the genuinely-old case. This closes the omission-escape where, under a "no banner = grandfathered" rule, any new doc could dodge G9 by simply omitting the banner (and the same escape applied to every version-gated rule). History is **not** retro-failed, because `validate-test-honesty.cjs` runs on the **changed set only** (`--staged` in the pre-commit), never `--all` over a repo's phase-doc history — so a committed-but-untouched older banner-less doc is never re-checked. The fix is applied **in lockstep** to the G13 risk-matrix validator (`validate-risk-matrix.cjs`), the other version-gated gate. See §10.

**Composition with coverage.** G9 is the *effectiveness* layer on top of the existing coverage gates: coverage proves a line *executed*; the test-honesty mutation proves the failure is *caught*. They compose; neither replaces the other.

**Honest limitation (presence-gated — the validator is the floor, Stage V is the adversary).** Like its two siblings (G10's presence-only App-Map Evidence cell and the count-reconciliation gate's presence-gated escape), `validate-test-honesty.cjs` can only assert *presence*, not *effectiveness*. (1) A tautological assertion (`expect(1).toBe(1)`), an always-matching snapshot, or a mock that asserts its own return all **pass** the static assertion-honesty heuristic — whether a present test actually *kills* its named mutation is judged in **Stage V's plan-challenge** (the slot's mutation is re-run there), never by the validator. (2) The assertion-honesty half is **JS/Cypress-centric** and silently no-ops on non-JS test files (a Python `def test_x()` with no `assert` passes unflagged); the **slot-requirement half is language-agnostic**, so G9 is not dead off JS, but the assertion-honesty signal is JS/TS-only until the vocabulary is extended to other test frameworks. Floor (validator) + adversary (Stage V) = a real gate; neither alone is.

### `<risk_declaration>`

Optional tag (v1.8+), valid in `<work_stage_prompt>`. **Required-by-gate (G13)** when a stage **declares a risk surface** — i.e. when the stage touches one of the `risk_triggers:` surfaces enumerated in `FRAMEWORK-CONFIG.md` §4.19 (destructive data ops, archives/extraction, untrusted-metadata fs-writes, credentials, untrusted HTML, installers). It names *what dangerous properties* the capability has, so the plan **and** a test cover each — closing the gap where a plan verifies its stated criteria while silently omitting one (a backup capability that proved round-trip/rollback/compatibility but never named **confinement**, so a path-traversal shipped).

The slot carries a `triggers="…"` attribute (the `risk_triggers:` tokens this stage hits) and the **bounded nine-property matrix** (the fixed set — the verifier challenges against *these*, not arbitrary invented threats): **normal · hostile-input · partial-failure · confinement · authorization · resource-bounds · recovery · observability · cross-platform**. Each `<property name="…">` is either `covered-by: <how> — test: <name>` (names a covering test) **or** an explicit `n/a — <reason>`.

```xml
<risk_declaration triggers="archive_extraction, untrusted_fs_writes">
  <property name="normal">covered-by: round-trip restore reproduces the source tree — test: backup.spec.ts "restore round-trips"</property>
  <property name="hostile-input">covered-by: a truncated/forged archive is rejected — test: backup.spec.ts "rejects malformed archive"</property>
  <property name="partial-failure">covered-by: a crash mid-restore leaves the prior tree intact — test: backup.spec.ts "no half-write on crash"</property>
  <property name="confinement">covered-by: a `../` / symlink entry is rejected (canonicalize-then-confine) — test: backup.spec.ts "rejects zip-slip escape"</property>
  <property name="authorization">n/a — local CLI surface, no auth boundary crossed</property>
  <property name="resource-bounds">covered-by: an oversized archive is capped — test: backup.spec.ts "rejects over size cap"</property>
  <property name="recovery">covered-by: rollback restores the pre-op state — test: backup.spec.ts "rollback on failure"</property>
  <property name="observability">covered-by: a restore failure is logged with cause — test: backup.spec.ts "logs restore failure"</property>
  <property name="cross-platform">n/a — single-platform target per docs/scope.md</property>
</risk_declaration>
```

**Bounded:** the 9 are the fixed set, covered-or-explicit-`n/a`. The verifier (Stage V's plan-challenge) challenges *against them* — it does not invent arbitrary threats.

**Enforcement (G13).** `validators/validate-risk-matrix.cjs` is the mechanical floor: a `<risk_declaration>` with a real (non-placeholder) trigger must address all 9 properties — a missing property, a property naming no covering test and no `n/a`, or an empty/placeholder one → **block** (AND-ed across all 9, fail-closed). A stage with **no** `<risk_declaration>` is a no-op (under-declaration is Stage V's job, not the validator's). **Honest limitation (presence-gated):** the validator asserts the 9 are *addressed* with a named test or `n/a` — whether the named coverage is *real*, or the `n/a` *true*, is judgment, re-run as **Stage V's plan-challenge**. Floor (validator) + adversary (Stage V) = a real gate. Like `<test_honesty>`, the tag is **optional in the `SCHEMAS` table** (presence enforced by the dedicated G13 validator keyed off the doc's protocol version, not `validate-stage-prompts.cjs`'s required-tag list — a banner-less or v1.7 doc must still validate).

### `<deliverable>`
Required. What this stage produces. Concrete: files, modules, capabilities. Not aspirational. If you can't enumerate it, the stage isn't ready to start.
Inline form (use only when no Phase doc section enumerates the deliverable — e.g., a stage with a one-or-two-item produce-list that doesn't warrant a Phase doc section):
```xml
<deliverable>
  <item>Workspace structure at repository root with the project's primary modules</item>
  <item>Top-level workspace config with members and shared lint rules</item>
  <item>Pre-commit hook config running format + lint + test (fast subset)</item>
  <item>.github/workflows/ci.yml with the M01 gate suite</item>
  <item>docs/adr/NNNN-<decision-title>.md (any ADR this stage produces)</item>
</deliverable>
```
Reference form (required when the Phase doc has a detailed `X.2 Files to Change` + `X.3 Detailed Changes` section — strict reference-first per Authoring Rules §10). Section names are resolved by markdown-AST heading lookup, not URI fragments:
```xml
<deliverable ref="docs/build-prompts/M02-<title>.md" section="A.3 Detailed Changes"/>
```
Use one form or the other, never both. Items in inline form are implicitly ordered (top-to-bottom = implementation order); items in the referenced section are ordered by their position in that section. Validator rejects inline content if the named section exists in the Phase doc.

### `<execution_steps>`
Required. Procedural anchor: the named sequence the agent walks during the stage. Provides the work-cycle skeleton without restating the playbook's internal rules. Each `<step>` names a phase the agent moves through; the playbook (`BUILD-PLAYBOOK.md`) defines what each named step entails.
```xml
<execution_steps>
  <step name="write_failing_tests" budget="1"/>
  <step name="implement" budget="1"/>
  <step name="verify_gates" budget_iterations="3"/>
  <step name="fill_retrospective"/>
  <step name="surface"/>
</execution_steps>
```
Standard step names (validator warns on unrecognized names): `write_failing_tests`, `implement`, `verify_gates`, `fill_retrospective`, `surface`. Stages with non-standard cycles (e.g., a debugging stage where iteration is the deliverable) may add custom steps with explicit `name` attributes; document them in the Phase doc's stage section.
The `budget` / `budget_iterations` attributes are advisory — if a stage budgets `verify_gates` at 3 iterations and the agent hits 4, the agent surfaces per `BUILD-PLAYBOOK.md` §4.3 escalation rule rather than silently continuing.
Why this slot exists: in v1.0/v1.1, the procedural sequence lived in inline STEP 1–5 prose inside each prompt. That worked but duplicated playbook content into every prompt and risked drift. The slot replaces the prose with named anchors that resolve to playbook sections.
### `<test_plan_required>`
Required. Almost always `true`. The agent must state the test plan before writing code per `BUILD-PLAYBOOK.md` §3.3. Setting `false` means the stage produces no testable code (rare; usually only the very first scaffolding stage of a project).
```xml
<test_plan_required>true</test_plan_required>
```
### `<acceptance_criteria>`
Required. The stage's exit conditions as a checklist. The agent verifies each before surfacing for approval. Distinct from gates (which are CI-style automated checks) and from `<deliverable>` (which is what files exist) — acceptance criteria are behavioral checks the deliverable must satisfy.
Inline form (use only when no Phase doc section enumerates the criteria):
```xml
<acceptance_criteria>
  <criterion>workspace build succeeds</criterion>
  <criterion>format check passes (no diff)</criterion>
  <criterion>lint passes with zero warnings</criterion>
  <criterion>pre-commit hook installation succeeds; hook fires on a test commit</criterion>
  <criterion>CI workflow file validates against the platform's schema</criterion>
  <criterion>ADR filed and PR-ready</criterion>
</acceptance_criteria>
```
Reference form (required when the Phase doc has a `X.4 Tests` or equivalent section enumerating behavioral checks — strict reference-first per Authoring Rules §10):
```xml
<acceptance_criteria ref="docs/build-prompts/M02-<title>.md" section="A.4 Tests"/>
```
Use one form or the other, never both. Validator rejects inline content if the named section exists in the Phase doc.
### `<read_prior_stages>`
Required for Stage B onward; omitted for Stage A. References to prior stage retrospectives' "Decisions for next stage" sections. The agent reads these as the first action in the stage and applies the decisions.
```xml
<read_prior_stages>
  <retrospective section="decisions">retrospectives/M01.A-retrospective.md</retrospective>
</read_prior_stages>
```
For Stage C+, list all prior stages of the same milestone:
```xml
<read_prior_stages>
  <retrospective section="decisions">retrospectives/M01.A-retrospective.md</retrospective>
  <retrospective section="decisions">retrospectives/M01.B-retrospective.md</retrospective>
</read_prior_stages>
```
### `<pre_flight_check>`

Optional (v1.3+). Pre-stage sanity checks the agent runs BEFORE any code is written or test plan executed. Distinct from `<read_first>` (orientation reads) and `<execution_steps>` (procedural sequence): pre-flight checks are environmental verifications — branch state, prior-stage commit presence, dependency installation, environment variables — that gate the stage from starting if violated.

Children: `<check>` elements with `name="..."` and inline body describing the check + expected outcome. Each `<check>` is a single shell command or condition; the agent runs them in order before STEP 1 of `<execution_steps>`.

Validator behavior (v1.3 lean): structural — error if the tag appears outside a work-stage prompt; warning if `<check>` children lack a `name` attribute.

Schema: work-stage only.

Example:

```xml
<pre_flight_check>
  <check name="branch_correct">git rev-parse --abbrev-ref HEAD must equal claude/m04-<title></check>
  <check name="prior_stage_committed">git log --oneline -1 must show "M04 Stage A" subject (Stage A.2 is current)</check>
  <check name="api_key_set">environment must have ANTHROPIC_API_KEY (or equivalent) set if stage exercises a live API</check>
</pre_flight_check>
```

If any check fails, the agent surfaces the failure and stops — does not proceed to STEP 1. Pairs naturally with cross-stack-integration stages where environment dependencies are easy to miss.

### `<schema_drift_check>`

Optional (v1.3+). Verify generated types (e.g., language types generated from `schemas/*.json`) match the schema source-of-truth committed to the repo. Wraps the project's regen-and-check command as a stage-level gate so the failure surfaces at pre-flight rather than mid-implementation. Addresses the recurring pattern where hand-maintained types drift from the schema source-of-truth (per `CLAUDE.md` §14 if the project uses schemas-as-source-of-truth).

Self-closing form supported. Optional `gate="..."` attribute names the specific gate command to run (project-specific; common forms: `cargo xtask regenerate-types --check`, `npm run codegen:check`, `make check-codegen`).

Validator behavior (v1.3 lean): structural — error if the tag appears outside a work-stage prompt.

Schema: work-stage only.

Example:

```xml
<schema_drift_check gate="<project regen-and-check command>"/>
```

When this tag appears in a stage prompt, the agent runs the gate command after STEP 2 (implement) and BEFORE STEP 3 (verify_gates); a non-zero exit fails the stage immediately and the agent surfaces "schema drift detected — regenerate types or update the schema." Skip this tag if the project does not use generated types.

### `<fan_out_grep>`

Optional (v1.3+). Explicit grep searches the agent must run before changing a name, type signature, or schema field — to find all call-sites that need coordinated updates. Addresses rename/move surprise bugs where a stage changes a type and the agent misses one consumer (recurring pattern across milestones).

Children: `<grep>` elements with `pattern="..."` and `purpose="..."` attributes. Each `<grep>` is a literal pattern (not regex unless purpose names regex); the agent runs them and lists matched files BEFORE making the rename or signature change.

Validator behavior (v1.3 lean): structural — error if the tag appears outside a work-stage prompt; warning if `<grep>` children lack `pattern` or `purpose` attributes.

Schema: work-stage only.

Example (a stage renaming a type):

```xml
<fan_out_grep>
  <grep pattern="ContextType" purpose="all callsites of the type being renamed; expect cross-module hits"/>
  <grep pattern="context_type" purpose="snake_case field name corresponding to the type; alternate-language consumer side"/>
  <grep pattern='"context"' purpose="serialized JSON field name on the wire; check schemas/ and any test fixtures"/>
</fan_out_grep>
```

The agent runs each grep and surfaces matched-file count per pattern. If any pattern matches files outside the stage's `<deliverable>` scope, the agent surfaces "rename fan-out exceeds stage scope" and asks for direction before proceeding.

A second use is value-consistency verification — confirming a hard-coded value (URL, version pin, identifier) in the stage's deliverable matches the convention already established in the codebase. Worked example: when authoring a new schema file, grep for `"$id"` across `schemas/` to confirm the base URL pattern matches existing schemas before writing the value into the new file.

### `<dependency_audit_check>`

Optional (v1.3+). Explicit verification of dependency tree state — version pins, feature flags, transitive audit findings — before code that depends on those deps is written. Addresses recurring patterns where a dependency's stub backend silently passed in the wrong configuration, or where transitive vulnerabilities required overrides.

Children: `<dep>` elements with `name="..."` (package), optional `required_features="..."` (comma-separated), optional `min_version="..."`, optional `audit="..."` (e.g., `audit="high"`). Each `<dep>` is a fact the agent verifies via the appropriate dep-tree inspection (`cargo tree -p <name> -e features`; `npm ls <name>`; `npm audit --audit-level=<audit>`; `pip show <name>`) before writing dependent code.

Validator behavior (v1.3 lean): structural — error if the tag appears outside a work-stage prompt; warning if `<dep>` children lack a `name` attribute.

Schema: work-stage only.

Example:

```xml
<dependency_audit_check>
  <dep name="<library>" required_features="feature-1,feature-2" min_version="<version>"/>
  <dep name="<library>" required_features="rustls,json,stream"/>
  <dep name="<library>" min_version="<version>" audit="high"/>
</dependency_audit_check>
```

When this tag appears in a stage prompt, the agent runs the verification commands during STEP 2 (implement) before adding code that depends on the verified deps. A failed verification surfaces as a blocker — the agent stops and asks for direction before proceeding.

### `<runtime_environment>`

Optional (v1.3+). Explicit declaration of the OS the build agent is expected to run on for this stage, plus platform-specific command variants where the prompt body contains commands that differ across OS (e.g., `Select-String` vs `grep`, `Test-Path` vs `test -f`). Addresses CRLF warnings, PowerShell-vs-bash command differences in stage prompts, and platform-unsupported caveats.

Self-closing form with `os="..."` attribute, OR child `<command>` elements with `os="..."` and `cmd="..."` attributes for platform-specific commands.

Attributes:
- `os` — one of `windows | linux | macos | any`. Default `any`.
- `note` — optional inline rationale for the OS pin.

Validator behavior (v1.3 lean): structural — error if the tag appears outside a work-stage prompt; warning if `os` attribute is missing on the root tag.

Schema: work-stage only.

Examples:

Single-OS:

```xml
<runtime_environment os="windows" note="Build agent runs on Windows per the established pattern; Select-String is the assumed grep equivalent throughout the prompt"/>
```

Multi-OS with command variants:

```xml
<runtime_environment os="any">
  <command os="windows" cmd="Select-String -Path schemas/error.v1.json -Pattern 'CmdError'"/>
  <command os="linux" cmd="grep -n 'CmdError' schemas/error.v1.json"/>
  <command os="macos" cmd="grep -n 'CmdError' schemas/error.v1.json"/>
</runtime_environment>
```

When this tag appears in a stage prompt, the agent runs only the commands matching the current OS. Authors using inline OS-specific commands should pair them with this tag so the validator can flag missing variants in v1.4+.

A common realistic case for the build agent's local environment: PowerShell shell with the Bash tool available as a fallback. Authors pinning `os="windows"` should note in the `note` attribute whether the Phase doc's verification commands assume native PowerShell invocation (avoiding bash variable expansion of `$_`, etc. in heredoc-wrapped scripts) or bash-tool-wrapped invocation (which requires the commands to be safe under bash's variable interpolation).

## 8. Closeout-only tags
These tags are valid only inside `<closeout_stage_prompt>`.
### `<cumulative_reads>`
Required. Enumerates what must be read before drafting the closeout artifacts. Distinct from `<read_first>` (orientation files for any stage) — cumulative reads are the body of work the closeout reviews.
```xml
<cumulative_reads>
  <codebase>entire shipped codebase to date (cumulative across all merged milestones)</codebase>
  <spec>spec/project-spec.md (end-to-end, focus on M01-touched sections)</spec>
  <gap_analysis>docs/gap-analysis.md (all prior entries)</gap_analysis>
  <retrospectives>retrospectives/M01.*-retrospective.md (all stages of this milestone)</retrospectives>
  <summary>retrospectives/M01-summary.md (will be authored as part of this stage)</summary>
</cumulative_reads>
```
### `<deliverables>`
Required. The closeout produces three artifacts. Plural form distinguishes from work-stage `<deliverable>`.
```xml
<deliverables>
  <milestone_summary>retrospectives/M01-summary.md (aggregates per-stage retrospectives, scores axes across stages, marks verdict)</milestone_summary>
  <gap_analysis_entry>docs/gap-analysis.md (append new entry; six required sections, none optional)</gap_analysis_entry>
  <pr_description>draft only; do not open PR until explicitly asked</pr_description>
</deliverables>
```
### `<gap_analysis_requirements>`
Required. Reference to the playbook section that defines the six-section structure, plus a required `<gotchas_graduation>` subsection that audits per-stage `<gotchas>` entries across the milestone (v1.2 enforcement; see Authoring Rules §10 graduation rule).
```xml
<gap_analysis_requirements ref="BUILD-PLAYBOOK.md" section="3.4 Gap Analysis Entry">
  <gotchas_graduation>
    <stage_review id="A">
      <gotcha>brief description of the trap as it appeared in Stage A</gotcha>
      <disposition>kept | graduated | resolved | expired</disposition>
      <target>
        for graduated: docs/gotchas.md §N (heading);
        for resolved: commit-hash that fixed it;
        for expired: "n/a" + 1-line rationale (why it doesn't apply forward);
        for kept: "stays in per-stage <gotchas> of stages X, Y" (next-milestone forward references)
      </target>
    </stage_review>
    <!-- one stage_review per prior stage in the milestone; required even when empty -->
    <!-- if a stage had no gotchas, write: <gotcha>None observed.</gotcha><disposition>n/a</disposition> -->
  </gotchas_graduation>
</gap_analysis_requirements>
```
Disposition enum (exhaustive, validator rejects unknown values):
- **kept** — trap still applies forward; stays in the per-stage `<gotchas>` of future stages that hit the same surface
- **graduated** — recurred in 2+ stages; promoted to `docs/gotchas.md` and removed from per-stage tags; `<target>` cites the gotchas.md section
- **resolved** — fixed by code change so the trap is no longer reachable; `<target>` cites the commit hash
- **expired** — stage-local trap with no forward applicability (e.g., "new-tool config syntax" in a one-time scaffold stage); `<target>` is `n/a` + 1-line rationale. The rationale is the safety valve — forces the author to articulate *why* it doesn't apply forward, catching the case where someone marks `expired` to avoid evaluating `kept`/`graduated`.

If the closeout has additional special items to flag in the gap-analysis entry (e.g., a known divergence to resolve), add them inline alongside `<gotchas_graduation>`:
```xml
<gap_analysis_requirements ref="BUILD-PLAYBOOK.md" section="3.4 Gap Analysis Entry">
  <gotchas_graduation>...</gotchas_graduation>
  <special_check>Verify the pre-commit config matches the named ADR's gate set; flag any drift</special_check>
</gap_analysis_requirements>
```
Validator rules for `<gotchas_graduation>`:
- Every prior stage in the milestone must appear as a `<stage_review id="...">` element (counted by parsing the milestone's Phase doc for stage headings)
- Each `<stage_review>` must contain at least one `<gotcha>` + `<disposition>` pair
- `<disposition>` must be one of the four enum values
- The validator does **not** semantically check correctness of the disposition (author judgment); it only checks the structural shape
### `<append_only_verification>`
Required. Names the two append-only checks: local diff and CI job.
```xml
<append_only_verification>
  <local_check>prior content of docs/gap-analysis.md must be a literal prefix of HEAD before commit</local_check>
  <ci_check name="append-only-ledger">fails if any prior line is modified</ci_check>
</append_only_verification>
```
### `<three_artifact_review>`
Required. Names the three artifacts the human reviews at PR time and the immutability flag for the ledger entry.
```xml
<three_artifact_review>
  <artifact>code diff (cumulative across milestone)</artifact>
  <artifact>per-stage retrospectives + milestone summary</artifact>
  <artifact>new gap-analysis entry — flagged "IMMUTABLE once committed"</artifact>
  <pushback_blocks_pr>true</pushback_blocks_pr>
</three_artifact_review>
```
### `<count_reconciliation>` (optional)
Optional closeout tag — the structural "reconcile its own counts or fail" step. It is **not** in the `closeout_stage_prompt` required set (so older closeouts and the M02.E worked example below are not retro-failed; no protocol-version bump), and `validate-stage-prompts.cjs` does not reject its absence. The enforcement lives in `validators/validate-reconciliation.cjs`, which runs on the closeout / `CHANGELOG.md` artifact at pre-commit + CI: every **headline count** the closeout states is authored as a fenced `reconcile` block that the validator **recomputes from the named ledger / status-log / git-log** and **fails on mismatch**.
```xml
<count_reconciliation ref="BUILD-PLAYBOOK.md" section="3.5 Per-stage — closeout">
  <reconcile metric="findings graduated" claimed="14" source="docs/tech-debt.md" pattern="^- TD-\d+"/>
  <reconcile metric="stage commits" claimed="3" source="git" range="main..HEAD" pattern="^M\d{2}\."/>
  <!-- one <reconcile> per headline count the closeout/CHANGELOG states; the agent
       emits the matching fenced ```reconcile block in the artifact for the validator -->
</count_reconciliation>
```
The artifact (closeout text / `CHANGELOG.md`) carries the count as a fenced block the validator parses:
````
```reconcile
metric: findings graduated
claimed: 14
source: docs/tech-debt.md
pattern: ^- TD-\d+
```
````
**Honest limit:** the validator is presence-gated — a count in prose, or under a key its non-exhaustive keyword list doesn't recognize, escapes the static check (the omission class); Stage V's plan-challenge is the adversarial backstop. It also proves `claimed == source`, not `source == reality` — pair `reconcile` blocks with git / append-only sources for un-forgeable counts. Assurance verdicts (a "Sound" pass) retain a fenced ` ```evidence ` block (command · pattern/mutation set · result) under the same validator — see §8.5 and `templates/VERIFIER-FINDINGS-TEMPLATE.md`.

**Reconcile vs evidence (which block a count belongs in).** A **static-source** count — recomputable by reading a file or `git log` (stage commits, ledger rows, graduated TDs) — is a `reconcile` block: the validator re-derives it and blocks on mismatch. An **execution-required** count — knowable only by *running* a command (e.g. the smoke total "532 checks passed") — is **not** reconcilable (the validator cannot run the command; a `reconcile` with `source: node …` fails loud), so it is **evidence** (a fenced `evidence` block, command + result) or prose, never a `reconcile`. Rule of thumb: if the count can't be recomputed from a static source, it is evidence, not reconcile.
## 8.5 Verifier-only tags

These tags are valid only inside `<verifier_stage_prompt>`. The Verifier stage runs in a fresh CLI session between the last work stage and closeout (or before the milestone PR for Lite). It does **contract-fidelity verification**: did the code do what the spec and phase doc said it would, when actually exercised? Distinct from closeout (cumulative review with full context) and from work stages (TDD-driven code production).

### `<read_first>` for verifier — the bias guard

Verifier sessions deliberately **omit prior retrospectives** from `<read_first>`. Reading them primes the agent toward "we just shipped this; tests passed; it works" — the same confirmation bias that lets contract bugs slip through work-stage retrospectives. The Verifier reads:

- the phase doc (what was promised)
- spec sections it implements (what was contracted)
- the current code (what shipped)
- gate matrix
- gotchas list

NOT: prior retrospectives, milestone summary, gap-analysis carry-forward sections. Those are for the closeout, not the verifier.

Enforcement: in projects with the SessionStart hook, the hook reads `.claude/role` (if it equals `verifier`) and switches to `.claude/read-first-list-verifier.txt` for that session. Without the hook, the bias guard reduces to "the verifier prompt's `<read_first>` is the only authority" — honor-system, weaker but still effective when the agent opens with a clean session.

### `<scope_to_verify>`

Required. The body of work this verifier session covers. Inline form:

```xml
<scope_to_verify>
  <phase_doc ref="docs/build-prompts/M01-foundation.md"/>
  <spec_sections>§1, §2.3, §3.1</spec_sections>
  <code_paths>
    <path>src/foundation/</path>
    <path>src/ipc/drone.ts</path>
  </code_paths>
</scope_to_verify>
```

The agent grounds every finding in scope-to-verify. Findings outside the named scope are flagged "out-of-scope; defer to next milestone's V or to an explicit audit stage."

### `<verification_passes>`

Required. The named passes the verifier runs in order. Each pass produces findings. Standard pass names:

- `inventory` — every "ship file X / modify file Y" claim → file exists, basic shape matches
- `hooks` — every "X reads Y from Z" / "field Foo sourced from Bar" claim → 5-step data path trace (source event → projector → consumer wire). If step 4 finds **no consumer** or **multiple ambiguous consumers**, the trace is 🔴 by default; the build agent must either fix the wire or file an ADR explaining why the projection is unused.
- `multi_call_invariants` — every public API / IPC method / Tauri command → assert called twice in sequence works (catches single-use leaks, state-machine bugs, race conditions on shared state)
- `behavior` — runtime / visual / DOM checks via a project-provided harness (Vitest+jsdom for renderer, headless harness for IPC, etc.). The framework can't ship the harness; the project must have one. If the harness is absent, the pass is 🟡 by default with explicit caveat in findings. **For `deliverable_type: web`** this pass also requires a literal observed-running step (`observe="browser-load"` below): open the app in a fresh browser / headless Playwright, confirm no console errors, perform one primary interaction, capture evidence (screenshot or console). "Tests passed" is not observed-running evidence.
- `assembled_execution` — **the G10 cluster-gate pass (required when the surface class is runtime/drivable).** Drive the **REAL assembled surface** — not a mock that agrees with itself, not a unit harness — via each `State: verified` App-Map entry's `How-to-exercise`, observe the actual behavior (visible ≠ mounted; "no error" ≠ "ran"), and **retain the evidence**: the exact command + the result. That retained run-reference is written into the App-Map entry's **Evidence** column and is the *same reference* Stage C's reconciliable evidence block structures (command · pattern/mutation set · result). The pass arms for the **drivable** surface classes — `ui` (open the app, do the gesture), `command` (run the command), `endpoint` (hit the route) — plus the destructive / packaging / real-provider risk surfaces; a `library` (`api`) surface is **n/a** (its test-id binding alone is sufficient). Unit/component green is **necessary-not-sufficient** for a runtime surface — it cannot approve it. The arming is **visible** ("assembled-execution armed because surface class = X"), never silent. This generalizes the web-only `behavior observe="browser-load"` step to every drivable class. Enforced mechanically by `validators/validate-app-map.cjs` (a `verified` drivable entry with no Evidence reference → G10 RED); see `docs/gates.md` and `FRAMEWORK-CONFIG.md` for the visible trigger list.
- `design` — **`deliverable_type: web` only.** Fresh-context agent opens the running app, screenshots it, compares against `docs/design.md` (tokens used not raw values; visible hierarchy; Do's/Don'ts hold; contrast target met). Each §2–§8 area is marked conforming or flagged with a specific deviation. Same fresh-context bias guard.
- `security` — **Full.** Mechanical floor (dependency audit + secret scan over the diff, commands named in `docs/gates.md`) plus deliverable-type attack-surface judgment. High-severity advisory or committed secret → 🔴. The mechanical floor runs even when judgment is shallow.
- `code_quality` — **Full.** Integrates `/code-review` where available, else manual. Dead code, duplication, complexity hotspots, behavior-vs-implementation test mix. Mostly 🟢 (tech-debt) unless a hotspot is on the critical path. 🔴 only for broken, not ugly.
- `plan_challenge` — **required (v1.8+).** The adversarial pass that derives its own threat model anchored on the declared risk matrix and carries the standing escape catalog. Defined in full below ("The required plan-challenge pass"); a `<verifier_stage_prompt>` without it fails schema validation.

Tier-conditional pass selection (default; override via `verifier_mode` in `project-config.md`):

- **Lite:** `inventory` only (optional)
- **Full (the `pass_2_4` default):** `hooks + behavior + security + code_quality` (required) — **+ `assembled_execution` when the surface class is runtime/drivable (`ui` / `command` / `endpoint`), + `design` when `deliverable_type: web`**. No `inventory` pass: §X.2 is advisory rails under the default, not a contract, so there's nothing to drift-check (a missing whole file still surfaces in hooks/behavior).
- **Full:** `inventory + hooks + multi_call_invariants + behavior + security + code_quality` + project-specific passes if `docs/gates.md` demands (required) — **+ `assembled_execution` when the surface class is runtime/drivable, + `design` when `deliverable_type: web`**

> **`assembled_execution` is the G10 cluster-gate.** It is **mandatory** whenever the derived surface class is drivable (`ui` / `command` / `endpoint`) or a destructive / packaging / real-provider risk surface is declared — *risk overrides tier*, so it arms at either tier (a `library` / `api` surface is n/a). It **stacks on** the other passes; it never replaces `behavior` or the coverage/unit gates.

```xml
<!-- CLI / service / library project, Full tier (no inventory — §X.2 advisory under pass_2_4) -->
<verification_passes>
  <pass name="hooks"/>
  <pass name="behavior" harness="vitest+jsdom"/>
  <pass name="security" audit="npm audit" secrets="gitleaks"/>
  <pass name="code_quality"/>
</verification_passes>

<!-- deliverable_type: web — Pass 4 observes the running app; Pass 5 checks design -->
<verification_passes>
  <pass name="inventory"/>
  <pass name="hooks"/>
  <pass name="behavior" harness="playwright" observe="browser-load"/>
  <pass name="assembled_execution" drive="docs/app-map.md" observe="real-surface"/>
  <pass name="design" brief="docs/design.md"/>
  <pass name="security" audit="npm audit" secrets="gitleaks"/>
  <pass name="code_quality"/>
</verification_passes>

<!-- runtime/drivable non-web surface (cli/service) — the G10 cluster-gate arms -->
<verification_passes>
  <pass name="hooks"/>
  <pass name="behavior" harness="<project harness>"/>
  <pass name="assembled_execution" drive="docs/app-map.md" observe="real-surface"/>
  <pass name="security" audit="<dep audit>" secrets="<secret scan>"/>
  <pass name="code_quality"/>
</verification_passes>
```

### `<findings_format>`

Required. The shape of the output artifact + the severity model.

```xml
<findings_format ref="prompts/VERIFIER-FINDINGS-TEMPLATE.md">
  <output_file>retrospectives/M01.V-findings.md</output_file>
  <severity_model>
    <level>🔴 critical — blocks milestone PR merge</level>
    <level>🟡 important — carry forward to next milestone's Stage A</level>
    <level>🟢 nice-to-have — append to docs/tech-debt.md</level>
  </severity_model>
  <coverage_caveat_required>true</coverage_caveat_required>
</findings_format>
```

The `coverage_caveat_required` flag: every findings file must include a top-of-file caveat naming which passes ran, which didn't, and which bug classes are therefore NOT checked. This keeps users from reading "Verifier passed" as broader coverage than the tier actually provides.

### `<merge_gate>`

Required. The explicit merge-gate semantics for findings. Names the iteration cap so the D.fix ↔ V loop has bounded convergence.

```xml
<merge_gate>
  <on_critical_finding>open D.fix stage scoped to the finding; re-run V after</on_critical_finding>
  <iteration_cap rounds="2">After 2 D.fix iterations, escalate to maintainer rather than continue iterating</iteration_cap>
  <structural_signal>If D.fix introduces a 🔴 outside the originally-scoped finding, that is a structural signal that the fix is broader than the bug; stop iterating and consider re-tiering the milestone scope</structural_signal>
  <waiver_path>Build agent may file an ADR at docs/adr/NNNN-waiver-M[NN]-finding-N.md disputing the finding on interpretation grounds. Maintainer adjudicates (Sound / Sound-but-rough / Not-sound). Sound → finding downgrades to 🟡 or closes; Not-sound → 🔴 stands, D.fix required.</waiver_path>
</merge_gate>
```

The waiver-as-ADR reuses the existing immutable-once-accepted machinery (no new artifact class). The chain of waivers (if any) is itself an audit trail of how interpretations evolved.

### The required plan-challenge pass (v1.8+)

Every `<verifier_stage_prompt>` must carry a **`<pass name="plan_challenge">`** inside `<verification_passes>`. Where the other passes verify the *stated* criteria, the plan-challenge derives its **own** threat model and asks *"what dangerous properties did the plan and acceptance criteria leave unproven?"* — the verifier deliberately not sharing the planner's blind spots ("the agent that wrote the code is compromised; it knows what it built"). A `<verifier_stage_prompt>` **without** this pass fails schema validation (**block**) — the adversarial half of every gate would otherwise go unexercised.

**Bounded.** The challenge is **anchored on the declared risk matrix** — it asks which of the **declared** nine properties (§7 `<risk_declaration>`: normal / hostile-input / partial-failure / confinement / authorization / resource-bounds / recovery / observability / cross-platform) the plan left unproven. It does **not** invent arbitrary threats. "Anchored on the declared matrix" is the line between a bounded, repeatable challenge and open-ended threat-theater.

**The standing escape catalog.** The pass carries the accreted hunts — the ~10 escapes codified here so they are never re-derived by hand or silently lost when a milestone generalizes:

1. an **`n/a`** that is **false** — a `<risk_declaration>` / `<test_honesty>` "n/a — no risk surface" whose claim is untrue (no static validator can judge whether a risk surface truly exists — this MUST live in the verifier; the G9/G13 presence-gated escape hatch).
2. a **count or verdict stated in prose** with no fenced `reconcile`/`evidence` block — the omission-dodge the count-reconciliation validator is presence-gated against: confirm every stated count carries a fenced block that recomputes it.
3. **assert-a-constant / always-matching-snapshot / mock-only** — a tautological assertion, a snapshot that always matches, or a mock that asserts its own return; the independent-fixture rule should catch these (a fixture that agrees with itself proves nothing).
4. a **forged ledger that still reconciles** — a hand-edited count/ledger that recomputes against itself.
5. a **stub that passes "assembled"** — a unit/mock surface satisfying the assembled-execution claim without reaching the real surface.
6. an **under-declared trigger** — a destructive / credential / untrusted-HTML / archive surface that declared **no** `risk_triggers` to dodge G11 escalation (confirm or reject each real project surface).
7. a **toy-path confinement** — a confinement test whose hostile path passes the keyword check but does not actually escape.
8. a **bare `startsWith(root)`** — a canonicalize-then-confine pattern using a raw prefix check (the `/base-evil` bug), not a true subtree confinement.
9. a **quietly-dropped fence caveat** — a coverage/limitation caveat removed to manufacture false confidence.
10. **did the milestone follow the gate-design contract** — does each gate row name floor + adversary + the named false-green?

Any **presence-as-effectiveness** path the floors cannot see is a finding. **B↔C coupling:** the schema validator only *floors* this (the pass exists; a hollow pass with no matrix anchor warns but does not block). Whether a present plan-challenge *actually catches* defects is proven by **Stage C's seeded-defect calibration (G14)** — the calibration set carries one fixture per escape class above, including a fixture a catalog-less / hollow plan-challenge would **miss**, so a hollow pass that merely warns at the schema layer still fails the calibration. Floor (validator) + adversary (calibration) = a real gate.

```xml
<pass name="plan_challenge" harness="anchored on the declared risk matrix: which of the 9 properties did the plan and acceptance criteria leave unproven? + the standing escape catalog (n/a-that's-false / prose-dodged count / assert-a-constant / always-matching-snapshot / mock-only / forged-ledger-that-reconciles / stub-passes-assembled / under-declared-trigger / toy-path-confinement / bare-startsWith / dropped-fence-caveat / gate-contract-skipped). Bounded: against the declared 9, not arbitrary threats. Any presence-as-effectiveness path = finding"/>
```

### The required calibration self-test pass (v1.8+ — G14)

Every `<verifier_stage_prompt>` must **also** carry a **`<pass name="calibration_self_test">`** inside `<verification_passes>`, and it is the pass the verifier runs **first**. Where the plan-challenge (above) *runs*, nothing yet proves it *works* — a verifier that misses a planted defect still reports "Sound." This pass closes that: the verifier **opens** by running its plan-challenge against the **seeded-defect calibration set** (`prompts/calibration/` — one fixture per §8.5 escape class, each with a sealed ground-truth label in `labels/`) and must catch **every** seed — **false-negative rate (FNR) = 0** — *before* any real finding counts. The result (seeds caught / FNR) is recorded as a `calibration` evidence block in the findings (`templates/VERIFIER-FINDINGS-TEMPLATE.md`). A `<verifier_stage_prompt>` **without** this pass fails schema validation (**block**) — the plan-challenge would otherwise be unfalsifiable. This is the adversary-side analog of G9's mutation-kill.

**The sealing invariant.** The verifier reads `prompts/calibration/fixtures/` during the challenge; it **never** reads `labels/`. If the ground-truth answer sat in the fixture the verifier reads, FNR = 0 would prove nothing. `validators/validate-calibration.cjs` enforces the seal (a fixture containing its own `expected:` / `must-flag` answer is a finding).

**Honest locus (G14, non-negotiable).** `validators/validate-calibration.cjs` is the **static floor only** — it proves the set exists, shadows the full catalog, is labeled + sealed, and that this pass is **wired**. The **catch is agent judgment, recorded at V-time as the FNR**; it **cannot** run in a pre-commit hook (you can't run a judge in a smoke test). Floor (present + wired) + adversary (the V-run FNR) = a real gate; neither alone is. If the verifier's own FNR > 0 (it misses a seed), the verifier-proof worked and the milestone has a real finding (`merge_gate` structural signal).

```xml
<pass name="calibration_self_test" harness="run the plan-challenge against prompts/calibration/ — FNR must be 0 (catch every seeded defect) before any real finding counts; record seeds-caught / FNR as the calibration evidence block. Dogfoods G14: if YOU miss a seed, the verifier-proof works and the milestone has a real finding"/>
```

## 8.6 Refactor-only tags

These tags are valid only inside `<refactor_stage_prompt>`. Stage R (the refactor health check) runs in a fresh CLI session — trigger-based, not every milestone (toggle `refactor_mode` in `project-config.md`). It does **structural assessment**: is the cumulative codebase still maintainable, or has drift (duplication, complexity, dead code/deps) accumulated past threshold? Distinct from the verifier (contract fidelity, this milestone's deliverables) and from closeout (cumulative review *with* full context).

Stage R deliberately mirrors the verifier schema. The only structural deltas are `<scope_to_refactor>` (replacing `<scope_to_verify>`) and `<refactor_passes>` (replacing `<verification_passes>`). `<findings_format>` and `<merge_gate>` are shared shapes (§8.5) pointed at refactor-specific targets. This is intentional — keeping the delta minimal is what lets the add-a-stage recipe generalize to later schema variants (e.g., the audit-pass schema).

### `<read_first>` for refactor — the bias guard (one step stricter than V)

Refactor sessions omit prior retrospectives from `<read_first>` for the same reason the verifier does (reading them primes "we just shipped this; it works"). Stage R goes **one step further: it also omits prior R findings**. Reading the last refactor session's findings primes "we already addressed structural debt last time" — exactly the bias a fresh structural assessment exists to remove. The refactor session reads the current code, the gate matrix (for any named complexity-linter integration), and the gotchas list. NOT: prior retrospectives, milestone summaries, or prior R findings.

Enforcement: in projects with the SessionStart hook, the hook reads `.claude/role` (if it equals `refactor`) and switches to `.claude/read-first-list-refactor.txt` for that session — the same mechanism Stage V uses, with the stricter exclusion list. Without the hook, the bias guard reduces to honor-system on the refactor prompt's `<read_first>`.

### `<scope_to_refactor>`

Required. The body of work this refactor session covers — the **cumulative** codebase since the last Stage R (or project start), not just the latest milestone. Inline form:

```xml
<scope_to_refactor>
  <since milestone="M01" note="last Stage R; review everything merged since"/>
  <code_paths>
    <path>src/</path>
    <path>validators/</path>
  </code_paths>
  <tech_debt_ledger ref="docs/tech-debt.md"/>
</scope_to_refactor>
```

The agent grounds every finding in scope-to-refactor. Findings outside the named scope are flagged "out-of-scope; defer to an explicit audit stage."

### `<refactor_passes>`

Required. The named passes the refactor session runs in order. Each pass produces structural findings. Standard pass names:

- `duplication` — find ≥3 similar code blocks (helpers, validation logic, fetch/parse patterns) that should be extracted. The "wait for the fourth before extracting" rule means duplication is acceptable at 2; flagged at 3+.
- `complexity` — functions exceeding a cyclomatic-complexity threshold (default 15) or length threshold (default 80 lines). Either the project names a linter integration in `docs/gates.md` (eslint complexity, ruff, gocyclo, …) or the agent does the analysis manually.
- `drift` — dead code (no callers across the codebase), dead dependencies (no imports), version drift (multiple versions of one package), schema drift (generated types vs. source-of-truth).

Tier-conditional pass selection (default; override via `refactor_mode` in `project-config.md`):

- **Lite:** Stage R skipped entirely.
- **Full:** `duplication + drift` (add `complexity` only if a linter integration is named in `docs/gates.md`).
- **Full:** `duplication + complexity + drift` + project-specific passes from `docs/gates.md`.

```xml
<refactor_passes>
  <pass name="duplication"/>
  <pass name="complexity" linter="eslint --rule complexity"/>
  <pass name="drift"/>
</refactor_passes>
```

### `<findings_format>` (refactor)

Required. Same shape as the verifier's `<findings_format>` (§8.5), pointed at the refactor findings template. The severity model is identical; the triage targets differ (a 🟡 opens a `D.refactor` stage, not `D.fix`).

```xml
<findings_format ref="prompts/REFACTOR-FINDINGS-TEMPLATE.md">
  <output_file>retrospectives/M02.R-findings.md</output_file>
  <severity_model>
    <level>🔴 critical — blocks next milestone PR (rare; only when the structural issue compounds per-milestone or risks data loss/security)</level>
    <level>🟡 important — open a D.refactor stage before the next milestone</level>
    <level>🟢 nice-to-have — append to docs/tech-debt.md</level>
  </severity_model>
  <coverage_caveat_required>true</coverage_caveat_required>
</findings_format>
```

### `<merge_gate>` (refactor)

Required. Same shape as the verifier's `<merge_gate>` (§8.5), referencing `D.refactor` instead of `D.fix`. A 🔴 R finding opens a `D.refactor` stage; **the verifier re-runs after the refactor** (to confirm the refactor didn't break contracts), then R re-runs (to confirm the structural issue is closed).

```xml
<merge_gate>
  <on_critical_finding>open a D.refactor stage scoped to the finding; re-run V (contracts) then R (structure) after</on_critical_finding>
  <iteration_cap rounds="2">After 2 D.refactor iterations, escalate to the maintainer rather than continue iterating</iteration_cap>
  <structural_signal>If a D.refactor introduces a 🔴 outside the originally-scoped finding, the refactor scope was wrong; stop and reassess</structural_signal>
  <waiver_path>Build agent may file an ADR at docs/adr/NNNN-waiver-M[NN]-R-finding-N.md disputing the finding. Maintainer adjudicates; Sound → downgrades or closes, Not-sound → 🔴 stands, D.refactor required.</waiver_path>
</merge_gate>
```

## 8.7 Audit-pass-only tags

These tags are valid only inside `<audit_pass_prompt>`. This schema serves the `audit` operating mode: an existing codebase reviewed dimension-by-dimension, the deliverable a findings report — not code. Each **pass** (P1–P8, one per dimension) and each **challenge** review runs in its own fresh session.

**The axis boundary.** An audit pass is a *verification* session — "audit **is** verification." It runs as **`role: verifier`**, reading the single `read-first-list-audit.txt` orientation list (INVENTORY / TRIAGE / REVIEW_PLAN). There is **no `audit_pass_N` role** — the per-pass specifics (persona, dimension, checklist) ride on the pasted `<audit_pass_prompt>`, not on a new session mode. The `role` value set stays exactly **{work, verifier, orchestrator, refactor}**. The mode-check hook therefore maps the `<audit_pass_prompt>` root → `verifier`.

The schema deliberately diverges from the work/verifier shapes: an audit pass produces *findings*, so — like the verifier — it omits `<deliverable>` / `<execution_steps>` / `<test_plan_required>` / `<acceptance_criteria>` / `<scope_locks>`. But unlike the verifier it is **persona-driven and checklist-bound with a mandatory per-file sign-off**, so it adds five audit-only tags in place of the verifier's `<scope_to_verify>` / `<verification_passes>` / `<findings_format>` / `<merge_gate>`. The challenge review is the *same schema* (a pass variant) — it reads only the prior pass's output and hunts for what was missed (G_AUDIT_C1).

Required tags: `<context>`, `<persona>`, `<scope>`, `<read_first>`, `<checklist>`, `<sign_off_requirement>`, `<output_format>`, plus the shared `<gates>` / `<retrospective_requirements>` / `<commit_protocol>` / `<commit_message>` / `<approval_surface>`.

### `<persona>`

Required. The expert lens this pass reviews through — the one kind of expert who would catch this dimension's bugs. The persona *constrains attention*: a security engineer in the secrets pass does not chase a performance smell. One pass, one persona.

```xml
<persona>
  A senior application-security engineer specializing in input-trust boundaries.
  You review only through this lens; cross-cutting observations are parked for their own pass.
</persona>
```

### `<scope>`

Required. The single dimension this pass covers — and nothing else. Findings outside the dimension are noted-and-parked, not chased (scope prevents drift across passes). Distinct from the verifier's `<scope_to_verify>` (which names code paths to check against a contract); `<scope>` names the *review dimension*.

```xml
<scope>
  IPC / message-passing surfaces only: every channel, handler, and serialized
  payload that crosses a trust boundary. Not auth, not performance — those are P2 / P5.
</scope>
```

### `<read_first>` for audit — the orientation list

Required. An audit pass reads the Phase-S setup artifacts, not the greenfield orientation set: `docs/audit/INVENTORY.md` (the complete map), the **this-dimension** rows of `docs/audit/TRIAGE.md`, and the **this-pass** entry of `docs/audit/REVIEW_PLAN.md`. The challenge variant instead reads **only** the prior pass's findings file (the fresh-context bias guard — G_AUDIT_C1). The SessionStart hook composes this list from `operating_mode: audit` + `role: verifier`.

### `<checklist>`

Required. The pass-specific checklist — 15–20 concrete items typical. The checklist catches the obvious things an expert still occasionally misses; it is the floor, not the ceiling (the persona is expected to find more). Every child is a `<item>`.

```xml
<checklist>
  <item>Every IPC handler validates its payload shape before use.</item>
  <item>No handler trusts a renderer-supplied path without canonicalization.</item>
  <!-- 15–20 items typical -->
</checklist>
```

### `<sign_off_requirement>`

Required — the load-bearing rule (G_AUDIT_P1). Every file in this pass's triage scope must appear in the output, either with findings or with an explicit **"No Issues"** sign-off. **No group sign-offs, no silent skips** — the failure mode this prevents is a reviewer quietly skipping the file they assumed was boring, which is exactly where the bug hides.

```xml
<sign_off_requirement>
  Per-file, mandatory. Every file classified CRITICAL or MODERATE for this
  dimension in TRIAGE.md appears in the output with findings or an explicit
  "No Issues" sign-off. No group sign-offs. A pass with un-touched triaged files is incomplete.
</sign_off_requirement>
```

### `<output_format>`

Required. The shape of the pass's findings artifact: file-by-file findings (severity-marked, located, evidence-bearing) + cross-file traces + a pass summary, with the mandatory tier-coverage caveat. References `AUDIT-FINDINGS-TEMPLATE.md`; output lands at `retrospectives/audit/P[N]-findings.md` (challenge: `C[N]-challenge.md`).

```xml
<output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
  <output_file>retrospectives/audit/P1-findings.md</output_file>
  <coverage_caveat_required>true</coverage_caveat_required>
</output_format>
```

## 9. Optional tags (valid in all five schemas)
### `<adr_triggers>`
Use when the stage's planned work might trip ADR requirements (per `BUILD-PLAYBOOK.md` §4.8). Pre-flagging keeps the agent from discovering the requirement mid-stage.
```xml
<adr_triggers>
  <trigger>If pre-commit hook tool is changed (e.g., an alternative to the existing tool), file ADR per §4.8</trigger>
  <trigger>If any new core dependency is added beyond those named in spec, file ADR</trigger>
</adr_triggers>
```
### `<gotchas>`
Stage-specific traps. Project-wide gotchas live in `docs/gotchas.md` and are read via `<read_first>`. Use this tag only for traps unique to this stage that don't generalize.
```xml
<gotchas>
  <trap>third-party-tool vN changed config format from vN-1 — pin and use the new syntax explicitly</trap>
  <trap>workspace-level lint inheritance uses a different config key than per-package lints — check the tool's docs</trap>
</gotchas>
```
### `<dependencies>`
Use when a stage depends on artifacts outside the obvious prior-stage chain (e.g., depends on an external review, an upstream branch, an ADR not yet accepted).
```xml
<dependencies>
  <dependency>ADR-N (named architectural decision) must be Accepted before Stage D</dependency>
</dependencies>
```
### `<time_box>`
Estimated wall-clock duration. Informs staging boundaries, not deliverable size (per `BUILD-PLAYBOOK.md` §1.2). Reviewed at retrospective for soft gate S4 (within 2× of actual).
```xml
<time_box estimate_hours="6"/>
```
## 10. Authoring rules
One stage per fenced block. Don't combine stages. The Phase doc may have many fenced blocks but each contains exactly one root element.
No foreign tags. Every tag inside a stage prompt must be in this protocol. Adding a new tag means updating this doc first (and bumping the protocol version per Part 13). Drift is a bug.
No HTML escaping inside `<context>` or prose tags unless required. XML inside fenced markdown blocks parses cleanly with literal angle brackets in attribute values via `&lt;` and `&gt;`. Use them only when the text contains XML-meaningful characters (e.g., "<30 min").
Self-closing for reference tags. When a tag points at an external file with no inline body, use the self-closing form: `<gates milestone="M01"/>` not `<gates milestone="M01"></gates>`.
Stable child element names. Within `<deliverable>`, every child is `<item>`. Within `<scope_locks>`, every child is `<lock>`. Within `<acceptance_criteria>`, every child is `<criterion>`. Within `<execution_steps>`, every child is `<step>`. Within `<read_reference>`, every child is `<file>`. Within `<execution_warnings>`, every child is `<warning>`. Within `<gotchas_graduation>`, every child is `<stage_review>`. This consistency makes validation and aggregation simple.
Order tags consistently across milestones. The recommended order:
For work stages: `<context>` → `<read_first>` → `<read_reference>` (opt) → `<read_prior_milestones>` (Stage A only when applicable) → `<read_prior_stages>` (B+) → `<deliverable>` → `<test_plan_required>` → `<execution_steps>` → `<acceptance_criteria>` → `<scope_locks>` → `<gates>` → `<self_correction_budget>` → `<adr_triggers>` (opt) → `<gotchas>` (opt) → `<execution_warnings>` (opt) → `<time_box>` (opt) → `<dependencies>` (opt) → `<retrospective_requirements>` → `<commit_protocol>` → `<commit_message>` → `<approval_surface>`.
For closeout stages: `<context>` → `<read_first>` → `<read_reference>` (opt) → `<read_prior_milestones>` (rare for closeout; included only if absorbing additional carry-forward) → `<cumulative_reads>` → `<deliverables>` → `<gap_analysis_requirements>` (with required `<gotchas_graduation>`) → `<append_only_verification>` → `<three_artifact_review>` → `<scope_locks>` → `<gates>` → `<self_correction_budget>` → `<adr_triggers>` (opt) → `<gotchas>` (opt) → `<execution_warnings>` (opt) → `<time_box>` (opt) → `<retrospective_requirements>` → `<commit_protocol>` → `<commit_message>` → `<approval_surface>`.
For audit-pass stages: `<context>` → `<persona>` → `<scope>` → `<read_first>` → `<checklist>` → `<sign_off_requirement>` → `<output_format>` → `<gates>` → `<self_correction_budget>` (opt) → `<gotchas>` (opt) → `<time_box>` (opt) → `<retrospective_requirements>` → `<commit_protocol>` → `<commit_message>` → `<approval_surface>`.
Consistent ordering makes diffs across milestones immediately scannable.
Reference-first **strict** for content-heavy tags (v1.2 hardening). Tags that support both inline and reference forms — currently `<deliverable>`, `<acceptance_criteria>`, `<scope_locks>`, `<commit_message>`, `<gap_analysis_requirements>` — **must use the reference form when the corresponding Phase doc section exists**. The Phase doc's `X.2 Files to Change`, `X.3 Detailed Changes`, `X.4 Tests`, `X.6 Commit Message`, and milestone-level `Key constraints` sections are the canonical locations for content; the prompt references rather than restates them.
Validator behavior:
- If the Phase doc has a section matching the tag's expected anchor (e.g., `### A.3 Detailed Changes` for the Stage A `<deliverable>`), inline content in that tag is **rejected** (error). Authors must use the reference form.
- If no matching section exists, inline form is permitted (e.g., a single-stage milestone with no `X.3` section, or a stage whose content is genuinely too small to warrant a Phase doc section).
- The validator finds Phase doc sections by markdown-AST heading lookup against the `section="..."` attribute string — renderer-agnostic, slugifier-agnostic.
Section-name resolution (drops URI fragments — v1.2 anchor-stability fix). Reference tags use the `section="..."` attribute, not URL fragment notation. The validator parses the referenced markdown file's AST, finds the heading whose text matches the `section` attribute (case-sensitive, exact match), and confirms the heading exists. Renderer-dependent slugification (`### A.6 Commit Message` → `#a6-commit-message` on GitHub vs `#a-6-commit-message` on GitLab/mdBook vs different again on VS Code preview) becomes irrelevant.
Never use both forms in the same tag. A tag with `ref="..."` must be self-closing (or contain only nested allowed children like `<gotchas_graduation>` for `<gap_analysis_requirements>`); a tag with inline list-content must not have a `ref` attribute. Validation enforces this.
Gotchas graduation rule (v1.2 enforcement). Stage-specific `<gotchas>` are **per-stage scratch space**. Across a milestone, every per-stage `<gotchas>` entry must be evaluated at closeout via `<gotchas_graduation>` (see Section 8) and assigned a disposition: `kept | graduated | resolved | expired`. If a trap recurs in 2+ stages of the same milestone (or across milestones), promote it to `docs/gotchas.md` and remove it from per-stage tags. The closeout `<gotchas_graduation>` slot is the forcing function — without it, per-stage `<gotchas>` would accumulate as discipline decay sets in.

The version banner & grandfathering — **banner-less = current.** A Phase doc declares its protocol version with a `**Protocol version:** vN.M` banner near the top. Version-gated rules (the G9 `<test_honesty>` slot, v1.7+; the G13 `<risk_declaration>` matrix, v1.8+) key their requirement off that banner. **The grandfather rule:** a doc with an **explicit pre-bump banner** (e.g. `v1.0`, `v1.6`) is exempt from rules introduced after its declared version — that's the genuinely-old case the banner records honestly. **A banner-LESS doc is treated as *current* (must comply), NOT grandfathered** — only an *explicit* pre-bump banner exempts. Under a "no banner = grandfathered" rule, any new doc could dodge a version-gated rule by simply omitting the banner — an omission-escape inherent to *every* banner-gated rule, not just one. **History is not retro-failed:** the version-gated validators (`validate-test-honesty.cjs`, `validate-risk-matrix.cjs`) run on the **changed set only** (`--staged` in the pre-commit), never `--all` over a repo's phase-doc history, so a committed-but-untouched banner-less older doc is never re-checked; the only `--all` invocation in the framework is the **version-agnostic** schema validator (`validate-stage-prompts.cjs`), which enforces no version-gated rule. The rule is applied **in lockstep** across both version-gated validators — drop it from one and a doc still dodges the other.
## 11. Validation
A validation script lives at `scripts/validate-stage-prompts.py` (or your preferred language). It runs in CI on every PR that touches `docs/build-prompts/M[NN]-*.md`.
**v1.2 ships lean.** Structural checks are errors (block CI); cross-file resolution checks are warnings (surface in PR check output, do not block). Cross-checks promote to errors in v1.3 once the cross-check logic survives 3+ milestones without false positives.
**Errors (block CI):**
- Extracts every fenced ```xml block from the Phase doc
- Confirms each block contains exactly one root element
- Confirms the root tag is one of `work_stage_prompt`, `verifier_stage_prompt`, `refactor_stage_prompt`, `closeout_stage_prompt`, or `audit_pass_prompt`
- Confirms `id` attribute matches `M[0-9]{2}\.[A-Z]`
- Confirms all required tags for the schema are present (including `<commit_message>`, `<execution_steps>`, and — for closeout — `<gap_analysis_requirements>` containing `<gotchas_graduation>`)
- Confirms no foreign tags appear
- Confirms reference-first tags use either inline form OR `section="..."` reference form, never both (the v1.0/v1.1 mixing-rule, retained as error)
- **Strict reference-first (v1.2):** if the Phase doc has a section matching the expected anchor for a content-heavy tag (`<deliverable>`, `<acceptance_criteria>`, `<scope_locks>`, `<commit_message>`), inline content in that tag is rejected — author must use reference form
- `<disposition>` values inside `<gotchas_graduation>` must be one of: `kept`, `graduated`, `resolved`, `expired`
- Every prior stage in the milestone must have a `<stage_review id="...">` entry inside the closeout's `<gotchas_graduation>` (counted by parsing the milestone's Phase doc for stage headings)
- For `expired` disposition, `<target>` must include rationale beyond bare `n/a` (a single line minimum; validator checks length > "n/a" alone)
**Warnings (surface in PR output, don't block):**
- Confirms ordering matches the recommended order
- Cross-checks: every retrospective referenced in `<read_prior_stages>` exists; every milestone in `<read_prior_milestones>` has the named gap-analysis section + summary section; every file in `<read_first>` and `<read_reference>` exists; every `section="..."` value on a reference tag resolves to a real Phase doc heading via markdown-AST lookup; the milestone in `<gates milestone="...">` matches the Phase doc's milestone
- `<read_reference>` entries without a `purpose` attribute (warning in v1.2; promotes to error in v1.3)
- Recognized `<execution_steps>` step names (`write_failing_tests`, `implement`, `verify_gates`, `fill_retrospective`, `surface`); custom step names emit a warning encouraging Phase doc documentation
**Section-name resolution (replaces URI-fragment lookup — v1.2 anchor-stability fix).** The validator parses the referenced markdown file's AST, finds the heading whose text matches the `section="..."` attribute (case-sensitive, exact match), and confirms the heading exists. Renderer-agnostic. The fragment notation (e.g., `ref="...md#A.6"`) is no longer recognized; v1.2 prompts must use `ref="...md" section="A.6 Commit Message"`. v1.0-grandfathered prompts (M01-M02) skip this check via the version banner in the Phase doc header (see Authoring Rules §10 grandfathering).
CI fails on any error; warnings are surfaced in the PR check output.
## 12. Worked examples
**Note:** these examples illustrate v1.2 syntax (section-name refs, `<execution_steps>`, `<read_reference>`, `<execution_warnings>`, closeout `<gotchas_graduation>`). Any Phase docs authored before v1.2 adoption are v1.0-grandfathered and use the older syntax — see Authoring Rules §10 grandfathering.
### 12.1 Work-stage prompt — M02.A (generic non-first-milestone example)
A non-first milestone, Stage A — absorbs M01 carry-forward and references the Phase doc's `A.3 Detailed Changes` + `A.4 Tests` + milestone-level `Key constraints` sections via the strict reference-first pattern.
```xml
<work_stage_prompt id="M02.A">
  <context>
    Stage A of M02. Build hygiene + scaffolds. Absorbs M01 carry-forward
    🟡 Important items so Stages B–D focus on the real M02 deliverables. Stage B does
    not start until Stage A's commit is on the milestone branch.
  </context>

  <read_first>
    <file>BUILD-PLAYBOOK.md</file>
    <file>docs/identity.md</file>
    <file>docs/gates.md</file>
    <file>spec/project-spec.md §1, §N</file>
    <file>docs/scope.md §M02</file>
    <file>docs/build-prompts/M02-<title>.md (Background, Document Structure, Implementation Workflow, Stage A sections A.1–A.4)</file>
    <file>docs/style.md</file>
    <file>docs/gotchas.md</file>
  </read_first>

  <read_reference>
    <file purpose="primary archetype for this stage's pattern">src/<module>/<archetype-file>.<ext></file>
    <file purpose="secondary pattern reference">src/<other-module>/<pattern-file>.<ext></file>
  </read_reference>

  <read_prior_milestones>
    <gap_analysis_carry_forward milestone="M01"/>
    <milestone_summary milestone="M01" section="Decisions to apply before next parent milestone"/>
  </read_prior_milestones>

  <deliverable ref="docs/build-prompts/M02-<title>.md" section="A.3 Detailed Changes"/>

  <test_plan_required>true</test_plan_required>

  <execution_steps>
    <step name="write_failing_tests" budget="1"/>
    <step name="implement" budget="1"/>
    <step name="verify_gates" budget_iterations="3"/>
    <step name="fill_retrospective"/>
    <step name="surface"/>
  </execution_steps>

  <acceptance_criteria ref="docs/build-prompts/M02-<title>.md" section="A.4 Tests"/>

  <scope_locks ref="docs/build-prompts/M02-<title>.md" section="Key constraints"/>

  <gates milestone="M02"/>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Stage A's job is to close M01-carry-forward Important items, not to start Stage B's substantive work — resist scope creep into Stage B territory even if locally tempting</trap>
    <trap>If a third-party dependency was version-bumped during M01, verify the new version's API contract before relying on it in M02 code</trap>
  </gotchas>

  <execution_warnings>
    <warning>DO NOT run integration tests against live external services in normal flow — incurs cost and/or rate-limit risk. Reserve for explicit smoke-test sessions with credentials in the configured secrets store.</warning>
    <warning>Coverage runs take several minutes on a clean cache — budget accordingly</warning>
  </execution_warnings>

  <time_box estimate_hours="2"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md">
    <special_log>Decisions for Stage B: which conventions Stage B will inherit from this stage; whether any ADR-required changes landed cleanly; whether the M01 carry-forward sweep closed all Important items</special_log>
  </retrospective_requirements>

  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M02-<title>.md" section="A.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M02.*-retrospective.md` (orchestration sessions on a different machine read this to know what's actually on the build machine)</item>
    <item>diff stat (git diff --stat HEAD)</item>
    <item>gate results (each gate, pass/fail, key numbers)</item>
    <item>retrospective (filled-in [END] section with three-axis scoring + verdict + decisions for Stage B)</item>
    <item>draft commit message from M02-<title>.md A.6 Commit Message section (filled with session URL)</item>
    <item>explicit statement: "Stage M02.A is ready. I will not commit until you approve."</item>
  </approval_surface>
</work_stage_prompt>
```
### 12.2 Closeout-stage prompt — M02.E (generic example)
Demonstrates the v1.2 closeout shape, including the required `<gotchas_graduation>` subsection inside `<gap_analysis_requirements>`.
```xml
<closeout_stage_prompt id="M02.E">
  <context>
    Closeout stage of M02. Stages A–D have committed on the milestone branch.
    This stage produces the cumulative artifacts: M02 summary aggregating retrospectives,
    the new docs/gap-analysis.md entry (second in the ledger after M01), and the draft
    PR description. The gap-analysis commit is the final commit on this branch and gates
    the PR push.
  </context>

  <read_first>
    <file>BUILD-PLAYBOOK.md (especially §3.4, §4.6)</file>
    <file>docs/identity.md</file>
    <file>docs/gates.md</file>
    <file>spec/project-spec.md §1, §N</file>
    <file>docs/scope.md §M02</file>
  </read_first>

  <cumulative_reads>
    <codebase>entire shipped codebase to date (cumulative across M01 + M02.A–M02.D commits)</codebase>
    <spec>spec/project-spec.md (end-to-end, focus on M02-touched sections)</spec>
    <gap_analysis>docs/gap-analysis.md (M01 prior entry; M02.E appends the second)</gap_analysis>
    <retrospectives>retrospectives/M02.A-retrospective.md, M02.B-, M02.C-, M02.D-retrospective.md (all work stages)</retrospectives>
  </cumulative_reads>

  <deliverables>
    <milestone_summary>retrospectives/M02-summary.md (aggregates per-stage retrospectives; scores axes across stages; marks verdict)</milestone_summary>
    <gap_analysis_entry>docs/gap-analysis.md (append second entry; six required sections, none optional; Carry-forward section addresses M01 open items by status)</gap_analysis_entry>
    <pr_description>draft only; PR opens only on explicit human ask after approval</pr_description>
  </deliverables>

  <gap_analysis_requirements ref="BUILD-PLAYBOOK.md" section="3.4 Gap Analysis Entry">
    <gotchas_graduation>
      <stage_review id="A">
        <gotcha>third-party-tool vN config-format change required pinning</gotcha>
        <disposition>graduated</disposition>
        <target>docs/gotchas.md §N (dependency version pinning)</target>
      </stage_review>
      <stage_review id="B">
        <gotcha>name collision when two callers register the same key in a registry</gotcha>
        <disposition>resolved</disposition>
        <target>commit a7c2f4e (added duplicate-key check)</target>
      </stage_review>
      <stage_review id="C">
        <gotcha>state initialized before any events arrive caused projection lag</gotcha>
        <disposition>kept</disposition>
        <target>stays in per-stage gotchas of M03.A (next milestone's first stage touches the same surface)</target>
      </stage_review>
      <stage_review id="D">
        <gotcha>None observed.</gotcha>
        <disposition>n/a</disposition>
        <target>n/a — stage produced no per-stage gotchas</target>
      </stage_review>
    </gotchas_graduation>
  </gap_analysis_requirements>

  <append_only_verification>
    <local_check>prior content of docs/gap-analysis.md (M01 entry) must be a literal prefix of HEAD before commit</local_check>
    <ci_check name="append-only-ledger">verify the M01 entry is byte-identical to its committed state; fail otherwise</ci_check>
  </append_only_verification>

  <three_artifact_review>
    <artifact>code diff (cumulative M02.A through M02.E)</artifact>
    <artifact>per-stage retrospectives + M02 milestone summary</artifact>
    <artifact>new docs/gap-analysis.md entry — flagged "IMMUTABLE once committed"</artifact>
    <pushback_blocks_pr>true</pushback_blocks_pr>
  </three_artifact_review>

  <scope_locks>
    <lock>Append-only is a hard rule (BUILD-PLAYBOOK.md §4.1, §4.6) — no editing M01 prior entry, ever</lock>
    <lock>The `<gotchas_graduation>` subsection must list every prior stage of M02, even those with no gotchas (write "None observed.")</lock>
  </scope_locks>

  <gates milestone="M02"/>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>The "Carry-forward" section in the gap-analysis entry is required even when empty — write "None observed." rather than omit (BUILD-PLAYBOOK.md §3.4)</trap>
    <trap>Severity is non-elastic — if M02 has a pile of 🔴 Criticals in the fix backlog, the milestone shouldn't ship; surface this rather than rationalize</trap>
  </gotchas>

  <time_box estimate_hours="4"/>

  <retrospective_requirements ref="prompts/RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message ref="docs/build-prompts/M02-<title>.md" section="E.6 Commit Message"/>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M02.*-retrospective.md` (full milestone retro chain)</item>
    <item>new gap-analysis entry text (full)</item>
    <item>diff of docs/gap-analysis.md (proves append-only — only new lines at bottom)</item>
    <item>M02-summary.md (full)</item>
    <item>draft PR description (per .github/PULL_REQUEST_TEMPLATE.md)</item>
    <item>draft commit message from M02-<title>.md E.6 Commit Message section</item>
    <item>explicit flag: "This gap-analysis entry is IMMUTABLE once committed. Please review carefully."</item>
    <item>explicit statement: "M02 closeout is ready. I will not commit until you approve."</item>
  </approval_surface>
</closeout_stage_prompt>
```
## 13. Anti-patterns
Stage prompts that look right but aren't. These are the failure modes worth naming.
Vague `<context>`. "Build foundation stuff." Prompt is unusable; agent has to invent the framing. Two to four sentences naming the milestone, the stage, what builds on it.
Aspirational `<deliverable>`. "A great workspace structure." If you can't enumerate the items, the stage isn't ready to start. Either decompose the work first or split into more stages.
`<acceptance_criteria>` that restate `<gates>`. Acceptance criteria are behavioral checks beyond the gate suite. "unit tests pass" belongs in `<gates milestone="M01"/>` (which references the gate matrix). "pre-commit hook fires on a test commit and blocks malformed input" is a behavioral acceptance check — that's what belongs here.
Missing `<read_prior_stages>` on Stage B+. Single most common protocol drift. Per `BUILD-PLAYBOOK.md` §4.5, Stage B+ must read prior retrospectives' Decisions sections before any code. Omitting the tag from the prompt makes this rule invisible.
`<scope_locks>` repeated from spec verbatim. The locks should be the active constraints for this stage, not a copy of the entire spec scope section. Reference broad scope via `<read_first>`; use `<scope_locks>` for the specific things this stage might tempt the agent to violate.
Closeout missing `<append_only_verification>`. The whole point of the closeout is the immutable ledger entry. Omitting the verification tag means the ledger could land mutated and the next milestone inherits a corrupted history.
Closeout with a `<deliverable>` (singular) tag. That's the work-stage tag. Closeouts use `<deliverables>` (plural) because they always produce three: summary, ledger entry, draft PR description. If your closeout has only one, it's not a closeout.
Foreign tags introduced silently. Adding `<priority>` or `<owner>` or `<estimate>` ad-hoc means future stages won't have them and validation breaks across milestones. New tags require updating this protocol first (and bumping its version).
`<gates>` with the `milestone` attribute pointing at the wrong milestone. Copy-paste error from a prior milestone's prompt. The CI validator catches this; humans miss it.
`<approval_surface>` reordered without reason. Order matters because the human reads top-down. The recommended order has cross-machine state first (so an orchestration session on a different machine sees actual project state immediately), diff next (because that's what the human cares about most for THIS stage), and the "I will not commit" statement last (because it's the verbal anchor of the do-not-commit rule). Reorder only with a stated reason.

`<approval_surface>` missing cross-machine state (v1.3+). Every work-stage and closeout-stage surface MUST lead with a cross-machine state item: `git log --oneline main..HEAD` + retrospective file listing. Origin is a partial view of project state when stages are committed locally but not pushed (per `BUILD-PLAYBOOK.md` §4.7). An orchestration session reading only `origin/main` from a different machine sees a partial view — surfacing the build machine's state at session end closes the cross-session-blindness gap that produces false-premise rewrites. Validator: structural — error if the first `<item>` does not name `git log` and retrospective listing.
Missing `<commit_message>`. Every stage prompt requires a `<commit_message>` slot — almost always referencing the pre-authored commit in the Phase doc's `X.6 Commit Message` section. Omitting it means the agent drafts a commit ad-hoc, which produces inconsistent commit-message style across milestones and forces the human to evaluate each one as a separate review item.
`<read_prior_milestones>` on Stage B+ within the same milestone. Stage B+ uses `<read_prior_stages>` for within-milestone retrospective reads. `<read_prior_milestones>` is for absorbing prior milestone carry-forward — overwhelmingly Stage A of a non-first milestone. Putting it on Stage B+ is a sign of confusing the two read patterns; the validator catches this.
`<read_prior_milestones>` on Stage A of the first milestone. M01.A has no prior milestone to absorb. The tag is omitted entirely; not "empty" but absent. (Same rule as `<read_prior_stages>` being absent on Stage A.)
Mixing inline and reference forms in the same tag. `<deliverable ref="...md" section="..."><item>...</item></deliverable>` is a schema violation. Pick one form. The validator rejects the mix because the precedence rule (which wins?) is genuinely ambiguous and the right answer is to make the choice explicit at authoring time.
**v1.2 anti-patterns (new):**
Inline content in a tag whose Phase doc section exists (v1.2 strict reference-first). If `M02-<title>.md` has a heading `### A.3 Detailed Changes`, the Stage A `<deliverable>` must use `ref="docs/build-prompts/M02-<title>.md" section="A.3 Detailed Changes"` — inline `<item>` lists are rejected by the validator. The drift failure mode (prompt and Phase doc diverging) is the reason; v1.2 makes the rule strict instead of advisory.
URI-fragment ref form (e.g., `ref="...md#A.3"`) instead of section-name form (`ref="...md" section="A.3 Detailed Changes"`). The fragment form is renderer-dependent (GitHub vs GitLab vs mdBook vs VS Code preview each slugify differently) and brittle — v1.2 drops it entirely. Use `section="..."` and let the validator resolve the heading via markdown-AST lookup. v1.0-grandfathered prompts (M01-M02) are exempt via the version banner in their headers.
Missing `<execution_steps>`. v1.2 requires this slot in every work stage prompt. Omitting it means the procedural sequence (write_failing_tests → implement → verify_gates → fill_retrospective → surface) is invisible to the agent — it has to derive the cycle from the playbook each time. The slot is the procedural anchor.
Missing `<gotchas_graduation>` in closeout. v1.2 requires the subsection inside `<gap_analysis_requirements>`. Without it, per-stage `<gotchas>` accumulate across milestones with no forcing function for graduation to `docs/gotchas.md` — discipline decay sets in by M05 or M06.
`<gotchas_graduation>` missing a stage. Every prior stage in the milestone must have a `<stage_review id="...">` entry, even if the stage had no gotchas (use `<gotcha>None observed.</gotcha><disposition>n/a</disposition>` in that case). Validator catches missing stages by counting stage headings in the Phase doc.
Foreign `<disposition>` value. The enum is exhaustive: `kept | graduated | resolved | expired`. Anything else (`promoted`, `archived`, `closed`, `wontfix`) is a schema violation. Validator rejects.
`<disposition>` of `expired` without rationale in `<target>`. The `expired` disposition is the safety valve for stage-local traps with no forward applicability — but it's also the easiest disposition to abuse ("expire" everything to skip the work of evaluating `kept`/`graduated`). The validator requires `<target>` to contain text beyond bare `n/a` (a single line of rationale minimum). Authors who can't articulate why a trap doesn't apply forward probably haven't actually evaluated it.
`<read_reference>` without `purpose` attribute. Each `<file>` inside `<read_reference>` must have a `purpose="..."` attribute naming *why* the agent reads it. Without `purpose`, the slot degrades into "miscellaneous reads" and loses its discriminator value vs `<read_first>`. Validator warns in v1.2; promotes to error in v1.3.
`<execution_warnings>` used for `<gotchas>` content (or vice versa). The distinction matters: `<gotchas>` warns about code-shape traps the agent might write into a file; `<execution_warnings>` warns about *commands* the agent might run during the stage. "Use the workspace-level config key, not the per-package key" is a `<gotchas>` entry (artifact-shape trap). "Don't run integration tests against live external services in normal flow — incurs cost" is an `<execution_warnings>` entry (command-time guardrail). Mixing them loses the action-vs-artifact discriminator.
## 14. Versioning this protocol
This protocol changes when:
- A new tag is needed across all stages (additive)
- A tag's semantics change (breaking; requires migration of in-flight Phase docs)
- The schema set needs revision (e.g., a new schema for a new stage type — the split has grown from two to five: work, verifier, refactor, closeout, audit-pass)
- Validation rules change (e.g., a previously-warning becomes an error)
Substantive changes get clear `docs(stage-prompt-protocol): ...` commit messages and a CHANGELOG entry. The commit history of this file is itself an audit of how stage prompts evolved.
If this protocol disagrees with `BUILD-PLAYBOOK.md`, the playbook wins. This protocol is the schema; the playbook is the authority on what stages are and how they run.
### Changelog
v1.9 — **Grammar-only: the strict stage-id rule admits one optional dotted-minor milestone segment.** `ID_PATTERN_STRICT` in `validators/validate-stage-prompts.cjs` moves from `^M\d{2}\.[A-Z]$` to `^M\d{2}(?:\.\d+)?\.[A-Z]$`, so a ratified **minor milestone** (M20.5) can express its stage ids (**M20.5.A** now validates). **Exactly one** dotted-minor segment: a sub-sub milestone (**M20.5.1.A**) stays **illegal by design**, and a plain milestone id (**M01.A**) is unchanged. This is a **grammar-only** change — **NO slot changes, no new required/optional tags, no new requirements**; every v1.8 (and earlier) Phase doc remains current-compliant, so nothing is grandfathered or retro-failed. `ID_PATTERN_TEMPLATE` (the `--allow-placeholders` `M[NN].A` form) is **untouched** — a minor milestone is a concrete instance, never a placeholder. The validator is the **sole** parser of the stage-id grammar (confirmed: `scripts/stage-active.cjs` writes the id verbatim and the red-gate hook reads it by presence/equality — neither parses its format).

v1.8 — **New optional tag `<risk_declaration>`** (work stages) **and the grandfather fix** for banner-less docs, the structural form of the "Context" pillar. The **`<risk_declaration>`** tag (gate **G13**, §7): a work stage that **declares a risk surface** (a `triggers="…"` attribute naming ≥1 of the `risk_triggers:` surfaces in `FRAMEWORK-CONFIG.md` §4.19) carries the **bounded nine-property risk-matrix** — `normal · hostile-input · partial-failure · confinement · authorization · resource-bounds · recovery · observability · cross-platform` — each `<property>` either `covered-by: … — test: …` or an explicit `n/a — <reason>`. **Bounded:** the verifier challenges against the fixed 9, not arbitrary threats. Enforced by `validators/validate-risk-matrix.cjs` (all-9 AND-ed, fail-closed; a missing property / no-covering-test / empty one → block; a stage with no declaration is a no-op); **presence-gated** — whether the named coverage is *real* is Stage V's plan-challenge. Like `<test_honesty>` the tag is **optional in the `SCHEMAS` table** (presence enforced by the dedicated G13 validator keyed off the doc's protocol version, not `validate-stage-prompts.cjs`). Defined in §7. **Grandfather fix (§7, §10):** a **banner-less** Phase doc is now treated as **current (must comply)**, NOT grandfathered — only an *explicit* pre-bump banner exempts; this closes the omission-escape where any new doc could dodge a version-gated rule (G9 or G13) by simply omitting its banner. Applied **in lockstep** to `validate-test-honesty.cjs` (G9's version gate) and `validate-risk-matrix.cjs`; history is not retro-failed because both run on the **changed set** (`--staged`), never `--all`. Also folds in the destructive-verb widening (`FRAMEWORK-CONFIG.md` §4.19 names the DB-destructive verbs truncate/drop/wipe/purge/reset). G13 joins the numbered universal gate line in `BUILD-PLAYBOOK.md` + `PROCESS-VALIDATION.md` + `templates/gates.md`. **This version also adds** a **required `<pass name="plan_challenge">`** in every `<verifier_stage_prompt>` (§8.5 "The required plan-challenge pass") — the matrix-anchored standing home for the escape catalog; a `verifier_stage_prompt` without it fails schema validation (`validate-stage-prompts.cjs`), present-but-hollow (no matrix anchor) warns, and Stage C's seeded-defect calibration (G14) is the effectiveness adversary (B↔C coupling). And the **SessionStart-injected orientation is marked untrusted** — wrapped in a `BEGIN…END UNTRUSTED ORIENTATION` delimiter with the honest "defense-in-depth, not a wall" caveat in `templates/PROJECT-CLAUDE.md` (OWASP LLM01 — prompt injection — defended framework-wide).

v1.7 — **New optional tag `<test_honesty>`** (work + verifier stages) **and the new `assembled_execution` verifier pass** (gate **G10**), both the structural form of the evidence standard. **`assembled_execution`** (§8.5): the verifier drives the **REAL assembled surface** via the App-Map's `How-to-exercise`, observes the actual behavior (visible ≠ mounted), and retains the run reference (command + result) into the App-Map **Evidence** column — the same reference Stage C structures into its reconcilable evidence block. It arms for the **drivable** surface classes (`ui` / `command` / `endpoint`) + the destructive/packaging/real-provider risk surfaces (*risk overrides tier* — either tier alike); a `library` (`api`) surface is n/a. Unit/component green is **necessary-not-sufficient** for a runtime surface (the generalized cluster-gate). It is a **named pass within `<verification_passes>`** (free-form, not a new tag/schema), so it needs no `SCHEMAS`-table change; it is enforced mechanically by `validators/validate-app-map.cjs` (a `verified` drivable entry with no Evidence reference → G10 RED). Defined in §8.5; trigger list in `FRAMEWORK-CONFIG.md` §4.18 + `docs/gates.md`. The **`<test_honesty>`** half (gate **G9**): For each enforcement/security/destructive surface a stage touches it declares the **mutation** (the named point to break → which test must then go RED) and the **effectiveness** assertion (proves behavior not "no error"; cross-boundary agreement uses an independent fixture). **Risk-tiered, not blanket** — a named mutation only where a risk surface is declared; pure utility/doc stages carry the explicit `n/a — no risk surface` sentinel, **never a silent omission** (the omission is the tell, so an absent slot on a v1.7+ work stage blocks). **Grandfathered:** required only for Phase docs declaring `**Protocol version:** v1.7`+; earlier docs (and any banner-less doc, under the version rule in force at the time) are exempt and never retro-failed. Enforced by `validators/validate-test-honesty.cjs` (slot presence + an assertion-honesty heuristic that flags assertion-free / exception-only test bodies), wired as a pre-commit + CI gate in the generated scaffold so every project inherits G9. The tag is **optional in the `SCHEMAS` table** (presence is enforced by the dedicated G9 validator keyed off the doc's protocol version, not by `validate-stage-prompts.cjs`'s required-tag list — a v1.6 or grandfathered doc must still validate). Defined in §7.

v1.6 — **Fifth schema: `<audit_pass_prompt>`** (the `audit` operating mode's dimension passes + per-pass challenge). Serves the `audit` operating mode: an existing codebase reviewed dimension-by-dimension (P1–P8), each pass + challenge in a fresh session. **Not** a minimal verifier clone (the Stage-R pattern) — an audit pass is persona-driven and checklist-bound, so it adds five audit-only tags (`<persona>`, `<scope>`, `<checklist>`, `<sign_off_requirement>`, `<output_format>`) in place of the verifier's `<scope_to_verify>` / `<verification_passes>` / `<findings_format>` / `<merge_gate>`, and like the verifier omits `<deliverable>` / `<execution_steps>` / `<test_plan_required>` / `<acceptance_criteria>` / `<scope_locks>` (it produces findings, not code). The load-bearing rule is `<sign_off_requirement>` — mandatory per-file sign-off, no silent skips (G_AUDIT_P1). **The axis boundary:** an audit pass runs as `role: verifier` — audit *is* verification — and adds **no new role value**; the set stays {work, verifier, orchestrator, refactor} and the mode-check hook maps the root → `verifier`. Required tags defined in §8.7. Validator `SCHEMAS` table + smoke coverage added in lockstep (the lockstep rule of §0). The audit pass id uses the milestone id-space with a single stage letter (`M[NN].P` for a pass, `M[NN].C` for a challenge) — the `M\d{2}\.[A-Z]` id rule is unchanged; the pass *number* (P1–P8) rides in `<context>`, not the id.

v1.5 — **Fourth schema: `<refactor_stage_prompt>`** (Stage R, the refactor health check). Mirrors `<verifier_stage_prompt>`; the only structural deltas are `<scope_to_refactor>` (replaces `<scope_to_verify>`) and `<refactor_passes>` (replaces `<verification_passes>`). `<findings_format>` + `<merge_gate>` are shared shapes pointed at refactor targets (`REFACTOR-FINDINGS-TEMPLATE.md`, `D.refactor`). Required tags defined in §8.6; the bias-guard read-first is one step stricter than the verifier's (omits prior retros **and** prior R findings). Validator `SCHEMAS` table + smoke coverage added in lockstep (the lockstep rule of §0). Also: the two illustrative `<ci_check name="...">` examples renamed to `append-only-ledger` — the shared check's real name (the old per-project check name is gone from this protocol).

v1.4 — One additive optional tag — `<await_red_approval>`, the red-stop gate. Adds a third approval gate to the per-stage loop (plan-approval → **red-approval** → stage-end): after the failing tests are written and confirmed red, the agent stops and waits for the user to approve the *test design* before implementing to green, catching shallow or wrong-contract tests at the cheapest moment. **Default-on at Full** (inserted whether or not the tag is present); toggle off via `red_review: off` in `project-config.md`. The validator treats the tag as optional — neither presence nor absence is an error; it is a behavioral default, not a structural requirement. See §"`<await_red_approval>`".

v1.3 — Six additive changes informed by cross-stack-integration friction and cross-session-blindness incidents observed in early milestones. Five new optional tags + one tightening of `<approval_surface>`:
1. **New optional slot `<pre_flight_check>`** (work stages). Pre-stage sanity checks (branch state, prior-stage commit presence, env vars, dep availability) the agent runs BEFORE any code is written. Pairs with cross-stack-integration stages where environment dependencies are easy to miss.
2. **New optional slot `<schema_drift_check>`** (work stages). Verify generated types match schema source-of-truth at pre-flight rather than mid-implementation. Specifically for projects using schemas-as-source-of-truth (`CLAUDE.md` §14).
3. **New optional slot `<fan_out_grep>`** (work stages). Explicit grep searches the agent must run before renames or signature changes — to find all call-sites needing coordinated updates. Also for value-consistency verification (e.g., schema `$id` URL conventions).
4. **New optional slot `<dependency_audit_check>`** (work stages). Explicit verification of dependency tree state — version pins, feature flags, audit findings — before code depending on those deps is written. Addresses silent-stub-backend and transitive-vulnerability patterns.
5. **New optional slot `<runtime_environment>`** (work stages). Explicit OS pin + platform-specific command variants. Addresses CRLF warnings, PowerShell-vs-bash differences, and platform-unsupported caveats in stage prompts.
6. **`<approval_surface>` tightening — cross-machine state required as leading item.** Every work-stage and closeout-stage surface must lead with `git log --oneline main..HEAD` + retrospective file listing. Closes the cross-session-blindness gap (orchestration sessions on a different machine inferring "stage X unexecuted" from `origin/main` while the build machine has the work locally). Pairs with `CLAUDE.md` §8 phase-doc-edit pre-flight rule.

v1.0–v1.2 grandfathered prompts exempt via the version banner in their headers. v1.3 applies to Phase docs authored after the protocol's adoption.

v1.2 — Eight additive/hardening changes informed by early-milestone retrospective + opinion review. Anchor stability, procedural slot, two new content slots, strict reference-first, lean validator, gotchas-graduation enforcement, grandfathering of pre-v1.2 docs:
1. **Anchor stability fix.** Reference tags use `section="..."` attribute instead of URI fragment notation (e.g., `ref="...md" section="A.6 Commit Message"` not `ref="...md#A.6"`). Renderer-agnostic, slugifier-agnostic. Validator resolves headings by markdown-AST lookup. Applies to `<commit_message>`, `<deliverable>`, `<acceptance_criteria>`, `<scope_locks>`, `<gap_analysis_requirements>`, `<commit_protocol>`. Old fragment form no longer recognized by the validator (v1.0-grandfathered prompts exempt via header banner).
2. **New required slot `<execution_steps>`** in work stages. Named procedural anchor — `write_failing_tests → implement → verify_gates → fill_retrospective → surface`. Replaces inline STEP 1–5 prose that previously lived in each prompt; the slot resolves to playbook sections rather than restating them.
3. **New optional slot `<read_reference>`** (both schemas). Files for archetypal pattern reference (e.g., "see `src/<module>/<archetype-file>.<ext>` as `*_with` archetype"). Distinct from `<read_first>` (orientation) and `<read_prior_stages>` (within-milestone retrospectives). `purpose` attribute required (warning in v1.2, promotes to error in v1.3).
4. **New optional slot `<execution_warnings>`** (both schemas). Inline operational warnings — workflow-time guardrails that apply during stage execution (cost concerns, side-effecting commands). Distinct from `<gotchas>` (pre-flight implementation traps) and `<scope_locks>` (deliverable-shape constraints).
5. **Reference-first STRICT.** v1.0/v1.1 had reference-first as the default-but-not-required pattern. v1.2 makes it strict: if the Phase doc has a section matching the expected anchor for a content-heavy tag, inline content in that tag is rejected by the validator (error). Forces authors to commit to one source of truth and prevents prompt-vs-Phase-doc drift.
6. **Gotchas graduation rule + `<gotchas_graduation>` enforced in closeout.** New required subsection inside `<gap_analysis_requirements>`. Audits per-stage `<gotchas>` entries across the milestone with disposition enum: `kept | graduated | resolved | expired`. The `expired` disposition requires rationale in `<target>` beyond bare `n/a`. Validator: every prior stage must have a `<stage_review>` entry; disposition values must match the enum; `expired` rationale length is checked.
7. **Lean validator.** v1.2 ships with structural checks as errors (block CI) and cross-file resolution checks as warnings (surface in PR output, do not block). Cross-checks promote to errors in v1.3 once the cross-check logic survives 3+ milestones without false positives. Reduces brittleness during the v1.2 → v1.3 transition.
8. **Grandfathering of pre-v1.2 Phase docs.** Phase docs authored before v1.2 (using URI-fragment refs, inline content, no `<execution_steps>`, etc.) carry a `**Protocol version:** v1.0 (pre-XML-schema; grandfathered).` header banner that exempts them from v1.2 validator rules. v1.2 applies to all Phase docs authored after the protocol's adoption.
v1.1 — Three additive changes informed by an early Phase doc audit:
- New common tag `<read_prior_milestones>` for Stage A of non-first milestones absorbing prior-milestone carry-forward
- New common tag `<commit_message ref="..."/>` (required) referencing the pre-authored commit message in the Phase doc's `X.6` section
- Reference-first pattern formalized for content-heavy tags (`<deliverable>`, `<acceptance_criteria>`, `<scope_locks>`): each may use either inline form OR self-closing `ref="..."` form pointing at the corresponding Phase doc section, never both. Validator enforces.
Existing v1.0 prompts remain valid; the additions are backward-compatible (the new tags are required from v1.1 forward, but existing Phase docs can be updated incrementally as they're touched).
v1.0 — Initial protocol. Two-schema split (`<work_stage_prompt>` and `<closeout_stage_prompt>`); common, work-only, closeout-only, and optional tag sets; authoring rules; validation contract; worked examples for M01.A and M01.E; anti-patterns.
---
*End of Stage Prompt Protocol.*
