<h1 align="center">Software Build Assurance Kit</h1>

<p align="center">
  <strong>Wrap a coding agent in controls you can check - test-first gates, a second agent that reviews the first one blind, and an evidence trail bound to real commits.</strong>
</p>

<p align="center">
  <a href="https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml"><img src="https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
  <a href="RELEASE-NOTES.md"><img src="https://img.shields.io/badge/status-GA%20v1.0.7-green" alt="Status: GA v1.0.7"></a>
  <a href="https://slsa.dev/spec/v1.0/levels"><img src="https://img.shields.io/badge/SLSA-Level%202-blue" alt="SLSA Level 2"></a>
</p>

---

## What problem does this solve?

AI agents write a lot of code, and the hard part is no longer getting code written - it is knowing whether what got written is the thing you asked for, and being able to show your work later.

This is a drop-in kit that wraps a coding agent in controls you can check. It gives an agent armed with a build spec: oversight, test & build approval gates, a second agent that reviews the first one blind, and an evidence trail bound to real commits. The agents do not have to be perfect. The process has to make a red visible.

## How it looks

![Build for the next hundred commits - test-first gates, fresh-context verification, durable memory, receipts: the orchestrator and the human gate relay plan, red-test, and close decisions into a fresh build/verify/refactor session, and everything lands in the durable record of contracts, decisions, findings, and receipts](docs/assets/sbak-readme-light.png)

- **[HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html)** - the visual overview. A few minutes, in your browser.
- **[example-receipt.html](example-receipt.html)** - what the output looks like on real work. The kit was built with its own process, and this receipt is derived from real commits, findings, and rework, not a staged demo.
- **[WHY-THIS-KIT.md](WHY-THIS-KIT.md)** - deciding if it's worth your evening? Two pages, honest costs.
- **[RELEASE-NOTES.md](RELEASE-NOTES.md)** - this is the v1.0.7 GA release: exactly what is claimed, what is not, and the notes for both.

## How it works

The unit of work is a **stage**. A milestone is a few stages; a project is a few milestones. At the default tier the kit runs as two CLI sessions in two windows. They exchange stage packets over a channel in your repository; every approval waits for your keystroke.

## A Walk: From Boot Through Your First Stage Loop


https://github.com/user-attachments/assets/7c0f1bc6-f077-466c-b49e-8e2c593f88ac



```
  bootstrap session ─ what you want to build ─ project scaffold ─ retires
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
   ORCHESTRATOR terminal      ── the channel ──   BUILD terminal
   plans, adjudicates,        packets travel      one fresh session per stage
   never edits code           automatically;
                              you approve         1. Read    a short stamp; files
                                                             read when a step needs them
                                                  2. Plan    stage plan, then approval
                                                  3. Red     failing tests first; a hook
                                                             blocks implementation until
                                                             you approve them
                                                  4. Green   implement until the gate
                                                             line is clean
                                                  5. Commit  stage done, session ends
            └─────────────────────┬─────────────────────┘
                                  │
                     VERIFIER   a fresh session with no memory of the build;
                                must pass a seeded-defect calibration before
                                its findings are counted
                     REFACTORER at milestone boundaries, when the tech-debt
                                ledger crosses its threshold
                     CLOSEOUT   ledgers reconciled against the milestone's own
                                commits, plus a retrospective - you stamp it
```

Not a hosted service and not an agent runner. It is files in your repository, running wherever your agent runs, and **nothing leaves your machine until you explicitly say "push" or "open the PR"** - those are single, separate approvals near the end of a run. Until then, everything is local.

Step-by-step detail is under [The stage loop](#full-documentation) below.

## Installation

**Prerequisites, exactly:** **Node.js 22 or newer** (the only runtime the validators and hooks need), **git**, and a coding agent - Claude Code for the fully enforced path; GitHub Copilot works too, with one copy step creating the auto-load shim. `gh` only if you want the attestation check. The kit itself is stack-agnostic.

**Recommended:** download **`sbak-install.cjs`** from the [releases page](https://github.com/kknipe2k/Software-Build-Assurance-Kit/releases) into the directory the kit should live in - a blank folder for a new project, or the root of an existing repo. The script is attested with the release; its `.sha256` is beside it. The signed ZIP stays available as the manual path (below, under "Install and download, in full").
Recommended Path Video:


https://github.com/user-attachments/assets/4e4f279b-f0be-4020-ab35-0aa5d90f17ef



## Quickstart

Put `sbak-install.cjs` in the target directory - the directory you run in is the directory that gets written to, so give the project a real home, not `Downloads`.

**1. Start the session in that directory and type the one word.**

```
export CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1
claude
```

Windows: `set CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` in cmd, `$env:CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP="1"` in PowerShell, in place of the `export` line.

```
sbak-install
```

**Result:** the script carries its own instructions; Claude reads them and runs it one step at a time. It names the download URL and where the ZIP will land, shows you the checksum and attestation result, and asks `OK to proceed? Type install, list, or no` - `list` shows every file first. Every question ends with the exact word to type. On an existing repo you get a blast-radius report (collisions, what the kit's files would sit next to, the detected stack) to talk through before that proceed. Nothing is written before your word. It creates the git repo if there is none, runs the adopt step, and prints `Done` with the hooks live. Stay in this window: in the same session, Claude asks what you want to build. The protected writes are done, so switch back to auto mode (Shift+Tab).

**Permissions:** the install writes `.claude/` and `.git`, which Claude Code never approves on its own. If your session is in auto mode, press Shift+Tab until the mode indicator reads Manual and approve each step with a click.

**2. Say what you want.**

Your answer can simply be what you want - *"fix a bug"*, *"add a feature"*, *"build something new"* - or just `go`.

**Result:** the kit infers the kind of work, derives the risk posture from the spec, and shows the whole calibration as one acceptance line - `Full / <mode> / risk triggers: <list> [type accept; a mode word or trigger token corrects it]` - type `accept`, or type a correction. The kit then writes your project's scaffold, and from then on every session inherits the same rules automatically.

### Verify your install

- [ ] The installer printed `Done` and the adopt step reported `adoption COMPLETE` (exit 0).
- [ ] Claude asked what you want to build in the same window, with no restart. The `[read-first stamp]` line starts every session after this one.
- [ ] You said what you want to build and got the acceptance line.

If the adopt step exited non-zero it says why: exit 1 is `ADOPTION INCOMPLETE` - the missing control is **named**, with a `repair:` command that runs as printed; exit 2 is a usage or fail-closed refusal. An incomplete install cannot silently look complete, and nothing downstream may read a non-zero adopt as armed. Re-running `--adopt` is always safe; a clean re-run changes nothing.

**Upgrading** an installed kit is the same command: `sbak-install` inside `claude`. The report becomes an upgrade report (installed vs pinned version, what changes under `sbak/`), a single proceed question, nothing written before your word, and the previous version stays in git history. `sbak/` and the live kit files refresh; files you modified are kept and named; the bootstrap-filled files (the pre-commit hook and `verify-local`) stay at the installed version and are named - migrate them by hand until `kit-update --migrate` lands.

**Need more detail?** Full documentation is below, or see [QUICKSTART.md](sbak/QUICKSTART.md) §1 - which also covers the manual ZIP path, adopting into an existing repo, and the clone alternate.

---

## Full documentation

<details>
<summary><strong>What this is</strong></summary>

A set of documents, hooks, validators, and scripts you copy into a project/repo. They give an agent session a fixed shape: read the spec, write a failing test, get a human to look at the failing test, write the code, hand the result to a second agent that starts with no memory of the first, fix what it finds, then write down what happened.

Three things hold that shape in place, and none of them is a document the agent can skip:

- **The gates are mechanical, and they are tested like code.** Most process frameworks are prose, and agents demonstrably ignore prose. Here the floors are the shipped validators, 4 session hooks, and committed git hooks that run before a commit lands. The enforcement layer has its own regression suite in the development repository, and `sbak/scripts/bake-inheritance.cjs` ships as the proof a reader can run: it renders a real project and a planted defect must fail a baked gate. Presence is never taken for effectiveness.
- **The reviewer starts blind, and has to prove it can see.** Every milestone ends with a verifier session whose read-first list structurally omits the builder's notes - a bias guard the hooks enforce rather than a convention. Before its findings count for anything, it must find every defect in a set of deliberately seeded ones. A verifier that rubber-stamps is caught by construction, not by trust.
- **The ceremony is priced, chosen, and revisable.** Full is the default tier. You can move up or down later by telling the orchestrator, who edits one file and logs why. Nothing about the tier is baked into the code.

The result is a build that can tell its own story: what was decided, what broke, what was fixed, and what remains unknown - with unknowns shown as unknown rather than rounded to zero.

</details>

<details>
<summary><strong>What this isn't</strong></summary>

- **Not a hosted service or an agent runner.** It is files in your repository. It runs wherever your agent runs.
- **Not a guarantee that agents stop making mistakes.** It is the set of controls that make a mistake visible and fixable while it is still cheap.
- **Not a replacement for tests, review, or judgment.** It assumes you have those and gives them a place to stand.
- **Not a sandbox.** The generated permission fence denies secret reads and irreversible commands at the agent's tool layer, but a subprocess the agent spawns can still read a file on disk or make changes you don't want. The fence raises the bar; the real backstops are secrets kept off disk and the OS sandbox and your judgement.
- **Not audited.** This framework was generated for the most part by Claude with human guidance - but no human security review has been performed on this code. See [SECURITY.md](SECURITY.md).

</details>

<details>
<summary><strong>When not to use it</strong></summary>

When to skip this kit. If the overhead will cost you more than it returns:

- **If the work fits in an afternoon.** The measured evidence is unkind here: a spec-driven rebuild of a small task ran roughly ten times slower for no quality gain. Here iterate in a plain session instead.
- **If the code is throwaway.** The ceremony and audit trail pays off when the expected outcome is useful - or if someone must reconstruct *why* a decision was made. No future, no payoff.
- **If you will not actually review the work.** You do not need to read the code - but the gates assume a human who stamps each stage has read the builder agent's review and orchestrator comments and run any live testing. Rubber-stamp them and you keep all of the ceremony and lose the one control that makes it work. You.

There is no guarantee that a heavyweight process framework beats a concise `CLAUDE.md` plus tests plus code review. This kit is a bet on mechanical floors and independent verification, priced by tier. It is a reasoned bet, not a proven one.

**However, the idea is that you will gain an application that is working at the end of the process with better structured code, audit trail, and less time on the back-end fixing things. So weigh the trade-offs.**

</details>

<details>
<summary><strong>The stage loop, step by step</strong></summary>

At Full tier (the default), the kit runs as **two separate CLI sessions in two separate windows**. They never share a context. They talk through **the channel** - an append-only log in your repository over which stage packets (stage open, the plan, the red-stop, the stage-end, the verdicts) are picked up automatically in both directions. **Approvals are never automated:** the RED release and the commit approval are your keystrokes, and nothing is sent to the builder until you type `/send`.

At start you open one window - the **bootstrap session**. It asks what you want to build, plans the project with you, and scaffolds the files - then it retires, and its last act is walking you through opening the two windows that run the build. The channel starts at that split; until then, anything that has to move between windows moves by hand.

The first is the **orchestrator** - a long-lived coding partner that directs the work, builds each milestone doc and ensures adherence to the kit's policy. This terminal does not code or write (generally). You put it on listen for a stage with `/listen`, and the builder's packets wake it.

The second is **the build terminal**, which hosts the short-lived working sessions: a fresh **builder** session per stage - **the coder/tester/writer** - and, when the stage work is done, a separate fresh **verifier** session that reviews it blind (the two never share a context). The verifier and refactorer sessions use the same channel.

**You sit between the terminals as the decision-maker**, not the courier: you adjudicate what the orchestrator surfaces, release each gate, and run any live testing the orchestrator directs.

**The relationship between user and orchestrator is best thought of as that between a lead engineer and CEO. The user is free to ask anything, change anything** - the orchestrator will adjudicate and prepare the prompt, and your `/send` carries it to the build terminal.

(At Lite tier the roles collapse into one session - no second terminal, and the channel commands do not ship.)

After bootstrap each stage is generally run the same:

1. **Read.** A session-start hook prints a short stamp naming the session's role and its reading list. The files themselves are read at the moment a step needs them, and each read is recorded; a stage cannot open its red gate on reads that never happened.
2. **Stage Plan.** The build agent writes the plan for the entire stage. The plan travels the channel to the orchestrator for adjudication. Once approved, the orchestrator writes the approval prompt and your `/send` carries it to the build terminal to start.
3. **Red.** The agent writes failing tests first. A hook blocks it from touching implementation files until the test summary has reached the orchestrator, been reviewed, and you have released the gate. This is the one control that stops a test being written to fit code that already exists.
4. **Green.** The agent implements until the test passes and the gate line is clean.
5. **Commit.** Once the stage is complete and clean, the orchestrator reviews and, once fully approved, recommends the commit. Once the build commits, that stage is done. That build session is complete and claude is exited from the terminal.
6. Repeat for all standard build stages with a new build session each time.

After the standard build stages complete, a new session opens in the build terminal:

7. **Verify.** A separate session, with no memory of the build, reviews the work. It must pass a seeded-defect calibration before its findings are counted.

After verification completes, a final closeout session opens in the build terminal:

8. **Closeout.** Findings, fixes, and rework land in append-only ledgers and a retrospective. You stamp it pass or fail; a fail is expensive on purpose.

**At every step the results reach the orchestrator over the channel for review and conversation with you. Once accepted, the orchestrator prepares a prompt for the builder to fix something or to approve the gate and move forward, and your keystroke sends it.**

A milestone ends with **closeout** - the ledgers reconciled against the milestone's own commits, a summary the next milestone reads, and (in some cases when the trigger fires) the fourth role: the **refactorer** runs at milestone boundaries, after the verifier, when the tech-debt ledger crosses its threshold count or the milestone interval elapses - whichever comes first - asking "is the code maintainable?" under the strictest read-first bias guard in the kit. Lite Tier skips this process.

Four operating modes reuse that loop at different shapes: `greenfield` (build something new), `bug_fix` (reproduce, fix minimally, verify once), `audit` (review an existing codebase and produce findings, not code), and `research_publish` (synthesize sources into a paper and an illustrative app).

The gate line is 16 hard gates and 5 soft ones. Stage prompts are XML and validated against a published protocol (currently protocol v1.9), so a malformed stage cannot enter the loop. There are 5 schemas covering the stage kinds.

Once you're building, [STAGE-LOOP.md](sbak/STAGE-LOOP.md) covers how each session re-orients and how a stage actually runs.

</details>

<details>
<summary><strong>Where are the agents?</strong></summary>

They're roles, not files. The kit runs your coding assistant as four distinct agents - orchestrator, builder, verifier, refactorer - each a separate session with its own read list, its own permissions, and its own job: the builder writes the failing tests first, and a hook blocks it from touching implementation until a human approves them; the verifier starts blind - it structurally cannot see the builder's notes, and must catch every seeded defect before its findings count; the orchestrator plans and never edits code; the refactorer reads under the strictest bias guard.

One agent has a standing manual (the orchestrator). The rest are built per stage from shipped parts - a role file, a read list the hooks compose, and a stage prompt the orchestrator writes and a validator checks. No complete agent definitions ship because your assistant supplies the agent; the kit supplies the roles and the walls between them. What makes most multi-agent setups fragile is that the separation is a suggestion; here it's a hook that says no.

</details>

<details>
<summary><strong>Harnesses - what runs where</strong></summary>

| Host | What runs |
|---|---|
| **Claude Code** | Everything: session hooks, red-gate, role enforcement, the slash commands (`/stage`, `/verify`, `/refactor`, `/closeout`, `/on-track`, `/approve-red`, `/listen`, `/send`), the channel, plus the git-hook + CI layer. |
| **GitHub Copilot** | One copy step creates the auto-load shim ([QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md) §1); the git + CI enforcement is real, the session hooks, slash commands and channel don't run - you carry packets between windows by hand. The installer needs `claude`; use the ZIP path. |
| **Codex / others** | Untested - the git + CI layer is plain Node and should run; the session-layer enforcement will not. |

The real shape of that table: **picking a Claude model inside another host does not make it Claude Code.** The model changes; the harness doesn't - and the session hooks belong to the harness. In any other host besides Claude Code the framework still works: the roles, the red-first discipline, and every artifact are instructions the agent is asked to follow - but honor-system instead of mechanically enforced. Two layers stay mechanical in every host, because they sit below the session: the git hooks (pre-commit / pre-push validators) and CI run no matter what wrote the commit. If you have Claude Code installed, running `claude` in your editor's integrated terminal is the fully enforced path.

</details>

<details>
<summary><strong>The tiers</strong></summary>

Pick by the highest of complexity, time horizon, and audit needs. Re-tier whenever, by editing one file and logging the reason.

| Tier | For | Scaffold files | Approvals | Retrospective | Ledger | Review cost per stage |
|---|---|---|---|---|---|---|
| **Lite** | Under a week, low audit needs | 53 | per pull request | brief paragraph | changelog only | ~10 min |
| **Full** (default) | a second reader, an audit need, or a multi-week horizon | 120 | per stage | process + product | append-only advisory; CI-enforced when a risk trigger is declared | ~30 min |

Declaring a risk trigger at calibration arms CI enforcement of the append-only ledger and adds 3 files to the scaffold.

The generated project's verification floor runs in three lanes over one registry: `fast` on every push, `stage` at a stage boundary, `release` as the complete floor. Only the full floor is release evidence.

Details and every toggle: [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md).

**The overhead is real.** In a controlled two-arm trial on a small **solo** markdown-to-HTML CLI, the framework arm ran **over 10× the cost and time** of a lightweight control loop, and the trial's own ratified adjudication called out two missed thresholds, adaptability and economic justification **for that project class** (it passed the other four, including one evidence-bound prevented defect). If your project looks like that one, you are betting that the coding quality and outcome are worth the added overhead; see [WHY-THIS-KIT.md](WHY-THIS-KIT.md) and [limitations.md](docs/limitations.md). The full trial record is not part of this release; the measured figures are in [WHY-THIS-KIT.md](WHY-THIS-KIT.md).

</details>

<details>
<summary><strong>Already running the kit? The steady state</strong></summary>

Skip the bootstrap entirely: run in terminal `node scripts/set-mode.cjs orchestrator`, then `claude`, and tell the orchestrator what you want - *"Author the next milestone - \<your feature\>."* That one line is the steady state of the whole framework.

</details>

---

## Advanced topics

<details>
<summary><strong>What's in the box</strong></summary>

The ZIP - and the `sbak/` payload of this repository, which is the same set - is 206 files (the count and every row below are derived from the release manifest's assembled inventory, not hand-tallied):

| Directory | Files | What it is for you |
|---|---|---|
| `sbak/templates/` | 114 | Copied into your project by the bootstrap; never read here. |
| `sbak/prompts/` | 23 | The verifier's seeded-defect exam; runs itself. |
| `sbak/validators/` | 29 | Enforcement (the project-floor validators plus mode-specific and append-only checkers, `lib/`, and docs); CI runs it. |
| `sbak/scripts/` | 18 | You run 2–3, read none. |
| `sbak/` root docs + `sbak/bootstrap/` | 21 | The methodology spine, the bootstrap playbooks, and the topology image; you read none to start. |
| `CLAUDE.md` (ZIP root) | 1 | The agent's bootstrap instructions - auto-loaded, not for you. |

The installer, `sbak-install.cjs`, is a release asset beside the ZIP, not a file inside it. CI and release automation (`.github/`) live in this repository only - they are not part of the ZIP. Most of these files are the product: templates the bootstrap copies into your project, and validators that keep it honest. You read one file to start - this one. The whole kit is about 2 MiB.

</details>

<details>
<summary><strong>What's verified</strong></summary>

The CI badge above is not decoration. On every push and pull request, this repository runs its own enforcement layer against itself:

- the stage-prompt schema check, over every phase document;
- an enumeration check proving every shipped validator is catalogued everywhere that claims to list them;
- the seeded-defect calibration set, checked in both directions: no fixture may carry a verdict token, and every fixture must have a complete sealed label the verifier never reads;
- a self-description check proving the numbers on these pages match the code they describe;
- the golden scaffold check - a template edit cannot silently change what a bootstrapped project receives;
- a bake harness that renders a real project and proves the inherited gates *fire* there: it plants a violation and requires the baked validator to reject it.

Release artifacts are built from a signed tag, not a working tree, and carry build provenance at SLSA Level 2 - the ZIP and the installer both. The same tag always produces the same archive hash. No human security audit is claimed.

</details>

<details>
<summary><strong>Install and download, in full</strong></summary>

**Recommended:** download `sbak-install.cjs` from the releases page into the target directory, start `claude`, type `sbak-install` - the script does the verification below for you and asks before writing.

**Manual:** download `sbak-v1.0.7-starter.zip` and its `.sha256` and verify before you unpack - the `.sha256` checksum, and stronger, `gh attestation verify sbak-v1.0.7-starter.zip -R kknipe2k/Software-Build-Assurance-Kit` (SLSA build-provenance attestation). Run these from the folder the ZIP downloaded to, and replace `<projects-path>` with wherever you keep code:

macOS / Linux:

```
unzip sbak-v1.0.7-starter.zip -d <projects-path>/my-project && cd <projects-path>/my-project
git init
node sbak/templates/scripts/kit-update.cjs --adopt
export CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1
claude
```

Windows (cmd):

```
mkdir <projects-path>\my-project
tar -xf sbak-v1.0.7-starter.zip -C <projects-path>\my-project
cd <projects-path>\my-project
git init
node sbak\templates\scripts\kit-update.cjs --adopt
set CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1
claude
```

Windows (PowerShell):

```
mkdir <projects-path>\my-project
tar -xf sbak-v1.0.7-starter.zip -C <projects-path>\my-project
cd <projects-path>\my-project
git init
node sbak\templates\scripts\kit-update.cjs --adopt
$env:CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP="1"
claude
```

(The `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP` line keeps Claude Code from stopping the kit's background channel watcher when memory runs low; Claude Code reads it only at launch, so it goes on its own line before `claude`.)

The adopt step verifies itself, and its exit code is the contract: exit 0 means adoption COMPLETE and it prints exactly that; anything less exits non-zero and says why.

**Already have a project?** The installer hands you the blast-radius report before it writes. On the manual path, unzip the ZIP into that repo - the only collision is `CLAUDE.md` - then run the adopt step. The directory you run in is the directory that gets written to.

**Prefer to clone?** The clone alternate (same rule - give it a real home):

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git <projects-path>/my-project
cd <projects-path>/my-project
node sbak/templates/scripts/kit-update.cjs --adopt
export CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1
claude
```

Windows: `set CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` in cmd, `$env:CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP="1"` in PowerShell, in place of the `export` line.

One heads-up on that path: `origin` still points at the kit's repository until the bootstrap resets it at handoff - don't `git push` before then (it would target the kit, not your project). Detail: [QUICKSTART.md](sbak/QUICKSTART.md) §1.

Using GitHub Copilot in VS Code rather than Claude Code? Start at [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).

</details>

<details>
<summary><strong>The doc map - if you want the background</strong></summary>

The only file you should read before starting is this Readme - saying what you want to build does the rest. And you don't need to study the rest to proceed: **ask instead of reading**. The session you open has full visibility of the kit's docs and your repo - once your project is running, that session is the orchestrator - so any "what now / how do I / where is" question gets answered in-session, with the right doc quoted when it matters. The order below is for when you *want* the background:

1. **This README** - what the kit is, what it isn't, when not to use it.
2. **[example-receipt.html](example-receipt.html)** - what the output looks like on real work.
3. **[WHY-THIS-KIT.md](WHY-THIS-KIT.md)** - the costs and the evidence, both directions. Read it if you're deciding; skip it if you're sold.
4. **[QUICKSTART.md](sbak/QUICKSTART.md)** - get it running; its "Just get going" section is the whole start. On Copilot in VS Code instead, use: [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).
5. **[HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html)** - the visual overview.
6. **[STAGE-LOOP.md](sbak/STAGE-LOOP.md)** - once you're building: how each session re-orients and how a stage actually runs, step by step.

Everything else under [sbak/](sbak/) - [BUILD-PLAYBOOK.md](sbak/BUILD-PLAYBOOK.md), [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md), [PROCESS-VALIDATION.md](sbak/PROCESS-VALIDATION.md), [STAGE-PROMPT-PROTOCOL.md](sbak/STAGE-PROMPT-PROTOCOL.md), [persistence-architecture.md](sbak/persistence-architecture.md) - is the methodology spine: **the agent's reading, not yours.** Dip in when a specific question sends you there (a toggle, a gate, a schema); no need to read them front to back.

</details>

---

## Feedback and issues

Development happens in a private repository and this is a published snapshot, so pull requests are not the model. **Issues are read and reviewed; no response time is promised.** Bug reports, false greens, and bootstrap failures are the most useful thing you can send. Read [CONTRIBUTING.md](CONTRIBUTING.md) before filing.

To report a security vulnerability, do not open an issue - see [SECURITY.md](SECURITY.md).

## License

MIT. Copyright (c) 2026 Kurt Knipe. See [LICENSE](LICENSE).
