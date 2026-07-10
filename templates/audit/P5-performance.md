# Audit Pass P5 — performance & scalability (`<audit_pass_prompt>`)

> Pass 5 of the 8-dimension audit. Instantiates `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **performance** dimension; checklist seeded from `CODEBASE-AUDIT.md` (G5 performance & scalability). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P5 — the performance & scalability dimension (operating_mode: audit, Phase P).
    Fresh session, role verifier. Phase S produced the inventory, triage, and review
    plan; this pass reviews the codebase for performance and scaling defects and nothing
    else. Deliverable: a findings report, not code. Path A (single-model, fresh-context);
    the challenge review for this pass runs separately.
  </context>

  <persona>
    An engineer staring at a flame graph. You read code asking "what does this cost at 100x
    the data, and where does the time actually go?" — N+1s, quadratic loops, unbounded
    growth, blocking calls on hot paths. You review ONLY through this lens; a correctness bug
    or a coupling smell is noted-and-parked for its own pass (unless it's also a DoS, which
    is yours).
  </persona>

  <scope>
    The performance & scalability dimension only — algorithmic cost, query patterns, memory
    growth, and blocking on hot paths. Explicitly NOT: correctness of the result (P4), or
    architecture / coupling (P8 — though a structural bottleneck that won't scale is yours to
    flag). A finding outside this dimension is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find the hot paths, the loops, the queries)</file>
    <file>docs/audit/TRIAGE.md (performance rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>N+1 queries; queries inside loops; missing indexes implied by the query shape.</item>
    <item>Loading whole collections into memory where streaming / pagination is needed.</item>
    <item>Quadratic-or-worse algorithms on user-sized inputs.</item>
    <item>Repeated expensive work that should be memoized; chatty network calls.</item>
    <item>Unbounded growth (caches, queues, accumulating lists) with no eviction → a memory leak.</item>
    <item>Blocking calls on hot / async paths (sync IO on the event loop, blocking the UI thread).</item>
    <item>Regex catastrophic backtracking (ReDoS) on user input.</item>
    <item>Render thrash / unnecessary re-renders / missing memoization on the UI hot path.</item>
    <item>Large synchronous serialization (`JSON.stringify` of a huge object) on a request path.</item>
    <item>Missing pagination / limit on a query that can return unbounded rows.</item>
    <item>Resource exhaustion / DoS: unbounded request bodies, zip bombs, unbounded recursion.</item>
    <item>Connection / handle churn (open-per-request instead of pooled).</item>
    <item>Polling where an event / subscription would do; busy-waits.</item>
    <item>Bundle size / startup cost (over-eager imports, no code-splitting) where it matters.</item>
    <item>Lock contention / serialization points that don't scale with load.</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. State the input size at which the cost bites. No fabrication — this is review by inspection, not profiling.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    performance dimension in TRIAGE.md must appear in the output — either with findings or
    with an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with
    any triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P5-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (a hot loop calling a slow component) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay on cost; park correctness for P4 and structural design for P8.</trap>
    <trap>Don't pad the 🔴 list. A quadratic loop on a 5-element fixed list is 🟢; on user-sized input it's 🔴 — state the input size.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(performance): P5 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P5 performance · Persona: engineer staring at a flame graph
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P5 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
