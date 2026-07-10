# {{PROJECT_NAME}} — Gap Analysis Ledger

> Append-only ledger of per-milestone product↔spec evaluations. The audit trail of how the built product diverges from the spec, what the spec got wrong, and what to fix next.

---

## Append-only rule (HARD)

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4). **No prior entry may be edited, reordered, or deleted.** Resolution of a prior finding goes in the *current* milestone's Carry-forward section, referencing the prior entry.

Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (Full-enforced; Standard-advisory): prior committed content must remain a byte-prefix of the current file, so prior entries stay byte-identical to their committed state.

### Why append-only

1. **Audit trail integrity** — the M01→M[NN] chain documents drift across milestones; rewriting destroys it.
2. **Honest assessment** — knowing the entry is permanent forces accuracy at write time. Severity inflation is harder when the prior milestone's "🔴 Critical" stays visible next to your new "🟢 Nice-to-have."
3. **Forces forward-looking carry-forward** — resolution lives next to its date and commit context.
4. **Spec-drift detection across milestones** stays visible. A spec gap that recurs three times is a signal the spec needs revision, not the implementation.
5. **Cumulative review at PR time** — combined with retrospectives + cumulative code diff, the user reviews three artifacts that together answer: did the milestone deliver (code), was the process sound (retrospectives), and is the audit honest (this file).

---

## When entries are added

After the final work stage of a parent milestone commits and the milestone summary lands, but **before** the milestone PR opens. The gap-analysis commit is the **final commit on the parent-milestone branch** and gates the PR push.

This is enforced by the closeout stage's prompt (per `STAGE-PROMPT-PROTOCOL.md` §8 `<append_only_verification>`).

---

## Entry shape (six required sections, none optional)

Every entry has these six sections in order. If a section has nothing to report, write **"None observed."** rather than omit.

### 1. Codebase deep dive (cumulative, 200–500 words)

A walk through the entire shipped codebase as it stands at this milestone closeout. What's the architecture now? What got added this milestone? What's the shape of the major modules? Read by someone who hasn't touched the project in months should give them an updated mental model.

### 2. Adherence to spec — ✅ / ⚠️ / ❌

For each spec section the milestone touched, evaluate adherence. Cite file:line.

| Spec section | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| §X.Y | ✅ | `module/path.ext:42` | Implements as specified |
| §X.Z | ⚠️ | `module/path.ext:108` | Partially implemented; missing W |
| §X.W | ❌ | n/a | Not implemented; deferred to M[NN+1] |

### 3. Spec review (forward-looking)

What did the spec get wrong, leave ambiguous, or fail to anticipate? Now is the time to flag it for the next milestone (or for an ADR).

- **Missing:** {{things the spec doesn't address that the milestone revealed need addressing}}
- **Contradicted:** {{spec sections that conflict with what was actually built — and which won}}
- **Ambiguous:** {{spec language that allowed multiple reasonable interpretations}}

### 4. Fix backlog — 🔴 Critical / 🟡 Important / 🟢 Nice-to-have

Severity is **non-elastic.** Critical means must-fix-before-shipping. Important means must-fix-before-next-milestone. Nice-to-have means worth doing when bandwidth allows.

| Severity | Item | Where | Estimated effort | Target milestone |
|---|---|---|---|---|
| 🔴 | {{item}} | {{file:line or area}} | {{S/M/L}} | M[NN+1] |
| 🟡 | {{item}} | {{file:line}} | {{S/M/L}} | M[NN+2] |
| 🟢 | {{item}} | {{area}} | {{S/M/L}} | when convenient |

If 🔴 Critical items are present, the milestone shouldn't ship — surface this rather than rationalize.

### 5. Carry-forward from prior milestones

Address every still-open item from prior gap-analysis entries by status:

- **{{Prior milestone tag}} {{severity}} "{{item summary}}"** — {{status: resolved at <commit>, deferred again to M[NN+X] with reason, or escalated severity with reason}}

If this is the first entry (M01 closeout), write **"None observed (first milestone)."**

### 6. Sign-off

- **Date:** YYYY-MM-DD
- **Milestone:** M[NN]
- **Author:** {{Claude session ID or human reviewer name}}
- **Reviewed by:** {{human reviewer name and date}}
- **Verdict:** Ship / Hold ({{reason if hold}})

---

## Entries

<!--
Append new entries below this line. Use the format:

## M[NN] — {{milestone title}} ({{closeout date}})

### 1. Codebase deep dive
...

### 2. Adherence to spec
...

### 3. Spec review (forward-looking)
...

### 4. Fix backlog
...

### 5. Carry-forward from prior milestones
...

### 6. Sign-off
...

---

Do not edit prior entries. Resolution of a prior finding goes in the current milestone's Carry-forward section, referencing the prior entry's milestone tag. Example:

> **M01 🔴 Critical "race condition in event dispatch"** — resolved at `commit a7c2f4e` (added duplicate-key check; test in `tests/integration/dispatch_test.ext:142`)
-->

---

*This ledger, combined with per-stage retrospectives and the session register, produces a forensic audit trail of every meaningful project decision and outcome.*
