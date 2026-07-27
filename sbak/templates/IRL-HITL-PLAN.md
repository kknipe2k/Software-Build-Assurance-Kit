# Spec — the IRL/HITL plan

> **Appended to `spec/project-spec.md` at Phase 1, with the spec — not later.** Every tier.
>
> **Why it is authored here and not at closeout (KF-51).** The framework already scatters
> human obligations across the lifecycle: a recorded drive before an observable-change
> close, the App-Map's drivable surfaces, the Verifier's behaviour pass, the friction
> stamp. Every one of those is real, and until this section existed *none of them was
> written down anywhere the human could read before meeting it*. In a live build trial the
> operator hit the closeout menu and said, plainly, "i dont have an hitl test plan" — the
> obligations were not missing, they were **ambushing**. The defect is WHEN they surface.
> A plan authored beside the spec turns them from surprises into a schedule.
>
> Delete this blockquote when you fill the section in. Fill it from the milestone plan
> (Phase 2) as soon as that exists; a first pass at Phase 1 with `TBD — set at Phase 2`
> in the boundary column is the honest interim, and better than an empty section.

---

## A. Drive moments — when a human actually runs this thing

One row per **milestone boundary**. A drive moment is a point where someone opens the real
artifact and uses it: not a test run, not a screenshot in a retro. If a boundary genuinely
has nothing drivable yet (pure scaffolding, a library with no CLI), say so with a reason —
`n/a — no user-reachable surface yet` is a legitimate row and a silent blank is not.

| Boundary | What gets driven | Who drives it | Input / fixture used | Where the result is recorded |
|---|---|---|---|---|
| M01 close | {{DRIVE_M01}} | {{DRIVER}} | {{DRIVE_INPUT_M01}} | {{DRIVE_RECORD_M01}} |
| M02 close | {{DRIVE_M02}} | {{DRIVER}} | {{DRIVE_INPUT_M02}} | {{DRIVE_RECORD_M02}} |
| Release | {{DRIVE_RELEASE}} | {{DRIVER}} | {{DRIVE_INPUT_RELEASE}} | {{DRIVE_RECORD_RELEASE}} |

**Use a real input, not a toy one.** The trial's single most valuable human check was a
side-by-side comparison against a *real* document; three earlier checks against contrived
inputs found nothing. Name the real input here, in the plan, before anyone is tempted to
substitute something convenient at the boundary.

## B. What the human verifies **by hand** at each boundary

The half that has no automated substitute. For each boundary, name the specific claims a
person must confirm with their own eyes — the things a green suite cannot establish.

| Boundary | Checked by hand | Why a test cannot cover it | Pass looks like |
|---|---|---|---|
| M01 close | {{HITL_M01}} | {{HITL_WHY_M01}} | {{HITL_PASS_M01}} |
| M02 close | {{HITL_M02}} | {{HITL_WHY_M02}} | {{HITL_PASS_M02}} |
| Release | {{HITL_RELEASE}} | {{HITL_WHY_RELEASE}} | {{HITL_PASS_RELEASE}} |

Good candidates: does the output look right to a person who knows the domain; does the
error message tell a stranger what to do next; does the thing that was reported broken
actually work now; is the comparison against a known-good reference clean.

## C. Where each answer **gets typed**

The column the trial proved gets dropped. Knowing that a decision is yours is not the same
as knowing where it goes, and "your call" without a destination is where an operator
stalls. Every human answer in this project has exactly one home — name it.

| The ask | Surfaces at | Where the answer gets typed |
|---|---|---|
| Gate-1 approval (deliverable + test plan) | Stage open | Reply in the orchestrator session |
| RED-stop release | After the failing tests | `node scripts/approve-red.cjs` in the build session |
| Gate-3 approval (commit authorization) | Stage-end packet | Reply in the orchestrator session |
| User friction stamp (`pass` \| `fail`) | Stage-end packet | The ```user-stamp``` block in `retrospectives/<stage>-retrospective.md` — transcribed verbatim, never self-placed |
| Drive-moment result | Milestone close | {{DRIVE_RECORD_HOME}} |
| Backlog ordering sign-off | Phase 2 and each re-rank | `docs/backlog.md` (HITL — never AI-only) |
| Release-ladder rung | Release close | `docs/release-state.md` |
| {{EXTRA_ASK}} | {{EXTRA_ASK_WHEN}} | {{EXTRA_ASK_WHERE}} |

## D. Standing limits (fill in what this project will not check by hand)

State what the human half does **not** cover, so nobody reads this plan as broader than it
is: platforms nobody will drive, load conditions nobody will reproduce, integrations only
exercised by mocks. An undisclosed gap in the human half is the same defect class as an
undisclosed gap in the automated half.

- {{IRL_LIMIT_1}}
- {{IRL_LIMIT_2}}
