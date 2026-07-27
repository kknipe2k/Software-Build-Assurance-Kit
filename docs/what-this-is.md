# What this is

Five questions, answered straight — then the layered model of what actually ships. For the sales-free evaluation, read [WHY-THIS-KIT.md](../WHY-THIS-KIT.md). To run it, start at [README.md](../README.md).

## The five is-it questions

### Is it an app?

**No.** There is nothing to launch and no binary to install. The Software Build Assurance Kit is files — documents, hooks, validators, and scripts — that you copy into a repository.

### Is it scaffolding?

**Partly — scaffolding is the installation mechanism, not the product.** A bootstrap interview writes a calibrated scaffold into your project. What the scaffold installs is the process below.

### Is it a framework?

**Yes.** A process framework: it fixes the shape of agent sessions — spec, failing test, human gate, implementation, blind review, record — and enforces that shape mechanically rather than by convention.

### Does it directly coordinate remote agents as a service?

**No.** Nothing runs remotely and nothing is hosted. Your own coding assistant supplies the agent; the kit supplies the roles, the reading lists, and the walls between them, inside your repository.

### Does it remain in the generated project?

**Yes.** The controls install into your project and stay there — the hooks, validators, ledgers, and retrospectives keep working for every later session. Retiring the kit is a documented, deliberate removal, not something you trip over.

## The layered model

One framework, six layers. Every file that ships belongs to one of them:

- **Bootstrap / scaffold generator** — the calibration interview plus the copy-then-fill scaffold writer that sizes the process to your project.
- **Project execution protocol** — the stage loop: red-first tests, human gates, staged approvals, closeouts.
- **Orchestrator / builder / verifier / refactor roles** — four session types with separate reading lists and separate jobs; the separation is hook-enforced, not honorary.
- **Context and authority controls** — capped read-first lists, role checks on pasted prompts, and a permission fence with an honestly stated boundary.
- **Evidence and assurance gates** — validators, git hooks, calibration-gated blind verification, and mutation-tested enforcement (mutation-tested in the development repository; `scripts/bake-inheritance.cjs` ships as the effectiveness proof a reader can run).
- **Persistent project memory** — append-only ledgers, retrospectives, and decision records that survive session resets.

## What this isn't

The other five questions people ask, answered just as straight:

- **Not a hosted service or an agent runner.** It runs wherever your agent runs; nothing phones home.
- **Not an agent and not a model.** You bring your own coding assistant; the kit shapes what it does.
- **Not a test framework or a CI system.** It assumes you have tests and CI, and adds the process floor that keeps an agent honest about them.
- **Not a fork-me template.** You do not build your app inside this repository — the kit copies into *your* project, and the directory you run it from is the consent.
- **Not a guarantee that mistakes stop happening.** It is the set of controls that make a mistake visible and fixable while it is still cheap.
