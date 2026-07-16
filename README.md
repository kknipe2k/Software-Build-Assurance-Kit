# Software Build Assurance Kit

[![CI](https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kknipe2k/Software-Build-Assurance-Kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Status: experimental v0.2.0](https://img.shields.io/badge/status-experimental%20v0.2.0-orange)](RELEASE-NOTES.md)
[![SLSA Level 2](https://img.shields.io/badge/SLSA-Level%202-blue)](https://slsa.dev/spec/v1.0/levels)

A drop-in kit that wraps a coding agent in controls you can check. AI agents write a lot of code, and the hard part is no longer getting code written — it is knowing whether what got written is the thing you asked for, and being able to show your work later. This kit gives an agent a spec to build against, a red-first test gate, a second agent that reviews the first one blind, and an evidence trail bound to real commits. The agent does not have to be perfect. The process has to make a miss visible.

## If you read nothing else

**Want to see it first?** Open [HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html) — a few minutes, in your browser. **Deciding if it's worth your evening?** [WHY-THIS-KIT.md](WHY-THIS-KIT.md) — two pages, honest costs.

**Want to try it?** For most users the recommended path is the signed release ZIP — download **`sbak-v0.2.0-starter.zip`** from the [releases page](https://github.com/kknipe2k/Software-Build-Assurance-Kit/releases), verify it (the `.sha256` checksum and, stronger, `gh attestation verify` — SLSA build attestation), unzip, then run the adopt step. Full steps: [QUICKSTART.md](sbak/QUICKSTART.md) §1.

**Evaluating or contributing** to the kit itself? Clone the repo instead — the **contributor / evaluator** path:

```
git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-project
cd my-project
claude
```

The CLI waits for you to speak first. Your opening message can simply be what you want — *"fix a bug"*, *"add a feature"*, *"build something new"* — or just `go`. The kit takes it from there: it echoes your folder (confirm it), then guides the rest one question at a time.

**Nothing is pushed or opened as a PR without your explicit approval.**

**This is experimental software at v0.2.0.** Interfaces will break between 0.x versions. See [RELEASE-NOTES.md](RELEASE-NOTES.md) for what works today and what does not.

The kit was built with its own process — [its own build receipt](example-receipt.html) is derived from real commits, findings, and rework, not a staged demo.

**Before you start:** run the kit from inside your own project directory — not in this clone. The kit writes your project's files into the directory it is run from, so the working directory *is* the consent. Cloning it and running it in place scaffolds the clone.

## Read in this order

The only file you must read before starting is this one — the interview does the rest. And you don't need to study the rest to proceed: **ask instead of reading**. The session you open has full visibility of the kit's docs and your repo — once your project is running, that session is the orchestrator — so any "what now / how do I / where is" question gets answered in-session, with the right doc quoted when it matters. The order below is for when you *want* the background:

1. **This README** — what the kit is, what it isn't, when not to use it.
2. **[example-receipt.html](example-receipt.html)** — what the output looks like on real work, before you invest anything.
3. **[WHY-THIS-KIT.md](WHY-THIS-KIT.md)** — the honest costs and the evidence, both directions. Read it if you're deciding; skip it if you're sold.
4. **[QUICKSTART.md](sbak/QUICKSTART.md)** — get it running; its "Just get going" section is the whole start. On Copilot in VS Code instead: [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).
5. **[HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html)** — the visual overview; also the page to show someone else.
6. **[STAGE-LOOP.md](sbak/STAGE-LOOP.md)** — once you're building: how each session re-orients and how a stage actually runs, step by step.

Everything else under [sbak/](sbak/) — [BUILD-PLAYBOOK.md](sbak/BUILD-PLAYBOOK.md), [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md), [PROCESS-VALIDATION.md](sbak/PROCESS-VALIDATION.md), [STAGE-PROMPT-PROTOCOL.md](sbak/STAGE-PROMPT-PROTOCOL.md), [persistence-architecture.md](sbak/persistence-architecture.md) — is the methodology spine: **the agent's reading, not yours.** Dip in when a specific question sends you there (a toggle, a gate, a schema); nobody reads them front to back.

## Contents

- [If you read nothing else](#if-you-read-nothing-else)
- [Read in this order](#read-in-this-order)
- [What this is](#what-this-is)
- [What this isn't](#what-this-isnt)
- [When not to use it](#when-not-to-use-it)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [Where are the agents?](#where-are-the-agents)
- [The tiers](#the-tiers)
- [What's in the box](#whats-in-the-box)
- [What's verified](#whats-verified)
- [Install and download](#install-and-download)
- [Contributing](#contributing)
- [License](#license)

## What this is

A set of documents, hooks, validators, and scripts you copy into a project. They give an agent session a fixed shape: read the spec, write a failing test, get a human to look at the failing test, write the code, hand the result to a second agent that starts with no memory of the first, fix what it finds, then write down what happened.

Three things hold that shape in place, and none of them is a document the agent can skip:

- **The gates are mechanical, and they are tested like code.** Most process frameworks are prose, and agents demonstrably ignore prose. Here the floors are 16 validators, 4 hooks, and committed git hooks that run before a commit lands. The enforcement layer has its own regression suite in the development repository, and `scripts/bake-and-test.cjs` ships as the proof a reader can run: it renders a real project and a planted defect must fail a baked gate. Presence is never taken for effectiveness.
- **The reviewer starts blind, and has to prove it can see.** Every milestone ends with a verifier session whose read-first list structurally omits the builder's notes — a bias guard the hooks enforce rather than a convention. Before its findings count for anything, it must find every defect in a set of deliberately seeded ones. A verifier that rubber-stamps is caught by construction, not by trust.
- **The ceremony is priced, chosen, and revisable.** A short interview sets a tier. You can move up or down later by editing one file and logging why. Nothing about the tier is baked into the code.

The result is a build that can tell its own story: what was decided, what broke, what was fixed, and what remains unknown — with unknowns shown as unknown rather than rounded to zero.

Deeper reading: [WHY-THIS-KIT.md](WHY-THIS-KIT.md) for the costs and the evidence on both sides, [HOW-IT-WORKS.html](sbak/HOW-IT-WORKS.html) for a visual overview, [BUILD-PLAYBOOK.md](sbak/BUILD-PLAYBOOK.md) for the methodology, and [STAGE-LOOP.md](sbak/STAGE-LOOP.md) for the loop you actually run.

## What this isn't

- **Not a hosted service or an agent runner.** It is files in your repository. It runs wherever your agent runs.
- **Not a guarantee that agents stop making mistakes.** It is the set of controls that make a mistake visible and fixable while it is still cheap.
- **Not a replacement for tests, review, or judgment.** It assumes you have those and gives them a place to stand.
- **Not audited.** No human security review has been performed on this code. See [SECURITY.md](SECURITY.md).

## When not to use it

Skip this kit — genuinely, the overhead will cost you more than it returns — if:

- **The work fits in an afternoon.** The measured evidence is unkind here: a spec-driven rebuild of a small task ran roughly ten times slower for no quality gain. Iterate in a plain session instead.
- **The code is throwaway, or you are its only reader, ever.** The audit trail pays off when someone must reconstruct *why* a decision was made. No future reader, no payoff.
- **You will not actually review the diffs.** The gates assume a human who reads and stamps each stage. Rubber-stamp them and you keep all of the ceremony and lose the one control that makes it work.

There is no controlled study showing that a heavyweight process framework beats a concise `CLAUDE.md` plus tests plus code review. This kit is a bet on mechanical floors and independent verification, priced by tier. It is a reasoned bet, not a proven one. Choose it with your eyes open.

## Quickstart

Full detail — the ZIP-first install, the directory-not-empty case, and a file map — is in [QUICKSTART.md](sbak/QUICKSTART.md). The short version, **from the recommended `sbak-v0.2.0-starter.zip`** (verify the `.sha256` first):

```
unzip sbak-v0.2.0-starter.zip -d my-project && cd my-project
git init
node sbak/templates/scripts/kit-update.cjs --adopt
claude
```

Prefer to clone — the **contributor / evaluator** path? `git clone https://github.com/kknipe2k/Software-Build-Assurance-Kit.git my-project && cd my-project && claude`.

The kit answers with an interview: what kind of work this is, how big it is, how much you know about the stack, how often you want to approve, what you are shipping, and where tests should run. Answer, describe what you want to build, and the kit writes your project's scaffold. From then on every session inherits the same rules automatically. The CLI waits for you to speak first — open with what you want ("fix a bug in this app", "build me a game") or just `go`, and your plain-words opener *is* the briefing.

If you already have a project, copy the kit's files into that project's directory rather than cloning into a fresh one. Again: the directory you run in is the directory that gets written.

**Nothing leaves your machine until you explicitly say "push" or "open the PR"** — those are single, separate approvals near the end of a run (no pushes between stages; `git commit`/`git push` sit at "ask" on every permission-fence level). Until then, everything is local.

**Project already running the kit?** Skip the interview entirely: `node scripts/set-mode.cjs orchestrator`, then `claude`, and tell the orchestrator what you want — *"Author the next milestone — \<your feature\>."* That one paste is the steady state of the whole framework.

## How it works

The unit of work is a **stage**. A milestone is a few stages; a project is a few milestones. Each stage runs the same loop:

1. **Read.** A session-start hook loads a short, capped orientation list — never the whole corpus.
2. **Red.** The agent writes a failing test first. A hook blocks it from touching implementation files until you have looked at that failing test and released the gate. This is the one control that stops a test being written to fit code that already exists.
3. **Green.** The agent implements until the test passes and the gate line is clean.
4. **Verify.** A separate session, with no memory of the build, reviews the work. It must pass a seeded-defect calibration before its findings are counted.
5. **Record.** Findings, fixes, and rework land in append-only ledgers and a retrospective. You stamp it pass or fail; a fail is expensive on purpose.

Four operating modes reuse that loop at different shapes: `greenfield` (build something new), `bug_fix` (reproduce, fix minimally, verify once), `audit` (review an existing codebase and produce findings, not code), and `research_publish` (synthesize sources into a paper and an illustrative app).

The gate line is 16 hard gates and 5 soft ones. Stage prompts are XML and validated against a published protocol (currently protocol v1.9), so a malformed stage cannot enter the loop. There are 5 schemas covering the stage kinds.

## Where are the agents?

They're roles, not files. The kit runs your coding assistant as four distinct agents — orchestrator, builder, verifier, refactorer — each a separate session with its own read list, its own permissions, and its own job: the builder writes the failing tests first, and a hook blocks it from touching implementation until a human approves them; the verifier starts blind — it structurally cannot see the builder's notes, and must catch every seeded defect before its findings count; the orchestrator plans and never edits; the refactorer reads under the strictest bias guard.

One agent has a standing manual (the orchestrator). The rest are built per stage from shipped parts — a role file, a read list the hooks compose, and a stage prompt the orchestrator writes and a validator checks. No agent definitions ship because your assistant supplies the agent; the kit supplies the roles and the walls between them. What makes most multi-agent setups fragile is that the separation is a suggestion; here it's a hook that says no.

| Host | What runs |
|---|---|
| **Claude Code** | Everything: session hooks, red-gate, role enforcement, slash commands, plus the git-hook + CI layer. |
| **GitHub Copilot** | Included shim + walkthrough; the git + CI enforcement is real, the session hooks don't run. |
| **Codex / others** | Untested — the git + CI layer is plain Node and should run; the session-layer enforcement will not. |

The real shape of that table: **picking a Claude model inside another host does not make it Claude Code.** The model changes; the harness doesn't — and the session hooks belong to the harness. In any other host the framework still works: the roles, the red-first discipline, and every artifact are instructions the agent is asked to follow — honor-system instead of mechanically enforced. Two layers stay mechanical in every host, because they sit below the session: the git hooks (pre-commit / pre-push validators) and CI run no matter what wrote the commit. And hosts mix — if you have Claude Code installed, running `claude` in your editor's integrated terminal is the fully enforced path, with whatever else you use alongside it.

## The tiers

Pick by the highest of complexity, time horizon, and audit needs. Re-tier whenever, by editing one file and logging the reason.

| Tier | For | Scaffold files | Approvals | Retrospective | Ledger | Review cost per stage |
|---|---|---|---|---|---|---|
| **Lite** | Under a week, low audit needs | ~36 | per pull request | brief paragraph | changelog only | ~10 min |
| **Standard** | One to four weeks | ~68 | per stage | process + product | append-only, advisory | ~30 min |
| **Full** | Long-lived or regulated | ~69 | per stage | process + product + forward-readiness | append-only, enforced in CI | ~60–90 min |

Details and every toggle: [FRAMEWORK-CONFIG.md](sbak/FRAMEWORK-CONFIG.md).

## What's in the box

175 files:

| Directory | Files | What it is for you |
|---|---|---|
| `templates/` | 101 | Copied into your project by the bootstrap; never read here. |
| `prompts/` | 23 | The verifier's seeded-defect exam; runs itself. |
| `validators/` | 19 | Enforcement; CI runs it. |
| `scripts/` | 9 | You run 2–3, read none. |
| root docs + governance | 20 | You read one to start. |
| `.github/` | 3 | CI and release automation. |

Most of these files are the product: templates the bootstrap copies into your project, and validators that keep it honest. You read one file to start. The whole kit is about 2 MiB.

## What's verified

The CI badge above is not decoration. On every push and pull request, this repository runs its own enforcement layer against itself:

- the stage-prompt schema check, over every phase document;
- an enumeration check proving every shipped validator is catalogued everywhere that claims to list them;
- the seeded-defect calibration set, checked in both directions so no fixture leaks its own answer;
- a self-description check proving the numbers on these pages match the code they describe;
- the golden scaffold check — a template edit cannot silently change what a bootstrapped project receives;
- a bake harness that renders a real project and proves the inherited gates *fire* there: it plants a violation and requires the baked validator to reject it.

Release artifacts are built from a signed tag, not a working tree, and carry build provenance at SLSA Level 2. The same tag always produces the same archive hash. No human security audit is claimed.

## Install and download

**Recommended:** download `sbak-v0.2.0-starter.zip` and its `.sha256` from the releases page and verify before you unpack — the `.sha256` checksum, and stronger, `gh attestation verify sbak-v0.2.0-starter.zip -R kknipe2k/Software-Build-Assurance-Kit` (SLSA build-provenance attestation). Node.js is the only runtime requirement for the validators and hooks; the kit itself is stack-agnostic.

Cloning the repository (above) is the **contributor / evaluator** alternative — you get the kit's own history, tests, and templates.

Using GitHub Copilot in VS Code rather than Claude Code? Start at [QUICKSTART-COPILOT.md](sbak/QUICKSTART-COPILOT.md).

## Contributing

Development happens in a private repository and this is a published snapshot, so pull requests are not the model at v0.x. **Issues are read and reviewed; no response time is promised.** Bug reports, false greens, and bootstrap failures are the most useful thing you can send. Read [CONTRIBUTING.md](CONTRIBUTING.md) before filing.

To report a security vulnerability, do not open an issue — see [SECURITY.md](SECURITY.md).

## License

MIT. Copyright (c) 2026 Kurt Knipe. See [LICENSE](LICENSE).
