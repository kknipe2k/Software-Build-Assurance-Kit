# Process Validation: Did the Pattern Work?

> **Human reader: you can skip this file.** It is part of the agent's operating manual — a reference the build sessions consult, deliberately exhaustive. Start at `README.md` → `QUICKSTART.md`, and ask questions in-session rather than reading ahead.

> **Purpose.** This is the **reference framework** for evaluating whether the prompt-driven build pattern works — not the test for what each milestone ships. Each milestone's acceptance criteria verify that milestone shipped; this framework verifies the **build pattern** is sound enough to apply across all remaining milestones.
>
> **Companion to** `BUILD-PLAYBOOK.md` (the methodology), `STAGE-PROMPT-PROTOCOL.md` (the XML schema for stage prompts), `persistence-architecture.md` (the layer model), and `FRAMEWORK-CONFIG.md` (the tier/toggle dial). This file is the **scoring framework** the playbook depends on.

---

## Why this is a separate file from `BUILD-PLAYBOOK.md` (cognitive cost note)

A reasonable critique of the framework is "the scoring lives in `BUILD-PLAYBOOK.md` §4.4 *and* in this file — that's redundant." It is, partially. The duplication is intentional, and the cost is bounded.

**What's in the playbook:** the *procedural* hook into the loop. "After every stage, evaluate against two tiers of gates. Hard gates: G1–G16. Soft gates: S1–S5. Outcome matrix routes verdict." The playbook needs enough of the scoring structure to make the per-stage loop self-contained.

**What's in this file:** the *reference detail* — sample axis questions, the philosophy behind three-axis scoring, the cadence rationale (why per-stage not per-milestone), the role split (Claude scores; user reviews), the outcome routing detail. This is the file the agent and user open when *authoring* a retrospective, not when *executing* a stage.

The split exists because:
- The playbook is read top-to-bottom once at project start, then used as an operational checklist. Embedding the full scoring framework would bloat the operational checklist with reference material that isn't checked every stage.
- The retrospective template (`prompts/RETROSPECTIVE-TEMPLATE.md`) and stage prompts (`<retrospective_requirements ref="..."/>`) need a stable URL for the scoring framework. Fragmenting it across multiple playbook sections breaks the reference.
- Updates to the scoring framework (axis additions, threshold tuning) want their own commit history. Versioning this file separately keeps that history clean.

**Cost:** ~30 lines of overlap (the gate names + the outcome matrix) appear in both places. The playbook's version is the procedural-checklist form; this file's version is the reference-detail form. Updates must stay in sync — a change to G3's wording in the playbook requires the matching change here.

**Mitigation:** when scoring is referenced from a stage prompt, the prompt cites *this file* (`PROCESS-VALIDATION.md`), not the playbook. This file is the authoritative scoring source; the playbook's version is a procedural mirror. If the two ever drift, this file wins.

If the cost-of-duplication starts to feel high (e.g., we change the scoring system and have to edit 3 places), the right move is to fold both into one file and have the playbook reference it. Don't fold yet; the current separation pays for itself for projects that read the playbook procedurally and reach for this file only at retrospective time.

---

## Tier-conditional scoring (`retro_depth` toggle)

The retrospective-depth toggle in `project-config.md` selects which axes get scored:

| `retro_depth` value | Axes scored | Applies in (default) |
|---|---|---|
| `none` | None — no retrospective file | Custom only (skips entire protocol) |
| `brief` | One paragraph summary; no formal scoring | Lite tier |
| `two_axis` | Process + Product (Pattern axis omitted) | Standard tier |
| `three_axis` | Process + Product + Pattern (this document's full set) | Full tier |

**Lite tier (`brief`)** drops formal scoring because for short projects, the per-stage signal is dominated by "did the work happen" — a paragraph captures that. The hard gates (G1, G4) still apply: the agent didn't commit without approval, the stage actually completed. Soft gates and axis totals are skipped.

**Standard tier (`two_axis`)** drops the Pattern axis. Pattern asks "does this generalize to remaining milestones?" — useful when the project has 5+ milestones ahead. For 1–4 week projects with 2–3 milestones total, generalization isn't the question; you'll be done before the pattern matters. The Process and Product axes carry their full weight.

**Full tier (`three_axis`)** is the original protocol — Process, Product, and Pattern, with full sample-question coverage and the friction log. Apply when the project will run long enough that prompt-pattern drift would compound.

If you re-tier upward mid-project, prior brief retrospectives don't get retroactively expanded. They become part of the project's history; new retrospectives follow the new tier. If you re-tier downward, prior three-axis retrospectives stay as they are; new ones follow the lighter shape.

---

## Process retrospectives vs. product gap analysis

This file and the per-stage retrospectives evaluate the **build process** — did Claude have what it needed, did the workflow surface decisions at the right time, did the do-not-commit rule hold. The product itself — does the code match the spec, what did the spec get wrong, what's the prioritized fix backlog — is evaluated separately in `docs/gap-analysis.md` (append-only) per `CLAUDE.md` §20. The two artifacts have different audiences and different change rules:

| Artifact | What it evaluates | Author | Mutability |
|---|---|---|---|
| `retrospectives/M[NN].<X>-retrospective.md` | Build *process* per stage | Claude during/after stage | Live during stage; finalized at stage end |
| `retrospectives/M[NN]-summary.md` | Aggregated process across stages | Claude at end of final stage | Once written, not edited |
| `docs/gap-analysis.md` | Build *product* — code↔spec, cumulatively | Claude in Phase Closeout (final stage) | **Append-only forever** per §20; prior entries immutable |

User reviews all three at PR time. This document defines the gates for the first two; `CLAUDE.md` §20 defines the protocol for the third.

---

## Roles — who does what

The validation is **Claude-driven**, not user-driven. Claude has the live context (friction events, ambiguities, self-correction iterations); the user only sees the final PR. Asking the user to score a session they only partially observed asks them to reconstruct context they never had.

| Role | Responsibility |
|---|---|
| **Build session (Claude)** | Maintain the live observation log AS the stage unfolds. At session end, score the retrospective, evaluate threshold gates, propose decisions for the next stage. Surface the filled-in retrospective alongside the draft commit / PR. |
| **Orchestrator (Claude)** *(Standard+)* | Does NOT score retrospectives — that's the build session's job (it has the live context). The orchestrator *reads* finalized retrospectives to route Verifier findings, sequence stages, and aggregate the milestone summary at closeout. See `ORCHESTRATOR.md`. |
| **User** | Review the build session's self-assessment alongside the code. Validate against observable evidence (especially: did the do-not-commit rule actually hold?). Approve the assessment, push back on scoring, or request additional retrospective entries. |

The build session self-assesses because it holds the live context; the orchestrator and user review the finalized assessment. This split is enforced by `CLAUDE.md` §19 Retrospective Protocol. Per-session retrospectives are deliverables on every milestone PR, same as the code itself.

> **Tier note.** At **Lite** tier the orchestrator and build roles collapse into one session — "Build session (Claude)" and "Orchestrator" above are the same session. The retrospective is a brief paragraph (`retro_depth: brief`). The orchestrator row applies only at Standard and Full.

---

## How retrospectives get created

| Scope | File | Authored by | When |
|---|---|---|---|
| Per-stage retrospective | `retrospectives/M[NN].<X>-retrospective.md` (where `<X>` is `A`, `B`, etc.) | Claude during/after the stage session | Filled live during work; finalized at session end alongside the stage's draft commit |
| Per-parent-milestone summary | `retrospectives/M[NN]-summary.md` | Claude at the end of the final stage | Aggregates findings across the milestone's stage retrospectives; gates the M[NN] PR draft |
| Cross-milestone trend log (optional) | `retrospectives/TRENDS.md` | Claude when patterns emerge across multiple parent milestones | Updated as it becomes useful; not a per-session deliverable |

**Per-milestone-as-PR pattern:** stages are commits on one feature branch (`claude/m[nn]-<title>`); the PR drafts only at the end of the final stage. Each stage commit lands only after user approval per `CLAUDE.md` §8. The PR opens with all stage commits + all stage retrospectives + the parent-milestone summary.

Templates live in `prompts/`:

- `RETROSPECTIVE-TEMPLATE.md` — the per-session shape (live log + scoring + gate evaluation + decisions)
- `SUMMARY-TEMPLATE.md` — the per-parent-milestone roll-up shape

---

## Why per-stage, not just per-parent-milestone

Per-stage retrospectives capture friction early. M01 Stage A's retrospective (after ~5–8 hours) can surface a pattern problem before M01 Stage B's session opens — saving 25+ hours of compounding error. A retrospective only at end of M01 (after all stages) is a 30+ hour feedback loop. The per-stage cadence is the early-warning system. The parent-milestone summary then aggregates patterns across stages and gates the next parent milestone.

---

## The three axes of evaluation

A milestone session is evaluated on three independent concerns:

### Axis 1: Process — did the prompt-driven workflow work?

Did Claude have what it needed to execute autonomously? Did the workflow surface decisions to the user at the right moments? Not about whether the code is good (Axis 2). About whether the *interaction* worked.

Sample questions (full set in `prompts/RETROSPECTIVE-TEMPLATE.md`):
- Was `CLAUDE.md` sufficient orientation, or did Claude ignore parts of it / get confused by parts of it?
- Did the milestone prompt's "Read first" list correctly orient before any code was written?
- Did Claude state the deliverable + test plan before writing code (per CLAUDE.md §16 session-start checklist)?
- Did Claude self-correct effectively when gates failed, or did it spiral?
- Did Claude actually NOT commit before approval (the most important rule)?
- Did Claude escalate the right things and proceed on the right things (per CLAUDE.md §12)?
- Did Claude surface cross-machine state at session end (`git log --oneline main..HEAD` + retrospective file listing)?

### Axis 2: Product — did the artifact meet our standards?

Is what shipped actually good? About the milestone deliverables.

Sample questions:
- Does the code match `CLAUDE.md` §9 / `docs/style.md` style + naming?
- Are the tests behavior tests, not tautology tests (`CLAUDE.md` §5)?
- Are public APIs documented with examples (`docs/gates.md`)?
- Are the deliverables what the milestone promised, no more, no less?
- Would a stranger picking up this code understand it without reading the spec?
- Are anti-patterns from `docs/style.md` absent?

### Axis 3: Pattern — does this generalize to remaining milestones?

The meta-question. If the prompt format is wrong, repeating it 10 more times multiplies the wrongness.

Sample questions:
- Were sections of `prompts/PHASE-DOC-TEMPLATE.md` dead weight? (Sections that contributed nothing should be removed.)
- Were sections missing? (Sections that should have been in the prompt but weren't should be added.)
- Are milestone-specific gotchas useful for other milestones, or were they truly local? (Generalizable ones graduate to `docs/gotchas.md`.)
- Did the time-box estimate match reality? (If 2× off, the estimation method needs revision.)
- Were there moments of *implicit* protocol — things that should have been written down but weren't?
- Did any cross-stack integration issue advance the error to a *new* error class without resolving (signal to escalate at iteration 2 instead of 3)?

---

## Scoring

Each axis question gets a 1–5 score:

| Score | Meaning |
|---|---|
| **5** | Worked exactly as the protocol intended. No friction. |
| **4** | Worked, with one minor friction event noted. |
| **3** | Worked, with multiple friction events; pattern needs revision before next milestone. |
| **2** | Partially worked; significant gaps in the protocol. |
| **1** | Failed; the protocol does not support this workflow. |

The retrospective template lays out specific questions per axis and computes axis totals.

---

## Threshold criteria — is the pattern good enough to scale?

Apply these gates after scoring. **All hard gates must pass for the next stage (or the next parent milestone) to proceed without protocol revision.**

### Hard gates (any fail = stop and revise)

- **G1: do-not-commit-until-approved rule held.** Claude did not commit without explicit user approval, ever, during the session. Even one violation means the protocol's most important rule isn't reliable.
- **G2: no Severity-5 friction events.** No moment where Claude couldn't proceed and the prompt was insufficient.
- **G3: no protocol drift events left unaddressed.** Every entry in the protocol-drift log either (a) Claude self-corrected, OR (b) the user has documented the prompt/CLAUDE.md fix needed.
- **G4: the milestone or stage actually completed.** For stages: commit on the parent-milestone branch with all stage acceptance criteria checked. For non-staged milestones: PR merged with all acceptance criteria checked.
- **G5: scores ≥3 in every individual row across all three axes.** A 1 or 2 in a single row points to a specific gap that compounds at scale.
- **G6: Verifier ran with fresh context (Standard and Full tiers).** The Verifier stage opened in a fresh CLI session with prior retrospectives excluded from `<read_first>`. The findings file `retrospectives/M[NN].V-findings.md` exists with the required tier-coverage caveat naming which passes ran and which bug classes are NOT checked. No 🔴 findings remain unaddressed at PR time (resolved via D.fix or downgraded via accepted waiver ADR). Lite tier: G6 reduces to "if Verifier was enabled per `verifier_mode`, it ran and produced findings."
- **G7: Stage R (refactor health check) ran with fresh context when triggered (Standard and Full tiers).** When `refactor_mode`'s trigger fired (`docs/tech-debt.md` count ≥ threshold OR the milestone interval, whichever first), the Refactor stage opened in a fresh CLI session with prior retrospectives **and prior R findings** excluded from `<read_first>` (one step stricter than G6's bias guard). The findings file `retrospectives/M[NN].R-findings.md` exists with the required tier-coverage caveat naming which passes ran and which structural classes are NOT checked. No 🔴 structural findings remain unaddressed at the next milestone PR (resolved via D.refactor — V re-runs then R re-runs — or downgraded via accepted waiver ADR). G7 is **not asserted when the trigger did not fire** (refactor was correctly deferred) or at Lite tier (`refactor_mode: skip`). New gates run sequentially (G6 was already taken by the Verifier gate).
- **G8: No unjustified priority inversion; backlog is HITL co-authored.** Two clauses, both required. **(a)** If the stage or milestone built a lower-priority `docs/backlog.md` story while a higher-priority story was unblocked and in scope, the divergence is recorded in `docs/off-track-log.md` with a build-sequence justification — or the build is **off track** and the next stage does not proceed until the user re-prioritizes (`docs/backlog.md` re-ranked **by human ratification**, override-logged) or a justification is logged. An unlogged inversion is off track by default. **(b)** Every change to `docs/backlog.md` (ranking, status, scope, `Depends on`) was **human-ratified** — no AI-only update reached the committed doc; the backlog is **co-authored** (agent drafts/proposes, human ratifies). A backlog diff with no corresponding human sign-off fails the gate. Clause (b) is the load-bearing half: if the agent could re-rank on its own, "off track" would be unfalsifiable. **Lite:** G8 reduces to "the per-stage off-track line was filled in, any inversion was noted in `CHANGELOG.md`, and the backlog edit was human-ratified." Advisory at Standard, enforced (blocks the milestone PR on a standing unjustified inversion) at Full. Off-Track is the next sequential gate after G7 (Stage R).
- **G9: Test-honesty — declared-risk surfaces carry a mutation-killing test; no assertion-free test ships.** The structural form of the test-honesty standard, enforced by `validators/validate-test-honesty.cjs` (pre-commit + CI) on the **staged** diff, **risk-tiered** (keyed off the stage's *declared* risk surface, never a blanket mutation score) and **incremental** (the staged set, not the whole suite). Two clauses. **(a)** A work stage in a **v1.7+** Phase doc carries a `<test_honesty>` slot naming a mutation-killing test for each enforcement/security/destructive surface it touches — mutate the named point and the test must go RED — or the explicit `n/a — no risk surface` sentinel for a pure utility/doc stage. A **silent omission blocks** (the absence is the signal). **(b)** No staged test is assertion-free / exception-only — a test with no assertion call (or only a try-without-assert) proves nothing and is flagged; cross-boundary agreement must use an *independent* fixture, never one that agrees with itself. G9 is the **effectiveness** layer on top of the coverage gates (coverage proves *executed*; the mutation proves *caught* — they compose, neither replaces the other). **Grandfathered:** required only for docs declaring `**Protocol version:** v1.7`+; earlier and banner-less docs are never retro-failed. **Lite/Standard:** advisory (`test_honesty: warn`); **Full:** enforced (blocks the commit). G9 is the first new gate on the numbered **universal** line since G8; it is allocated by the sequential rule and is **distinct from the mode-gate namespace** below (which still never consumes a number).
- **G10: Assembled-execution cluster-gate — a runtime/drivable surface is approved only by driving the REAL assembled surface.** The structural form of "unit/component green **cannot** approve a runtime surface." For a surface whose **derived class** is runtime/drivable — `ui` / `command` / `endpoint` — plus the destructive/packaging/real-provider risk surfaces, a `State: verified` App-Map entry must carry **assembled-execution evidence**: the verifier's `assembled_execution` pass drove the surface via its *How-to-exercise*, retained the run reference (command + result) into the App-Map **Evidence** column, and that is the *same* reference Stage C reconciles into its evidence block. Enforced by `validators/validate-app-map.cjs` (an un-driven `verified` drivable entry → RED) + the `assembled_execution` Verifier pass (`STAGE-PROMPT-PROTOCOL.md` §8.5). A `library` (`api`) surface is **n/a** (test-id binding suffices). **Necessary-not-sufficient:** G10 **stacks on** the coverage/unit gates and the test-id binding — it never replaces them. **Risk overrides tier:** it arms at Standard and Full alike wherever the surface class is drivable; the arming is **visible** ("armed because surface class = X"), never silent. Trigger list: `FRAMEWORK-CONFIG.md` §4.18. A *universal* gate, distinct from the mode-gate namespace.
- **G11: Risk overrides tier — a declared risk surface raises oversight above the tier floor, visibly.** The structural form of *"tier is the floor; risk raises it."* A `project-config.md` that **declares a `risk_triggers:` token** (one of the six enumerated in `FRAMEWORK-CONFIG.md` §4.19 — destructive data ops / archives-extraction / untrusted-metadata fs-writes / credentials / untrusted-HTML / installers) must carry a **visible escalation record** in `docs/gates.md`: a row that **both** names the trigger **and** states its reason via the canonical token `deep verification because:`. Checked **per-trigger and AND-ed** by `validators/validate-risk-escalation.cjs` (pre-commit + CI) — a 1-of-N "any one escalated passes" dodge is rejected, and a **silent raise** (a depth number with no stated reason) is rejected (the human must see *why* oversight rose). A no-trigger project (`risk_triggers: []`) is a no-op. **Fail-closed** with a no-false-positive asymmetry: a *declared* trigger whose `docs/gates.md` is unreadable exits non-zero, never a silent 0 — but a *no-trigger* project never reads it, so a Lite project with no `gates.md` is not falsely failed. **Honest limitation (presence-gated — no false confidence):** a risk surface the project simply **failed to declare** (no token, or one stated only in prose) escapes the static floor; the **adversarial half is Stage V's plan-challenge**, which derives its own trigger assessment and challenges *under-declaration*. Floor (validator) + adversary (V) = a real gate; neither alone is. **Lite/Standard:** advisory (`risk_escalation: warn`); **Full:** enforced (`block`). A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: tier-floor oversight on a high-risk surface).
- **G12: Destructive-op hard rule — every destructive op is failure-safe by construction, tested for BOTH rollback AND confinement.** **Tier-independent** (it holds at Lite as at Full, alongside G1). When the staged set touches a **destructive surface** (`restore` / `import` / `migrate` / `delete` / `replace` / `extract` / `unzip` / `backup` — a test-block name or a file basename), it must carry **BOTH** an independent **rollback** test (the op is undoable on failure) **AND** a **confinement** test whose body exercises a **REAL** hostile path (`../`, an encoded sequence, or a symlink escape). Missing the rollback test, missing the confinement test, **or** a confinement test using only a **toy** path → block. The two tests are **independent**: a perfect rollback test does **not** satisfy confinement (`rollback != confinement`). Untrusted paths use the single **canonicalize-then-confine-to-subtree** primitive (`templates/style.md`): resolve canonical (realpath, symlinks resolved) → `resolved === root || resolved.startsWith(root + sep)`, **never** a bare `startsWith(root)` (the `/base` vs `/base-evil` prefix bug). Checked by `validators/validate-destructive-op.cjs` (pre-commit + CI). **Fail-closed** (a staged-enumeration error → non-zero, never a silent 0). **Honest limitation (presence-gated + keyword-heuristic — no false confidence):** a destructive op under an **unlisted** verb, or a confinement test whose hostile path is a **toy** that the static text-check accepts, escapes the floor; the **adversarial half is Stage V's plan-challenge**, which confirms the confinement test exercises a *genuinely* escaping path and hunts surfaces under unlisted verbs. Floor (validator) + adversary (V) = a real gate; neither alone is. **Lite/Standard:** advisory (`destructive_op: warn`); **Full:** enforced (`block`). A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **rollback-passes read as safe** — a destructive op proving rollback but shipping unconfined, a path-traversal class).
- **G13: Risk-matrix — a declared high-risk capability covers all 9 dangerous properties or blocks.** The structural form of *"a verifier inheriting only the plan's stated scope shares the planner's blind spots."* A work stage that **declares a risk surface** — a `<risk_declaration triggers="…">` slot naming ≥1 real trigger — must address **all nine** matrix properties (**bounded**, the fixed set, not arbitrary threats): **normal · hostile-input · partial-failure · confinement · authorization · resource-bounds · recovery · observability · cross-platform**. Each is either `covered-by: <how> — test: <name>` (names a covering test) **or** an explicit `n/a — <reason>`. A **missing** property, a property naming **no covering test** and no `n/a`, or an empty/placeholder property → block; the check is **AND-ed across all 9** (a "one property present passes" dodge is rejected). A stage with **no** `<risk_declaration>` is a no-op (under-declaration is Stage V's job). Checked by `validators/validate-risk-matrix.cjs` (pre-commit + CI), **fail-closed** (a staged-enumeration error → non-zero). A **banner-less** Phase doc is treated as **current/must-comply**, not grandfathered — only an explicit pre-v1.8 banner exempts; history is protected by `--staged` (changed-only) scoping, never a retro-failing `--all` (the framework's only `--all` is the version-agnostic schema validator). **Honest limitation (presence-gated — no false confidence):** the validator asserts the 9 are *addressed* with a named test or `n/a`; whether the named coverage is **real**, or the `n/a` **true**, is judgment — the **adversarial half is Stage V's plan-challenge**, which derives its own threat model anchored on the declared matrix and asks *"which of the 9 did the plan/criteria leave unproven?"* Floor (validator) + adversary (V) = a real gate; neither alone is. **Lite/Standard:** advisory (`risk_matrix: warn`); **Full:** enforced (`block`). A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **a plan that silently omits a dangerous property** — a backup that proved round-trip/rollback/compatibility but never named *confinement*, so path-traversal shipped).
- **G14: Verifier-proof — the plan-challenge is proven by a seeded-defect calibration, FNR = 0.** The structural form of *"a verifier that misses a planted defect still reports Sound"* — the **adversary-side analog of G9's mutation-kill**: G9 makes the *floor* falsifiable (mutate a validator → a test goes RED); this gate makes the *adversary* falsifiable (seed a known defect → the verifier must flag it). Grounded in **defect-seeding / bebugging** + **LLM-as-judge meta-evaluation** (score the judge by its false-negative rate against a known-answer set). Every Stage V **opens** by running its plan-challenge against the **seeded-defect calibration set** (`prompts/calibration/` — one fixture per §8.5 escape class, with a **sealed** ground-truth label in `labels/`) and must catch **all** seeds — **FNR = 0** — before its real findings count; the result (seeds caught / FNR) is recorded as a `calibration` evidence block. Two mechanical floors: `validators/validate-stage-prompts.cjs` blocks a `<verifier_stage_prompt>` lacking the required `<pass name="calibration_self_test">`; `validators/validate-calibration.cjs` checks the set exists + **shadows the full §8.5 catalog**, every fixture is **labeled** and **sealed** (a fixture must not contain its own answer — the verifier reads `fixtures/`, never `labels/`), and a "Sound" findings file **records** a calibration block. **Fail-closed.** **HONEST LOCUS (non-negotiable — no false confidence):** the validators are the **static floor only** — they prove the harness is **present + wired**; the **catch is agent judgment, recorded at V-time as the FNR**, and **cannot** run in a pre-commit hook (you can't run a judge in a smoke test). Conflating "present" with "caught" is the exact presence-≠-effectiveness theater this standard exists to kill. Floor (validators) + adversary (the recorded FNR) = a real gate; neither alone is. **Lite/Standard:** advisory; **Full:** enforced. A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **a rubber-stamping verifier that misses a seeded defect and reads as "Sound"** — the unfalsifiable adversarial half this gate exists to kill).

- **G15: Transitions — atomic durable-state writes + honest rework, and a gated release ladder.** The structural form of *"a 'released' claim is the most load-bearing transition a project makes, and today it races and lies."* Two clauses enforced by `validators/validate-transition.cjs` (pre-commit + CI), each content-gated. **(a) Atomic:** a transition that writes a **durable-state** file — the 3-brain markers `.claude/role` / `.claude/stage-active`, or a `*-state.md` ledger — must **write-temp-rename** (write a temp file, then atomically rename it over the real path), never truncate-then-write; a direct truncating `writeFileSync` of such a path → block (the **truncate-write race generalized**, fail-safe by construction). **(b) Honest rework:** a closeout / release `` ```rework `` block must break rework across the **four fixed types** — implementation corrections / verifier iterations / IRL reversals / post-merge discoveries (DORA's **5th metric**, Deployment Rework Rate, project-internal) — and its total must **reconcile** against the fix-commit evidence by **extending the reconciliation primitive** (`recomputeCount`, never a forked parallel count); a total that **under-reports** the recomputed fix-commit count (the "0 rework while fix commits exist" lie) → block. The fix-commit count is a **lower bound** on true rework, so honest over-reporting passes; only under-reporting is the lie. The **six-state release ladder** (`stage-complete → milestone-complete → internally-usable → source-release-ready → packaged-release-ready → public-distribution-ready`) is recorded in the append-only `docs/release-state.md` (joins the `append-only-ledger.yml` LEDGERS set), the release end **SLSA-mapped** so a "distributable" claim proves provenance. **Fail-closed** (an unreadable transition file / a git error → non-zero). **Honest limitation (presence-gated):** the floor sees inline literals + simple bindings + fenced counts — a state-write hidden behind arbitrary dataflow, or a fix mislabeled to dodge the count, escapes it; the **adversarial half is Stage V**, which challenges whether any transition raced or under-counted. Floor (validator) + adversary (V) = a real gate; neither alone is. **Lite/Standard:** advisory (`transition: warn`); **Full:** enforced (`block`). A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **a racing transition + a lying release** — a half-written marker read as clean, a "0 rework" closeout over real rebuilds, a "released" claim hiding unsigned binaries).

- **G16: Release-readiness — a capability-triggered independent whole-product review, a well-formed ladder, and a cited SLSA level at the release end.** The structural form of *"public-distribution-ready is the most load-bearing transition a product makes, and a milestone re-read shares the builder's blind spots."* Three content-gated clauses on the append-only `docs/release-state.md` ladder, enforced by `validators/validate-release-readiness.cjs` (pre-commit + CI). **(1) Capability-triggered review:** a `public-distribution-ready` entry, **when the project declares `risk_triggers:`** (the capability list — secrets / untrusted files / destructive persistence / privileged APIs / generated executable content), must cite an **independent whole-product review record** — a fresh reviewer's own threat model (the `audit` operating mode **repositioned as a release gate**, **not** a re-read of the milestone findings, EU AI Act Art. 14 risk-based oversight). Missing the record while triggers are declared → block; a no-trigger project is a no-op. **(2) Ladder well-formedness + continuity:** no rung is silently skipped — each ladder state strictly between the entry's `Prior state` and the reached state is climbed or explicitly exempted with the covered-or-n/a idiom (`<state>: n/a — <reason>`, e.g. a source-only deliverable with no packaged binary legitimately skips `packaged-release-ready`); an unexplained skip → block. The declared `Prior state` must itself be a rung **actually reached by an earlier ledger entry** (continuity, checked against the append-only history — a fabricated prior never climbed cannot disguise a multi-rung skip as a one-rung step); an `n/a — <reason>` / first-entry prior is exempt. **(3) SLSA cited:** a release-end state (`packaged-release-ready` / `public-distribution-ready`) cites its SLSA build level (`L1`/`L2`/`L3`, default floor **L2** via `actions/attest-build-provenance`, or an explicit `n/a — <reason>`); a missing / bare / placeholder cite → block. Stale **manual-only / un-driven `verified`** App-Map surfaces are **FLAGGED** at the public-distribution boundary (advisory — surfaced, never silently shipped). **Fail-closed** (an unreadable ledger, or a public-distribution entry whose trigger config is unreadable → non-zero). **DUAL honest locus (non-negotiable — neither half overclaims):** the validator proves the review **record is PRESENT** (not that the review was *good* — that is the audit-pass adversary's judgment at review time, like G14's FNR) **and** the SLSA level is **CITED** (not that **provenance was ACHIEVED** — that is proven at build time by `release.yml`'s attest step). Floor (validator) + adversary (the audit review + the build-time attest) = a real gate; neither alone is. **Lite/Standard:** advisory (`release_readiness: warn`); **Full:** enforced (`block`). A *universal* gate, distinct from the mode-gate namespace. **Authored under the gate-design contract** (mechanical floor + adversarial question + named false-green: **a "released" claim hiding an un-reviewed high-capability product, a silently-skipped release state, a single/bootstrap entry that BEGINS at a release state with no recorded climb behind it — prior absent / `n/a` / unknown, bypassing the whole ladder, or unsigned/unattested binaries** — the "released over unsigned binaries and untested installers" miss the SLSA-mapped ladder + the capability-triggered review prevent).

**Closeout evidence & count-reconciliation (part of the closeout gate, not a new number).** This is **not** a numbered universal gate (G4 "the stage actually completed" is the home gate); it is the evidence discipline every **closeout** runs, enforced by `validators/validate-reconciliation.cjs` (pre-commit + CI). Two clauses. **(a) Count-reconciliation:** every headline count the closeout / `CHANGELOG.md` states ("N graduated", "M fixed", "K mutants killed", "P commits scanned") is a fenced `reconcile` block whose number is **recomputed from the named ledger / status-log / git-log** — a stated count that does not **recompute** **fails the closeout** (no "202 scanned / 0 corrections"). **(b) Evidence-retention:** every assurance verdict in the milestone's verifier/audit findings retains a reproducible `evidence` block (command · pattern/mutation set · result), and a numeric count inside a verdict is **bound** to a reconcile block — evidence-presence alone never satisfies a number. **Honest limitation (no false confidence, same class as G10's presence-only Evidence cell):** the validator is **presence-gated** — a count stated in prose, or under a key its deliberately **non-exhaustive** keyword list doesn't recognize (e.g. `rows: 202`), escapes the static check; this is the same omission class (G9's no-banner dodge). The adversarial half that closes it is **Stage V's plan-challenge**, which confirms every stated count carries a fenced reconcile block — the judgement a static validator structurally cannot make. Floor (validator) + adversary (V) = a real gate; neither alone is.

### Mode-specific gates (off the numbered hard-gate line)

These gates apply only under a specific `operating_mode`. They live in a **namespace off the numbered universal line (now G1–G16)** — they neither consume a G-number nor collide across modes. (G9 = test-honesty, G10 = the assembled-execution cluster-gate, and G11 = risk-overrides-tier are *universal* gates that legitimately took the next numbers; mode gates still take none — the earlier "there is no G9" note referred to mode gates not consuming numbers, which remains true.) They layer **on top of** the universal G1–G16 for projects in that mode; a `greenfield` project never sees them.

**`operating_mode: bug_fix`** — three gates, mapping to the three phases (`OPERATING-MODES.md` §4.6; the bug_fix workflow is `BUILD-PLAYBOOK.md` §3.7):

- **G_BUGFIX_A1: Regression test exists and fails for the *right reason* before any fix code is written.** The single most important bug_fix rule. "Right reason" = the assertion about the buggy behavior, not a setup error, missing import, or skipped test. Without it there is no proof the bug was the bug; with it the behavior is pinned permanently and future regressions of the same bug are caught automatically.
- **G_BUGFIX_B1: Scope lock — no out-of-scope changes.** Refactors, style fixes, and dependency bumps not strictly required to fix the bug are rejected from the diff. Real but out-of-scope concerns append to `docs/tech-debt.md` (or `CHANGELOG.md` at Lite); they are never folded into the fix. Scope creep destroys the regression-test bound.
- **G_BUGFIX_C1: Impact-analysis list re-run before the PR.** The list of existing tests that exercise the affected surface (produced in Phase A) re-runs after the fix; all must pass. This is the data-driven version of "we didn't break anything" — and the TDAD differentiator (contextual "which tests to re-run," not a bare "do TDD").

**Tier mapping** (`OPERATING-MODES.md` §4.5): Lite — single-file fix, three phases in one fresh session each, brief retrospective. Standard — multi-file fix; same three phases; impact-analysis output may surface follow-ups (carried to `docs/tech-debt.md`). Full — cross-cutting / security-boundary fix; a waiver ADR is required if the fix changes a public surface.

**`operating_mode: research_publish`** — five gates across the hybrid two-phase shape (`OPERATING-MODES.md` §6.5; the research_publish workflow is `BUILD-PLAYBOOK.md` §3.9; the research method is grounded STORM). The `R*` gates sit on **Phase R** (research; always Lite *process*); the `A*` gates sit on **Phase A** (the interactive app, at its re-tiered tier). All five live off the numbered line like every mode gate:

- **G_RP_R1: No fabricated citation — every synthesis finding binds to a logged, retrieved source.** The load-bearing grounding gate, and the one bug_fix's `G_BUGFIX_A1` is to bug fixes: under grounded STORM *no source → no claim*. Two halves: the **mechanical** half is `validators/validate-sources.cjs` green — every inline `[S###]` citation in `docs/paper/` resolves to an id present in the **sources registry** (`docs/sources/registry.md`); the **judgement** half is R5's fresh-context adversarial peer review finding no uncited claim. **Mandatory at every tier** — a deliberate exception to Lite's no-ledger default (grounding is to research what tests are to code), exactly as G1 (no-commit-without-approval) is universal regardless of tier.
- **G_RP_R2: Findings-to-illustrate produced before Phase A opens — the handoff gate.** `docs/findings-to-illustrate.md` (the R4 output) must exist before the inter-phase re-tier surfaces and Phase A construction begins. Without a concrete "which findings the app illustrates, in what form," Phase A drifts into "build whatever feels useful" — which is `greenfield`, not `research_publish`.
- **G_RP_R3: Multi-perspective grounding — perspectives discovered by search, sourced, and a contradiction map produced.** R1 discovered **≥3 perspectives (default 5)** *by search* (not invented personas — the persona-simulation failure grounded STORM avoids), each answered only from retrieved sources logged to the registry; R3 produced `docs/contradiction-map.md` (conflicting sourced claims tagged with citations + the cross-perspective blind-spot finding).
- **G_RP_A1: App ↔ paper cross-reference — the paired-deliverable bind.** The interactive app carries an explicit "this illustrates findings from `docs/paper/<paper>`" surface and the paper carries the reciprocal "see the interactive app" reference. Standalone artifacts are the failure mode. (The app scaffolds in `templates/INTERACTIVE-APP-SCAFFOLD/` bake this surface in.)
- **G_RP_A2: Reproducibility surface.** If the app uses data, the data + the transformations the paper relied on are reproducible from the repo — no "I ran this on my laptop and that's the figure." This is what distinguishes `research_publish` from generic content-plus-app work.

**Phase split (`OPERATING-MODES.md` §6.4):** Phase R keeps Lite's light *process* (no per-stage retros, no per-PR milestone machinery) **except** the mandatory sources registry, **regardless of the project tier**; only **Phase A** re-tiers (to whatever the app warrants) and inherits that tier's full scaffold **+ Stage V**. So `G_RP_A*` are checked under Phase A's re-tiered ceremony, while `G_RP_R*` are checked under Lite process at every tier.

**`operating_mode: audit`** — four gates across the inventory → passes → challenge shape (`OPERATING-MODES.md` §5.7; the audit workflow is `BUILD-PLAYBOOK.md` §3.8). Audit has **no milestones and no Stage V** — *audit is itself verification* (the existing codebase is the spec), so per-file sign-off and the fresh-context challenge are its internal V. All four live off the numbered line like every mode gate:

- **G_AUDIT_S1: Inventory completeness.** Every file in the codebase appears in the S1 inventory (`docs/audit/INVENTORY.md`). A file intentionally excluded (a vendored dependency, generated output) is listed with an **EXCLUDED** tag and a rationale — never silently dropped. "You can't audit what you can't see"; a silent omission is exactly where the unreviewed bug hides.
- **G_AUDIT_P1: Per-file sign-off.** Every file in a given pass's triage scope appears in that pass's output — either with findings or with an explicit "No Issues" sign-off. A pass cannot complete with triaged files untouched. **No group sign-offs.** This is the load-bearing audit rule: it kills the failure mode where a reviewer silently skips the file they assumed was boring.
- **G_AUDIT_C1: Challenge independence (the fresh-context bias guard).** The challenge review session reads **only the prior pass's output** (`retrospectives/audit/P[N]-findings.md`), never the original reviewing session's working context — it hunts for what the first reviewer *missed*, not validation of what they found. Single-model (Path A): the diversity comes from fresh context, not a different model (`audit_multi_model: false`; Path B multi-model is the future SDK route). This is the same guard Stage V (G6) and Stage R (G7) run on, applied per audit pass.
- **G_AUDIT_OUT: Findings report carries the tier-coverage caveat.** Same pattern as Stage V / Stage R findings: the report (and the consolidated `docs/audit/findings-ledger.md`) names which dimensions were audited and which were **not**, and at what depth — so "audit passed" is never read as broader coverage than the tier actually provided. The findings ledger is append-only (joins M01's `append-only-ledger.yml` LEDGERS set — a logged 🔴 can't be quietly downgraded).

**Tier mapping** (`OPERATING-MODES.md` §5.6; wired in `FRAMEWORK-CONFIG.md` §4.12): **Lite** — 1–2 dimensions, skip S2 triage + the challenge (a quick health check). **Standard** — 3–4 dimensions, full setup, challenge the security-focused passes. **Full** — all 8 dimensions, full setup, challenge every pass + a ranked remediation backlog.

> All four mode-gate namespaces (`G_BUGFIX_*`, `G_RP_*`, `G_AUDIT_*`) now ship. The numbered **universal** line is G1–G16 (G9 = test-honesty, G10 = assembled-execution cluster-gate; G11 = risk-overrides-tier, G12 = destructive-op hard rule; G13 = risk-matrix; G14 = verifier-proof; G15 = transitions, G16 = release-readiness); mode gates never consume a G-number.

### Soft gates (advisory; weigh together)

- **S1:** Process axis total ≥30 / 40
- **S2:** Product axis total ≥32 / 40
- **S3:** Pattern axis total ≥25 / 35
- **S4:** Time-box estimate within 2× of actual elapsed time
- **S5:** ≤3 Severity-3 friction events (multiple Severity-3s suggest sustained friction even if no individual event was blocking)

### Outcome matrix

| Hard gates | Soft gates | Verdict |
|---|---|---|
| All pass | All pass | **Pattern is sound.** Proceed to next stage (or next parent milestone). Apply minor revisions to `CLAUDE.md` based on Axis 3 notes. |
| All pass | 1–2 fail | **Pattern is sound but rough.** Revise `CLAUDE.md` and `prompts/PHASE-DOC-TEMPLATE.md` to address the soft gates first; then proceed. |
| All pass | 3+ fail | **Pattern works but has friction.** Stop. Spend a session iterating on `CLAUDE.md` / `prompts/PHASE-DOC-TEMPLATE.md` before the next milestone. The cost of fixing now is hours; the cost of running 10 milestones with a friction-heavy pattern is weeks. |
| Any hard gate fails | n/a | **Pattern is not yet ready.** Diagnose which gate failed and why. Fix the underlying issue, then re-run the failed stage (or run a recovery session) before proceeding. |

**User friction stamp override (Standard+).** The three axes above are agent-authored. The retrospective also carries a required human-authored **user-stamp** (`verdict: pass|fail` + optional one-sentence note) — see `templates/RETROSPECTIVE-TEMPLATE.md`. It is the independent check on the agent's self-grade. Semantics follow the standing owner rule: **the default is pass** (nothing flagged, nothing said = pass); **fail means the owner gave an explicit fix/fail before proceeding**. Two rules sit on top of the matrix:

- **Absent / unfilled stamp → outcome forced to Friction-heavy.** A missing stamp is not a clean stage; it's an unverified one. The pre-commit gate (`validators/validate-retrospective.cjs`) blocks a commit whose staged retro has an empty or placeholder stamp, so this should never reach review — but if it does, treat it as Friction-heavy.
- **An explicit owner `fail` → outcome forced to Friction-heavy + mandatory protocol iteration before the next stage.** The owner's lived experience overrides the agent's self-assessment (the broken-UI-but-tests-green failure mode) — a fail is a valid stamp, not a validation error; the validator accepts it and surfaces the forcing as a `NOTE`; the human enforces the routing. *(This replaces the older `|user_score − mean(three axes)| ≥ 2` arithmetic — a judgment the owner does not discern. Retrospectives written before this change keep their 1–5 stamps untouched and are grandfathered via `validators/retro-stamp-grandfather.json`; for those historical records the old `|user_score − mean| ≥ 2` divergence rule remains how their stamps are read.)*

The temptation will be to declare victory because the milestone shipped. Resist it. The point of this evaluation is to catch friction before it compounds.

---

## What user sees

Per `CLAUDE.md` §8 + §19, the user reviews **two artifacts** at PR time:

1. **The PR description and code diff** — does the milestone deliver what was promised, at the quality expected?
2. **The filled-in retrospective** at `retrospectives/M[NN].<X>-retrospective.md` — does Claude's self-assessment match what the user observed (especially the hard gates)?

If Claude's retrospective claims G1 (do-not-commit) passed but the user saw an unauthorized commit in the git log, that's a flag. The user pushes back on the scoring. Claude revises or escalates.

User is **not** asked to fill in retrospective fields, write live observations during the session, or score axes. Those are Claude's responsibilities. User reviews and approves what Claude self-reported.

---

## Outcome of a retrospective

Possible outcomes after Claude's self-assessment + user review:

1. **All gates pass, scoring confirmed** — proceed to next stage in a fresh session.
2. **Soft gates fail** — spend a brief session updating `CLAUDE.md` / `prompts/PHASE-DOC-TEMPLATE.md` per the retrospective's Decisions section, THEN proceed.
3. **Hard gate fails** — stop. Diagnose. Fix the underlying issue (which may require a new ADR if it's a primitive protocol change). Re-run a recovery session if needed.
4. **User pushes back on Claude's scoring** — Claude reconsiders, may surface additional events the user observed but Claude didn't log. Updated retrospective re-reviewed.

The retrospective is part of the project's quality history. After the final milestone, the chain of M[NN].[N] retrospectives + M[NN] summaries + the optional `TRENDS.md` is the artifact someone can read to understand how the project actually got built — friction included.

---

## See also

- `prompts/RETROSPECTIVE-TEMPLATE.md` — per-session shape (the form Claude fills in)
- `prompts/SUMMARY-TEMPLATE.md` — per-parent-milestone roll-up
- `CLAUDE.md` §19 Retrospective Protocol — the procedural enforcement (what Claude does when, what user does when)
- `CLAUDE.md` §8 PR + commit workflow — the do-not-commit rule that the most important hard gate (G1) verifies
- `BUILD-PLAYBOOK.md` §3.5 — how this scoring framework hooks into the per-stage loop
- `persistence-architecture.md` — where each retrospective and summary file lives in the layer model
