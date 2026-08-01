<!-- @kit-version 1.0.3 -->
<!-- templates/OUTCOME-CHALLENGE.md → docs/outcome-challenge.md (both tiers).
     The Outcome Challenge (companion §6, Workstream 3; M26.F): ONE contract-
     completeness challenge, scaled by risk — not a catalog of deliverable-
     specific passes. Authored BEFORE IMPLEMENTATION so it constrains the build
     instead of narrating it. Shape policed by validators/validate-outcome-
     challenge.cjs (pre-commit; Full BLOCK / Lite warn). -->

# Outcome Challenge — {{PROJECT_NAME}}

**Authored:** {{DATE}} — **before implementation** (this artifact is a lifecycle
step bound ahead of the first work stage: if it is authored only at closeout, it
becomes history rather than a constraint).
**Risk scaling:** {{RISK_SCALE}} <!-- how deep each part goes is scaled by risk:
for a small or low-risk outcome one sentence may answer each prompt; for a
critical outcome each may require tests, measurements, operational evidence, or
human evaluation. Say which parts are armed and why. -->

## A. Outcome contract (before implementation)

For each material objective:

- actor: {{ACTOR}}
- objective: {{OBJECTIVE}}
- smallest realistic success journey: {{SUCCESS_JOURNEY}}
- six universal quality dimensions — answer each for the outcome above:

| dimension | answer |
|---|---|
| reachability — the intended actor can find and reach the capability under realistic conditions | {{DIM_REACHABILITY}} |
| comprehensibility — the actor understands available actions, inputs, state, and result without hidden knowledge | {{DIM_COMPREHENSIBILITY}} |
| operability — the action completes through supported means across relevant ability/environment/permission differences | {{DIM_OPERABILITY}} |
| feedback — progress, success, rejection, and failure are visible when a decision depends on them | {{DIM_FEEDBACK}} |
| recovery — interruption, invalid input, partial failure, repetition, cancellation do not silently corrupt state | {{DIM_RECOVERY}} |
| fitness — the observed result advances the actor's objective, not just the implementation's definition of success | {{DIM_FITNESS}} |

- decision-producing capability (ranking, classification, judgment): {{DECISION_CAPABILITY}}
- judgments requiring a real human or external consumer: {{HUMAN_JUDGMENTS}}
- evidence that will exist at completion: {{COMPLETION_EVIDENCE}}

## B. Omission challenge (during planning)

The reviewer asks — and records the answers:

- What actor or dependency is absent from the plan? {{OMIT_ACTOR}}
- What must someone infer that the product could make explicit? {{OMIT_INFER}}
- What does the implementation call success that the actor may not? {{OMIT_SUCCESS_GAP}}
- Which state, error, or partial completion is invisible? {{OMIT_INVISIBLE}}
- What realistic interruption or repetition could invalidate the result? {{OMIT_INTERRUPT}}
- Which qualitative claim is being represented by a convenient proxy? {{OMIT_PROXY}}
- What would a naive but competent alternative do better? {{OMIT_BASELINE}}
  <!-- the last question matters most: a framework that only compares the product
       with its own specification can certify avoidable mediocrity. -->

## C. Outcome drives (at verification)

For each critical outcome, evidence must show:

```text
real entry → real operation → real observable result → real failure/recovery case
```

- drive: {{DRIVE}}
- boundary: {{DRIVE_BOUNDARY}} <!-- the assembled artifact at the same boundary
     the actor uses; internal state may diagnose a result, never replace the
     observable claim. -->

## D. Independent product challenge

At least one reviewer approaches the built artifact without inheriting the
builder's explanation of how it is meant to work.

- reviewer: {{CHALLENGE_REVIEWER}}
- inputs given: the objective and constraints only
- findings recorded: what is unclear, unavailable, misleading, fragile, or
  unnecessarily difficult — {{CHALLENGE_FINDINGS}}

<!-- This is not a second full verifier. It is a bounded attempt to discover
     what the contract forgot. -->
