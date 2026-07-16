# {{PROJECT_NAME}} — Off-Track Log

> Append-only record of **justified priority inversions**. An inversion is building a lower-ranked `docs/backlog.md` story while a higher-ranked one sits backlogged. Inversions are not automatically wrong — user-value order and dependency order are different orderings — but an inversion is *on track* **only** if a build-sequence necessity is recorded here. **An unlogged inversion is off track by default.** See `sbak/PROCESS-VALIDATION.md` (G8 — Off-Track gate).

---

## Append-only rule (HARD)

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4). **No prior entry may be edited, reordered, or deleted.**

Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory): prior committed content must remain a byte-prefix of the current file, so prior entries stay byte-identical to their committed state. This is the **same** check that guards `docs/gap-analysis.md` and `docs/tech-debt.md` — the off-track log simply joins that workflow's `LEDGERS` set; there is no separate workflow.

### Why append-only

The log's value is forensic. A future session (or auditor) reading "we inverted priority here, and here, and here — all justified by dependencies" can trust the direction was deliberate. **Rewriting it would let drift be retroactively laundered into justification** — exactly the failure the off-track check exists to prevent. The justification must be written down *before* it counts; an after-the-fact edit to a prior entry breaks the byte-prefix and fails the check.

At **Lite** tier there is no separate log — justified inversions get a one-line note in `CHANGELOG.md` instead (same way gap-analysis collapses into CHANGELOG at Lite).

---

## When an entry is added

Whenever a stage or milestone builds a lower-ranked story ahead of a higher-ranked, unblocked, in-scope one — *and* that divergence is justified by a build-sequence necessity. The entry is written (and the user ratifies it) **before** the inversion counts as on track. The four necessity types:

- **HARD DEPENDENCY** — the higher item technically cannot be built until the lower one exists (the `Depends on` column in `backlog.md` proves it).
- **FOUNDATIONAL SCAFFOLDING** — infra that *multiple* higher items sit on (auth, data layer, CI); build once, unblock many.
- **COST-OF-CHANGE** — cross-cutting concerns that get exponentially dearer to retrofit (observability, i18n, multi-tenancy, security boundaries); front-load while the surface is small.
- **RISK DE-RISKING** — the riskiest / most-uncertain story, built early to fail fast before more is built on a shaky assumption.

Anything outside these ("it was easier / faster," "almost done anyway," gold-plating a shipped story, "the user might want it" for an unranked item) is **not** a necessity — that inversion is off track: stop and surface it, don't log it.

---

## Entry shape

```
## M0N.X — built #J (short title) before #K (short title)
- Higher-priority backlogged: #K "{{story}}" (rank {{R}})
- Built instead: #J "{{story}}" (rank {{R}})
- Justification: {{NECESSITY TYPE}} — {{why; reference the backlog.md row / Depends on}}
- Logged: YYYY-MM-DD · approved by: {{user}}
```

---

## Entries

<!--
Append new entries below this line. Newest at the bottom. Do NOT edit prior
entries — a justified inversion, once logged, is permanent. Example:

## M02.B — built #12 (persistence layer) before #2 (save a note)
- Higher-priority backlogged: #2 "save a note" (rank 2)
- Built instead: #12 "persistence layer" (rank 12)
- Justification: HARD DEPENDENCY — #2 Depends on #12 (see docs/backlog.md). Save cannot exist without a persistence layer.
- Logged: 2026-06-05 · approved by: <user>
-->

---

*Paired with `docs/backlog.md` (the ranked backlog the inversions are measured against) and the off-track check (G8).*
