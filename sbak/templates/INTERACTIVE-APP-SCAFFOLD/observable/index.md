---
title: {{PROJECT_NAME}}
---

# {{PROJECT_NAME}}

This interactive article illustrates findings from `docs/paper/{{PAPER_TITLE}}.md`
(the paper produced in Phase R by grounded STORM). The paper's §5 Illustrations
references this app in return — the two are paired deliverables (**G_RP_A1**).

Every claim binds to a logged source in `docs/sources/registry.md` — grounded
STORM's *no source → no claim* rule. Inline `[S###]` markers resolve to that
registry.

## F1 — {{finding headline}} [S001]

{{One sentence restating the finding the reader is about to explore.}}

```js
// Replace with the real chart / widget. Load data from in-repo files so the
// figure is reproducible (G_RP_A2) — not from a one-off local run.
const data = FileAttachment("data/findings.csv").csv({typed: true});
```

```js
Inputs.table(data)
```

```js
// A reader-driven control illustrating the finding.
const parameter = view(Inputs.range([0, 100], {value: 50, step: 1, label: "{{parameter}}"}));
```

```js
display(html`Illustrated result for parameter = ${parameter}: {{compute / plot}}`);
```

---

**Reproducibility (G_RP_A2):** the data (`data/`) and the transformations behind
these figures are reproducible from this repo. Sources: `docs/sources/registry.md`.
Paper: `docs/paper/{{PAPER_TITLE}}.md`.
