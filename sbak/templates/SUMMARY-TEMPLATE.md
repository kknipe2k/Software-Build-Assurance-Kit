# M[NN] — {{Milestone title}} — Summary

> Per-milestone summary aggregating per-stage retrospectives. Authored at the closeout stage (E). Companion to the milestone's gap-analysis entry; this evaluates the build *process*, gap-analysis evaluates the build *product*.

---

## Milestone frame

**Milestone:** M[NN] — {{milestone title}}
**Phase doc:** `docs/build-prompts/M[NN]-{{slug}}.md`
**Branch:** `m{{NN}}/{{slug}}`
**Started:** YYYY-MM-DD (Stage A start)
**Closed:** YYYY-MM-DD (Stage E end)
**Total wall-clock:** {{days/hours across all stages}}

**Stages:**

| Stage | Title | Outcome | Retrospective |
|---|---|---|---|
| A | {{stage A title}} | {{Sound / Sound-but-rough / Friction-heavy / Not-ready}} | `retrospectives/M[NN].A-retrospective.md` |
| B | {{stage B title}} | {{outcome}} | `retrospectives/M[NN].B-retrospective.md` |
| C | {{stage C title}} | {{outcome}} | `retrospectives/M[NN].C-retrospective.md` |
| D | {{stage D title}} | {{outcome}} | `retrospectives/M[NN].D-retrospective.md` |
| E | Closeout | {{outcome}} | this file + `docs/gap-analysis.md` entry |

---

## Three-axis self-assessment (the ONE scored assessment for the milestone — M30.I fade 1)

Scored once here at Stage E, over the whole milestone; per-stage retros are handoff notes and carry no scores. Justify each score from the stage handoff notes and friction logs, citing evidence — the score without its why is noise.

| Axis | Score (1-5) | Justification (evidence from the stage notes) |
|---|---|---|
| Process adherence | {{1-5}} | {{gates held / deviations, from the notes' friction rows}} |
| Artifact quality | {{1-5}} | {{coverage, gate cleanliness, drive results}} |
| Forward-readiness | {{1-5}} | {{are the open: fields owned; does the next milestone start clean}} |

---

## Cross-stage friction patterns

Categorize friction events from per-stage retrospectives. Look for patterns: a category that recurred across multiple stages is a protocol or framework signal, not a stage-local issue.

| Category | Total events | Stages affected | Pattern (if any) |
|---|---|---|---|
| ambiguity | {{count}} | {{stage IDs}} | {{e.g., "Phase doc Stage X CLI prompt was unclear about X — fix in next milestone's Phase doc authoring"}} |
| surface | {{count}} | {{stage IDs}} | {{...}} |
| protocol-drift | {{count}} | {{stage IDs}} | {{...}} |
| surprise | {{count}} | {{stage IDs}} | {{...}} |

**Total friction events this milestone:** {{N}}. **Avg severity:** {{X.X}}.

For comparison (if not the first milestone): prior milestone had {{N}} events, avg severity {{X.X}}. Trend: {{up / down / flat}}.

---

## Self-correction summary

| Stage | Budget | Rounds used | Exceeded? |
|---|---|---|---|
| A | {{N}} | {{N}} | {{yes/no}} |
| B | {{N}} | {{N}} | {{yes/no}} |
| ... | | | |

If any stage exceeded its budget without surfacing, that's a process-adherence violation — flag in the milestone verdict.

---

## Decisions to apply before next parent milestone

Aggregated from per-stage retrospectives' "Decisions for the parent milestone or framework" sections. Each decision: what to change, where, when.

| # | Decision | Where it lands | When |
|---|---|---|---|
| 1 | {{decision summary}} | `{{file}}` | before M[NN+1] Stage A starts |
| 2 | {{decision}} | `{{file}}` | during M[NN+1] |
| 3 | {{decision}} | `{{file}}` (new ADR — file as ADR-NNNN) | before M[NN+1] Stage A |

If empty: write **"None observed."** That's a valid outcome and worth noting.

---

## Verdict

Mark ONE based on aggregate axis scores, hard-gate pass rate across stages, and friction patterns:

- [ ] **Strong milestone** — all stages Sound, axes avg ≥4.5, no critical patterns
- [ ] **Sound milestone** — all stages Sound or Sound-but-rough, axes avg ≥3.5
- [ ] **Rough but shipped** — at least one stage Friction-heavy, but no Not-ready; iterate before M[NN+1]
- [ ] **Recovery needed** — any stage Not-ready, or aggregate axis ≤2.5; do not start M[NN+1] until recovery session lands

**Justification:** {{specific evidence pulling from the tables above}}

---

## Cross-milestone trend signal (only if applicable from M02+)

If this is M02 or later, compare to prior milestones at the summary level — patterns visible only across multiple milestones land here.

| Signal | This milestone | Prior milestone | Trend |
|---|---|---|---|
| Avg friction severity | {{X.X}} | {{X.X}} | {{up / down / flat}} |
| Self-correction round usage | {{count / total budget}} | {{count / total}} | {{up / down / flat}} |
| Cross-stack escalation events | {{count}} | {{count}} | {{up / down / flat}} |
| {{Pattern observed across both milestones}} | — | — | {{e.g., "third-party API churn at integration boundaries — propose ADR for vendor pinning"}} |

If the trend is concerning (severity climbing, self-correction usage rising, recurring escalation pattern), surface as a Decision in the next section that lands in `CLAUDE.md` or `sbak/BUILD-PLAYBOOK.md`.

For M01: write **"First milestone — no trend baseline."**

---

## Hand-off to gap-analysis entry

This summary is one of three artifacts the user reviews at PR time (per `CLAUDE.md` §8 closeout). The other two are:

1. The cumulative code diff (M[NN].A through M[NN].E)
2. The new entry in `docs/gap-analysis.md`

Pushback on any of the three blocks the PR until revised.

---

## Sign-off

- **Date:** YYYY-MM-DD
- **Author:** {{Claude session ID}}
- **Reviewed by:** {{human reviewer name and date}}
- **Status:** Ready for PR (pending three-artifact review)

---

*This summary, the per-stage retrospectives, and the gap-analysis entry together constitute the milestone's complete process record. The PR description draws from all three.*
