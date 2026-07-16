# {{PROJECT_NAME}} — Sources Registry

> Append-only registry of every source retrieved during Phase R (grounded STORM). **One row per source.** This is the ledger every paper claim binds to: under grounded STORM a finding may only cite a source recorded here — *no source → no claim*. **This file is what the no-fabricated-citation gate `G_RP_R1` checks against** — `validators/validate-sources.cjs` fails any paper whose citation names an id absent from this registry. The registry is the research analogue of the App-Map's test-id binding: it makes "author from inference" structurally impossible.

---

## Mandatory at every tier (HARD)

Unlike every other ledger, the sources registry is **mandatory regardless of tier** — a deliberate exception to Lite's no-ledger default. Grounding is to research what tests are to code; the registry-at-every-tier rule mirrors G1 (no commit without approval is universal). Phase R keeps Lite's light *process* (no per-stage retros, per-PR approval, no milestone machinery) **except** this file. The **no-fabricated-citation gate `G_RP_R1` is mandatory regardless of tier.**

## Append-only rule (HARD)

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4). **No prior row may be edited, reordered, or deleted.** A source, once logged, is permanent — a correction is a *new* row that references the prior id.

Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory; honor-system at the Lite default): prior committed content must remain a byte-prefix of the current file, so prior rows stay byte-identical to their committed state. This is the **same** check that guards `docs/gap-analysis.md`, `docs/tech-debt.md`, and `docs/off-track-log.md` — the registry simply joins that workflow's `LEDGERS` set; **there is no separate workflow.**

### Why append-only

The registry's value is forensic and load-bearing. A reader (or `validate-sources.cjs`) trusts that the id a finding cites points at a source that was *actually retrieved*, on a date, supporting a stated claim. Rewriting a row would let a citation be retrofitted onto a source that never said what the finding claims — exactly the ungrounded-claim failure grounded STORM exists to kill. The source must be logged *before* the finding cites it.

---

## Row shape

Each source gets one row. The **id** is the citation marker the paper uses (`[S001]`); it must be unique and never reused.

| Field | Meaning |
|---|---|
| **id** | `S001`, `S002`, … — the stable citation marker (zero-padded, never reused). |
| **citation** | Human-readable citation (author / title / year, or dataset name). |
| **url/ref** | The retrievable URL or reference where it was found. |
| **retrieved** | `YYYY-MM-DD` the source was actually fetched/read. |
| **perspective(s)** | Which discovered camp(s)/stakeholder(s) (from R1) this source speaks for. |
| **what it supports** | The specific claim(s) this source grounds — what a finding citing it may assert. |

---

## Registry

| id | citation | url/ref | retrieved | perspective(s) | what it supports |
|---|---|---|---|---|---|
| S001 | {{Author Year — title}} | {{https://… or dataset ref}} | {{YYYY-MM-DD}} | {{perspective from R1}} | {{the claim this source grounds}} |

<!--
Append new sources below the last row. Newest at the bottom. Do NOT edit prior
rows — a logged source is permanent; a correction is a NEW row referencing the
prior id in its "what it supports" cell. The id in column 1 is the marker the
paper cites as [S001]; validators/validate-sources.cjs binds every [S###] in the
paper to a row here.
-->

---

*Paired with `sbak/templates/PAPER-TEMPLATE.md` (every finding cites a row here), `docs/contradiction-map.md` (R3 — conflicting rows tagged by id), and `validators/validate-sources.cjs` (the G_RP_R1 binding check).*
