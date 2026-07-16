# Build Prompts

This directory holds **per-milestone phase docs** for Claude Code sessions. Each phase doc is **self-contained**: its per-stage CLI prompts (X.5 sections) can be pasted as the opening message of a fresh, cleared Claude Code session and Claude will know exactly what to read, what to deliver, what tests to run, and what NOT to do.

**Roles (Standard+):** the phase docs here are authored by the **orchestrator** role (`ORCHESTRATOR.md`); the X.5 stage prompts inside them are pasted into **build** sessions. A build session follows `CLAUDE.md` + its stage prompt and never reads `ORCHESTRATOR.md`. At Lite tier the two roles are one session.

## How this works

The project uses a **two-layer prompt structure** described in `sbak/persistence-architecture.md`:

| Layer | File | When loaded | Content |
|---|---|---|---|
| **Layer 2: Constants** | `CLAUDE.md` (repo root) | Auto-loaded by Claude Code in every session | Protocol — TDD discipline, quality gates, PR workflow, anti-patterns, hard rules. The "how Claude works in this project" doc. |
| **Layer 3: Per-milestone document** | `docs/build-prompts/M[NN]-*.md` | Read by user end-to-end; per-stage CLI prompts pasted as fresh-session opening messages | The milestone specification + per-stage prompts — header (background, design decisions), stages A–E each with X.1 Problem / X.2 Files / X.3 Detailed Changes / X.4 Tests / X.5 CLI Prompt / X.6 Commit Message, summary table, verification checklist. |

The per-milestone phase doc always references `CLAUDE.md` as the protocol; it doesn't repeat the protocol verbatim. This keeps the prompts tight and the protocol DRY.

## Files

| File | Status | Purpose |
|---|---|---|
| `README.md` (this file) | Stable | Index + how-to-use |
| `M[NN]-*.md` | Authored per milestone | Per-milestone phase doc; uses `prompts/PHASE-DOC-TEMPLATE.md` as shape |

Templates and framework references live elsewhere:
- `prompts/PHASE-DOC-TEMPLATE.md` — per-milestone shape; includes the **scope-split rule** for milestones >250 prompt-lines or >12h work
- `sbak/BUILD-PLAYBOOK.md` (repo root) — methodology
- `sbak/STAGE-PROMPT-PROTOCOL.md` (repo root) — XML schema for X.5 stage prompts
- `sbak/PROCESS-VALIDATION.md` (repo root) — framework for evaluating whether the prompt-driven pattern works
- `sbak/persistence-architecture.md` (repo root) — layer model: how memory/instructions persist across sessions
- `retrospectives/` — per-stage retrospectives Claude fills in during/after every milestone; see `retrospectives/README.md`
- `docs/gap-analysis.md` — **live, append-only** cumulative product↔spec audit. Every parent milestone appends one entry in its Phase Closeout (final stage) per `CLAUDE.md` §20. **Prior entries are immutable** — CI enforces.

## How to use a milestone document

1. **First**, read the entire `M[NN]-<title>.md` document end-to-end — it's your spec, design rationale, and stage roadmap in one file.
2. **For each stage**, open a **fresh** Claude Code session (cleared context — don't continue from prior session work).
3. Copy the **stage's CLI Prompt** (section X.5 of the milestone document, where X is `A`/`B`/...) into the fresh session as the opening message. The stage prompt instructs Claude to read `CLAUDE.md` (auto-loaded), the stage's X.1–X.4 sections, and any other files the prompt names.
4. Add any session-specific overrides at the top: branch name (default `claude/m[nn]-<title>`), time-box if applicable. Keep it minimal — the prompt is intentionally complete.
5. Claude does TDD work for the stage, runs gates, fills in the per-stage retrospective, drafts the stage commit message, surfaces it all (including cross-machine state — `git log --oneline main..HEAD` + retro file listing). **Claude does not commit.** You review, approve, and Claude then commits the stage on the parent-milestone branch (does NOT push between stages).
6. **After the final WORK stage**, Claude creates the parent-milestone summary (`retrospectives/M[NN]-summary.md`).
7. **Phase Closeout (final stage)** runs the gap analysis pass per `CLAUDE.md` §20: append a new entry to `docs/gap-analysis.md` (append-only — prior entries immutable). This commit is the final commit on the parent-milestone branch and gates the PR push.
8. On approval of the Phase Closeout commit, Claude pushes the branch and (if explicitly requested) drafts the M[NN] PR description.
9. After the milestone PR merges, the next milestone starts fresh with its own document and stage prompts.

## Authoring new milestone phase docs

Use `prompts/PHASE-DOC-TEMPLATE.md`. Sections are not optional — even when "None applies" or "N/A", state that explicitly. The template is annotated to explain why each section exists and what makes a good vs a poor entry.

When a milestone phase doc is authored:
1. Mark its row in `docs/scope.md` as "Authored"
2. Reference it from any milestone-tracking docs you keep
3. Commit per `CLAUDE.md` §8 PR workflow

### Phase-doc-edit pre-flight (cross-machine state check)

**Mandatory before any edit to `M[NN]-*.md` larger than ~50 lines or affecting any X.5 stage prompt** — see `CLAUDE.md` §8.

Origin is a partial view of project state when stages are committed locally but not pushed (per `CLAUDE.md` §8 "DO NOT push between stages"). An orchestration session that reads only `origin/main` may infer "stage X unexecuted" when in fact the build machine has the work locally. This is a banned failure mode that has caused real reverts.

Before authoring or revising substantial phase doc content, the orchestration session MUST request cross-machine state. The user pastes output of `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md` from the build machine. Retrospective-file presence is the source of truth for "stage X executed," not git visibility on `origin`.

## Versioning

Milestone phase docs are versioned implicitly via git history. If a milestone is re-scoped after work begins (rare; should require an ADR per `CLAUDE.md` §11), update the phase doc and note the change in `CHANGELOG.md`.

The two-layer separation means common protocol changes go to `CLAUDE.md` and don't require updating every milestone phase doc. That's the point.

## Why two layers (and not just one giant file)

- **DRY.** Protocol changes happen in one place.
- **Tight prompts.** A milestone prompt is ~200–400 lines instead of 800+. Easier to fit in context, easier to read, easier to revise.
- **Drop-in droppability.** A fresh session reads `CLAUDE.md` automatically; pasting the milestone prompt completes the orientation.
- **Survives clearing.** Each milestone prompt is self-contained relative to the protocol. No conversational state required.

## Why this isn't just `CLAUDE.md`

`CLAUDE.md` is for things that are constant across all work in the repo. The per-milestone phase docs are for things that change per milestone — what to build, what to read, which tests apply, milestone-specific traps. Mixing them would either bloat `CLAUDE.md` with milestone detail or scatter protocol across milestone files. Two layers is the cleanest factoring.
