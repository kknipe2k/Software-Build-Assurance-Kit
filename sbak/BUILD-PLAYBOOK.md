# Build Playbook

> **Human reader: you can skip this file.** It is part of the agent's operating manual — a reference the build sessions consult, deliberately exhaustive. Start at `README.md` → `QUICKSTART.md`, and ask questions in-session rather than reading ahead.

> A manual playbook for shipping software with a human as sole reviewer/approver and an LLM as sole implementer. Stack-agnostic. Designed for direct adoption.

---

## Purpose

This playbook describes a methodology for building software where:

- **The human is sole reviewer and approver.** No keyboard time on code.
- **The LLM (Claude in this playbook) is sole implementer.** All code, tests, and gate execution.
- **The audit trail is append-only and immutable.** Once a ledger entry lands, history cannot be edited; future work speaks through carry-forward.
- **Every increment is gate-bounded.** Whatever the project's gates are, they pass cleanly or the loop halts.

Stripped of tooling, the methodology runs by discipline. This document is the discipline written down.

## How to use this document

Read top-to-bottom once. Then use Part 3 (the loop) as your operational checklist and Parts 1, 2, 4, 5 as reference. The companion documents listed in Appendix A live as siblings to this playbook in your repository.

**Before you start:** read Part 0 below to pick a tier. Without that calibration, the playbook's defaults are aimed at the most demanding case (long-running, audit-critical, expert reviewer) and will feel like overhead on simpler projects. Part 0 gives you the dial.

---

# Part 0: Calibration — pick a tier before applying the playbook

The playbook was written for the most demanding case. Most projects don't need the most demanding case. **Pick a tier first; the rest of the playbook reads it and adjusts.**

## 0.1 The two tiers (canonical reference: `FRAMEWORK-CONFIG.md`)

- **Lite** — solo, simple/small project, ≤1 week, low audit needs. One-paragraph retrospective. No append-only ledger. Per-PR approval (not per-stage). Web-verified defaults (the framework leans on the web for non-experts). Scaffold size: 52 files for a project generated from this distribution (the shipped `golden-manifest.json` carries the same derived count; see the counting note in `templates/CALIBRATION-INTERVIEW.md`). Recurring overhead per stage: ~10 minutes of human review.
- **Full** (default) — anything with a second reader, an audit need, or a multi-week horizon. Two-axis retrospective (process + product). Append-only ledgers advisory; CI-enforced when a declared risk trigger arms the workflow. Per-stage approval. Web-verified defaults. Blocking validators. Scaffold size: 119 files for a project generated from this distribution (the shipped `golden-manifest.json` carries the same derived count; see the counting note in `templates/CALIBRATION-INTERVIEW.md`). Recurring overhead per stage: ~30 minutes of human review.

Pick by the highest-tier input across complexity, time horizon, and audit needs. A 3-day project with regulatory audit needs is **Full**, not Lite. Don't know? Start **Full** (the default) — and downshift to Lite with eyes open if the project is solo, ≤2 weeks, no audit need.

## 0.2 Tiers are toggle bundles; you can override individual toggles

Tier names are shorthand for default toggle bundles. The toggles (approval cadence, retrospective depth, ledger discipline, web-verify cadence, read-first cap, research mode, escalation triggers, hook enforcement) are dialed independently in the project's `project-config.md`. See `FRAMEWORK-CONFIG.md` §4 for the full schema.

Common deviations:

- Lite tier + audit needs surface mid-project → flip `ledger` to `append_only_advisory` without changing tier
- Full tier + a stage is genuinely small → flip `read_first_cap` to `small` for that stage's prompt
- Full tier + you want token-frugal research → flip `research_mode` to `token_frugal`

Toggles change forward behavior, not history. Re-tier by appending an entry to the override log — see `FRAMEWORK-CONFIG.md` §7.

## 0.3 Why this calibration matters more than the protocol details

The single biggest source of framework abandonment is "the overhead doesn't pay off." That happens when you applied a Full-tier protocol to a Lite-tier project. The protocol works; the calibration was wrong. Tiers exist so that the discipline scales with what the project actually needs.

The single biggest source of framework failure (the opposite problem) is "we silently dropped the discipline because it felt heavy." That's a re-tier signal — drop the tier formally, don't violate the active one. Honest down-tiering preserves the audit trail; silent skipping corrupts it.

## 0.4 What stays the same across all tiers

A small set of rules don't change with tier. They're hard rules in every calibration:

- **Do not commit without explicit human approval** (G1; the most important rule).
- **Do not push to `main`** directly.
- **No `--no-verify`, no silent gate skips.**
- **No telemetry without an ADR.**
- **DCO sign-off on every commit** (`-s`).
- **Cross-stack integration: escalate at iteration 2** (regardless of overall escalation toggle).

Tiers calibrate ceremony, not safety.

## 0.5 Operating mode — all four live (`greenfield` + `bug_fix` + `audit` + `research_publish`)

`operating_mode` answers **what kind of work** this is (orthogonal to tier, which answers *how much ceremony*). It is project-scoped (`project-config.md`), set at calibration by the leading "what kind of work is this?" question, and orthogonal to the session-scoped 3-brain `role` — the SessionStart hook composes the read-first list from both. Most of this playbook assumes the canonical shape, **`greenfield`** — building from a fresh start, organized into milestones with stages.

All four modes are live:

- **`greenfield`** (default) — build something new. Milestones-of-stages; the whole of this playbook.
- **`bug_fix`** — fix a known defect in existing code. Three short phases (Reproducer + impact analysis → minimal fix → single Verifier pass), **no milestones, no closeout**. See **§3.7** for the workflow and `templates/BUGFIX-PHASE-DOC.md` for the phase doc.
- **`audit`** — review an existing codebase for security / performance / architecture / compliance. Inventory → triage → per-dimension passes (per-file sign-off) → fresh-context challenge → consolidation. **No milestones, no Stage V — audit *is* verification.** See **§3.8** for the workflow, `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` + `templates/audit/` for the passes.
- **`research_publish`** — synthesize literature or data into a paper + interactive illustrative app. Hybrid: Phase R (grounded STORM research, always Lite process, mandatory sources registry) → explicit re-tier → Phase A (app at the tier it warrants, inheriting Stage V). See **§3.9** for the workflow, `templates/PHASE-R-DOC.md` for the research task-list, and `templates/INTERACTIVE-APP-SCAFFOLD/` for the app starters.

A pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any `operating_mode` outside the four values; an absent field defaults to `greenfield` (never errors a project that predates the dial). See `FRAMEWORK-CONFIG.md` §4.12.

---

## 0.6 Verification locus — where tests run (`verification_locus`)

A second calibration dimension, orthogonal to tier and operating mode: **where** the test suite executes, and what that costs. The driver is **private-repo GitHub Actions cost** — hosted minutes are metered and macOS bills at ~10× the Linux rate, so a 3-OS matrix on every push burns the free quota fast. Canonical reference: `FRAMEWORK-CONFIG.md` §4.14.

Three values:

- **`cloud`** — the conventional setup: a GitHub-hosted matrix runs on every push/PR. Highest minutes.
- **`local_first`** — the full suite runs locally (Linux-in-Docker + dev-OS-native) at pre-push; cloud runs only on version tags. Near-zero minutes; relies on a self-hosted backstop or honor-system at PR.
- **`hybrid`** (default) — local full suite at pre-push, **plus** one cheap hosted `ubuntu` PR smoke check, **plus** the full matrix incl. macOS on `v*` tags.

**Reconciling with §1.1's "CI enforces."** The load-bearing constraint is that a *non-bypassable* check exists — the second pair of eyes that doesn't get tired. Under `cloud` that's the matrix; under `hybrid` it's the required PR smoke check (`--no-verify` skips the local hook, never a required status check); under `local_first` it's the self-hosted backstop or the release gate. The locus moves; the constraint holds. What changes is that the *bulk* of verification stops paying cloud minutes — it runs locally where it's free.

**Lanes — what each gate runs.** `scripts/verify-local.cjs` carries three lanes over one task registry: **`fast`** (every push, the pre-push hook default) runs the tests the diff affects by the runner's own change scoping, the open milestone's own test files, and every test whose name carries `always` — native leg only; **`stage`** (the stage-end gate) runs the same over the whole milestone diff; **`release`** (closeout, Stage V, version tags) runs every test on every leg and ignores the settled marker. Narrowing is by proof, never by hope: when the stack has no native selection, the base cannot be resolved, or the diff touches a lockfile / CI / runner config, the lane widens to full and says so. Closed milestones' tests are marked settled in `tests/.settled.json` by `/closeout` — after `--reconcile` proves the union (every discovered test is in exactly one of settled / active; the last fast run plus the settled set covers all of them; release passed at this head). A settled test whose module the diff touches runs anyway. The full floor never leaves: it runs at every closeout, so a missed cross-module regression is caught within one milestone, never later. `node scripts/verify-local.cjs --list` prints the lanes.

**The bootstrap flow (greenfield) and the migration recipe.** Standing this up is four phases — run at Phase 0/3 of bootstrap for a new project, or as a one-time migration for a project that arrives with a fat matrix:

0. **Audit (report before change).** Detect stack + test runner; read `.github/workflows/*.yml` (jobs, OS matrix, triggers, test commands); and answer one question from packaging config (electron-builder targets, pyproject/setup classifiers, build scripts, README) — *does this app actually ship to or run on macOS?* Answer yes/no with evidence. Nothing changes until that's answered.
1. **Local harness.** One entrypoint (`scripts/verify-local.cjs`) runs Linux-in-Docker + dev-OS-native in sequence, non-zero on any failure (WSL2 fallback acceptable for the Linux leg).
2. **Mandatory hooks.** `pre-commit` = fast checks (lint + unit subset); `pre-push` = the full harness, blocking the push. Committed under `.githooks/`, activated by `core.hooksPath` (`scripts/install-hooks.cjs` — the one-time setup step, documented at clone). `--no-verify` is a logged emergency override, never a norm.
3. **Trim the cloud.** Remove the ubuntu/windows push/PR jobs (now covered locally); keep one ubuntu PR smoke check under `hybrid`. Move macOS to `v*` tags / release events only. If the audit found no macOS target, drop the macOS job entirely.

**macOS / desktop builds.** A signed + notarized macOS artifact (e.g. Electron) can't be produced on Windows/Linux hardware, so it lives in the tag-triggered `release.yml` — the one bounded place macOS minutes are spent. Most Electron verification (renderer / main-process / IPC) is OS-portable and runs locally; only the platform package is cloud.

**Independent verification** (the Stage V machinery, where the tier runs it) confirms the result with evidence: a deliberately failing test is rejected by the pre-push hook (then reverted); the Docker-Linux and native runs are green on a clean checkout; the trimmed workflow YAML is valid with no push/PR linux/windows cloud jobs; macOS (if retained) triggers only on tags/releases.

---

# Part 1: Philosophy

## 1.1 The three load-bearing constraints

The whole methodology rests on three constraints. Everything else is scaffolding.

**Human reviews; agent implements; CI enforces.** The human reads code, retrospectives, and ledger entries before approval — no exceptions. The agent does code, tests, gate execution, retrospective drafting, and gap-analysis drafting — no human keyboard time on any of it. CI enforces what humans can forget: append-only ledger integrity, gate completeness, branch protection. CI is the second pair of eyes that doesn't get tired. (The *locus* of that enforcing check is set by `verification_locus` — a full cloud matrix under `cloud`, the required PR smoke check under `hybrid`; see §0.6. The non-bypassable principle is unchanged; only where the bulk of verification runs.)

**The audit trail is append-only.** The gap-analysis ledger is immutable once committed. Future entries report status only through a carry-forward channel that references — never edits — prior entries. This is what gives the project forensic auditability years out: "current truth" is one channel; "historical record" is another; they never mix.

**Every increment is gate-bounded.** Linter, type-check, tests, coverage threshold, security audit, and whatever else the stack demands. Gates pass cleanly or the loop halts. No silent skips, no overrides that ship unverified code — `--no-verify` is a logged emergency valve only, and never bypasses the required check (§0.6). The gates evolve over the project's life; the bound never relaxes.

## 1.2 Operating model

The human in this loop is product owner, not pair programmer. They direct via spec, PRs, and one-word approvals. The agent figures out steps; the human approves outcomes. This shapes everything that follows.

**Default to executing, not consulting.** When the next action is clear from prior direction, do it. Surface the outcome (diff, retrospective, gate result) for a single approval. Don't propose options when the choice is obvious. Propose options only when the decision is genuinely the human's to make: scope, priority, or an irreversible architectural choice.

**Don't scope-down based on time or complexity.** Time-box estimates inform staging boundaries, not deliverable size. Write the right scope; the agent handles the volume. The only legitimate scope-reduction trigger is off-the-charts complexity (would require a research project, a new programming language, weeks of single-stage work). Otherwise, design for what's correct.

**Web-search-first for externally-knowable facts.** Pricing, API shapes, library versions, third-party schemas — these change and have authoritative sources. Confirm current state from the web before asking the human or coding to a placeholder. Don't waste a turn on values that need correction later.

**One-command rule for human-side tasks.** When something must happen on the human's machine that can't happen agent-side (fresh-session prompt pastes, OS-specific git operations), give one command, not a flow.

## 1.3 Honest self-assessment

The retrospective is only as useful as it is honest. Self-grade-inflation defeats the loop.

A retrospective that scores 5/5 on every axis with zero friction events is itself a flag. Real work has friction. If the agent self-corrected through 4 rounds when the budget was 3, log it. If a friction event was severity 4, score it 4. The methodology is designed to surface what isn't working — that only works if what isn't working gets recorded.

Honest assessment is a hard rule, not a preference.

---

# Part 2: Structure

## 2.1 The layered model

Four layers. They aren't always articulated cleanly, but the layering is the repeatable part.

**Project.** The whole system. Owns the spec, the architecture decision records (ADRs), the gate matrix indexed by milestone, the immutable gap-analysis ledger, the session register, the style guide, and the gotchas list.

**Milestone (M01, M02, …).** A scoped, branched unit of work. Has a defined entry condition (prior milestone closed) and exit condition (closeout approved + PR opened). Owns a milestone summary, a phase prompt, and a feature branch named by convention (e.g., `claude/m[nn]-<title>`).

**Stage (A, B, C, …, plus closeout).** A fresh-context agent session. Owns a stage CLI prompt and a stage retrospective. Closeout is a special stage that does cumulative review and writes the new gap-analysis ledger entry.

**Step.** A TDD cycle inside a stage — RED → GREEN → REFACTOR → VERIFY → self-correct. No persistent artifact; lives inside the stage retrospective.

## 2.2 Roles

Four roles. The agent runs in **two distinct session types** — orchestrator and build — that never share a session.

**Human.** Gatekeeper, approver, and the serializing conduit. Reads code diffs, retrospectives, and ledger entries before any commit; especially verifies the do-not-commit rule against the git log at PR time. Owns scope and priority calls. Carries surfaces and prompts between the orchestrator and build roles — only one role acts at a time.

**Orchestrator (Claude).** Authors the spec, Phase docs, ADRs, and protocol docs; adjudicates build surfaces; routes Verifier findings; sequences milestones; runs GitHub PR/merge. Runs as fresh scoped sessions. Governed by `ORCHESTRATOR.md` (Full). Drifts across long sessions if unequipped — `ORCHESTRATOR.md` is the manual that prevents the drift.

**Build (Claude).** Implementer, test runner, gate runner, retrospective author. Executes one stage per fresh session from a §X.5 stage prompt. Does NOT decide sequencing, routing, or milestone structure. Drafts everything; commits nothing without approval. Governed by `CLAUDE.md` + its stage prompt; it never reads `ORCHESTRATOR.md`.

**CI.** Append-only enforcer (fails any PR that mutates a prior ledger line). Runs the full gate suite on every push. Catches what humans forget.

The orchestrator decides the steps; the human approves the outcomes; the build executes. The orchestrator/build split is designed: the build machine doesn't drift because each stage is a fresh scoped session; the orchestrator runs long and needs its own discipline. The agent has live context (friction events, ambiguities, self-correction iterations) the human only partially observes — so the agent self-assesses; the human reviews the assessment.

> **Tier note.** The orchestrator/build split is a **Full-tier** construct — separate session types, separate operating manuals, the human conduiting between them. See `ORCHESTRATOR.md` §1 for how the two roles are physically hosted (two CLIs + git worktrees on one machine is the recommended topology). At **Lite** tier the two roles collapse into a single session: small project, markdown task lists, per-PR approval — there is no separate orchestration session and `ORCHESTRATOR.md` is not generated.

## 2.3 Artifact classes

Two kinds. The split is the whole point.

**Living documents.** Edited in place under normal review.

- The execution protocol (this playbook itself)
- The spec
- The style guide
- The anti-patterns list
- The gotchas list
- Architecture decision records (ADRs) — until accepted; immutable thereafter
- The gate matrix
- Prompt templates (stage CLI prompts, retrospective template, summary template)
- The session register
- Project identity / orientation docs
- The framework configuration (`project-config.md` — tier and toggles)

**Immutable documents.** Frozen forever once committed; CI fails any PR that mutates a prior line.

- The gap-analysis ledger *(Lite tier: not generated; use `CHANGELOG.md` instead)*
- Per-stage retrospectives once finalized
- Per-milestone summaries once written
- Accepted ADRs

This separation gives the project two channels — current truth and historical record — that never bleed into each other.

## 2.4 Cognitive load budget — why read-first lists are capped

The read-first list (the files an agent loads at session start) is capped, not open-ended. Three forces drive the cap:

1. **Context dilution.** Every file in the read-first list takes context-window budget. A 12-file orientation read can consume tens of thousands of tokens before any code is written. The agent's working memory for the actual problem shrinks proportionally.
2. **Signal-to-noise.** Files that *might* be relevant get loaded "just in case." Most don't apply to the active stage. The agent has to filter; filtering itself consumes attention.
3. **Marginal value drops fast.** The first 3 files (`CLAUDE.md`, `project-config.md`, the active Phase doc) carry ~80% of orientation value — `project-config.md` holds the tier + toggle values that change agent behavior, so it sits in the core; `docs/identity.md` is a strong #4. Files 4–8 add useful context for medium-complexity stages. Files 9+ are usually defensive. The protocol spine (BUILD-PLAYBOOK / STAGE-PROMPT-PROTOCOL / PROCESS-VALIDATION / persistence-architecture) is deliberately NOT on the list — it moved to the on-demand "reference index" the SessionStart stamp emits, because the validators enforce its schema mechanically and preloading it is redundant with that floor.

The cap should scale with **project size + user expertise + stage complexity**, not be a fixed number:

- Small project + non-expert: 3–4 files (Lite default)
- Medium project + any expertise + routine stage: 5–6 files
- Medium project + non-expert + cross-cutting stage: 7–8 files
- Large project + any + routine stage: 7–8 files
- Large project + any + high-complexity stage: 10–12 files
- **Closeout (any tier):** a **bounded closeout read list** — the append-only ledgers + the milestone's own artifacts + the touched spec sections + the cumulative diff, NOT the whole codebase re-read. Same loud-truncation semantics as any capped list: a closeout read set over the cap truncates *loudly*, it does not silently suspend the cap. The old "read everything / caps suspended" ceremony was retired. The explicit set is enumerated in the closeout protocol below.

The cap is enforced two ways: by the `read_first_cap` toggle in `project-config.md` (truncates lists at session start via the SessionStart hook), and by stage-prompt authoring discipline (don't author a stage prompt with a 15-file `<read_first>` list when the cap is `medium`).

Capping is not laziness. It's the recognition that 12-files-of-orientation hurts agent performance more than it helps. If a stage genuinely needs more, raise the cap (`large`) for the project, or list the cap exception in the stage prompt's `<context>` so the deviation is visible.

---

# Part 3: The loop

## 3.1 Setup (one-time)

Before any code. This is the most underspecified phase in most methodologies and the place most projects die.

**Author the spec.** Iteratively: high-level spec → gap analysis (missing / ambiguous / contradictory / open questions) → resolve → detailed spec → break into phased milestone plan. Treat this as its own loop with the same plan-then-approve cadence as a work stage.

**Stand up the artifact directories.**

- `spec/` — the spec and its iterations
- `decisions/` — ADRs (use a numbered template)
- `prompts/` — stage CLI prompt templates, XML-structured
- `retrospectives/` — per-stage retrospectives + per-milestone summaries + optional trends log
- `docs/gap-analysis.md` — initialize empty, with the append-only rule documented at the top
- `docs/sessions.md` — session register, keyed by milestone/stage
- `docs/style.md` — naming, comments, function design, error handling, project-wide anti-patterns
- `docs/gotchas.md` — numbered list of traps that have bitten or are predictable
- `docs/reference-index.md` — "where things live" navigation table
- `docs/identity.md` — project identity and read-first list

**Write the project identity.** Two short sections: "what this is" and "what this isn't." The negation matters; it kills out-of-scope work before it starts.

**Write the read-first list.** A numbered table with `#`, `File`, `Read for` columns. Prescribes the orientation order for any fresh session.

**Define the gate matrix.** Whatever the stack demands — linter, type-check, unit tests, integration tests, coverage threshold, security audit, dependency policy, fuzz, E2E. Index the matrix by milestone; gates evolve over the project's life. A single doc the agent reads to know which gates are live for the current stage.

**Name the retrospective axes — three of them.** Recommended set: Process (did the workflow work?), Product (did the artifact meet standards?), Pattern (does this generalize to remaining stages?). Each axis gets ~5–10 specific questions in the retrospective template.

**Define the scoring ladder.** 1–5 per question.

- 5 = no friction; protocol worked exactly
- 4 = one minor friction event
- 3 = multiple friction events; pattern needs revision
- 2 = significant gaps in protocol
- 1 = protocol failure

**Define hard and soft gates and the verdict outcomes.** See Part 4.4 for the canonical set and outcome matrix.

**Write Definition of Done.** Per-stage and per-milestone, as explicit checklists. Don't rely on "all gates green plus your approval" as implicit.

**Decide branch protocol.**

- Naming convention (e.g., `claude/m[nn]-<title>`)
- Squash-merge vs merge-commit (per-PR call; squash for small/single-concept, merge-commit for milestone PRs with valuable per-stage history)
- Tag-on-merge policy
- Never force-push to `main`
- Delete merged branches

**Initialize the gap-analysis ledger as empty.** Add the append-only rule to the file's preamble. Set up CI enforcement via the shared `append-only-ledger.yml` workflow (it runs `validators/check-append-only.cjs`; run the checker locally if there's no CI): prior committed content must remain a CRLF-normalized prefix of the working tree; any modification fails.

**Initialize the session register.** Single file (`docs/sessions.md`) keyed by milestone/stage with session URLs. Five minutes of setup; becomes a forever forensic jump-off.

## 3.2 Per-milestone start

- Branch off `main`: `git checkout -b claude/m[nn]-<title>`
- Confirm clean working tree
- Read prior milestone summaries
- Read the most recent gap-analysis carry-forward section
- Draft the milestone phase plan: which stages (A, B, C, …), what each produces, exit conditions
- Get human approval on the phase plan before opening Stage A

## 3.3 Per-stage — work stages (A, B, C, …)

### Pre-flight

- Fresh agent session (clear context — prior history is noise)
- Confirm working tree clean
- Confirm orientation files present (the playbook + project identity + read-first list + style + gotchas)

### Read-before-write (Stage B onward)

- Read every prior stage's "Decisions for the next stage" section in their retrospectives
- Read the most recent gap-analysis carry-forward section
- Apply those decisions — that's why they exist

### Execution

> Every human step in this loop is held to the standard of **one paste or one line** — stated once, at its home, in `STAGE-LOOP.md` (Setup). A ceremony step that needs a second window is a kit defect to fix, not a step to document around.

- Paste the structured stage CLI prompt. Stage prompts are XML-structured and live inside fenced code blocks within each milestone's Phase doc (`docs/build-prompts/M[NN]-*.md`). The schema for work-stage and closeout-stage prompts (which have different required slots) is defined in `prompts/STAGE-PROMPT-PROTOCOL.md`; bare templates live at `prompts/WORK-STAGE-TEMPLATE.md` and `prompts/CLOSEOUT-STAGE-TEMPLATE.md`. The markdown wrapper of the Phase doc is for human planning and review; the XML inside the fenced blocks is what gets pasted into a fresh agent session.
- Agent reads context + prior stages + referenced spec/ADRs
- **Agent states deliverable + test plan before any code, waits for human confirmation** *(gate 1: plan-approval)*
- Human confirms or revises the plan
- Agent copies retrospective template → `retrospectives/M[NN].<X>-retrospective.md`, fills `[LIVE]` rows during work
- TDD micro-cycle per step (Part 3.5)
- **Red-stop (gate 2; default-on at Full, `red_review: off` to disable):** after the tests are written and confirmed failing for the right reason, the agent STOPS, surfaces the test files + failing output, and waits for the human to approve the *test design* before implementing to green. This is the third approval gate — the per-stage loop is **plan-approval → red-approval → stage-end** when the toggle is on (two gates when off). It catches shallow or wrong-contract tests at the cheapest moment, before implementation locks them in; it matters most when the build runs on a weaker model. See `STAGE-PROMPT-PROTOCOL.md` `<await_red_approval>`.
- All gates green; zero warnings, zero skips, no `--no-verify`
- Self-correction loop: max 3 iterations; if still failing, surface (Part 4.3)
- **App-Map delta (close-gate deliverable, when `app_map: on`):** the build session writes only the **delta** for surfaces this stage touched — new/changed `docs/app-map.md` entries + a "what's new this stage" line (the `<app_map_delta>` element in the Phase doc). It does *not* reconcile the whole map (that's closeout's job). If the stage touched a surface-source path with no UX change, the omission is logged with an `app-map-unchanged: <reason>` token — never a silent skip.
- Agent fills `[END]` retrospective: three-axis scoring + threshold gates + decisions for next stage

### Approval surface *(gate 3: stage-end)*

- Agent reports (in order):
  1. **cross-machine state**: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md` — closes the cross-session-blindness gap when an orchestration session on a different machine reads the surface
  2. diff stat
  3. gate results
  4. retrospective
  5. draft commit message
- **Agent does NOT commit, does NOT push, does NOT open PR**
- Human reviews two artifacts: code diff + retrospective
- Human especially verifies: did the agent actually NOT commit before approval? (G1 hard gate; check git log)
- On approval: agent commits with DCO sign-off + Conventional Commits + session URL in trailer
- No push between stages
- Agent updates `sessions.md` with the session URL
- Fresh session for the next stage (no carry-over context)

## 3.4 Per-stage — verifier (between last work stage and closeout)

> **Tier note.** Required at Full (`verifier_mode: pass_2_4`; `pass_1_2_3_4` by explicit choice). Optional at Lite (`pass_1_only`). The bug class Verifier catches (tests pass; contract doesn't) is tier-independent; what scales by tier is the *intensity* of verification, not whether it happens.

A fresh-context contract-fidelity check. Distinct from closeout (cumulative review) and from work stages (TDD code production). Runs after the last work stage commits, before closeout opens.

### Why this stage exists

Work-stage retrospectives evaluate process drift. Closeout evaluates cumulative product↔spec at high level. Neither catches the class of bug where every static check is correct but the running thing is broken (CSS class string correct + no CSS rule shipped; field reference correct + wrong field name on the consumer side; single-call test passes + state-machine breaks on second call). The work agent has confirmation bias; the closeout agent has retrospective context that primes the same bias. A fresh CLI session with a deliberately narrowed read list — phase doc + spec + code + gate matrix, **no prior retrospectives** — asks "does this do what was promised?" without bias.

### Seven passes

1. **Inventory.** Every "ship file X / modify file Y" claim in the phase doc → file exists, basic shape matches. Cheapest pass; catches "we forgot to ship the CSS file." **`pass_1_2_3_4` (and Lite) only.** Under the Full default (`pass_2_4`), §X.2 is advisory rails, not a contract (the build may deviate with a one-line note), so there's no inventory contract to drift-check and this pass is skipped — the freed effort goes to behavior + design + security. (A literal "forgot a whole file" still surfaces in the Hooks and Behavior passes when the wire or the running thing is missing.)
2. **Hooks.** Every wire claim → 5-step data path trace (spec claim → source event → projector → consumer wire → verify consumer reads what projector writes). Step 4 finding "no consumer" or "ambiguous consumer" is 🔴 by default — forces the build agent to fix the wire or file an ADR explaining why the projection is unused.
3. **Multi-call invariants.** Every public API / IPC method / Tauri command → assert called twice in sequence works. Catches single-use leaks, state-machine bugs, race conditions.
4. **Behavior.** Runtime / visual / DOM checks via a project-provided harness (Vitest+jsdom, headless Tauri, equivalent). The framework requires the harness to exist (named in `docs/gates.md`) for Pass 4 to enforce. If absent, Pass 4 surfaces 🟡 with explicit "no harness" caveat in findings. **For `deliverable_type: web`, Pass 4 additionally requires a literal observed-running step — not just "the test suite passed":** open the running app in a fresh browser (or headless via Playwright), confirm it loads with no console errors, perform one primary user interaction, and record the outcome (screenshot or console capture) in the findings. "Tests green" is not sufficient evidence the app runs — the broken-todo failure passed every unit test. No web milestone signs off without observed-running evidence.
5. **Design conformance (`deliverable_type: web` only).** Fresh-context agent opens the running deliverable, screenshots it, and compares against `docs/design.md`: are the color/spacing/type tokens used (not raw values)? Is there visible typographic hierarchy? Do the Do's/Don'ts hold? Does it meet the contrast target? Findings list each §2–§8 area as conforming or with a specific deviation. Same fresh-context bias guard as the other passes — this agent reads `design.md` + the running app, not the build's reasoning.
6. **Security (Full).** A mechanical floor plus deliverable-type judgment. *Mechanical (always):* dependency audit (`npm audit` / `pip-audit` / `cargo audit` — whatever the stack provides; named in `docs/gates.md`) and a secret scan (`gitleaks` or equivalent) over the diff. High-severity advisories and any committed secret are 🔴. *Judgment (scales by tier):* attack-surface review against the deliverable type — web: XSS/injection/CSRF, unsafe `innerHTML`, auth on state-changing routes; service: authz on endpoints, input validation, rate limits; library: unsafe deserialization, injection in public APIs; cli: arg/path injection, shelling out. Findings cite file + line. The mechanical floor runs even when judgment is shallow (the weak-model case).
7. **Code quality (Full).** Integrates the `/code-review` skill where available; otherwise a manual pass. Flags dead code, duplication, excessive complexity, leaked TODO/FIXME added vs resolved, and tests that assert implementation rather than behavior. Severity: most findings are 🟢 (tech-debt ledger) unless a complexity/duplication hotspot is load-bearing on the milestone's critical path, then 🟡. This pass tunes quality without blocking on taste — 🔴 only for genuinely broken (not merely ugly) code.

Tier defaults: Lite = Pass 1 only. Full = Passes **2 + 4 + 6 + 7** (no inventory — §X.2 is advisory under `pass_2_4`; + Pass 5 if `deliverable_type: web`). The explicit `pass_1_2_3_4` escalation adds Passes 1 + 3 (+ project-specific passes from the gate matrix under `pass_1_2_3_4_plus`).

**App-Map as the drive/test script (when `app_map: on`).** The Verifier does not author `docs/app-map.md` — it *uses* it. For the observed-running pass (Pass 4 for `ui`; the run-it equivalent for `command`/`endpoint`/`api`), the map is the IRL script: read it first, then for each surface this milestone touched run the listed How-to-exercise steps and confirm the gesture reproduces live. **A map entry whose gesture doesn't reproduce is a finding.** This closes the honor-system IRL gap (`STAGE-LOOP.md` step 16): the Verifier no longer needs the human to *ask* whether an IRL test exists — the script is the map. The map is type-agnostic, so this holds for every drivable surface class, not just web.

### The plan-challenge pass (required)

Beyond verifying the *stated* criteria, every Verifier stage runs a **plan-challenge** pass: it derives its **own** threat model and asks *"what dangerous properties did the plan and acceptance criteria leave unproven?"* — the critic deliberately not inheriting the planner's blind spots (imagine a backup feature whose restore test rolled back correctly but never proved the restore stayed inside its target directory — because **confinement** was never named). It is a **required `<pass name="plan_challenge">`** in the `<verifier_stage_prompt>` schema; a verifier prompt without it fails schema validation. **Bounded:** the challenge is **anchored on the declared risk matrix** — which of the declared nine properties did the plan leave unproven — not open-ended threat-invention. The pass carries the **standing escape catalog** (the ~10 hunts codified in `STAGE-PROMPT-PROTOCOL.md` §8.5: an `n/a` that's false; a prose-dodged count; assert-a-constant / always-matching-snapshot / mock-only; a forged ledger that still reconciles; a stub that passes "assembled"; an under-declared trigger; a toy-path confinement; a bare-`startsWith`; a dropped fence caveat; did the milestone follow the gate-design contract). **B↔C coupling:** the schema floor only checks the pass *exists* (a hollow pass warns, doesn't block); whether it *catches* defects is proven by the seeded-defect calibration (G14) — see §3.4's note.

### The calibration self-test (required — G14)

The plan-challenge *runs*, but nothing yet proves it *works* — a verifier that misses a planted defect still reports "Sound." So every Verifier stage **opens** with a **calibration self-test**: it runs its plan-challenge against the **seeded-defect calibration set** (`prompts/calibration/` — one fixture per §8.5 escape class, each with a sealed ground-truth label) and must catch **every** seed — **false-negative rate (FNR) = 0** — *before* its real findings count. This is **defect-seeding / bebugging** applied to the judgment layer (measure the reviewer by the seeded faults it catches), scored by the FNR (LLM-as-judge meta-evaluation). It is a **required `<pass name="calibration_self_test">`** — a verifier prompt without it fails schema validation — and the adversary-side analog of G9's mutation-kill (the floor is proven by mutating a validator; the adversary is proven by seeding a defect the verifier must flag). The result (seeds caught / FNR) is recorded as a `calibration` evidence block in the findings.

**The seal.** The verifier reads `prompts/calibration/fixtures/` during the challenge; it **never** reads `labels/` (the sealed answers). If the answer sat beside the fixture, FNR = 0 would prove nothing.

**Honest locus (G14, non-negotiable).** `validators/validate-calibration.cjs` is the **static floor only** — it proves the set exists + shadows the full catalog, is labeled + sealed, and that the self-test is **wired**. The **catch is agent judgment recorded at V-time as the FNR**; it cannot run in a pre-commit hook (you can't run a judge in a smoke test). Floor (present + wired) + adversary (the recorded FNR) = a real gate; neither alone is. If the verifier's own FNR > 0, the verifier-proof worked: a verifier that can't catch its own seeds cannot be trusted to have reviewed the real work — stop and reassess (`merge_gate` structural signal).

### Findings + the D.fix loop

Each pass produces numbered findings at 🔴 (blocks merge) / 🟡 (carry forward to next milestone's Stage A) / 🟢 (append to `docs/tech-debt.md`). Findings file: `retrospectives/M[NN].V-findings.md`. Required top-of-file coverage caveat names which passes ran, which didn't, and which bug classes are therefore NOT checked — keeps users from reading "Verifier passed" as broader coverage than the tier provides.

🔴 findings trigger a **D.fix stage** (a work stage scoped to the finding). After D.fix commits, Verifier re-runs. Bounded iteration: **max 2 D.fix rounds per milestone**; third 🔴 round escalates to maintainer rather than continuing. **Structural signal**: if D.fix introduces a 🔴 outside the originally-scoped finding, the fix is broader than the bug — stop iterating, consider re-tiering the milestone scope.

### Interpretation waivers

When V finds 🔴 but the build agent disputes on interpretation grounds (e.g., spec says "spend" — ambiguous between session-total and per-call; build agent picked per-call, V claims session-total is right), the build agent files an ADR at `docs/adr/NNNN-waiver-M[NN]-finding-N.md`. Maintainer adjudicates (Sound / Sound-but-rough / Not-sound). Sound → finding downgrades to 🟡 or closes. Not-sound → 🔴 stands, D.fix required. The waiver IS an ADR — same Proposed/Accepted lifecycle, same immutable-once-accepted machinery, no parallel artifact class.

### Approval surface

Per `<approval_surface>` in `<verifier_stage_prompt>`: cross-machine state → per-pass summary (N inventoried, N hook traces verified, N invariants tested) → findings list sorted by severity → retrospective `[END]` (brief — no work axes; just "did the verification surface what it should") → recommendation: proceed to E / open D.fix / file waiver / re-tier → "I will not commit until you approve."

---

## 3.4.5 Per-stage — refactor health check (Stage R)

> **Tier note.** Trigger-based at Full (`refactor_mode: trigger_n5`; `trigger_n3` by explicit choice); skipped at Lite (`refactor_mode: skip`). Schema: `STAGE-PROMPT-PROTOCOL.md` §8.6.

A second fresh-context stage **parallel to Stage V**, asking **"is the code maintainable?"** instead of "did the code do what was promised?" It catches the bug class neither V (contract fidelity, not code shape) nor closeout (narrative deep-dive, where structural drift hides) surfaces: duplicate helpers overdue for extraction, complexity creep, dead code, dependency drift — assessed against the **cumulative codebase** since the last Stage R, not just this milestone's diff.

### When it triggers

At each milestone boundary (after the Verifier pass), check `refactor_mode`'s trigger: run Stage R when `docs/tech-debt.md` has ≥ the threshold count **OR** the milestone interval has elapsed, **whichever comes first** (`trigger_n5`: ≥5 entries / every 3 milestones; `trigger_n3`: ≥3 / every 2). The count reacts to actual debt; the interval is the fallback so a codebase nobody's logging debt for doesn't defer Stage R forever. Thresholds are data-tunable hypotheses (`FRAMEWORK-CONFIG.md` §4.11). Stage R **reads** `docs/tech-debt.md` for the trigger count and **appends** its 🟢 findings to it (append-only).

### Fresh-context bias guard — stricter than V

Stage R runs in a fresh `refactor`-mode session (write `refactor` to `.claude/role`; the SessionStart hook loads `read-first-list-refactor.txt`). That list omits prior retrospectives **and prior R findings** — one step beyond V's guard. Reading the last R run primes "we already cleaned this up"; a genuine structural assessment needs neither the retros that justify the code nor the previous health check.

### Three passes

1. **Duplication.** ≥3 similar code blocks overdue for extraction ("wait for the fourth" → acceptable at 2, flagged at 3+).
2. **Complexity.** Functions over the cyclomatic (default 15) or length (default 80-line) threshold. Needs a linter integration named in `docs/gates.md`; else manual analysis flagged 🟡.
3. **Drift.** Dead code (no callers), dead dependencies (no imports), version drift (multiple versions of one package), schema drift (generated types vs. source-of-truth).

Tier-conditional: Lite skips; **Full** runs Duplication + Drift (Complexity only if a linter is named); all three + project-specific passes from `docs/gates.md` is the explicit escalation.

### Findings + the D.refactor loop

Numbered findings at 🔴 (rare — blocks the next milestone PR, only when the issue compounds per-milestone or risks data loss/security) / 🟡 (open a D.refactor stage before the next milestone) / 🟢 (append to `docs/tech-debt.md`). Findings file: `retrospectives/M[NN].R-findings.md` (template: `templates/REFACTOR-FINDINGS-TEMPLATE.md`), with the mandatory tier-coverage caveat. A 🔴 opens a **D.refactor** stage scoped to the finding; **the Verifier re-runs first** (confirm the refactor didn't break contracts), **then Stage R re-runs** (confirm the structural issue closed). Max 2 D.refactor iterations per milestone; the third escalates. Structural signal: a D.refactor introducing a 🔴 outside the original scope means the refactor scope was wrong — stop and reassess. Hard gate **G7** (§4.4) verifies Stage R ran with fresh context when triggered. Interpretation disputes file a waiver ADR at `docs/adr/NNNN-waiver-M[NN]-R-finding-N.md`, same machinery as V.

---

## 3.5 Per-stage — closeout

> **Tier note.** Full closeout (cumulative read + gap-analysis entry + three-artifact review) is the **Full-tier** ceremony. **Lite** projects close milestones with a one-paragraph "what shipped, what's deferred" entry in `CHANGELOG.md` and the milestone PR's description — no append-only ledger, no cumulative spec re-read. If your tier is Lite and this section feels heavy, that's the signal it doesn't apply.

The last stage of every milestone. Same shape as a work stage, different deliverable.

### Pre-flight

Same as a work stage.

### Cumulative reads — the bounded closeout read list

An **explicit, enumerable** list, not "read everything" — the cap is not suspended; it is replaced by this bounded set, read under the **same loud-truncation semantics as any capped list**. If the set exceeds the cap for the tier, it truncates *loudly* (the SessionStart stamp names what dropped), never silently.

- The append-only **ledgers**: `docs/gap-analysis.md`, `docs/tech-debt.md`, `docs/off-track-log.md` (plus `CHANGELOG.md` + `docs/release-state.md` where the project tracks its own releases)
- The **milestone's own artifacts**: this milestone's Phase doc, its per-stage retrospectives, the Stage V findings, and the new milestone summary
- The **cumulative diff** for the milestone (what shipped since the last closeout) — reviewed for the deep-dive, rather than re-reading the entire codebase
- The **spec sections the milestone touched** (end-to-end read of those sections, not the whole spec)

### Deliverables

- `M[NN]-summary.md` — aggregates per-stage retrospectives, scores axes across stages, marks verdict
- **The full floor, the test-estate review, and settled marking:** `node scripts/verify-local.cjs --lane release` (every test, every leg — a green `fast` lane is not closeout evidence), then `node scripts/verify-local.cjs --reconcile M[NN]` — the three union-pin proofs plus the **test-estate review** section (discovered / settled per milestone / active / always-tagged / selection mode), numbers seeded from the run and pasted into the closeout packet, never typed. Only after the three proofs print does `--reconcile M[NN] --write` mark the milestone's tests settled in `tests/.settled.json`; the marker is committed with the gap-analysis entry. A settled test is a state (its milestone closed, nothing since touched its module), never a judgment; it runs again the moment a diff touches it or a later stage re-declares its module.
- New entry appended to `docs/gap-analysis.md` with **six required sections, none omitted** (write "None observed." rather than omit):
  1. **Codebase deep dive** (200–500 words): cumulative narrative — what's solid, structurally weak, surprising
  2. **Adherence to spec**: ✅ matches / ⚠️ deviates / ❌ contradicts — file:line on BOTH sides (spec § + code path:line)
  3. **Spec review** (forward-looking): missing items, contradictions, ambiguity, open questions, recommended spec changes
  4. **Fix backlog**: 🔴 Critical (blocks next milestone) / 🟡 Important (this release cycle) / 🟢 Nice-to-have — code AND spec items; severity is non-elastic
  5. **Carry-forward**: status of every unresolved prior item — resolved / still open / deferred. Never edit prior entries; reference them only
  6. **Sign-off** with timestamp
- **App-Map reconcile (when `app_map: on`):** closeout reconciles the **whole** `docs/app-map.md` — confirms no surface shipped this milestone is missing an entry, that each `verified` entry still cites a live test-id, and **refreshes the `as-of-commit` stamp** to the milestone's tip. This is the cumulative counterpart to the build session's per-stage delta (the same per-stage-vs-cumulative split as retrospective → summary, gotchas live-log → graduation); the build stage writes only its delta, closeout owns the map as a whole.
- **Human-drive consumption (Full tier, armed when the spec carries the three-part IRL/HITL plan):** the closeout retrospective **consumes** the spec's IRL/HITL plan section — a human-drive checklist derived from the milestone's App-Map delta + the spec's part-A drive moments, with the human's answers **typed** into the retro's fenced `human-drive` block (`drove:` / `verified:` / `recorded:`) **before the friction stamp counts**. Enforced by `validators/validate-retrospective.cjs` (closeout retros only; arming detection shared with the presence floor via `validators/lib/irl-plan.cjs`; a **visible n/a** when unarmed — Lite, section-less, or no `project-config.md`). This is the consumer the plan section was missing: Phase 1 authors the schedule of human obligations; this block is where the milestone proves a human actually met them — the failure it closes is a milestone that ships green with no human ever running the app.
- **Count reconciliation + evidence retention (Full tier):** every **headline count** the closeout / `CHANGELOG.md` entry states ("N findings graduated", "M fixed", "K mutants killed", "P commits scanned") is written as a fenced `reconcile` block (claimed · source · pattern) and **recomputed from the named ledger / status-log / git-log** by `validators/validate-reconciliation.cjs` — **a stated count that does not recompute fails the closeout.** Any assurance verdict in the milestone's verifier/audit findings likewise retains a reproducible `evidence` block (command · pattern/mutation set · result). This is the structural form of the "reconcile its own counts or fail" rule, made a gate. **Honest limit:** the validator is presence-gated (a count in prose, or under an unrecognized key, escapes it); Stage V's plan-challenge is the adversarial backstop that confirms every stated count is reconcile-bound.
  - **Absolute-SHA ranges for `source: git` reconcile blocks.** A `reconcile` block's `range:` must cite an **absolute commit SHA** base (`<sha>..HEAD`), never a **mutable local ref** (`main..HEAD`). A block that cited `main..HEAD` recomputes to **0** on any clone whose local `main` has caught up to those commits (a fresh clone / CI / **post-merge**), false-blocking every later commit that stages the `CHANGELOG.md` — and since even the topmost block can be a mutable-ref range, position-scoping does not save it. `validators/validate-reconciliation.cjs` **scopes the `source: git` recompute by range PORTABILITY**: file mode recomputes only portable blocks (absolute-SHA base / HEAD-anchored) and skips a mutable-ref range; staged mode recomputes the added block(s) **and blocks an added mutable-ref range** (this rule, made a gate). So citing an absolute SHA is enforced going forward, and frozen mutable-ref blocks are never re-litigated against today's git state.
- **Release-state climb + honest rework (Full tier):** the closeout records the milestone's place on the **release-state ladder** in the append-only `docs/release-state.md` (a `milestone-complete` entry, citing the gate it passed), and writes the milestone's **rework count across the four fixed types** — implementation corrections / verifier iterations / IRL reversals / post-merge discoveries (DORA's 5th metric, project-internal) — which `validators/validate-transition.cjs` (G15) **reconciles against the fix-commit evidence**: a total that under-reports the fix commits, or a "0 rework" claim while fix commits exist, fails the closeout. See §"Release-state ladder" below.
  - **Absolute-SHA ranges + fetch-first merge-base for `source: git` rework blocks (G15 — the rework edition of the reconcile rule above, stricter).** A `` ```rework `` block's `range:` must cite an **absolute commit SHA** base (`<sha>..HEAD`), never a **mutable local ref** (`main..HEAD`) — so **`git fetch origin <main>` first**, then cite that `git merge-base origin/main HEAD` **as an absolute SHA**. `validators/validate-transition.cjs` scopes **both** the base-currency check **and the git recompute (hence the under-report teeth) to STAGED-ADDED blocks** — file mode runs only the static shape checks (four-type breakdown present, integer values, source present). This is **stricter than the reconcile edition**, which keeps *portable* git blocks recomputing file-wide: a reconcile `pattern:` is **milestone-anchored** (`^M16\.` — future M17 commits don't match, so an absolute-SHA range's match set is frozen as HEAD advances), but a rework `pattern:` is **fix-shaped** (`fix`, `[A-Z]-fix|PC-[0-9]`), so a later in-range fix commit **inflates** a frozen block's `<sha>..HEAD` recompute past its honest total → a false under-report one turn later. The git recompute is therefore sound only at the block's **own authoring moment** (the staged-added gate, where `<base>..HEAD` is bounded to that commit); a frozen block is never recomputed. A **staged-ADDED mutable-ref range is blocked** ("cite an absolute-SHA base", this rule made a gate). This replaces an earlier topmost-scoping approach, which went **stale post-merge**: after an M-merge the merge-base advances, so the frozen-but-still-topmost prior block's (correct-at-its-commit) base disagreed with the live merge-base and re-flagged — `validate-transition CHANGELOG.md` exited 1 on a current clone. **Honest limitation (unchanged):** a **local pre-commit cannot fetch** — an **absent/unresolvable** `origin/main` yields no base check (fail-soft), and the **CI/pre-push fetch is the backstop**. Net: the durable `range:` cite is gate-forced honest at authoring, and frozen rework blocks are never re-litigated against a range that grows with history.

### Append-only verification

- Local check (`validators/check-append-only.cjs`): prior committed content must remain a CRLF-normalized prefix of the working tree
- CI job (the shared `append-only-ledger.yml`, which runs `validators/check-append-only.cjs`) fails any PR that mutates a prior line

### Gap-analysis cadence — `gap_analysis_cadence`

`per_release` (**the Full default**) writes only the milestone summary + `CHANGELOG.md` at intermediate closeouts and appends the cumulative gap-analysis entry once, at the **v1-release** closeout — where the carry-forward summarization actually earns its cost; intermediate closeouts skip the six-section ledger entry and the summary + CHANGELOG carry the forensic role at lower fidelity until release. `per_milestone` (an explicit-choice escalation) writes a full gap-analysis entry at every milestone close.

### Approval surface

The review surface scales with tier so closeout feels like one approval, not ten:

- **Full (4 items):** (1) cross-machine state + code diff stat, (2) gate results, (3) the stage retro `[END]` incl. the user friction stamp, (4) draft PR. The milestone summary, gap-analysis entry (when `per_release` and it's release time), and CHANGELOG are produced as artifacts but not surfaced for individual line-by-line approval — the user spot-checks them via the PR.
- **Full (full surface):** all of — cross-machine state, new gap-analysis entry text, ledger diff (proves append-only), milestone summary, draft PR description, draft commit message. Flagged "this entry is IMMUTABLE once committed"; human reviews the three artifacts (code diff + retrospectives/summary + gap-analysis); pushback on any blocks the PR.

### v1 boundary review (every milestone closeout, all tiers)

Before moving on, surface the explicit choice — **never silently default to "continue":**

> Milestone M[NN] is closed. Three options: **continue** to M[NN+1] / **ship v1 here** and roll the remainder to a v2 backlog / **pause** to re-tier. Which?

This is the ship-now off-ramp. Projects overrun because continuation is the unstated default; making the choice explicit at each close is the cheap fix.

**Off-track check at closeout (the full path — every milestone closeout, Full; gate G8).** Before surfacing the continue/ship/pause choice, re-read `docs/backlog.md` against everything shipped to date and run the full off-track check. Re-confirm the ranking still reflects the user's priorities (do **not** re-rank it yourself — flag a stale ranking for the user). Then ask: was the highest-priority story that is *unblocked and in scope* the one this milestone built? A **standing unjustified inversion** — a lower-ranked story built ahead of a higher-ranked backlogged one, with no build-sequence necessity recorded in `docs/off-track-log.md` — **blocks the milestone PR under `off_track_check: enforced`** and is **surfaced as a warning under the Full default (`advisory`)**. Resolve it the same way as the per-stage path: an explicit user re-prioritization (human-ratified, override-logged) or a logged justification. Any backlog edit is HITL co-authored (G8 clause b) — the agent proposes, the human ratifies; it is never folded silently into the closeout commit. This augments the v1-boundary review: closeout already asks *continue / ship / pause*; the off-track check adds *"and is the next thing the right thing?"* to the same surface.

- On approval: commit ledger entry (final commit on milestone branch); first push of the branch (`git push -u origin claude/m[nn]-<title>`); draft PR description surfaced; PR opens only on explicit human ask

### Release-state ladder (Full tier)

A "released" claim is the most load-bearing transition a project makes, and undifferentiated it can hide unsigned binaries, untested installers, and unverified platforms. So "released" is decomposed into a **six-state ladder** of **separately-gated** transitions, recorded in the append-only `docs/release-state.md` (which joins the `append-only-ledger.yml` LEDGERS set). A state may not be claimed until the prior state is recorded and the named gate passes:

1. **stage-complete** — a stage's acceptance criteria met, committed on the milestone branch (gate: the stage gates + the retro `[END]`).
2. **milestone-complete** — the milestone closed out, Verifier Sound, count + rework reconciled (gate: Stage V + Stage E).
3. **internally-usable** — the assembled product runs end-to-end for the team (gate: assembled-execution, G10).
4. **source-release-ready** — the source tree is releasable: license, README, no secrets, clean build (gate: the full local matrix + secret scan).
5. **packaged-release-ready** — distributable artifacts built and **SLSA-attested** (gate: `release.yml` builds + **cites its SLSA build level**, ≥ L2).
6. **public-distribution-ready** — cleared for public distribution (gate: the capability-triggered independent whole-product review when triggers are declared, + the SLSA cite — G16).

**The release end is SLSA-mapped.** States 5–6 cite their [SLSA build level](https://slsa.dev) — the default floor is **Build L2** (free `actions/attest-build-provenance`: artifact↔build-instructions, Sigstore-signed, transparency log); **L3** (the reusable-workflow generator, signing key isolated from build steps) is the documented upgrade. So the transition that says "distributable" is the one that proves provenance.

**Atomic transitions.** Every durable-state transition the framework makes — the `.claude/role` / `.claude/stage-active` markers, the ledger writes, the stage-active files — uses **write-temp-rename** (write a temp file → atomically rename it over the real path), never truncate-then-write. `validators/validate-transition.cjs` (G15) blocks a direct truncating write of a durable-state path. Fail-safe by construction.

**Honest rework.** Rework is counted across the **four fixed types** (implementation corrections / verifier iterations / IRL reversals / post-merge discoveries — DORA's 5th metric, project-internal) and **reconciles** against the fix-commit evidence (G15). No transition reports "0 rework" while fix commits exist; the fix-commit count is a lower bound, so honest over-reporting passes and only under-reporting blocks.

## 3.6 Per-step — TDD micro-cycle

Inside every work stage, every behavior change runs through this cycle. Target 5–15 minutes per cycle. If a cycle is longer, the test is too big — split it.

- **RED.** Write a single failing test that captures the next bit of behavior. Run it. Confirm it fails for the *right reason* (the assertion you care about, not a typo, not a missing import, not a skip).
  - **Hard-fail on missing exports.** If the production function doesn't exist yet, the test must fail with `cannot find function X` / `unresolved import` / `module not found` — never silently skip, never tautologically pass via mocking around the gap.
- **GREEN.** Write the minimum code that makes the test pass. Not the cleanest. Not the most general. The minimum.
- **REFACTOR.** With the test passing, clean up. The test pins behavior; refactor freely.
- **VERIFY.** Run the full gate suite. All green.
- **Self-correct on failure** (Part 4.3): max 3 iterations; surface to human if still failing.

### What counts as a real test

- **Asserts something specific.** A test that calls a function and doesn't assert anything is decoration.
- **Fails when production code is wrong.** Verify by mutation: try breaking the production code; confirm tests fail.
- **Doesn't tautologically restate the implementation.** Tests assert behavior the user observes — error cases, edge inputs, boundary conditions, integration outcomes — not internal structure.
- **Reproducible.** No reliance on wall-clock time, network, or random seeds without explicit seeding.

### Behavior tests vs implementation tests

- **Behavior tests** assert what the user observes (drives UI, exercises integration boundaries, confirms domain outcomes).
- **Implementation tests** assert how code works internally (calls this with that argument, sets this state).
- **Both are needed.** Heavy on behavior tests at integration boundaries and user-visible surfaces; heavy on implementation tests for pure-logic modules.
- **A test suite that is 90% implementation tests is a smell.** It means tests cover the code that was written, not the contract the code was supposed to satisfy. Add behavior tests until the suite catches a class of bug pure unit tests would miss.

### Coverage discipline

Once a module reaches a measured coverage baseline, future stages can't regress that module below the baseline without a retrospective entry recording the reason. Codifies "don't make things worse." Per-module baselines for safety-critical paths; aggregate threshold for the rest.

## 3.7 Bug fix workflow (`operating_mode: bug_fix`)

> Applies only when `operating_mode: bug_fix` (`project-config.md`). A bug fix is **not** a small greenfield build: the discovery questions differ (reproducer / affected surface / blast radius — not "what to build"), the deliverable differs (a regression test + a minimal patch, not milestones-of-stages), and the rhythm differs (run once, surface once, land). It reuses the existing primitives — the work and verifier stage-prompt schemas, the SessionStart hook, the do-not-commit rule — with **no new schema**.

**Shape: three phases, no milestones, no closeout.** The whole fix is `templates/BUGFIX-PHASE-DOC.md`, one PR.

1. **Phase A — Reproducer + impact analysis** (`role: work`). Write a regression test that reproduces the bug and **fails for the right reason** (G_BUGFIX_A1) — the assertion about the buggy behavior, not a setup error or a skipped test. Run a fan-out grep across the names / fields / types involved; surface every file touching the affected surface. Produce the **impact-analysis list**: the existing tests to re-run after the fix. This list is the shared lane mechanism, not prose: `node scripts/verify-local.cjs --lane stage` computes it — the runner's own affected selection over the fix's diff, plus the always-tagged guards — and every mode gets the same "which tests to re-run" contextually (§0.6 Lanes); the Phase-A list adds only what the grep found that the import graph cannot see. This is the TDAD differentiator — the contextual "which tests to re-run" that helps a smaller model far more than a bare "do TDD" instruction.
2. **Phase B — Minimal fix** (`role: work`). The smallest change that turns the regression test red→green. **Scope lock (G_BUGFIX_B1):** no unrelated refactors, no "while we're here" cleanups; out-of-scope improvements append to `docs/tech-debt.md` (or `CHANGELOG.md` at Lite), never folded in. Re-run the Phase-A impact list (`--lane stage` plus the grep additions) — all green.
3. **Phase C — Verifier (single pass)** (`role: verifier`). One Stage-V pass on the changed surface: Hooks (5-step data-path trace), + Behavior if a harness exists; re-run the impact-analysis list (G_BUGFIX_C1). Fresh session, prior retrospectives omitted (the §3.4 bias guard).

**No closeout (Stage E).** The summary is a one-line `CHANGELOG.md` entry plus the PR description. There is no gap-analysis ledger, no cumulative spec re-read, no milestone summary — a bug fix has no spec or milestone arc to reconcile against.

**Read-first:** `bug_fix` sessions load `templates/dot-claude/read-first-list-bugfix.txt` (composed by the hook under `operating_mode: bug_fix`) — the bug doc + the affected surface + the impact list; it deliberately **omits** the greenfield spec / scope / backlog / milestone-plan reads.

**Gates:** the universal G1–G10 still apply; the bug_fix mode layers **G_BUGFIX_A1 / B1 / C1** on top (off the numbered line; defined in `PROCESS-VALIDATION.md` → "Mode-specific gates"). Anti-pattern to reject at calibration: a "bug fix" that takes multiple weeks or spreads past the affected surface — that is a `greenfield` refactor milestone or an `audit`, and the regression-test bound is already lost.

## 3.8 Audit workflow (`operating_mode: audit`)

> Applies only when `operating_mode: audit` (`project-config.md`). An audit produces a **findings report and a prioritized remediation backlog, not new code**. The existing codebase **is** the spec — there is **no `spec/project-spec.md`, no milestones, and no Stage V**, because **audit *is* verification**: per-file sign-off and the fresh-context challenge are its internal V. Remediation is a separate `greenfield` or `bug_fix` follow-up scoped to the findings. The mode adds one new schema — `<audit_pass_prompt>` — and runs passes as `role: verifier` (no new `role` value).

**Shape: Phase S → Phase P → Phase C → consolidation.**

1. **Phase S — Setup** (`role: verifier`). Three fresh sessions, three artifacts: **S1 Inventory** (`docs/audit/INVENTORY.md`) — a complete structural map; every file present or tagged **EXCLUDED + rationale** (G_AUDIT_S1), no silent omissions. **S2 Triage** (`docs/audit/TRIAGE.md`) — per-file CRITICAL / MODERATE / SCAN per dimension. **S3 Plan** (`docs/audit/REVIEW_PLAN.md`) — the tier-conditional pass plan. (Lite skips S2 triage.)
2. **Phase P — Passes** (`role: verifier`). The dimension passes P1–P8 (IPC / secrets / error-handling / data-flow / performance / packaging / compliance / architecture), each pasted as an `<audit_pass_prompt>` carrying a **persona** (the expert lens), a **scope** (its dimension only — the scope line is the drift guard), a **15–20-item checklist**, and the **mandatory per-file sign-off** (G_AUDIT_P1) — every triaged file appears with findings or an explicit "No Issues," no group sign-offs. Per-pass findings land in `retrospectives/audit/P[N]-findings.md`. Tier selects how many dimensions run (Lite 1–2 / Full 3–4, up to all 8 by explicit choice).
3. **Phase C — Challenge** (`role: verifier`, fresh session per pass). Each challenge reads **only** the prior pass's output (`retrospectives/audit/P[N]-findings.md`) — never the original reviewing session's working context (**G_AUDIT_C1**, the fresh-context bias guard) — and hunts for what the first reviewer *missed*, not validation. Output to `retrospectives/audit/C[N]-challenge.md`. Single-model Path A: the diversity is fresh context, not a different model (`audit_multi_model: false`; Path B multi-model via SDK is the future route). Full challenges the security-focused passes (every pass at the all-8 explicit choice); Lite skips the challenge.
4. **Consolidation.** One step deduplicates across passes, ranks by severity, and calls out disputed findings (where reviewer and challenger disagreed) → `retrospectives/audit/FINAL_REVIEW.md`. Surviving findings land in the append-only `docs/audit/findings-ledger.md` (joins the `append-only-ledger.yml` LEDGERS set). The report carries the **mandatory tier-coverage caveat** (G_AUDIT_OUT) — which dimensions ran, which did not, at what depth.

**Read-first:** `audit` sessions load `templates/dot-claude/read-first-list-audit.txt` (composed by the hook under `operating_mode: audit`) — INVENTORY / TRIAGE / REVIEW_PLAN + the findings ledger; it deliberately **omits** the greenfield spec / scope / backlog / milestone-plan reads. The per-pass persona + scope + checklist ride on the pasted `<audit_pass_prompt>`, not on new read-first lists.

**Gates:** the universal G1–G10 still apply; the audit mode layers **G_AUDIT_S1 / P1 / C1 / OUT** on top (off the numbered line; defined in `PROCESS-VALIDATION.md` → "Mode-specific gates"). Anti-pattern to reject at calibration: `audit` + Lite + all 8 passes (that's a Full audit); and using `audit` to produce code changes (audit produces findings; remediation is a separate scoped follow-up).

**The audit mode repositioned as the G16 release-review gate.** This same audit workflow is what a `greenfield` project runs at the **`public-distribution-ready`** transition when it declares capability triggers (`risk_triggers:`): a fresh reviewer derives an **independent whole-product threat model** at the distribution boundary, recorded as the `audit`-mode `FINAL_REVIEW.md`, and the release-state entry cites it (`validators/validate-release-readiness.cjs`, **G16**). The repositioning is load-bearing in **what it must NOT be**: a **whole-product** review whose reviewer derived their own threat model — **not a re-read of the milestone findings**, which shares the builder's blind spots. The honest locus holds: the gate proves the **review record is present**, not that the independent review was *good* — that remains the audit-pass adversary's judgment. See `PROCESS-VALIDATION.md` G16 and `FRAMEWORK-CONFIG.md` §4.21.

## 3.9 Research-and-publish workflow (`operating_mode: research_publish`)

> Applies only when `operating_mode: research_publish` (`project-config.md`). The **hybrid two-phase** mode: a light research phase produces a sourced paper, then an **explicit re-tier** opens an engineered app phase. Research is exploratory and discursive; the app is engineering — the two get commensurate ceremony instead of one shape oversold or undersold.

**Shape: Phase R → re-tier → Phase A.**

1. **Phase R — Research (always Lite *process*).** Run the five grounded-STORM steps **R1–R5** from `templates/PHASE-R-DOC.md` (perspective discovery by search → sourced multi-perspective Q&A → contradiction map → paper draft + `docs/findings-to-illustrate.md` → adversarial peer review in fresh context). No milestones, no per-stage retros, no gap-analysis ledger — **except the one mandatory ledger Phase R always keeps regardless of tier: `docs/sources/registry.md`** (the grounded-STORM exception to Lite's no-ledger default). Grounding is the invariant: *no source → no claim*. `validators/validate-sources.cjs` is the mechanical half of `G_RP_R1`; R5 (fresh context) is the judgement half. Where the `deep-research` skill is present it is the R1/R2/R5 engine; otherwise native WebSearch/WebFetch.
2. **The inter-phase re-tier — an explicit, user-driven event, never automatic.** When R5 passes and `docs/findings-to-illustrate.md` exists, the agent surfaces: *"given the findings you want to illustrate, here's what the app needs to do → that suggests `<tier>`; confirm or revise."* The user decides; the tier is **not** auto-applied. Phase R stays Lite-process-locked independent of the project tier — only Phase A re-tiers.
3. **Phase A — App construction (re-tiered; inherits Stage V).** Phase A opens at the confirmed tier and runs as a **normal greenfield build at that tier — full scaffold + Stage V included**. It is **not** Lite-locked like Phase R; a Full Phase A runs Stage V like any Full project (the smell "skip Stage V because it's just a paper-illustration app" is rejected). The app + paper are paired deliverables: the app carries the "illustrates findings from `docs/paper/<paper>`" surface and the paper references the app (`G_RP_A1`); data + transforms are reproducible from the repo (`G_RP_A2`). Starter skeletons live in `templates/INTERACTIVE-APP-SCAFFOLD/`. **Re-tier-mid-Phase-A is a supported case**: if construction reveals more complexity than the re-tier assumed, the standard re-tier protocol applies again, logged in the override log.

**Gates:** the universal G1–G10 apply to Phase A; the mode layers **G_RP_R1 / R2 / R3 / A1 / A2** (off the numbered line; defined in `PROCESS-VALIDATION.md` → "Mode-specific gates"). `G_RP_R1` (every finding cites a logged source) is mandatory at **every** tier.

---

# Part 4: Discipline

## 4.1 Standing rules

Always on. Stack-independent.

- **Severity is non-elastic.** If everything is "important," reprioritize. A pile of 🔴 Criticals signals the milestone shouldn't have shipped.
- **Schemas-as-source-of-truth.** Types are generated, not hand-written. CI fails if committed types differ from regenerated.
- **Three similar lines beats a wrong abstraction.** Wait for the fourth before extracting. Premature abstraction is harder to undo than three duplicate lines.
- **Tests assert observable behavior, never tautologies.** If deleting an invariant from production doesn't break a test, the test misses the assertion that matters.
- **No comments by default.** Comments explain *why* — hidden constraint, subtle invariant, workaround — not *what*. No marketing language in code or commits.
- **No telemetry, ever.** No analytics, no crash reporter, no anonymous metrics, no phone-home. Adding any requires an ADR with public dashboard plan and explicit opt-in.
- **No `--no-verify`, no silent skips, no overrides.** Failed gate = fix or surface; never bypass.
- **DCO sign-off mandatory.** `git commit -s`. No exceptions.
- **Append-only ledger is a hard rule.** Never edit a prior entry. Carry-forward only.
- **Fresh agent session per stage.** Context bleed corrupts the loop.

## 4.2 Decision discipline (when to ask vs proceed)

The agent operates with high autonomy. The following lists make that explicit.

### Operating mode (default)

The user is the project's product owner / VP, not a hands-on engineer. They direct via spec, PRs, and one-word approvals. **Default to executing, not consulting.**

- When the next action is clear from prior direction, **do it** — don't ask for sub-step approval. Surface the outcome (diff, PR, gate result) for a single approval.
- Don't propose options when the action is obvious. Propose options only when the choice is genuinely the user's to make (scope, priority, an irreversible architectural decision).
- Never ask the user to run diagnostic commands they don't want to run. If something needs investigation, do it from the agent side. If something must happen on the user's machine that can't be done remotely, give **one command** they can paste — not a flow.
- For anything that can stay on the agent side (commits, pushes, PRs, merges to feature branches, doc updates), the agent does it autonomously and surfaces the result. Hard rules still apply (do-not-commit-without-approval, don't-push-to-main) — that's *outcome* approval, not *step* approval.
- The user approves outcomes; the agent figures out steps.
- **Always check the web before asking the user about externally-knowable facts.** Pricing, API shapes, library versions, library best practices, third-party schemas — these change over time and have authoritative sources. Confirm current state before drafting code or asking the user.
- **Do not scope-down based on code time or complexity.** The agent does all coding work. Don't cap test counts, don't recommend simpler approaches because they're "less complex to build," don't trim deliverables to fit a time-box. Design for what's *correct*. The only legitimate scope-reduction trigger is "off-the-charts" complexity (research project, weeks of single-stage work). Otherwise: write the right scope; the agent handles the volume.
- **Own technical decisions; escalate only on user-domain forks.** The user delegates technical-best-practice decisions to the agent: API design, retry policies, test strategies, library choices, version pins, refactor patterns. Research best practice, decide, document the rationale inline, proceed. Escalate to the user only when the choice is user-domain: scope (in/out for this milestone), priority (which deliverable matters more), product surface (what the user sees), irreversible architectural risk that changes the product's identity. When you do escalate, label it: "**Decision needed** — option A vs B, here's the trade-off."

### Proceed without asking

- Routine TDD steps within the milestone's stated scope
- Adding a dependency that's already named in the spec, ADRs, or milestone prompt
- Refactors that don't change observable behavior (covered by existing tests)
- Documentation updates that match landed code
- Test additions for existing code
- Fixing a lint warning that the lint config flags
- Renaming a private function for clarity
- Anything within the stage's stated deliverable

### Ask first

- Any spec ambiguity or contradiction
- Any feature that would land outside the milestone's stated `Out of scope`
- Adding a new dependency NOT named in spec, milestone prompt, or any ADR
- Any change to capability/security boundaries, IPC protocols, or core architectural primitives
- Any schema change
- Removing or relaxing a quality gate
- Anything taking longer than expected (>3 self-correction iterations)
- Anything requiring a new ADR

### How to ask

- State the situation in 1–3 sentences
- State the options (usually 2–3)
- State your recommendation
- Ask for the decision

Don't ask without recommending. Don't recommend without options. Don't dump a wall of context — the human has the spec; reference the relevant section.

## 4.3 Self-correction loop

When gates fail, work through them deterministically.

### Algorithm

1. Run all applicable gates.
2. Collect every failure in one pass — don't fix the first one and re-run blindly.
3. For each failure: parse the error → state a one-sentence hypothesis → make the smallest fix that addresses it → re-run only that gate → confirm green.
4. After all individual fixes: re-run all gates from scratch. A fix can break something that was passing.
5. Iterate. Maximum 3 rounds.

### When to escalate

After 3 rounds without all-green, **stop and surface**:

- What you tried (one line per attempt: hypothesis + fix + result)
- Current failures (full error output, not summarized)
- Best current hypothesis
- What you would try next, if anything

Do not silently try a fourth round. The human prefers a 90-second pause to discuss over a 3-hour rabbit hole.

### Cross-stack integration: escalate at iteration 2

The standard 3-round budget assumes each fix narrows the failure surface. For **cross-stack integration bugs specifically** (third-party protocol setup, OS-platform integration, build-tool config, native dependency wiring), if iteration 2 advances the error to a *new* error class rather than clearing it, that's a structural signal — the bug isn't one fix away. Escalate immediately and consider deferral or scope-down rather than iterating further.

The pattern: driver `'edge'` → switch to `'webkit2gtk'` → new error → switch to `'wry'` → new error → omit driver → new error. Each "fix" produces a different error mode. The right call at iteration 2 is to defer or scope-down, not iterate further. Integration bugs that produce *different* errors on each fix attempt are not converging; they're surfacing distinct failure modes one at a time.

### Anti-patterns in self-correction

- **"This test is flaky, I'll just retry."** Flaky tests are failing tests. Diagnose the source of nondeterminism (clock, network, ordering) and fix it. Never `#[ignore]` / `it.skip` / equivalent as a "fix."
- **"Let me just bump the timeout."** Sometimes correct, often hides a real issue (deadlock, slow path, missing await). Investigate before bumping.
- **"This warning is harmless."** Then the lint should be configured to allow it (with rationale), once, in the project config. Don't apply the lint suppression ad-hoc per call site.
- **"I'll come back to this."** TODOs without linked issues become permanent. Either fix now or open an issue and reference it from the comment.

## 4.4 Gates: hard, soft, outcome matrix

After every stage, evaluate against two tiers of gates.

### Hard gates (any fail = stop)

- **G1: Do-not-commit-until-approved rule held.** The agent did not commit without explicit human approval, ever, during the session. The human verifies this against the git log. Even one violation means the protocol's most important rule isn't reliable. **G1 is the single most important verification.**
- **G2: No severity-5 friction events.** No moment where the agent couldn't proceed and the prompt was insufficient.
- **G3: No protocol-drift events left unaddressed.** Every entry in the protocol-drift log either (a) the agent self-corrected, OR (b) the human has documented the prompt/playbook fix needed.
- **G4: The stage actually completed.** All stage acceptance criteria checked; commit on the milestone branch (for work stages) or final commit + push (for closeout).
- **G5: No axis row scored 1 or 2.** A single 1 or 2 points to a specific gap that compounds at scale.
- **G6: Verifier ran with fresh context (Full tier).** The verifier stage opened in a fresh CLI session with prior retrospectives excluded from `<read_first>` (enforced via the mode-aware SessionStart hook in projects that have it; honor-system in projects that don't). The findings file at `retrospectives/M[NN].V-findings.md` exists with the required coverage caveat. No 🔴 findings remain unaddressed at PR time. (Lite tier: G6 reduces to "if Verifier was enabled per `verifier_mode`, it ran and produced findings.")
- **G7: Stage R ran with fresh context when triggered (Full tier).** When `refactor_mode`'s trigger fired (`docs/tech-debt.md` count ≥ threshold OR the milestone interval, whichever first; §3.4.5), the refactor stage opened in a fresh CLI session with prior retrospectives **and prior R findings** excluded from `<read_first>` (the `read-first-list-refactor.txt` list — one step stricter than G6). The findings file at `retrospectives/M[NN].R-findings.md` exists with the required coverage caveat. No 🔴 structural findings remain unaddressed at the next milestone PR (resolved via D.refactor or accepted waiver ADR). Not asserted when the trigger didn't fire or at Lite tier (`refactor_mode: skip`).
- **G8: No unjustified priority inversion; backlog is HITL co-authored (advisory at the Full default; `enforced` blocks).** Two clauses. **(a)** If the stage or milestone built a lower-priority `docs/backlog.md` story while a higher-priority story was unblocked and in scope, the divergence is recorded in `docs/off-track-log.md` with a build-sequence justification (HARD DEPENDENCY / FOUNDATIONAL SCAFFOLDING / COST-OF-CHANGE / RISK DE-RISKING) — or the build is **off track** and the next stage does not proceed until the user re-prioritizes (backlog re-ranked by human ratification) or a justification is logged. An unlogged inversion is off track by default. **(b)** Every `docs/backlog.md` change (ranking, status, scope, `Depends on`) was **human-ratified** — no AI-only edit reached the committed doc (the load-bearing half: if the agent could re-rank, "off track" would be unfalsifiable). The per-stage off-track line in the retro is the cheap early-warning path; the closeout off-track check (§3.5) is the full one; `/on-track` is the on-demand path. Lite reduces to "the per-stage line was filled, any inversion noted in `CHANGELOG.md`, the backlog edit human-ratified." (G7 = Stage R; G8 = Off-Track.)
- **G9: Test-honesty — declared-risk surfaces carry a mutation-killing test; no assertion-free test ships.** The structural form of the test-honesty standard. Two clauses, both checked by `validators/validate-test-honesty.cjs` (pre-commit + CI) on the **staged** diff (incremental) keyed off the stage's **declared** risk surface (risk-tiered, not a blanket mutation score). **(a)** A work stage in a **v1.7+** Phase doc carries a `<test_honesty>` slot naming a mutation-killing test for each enforcement/security/destructive surface it touches — or the explicit `n/a — no risk surface` sentinel; a **silent omission blocks**. **(b)** No staged test is assertion-free / exception-only (a test that proves nothing). G9 is the *effectiveness* layer **on top of** the coverage gates — coverage proves *executed*, the mutation proves *caught*; they compose. **Grandfathered:** required only for docs declaring `**Protocol version:** v1.7`+ — earlier and banner-less docs are never retro-failed. **Lite:** advisory (run under `test_honesty: warn`); **Full:** enforced (blocks the commit). Gate number is the next free on the numbered universal line after G8 (G9 is a *universal* gate, distinct from the mode-gate namespace which never consumes a number).
- **G10: Assembled-execution cluster-gate — a runtime/drivable surface is approved only by driving the REAL assembled surface.** The structural form of "unit/component green cannot approve a runtime surface." For a surface whose derived class is **runtime/drivable** — `ui` / `command` / `endpoint` — plus the destructive/packaging/real-provider risk surfaces, a `State: verified` App-Map entry must carry **assembled-execution evidence**: the verifier's `assembled_execution` pass drove the surface via *How-to-exercise*, retained the run reference (command + result) in the App-Map **Evidence** column, and that is the same reference Stage C reconciles. Enforced by `validators/validate-app-map.cjs` (an un-driven `verified` drivable entry → RED) + the `assembled_execution` Verifier pass. A `library` (`api`) surface is **n/a** (test-id binding suffices). **Necessary-not-sufficient:** G10 **stacks on** the coverage/unit gates and the test-id binding — it never replaces them. **Risk overrides tier:** it arms at either tier wherever the surface class is drivable; the arming is **visible** ("armed because surface class = X"), never silent. Trigger list: `FRAMEWORK-CONFIG.md` §4.18. Gate number is the next free on the numbered universal line after G9.
- **G11: Risk overrides tier — a declared risk surface raises oversight above the tier floor, visibly.** The structural form of *"tier is the floor; risk raises it."* A `project-config.md` that **declares a `risk_triggers:` token** (one of the six in `FRAMEWORK-CONFIG.md` §4.19 — destructive data ops / archives-extraction / untrusted-metadata fs-writes / credentials / untrusted-HTML / installers) must carry a **visible escalation record** in `docs/gates.md`: a row that **both** names the trigger **and** states its reason via the canonical token `deep verification because:`. Checked **per-trigger and AND-ed** by `validators/validate-risk-escalation.cjs` (pre-commit + CI) — a 1-of-N "any one escalated passes" dodge is rejected, and a **silent raise** (a depth with no stated reason) is rejected. A no-trigger project (`risk_triggers: []`) is a no-op. **Presence-gated**: a surface the project failed to declare escapes the static floor; the **adversarial half is Stage V's plan-challenge**, which derives its own trigger assessment and challenges *under-declaration*. **Lite:** advisory (`risk_escalation: warn`); **Full:** enforced (`block`). Gate number is the next free on the numbered universal line after G10.
- **G12: The destructive-op hard rule — every destructive op is failure-safe by construction, tested for BOTH rollback AND confinement.** **Tier-independent — it sits alongside G1** (the no-commit-without-approval rule), holding at Lite exactly as at Full. When the staged set touches a **destructive surface** (`restore` / `import` / `migrate` / `delete` / `replace` / `extract` / `unzip` / `backup` — matched on a test-block name or a file basename), it must carry **two independent tests**: a **rollback** test (the op is undoable on failure — write-temp-then-rename or transactional) **AND** a **confinement** test whose body drives a **REAL** hostile path (`../`, an encoded sequence, or a symlink escape) and asserts rejection. Missing the rollback test, missing the confinement test, **or** a confinement test using only a **toy** path → block. **`rollback != confinement`:** the two tests are independent — a perfect rollback test does **not** satisfy confinement (the unconfined-restore false-green, where "rollback works" was read as "safe" and a path-traversal shipped). Untrusted paths use the single **canonicalize-then-confine-to-subtree** primitive (`templates/style.md` + the `gotchas.md` prefix-bug trap): resolve canonical (realpath, symlinks resolved) → `resolved === root || resolved.startsWith(root + sep)`, **never** a bare `startsWith(root)` (the `/base` vs `/base-evil` bug). Checked by `validators/validate-destructive-op.cjs` (pre-commit + CI), **fail-closed**. **Presence-gated + keyword-heuristic**: an unlisted verb or a static-only toy-path check escapes the floor; the **adversarial half is Stage V's plan-challenge**, which confirms the confinement path *genuinely* escapes. **Lite:** advisory (`destructive_op: warn`); **Full:** enforced (`block`). Gate number is the next free on the numbered universal line after G11.
- **G13: Risk-matrix — a declared high-risk capability covers all 9 dangerous properties or blocks.** The structural form of *"the verifier inheriting only the plan's stated scope shares the planner's blind spots."* A work stage that **declares a risk surface** (a `<risk_declaration triggers="…">` slot naming ≥1 real trigger) must address the **bounded nine-property risk-matrix** — the fixed set, not arbitrary invented threats: **normal / hostile-input / partial-failure / confinement / authorization / resource-bounds / recovery / observability / cross-platform**. Each property is either `covered-by: <how> — test: <name>` or an explicit `n/a — <reason>`; a missing property, a property naming no covering test and no `n/a`, or an empty one → block (AND-ed across all 9 — a "one property present passes" dodge is rejected). A stage with no `<risk_declaration>` is a no-op (under-declaration is Stage V's job). Checked by `validators/validate-risk-matrix.cjs` (pre-commit + CI), **fail-closed**. **Banner-less docs are current, not grandfathered:** a banner-less Phase doc is treated as **current/must-comply** — only an explicit pre-v1.8 banner exempts; history is protected by `--staged` (changed-only) scoping, never a retro-failing `--all`. **Presence-gated**: whether the named coverage is real or the `n/a` true is judgment — the **adversarial half is Stage V's plan-challenge**, which anchors on the declared matrix and asks "which of the 9 did the plan leave unproven?" **Lite:** advisory (`risk_matrix: warn`); **Full:** enforced (`block`). Gate number is the next free on the numbered universal line after G12.
- **G14: Verifier-proof — the plan-challenge is proven by a seeded-defect calibration, FNR = 0.** The structural form of *"a verifier that misses a planted defect still reports Sound."* The adversary-side analog of G9's mutation-kill: the floor is proven by mutating a validator → a test goes RED; the adversary is proven by seeding a known defect → the verifier must flag it. Every Stage V **opens** by running its plan-challenge against the **seeded-defect calibration set** (`prompts/calibration/` — one fixture per §8.5 escape class, sealed ground-truth in `labels/`) and must catch **every** seed — **false-negative rate (FNR) = 0** — before its real findings count; the result is recorded as a `calibration` evidence block. A `<verifier_stage_prompt>` without the `<pass name="calibration_self_test">`, **or** a "Sound" findings file with no recorded calibration block, is rejected by `validators/validate-stage-prompts.cjs` + `validators/validate-calibration.cjs`. **HONEST LOCUS (non-negotiable):** the validator is the **static floor only** — it proves the set exists + shadows the full catalog, is labeled + **sealed** (a fixture must not contain its own answer; the verifier reads `fixtures/`, never `labels/`), and that the self-test is **wired**. The **catch is agent judgment recorded at V-time as the FNR** — it **cannot** run in a pre-commit hook (you can't run a judge in a smoke test). Floor (present + wired) + adversary (the recorded FNR) = a real gate; neither alone is. Gate number is the next free on the numbered universal line after G13. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **a rubber-stamping verifier that misses a seeded defect and reads as "Sound"** — the unfalsifiable adversarial half this gate exists to kill).

#### The fail-closed standard

**Every enforcement path fails closed: error → block, never a silent pass.** A validator that cannot compute its answer (a git failure, an unreadable source) exits **non-zero**, never 0 — a standing rule every validator obeys. Fail-closed carries a **no-false-positive asymmetry** where the safe direction allows it (G11: a *declared* trigger with an unreadable `gates.md` blocks, but a *no-trigger* project never reads it, so a Lite project without `gates.md` is not falsely failed). Presence-gated does **not** mean fail-open — the source-unreadable branch is always hard non-zero.

#### The gate-design contract

Every gate is authored with **two parts**: (1) a **mechanical floor** (static/CI-checkable) **and** an **adversarial question** (verifier judgment) — and where a claim's falsifiability needs *judgment*, it cannot be mechanized; it **must** live in a Stage V pass, not the validator (G9's "is the `n/a` true?", G11's "was a trigger under-declared?"). (2) Adding a gate (a new `G[N]`) requires naming the concrete **false-green it prevents** — the ceremony budget that justifies the gate's existence, the mirror of the gate-retirement-requires-ADR rule. `templates/gates.md` carries a **"Prevents (false-green)" column** so the justification is visible per row (G11's: *tier-floor oversight on a high-risk surface*).

**The inheritance floor — every gate must actually FIRE in a generated project, not just be wired.** The whole-arc claim — *"every generated project inherits G9–G14"* — is itself a falsifiability claim, and for most of the arc it was asserted by **template-wiring**, never *proven* (the standing G10 irony: the kit demanded assembled-execution from others but never baked its own scaffold). `scripts/bake-inheritance.cjs` closes it: it renders the deterministic Phase-3 scaffold (validators/, the `.claude` hooks, `prompts/calibration/`) into a throwaway project and **plants a known violation per gate**, requiring the *baked* validator to **block** — a present-but-dead (neutered) validator makes the harness go **RED** (effectiveness, not presence — a file-exists harness is the theater this check exists to kill). It is a **CI inheritance check** (`.github/workflows/bake-and-test.yml`, the append-only-ledger / app-map-currency class), **not a numbered gate**. **Honest scope:** it bakes the deterministic *scaffold* (what Phase 3 copies to disk), not the conversational calibration interview — it proves the wiring inherits, not that the bootstrap conversation reliably produces it; and **G10's assembled-execution half is not bake-fired** (it needs a real running app — its inheritance rests on presence + this CI-wiring, while the harness fires `validate-app-map`'s static test-id-binding floor). The companion `validators/validate-validator-enumeration.cjs` — a **kit-only** check that runs in the kit's own CI, not a generated project — keeps the scaffold catalogs honest: every shipped `validators/*.cjs` is enumerated in `validators/README.md` + the `CLAUDE.md` / `PROJECT-CLAUDE.md` scaffold tables, so the inheritance the harness *proves* is also *documented*.

### Soft gates (advisory; weigh together)

- **S1:** Process axis total ≥75% of max
- **S2:** Product axis total ≥80% of max
- **S3:** Pattern axis total ≥70% of max
- **S4:** Time-box estimate within 2× of actual elapsed time
- **S5:** ≤3 severity-3 friction events (multiple severity-3s suggest sustained friction even if no individual event was blocking)

### Outcome matrix

| Hard gates | Soft gates | Verdict | Action |
|---|---|---|---|
| All pass | All pass | **Sound** | Proceed to next stage. Apply minor playbook updates from Decisions section if any. |
| All pass | 1–2 fail | **Sound but rough** | Revise playbook / templates to address the soft-gate failures first; then proceed. |
| All pass | 3+ fail | **Friction-heavy** | **Stop.** Spend a session iterating on the playbook before the next stage. The cost of fixing now is hours; the cost of running 10 stages with a friction-heavy pattern is weeks. |
| Any fail | n/a | **Not ready** | Diagnose which hard gate failed and why. Fix the underlying issue (may require an ADR if it's a primitive protocol change). Re-run the failed stage or a recovery session before proceeding. |

The temptation will be to declare victory because the milestone shipped. Resist it. The point of this evaluation is to catch friction *before* it compounds.

## 4.5 Retrospective protocol

Every stage produces a retrospective. The agent maintains it during the session and surfaces it alongside the approval bundle. The human reviews; does not fill in fields.

### Cadence rationale

A 5–8 hour stage retrospective catches pattern problems before the next 5–8 hour stage opens — saving 25+ hours of compounding error. A retrospective only at milestone-end (after 4–5 stages, ~30 hours) is a 30+ hour feedback loop. The per-stage cadence is the early-warning system.

### Three axes (always evaluated)

**Axis 1: Process — did the workflow work?**

Did the agent have what it needed to execute autonomously? Did the workflow surface decisions to the human at the right moments? Not about whether the code is good (Axis 2). About whether the *interaction* worked.

Sample questions: Was the orientation file (playbook + identity + read-first) sufficient, or did the agent ignore parts of it / get confused by parts of it? Did the milestone prompt's "Read first" list correctly orient before any code was written? Did the agent state deliverable + test plan before writing code? Did the agent self-correct effectively when gates failed, or did it spiral? Did the agent actually NOT commit before approval (the most important rule)? Did the agent escalate the right things and proceed on the right things?

**Axis 2: Product — did the artifact meet standards?**

Is what shipped actually good? About the deliverables.

Sample questions: Does the code match the style guide? Are tests behavior tests, not tautology tests? Are public APIs documented with examples? Are deliverables what the milestone promised — no more, no less? Would a stranger picking up this code understand it without reading the spec? Are project-wide anti-patterns absent?

**Axis 3: Pattern — does this generalize to remaining stages?**

The meta-question. If the prompt format is wrong, repeating it 10 more times multiplies the wrongness.

Sample questions: Were sections of the prompt template dead weight? (Sections that contributed nothing should be removed.) Were sections missing? (Sections that should have been in the prompt but weren't should be added.) Are stage-specific gotchas useful for other stages, or were they truly local? (Generalizable ones move to the gotchas list.) Did the time-box estimate match reality? (If 2× off, the estimation method needs revision.) Were there moments of *implicit* protocol — things that should have been written down but weren't?

### Live observation log

Friction, ambiguity, surface, protocol-drift, surprise events get logged in real time — not summarized at session end. Details fade. Each event includes severity (1–5; 5 = couldn't proceed). **Severity-1 events aggregate to a per-stage count + one exemplar row** — full rows are reserved for severity 2+; itemizing sev-1 was ~89% of logged friction and caught nothing.

### Stage-end discipline

- Score 3 axes per the scoring ladder (Part 3.1)
- Evaluate threshold gates (Part 4.4)
- Mark outcome (Sound / Sound but rough / Friction-heavy / Not ready)
- Write specific Decisions for the next stage — cite file:line, name the change, name the gate

### Final stage of a milestone

Also write `M[NN]-summary.md` aggregating across stages, and draft the PR description.

### Cross-milestone trends (optional)

When patterns emerge across multiple milestones, aggregate them in `retrospectives/TRENDS.md`. Not per-session work; becomes useful around milestone 3+. Patterns of patterns.

## 4.6 Gap analysis protocol

> **Tier note.** This protocol applies when `ledger` is `append_only_advisory` (the Full default) or `append_only_enforced` (armed by a declared risk trigger). When `ledger` is `none` (Lite default), the gap-analysis ledger isn't generated — milestone closeout uses `CHANGELOG.md` plus the PR description for the same forensic role at lower fidelity. Re-tiering upward retroactively *opens* a ledger; it doesn't backfill prior milestones.

Distinct from retrospectives. Retrospectives evaluate the *process*; gap analysis evaluates the *product* (does code match spec, what did spec get wrong, prioritized fix backlog).

### When it runs

After the final stage of a milestone commits and the milestone summary lands, but **before** the milestone PR opens. The gap-analysis commit is the **final commit on the milestone branch** and gates the PR push.

### Append-only is a hard rule

Per Part 4.1. No prior entry may be edited, reordered, or deleted. Resolution of a prior finding goes in the *current* milestone's Carry-forward section, referencing the prior entry's milestone tag (e.g., "M01 critical 'X' — resolved at <path/file>:<line>"). CI enforces via diff check.

### Six sections per entry, none optional

Detailed in Part 3.4. Write "None observed." rather than omit.

### Three-artifact PR review

The human reviews code diff + retrospectives/summary + gap-analysis entry together. Pushback on any of the three blocks the PR until the agent revises.

### Why append-only

- **Audit trail integrity:** the M01 → M[NN] chain documents drift over the project's life.
- **Honest assessment:** knowing it's permanent forces accuracy. Editing later to "soften" a finding defeats the purpose.
- **Forces forward-looking carry-forward:** resolution lives next to its date and commit context.
- **Spec-drift detection across milestones stays visible.**

## 4.7 Commit & PR workflow

The single most important rule: **the agent does not commit without explicit human approval.** This rule is tier-independent.

The *cadence* of approval (per-step / per-stage / per-milestone / per-PR) follows the `approval_cadence` toggle in `project-config.md`. Tier defaults: Lite = `per_pr`, Full = `per_stage`. Whatever cadence you've configured, the agent surfaces and waits at that boundary; no commits cross the boundary unapproved.

**Risk-trigger approvals change the approval *shape*, not just the cadence.** A declared risk trigger (the enumerated list in `FRAMEWORK-CONFIG.md` §4.19) raises *how often* you approve (the G11 cadence escalation) **and** *how rigorously* — a high-risk surface is approved through the **challenge-and-response checklist** (`templates/HIGH-RISK-APPROVAL-CHECKLIST.md`: intent · data lineage · permissions chain · blast radius · rollback plan), not a bare yes. The two compose: risk raises cadence *and* swaps a click for a checklist (the EU AI Act Art. 14 human-oversight control against rubber-stamping). The checklist is added rigor on the trigger surfaces only — it does **not** soften this section's load-bearing rule: `git commit`/`git push` stay `ask` and no op auto-commits, on any surface. It is human oversight, not technical enforcement.

### Phase-doc-edit pre-flight (cross-machine state check)

> **Tier note.** This check protects multi-machine orchestration setups (orchestration session reads origin while build machine has uncommitted work). It applies at Full tier. Lite projects typically run on one machine with one operator; this check can be skipped (set `cross_machine_check: skip` in `project-config.md` if your Lite project ever needs it disabled explicitly).

**Mandatory before any edit to `docs/build-prompts/M[NN]-*.md` larger than ~50 lines or affecting any X.5 stage prompt.**

Origin is a partial view of project state when stages are committed locally but not pushed (per the no-push-between-stages rule below). An orchestration session that reads only `origin/main` may infer "stage X unexecuted" when in fact the build machine has the work locally. This is a banned failure mode that has caused real reverts.

Before authoring or revising substantial phase doc content, the orchestration session MUST read cross-machine state. On the terminal channel it is already there: every `stage-packet` carries a `state` field (branch, head, `git log --oneline main..HEAD`, `git status --short`) taken on the build machine at publish time - read the latest one (`node scripts/channel.cjs replay --stage <id>`). Off the channel (a web orchestrator, a separate machine), ask the user to paste `git log --oneline main..HEAD` from the build machine on the active milestone branch. If the output contains commits, those commits' subjects + the corresponding retrospective files (`retrospectives/M[NN].<X>-retrospective.md`) are load-bearing input to the edit. **Retrospective-file presence on the build machine is the source of truth for "stage X executed," not git visibility on `origin`.**

If the orchestration session skips this check and authors a phase doc edit against an inferred "stage unexecuted" state, the edit is structurally untrusted and must be reverted on discovery.

The rule does NOT apply to:
- Per-stage commit-message edits (small, scoped to the active stage's surface)
- Surface-driven feedback during a stage cycle (review/comment doesn't change the doc)
- Pre-milestone scope/staging changes that the user explicitly directs (the user's direction IS the cross-machine state in that case)

### What "done" looks like

A unit of work is done when:

1. All applicable acceptance criteria for the stage/milestone are checked.
2. All quality gates pass locally.
3. CI would pass (predict: every gate has been run; nothing skipped).
4. Documentation updated where the change touches public surface.
5. ADR filed if required (Part 4.8).
6. Changelog updated.
7. AI-assistance disclosure prepared (Part 4.9).

### When done, draft — don't commit

1. Run `git status` to confirm what's staged, unstaged, untracked.
2. Run `git diff --stat HEAD` to summarize the diff.
3. Re-run all gates one final time. Capture exact results.
4. Draft the PR description per the project's PR template.
5. Surface to the human: title, description, diff stat, gate results, retrospective. State explicitly: *"I will not commit until you approve."*
6. Wait. Do not commit, do not push, do not open a PR.

### What "do not commit" means specifically

- Don't run `git commit` until the human has approved.
- Don't run `git push` until the human has approved.
- Don't open a PR until the human has explicitly asked.
- Don't auto-merge, auto-squash, or auto-rebase.
- Don't `git checkout` to a different branch with uncommitted changes (can lose them or carry them).
- Don't `git stash` to "set aside" work; surface it instead.

When unsure: `git status`. State what you see. Wait.

### After approval

1. Stage exactly what's intended. Use specific filenames; not `git add -A` for surprise commits.
2. `git commit -s -m "..."` — DCO sign-off mandatory. Conventional Commits format. Session URL in footer.
3. `git push -u origin <feature-branch>` (only at milestone closeout for milestone branches; no push between work stages).
4. Open a PR only if the human explicitly asked.
5. After push, run `git status` to confirm clean working tree.

### Branch hygiene

- Feature branch off `main`. Never commit on `main` directly.
- Naming convention enforced (e.g., `claude/<short-kebab-description>` or `claude/m[nn]-<title>`).
- One branch per logical unit of work.
- Squash-merge for small, single-concept PRs.
- Merge-commit (preserve history) for milestone PRs with valuable per-stage commit history.
- Never force-push to `main`. Force-push to a feature branch is acceptable if the agent is the only contributor to it.
- Delete merged branches.

## 4.8 ADRs (Architecture Decision Records)

Required for any change that:

- Adds, modifies, or removes a core architectural primitive
- Changes a schema (new major version requires new file + ADR)
- Adds a new core dependency (runtime, not dev-only)
- Changes capability/security enforcement behavior
- Changes IPC or process-boundary protocols
- Significantly changes scope of the current release version

Smaller decisions (refactors, internal abstractions that don't cross primitive boundaries, minor optimizations) don't require an ADR — a clear PR description suffices.

### How to file an ADR

1. Copy `decisions/0000-template.md` to `decisions/NNNN-short-title.md`. Use the next available number.
2. Fill in every section. Status starts `Proposed`.
3. PR includes the ADR + the change it documents.
4. On merge, status flips to `Accepted` (do this in the PR before merging).
5. **ADRs are immutable once accepted.** To change, file a new ADR that supersedes the old one (and add `Superseded by ADR-XXXX` to the old one's Status line in the same PR).

## 4.9 AI-assistance disclosure

If this is OSS or has provenance requirements, disclose AI assistance explicitly.

- **Commit messages:** every agent-authored commit ends with a session URL footer (e.g., `https://claude.ai/code/session_<id>`).
- **PR descriptions:** include a required disclosure section noting AI tools used and human review/edit role.
- **Code comments:** do NOT add `// Generated by Claude` or similar to source files. The disclosure lives at the commit/PR level, not in the code. Code is code.

---

# Part 5: Meta

## 5.1 Living documents

The execution protocol (this playbook), the spec, the style guide, the gotchas list, the gate matrix, the prompt templates — all evolve over the project's life. Substantive changes get clear commit messages (`docs(playbook): ...`) and a changelog entry. The commit history of these files is itself an audit of how the working agreements evolved.

## 5.2 This playbook versions itself

This playbook changes when:

- The spec changes in ways that affect how the agent works (rare; spec is the contract)
- Quality gates change (adding a new lint, raising coverage threshold)
- The PR/commit workflow changes
- New common gotchas surface that should become hard rules
- A retrospective's Pattern axis identifies a missing or dead-weight section

If this playbook disagrees with the spec or an ADR, the spec/ADR wins. The playbook is the execution protocol layered on top, not a source of truth for design decisions.

---

# Appendix A: Companion documents

These live as siblings to this playbook in the repository.

| File | Purpose | Mutability |
|---|---|---|
| `BUILD-PLAYBOOK.md` (this file) | Execution protocol | Living |
| `FRAMEWORK-CONFIG.md` | Tier and toggle reference (the dial) | Living (framework-level) |
| `project-config.md` | This project's chosen tier and toggles | Living (override log append-only) |
| `.claude/settings.json` + `.claude/hooks/session-start-read-first.sh` + `.claude/read-first-list.txt` | SessionStart hook that auto-loads the read-first list | Living |
| `spec/<project>-spec.md` | What we're building | Living |
| `decisions/NNNN-*.md` | Architecture decision records | Immutable once accepted |
| `docs/identity.md` | "What this is / what this isn't" + read-first list | Living |
| `docs/style.md` | Naming, comments, function design, anti-patterns | Living |
| `docs/gotchas.md` | Numbered list of project-specific traps | Living |
| `docs/gates.md` | Gate matrix indexed by milestone | Living |
| `docs/reference-index.md` | "Where things live" navigation table | Living |
| `docs/sessions.md` | Session register, keyed by milestone/stage | Living |
| `docs/gap-analysis.md` | Cumulative product↔spec evaluation | **Append-only forever** |
| `prompts/STAGE-PROMPT-PROTOCOL.md` | XML schema for stage CLI prompts (work-stage + closeout-stage variants); authoring rules; worked examples | Living |
| `prompts/WORK-STAGE-TEMPLATE.md` | Bare XML template for work-stage prompts (Stages A–D) | Living |
| `prompts/CLOSEOUT-STAGE-TEMPLATE.md` | Bare XML template for closeout-stage prompts (Stage E) | Living |
| `docs/build-prompts/M[NN]-*.md` | Per-milestone Phase doc — markdown wrapper + per-stage XML prompts in fenced `xml` code blocks | Living |
| `retrospectives/RETROSPECTIVE-TEMPLATE.md` | Per-stage retrospective shape | Living |
| `retrospectives/SUMMARY-TEMPLATE.md` | Per-milestone summary shape | Living |
| `retrospectives/M[NN].<X>-retrospective.md` | Per-stage retrospectives | Immutable once finalized |
| `retrospectives/M[NN]-summary.md` | Per-milestone summaries | Immutable once written |
| `retrospectives/TRENDS.md` (optional) | Cross-milestone pattern log | Living, additive |
| `CHANGELOG.md` | Release notes | Living |

---

# Appendix B: Quick checklists

## Per work stage (A, B, C, …)

**Pre-flight**

- [ ] Fresh agent session
- [ ] Working tree clean
- [ ] Orientation files present and read

**Read-before-write (Stage B+)**

- [ ] Read prior stages' "Decisions for next stage"
- [ ] Read most recent gap-analysis carry-forward

**Execution**

- [ ] Stage CLI prompt pasted (XML-structured)
- [ ] Agent stated deliverable + test plan before code
- [ ] Human confirmed plan
- [ ] Retrospective template copied; `[LIVE]` rows being filled
- [ ] TDD micro-cycles per step
- [ ] All gates green (zero warnings, zero skips, no `--no-verify`)
- [ ] Self-correction within 3-iteration budget OR surfaced

**Stage end**

- [ ] `[END]` retrospective: 3-axis scoring + threshold gates + verdict + decisions for next stage
- [ ] Diff stat, gate results, retrospective, draft commit message reported
- [ ] **Agent did NOT commit**

**Approval surface**

- [ ] Human reviewed: code diff + retrospective
- [ ] Human verified G1: agent did not commit before approval (check git log)

**On approval**

- [ ] Commit with DCO sign-off + Conventional Commits + session URL
- [ ] No push (between stages)
- [ ] `sessions.md` updated
- [ ] Fresh session opens for next stage

## Per closeout stage

**Cumulative reads**

- [ ] Entire codebase shipped to date
- [ ] Spec end-to-end (focus on touched sections)
- [ ] All prior gap-analysis entries
- [ ] All per-stage retrospectives + new summary

**Deliverables**

- [ ] `M[NN]-summary.md` written
- [ ] New gap-analysis entry drafted with all 6 sections (no omissions)
- [ ] Append-only verified (`validators/check-append-only.cjs`): prior content is a prefix of HEAD
- [ ] CI append-only check green (`append-only-ledger.yml`)

**Approval surface (3 artifacts)**

- [ ] Human reviewed: code diff + retrospectives/summary + gap-analysis entry
- [ ] Entry flagged "IMMUTABLE once committed"

**On approval**

- [ ] Ledger entry committed (final commit on milestone branch)
- [ ] First push of branch (`git push -u origin claude/m[nn]-<title>`)
- [ ] PR description drafted
- [ ] PR opened only if human explicitly asked

---

*End of Build Playbook.*
