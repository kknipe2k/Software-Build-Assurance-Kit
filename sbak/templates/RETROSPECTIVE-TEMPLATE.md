# Retrospective: M[NN].[A-E] — {{Stage title}}

> The per-stage HANDOFF NOTE (M30.I fade 1). Claude maintains this during the session and surfaces it at stage end alongside the commit-ready surface. The user reviews; does not fill in fields — except the stamp, whose verdict is exclusively theirs. Per `sbak/BUILD-PLAYBOOK.md` §3.5. The scored self-assessment lives in ONE milestone retro at Stage E (`prompts/SUMMARY-TEMPLATE.md`), not here.

---

## [START] Stage frame

**Milestone:** M[NN] — {{milestone title}}
**Stage:** [A-E] — {{stage title}}
**Phase doc:** `docs/build-prompts/M[NN]-{{slug}}.md`
**Branch:** `claude/m[NN]-{{slug}}` (parent-milestone feature branch; stages commit on the same branch and do NOT push between stages)
**Session started:** YYYY-MM-DD HH:MM
**Starting commit:** `{{sha at session start}}`
**Ending commit:** `{{sha of stage commit at user-approval time, OR "uncommitted — awaiting approval"}}`

---

## [LIVE] Observation log

> Filled in DURING the session, as friction surfaces (G-H4: real time, never retroactively). Details fade.

### Friction events

Full rows are reserved for severity 2+. **Severity-1 events are AGGREGATED, not itemized** (N5): a per-stage count plus ONE exemplar.

| Time | Category | Severity | Description | Resolution |
|---|---|---|---|---|
| HH:MM | {{ambiguity / surface / protocol-drift / surprise}} | {{2-5}} | {{what happened}} | {{what was done about it}} |

**Sev-1 aggregate:** {{N}} events — exemplar: {{the one most instructive sev-1 row}}. (If zero, write "0 events.")

### Self-correction rounds

| Round | Trigger (which gate failed or what surfaced) | Action taken | Outcome |
|---|---|---|---|
| 1 | {{trigger}} | {{action}} | {{passed / still failing / partial}} |

If the round count exceeds the budget, surface to user before proceeding (per `CLAUDE.md` §7).

---

## Handoff note

> The next session's only memory. Seven required fields, none blank, none boilerplate — `validators/validate-retrospective.cjs` enforces the contract mechanically (it catches blank/placeholder/stock/typed-number fields; whether the content is TRUE is the stage-end review's job). Numbers are SEEDED from receipts or a named command, never typed.

```handoff
landed: {{what landed — files, tests, run-of-record (the command + result reference)}}
open: {{what is open — each item with its NAMED next owner (a stage id or person)}}
next-agent: {{what the next agent must know — the gotchas, the sharp edges, the load-bearing choices}}
drive: {{the agent's drive of the real assembled surface + run reference — or "n/a - <reason>" (the sentinel is a field, not an exemption; required when the stage's acceptance names an observable change)}}
mutation: {{the one-line test-mutation naming — which mutation was run, which check flipped RED alone}}
counts-from: {{the command or receipt every count in this note derives from — never a bare number}}
off-track: {{highest-priority unblocked backlog item #N · this stage built #M · justified? (G8 — an unlogged inversion is off track by default; see docs/off-track-log.md)}}
```

If the off-track line shows an inversion: surface it now — an explicit user re-prioritization (HITL co-authored, G8 clause b) or a logged build-sequence justification before continuing.

---

## [END] Stage close

### Human-drive record (closeout stages only — the spec's IRL/HITL plan, consumed)

> **Closeout (Stage E) only** — delete this section in work-stage retros. When the gate arms (tier Full AND `spec/project-spec.md` carries the three-part IRL/HITL plan), the close-gate consumes that plan HERE: the human runs the drive moments the spec scheduled for this boundary, and their answers are **typed** into the block below **before the friction stamp counts** — `validators/validate-retrospective.cjs` blocks a closeout without them. Same pen rule as the stamp: the agent asks, the human answers, the agent transcribes verbatim. Use the spec's **real input**, not a convenient toy one. If the gate is not armed (Lite tier / section-less spec), the validator prints a visible n/a and this block is not required.

```human-drive
drove: {{what was driven, by whom, with which REAL input — the spec's part-A row for this boundary}}
verified: {{what the human confirmed by hand, own eyes — the spec's part-B claims for this boundary}}
recorded: {{where this result lives per the spec's part C — normally: this block}}
```

### User experience stamp (REQUIRED at Full; asked-and-transcribed — the verdict's content is exclusively the owner's)

> The note above is agent-authored. This stamp is the independent check: **the verdict is the owner's.** **Flow (the standing owner rule, M22 ruling 4):** at stage-end approval the agent **asks** for the verdict (pass/fail + optional note), **transcribes the owner's reply verbatim** into the block below, and appends a `transcribed:` line marking when it was asked. The owner never hand-edits this file — the agent is only the pen.
>
> **Semantics: the default is `pass`** — if the owner did not see something to fix, or did not say fix/fail before proceeding, it is pass. **`fail` means the owner gave an explicit fix/fail before proceeding** — a fail is a valid stamp, and it forces protocol iteration before the next stage (per `sbak/PROCESS-VALIDATION.md`). The `note:` line is optional; a present note must be a real sentence.

```user-stamp
verdict: {{pass|fail}}
note: {{optional — one sentence, the owner's words verbatim; delete this line if nothing to add}}
```

### Count reconciliation (closeout stages only)

> **Closeout (Stage E) only** — skip for work stages. Every **headline count** the closeout / CHANGELOG entry states must **recompute from the ledger / status-log it came from** — `validators/validate-reconciliation.cjs` recomputes it and **fails the closeout on a mismatch**.

```reconcile
metric: {{e.g. findings graduated}}
claimed: {{N}}
source: {{ledger / status-log path, or `git`}}
pattern: {{regex counting the matching lines / commits — + range: main..HEAD for source: git}}
```

If the closeout states no countable headline, write **None — no headline counts stated.** **Honest limit:** the gate is presence-gated; Stage V's plan-challenge is the adversarial backstop.

### Rework breakdown — the four fixed types (REQUIRED; G15)

> **Every stage and closeout** records rework HONESTLY across the **four fixed types** — never a lump sum, never "0" while fix commits exist. At closeout, `validators/validate-transition.cjs` (G15) reconciles the total against the fix-commit evidence — a total that **under-reports** the fix commits BLOCKS.

```rework
implementation: {{N}}
verifier: {{N}}
irl: {{N}}
post-merge: {{N}}
source: git
range: {{e.g. main..HEAD for the milestone, or the stage commit range}}
pattern: {{regex matching this stage/milestone's fix commits — e.g. ^M0N.*fix}}
```

If no rework occurred, write the four types as `0` AND confirm there are no fix commits on the range.

### Sign-off

- **Stage status:** Ready for review
- **Surfaces sent to user (in order):** cross-machine state (`git log --oneline main..HEAD`) · diff stat · gate results · the handoff note · draft commit message

---

*This note becomes input to the next stage's session (read via the read-first manifest / `<read_prior_stages>` per `sbak/STAGE-PROMPT-PROTOCOL.md` §7) and to the milestone-level summary at closeout (per `prompts/SUMMARY-TEMPLATE.md`, which carries the ONE scored self-assessment for the milestone).*
