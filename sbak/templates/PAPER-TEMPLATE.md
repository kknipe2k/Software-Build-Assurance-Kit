# {{PAPER_TITLE}}

> {{PROJECT_NAME}} — white paper (Phase R / grounded STORM output). **Every finding carries an inline citation marker — `[S001]` — that resolves to a row in `docs/sources/registry.md`.** `validators/validate-sources.cjs` fails the paper if any `[S###]` marker names an id absent from the registry: *no source → no claim* (G_RP_R1). A finding with no citation is not a finding yet — source it or cut it.

---

## Abstract

{{One paragraph: the question, the method (grounded STORM), the headline findings — each headline still cites its source, e.g. [S001].}}

## 1. Introduction

{{Why this question matters; what the reader will get.}}

## 2. Research question

{{The exact question, restated from `docs/research-question-spec.md`. Scope: what's in, what's out.}}

## 3. Method — grounded STORM

This paper was produced by the grounded-STORM protocol (`PHASE-R-DOC.md`): perspectives discovered by search (R1), questions answered only from retrieved sources logged to the registry (R2), a contradiction map (R3, → `docs/contradiction-map.md`), this synthesis (R4), and adversarial peer review in fresh context (R5). Every claim below binds to `docs/sources/registry.md`.

**Perspectives surveyed (R1):** {{list the ≥3 discovered camps, each citing the source that attests it — [S00X]}}.

## 4. Findings

> Each finding is one claim + its citation(s). The citation marker `[S###]` must resolve to a registry id.

- **F1 — {{finding}}.** {{the claim, stated precisely}} [S001].
- **F2 — {{finding}}.** {{claim}} [S002].
- **F3 — {{contested finding}}.** {{claim}}; the opposing view holds {{counter}} — see `docs/contradiction-map.md` [S001][S003].

## 5. Illustrations

{{Which findings the interactive app illustrates, and how. Mirrors `docs/findings-to-illustrate.md`. Each carries the cross-reference: "see the interactive app at {{URL}}" (G_RP_A1).}}

## 6. Discussion

{{What the synthesis means; the consensus (R3); the blind-spots — questions no source addressed; limits of the evidence (over-represented sources/perspectives flagged in R5).}}

## 7. Sources

The full registry is `docs/sources/registry.md` (append-only; one row per source). Inline `[S###]` markers above resolve to it. This section may summarize, but the registry is canonical — it is what `validators/validate-sources.cjs` checks against.

---

*Paired with the interactive app (G_RP_A1: this paper references the app; the app references this paper) and `docs/sources/registry.md` (G_RP_R1: every finding cites a logged source).*
