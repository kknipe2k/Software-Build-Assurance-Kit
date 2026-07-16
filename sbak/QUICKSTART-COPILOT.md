# QUICKSTART (Copilot in VS Code)

> The Copilot-in-VS-Code equivalent of `QUICKSTART.md`. The framework was designed primarily for Claude Code, but it runs cleanly in GitHub Copilot Chat with a Claude model selected — with one specific automation (the SessionStart hook) replaced by a few honor-system steps. This page is the operational guide for that path. If you're on Claude Code, use [`QUICKSTART.md`](QUICKSTART.md) instead.
>
> **Picking a Claude model in Copilot does not make this Claude Code.** The model changes; the harness doesn't. Copilot never reads `.claude/`, so the kit's session-layer hooks — the read-first stamp, the role check, the red-gate — never fire in this host. The framework still works, but those walls become **honor-system steps the shim asks the agent to follow instead of mechanically enforced hooks**. The git-hook layer (pre-commit / pre-push validators) and CI remain fully mechanical — they run no matter what wrote the commit. And if you *do* have Claude Code installed, running `claude` in the VS Code integrated terminal gives you the fully enforced path with the editor around it; this page is for running Copilot alone.

## Just get going

In a hurry? One decision, one chat, then the kit drives (prerequisites in §0):

1. **New project** — clone the kit, then **File → Open Folder** on the clone (§1; not `code .` — the workspace caveat is real). **Existing repo** — overlay the kit into it (§1's "already have files" steps; Windows variant included).
2. Open Copilot Chat, pick a **Claude model**, switch to **Agent Mode** (§2), and type one line — *"I want to \<your work — build a small CLI todo app / fix a bug in this app / add CSV export\>. Please load orientation and start."* Then **answer what it asks** — the calibration interview routes everything else, one question at a time.

**Nothing leaves your machine until you explicitly approve it** — Agent Mode shows every file write for Apply/Discard, and the kit's own rule keeps `git commit`/`git push` waiting on your explicit go-ahead. Push and PR are single, separate approvals near the end of a run. Until then, everything is local.

**Don't study the docs — ask.** The chat you just opened has full visibility of the kit's docs and your repo (once your project is running, that session is the orchestrator): any *"what now / how do I / where is"* question gets answered in-session, with the right doc quoted when it matters.

The sections below unpack the same path in full — prerequisites, the clone gotchas, the model picker, the loop.

---

## 0. Prerequisites

| Tool | Why | Check |
|---|---|---|
| **VS Code** | Where Copilot Chat runs | `code --version` |
| **GitHub Copilot subscription** with Claude access | The framework relies on Claude as the model. Claude (Sonnet 4.6 / Opus 4.6 / Haiku 4.5) is in the Copilot model picker on Pro and higher tiers. Some organisations gate Claude behind admin approval — if Claude doesn't show in the picker, ask your org admin to enable it. | open Copilot Chat → bottom-of-panel model dropdown → look for "Claude" |
| **GitHub Copilot extension for VS Code** | The extension itself | VS Code Extensions tab → GitHub Copilot installed + signed in |
| **Node.js 18+** | The kit's schema validator + pre-commit/CI gates | `node --version` |
| **Git** | Cloning + commits | `git --version` |

You do **not** need Claude Code installed. You do **not** need bash on Windows. Everything Copilot needs is Copilot itself + Node + Git.

---

## 1. Get the kit

`git clone` creates the target directory. Don't pre-create it. From the parent dir where the project should live:

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-todo
```

Then open the folder explicitly: **VS Code → File → Open Folder → pick `my-todo`.** Don't use `code .` — depending on VS Code's last-opened state it can restore a multi-root *workspace* and nest your project under an "UNTITLED (WORKSPACE)" wrapper, which scopes the framework-anchored paths (`.github/`, `.claude/`, `CLAUDE.md`) to the wrong root so Copilot may not auto-load the instructions. Open Folder is unambiguous.

The opened directory becomes your project root. The kit ships `.github/copilot-instructions.md` — Copilot auto-loads it as system context on the first chat.

**You already created the dir and `cd`'d into it?** Clone into the current dir (it must be empty, including dotfiles):

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git .
```

Then **File → Open Folder → pick this directory** (not `code .` — see the workspace-mode caveat above).

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

5. Open VS Code and Copilot Chat. After the calibration interview, tell it about your existing files:

   *"I have a spec at `spec/my-project-spec.md` — use it instead of authoring one."*

   *"I have existing code in `src/` — M01 starts from this code, not empty."*

---

## 2. First chat

1. In VS Code, open the Copilot Chat panel (icon in the title bar, or `Ctrl/Cmd+Alt+I`).
2. **At the bottom of the chat panel, click the model dropdown and select a Claude model** (Sonnet 4.6 is the safe default for the framework). Copilot persists this choice per workspace.
3. **Switch to Agent Mode** (the chat-mode dropdown near the model picker). Agent Mode is what gives Copilot file-edit + terminal capabilities with VS Code's per-edit and per-command approval UI — the closest analog to Claude Code's behavior, and it's where the framework's "do-not-commit-until-approved" rule is structurally enforced by VS Code.
4. Type:

   > I want to build a small CLI todo app. Please load orientation and start.

5. The agent reads `.github/copilot-instructions.md` (auto-loaded as system context), then reads `CLAUDE.md` and `templates/CALIBRATION-INTERVIEW.md` per the shim's directive, then echoes `[orientation loaded: kit bootstrap mode]`, then presents the **5-question calibration interview** as its first response.

If you do **not** see the orientation-loaded line in the first response, the shim wasn't picked up. Jump to Troubleshooting.

---

## 3. Answer the 5 questions

Same as `QUICKSTART.md` §3 — Lite / Standard / Full × New / Familiar / Experienced × Minimum / Standard / Maximum × CLI / Web-UI / Library / Service / Other × Local-first / Cloud / Local-only. Safe middle if unsure: **Standard + Familiar + Standard** (deliverable type + verification posture usually inferred from your description and repo visibility). The deliverable type determines which gates apply: `web` turns on the design brief (`docs/design.md`, authored in a new Phase 1.5/1.6) plus browser-load + design-conformance verifier passes.

## 4. Describe what to build

Same as `QUICKSTART.md` §4 — a paragraph. The orchestration session (this chat) runs the bootstrap: spec → **(web/UI only) design discovery + `docs/design.md`** → milestone plan → scaffold → first Phase doc → handoff. Before any disk write the agent states the blast radius ("I'll create ~N files across `.claude/`, `docs/`, `.github/`, …") so you consent to the footprint. You approve each phase per the `pre_write_surface` toggle — VS Code shows the diff for every file write in Agent Mode; you click **Apply** or **Discard**. At handoff the `origin` remote is reset (it pointed at the kit; pick local-only / your repo / `gh repo create`).

At the end of bootstrap the project ships its own `CLAUDE.md` (which replaces the kit's bootstrap one) AND a project-version `.github/copilot-instructions.md` (which replaces this shim). Subsequent Copilot Chats auto-load the project version.

---

## 5. Run the build loop

This is where Copilot diverges most from Claude Code. Read carefully.

### 5.0 What degrades on the Copilot path (and how it's handled)

Four Claude-Code automations don't exist in Copilot; each becomes an honor-system step. This table is the single summary — the subsections below (§5.6–5.8) are the operating detail:

| Capability | Claude Code | Copilot (VS Code) |
|---|---|---|
| **SessionStart hook** (auto-loads the read-first list) | Fires automatically at every session start; prints the orientation stamp | No hook — the shim directs the read; **you verify the `[orientation loaded: …]` stamp yourself** and re-ask if it's missing (§5.6) |
| **Mode enforcement** (the 3-brain guard) | `.claude/hooks` structurally **block** a stage prompt whose mode disagrees with `.claude/role` | Honor-system — **state the mode at the start of each chat** and check the `mode=` stamp (§5.6) |
| **Stage invocation** | `/stage M01 A` runs `.claude/commands/stage.md` | Typed convention **`Stage M01 A`** (Copilot can't run `.claude/commands/`); or paste the raw XML (§5.7) |
| **Slash commands** (`/verify`, `/closeout`, `/refactor`, `/on-track`) | Run the matching `.claude/commands/*.md` | Typed **`Verify M01`** / **`Closeout M01`** — the shim teaches the convention (§5.7) |

Two Copilot-only realities that aren't degradations but bite the same way: the **orchestrator is stateless** (spawn-from-artifacts each consultation; the ledger is its memory — §5.8), and the **model can silently fall back to Haiku** when Opus credits run out — the orientation stamp now carries `model=`, and the agent flags a heavy step (spec / design.md / Phase doc / any verifier pass / closeout) running on Haiku so you can defer or re-run (§5.8).


### Each stage is a fresh Copilot Chat

Context is cleared between stages on purpose. To start a fresh stage:

- Click **+ New Chat** in the Copilot Chat panel (or `/new`), OR
- Open a second VS Code window for the build, OR
- Use **git worktrees** (recommended for Standard+ orchestrator/build split — see §5.5).

The new chat re-reads `.github/copilot-instructions.md` automatically (it's project-scoped instructions, always injected).

### Verify orientation loaded

The agent's first response should include `[orientation loaded: mode=<...>, N files]`. If it doesn't, type:

> Read your instructions file and the framework orientation as your first action, then echo the orientation-loaded stamp.

Without that stamp, the stage runs on stale or partial context. Don't proceed.

### Paste the stage's XML prompt

For **Standard / Full tier**:

1. Open the Phase doc — `docs/build-prompts/M01-<title>.md`.
2. Find the current stage's section (e.g., `### A.5 CLI Prompt`).
3. Copy the fenced ` ```xml ` block.
4. Paste it into the chat.

For **Lite tier**: just say *"let's start M01"* — Lite uses markdown task lists, not XML stage prompts.

### The work loop — three gates (Standard+ default, `red_review: on`)

The agent runs the same three-gate per-stage loop as the CLI track. Honor-system in Copilot — the framework's `.claude/hooks` don't fire here — but the shim instructs it explicitly:

- **Gate 1 — plan.** Agent states deliverable + test plan, waits. Confirm.
- **Gate 2 — red-stop.** Agent writes the failing tests, confirms they fail for the right reason, then **stops and surfaces the test files for your review** before implementing to green. Approve the test design (or send back). Catches shallow/wrong-contract tests at the cheapest moment — especially valuable on Haiku.
- **Gate 3 — stage-end.** Agent implements to green, runs gates (VS Code shows each command — approve before run), fills the retrospective including a required **user friction stamp you fill** (`verdict: pass|fail` + an optional sentence — the independent check on the agent's self-grade; default is pass, an explicit fail forces Friction-heavy), and surfaces: diff + gate results + retro + draft commit. *"I will not commit until you approve."*

Writes/edits land through VS Code's per-edit Apply/Discard UI — that's the do-not-commit gate at a different layer. Review the bundle. If good: tell the agent to commit (or commit yourself via Source Control). Do **not** allow the agent to commit before you've reviewed and approved.

For new stages, use the slash-style invocation the shim teaches: type `Stage M01 A` (no slash — Copilot doesn't run `.claude/commands/`); the shim instructs Copilot to open the M01 Phase doc, extract the §A.5 block, and run it. Same for `Verify M01` and `Closeout M01` (closeout surfaces the explicit *continue / ship v1 here / pause to re-tier* choice — Copilot doesn't silently default to "continue").

Open a new chat for the next stage and repeat.

### 5.5 The two roles in Copilot (Standard / Full only)

The framework splits the agent into two session types at Standard+. In Copilot, that maps to two Chats:

**Topology D from `ORCHESTRATOR.md` §1 — canonical for Standard+ on Copilot.** Two VS Code windows, each with its own Copilot Chat. The build window opens on a `git worktree` of the milestone branch. Shared `.git`, isolated working trees, no file-race risk.

Set up from the repo root:

```
git worktree add ../build-wt <milestone-branch>
```

Then open each window via **File → Open Folder** (not `code .` — see §1's workspace-mode caveat). Orchestrator window: open the kit's main checkout. Build window: a second VS Code window on `../build-wt`.

Each window has independent VS Code state (editor tabs, terminal) and an independent Copilot Chat with its own context. The build window's commits become visible to the orchestrator immediately (shared `.git`). You are the conduit — copy surfaces from the build chat to the orchestrator chat and decisions back, by switching windows. Only one role acts at a time.

(Topologies A, B, C in `ORCHESTRATOR.md` §1 are Claude-Code-specific and don't apply in Copilot.)

### 5.6 Mode-aware reading (honor-system)

The framework has three modes — **work**, **verifier**, **orchestrator** — each with its own read-first list at `.claude/read-first-list*.txt`. In Claude Code the SessionStart hook switches automatically; **in Copilot you tell the agent which mode at the start of each chat**:

- **Work / build session** — your default. Say nothing special; the shim instructs the agent to read `.claude/read-first-list.txt`.
- **Verifier session** (Standard+ only) — start the chat with: *"This is a verifier session. Read `.claude/read-first-list-verifier.txt` only. Do NOT read prior retrospectives — that is the bias guard."* The agent then loads the verifier list and asks for the V.5 prompt.
- **Orchestrator session** (Standard+ only) — start with: *"This is an orchestrator session. Read `.claude/read-first-list-orchestrator.txt`, including `ORCHESTRATOR.md`."*

Verify each by checking the `[orientation loaded: mode=<...>, model=<...>]` stamp.

### 5.7 Invoking a stage without slash commands

Claude Code can use `.claude/commands/`; Copilot can't. The shim teaches the agent a plain convention: type **`Stage M01 A`** and the agent opens `docs/build-prompts/M01-*.md`, finds the §A.5 prompt, and runs it as if pasted (after orientation). `Verify M01` → the verifier prompt; `Closeout M01` → the closeout prompt. You can still paste the raw XML if you prefer — both work.

### 5.8 Orchestrator is stateless here; watch the model

Two Copilot-specific realities the shim encodes:

- **Stateless orchestrator.** Copilot Chat doesn't persist reliably, so the orchestrator is spawn-from-artifacts: each consultation is a fresh chat that reads the artifacts (`gap-analysis.md`, prior retros, the Phase doc, `docs/consultations.md`), answers, and logs the decision back to `docs/consultations.md`. The ledger is the memory. (In Claude Code the orchestrator is a long-lived `--resume` session — that's the one real behavioral difference between the hosts.)
- **Model can change under you.** When Opus credits run out, Copilot may fall back to Haiku silently. The orientation stamp now includes `model=`; if a heavy-reasoning step (spec, design.md, Phase doc, any verifier pass, closeout) is running on Haiku, the agent will flag it — defer until credits replenish or accept lower quality and re-run. Author the heavy artifacts early in a credit cycle.

---

## 6. Optional — replace the shim with a symlink for max fidelity

The shim ships ~30 lines of load-bearing rules + orientation directives. For most projects that's enough. If you want Copilot to auto-inject the **full `CLAUDE.md` content** as system context (more tokens per chat; max-fidelity context with zero further reads), replace the shim with a symlink. Per OS:

**macOS / Linux:**

```
rm .github/copilot-instructions.md
ln -s ../CLAUDE.md .github/copilot-instructions.md
```

**Windows (PowerShell, run as Admin or with Developer Mode on):**

```
Remove-Item .github\copilot-instructions.md
New-Item -ItemType SymbolicLink -Path .github\copilot-instructions.md -Target ..\CLAUDE.md
```

**Windows (cmd, no symlink — copy instead):**

```
del .github\copilot-instructions.md
copy CLAUDE.md .github\copilot-instructions.md
```

The copy approach works everywhere but you must `copy` again whenever `CLAUDE.md` changes. The symlink tracks updates automatically.

**Trade-off:** the symlink/copy injects ~3–6KB more context on every chat (the full `CLAUDE.md`), at the benefit of one fewer read step. The shim is the safer default — keep it unless you have a specific reason to swap.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Claude doesn't appear in the model picker | Org admin hasn't enabled Claude for your Copilot org, OR your subscription tier doesn't include it | Ask your admin to enable Claude models in the Copilot admin console. On personal Copilot, upgrade to Pro or higher. |
| No `[orientation loaded: ...]` line in the first response | The shim wasn't picked up | Confirm `.github/copilot-instructions.md` exists at the repo root. Run `/help` in Copilot Chat to confirm instruction files are being loaded. If still nothing, paste the contents of `.github/copilot-instructions.md` into the chat manually as a first message. |
| Agent edits files without showing a diff | You're not in Agent Mode | Switch the chat-mode dropdown to **Agent**. The default "Ask" mode answers questions without editing. |
| Agent ran `git commit` without asking | G1 violation | Stop. Check `git log`. In VS Code Agent Mode the terminal-command approval should have caught this — if it didn't, file a Copilot bug. The framework's most important rule failed; investigate before continuing. |
| Mode reads are wrong (verifier session read retros) | Honor-system mode-aware reading was skipped | Open a new chat. State the mode explicitly in the first message; verify the `mode=<...>` stamp matches. |
| `git clone` says destination not empty | Target dir exists with files | See `QUICKSTART.md` §1 — three scenarios. |
| `node: command not found` (Windows) | Node not on PATH | Install Node.js (https://nodejs.org), reopen the terminal. Needed by the validator + the kit's CI. |

---

## 8. Where everything is — the file map

Read these when you need them. The shim handles auto-loading the essentials; the rest is reference.

### Start here

| File | Read it for |
|---|---|
| `QUICKSTART-COPILOT.md` (this file) | The Copilot path |
| `WALKTHROUGH-COPILOT.md` | A complete Standard-tier build narrated for Copilot in VS Code. Artifacts at `examples/task-cli-standard/artifacts/`. Intro / how-to-read at `EXAMPLE.md`. |
| `HOW-IT-WORKS.html` | Visual overview — open in a browser |
| `README.md` | Full prose overview |

### The Copilot-specific files

| File | Read it for |
|---|---|
| `.github/copilot-instructions.md` | The shim Copilot auto-loads — the load-bearing rules + orientation directives |
| `templates/dot-github/copilot-instructions.md` | The shim template the bootstrap installs into your projects |

### The methodology + the entry point + enforcement

Same as `QUICKSTART.md` §7 — `CLAUDE.md`, `BUILD-PLAYBOOK.md`, `FRAMEWORK-CONFIG.md`, `STAGE-PROMPT-PROTOCOL.md`, `PROCESS-VALIDATION.md`, `persistence-architecture.md`, `templates/PROJECT-CLAUDE.md`, `templates/ORCHESTRATOR.md`, `templates/CALIBRATION-INTERVIEW.md`, `validators/`, `proposals/`. See `QUICKSTART.md` for the full grouped map; everything there applies in Copilot too except the Claude-Code-specific `.claude/` SessionStart hook (which Copilot doesn't run).

---

## 9. The one rule that never changes

In every tier, every mode, every host: **the agent does not commit without your explicit approval.** In Copilot's Agent Mode that rule is reinforced structurally by VS Code's per-edit and per-command approval UI — but the discipline holds regardless. If it ever breaks, stop and investigate. It is the guarantee the entire framework rests on.
