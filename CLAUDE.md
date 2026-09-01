# CLAUDE.md — Software Build Assurance Kit (Bootstrap Mode)

> **Human reader: you can skip this file.** These are the agent's bootstrap instructions, auto-loaded by Claude Code. Start at `README.md` → `sbak/QUICKSTART.md`.

> **Auto-loaded by Claude Code on session start.** Replaced at the end of bootstrap by the project's own `CLAUDE.md` (hard rule #5).

---

## First response — every session

Echo the `[read-first stamp]` line from your context (the SessionStart hook prints it; a missing stamp is caught by the hook layer itself, not by you). Your first response is that echo plus exactly ONE question — nothing else before it:

> **Full or Custom?** Full (the default): no further choices — I set everything up and show you one line to accept later. Custom: three short questions first.

**Full** → ask *"What do you want to build?"*, infer `operating_mode` from that answer (the interview's mode table, default `greenfield`; say it so a mode word corrects it), then discovery → Phase 1. After the spec lands, print the glance — ONE line from `node sbak/scripts/calibration-derive.cjs --from-spec spec/project-spec.md [--mode <inferred>]`, verbatim, never composed: `Full / <mode> / risk triggers: <list> [enter to accept]`. Enter accepts; a mode word or trigger token corrects it. Then write `project-config.md` (Phase 2 next).

**Custom** → the M26 interview verbatim from `sbak/templates/CALIBRATION-INTERVIEW.md` (3 asks + 1 confirmation turn), then Phase 0.

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

### Phase 0: The one question + discovery

**Step 0.0 — Full or Custom (already asked in your first response).** Full: the mode is inferred from the first substantive answer, corrected by a mode word. Custom: the mode is the interview's leading ask. Either way:

**On mode resolution, read exactly ONE mode playbook — `sbak/bootstrap/MODE-<name>.md` — before proceeding (default `greenfield` if the user doesn't pick):**

- **`greenfield`** (default) — build something new → read `sbak/bootstrap/MODE-greenfield.md`.
- **`bug_fix`** — fix a known defect in existing code → read `sbak/bootstrap/MODE-bug_fix.md`.
- **`research_publish`** — paper + illustrative app from literature/data → read `sbak/bootstrap/MODE-research_publish.md`.
- **`audit`** — review an existing codebase — findings + remediation backlog, not new code → read `sbak/bootstrap/MODE-audit.md`.

**Step 0.1 — Calibration.** **Full:** nothing more is asked — risk triggers derive from the spec via `sbak/scripts/calibration-derive.cjs --from-spec` (keyword tables in `sbak/calibration-core.json`), eyeballed once at the glance; a toggle smell rides that line only when one fires. **Custom:** present `sbak/templates/CALIBRATION-INTERVIEW.md` verbatim — 3 asks + 1 confirmation turn; derive the rest with `--answers`, surface each derived value's why, flag smells. Either path: don't lock `project-config.md` until the spec lands. Detail: `sbak/bootstrap/PHASES.md` §Phase 0.

**Step 0.2 — Discovery.** The greenfield discovery playbook lives in `sbak/bootstrap/MODE-greenfield.md`. The other three modes replace this step per their own playbooks.

### Phase 1: Spec authoring

`spec/project-spec.md` from discovery, tier-scaled; append the `deliverable_type` section AND the mandatory IRL/HITL plan section from `sbak/templates/SPEC-TYPE-SECTIONS.md` (Phase 1 authors it; the validator is the backstop); revisit tier; iterate until accepted. **Full path: after acceptance, the glance** — run `calibration-derive --from-spec`, print its one line, and on enter write `project-config.md`. Detail: `sbak/bootstrap/PHASES.md` §Phase 1.

### Phases 1.5 + 1.6: Design discovery → `docs/design.md` (web/UI only)

Only for `deliverable_type: web`: present `sbak/templates/DESIGN-DISCOVERY-INTERVIEW.md` (the Claude Design gate routes it), then author `docs/design.md` per `sbak/templates/design.md` and surface it pre-write. Detail: `sbak/bootstrap/PHASES.md`.

### Phase 2: Phased milestone breakdown

Propose tier-scaled milestones; draft the ranked backlog `docs/backlog.md` from `sbak/templates/backlog.md` — the user signs off the ordering explicitly (HITL, never AI-only). Detail: `sbak/bootstrap/PHASES.md` §Phase 2.

### Phase 3: Project scaffold generation

**Scaffold mechanism — copy-then-fill, never authoring (hard rule):** full rules + the bug_fix trim spec: `sbak/bootstrap/SCAFFOLD-TABLES.md` §Phase-3 generation protocol — read them with the tables.

**The scaffold tables live in `sbak/bootstrap/SCAFFOLD-TABLES.md` — read that file NOW, before any generation step.** A user asking for the full file list gets those tables quoted byte-identically from that file. Do not generate from memory what that file specifies.

The pre-flight disclosure (rule #11: ONE consent line, ask-and-WAIT, carrying the protected-path notice — the per-category approval boundaries were deleted at M26.D, KF-16 ratified), the four on-approval write steps, and the one-line post-write review: same section.

### Phase 4: First Phase doc

`docs/build-prompts/M01-<title>.md`, tier-shaped; XML stage prompts validate against `sbak/STAGE-PROMPT-PROTOCOL.md`; iterate until accepted. Detail + the brownfield Stage-A shape: `sbak/bootstrap/PHASES.md` §Phase 4.

### Phase 5: Handoff to Stage M01.A

Surface the final state, run the read-only kit-update divergence report, settle the git remote — ZIP arrival: nothing to reset; clone: run `git remote remove origin` before any push — then **ask** where the project lives; never guess. Instruct the two-terminal topology. Next: fresh session; Full starts Stage M01.A with `/stage M01 A` (pasting the XML stage prompt from the Phase doc is the fallback). Checklist: `sbak/bootstrap/PHASES.md` §Phase 5.

---

## Hard rules during bootstrap

These apply to YOU (Claude) during the bootstrap workflow, before the project's own rules are in place:

1. **Surface artifacts for approval per the `pre_write_surface` toggle (default `spec_and_plan_only` — `calibration-core.json` defaults).** `always` → surface every draft, wait, then write. `spec_and_plan_only` → surface the spec (Phase 1) and milestone plan (Phase 2) pre-write; write the scaffold (Phase 3) and Phase docs (Phase 4) directly, surfaced for *post-write* review. `none` → write-then-review everything. Override in `project-config.md`. The pre-flight footprint disclosure (rule #11) and the do-not-commit-without-approval rule (G1) always hold regardless of this toggle.
2. **Do not skip phases.** The order matters. Phase 1 needs Phase 0's answers; Phase 4 needs Phase 1–3's outputs.
3. **Do not invent content the user hasn't confirmed.** When a placeholder needs a value, ask. Don't guess plausible-sounding defaults that the user will have to undo later.
4. **Do not delete `sbak/BUILD-PLAYBOOK.md`, `sbak/FRAMEWORK-CONFIG.md`, `sbak/STAGE-PROMPT-PROTOCOL.md`, `sbak/PROCESS-VALIDATION.md`, or `sbak/persistence-architecture.md` during bootstrap.** They stay in place under `sbak/` after handoff.
5. **Do place the project's CLAUDE.md at end of Phase 3 via `node scripts/kit-update.cjs --place-project-claude <filled-file>` — replace the kit's root, MERGE a combined one.** A root carrying the installer's `@sbak/CLAUDE.md` import line is the person's file: the project rules land in `CLAUDE.sbak.md`, the import line is rewritten to `@CLAUDE.sbak.md`, their bytes survive. Otherwise the bootstrap file is overwritten — it dies so the project rules take over.
6. **Do not start Phase 4 (M01 Phase doc) until Phase 3 (scaffold) is complete and approved.** Phase 4 references `project-config.md`, the gate matrix (Full), identity, and scope docs that Phase 3 produces.
7. **Do not invent placeholder values when the user hasn't given them.** If a `{{TOKEN}}` in a template needs filling and the discovery phase didn't surface a value, surface the missing token and ask. Don't guess plausible defaults that the user will have to undo. (Especially: stack-language names, license, project name, version numbers.)
8. **Do install the `.claude/` hook scaffold during Phase 3, regardless of tier.** Hook enforcement is the cheapest reliability win the framework offers. Even Lite tier benefits.
9. **Narrate significant decisions as you make them (`explanation_mode: standard` — the one default; the expertise ask was retired at M26.D, KF-07).** Why this library; why this scope cut; why this ordering — a line or two with the artifact, not a lecture. Dial narration up (`verbose`) or down (`terse`) in `project-config.md` any time.
10. **Web-verify external facts before proposing them (`research_mode: best_practice_first` — the standing default for every project).** Library versions, framework idioms, security best practices — confirm current state from authoritative sources before drafting code. Don't waste a turn on values that will need correction.
11. **Disclose the filesystem blast radius once, at Phase 3, before any disk write — ONE consent line, ask-and-WAIT** (itemized count + directories, the offer of the full list, and the protected-path Shift+Tab-until-Manual sentence — the exact line: `sbak/bootstrap/SCAFFOLD-TABLES.md` §Phase-3). Location consent was the installer's; this is the *content* consent. After writing: one line — "scaffold written, N files, review when you like" — never silent.
12. **Write all scaffold files as UTF-8 without a BOM; never let PowerShell's default encoding touch them.** The templates are full of em-dashes and `🔴🟡🟢` emoji. `Get-Content -Raw` / `Set-Content` without `-Encoding UTF8` mojibakes every one. Use the encoding-safe Write/Edit tools, not shell file I/O, for scaffold writes — and verify with a mojibake search before handoff.

---

## If something goes wrong

If the user aborts mid-bootstrap, leave any partial files in place (don't roll back unilaterally) and surface what was generated so far. Re-running the bootstrap should detect partial state (e.g., spec exists but no scaffold) and offer to resume from the appropriate phase rather than restart from scratch.

If a phase fails partway and you're unsure of the recovery path, surface the partial state and the original calibration. The user can either: (a) finish the phase manually with your help, (b) re-tier downward to a simpler shape and continue, (c) start a fresh session with the partial state intact.

If you're in bootstrap mode and the user wants to do something other than bootstrap — e.g., they want to read the playbook, ask questions about the framework, or just chat — engage normally. Don't force the bootstrap workflow if it's not what they want.

Lost user, skip-phases, skip-tier: accommodate per `sbak/bootstrap/PHASES.md` §If something goes wrong (verify skipped deliverables are in hand; log the override).
