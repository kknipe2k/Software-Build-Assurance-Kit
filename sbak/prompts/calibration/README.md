# Seeded-defect calibration set (G14 — the verifier-proof)

> **The adversary-side analog of G9's mutation-kill.** G9 makes the **floor** falsifiable (mutate a validator → a test must go RED); this set makes the **adversary** falsifiable: seed a known defect → the verifier's plan-challenge must flag it. Grounded in **defect-seeding / bebugging** (measure a reviewer by the seeded faults it catches) and **LLM-as-judge meta-evaluation** (score the judge by its false-negative rate against a known-answer set). Gate **G14**.

## What this is

One **seeded-defect fixture per escape class** in the verifier's standing catalog. The set is a **shadow of `STAGE-PROMPT-PROTOCOL.md` §8.5** — the §8.5 catalog is the canonical source, this set is its mirror. **Fixture filenames are neutral by design and this table deliberately does not map classes to files** — the class↔fixture binding exists only in `labels/` (each label's `fixture:` pointer), so knowing the catalog never tells a verifier which artifact carries which defect. The 11 classes:

| # | Class | The seeded defect | §8.5 |
|---|---|---|---|
| 1 | `false-na` | an `n/a` that is false | §8.5 #1 |
| 2 | `prose-dodge-count` | a count/verdict in prose, no fenced `reconcile` | §8.5 #2 |
| 3 | `assert-a-constant` | assert-a-constant / always-matching-snapshot / mock-only | §8.5 #3 |
| 4 | `forged-ledger` | a forged ledger that still reconciles | §8.5 #4 |
| 5 | `stub-passes-assembled` | a stub that passes "assembled" | §8.5 #5 |
| 6 | `under-declared-trigger` | an under-declared trigger | §8.5 #6 |
| 7 | `toy-path-confinement` | a toy-path confinement | §8.5 #7 |
| 8 | `bare-startswith` | a bare `startsWith(root)` | §8.5 #8 |
| 9 | `dropped-fence-caveat` | a quietly-dropped fence caveat | §8.5 #9 |
| 10 | `gate-contract-skipped` | a gate row that skips the gate-design contract | §8.5 #10 |
| 11 | `non-covering-test` | a `<risk_declaration>` naming a **non-covering** test (the G13-floor gap) | — |

Class 11 has no §8.5 entry: **G13's floor checks a covering test is *named*, not that it *covers*** — only the adversary, reading the test body, catches that the coverage is named but absent.

**The shadow is bidirectional.** `validate-calibration.cjs --set … --catalog STAGE-PROMPT-PROTOCOL.md` checks BOTH directions: every class has a fixture (forward) **and** the §8.5 numbered catalog count equals the shadowed class count (reverse) — so a new §8.5 hunt added with no fixture is FLAGGED, not silently un-shadowed. The smoke suite exercises this against the real §8.5 every run. (Without `--catalog` only the forward half runs.)

## The seal — read this before touching a fixture

Each fixture in `fixtures/` carries the planted defect **with no answer**. The ground-truth verdict lives in an **independent `labels/<class>.label.md`** file, whose `fixture:` pointer is the **only** place the class↔fixture binding exists. **The verifier reads `fixtures/` during the calibration challenge; it never reads `labels/`.** If the answer sat in the fixture, the verifier would read it and FNR = 0 would prove nothing. `validators/validate-calibration.cjs` enforces the seal mechanically, in two layers:

- **the answer-token seal** — a fixture containing its own `expected:` / `must-flag` answer token is a **seal-broken** finding;
- **the announcement seal** — a fixture whose **filename or headings** name its own defect class is a **seal-broken** finding (class tokens derived from the labels). A set that announces its classes lets FNR = 0 prove the verifier can *read*, not that it can *detect*: a filename-only probe scored 11/11 on the pre-fix set. Fixtures therefore carry realistic, artifact-style names and headings; the defect is expressed only in the artifact's content.

The validator also polices the binding itself: every label's `fixture:` pointer must resolve, and every fixture must be claimed by exactly one label — with neutral names the mapping cannot be derived, so a hole in it is a hole in the ground truth.

## How Stage V uses it (G14)

Every Stage V **opens** by running its plan-challenge against `fixtures/` and must catch **all** seeds — **false-negative rate (FNR) = 0** — *before* its real findings count. The result (seeds caught / FNR) is recorded in the verifier findings as a `calibration` evidence block (`templates/VERIFIER-FINDINGS-TEMPLATE.md`). If the verifier misses a seed (FNR > 0), the verifier-proof worked: a verifier that can't catch its own seeds cannot be trusted to have reviewed the real work (`merge_gate` structural signal).

## The honest locus (non-negotiable)

`validators/validate-calibration.cjs` is the **static floor** only: it proves the calibration set **exists, shadows the full catalog, is labeled + sealed**, and that the V protocol **wires** the self-test. **The *catch* is agent judgment, recorded at V-time as the FNR — it cannot run in a pre-commit hook (you can't run a judge in a smoke test).** Conflating "the harness is present" with "the verifier caught the seeds" is exactly the presence-≠-effectiveness theater the evidence standard exists to kill. Floor (validator, present + wired) + adversary (the V-run FNR) = a real gate; neither alone is.
