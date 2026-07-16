# Tech Debt Ledger — {{PROJECT_NAME}}

> Append-only log of 🟢 ("nice-to-have") findings from Verifier (Stage V) and Refactor (Stage R) stages and other tech-debt items spotted during work. Distinct from `docs/gap-analysis.md` (product↔spec deviations) and `docs/gotchas.md` (don't-do-this rules) — tech debt is "we know this needs fixing later; we shipped without it for a reason."
>
> **This ledger is also Stage R's trigger input.** Stage R (the refactor health check) reads the open-entry count here at each milestone boundary: when it reaches the `refactor_mode` threshold (Standard `trigger_n5` = ≥5; Full `trigger_n3` = ≥3) — OR the milestone interval elapses, whichever first — Stage R runs and **appends its own 🟢 findings back here** (append-only). See `sbak/FRAMEWORK-CONFIG.md` §4.11 and `sbak/BUILD-PLAYBOOK.md` §3.4.5.
>
> **Append-only.** Don't edit prior entries. To resolve a debt item, append a new entry referencing the prior one's ID and the resolution commit. Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory): prior committed content must remain a byte-prefix of the current file. Same check that guards `gap-analysis.md` and `consultations.md`.

---

## How entries are formatted

```
### TD-NNN: {{ONE_LINE_DESCRIPTION}}

- **Filed:** {{DATE}}
- **Source:** {{MILESTONE_STAGE_OR_VERIFIER_FINDING}}
- **Severity:** 🟢 nice-to-have
- **Affected:** {{FILE_OR_MODULE}}
- **Why deferred:** {{REASON_NOT_FIXED_NOW}}
- **Acceptance criteria for resolution:** {{HOW_WE_KNOW_IT_IS_DONE}}
- **Status:** open / resolved (commit {{SHA}})
```

Severity is `🟢` by default. If an item escalates to 🟡 or 🔴 during a later verifier pass, append a NEW entry (don't edit the prior one) noting the escalation and link the original TD-NNN.

---

## Entries

<!-- Entries appended below this line. Newest at the bottom. -->
