# Calibration Interview — the first thing the bootstrap asks

> **Read this verbatim or paraphrase very lightly.** Surfacing the trade-offs explicitly is the whole point — the user shouldn't have to read `sbak/FRAMEWORK-CONFIG.md` to make an informed choice. This file is the canonical text the bootstrap agent presents at the start of a fresh starter-kit session, so the calibration is the same every time.
>
> The interview maps five user-facing choices to the internal toggles in `project-config.md`. The mapping table at the bottom of this file is for the agent, not the user.

---

## What the agent says first (verbatim)

> "I see the Software Build Assurance Kit. Before I start anything: first, **what kind of work is this?** — then five quick choices that change how I'll work with you. You can answer directly, or describe the project in 1–2 sentences and I'll propose a calibration with rationale.
>
> If you don't want to choose: I'll default to **greenfield + Standard + Familiar + Standard approval** — a safe middle you can re-tier later from `project-config.md` — infer the deliverable type from your description, and default to local-first (hybrid) verification (or cloud CI, which is free, if your repo is public)."

Ask the **leading operating-mode question first** (the table immediately below), *then* present the five calibration tables. Don't summarize them — the user benefits from seeing the trade-offs side by side. (The fourth and fifth — deliverable type and verification posture — are the ones most often inferred from the description and repo visibility rather than asked outright; show them so the user can correct the inference.)

**Presentation pacing + menu discipline (how the agent runs this interview).** Ask **one question per turn** — the mode question first, then each calibration choice with its table — and WAIT for the answer before presenting the next; never batch the whole interview into one wall of tables. Lead each question with **numbered recommendations** inferred from the repo and the user's description, so the user can answer **accept-by-number** or override in their own words. Numbered options draw ONLY from the documented dials in this file — **never offer to disable a named control** (a hook, a validator, a gate, the fence); skips are user-initiated only and carry their stated cost, restated in one line before the skip is honored.

---

## Operating mode (asked first) — What kind of work is this?

The **leading question**, asked *before* the five choices below. It sets `operating_mode` — the *kind* of work — which is orthogonal to tier (the *amount* of ceremony). The mode determines which discovery questions follow, which scaffold generates, and the top-level shape of the work. All four modes are live.

| Option | Means | Status | What it does |
|---|---|---|---|
| **Greenfield** (default) | Build something new from scratch. | **Live** | Milestones-of-stages, the full bootstrap. The framework's best-supported path. |
| **Bug fix** | Fix a known defect in existing code. | **Live** | A reduced 3-phase shape — reproducer + impact analysis → minimal scope-locked fix → single Verifier pass. Different discovery (reproducer / affected surface / blast radius), no spec/scope/milestones, a CHANGELOG one-liner instead of closeout. **Not a small build** — different discovery, deliverable, and rhythm. |
| **Research / publish** | Synthesize literature or data into a paper + interactive illustrative app. | **Live** | A hybrid two-phase shape — **Phase R** (grounded-STORM research, always Lite *process*, mandatory sources registry) → an **explicit user re-tier** → **Phase A** (the interactive app at the tier it warrants, inheriting Stage V). Different discovery (a research question, not a software spec); research is light, the app is engineered. |
| **Audit** | Review an existing codebase for security / performance / architecture / compliance. | **Live** | Inventory → triage → per-dimension passes (per-file sign-off) → fresh-context challenge → consolidation. The deliverable is a findings report + remediation backlog, **not new code**; the existing codebase is the spec, so there are **no milestones and no Stage V** (audit *is* verification). The tier sets the dimension count (Lite 1–2 / Standard 3–4 / Full all 8). |

> Verbatim ask: *"What kind of work is this? **Greenfield** (build something new), **bug fix** (fix a known bug in existing code), **research/publish** (synthesize literature into a paper + interactive app), or **audit** (review an existing codebase for security / performance / architecture / compliance)? If you're not sure, pick greenfield — it's the best-supported path."*

**Maps to:** `operating_mode` in `project-config.md` (`greenfield` / `bug_fix` / `audit` / `research_publish`). Default `greenfield`. A pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any value outside the four. The mode is **project-scoped** and orthogonal to the session-scoped 3-brain `role` — the SessionStart hook composes the read-first list from both.

**The mode determines which discovery questions follow.** `greenfield` runs the tier-conditional discovery set (`sbak/BUILD-PLAYBOOK.md` Part 0 — what is this / what isn't this / stack / v1 scope / success criteria). **`bug_fix` replaces that set** with **three bug-fix questions** (`OPERATING-MODES.md` §4.3) — it has no spec, scope, or milestones to discover:

1. **Bug description + reproducer.** Observed vs. expected behavior, and the exact steps to reproduce. A "sometimes" reproducer signals a concurrency- or environment-dependent bug — flag it.
2. **Affected surface.** Which file(s) the user believes contain the bug. "Unknown" is fine — Phase A traces from the reproducer to the cause.
3. **Blast radius.** What else a fix here might affect — the impact-analysis prompt. If unknown, the agent runs a fan-out grep as its first Phase-A action.

These three feed `docs/bugfix/<bug-id>.md` and route to `sbak/templates/BUGFIX-PHASE-DOC.md`; the close is a `CHANGELOG.md` one-liner, not a Stage E.

**`research_publish` also replaces the greenfield set** — with a **research-question discovery** (`OPERATING-MODES.md` §6). It has no software spec; the artifact discovered here is `docs/research-question-spec.md` (replacing `spec/project-spec.md`):

1. **Research question.** What is being synthesized? The one question the paper answers, plus what's explicitly in scope and out of scope. This is *not* "what to build" — Phase R discovers the perspectives and sources by search.
2. **Findings → app (the hybrid note).** A one-line sense of what an interactive app would *illustrate* about the findings — used only to set expectations. The actual `docs/findings-to-illustrate.md` is produced at the *end* of Phase R (the `G_RP_R2` handoff), and the app's tier is set at the **explicit re-tier** then — never now. **Research is light, the app is engineered:** Phase R always runs at Lite *process* (mandatory sources registry, no milestones/retros/Stage V); Phase A re-tiers and inherits Stage V.

These route to `sbak/templates/PHASE-R-DOC.md` (the grounded-STORM R1–R5 task list) → the inter-phase re-tier → a `sbak/templates/INTERACTIVE-APP-SCAFFOLD/` starter at the chosen tier.

**`audit` also replaces the greenfield set** — there is **no software spec to author; the existing codebase is the spec** (`OPERATING-MODES.md` §5). The discovery is a **scoping** conversation, not a "what to build":

1. **Which dimensions?** From the 8 — IPC, secrets, error-handling, data-flow, performance, packaging, compliance, architecture. The tier sets the default count: **Lite 1–2** (a quick health check), **Standard 3–4** (challenge the security passes), **Full all 8** (challenge every pass + a ranked remediation backlog). Picking all 8 at Lite is a smell (see below).
2. **Depth + any known-hot areas.** Where to concentrate (a subsystem, a recent incident's blast radius), and whether `audit_multi_model` should be left at its default `false` (Path A — single model, fresh-context challenges) or wired to Path B (multi-model via SDK; rarely).

These route to Phase S (inventory/triage/plan from `sbak/templates/audit/`) → the per-dimension `<audit_pass_prompt>` passes (`sbak/templates/audit/P1–P8`) → the fresh-context challenge → consolidation. There is **no Stage E closeout and no Stage V** — the consolidated `FINAL_REVIEW.md` + the append-only `docs/audit/findings-ledger.md` are the deliverable.

---

## Choice 1 — Project size / complexity

Drives how much process structure to layer on. Pick by the highest-pressure dimension across complexity, time, and audit needs (a 3-day regulated project is **Full**, not Lite).

| Option | When it fits | What you get | What you give up |
|---|---|---|---|
| **Lite** | A few hours to ~1 week. CLI tool, prototype, weekend script. You're the only future reader. | ~36 scaffold files. No append-only ledger. Brief retrospectives (one paragraph). Plain markdown task lists, no XML stage prompts. | Forensic audit trail. Multi-axis retrospectives. Cumulative milestone closeouts. |
| **Standard** | 1–4 weeks. Small web service, small product, library you'll maintain. You'll come back in 6 months and want context. | ~68 scaffold files. Two-axis retrospectives (process + product). Append-only ledger documented but not CI-enforced. XML stage prompts. | CI-enforced ledger immutability. Three-axis retrospectives with pattern-detection. |
| **Full** | Multi-week to multi-month. Multi-team, regulated, long-lived. Audit trail must survive years. | ~69 scaffold files. Three-axis retrospectives. Append-only ledger CI-enforced. Cross-machine state checks. Cumulative closeouts. | Lighter ceremony. Faster iteration on small changes. |

**Maps to:** `tier` in `project-config.md` — the option label *is* the tier value (Lite / Standard / Full); the vocabulary unified at I9 (no separate size-vs-tier mapping).

> **Scaffold-count note.** The per-tier counts above — and everywhere they appear (this file's confirmation line below, `README.md`, `sbak/QUICKSTART.md`) — are **derived**: the number of files rendered at the tier's *reference calibration* (greenfield · hybrid verification · non-web), computed by `scripts/golden-bootstrap.cjs` and published in `sbak/golden-manifest.json`. A real project varies with its toggles; these are the reference figures, not a promise. Don't hand-edit them — regenerate the manifest (`node scripts/golden-bootstrap.cjs --write-manifest`) and read the new counts.

### Standard is the default — the trade-off, plainly

Standard is the "don't know" default, and it isn't free — state the cost plainly, then downshift with eyes open if the task doesn't warrant it.

- **What Standard costs.** The ~68-file scaffold (vs. Lite's ~36), a review at every stage (~30 min/stage), and ~85k tokens (~64.6k words) of standing orientation the agent ingests at bootstrap — plus per-stage ceremony. On a small or throwaway task that overhead can dominate the work: Scott Logic clocked a spec-driven rebuild at 33 min / 2,577 lines of markdown for 689 lines of code, vs. 8 min iterating — ~10× slower, no quality gain (https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html).
- **What Lite gives up.** The gates, the fresh-context verifier, and the append-only audit trail — i.e., *most of why you'd pick this kit*. Lite is the honest low-ceremony escape hatch (~36 files, CHANGELOG-only, brief retros), not a lighter build of the same machinery.
- **Why the default is Standard anyway.** The kit's value lives at Standard+ — verification, not generation, is the bottleneck, and structure pays as the stakes rise (DORA 2025: AI amplifies existing discipline; small batches + strong version control are the named amplifiers — https://dora.dev/dora-report-2025/). If your task genuinely doesn't warrant the machinery, **downshift to Lite with eyes open** (the downshift rule under "What the agent does after the user answers"). The scaffold counts here are the reference-calibration figures from `sbak/framework-manifest.json` — see the scaffold-count note above.

---

## Choice 2 — Your experience with this stack and frameworks like this one

Drives how much the agent narrates and how aggressively it web-verifies external facts. Independent of project size — a beginner can run a Full project; an expert can run a Lite one.

| Option | What it means | What the agent does |
|---|---|---|
| **New** | First time with this stack OR with a framework like this. You want to learn as you ship. | Narrates decisions as it makes them ("I picked X because…"). Leans on current best practices verified on the web before drafting code. Flags reversible-vs-irreversible choices. Asks less often (trusts the framework + verified best practices to land good defaults — your bandwidth is for learning, not approving every step). |
| **Familiar** | Comfortable with the stack; learning the framework. | Moderate narration. Web-verifies non-trivial choices. Per-tier approval cadence applies. |
| **Experienced** | You've shipped this kind of project before. Work fast. | Minimal narration — surfaces results, not thinking. Uses training-data knowledge by default; you flag what needs web-verification. Per-tier approval cadence applies; agent doesn't second-guess decisions you've signaled as routine. |

**Maps to:** `expertise` in `project-config.md`. New → Novice, Familiar → Intermediate, Experienced → Expert. Drives `explanation_mode`, `web_verify`, and `research_mode` defaults.

---

## Choice 3 — Approval cadence (how much do you want to babysit?)

How often the agent surfaces work for you to review. The do-not-commit-without-approval rule (G1) holds in every option — only the *boundary* changes.

| Option | Means | Trade-off |
|---|---|---|
| **Minimum (per PR / merge)** | One review at PR time covers the whole milestone. | Lowest interruption. Best when you trust the agent + framework defaults, or when you're New (this is the default for New users — your bandwidth goes to learning, not approving every stage). |
| **Standard (per stage)** | Review at the end of each stage (typical: every 5–15 micro-cycles, ~1–8 hours of work). | Catches drift early. Standard for most projects. Default for Familiar and Experienced users at Standard and Full tiers. |
| **Maximum (per micro-task)** | Review after each TDD cycle. | Highest control. Near pair-programming. Use when you have specific concerns about an unfamiliar surface, or you're learning a new pattern and want to validate each step. |

**Maps to:** `approval_cadence` in `project-config.md`. Minimum → `per_pr`, Standard → `per_stage`, Maximum → `per_step`.

### One question, two effects — this also draws your permission fence

The same dial — *"how much do you want to babysit?"* — does double duty. Besides setting how often you review (above), it selects the `.claude/settings.json` **permission fence**: the wall of `allow` (runs unattended), `ask` (pauses for you), and a hard `deny` floor the bootstrap writes into your repo. Pick the cadence that matches how much you want to watch, and you get the matching fence for free.

| Fence (← cadence) | `defaultMode` | Runs unattended (allow) | Pauses for you (ask) |
|---|---|---|---|
| **Maximum oversight** (← Maximum) | `default` (or `plan` for reads-only) | lint only | tests, build, every edit, all git |
| **Fenced autonomy** (← Standard) — *recommended* | `acceptEdits` | edit source, run tests / lint / build, `git add` | `git commit`, `git push`, dependency install, manifest edits |
| **Sleep-through** (← Minimum) | `acceptEdits` + the **user-level** `auto` opt-in (see the generated `CLAUDE.md` — a repo can't set `auto`) | same as Fenced autonomy | same as Fenced autonomy |

**The `deny` floor is identical regardless of level — the wall doesn't move; only the allow/ask split flexes.** At every level it denies secret reads (`.env`, `.env.*`, `secrets/**`, `*.pem`, `*.key`) and irreversible Bash (`git push --force`, `git reset --hard`, `git clean`, `rm -rf`). And `git commit` / `git push` stay `ask` at *every* level — even Sleep-through never auto-commits (G1). The generated `CLAUDE.md` carries the four honest caveats (the user-level `auto` opt-in, why `.claudeignore` is broken and what to do instead, the web-remote constraint, and the workspace trust gate that holds `allow` inert until accepted) so the fence isn't trusted past what it guarantees.

---

## Choice 4 — Deliverable type

What kind of thing are you building? This is orthogonal to size/experience/cadence — it doesn't change *how much* ceremony, it changes *which gates and templates apply*. A web app needs design + browser-load verification a CLI doesn't; a library needs an API-surface contract a service doesn't.

| Option | Means | What it adds |
|---|---|---|
| **CLI** | A command-line tool or script. | Standard engineering charter; arg/exit-code contract; no UI gates. |
| **Web / UI** | Anything a person looks at in a browser — app, dashboard, site. | A **design brief** (`docs/design.md`) authored before UI code; **browser-load + design-conformance** verification passes; Playwright (or equivalent) e2e in the gate set. This is the path that prevents shipping tests-green-but-visually-broken software. |
| **Library** | Code other code imports. | An **API-surface** section in the spec (public types/functions as a contract); semver discipline; doctest/example-runs in gates. |
| **Service** | A long-running server / API. | **Endpoint contracts**; health-check + one live request in the behavior pass; deployment-surface note. |
| **Other** (desktop / mobile / agent / runtime) | Anything not above. | Falls back to the CLI-style charter; the agent flags that type-specific gates aren't yet specialized and proposes the closest fit. |

**Maps to:** `deliverable_type` in `project-config.md` (`cli` / `web` / `library` / `service` / `other`). Determines which spec template, phase-doc template, and verification passes apply downstream. If unsure, the agent infers it from your one-paragraph description in Phase 0.2 and proposes one.

**Why it matters most for Web/UI:** the framework's worst observed failure was a Standard-tier build that passed every gate and shipped an unusable app — because the gates were engineering-only and the deliverable was visual. `deliverable_type: web` is what turns on the design brief and the browser-load verification that catch that class of failure.

---

## Choice 5 — Verification & CI cost

Where your tests actually run, and what that costs. The driver is **GitHub Actions cost on private repos** — hosted minutes are metered (Free 2,000 / Pro 3,000 / Team 3,000 per month) and macOS bills ~10× the Linux rate, so a full cloud matrix on every push can burn the quota. Two facts decide most of this: **is the repo public or private**, and **does it ship to macOS** (a signed macOS build can't be produced locally on Windows/Linux).

| Option | Means | When it fits |
|---|---|---|
| **Local-first (hybrid)** (default for private repos) | Full suite runs on your machine at pre-push (Linux-in-Docker + your native OS); one cheap hosted `ubuntu` smoke check on PRs as the non-bypassable backstop; full matrix + macOS only on `v*` tags. | Private repos where you want near-zero Actions spend and don't mind installing Docker + the git hooks once. |
| **Cloud** (default for public repos) | The conventional GitHub-hosted matrix runs on every push/PR. No local harness, no hooks to maintain — simplest to operate. | **Public repos** — Actions are *free + unlimited* there, so just use it. Or private repos where you'd rather pay than maintain a local harness. |
| **Local-only** | Everything local; cloud runs *only* on release tags; no PR cloud check. | Maximum cost avoidance — but pair it with a self-hosted runner or accept honor-system at PR (there's no backstop otherwise). |

**Maps to:** `verification_locus` in `project-config.md` (`hybrid` / `cloud` / `local_first`). Like deliverable type, the agent often *proposes* this from two discovery facts — public repo → **cloud** (free, simplest); private + cost-sensitive → **hybrid** — and you confirm or override. macOS handling is automatic under any locus: a signed/notarized macOS build can't run on non-Mac hardware, so it lives in the tag-triggered release workflow, the one bounded place macOS minutes are spent.

---

## Risk triggers — does your project touch any of these surfaces? (asked of every project, all tiers)

A short, separate question after the five choices — because **risk overrides tier**. Tier sets *how much* ceremony by default; a high-risk surface raises verification depth + approval cadence **above** that floor regardless of tier. So even a Lite project that does a destructive restore gets deep verification on *that surface*. Ask whether the project touches any of these six, and record the ones it does in `project-config.md`'s `risk_triggers:` field:

| Risk trigger | Touches it if the project… |
|---|---|
| **destructive data ops** (`destructive_data_ops`) | replaces / imports / restores / migrates / deletes user data |
| **archives / backup-restore / extraction** (`archive_extraction`) | unzips / untars / extracts archives or restores backups (zip-slip surface) |
| **filesystem writes from untrusted metadata** (`untrusted_fs_writes`) | writes to a path/filename derived from input or file metadata |
| **credentials / provider config** (`credentials`) | handles secrets, tokens, API keys, or provider configuration |
| **generated / untrusted HTML or executable content** (`untrusted_html`) | renders generated HTML, evals code, or runs generated executables |
| **installers / updaters / release artifacts** (`installers`) | ships an installer, auto-updates, or produces signed/release binaries |

**Maps to:** `risk_triggers:` in `project-config.md` (a list of the declared tokens, or `[]` if none). Each declared trigger **must** carry a visible escalation record in `docs/gates.md` (the canonical token `deep verification because:` bound to the trigger) — enforced by `validators/validate-risk-escalation.cjs` (G11). A "none" answer is fine and common; the point is to *ask*, so a high-risk surface isn't left at the tier floor by omission. The agent can also *propose* triggers from the project description (a "restore from backup" feature → `destructive_data_ops` + `archive_extraction`) and confirm.

---

## How the user can answer

Three ways:

1. **Direct**: "Standard, Familiar, Standard, web app, hybrid verification" (any combination of the five choices).
2. **Describe**: "It's a small CLI tool I'll write over a weekend, I've never used Rust before, I want to check in often." Agent infers and proposes: *"That's Lite + New + Maximum + CLI — small project, learning a new stack, want frequent check-ins, command-line deliverable. I'll narrate decisions, verify Rust idioms on the web, and surface after each TDD cycle. Confirm or revise?"* (The deliverable type is usually obvious from the description — the agent proposes it rather than always asking.)
3. **Punt**: "I don't know — pick something reasonable." Agent picks **Standard + Familiar + Standard** (safe middle) and infers the deliverable type from the project description, noting that re-tiering and type changes are cheap (`sbak/FRAMEWORK-CONFIG.md` §7).

**Existing repo + one feature?** That is still **greenfield** — say so in your description (*"add a CSV export to my existing app"*). The bootstrap then takes the **existing-repo, single-feature calibration** (the brownfield shortcut in its Phase 0.2): discovery adds two brownfield questions (where the feature lives; what existing behavior must not change), the milestone plan defaults to ONE milestone, and Stage A carries an impact-analysis step (the existing tests that must re-run after the change). The interview + scaffold cost is repo onboarding, paid once — every later feature skips bootstrap entirely; an orchestrator session authors the next milestone directly.


---

## What the agent does after the user answers

1. **Confirm the calibration in plain English.** "Got it — Standard project, you're Familiar with the stack, Standard approval cadence at stage boundaries, web/UI deliverable. That means: per-stage retrospectives covering process + product, append-only ledger documented but not CI-enforced, ~68 scaffold files, agent narrates significant decisions, web-verifies non-trivial choices — plus, because it's web/UI, a design brief authored before any UI code and browser-load + design-conformance verification passes. And tests run local-first (hybrid): full suite at pre-push, one cheap ubuntu PR smoke check as the backstop, macOS + full matrix only on release tags."
2. **Note any non-default toggle implications.** If the choice triggers a toggle smell (e.g., "Lite + Experienced + Minimum approval is a fast-mode combo that skips most of the framework — confirm that's what you want"), surface the smell and ask for confirmation.
   - **Downshift rule (bias toward less ceremony).** Over-tiered is as broken as under-tiered — process drowning the work fails just as hard, only quietly. If the project is **solo + no audit need + ≤2 weeks**, recommend **Lite regardless of how complex the stack feels**. A complex stack run solo for a week is still a Lite-tier *process* problem; the complexity lives in the code, not the coordination. Only bump above Lite when there's a real second reader, an audit/compliance need, or a multi-week horizon.
3. **Don't lock the calibration to `project-config.md` yet** — that happens at end of Phase 1 (after the spec lands). The spec may surface complexity that bumps the project to Full; better to bump tier *before* generating scaffolds than to redo them.
4. **Proceed to Phase 0.2** (tier-conditional discovery questions per `sbak/BUILD-PLAYBOOK.md` Part 0).

---

## Toggle mapping (for the agent, not the user)

| User choice | Toggle | Value |
|---|---|---|
| Greenfield | operating_mode | greenfield |
| Bug fix | operating_mode | bug_fix |
| Research / publish | operating_mode | research_publish |
| Audit | operating_mode | audit |
| Lite | tier | Lite |
| Standard | tier | Standard |
| Full | tier | Full |
| New | expertise | Novice |
| Familiar | expertise | Intermediate |
| Experienced | expertise | Expert |
| Minimum approval | approval_cadence | per_pr |
| Standard approval | approval_cadence | per_stage |
| Maximum approval | approval_cadence | per_step |
| CLI | deliverable_type | cli |
| Web / UI | deliverable_type | web |
| Library | deliverable_type | library |
| Service | deliverable_type | service |
| Other | deliverable_type | other |
| Local-first verification | verification_locus | hybrid |
| Cloud verification | verification_locus | cloud |
| Local-only verification | verification_locus | local_first |
| Risk surfaces touched (any of the six) | risk_triggers | the declared tokens (e.g. `[destructive_data_ops, credentials]`) |
| No risk surfaces | risk_triggers | `[]` |

| User choice combo | Derived toggles |
|---|---|
| New | `verbosity: verbose` (→ `explanation_mode: verbose`, `web_verify: always`, `pre_write_surface: always`), `research_mode: best_practice_first` |
| Familiar | `verbosity: standard` (→ `explanation_mode: standard`, `web_verify: always`, `pre_write_surface: spec_and_plan_only`), `research_mode: best_practice_first` |
| Experienced | `verbosity: terse` (→ `explanation_mode: terse`, `web_verify: on_request`, `pre_write_surface: none`), `research_mode: token_frugal` |
| Lite tier | `retro_depth: brief`, `ledger: none`, `read_first_cap: small`, `red_review: off`, `off_track_check: brief`, `app_map: skip` |
| Standard tier | `retro_depth: two_axis`, `ledger: append_only_advisory`, `read_first_cap: medium`, `red_review: on`, `off_track_check: advisory`, `app_map: on` (drivable surface class; `skip` for `library`) |
| Full tier | `retro_depth: three_axis`, `ledger: append_only_enforced`, `read_first_cap: large`, `red_review: on`, `off_track_check: enforced`, `app_map: on` (drivable surface class; `skip` for `library`) |
| `deliverable_type: web` | turns on the design brief (`docs/design.md`, Phase 1.5/1.6), the Playwright e2e gate, and Stage V browser-load + design passes. CLI/library/service skip these. |
| `verification_locus: hybrid` | generates the local harness (`scripts/verify-local.cjs`) + git hooks (`.githooks/`) + `pr-smoke.yml` + tag-only `release.yml`. `cloud` → a conventional `.github/workflows/ci.yml` matrix instead (no local harness/hooks); `local_first` → harness + hooks + `release.yml`, no PR check. |

Toggles not derived from the interview choices (defaulted to safe values, surfaced for tweak only on request): `escalation: time_box_2x`, `hook_enforcement: enforced`, `verifier_mode: <tier-derived: pass_1_only / pass_1_2_4 / pass_1_2_3_4>`, `refactor_mode: <tier-derived: skip / trigger_n5 / trigger_n3>`.

**Verifier (Stage V):** the framework runs a fresh-context contract-fidelity check between work stages and closeout (Lite: optional inventory pass; Standard: inventory + hooks + behavior; Full: + multi-call invariants). Catches the bug class where "tests pass but contract is broken." Not surfaced as a primary user choice — defaults are tier-derived per `sbak/FRAMEWORK-CONFIG.md` §4.10. If the user explicitly asks about it during the interview, point them at `sbak/BUILD-PLAYBOOK.md` §3.4 and offer to override `verifier_mode` (e.g., Lite project that wants the full Standard pass set; Full project that wants to skip Verifier because they have a separate audit team).

**Refactor (Stage R):** a second fresh-context stage parallel to Stage V, asking "is the code maintainable?" instead of "did the code do what was promised?" — Duplication / Complexity / Drift passes against the *cumulative* codebase, trigger-based on `docs/tech-debt.md` accumulation (Lite skips; Standard `trigger_n5`; Full `trigger_n3`). Like the Verifier it's tier-derived, not a primary user choice; override via `refactor_mode` (`sbak/FRAMEWORK-CONFIG.md` §4.11, `sbak/BUILD-PLAYBOOK.md` §3.4.5).

**Off-track check (priority-drift guard):** a recurring "are we building the right thing next?" check (gate G8) comparing the work built/proposed against a ranked, HITL-co-authored `docs/backlog.md`, flagging an unjustified priority inversion. Runs as a per-stage retro line + a full closeout check, plus the on-demand `/on-track` command. Tier-derived (`off_track_check`: Lite `brief` / Standard `advisory` / Full `enforced`), not a primary user choice; `/on-track` is available at every value. See `sbak/FRAMEWORK-CONFIG.md` §4.15 and `proposals/OFF-TRACK-CHECK.md`.

**App-Map (drive/test cheat-sheet):** `docs/app-map.md` — a living, surface-organized record of *what shipped and exactly how to drive and test each surface*, bound to test-ids so it can't drift from the running app. It has **two readers**: the user (what exists, how to exercise it) and the build-time LLM (loaded at session start, so it can say *what and how to test* without re-reading the repo). Tier-derived (`app_map`: Lite `skip`; Standard+ `on` for the drivable surface classes `ui`/`command`/`endpoint`; `library`/`api` `skip` — opt-in). It's **not web-only** — the type-id-binding invariant is universal; only the gesture vocabulary adapts to the derived surface class. See `sbak/FRAMEWORK-CONFIG.md` §4.16 and `proposals/APP-MAP.md`.

**Orchestrator/build role split:** a structural consequence of the tier choice, not a separate question. At **Standard and Full** the agent runs as two session types — an orchestrator (authors Phase docs / ADRs, adjudicates, routes findings, runs PRs; governed by `ORCHESTRATOR.md`) and build sessions (execute one stage each). At **Lite** the two collapse into one session and `ORCHESTRATOR.md` is not generated. If the user asks how the framework runs day-to-day, mention this and point them at `ORCHESTRATOR.md §1` (topologies) and `sbak/BUILD-PLAYBOOK.md §2.2` (the role model). Don't add it as a separate interview question — it falls out of the project-size answer.

**Operating mode (the leading question — see the "Operating mode (asked first)" table above):** this interview opens with "what kind of work is this?" asked **before** the five choices. Four values, **all live** — `greenfield` (build something new; the default), `bug_fix` (fix a known bug — reduced 3-phase shape), `research_publish` (paper + interactive app — hybrid Phase R [Lite-process grounded STORM] → explicit re-tier → Phase A [re-tiered, inherits Stage V]), `audit` (review a codebase — inventory → triage → per-dimension passes → fresh-context challenge → consolidation; no milestones, no Stage V; the tier sets the dimension count). The mode determines which subsequent discovery questions to ask and is recorded as `operating_mode` in `project-config.md` (project-scoped, orthogonal to the session-scoped 3-brain `role`). For an unset or unrecognized mode, default to `greenfield` — never error a project for the mode.

---

## Smells to flag during the interview

If the user picks any of these combinations, surface a one-liner asking for confirmation — they may be optimizing the wrong thing:

- **Lite + New + Minimum approval** — fast-mode + learning is high-risk. The user may benefit from Standard or Maximum approval to catch their own learning gaps. Suggest: "Want to bump approval to Standard so I check in at each milestone? Lite projects are short, so 'Standard' there is still light overhead."
- **Full + Experienced + Minimum approval** — Full tier ceremonies (gap-analysis ledger, cross-machine state checks, three-axis retrospectives) lose force without per-stage review. Either drop tier or raise approval cadence.
- **Lite + complex audit need** — if the user described an audit-critical project but picked Lite: re-ask. Audit needs override time horizon. Lite doesn't generate the audit trail you need.
- **Any tier + New + Maximum approval** — high friction combo (max narration + max approvals). Confirm the user wants this; sometimes Standard approval with verbose narration is enough.
- **Public repo + Local-first / Local-only** — you'd be maintaining a local harness to save Actions minutes that are *already free + unlimited* on public repos. Unless you specifically want fast local pre-push feedback, **Cloud** is simpler here.
- **Private repo + Cloud + ships to macOS** — the macOS 10× leg on every push is the quota-killer. If cost matters, **hybrid** keeps macOS on release tags only; if you keep Cloud, confirm you're OK paying for the convenience.
- **`bug_fix` + multi-week time horizon** — anti-pattern. A bug fix that takes multiple weeks is either (a) actually a refactor / feature project (use `greenfield`), or (b) a sign the affected surface needs an audit first. The whole point of `bug_fix` mode is a minimal, scope-locked fix that lands in hours-to-days; a multi-week "fix" has lost the regression-test bound. Re-ask the mode.
- **`bug_fix` + "while I'm in here" cleanup** — scope creep destroys the regression-test bound (G_BUGFIX_B1). Out-of-scope improvements append to `docs/tech-debt.md` / `CHANGELOG.md`; they don't fold into the fix. If the real intent is broad cleanup, that's `audit` or a `greenfield` refactor milestone, not `bug_fix`.
- **`audit` + Lite + all 8 passes** — wrong tier. A Lite audit is a 1–2-dimension health check (skip triage + challenge); needing all 8 dimensions (with challenge reviews + a ranked remediation backlog) is a **Standard or Full** audit, not Lite. Re-ask the tier — the pass count *is* the audit tier dial (`OPERATING-MODES.md` §7.5). (Also: `audit` produces findings, not code — if the intent is to *fix* what's found, that's a separate `greenfield`/`bug_fix` follow-up scoped to the findings backlog.)
- **`research_publish` + Full + "skip Stage V"** — can't be honored for the app. In `research_publish` the tier applies to **Phase A** (the app), which **inherits Stage V** at whatever tier it re-tiers to — Phase A is *not* Lite-locked like Phase R. Disabling the Verifier on a Full app contradicts the mode's own contract (the app is the engineered half; the research is the light half). If the user wants no Verifier at all, the thing they're describing is closer to a Lite `greenfield` demo than `research_publish`. (Phase R correctly has no Stage V — that's the Lite-process lock, not an override.)

---

## Re-running the interview later

After bootstrap, this interview is *not* repeated. The active calibration lives in `project-config.md`. To change calibration mid-project:

- Edit `project-config.md` directly, OR
- Ask the agent in any session: "I want to re-tier" or "I want to change approval cadence." The agent presents the relevant option from this file and confirms before updating `project-config.md` and appending the override log.

The interview is the bootstrap entry point. The override log is the steady-state mechanism.
