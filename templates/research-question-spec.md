# {{PROJECT_NAME}} — Research Question Spec

> For a `research_publish` project this **replaces `spec/project-spec.md`**. It frames the *research question* — what is being synthesized and why — not a software specification. The interactive app's spec (if it needs one beyond the findings-to-illustrate list) is authored at the Phase-A re-tier, at whatever tier the app warrants. Phase R works from this document; grounded STORM (`PHASE-R-DOC.md`) takes the question in §1 as its R1 input.

---

## 1. Research question

{{The exact question Phase R will answer, in one or two sentences. Sharp enough that R1 can search for the camps that disagree about it, and R4 can judge whether a finding answers it.}}

## 2. Scope

- **In scope:** {{the body of literature / data / domain the synthesis covers}}.
- **Out of scope:** {{what this deliberately does not cover — just as load-bearing}}.
- **Time / domain bounds:** {{e.g. "post-2020 sources only", "EU regulatory context"}}.

## 3. Why — the deliverable pair

The output is a **paper + interactive app** pair (the distinguishing feature of `research_publish`). State who the reader is and what they should be able to *do* after reading + interacting.

- **Paper:** {{what the white paper documents}}.
- **App (Phase A):** {{the kind of interactive illustration envisioned — refined into `docs/findings-to-illustrate.md` at end of Phase R, and re-tiered there}}.

## 4. Grounding commitment (G_RP_R1)

This project runs **grounded STORM**: every claim in the paper binds to a source logged in `docs/sources/registry.md` — *no source → no claim*. The registry is mandatory at every tier; `validators/validate-sources.cjs` enforces the binding. Perspectives are **discovered by search** (R1), not invented. This is a non-negotiable of the mode, recorded here so it is in scope from the start.

## 5. Success criteria

- {{e.g. "≥5 perspectives discovered and sourced (G_RP_R3)"}}
- {{e.g. "every finding cites ≥1 registry source; R5 finds no uncited claim (G_RP_R1)"}}
- {{e.g. "a findings-to-illustrate list exists before Phase A opens (G_RP_R2)"}}
- {{e.g. "the app references the paper and vice-versa (G_RP_A1); data is reproducible from the repo (G_RP_A2)"}}

## 6. Open questions

{{Anything unresolved about the question, scope, or intended app. Phase R may answer some of these; flag the rest for the re-tier conversation.}}

---

*`research_publish` Phase R input. Replaces `spec/project-spec.md`. Paired with `PHASE-R-DOC.md` (the protocol), `docs/sources/registry.md` (the grounding ledger), and the Phase-A re-tier (BUILD-PLAYBOOK §3.9).*
