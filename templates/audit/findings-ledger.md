# {{PROJECT_NAME}} — Audit Findings Ledger

> Append-only **consolidated** record of every confirmed audit finding across all dimension passes (P1–P8) and their challenges (C1–C8). One row per finding: its id, the dimension that found it, the location, the severity, and the remediation status. This is the durable backlog the audit produces — the "what to fix, in what order" view that outlives any single pass session. **Findings, not fixes** — remediation is a separate, deliberate follow-up scoped to this ledger.
>
> This ledger is the *consolidated* surface. The raw per-pass output lives in `retrospectives/audit/P[N]-findings.md` (+ `C[N]-challenge.md`); the consolidation step dedups across passes, ranks by severity, and lands each surviving finding here as one row. It is on the audit read-first list (`read-first-list-audit.txt`) so a later pass or the consolidation step sees what already landed and doesn't re-litigate it.

---

## Append-only rule (HARD)

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4). **No prior entry may be edited, reordered, or deleted.**

Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory): prior committed content must remain a byte-prefix of the current file, so prior entries stay byte-identical to their committed state. This is the **same** check that guards `docs/gap-analysis.md` and `docs/tech-debt.md` — the findings ledger simply joins that workflow's `LEDGERS` set; there is no separate workflow.

### Why append-only

The ledger's value is forensic. A logged 🔴 must not be quietly downgraded to 🟢 (or deleted) to make a report look cleaner than the codebase is. **Rewriting it would let assurance theater be retroactively laundered into a clean bill of health** — exactly the failure the per-file sign-off and tier-coverage caveat exist to prevent. Status *progresses* by appending a new status-change row that references the finding id; the original finding row stays byte-identical to its committed state.

At **Lite** tier there is no separate ledger — the findings collapse into the single `AUDIT-FINDINGS.md` / `CHANGELOG.md` summary instead (the same way gap-analysis collapses into CHANGELOG at Lite).

---

## Severity rubric

| Marker | Level | Meaning |
|---|---|---|
| 🔴 | Critical / High | Exploitable hole, data-loss, or correctness defect that bites in normal use. Blocks the remediation gate. |
| 🟡 | Medium / Low | Real problem, bounded impact, or a latent bug needing an uncommon trigger. Fix soon; not a blocker alone. |
| 🟢 | Informational / Tech-debt | Quality / maintainability / hardening opportunity. Track, don't gate. → `docs/tech-debt.md`. |

---

## Entry shape

Each finding is one row. The `dimension` is the pass that found it (IPC / secrets / error-handling / data-flow / performance / packaging / compliance / architecture); the `severity` uses the rubric above; the `status` is one of `open` / `in-progress` / `fixed` / `wont-fix (waived)` / `disputed`.

| id | dimension | file:line | severity | confidence | status | one-line |
|---|---|---|---|---|---|---|
| IPC-001 | IPC | `src/main/ipc.ts:42` | 🔴 | confirmed | open | unsanitized IPC payload reaches `fs.read` |
| SEC-001 | secrets | `.env.example:3` | 🟡 | confirmed | open | real-looking API key in a committed example |

> A status change is itself an **append** — add a dated row in the status log below that names the finding id; never edit the finding's original row.

---

## Findings

<!--
Append new finding rows to the table above (newest at the bottom of the table),
and any status changes to the status log below. Do NOT edit a prior finding row
— a logged finding, once consolidated, is permanent. IDs are sequential per
dimension (IPC-001, SEC-002, …); they match the per-pass retrospectives/audit/
P[N]-findings.md ids so the consolidated row traces back to its source pass.
-->

## Status log (append-only)

<!--
Each remediation step is one dated row referencing the finding id. Example:

- 2026-06-21 · IPC-001 → in-progress · fix scoped (input allowlist at the IPC boundary)
- 2026-06-23 · IPC-001 → fixed · PR #42; regression test added
- 2026-06-23 · SEC-001 → wont-fix (waived) · example key is a documented placeholder; see waiver ADR in docs/adr/
-->

---

## Coverage caveat — read first

> ⚠️ This ledger lists the findings the audit **found**, at the tier it ran. It is **not** a guarantee the codebase is free of all defect classes. The dimensions audited (and those skipped) are named in each pass's `retrospectives/audit/P[N]-findings.md` coverage caveat and in `retrospectives/audit/FINAL_REVIEW.md` (G_AUDIT_OUT). "No open 🔴 in this ledger" means the audited dimensions found none — not that unaudited dimensions are clean. **This caveat is mandatory and must not be removed.**

---

## Evidence retention + count-reconciliation — mandatory

> Same evidence-retention rule as the verifier findings template, applied to the audit's own assurance claims and enforced by `validators/validate-reconciliation.cjs`. An audit asserts both **soundness verdicts** ("Pass P3 — clean") and **counts** ("412 files scanned", "37 IPC sites reviewed", "8 findings"); each must retain proof, never just a number.

**A pass / dimension sign-off** (a "No Issues" / clean / Sound verdict) carries a fenced `verdict` + `evidence` block — the exact command, the pattern/checklist exercised, and the result:

```verdict
finding: P3 — error-handling
status: clean
```

```evidence
for: P3 — error-handling
command: <the grep / tool invocation run for this dimension>
pattern/mutation set: <the patterns / checklist items exercised>
result: <files reviewed, sign-offs, what was and was NOT exercised>
```

**A stated count** ("N files scanned", "M sites reviewed", "K findings") carries a fenced `reconcile` block so it **recomputes from the inventory / ledger**, never asserted:

```reconcile
metric: files scanned
claimed: 412
source: docs/audit/INVENTORY.md
pattern: ^\|\s*`?src/
```

These blocks are **mandatory and must not be removed** (like the coverage caveat above): a "scanned 412 / 0 findings" claim that never recomputes is the exact assurance theater this gate exists to kill. **Honest limit:** the static check is **presence-gated** (a count in prose, or under an unrecognized key, escapes it); the audit's fresh-context **challenge pass** (`C[N]-challenge.md`, G_AUDIT_C1) is the adversarial backstop.

---

*Paired with the per-pass `retrospectives/audit/P[N]-findings.md` (raw findings), `retrospectives/audit/FINAL_REVIEW.md` (the consolidated report), and `docs/tech-debt.md` (where 🟢 findings graduate).*
