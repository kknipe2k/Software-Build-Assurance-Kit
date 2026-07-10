# {{PROJECT_NAME}} — Identity

> The canonical "what this is / what this isn't" for {{PROJECT_NAME}}. Read first in every session before writing code.

---

## What this is

{{ONE_TO_TWO_PARAGRAPH_DESCRIPTION_CONCRETE_AND_SPECIFIC}}

## What this isn't

{{NEGATION_PARAGRAPH_NAMING_WHAT_THIS_IS_NOT_AND_WHY_THAT_BOUNDARY_MATTERS}}

The negation matters. It kills out-of-scope contributions before they're written. If a proposed change reads like one of the things in "what this isn't," surface it for explicit override before proceeding.

---

## Stack (locked)

- **{{STACK_LAYER_1_NAME}}:** {{STACK_LAYER_1_VALUE}}
- **{{STACK_LAYER_2_NAME}}:** {{STACK_LAYER_2_VALUE}}
- **{{STACK_LAYER_3_NAME}}:** {{STACK_LAYER_3_VALUE}}
- **{{STACK_LAYER_N_NAME}}:** {{STACK_LAYER_N_VALUE}}

Stack rationale lives in **ADR-{{ADR_NUMBER}}**.

Stack changes require a new ADR superseding the prior one. The current stack is treated as locked unless an ADR explicitly opens it.

---

## License

**{{LICENSE_NAME}}.** {{LICENSE_DETAILS_CONTRIBUTOR_AGREEMENT_DCO_ETC_OR_NA}}

See `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` if present.

---

## Status

**{{STATUS_LINE}}** (e.g., "pre-implementation", "M02 in progress", "v0.3 shipped").

- **Last shipped:** {{LAST_SHIPPED_OR_NONE}}
- **Active milestone:** {{ACTIVE_MILESTONE_OR_NONE}} — see `docs/build-prompts/{{ACTIVE_MILESTONE_PHASE_DOC}}.md`
- **Next milestone after this:** {{NEXT_MILESTONE_OR_NONE}}

Update at every milestone closeout (Stage E).

---

## Read-first list (orient before any work)

In a fresh session, read these in order before writing any code or making decisions:

| # | File | Read for |
|---|---|---|
| 1 | `CLAUDE.md` | The constants — protocol, gates, anti-patterns, decision rules |
| 2 | `docs/identity.md` (this file) | What the project is and isn't; stack; key terms |
| 3 | `BUILD-PLAYBOOK.md` | The methodology — four layers, three constraints, per-stage loop |
| 4 | `persistence-architecture.md` | The layer model — where each artifact lives, who reads/writes when |
| 5 | `PROCESS-VALIDATION.md` | The scoring framework — three axes, threshold gates, outcome matrix |
| 6 | `docs/scope.md` | The phased milestone scope; what's in/out per version |
| 7 | `docs/gates.md` | The gate matrix indexed by milestone |
| 8 | `docs/build-prompts/M[N]-*.md` | The active milestone (if applicable) |
| 9 | `spec/project-spec.md` (relevant sections) | Whatever the active milestone touches |
| 10 | `docs/style.md` | Stack-specific style and naming conventions |
| 11 | `docs/gotchas.md` | Project-specific traps that have bitten before |
| 12 | `docs/adr/` | ADRs by topic; at minimum any flagged in the active milestone's references |

---

## Key terms (project glossary)

Define project-specific terms here so every contributor uses them consistently. Add as terms emerge; remove only when the concept itself is removed.

| Term | Meaning |
|---|---|
| {{TERM_1}} | {{DEFINITION_1}} |
| {{TERM_2}} | {{DEFINITION_2}} |
| {{TERM_N}} | {{DEFINITION_N}} |

---

*This file is the project's elevator pitch and orientation in one. If a new contributor reads only this file, they should be able to tell whether their proposed change fits.*
