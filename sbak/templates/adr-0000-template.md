# ADR-NNNN: {{Decision title}}

> {{One-sentence summary of the decision.}}

---

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
**Date:** YYYY-MM-DD
**Deciders:** {{names or roles}}
**Milestone:** M[NN] (the milestone in which this decision was made or applied)

---

## Context

{{What's the situation? What forces are at play? What constraints (technical, organizational, regulatory) bound the decision space? Two to four paragraphs. The reader six months from now should be able to understand why this was even a question.}}

---

## Options considered

### Option A: {{Name}}

{{One-paragraph description.}}

**Pros:**
- {{pro 1}}
- {{pro 2}}

**Cons:**
- {{con 1}}
- {{con 2}}

### Option B: {{Name}}

{{One-paragraph description.}}

**Pros:**
- {{pro 1}}

**Cons:**
- {{con 1}}

### Option C: {{Name}} (if applicable)

{{...}}

---

## Decision

**We chose: Option {{X}}.**

{{One to three paragraphs explaining the rationale. Be specific: what trade-offs did we accept? What did we give up? What did we gain?}}

---

## Consequences

### Positive

- {{What gets easier or better as a result}}
- {{What new capabilities are unlocked}}

### Negative

- {{What gets harder, or what we accept as a cost}}
- {{What we now have to maintain that we didn't before}}

### Neutral

- {{Things that change but are neither clearly better nor worse — track them}}

---

## Implementation notes

{{Specific files, modules, or commits where this decision shows up. What tests guard the decision. What follow-up work this implies (and which milestone it lands in).}}

- Affects: `{{file/module path}}`, `{{file/module path}}`
- Tests guarding: `{{test path or description}}`
- Follow-up: {{tracked in M[NN+X] / never / on incident only}}

---

## Related

- Spec: `spec/project-spec.md` §{{section}}
- Phase doc(s) that touch this decision: {{list}}
- Prior ADRs this builds on: ADR-NNNN, ADR-NNNN
- Prior ADRs this supersedes: ADR-NNNN (if any)
- External references: {{URLs, papers, blog posts that informed the decision}}

---

## Revisit triggers

This decision should be revisited if:

- {{Concrete signal that would invalidate the assumptions}}
- {{Concrete signal #2}}
- A new ADR proposes superseding this one (in which case this one moves to Superseded status; it does not get edited)

---

*ADRs are not edited after acceptance. They're superseded by new ADRs that cite them. The chain stays intact.*
