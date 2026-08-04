# CLAUDE.md — Software Build Assurance Kit (Bootstrap Mode)

> **Human reader: you can skip this file.** These are the agent's bootstrap instructions, auto-loaded by Claude Code. Start at `README.md` → `sbak/QUICKSTART.md`.

> **Auto-loaded by Claude Code on session start.** Replaced at the end of bootstrap by the project's own `CLAUDE.md` (hard rule #5).

---

## First-response self-check — before anything else, every session

**First-response self-check — every bootstrap session (one rule).** If this session started with **no `[read-first stamp]` line** in its context, say so before anything else, instruct the one-command exit, and **stop until the user chooses**: `node sbak/templates/scripts/kit-update.cjs --adopt` (or `node scripts/kit-update.cjs --adopt` where installed) installs and verifies the live hook layer. A stampless session means the session hooks aren't running; don't proceed as if they were. If the stamp IS present, echo it and continue below.

Your first response (after the self-check above) is the **cwd echo + scope statement**:

> I'm running in `<cwd>` — this is where I'll create your project files (`~97` files at the default Full tier, including `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files like `CLAUDE.md` and `project-config.md`). **If this is the right directory, tell me what you want to build and we'll start.** If not, exit with Ctrl+C twice, `cd` to the right directory, and re-run `claude` from there — I won't write outside this folder. Type `details` if you want the full file list before we begin.
>
> Up front: **you are in the bootstrap window** - planning and scaffolding only. At completion you'll be instructed to open **two new terminal windows** (orchestrator + builder) that run the rest of the build; this window retires then.

**If the user types `details`:** quote the scaffold tables *verbatim* from `sbak/bootstrap/SCAFFOLD-TABLES.md`. **Do not synthesize a tier comparison from memory.**

Next: the calibration interview from `sbak/templates/CALIBRATION-INTERVIEW.md`, verbatim, as your *second* response → then Phase 0.

---

## Mode detection — the second check, every session

Then check whether you're in **bootstrap mode** or **project mode**.

**Bootstrap mode** = this directory contains the starter-kit framework files (`sbak/BUILD-PLAYBOOK.md`, `sbak/STAGE-PROMPT-PROTOCOL.md`, `sbak/templates/`) but no project files yet. Specifically, ALL of these are absent:

- `project-config.md`
- `docs/identity.md`
- `docs/scope.md`
- `docs/build-prompts/` (or it exists and is empty)

**Project mode** = at least one of those exists. If you see this bootstrap CLAUDE.md in project mode, surface the bootstrap-failed error (verbatim text: `sbak/bootstrap/PHASES.md` §Mode detection).

**Stripped project — the third state, checked BEFORE "fresh".** Run `node sbak/templates/scripts/kit-update.cjs --detect`; on `state=stripped`, surface and **ask** — re-adopt (`node scripts/kit-update.cjs --adopt`), full bootstrap, or stop. **Never silently classify a stripped repo as fresh, and never auto-route.** Detail: `sbak/bootstrap/PHASES.md` §Mode detection.

## What this framework is

Read the seven framework files ordered in `sbak/bootstrap/PHASES.md` §Orientation first. The stage-prompt protocol is currently v1.9 — the authoritative version is the newest entry in `sbak/STAGE-PROMPT-PROTOCOL.md`'s own `### Changelog`; the smoke suite binds this pin to it so it can't silently re-stale.

---

## The bootstrap workflow

Six phases, tier-conditional depth, approval at every phase boundary — the per-phase playbook: `sbak/bootstrap/PHASES.md`.

### Phase 0: Calibration + discovery

**Step 0.0 — Operating mode (leading question, asked first).** The interview's first ask: the leading question — *"What kind of work is this?"* — per the `sbak/templates/CALIBRATION-INTERVIEW.md` mode table. The answer sets `operating_mode` and routes the rest of Phase 0:

**On mode resolution, read exactly ONE mode playbook — `sbak/bootstrap/MODE-<name>.md` — before proceeding (default `greenfield` if the user doesn't pick):**

- **`greenfield`** (default) — build something new → read `sbak/bootstrap/MODE-greenfield.md`.
- **`bug_fix`** — fix a known defect in existing code → read `sbak/bootstrap/MODE-bug_fix.md`.
- **`research_publish`** — paper + illustrative app from literature/data → read `sbak/bootstrap/MODE-research_publish.md`.
- **`audit`** — review an existing codebase — findings + remediation backlog, not new code → read `sbak/bootstrap/MODE-audit.md`.

**Step 0.1 — Calibration interview (every project, both tiers).** Present `sbak/templates/CALIBRATION-INTERVIEW.md` verbatim — 3 asks (mode, tier, risk triggers) + 1 confirmation turn. Derive the rest via `sbak/scripts/calibration-derive.cjs`; surface each derived value's why in the confirmation turn; flag toggle smells; don't lock `project-config.md` until the spec lands. Detail: `sbak/bootstrap/PHASES.md` §Phase 0.

**Step 0.2 — Discovery.** The greenfield discovery playbook lives in `sbak/bootstrap/MODE-greenfield.md`. The other three modes replace this step per their own playbooks.

### Phase 1: Spec authoring

`spec/project-spec.md` from discovery, tier-scaled; append the `deliverable_type` section from `sbak/templates/SPEC-TYPE-SECTIONS.md`; revisit tier; iterate until accepted. Detail: `sbak/bootstrap/PHASES.md` §Phase 1.

### Phases 1.5 + 1.6: Design discovery → `docs/design.md` (web/UI only)

Only for `deliverable_type: web`: present `sbak/templates/DESIGN-DISCOVERY-INTERVIEW.md` (the Claude Design gate routes it), then author `docs/design.md` per `sbak/templates/design.md` and surface it pre-write. Detail: `sbak/bootstrap/PHASES.md`.

### Phase 2: Phased milestone breakdown

Propose tier-scaled milestones; draft the ranked backlog `docs/backlog.md` from `sbak/templates/backlog.md` — the user signs off the ordering explicitly (HITL, never AI-only). Detail: `sbak/bootstrap/PHASES.md` §Phase 2.

### Phase 3: Project scaffold generation

**Scaffold mechanism — copy-then-fill, never authoring (hard rule):** full rules + the bug_fix trim spec: `sbak/bootstrap/SCAFFOLD-TABLES.md` §Phase-3 generation protocol — read them with the tables.

**The scaffold tables live in `sbak/bootstrap/SCAFFOLD-TABLES.md` — read that file NOW, before any generation step.** The `details` protocol quotes those tables from that file byte-identically. Do not generate from memory what that file specifies.

The pre-flight disclosure (rule #11, ask-and-WAIT — ONE consent covers the whole footprint; the per-category approval boundaries were deleted at M26.D, KF-16 ratified) and the four on-approval write steps: same section.

### Phase 4: First Phase doc

`docs/build-prompts/M01-<title>.md`, tier-shaped; XML stage prompts validate against `sbak/STAGE-PROMPT-PROTOCOL.md`; iterate until accepted. Detail + the brownfield Stage-A shape: `sbak/bootstrap/PHASES.md` §Phase 4.

### Phase 5: Handoff to Stage M01.A

Surface the final state, run the read-only kit-update divergence report, settle the git remote — ZIP arrival: nothing to reset; clone: run `git remote remove origin` before any push — then **ask** where the project lives; never guess. Instruct the two-terminal topology. Next: fresh session; Full pastes the M01.A stage prompt. Checklist: `sbak/bootstrap/PHASES.md` §Phase 5.

---

## Hard rules during bootstrap

These apply to YOU (Claude) during the bootstrap workflow, before the project's own rules are in place:

1. **Surface artifacts for approval per the `pre_write_surface` toggle (default `spec_and_plan_only` — `calibration-core.json` defaults).** `always` → surface every draft, wait, then write. `spec_and_plan_only` → surface the spec (Phase 1) and milestone plan (Phase 2) pre-write; write the scaffold (Phase 3) and Phase docs (Phase 4) directly, surfaced for *post-write* review. `none` → write-then-review everything. Override in `project-config.md`. The pre-flight footprint disclosure (rule #11) and the do-not-commit-without-approval rule (G1) always hold regardless of this toggle.
2. **Do not skip phases.** The order matters. Phase 1 needs Phase 0's answers; Phase 4 needs Phase 1–3's outputs.
3. **Do not invent content the user hasn't confirmed.** When a placeholder needs a value, ask. Don't guess plausible-sounding defaults that the user will have to undo later.
4. **Do not delete `sbak/BUILD-PLAYBOOK.md`, `sbak/FRAMEWORK-CONFIG.md`, `sbak/STAGE-PROMPT-PROTOCOL.md`, `sbak/PROCESS-VALIDATION.md`, or `sbak/persistence-architecture.md` during bootstrap.** They stay in place under `sbak/` after handoff.
5. **Do replace this bootstrap CLAUDE.md with the project's CLAUDE.md at end of Phase 3.** That's the handoff. The bootstrap dies so the project rules can take over.
6. **Do not start Phase 4 (M01 Phase doc) until Phase 3 (scaffold) is complete and approved.** Phase 4 references `project-config.md`, the gate matrix (Full), identity, and scope docs that Phase 3 produces.
7. **Do not invent placeholder values when the user hasn't given them.** If a `{{TOKEN}}` in a template needs filling and the discovery phase didn't surface a value, surface the missing token and ask. Don't guess plausible defaults that the user will have to undo. (Especially: stack-language names, license, project name, version numbers.)
8. **Do install the `.claude/` hook scaffold during Phase 3, regardless of tier.** Hook enforcement is the cheapest reliability win the framework offers. Even Lite tier benefits.
9. **Narrate significant decisions as you make them (`explanation_mode: standard` — the one default; the expertise ask was retired at M26.D, KF-07).** Why this library; why this scope cut; why this ordering — a line or two with the artifact, not a lecture. Dial narration up (`verbose`) or down (`terse`) in `project-config.md` any time.
10. **Web-verify external facts before proposing them (`research_mode: best_practice_first` — the standing default for every project).** Library versions, framework idioms, security best practices — confirm current state from authoritative sources before drafting code. Don't waste a turn on values that will need correction.
11. **Disclose the filesystem blast radius — twice, at two depths.** (a) **Session start, before the calibration interview:** echo the current working directory and a one-line scope statement ("I'll create your project files here — ~97 at the default Full tier, including `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files"). Confirms the user is in the right repo before they invest time in calibration + discovery. Offer `details` on request. (b) **Phase 3, before any disk write:** the full itemized count + directories, again offering the full list on request. The user consents to the footprint twice — once on *location* up front, once on *content* at write-time — and should never first learn what was written to their root only from the post-write summary.
12. **Write all scaffold files as UTF-8 without a BOM; never let PowerShell's default encoding touch them.** The templates are full of em-dashes and `🔴🟡🟢` emoji. `Get-Content -Raw` / `Set-Content` without `-Encoding UTF8` mojibakes every one. Use the encoding-safe Write/Edit tools, not shell file I/O, for scaffold writes — and verify with a mojibake search before handoff.

---

## If something goes wrong

If the user aborts mid-bootstrap, leave any partial files in place (don't roll back unilaterally) and surface what was generated so far. Re-running the bootstrap should detect partial state (e.g., spec exists but no scaffold) and offer to resume from the appropriate phase rather than restart from scratch.

If a phase fails partway and you're unsure of the recovery path, surface the partial state and the original calibration. The user can either: (a) finish the phase manually with your help, (b) re-tier downward to a simpler shape and continue, (c) start a fresh session with the partial state intact.

If you're in bootstrap mode and the user wants to do something other than bootstrap — e.g., they want to read the playbook, ask questions about the framework, or just chat — engage normally. Don't force the bootstrap workflow if it's not what they want.

Lost user, skip-phases, skip-tier: accommodate per `sbak/bootstrap/PHASES.md` §If something goes wrong (verify skipped deliverables are in hand; log the override).
