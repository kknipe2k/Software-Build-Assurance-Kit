# {{PROJECT_NAME}} — Backlog (ranked, prioritized)

> The persistent, **user-owned** ranked backlog of user stories — top row = most valuable. This is the source of truth for *what matters most, in order*. It persists across every milestone (unlike `docs/scope.md`, which is the milestone *plan*, and unlike `docs/gap-analysis.md`, which is the backward-looking *fix* ledger). The off-track check measures the build against this list. See `sbak/PROCESS-VALIDATION.md` (G8 — Off-Track gate).

---

## HITL co-authorship rule (HARD — this is what gives the off-track check teeth)

**This backlog is co-authored. No AI-only edit ever lands.** The agent may *draft* the initial backlog and *propose* changes — but **no change to this file is committed without explicit human ratification.** That bar applies to *every* kind of change, with no exceptions:

- a **re-rank** (moving a row up or down),
- an **addition** or a `🚫 cut`,
- a **status flip** (`✅` / `🔜` / `⏳` / `🚫`),
- a **scope change** to a story's wording, and
- **especially a `Depends on` edit.**

Why this is non-negotiable: if the agent could re-rank the backlog on its own, "off track" would be *unfalsifiable* — the agent would simply lower the bar to clear it. Priority is a user-domain decision (`sbak/BUILD-PLAYBOOK.md` §4.2 lists "priority — which deliverable matters more" as an explicit escalate-to-user fork). The `Depends on` column is held to the **same** bar deliberately: a fabricated dependency is the exact loophole that would let the agent manufacture a "build-sequence necessity" to launder priority drift into justification. The agent proposes dependency edits *with rationale*; the human ratifies.

**Mechanically:** this rides on the do-not-commit-without-approval rule (G1) — nothing commits unreviewed, so a backlog change is necessarily seen by the human. The added discipline is that a backlog change must be **surfaced explicitly for ratification**, never folded silently into an unrelated stage commit. At Full tier, every re-rank is also recorded in the override log (same pattern as a tier change), so direction is always traceable to a human sign-off.

---

## How to read this file

- **Rank is the row order**, top = highest priority. To re-prioritize, *move the row* (with ratification) — do not edit the `#`.
- **The `#` is a stable ID that never renumbers.** It is assigned once, at row creation, and stays with the story forever even as rows move. This is what lets the off-track log and commit messages reference "#27" permanently. `#` order is *not* rank; row order is rank.
- **Status** is one of `✅ shipped` · `🔜 next` · `⏳ backlog` · `🚫 cut`.
- **Depends on** names the stories (by `#`) that must ship first. This column is what makes a build-sequence necessity *checkable* rather than merely asserted — and it is why it is held to the HITL bar above.

---

## The backlog

<!--
TIER NOTE — keep only the columns your tier uses:
  * Lite     — #, User story, Status  (drop Depends on + Notes; inversions noted in CHANGELOG.md)
  * Full — the full table below (#, User story, Status, Depends on, Notes)
  * Full     — the full table below + an override-log entry on every re-rank (see below)

Assign each new story the next unused #. NEVER reuse or renumber a #. To
re-prioritize, move the whole row (with human ratification). Infra/enabling
stories that no user sees still get a # and a row — they are what `Depends on`
points at to justify an inversion.
-->

| # | User story | Status | Depends on | Notes |
|---|---|---|---|---|
| 1 | {{As a user, I can …}} | 🔜 next | — | |
| 2 | {{As a user, I can …}} | ⏳ backlog | | |

<!--
Worked shape (delete once you have real rows):

| # | User story | Status | Depends on | Notes |
|---|---|---|---|---|
| 1 | As a user, I can create a note | ✅ shipped (M01) | — | |
| 2 | As a user, I can save a note so it persists | 🔜 next | #12 | needs persistence layer |
| 3 | As a user, I can search my notes | ⏳ backlog | #2 | |
| 12 | (infra) Local persistence layer | ✅ shipped (M01) | — | invisible to users; enables #2 |
| 27 | As a user, I can toggle dark mode | ⏳ backlog | — | low value; nothing forces it early |

Read: rank 12-before-2 is fine (hard dependency — #2 Depends on #12); rank
27-before-2 would be drift (nothing forces it). The off-track check separates
the two; justified inversions are logged in docs/off-track-log.md.
-->

---

## Override log (Full tier — every re-rank recorded here, append-only)

> A re-rank is a human-ratified change to priority order. Record each one so direction stays traceable. Newest at the bottom. (This section is honor-system unless the ledger workflow is risk-armed; ratification still happens either way.)

<!-- Append re-rank records below this line. Format:
- YYYY-MM-DD — moved #N above #M (was rank X, now rank Y). Reason: {{user's reason}}. Ratified by: {{user}}.
-->

---

*Paired with `docs/off-track-log.md` (the append-only record of justified priority inversions) and the off-track check (G8). The `/on-track` command runs a full review against this file at any time.*
