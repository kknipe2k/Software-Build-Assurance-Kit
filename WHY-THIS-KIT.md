# Why this kit — the evaluator's digest

> Two pages between `QUICKSTART.md` and the methodology spine, for the person deciding whether
> to invest an evening: what the Software Build Assurance Kit actually buys you, what it costs,
> the evidence either way, and when you shouldn't use it. Every count on this page is
> machine-policed against `framework-manifest.json` / `golden-manifest.json` — a drifted number
> fails CI, not your trust.

## What it does

### 1. Bake-tested enforcement — the gates are tested the way code is

Most process frameworks are documents; agents demonstrably ignore documents. Here the floors
are mechanical — 19 validators, 4 hooks, committed git hooks — and the enforcement layer is
itself regression-tested:

- **A 1,250+ check smoke suite** (in the development repository) — a floor the suite enforces on itself.
- **A bake harness** that renders a real project and proves the inherited gates *fire* there: a planted pre-approval edit is blocked; a broken hook turns the baked project's own mini-smoke red.
- **Mutation-killed locks** — presence is never taken for effectiveness: delete the teeth and a check goes red.

The full protocol (currently protocol v1.9, with 5 schemas for stage prompts) is enforced by
validators at pre-commit and CI, so sessions don't need it preloaded to obey it.

### 2. Calibrated fresh-context verification

Every milestone ends with a verifier session that starts *blind*: its read-first list
structurally omits the builder's retrospectives (a bias guard the hooks enforce, not a
convention).

Before its findings count, it must pass a seeded-defect calibration — catch every planted
escape, false-negative rate zero — so a rubber-stamping verifier is caught by construction.
In the kit's own use to date, that calibration has run at a false-negative rate of zero at
every live run.

The gate line runs 16 hard gates (G1–G16) plus 5 soft (S1–S5), and the human's stamp is
binary: pass or fail, with an explicit fail forcing the friction-heavy outcome.

### 3. Tier calibration — the ceremony is priced, chosen, and revisable

One interview sets the tier:

- **Lite** — ~44 scaffold files, brief retros, CHANGELOG-only ledger, advisory validators.
- **Full** (default) — ~108 files, two-axis retros, blocking validators, advisory append-only ledgers with CI-enforced immutability arming on any declared risk trigger.

Re-tier any time via a logged override. New process mass is budgeted: a new gate requires a
named real failure it would have caught plus a sweep-cost estimate (N5).

And the build tells its own story: normal sessions leave local event ledgers, and `node scripts/build-receipts.cjs render` turns them + committed history into a deterministic, evidence-linked report under `reports/` — gitignored as a default, not a wall (negate the entry to track a report deliberately).

## The honest costs

- **Bootstrap time.** Tier-conditional discovery (~15 / ~30 / ~60 minutes of real interview) plus
  scaffold review before anything is written. A weekend script does not amortize this; see
  "when NOT to use this."
- **Per-stage ceremony.** Human review per stage: roughly 10 minutes at Lite, 30–40
  at Full — every stage, not just the interesting ones. Local verification adds ~2–4
  minutes per push (measured ~125 s on the reference machine).
- **Token overhead.** The kit's documentation corpus is roughly 200× the vendor-recommended
  standing-instruction budget, and the evidence says preloaded context is not free: LLM-generated
  context files *reduced* agent success ~3% while raising cost >20% (ETH Zurich), and
  instruction-following decays with density (IFScale). The kit's mitigation is structural — the
  per-session read-first lists are capped at ≤8 entries with the reference spine fetched
  on demand — but a framework this size still costs more tokens than a bare CLAUDE.md.
- **Stack coverage has a boundary.** The static gate floors (durable-state writes, test-honesty)
  evaluate the covered stacks: JS/TS/JSX-TSX, Python, Go, Rust. Anything else gets a visible
  skip line plus verifier-stage coverage — disclosed, not silent, by design. New pattern sets
  are demand-driven under the N5 budget rule (a named real failure first); the covered-stack
  claim on this page is derived from the validators' own pattern tables, so it cannot overstate.
- **Measured overhead — the number, not an adjective.** On a small **solo** CLI build, a
  controlled two-arm trial put this framework at **≈13.6× the dollars** and **≈10.9× the API
  time** of a lightweight control loop. What that bought, and did not: "When NOT to use this."
- **A host-side caveat.** The control scripts are contract-locked to never wait on input (one
  paste or one line per human step — `STAGE-LOOP.md`), but a hang in the host CLI's own shell
  layer is a host bug the kit cannot fix — the lock guarantees the kit's scripts are never the
  blocking side, not that your terminal is bug-free.

## The evidence base

The claims above lean on the sources the framework review verified, both directions:

- DORA 2025 — AI amplifies existing discipline; small batches + version control are the named
  amplifiers: https://dora.dev/dora-report-2025/
- METR RCT — experienced devs were 19% *slower* with AI while believing they were faster: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- Chroma — reliability degrades with input length well below window limits: https://research.trychroma.com/context-rot
- IFScale — instruction-following decays with density (~68% at 500 instructions): https://arxiv.org/abs/2507.11538
- ETH Zurich — LLM-generated context files: −3% success, +20% cost: https://arxiv.org/html/2602.11988v1
- Stack Overflow 2025 — 66% cite "almost right" code as the top frustration; trust down: https://survey.stackoverflow.co/2025/ai
- Fastly — senior devs ship the most AI code while trusting it least (the verification gap): https://www.fastly.com/blog/senior-developers-ship-more-ai-code
- EPAM — an agent ignored an explicit constitution rule: docs without enforcement fail: https://www.epam.com/insights/ai/blogs/using-spec-kit-for-brownfield-codebase
- Scott Logic — a spec-framework rebuild of a small task ran ~10× slower for no quality gain: https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html
- Agent OS v3 — a framework removed three of its own pillars as core tools caught up: https://github.com/buildermethods/agent-os/discussions/310

## When NOT to use this

- **Small, short tasks.** The strongest negative evidence is exactly here: Scott Logic measured
  2,577 lines of process markdown for 689 lines of code, ~10× slower than iterating; Marmelab
  reached the same verdict (https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html).
  If the work fits in an afternoon, iterate with a plain session — even Lite is overhead.
- **Throwaway or solo-reader code.** The audit trail, ledgers, and retrospectives pay off when
  someone (including future you) must reconstruct *why*. No future reader, no payoff.
- **If you won't actually review.** The gates assume a human who reads the diffs and stamps the
  stages. Rubber-stamp the approvals and you keep all of the ceremony and lose the one control
  that makes it work — the framework's own data says the human stamp is load-bearing.
- **Honesty about the ceiling — we ran the controlled study, and on a small build we lost.**
  The same small markdown-to-HTML CLI was built twice: once under this framework, once under a
  lightweight control loop. The ratified adjudication FAILED two of its six thresholds **for
  that project class** — adaptability (a late change made the accumulated artifacts the larger
  liability) and economic justification. Four passed, including one evidence-bound prevented
  defect class and full cost visibility. That is the both-ways reading: the multiple above is
  not smaller than stated, and it is not claimed beyond a small solo CLI. Reducing this weight
  is the next major version's entire purpose, triggered by evidence of a non-author user. Full
  record — pre-registration, both arms' costs, the independent evaluator's scores — is in
  `docs/trial/` **in this kit's source repository**, not in this distributed release. The tiers
  exist so you can buy only what your stakes warrant; on this evidence, sometimes buy nothing.

---

*Counts on this page — 19 validators, 4 hooks, 8 shipped project scripts, 6 slash commands,
16 hard + 5 soft gates, 5 schemas, protocol v1.9, ~44/~108 scaffold files, and the
covered-stack set — are policed by `validators/validate-entry-docs.cjs` against derived facts.
The 1,250+ smoke floor is measured in the development repository (its full suite does not ship);
`scripts/bake-inheritance.cjs` is the effectiveness proof that does. Start at `QUICKSTART.md`; the
loop lives in `STAGE-LOOP.md`.*
