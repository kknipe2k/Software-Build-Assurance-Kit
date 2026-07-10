# QUICKSTART

> **On GitHub Copilot in VS Code instead of Claude Code?** Read [`QUICKSTART-COPILOT.md`](QUICKSTART-COPILOT.md). This page covers the Claude Code path (the framework's primary target).
>
> You have never seen this framework before. This page is the shortest path from "I have the repo" to "the build loop is running." Task-focused, no methodology. For the *why*, read `README.md` or open `HOW-IT-WORKS.html`. For the *how the agent works*, the framework files are listed at the bottom.

---

## 0. Prerequisites

You need three things installed before anything below works:

| Tool | Why | Check it's there |
|---|---|---|
| **Git** | To clone the kit and because the framework commits per stage | `git --version` |
| **Node.js 18+** | Claude Code requires it; the SessionStart hook and the validator are Node scripts | `node --version` |
| **Claude Code** | This framework drives Claude Code. It is the CLI tool `claude` — *not* the claude.ai chat website. | `claude --version` |

If `claude` is missing, install Claude Code per the official instructions (typically `npm install -g @anthropic-ai/claude-code`, but follow the current official docs as the authoritative source). The web app at claude.ai/code also works — same framework behavior, just sandboxed.

---

## 1. Get the kit

`git clone` creates the target directory. Don't pre-create it. From the parent dir where the project should live:

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-todo
cd my-todo
```

The cloned directory becomes your project root.

> **Heads-up on the git remote:** because you cloned from the kit, `origin` still points at the kit's repo. Don't `git push` yet — it would target the kit, not your project. The bootstrap resets this at handoff (Phase 5) and asks where your project should live (local-only / your own GitHub repo / create a new one). If you want to set it yourself first: `git remote remove origin`.

**You already created the dir and `cd`'d into it?** Clone into the current dir (it must be empty, including dotfiles):

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git .
```

**You already have files in the dir you want to use?**

1. Clone the kit somewhere else:

   ```
   git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git /tmp/kit
   ```

2. Rename your existing `README.md` so it isn't overwritten:

   ```
   cd /path/to/your-dir
   mv README.md README-PROJECT.md
   ```

3. Copy the kit's contents — including dotfiles — into your dir:

   ```
   cp -R /tmp/kit/. /path/to/your-dir/         # macOS / Linux
   xcopy /tmp\kit your-dir /e /h /y            # Windows cmd
   ```

4. Delete the temp clone:

   ```
   rm -rf /tmp/kit
   ```

5. Open Claude. After the calibration interview, tell it about your existing files:

   *"I have a spec at `spec/my-project-spec.md` — use it instead of authoring one."*

   *"I have existing code in `src/` — M01 starts from this code, not empty."*

---

## 2. First run

```
cd my-project
claude
```

The kit's `CLAUDE.md` auto-loads. Claude's **first response** is the calibration interview — five side-by-side option tables (project size / experience / approval cadence / deliverable type / verification & CI cost). If you do not see a calibration interview as the first response, jump to Troubleshooting.

---

## 3. Answer the 5 questions

| Question | You're choosing | Safe default if unsure |
|---|---|---|
| Project size / complexity | Lite / Standard / Full (how much process) | **Standard** |
| Your experience with the stack | New / Familiar / Experienced (how much it explains) | **Familiar** |
| Approval cadence | Minimum / Standard / Maximum (how often it stops for you) | **Standard** |
| Deliverable type | CLI / Web-UI / Library / Service / Other (which gates apply) | usually inferred from your description |
| Verification & CI cost | Local-first / Cloud / Local-only (where tests run, what CI costs) | usually inferred from repo visibility |

You can answer directly ("Standard, Familiar, Standard, web"), describe your project and let Claude propose a calibration (it'll usually infer the deliverable type from the description), or say "pick something reasonable" and accept the safe-middle default. You can change any of these later — see `FRAMEWORK-CONFIG.md` §7.

The deliverable type is the branch point that decides *which* gates apply: web/UI triggers a design brief (`docs/design.md`) authored before any UI code plus browser-load + design-conformance verification passes; library adds an API-surface contract; service adds endpoint contracts; CLI adds command-surface checks. It changes *what* the framework verifies, not how much ceremony.

---

## 4. Describe what you want to build

A paragraph is enough. Claude runs bootstrap: discovery questions (depth depends on tier) → a spec → **(web/UI only) a design discovery interview + `docs/design.md` brief** → a milestone plan → scaffold files (~36 for Lite, ~68 for Standard, ~69 for Full — reference-calibration counts; see the counting note in `templates/CALIBRATION-INTERVIEW.md`). It surfaces each phase for your approval per the `pre_write_surface` toggle (default at Standard: surface spec + milestone plan pre-write; write scaffold + Phase docs directly with post-write review). Before any disk write, it states the blast radius — "I'll create ~N files across `.claude/`, `docs/`, `.github/`, …" — so you consent to the footprint up front.

At the end of bootstrap, the kit's `CLAUDE.md` is **replaced** by your project's own `CLAUDE.md`. The `origin` remote is reset (it pointed at the kit; you choose local-only / your repo / `gh repo create`). Bootstrap is done. The build loop begins.

---

## 5. Run the build loop

This is the operational part the visual overview doesn't spell out.

Each stage runs as its own agent: a fresh session in an enforced role.

**Each stage is a fresh Claude session.** Context is cleared between stages on purpose. The SessionStart hook re-loads orientation automatically every time.

For **Lite tier**: just open a fresh session and say *"let's start M01."* Work from the markdown task list in `docs/build-prompts/M01-*.md`.

For **Standard / Full tier** — the **three-gate per-stage loop** (when `red_review: on`, the Standard+ default):

1. Open a fresh Claude session in the project (`claude`, or `/clear` in an existing one — both work; `STAGE-LOOP.md` is the home doctrine for the difference).
2. **Verify the hook fired:** Claude's first response should include a line like `[read-first stamp] mode=work, loaded N files, M bytes`. If it doesn't, jump to Troubleshooting — orientation didn't load and the stage is unreliable.
3. **Run the stage.** Easiest: type `/stage M01 A` — the slash command (installed at Standard+) reads the Phase doc, extracts the matching `### A.5 CLI Prompt` block, and runs it. No copy-paste. (`/verify M01`, `/refactor M01`, and `/closeout M01` work the same way.) *Or* paste by hand: open `docs/build-prompts/M01-<title>.md`, find `### A.5 CLI Prompt`, copy the fenced ` ```xml ` block, paste it in.
4. **Gate 1 — plan approval.** Claude states its deliverable + test plan and waits. Confirm or correct.
5. **Gate 2 — red-stop.** Claude writes the failing tests, confirms they fail for the right reason, then **stops and surfaces the test files for your review** before implementing to green. Approve the test design (or send it back). This catches shallow/wrong-contract tests at the cheapest moment — especially valuable on weaker models. Skip this gate per project by setting `red_review: off`.
6. **Gate 3 — stage-end.** Claude implements to green, runs gates, fills a retrospective (incl. a required **user friction stamp** you fill: `verdict: pass|fail` + an optional sentence — the independent check on the agent's self-grade; default is pass, and an explicit fail forces the Friction-heavy outcome), and surfaces: diff + gate results + retro + draft commit. It says *"I will not commit until you approve."* The retro's user-stamp slot is enforced by a pre-commit validator — an empty stamp fails the commit.
7. Review. Approve → it commits. Do **not** expect it to commit before you approve — gate G1, the framework's single most important rule. If it ever commits without approval, that's a bug; surface it.
8. Open a fresh session for the next stage. Repeat through stages, then the **Verifier** (`/verify M01` in a verifier session — set `node scripts/set-mode.cjs verifier` first; the UserPromptSubmit hook blocks mode mismatches), the **Refactor** check when triggered (`/refactor M01` in a refactor session — `node scripts/set-mode.cjs refactor`), then **Closeout** (`/closeout M01` — surfaces the explicit *continue / ship v1 here / pause to re-tier* choice), then the milestone PR.

### Two roles — orchestrator + build (Standard &amp; Full)

At Standard and Full tier the agent runs as **two distinct session types**, never sharing a session:

- **Orchestrator** — authors Phase docs / ADRs, adjudicates the build's surfaces, routes Verifier findings, runs PR/merge. Governed by `ORCHESTRATOR.md`.
- **Build** — executes one stage from a pasted §X.5 prompt. Governed by `CLAUDE.md` + the stage prompt; never reads `ORCHESTRATOR.md`.

**You are the conduit** — you carry the build's surfaces to the orchestrator and the orchestrator's prompts to the build. Only one role acts at a time.

How to host the two roles (`ORCHESTRATOR.md` §1 has the full table):

- **Recommended — two CLIs + git worktrees, one machine.** From the repo root: `git worktree add ../build-wt <milestone-branch>`. Run the **build** with `claude` inside `../build-wt`; run the **orchestrator** with `claude` in the main checkout. Shared `.git`, isolated working trees, no cross-machine drift.
- **Web orchestrator + local CLI build** — valid only if the build genuinely runs on a separate machine; then the cross-machine pre-flight in `ORCHESTRATOR.md §3` is mandatory.
- **Two CLIs, same directory** — simplest; fine because you serialize the two roles.

Set the session's role before opening it: `node scripts/set-mode.cjs orchestrator` for an orchestration session, `node scripts/set-mode.cjs work` (or delete the file) for a build session. The SessionStart hook loads the matching read-first list; the agent echoes `[read-first stamp] mode=<mode>` so you can confirm. A second hook (UserPromptSubmit) blocks a pasted stage prompt whose mode disagrees with `.claude/role` — so if you forget to switch modes, you get a clear error instead of a verifier reading retros it shouldn't.

**Run the orchestrator as terminal-launched `claude` or on claude.ai/code — not a chat panel.** The orchestrator is a *long-lived* session: it holds the why-of-decisions across many stages. `claude --resume` gives it durable continuity across days; a chat panel doesn't persist reliably across restarts. **Build and verifier sessions are the opposite — always fresh per stage** (close and re-run `claude`, don't reuse). The fresh-context bias guard only holds if each build/verifier session actually starts clean.

At **Lite tier** the two roles collapse into one session — there is no separate orchestrator and `ORCHESTRATOR.md` is not generated.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No calibration interview on first run | `CLAUDE.md` didn't auto-load | Confirm you ran `claude` from the project root (where `CLAUDE.md` is). Confirm Claude Code reads `CLAUDE.md` (it does by default). |
| No `[read-first stamp]` line in a session | SessionStart hook didn't fire | Run `/hooks` in Claude Code — the SessionStart entry should be listed. If not, validate `.claude/settings.json` is valid JSON. Confirm `node` is on PATH (`node --version`). See `templates/dot-claude/README.md` (installs as `.claude/README.md`). |
| `git clone` says destination not empty | Target dir exists with files | See §1, "directory already exists" path. |
| Agent committed without asking | G1 violation — should never happen | Surface it immediately. Check `git log`. The framework's most important guarantee failed; investigate before continuing. |
| Bootstrap stopped partway | Aborted or errored mid-phase | Re-run `claude`. The bootstrap detects partial state (spec exists but no scaffold, etc.) and offers to resume from the right phase rather than restart. |
| CI failing on `validate-stage-prompts` | A Phase doc's XML drifted from the schema | Run `node validators/validate-stage-prompts.cjs --all` locally for line-pointed errors. See `validators/README.md`. |
| `node: command not found` (Windows) | Node not on PATH | Install Node.js, reopen the terminal, `node --version`. Claude Code needs it anyway. |

---

## 7. Where everything is — the file map

Read these when you need them. You do **not** need to read them all up front; the SessionStart hook loads the right subset per session.

### Start here

| File | Read it for |
|---|---|
| `QUICKSTART.md` (this file) | The shortest path to a running build loop |
| `WALKTHROUGH.md` | A complete Standard-tier build narrated end to end — see the framework actually run. Artifacts the run produced are at `examples/task-cli-standard/artifacts/`. Intro / how-to-read at `EXAMPLE.md`. |
| `HOW-IT-WORKS.html` | Visual overview — open in a browser; good for explaining to others |
| `README.md` | Full prose overview: what it is, tiers, what's in the box, when to use which tier |

### The methodology (framework-level references — immutable except via ADR)

| File | Read it for |
|---|---|
| `BUILD-PLAYBOOK.md` | The methodology. Part 0 = tier model. §3 = the per-stage loop. §3.4 = the Verifier. §4 = discipline, gates, retrospectives. |
| `FRAMEWORK-CONFIG.md` | The dial: 3 tiers, expertise dimension, every toggle, the re-tier protocol, per-tier overhead estimates |
| `persistence-architecture.md` | The 5-layer memory model — where each artifact lives, who reads/writes when, the mutability matrix |
| `STAGE-PROMPT-PROTOCOL.md` | The XML schema for the stage prompts you paste each stage (5 schemas: work / verifier / refactor / closeout / audit-pass) |
| `PROCESS-VALIDATION.md` | The scoring framework — three axes, hard + soft gates (G1–G16), outcome matrix, tier-conditional retrospective shape |

### The entry point + the calibration

| File | Read it for |
|---|---|
| `CLAUDE.md` | The bootstrap orchestration. Auto-loaded on first session; replaced by your project's own at end of bootstrap. You normally don't edit this. |
| `templates/CALIBRATION-INTERVIEW.md` | The exact text of the 5-question interview (tier / expertise / cadence / deliverable_type / verification) + smell-flagging + toggle mapping |
| `templates/PROJECT-CLAUDE.md` | What `CLAUDE.md` becomes after bootstrap — your project's standing execution rules (read by both session types) |
| `templates/ORCHESTRATOR.md` | The orchestration operating manual — installed as `ORCHESTRATOR.md` at Standard+. Decision index for authoring / adjudication / routing + topology table + consultation protocol + pushback authority. Build sessions ignore it. |
| `templates/SPEC-TYPE-SECTIONS.md` | Per-deliverable-type contract section appended to the spec (cli command surface / library API surface / service endpoint contracts / web design.md pointer + visual acceptance) |
| `templates/DESIGN-DISCOVERY-INTERVIEW.md` | Used only when `deliverable_type: web` — the Phase 1.5 interview script (Path A imports from Claude Design; B1 from-scratch; B2 from community template) |
| `templates/design.md` | The 9-section `docs/design.md` brief (visual theme / color tokens / typography / components / layout / depth / do's-don'ts / responsive / agent prompt guide) — generated for web/UI projects, read before any UI code |

### Enforcement

| File | Read it for |
|---|---|
| `validators/validate-stage-prompts.cjs` | XML schema validator for Phase docs. Runs at pre-commit + CI. Warns when a Phase doc exceeds 600 lines. |
| `validators/validate-retrospective.cjs` | User friction-stamp gate (Standard+). Pre-commit fails on an empty/placeholder stamp in a staged retrospective (`verdict: pass\|fail`); an explicit fail is accepted with an advisory NOTE that the outcome is forced to Friction-heavy. |
| `validators/README.md` | Validator usage + combined pre-commit recipe |
| `scripts/verify-local.cjs` | The kit's one local verification entrypoint (pre-push + CI). A full run takes roughly 2–4 minutes — measured ~125 seconds on the reference machine (approximate, higher under load) — and prints per-phase elapsed seconds — size any wrapping tool's command budget *above* that (the measured ~125 s run already overruns a 120 s timeout, whose SIGTERM kills it mid-run; fixture work is sandbox-confined, so re-run the push). |
| `scripts/lib/sandbox.cjs` | The fixture-confinement primitive: sandbox roots, fail-closed path guard, pinned fixture git env — why an interrupted or worktree-orchestrated suite run cannot mutate the repo it lives in. |
| `scripts/build-receipts.cjs` | Build receipts: normal sessions leave local event ledgers under `.claude/receipts/`; `render` turns them + committed history into a deterministic JSON/HTML/MD report under `reports/` — gitignored as a default, not a wall (negate the entry to track a report deliberately); `--check` is the release preflight. |
| `templates/dot-github/workflows/validate-stage-prompts.yml` | CI workflow installed into the project |
| `templates/dot-claude/hooks/session-start-read-first.cjs` | The SessionStart hook — auto-loads the mode-aware read-first list + emits the `[read-first stamp]` |
| `templates/dot-claude/hooks/user-prompt-submit-mode-check.cjs` | The 3-brain enforcement hook — blocks a stage prompt pasted into a session whose `.claude/role` doesn't match the prompt's declared mode |
| `templates/dot-claude/commands/{stage,verify,refactor,closeout}.md` | Slash commands (`/stage M01 A`, `/verify M01`, `/refactor M01`, `/closeout M01`) that read the Phase doc and run the matching block — courier relief, no XML paste |
| `templates/dot-claude/README.md` | Hook installation + troubleshooting (installs as `.claude/README.md`) |

### Roadmap (proposals — mostly shipped; one still unbuilt)

Most `proposals/` designs have shipped by dogfooding the kit on itself (retained for their design rationale). Only `runtime_creation` is still unbuilt.

| File | What it is |
|---|---|
| `proposals/STAGE-R-REFACTOR.md` | Refactor health-check stage. **Implemented.** |
| `proposals/OPERATING-MODES.md` | The `operating_mode` dial + `bug_fix` / `research_publish` / `audit` modes. **Fully implemented — all four operating modes live.** |
| `proposals/OFF-TRACK-CHECK.md` | Priority-drift guard (ranked `docs/backlog.md` + `/on-track` + G8). **Implemented.** |
| `proposals/APP-MAP.md` | Living drive/test map (`docs/app-map.md`), test-id-bound. **Implemented.** |
| `proposals/RUNTIME-CREATION-MODE.md` | Planned `runtime_creation` mode for building agent runtimes (agents / skills / tools / MCPs / hooks / evals / HITL gates) — sibling to the operating modes above; **still deferred** (the one genuinely unbuilt proposal). |

---

## 8. The one rule that never changes

In every tier, every mode, every session: **the agent does not commit without your explicit approval.** If that ever breaks, stop and investigate — it is the guarantee the entire framework rests on.
