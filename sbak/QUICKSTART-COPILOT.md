# QUICKSTART (Copilot in VS Code)

>**This page covers the GitHub-Copilot-in-VS-Code path.** The framework's primary target is Claude Code - on Claude Code, read [`QUICKSTART.md`](QUICKSTART.md) instead.
>
>**Picking a Claude model in Copilot does not make this Claude Code.** The model changes; the harness does not. Copilot never runs the kit's `.claude/` session hooks - the read-first auto-load, the role guard, the red-gate - so on this host those become honor-system steps this page teaches. The Git-hook layer (pre-commit, pre-push) and CI remain fully mechanical: they run no matter what wrote the commit. That split - session layer honor-system, Git hooks + CI mechanical - is the one difference that matters here, and it makes the adopt step below **more** important on Copilot, not less: Git hooks + CI are the only mechanical enforcement this host has.
>
> If you *do* have Claude Code installed, running `claude` in the VS Code integrated terminal gives you the fully enforced path with the editor around it. This page is for running Copilot alone.

## Just get going

In a hurry? One decision, one chat, then the kit drives **(you need Git, Node 22+, and VS Code with Copilot - §0)**:

1. **New project** - unzip the release ZIP into a fresh directory and adopt (§1's **New repo** sequence). **Existing repo** - unzip into the repo and adopt (§1's "Existing repo" line).
2. Open the folder in VS Code (**File, then Open Folder**), open Copilot Chat, pick a **Claude model**, switch to **Agent Mode** (§2), and type one line - what you want (*"fix a bug in this app"*, *"add CSV export to my app"*, *"build me a game"*) or just `go`. The kit takes it from there: everything else arrives one question at a time, at the moment the run needs it.

**Nothing leaves your machine until you explicitly approve it** - Agent Mode shows every file write for Apply/Discard, and the kit's own rule keeps `git commit`/`git push` waiting on your explicit go-ahead. Push and PR are single, separate approvals near the end of a run. Until then, everything is local.

**Don't study the docs - ask.** The chat you just opened has full visibility of the kit's docs and your repo (once your project is running, that session is the orchestrator): any *"what now / how do I / where is"* question gets answered in-session, with the right doc quoted when it matters.

The sections below unpack the same path in full - prerequisites, the install, the model picker, the loop.

---

## 0. Prerequisites

| Tool | Why | Check it's there |
|---|---|---|
| **VS Code** | Where Copilot Chat runs | `code --version` |
| **GitHub Copilot subscription with Claude access** | The framework relies on Claude as the model. The picker's Claude list moves as models ship (Sonnet and Opus lines plus Haiku 4.5 at the time of writing) - check the picker itself, not this page. On Business/Enterprise plans an admin must allow model switching and enable specific Claude models for the organisation; if no Claude model shows, ask your admin. | open Copilot Chat, click the model dropdown at the bottom of the panel, look for "Claude" |
| **GitHub Copilot extension for VS Code** | The extension itself | VS Code Extensions tab: GitHub Copilot installed and signed in |
| **Node.js 22+** | The kit's validators and Git-hook gates are Node scripts. The floor is 22 rather than 18 because the test command this kit prescribes is a path-scoped glob (`node --test "tests/**/*.test.cjs"`), and glob positionals require Node 21 or newer - 22 is the lowest maintained line that runs it. CI pins 24 (Active LTS). | `node --version` |
| **Git** | Cloning and per-stage commits - and on this host the Git hooks are the mechanical enforcement layer | `git --version` |

You do **not** need Claude Code installed. Everything Copilot needs is Copilot itself + Node + Git.

---

## 1. Get the kit

The kit comes two ways. **Most users: download the release ZIP** - the signed, checksummed, attested artifact. `git clone` stays available as the **alternate** path (below).

### Download the release ZIP - recommended

Each release ships one asset named `sbak-<version>-starter.zip` plus its `.sha256`. Get the current one - `sbak-v1.0.5-starter.zip` - from the [releases page](https://github.com/kknipe2k/Software-Build-Assurance-Kit/releases), and **verify before you unpack**:

- **Checksum, macOS / Linux:** `sha256sum -c sbak-v1.0.5-starter.zip.sha256` (or compare `sha256sum sbak-v1.0.5-starter.zip` against the published value).
- **Checksum, Windows (cmd or PowerShell):** `certutil -hashfile sbak-v1.0.5-starter.zip SHA256`, then compare the printed hash against the published value.
- **Build attestation (stronger, optional):** `gh attestation verify sbak-v1.0.5-starter.zip -R kknipe2k/Software-Build-Assurance-Kit` - confirms the ZIP was built by this repo's release workflow (SLSA build provenance).

**What the unzip lands:** exactly one root file - `CLAUDE.md` - plus one kit directory, `sbak/` (everything else lives inside it). The only possible collision with an existing repo is `CLAUDE.md` itself, adjudicated at bootstrap.

**Copy is not install.** Unzip alone lands no active enforcement: the Git hooks are not armed until the `adopt` step arms and verifies them.

**One Copilot-specific step the install needs:** Copilot auto-loads its instructions from `.github/copilot-instructions.md` at the workspace root, and **neither the ZIP nor a clone of this repo includes that file**. The sequences below create it by copying `CLAUDE.md` into that slot, so every chat opens with the kit's entry rules in context.

**New repo** - the full sequence. Run it from the folder the ZIP downloaded to (usually `Downloads`), and replace `<projects-path>` with wherever you keep code - the point is that the project gets a real home, not `Downloads`.

macOS / Linux:

```
unzip sbak-v1.0.5-starter.zip -d <projects-path>/my-project && cd <projects-path>/my-project
git init
node sbak/templates/scripts/kit-update.cjs --adopt
mkdir -p .github
cp CLAUDE.md .github/copilot-instructions.md
```

Windows (cmd or PowerShell):

```
mkdir <projects-path>\my-project
tar -xf sbak-v1.0.5-starter.zip -C <projects-path>\my-project
cd <projects-path>\my-project
git init
node sbak\templates\scripts\kit-update.cjs --adopt
mkdir .github
copy CLAUDE.md .github\copilot-instructions.md
```

Then open the folder in VS Code: **File, then Open Folder, pick `my-project`.** Don't use `code .` - depending on VS Code's last-opened state it can restore a multi-root *workspace* and nest your project under an "UNTITLED (WORKSPACE)" wrapper, which scopes the framework-anchored paths (`.github/`, `CLAUDE.md`) to the wrong root so Copilot may not auto-load the instructions. Open Folder is unambiguous. If VS Code opens the folder in Restricted Mode, choose **Trust** - Copilot Chat and the kit's Node scripts need a trusted workspace.

**Existing repo:** unzip into the repo, run the same adopt command, create the same `.github/copilot-instructions.md` copy, then open the folder in VS Code.

**Order matters:** `git init` must come before `adopt`. Skip it and adopt exits 1, prints `ADOPTION INCOMPLETE`, names the control (`MISSING: Git hook activation (core.hooksPath)`), and prints the fix (`repair: git init`). Run the printed repair, then re-run adopt.

**The adopt step verifies itself, and its exit code is the contract:**

- **Exit 0 means adoption COMPLETE** - every required enforcement layer is active (Git hooks armed via `core.hooksPath`, no destination refused, no incomplete settings merge) - and it prints exactly that.
- **Exit 1 means `ADOPTION INCOMPLETE`** - the missing control is named on a `MISSING:` line, with a `repair:` command that runs as printed.
- **Exit 2 is a usage or fail-closed refusal.**
- An incomplete install cannot silently look complete: run the printed repair, then re-run `--adopt` - re-running is always safe; a clean re-run changes nothing.

On this host that contract is worth restating: the session-layer hooks never run in Copilot, so **the Git hooks adopt arms are the only mechanical wall between an agent mistake and your history**. Don't skip adopt here.

### Clone the repo - the alternate path

`git clone` creates the target directory. Don't pre-create it. From the parent dir where the project should live:

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-project
cd my-project
node sbak/templates/scripts/kit-update.cjs --adopt
```

Then create the Copilot auto-load copy - the same step as the ZIP path (`.github/` already exists in the clone): macOS / Linux `cp CLAUDE.md .github/copilot-instructions.md`; Windows (cmd or PowerShell) `copy CLAUDE.md .github\copilot-instructions.md`. Then open the folder in VS Code (**File, then Open Folder** - same `code .` caveat as above).

The adopt step is not optional on the clone path either: `core.hooksPath` is local Git configuration and does not travel with a clone, so a fresh clone's git hooks stay unarmed until adopt arms and verifies them (the same exit-code contract as the ZIP path).

> **Heads-up on the git remote:** because you cloned from the kit, `origin` still points at the kit's repo. Don't `git push` yet - it would target the kit, not your project. The bootstrap resets this at handoff (Phase 5) and asks where your project should live (local-only / your own GitHub repo / create a new one). If you want to set it yourself first: `git remote remove origin`.

---

## 2. First chat

1. In VS Code, open the Copilot Chat panel (icon in the title bar, or `Ctrl/Cmd+Alt+I`).
2. **At the bottom of the chat panel, click the model dropdown and select a Claude model.** A current Claude Sonnet is a safe default for the framework; the picker's list is the source of truth for what your plan and org policy expose. Copilot persists this choice per workspace.
3. **Switch to Agent Mode** (the chat-mode dropdown near the model picker). Agent Mode is what gives Copilot file-edit and terminal capabilities with VS Code's per-edit and per-command approval UI - the closest analog to Claude Code's behavior, and it is where the framework's "do not commit until approved" rule is structurally reinforced by VS Code.
4. Type anything - `go` works, or state what you want.

What you should see next:

1. **First response:** the agent reads the auto-loaded instructions, then the kit's entry files. A Copilot session runs no hooks, so the stamp check and the read check (both live in the session hooks) do not apply here - the read floor is prose-only on this host: the agent reads the orientation files the instructions name, and you hold it to that.
2. **You reply with the standard line:** *"This is Copilot - the session-hook layer does not run in this host. Git hooks are armed (adopt exit 0). Proceed with the honor-system steps from sbak/QUICKSTART-COPILOT.md."*
3. **Then:** the agent echoes your working directory with a one-line scope statement (confirm it is the right folder), and presents the calibration interview - 3 asks, then a confirmation turn.

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

**The deliverable type is the branch point that decides which gates apply** - it changes *what* the framework verifies, not how much ceremony. Web/UI triggers a design brief (`docs/design.md`) authored before any UI code, plus browser-load and design-conformance verification passes; library, service, and CLI each add their own contract checks.

You can change any of these later - see `FRAMEWORK-CONFIG.md` §7.

---

## 4. Describe what you want to build

**A paragraph may be enough - but a more detailed description will get better results.** The agent runs bootstrap in order: discovery questions, a spec, (web/UI only) a design brief, a milestone plan, then the scaffold - 41 files for Lite, 97 for Full (counts derived from this release's scaffold set; a declared risk trigger adds 2).

**Each phase surfaces for your approval** per the `pre_write_surface` toggle, and **before any disk write the agent states the blast radius** ("I'll create about N files across `.claude/`, `.githooks/`, `scripts/`, `docs/`, `.github/`, plus root files") so you consent to the footprint up front. In Agent Mode, VS Code additionally shows the diff for every file write - **Apply** or **Discard**, per edit.

At the end of bootstrap:

- The kit's `CLAUDE.md` is **replaced** by your project's own `CLAUDE.md`, and the Copilot instructions file is **replaced** by the project version (scaffolded from `templates/dot-github/copilot-instructions.md`). Subsequent chats auto-load the project version.
- The `origin` remote is reset if you cloned - you choose local-only, your own repo, or `gh repo create`.
- Bootstrap is done. The build loop begins.

### Important: the two-window flow

Before the build begins, the agent will lead you through opening a **second VS Code window** - that window houses the build and verifier chats. The orchestrator window stays open through the entire build; the build window's chat is closed at the end of each stage and reopened fresh for the next one. Details in §5.

---

## 5. Run the build loop

This is where Copilot diverges most from Claude Code. Read §5.0 first.

### 5.0 What degrades on this host - and what does not

Claude Code enforces the session layer with hooks in `.claude/`; Copilot never reads them. Each of those walls becomes an honor-system step here. This table is the single summary - the subsections below are the operating detail:

| Capability | Claude Code | Copilot (VS Code) |
|---|---|---|
| **SessionStart hook** (auto-loads the read-first list) | Fires automatically at every session start; prints the `[read-first stamp]` | No hook - the instructions file directs the read; **you verify the orientation stamp yourself** and re-ask if it is missing (§5.6) |
| **Mode guard** (the role check) | A hook structurally **blocks** a stage prompt whose mode disagrees with `.claude/role` | Honor-system - **state the mode at the start of each chat** and check the stamp (§5.6) |
| **Red-gate** (blocks implementation edits until the RED tests are approved) | A hook hard-blocks edit tools until `/approve-red` records the release | Honor-system - the agent must **stop at the red-stop and wait for your explicit approval**; nothing mechanical holds it if it doesn't (§5.4) |
| **Stage invocation** (`/stage M01 A` and the other slash commands) | Run the matching `.claude/commands/*.md` | Typed conventions the instructions file teaches: **`Stage M01 A`**, **`Verify M01`**, **`Refactor M01`**, **`Closeout M01`** (§5.7) |
| **Build receipts** (session-event ledgers under `.claude/receipts/`) | A session hook records events; `render` folds them into the receipt | No session events - receipts render from committed history only, so the receipt is thinner on this host |

What does **not** degrade: the Git hooks (pre-commit validation, pre-push verification) and CI run mechanically in every host once adopt has armed them, and VS Code's Agent Mode adds its own per-edit Apply/Discard and per-command approval UI. The commit and push boundaries are identical to Claude Code: **no commit and no push without your explicit approval.**

### 5.1 Each stage is a fresh chat

Context is cleared between stages on purpose. Click **+ New Chat** in the Copilot Chat panel (or `/new`) for each stage - or use the two-window topology (§5.5). The new chat re-reads the instructions file automatically.

### 5.2 Verify orientation loaded

After bootstrap, each project chat's first response should include the project stamp `[orientation loaded: mode=<work|verifier|orchestrator>, model=<your model>, N files]`. If it does not, type:

> Read your instructions file and the framework orientation as your first action, then echo the orientation-loaded stamp.

Without that stamp, the stage runs on stale or partial context. Don't proceed.

### 5.3 Run the stage

For **Full tier**: type the convention the instructions file teaches - **`Stage M01 A`** - and the agent opens the Phase doc (`docs/build-prompts/M01-<title>.md`), finds the `### A.5 CLI Prompt` block, and runs it as if pasted. You can also paste the fenced ` ```xml ` block by hand - both work.

For **Lite tier**: just say *"let's start M01"* - Lite uses markdown task lists, not XML stage prompts.

### 5.4 The work loop - three gates (the Full default, `red_review: on`)

The agent runs the same three-gate per-stage loop as the Claude Code track. The gates are honor-system on this host - the instructions file teaches them, and VS Code's approval UI backs the write side:

- **Gate 1 - plan.** The agent states its deliverable + test plan and waits. Confirm or correct.
  - *Or* **best practice: copy/paste the plan to the orchestrator window's chat for adjudication** - it returns a prompt to paste back to the build chat. At every gate you have that option; it is the best practice.
- **Gate 2 - red-stop.** The agent writes the failing tests, confirms they fail for the right reason, then **stops and surfaces the test files for your review** before implementing to green. Approve the test design, or send it back. **Best practice: copy/paste the RED surface to the orchestrator window's chat for adjudication.** This catches shallow or wrong-contract tests at the cheapest moment. In the two-window flow the release rides the orchestrator's verdict packet, which ends with the explicit line `RED-RELEASE: approved — builder, run node scripts/approve-red.cjs` - the agent acts only on that line, and the approval script runs fine on this host. What Copilot does not have is the hook that *blocks* edits until then - the stop is the agent honoring the rule, so if you ever see implementation edits before your approval, stop the stage and say so.
- **Gate 3 - stage-end.** The agent implements to green, runs the gates (VS Code shows each command - approve before run), fills the retrospective including the required **user friction stamp you fill yourself** (`verdict:` pass or fail, plus an optional sentence - the independent check on the agent's self-grade), and surfaces the whole stage: diff, gate results, retrospective, draft commit message. It says *"I will not commit until you approve."* **Best practice: copy/paste the stage-end bundle to the orchestrator window's chat for adjudication.** The stamp slot is enforced by a pre-commit validator - an empty stamp fails the commit, and that validator runs mechanically here (it is a Git hook, not a session hook).

Review the bundle. If good: tell the agent to commit (or commit yourself via Source Control). Do **not** allow a commit before you have reviewed and approved - gate G1, the framework's single most important rule. If it ever commits without approval, that's a bug; surface it.

Open a new chat for the next stage and repeat. After the main build stages come the closing stages, each in a fresh chat in the build window, **guided by the orchestrator window's chat**: the **Verifier** (`Verify M01` in a verifier chat - §5.6), the **Refactor check** when its trigger fires - at milestone boundaries, when the tech-debt count crosses its threshold or the milestone interval elapses, whichever comes first, always after the Verifier; Lite skips it (`Refactor M01` in a refactor chat) - then **Closeout** (`Closeout M01` - surfaces the explicit *continue / ship v1 here / pause to re-tier* choice), then the milestone PR.

### 5.5 The two roles in Copilot (Full only)

At Full tier the framework splits into two session types - **orchestrator** (authors Phase docs, adjudicates the build's surfaces, routes findings) and **build** (executes one stage). In Copilot that maps to two VS Code windows, each with its own chat:

- **Canonical for Full on Copilot: two windows + git worktrees** (Topology D in `ORCHESTRATOR.md` §1). From the repo root: `node scripts/set-mode.cjs --split <milestone-branch>` (it creates `../<project>-build-wt` fail-closed). Orchestrator window: the main checkout. Build window: `../<project>-build-wt`. Shared `.git`, isolated working trees, no file-race risk. Open each via **File, then Open Folder** (same `code .` caveat as §1).
- **Not on day one:** a freshly bootstrapped project has **zero commits**, so the milestone branch cannot exist yet and `node scripts/set-mode.cjs --split <milestone-branch>` refuses (`fatal: invalid reference` - executed on git 2.52). Until M01.A's first commit lands, run both chats against the single checkout - one role at a time, mode stated in each chat's first message.

You are the conduit - copy surfaces from the build chat to the orchestrator chat and decisions back, by switching windows. Only one role acts at a time. (Topologies A, B, C in `ORCHESTRATOR.md` §1 are Claude-Code-specific and don't apply in Copilot.)

The role separation itself is honor-system on this host: `node scripts/set-mode.cjs <role>` still writes `.claude/role` and the instructions file teaches the mode-aware reading, but no hook blocks a mismatch - state the role in each chat's first message and check the stamp (§5.6). The pattern transfers whole: it is the operating model, not a Claude Code feature.

### 5.6 Mode-aware reading (honor-system)

The framework has three modes - **work**, **verifier**, **orchestrator** - each with its own read-first list at `.claude/read-first-list*.txt`. In Claude Code the SessionStart hook switches automatically; **in Copilot you state the mode at the start of each chat**:

- **Work / build chat** - your default. Say nothing special; the instructions file directs the agent to read `.claude/read-first-list.txt`.
- **Verifier chat** (Full only) - start with: *"This is a verifier session. Read `.claude/read-first-list-verifier.txt` only. Do NOT read prior retrospectives - that is the bias guard."*
- **Orchestrator chat** (Full only) - start with: *"This is an orchestrator session. Read `.claude/read-first-list-orchestrator.txt`, including `ORCHESTRATOR.md`."*

Verify each by checking the `mode=` value in the orientation stamp.

### 5.7 Invoking stages without slash commands

Claude Code runs `.claude/commands/`; Copilot can't. The instructions file teaches the agent the plain conventions: **`Stage M01 A`**, **`Verify M01`**, **`Refactor M01`**, **`Closeout M01`** - each opens the right doc, extracts the right prompt, and runs it as if pasted. Pasting the raw XML yourself always works too.

### 5.8 The orchestrator is stateless here; watch the model

Two Copilot-specific realities:

- **Stateless orchestrator.** Copilot Chat doesn't persist reliably across restarts, so the orchestrator runs spawn-from-artifacts: each consultation is a fresh chat that reads the artifacts (`gap-analysis.md`, prior retros, the Phase doc, `docs/consultations.md`), answers, and logs the decision back to `docs/consultations.md`. The ledger is the memory. (In Claude Code the orchestrator is a long-lived resumable session - that is the one real behavioral difference between the hosts.)
- **The model can change under you.** Copilot meters premium model usage; when your plan's premium allowance runs out, chat continues on an **included base model, which is generally not a Claude model at all**. The project stamp carries `model=` so the swap is visible, and the agent flags any heavy-reasoning step (spec, design brief, Phase doc, verifier pass, closeout) running on a lighter or unknown model - defer until your allowance resets, or accept lower quality and re-run the stage later. Author the heavy artifacts early in a billing cycle.

---

## 6. Keeping the instructions file fresh (copy vs symlink)

Your `.github/copilot-instructions.md` is a copy of `CLAUDE.md` (§1's step), so it goes stale if `CLAUDE.md` changes during bootstrap iterations. Refresh it with the same copy command, or replace it with a symlink that tracks `CLAUDE.md` automatically:

macOS / Linux:

```
rm .github/copilot-instructions.md
ln -s ../CLAUDE.md .github/copilot-instructions.md
```

Windows (PowerShell, run as Admin or with Developer Mode on - symlink creation is a privilege there; the link is created from inside `.github\` because PowerShell resolves a relative `-Target` against the current directory, not the link's own directory):

```
Remove-Item .github\copilot-instructions.md
Set-Location .github
New-Item -ItemType SymbolicLink -Path copilot-instructions.md -Target ..\CLAUDE.md
Set-Location ..
```

Windows (cmd, no symlink - refresh the copy instead):

```
del .github\copilot-instructions.md
copy CLAUDE.md .github\copilot-instructions.md
```

Either way, the file is replaced by the project version at the end of bootstrap (§4), which closes the staleness window for good.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Claude doesn't appear in the model picker | Org admin hasn't enabled Claude models / model switching for your Copilot plan, or your plan doesn't include them | Ask your admin to enable Claude models in the Copilot policy settings. On a personal plan, check your plan's model list on the Copilot plans page. |
| No orientation line in the first response | The instructions file wasn't picked up | Confirm `.github/copilot-instructions.md` exists at the workspace root (§1's copy step creates it). Confirm you opened the folder itself, not a wrapping workspace (§1). If still nothing, paste the file's contents into the chat as your first message. |
| First response shows no `[read-first stamp]` line | Expected on this host - the stamp is printed by a session hook Copilot never runs | Nothing to fix; proceed with the honor-system steps |
| Adopt printed `ADOPTION INCOMPLETE` (exit 1) | A required control is not active - the output names it on a `MISSING:` line | Run the printed `repair:` command exactly as printed (e.g. `repair: git init` when adopt ran before the repo was initialized), then re-run adopt as the output instructs. Re-running is always safe; a clean re-run changes nothing. |
| Agent edits files without showing a diff | You're not in Agent Mode | Switch the chat-mode dropdown to **Agent**. The default "Ask" mode answers questions without editing. |
| Agent ran `git commit` without asking | G1 violation | Stop. Check `git log`. In Agent Mode the terminal-command approval should have caught this. The framework's most important rule failed; investigate before continuing. |
| Verifier chat read prior retrospectives | Honor-system mode reading was skipped | Open a new chat. State the mode explicitly in the first message; verify the `mode=` value in the stamp. |
| `git clone` says destination not empty | Target dir exists with files | `git clone` creates the directory - don't pre-create it. Pick a new name or clone to a fresh path. |
| `node` missing - `node: command not found` (macOS / Linux); `'node' is not recognized as an internal or external command` (Windows cmd); `The term 'node' is not recognized` (Windows PowerShell) | Node not on PATH | Install Node.js, reopen the terminal, `node --version`. |

---

## 8. Where everything is - the file map

Read these when you need them. The instructions file handles loading the essentials; the rest is reference.

> **Where you are:** in an unzipped install every file in this map lives inside `sbak/` - except `CLAUDE.md` and your `.github/copilot-instructions.md` copy, which sit at the repo root, one level up from this file. Paths below are relative to `sbak/`.

### Start here

| File | Read it for |
|---|---|
| `QUICKSTART-COPILOT.md` (this file) | The Copilot path |
| `HOW-IT-WORKS.html` | Visual overview - open in a browser |
| `README.md` | Full prose overview: what it is, tiers, what's in the box (at the repo root) |

### The Copilot-specific files

| File | Read it for |
|---|---|
| `.github/copilot-instructions.md` (repo root) | What Copilot auto-loads - your §1 copy of `CLAUDE.md`, replaced by the project version at handoff |
| `templates/dot-github/copilot-instructions.md` | The project-version shim the bootstrap installs into your project at handoff |

### The methodology + the entry point + enforcement

Same as `QUICKSTART.md` §7 - `CLAUDE.md`, `BUILD-PLAYBOOK.md`, `FRAMEWORK-CONFIG.md`, `STAGE-PROMPT-PROTOCOL.md`, `PROCESS-VALIDATION.md`, `persistence-architecture.md`, the templates, `validators/`. See `QUICKSTART.md` for the full grouped map; everything there applies in Copilot too except the `.claude/` session hooks (which Copilot doesn't run - §5.0 is the split).

---

## 9. The one rule that never changes

In every tier, every mode, every host: **the agent does not commit without your explicit approval.** In Copilot's Agent Mode that rule is reinforced by VS Code's per-edit and per-command approval UI - but the discipline holds regardless. If it ever breaks, stop and investigate. It is the guarantee the entire framework rests on.
