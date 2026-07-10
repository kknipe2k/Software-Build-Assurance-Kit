# Copilot instructions — {{PROJECT_NAME}}

> **Auto-loaded by GitHub Copilot in VS Code** with a Claude model selected. Ensures a Copilot session opening on this project has the load-bearing rules and the orientation pointers in context.
>
> **If you're using Claude Code, ignore this file** — Claude Code auto-loads `CLAUDE.md` and the `.claude/` SessionStart hook handles mode-aware orientation. This shim is for Copilot users only.

## Hard rule — do not violate

**Do not commit any code, run `git commit`, or push without explicit human approval.** When work is done, surface the diff and wait. This is the framework's single most important rule (G1) and it holds in every tier, every mode, every host.

## Your first action

Read these files in order before doing anything else:

1. `CLAUDE.md` — the project's standing execution rules
2. `project-config.md` — the active tier, expertise, and toggle values
3. The active milestone's Phase doc in `docs/build-prompts/` (if one is in progress)
4. The orientation files for your role — see "Mode-aware reading" below

Then echo this exact line so the user can verify you loaded orientation:

> `[orientation loaded: mode=<work|verifier|orchestrator>, model=<your model>, N files]`

Include the model you are running on (e.g. `model=claude-opus-4-8`). This matters in Copilot — see "Model-class transparency" below.

If the user hasn't specified which role this session is for, **ask before proceeding**. The default is `work` (a build / stage session).

**Refusal protocol — orientation is load-bearing.** This stamp is the Copilot stand-in for Claude Code's SessionStart hook (which does not run here). If you could not read the orientation files for any reason — missing list, file errors, you skipped them — **do not proceed with the stage.** Say so plainly: *"Orientation did not load (reason); I can't run this stage reliably until it does."* Running a stage blind is worse than stopping.

## Invoking a stage (Copilot has no slash commands)

Claude Code can use `.claude/commands/`; Copilot can't. The convention here: the user types **`Stage M01 A`** (milestone, then stage letter). When you see that, treat it as: open `docs/build-prompts/M01-*.md`, find the §A.5 stage prompt (the fenced `xml` block for that stage), and execute it exactly as if it were pasted — after completing your first-action orientation for the matching mode. `Verify M01` → the Stage V (verifier) prompt; `Closeout M01` → the closeout prompt.

## Mode-aware reading — honor-system in Copilot

The framework distinguishes session types. In Claude Code the SessionStart hook in `.claude/` selects the right read-first list automatically based on `.claude/role`. **In Copilot the hook does not run** — it is your responsibility to read the right files for the role:

- **Work / build session** (executing a stage from a §X.5 prompt) — read every entry in `.claude/read-first-list.txt`. Mode: `work`.
- **Verifier session** (Stage V — Standard+ only) — read every entry in `.claude/read-first-list-verifier.txt`. **Critical:** do NOT read prior retrospectives (`retrospectives/M[NN].*-retrospective.md`) — that is the fresh-context bias guard. Reading them defeats the Verifier's job.
- **Orchestrator session** (Standard+ only — authoring Phase docs / ADRs, routing Verifier findings, running PRs) — read every entry in `.claude/read-first-list-orchestrator.txt`, including `ORCHESTRATOR.md`. Build / verifier / closeout sessions must NOT read `ORCHESTRATOR.md`.

At Lite tier the roles collapse into one session and only `work` mode applies.

## Orchestrator is stateless in Copilot

In Claude Code the orchestrator is a long-lived `claude --resume` session that holds the why-of-decisions across stages. **Copilot Chat does not persist reliably**, so here the orchestrator is **spawn-from-artifacts**: every orchestrator consultation is a fresh chat that reconstructs context by reading the artifacts (`gap-analysis.md`, prior retros, the current Phase doc, relevant ADRs, `docs/consultations.md`) — then answers, then logs the decision back to `docs/consultations.md`. The artifacts are the memory; the chat is disposable. This costs a reload per consultation, which is the structural price of running the orchestrator in Copilot. Build and verifier sessions are fresh-per-stage in every host, so they're unaffected.

## Model-class transparency (honor-system)

Copilot tiers ration Opus credits. When they run out, Copilot may silently fall back to Haiku mid-project — and a stage that needs heavy reasoning (spec authoring, `design.md` authoring, Phase-doc authoring, any verifier pass, closeout summarization) is materially degraded on Haiku without anything surfacing the swap. The framework does not promise Opus-equivalent output on Haiku; it asks you to make the condition visible:

**1. Always report your model in the orientation stamp** — `[orientation loaded: mode=<X>, model=<your model>, N files]`. State the actual model (e.g. `model=claude-opus-4-8`, `model=claude-haiku-4-5`). If you cannot determine it, say `model=unknown` and treat the session as potentially-degraded.

**2. Before any heavy-reasoning stage, self-check the model.** These stages produce materially worse output on Haiku and must surface a warning *before* starting if you are on Haiku (or `unknown`):

| Heavy-reasoning stage (warn on Haiku) | Light stage (no warning) |
|---|---|
| Spec authoring (Phase 1) | Bootstrap scaffold writes |
| `design.md` authoring (Phase 1.6) | Build stage execution (more mechanical) |
| Phase-doc authoring (Phase 4) | — though red-stop test design still benefits from a stronger model |
| Any Verifier pass (V) | Ad-hoc lookups |
| Closeout summarization (Stage E) | — |

**3. The warning (don't refuse — make the cost visible):**

> ⚠️ This is a **{{stage}}** stage and I'm running on **Haiku**, not Opus. {{Spec / Phase-doc authoring / Verifier passes}} are materially degraded on Haiku — shallower analysis, more missed cases. Options: **defer** until Opus credits replenish, or **accept** lower quality and we re-run this stage later. Which?

The user decides. If they accept, proceed and note it. If a stronger model is available via the model picker, suggest switching.

**4. Log the model condition to `docs/consultations.md`** whenever it affected a decision (deferred a stage, accepted degraded output) — so a later session knows why an artifact may be weaker.

The framework does **not** promise Opus-equivalent output on Haiku. It promises the condition is *visible* so you can choose. Author the heavy artifacts (spec, design.md, Phase docs) early in a credit cycle; run builds and routine checks later when Haiku is acceptable.

## See also

- `QUICKSTART-COPILOT.md` (at the repo root, if present) — Copilot-specific operational notes
- `BUILD-PLAYBOOK.md` §2.2 — the four-role model (Human / Orchestrator / Build / CI)
- `ORCHESTRATOR.md` (Standard+) — orchestration operating manual; for orchestrator sessions only. §1 includes Copilot in the topology table.
