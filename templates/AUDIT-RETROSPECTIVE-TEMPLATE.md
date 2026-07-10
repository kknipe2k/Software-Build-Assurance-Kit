# Audit Pass Retrospective — P{{N}} / C{{N}} ({{DIMENSION}})

> Filled by Claude during/after an audit pass (or challenge). Distinct from work-stage and verifier retrospectives — an audit pass produces *findings*, so this is brief and asks whether the **review itself** was sound. The findings live in `retrospectives/audit/P{{N}}-findings.md`; this is the meta-evaluation. Mirrors `VERIFIER-RETROSPECTIVE-TEMPLATE.md` for the audit ceremony.

---

## Live observation log [LIVE]

Filled in real time as friction surfaces. Severity 1–5 (5 = couldn't proceed).

| Time | Event | Severity |
|---|---|---|
|  |  |  |

Common events to log:

- A triaged file couldn't be located or had changed since INVENTORY.md (Phase-S drift)
- The dimension boundary was ambiguous — a finding could belong to this pass or another
- A finding's severity was hard to call (downgrade smell — log it rather than quietly lower)
- The checklist had a gap the persona caught but the list didn't name (graduate to P{{N}}'s checklist)
- (Challenge only) the urge to read the original session's reasoning surfaced (G_AUDIT_C1 pressure)

---

## Review soundness [END]

Score 1–5 (5 = clean; 1 = the pass could not actually evaluate the dimension).

- Did **every** CRITICAL/MODERATE triaged file get a per-file result (findings or "No Issues")? Score: __
- Were "No Issues" sign-offs *earned* (the file was actually read), not rubber-stamped to clear the list? Score: __
- Did the review stay inside the {{DIMENSION}} scope (cross-cutting smells parked, not chased)? Score: __
- Were severities called honestly (no padding the 🔴 list, no downgrading to keep it clean)? Score: __
- (Challenge only) Did it find what the pass MISSED, reading only the prior findings file? Score: __

---

## Threshold gates

- **G1 (do-not-commit)**: ☐ held / ☐ violated (date + commit if violated)
- **G_AUDIT_P1 (per-file sign-off)**: ☐ every triaged file signed off / ☐ violated (files skipped: ____)
- **G_AUDIT_C1 (challenge independence)** *(challenge only)*: ☐ read only prior-pass output / ☐ violated (read original session context)
- **G_AUDIT_OUT (coverage caveat)**: ☐ findings report names dimensions audited + NOT audited / ☐ missing
- **No new role**: ☐ ran as `role: verifier`, no `audit_pass_N` mode introduced

---

## Outcome

Pick one:

- ☐ **Sound** — per-file sign-off complete, caveat present, severities honest → feeds consolidation
- ☐ **Incomplete** — triaged files left un-touched; re-run the pass before consolidation
- ☐ **Disputed** *(challenge)* — severity disagreements logged for the consolidation step to adjudicate

---

## Decisions for the next pass / consolidation

Specific, citing file:line + the dimension + the checklist item or triage row.

-

---

## Sign-off

- **Date:**
- **Pass / challenge:** {{P{{N}} | C{{N}}}} — {{DIMENSION}}
- **Session URL:** https://claude.ai/code/session_<id>
