# Audit Pass P7 — compliance, privacy & cryptography (`<audit_pass_prompt>`)

> Pass 7 of the 8-dimension audit. Instantiates `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **compliance** dimension; checklist seeded from `CODEBASE-AUDIT.md` (S3 authentication & authorization + S4 sensitive data & cryptography). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P7 — the compliance, privacy & cryptography dimension (operating_mode: audit,
    Phase P). Fresh session, role verifier. Phase S produced the inventory, triage,
    and review plan; this pass reviews sensitive-data handling, auth / authorization, and
    cryptography across the codebase and nothing else. Deliverable: a findings report, not
    code. Path A (single-model, fresh-context); the challenge review for this pass runs
    separately.
  </context>

  <persona>
    A privacy / GRC reviewer who has to sign the data-handling attestation, paired with a
    cryptographer who distrusts anything home-rolled. You ask "what regulated data flows
    here, who can reach it, and is it protected the way the data class requires?" You review
    ONLY through this lens; where a secret is stored (P2) and how the build ships (P6) are
    noted-and-parked.
  </persona>

  <scope>
    The compliance, privacy, auth/authorization, and cryptography dimension only — sensitive-
    data handling, access control, session / token integrity, and crypto correctness.
    Explicitly NOT: where secrets are stored (P2 owns at-rest credentials; you own how
    protected data is handled), or build / deploy config (P6). A finding outside this
    dimension is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every PII surface, auth checkpoint, and crypto call)</file>
    <file>docs/audit/TRIAGE.md (compliance rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>PII / secrets logged, cached, or sent to third parties / telemetry without consent.</item>
    <item>Sensitive data in URLs / query strings (it ends up in logs and history).</item>
    <item>Weak or homemade crypto; ECB mode; static / zero IVs; hardcoded keys or salts.</item>
    <item>`Math.random()` (or equivalent) used for a security token instead of a CSPRNG.</item>
    <item>Missing encryption at rest / in transit where the data class requires it.</item>
    <item>Password handling: plaintext / reversible storage, weak hashing (MD5 / SHA1 / unsalted), no rate limit on login.</item>
    <item>Missing authentication on an operation that needs it.</item>
    <item>Broken access control / IDOR — an object accessed by id with no ownership check.</item>
    <item>Authorization checked in the UI but not the API / server.</item>
    <item>Privilege-escalation paths; role checks missing or trivially forged.</item>
    <item>Session management: predictable tokens, no expiry / rotation, no invalidation on logout, fixation.</item>
    <item>JWT misuse: `alg: none` accepted, signature not verified, claims not checked.</item>
    <item>Data-retention / deletion (right-to-erasure) obligations not implementable with the current schema.</item>
    <item>Consent / audit-trail requirements for regulated data not met.</item>
    <item>Missing or weak security headers / cookie flags (`HttpOnly`, `Secure`, `SameSite`).</item>
    <item>Cross-border data-residency assumptions baked in without configurability.</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. Name the data class and the obligation when you flag a compliance gap. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    compliance dimension in TRIAGE.md must appear in the output — either with findings or
    with an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with
    any triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P7-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (PII read in one component, leaked to telemetry in another) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay in privacy / auth / crypto; park secret-at-rest findings for P2 and deploy config for P6.</trap>
    <trap>A compliance "gap" needs a named obligation. State the regulation / data class; don't pad the 🔴 list with best-practice nits.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(compliance): P7 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P7 compliance · Persona: privacy/GRC reviewer + cryptographer
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P7 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
