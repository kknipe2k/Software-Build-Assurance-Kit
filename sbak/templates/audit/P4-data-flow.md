# Audit Pass P4 — data flow & input validation (`<audit_pass_prompt>`)

> Pass 4 of the 8-dimension audit. Instantiates `sbak/templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **data-flow** dimension; checklist seeded from `CODEBASE-AUDIT.md` (G3 data flow & state + S2 injection & input validation). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P4 — the data-flow & input-validation dimension (operating_mode: audit, Phase
    P). Fresh session, role verifier. Phase S produced the inventory, triage, and
    review plan; this pass traces how untrusted values move from source to sink inside the
    app and nothing else. Deliverable: a findings report, not code. Path A (single-model,
    fresh-context); the challenge review for this pass runs separately.
  </context>

  <persona>
    Someone who has to reason about where every value came from and whether it was ever
    validated — equal parts the engineer who traces a tainted input to its sink and the one
    who asks "was this value optional at the source and assumed present here?" You review
    ONLY through this lens; the IPC boundary itself (P1) and a slow query (P5) are noted-and-
    parked.
  </persona>

  <scope>
    The data-flow, state, and input-validation dimension only — how untrusted or mutable
    values move through the app, and whether each sink trusts what it shouldn't. Explicitly
    NOT: the IPC / network boundary itself (P1 owns the crossing; you own the in-process
    leg), secrets (P2), or performance of the path (P5). A finding outside this dimension is
    noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every input source and dangerous sink)</file>
    <file>docs/audit/TRIAGE.md (data-flow rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>SQL / NoSQL injection — string-built queries with untrusted input; missing parameterization.</item>
    <item>Command injection — untrusted input reaching `exec` / `system` / `spawn` / `subprocess` / backticks.</item>
    <item>Path traversal — user input in file paths without normalization / allowlist (`../`).</item>
    <item>XSS — untrusted data into HTML / JS / attributes without escaping; `innerHTML`, `dangerouslySetInnerHTML`.</item>
    <item>Template / expression injection; deserialization of untrusted data (`pickle`, `yaml.load`, `unserialize`).</item>
    <item>Validation that is client-side only, or allow / deny lists that are bypassable.</item>
    <item>Mutable global / shared state; hidden side effects across call sites.</item>
    <item>The same field parsed two different ways in two places (inconsistent transformation).</item>
    <item>Nullability not honored end-to-end — optional at the source, treated as present at the sink.</item>
    <item>Trust assumptions on data that crossed a boundary without re-validation.</item>
    <item>Stale caches; cache-invalidation gaps; read-after-write inconsistency.</item>
    <item>Type-coercion surprises (`==` vs `===`, string/number confusion, truthy/falsy edges).</item>
    <item>Off-by-one, boundary, and empty / null / zero-length cases on the data path.</item>
    <item>Encoding / charset assumptions (UTF-8 vs bytes; double-decoding).</item>
    <item>Data validated on write but not on read (or vice versa) when both cross a boundary.</item>
    <note>The checklist is the floor, not the ceiling. Trace, don't guess — a vuln is a source→sink path; name both ends. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    data-flow dimension in TRIAGE.md must appear in the output — either with findings or with
    an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with any
    triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P4-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (untrusted source → unvalidated transform → dangerous sink) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay on the in-process data path; park the IPC crossing for P1 and perf for P5.</trap>
    <trap>An injection sink with no reachable untrusted source is 🟡 suspected, not 🔴 — trace the source before you rate it red.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(data-flow): P4 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P4 data-flow · Persona: reasons about where every value came from
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P4 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
