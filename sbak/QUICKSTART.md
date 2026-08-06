# QUICKSTART

>**This page covers the Claude Code path (the framework's primary target).**
>
>**Using GitHub Copilot in VS Code instead of Claude Code?** Read [`QUICKSTART-COPILOT.md`](QUICKSTART-COPILOT.md) instead.
>
> If you have never seen this framework before, this page is the shortest path from "I have the repo" to "the build loop is running." Task-focused, no methodology. For the *why*, read `README.md` or open `HOW-IT-WORKS.html`. For the *how the agent works*, the framework files are listed at the bottom.

## Just get going

In a hurry? One decision, one command, then the kit drives **(you need Git, Node 22+, and Claude Code - §0)**:

1. **New project** - unzip the release ZIP into a fresh directory (§1's **New repo** sequence). **Existing repo** - unzip into the repo and adopt (§1's "Existing repo" line).
2. Run `claude` in your project with the kit. **The CLI waits for you to speak first** - your opening message can simply be what you want (*"fix a bug in this app"*, *"add CSV export to my app"*, *"build me a game"*) or just `go`. The kit takes it from there: it echoes your directory (confirm it), then asks what kind of work this is; everything else arrives one question at a time, at the moment the run needs it.

**Nothing leaves your machine until you explicitly say "push" or "open the PR"** - those are single, separate approvals near the end of a run (no pushes between stages; `git commit`/`git push` sit at "ask" on every permission-fence level). Until then, everything is local.

**Don't study the docs - ask.** The session you just opened has full visibility of the kit's docs and your repo (once your project is running, that session is the orchestrator): any *"what now / how do I / where is"* question gets answered in-session, with the right doc quoted when it matters.

**Repo already running the kit? Just coming back from a fully closed session?** Skip the interview entirely: `node scripts/set-mode.cjs orchestrator`, then `claude`, and tell the orchestrator what you want: *"Author the next milestone - \<your feature\>."* That one paste is the steady state of the whole framework.

The sections below unpack the same path in full - prerequisites, the clone gotchas, the interview, the loop.

---

## 0. Prerequisites

You need three things installed before anything below works:

| Tool | Why | Check it's there |
|---|---|---|
| **Git** | To clone the kit and because the framework commits per stage | `git --version` |
| **Node.js 22+** | Claude Code requires it; the SessionStart hook and the validator are Node scripts. The floor is 22 rather than 18 because the test command this kit prescribes is a path-scoped glob (`node --test "tests/**/*.test.cjs"`), and glob positionals require Node 21 or newer - 22 is the lowest maintained line that runs it. CI pins 24 (Active LTS). | `node --version` |
| **Claude Code** | This framework drives Claude Code. It is the CLI tool `claude` - *not* the claude.ai chat website. | `claude --version` |

If `claude` is missing, install Claude Code per the official instructions (typically `npm install -g @anthropic-ai/claude-code`, but follow the current official docs as the authoritative source). The web app at claude.ai/code can host the orchestrator session (see the "Two roles" section); build and verifier sessions run the fully enforced path in the terminal-launched CLI.

---

## 1. Get the kit

The kit comes two ways. **Most users: download the release ZIP** - the signed, checksummed, attested artifact. `git clone` stays available as the **alternate** path (below).

### Download the release ZIP - recommended

Each release ships one asset named `sbak-<version>-starter.zip` plus its `.sha256`. Get the current one - `sbak-v1.0.4-starter.zip` - from the [releases page](https://github.com/kknipe2k/Software-Build-Assurance-Kit/releases), and **verify before you unpack**:

- **Checksum, macOS / Linux:** `sha256sum -c sbak-v1.0.4-starter.zip.sha256` (or compare `sha256sum sbak-v1.0.4-starter.zip` against the published value).
- **Checksum, Windows (cmd or PowerShell):** `certutil -hashfile sbak-v1.0.4-starter.zip SHA256`, then compare the printed hash against the published value.
- **Build attestation (stronger, optional):** `gh attestation verify sbak-v1.0.4-starter.zip -R kknipe2k/Software-Build-Assurance-Kit` - confirms the ZIP was built by this repo's release workflow (SLSA build provenance).

**What the unzip lands:** exactly one root file - `CLAUDE.md` - plus one kit directory, `sbak/` (everything else lives inside it). The only possible collision with an existing repo is `CLAUDE.md` itself, adjudicated at bootstrap.

**Copy is not install.** Unzip alone lands no `.claude/`, so the session would run unhooked. The `adopt` step installs and verifies the live hook layer.

**New repo** - the full sequence. Run it from the folder the ZIP downloaded to (usually `Downloads`), and replace `<projects-path>` with wherever you keep code - the point is that the project gets a real home, not `Downloads`. The project name (`my-project`) is yours to change too.

macOS / Linux:

```
unzip sbak-v1.0.4-starter.zip -d <projects-path>/my-project
cd <projects-path>/my-project
git init
node sbak/templates/scripts/kit-update.cjs --adopt
claude
```

Windows (cmd or PowerShell):

```
mkdir <projects-path>\my-project
tar -xf sbak-v1.0.4-starter.zip -C <projects-path>\my-project
cd <projects-path>\my-project
git init
node sbak\templates\scripts\kit-update.cjs --adopt
claude
```

(Already unpacked into `Downloads` before reading this? The project folder is self-contained - move the whole folder to its real home and carry on; nothing inside it breaks.)

**Existing repo:** unzip into the repo, run the same adopt command, then start `claude`.

**Order matters:** `git init` must come before `adopt`. Skip it and adopt exits 1, prints `ADOPTION INCOMPLETE`, names the control (`MISSING: Git hook activation (core.hooksPath)`), and prints the fix (`repair: git init`). Run the printed repair, then re-run adopt.

**The adopt step verifies itself, and its exit code is the contract:**

- **Exit 0 means adoption COMPLETE** - every required enforcement layer is active (Git hooks armed via `core.hooksPath`, no destination refused, no incomplete settings merge) - and it prints exactly that.
- **Exit 1 means `ADOPTION INCOMPLETE`** - the missing control is named on a `MISSING:` line, with a `repair:` command that runs as printed.
- **Exit 2 is a usage or fail-closed refusal.**
- An incomplete install cannot silently look complete: run the printed repair, then re-run `--adopt` - re-running is always safe; a clean re-run changes nothing.

**First-session heads-up:** the kit's permission `allow` entries are inert until you accept the workspace trust dialog - an opening "Ignoring permissions.allow entries" line in the claude CLI is the host talking, not the kit (`ask` prompts and the `deny` floor still work pre-trust).

### Clone the repo - the alternate path

`git clone` creates the target directory. Don't pre-create it. From the parent dir where the project should live:

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-project
cd my-project
node sbak/templates/scripts/kit-update.cjs --adopt
claude
```

The cloned directory becomes your project root. The adopt step is not optional on the clone path either: `core.hooksPath` is local Git configuration and does not travel with a clone, so a fresh clone's git hooks stay unarmed until adopt arms and verifies them (the same exit-code contract as the ZIP path).

> **Windows line endings (pre-existing clones only).** A fresh clone is healed by the kit's shipped `.gitattributes` - nothing to do. A clone taken before that file shipped can hold CRLF working copies that fail the kit's byte-exact checks. Easiest fix: take a fresh clone. To repair in place instead - **destructive precondition: a clean tree only (`git status` shows no changes); any uncommitted work is lost** - run `git reset --hard HEAD && git add --renormalize .`. Never run a bare `git add --renormalize .` on a dirty tree.

> **Heads-up on the git remote:**
>- Because you cloned from the kit, `origin` still points at the kit's repo. Don't `git push` yet - it would target the kit, not your project. The bootstrap resets this at handoff (Phase 5) and asks where your project should live (local-only / your own GitHub repo / create a new one). If you want to set it yourself first: `git remote remove origin`.
>- If your repo has same-named root files as the kit, rename or move them before copying the clone in.

---

## 2. First run

```
cd my-project
claude
```

**The kit's `CLAUDE.md` auto-loads, but the CLI waits for you to speak first.** Type anything - `go` works, or state what you want.

What you should see next:

1. **First response:** Claude echoes the read-first stamp and your working directory with a one-line scope statement. Confirm it is the right folder.
2. **Second response:** the calibration interview - 3 asks (operating mode, assurance tier, risk triggers), then a confirmation turn that derives and explains everything else.

If you do not see this sequence, jump to Troubleshooting.

---

## 3. Answer the 3 asks

| Ask | You're choosing | Safe default if unsure |
|---|---|---|
| What kind of work is this? | greenfield / bug_fix / research_publish / audit | **greenfield** |
| How much assurance? | Full / Lite (how much process) | **Full** (the default) |
| Any risky surfaces? | the six risk triggers (destructive data ops, archives, untrusted writes, credentials, untrusted HTML, installers) | **none** - declaring one raises verification on that surface |

**Everything else is derived and confirmed back to you in plain English.** Deliverable type, where tests run, review cadence, validator severity - each derived value arrives in the confirmation turn with a one-line why and an invitation to correct it.

Three ways to answer:

- **Directly:** "greenfield, Full, no risk surfaces."
- **Describe your project** and let Claude propose the calibration.
- **Delegate:** say "pick something reasonable."

You can change any of these later - see `FRAMEWORK-CONFIG.md` §7.

**The deliverable type is the branch point that decides which gates apply** - it changes *what* the framework verifies, not how much ceremony:

- **Web/UI** triggers a design brief (`docs/design.md`) authored before any UI code, plus browser-load and design-conformance verification passes.
- **Library** adds an API-surface contract.
- **Service** adds endpoint contracts.
- **CLI** adds command-surface checks.

---

## 4. Describe what you want to build

**A paragraph may be enough - but a more detailed description will get better results.** Claude runs bootstrap in order:

1. Discovery questions - depth depends on tier.
2. A spec.
3. **Web/UI only:** a design discovery interview and the `docs/design.md` brief.
4. A milestone plan.
5. Scaffold files - 44 for Lite, 100 for Full (counts derived from this release's scaffold set; a declared risk trigger adds 2).

**Each phase surfaces for your approval** per the `pre_write_surface` toggle. The default: the spec and the milestone plan surface before they are written; the scaffold and Phase docs are written directly and surfaced for post-write review.

**Before any disk write, Claude states the blast radius** - "I'll create about N files across `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files" - so you consent to the footprint up front.

At the end of bootstrap:

- The kit's `CLAUDE.md` is **replaced** by your project's own `CLAUDE.md`.
- The `origin` remote is reset - it pointed at the kit; you choose local-only, your own repo, or `gh repo create`.
- Bootstrap is done. The build loop begins.

### Important: The Two-Brain Flow
Before build begins - Claude will lead the user through opening a **2nd Terminal** - this will house the build/verify agents.

**Note** - within the terminal 2, the build or verifier session is closed at the end of each stage. Then reopened in the same terminal 2 with a fresh session for the next stage. **The Orchestrator terminal 1 remains open through the entire build process**.

## 5. Run the build loop

This is the operational part the visual overview doesn't spell out.

Each stage runs as its own agent: a fresh session in an enforced role.

**Each stage is a fresh Claude session.** Context is cleared between stages on purpose. The SessionStart hook re-loads orientation automatically every time.

---

For **Lite tier**: just open a fresh session and say *"let's start M01."* Work from the markdown task list in `docs/build-prompts/M01-*.md`.

---

For **Full tier** - the **three-gate per-stage loop** (when `red_review: on`, the Full default):

1. Open a fresh Claude session in the project (`claude`, or `/clear` in an existing one - both work; `STAGE-LOOP.md` is the home doctrine for the difference).
2. **Verify the hook fired:** Claude's first response should include a line like `[read-first stamp] role=work, op=greenfield, loaded N files, M bytes, 0 skipped`. If it doesn't, jump to Troubleshooting - orientation didn't load and the stage is unreliable.
3. **Run the stage.** Easiest: type `/stage M01 A` - the slash command (installed at Full) reads the Phase doc, extracts the matching `### A.5 CLI Prompt` block, and runs it. No copy-paste. (`/verify M01`, `/refactor M01`, and `/closeout M01` work the same way.)
   - *Or* paste by hand: open `docs/build-prompts/M01-<title>.md`, find `### A.5 CLI Prompt`, copy the fenced ` ```xml ` block, paste it in.
4. **Gate 1 - plan approval.** Claude states its deliverable + test plan and waits. Confirm or correct.
   - *Or* **Best Practice: copy/paste to Orchestrator Terminal 1** for adjudication. Orch will create a prompt to paste back to the build terminal. **At each step the user has the option to paste to the Orch for advice. This is Best Practice.**
5. **Gate 2 - red-stop.** Claude writes the failing tests, confirms they fail for the right reason, then **stops and surfaces the test files for your review** before implementing to green. Approve the test design, or send it back. **Best Practice is to copy/paste to Orch Terminal 1 for adjudication.**
   - This catches shallow or wrong-contract tests at the cheapest moment - especially valuable on weaker models. Skip this gate per project by setting `red_review: off`.
   - **In the two-brain flow the release rides the orchestrator's verdict packet.** It ends with this explicit line: `RED-RELEASE: approved — builder, run node scripts/approve-red.cjs`
   - Claude acts only on that line. Approval language without it **is not a release** - Claude stops and tells you `/approve-red` is required. Enter `/approve-red` slash command in the terminal to invoke.
6. **Gate 3 - stage-end.** Claude implements to green, runs gates, fills a retrospective, and surfaces the whole stage for your review - **Best Practice is to copy/paste to Orch Terminal 1 for adjudication.**:
   - The surface: diff, gate results, retrospective, draft commit message. It says *"I will not commit until you approve."*
   - The retrospective includes a required **user friction stamp** you fill yourself: `verdict:` pass or fail, plus an optional sentence - the independent check on the agent's self-grade. Default is pass; an explicit fail forces the Friction-heavy outcome.
   - The stamp slot is enforced by a pre-commit validator - an empty stamp fails the commit.
7. **Review.** Approve, and it commits. Do **not** expect it to commit before you approve - gate G1, the framework's single most important rule. If it ever commits without approval, that's a bug; surface it.
8. **Open a fresh session for the next stage.** Repeat through the stages, the last stages after the main build stages (A, B, C, ...) follow - **each will execute in a fresh build session in terminal 2 - and will be guided by the orchestrator in terminal 1**:
   - The **Verifier**: `/verify M01` in a verifier session - set `node scripts/set-mode.cjs verifier` first; the UserPromptSubmit hook blocks mode mismatches.
   - The **Refactor** check when its trigger fires - at milestone boundaries, when the tech-debt count crosses its threshold or the milestone interval elapses, whichever comes first, always after the Verifier; Lite skips it (`/refactor M01` in a refactor session - `node scripts/set-mode.cjs refactor`).
   - **Closeout**: `/closeout M01` - surfaces the explicit *continue / ship v1 here / pause to re-tier* choice. This closes the milestone.
   - Then the milestone PR.

---

## Two roles - orchestrator + build (Full)

At Full tier the agent runs as **two distinct session types**, never sharing a session:

- **Orchestrator** - authors Phase docs / ADRs, adjudicates the build's surfaces, routes Verifier findings, runs PR/merge. Governed by `ORCHESTRATOR.md`.
- **Build** - executes one stage from a pasted §X.5 prompt. Governed by `CLAUDE.md` + the stage prompt; never reads `ORCHESTRATOR.md`.

**You are the conduit** - you carry the build's surfaces to the orchestrator and the orchestrator's prompts to the build. Only one role acts at a time.

How to host the two roles (`ORCHESTRATOR.md` §1 has the full table):

- **Recommended - two CLIs + git worktrees, one machine.** From the repo root: `git worktree add ../build-wt <milestone-branch>`. Run the **build** with `claude` inside `../build-wt`; run the **orchestrator** with `claude` in the main checkout. Shared `.git`, isolated working trees, no cross-machine drift.
  **`worktree-after-first-commit`:** a freshly bootstrapped project has **zero commits**, so the milestone branch cannot exist yet and `git worktree add` fails on it (`fatal: invalid reference` - executed on git 2.52) - so use "two CLIs, same directory" (below) until M01.A's first commit lands, then create the worktree and move the build session into it.
- **Web orchestrator + local CLI build** - valid only if the build genuinely runs on a separate machine; then the cross-machine pre-flight in `ORCHESTRATOR.md §3` is mandatory.
- **Two CLIs, same directory** - simplest; fine because you serialize the two roles.

**Set the session's role before opening it:**

- `node scripts/set-mode.cjs orchestrator` for an orchestration session.
- `node scripts/set-mode.cjs work` for a build session - deleting the `.claude/role` file works too.
- The SessionStart hook loads the matching read-first list, and the agent echoes `[read-first stamp] role=<role>` so you can confirm.
- A second hook (UserPromptSubmit) blocks a pasted stage prompt whose mode disagrees with `.claude/role`. If you forget to switch modes, you get a clear error instead of a verifier reading retrospectives it shouldn't.

**Run the orchestrator as terminal-launched `claude` or on claude.ai/code - not a chat panel.**

- The orchestrator is a *long-lived* session: it holds the why-of-decisions across many stages. `claude --resume` gives it durable continuity across days; a chat panel does not persist reliably across restarts.
- **Build and verifier sessions are the opposite - always fresh per stage.** Close and re-run `claude`; do not reuse. The fresh-context bias guard only holds if each build or verifier session actually starts clean.

At **Lite tier** the two roles collapse into one session - there is no separate orchestrator and `ORCHESTRATOR.md` is not generated.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No calibration interview on first run | `CLAUDE.md` didn't auto-load | Confirm you ran `claude` from the project root (where `CLAUDE.md` is). Confirm Claude Code reads `CLAUDE.md` (it does by default). |
| No `[read-first stamp]` line in a session | SessionStart hook didn't fire | Run `/hooks` in Claude Code - the SessionStart entry should be listed. If not, validate `.claude/settings.json` is valid JSON. Confirm `node` is on PATH (`node --version`). See `templates/dot-claude/README.md` (installs as `.claude/README.md`). |
| `git clone` says destination not empty | Target dir exists with files | `git clone` creates the directory - don't pre-create it. Pick a new name or clone to a fresh path. |
| Agent committed without asking | G1 violation - should never happen | Surface it immediately. Check `git log`. The framework's most important guarantee failed; investigate before continuing. |
| Adopt printed `ADOPTION INCOMPLETE` (exit 1) | A required control is not active - the output names it on a `MISSING:` line | Run the printed `repair:` command exactly as printed (e.g. `repair: git init` when adopt ran before the repo was initialized), then re-run adopt as the output instructs: `node scripts/kit-update.cjs --adopt` (adopt has already installed that copy). Re-running is always safe; a clean re-run changes nothing. |
| Bootstrap stopped partway | Aborted or errored mid-phase | Re-run `claude`. The bootstrap detects partial state (spec exists but no scaffold, etc.) and offers to resume from the right phase rather than restart. |
| CI failing on `validate-stage-prompts` | A Phase doc's XML drifted from the schema | Run `node validators/validate-stage-prompts.cjs --all` locally for line-pointed errors. See `validators/README.md`. |
| `node` missing - `node: command not found` (macOS / Linux); `'node' is not recognized as an internal or external command` (Windows cmd); `The term 'node' is not recognized` (Windows PowerShell) | Node not on PATH | Install Node.js, reopen the terminal, `node --version`. Claude Code needs it anyway. |

---

## 7. Where everything is - the file map

Read these when you need them. You do **not** need to read them all up front; the SessionStart hook loads the right subset per session.

> **Where you are:** in an unzipped install the files in this map live inside `sbak/`, with two exceptions: `CLAUDE.md` sits at the repo root, one level up from this file; `README.md` is the public repo's front page, not packed into the ZIP. Paths below are relative to `sbak/`.

### Start here

| File | Read it for |
|---|---|
| `QUICKSTART.md` (this file) | The shortest path to a running build loop |
| `HOW-IT-WORKS.html` | Visual overview - open in a browser; good for explaining to others |
| `README.md` | Full prose overview: what it is, tiers, what's in the box, when to use which tier. Lives at the public repo root (the repo's front page), not inside `sbak/`; the ZIP does not pack it. |

### The methodology (framework-level references - immutable except via ADR)

| File | Read it for |
|---|---|
| `BUILD-PLAYBOOK.md` | The methodology. Part 0 = tier model. §3 = the per-stage loop. §3.4 = the Verifier. §4 = discipline, gates, retrospectives. |
| `FRAMEWORK-CONFIG.md` | The dial: 2 tiers, every toggle, the re-tier protocol, per-tier overhead estimates |
| `persistence-architecture.md` | The 5-layer memory model - where each artifact lives, who reads/writes when, the mutability matrix |
| `STAGE-PROMPT-PROTOCOL.md` | The XML schema for the stage prompts you paste each stage (5 schemas: work / verifier / refactor / closeout / audit-pass) |
| `PROCESS-VALIDATION.md` | The scoring framework - three axes, hard + soft gates (G1–G16), outcome matrix, tier-conditional retrospective shape |

### The entry point + the calibration

| File | Read it for |
|---|---|
| `CLAUDE.md` | The bootstrap orchestration. Auto-loaded on first session; replaced by your project's own at end of bootstrap. You normally don't edit this. |
| `templates/CALIBRATION-INTERVIEW.md` | The exact text of the 3-ask interview (mode / tier / risk triggers) + the confirmation turn + smell-flagging + toggle mapping |
| `templates/PROJECT-CLAUDE.md` | What `CLAUDE.md` becomes after bootstrap - your project's standing execution rules (read by both session types) |
| `templates/ORCHESTRATOR.md` | The orchestration operating manual - installed as `ORCHESTRATOR.md` at Full. Decision index for authoring / adjudication / routing + topology table + consultation protocol + pushback authority. Build sessions ignore it. |
| `templates/SPEC-TYPE-SECTIONS.md` | Per-deliverable-type contract section appended to the spec (cli command surface / library API surface / service endpoint contracts / web design.md pointer + visual acceptance) |
| `templates/DESIGN-DISCOVERY-INTERVIEW.md` | Used only when `deliverable_type: web` - the Phase 1.5 interview script (Path A imports from Claude Design; B1 from-scratch; B2 from community template) |
| `templates/design.md` | The 9-section `docs/design.md` brief (visual theme / color tokens / typography / components / layout / depth / do's-don'ts / responsive / agent prompt guide) - generated for web/UI projects, read before any UI code |

### Enforcement

| File | Read it for |
|---|---|
| `validators/validate-stage-prompts.cjs` | XML schema validator for Phase docs. Runs at pre-commit + CI. Warns when a Phase doc exceeds 600 lines. |
| `validators/validate-retrospective.cjs` | User friction-stamp gate (Full). Pre-commit fails on an empty/placeholder stamp in a staged retrospective (`verdict:` pass or fail); an explicit fail is accepted with an advisory NOTE that the outcome is forced to Friction-heavy. |
| `validators/README.md` | Validator usage + combined pre-commit recipe |
| `scripts/verify-local.cjs` | The kit's one local verification entrypoint (pre-push + CI). On the kit's own tree a full run takes roughly nine minutes - measured 550.9 s single-invocation on the reference machine (2026-07-27), with the smoke harness alone at ~478 s - and prints per-phase elapsed seconds. Size any wrapping tool's command budget *above* that (a 120 s default timeout kills it mid-run; fixture work is sandbox-confined, so re-run the push). A generated project runs its own, far smaller floor. |
| `scripts/lib/sandbox.cjs` | The fixture-confinement primitive: sandbox roots, fail-closed path guard, pinned fixture git env - why an interrupted or worktree-orchestrated suite run cannot mutate the repo it lives in. |
| `scripts/build-receipts.cjs` | Build receipts: normal sessions leave local event ledgers under `.claude/receipts/`; `render` turns them + committed history into a deterministic JSON/HTML/MD report under `reports/` - gitignored as a default, not a wall (negate the entry to track a report deliberately); `--check` is the release preflight. |
| `templates/dot-github/workflows/validate-stage-prompts.yml` | CI workflow installed into the project |
| `templates/dot-claude/hooks/session-start-read-first.cjs` | The SessionStart hook - auto-loads the mode-aware read-first list + emits the `[read-first stamp]` |
| `templates/dot-claude/hooks/user-prompt-submit-mode-check.cjs` | The 3-brain enforcement hook - blocks a stage prompt pasted into a session whose `.claude/role` doesn't match the prompt's declared mode |
| `templates/dot-claude/commands/{stage,verify,refactor,closeout,on-track,approve-red}.md` | Slash commands (`/stage M01 A`, `/verify M01`, `/refactor M01`, `/closeout M01`, `/on-track`, `/approve-red`) that read the Phase doc and run the matching block - courier relief, no XML paste |
| `templates/dot-claude/README.md` | Hook installation + troubleshooting (installs as `.claude/README.md`) |

## 8. The one rule that never changes

In every tier, every mode, every session: **the agent does not commit without your explicit approval.** If that ever breaks, stop and investigate - it is the guarantee the entire framework rests on.
