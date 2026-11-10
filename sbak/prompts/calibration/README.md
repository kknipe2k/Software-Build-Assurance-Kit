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

Every Stage V opens with this exam, before any other pass, and its findings count only after the exam is scored. Three boundaries, three owners:

- **The verifier judges blind (agent judgment).** It reads `fixtures/`, never `labels/`, and writes a `calibration-verdicts` block in its findings file: one line per fixture, `<fixture filename>: <class from the table above, or clean>`, then `judged-from: content`. It never writes a score: the findings template's `calibration` block stays at `scored-by: pending`.
- **A labels read voids the exam (deterministic enforcement over the recorded reads).** `node scripts/lib/read-ledger.cjs --check verify` refuses when the verifier's session has a recorded read of any file under `labels/`, and the scorer refuses the same session with `--session`. A read the ledger does not record (a glob, a directory search, another program) is outside this check.
- **A program scores (observed evidence).** The orchestrator runs `node scripts/calibration-score.cjs --findings <findings file> --session <the verifier's session id>` in its own tree. It reads the sealed labels, compares each verdict with its label's class and rewrites the `calibration` block in place: `seeds`, `caught`, the false-negative rate (`FNR`) as a decimal and as `<missed> of <seeds>`, `missed`, whether the labels check ran, and a `scored-by:` line carrying the sha256 of the verdicts block. It refuses in a tree whose role is not orchestrator, because the verifier never scores itself, and it scores a block only once.

`validators/validate-calibration.cjs` then refuses a findings file that asserts Sound unless that block is there, its sha256 matches the verdicts block, `seeds` equals the label count, `caught` equals `seeds` and the FNR parses as 0 (deterministic enforcement at the pre-commit). A missed seed is the verifier-proof working: the milestone has a real finding (`merge_gate` structural signal). The records are checked against each other, never against their author: a `scored-by:` line typed by hand with the right hash passes the validator, the same local trust boundary as every record on the evidence path. G9's mutation kills and this rate are two scores and are never combined.

## The honest locus (non-negotiable)

`validators/validate-calibration.cjs` is the **static floor** only: it proves the calibration set **exists, shadows the full catalog, is labeled + sealed**, and that the V protocol **wires** the self-test. The **catch is agent judgment** (the verifier's verdicts) and the **rate is the scorer's** (observed evidence, written by the orchestrator's run, never by the verifier); **the judging cannot run in a pre-commit hook (you can't run a judge in a smoke test).** Conflating "the harness is present" with "the verifier caught the seeds" is exactly the presence-≠-effectiveness theater the evidence standard exists to kill. Floor (validator, present + wired) + adversary (the verifier's verdicts, scored by the program) = a real gate; neither alone is.
