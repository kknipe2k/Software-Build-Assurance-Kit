# Positioning — what to use when

Where this kit sits among the ways people already keep agent work honest — starting with where the alternatives beat it. If a lighter tool fits your case, use the lighter tool.

## Where other tools are stronger

Each row names the case where you should prefer the alternative:

- **A concise `CLAUDE.md` plus tests plus code review** is stronger for small, short work. No controlled study shows a heavyweight process framework winning that comparison, and for afternoon-sized tasks the measured evidence has a plain session running roughly ten times faster.
- **Spec-driven tools (GitHub Spec Kit and kin)** are stronger when what you need is the specification pipeline itself — a spec format, its templates, spec-to-task decomposition. This kit's spec phase is deliberately thinner; its weight sits in enforcement and verification after a spec exists.
- **Agent OS and similar orientation frameworks** are stronger for pure standing-instruction management across many repositories — lighter to adopt, with nothing to enforce. Choose them when you want conventions rather than gates.
- **Your CI system** is stronger at what CI is for: repeatable build-and-test enforcement at merge time. The kit does not replace it — it adds the session-time controls CI cannot see, and hands the rest to your CI.

## The wedge — what this kit adds

The kit's bet is narrow and specific: mechanical floors at session time, plus calibrated blind verification, priced by tier.

- **The gates are tested like code.** The validators and hooks are regression- and mutation-tested in the development repository, and `scripts/bake-inheritance.cjs` ships as the proof a reader can run: it renders a real project and a planted defect must fail a baked gate. Presence is never taken for effectiveness.
- **The reviewer is provably blind.** The verifier structurally cannot read the builder's notes, and must catch every seeded defect before its findings count.
- **The ceremony is priced.** A short interview sets the tier; re-tiering later is one logged edit.

## No-commitment on-ramps

You do not have to adopt the whole process to try the controls:

- **`bug_fix` mode** — point it at one known defect: reproducer, minimal scope-locked fix, one blind verification pass. No spec, no milestones. Change-scoped entry is where the brownfield evidence says the sweet spot sits.
- **`audit` mode** — a findings-and-remediation review of an existing codebase. It produces a report, not code, and leaves nothing behind that you didn't ask for.

## When to walk away

[WHY-THIS-KIT.md](../WHY-THIS-KIT.md) carries the honest costs and the evidence pointing both directions; [limitations.md](limitations.md) carries the boundary list. The short version: afternoon-sized work, throwaway code, or reviews you won't actually perform — skip the kit.
