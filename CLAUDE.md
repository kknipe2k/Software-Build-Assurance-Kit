# CLAUDE.md — Software Build Assurance Kit (Bootstrap Mode)

> **Auto-loaded by Claude Code on session start.** This is the bootstrap version of `CLAUDE.md`. After bootstrap completes, this file gets replaced by a project-specific `CLAUDE.md` (generated from `templates/PROJECT-CLAUDE.md`) calibrated to the tier the user selects.

---

## Mode detection — do this first, every session

Before anything else, check whether you're in **bootstrap mode** or **project mode**.

**Bootstrap mode** = this directory contains the starter-kit framework files (`BUILD-PLAYBOOK.md`, `STAGE-PROMPT-PROTOCOL.md`, `templates/`) but no project files yet. Specifically, ALL of these are absent:

- `project-config.md`
- `docs/identity.md`
- `docs/scope.md`
- `docs/build-prompts/` (or it exists and is empty)

**Project mode** = at least one of those exists. If you see this bootstrap CLAUDE.md in project mode, surface as an error: *"This is the bootstrap CLAUDE.md but the project appears initialized. The bootstrap likely failed to replace this file. Check `templates/PROJECT-CLAUDE.md` and copy it over manually as `CLAUDE.md`, then start a fresh session."*

**First-response opener — every bootstrap session.** Bootstrap mode has **no `.claude/` SessionStart hook** — it's generated at Phase 3. So there is **no read-first stamp to echo here, and you should not look for one or flag its absence** — that just produces noise on every bootstrap. (The stamp echo belongs to *project* sessions after handoff, governed by the project's own `CLAUDE.md` once the hook exists.)

Your first response is the **cwd echo + scope statement**, so the user can stop you if they're in the wrong place:

> I'm running in `<cwd>` — this is where I'll create your project files (`~68` files at Standard tier, including `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files like `CLAUDE.md` and `project-config.md`). **If this is the right directory, tell me what you want to build and we'll start.** If not, exit with Ctrl+C twice, `cd` to the right directory, and re-run `claude` from there — I won't write outside this folder. Type `details` if you want the full file list before we begin.

**If the user types `details`:** read out the canonical scaffold from §"Phase 3: Project scaffold generation" *verbatim* — the three Markdown tables (Always-generated, Standard and Full only, Full only) plus the Web/UI-only table when applicable. **Do not synthesize a tier comparison from memory** — paraphrasing has produced miscategorizations (e.g., listing `ORCHESTRATOR.md` as Full-only when it's actually Standard+). Quote the tables; let the canonical text speak.

This is one-line consent on *location* — distinct from the calibration interview (which is about *what to build*) and the Phase-3 pre-flight disclosure (which is the full footprint just before disk writes). It catches the footgun where a user runs `claude` from the wrong place and only discovers it after investing time in calibration + discovery.

If in bootstrap mode and the user has not yet stated what they want to build, present the **calibration interview** from `templates/CALIBRATION-INTERVIEW.md` as your *second* response (after the directory confirmation above). Read that file first; it contains the verbatim text to surface, five side-by-side option tables (project size, experience, approval cadence, deliverable type, verification & CI cost), and the smell-flagging rules. Don't paraphrase the option tables — the trade-offs only land if the user sees them side by side.

The interview is what makes the calibration **explicit and user-facing** instead of buried in agent instructions. The user picks from the five choices, OR describes the project and lets you propose a calibration with rationale (the deliverable type and verification posture are usually inferred — from the description and repo visibility), OR punts and accepts the safe-middle default (Standard + Familiar + Standard, type + verification inferred). The interview maps to `project-config.md` toggles via the table at the bottom of `CALIBRATION-INTERVIEW.md`.

After the user answers (or you propose and they confirm), proceed to Phase 0 Step 0.2 below — the tier-conditional discovery questions. Don't lock the calibration to `project-config.md` yet; Phase 1 may surface complexity that bumps tier upward.

---

## What this framework is — orient yourself before bootstrapping

Read these seven files in order before engaging with the user beyond the greeting:

1. **`templates/CALIBRATION-INTERVIEW.md`** — **read first**. The verbatim text and five side-by-side option tables you present as your first response. Without this you'll ad-lib differently each session and the trade-offs won't land consistently.
2. **`BUILD-PLAYBOOK.md`** — the methodology. Defines the four layers (Project / Milestone / Stage / Step), the three load-bearing constraints, the per-stage loop, the closeout protocol, the gates, the retrospective protocol, the gap-analysis protocol. **Part 0** defines the tier model.
3. **`FRAMEWORK-CONFIG.md`** — the tier and toggle reference. Three tiers (Lite / Standard / Full), a separate expertise dimension (Novice / Intermediate / Expert), and a toggle schema (approval cadence, retrospective depth, ledger discipline, web-verify, read-first cap, research mode, escalation, hook enforcement, explanation mode). This file is what you'll read most carefully — bootstrap is largely a calibration exercise.
4. **`persistence-architecture.md`** — the layer model. Where each artifact lives (Layers 1–5), who reads/writes when, the mutability matrix, the audit trail.
5. **`PROCESS-VALIDATION.md`** — the scoring framework. Three axes (process / artifact / forward-readiness), threshold gates (16 hard + 5 soft), outcome matrix, and the tier-conditional retrospective shape (Lite: brief / Standard: two-axis / Full: three-axis).
6. **`STAGE-PROMPT-PROTOCOL.md`** — the XML schema for stage CLI prompts that go inside Phase docs (currently v1.9 — the authoritative version is the newest entry in that file's own `### Changelog`; the smoke suite binds this pin to it so it can't silently re-stale).
7. **`templates/PROJECT-CLAUDE.md`** — the per-project execution-rules template you'll customize and install as the project's own `CLAUDE.md` at the end of bootstrap.

Once you've read these, you understand the framework. The bootstrap workflow below is the playbook's "One-Time Project Setup" (Part 3.1) executed conversationally with the user, calibrated by tier.

---

## The bootstrap workflow

Six phases. Each phase has explicit deliverables. Surface to the user at each phase boundary; do not proceed without approval. **The depth of each phase is tier-conditional** — the tier you and the user agreed in Phase 0 determines how heavy each subsequent phase gets.

### Phase 0: Calibration + discovery

Goal: pick a tier, expertise level, and approval cadence, then understand the project well enough to draft a v1 spec at the depth the tier warrants.

**Step 0.0 — Operating mode (leading question, asked first).** Before the five calibration choices, ask the leading question — *"What kind of work is this?"* — per the `templates/CALIBRATION-INTERVIEW.md` mode table. The answer sets `operating_mode` (project-scoped; recorded in `project-config.md`) and routes the rest of Phase 0:

- **`greenfield`** (default) — build something new. Everything below (Steps 0.1–0.2, Phases 1–5) proceeds **unchanged**. This is the path the framework handles best.
- **`bug_fix`** — fix a known defect in existing code. Routes to the reduced bug-fix shape and **replaces** the greenfield discovery + Phases 1–4:
  - **Discovery (Step 0.2 replacement):** ask the **3 bug-fix questions** instead of the greenfield set — (1) *bug description + reproducer* (observed vs. expected behavior, exact steps; a "sometimes" reproducer flags a concurrency/environment bug), (2) *affected surface* (the file(s) the user suspects, if any), (3) *blast radius* (what else a fix here might affect — the impact-analysis prompt; if unknown, the agent runs a fan-out grep in Phase A).
  - **Skip Phases 1–2 + 4 entirely:** no `spec/project-spec.md`, no `docs/scope.md` milestone breakdown, no `docs/build-prompts/M[NN]` Phase docs. **Skip** the design discovery (1.5/1.6) too.
  - **Scaffold delta (Phase 3):** generate `docs/bugfix/<bug-id>.md` — the **instantiated bug-fix Phase doc**: it carries the bug contract (description, reproducer, affected surface, impact-analysis list, fix summary) **and** the per-phase sections (**A.1–A.6 / B.1–B.6 / C.1–C.6**), the way a greenfield Phase doc carries X.1–X.6. Every `BUGFIX-PHASE-DOC.md` self-ref resolves *into this one file*; there is **no** `docs/build-prompts/<bug-id>-bugfix.md` (the mode skips the `docs/build-prompts/` tree). Generate it + the regression-test location, and copy `templates/dot-claude/read-first-list-bugfix.txt` (the slim, affected-surface read list the hook composes under `operating_mode: bug_fix`). **Skip** the spec/scope/Phase-doc/backlog rows. Still generate the always-on hooks, validators, and `.claude/` wiring.
  - **Phase doc:** use `templates/BUGFIX-PHASE-DOC.md` (3 phases — Phase A/B = `work_stage_prompt`, Phase C = `verifier_stage_prompt`; no new schema).
  - **Close:** a one-line `CHANGELOG.md` entry + the PR description **instead of** Stage E closeout — there is no spec/milestone arc to reconcile. Workflow detail: `BUILD-PLAYBOOK.md` §3.7; gates `G_BUGFIX_A1/B1/C1` (`PROCESS-VALIDATION.md`).
- **`research_publish`** — synthesize literature/data into a paper + an interactive illustrative app. The **hybrid two-phase** mode (Phase R research → explicit re-tier → Phase A app); routes to its own shape and **replaces** the greenfield discovery + Phases 1–4 of the research half:
  - **Discovery (Step 0.2 replacement):** ask for the **research question** (what's being synthesized, scope in/out) instead of the greenfield "what to build" set — this becomes `docs/research-question-spec.md` (from `templates/research-question-spec.md`), which **replaces** `spec/project-spec.md`.
  - **Phase R (research) runs at Lite *process*, regardless of project tier:** the five grounded-STORM steps **R1–R5** as a Lite task-list doc (`templates/PHASE-R-DOC.md`) — no milestone/scope machinery, no per-stage retros — **except** the one mandatory ledger Phase R always keeps, the sources registry (`docs/sources/registry.md`). Grounded STORM: perspectives discovered *by search*, every claim bound to a logged source — *no source → no claim*. **Skip** the greenfield Phases 1–2 (spec/milestones) and the design discovery (1.5/1.6) for the research half.
  - **Scaffold delta (Phase 3):** generate `docs/paper/` (paper drafts; from `templates/PAPER-TEMPLATE.md`), `docs/sources/registry.md` (the mandatory append-only registry; joins `append-only-ledger.yml`'s LEDGERS set), `docs/contradiction-map.md` (R3 output), `docs/findings-to-illustrate.md` (the R4 handoff `G_RP_R2` checks), and — once the app format is chosen — the matching starter from `templates/INTERACTIVE-APP-SCAFFOLD/` (Streamlit / Observable / plain HTML-JS, each carrying the "illustrates findings from `docs/paper/<paper>`" cross-reference surface). Still generate the always-on hooks, validators, and `.claude/` wiring. **Skip** the spec/milestone/Phase-doc rows for the research half.
  - **The inter-phase re-tier (end of Phase R) — an EXPLICIT user event, never automatic.** When R5 passes and `docs/findings-to-illustrate.md` exists, surface: *"given the findings you want to illustrate, here's what the app needs to do → that suggests `<tier>`; **confirm or revise**."* Do **not** auto-apply a tier. On confirmation, **Phase A** opens at the chosen tier and **inherits that tier's full scaffold + Stage V** — Phase A is **NOT** Lite-locked like Phase R. Phase A then proceeds as a normal greenfield build at the re-tiered tier; if it reveals more complexity mid-construction, the standard re-tier-mid-phase protocol applies.
  - **Workflow detail:** `BUILD-PLAYBOOK.md` §3.9; gates `G_RP_R1/R2/R3/A1/A2` (`PROCESS-VALIDATION.md`).
- **`audit`** — review an existing codebase (security / performance / architecture / compliance); the deliverable is a **findings report + remediation backlog, not new code**. Routes to its own shape and **replaces** the greenfield discovery + Phases 1–4:
  - **Discovery (Step 0.2 replacement):** there is **no spec to author — the existing codebase is the spec.** Ask which **dimensions** to audit (from the 8: IPC / secrets / error-handling / data-flow / performance / packaging / compliance / architecture) and at what depth; the tier sets the default count (Lite 1–2 / Standard 3–4 / Full all 8). **Skip** the greenfield Phases 1–2 (no `spec/project-spec.md`, no `docs/scope.md` milestone breakdown) and the design discovery (1.5/1.6).
  - **Phase shape (replaces greenfield Phases 1–4):** **Phase S** (S1 inventory → S2 triage → S3 plan) → **Phase P** (the per-dimension passes P1–P8, each an `<audit_pass_prompt>` carrying a persona + scope + 15–20-item checklist + mandatory per-file sign-off, run as `role: verifier`) → **Phase C** (a fresh-context challenge per pass, reading **only** the prior pass's output) → **consolidation** (`FINAL_REVIEW.md` + the append-only findings ledger). **No milestones and no Stage V — audit *is* verification** (per-file sign-off + challenge are its internal V).
  - **Scaffold delta (Phase 3):** generate `docs/audit/INVENTORY.md` / `TRIAGE.md` / `REVIEW_PLAN.md` (from `templates/audit/`), `docs/audit/findings-ledger.md` (the append-only consolidated ledger; joins `append-only-ledger.yml`'s LEDGERS set), the per-pass + challenge output dir `retrospectives/audit/` (`P[N]-findings.md`, `C[N]-challenge.md`, `FINAL_REVIEW.md`), and copy `templates/dot-claude/read-first-list-audit.txt` (the slim INVENTORY/TRIAGE/REVIEW_PLAN + findings-ledger list the hook composes under `operating_mode: audit`). Still generate the always-on hooks, validators, and `.claude/` wiring. **Skip** the spec/scope/milestone/Phase-doc/backlog rows.
  - **Pass prompts:** use `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` + the eight `templates/audit/P1–P8` passes (`<audit_pass_prompt>` schema — the 5th stage-prompt schema, maps to `role: verifier`; no new `role` value). Challenge runs from `templates/AUDIT-CHALLENGE-PROMPT-TEMPLATE.md`.
  - **`audit_multi_model` (default `false` — Path A):** single-model with fresh-context challenges (the diversity is fresh context, not a different model). Path B (multi-model via SDK) is the future route; leave at `false` unless wired.
  - **Workflow detail:** `BUILD-PLAYBOOK.md` §3.8; gates `G_AUDIT_S1/P1/C1/OUT` off the numbered line (`PROCESS-VALIDATION.md`).

`operating_mode` is **orthogonal to the session-scoped `role`** (the 3-brain `{work, verifier, orchestrator, refactor}` axis): the SessionStart hook composes the read-first list from both. A pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any `operating_mode` outside the four values. If the user doesn't pick, default to `greenfield` — never error a project for an unset mode.

**Step 0.1 — Calibration interview (every project, all tiers).** Present the canonical interview from `templates/CALIBRATION-INTERVIEW.md` as your first user-facing response. Five choices:

1. **Project size / complexity** — Lite / Standard / Full (the project `tier`, per `FRAMEWORK-CONFIG.md` §3)
2. **Your experience with this stack and frameworks like this one** — New / Familiar / Experienced (maps to expertise: Novice / Intermediate / Expert per `FRAMEWORK-CONFIG.md` §2.5)
3. **Approval cadence** — Minimum / Standard / Maximum (maps to `approval_cadence` per `FRAMEWORK-CONFIG.md` §4.1)
4. **Deliverable type** — CLI / Web-UI / Library / Service / Other (maps to `deliverable_type`; selects spec + phase-doc templates and verification passes). Orthogonal to tier — it changes *which* gates apply, not *how much* ceremony. Usually inferred from the project description and proposed, not asked outright.
5. **Verification & CI cost** — Local-first (hybrid) / Cloud / Local-only (maps to `verification_locus` per `FRAMEWORK-CONFIG.md` §4.14). Where tests run and what GitHub Actions costs: public repos → cloud is free + unlimited; private repos → hybrid keeps minutes near-zero (full suite local at pre-push, one ubuntu PR smoke check, macOS + full matrix on tags only). Orthogonal to tier. Usually proposed from repo visibility + the macOS-ship audit, like deliverable type.

Present the five side-by-side option tables verbatim from `CALIBRATION-INTERVIEW.md`. Don't paraphrase or compress them — seeing the trade-offs in a table is the whole point. The user can answer three ways: direct (e.g., "Standard, Familiar, Standard, web"), describe (you propose a calibration including the inferred deliverable type), or punt (you default to Standard + Familiar + Standard and infer the type).

After the user answers, **flag any toggle smells** per `CALIBRATION-INTERVIEW.md`'s smells section. Common ones: Lite + New + Minimum approval (fast + learning is risky); Full + Experienced + Minimum approval (Full ceremonies need per-stage review); Lite + audit need (audit overrides time horizon).

Confirm the calibration in plain English ("Standard project, Familiar, Standard approval — that means per-stage retrospectives covering process + product, append-only ledger documented but not CI-enforced, ~68 scaffold files…"). User confirms or revises.

**Don't lock the calibration to `project-config.md` yet** — that happens at end of Phase 1 (after the spec lands). The spec may surface complexity that bumps the project upward; bumping tier *before* generating scaffolds is cheap.

**Step 0.2 — Discovery questions, depth determined by tier.**

For **Lite** tier (~15 min total — explanatory mode auto-on for Novice expertise):

1. **What is this?** One paragraph.
2. **What isn't this?** What are you deliberately not building?

For **Standard** tier (~30 min total):

1. **What is this?** One paragraph.
2. **What isn't this?** Just as important.
3. **Stack.** What languages, frameworks, runtimes? Open to recommendations?
4. **v1 scope.** What's the smallest meaningful release?
5. **Success criteria.** How will you know v1 is done?

For **Full** tier (~60 min total):

1. **What is this?** One paragraph.
2. **What isn't this?** Deliberate exclusions.
3. **Stack.** Locked or open?
4. **v1 scope.** Minimum meaningful release; what's deferred to v2+?
5. **Success criteria.** How you'll know v1 is done.
6. **Distribution target.** Library / service / desktop / CLI / mobile? Different gates apply.
7. **License + contribution model.** OSS? Proprietary? Solo or team?
8. **Naming.** Project name? Repo dir name?

**Target OS + repo visibility (all tiers).** Gather the two facts that confirm the Choice-5 verification posture and drive the generated workflows: *which OSes does this ship to or run on (in particular — **does it ship to macOS?** check packaging config: electron-builder targets, `pyproject`/`setup` classifiers, build scripts; don't assume), and is the repo public or private?* Public → cloud Actions are free + unlimited, lean `cloud`; private → `hybrid` keeps minutes near-zero (full suite local at pre-push, one ubuntu PR smoke check, macOS + full matrix only on `v*` tags). The macOS-ship answer decides whether `release.yml` (or the cloud `ci.yml` matrix) carries a macOS leg. This is the Phase-0 "audit" step of the local-test-verification flow (`BUILD-PLAYBOOK.md` §0.6). **Also gather the `LICENSE` holder + year** (and license type — MIT is the scaffold default) — the generated `LICENSE` fills `{{LICENSE_HOLDER}}`/`{{LICENSE_YEAR}}`/`{{LICENSE_TYPE}}` from this answer; **never guess a copyright holder** (hard rule #7). At Full tier this folds into the existing license/contribution question.

For **all tiers**, if the user is **Novice expertise**, web-verify any technical choices (library versions, frameworks, idiomatic patterns) before proposing them — `research_mode: best_practice_first` is the default. Don't ask the user "which database should we use?"; surface the current best-practice options for their use case with rationale, then ask which appeals.

Surface a one-page summary of the answers + the inferred tier + expertise. User confirms or revises. **Lock tier and expertise to `project-config.md` only after Phase 1.** Don't generate the config file yet — the spec may surface a complexity higher than the initial tier suggested, and the right move is to bump tier before scaffolding.

### Phase 1: Spec authoring

Generate `spec/project-spec.md` from the discovery answers. Depth scales by tier:

**Lite:** ~1 page total.

- §1 Identity (what / what-not)
- §2 Scope (what's in v1; what's deferred)
- §3 Success criteria (3–5 bullets)

**Standard:** ~2–3 pages.

- §1 Identity
- §2 Scope matrix (in / out / deferred — with version markers)
- §3 Architecture overview (one paragraph; detailed in ADRs as needed)
- §4 Engineering charter (gates, quality bar)
- §N Open questions

**Full:** the full structure from the original playbook (see `templates/PROJECT-CLAUDE.md` Phase 1 reference).

**Deliverable-type contract section (all tiers).** After the base spec, append the section matching `deliverable_type` from `templates/SPEC-TYPE-SECTIONS.md` — the contract that type lives on: `cli` → Command surface (args / exit codes / stdout); `library` → API surface (public exports / semver); `service` → Endpoint contracts (routes / auth / health); `web` → a pointer to `docs/design.md` + Visual acceptance criteria (authored at Phase 1.5/1.6); `other` → nearest fit + an Open-Questions flag that the type contract isn't specialized. This section drives the type-specific gates in `docs/gates.md` and the matching Verifier passes.

After the spec lands, **revisit tier and expertise**: did the spec surface complexity that pushes tier up? An "audit needs" requirement that wasn't obvious in Phase 0? Adjust before Phase 2 if so.

Surface for review. Iterate until accepted.

### Phase 1.5 — Design discovery (web/UI only)

**Runs only when `deliverable_type: web`.** Skip entirely for cli / library / service / other — they have no design brief and proceed straight to Phase 2.

A web/UI build authors a design brief *before* any interface code, so the UI is consistent and actually designed rather than raw browser defaults (the framework's worst observed failure was a web app that passed every engineering gate and shipped unusable). Present the interview from `templates/DESIGN-DISCOVERY-INTERVIEW.md`. It opens with the gate question — **does the user have Claude Design?** — and routes three ways:

- **Path A (has Claude Design):** the user authors the system externally and drops the exported `design.md` into `docs/design.md`. Validate it has the 9 sections; skip the interview.
- **Path B1 (from scratch):** run the question set at tier-conditional depth (Lite ~8–10 starred questions / Standard ~25–30 / Full ~50–70).
- **Path B2 (community template):** the user starts from an `awesome-claude-design` template and the agent runs only the ~10 delta questions.

### Phase 1.6 — design.md authoring (web/UI only)

Synthesize the Phase 1.5 answers into `docs/design.md` using the 9-section structure in `templates/design.md` — every `{{placeholder}}` replaced with a concrete value, none left in the instance file. Surface the draft for approval (worth a pre-write look even under `pre_write_surface: spec_and_plan_only` — it drives every UI stage). On approval, write `docs/design.md` and ensure it's on the work read-first list. Then proceed to Phase 2.

### Phase 2: Phased milestone breakdown

From the spec, propose milestones. Count and depth scale by tier:

- **Lite:** 1–3 milestones; each is a single feature increment, no formal closeout, ~3–5 day estimate
- **Standard:** 3–6 milestones; each has staged work (A, B, C) and runs Stage E closeout — append-only ledger advisory (generated and written, but honor-system, not CI-enforced), 1–2 weeks each
- **Full:** 3–8 milestones; each has full staging (A, B, C, D + E closeout), 1–2 weeks each

Each milestone (regardless of tier):

- Has a one-line goal
- Has explicit acceptance criteria (3–6 items; 2–3 for Lite)
- Names dependencies (prior milestones, ADRs)
- Is scoped to fit the tier's milestone size

Surface for review. User confirms or revises milestone count, scope, ordering.

**Draft the ranked backlog (`docs/backlog.md`) from this breakdown.** The milestone plan already *implies* a priority order — Phase 2 makes it explicit and ranked. Synthesize the spec's scope + the milestone ordering into a first-draft ranked list of user stories in `docs/backlog.md` (from `templates/backlog.md`, tier-scaled: Lite `# / story / status`; Standard adds `Depends on`; Full adds the re-rank override-log). This is the artifact the off-track check (G8) measures against, so it must be **surfaced explicitly for human ratification** — the backlog is HITL co-authored, and the agent only *drafts/proposes* the ranking (no AI-only edits, ever — `FRAMEWORK-CONFIG.md` §4.15). The actual file is written in Phase 3 with the rest of the scaffold; here you draft the *content* (the ranked stories) and get the user's sign-off on the ordering. Add it to the work read-first list (it already is in `templates/dot-claude/read-first-list.txt`).

### Phase 3: Project scaffold generation

Generate the project's directory structure and companion docs from `templates/`. Replace `{{PLACEHOLDER}}` values with project's actual values. **Scaffold contents are tier-conditional**:

#### Always generated (all tiers)

| Generated file | From template | What it is |
|---|---|---|
| `CLAUDE.md` | `templates/PROJECT-CLAUDE.md` | Project execution rules (replaces this bootstrap CLAUDE.md). Tier-conditional sections trimmed to match. |
| `project-config.md` | `templates/project-config.md` | The active tier + expertise + toggle values, plus the override log |
| `docs/identity.md` | `templates/identity.md` | What this is / what this isn't + read-first list (capped per tier) |
| `docs/scope.md` | `templates/scope.md` | The phased milestone scope (filled from Phase 2) |
| `docs/backlog.md` | `templates/backlog.md` | The ranked, HITL-co-authored priority backlog (first draft from Phase 1/2; what the off-track check / G8 measures against). On the work read-first list. Tier-scaled: Lite = `# / story / status`; Standard adds `Depends on`; Full adds override-log-on-re-rank. |
| `.claude/settings.json` | `templates/dot-claude/settings.json` | Wires the SessionStart hook (mode-aware read-first list), the UserPromptSubmit hook (mode↔prompt match enforcement), **and** the PreToolUse red-gate hook (blocks pre-approval implementation edits — PROC-001), plus the tiered permission fence (selected by `approval_cadence` — see the note below) |
| `.claude/hooks/session-start-read-first.cjs` | `templates/dot-claude/hooks/...` | Auto-loads read-first list (Node; cross-platform) |
| `.claude/hooks/user-prompt-submit-mode-check.cjs` | `templates/dot-claude/hooks/...` | Blocks a pasted stage prompt whose mode (work/verifier) disagrees with `.claude/role` — structural guard for the 3-brain separation (Node; cross-platform) |
| `.claude/hooks/pretooluse-red-gate.cjs` | `templates/dot-claude/hooks/...` | The hard PROC-001 red-stop (matcher `Edit\|Write\|MultiEdit\|NotebookEdit`): while a stage is open (`.claude/stage-active`) and not yet `/approve-red`'d, blocks edits to implementation paths so tests come before code. Work mode only; fail-open by design (Node; cross-platform) |
| `.claude/hooks/receipts-lifecycle.cjs` | `templates/dot-claude/hooks/...` | The build-receipt lifecycle adapter — ONE shared hook registered on every lifecycle boundary (SessionStart/SessionEnd/UserPromptSubmit/Stop/PreToolUse-broad/PostToolUse/PostToolUseFailure/PermissionRequest), added ALONGSIDE the read-first + mode-check + red-gate entries. Maps each boundary to a bounded receipt event and appends to `.claude/receipts/` (gitignored) via `scripts/lib/receipts.cjs`. Exit-code discipline (RCPT-09): exactly one exit (0) + no stdout, so a metrics fault never alters a hook's exit; fail-open (Node; cross-platform) |
| `scripts/set-mode.cjs` | `templates/scripts/set-mode.cjs` | Atomic writer for `.claude/role` — the only supported way to set the session role (avoids the ERR-002 truncate-write race). `/verify`, `/refactor`, and the SessionStart hook depend on it |
| `scripts/stage-active.cjs` | `templates/scripts/stage-active.cjs` | Atomic writer for `.claude/stage-active` — the open-stage marker the red-gate keys off; `/stage` opens it, `--clear` closes it (and clears `.claude/red-approved`) |
| `scripts/approve-red.cjs` | `templates/scripts/approve-red.cjs` | Writes `.claude/red-approved` for the open stage — the human's `/approve-red` unlock that releases the red-gate for that stage only (a fresh stage starts un-approved) |
| `.claude/read-first-list.txt` | `templates/dot-claude/read-first-list.txt` | Work-mode read list, capped per tier |
| `.claude/read-first-list-verifier.txt` | `templates/dot-claude/read-first-list-verifier.txt` | Verifier-mode read list (omits retros — fresh-context bias guard) |
| `.claude/read-first-list-orchestrator.txt` | `templates/dot-claude/read-first-list-orchestrator.txt` | Orchestrator-mode read list (loads ORCHESTRATOR.md first; used Standard+) |
| `.claude/read-first-list-refactor.txt` | `templates/dot-claude/read-first-list-refactor.txt` | Refactor-mode (Stage R) read list — strictest bias guard: omits retros **and** prior R findings (used Standard+; harmless at Lite where `refactor_mode: skip`) |
| `validators/validate-stage-prompts.cjs` | (copy from kit root, unchanged) | Schema validator; runs as pre-commit + CI |
| `validators/validate-retrospective.cjs` | (copy from kit root, unchanged) | User-friction-stamp gate; runs as pre-commit. Fails a commit whose staged retro has an empty/placeholder stamp. (Standard+) |
| `validators/validate-app-map.cjs` | (copy from kit root, unchanged) | App-Map currency primitive — test-id binding (every `verified` entry's id must exist in the test globs) + surface-source-diff tripwire. Runs in CI after the green-suite gate. Generated when `app_map: on` (Standard+ drivable surface classes). |
| `validators/validate-test-honesty.cjs` | (copy from kit root, unchanged) | The G9 test-honesty gate — a v1.7+ work stage carries a `<test_honesty>` slot (named mutation, or `n/a — no risk surface`) + flags assertion-free / exception-only staged tests. Runs as pre-commit (severity per `test_honesty`: `warn`/`block`). Risk-tiered + incremental; pre-v1.7 docs grandfathered. |
| `validators/README.md` | (copy from kit root, unchanged) | Validator usage docs. **The rows above are the tier-active headline validators; the COMPLETE inherited set — all 15 shipped `validators/*.cjs`, each with its tier condition — is enumerated in the note immediately below this table.** |
| `.github/workflows/validate-stage-prompts.yml` | `templates/dot-github/workflows/...` | CI workflow that runs `--all` on Phase docs |
| `.github/copilot-instructions.md` | `templates/dot-github/copilot-instructions.md` | Shim auto-loaded by GitHub Copilot in VS Code (Claude model). Harmless for Claude Code users; load-bearing for Copilot users. Generated regardless of host so the project is Copilot-ready out of the box. |
| `CHANGELOG.md` | (generated empty) | Release notes; for Lite, this also serves the role gap-analysis plays in higher tiers |
| `.gitattributes` | `templates/dot-gitattributes` | Forces `* text=auto eol=lf` so tracked text files are LF on disk regardless of OS or the user's `core.autocrlf`. Prevents the Windows CRLF-vs-prettier failure where every file fails `format:check`. One line; generated for every tier. |
| `.gitignore` | `templates/dot-gitignore` | Ignores framework transient state (`.claude/build-status.md`, `.claude/role`); a stub for project/stack ignores. Merge with the stack's own ignores if the user has one. |
| `LICENSE` | `templates/LICENSE` | The project's license — MIT body (the scaffold default) with `{{LICENSE_TYPE}}`/`{{LICENSE_HOLDER}}`/`{{LICENSE_YEAR}}` filled from the owner's discovery answer, **never guessed** (hard rule #7). Closes the README-implies-a-license-but-none-ships gap. To ship a non-MIT license, replace the body. |
| `scripts/verify-local.cjs` | `templates/scripts/verify-local.cjs` | The one local verification entrypoint — Linux-in-Docker + dev-OS-native in sequence, non-zero on any failure (`verification_locus`). Lite may run native-only. |
| `scripts/install-hooks.cjs` | `templates/scripts/install-hooks.cjs` | One-time `git config core.hooksPath .githooks` install — the documented setup step. |
| `.githooks/pre-commit` | `templates/dot-githooks/pre-commit` | Fast checks (lint + unit subset) + the framework validators when relevant files are staged. |
| `.githooks/pre-push` | `templates/dot-githooks/pre-push` | Runs the full local matrix (`scripts/verify-local.cjs`); blocks the push on failure. The teeth behind local-first verification. |
| `validators/lib/fenced-block.cjs` | (copy from kit root, unchanged) | The shared fenced-block/CRLF primitive `validate-stage-prompts` and `validate-retrospective` require — without it the rendered headline validators crash MODULE_NOT_FOUND. |
| `scripts/kit-update.cjs` | `templates/scripts/kit-update.cjs` | The update story: diffs the project's live kit-managed enforcement files against the kit's `templates/` (stamp + LF-normalized hash), respects declared ARC-007 intentional divergence (reported, never overwritten), offers explicit per-file `--apply` re-copy (temp+rename, confined). Read-only by default; no-ops in the kit repo itself. |
| `scripts/smoke-project.cjs` | `templates/scripts/smoke-project.cjs` | The generated mini-smoke: the project's OWN regression floor — each of the four hooks + every present validator entry point exercised on synthetic sandbox fixtures, one happy + one failing case each; absent validators are a visible skip. A user who tweaks a validator locally is no longer flying test-free. The bake runs the baked project's own copy. |
| `scripts/lib/sandbox.cjs` | `templates/scripts/lib/sandbox.cjs` | The fixture-confinement primitive (`assertInside`, git-env scrub, sandbox roots) that `kit-update --apply` and the mini-smoke consume — confinement travels with the tools that need it (byte-parity with the kit's own copy). |
| `scripts/lib/receipts.cjs` | `templates/scripts/lib/receipts.cjs` | The build-receipt contract: per-session append-only event ledgers under `.claude/receipts/` (gitignored), the privacy allowlist with teeth, honest interval arithmetic (unknown is never zero), and the `software-build-assurance-kit/build-receipt/v1` statement builder that refuses receipts lacking provenance or limitation (byte-parity with the kit's own copy). |
| `scripts/build-receipts.cjs` | `templates/scripts/build-receipts.cjs` | The build-receipts CLI: validate a receipts ledger dir and print coverage; the collectors and the deterministic JSON/HTML report renderer live here too. An absent ledger dir is a stated coverage note, never an error. |
| `scripts/lib/receipts-collect.cjs` | `templates/scripts/lib/receipts-collect.cjs` | The build-receipt collectors: committed artifacts (git log / CHANGELOG / retrospectives / tech-debt / release-state) become `software-build-assurance-kit/build-receipt/v1` receipts with provenance + limitation, classified to the honest-rework doctrine (in-budget self-correction is the process *working*, not "broke"; ambiguous stays unclassified, never forced). Reuses `validators/lib/fenced-block.cjs` (the one fence parser — no fork) and feeds `scripts/lib/receipts.cjs`'s statement builder. No artifact, no receipt (byte-parity with the kit's own copy). |

> **The full validator set (the complete inherited gate floor).** Every `validators/*.cjs` the bootstrap copies (all unchanged from kit root), with its tier condition — so a reader of this spec sees the WHOLE inherited gate set, not the original two. `validators/validate-validator-enumeration.cjs` enforces that this list, `validators/README.md`, and `templates/PROJECT-CLAUDE.md` stay reconciled (a shipped validator absent from any of the three blocks):
> - `validators/validate-stage-prompts.cjs` — stage-prompt schema check (all tiers; pre-commit + CI).
> - `validators/validate-retrospective.cjs` — user-friction-stamp gate (Standard+).
> - `validators/validate-operating-mode.cjs` — rejects an out-of-range `operating_mode` (all tiers).
> - `validators/validate-app-map.cjs` — App-Map currency primitive + G10 assembled-execution cluster-gate (Standard+, `app_map: on`).
> - `validators/validate-test-honesty.cjs` — G9 test-honesty (Standard+).
> - `validators/validate-risk-escalation.cjs` — G11 risk-overrides-tier escalation record (Standard+).
> - `validators/validate-destructive-op.cjs` — G12 destructive-op rollback + confinement (Standard+).
> - `validators/validate-risk-matrix.cjs` — G13 9-property risk matrix (Standard+).
> - `validators/validate-calibration.cjs` — G14 verifier-proof / seeded-defect calibration set (Standard+).
> - `validators/validate-reconciliation.cjs` — closeout count reconciliation (Standard+).
> - `validators/validate-transition.cjs` — G15 transitions: atomic durable-state writes + honest four-type rework reconciliation; the six-state release ladder (Standard+).
> - `validators/validate-release-readiness.cjs` — G16 release-readiness: the capability-triggered independent whole-product review + ladder well-formedness + the SLSA-level cite at the release end; the manual-aging flag (Standard+).
> - `validators/validate-sources.cjs` — source-registry binding (`research_publish` mode).
> - `validators/check-append-only.cjs` — append-only ledger byte-prefix check (Full; the `append-only-ledger.yml` engine).
> - `validators/validate-validator-enumeration.cjs` — enumeration coherence: every shipped validator is listed in all three catalogs (this list + README + PROJECT-CLAUDE.md). A CI / pre-commit inheritance check, not a numbered gate.
> - `validators/validate-entry-docs.cjs` — the doc-sync engine: derives/binds the kit's self-descriptive facts into `framework-manifest.json` and polices the entry-doc set for drifted self-claims, enforced in CI. A kit self-sync inheritance check, not a numbered gate; all tiers.

> **Verification-locus conditional (calibration Choice 5).** The four rows above (`scripts/verify-local.cjs`, `scripts/install-hooks.cjs`, `.githooks/pre-commit`, `.githooks/pre-push`) and the `pr-smoke.yml` + `release.yml` workflows (in the Standard+ table) generate under `verification_locus: hybrid` / `local_first`. Under `verification_locus: cloud` they're replaced by a single conventional `.github/workflows/ci.yml` (`templates/dot-github/workflows/ci.yml` — full matrix on every push/PR, free on public repos). `local_first` omits `pr-smoke.yml`. See `FRAMEWORK-CONFIG.md` §4.14.

> **App-Map conditional (`app_map` toggle, §4.16).** The generated CI workflows (`ci.yml` / `pr-smoke.yml`) carry an "App-Map currency check" step. Under **`app_map: on`** the bootstrap fills the `{{APP_MAP_TEST_GLOBS}}` / `{{APP_MAP_SURFACE_GLOBS}}` placeholders from `docs/gates.md`. (`fetch-depth: 0` is **already baked into both template checkouts unconditionally** — like `append-only-ledger.yml` — so the diff base is never a forgotten manual step; it's harmless when the App-Map step no-ops.) Under **`app_map: skip`** the bootstrap omits the step. Either way the step is a **structural no-op when `docs/app-map.md` is absent** — it's guarded by `if: hashFiles('docs/app-map.md') != ''`, so a missing map (skip tier, or `on` before the first surface ships its entry) never hard-fails the job. The guard is the load-bearing safety; the bootstrap's omission is just tidiness.

> **Permission fence (selected by `approval_cadence`).** `templates/dot-claude/settings.json` carries three named profiles in `_permission_profiles` — **Maximum oversight** (← Maximum cadence), **Fenced autonomy** (← Standard, the recommended default), **Sleep-through** (← Minimum). The bootstrap selects ONE by the chosen cadence, copies it into the live `permissions` block, and deletes `_permission_profiles`. The `{{STACK_*}}` allow placeholders (`{{TEST_CMD}}` / `{{LINT_CMD}}` / `{{BUILD_CMD}}` / `{{TYPECHECK_CMD}}` / `{{INSTALL_CMD}}` / `{{MANIFEST_FILE}}`) are filled from discovery. **The `deny` floor is level-invariant** — identical across all three profiles (secret reads `.env`/`.env.*`/`secrets/**`/`*.pem`/`*.key`; irreversible Bash `git push --force`/`reset --hard`/`clean`/`rm -rf`) — and `git commit`/`git push` stay `ask` at every level so G1 (no commit without approval) survives. The generated `CLAUDE.md` (from `templates/PROJECT-CLAUDE.md` §6.5) must carry the **three honest caveats**, and you should restate them when you surface the fence:
>
> 1. **`auto` is a user-level opt-in — the repo can't set it.** `defaultMode: "auto"` is **ignored** from project/local settings by design, so the repo doesn't set it; the user enables `auto` in their own `~/.claude/settings.json` for classifier-backed unattended runs. The deny floor stays the backstop.
> 2. **Secrets: `.claudeignore` is broken; `deny: Read()` is not airtight.** Never generate `.claudeignore` — it does not work (Claude reads `.env` despite it). The fence uses `deny: Read(...)`, but be honest: deny rules have had **bypasses** (an arbitrary `node`/`python` subprocess can open a file the tool layer would block), so the real fix is a **secret manager** / keeping secrets off disk + the OS sandbox. No false confidence.
> 3. **Web-remote constraint.** On Claude Code on the web, repo-set `auto` / `bypassPermissions` / `dontAsk` are **ignored** and edits are pre-approved — a checked-in fence meaningfully sets only `default`/`acceptEdits`/`plan` + allow/deny/ask there. The deny wall still applies; don't present the fence as stronger than it is in a web-remote session.

#### Standard and Full only

| Generated file | From template | What it is |
|---|---|---|
| `ORCHESTRATOR.md` | `templates/ORCHESTRATOR.md` | Orchestration operating manual — the orchestrator role's decision index (read only by orchestration sessions; never by build/stage sessions). §10 filled with the project's starting milestone state. |
| `docs/style.md` | `templates/style.md` | Style guide customized to chosen stack |
| `docs/gates.md` | `templates/gates.md` | Gate matrix (M01 row + roadmap; names project harnesses for Pass 4) |
| `docs/gotchas.md` | `templates/gotchas.md` | Numbered list of project-specific traps |
| `docs/sessions.md` | `templates/sessions.md` | Session register (starts empty) |
| `docs/consultations.md` | `templates/consultations.md` | Append-only ledger of ad-hoc orchestrator consultations (the "I'm seeing X, what should I do?" moments); how a future orchestrator session inherits an unplanned call |
| `docs/tech-debt.md` | `templates/tech-debt.md` | Append-only tech-debt ledger for 🟢 verifier findings |
| `docs/adr/0000-template.md` | `templates/adr-0000-template.md` | ADR template (also used for verifier-finding waivers) |
| `prompts/RETROSPECTIVE-TEMPLATE.md` | `templates/RETROSPECTIVE-TEMPLATE.md` | Per-stage retrospective shape (axes per tier) |
| `prompts/VERIFIER-RETROSPECTIVE-TEMPLATE.md` | `templates/VERIFIER-RETROSPECTIVE-TEMPLATE.md` | Stage V retrospective shape (brief; verification-soundness focus) |
| `prompts/VERIFIER-FINDINGS-TEMPLATE.md` | `templates/VERIFIER-FINDINGS-TEMPLATE.md` | Stage V findings file with mandatory tier-coverage caveat |
| `prompts/REFACTOR-RETROSPECTIVE-TEMPLATE.md` | `templates/REFACTOR-RETROSPECTIVE-TEMPLATE.md` | Stage R retrospective shape (brief; refactor-soundness focus, checks G7) |
| `prompts/REFACTOR-FINDINGS-TEMPLATE.md` | `templates/REFACTOR-FINDINGS-TEMPLATE.md` | Stage R findings file (Duplication/Complexity/Drift; mandatory tier-coverage caveat) |
| `prompts/SUMMARY-TEMPLATE.md` | `templates/SUMMARY-TEMPLATE.md` | Per-milestone summary shape |
| `prompts/PHASE-DOC-TEMPLATE.md` | `templates/PHASE-DOC-TEMPLATE.md` | Phase doc shape (markdown wrapper + XML stage prompts; includes Stage V section) |
| `docs/build-prompts/README.md` | `templates/build-prompts-README.md` | Orientation for `docs/build-prompts/` |
| `retrospectives/README.md` | `templates/retrospectives-README.md` | Orientation for `retrospectives/` |
| `.claude/commands/{stage,verify,refactor,closeout,on-track,approve-red}.md` | `templates/dot-claude/commands/...` | Slash commands so the user runs `/stage M01 A`, `/verify M01`, `/refactor M01`, `/closeout M01`, `/on-track`, `/approve-red` instead of hand-pasting XML stage prompts (courier relief). Each reads the Phase doc and runs the matching block. `/refactor` runs Stage R (trigger-based; no-op at Lite). `/approve-red` runs `scripts/approve-red.cjs` to release the PROC-001 red-gate after the human reviews the RED tests. `/on-track` runs the on-demand off-track review **in-session** — it sets no `role` and is not a stage prompt, so the mode-check hook never blocks it. |
| `docs/gap-analysis.md` | `templates/gap-analysis.md` | Append-only product↔spec ledger. **Advisory** at Standard (generated, written during Stage E closeout, honor-system — not CI-enforced); **CI-enforced** at Full via the workflow in the Full-only table below. The file is present at Standard so the agent has somewhere to append during closeout. |
| `docs/off-track-log.md` | `templates/off-track-log.md` | Append-only log of **justified** priority inversions (the off-track check / G8). **Advisory** at Standard (honor-system); **CI-enforced** at Full — it joins M01's `append-only-ledger.yml` LEDGERS set (reuse, no new workflow). Present at Standard so the agent has somewhere to log. At Lite, inversions fold into `CHANGELOG.md` instead. |
| `docs/app-map.md` | `templates/app-map.md` | The living drive/test map — what user-facing surfaces shipped and exactly how to drive and test each one, bound to test-ids by `validators/validate-app-map.cjs` so it can't drift from the running app. A **regular Standard+ row, not Web/UI-only** (the entry shape + test-id-binding invariant are universal; only the gesture vocabulary adapts to the derived surface class `ui`/`command`/`endpoint`/`api`). Generated when **`app_map: on`** — the default at Standard+ for the drivable surface classes; `skip` at Lite and for `library` (`api`). On the work/verifier/orchestrator read-first lists (not refactor). |
| `.github/workflows/pr-smoke.yml` | `templates/dot-github/workflows/pr-smoke.yml` | One hosted `ubuntu` PR smoke check — the non-bypassable backstop under `verification_locus: hybrid`. Make it a required status check in branch protection. |
| `.github/workflows/release.yml` | `templates/dot-github/workflows/release.yml` | Full matrix incl. macOS + signed/notarized desktop packaging, on `v*` tags only — the one bounded place macOS minutes are spent. macOS leg emitted iff the Phase-0 audit found a macOS ship target. |
| `.github/workflows/pr-smoke.self-hosted.yml.example` | `templates/dot-github/workflows/pr-smoke.self-hosted.yml.example` | Commented opt-in: run the backstop on a self-hosted runner for $0 GitHub minutes (trade-offs in the file header). |

#### Full only

| Generated file | From template | What it is |
|---|---|---|
| `.github/workflows/append-only-ledger.yml` | `templates/dot-github/workflows/append-only-ledger.yml` | One parameterized workflow runs `validators/check-append-only.cjs` over the ledger set (`docs/gap-analysis.md`, `docs/tech-debt.md`, `docs/consultations.md`, `docs/off-track-log.md`) and fails any PR that mutates a prior line — turning the Standard-tier advisory ledger into a CI-enforced one. The ledger paths are an editable list in one place at the top of the workflow. `project-config.md` is deliberately **not** in the set: its Tier line + toggle table are editable on re-tier, so a whole-file byte-prefix check would false-positive — its override log cites the shared check but stays honor-system. |

#### Web/UI only (`deliverable_type: web`)

| Generated file | From template | What it is |
|---|---|---|
| `docs/design.md` | `templates/design.md` (or imported from Claude Design) | The 9-section design brief authored at Phase 1.6. Read before any UI code; the contract Stage V's design pass checks against. Added to the work read-first list. |

The design-discovery interview (`templates/DESIGN-DISCOVERY-INTERVIEW.md`) is *used* at Phase 1.5 but not copied into the project — it's a kit authoring aid, like `CALIBRATION-INTERVIEW.md`.

**Lite-tier shortcut:** the bootstrap can collapse multiple Lite-tier scaffold steps into a single approval ("here are the ~36 files I'll generate"). For Standard and Full, surface the list category by category.

Also: keep `BUILD-PLAYBOOK.md`, `FRAMEWORK-CONFIG.md`, `STAGE-PROMPT-PROTOCOL.md`, `PROCESS-VALIDATION.md`, and `persistence-architecture.md` at the project root (framework-level references the project depends on; immutable except via ADR).

**Pre-flight disclosure (before any disk write).** State the filesystem blast radius in one line so the user consents to the footprint up front: *"I'll create ~N files and modify M, across `.claude/`, `.githooks/`, `scripts/`, `docs/`, `prompts/`, `spec/`, `.github/`, plus root files (`CLAUDE.md`, `project-config.md`, `.gitattributes`, …). Want the itemized list?"* Offer the full list on request; don't dump it unprompted. This is footprint/location consent — distinct from the per-phase draft review, which is about content. Call out the directories a user might not expect touched (`.claude/`, `.github/`, root dotfiles).

Surface the list of generated files (high-level summary; user can spot-check). On approval:

1. Write all the new project files. **Encoding: write every file as UTF-8 without a BOM.** The templates are UTF-8 and saturated with em-dashes (`—`) and the `🔴🟡🟢` severity markers. On Windows, do **not** round-trip them through `Get-Content -Raw` / `Set-Content` without `-Encoding UTF8` — PowerShell's default encoding reads UTF-8 as ANSI and mojibakes every non-ASCII char (`—` → `â€”`) across the whole scaffold. Prefer the encoding-safe Write/Edit tools over shell file I/O for scaffold writes. After writing, spot-check with a search for `â€` / stray mojibake and fix before handoff.
2. **Overwrite this bootstrap CLAUDE.md with `templates/PROJECT-CLAUDE.md` (filled in, tier-conditioned).** This is the handoff — the bootstrap dies so the project rules can take over.
3. Write `project-config.md` with the agreed tier, expertise, and toggle values.
4. Optionally, delete `templates/` from the project root (or keep it for reference; offer the user the choice). **Note:** if kept, `templates/dot-claude/hooks/` is the source of truth for the live `.claude/hooks/`. If a future kit update fixes a hook, an already-bootstrapped project must re-copy it into `.claude/hooks/` (or re-run the scaffold step) — a plain `git pull` of the kit updates only the template, not the live copy the project actually runs.

### Phase 4: First Phase doc

Generate the first milestone Phase doc. Depth and shape are tier-conditional:

**Lite:** a single markdown file at `docs/build-prompts/M01-<title>.md` with a brief structure (Background / Scope / Tasks list / Definition of done). No XML stage prompts; the agent works from the markdown directly.

**Standard:** the full Phase doc structure but with reduced stage count (typically A and B only, no closeout E).

- Background / Scope / References / Document structure / Implementation Workflow
- Per-stage sections (X.1 Problem / X.2 Files / X.3 Detailed changes / X.4 Tests / X.5 CLI Prompt / X.6 Commit Message)
- XML stage prompts validating against `STAGE-PROMPT-PROTOCOL.md`

**Full:** the original full structure (Stages A, B, C, D + E closeout; full XML schema; pre-authored commit messages per stage).

Iterate with user until M01 Phase doc is accepted. The XML stage prompts (Standard and Full) must validate against `STAGE-PROMPT-PROTOCOL.md`.

### Phase 5: Handoff to Stage M01.A

The bootstrap is complete. Surface the final state:

- All scaffold files generated and listed (with realistic counts: ~36 for Lite, ~68 for Standard, ~69 for Full — including Phase 1/4 outputs, not just the always-generated set; derived from `golden-manifest.json` — see the counting note in `templates/CALIBRATION-INTERVIEW.md`)
- `CLAUDE.md` replaced with the project version
- `project-config.md` written with the agreed tier and toggles
- `.claude/` hooks installed; SessionStart hook will auto-load the read-first list on the next session
- M01 Phase doc ready at `docs/build-prompts/M01-<title>.md`
- **Git remote reset (do this before any push).** The project was cloned from the kit, so `origin` still points at the kit's repo — pushing now would target the kit, not the user's project. As the final scaffold action, run `git remote remove origin`, then surface the three options so the user picks where their project actually lives:
  - **Local-only (no GitHub):** nothing more to do — commits stay local.
  - **Existing empty GitHub repo:** `git remote add origin https://github.com/<user>/<repo>.git` then `git push -u origin <branch>`.
  - **Create a new GitHub repo (needs `gh` authenticated):** `gh repo create <name> --private --source=. --remote=origin --push`.
  Don't guess the user's choice — ask. If the user defers, leaving `origin` unset is the safe state (a later push errors clearly instead of silently targeting the kit).
- **Next action:** open a fresh Claude Code session in this directory; the new `CLAUDE.md` will take over as the auto-loaded entry point, and the SessionStart hook will inject the read-first list. For Lite, just say "let's start M01"; for Standard and Full, paste the M01.A stage prompt from the Phase doc to begin Stage A.

After handoff, this bootstrap CLAUDE.md no longer exists — the project's own CLAUDE.md is the entry point.

---

## Hard rules during bootstrap

These apply to YOU (Claude) during the bootstrap workflow, before the project's own rules are in place:

1. **Surface artifacts for approval per the `pre_write_surface` toggle (default `spec_and_plan_only` at Standard).** `always` → surface every draft, wait for approval, then write (the safe default for Novice/Full). `spec_and_plan_only` → surface the spec (Phase 1) and milestone plan (Phase 2) pre-write; write the scaffold (Phase 3) and Phase docs (Phase 4) directly and surface them for *post-write* review. `none` → write-then-review everything. This is set by `verbosity`; it fixes the token waste of re-surfacing every long artifact (especially the Phase doc) when the user would catch any issue just as well post-write. The pre-flight footprint disclosure (rule #11) and the do-not-commit-without-approval rule (G1) always hold regardless of this toggle.
2. **Do not skip phases.** The order matters. Phase 1 needs Phase 0's answers; Phase 4 needs Phase 1–3's outputs.
3. **Do not invent content the user hasn't confirmed.** When a placeholder needs a value, ask. Don't guess plausible-sounding defaults that the user will have to undo later.
4. **Do not delete `BUILD-PLAYBOOK.md`, `FRAMEWORK-CONFIG.md`, `STAGE-PROMPT-PROTOCOL.md`, `PROCESS-VALIDATION.md`, or `persistence-architecture.md` during bootstrap.** They stay at the project root after handoff.
5. **Do replace this bootstrap CLAUDE.md with the project's CLAUDE.md at end of Phase 3.** That's the handoff. The bootstrap dies so the project rules can take over.
6. **Do not start Phase 4 (M01 Phase doc) until Phase 3 (scaffold) is complete and approved.** Phase 4 references `project-config.md`, the gate matrix (Standard+), identity, and scope docs that Phase 3 produces.
7. **Do not invent placeholder values when the user hasn't given them.** If a `{{TOKEN}}` in a template needs filling and the discovery phase didn't surface a value, surface the missing token and ask. Don't guess plausible defaults that the user will have to undo. (Especially: stack-language names, license, project name, version numbers.)
8. **Do install the `.claude/` hook scaffold during Phase 3, regardless of tier.** Hook enforcement is the cheapest reliability win the framework offers. Even Lite tier benefits.
9. **For Novice expertise users (`explanation_mode: verbose`), narrate decisions as you make them.** Why this library; why this scope cut; why this milestone ordering. Don't just produce the artifact — show the reasoning so the user learns. For Expert (`terse`), surface the artifact and skip the narration.
10. **Web-verify external facts before proposing them, especially for Novice users (`research_mode: best_practice_first`).** Library versions, framework idioms, security best practices — confirm current state from authoritative sources before drafting code. Don't waste a turn on values that will need correction.
11. **Disclose the filesystem blast radius — twice, at two depths.** (a) **Session start, before the calibration interview:** echo the current working directory and a one-line scope statement ("I'll create your project files here — ~68 at Standard, including `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files"). Confirms the user is in the right repo before they invest time in calibration + discovery. Offer `details` on request. (b) **Phase 3, before any disk write:** the full itemized count + directories, again offering the full list on request. The user consents to the footprint twice — once on *location* up front, once on *content* at write-time — and should never first learn what was written to their root only from the post-write summary.
12. **Write all scaffold files as UTF-8 without a BOM; never let PowerShell's default encoding touch them.** The templates are full of em-dashes and `🔴🟡🟢` emoji. `Get-Content -Raw` / `Set-Content` without `-Encoding UTF8` mojibakes every one. Use the encoding-safe Write/Edit tools, not shell file I/O, for scaffold writes — and verify with a mojibake search before handoff.

---

## If something goes wrong

If the user aborts mid-bootstrap, leave any partial files in place (don't roll back unilaterally) and surface what was generated so far. Re-running the bootstrap should detect partial state (e.g., spec exists but no scaffold) and offer to resume from the appropriate phase rather than restart from scratch.

If a phase fails partway and you're unsure of the recovery path, surface the partial state and the original tier/expertise calibration. The user can either: (a) finish the phase manually with your help, (b) re-tier downward to a simpler shape and continue, (c) start a fresh session with the partial state intact.

If you're in bootstrap mode and the user wants to do something other than bootstrap — e.g., they want to read the playbook, ask questions about the framework, or just chat — engage normally. Don't force the bootstrap workflow if it's not what they want.

If the user seems lost, is new to the framework, or asks "how does this work / how do I use this," point them at `QUICKSTART.md` (the shortest path to a running build loop, with prerequisites, the clone gotcha, the per-stage loop mechanics, and a full file map) and `HOW-IT-WORKS.html` (a visual overview they can open in a browser). Don't make them reverse-engineer the framework from the methodology files.

If the user asks to skip phases (e.g., "I already have a spec, just generate the scaffolds"), accommodate. Read the spec they provide, jump to Phase 2 or 3 as appropriate, but verify the spec covers the equivalent of the Phase 1 structure for the chosen tier before proceeding. Skipping phases is fine as long as the deliverables those phases would have produced are already in hand.

If the user wants to skip the tier inference entirely ("just use Full / just use Lite"), accommodate. Surface a one-sentence note that you're skipping calibration and proceed at the chosen tier. The override log captures the explicit choice.

---

## Operating modes (the leading dial)

The bootstrap asks the **leading `operating_mode` question first** (Phase 0 Step 0.0) — *"what kind of work is this?"* — before the five calibration choices. All four modes are live:

- **`greenfield`** (default) — build software from scratch. The full bootstrap workflow above. **Implemented.**
- **`bug_fix`** — fix a known defect in existing code. Reduced 3-phase shape (reproducer + impact analysis → minimal fix → single Verifier pass); no spec/scope/milestones; CHANGELOG one-liner instead of Stage E. **Implemented.**
- **`research_publish`** — synthesize literature/data into a paper + interactive app. The hybrid two-phase shape: Phase R (grounded STORM research, always Lite process, mandatory sources registry) → an **explicit user re-tier** → Phase A (the interactive app at the tier it warrants, inheriting that tier's full scaffold + Stage V). **Implemented** (`BUILD-PLAYBOOK.md` §3.9).
- **`audit`** — review an existing codebase (security / performance / architecture / compliance); the deliverable is a findings report + remediation backlog, not new code. The existing codebase is the spec: **Phase S → Phase P → Phase C → consolidation**, **no milestones and no Stage V** (audit *is* verification). Tier selects the dimension count (Lite 1–2 / Standard 3–4 / Full all 8); `audit_multi_model` default `false` (Path A — fresh-context challenges). **Implemented** (`BUILD-PLAYBOOK.md` §3.8).

`operating_mode` is project-scoped (`project-config.md`) and orthogonal to the session-scoped `role` (the 3-brain `{work, verifier, orchestrator, refactor}` axis); the SessionStart hook composes the read-first list from both. For an unset or unrecognized mode, default to `greenfield` — never error a project for the mode.
