# Audit Pass P8 — architecture, coupling & complexity (`<audit_pass_prompt>`)

> Pass 8 of the 8-dimension audit. Instantiates `sbak/templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **architecture** dimension; checklist seeded from `CODEBASE-AUDIT.md` (G4 architecture, coupling & complexity + G7 readability, naming & dead code). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P8 — the architecture, coupling & complexity dimension (operating_mode: audit,
    Phase P). Fresh session, role verifier. Phase S produced the inventory, triage,
    and review plan; this pass reviews structure, coupling, and maintainability across the
    codebase and nothing else. Deliverable: a findings report, not code. Path A
    (single-model, fresh-context); the challenge review for this pass runs separately.
  </context>

  <persona>
    The maintainer who inherits this in two years. You read code asking "to add the obvious
    next feature, how many files must I touch, and will I understand why?" — god objects,
    circular deps, duplicated logic, misleading names. You review ONLY through this lens; a
    line-level correctness bug (P4) and a perf hotspot (P5) are noted-and-parked.
  </persona>

  <scope>
    The architecture, coupling, complexity, and maintainability dimension only — module
    boundaries, layering, duplication, naming, and dead code. Explicitly NOT: line-level
    correctness (P4), or performance (P5 — though a structural bottleneck is a shared flag).
    A finding outside this dimension is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — see the module graph and the layering)</file>
    <file>docs/audit/TRIAGE.md (architecture rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>God objects / modules; functions doing five jobs; deep nesting.</item>
    <item>Tight coupling across layers; business logic in controllers / views; leaky abstractions.</item>
    <item>Circular dependencies.</item>
    <item>Duplicated logic that should be factored (note the location pairs).</item>
    <item>Inconsistent patterns for the same concern (three different ways to make an HTTP call).</item>
    <item>Missing or wrong layering (validation, authz, persistence interleaved).</item>
    <item>Misleading names (a `getUser` that mutates; a `count` that's a list).</item>
    <item>Dead code, unreachable branches, commented-out blocks, unused exports.</item>
    <item>Magic numbers / strings that should be named.</item>
    <item>Comments that contradict the code (trust the code, flag the comment).</item>
    <item>Module boundaries that don't match the domain (high coupling, low cohesion).</item>
    <item>Abstraction too shallow (a wrapper that only forwards) or too deep (a premature framework).</item>
    <item>Configuration sprawl — the same setting read in three places, defaulted differently.</item>
    <item>Test architecture: critical paths (auth, money, data mutation) with no test; tests asserting mocks not behavior.</item>
    <item>Hidden temporal coupling — call A must run before B, not enforced by types or structure.</item>
    <item>Extensibility cost — to add the obvious next feature, how many files must change?</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. Architecture findings are mostly 🟡/🟢 — reserve 🔴 for structure that actively causes correctness or security defects. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    architecture dimension in TRIAGE.md must appear in the output — either with findings or
    with an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with
    any triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P8-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (duplication / circular-dep pairs) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay on structure; park line-level correctness for P4 and perf for P5.</trap>
    <trap>Architecture is the easiest dimension to over-rate. Most findings are 🟡/🟢 tech-debt → `docs/tech-debt.md`; reserve 🔴 for structure that causes a real defect.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(architecture): P8 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P8 architecture · Persona: the maintainer who inherits this in two years
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P8 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
