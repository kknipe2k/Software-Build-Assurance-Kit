# M[NN].V Verifier Findings

> Filled by Claude during the Verifier stage. Output artifact for `<findings_format>` per `STAGE-PROMPT-PROTOCOL.md` §8.5. Reviewed at PR time alongside the milestone's code diff and gap-analysis entry (Full tier) or alongside the milestone PR description (Standard/Lite).

---

## Coverage caveat — read first

> ⚠️ **This milestone was verified at {{TIER}} tier.**
>
> **Passes run:** {{PASSES_RUN}}
> **Passes NOT run:** {{PASSES_NOT_RUN}}
> **Bug classes NOT checked:** {{BUG_CLASSES_NOT_CHECKED}}
>
> "Verifier passed" means the active passes found no 🔴 findings — not that the milestone is free of all bug classes. Bug classes not checked by the active passes (e.g., concurrency at Lite; runtime/visual without a harness) remain possible. Re-tier to a higher level if you need broader coverage.

This caveat is mandatory and must not be removed. Tier-coverage honesty is the difference between a useful verifier and confidence theater.

---

## Evidence retention — mandatory per assurance claim

> Every assurance verdict in this file **retains reproducible evidence**, and every **stated count** is **recomputed from its source**, not asserted. This is the evidence-retention rule, enforced by `validators/validate-reconciliation.cjs` (pre-commit + CI) and — where a static check can't reach — by Stage V's plan-challenge. It kills the "202 scanned / 0 corrections" assurance theater: a "Sound" verdict with no retained evidence, or a count that never recomputes, is invalid.

**A non-numeric assurance verdict** (a pass marked Sound / passed / clean) carries a fenced `verdict` block and **at least one** fenced `evidence` block — command · pattern/mutation set · result:

```verdict
finding: Pass N — <name>
status: Sound
```

```evidence
for: Pass N — <name>
command: <the exact, copy-pasteable command run>
pattern/mutation set: <the grep / mutation set exercised — e.g. revert <enforcement point> → which test goes RED>
result: <the observed result log — counts, exit code, RED→GREEN>
```

**A numeric count claim** (e.g. "202 commits scanned", "14 mutants killed", "17→14 graduated") carries a fenced `reconcile` block so the number is **recomputed from the ledger**, never trusted:

```reconcile
metric: mutants killed
claimed: 14
source: <ledger / status-log path, or `git`>
pattern: <regex counting the matching lines / commits>
```

(For `source: git`, add `range: main..HEAD`; the count is `git log --format=%s <range>` subjects matching the pattern.)

These evidence / reconcile blocks are **mandatory and must not be removed** — like the coverage caveat above. **Honest limit (no false confidence):** the validator is **presence-gated** — a count stated in prose, or under a key the validator's non-exhaustive list doesn't recognize, escapes the static check; Stage V's plan-challenge is the adversarial backstop that confirms every stated count carries a reconcile block.

---

## Calibration self-test (G14) — mandatory, run FIRST

> ⚠️ **Run before any other pass.** The verifier OPENS by running its plan-challenge against the seeded-defect calibration set (`prompts/calibration/` — one fixture per §8.5 escape class) and must catch **every** seed: **false-negative rate (FNR) = 0**. Only then do the real findings below count. This is G14 — the adversary-side analog of G9's mutation-kill. **The verifier reads `prompts/calibration/fixtures/` only — never `labels/`** (the sealed answers); reading the answer would make FNR = 0 prove nothing.

Record the result here — **mandatory, must not be removed**. A "Sound" milestone with no calibration block is invalid (`validators/validate-calibration.cjs` flags it: FNR unrecorded = the verifier-proof never ran = untrusted):

```calibration
self-test: plan-challenge vs prompts/calibration/
seeds: {{N}}            # the catalog size (one fixture per escape class)
caught: {{M}}           # seeds your plan-challenge flagged
FNR: {{(N-M)/N}}        # MUST be 0 before the findings below count
missed: {{none | <class>...}}   # if non-zero, the verifier-proof worked — this is a real finding
```

**Honest locus:** the static validator proves the harness is present + wired; **this recorded FNR is the catch** — agent judgment, not a pre-commit check (you can't run a judge in a smoke test). If your own FNR > 0, **stop**: a verifier that can't catch its own seeds cannot be trusted to have reviewed the real work (`merge_gate` structural signal).

---

## Pass 1 — Inventory

**Status:** ☐ passed / ☐ findings present / ☐ not run

For each claim in the phase doc:

| # | Phase doc claim | File / shape | Result | Severity | Resolution |
|---|---|---|---|---|---|
| 1 | "Ship `src/foo.ts` with exported `bar`" | src/foo.ts; exports `bar` | ✅ | — | — |
| 2 | "Ship `src/budget.css`" | NOT FOUND | 🔴 | — | D.fix M[NN].D.1 |

---

## Pass 2 — Hooks (5-step data path tracing)

**Status:** ☐ passed / ☐ findings present / ☐ not run

For each wire claim:

| # | Spec claim | Source event | Projector | Consumer | Wire | Severity | Resolution |
|---|---|---|---|---|---|---|---|
| 1 | "Node size scales with token spend" | `agent_complete.tokens_total` | `graphStore.ts` writes `tokensTotal` | `AgentNode.tsx` reads `tokensIn, tokensOut` | ❌ no consumer for `tokensTotal` | 🔴 | D.fix; or waiver ADR |

**No-consumer rule:** when step 4 finds zero or multiple ambiguous consumers, the finding is 🔴 by default. The build agent must either fix the wire or file an ADR explaining why the projection is unused. Don't downgrade silently.

---

## Pass 3 — Multi-call invariants *(Full tier only by default)*

**Status:** ☐ passed / ☐ findings present / ☐ not run

For each public API / IPC method / Tauri command:

| # | Method | Called twice in sequence | Result | Severity | Resolution |
|---|---|---|---|---|---|
| 1 | `query_session_db(id)` | call 1 ok; call 2 returns empty | 🔴 connection leaked | 🔴 | D.fix |

---

## Pass 4 — Behavior (harness-driven)

**Status:** ☐ passed / ☐ findings present / ☐ not run / ☐ harness absent (auto-🟡)

For each user-visible primitive:

| # | Primitive | Harness | Observable check | Result | Severity | Resolution |
|---|---|---|---|---|---|---|
| 1 | BudgetHeaderBar at >80% | Vitest+jsdom | `.budget-bar__bar--warn` computed background-color is `#ffaa00` | ❌ rule not in CSS bundle | 🔴 | D.fix |

**Harness absent:** if the primitive has no harness coverage and the project's `docs/gates.md` doesn't name a harness for this surface, the finding is 🟡 by default with explicit "no harness" caveat. Don't auto-pass; surface the coverage gap so users see what wasn't tested.

**`deliverable_type: web` — observed-running evidence (required):** beyond harness assertions, record the literal browser-load observation. "Tests passed" alone is not sufficient — the broken-app failure passed every unit test.

| Check | Result |
|---|---|
| App loads in fresh browser / headless | ☐ yes / ☐ no — {{console errors?}} |
| One primary interaction performed | {{which, and outcome}} |
| Evidence captured | {{screenshot path or console capture}} |

A web milestone cannot sign off without this filled. "No, didn't open it" → 🔴.

---

## Pass 5 — Design conformance *(`deliverable_type: web` only)*

**Status:** ☐ conforms / ☐ deviations present / ☐ not run / ☐ no `docs/design.md` (auto-🟡)

Fresh-context check of the running app against `docs/design.md`. Screenshot the app; for each brief area, mark conforming or flag a specific deviation.

| design.md area | Check | Result | Severity | Resolution |
|---|---|---|---|---|
| §2 Color | Tokens used, not raw hex; contrast meets target | {{}} | {{}} | {{}} |
| §3 Typography | Visible hierarchy ≥ N levels; defined fonts/scale | {{}} | {{}} | {{}} |
| §4 Components | States (hover/focus/disabled) present; focus visible | {{}} | {{}} | {{}} |
| §5 Layout | Spacing from the scale; alignment intentional | {{}} | {{}} | {{}} |
| §6 Elevation | Shadows encode hierarchy, not decoration | {{}} | {{}} | {{}} |
| §7 Do's/Don'ts | No raw-default styling; project guardrails held | {{}} | {{}} | {{}} |
| §8 Responsive | Adapts per the brief's breakpoints/target | {{}} | {{}} | {{}} |

"Looks like raw browser defaults" or "no design tokens used" → 🔴. A clean tests-green app that ignores the brief is exactly the failure this pass exists to catch. **No `docs/design.md`** (e.g. someone set `deliverable_type: web` but skipped Phase 1.5/1.6) → 🟡 with explicit caveat; flag the missing brief.

---

## Pass 6 — Security *(Standard+)*

**Status:** ☐ clean / ☐ findings present / ☐ mechanical floor not run (auto-🟡)

**Mechanical floor (always — runs even if judgment is shallow):**

| Check | Command | Result | Severity |
|---|---|---|---|
| Dependency audit | {{npm audit / pip-audit / cargo audit}} | {{N high, M critical}} | high/critical → 🔴 |
| Secret scan (diff) | {{gitleaks detect / equivalent}} | {{findings}} | any committed secret → 🔴 |

**Attack-surface judgment (per `deliverable_type`):**

| # | Surface | Concern | Finding | Severity | Resolution |
|---|---|---|---|---|---|
| 1 | {{e.g. POST /transfer}} | {{authz on state-changing route}} | {{}} | {{}} | {{}} |

Type prompts — web: XSS / injection / CSRF / unsafe `innerHTML` / auth on mutations · service: endpoint authz / input validation / rate limits · library: unsafe deserialization / injection in public APIs · cli: arg/path injection / unsafe shell-out. Cite file + line.

---

## Pass 7 — Code quality *(Standard+)*

**Status:** ☐ clean / ☐ findings present / ☐ `/code-review` unavailable, manual pass

Ran via {{`/code-review` skill / manual}}.

| # | Area | Finding | Severity | Resolution |
|---|---|---|---|---|
| 1 | {{dead code / duplication / complexity / test-mix}} | {{}} | {{mostly 🟢 tech-debt}} | {{ledger / fix}} |

Most findings are 🟢 (→ `docs/tech-debt.md`) unless a hotspot sits on the milestone's critical path (🟡). 🔴 only for genuinely broken code, not merely ugly — this pass tunes quality, it doesn't block on taste.

---

## Findings summary

- **🔴 Critical (blocks merge):** {{COUNT}}
- **🟡 Important (carry forward to next milestone's Stage A):** {{COUNT}}
- **🟢 Nice-to-have (appended to `docs/tech-debt.md`):** {{COUNT}}

---

## Resolution plan

For each 🔴:

1. Finding # {{N}}: {{ONE_LINE_DESCRIPTION}}
   - **Path:** ☐ D.fix stage / ☐ waiver ADR / ☐ re-tier
   - **Owner:** {{NEXT_STAGE_AGENT}}
   - **Re-verify after:** D.fix M[NN].D.{{N}} commits

For each 🟡: carried forward to M[NN+1].A read list.

For each 🟢: appended to `docs/tech-debt.md` with date + finding number.

---

## Recommendation

Pick one:

- ☐ Proceed to closeout (Stage E) — no 🔴 findings unresolved
- ☐ Open D.fix stages for 🔴 findings; do not proceed to E until V re-runs clean
- ☐ Pause for maintainer adjudication on filed waiver ADR(s)
- ☐ Re-tier the milestone scope — structural signal triggered (D.fix loop diverging)

---

## Sign-off

- **Date:**
- **Milestone:** M[NN]
- **Verifier session URL:** https://claude.ai/code/session_<id>
- **Iteration count:** {{N}} of 2 max (third iteration escalates to maintainer)
