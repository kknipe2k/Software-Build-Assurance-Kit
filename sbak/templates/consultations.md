# Consultations — ad-hoc orchestrator decisions (append-only)

> Append-only ledger of unplanned orchestrator consultations: the "I'm seeing X, what should I do?" moments that happen between planned stages. Each entry records the question, what the orchestrator read to ground the answer, and the decision. This is how a future orchestrator session inherits a call it wasn't present for.
>
> **Append-only.** Don't edit or delete prior entries — that defeats the audit trail. Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory): prior committed content must remain a byte-prefix of the current file. A consultation that graduates into a real decision (scope/tier/contract change) also lands in its proper artifact (ADR / `project-config.md` override log / Phase-doc revision); note the cross-reference here.
>
> Newest entries at the bottom.

---

## Entry template (copy for each consultation)

```
### {{YYYY-MM-DD}} — {{one-line question}}

**Asked:** {{the question as the user posed it}}
**Read:** {{which artifacts grounded the answer — gap-analysis, M0X.Y retro, ADR-NNNN, build-status, etc.}}
**Decision:** {{the recommendation + the one next action}}
**Graduated to:** {{ADR-NNNN / project-config override / Phase-doc revision — or "n/a, advisory only"}}
```

---

<!-- Append entries below this line. -->
