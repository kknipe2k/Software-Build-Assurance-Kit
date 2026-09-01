# PHASES.md — the Software Build Assurance Kit bootstrap phase playbook

> **Loaded from the bootstrap `CLAUDE.md` router** (the M24.C DIET): the phase-local detail
> the router summarizes — read the section the router points you at, when it points you there.
> Section text moved here VERBATIM from the router (the conservation invariant: re-homed,
> never deleted), so in-section deixis ("below", "above") may still speak in the router's voice.

## Orientation — what this framework is (moved from the router)

## What this framework is — orient yourself before bootstrapping

Read these seven files in order before engaging with the user beyond the greeting:

1. **`sbak/templates/CALIBRATION-INTERVIEW.md`** — **read first**. The Custom-path authority: the verbatim 3 asks (each with its option table) + the confirmation turn, presented only when the user answers `Custom` to the one question. Its mode table also drives the Full path's mode inference. Without this you'll ad-lib differently each session and the trade-offs won't land consistently.
2. **`sbak/BUILD-PLAYBOOK.md`** — the methodology. Defines the four layers (Project / Milestone / Stage / Step), the three load-bearing constraints, the per-stage loop, the closeout protocol, the gates, the retrospective protocol, the gap-analysis protocol. **Part 0** defines the tier model.
3. **`sbak/FRAMEWORK-CONFIG.md`** — the tier and toggle reference. Two tiers (Full the default / Lite the low-ceremony escape; the third tier retired at M26.D), the machine-readable calibration core (`calibration-core.json` — the asks, per-tier toggles, severity, and derivation rules), and the toggle schema (retrospective depth, ledger discipline, web-verify, read-first cap, research mode, escalation, hook enforcement, explanation mode). This file is what you'll read most carefully — bootstrap is largely a calibration exercise.
4. **`sbak/persistence-architecture.md`** — the layer model. Where each artifact lives (Layers 1–5), who reads/writes when, the mutability matrix, the audit trail.
5. **`sbak/PROCESS-VALIDATION.md`** — the scoring framework. Three axes (process / artifact / forward-readiness), threshold gates (16 hard + 5 soft), outcome matrix, and the tier-conditional retrospective shape (Lite: brief / Full: two-axis).
6. **`sbak/STAGE-PROMPT-PROTOCOL.md`** — the XML schema for stage CLI prompts that go inside Phase docs (currently v1.9 — the authoritative version is the newest entry in that file's own `### Changelog`; the smoke suite binds this pin to it so it can't silently re-stale).
7. **`sbak/templates/PROJECT-CLAUDE.md`** — the per-project execution-rules template you'll customize and install as the project's own `CLAUDE.md` at the end of bootstrap.

Once you've read these, you understand the framework. The bootstrap workflow below is the playbook's "One-Time Project Setup" (Part 3.1) executed conversationally with the user, calibrated by tier.

---

## Phase 0 — the moved detail

Location consent is the installer's job now: `sbak-install` disclosed the footprint and asked before a byte landed, so the bootstrap does not re-ask where it is. The bootstrap's first response is the stamp echo plus the ONE question — **Full or Custom?** — and nothing else before it.

**Full** (the default): the user gets no further choices. Ask *"What do you want to build?"*, infer the operating mode from that first substantive answer, run discovery + Phase 1, and put the whole derived calibration in front of one human eyeball as the acceptance glance — one script-produced line after the spec lands. The user answers directly, describes, or punts; every derived value still reaches `project-config.md`, just without a quiz.

**Custom**: present the **calibration interview** from `sbak/templates/CALIBRATION-INTERVIEW.md` verbatim — the 3 asks (operating mode, tier, risk triggers), each with its option table, and the confirmation turn that surfaces every derived value — plus the smell-flagging rules. Don't paraphrase the option tables — the trade-offs only land if the user sees them side by side. The interview maps to `project-config.md` toggles via the table at the bottom of `CALIBRATION-INTERVIEW.md`.

Either way, proceed to Phase 0 Step 0.2 below — the tier-conditional discovery questions. Don't lock the calibration to `project-config.md` yet; Phase 1 may surface complexity that bumps tier upward (Custom) and the Full path's glance runs after the spec lands.

---

`operating_mode` is **orthogonal to the session-scoped `role`** (the 3-brain `{work, verifier, orchestrator, refactor}` axis): the SessionStart hook composes the read-first list from both. A pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any `operating_mode` outside the four values. If the user doesn't pick, default to `greenfield` — never error a project for an unset mode.

**Step 0.1 — Calibration.**

**Full path:** nothing is asked. Tier = Full; `operating_mode` = the inference from the first substantive answer (the mode table, default `greenfield` — state it in one clause so a typed mode word corrects it); risk triggers + a toggle smell (only when one fires) derive from the spec at the glance, `node sbak/scripts/calibration-derive.cjs --from-spec` (keyword tables as data in `sbak/calibration-core.json`; authority for everything else: the same core). The glance is a GLANCE, not a menu — one line, one enter; a typed mode word or trigger token corrects it. An under-derived trigger is exactly what the human eyeball on that line exists to catch (a silent miss would disarm G11 by construction).

**Custom path:** present the canonical interview from `sbak/templates/CALIBRATION-INTERVIEW.md`. **3 asks + 1 confirmation turn** (M26.D — the ratified shape; authority: `calibration-core.json`): mode (Step 0.0's leading ask), tier (per `sbak/FRAMEWORK-CONFIG.md` §3), risk triggers (the six surfaces, `sbak/FRAMEWORK-CONFIG.md` §4.19; `[]` is fine and common — risk overrides tier, and at Full a declared trigger arms the append-only-ledger CI workflow), then run `node sbak/scripts/calibration-derive.cjs --answers` and surface EVERY derived value in plain English with its one-line why (deliverable type from the description; verification locus from repo visibility + ship targets, never tier — KF-28; the per-stage cadence disclosure + fence; validator severity; the tier toggle set; the derived scaffold count), inviting correction. Present the ask tables verbatim — don't paraphrase or compress them. Nothing is locked until the user nods.

**Pacing + menu discipline (every asked exchange — the one question, the Custom interview, and discovery alike).** Ask **one question per turn**, then WAIT for the answer before asking the next — never batch questions into a wall. Lead each question with **numbered recommendations** inferred from the repo and the user's description, so the user can answer **accept-by-number** or override in their own words. Numbered options draw ONLY from documented dials (mode, tier, risk triggers, the file list, defer) — **never offer to disable a named control** (a hook, a validator, a gate, the fence). Skips are user-initiated only and carry their stated cost — when the user asks to skip, state that cost in one line before honoring the skip.

On the Custom path, after the user answers, **flag any toggle smells** per `CALIBRATION-INTERVIEW.md`'s smells section (Lite + audit need; Full + throwaway prototype; `bug_fix` + multi-week horizon), and confirm the calibration in plain English via the confirmation turn. On the Full path the smell rides the glance line, only when one exists.

**Don't lock the calibration to `project-config.md` yet** — that happens at end of Phase 1 (after the spec lands; on the Full path, at the glance's enter). The spec may surface complexity that bumps the project upward; bumping tier *before* generating scaffolds is cheap.

## Mode detection — the stripped-state detail

**Stripped project — the third state (check it BEFORE concluding "fresh bootstrap").** No project files does **not** automatically mean fresh: a previously-kitted repo whose scaffold was stripped (or an existing codebase the kit was bare-copied into) looks exactly like a fresh bootstrap to the two-state test, and silently treating it as fresh is how a repo re-enters with zero enforcement and nobody noticing. Run the mechanical classifier — `node sbak/templates/scripts/kit-update.cjs --detect` (or `scripts/kit-update.cjs --detect` where installed) — which reports `state=fresh | project | stripped` from three signals: a populated `CHANGELOG.md`, kit vocabulary in the git history, an app source tree (`src/`/`lib/`/`app/`). On `state=stripped`, surface and **ask**: *"this looks like a previously-kitted or existing project — re-adopt (`node scripts/kit-update.cjs --adopt`), full bootstrap, or stop?"* **Never silently classify a stripped repo as fresh, and never auto-route** — misclassifying a genuinely fresh bootstrap as stripped is as bad as the reverse, so the answer is always the user's.

## The full-file-list protocol (on request)

**If the user asks for the full file list (at the Phase-3 consent, or any time):** read out the canonical scaffold from `sbak/bootstrap/SCAFFOLD-TABLES.md` *verbatim* — the three Markdown tables (Always-generated, Full-only, Risk-armed) plus the Web/UI-only table when applicable. **Do not synthesize a tier comparison from memory** — paraphrasing has produced miscategorizations (e.g., mislabeling `ORCHESTRATOR.md`'s tier condition). Quote the tables; let the canonical text speak.

## Phase 1 — Spec authoring (full text)

### Phase 1: Spec authoring

Generate `spec/project-spec.md` from the discovery answers. Depth scales by tier:

**Lite:** ~1 page total.

- §1 Identity (what / what-not)
- §2 Scope (what's in v1; what's deferred)
- §3 Success criteria (3–5 bullets)

**Full:** ~2–3 pages.

- §1 Identity
- §2 Scope matrix (in / out / deferred — with version markers)
- §3 Architecture overview (one paragraph; detailed in ADRs as needed)
- §4 Engineering charter (gates, quality bar)
- §N Open questions

**Full:** the full structure from the original playbook (see `sbak/templates/PROJECT-CLAUDE.md` Phase 1 reference).

**Deliverable-type contract section (all tiers).** After the base spec, append the section matching `deliverable_type` from `sbak/templates/SPEC-TYPE-SECTIONS.md` — the contract that type lives on: `cli` → Command surface (args / exit codes / stdout); `library` → API surface (public exports / semver); `service` → Endpoint contracts (routes / auth / health); `web` → a pointer to `docs/design.md` + Visual acceptance criteria (authored at Phase 1.5/1.6); `other` → nearest fit + an Open-Questions flag that the type contract isn't specialized. This section drives the type-specific gates in `docs/gates.md` and the matching Verifier passes.

**IRL/HITL plan section (all tiers) — authored WITH the spec, never later.** Also append `sbak/templates/IRL-HITL-PLAN.md`: the drive moments per milestone boundary, what the human verifies **by hand** at each one, and — the column that gets dropped — **where each answer gets typed**. The obligations already exist scattered across the lifecycle (the close-gate drive, the App-Map, the Verifier behaviour pass, the friction stamp); authoring them here is what stops them ambushing the operator at a closeout menu, which is exactly what happened in a live build trial. If the milestone boundaries are not known yet, write the section with `TBD — set at Phase 2` in the boundary column and fill it at Phase 2; an honest interim beats an empty section. **Phase 1 AUTHORS this section — it is a mandatory part of the spec template (`sbak/templates/SPEC-TYPE-SECTIONS.md`); the floor is the backstop, not the primary:** `validators/validate-irl-plan.cjs` mechanically enforces the section — all three parts, each individually (heading + at least one table row) — on every Full-tier commit that stages the spec; a bootstrap that skips this section REDs at the first spec commit instead of shipping a milestone no human drove.

**Write the spec's examples in a form the harvest gate can read.** `validators/validate-spec-examples.cjs` demands that every literal example in the spec appears in at least one test fixture — the escape it closes is a spec example that no test ever met, which was the one wrong result to survive both arms of a controlled build trial. It recognizes **three structural forms**, so use them: an **`## Examples`** heading, a fenced block tagged ```` ```example ````, or a bolded **`**Example**`** list label. Prose is deliberately never harvested, so an example written as a bare backticked token in a requirements sentence is invisible to the gate — which is a limit of the gate, not a licence to write examples that way.

After the spec lands, **revisit tier**: did the spec surface complexity that pushes tier up? An "audit needs" requirement that wasn't obvious in Phase 0? Adjust before Phase 2 if so.

Surface for review. Iterate until accepted.

**Full path: the acceptance glance (after the spec is accepted).** Run `node sbak/scripts/calibration-derive.cjs --from-spec spec/project-spec.md [--mode <inferred>]` and print its ONE line verbatim: `Full / <mode> / risk triggers: <list> [enter to accept]`. Enter locks the calibration and writes `project-config.md`; a typed mode word or trigger token corrects the line and re-prints it. The line is script-produced — mode and triggers from the core's keyword tables — so an under-derived trigger is visible on it, never composed away (the one human eyeball that keeps G11 armed).

## Phases 1.5 / 1.6 — Design discovery + design.md (web/UI only)

### Phase 1.5 — Design discovery (web/UI only)

**Runs only when `deliverable_type: web`.** Skip entirely for cli / library / service / other — they have no design brief and proceed straight to Phase 2.

A web/UI build authors a design brief *before* any interface code, so the UI is consistent and actually designed rather than raw browser defaults (the framework's worst observed failure was a web app that passed every engineering gate and shipped unusable). Present the interview from `sbak/templates/DESIGN-DISCOVERY-INTERVIEW.md`. It opens with the gate question — **does the user have Claude Design?** — and routes three ways:

- **Path A (has Claude Design):** the user authors the system externally and drops the exported `design.md` into `docs/design.md`. Validate it has the 9 sections; skip the interview.
- **Path B1 (from scratch):** run the question set at tier-conditional depth (Lite ~8–10 starred questions / Full ~25–30).
- **Path B2 (community template):** the user starts from an `awesome-claude-design` template and the agent runs only the ~10 delta questions.

**User journeys (web only; authored draft-for-ratification).** Alongside the design discovery, draft a user-journeys section (in `docs/design.md`, or the spec's web section): 3–5 recurring scenarios mapped step-by-step to screens, each ending in a concrete external action or an explicit no-action. Surface the draft for ratification with the design brief — the operational-flow artifact a screens-only brief misses.

### Phase 1.6 — design.md authoring (web/UI only)

Synthesize the Phase 1.5 answers into `docs/design.md` using the 9-section structure in `sbak/templates/design.md` — every `{{placeholder}}` replaced with a concrete value, none left in the instance file. Surface the draft for approval (worth a pre-write look even under `pre_write_surface: spec_and_plan_only` — it drives every UI stage). On approval, write `docs/design.md` - stage prompts cite it on demand (the I8 read-first restructure deliberately keeps it off the preload list; do not add it). Then proceed to Phase 2.

## Phase 2 — Phased milestone breakdown (full text)

### Phase 2: Phased milestone breakdown

From the spec, propose milestones. Count and depth scale by tier:

- **Lite:** 1–3 milestones; each is a single feature increment, no formal closeout, ~3–5 day estimate
- **Full:** 3–6 milestones; each has staged work (A, B, C — add D only when the milestone genuinely splits further) and runs Stage E closeout, 1–2 weeks each. **Stage count is a per-milestone judgment recorded in the Phase doc, not a tier constant** (KF-19 resolved at M26.D).

Each milestone (regardless of tier):

- Has a one-line goal
- Has explicit acceptance criteria (3–6 items; 2–3 for Lite)
- Names dependencies (prior milestones, ADRs)
- Is scoped to fit the tier's milestone size

Surface for review. User confirms or revises milestone count, scope, ordering.

**Single-feature calibration: propose ONE milestone.** Under the existing-repo, single-feature calibration (Phase 0.2), the milestone-count guidance above is for full products — propose a one-milestone plan (stage A, plus B only if the work genuinely splits, then V and E) and let the user ratify it. If the feature genuinely needs multiple milestones, say so plainly — that is a real project, not the shortcut.

**Draft the ranked backlog (`docs/backlog.md`) from this breakdown.** The milestone plan already *implies* a priority order — Phase 2 makes it explicit and ranked. Synthesize the spec's scope + the milestone ordering into a first-draft ranked list of user stories in `docs/backlog.md` (from `sbak/templates/backlog.md`, tier-scaled: Lite `# / story / status`; Full adds `Depends on` + the re-rank override log). This is the artifact the off-track check (G8) measures against, so it must be **surfaced explicitly for human ratification** — the backlog is HITL co-authored, and the agent only *drafts/proposes* the ranking (no AI-only edits, ever — `sbak/FRAMEWORK-CONFIG.md` §4.15). The actual file is written in Phase 3 with the rest of the scaffold; here you draft the *content* (the ranked stories) and get the user's sign-off on the ordering. Add it to the work read-first list (it already is in `sbak/templates/dot-claude/read-first-list.txt`).

## Phase 4 — First Phase doc (full text)

### Phase 4: First Phase doc

Generate the first milestone Phase doc. Depth and shape are tier-conditional:

**Lite:** a single markdown file at `docs/build-prompts/M01-<title>.md` with a brief structure (Background / Scope / Tasks list / Definition of done). No XML stage prompts; the agent works from the markdown directly.

**Full:** the full Phase doc structure —

- Background / Scope / References / Document structure / Implementation Workflow
- Per-stage sections (X.1 Problem / X.2 Files / X.3 Detailed changes / X.4 Tests / X.5 CLI Prompt / X.6 Commit Message)
- XML stage prompts validating against `sbak/STAGE-PROMPT-PROTOCOL.md`; pre-authored commit messages per stage
- Staged work matching the Phase-2 plan (A, B, C — D only when the milestone genuinely splits) + Stage E closeout. **Stage count is a per-milestone judgment, not a tier constant** (KF-19 resolved at M26.D).

**Brownfield Stage-A shape (single-feature calibration).** When the project came through the existing-repo, single-feature path (Phase 0.2), the M01 Phase doc's Stage A carries a `<fan_out_grep>` block over the feature's named surface (the "where does it live" answer) and an **impact-analysis step**: record the existing tests that cover the "must not change" behaviors in the Phase doc, and re-run that list at stage end alongside the stage's own gates. This is authoring discipline on an existing optional prompt slot — no new schema, no new mode, no new gate.

Iterate with user until M01 Phase doc is accepted. The XML stage prompts (Full) must validate against `sbak/STAGE-PROMPT-PROTOCOL.md`.

## Phase 5 — Handoff (full text)

### Phase 5: Handoff to Stage M01.A

The bootstrap is complete. Surface the final state:

- All scaffold files generated and listed (with realistic counts: ~52 for Lite, ~119 for Full (the unarmed reference; +2 files when a risk trigger arms the ledger workflow, the manifest row set's 2 risk-armed rows: `validators/check-append-only.cjs` + `.github/workflows/append-only-ledger.yml`) — including Phase 1/4 outputs, not just the always-generated set; derived from `sbak/golden-manifest.json` — see the counting note in `sbak/templates/CALIBRATION-INTERVIEW.md`)
- The project's `CLAUDE.md` placed via `node scripts/kit-update.cjs --place-project-claude` — the bootstrap root replaced, or, on a combined root (the installer's import line), merged: the person's file kept byte-for-byte, the project rules at `CLAUDE.sbak.md`
- `project-config.md` written with the agreed tier and toggles
- `.claude/` hooks installed; the SessionStart hook prints the stamp + orientation manifest on the next session (session-start entries inlined, the rest read at their `when:` and checked at the gate)
- **Read-first lists resolve:** run `node .claude/hooks/session-start-read-first.cjs --check` — exit 0, or it names the list and the dead entry (a Phase-4 rename the list never followed is the classic; fix the entry before handoff)
- **Template↔live divergence check:** run the read-only `node scripts/kit-update.cjs` and surface its report as part of the handoff — template↔live divergence is visible before the first work session, instead of surfacing mid-milestone as mystery drift.
- M01 Phase doc ready at `docs/build-prompts/M01-<title>.md`
- **Git remote check (do this before any push).** Route by how the kit arrived. **From the release ZIP (the standard path):** a fresh `git init` repo has no remote at all — nothing to reset; an existing repo keeps its own `origin` untouched. **From a clone (contributor/evaluator path):** `origin` still points at the kit's repo — pushing now would target the kit, not the user's project; run `git remote remove origin` as the final scaffold action. Either way, surface the three options so the user picks where their project actually lives:
  - **Local-only (no GitHub):** nothing more to do — commits stay local.
  - **Existing empty GitHub repo:** `git remote add origin https://github.com/<user>/<repo>.git` then `git push -u origin <branch>`.
  - **Create a new GitHub repo (needs `gh` authenticated):** `gh repo create <name> --private --source=. --remote=origin --push`.
  Don't guess the user's choice — ask. If the user defers, leaving `origin` unset is the safe state (a later push errors clearly instead of silently targeting the kit).
- **Next action:** open a fresh Claude Code session in this directory; the new `CLAUDE.md` will take over as the auto-loaded entry point, and the SessionStart hook will print the read-first stamp + manifest. For Lite, just say "let's start M01"; for Full, begin Stage A with `/stage M01 A` in the builder session (pasting the M01.A stage prompt from the Phase doc is the fallback).
- **Opening the build terminals — walk the user through it, one step at a time (Full).** This is the single most confusing moment for a new user: three sessions are in play (this ending bootstrap session plus two new ones), and both new sessions read ONE role file until the worktree split. Do not deliver the topology as prose - give the numbered steps below one at a time, and quote each step's verification line. Say plainly first: **this is the moment to open the two new terminal windows - this bootstrap session is retired and is NEITHER of them; the user closes it at step 4.**

  Before step 1, run the unborn-HEAD check yourself (don't let the user discover it): `git rev-parse --verify HEAD`. **Non-zero exit** (ZIP into a fresh `git init` - zero commits yet, an unborn HEAD that `git worktree add` cannot resolve; G1 holds through bootstrap, so the project's first commit is M01.A's): both new sessions run in THIS directory until M01.A's first commit lands; after that commit, `node scripts/set-mode.cjs --split <milestone-branch>` (it creates `../<project>-build-wt` fail-closed and prints the launch block) and the builder moves there, the orchestrator keeps the main checkout - and from that split on, the terminal channel carries every packet between the two sessions. **Exit 0** (a commit exists - e.g. the clone path): the worktree split is available immediately. (Found the hard way in a live trial - the handoff instructed the worktree topology unconditionally, the repo was empty, and the operator had to invent an undocumented interim mid-milestone. The interim is legitimate; leaving it unwritten is not.)

  The steps, given to the user one at a time. Each step's command block is **pasted into a terminal, not into a Claude session** - say that explicitly every time, and substitute `<project-path>` with the project's REAL directory (you know it - this directory). **First ask (or detect) which shell that terminal runs — cmd, PowerShell, or a POSIX shell — once, and emit every block in that ONE shell's form, never both:** cmd needs `cd /d` plus the full path (the `/d` matters across drives); PowerShell and macOS/Linux use plain `cd` with the path (tilde form on POSIX).

  1. **Open a NEW terminal window - Terminal 1 = orchestrator.** It adjudicates and routes; it never edits code. Say: *"Open a new terminal window and paste this whole block into it:"*

     ```
     cd <project-path>
     node scripts/set-mode.cjs orchestrator
     claude
     ```

     **Then confirm together:** the session's first response must echo a read-first stamp saying `role=orchestrator`. If it says `role=work` or shows no stamp, close that window and redo this step. Do not continue until this is confirmed.

  2. **Only after Terminal 1 is confirmed**, say: *"Open a second new terminal window - this one is the BUILDER - and paste this whole block into it:"*

     ```
     cd <project-path>
     node scripts/set-mode.cjs work
     claude
     ```

     **Then confirm:** the stamp says `role=work`. The order is load-bearing: both sessions read the same `.claude/role` file until the worktree split, so it is always cd → set-mode → launch → confirm, one terminal at a time - never both set-modes first.

  3. **In Terminal 2 (the builder session) only**, the user starts Stage A with `/stage M01 A` (pasting the M01.A stage prompt from `docs/build-prompts/M01-<title>.md` is the fallback) - either goes into the **Claude session**, not the shell. If a stage prompt lands in the wrong session, the mode-check hook blocks it; that block is protection working, not an error.

  4. **Close this bootstrap window.** Everything decided here is persisted in the docs, not in this conversation. Until the worktree split the user carries every surface - gate packets, RED summaries, stage-end packets - to Terminal 1 (the orchestrator) by hand; from the split on, the terminal channel carries them: `/listen <stage>` once in Terminal 1, `/send` for every reply, and only RED approval and the friction stamp are still typed. Only one role acts at a time. Adjudication belongs inside the fenced orchestrator session, not with whatever capable agent sits nearby; repeat this reminder at every stage boundary.

After handoff, this bootstrap CLAUDE.md no longer exists — the project's own CLAUDE.md is the entry point.

---

## If something goes wrong — the accommodations

If the user seems lost, is new to the framework, or asks "how does this work / how do I use this," point them at `sbak/QUICKSTART.md` (the shortest path to a running build loop, with prerequisites, the clone gotcha, the per-stage loop mechanics, and a full file map) and `sbak/HOW-IT-WORKS.html` (a visual overview they can open in a browser). Don't make them reverse-engineer the framework from the methodology files.

If the user asks to skip phases (e.g., "I already have a spec, just generate the scaffolds"), accommodate. Read the spec they provide, jump to Phase 2 or 3 as appropriate, but verify the spec covers the equivalent of the Phase 1 structure for the chosen tier before proceeding. Skipping phases is fine as long as the deliverables those phases would have produced are already in hand.

If the user wants to skip the tier inference entirely ("just use Full / just use Lite"), accommodate. Surface a one-sentence note that you're skipping calibration and proceed at the chosen tier. The override log captures the explicit choice.

---

## Operating modes (the leading dial)

The mode is the **leading dial**: inferred from the first substantive answer on the Full path, asked first (*"what kind of work is this?"*) on the Custom path. All four modes are live:

Each mode's summary + full Phase-0 playbook lives in its `sbak/bootstrap/MODE-<name>.md` file (all four **Implemented**), loaded one-per-session at Step 0.0.

`operating_mode` is project-scoped (`project-config.md`) and orthogonal to the session-scoped `role` (the 3-brain `{work, verifier, orchestrator, refactor}` axis); the SessionStart hook composes the read-first list from both. For an unset or unrecognized mode, default to `greenfield` — never error a project for the mode.

## Moved router fragments (annotations trimmed from kept router lines)

- This is the bootstrap version of `CLAUDE.md`. After bootstrap completes, this file gets replaced by a project-specific `CLAUDE.md` (generated from `sbak/templates/PROJECT-CLAUDE.md`) calibrated to the tier the user selects.
- Mode detection — do this first, every session
- Before anything else, check whether
- If you see this bootstrap CLAUDE.md in project mode, surface as an error: *"This is the bootstrap CLAUDE.md but the project appears initialized. The bootstrap likely failed to replace this file. Check `sbak/templates/PROJECT-CLAUDE.md` and copy it over manually as `CLAUDE.md`, then start a fresh session."*
- — idempotent, and it reports exactly what it installed, verified, or left alone (new repo: run `git init` first, or the hooks path can't be set)
- — the agent reads this so you don't have to
- , so the user can stop you if they're in the wrong place
- (project-scoped; recorded in `project-config.md`)
- synthesize literature/data into a paper + an interactive illustrative app
- review an existing codebase; the deliverable is a findings report + remediation backlog, not new code
- Six phases. Each phase has explicit deliverables. Surface to the user at each phase boundary; do not proceed without approval. **The depth of each phase is tier-conditional** — the tier you and the user agreed in Phase 0 determines how heavy each subsequent phase gets.
- Goal: pick a mode and tier, confirm the derived toggles, then understand the project well enough to draft a v1 spec at the depth the tier warrants.
- (it carries the Step-0.2 greenfield discovery playbook). This is the path the framework handles best.
- (the reduced 3-phase shape; replaces the greenfield discovery and Phases 1–2 + 4).
- (Phase R → explicit user re-tier → Phase A).
- — the tier-scaled question sets, the target-OS/repo-visibility + `LICENSE` facts, the existing-repo single-feature shortcut, and the brownfield known-issue harvest —
- , read at Step 0.0 when the mode resolved to `greenfield`
- ; the other three stay unread this session:**
- Generate the project's directory structure and companion docs from `sbak/templates/`. Replace `{{PLACEHOLDER}}` values with project's actual values. **Scaffold contents are tier-conditional**:
- It carries, verbatim, the canonical tier tables (Always-generated / Full-only / Risk-armed / Web-UI-only), the full validator set, and the permission-fence, verification-locus, and App-Map conditional notes.
