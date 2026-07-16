# Audit Pass Findings — P{{N}} / C{{N}} ({{DIMENSION}})

> Filled by Claude during an audit pass (or its challenge). The output artifact for `<output_format>` per `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7. Consolidation reads all `P[N]-findings.md` + `C[N]-challenge.md` into `retrospectives/audit/FINAL_REVIEW.md`. **Findings, not fixes** — remediation is a separate, deliberate follow-up scoped to this report.

---

## Coverage caveat — read first

> ⚠️ **This audit ran at {{TIER}} tier; this is the {{DIMENSION}} pass only.**
>
> **Dimensions audited (this run):** {{DIMENSIONS_AUDITED}}
> **Dimensions NOT audited:** {{DIMENSIONS_NOT_AUDITED}}
> **This pass covered:** {{DIMENSION}} — {{one-line scope}}
> **Challenge review:** ☐ run / ☐ not run (Lite skips; Standard challenges security passes; Full challenges all)
>
> "Audit passed" means the dimensions above found no unresolved 🔴 — **not** that the codebase is free of all defect classes. Dimensions not audited remain unreviewed. Re-run at a higher tier (more dimensions + challenge reviews) if you need broader assurance. (G_AUDIT_OUT.)

**This caveat is mandatory and must not be removed.** Tier-coverage honesty is the difference between a useful audit and assurance theater.

---

## Pass frame

- **Pass / challenge:** {{P{{N}} | C{{N}}}} — {{DIMENSION}}
- **Persona:** {{the expert lens this pass reviewed through}}
- **Tier:** {{Lite | Standard | Full}}
- **Triaged files in scope (from TRIAGE.md):** {{N}} CRITICAL, {{N}} MODERATE
- **Session URL:** https://claude.ai/code/session_<id>

---

## Severity rubric

| Marker | Level | Meaning |
|---|---|---|
| 🔴 | Critical / High | Exploitable hole, data-loss, or correctness defect that bites in normal use. Blocks the remediation gate. |
| 🟡 | Medium / Low | Real problem, bounded impact, or a latent bug needing an uncommon trigger. Fix soon; not a blocker alone. |
| 🟢 | Informational / Tech-debt | Quality / maintainability / hardening opportunity. Track, don't gate. → `docs/tech-debt.md`. |

When unsure between two levels, state the impact, pick the lower, say what would raise it. Don't pad the 🔴 list.

---

## Per-file sign-off (G_AUDIT_P1 — mandatory, no silent skips)

> Every CRITICAL/MODERATE file from this dimension's TRIAGE.md appears **exactly once** below — with findings or with an explicit **"No Issues"** sign-off. No group sign-offs. A row left blank is an incomplete pass.

| # | File | Triage class | Result | Finding IDs (if any) |
|---|---|---|---|---|
| 1 | `path/to/file.ext` | CRITICAL | 🔴 findings | {{DIM}}-001 |
| 2 | `path/to/other.ext` | MODERATE | ✅ No Issues | — |
| … | … | … | … | … |

**Sign-off tally:** {{N}} triaged files · {{N}} with findings · {{N}} "No Issues" · **0 skipped**.

---

## Findings

> Every finding is concrete and located, evidence-bearing, and marked confirmed vs. suspected. No fabrication.

### [🔴|🟡|🟢] {{DIM}}-001 — {{one-line title}}

- **Location:** `path/to/file.ext:line` (+ related locations)
- **Dimension / pass:** {{DIMENSION}} (P{{N}})
- **Confidence:** ☐ confirmed (traced) / ☐ suspected (smells wrong, not fully verified)
- **What:** {{what the code does — relevant snippet or paraphrase}}
- **Why it matters:** {{concrete impact — what breaks, what an attacker gains, what a maintainer trips on}}
- **Recommendation:** {{the specific change that resolves it — described, not applied}}
- **Disputed?** {{challenge only: original severity vs. challenge severity, if they disagree}}

{{repeat per finding; IDs sequential per dimension, e.g. IPC-001, SEC-003}}

---

## Cross-file traces

For findings that span files (data crossing a {{DIMENSION}} boundary):

| # | Trace | Source | Sink | Severity |
|---|---|---|---|---|
| 1 | {{e.g. untrusted IPC payload → unsanitized path → fs.read}} | `a.ts:12` | `b.ts:88` | 🔴 |

---

## Pass summary

- **🔴 Critical:** {{COUNT}}
- **🟡 Important:** {{COUNT}}
- **🟢 Tech-debt:** {{COUNT}} (→ `docs/tech-debt.md`)
- **Files signed off:** {{N}} / {{N}} triaged (must be equal — G_AUDIT_P1)
- **For consolidation:** {{anything the FINAL_REVIEW dedup / severity-rank / disputed-findings step should know}}
