# {{PROJECT_NAME}} — Phase R (Research): the grounded-STORM protocol

> The task list for the research half of a `research_publish` project. **Phase R is a Lite *process* task-list doc — not XML stage prompts** (Phase R is light process; the existing work/verifier brains run it). Run the five steps R1→R5 in order; each emits a checkable artifact. **The one ledger Phase R keeps regardless of tier is `docs/sources/registry.md`** (grounded STORM).
>
> **What "grounded" means.** The original STORM technique simulates expert *personas* asking each other questions — which lets the model answer from its own weights ("author from inference"), the exact failure the kit kills everywhere else. **Grounded STORM instead discovers the real perspectives by search and binds every claim to a logged, retrieved source — *no source → no claim*.** That single rule is what makes the no-fabricated-citation gate (`G_RP_R1`) enforceable rather than aspirational. The research analogue of App-Map's test-id binding and `bug_fix`'s impact analysis.

---

## The research engine

Where the harness **`deep-research`** skill is present, use it as the engine for R1, R2, and R5 — it already does fan-out web search → fetch → adversarial verify → cited report, which is exactly the grounded-STORM loop. Where it is absent, fall back to native **WebSearch** + **WebFetch** (fan out queries, fetch the actual sources, log each). Either way the discipline is identical: **a claim enters the paper only through a source logged to `docs/sources/registry.md`.**

---

## R1 — Perspective discovery (*by search, not invention*)

- **Input:** the research question (`spec/research-question-spec.md` → `docs/research-question-spec.md`).
- **Do:** search to find the **actual camps, stakeholders, and schools of thought** active on this question — proponents, skeptics, practitioners, regulators, affected groups, dissenting researchers. **Discover them by search; do NOT invent plausible-sounding personas** (that is ungrounded persona-simulation — the failure mode grounded STORM rejects). Record each perspective with the source that evidences it exists.
- **Grounding rule:** every perspective you list is one a real source attests to. Log those sources to the registry as you find them.
- **Output:** a short list of **≥3 perspectives (default 5)**, each named, each with a registry source. (This count is what `G_RP_R3` checks.)

## R2 — Sourced multi-perspective Q&A (*answer only from retrieved sources*)

- **Input:** the R1 perspective list.
- **Do:** for each perspective, generate the questions that perspective would press, then **answer each question only from a retrieved source** — fetch it, read it, and **log it to `docs/sources/registry.md`** (id, citation, url, retrieved-date, perspective, what-it-supports) before the answer counts. *No source → no claim:* if you cannot find a source, the answer is "no source addressed this" — that becomes an R3 blind-spot, not an inferred answer.
- **Grounding rule:** the registry grows in this step. Every answer you keep is traceable to a row in it.
- **Output:** per-perspective sourced answers, every one bound to a registry id.

## R3 — Contradiction & gap map

- **Input:** the R2 sourced answers.
- **Do:** lay the sourced claims side by side. Where they **conflict**, record both sides — *each tagged with its citations*. Record the **cross-perspective consensus** (claims multiple perspectives' sources agree on). Record the **blind-spots**: questions *no* source addressed (the "no source addressed X" finding from R2).
- **Output:** `docs/contradiction-map.md` (from `templates/contradiction-map.md`).

## R4 — Synthesis (*the paper draft + findings-to-illustrate*)

- **Input:** the registry, the R2 answers, the contradiction map.
- **Do:** draft the paper from `templates/PAPER-TEMPLATE.md`. **Every finding carries an inline citation marker (`[S001]`) resolving to a registry id** — `validators/validate-sources.cjs` enforces this. Then extract `docs/findings-to-illustrate.md`: which findings most warrant interactive illustration, and in what form — the concrete handoff that opens Phase A (`G_RP_R2`).
- **Grounding rule:** a finding with no citation is not a finding yet — source it or cut it.
- **Output:** `docs/paper/<paper-title>.md` + `docs/findings-to-illustrate.md`.

## R5 — Adversarial peer review (*in fresh context — the Stage-V bias guard*)

- **Input:** the paper draft + the registry (read in a **fresh session**, deliberately *not* the Phase-R working context — the same bias guard Stage V uses).
- **Do:** re-verify the contested claims against the sources they cite (does the source actually say it?). Flag **uncited claims**, **over-represented sources/perspectives** (one source or camp carrying too much of the paper), and **a missing angle** (a perspective or question the paper should have covered). This is adversarial review — *not* "rate your own confidence."
- **Grounding rule:** R5 is the **judgement half** of `G_RP_R1`; `validators/validate-sources.cjs` is the **mechanical half**. Both must pass.
- **Output:** review notes + any registry/paper corrections (as *new* rows / edits to the draft, never rewrites of logged sources).

---

## Phase R done → re-tier to Phase A

When R5 passes and `docs/findings-to-illustrate.md` exists, Phase R is complete. The transition to **Phase A** (building the interactive app) is an **explicit, user-driven re-tier** — never automatic. The agent surfaces: *"given the findings you want to illustrate, here's what the app needs to do → that suggests `<tier>`; confirm or revise."* Phase A then runs at the chosen tier and **inherits Stage V**. (See `BUILD-PLAYBOOK.md` §3.9.)

---

*Grounded STORM. The registry is mandatory at every tier; `G_RP_R1` is mandatory regardless of tier. Phase R stays Lite-process-locked; only Phase A re-tiers.*
