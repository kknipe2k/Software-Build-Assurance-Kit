# Why this kit - the evaluator's digest

> Two pages for the person deciding whether to invest an evening: what the kit buys you, what it
> costs, the evidence either way, and when you shouldn't use it. Every count here is policed
> against `sbak/framework-manifest.json` / `sbak/golden-manifest.json` by the kit's verification
> floor - the footer states precisely which checks police what.

## What it does

### 1. Bake-tested enforcement - the gates are tested the way code is

Most process frameworks are documents; agents demonstrably ignore documents. Here the floors
are mechanical - 18 project-floor validators, 4 hooks, committed git hooks - regression-tested:

- **A smoke suite** (in the development repository) - a floor the suite enforces on itself.
- **A bake harness** that renders a real project and proves the inherited gates *fire* there: a planted pre-approval edit is blocked; a broken hook turns the baked project's own mini-smoke red.
- **Mutation-killed locks** - presence is never taken for effectiveness: delete the teeth and a check goes red.

The full protocol (currently protocol v1.9, with 5 schemas for stage prompts) is enforced by
validators at pre-commit and CI, so sessions don't need it preloaded to obey it.

### 2. Tier calibration - the ceremony is priced, chosen, and revisable

One interview sets the tier; re-tier any time via a logged override. New process mass is
budgeted: a new gate requires a named real failure it would have caught (N5).

- **Lite** - 44 scaffold files, brief retros, CHANGELOG-only ledger, advisory validators.
- **Full** (default) - 100 files, two-axis retros, blocking validators, advisory append-only ledgers with CI-enforced immutability arming on any declared risk trigger.


### 3. Calibrated fresh-context verification

Every milestone ends with a verifier session that starts *blind*: its read-first list
structurally omits the builder's retrospectives (a bias guard the hooks enforce, not a
convention). At **Full** it runs the shipped pass set - hooks, behavior, security, code quality,
plus a required plan-challenge; **Lite** runs an inventory pass only. Before its findings count,
it must pass a seeded-defect calibration - catch every planted escape - so a rubber-stamper is
caught by construction (in the kit's own use to date, zero false negatives at every live run).
The gate line runs 16 hard gates (G1–G16) plus 5 soft (S1–S5); the human's stamp is binary,
with an explicit fail forcing the friction-heavy outcome.


## The operating shape

- **Four roles, fresh contexts.** An orchestrator reviews and routes (it never implements);
  builder, verifier, and refactorer sessions run per stage, with you between them. The walls
  between roles are hooks, not conventions.
- **The stage loop is red-first.** A stage states its plan, writes failing tests, and stops:
  a human approves the RED set before implementation edits unlock, and the stage-end packet
  waits for approval again before anything commits.
- **The Refactorer (Stage R)** triggers at milestone boundaries (tech-debt count over the
  threshold or the milestone interval, whichever first), runs after the Verifier, and the
  Verifier re-runs after any structural change. Lite skips it.
- **Four operating modes** route the same machinery: `greenfield` (default), `bug_fix`, `audit`, `research_publish`.

## Cost

- **Bootstrap time.** Tier-conditional discovery (from ~15 minutes at Lite to ~30 at Full) plus scaffold review before anything is written; see "when NOT to use this for further context."
- **Per-stage ceremony.** Human review per stage: roughly 10 minutes at Lite, 30 at Full - every stage, not just the interesting ones. On the kit's own tree the full pre-push floor is measured at 550.9 s single-invocation (the smoke harness alone ~478 s); a generated project runs its own, far smaller floor.
- **Token overhead.** The shipped documentation corpus is roughly 40× the vendor-recommended standing-instruction budget (measured ~100k words; the development repository's full corpus, which does not ship, measures ~200×), and preloaded context is not free (ETH Zurich: context files *reduced* agent success ~3% while raising cost >20%). The mitigation is structural - read-first lists capped at ≤8 entries, the reference spine fetched on demand - but a framework this size still costs more tokens than a bare CLAUDE.md.
- **Stack coverage has a boundary.** The static gate floors (durable-state writes, test-honesty) evaluate the covered stacks: JS/TS/JSX-TSX, Python, Go, Rust. Anything else gets a visible skip line plus verifier-stage coverage - disclosed, not silent, by design; the covered-stack claim is derived from the validators' own pattern tables.
- **Measured overhead - example.** On a small **solo** CLI build, a controlled two-arm trial put this framework at **≈13.6× the dollars** and **≈10.9× the API time** of a lightweight control loop (the full record lives in `docs/trial/` in this kit's source repository). What that bought, and did not: Read "When NOT to use this" for more context.
- **A host-side caveat.** The control scripts are contract-locked to never wait on input (`sbak/STAGE-LOOP.md`); a hang in the host CLI's own shell layer is a host bug the kit cannot fix.

## The evidence base

The claims above lean on published evidence about frameworks and scaffolding like this one - what they promise, and what they cost:

- DORA 2025 - AI amplifies existing discipline; small batches + version control amplify: https://dora.dev/dora-report-2025/
- METR RCT - experienced devs were 19% *slower* with AI while believing they were faster: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- Chroma - reliability degrades with input length well below window limits: https://research.trychroma.com/context-rot
- IFScale - instruction-following decays with density (~68% at 500 instructions): https://arxiv.org/abs/2507.11538
- ETH Zurich - LLM-generated context files: −3% success, +20% cost: https://arxiv.org/html/2602.11988v1
- Stack Overflow 2025 - 66% cite "almost right" code as the top frustration; trust down: https://survey.stackoverflow.co/2025/ai
- Fastly - senior devs ship the most AI code while trusting it least (the verification gap): https://www.fastly.com/blog/senior-developers-ship-more-ai-code
- EPAM - an agent ignored an explicit constitution rule: docs without enforcement fail: https://www.epam.com/insights/ai/blogs/using-spec-kit-for-brownfield-codebase
- Scott Logic - a spec-framework rebuild of a small task ran ~10× slower for no quality gain: https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html
- Agent OS v3 - a framework removed three of its own pillars as core tools caught up: https://github.com/buildermethods/agent-os/discussions/310

## When NOT to use this

- **Small, short tasks.** The strongest negative evidence is exactly here: Read Scott Logic reaching the same verdict: if the work fits in an afternoon, iterate with a plain session - even Lite is overhead.
- **Throwaway code.** The audit trail, ledgers, and retrospectives pay off when someone (including future you) must reconstruct *why*. No future reader, no payoff.
- **If you won't actually review.** You do not need to read the code - the gates assume a human reads the agent's review and the orchestrator's comments, runs any live testing, and stamps each stage. Rubber-stamp them and you keep the ceremony and lose the one load-bearing control. You.
- **Honesty about the ceiling** - we ran a controlled study, and on a small build we lost. **The same small CLI** was built twice: under this framework, and under a lightweight control loop. The ratified adjudication FAILED two of its six thresholds **for that project class** - adaptability (a late change made the accumulated artifacts the larger liability) and economic justification. Four passed, including one evidence-bound prevented defect class. The multiple above is not understated and not claimed beyond **a small solo CLI**; the full record (pre-registration, both arms' costs, the independent evaluator's scores) is in `docs/trial/` in this kit's source repository, not in the distributed release. On this evidence, sometimes buy nothing.
- **And the boundary of the evidence itself: no uncoached-user evidence exists yet.** Every run of this framework so far was driven by its own author. A non-author (Level 3) result is the stated trigger for the weight-reduction major version, and it has not happened.

---

*Counts on this page - 18 project-floor validators, 4 hooks, 8 shipped project scripts,
6 slash commands, 16 hard + 5 soft gates, 5 schemas, protocol v1.9, 44/100 scaffold files, and
the covered-stack set - are policed by `sbak/validators/validate-entry-docs.cjs` and the smoke
suite against derived facts; the full smoke suite runs in the development repository (it does
not ship), and `sbak/scripts/bake-inheritance.cjs` is the effectiveness proof that does. Start
at `sbak/QUICKSTART.md`; the loop lives in `sbak/STAGE-LOOP.md`.*
