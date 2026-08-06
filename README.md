<h1 align="center">Software Build Assurance Kit</h1>

<p align="center">
  <a href="https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml"><img src="https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
  <a href="RELEASE-NOTES.md"><img src="https://img.shields.io/badge/status-GA%20v1.0.4-green" alt="Status: GA v1.0.4"></a>
  <a href="https://slsa.dev/spec/v1.0/levels"><img src="https://img.shields.io/badge/SLSA-Level%202-blue" alt="SLSA Level 2"></a>
</p>

![Build for the next hundred commits - test-first gates, fresh-context verification, durable memory, receipts: the orchestrator and the human gate relay plan, red-test, and close decisions into a fresh build/verify/refactor session, and everything lands in the durable record of contracts, decisions, findings, and receipts](docs/assets/sbak-readme-light.png)

A drop-in kit that wraps a coding agent in controls you can check. AI agents write a lot of code, and the hard part is no longer getting code written - it is knowing whether what got written is the thing you asked for, and being able to show your work later. This kit gives an agent armed with a build spec: oversight, test & build approval gates, a second agent that reviews the first one blind, and an evidence trail bound to real commits. The agents do not have to be perfect. The process has to make a red visible.

## Orientation

**Want to see it first?** Open [HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html) - a few minutes, in your browser.

**Deciding if it's worth your evening?** [WHY-THIS-KIT.md](WHY-THIS-KIT.md) - two pages, honest costs.

**Want to try it?** For most users the recommended path is the signed release ZIP - download **`sbak-v1.0.4-starter.zip`** from the [releases page](https://github.com/kknipe2k/Software-Build-Assurance-Kit/releases), verify it (the `.sha256` checksum and, stronger, `gh attestation verify` - SLSA build attestation), unzip, then run the adopt step. Full steps: [QUICKSTART.md](sbak/QUICKSTART.md) §1.

**This is the v1.0.4 GA release** - See [RELEASE-NOTES.md](RELEASE-NOTES.md) for exactly what is claimed, what is not, and the notes for both.
The kit was built with its own process - [its own build receipt](example-receipt.html) is derived from real commits, findings, and rework, not a staged demo.


## Read First

The only file you should read before starting is this Readme - the kit's interview does the rest. And you don't need to study the rest to proceed: **ask instead of reading**. The session you open has full visibility of the kit's docs and your repo - once your project is running, that session is the orchestrator - so any "what now / how do I / where is" question gets answered in-session, with the right doc quoted when it matters. The order below is for when you *want* the background:

1. **This README** - what the kit is, what it isn't, when not to use it.
2. **[example-receipt.html](example-receipt.html)** - what the output looks like on real work.
3. **[WHY-THIS-KIT.md](WHY-THIS-KIT.md)** - the costs and the evidence, both directions. Read it if you're deciding; skip it if you're sold.
4. **[QUICKSTART.md](sbak/QUICKSTART.md)** - get it running; its "Just get going" section is the whole start. On Copilot in VS Code instead, use: [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).
5. **[HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html)** - the visual overview.
6. **[STAGE-LOOP.md](sbak/STAGE-LOOP.md)** - once you're building: how each session re-orients and how a stage actually runs, step by step.

Everything else under [sbak/](sbak/) - [BUILD-PLAYBOOK.md](sbak/BUILD-PLAYBOOK.md), [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md), [PROCESS-VALIDATION.md](sbak/PROCESS-VALIDATION.md), [STAGE-PROMPT-PROTOCOL.md](sbak/STAGE-PROMPT-PROTOCOL.md), [persistence-architecture.md](sbak/persistence-architecture.md) - is the methodology spine: **the agent's reading, not yours.** Dip in when a specific question sends you there (a toggle, a gate, a schema); no need to read them front to back.

## Contents

- [What this is](#what-this-is)
- [What this isn't](#what-this-isnt)
- [When not to use it](#when-not-to-use-it)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [Where are the agents?](#where-are-the-agents)
- [Harnesses](#harnesses)
- [The tiers](#the-tiers)
- [What's in the box](#whats-in-the-box)
- [What's verified](#whats-verified)
- [Install and download](#install-and-download)
- [Feedback and issues](#feedback-and-issues)
- [License](#license)

## What this is

A set of documents, hooks, validators, and scripts you copy into a project/repo. They give an agent session a fixed shape: read the spec, write a failing test, get a human to look at the failing test, write the code, hand the result to a second agent that starts with no memory of the first, fix what it finds, then write down what happened.

Three things hold that shape in place, and none of them is a document the agent can skip:

- **The gates are mechanical, and they are tested like code.** Most process frameworks are prose, and agents demonstrably ignore prose. Here the floors are 17 validators, 4 hooks, and committed git hooks that run before a commit lands. The enforcement layer has its own regression suite in the development repository, and `scripts/bake-inheritance.cjs` ships as the proof a reader can run: it renders a real project and a planted defect must fail a baked gate. Presence is never taken for effectiveness.
- **The reviewer starts blind, and has to prove it can see.** Every milestone ends with a verifier session whose read-first list structurally omits the builder's notes - a bias guard the hooks enforce rather than a convention. Before its findings count for anything, it must find every defect in a set of deliberately seeded ones. A verifier that rubber-stamps is caught by construction, not by trust.
- **The ceremony is priced, chosen, and revisable.** A short interview sets a tier. You can move up or down later by telling the orchestrator who edits one file and logs why. Nothing about the tier is baked into the code.

The result is a build that can tell its own story: what was decided, what broke, what was fixed, and what remains unknown - with unknowns shown as unknown rather than rounded to zero.
## What this isn't

- **Not a hosted service or an agent runner.** It is files in your repository. It runs wherever your agent runs.
- **Not a guarantee that agents stop making mistakes.** It is the set of controls that make a mistake visible and fixable while it is still cheap.
- **Not a replacement for tests, review, or judgment.** It assumes you have those and gives them a place to stand.
- **Not a sandbox.** The generated permission fence denies secret reads and irreversible commands at the agent's tool layer, but a subprocess the agent spawns can still read a file on disk or make changes you don't want. The fence raises the bar; the real backstops are secrets kept off disk and the OS sandbox and your judgement.
- **Not audited.** This framework was generated for the most part by Claude with human guidance - but no human security review has been performed on this code. See [SECURITY.md](SECURITY.md).

## When not to use it

When to skip this kit. If the overhead will cost you more than it returns:

- **If the work fits in an afternoon.** The measured evidence is unkind here: a spec-driven rebuild of a small task ran roughly ten times slower for no quality gain. Here iterate in a plain session instead. 
- **If the code is throwaway.** The ceremony and audit trail pays off when the expected outcome is useful - or if someone must reconstruct *why* a decision was made. No future, no payoff.
- **If you will not actually review the work.** You do not need to read the code - but the gates assume a human who stamps each stage has read the builder agent's review and orchestrator comments and run any live testing. Rubber-stamp them and you keep all of the ceremony and lose the one control that makes it work. You. 

There is no guarantee that a heavyweight process framework beats a concise `CLAUDE.md` plus tests plus code review. This kit is a bet on mechanical floors and independent verification, priced by tier. It is a reasoned bet, not a proven one. 

**However, the idea is that you will gain an application that is working at the end of the process with better structured code, audit trail, and less time on the back-end fixing things. So weigh the trade-offs.**

## Quickstart

[QUICKSTART.md](sbak/QUICKSTART.md) covers the install in full - the ZIP path for a new project or an existing repo, plus the clone alternate. The short version, **from the recommended `sbak-v1.0.4-starter.zip`** (verify the `.sha256` first). Run it from the folder the ZIP downloaded to, and replace `<projects-path>` with wherever you keep code - the point is that the project gets a real home, not `Downloads`:

macOS / Linux:

```
unzip sbak-v1.0.4-starter.zip -d <projects-path>/my-project && cd <projects-path>/my-project
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

**What success looks like:** the adopt step verifies itself, and its exit code is the contract. 

**Exit 0 means adoption COMPLETE** - every required enforcement layer is active (Git hooks armed via `core.hooksPath`, no destination refused, no incomplete settings merge), and it prints exactly that. 

**Anything less exits non-zero and says why:** exit 1 is `ADOPTION INCOMPLETE` - the missing control is **named**, with a `repair:` command that runs as printed (skip `git init` above and it answers `repair: git init`); exit 2 is a usage or fail-closed refusal. An incomplete install cannot silently look complete, and nothing downstream may read a non-zero adopt as armed. Re-running `--adopt` is always safe - a clean re-run changes nothing.

**Prefer to clone?** The clone alternate (same rule - give it a real home): `git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git <projects-path>/my-project && cd <projects-path>/my-project && node sbak/templates/scripts/kit-update.cjs --adopt && claude`. One heads-up on that path: `origin` still points at the kit's repository until the bootstrap resets it at handoff - don't `git push` before then (it would target the kit, not your project). Detail: [QUICKSTART.md](sbak/QUICKSTART.md) §1.

Once the kit is in your repo start `claude` from the repo.
The CLI waits for you to speak first. Your opening message can simply be what you want - *"fix a bug"*, *"add a feature"*, *"build something new"* - or just `go`. The kit takes it from there: it echoes your folder (confirm it), then guides with a short interview - three asks: 

**1.) what kind of work this is**

**2.) the tier**

**3.) any declared risk triggers** 

plus one confirmation turn that surfaces every derived value (review cadence, ship target, where tests run, the file count) in plain English with its why, and invites correction. Answer, then describe what you want to build, and the kit writes your project's scaffold. From then on every session inherits the same rules automatically. 

Already have a project? Unzip the ZIP into that repo - the only collision is `CLAUDE.md` - then run the adopt step. Again: the directory you run in is the directory that gets written to.

**Nothing leaves your machine until you explicitly say "push" or "open the PR"** - those are single, separate approvals near the end of a run (no pushes between stages; `git commit`/`git push` sit at "ask" on every permission-fence level). Until then, everything is local.

**Project already running the kit?** Skip the interview entirely: run in terminal: `node scripts/set-mode.cjs orchestrator`, then `claude`, and tell the orchestrator what you want - *"Author the next milestone - \<your feature\>."* That one paste is the steady state of the whole framework.

## How it works

The unit of work is a **stage**. A milestone is a few stages; a project is a few milestones. Each stage runs the same loop:

At Full tier (the default), the kit runs as **two separate CLI sessions in two separate windows** that never talk directly - **you are the conduit between these terminals.**

At start you open one window - the **bootstrap session**. It leads the calibration interview, plans the project with you, and scaffolds the files - then it retires, and its last act is walking you through opening the two windows that run the build.

The first is the **orchestrator** - a long-lived coding partner that directs the work, builds each milestone doc and ensures adherence to the kit's policy. This terminal does not code or write (generally).

The second is **the build terminal**, which hosts the short-lived working sessions: a fresh **builder** session per stage - **the coder/tester/writer** - and, when the stage work is done, a separate fresh **verifier** session that reviews it blind (the two never share a context).

**The user sits between and is the conduit between terminals** for instructions, results, adjudication and general Q&A. The user is also responsible for any required live testing as directed by the orchestrator.

**The relationship between user and orchestrator is best thought of as that between a lead engineer and CEO. The user is free to ask anything, change anything** - the orchestrator will adjudicate and provide feedback and prompts for the user to take back to the build terminal.

(At Lite tier the roles collapse into one session - no second terminal.)

After bootstrap each stage is generally run the same:
1. **Read.** A build session-start hook loads a short, capped orientation list - never the whole corpus.
2. **Stage Plan.** Build agent writes the plan for the entire stage. The surfaced plan is passed to the orchestrator terminal via the user for adjudication. Once approved, the orchestrator writes and surfaces the approval prompt for the user to pass to the build terminal to start.
3. **Red.** The agent writes failing tests first. A hook blocks it from touching implementation files until you have passed the test summary to the orchestrator for review and approval of the failing tests and release of the gate. This is the one control that stops a test being written to fit code that already exists.
4. **Green.** The agent implements until the test passes and the gate line is clean.
5. Once the stage is complete and clean - the orch will review and once fully approved will recommend commit. Once the build commits - that stage is done. That build session is complete and claude is exited from the terminal.
6. Repeat for all standard build stages with a new build session each time.

After the standard build stages complete, a new session opens in the build terminal:
7. **Verify.** A separate session, with no memory of the build, reviews the work. It must pass a seeded-defect calibration before its findings are counted.
After verification completes, a final closeout session opens in the build terminal:
8. **Closeout.** Findings, fixes, and rework land in append-only ledgers and a retrospective. You stamp it pass or fail; a fail is expensive on purpose.

**At every step, the user passes the results from the builder/verifier terminal to the orchestrator for review/conversation. Once accepted/approved the orchestrator prepares a prompt for the builder to fix something or to approve the gate and move forward.**

A milestone ends with **closeout** - the ledgers reconciled against the milestone's own commits, a summary the next milestone reads, and (in some cases when the trigger fires) the fourth role: the **refactorer** runs at milestone boundaries, after the verifier, when the tech-debt ledger crosses its threshold count or the milestone interval elapses - whichever comes first - asking "is the code maintainable?" under the strictest read-first bias guard in the kit. Lite Tier skips this process.

Four operating modes reuse that loop at different shapes: `greenfield` (build something new), `bug_fix` (reproduce, fix minimally, verify once), `audit` (review an existing codebase and produce findings, not code), and `research_publish` (synthesize sources into a paper and an illustrative app).

The gate line is 16 hard gates and 5 soft ones. Stage prompts are XML and validated against a published protocol (currently protocol v1.9), so a malformed stage cannot enter the loop. There are 5 schemas covering the stage kinds.

## Where are the agents?

They're roles, not files. The kit runs your coding assistant as four distinct agents - orchestrator, builder, verifier, refactorer - each a separate session with its own read list, its own permissions, and its own job: the builder writes the failing tests first, and a hook blocks it from touching implementation until a human approves them; the verifier starts blind - it structurally cannot see the builder's notes, and must catch every seeded defect before its findings count; the orchestrator plans and never edits code; the refactorer reads under the strictest bias guard.

One agent has a standing manual (the orchestrator). The rest are built per stage from shipped parts - a role file, a read list the hooks compose, and a stage prompt the orchestrator writes and a validator checks. No complete agent definitions ship because your assistant supplies the agent; the kit supplies the roles and the walls between them. What makes most multi-agent setups fragile is that the separation is a suggestion; here it's a hook that says no.

## Harnesses

| Host | What runs |
|---|---|
| **Claude Code** | Everything: session hooks, red-gate, role enforcement, slash commands, plus the git-hook + CI layer. |
| **GitHub Copilot** | One copy step creates the auto-load shim ([QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md) §1); the git + CI enforcement is real, the session hooks don't run. |
| **Codex / others** | Untested - the git + CI layer is plain Node and should run; the session-layer enforcement will not. |

The real shape of that table: **picking a Claude model inside another host does not make it Claude Code.** The model changes; the harness doesn't - and the session hooks belong to the harness. In any other host besides Claude Code the framework still works: the roles, the red-first discipline, and every artifact are instructions the agent is asked to follow - but honor-system instead of mechanically enforced. Two layers stay mechanical in every host, because they sit below the session: the git hooks (pre-commit / pre-push validators) and CI run no matter what wrote the commit. If you have Claude Code installed, running `claude` in your editor's integrated terminal is the fully enforced path.

## The tiers

Pick by the highest of complexity, time horizon, and audit needs. Re-tier whenever, by editing one file and logging the reason.

| Tier | For | Scaffold files | Approvals | Retrospective | Ledger | Review cost per stage |
|---|---|---|---|---|---|---|
| **Lite** | Under a week, low audit needs | 41 | per pull request | brief paragraph | changelog only | ~10 min |
| **Full** (default) | a second reader, an audit need, or a multi-week horizon | 97 | per stage | process + product | append-only advisory; CI-enforced when a risk trigger is declared | ~30 min |

Declaring a risk trigger at calibration arms CI enforcement of the append-only ledger and adds 2 files to the scaffold.

Details and every toggle: [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md).

**The overhead is real.** In a controlled two-arm trial on a small **solo** markdown-to-HTML CLI, the framework arm ran **over 10× the cost and time** of a lightweight control loop, and the trial's own ratified adjudication called out two missed thresholds, adaptability and economic justification **for that project class** (it passed the other four, including one evidence-bound prevented defect). If your project looks like that one, you are betting that the coding quality and outcome are worth the added overhead; see [WHY-THIS-KIT.md](WHY-THIS-KIT.md) and [limitations.md](docs/limitations.md). The full trial record lives in `docs/trial/` **in this kit's source repository** - it is not part of this distributed release.

## What's in the box

The ZIP - and the `sbak/` payload of this repository, which is the same set - is 193 files (the count and every row below are derived from the release manifest's assembled inventory, not hand-tallied):

| Directory | Files | What it is for you |
|---|---|---|
| `sbak/templates/` | 107 | Copied into your project by the bootstrap; never read here. |
| `sbak/prompts/` | 23 | The verifier's seeded-defect exam; runs itself. |
| `sbak/validators/` | 23 | Enforcement (the 17 project-floor validators plus mode-specific and append-only checkers, `lib/`, and docs); CI runs it. |
| `sbak/scripts/` | 18 | You run 2–3, read none. |
| `sbak/` root docs + `sbak/bootstrap/` | 21 | The methodology spine, the bootstrap playbooks, and the topology image; you read none to start. |
| `CLAUDE.md` (ZIP root) | 1 | The agent's bootstrap instructions - auto-loaded, not for you. |

CI and release automation (`.github/`) live in this repository only - they are not part of the ZIP. Most of these files are the product: templates the bootstrap copies into your project, and validators that keep it honest. You read one file to start - this one. The whole kit is about 2 MiB.

## What's verified

The CI badge above is not decoration. On every push and pull request, this repository runs its own enforcement layer against itself:

- the stage-prompt schema check, over every phase document;
- an enumeration check proving every shipped validator is catalogued everywhere that claims to list them;
- the seeded-defect calibration set, checked in both directions: no fixture may carry a verdict token, and every fixture must have a complete sealed label the verifier never reads;
- a self-description check proving the numbers on these pages match the code they describe;
- the golden scaffold check - a template edit cannot silently change what a bootstrapped project receives;
- a bake harness that renders a real project and proves the inherited gates *fire* there: it plants a violation and requires the baked validator to reject it.

Release artifacts are built from a signed tag, not a working tree, and carry build provenance at SLSA Level 2. The same tag always produces the same archive hash. No human security audit is claimed.

## Install and download

**Recommended:** download `sbak-v1.0.4-starter.zip` and its `.sha256` from the releases page and verify before you unpack - the `.sha256` checksum, and stronger, `gh attestation verify sbak-v1.0.4-starter.zip -R kknipe2k/Software-Build-Assurance-Kit` (SLSA build-provenance attestation). Prerequisites, exactly: **Node.js 22 or newer** (the only runtime the validators and hooks need), **git**, and a coding agent (Claude Code for the fully enforced path; GitHub Copilot works too, with one copy step creating the auto-load shim - see the host table above); `gh` only if you want the attestation check. The kit itself is stack-agnostic. Full install detail: [QUICKSTART.md](sbak/QUICKSTART.md) §1.

Cloning the repository (above) is an alternative.

Using GitHub Copilot in VS Code rather than Claude Code? Start at [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).

## Feedback and issues

Development happens in a private repository and this is a published snapshot, so pull requests are not the model. **Issues are read and reviewed; no response time is promised.** Bug reports, false greens, and bootstrap failures are the most useful thing you can send. Read [CONTRIBUTING.md](CONTRIBUTING.md) before filing.

To report a security vulnerability, do not open an issue - see [SECURITY.md](SECURITY.md).

## License

MIT. Copyright (c) 2026 Kurt Knipe. See [LICENSE](LICENSE).
