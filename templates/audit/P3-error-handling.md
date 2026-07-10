# Audit Pass P3 — error handling & resource safety (`<audit_pass_prompt>`)

> Pass 3 of the 8-dimension audit. Instantiates `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **error-handling** dimension; checklist seeded from `CODEBASE-AUDIT.md` (G2 error handling & resource safety). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P3 — the error-handling & resource-safety dimension (operating_mode: audit,
    Phase P). Fresh session, role verifier. Phase S produced the inventory, triage,
    and review plan; this pass reviews failure paths and resource lifecycle across the
    codebase and nothing else. Deliverable: a findings report, not code. Path A
    (single-model, fresh-context); the challenge review for this pass runs separately.
  </context>

  <persona>
    An SRE who gets paged at 3am. You read code asking "when this fails at 2x load with a
    flaky downstream, what happens?" — does it degrade, leak a connection, retry-storm, or
    crash the worker? You review ONLY through this lens; a happy-path logic bug or a naming
    smell is noted-and-parked for its own pass.
  </persona>

  <scope>
    The error-handling & resource-safety dimension only — failure paths, exception flow, and
    the lifecycle of files / sockets / connections / locks. Explicitly NOT: the correctness
    of the happy path (P4 / P8), or the performance of the path (P5 — though a retry-storm
    that's also a DoS is yours to flag). A finding outside this dimension is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every IO, network, and resource boundary)</file>
    <file>docs/audit/TRIAGE.md (error-handling rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>Errors caught and silently discarded — `catch {}` / bare `except: pass` / ignored `err` returns.</item>
    <item>Resources (files, sockets, DB connections, locks) not released on the error path; missing `finally` / `defer` / context-manager / RAII.</item>
    <item>Unbounded retries, or retries without backoff / jitter; missing timeouts on network / IO.</item>
    <item>Panics / exceptions that escape to the top and crash a worker that should degrade.</item>
    <item>Partial failure leaving inconsistent state (write A succeeds, write B fails, no rollback).</item>
    <item>Error messages leaking internals (stack traces, SQL, paths) to users (cross-ref P7).</item>
    <item>Unhandled promise rejections / async errors — `unhandledRejection`, fire-and-forget awaits.</item>
    <item>Swallowed errors that mask data loss (a failed save reported as success).</item>
    <item>Wrong error re-thrown, losing the original cause (no error chaining / `cause`).</item>
    <item>Cleanup that itself can throw, masking the original error.</item>
    <item>Global error handlers missing, or present but only logging (no degrade / restart).</item>
    <item>Timeouts set but never enforced (a value passed but ignored by the client).</item>
    <item>Resource pools (DB, HTTP) without a max size or leak detection.</item>
    <item>Recovery paths never exercised by a test (the `catch` block that has never run).</item>
    <item>Idempotency on retried operations — a retry double-charges / double-writes.</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    error-handling dimension in TRIAGE.md must appear in the output — either with findings or
    with an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with
    any triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P3-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (a failure in one component leaving another inconsistent) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay in error/resource handling; park happy-path correctness for P4 and perf for P5.</trap>
    <trap>Don't pad the 🔴 list. A swallowed error on a non-critical path is 🟡; one that hides data loss is 🔴 — state the impact.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(error-handling): P3 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P3 error-handling · Persona: SRE who gets paged at 3am
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P3 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
