# {{PROJECT_NAME}} — Phased Scope

> What v{{CURRENT_VERSION}} contains, what it doesn't, and how it breaks into milestones. Source of truth for milestone planning. Changes require an ADR.

---

## Release scope matrix (v{{CURRENT_VERSION}})

| Capability | In v{{CURRENT_VERSION}} | Deferred to | Rationale |
|---|---|---|---|
| {{CAPABILITY_1}} | ✅ | — | {{RATIONALE_1}} |
| {{CAPABILITY_2}} | ⚠️ partial | v{{NEXT_VERSION}} | {{RATIONALE_2}} |
| {{CAPABILITY_3}} | ❌ | v{{NEXT_VERSION}} | {{RATIONALE_3}} |
| {{CAPABILITY_N}} | ❌ | v{{LATER_VERSION}} | {{RATIONALE_N}} |

The matrix is the contract. PRs that add ❌-marked capabilities get queued, not merged. Adding capabilities means equivalent removals or pushing to the next version.

---

## Success criteria for v{{CURRENT_VERSION}}

v{{CURRENT_VERSION}} ships when:

1. {{SUCCESS_CRITERION_1}}
2. {{SUCCESS_CRITERION_2}}
3. {{SUCCESS_CRITERION_3}}
4. All milestones (M01 through M{{LAST_MILESTONE_NUMBER}}) have shipped with passing gap-analysis sign-offs.

---

## Milestones

Milestones are sequenced. Each milestone produces a PR; PRs merge in order. Each milestone is small enough to ship in roughly 1–2 weeks of focused work.

### M01 — {{M01_TITLE}}

**Goal:** {{M01_ONE_LINE_GOAL}}

**Acceptance criteria:**
1. {{M01_AC_1}}
2. {{M01_AC_2}}
3. {{M01_AC_3}}

**Depends on:** none (first milestone).

**Stages:** A ({{M01_A_TITLE}}) · B ({{M01_B_TITLE}}) · C ({{M01_C_TITLE}}) · D ({{M01_D_TITLE}}) · E (closeout).

Phase doc: `docs/build-prompts/M01-{{M01_SLUG}}.md`.

---

### M02 — {{M02_TITLE}}

**Goal:** {{M02_ONE_LINE_GOAL}}

**Acceptance criteria:**
1. {{M02_AC_1}}
2. {{M02_AC_2}}
3. {{M02_AC_3}}

**Depends on:** M01 ({{M01_DEPENDENCY_REASON}}).

**Stages:** A ({{M02_A_TITLE}}) · B ({{M02_B_TITLE}}) · C ({{M02_C_TITLE}}) · D ({{M02_D_TITLE}}) · E (closeout).

Phase doc: `docs/build-prompts/M02-{{M02_SLUG}}.md`.

---

### M03 — {{M03_TITLE}}

**Goal:** {{M03_ONE_LINE_GOAL}}

**Acceptance criteria:**
1. {{M03_AC_1}}
2. {{M03_AC_2}}

**Depends on:** M02 ({{M02_DEPENDENCY_REASON}}).

**Stages:** A · B · C · D · E (closeout).

Phase doc: `docs/build-prompts/M03-{{M03_SLUG}}.md` (authored at M02 closeout).

---

<!-- Add M04, M05, ... as the project plan grows. Keep them small. If a milestone has more than 5 work stages or more than 6 acceptance criteria, split it. -->

### M{{LAST_MILESTONE_NUMBER}} — {{LAST_MILESTONE_TITLE}}

**Goal:** {{LAST_MILESTONE_GOAL}}

**Acceptance criteria:**
1. {{LAST_AC_1}}
2. {{LAST_AC_2}}

This is the final milestone for v{{CURRENT_VERSION}}. After M{{LAST_MILESTONE_NUMBER}} ships and its gap-analysis entry signs off, v{{CURRENT_VERSION}} is released.

---

## Out of scope (explicitly deferred)

These are tracked deliberately so that proposals to add them get evaluated against this list first.

- {{OUT_OF_SCOPE_ITEM_1}} — deferred to v{{VERSION}}; rationale: {{REASON}}
- {{OUT_OF_SCOPE_ITEM_2}} — deferred to v{{VERSION}}; rationale: {{REASON}}
- {{OUT_OF_SCOPE_ITEM_N}} — deferred indefinitely; rationale: {{REASON}}

Items can move from this list into a milestone via ADR.

---

## Cross-milestone constraints

Constraints that apply across all milestones in v{{CURRENT_VERSION}}:

- {{CROSS_CONSTRAINT_1}}
- {{CROSS_CONSTRAINT_2}}
- {{CROSS_CONSTRAINT_N}}

These are scope-locks at the project level. Stage CLI prompts may reference them via `<scope_locks ref="docs/scope.md" section="Cross-milestone constraints"/>`.

---

*This document is the milestone-level contract. The spec describes what each milestone builds; this document describes how it sequences.*
