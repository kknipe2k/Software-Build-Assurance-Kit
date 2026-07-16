# Audit Review Plan — S3 (the pass plan)

> Produced by Phase S, step S3 (`operating_mode: audit`). Reads `INVENTORY.md` + `TRIAGE.md` and lays out **which dimensions are reviewed, in what order, with which challenge reviews**, scaled to tier. This is the audit mode's analogue of a Phase doc — it replaces `docs/build-prompts/M[NN]-*.md` (audit has phases, not milestones). Lives at `docs/audit/REVIEW_PLAN.md`. Each pass prompt reads its entry here.

---

## Tier-conditional pass selection

> The default shape per tier (per `proposals/OPERATING-MODES.md` §5.6; override in the plan with a logged reason). Tier comes from `project-config.md`.

| Tier | Dimensions | Setup | Challenge reviews |
|---|---|---|---|
| **Lite** | 1–2 (e.g. just security, just performance) | Skip S2 triage; run on full in-scope set | Skip challenge reviews |
| **Standard** | 3–4 chosen from the 8 | Full setup (S1 inventory + S2 triage + S3 plan) | Challenge the **security-focused** passes only |
| **Full** | All 8 | Full setup | Challenge **every** pass; consolidation produces a ranked remediation backlog |

**This audit's tier:** {{Lite | Standard | Full}} — **dimensions selected:** {{e.g. P1, P2, P3, P8}}.

---

## The pass plan (this run)

> One row per pass that will run. The challenge column reflects the tier rule above. Per-file sign-off (G_AUDIT_P1) is mandatory for every pass; the tier-coverage caveat (G_AUDIT_OUT) is mandatory for every findings file.

| Order | Pass | Dimension | Persona (one-line) | Triaged files (CRITICAL+MODERATE) | Challenge? | Findings → |
|---|---|---|---|---|---|---|
| 1 | P1 | IPC | sec engineer, trust boundaries | {{n}} | ☐ yes / ☐ no | `retrospectives/audit/P1-findings.md` |
| 2 | P2 | Secrets | secrets/credential reviewer | {{n}} | ☐ yes / ☐ no | `retrospectives/audit/P2-findings.md` |
| … | … | … | … | … | … | … |

---

## Phase order

1. **Phase S (done):** S1 INVENTORY → S2 TRIAGE → S3 this plan.
2. **Phase P:** the passes above, each a fresh `role: verifier` session reading INVENTORY + this-dimension TRIAGE + this entry (no new role).
3. **Phase C:** the challenge reviews marked above, each a fresh session reading **only** the prior pass's findings file (G_AUDIT_C1).
4. **Consolidation:** read all `P[N]-findings.md` + `C[N]-challenge.md` → `retrospectives/audit/FINAL_REVIEW.md` (dedup, severity rank, disputed findings, and — at Full — the ranked remediation backlog).

**Note:** audit has **no Stage V and no milestones** — audit *is* verification (per-file sign-off + challenge are its internal verification); the existing codebase is the spec.

---

## Out of scope for this audit

> What this plan deliberately does NOT cover (feeds the G_AUDIT_OUT coverage caveat in every findings file).

- Dimensions not selected: {{the passes from the 8 not run at this tier}}
- {{any EXCLUDED surfaces from INVENTORY.md the plan also won't trace}}
