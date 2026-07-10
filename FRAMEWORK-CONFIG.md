# Framework Configuration — Tiers, Toggles, Calibration

> The framework's overhead is **knowable, changeable, and pays off** — but only if you choose the right calibration. This file defines the calibration model: three tiers, a toggle schema for fine-grained overrides, decision aids for picking, and the protocol for changing tier mid-project.
>
> Companion to `BUILD-PLAYBOOK.md` (the methodology), `STAGE-PROMPT-PROTOCOL.md` (the XML schema), `PROCESS-VALIDATION.md` (the scoring), and `persistence-architecture.md` (the layer model). This file is the **dial** the others read.

---

## 1. Why this file exists

The full methodology was originally written for one calibration: a multi-week, multi-milestone, audit-critical project with a disciplined human reviewer. That's the **Full** tier. Applying it unmodified to a weekend CLI tool is overhead that doesn't pay off; applying a stripped-down version to a regulated production system loses the audit trail you actually need.

This file makes the calibration explicit. You pick a tier (or override individual toggles); the rest of the framework reads that choice and adjusts what it asks of you.

**The user-facing entry point is `templates/CALIBRATION-INTERVIEW.md`** — a structured three-choice interview (project size / experience / approval cadence) the bootstrap presents at the start of every fresh starter-kit session. That interview maps to the nine toggles in §4 below. This file is the reference the interview maps to; the interview is the surface a non-expert user actually sees. If you're a user reading this directly, you're already past the interview — keep reading for the toggle detail. If you're a developer of the framework, the interview file is the single source of truth for the user-facing trade-offs; this file is the toggle-schema reference.

---

## 2. The three tiers

| Tier | For | Stages-to-overhead ratio | Defaults: approval cadence | Defaults: retro depth | Defaults: ledger | Defaults: research |
|---|---|---|---|---|---|---|
| **Lite** | Solo, simple/small project, non-expert user, ≤1 week of work, low audit needs | High signal, low ceremony | Per milestone (or per-PR) | Brief (1 axis: did it work?) | None — CHANGELOG only | Best-practice-first (web-verify defaults) |
| **Standard** | Solo or small team, 1–4 weeks, intermediate complexity, normal audit needs | Balanced | Per stage for milestone-shape stages; per work-block otherwise | Two axes (process + product) | Suggested append-only; CI optional | Best-practice-first |
| **Full** | Multi-week to multi-month, high complexity OR high audit needs, expert user | Heavy ceremony, full forensic trail | Per stage, every stage | Three axes (process + product + pattern) | Append-only enforced via CI | Token-frugal by default; web-verify only on flagged questions |

Each tier is a **default toggle bundle**. You can override any individual toggle without changing tier (see §4). The tier name is shorthand for "I want this bundle of defaults."

### What changes between tiers — quick visual

```
                   Lite          Standard       Full
Discovery Qs       2             5              8
Scaffold files     ~36           ~68            ~69
Approvals/stage    1 (per-PR)    1 (per-stage)  1 (per-stage)
Retro axes         1             2              3
Ledger             CHANGELOG     append-only*   append-only + CI
Cog cost (h)       ~1 setup      ~3 setup       ~6 setup
Recurring cost     0.1h/stage    0.5h/stage     1.5h/stage
Best for           V1 prototype  V1→V2 product  Long-lived system

* "append-only" without CI means the doc says append-only; nothing fails if you edit it.
```

---

## 2.5 Expertise is a separate dimension from tier

Tier captures project complexity and audit needs. **Expertise** captures how familiar the user is with the stack, the framework, and software engineering generally. These are independent — a beginner may be running a Full-tier audited project; an expert may be running a Lite-tier weekend tool. The combinations are all valid; they just call for different agent behavior.

| Expertise | Description | Effect on agent behavior |
|---|---|---|
| `novice` | New to this stack, framework, or to engineering practices. | High explanation density (the agent explains what it's doing and why); lean on web-verified best practices for technical choices; fewer approval interruptions (trust the framework + best practices to land good defaults); flag any decision the user might not realize is reversible. |
| `intermediate` | Comfortable with the stack; learning the framework. | Moderate explanation; web-verify for non-trivial choices; per-tier approval cadence applies. |
| `expert` (default) | Knows the stack, knows the framework, has run this loop before. | Minimal explanation (works as written in the playbook); token-frugal research (user flags what to verify); per-tier approval cadence applies; agent doesn't second-guess decisions the user has signaled as routine. |

**Why "fewer approvals for novices" isn't backwards.** A novice user reviewing every stage decision can introduce more error than the agent does — they don't have the framework's mental model yet, so they second-guess defaults that are actually fine. Pulling the approval cadence to per-PR (instead of per-stage) for novices means the agent runs through stages on best-practice defaults, and the user reviews the whole milestone arc once. The user learns by reading the milestone summary; the agent isn't blocked waiting for advice the user can't yet give.

Experts get more approvals (per-stage) because their feedback at each boundary is high-signal — they catch drift the agent wouldn't see.

The `expertise` toggle drives several others by default (Novice = high explanation + best-practice-first + per-PR approval; Expert = minimal explanation + token-frugal + per-stage approval), but you can override individual toggles regardless of expertise. The override log captures the deviation.

## 2.6 Tier also determines the role model

Tier isn't only a ceremony dial — at **Standard and Full** it splits the agent into two distinct session types:

- **Orchestrator** — authors Phase docs / ADRs, adjudicates build surfaces, routes Verifier findings, sequences milestones, runs PRs. Governed by `ORCHESTRATOR.md` (generated at bootstrap for Standard+).
- **Build** — executes one stage per fresh session from a §X.5 prompt. Governed by `CLAUDE.md` + the stage prompt; never reads `ORCHESTRATOR.md`.

The human is the serializing conduit between them. At **Lite** tier the two roles collapse into a single session — no separate orchestrator, no `ORCHESTRATOR.md`. This is a structural consequence of tier, not a toggle; see `BUILD-PLAYBOOK.md` §2.2 for the role model and `ORCHESTRATOR.md` §1 for how the two roles are physically hosted (two CLIs + git worktrees on one machine is the recommended topology).

---

## 3. How to pick a tier

Three inputs. Pick tier by the **highest-tier input** — i.e., if any one input pushes you to Full, go Full.

### Input 1: Complexity score (1–5)

| Score | Signal |
|---|---|
| 1 | Single file or single-module project. CLI tool, script, internal utility. |
| 2 | Few modules, no persistent state, no third-party services. |
| 3 | Multi-module with persistent state OR external API integration OR a UI surface. |
| 4 | Multi-service, persistent state across boundaries, multiple integrations, OR a security boundary. |
| 5 | Distributed system, regulated domain, multi-team, OR multi-year lifecycle expected. |

Map: 1–2 → Lite. 3 → Standard. 4–5 → Full.

### Input 2: Time horizon (calendar weeks of focused work)

| Horizon | Signal |
|---|---|
| ≤1 week | Lite |
| 1–4 weeks | Standard |
| ≥4 weeks | Full |

### Input 3: Audit / accountability needs

| Need | Signal |
|---|---|
| None — solo, throwaway, you're the only future reader | Lite |
| Some — you'll come back to this in 6 months and want to remember why | Standard |
| High — multiple reviewers, regulated context, "what did we decide and why" must survive years | Full |

**Output:** the highest-tier input wins. A 3-day project with regulatory audit needs is **Full**, not Lite — the time horizon doesn't override the audit requirement.

### Don't know? Start Standard.

Standard is the safest default for "I'm not sure." You can drop to Lite at any milestone boundary if it feels heavy, or escalate to Full when complexity surfaces. The re-tier protocol (§7) makes this cheap.

---

## 4. The toggle schema

Tiers are bundles; toggles are the individual dials. Override any toggle to deviate from your tier's defaults. The active configuration lives in your project's `project-config.md` (installed during bootstrap) and is read by every session.

### 4.1 Approval cadence — `approval_cadence`

Controls how often the agent surfaces work for human review. **This is one of the three primary user choices in the calibration interview** (`templates/CALIBRATION-INTERVIEW.md`) — it's surfaced at bootstrap as "Minimum / Standard / Maximum" rather than derived from tier alone. The user gets explicit control over how much they're agreeing to review, since that's the most directly visible "human overhead" dial.

| Value | User-facing label | Meaning | Cost (human time) | What you get |
|---|---|---|---|---|
| `per_step` | Maximum | Review after every TDD micro-cycle | Highest (10–20 reviews/stage) | Maximum control; near-pair-programming |
| `per_stage` | Standard | Review at stage end (default: Standard, Full tiers + Familiar/Experienced expertise) | Medium (1 review/stage) | Catches drift early; standard cadence |
| `per_milestone` | (advanced; not surfaced in the interview) | Review only at milestone closeout | Low (1 review per ~5 stages) | Trust the agent within a milestone; review the whole arc |
| `per_pr` | Minimum | Review only when PR opens (default: Lite tier or New expertise) | Lowest (1 review per merge) | Minimal interruption; relies on tests |

**Rule that doesn't change with cadence:** the do-not-commit-without-approval rule (G1) still holds. `per_pr` means you approve a single batch commit at PR time, not that the agent commits whenever it wants.

**`approval_cadence` also drives the generated permission fence.** One question, two effects: the cadence above *and* the `.claude/settings.json` `permissions` profile the bootstrap selects. The user-facing labels (Maximum / Standard / Minimum) map to three fence profiles — "how much do you want to babysit?":

| Fence profile (← cadence label) | `defaultMode` | allow / ask split | Best for |
|---|---|---|---|
| **Maximum oversight** (← Maximum / `per_step`) | `default` (or `plan` for reads-only) | tiny allow (lint); test/build/edit/git all `ask` | Novice / sensitive / learning |
| **Fenced autonomy** (← Standard / `per_stage`) — *recommended default* | `acceptEdits` | allow = edit source, `{{TEST}}`/`{{LINT}}`/`{{BUILD}}`, `git add`; ask = `git commit`/`push`, dep install, manifest edits | the sweet spot |
| **Sleep-through** (← Minimum / `per_pr`) | `acceptEdits` + recommend the **user-level** `auto` opt-in | same allow/ask as Fenced (repo can't set `auto`); lean on auto's classifier for the long tail | trusted direction, long unattended runs |

**The `deny` floor is level-invariant — identical at every level (the wall doesn't move; only the allow/ask split flexes).** It denies **secret reads** (`.env`, `.env.*`, `secrets/**`, `*.pem`, `*.key`), **secret writes** (`Edit(./.env)`, `Edit(./.env.*)`), and **irreversible Bash** (`git push --force`, `git push -f` [short force-push form], `git reset --hard`, `git clean`, `rm -rf`) at Maximum oversight, Fenced autonomy, and Sleep-through alike — this enumeration matches both the shipped `templates/dot-claude/settings.json` deny block **and** the kit's own live `.claude/settings.json` deny block exactly (no undocumented superset). `scripts/smoke.cjs` asserts the live `.claude/settings.json` deny floor is byte-identical to the shipped template floor (the **live == template** guard), so the live fence can no longer silently drift from the documented floor. **Egress/exfil control is deliberately a *separate layer* — user-level `auto` (its classifier blocks `curl … | bash` semantically) + the OS sandbox + keeping secrets off disk — not a static `deny` on `curl`/`wget`**: a static egress deny is trivially bypassed by a `node`/`python` subprocess (the same gap that limits `deny: Read()`) while still blocking the toolchains that legitimately need `curl`, so it buys friction without buying safety. `defaultMode:"auto"` is **never** repo-set (ignored by design); `.claudeignore` is **never** generated (broken). See `templates/dot-claude/settings.json` (`_permission_profiles`) and the honest secrets/web-remote caveats in the generated `CLAUDE.md`.

### 4.2 Retrospective depth — `retro_depth`

Controls how much process self-evaluation each stage produces.

| Value | What gets filled | When useful |
|---|---|---|
| `none` | No retrospective file | Genuinely throwaway work; you'll never look back |
| `brief` (default: Lite) | One paragraph: "what worked, what didn't, what to change" | Lightweight forward signal without the form-filling |
| `two_axis` (default: Standard) | Process + Product, no Pattern axis | Standard projects without a generalization concern |
| `three_axis` (default: Full) | Process + Product + Pattern (current behavior) | Long-running projects where prompt-pattern drift compounds |

### 4.3 Ledger discipline — `ledger`

Controls the append-only product↔spec ledger.

| Value | Behavior | When useful |
|---|---|---|
| `none` (default: Lite) | No `gap-analysis.md`. Use `CHANGELOG.md` for "what shipped." | Simple projects; you don't need a forensic record. |
| `append_only_advisory` (default: Standard) | `gap-analysis.md` exists with the append-only rule documented; nothing enforces it. | You want the discipline but not the CI cost. |
| `append_only_enforced` (default: Full) | CI fails any PR that edits a prior ledger line. | Audit-critical: regulated, multi-team, or long-lived. |

### 4.4 Web-verify cadence — `web_verify`

Controls when the agent web-searches external facts (library versions, API shapes, pricing, best practices).

| Value | Behavior | Cost (tokens) | Default for |
|---|---|---|---|
| `always` | Web-verify any externally-knowable fact before coding to it | High | Lite, Standard (lean on best practices over guesswork) |
| `on_request` | Web-verify only when explicitly asked or when a fact is flagged uncertain | Medium | Full (expert user expected to flag what needs verifying) |
| `never` | Never web-search; rely on training-data knowledge | Low | Air-gapped contexts, offline development |

The Lite tier defaults to `always` deliberately: non-expert users benefit most from web-verified defaults rather than from the agent's potentially-stale training. Experts (Full tier) usually know which facts need verifying and can flag them, saving tokens on the rest.

### 4.5 Read-first cap — `read_first_cap`

Controls the maximum number of files in any read-first list (per stage, per project orientation, per session).

| Value | Cap | Default for |
|---|---|---|
| `small` | 3–4 files | Lite |
| `medium` | 6–8 files | Standard |
| `large` | 10–12 files | Full |
| `unlimited` | No cap | Discouraged; only for genuinely complex stages where every file pulls weight |

**Why cap at all:** see §6 ("Cognitive load budget"). Caps protect against the read-everything-in-case-it-matters anti-pattern, which dilutes the agent's context with low-signal material.

### 4.6 Research mode — `research_mode`

Controls how the agent decides between deep research and best-effort-from-memory when making a technical choice.

| Value | Behavior | Cost (tokens) | Default for |
|---|---|---|---|
| `best_practice_first` | For any non-trivial technical decision, web-verify current best practice before coding. | High | Lite, Standard |
| `token_frugal` | Use training-data knowledge by default; web-verify only on user-flagged questions or when uncertainty is high. | Low | Full |
| `time_bound` | Use training-data knowledge if a quick answer exists; web-verify only when the cost of being wrong exceeds N minutes of rework. | Medium | Custom — for users who want a heuristic instead of a default |
| `complexity_bound` | Use training-data knowledge for routine decisions (file structure, idiomatic syntax); web-verify when the decision is irreversible or has architectural consequence. | Medium | Custom |

The Lite/Standard default of `best_practice_first` traded against `token_frugal` is a deliberate inversion: non-experts benefit more from current-best-practice (the framework leans on the web for them) and have less ability to flag what needs verifying. Experts know what they know; they save tokens by not re-verifying it.

### 4.7 Escalation triggers — `escalation`

Controls when the agent stops and asks rather than self-correcting.

| Value | Trigger | Default for |
|---|---|---|
| `time_box_2x` | Surface if any stage runs >2× its time-box estimate | Standard |
| `time_box_strict` | Surface if any stage runs >1.5× its time-box estimate | Lite (catch sprawl early when ceremony is low) |
| `iteration_3` | Surface after 3 self-correction iterations (current default) | Full |
| `iteration_2_for_integration` | Surface after 2 iterations for cross-stack integration bugs (current default) | All tiers — this is non-tunable; it's a hard signal |

### 4.8 Hook enforcement — `hook_enforcement`

Controls whether SessionStart hooks auto-load the read-first list (vs. honor system).

| Value | Behavior | Default for |
|---|---|---|
| `enforced` | SessionStart hook reads the read-first files and injects them into context | All tiers (recommended) |
| `advisory` | Read-first list is documented but not auto-loaded; agent reads on its own | Custom — only if the user wants to opt out |
| `disabled` | No hooks; pre-Claude-Code-hooks behavior | Discouraged |

Default is `enforced` for all tiers because honor-system compliance is a known reliability concern. The hook loads the files; the agent doesn't have to remember to.

### 4.9 Explanation mode — `explanation_mode`

Controls how much the agent narrates what it's doing during a stage.

| Value | Behavior | Default for |
|---|---|---|
| `verbose` | The agent explains its reasoning before every non-trivial decision; states why it picked a library/pattern/approach; calls out reversible vs irreversible choices. | Novice expertise |
| `standard` | The agent narrates significant decisions; routine implementation details are silent. | Intermediate expertise |
| `terse` | The agent works as written in the playbook — minimal narration; surfaces results, not thinking. | Expert expertise |

Verbose mode is the "highly explanatory" default for novices. The cost is more text in every session; the benefit is a user who learns the framework and the stack as they ship, instead of guessing why the agent did what it did.

### 4.10 Verifier mode — `verifier_mode`

Controls whether the Verifier stage (Stage V — fresh-context contract-fidelity check between work stages and closeout) runs, and which passes execute.

| Value | Passes | Default for | Catches | Misses |
|---|---|---|---|---|
| `skip` | None | (manual override only) | — | All contract bugs; not recommended |
| `pass_1_only` | Inventory | Lite tier | "We forgot to ship file X" | Wire bugs, concurrency, runtime/visual |
| `pass_2_4` | Hooks + Behavior (+ Security + Code-quality; + Design when `deliverable_type: web`) | Standard tier | Wire mismatches, runtime/visual bugs, vulns, dead code, off-brief UI | Concurrency / multi-call invariants. No Inventory pass — §X.2 is advisory at Standard (a missing whole file still surfaces in Hooks/Behavior) |
| `pass_1_2_3_4` | Inventory + Hooks + Multi-call invariants + Behavior | Full tier | All of the above + state-machine bugs, single-use leaks, concurrent-access bugs | Project-specific concerns (security, perf, etc.) |
| `pass_1_2_3_4_plus` | All four + project-specific passes named in `docs/gates.md` | Full tier with audit/security/perf gates | Tier-conditional: whatever the gate matrix demands | — |

**Pass 4 requires a project-provided harness** (Vitest+jsdom for renderer, headless Tauri for IPC, etc.). The harness must be named in `docs/gates.md` for Pass 4 to enforce. If absent, Pass 4 surfaces 🟡 with explicit "no harness" caveat in findings rather than silently passing.

**The D.fix ↔ V loop** has a bounded convergence: max 2 fix iterations per milestone; the third 🔴 round escalates to the maintainer. If a D.fix introduces a 🔴 outside the originally-scoped finding, that's a structural signal — stop iterating, consider re-tiering the milestone scope.

**Interpretation waivers** when build agent disputes a 🔴 finding go through the existing ADR machinery at `docs/adr/NNNN-waiver-M[NN]-finding-N.md`. No parallel artifact class.

### 4.11 Refactor mode — `refactor_mode`

Controls the cadence of **Stage R** (the refactor health check — a second fresh-context stage parallel to Stage V, asking "is the code maintainable?" instead of "did the code do what was promised?"). Stage R is the framework's 4th stage-prompt schema (`<refactor_stage_prompt>`, `STAGE-PROMPT-PROTOCOL.md` §8.6).

| Value | Cadence | Default for |
|---|---|---|
| `skip` | Stage R never runs | Lite |
| `trigger_n5` | Run when `docs/tech-debt.md` has ≥5 entries OR every 3 milestones, whichever comes first | Standard |
| `trigger_n3` | Run when `docs/tech-debt.md` has ≥3 entries OR every 2 milestones, whichever comes first | Full |
| `trigger_n2` | Tighter trigger for high-churn codebases | Custom |
| `every_milestone` | Run after every Verifier pass | Custom |

**Trigger thresholds are hypotheses, and data-tunable.** They ship with the default values (Standard `n5` / Full `n3`); refine them from real-world tech-debt accumulation rate once a Standard-tier project has completed M01–M03 with closeouts. The trigger is **OR-shaped**: whichever of the tech-debt count *or* the milestone interval fires first runs Stage R — the calendar fallback prevents indefinite deferral on a codebase nobody's logging debt for; the count reacts to actual debt on a codebase that's rotting faster than the interval.

**Cadence is trigger-based, not calendar-only.** Stage R reads `docs/tech-debt.md` for the entry count at each milestone boundary (after the Verifier pass) and compares against the threshold; the milestone interval is the fallback. When it fires, run it in a fresh `refactor`-mode session (the `.claude/role` mechanism Stage V uses, with the stricter read-first list — `read-first-list-refactor.txt` omits prior retros **and** prior R findings).

**Three passes**, tier-conditional (default; the `<refactor_passes>` block in the Phase doc's Stage R section is authoritative per project):

- **Duplication** — ≥3 similar code blocks overdue for extraction ("wait for the fourth" → acceptable at 2, flagged at 3+).
- **Complexity** — functions over the cyclomatic (default 15) or length (default 80 lines) threshold; needs a linter integration named in `docs/gates.md`, else manual analysis with a 🟡 caveat.
- **Drift** — dead code, dead dependencies, version drift, schema drift.

Tier-conditional pass selection:

- **Lite:** Stage R skipped entirely (`skip`).
- **Standard:** Duplication + Drift (add Complexity only if a linter integration is named in `docs/gates.md`).
- **Full:** Duplication + Complexity + Drift + project-specific passes from `docs/gates.md`.

**Severity + the D.refactor loop.** 🔴 (rare — blocks the next milestone PR, only when the issue compounds per-milestone or risks data loss/security) opens a `D.refactor` stage; **the Verifier re-runs after the refactor** (to confirm contracts didn't break), then Stage R re-runs (to confirm the structural issue closed). Max 2 D.refactor iterations per milestone; the third escalates. 🟡 opens a D.refactor before the next milestone; 🟢 appends to `docs/tech-debt.md`. Hard gate **G7** (`PROCESS-VALIDATION.md`) verifies Stage R ran with fresh context when triggered. Mirrors `verifier_mode` (§4.10) by design — same machinery, different question.

### 4.12 Operating mode — `operating_mode` *(all four values implemented)*

> **Status: all four values are live.** `greenfield`, `bug_fix`, `research_publish`, and `audit` are implemented — the operating-modes track is complete.

Determines what kind of work the framework supports. Orthogonal to tier (which determines ceremony level):

| Value | Status | Use case |
|---|---|---|
| `greenfield` | **Implemented (default)** | Build something new from scratch. Milestones with stages. |
| `bug_fix` | **Implemented** | Fix a known bug in existing code. Three short phases: reproducer + impact analysis → minimal fix → single Verifier pass. No milestones. |
| `research_publish` | **Implemented** | Synthesize literature or data into a paper + interactive illustrative app. Hybrid: research phase (Phase R) always Lite *process*, app construction phase (Phase A) re-tiers. Grounded STORM: every claim binds to a logged source — no source → no claim. |
| `audit` | **Implemented** | Review an existing codebase for security / performance / architecture / compliance. Inventory → triage → per-dimension passes (per-file sign-off) → fresh-context challenge → consolidation. **No milestones, no Stage V — audit *is* verification** (the existing codebase is the spec). |

**The audit calibration (`audit`, `BUILD-PLAYBOOK.md` §3.8).** Audit produces a findings report + remediation backlog, not new code, so it has **no milestones and no Stage V** — per-file sign-off (G_AUDIT_P1) and the fresh-context challenge (G_AUDIT_C1) are its internal verification. The tier dial selects **how many of the 8 dimensions run** (the pass-selection calibration), not how much milestone ceremony:

| Tier | Dimensions audited | Setup + challenge |
|---|---|---|
| Lite | **1–2** (e.g., just security, just performance) | Skip S2 triage; skip the challenge. A quick health check. |
| Standard | **3–4** of the 8 | Full setup (inventory + triage + plan); challenge the security-focused passes. |
| Full | **all 8** | Full setup; challenge every pass; consolidation produces a ranked remediation backlog. |

**`audit_multi_model: false | true`** *(default `false` — Path A)*. Path A (the shipped default) runs a **single model** (stock Claude Code) with the bias guard preserved by **fresh context**: each challenge review (G_AUDIT_C1) runs in a fresh session reading only the prior pass's output. **Path B** (`true`) is the **future multi-model SDK route** — a custom wrapper orchestrating Claude + (optionally) another model per pass for model-level blind-spot diversity; it needs non-trivial deployment infrastructure and is deferred until Path A proves the workflow. Leave at `false` unless you have wired the SDK path yourself.

**The hybrid calibration (`research_publish`).** `research_publish` is intrinsically two-phase, and the tier dial does **not** apply uniformly. **Phase R** (research; the grounded-STORM steps R1–R5) is **Lite-process-locked regardless of the project tier** — no milestones, no per-stage retros, no Stage V — **except** the one mandatory ledger it always keeps, the sources registry (`docs/sources/registry.md`). Over-formalizing research destroys its discursive quality; the discipline lives in the app phase. Only **Phase A** (the interactive app) re-tiers — to whatever the findings-to-illustrate warrant — and inherits that tier's full scaffold **+ Stage V**. The Phase-R→Phase-A re-tier is an **explicit user event, never automatic**. So a Standard project runs Phase R at Lite process and Phase A at Standard; a Full project runs Phase R at Lite process and Phase A at Full. The `G_RP_R*` gates (`PROCESS-VALIDATION.md`) are checked under Phase R's Lite process at every tier; the `G_RP_A*` gates under Phase A's re-tiered ceremony.

**The axis boundary.** `operating_mode` (work-*shape*) is **project-scoped** — set once at calibration, lives in `project-config.md`. It is orthogonal to and does **not** subsume the session-scoped 3-brain `role` (`.claude/role`, value set `{work, verifier, orchestrator, refactor}`). The SessionStart hook composes the read-first list from both: `operating_mode` picks the list *family*, `role` picks the bias-guard *variant*, most-specific-wins (`read-first-list-<op>-<active>.txt` → `read-first-list-<op>.txt` → `read-first-list-<active>.txt` → `read-first-list.txt`). Operating modes add read-first **lists** and **phase shapes** — never new `role` values.

The calibration interview asks a **leading question** ("what kind of work is this?") that determines the mode before tier/expertise/approval cadence. A pre-commit value check (`validators/validate-operating-mode.cjs`) fails any `project-config.md` whose `operating_mode` is outside the four values.

### 4.13 Verbosity — `verbosity` (meta-dial)

One user-facing knob that sets the four narration/surfacing behaviors together, so you don't tune them individually. Each derived toggle remains individually overridable in `project-config.md` — `verbosity` just provides the sensible default bundle.

| Value | Sets | For |
|---|---|---|
| `terse` | `explanation_mode: terse`, `web_verify: on_request`, `pre_write_surface: none`, retro narration minimal | Expert expertise / Lite tier |
| `standard` | `explanation_mode: standard`, `web_verify: always`, `pre_write_surface: spec_and_plan_only`, retro narration normal | Intermediate / Standard tier |
| `verbose` | `explanation_mode: verbose`, `web_verify: always`, `pre_write_surface: always`, retro narration full | Novice / Full tier |

**`pre_write_surface`** is the new sub-toggle this introduces (the fix for the "surface every draft then rewrite it" token waste): `always` (surface every artifact before writing — the old hard-rule-#1 behavior), `spec_and_plan_only` (surface the spec and milestone plan pre-write; write scaffold + Phase docs directly with post-write review), `none` (write-then-review everything). Default `spec_and_plan_only` at Standard. Bootstrap hard rule #1 reads this toggle rather than mandating surface-everywhere.

Default `verbosity` follows expertise first, then tier: Novice → verbose, Expert → terse, otherwise → standard.

### 4.14 Verification locus — `verification_locus`

Controls **where** the test suite actually runs — on local hardware vs. GitHub-hosted cloud runners. Orthogonal to tier (ceremony) and `operating_mode` (kind of work): locus answers "where does verification execute, and what does it cost." The motivating constraint is **private-repo GitHub Actions cost** — hosted minutes are metered (Free 2,000 / Pro 3,000 / Team 3,000 per month) and macOS bills at ~10× the Linux rate, so a naive 3-OS matrix on every push is what exhausts the quota.

| Value | Where tests run | Cloud minutes | Default for |
|---|---|---|---|
| `cloud` | GitHub-hosted matrix on every push/PR (the conventional setup). | Highest (free on public repos) | Public repos; or private repos willing to pay for the simplicity |
| `local_first` | Full suite runs locally (Linux-in-Docker + dev-OS-native) at pre-push; cloud runs **only** on version tags. No PR cloud check. | Near-zero | Cost-maximizers who pair it with a self-hosted backstop, or accept honor-system on PR |
| `hybrid` (default) | Full suite local at pre-push **plus** one cheap hosted `ubuntu` PR smoke check (the non-bypassable tripwire) **plus** the full matrix incl. macOS on version tags. | Low | All tiers when the project has a GitHub remote |

**The local-first inversion.** Conventionally CI is the source of truth and the backstop against `--no-verify`. Under `local_first` / `hybrid`, **local hooks are the primary verification** and the cloud shrinks to a tripwire (`hybrid`) or release-only (`local_first`). This is sound only if a non-bypassable check still exists somewhere — which is why `hybrid` keeps the PR smoke check: `--no-verify` skips the *local* hook but can never skip a *required status check*. Don't run `local_first` with no self-hosted runner AND no PR check — that leaves no backstop at all (see §8 smell).

**What it generates** (Phase 3 scaffold): `scripts/verify-local.cjs` (the one local entrypoint — Linux-in-Docker + native, sequential, non-zero on any failure), `.githooks/pre-commit` (fast checks) + `.githooks/pre-push` (the full local matrix), `scripts/install-hooks.cjs` (sets `core.hooksPath`), and — for `hybrid` — `.github/workflows/pr-smoke.yml` + `.github/workflows/release.yml` (macOS + full matrix on `v*` tags only). The macOS release leg is emitted iff the Phase-0 OS-target audit finds a macOS ship target in packaging config. Under `cloud`, none of the local harness/hooks generate — instead `.github/workflows/ci.yml` runs the full matrix on every push/PR (free on public repos).

**Backstop sub-choice.** The default backstop is the hosted `ubuntu` PR smoke check (zero maintenance, ~free against the quota). A **self-hosted runner** is a documented opt-in (`pr-smoke.self-hosted.yml.example`) that drops cloud cost to $0 by running the full suite on the dev box — at the cost of keeping that box online to gate PRs, basic runner hardening, and private-repo-only use. (Self-hosted minutes are free/unmetered as of 2026, though GitHub has signalled intent to meter the control plane (~$0.002/min), currently postponed — so treat $0 as current-but-at-risk; worst case ~pennies/PR.)

**macOS / desktop builds (e.g. Electron).** Producing a signed + notarized macOS artifact genuinely needs a macOS runner and can't be localized on Windows/Linux hardware — so it lives in `release.yml` on tags, the one bounded place macOS minutes are spent. Most Electron *verification* (renderer, main-process, IPC tests) is OS-portable and stays local. See `BUILD-PLAYBOOK.md` §0.6.

Default: `hybrid` for private repos; **`cloud` for public repos** (Actions are free + unlimited there). Surfaced as **Choice 5** in the calibration interview (`templates/CALIBRATION-INTERVIEW.md`), and often proposed from repo visibility + the macOS-ship audit — the user confirms or overrides.

### 4.15 Off-track check — `off_track_check`

Controls the **priority-drift guard** — the recurring "are we building the right thing next?" check that compares the work built (and proposed) against the ranked `docs/backlog.md`, flagging an unjustified **priority inversion** (a lower-ranked story built ahead of a higher-ranked backlogged one with no logged build-sequence necessity). Orthogonal to `verifier_mode` (did the code match its contract?) and `refactor_mode` (is the code maintainable?): this asks whether the chosen work was the *right work to choose*. Gate **G8** in `PROCESS-VALIDATION.md` §9.

```
off_track_check: brief | advisory | enforced
```

| Value | Mandatory paths | Log | Enforcement | Default for |
|---|---|---|---|---|
| `brief` | Per-stage off-track line in the brief retro + a one-line closeout sanity check | One-line note in `CHANGELOG.md` (no separate log) | Advisory only | Lite |
| `advisory` | Per-stage line (mandatory) + full closeout check | `docs/off-track-log.md`, append-only **advisory** (honor-system) | Surfaced; a standing unjustified inversion is a closeout warning | Standard |
| `enforced` | Per-stage line + full closeout check (+ optional fresh-context audit) | `docs/off-track-log.md`, append-only **CI-enforced** (joins the `append-only-ledger.yml` set) | **G8 hard gate**: a standing unjustified inversion blocks the milestone PR | Full |

Defaults: **Lite = `brief`, Standard = `advisory`, Full = `enforced`** (a new toggle ships with a default per tier so existing projects don't break on upgrade — §9). The **`/on-track` command is available at every value** — the toggle governs only the *mandatory* paths and the gate, never the on-demand review. Both clauses of G8 hold regardless of value: no unjustified inversion, and `docs/backlog.md` is HITL co-authored (no AI-only re-rank, status flip, scope change, or `Depends on` edit reaches the committed doc — that clause is what keeps "off track" falsifiable).

### 4.16 App-Map generation — `app_map`

Controls whether the project maintains **`docs/app-map.md`** — a living, surface-organized record of *what user-facing surfaces shipped and exactly how to drive and test each one*, bound to test-ids so it cannot drift from the running app. It serves two readers: the **user** (what exists and how to exercise it) and the **build-time LLM** (a drive/test cheat-sheet loaded at session start, so it can say *what and how to test* without re-reading the repo).

```
app_map: skip | on
```

The map is **not gated to `web`** — the entry shape and the test-id-binding invariant are universal; only the surface/gesture **vocabulary** adapts to the deliverable's derived **surface class** (`ui` / `command` / `endpoint` / `api`). The surface class is derived from `deliverable_type` + description, *not* a new first-class type.

| Value | Behavior | Default for |
|---|---|---|
| `skip` | No `docs/app-map.md`. A brief paragraph in README/CHANGELOG covers the rare Lite case. | Lite (all types); `library` (`api` surface class) at any tier |
| `on` | `docs/app-map.md` generated + maintained: per-stage delta (build), drive/test script (Verifier), whole-map reconcile (closeout); currency enforced by `validators/validate-app-map.cjs` (test-id binding + surface-source tripwire). | Standard+ for the **drivable** surface classes (`ui` / `command` / `endpoint`) |

**Per-tier / per-type defaults: Lite = `skip`; Standard+ = `on` for the drivable surface classes (`ui` / `command` / `endpoint`); `library` (`api`) = `skip` (the opt-in degenerate case — a library's API surface already lives in the spec API section + unit/contract tests, so the map pays off only if the owner asks for it).** A new toggle ships with a default per tier so existing projects don't break on upgrade (§9). The currency check treats `State: verified` (a green test-id backs it) and `State: manual-only` (human-asserted, no e2e yet) differently — it never forces e2e for every surface. The surface-source tripwire's only escape is a logged `app-map-unchanged: <reason>` token — never a silent skip, never `--no-verify`.

### 4.17 Test-honesty — `test_honesty`

Controls the **G9 test-honesty gate** — the structural form of "tests prove *effectiveness*, not presence." It enforces two things on the **staged** diff, **risk-tiered** (keyed off the stage's *declared* risk surface, never a blanket mutation score) and **incremental** (the staged set, not the whole suite): **(a)** a **v1.7+** work-stage Phase doc carries a `<test_honesty>` slot — a named mutation-killing test for each enforcement/security/destructive surface it touches, or the explicit `n/a — no risk surface` sentinel (a silent omission blocks); **(b)** no staged test is **assertion-free / exception-only** (a test that proves nothing). Gate **G9** in `PROCESS-VALIDATION.md`; enforced by `validators/validate-test-honesty.cjs`.

```
test_honesty: warn | block
```

| Value | Slot omission (a) | Assertion-free test (b) | Default for |
|---|---|---|---|
| `warn` | Advisory (NOTE, non-blocking) | Advisory (NOTE) — the heuristic's residual false-positive rate is absorbed here | Lite, Standard |
| `block` | **Blocks the commit** | **Blocks the commit** | Full |

Defaults: **Lite = `warn`, Standard = `warn`, Full = `block`** (a new toggle ships with a default per tier so existing projects don't break on upgrade — §9). The validator runs the same way at every value; the toggle only routes severity (the generated pre-commit / CI passes `--warn` under `warn`). **Grandfathered regardless of value:** the slot requirement applies only to docs declaring `**Protocol version:** v1.7`+ — pre-v1.7 docs and any banner-less doc are never retro-failed. G9 is the **effectiveness** layer on top of the coverage gates (coverage proves *executed*; the mutation proves *caught*) — they compose, neither replaces the other.

### 4.18 Assembled-execution cluster-gate — the G10 trigger list (derived, not toggled)

Controls the **G10 cluster-gate** — the structural form of "unit/component green **cannot** approve a runtime surface." Unlike the toggles above this is **not a discretionary switch**: it is **keyed off the derived surface class** and is **mandatory** wherever it arms — *risk overrides tier*, so tier is the floor and a runtime/drivable surface raises it at Standard and Full alike. Gate **G10** in `PROCESS-VALIDATION.md`; enforced by `validators/validate-app-map.cjs` (the App-Map Evidence binding) + the `assembled_execution` Verifier pass (`STAGE-PROMPT-PROTOCOL.md` §8.5).

**The visible trigger list — which surface classes arm G10:**

| Surface class / condition | G10 | Why |
|---|---|---|
| `ui` (web / electron / tauri / react-native / mobile / desktop / TUI) | **armed** | a visual/runtime surface — *visible ≠ mounted*; only driving the real app proves behavior |
| `command` (cli) | **armed** | the command must actually run end-to-end, not just unit-pass its parser |
| `endpoint` (service) | **armed** | the route must actually serve, not just unit-pass its handler |
| **destructive / packaging / real-provider** risk surfaces | **armed** | the assembled run is the only proof a restore/installer/provider-call behaves |
| `api` (library) | **n/a** | the public API's test-id binding (unit/contract) is sufficient — no assembled surface to drive |

**Visible, never silent.** When the gate arms, the run states *"cluster-gate armed because surface class = X"*; when it is n/a, it says so; when the class is undeclared, it emits a note rather than silently passing (mirrors the visible-risk-trigger principle). The arming key is the App-Map's `surface class:` stamp (or `--surface-class`). A `verified` drivable App-Map entry with no assembled-execution **Evidence** reference → G10 RED — necessary-not-sufficient: it **stacks on** the coverage/unit gates and the test-id binding, never replaces them.

### 4.19 Risk overrides tier — the enumerated risk-trigger list + the fail-closed standard

Controls the **G11 risk-escalation gate** — the structural form of *"tier is the floor; a declared risk surface raises oversight above it, visibly."* Like §4.18 this is **not a discretionary toggle**: a project records the risk surfaces it touches in `project-config.md`'s `risk_triggers:` field, and each declared trigger **must** carry a visible escalation record or the commit BLOCKS. Gate **G11** in `PROCESS-VALIDATION.md`; enforced by `validators/validate-risk-escalation.cjs` (+ Stage V's under-declaration plan-challenge as the adversarial half).

**The visible, enumerated risk-trigger list** — the six surface categories that auto-escalate verification depth + approval cadence **regardless of tier**:

| # | Risk trigger (`risk_triggers:` token) | Why it's a trigger | What it forces |
|---|---|---|---|
| 1 | **destructive data ops** (`destructive_data_ops`) — replace / import / restore / migrate / delete, **and the DB-destructive verbs** truncate / drop / wipe / purge / reset | irreversible data loss if wrong; the unconfined-restore class | deep verification (assembled-execution drive of the real op) + the challenge-and-response approval |
| 2 | **archives / backup-restore / extraction** (`archive_extraction`) — unzip / untar / backup restore | zip-slip path-traversal (canonicalize-then-confine); CVE-2025-62156 class | confinement test against a real hostile path + deep verification |
| 3 | **filesystem writes from untrusted metadata** (`untrusted_fs_writes`) — a path/name derived from input | path traversal / overwrite outside the intended subtree | canonicalize-then-confine + confinement test |
| 4 | **credentials / provider config** (`credentials`) — secrets, tokens, provider keys | secret exfiltration / privilege escalation | deep verification of the auth/secret surface + the approval checklist |
| 5 | **generated / untrusted HTML or executable content** (`untrusted_html`) — rendered HTML, eval'd code | XSS / arbitrary code execution | deep verification (injection/XSS attack-surface pass) |
| 6 | **installers / updaters / release artifacts** (`installers`) — packaging, auto-update, signed binaries | supply-chain / unsigned-binary ship (the release ladder) | deep verification (assembled installer run) + the approval checklist |

**Risk overrides tier — and the escalation is VISIBLE.** A declared trigger raises verification depth + approval cadence above the tier floor, and the raise **states its reason** in `docs/gates.md` using the canonical visible-rationale token **`deep verification because:`** bound to the trigger on the same row (e.g. `| destructive_data_ops | deep verification because: irreversible restore — assembled-drive + per-stage approval |`). A **silent raise** (a depth number with no stated reason) fails the rule — the human must see *why* oversight rose. The mechanical floor (`validators/validate-risk-escalation.cjs`, G11) blocks a declared trigger with no such record; the adversarial half (Stage V) challenges *under-declaration* — a destructive/credential/untrusted-HTML surface that declared no trigger to stay at the tier floor.

**The fail-closed standard.** Every enforcement path errors → **block**, never a silent pass: a validator that cannot compute its answer exits non-zero, never 0. G11 itself is fail-closed with a no-false-positive asymmetry: a *declared* trigger whose `docs/gates.md` is unreadable exits non-zero, but a *no-trigger* project never reads it (a Lite project with no `gates.md` is not falsely failed). Presence-gated does **not** mean fail-open (the honest limitation is documented in the validator header; Stage V is the adversary that closes the under-declaration escape).

**Severity / the toggle** (mirrors §4.17): `risk_escalation: warn | block` — `--warn` advisory (Lite/Standard default, shipped in the template pre-commit), `block` enforced (a Full project removes `--warn`). The fail-closed source-unreadable branch (exit 2) is never downgraded by `--warn`.

### The risk-properties matrix — what each declared surface must prove (G13)

Where the trigger list above answers *which* surfaces are risky, the **risk-properties matrix** answers *what dangerous properties* each one has. A capability that hits a trigger declares a `<risk_declaration triggers="…">` carrying the **bounded nine** (the fixed set — the verifier challenges against *these*, not arbitrary invented threats; `STAGE-PROMPT-PROTOCOL.md` §7):

| Property | What the plan + a test must prove |
|---|---|
| **normal** | the happy path produces the intended result (round-trip / success case) |
| **hostile-input** | malformed / adversarial input is rejected, not mis-processed |
| **partial-failure** | a crash mid-operation leaves a consistent state (no half-write) |
| **confinement** | writes/extractions stay inside the intended subtree — canonicalize-then-confine, **never** a bare `startsWith` (§4.18, `style.md`) |
| **authorization** | the authority the op exercises is the least required, and checked |
| **resource-bounds** | size / count / time is capped (no zip-bomb, no unbounded restore) |
| **recovery** | the op is undoable on failure (rollback / write-temp-then-rename) |
| **observability** | a failure is logged / surfaced, not silently swallowed |
| **cross-platform** | path / encoding / line-ending behavior holds on every target OS |

Each property is either `covered-by: <how> — test: <name>` (names a covering test) or an explicit `n/a — <reason>`. **`validators/validate-risk-matrix.cjs` (G13)** blocks a declared surface that omits a property or names no covering test (AND-ed across all 9, presence-gated; Stage V's plan-challenge is the adversary that judges whether the coverage is *real*).

**Per-trigger property defaults — which properties each trigger must especially not skip** (the matrix is always all-9; these are the load-bearing ones per trigger, and the **confinement vs recovery** distinction in particular):

- **destructive data ops** (incl. truncate/drop/wipe/purge/reset) → **recovery** (rollback-on-failure, the data is restorable) is the load-bearing one; a *rollback-only* data op (a `DELETE` in a transaction) leans on **recovery**, not confinement.
- **archives / extraction**, **untrusted-metadata fs-writes** → **confinement** (a path-traversal op leans on confinement — canonicalize-then-confine — distinct from recovery): zip-slip stays inside the subtree.
- **credentials / provider config** → **authorization** + **observability** (no secret leaked to a log).
- **untrusted HTML / executable content** → **hostile-input** (injection/XSS rejected).
- **installers / updaters / release artifacts** → **partial-failure** + **cross-platform** (a half-applied update is recoverable; the installer runs on every shipped OS).

A **rollback-only** op (transactional delete) and a **path-confinement** op (archive extract) are distinguished precisely by which of **recovery** vs **confinement** is load-bearing — G12 tests *both* for a destructive surface; the matrix names which the *plan* must center.

**Severity / the toggle** (mirrors §4.17): `risk_matrix: warn | block` — `--warn` advisory (Lite/Standard default, shipped in the template pre-commit), `block` enforced (Full). The fail-closed staged-enumeration branch (exit 2) is never downgraded by `--warn`.

### 4.20 Transitions — the release-state ladder, atomic state, honest rework (G15)

Controls the **G15 transition gate** — the structural form of *"a 'released' claim is the most load-bearing transition a project makes, and today it races and lies."* Gate **G15** in `PROCESS-VALIDATION.md`; enforced by `validators/validate-transition.cjs` (+ Stage V as the adversary for a raced/under-counted transition).

**The six-state release ladder.** "Released" is not one undifferentiated claim — it is a sequence of **separately-gated** states, recorded in the append-only `docs/release-state.md` (which joins the `append-only-ledger.yml` LEDGERS set):

| # | State | Gate the transition must pass |
|---|---|---|
| 1 | `stage-complete` | the stage gates + the stage retro `[END]` |
| 2 | `milestone-complete` | Stage V Sound + Stage E closeout (count + rework reconcile) |
| 3 | `internally-usable` | assembled-execution (G10) on the drivable surfaces |
| 4 | `source-release-ready` | the full local matrix (`scripts/verify-local.cjs`) + secret scan |
| 5 | `packaged-release-ready` | `release.yml` builds + **cites its SLSA build level** (≥ L2) |
| 6 | `public-distribution-ready` | the capability-triggered independent whole-product review (when triggers declared) + the SLSA cite (G16) |

The **release end is SLSA-mapped** (states 5–6 cite their [SLSA build level](https://slsa.dev) — default floor **Build L2** via `actions/attest-build-provenance`, **L3** the documented upgrade), so the transition that says "distributable" is the one that proves provenance — never a cover for unsigned binaries / untested installers.

**Atomic durable-state writes.** Every transition that writes a durable-state file (the `.claude/role` / `.claude/stage-active` markers, or a `*-state.md` ledger) uses **write-temp-rename** (write a temp file → atomically rename it over the real path), never truncate-then-write. Fail-safe by construction.

**Honest rework (DORA's 5th metric, project-internal).** Rework is counted across the **four fixed types** — implementation corrections / verifier iterations / IRL reversals / post-merge discoveries — never a lump sum, never "0" while fix commits exist. The total **reconciles** against the fix-commit evidence by **extending** the reconciliation primitive (`recomputeCount`), not by forking a parallel count. The fix-commit count is a **lower bound**, so honest over-reporting passes; only under-reporting is the lie.

**Severity / the toggle** (mirrors §4.17): `transition: warn | block` — `--warn` advisory (Lite/Standard default, shipped in the template pre-commit), `block` enforced (a Full project removes `--warn`). The fail-closed branch (an unreadable transition file / a git error → exit 2) is never downgraded by `--warn`.

### 4.21 Release-readiness — the capability-triggered review + SLSA provenance (G16)

Controls the **G16 release-readiness gate** — the structural form of *"`public-distribution-ready` is the most load-bearing transition a product makes, and a milestone re-read shares the builder's blind spots."* Gate **G16** in `PROCESS-VALIDATION.md`; enforced by `validators/validate-release-readiness.cjs` (+ the independent audit-mode review and the build-time attest step as the adversarial halves).

**Three clauses on the `docs/release-state.md` ladder** (each a no-op on an entry that does not reach a gated state):

1. **Capability-triggered independent review.** A `public-distribution-ready` entry, **when the project declares `risk_triggers:`** (the §4.19 capability list — secrets / untrusted files / destructive persistence / privileged APIs / generated executable content), must cite an **independent whole-product review record** — a fresh reviewer's own threat model (the `audit` operating mode **repositioned as a release gate**, *not* a re-read of the milestone findings, EU AI Act Art. 14 risk-based oversight). A no-trigger project is a no-op.
2. **Ladder well-formedness.** No rung silently skipped — each ladder state between the `Prior state` and the reached state is climbed or explicitly exempted with the covered-or-n/a idiom (`<state>: n/a — <reason>`; a source-only deliverable with no packaged binary legitimately skips `packaged-release-ready`).
3. **SLSA level cited at the release end.** A `packaged-release-ready` / `public-distribution-ready` entry cites its [SLSA build level](https://slsa.dev) — default floor **Build L2** (`actions/attest-build-provenance`, free + one step, with `id-token: write` + `attestations: write` permissions), **L3** the documented reusable-workflow upgrade — or an explicit `n/a — <reason>`.

**Manual-aging (a flag, never a block).** Stale **manual-only / un-driven `verified`** App-Map surfaces are surfaced at the `public-distribution-ready` boundary — a never-driven surface must not be obscured by public distribution.

**The DUAL honest locus (neither half overclaims).** The validator proves the review **record is PRESENT** (not that the review was *good* — the audit-pass adversary's judgment, recorded at review time) **and** the SLSA level is **CITED** (not that **provenance was achieved** — proven at build time by `release.yml`'s attest step). Floor (validator) + adversary (the audit review + the build-time attest) = a real gate; neither alone is.

**Severity / the toggle** (mirrors §4.17): `release_readiness: warn | block` — `--warn` advisory (Lite/Standard default, shipped in the template pre-commit), `block` enforced (a Full project removes `--warn`). The fail-closed branch (an unreadable ledger, or a public-distribution entry whose trigger config is unreadable → exit 2) is never downgraded by `--warn`.

---

## 5. The active configuration file

Bootstrap installs `project-config.md` at the project root with the tier and toggle values chosen during Phase 0. Subsequent sessions read this file as part of the slow-evolving protocol layer (Layer 2 in `persistence-architecture.md`).

### Shape of `project-config.md`

```markdown
# Framework Configuration — <project name>

**Tier:** Standard
**Expertise:** intermediate
**Tier rationale:** ~3-week project, complexity score 3, low audit needs. Standard is the right default; can drop to Lite if scope shrinks.
**Expertise rationale:** comfortable with the stack but new to this framework.

## Active toggles

| Toggle | Value | Notes |
|---|---|---|
| approval_cadence | per_stage | |
| retro_depth | two_axis | |
| ledger | append_only_advisory | Will escalate to enforced if audit needs change. |
| web_verify | always | |
| read_first_cap | medium | |
| research_mode | best_practice_first | |
| escalation | time_box_2x | |
| hook_enforcement | enforced | |
| explanation_mode | standard | Intermediate expertise default. |
| verification_locus | hybrid | Local full suite at pre-push; one ubuntu PR smoke check; macOS + full matrix on tags only. |
| off_track_check | advisory | Priority-drift guard (G8): per-stage line + full closeout check against `docs/backlog.md`; `off-track-log.md` advisory. `/on-track` available regardless. |
| app_map | on | `docs/app-map.md` drive/test map (Standard+, drivable surface class). `skip` for Lite and `library`. Currency: test-id binding + surface-source tripwire. See §4.16. |

## Override log (append-only — drives the re-tier protocol)

- 2026-05-10: Initial bootstrap as Standard tier, intermediate expertise.
```

### How sessions consume it

Every fresh session reads `project-config.md` after `CLAUDE.md`. The toggle values change the agent's behavior:

- `approval_cadence: per_milestone` → the agent doesn't ask for stage-end approval; surfaces stage outputs but proceeds with subsequent stages without waiting.
- `retro_depth: brief` → the agent fills a one-paragraph retrospective instead of the full template.
- `ledger: none` → the agent doesn't generate or update `gap-analysis.md`; uses `CHANGELOG.md` only.
- `read_first_cap: small` → the agent reads at most 3–4 orientation files at session start, not the full 12-item list.
- `research_mode: token_frugal` → the agent skips web-verification for technical choices unless the user flagged the choice as "needs verification."

---

## 6. Cognitive load budget — why caps exist and how they scale

The read-first cap isn't arbitrary. Three forces constrain how many files an agent should load at session start:

1. **Context dilution.** Every file in the read-first list takes context-window budget. A 12-file orientation read can consume tens of thousands of tokens before a single line of code is written. The agent's working memory for the actual problem shrinks proportionally.
2. **Signal-to-noise.** Files that *might* be relevant get loaded "just in case." Most of them turn out not to apply to the active stage. The agent has to filter mentally; filtering itself consumes attention.
3. **Marginal value drops fast.** The first 3 files (CLAUDE.md, identity, active Phase doc) carry ~80% of the orientation value. Files 4–8 add useful context for medium-complexity stages. Files 9+ are usually defensive — included because someone, sometime, might need them.

Caps formalize the trade. The right cap depends on **project size + user expertise + stage complexity**:

| Project size | User expertise | Stage complexity | Suggested cap |
|---|---|---|---|
| Small (Lite) | Non-expert | Any | 3–4 |
| Small (Lite) | Expert | Any | 2–3 (expert knows what to skip) |
| Medium (Standard) | Non-expert | Routine | 5–6 |
| Medium (Standard) | Non-expert | High (cross-cutting) | 7–8 |
| Medium (Standard) | Expert | Any | 5–6 |
| Large (Full) | Any | Routine | 7–8 |
| Large (Full) | Any | High | 10–12 |
| Large (Full) | Any | Closeout (cumulative) | bounded closeout read list (ledgers + the milestone's artifacts + touched spec + cumulative diff; loud truncation) |

The cap is per-stage, not project-wide: a single stage in a Full-tier project can be capped at 5 files if its scope is narrow, while another stage in the same project might legitimately need 12.

**The closeout exception.** The closeout (Stage E) reads more than a work stage, but the cap is **not suspended** — it is replaced by an explicit **bounded closeout read list**: the append-only ledgers + the milestone's own artifacts + the touched spec sections + the cumulative diff. It is read under the same **loud-truncation** semantics as any capped list — a set over the cap truncates loudly, never silently. There is no "read everything / caps suspended" ceremony; the enumerated set lives in `BUILD-PLAYBOOK.md`'s closeout protocol.

---

## 7. Re-tier protocol — changing tier mid-project

You picked a tier at bootstrap. The project's needs may shift. Re-tiering is supported and cheap.

### When to re-tier upward (Lite → Standard, Standard → Full)

- Audit needs surface (e.g., the project gets adopted internally and now multiple teams depend on it)
- Complexity grows (new integrations, new modules, security boundary added)
- Time horizon extends (started as a 1-week prototype, now 3 months in)
- A friction event reveals the lighter tier is missing something (e.g., you can't reconstruct why a decision was made; you needed an ADR)

### When to re-tier downward (Full → Standard, Standard → Lite)

- The early milestones reveal the project is simpler than you thought
- The retrospectives are mechanical and not surfacing useful signal
- The audit overhead is paying for nothing you actually consult
- Honest assessment: you're skipping the discipline because it's not worth it (better to formally drop the tier than to silently violate it)

**In-flight downshift signal (mechanical trigger).** Downshift is as real a signal as upshift, but it's easy to miss because nothing prompts for it. The user friction stamp gives a concrete trigger: **two consecutive stages with a user-stamp `verdict: pass` AND zero friction events of severity ≥ 2** means the ceremony is costing more than it's returning. At the start of the next stage, surface a downshift recommendation ("last two stages were smooth with no real friction — consider dropping to the next tier down"). This is **advisory** — the agent raises it from the stamp data the pre-commit validator already requires; the user decides. (A stronger, mechanically-gated version is possible — have `validate-retrospective.cjs` write a `downshift-suggested` flag the SessionStart stamp surfaces — but it's deferred until the advisory path proves insufficient.)

### How to re-tier

1. Open `project-config.md`.
2. Change the `Tier` line.
3. Update toggles to match the new tier's defaults (or pick which old overrides to keep).
4. Append a dated entry to the override log explaining the change.
5. **Do not retroactively delete or re-format prior milestone artifacts.** Re-tiering changes future behavior, not history. Existing retrospectives, ledger entries, and Phase docs stay as they are; new ones follow the new tier.

A re-tier is itself an event worth a brief retrospective entry — name the trigger and the expected change in friction.

---

## 8. Toggle interactions and constraints

Some toggles only make sense in certain combinations. The bootstrap will warn (not block) on these:

- `ledger: append_only_enforced` + `hook_enforcement: disabled` is a smell — you're enforcing the ledger via CI but not enforcing read-first via hooks. Either you trust the agent or you don't.
- `approval_cadence: per_pr` + `retro_depth: three_axis` is a mismatch — you're saving review time at PR but spending it again on per-stage retrospectives. Pair `per_pr` with `brief`.
- `research_mode: token_frugal` + Lite tier is a smell — Lite is for non-experts who benefit most from web-verified best practices. If you're token-frugal *and* a non-expert, you're optimizing the wrong thing.
- `read_first_cap: small` + `retro_depth: three_axis` is a smell — you're skipping orientation reads but writing detailed retrospectives. The ratio is backward.
- `verification_locus: local_first` + no self-hosted runner + no PR smoke check is a smell — you've removed cloud verification entirely with nothing non-bypassable left, so a single `--no-verify` ships unverified code. Either keep the `hybrid` PR check or stand up a self-hosted backstop.

Bootstrap surfaces these on tier confirmation; you can override the warning if you have a reason.

---

## 9. What this file is *not*

- Not a checklist of every behavior the agent ever does. The playbook (`BUILD-PLAYBOOK.md`) defines behaviors; this file selects which ones are active.
- Not a substitute for human judgment. A toggle says "default to web-verifying"; the human still decides when a specific verification is wasteful.
- Not immutable. The toggle schema itself can evolve (add new toggles, retire stale ones) — but new toggles need a default mapping per tier so existing projects don't break on upgrade.
- Not a license to skip hard rules. The do-not-commit-without-approval rule, the no-`--no-verify` rule, and the no-push-to-main rule are tier-independent. Tiers calibrate ceremony, not safety.

---

## 10. Quick reference — what each tier *actually* asks of you

### Lite

- One discovery conversation (~15 minutes): what is this, what isn't it, success criteria.
- Bootstrap generates ~36 files: `CLAUDE.md`, `project-config.md`, `docs/identity.md`, `docs/scope.md`, `CHANGELOG.md`, `.gitattributes`, `.claude/` hook + read-first list + settings, the local verification harness (`scripts/verify-local.cjs`) + committed git hooks (`.githooks/`), the M01 markdown task doc.
- Per stage: agent codes, surfaces a brief retrospective paragraph, you approve at PR time.
- No append-only ledger. No formal ADRs (use commit messages). No cumulative closeout review.
- Web-verify defaults: agent leans on current best practices for library choices, version pins, idiomatic patterns.
- Total recurring overhead per stage: ~6–10 minutes of human review.

### Standard

- Five-question discovery (~30 minutes): identity, stack, scope, success criteria, distribution.
- Bootstrap generates ~68 files: identity, scope, gates, style, gotchas, sessions, tech-debt, gap-analysis (advisory append-only), ADR template, the orchestrator manual, retrospective/verifier/summary/Phase-doc templates, `.claude/` hooks + read-first lists + settings, the validator, the CI workflow, the local verification harness + committed git hooks, the pr-smoke + release workflows, `.gitattributes`, plus the Phase 1 spec and the M01 Phase doc. (Derived from the golden manifest's Standard reference calibration — see the counting note in `templates/CALIBRATION-INTERVIEW.md`.)
- Per stage: agent fills two-axis retrospective, surfaces at stage end, you review code + retrospective.
- Append-only ledger documented but not CI-enforced.
- Web-verify defaults: same as Lite.
- Total recurring overhead per stage: ~25–40 minutes of human review.

### Full

- Eight-question discovery (~60 minutes): full identity, stack, v1 scope, success criteria, distribution, license, naming, audit needs.
- Bootstrap generates ~69 files: the full Standard scaffold plus the CI-enforced append-only gap-analysis workflow, three-axis retrospective template, and any additional ADRs/harness config the audit-needs path requires.
- Per stage: agent fills three-axis retrospective with friction log, surfaces with cross-machine state, you review code + retrospective + (at closeout) gap-analysis entry.
- Append-only ledger CI-enforced.
- Web-verify on request: agent uses training-data knowledge by default, you flag what needs verification.
- Total recurring overhead per stage: ~60–90 minutes of human review.

The numbers are estimates. Your project will land where it lands. If a tier's recurring overhead is consistently 2× the estimate after the first milestone, that's a signal to re-tier — not to push through.

---

*End of `FRAMEWORK-CONFIG.md`. Read alongside `BUILD-PLAYBOOK.md` for the methodology this file calibrates.*
