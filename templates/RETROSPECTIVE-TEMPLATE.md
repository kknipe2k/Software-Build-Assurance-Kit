# Retrospective: M[NN].[A-E] — {{Stage title}}

> Per-stage retrospective. Claude maintains this during the session and surfaces it at stage end alongside the commit-ready surface. The user reviews; does not fill in fields. Per `BUILD-PLAYBOOK.md` §3.5.

---

## [START] Stage frame

**Milestone:** M[NN] — {{milestone title}}
**Stage:** [A-E] — {{stage title}}
**Phase doc:** `docs/build-prompts/M[NN]-{{slug}}.md`
**Branch:** `claude/m[NN]-{{slug}}` (parent-milestone feature branch; stages commit on the same branch and do NOT push between stages)
**Session started:** YYYY-MM-DD HH:MM
**Session ID:** {{Claude session URL or identifier}}
**Starting commit:** `{{sha at session start}}`
**Ending commit:** `{{sha of stage commit at user-approval time, OR "uncommitted — awaiting approval"}}`

**Stated scope (from CLI prompt):**

{{Paste the `<deliverable>` from the stage's CLI prompt — or summarize if it was a `ref=` to a Phase doc section.}}

**Self-correction budget for this stage:** {{N from `<self_correction_budget>` in the CLI prompt}}

**Time-box estimate:** {{from `<time_box estimate_hours>` in the CLI prompt}} — **actual elapsed:** {{Y hours}}

---

## Pre-flight (claimed before session start)

These were satisfied before code was written. If `<pre_flight_check>` was specified in the CLI prompt (per `STAGE-PROMPT-PROTOCOL.md` v1.3+), each check there should map to a checkbox here.

- [ ] `CLAUDE.md` was loaded (auto-loaded by Claude Code) and the §4 Hard Rules were stated at the top of the first response
- [ ] All `<read_first>` files were read in the order listed
- [ ] For Stage B+: prior stage retrospective `[END]` Decisions section was read and applied
- [ ] The deliverable was stated in 1–3 sentences and the test plan in 3–5 bullets BEFORE writing code
- [ ] User confirmed the deliverable + test plan before code began
- [ ] The branch was correct per the milestone prompt
- [ ] No uncommitted changes carried over from a prior session (`git status` was clean)
- [ ] `<pre_flight_check>` items (if specified): all passed before STEP 1

---

## [LIVE] Observation log

> Filled in DURING the session, as friction surfaces. Not summarized at the end. Details fade.

### Friction events

Each severity-2+ friction event gets a full row: time, category, severity (1–5), description, resolution. **Severity-1 events are AGGREGATED, not itemized** (N5): a per-stage count plus ONE exemplar — the dogfood data says ~89% of logged friction is sev-1, and itemizing it is process mass that catches nothing. Full rows are reserved for severity 2+.

| Time | Category | Severity | Description | Resolution |
|---|---|---|---|---|
| HH:MM | {{ambiguity / surface / protocol-drift / surprise}} | {{2-5}} | {{what happened}} | {{what was done about it}} |

**Sev-1 aggregate:** {{N}} events — exemplar: {{the one most instructive sev-1 row: what happened + how it resolved}}. (If zero, write "0 events.")

**Categories:**
- **ambiguity** — Phase doc, spec, or this file allowed multiple reasonable interpretations
- **surface** — surfaced something to the user mid-stage that the prompt didn't anticipate
- **protocol-drift** — caught yourself (or were caught) drifting from the stated workflow
- **surprise** — environmental or system behavior that wasn't expected

### Self-correction rounds

| Round | Trigger (which gate failed or what surfaced) | Action taken | Outcome |
|---|---|---|---|
| 1 | {{trigger}} | {{action}} | {{passed / still failing / partial}} |
| 2 | {{trigger}} | {{action}} | {{passed / still failing / partial}} |
| 3 | {{trigger}} | {{action}} | {{passed / still failing / partial}} |

If the round count exceeded the budget, surface to user before proceeding (per `CLAUDE.md` §7).

### Per-stage gotchas (new this stage)

Numbered list of gotchas that surfaced during this stage. These get evaluated for graduation at milestone closeout (per `<gotchas_graduation>` in `BUILD-PLAYBOOK.md` §3.4).

1. {{gotcha description; symptom; cause if known; workaround}}
2. {{...}}

If none surfaced, write: **None observed.**

---

## [END] Stage close

> Filled in at stage end, before surfacing for approval. Three axes scored, threshold gates evaluated, outcome marked, decisions for next stage written specifically.

### Three-axis scoring (1–5; 5 = best)

#### Axis 1: Process adherence

How closely did the stage follow the protocol — CLAUDE.md hard rules, the per-stage loop, self-correction budget, do-not-commit rule, retrospective discipline?

**Score: {{1-5}}**

**Justification:** {{specific evidence — point to the friction log, count of self-correction rounds, any deviations from the stated workflow}}

#### Axis 2: Artifact quality

How good are the deliverables produced this stage — code quality per `docs/style.md`, test coverage and behavior-vs-implementation mix, doc/comment quality, gate cleanliness?

**Score: {{1-5}}**

**Justification:** {{specific evidence — coverage numbers, lint status, count of TODO/FIXME added vs resolved, any tests skipped or marked TODO}}

#### Axis 3: Forward-readiness

How well-positioned is the next stage to start cleanly — clear handoff, no dangling work, decisions for next stage are specific and actionable, gotchas captured for graduation evaluation?

**Score: {{1-5}}**

**Justification:** {{specific evidence — does the next stage's CLI prompt now make sense given what this stage produced; are there obvious gaps the next stage will hit immediately}}

### User experience stamp (REQUIRED at Standard+; the agent does NOT fill this)

> The three axes above are agent-authored — the agent grading its own work. This stamp is the independent check: **you, the human, give the verdict.** A weak model self-grades generously; this is what catches friction the agent didn't perceive. Leave the marker line exactly as formatted (the pre-commit validator parses it); replace the verdict placeholder.
>
> **Semantics (the standing owner rule): the default is `pass`** — if you did not see something to fix, or did not say fix/fail before proceeding, it is pass. **`fail` means you gave an explicit fix/fail before proceeding** — a fail is a valid stamp, and it forces the outcome to **Friction-heavy** + protocol iteration before the next stage (per `PROCESS-VALIDATION.md`). The `note:` line is optional — delete it if you have nothing to add; a present note must be a real sentence.

```user-stamp
verdict: {{pass|fail}}
note: {{optional — one sentence; delete this line if nothing to add}}
```

### Threshold gates (per `BUILD-PLAYBOOK.md` §3.5)

#### Hard gates (any failure → outcome cannot be "Sound")

- [ ] **G-H1**: All milestone-active hard gates from `docs/gates.md` passed
- [ ] **G-H2**: No code committed without user approval (do-not-commit rule)
- [ ] **G-H3**: Self-correction budget not exceeded silently (if exceeded, was surfaced)
- [ ] **G-H4**: All friction events logged in real time, not retroactively
- [ ] **G-H5**: All scope locks held; no out-of-scope work landed

#### Soft gates (any failure → outcome at most "Sound but rough")

- [ ] **G-S1**: All three axes scored ≥3
- [ ] **G-S2**: At least one decision for next stage written, specific and actionable
- [ ] **G-S3**: All per-stage gotchas captured for graduation
- [ ] **G-S4**: Live observation log has entries (a clean log with no friction is itself a flag — flag it)
- [ ] **G-S5**: Test mix evaluated (behavior vs implementation tests; flagged if heavily implementation-skewed)

### Outcome

Mark ONE based on gate evaluation:

- [ ] **Sound** — all hard gates pass, all soft gates pass, all axes ≥4
- [ ] **Sound but rough** — all hard gates pass, ≥1 soft gate fails OR ≥1 axis at 3
- [ ] **Friction-heavy** — all hard gates pass but multiple soft gates fail OR ≥1 axis at 1–2
- [ ] **Not ready** — any hard gate fails

**Outcome routing** (per `CLAUDE.md` §19):

- **Sound** → proceed to next stage
- **Sound but rough** → brief protocol-iteration session first, then proceed
- **Friction-heavy** → stop; iterate on protocol before next stage
- **Not ready** → hard gate failed; diagnose, possibly file ADR, possibly recovery session

### Off-track check (priority drift — per `PROCESS-VALIDATION.md` G8)

> One line, every stage (the cheap early-warning path — proposal §4.2a). Compare what this stage *built* against the top of `docs/backlog.md`: was the highest-priority story that is **unblocked and in scope** the one being built? If a lower-priority story was built ahead of a higher-priority backlogged one, the inversion is **off track** *unless* a build-sequence necessity is recorded in `docs/off-track-log.md`. An **unlogged inversion is off track by default** — write the justification first, then it counts. Infra/enabling stages that map to no user story write "none — enabling work for #N."

```off-track-check
Off-track check — highest-priority unblocked backlog item: #{{N}} · this stage built: #{{M}} · justified? {{Y/N}} ({{reason — necessity type + off-track-log ref, or "match" if #N==#M}})
```

**If `N`: off track.** Surface the inversion now — do not roll it silently into the next stage. Get either an explicit user re-prioritization (`docs/backlog.md` re-ranked **by human ratification**, override-logged) or a logged build-sequence justification before continuing. Any backlog edit that results is **HITL co-authored** (G8 clause b): the agent proposes, the human ratifies — never folded silently into this stage's commit.

**Tier note.** Lite reduces this to: the line above was filled, any inversion noted in `CHANGELOG.md`, and any backlog edit was human-ratified. Standard surfaces a standing inversion as a warning; Full blocks the milestone PR on a standing unjustified inversion.

### Count reconciliation (closeout stages only)

> **Closeout (Stage E) only** — skip for work stages. Every **headline count** the closeout / CHANGELOG entry states ("N findings graduated", "M fixed", "K mutants killed", "P commits scanned") must **recompute from the ledger / status-log it came from**, not be asserted. State each as a fenced `reconcile` block; `validators/validate-reconciliation.cjs` recomputes it and **fails the closeout on a mismatch** (the "202 scanned / 0 corrections" theater). Recompute, do not trust the stated number.

```reconcile
metric: {{e.g. findings graduated}}
claimed: {{N}}
source: {{ledger / status-log path, or `git`}}
pattern: {{regex counting the matching lines / commits — + range: main..HEAD for source: git}}
```

If the closeout states no countable headline, write **None — no headline counts stated.** **Honest limit:** the gate is presence-gated (a count in prose, or under a key the validator's non-exhaustive list doesn't recognize, escapes it); Stage V's plan-challenge is the adversarial backstop.

### Rework breakdown — the four fixed types (REQUIRED; G15)

> **Every stage and closeout** records rework HONESTLY across the **four fixed types** — never a lump sum, never "0" while fix commits exist (the "0 self-correction rounds while rebuilds happened" lie). DORA's 5th metric (Deployment Rework Rate), project-internal. The four types: **implementation** corrections (you fixed your own code before a gate caught it) · **verifier** iterations (a Stage V finding sent you back) · **irl** reversals (a real-run / dogfood result reversed a decision) · **post-merge** discoveries (something surfaced after the stage landed). At closeout, `validators/validate-transition.cjs` (G15) reconciles the total against the fix-commit evidence — a total that **under-reports** the fix commits BLOCKS. The fix-commit count is a lower bound, so honest over-reporting is fine; under-reporting is the lie.

```rework
implementation: {{N}}
verifier: {{N}}
irl: {{N}}
post-merge: {{N}}
source: git
range: {{e.g. main..HEAD for the milestone, or the stage commit range}}
pattern: {{regex matching this stage/milestone's fix commits — e.g. ^M0N.*fix}}
```

If no rework occurred, write the four types as `0` AND confirm there are no fix commits on the range (a `0` total with fix commits present fails G15). Per work stage this is the self-correction-rounds count typed by source; at closeout it is the milestone total.

### Decisions for the next stage

Specific, actionable. Cite file:line, name the change, name the gate. Vague decisions ("be more careful with X") are not actionable — refuse to write them; force specificity.

1. {{decision}} — applies at: {{file:line or stage X.Y}} — gate it should appear in: {{gate name from docs/gates.md or "new gate to add"}}
2. {{decision}} — ...
3. {{decision}} — ...

### Decisions for the parent milestone or framework (only if substantive)

If the stage surfaced a decision that should propagate beyond the next stage — into `CLAUDE.md`, `docs/style.md`, `docs/gotchas.md`, `BUILD-PLAYBOOK.md`, or a new ADR — list here. The user routes these at outcome review.

1. {{decision}} — proposed change to {{file}} — proposed text or summary

### Sign-off

- **Stage status:** Ready for review
- **Surfaces sent to user (in order):**
  1. cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/M[NN].*-retrospective.md`
  2. diff stat (`git diff --stat HEAD`)
  3. gate results (each gate, pass/fail, key numbers)
  4. this retrospective `[END]` section
  5. draft commit message
- **Statement to user:** *"Stage M[NN].[A-E] is ready. I will not commit until you approve."*

---

*This retrospective becomes input to the next stage's CLI prompt (read via `<read_prior_stages>` per `STAGE-PROMPT-PROTOCOL.md` §7) and to the milestone-level summary at closeout (per `prompts/SUMMARY-TEMPLATE.md`).*
