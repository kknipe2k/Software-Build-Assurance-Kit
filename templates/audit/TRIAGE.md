# Audit Triage — S2 (per-file risk classification per dimension)

> Produced by Phase S, step S2 (`operating_mode: audit`). Reads `INVENTORY.md` (not the raw code) and classifies every in-scope file across every review dimension as **CRITICAL / MODERATE / SCAN**. Risk triage *before* deep review allocates attention to where it pays off — no file gets ignored, no file gets indiscriminate deep review. Lives at `docs/audit/TRIAGE.md`.
>
> Each pass (P1–P8) reads **only its dimension's column** of this table to know which files it must sign off (G_AUDIT_P1). **Lite tier skips S2** and runs each chosen pass over the full in-scope set (per `proposals/OPERATING-MODES.md` §5.6).

---

## Classification rubric

| Class | Meaning | Review depth |
|---|---|---|
| **CRITICAL** | This file is central to the dimension's risk (trust boundary, secret handling, hot path, the dimension's core logic). | Deep, line-level review. Mandatory per-file sign-off. |
| **MODERATE** | Touches the dimension but is not central; plausible but bounded risk. | Targeted review of the relevant parts. Mandatory per-file sign-off. |
| **SCAN** | Unlikely to carry this dimension's risk; included for completeness. | Quick scan; sign off "No Issues" or escalate if something surfaces. |

**Per-file sign-off (G_AUDIT_P1) applies to CRITICAL and MODERATE files** — every one appears in its pass's output with findings or an explicit "No Issues". SCAN files are scanned and escalated if needed; they are not individually gated.

---

## Triage matrix (file × dimension)

> Dimensions: P1 IPC · P2 Secrets · P3 Error-handling · P4 Data-flow · P5 Performance · P6 Packaging · P7 Compliance · P8 Architecture. (The eight passes ship in M07.B; a Lite/Standard run uses a subset — see `REVIEW_PLAN.md`.) Cell value = CRITICAL / MODERATE / SCAN.

| File | P1 IPC | P2 Secrets | P3 Errors | P4 Data | P5 Perf | P6 Pkg | P7 Compliance | P8 Arch |
|---|---|---|---|---|---|---|---|---|
| `src/ipc/handler.ts` | CRITICAL | MODERATE | MODERATE | CRITICAL | SCAN | SCAN | SCAN | MODERATE |
| `src/config.ts` | SCAN | CRITICAL | SCAN | MODERATE | SCAN | MODERATE | MODERATE | SCAN |
| … | … | … | … | … | … | … | … | … |

---

## Per-dimension counts (the sign-off budget each pass inherits)

| Dimension | CRITICAL | MODERATE | SCAN | Files the pass MUST sign off (CRITICAL+MODERATE) |
|---|---|---|---|---|
| P1 IPC | {{n}} | {{n}} | {{n}} | {{n}} |
| … | … | … | … | … |
