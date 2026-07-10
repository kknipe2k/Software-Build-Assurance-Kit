# Audit Pass P2 — secrets & credential management (`<audit_pass_prompt>`)

> Pass 2 of the 8-dimension audit. Instantiates `templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **secrets** dimension; checklist seeded from `CODEBASE-AUDIT.md` (S1 secrets & credential management). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P2 — the secrets & credential-management dimension (operating_mode: audit,
    Phase P). Fresh session, role verifier. Phase S produced the inventory, triage,
    and review plan; this pass reviews where credentials live, are read, and are exposed —
    and nothing else. Deliverable: a findings report, not code. Path A (single-model,
    fresh-context); the challenge review for this pass runs separately.
  </context>

  <persona>
    An attacker who clones the repo first. Before touching the running app you read the
    source, the configs, the fixtures, the CI, and — if you can see it — the git history,
    hunting for a credential someone left behind. You review ONLY through this lens; a logic
    bug or a slow query is noted-and-parked for its own pass.
  </persona>

  <scope>
    The secrets & credential dimension only — where keys / tokens / passwords / connection
    strings live, how they're read, and where they leak. Explicitly NOT: the IPC boundary
    (P1), cryptography-algorithm choice or auth logic (P7), or build/deploy hardening (P6 —
    though a secret baked into an image layer is yours to flag at the boundary). A finding
    outside secrets is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every config, fixture, and credential surface)</file>
    <file>docs/audit/TRIAGE.md (secrets rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>Hardcoded passwords, API keys, tokens, private keys, connection strings — in source, configs, tests, fixtures.</item>
    <item>Secrets in committed `.env`, `*.pem`, `*.key`, `id_rsa`, or cloud-credential files.</item>
    <item>Secrets in git history (if visible) even when removed from the current tree.</item>
    <item>Secrets logged, printed, or echoed in error messages / CI output / telemetry.</item>
    <item>Weak or default credentials; example creds that look real (not an obvious `xxxx`).</item>
    <item>Secrets passed on the command line (visible in process listings) instead of env / stdin / a file.</item>
    <item>Secrets baked into build artifacts, container image layers, or source maps shipped to clients.</item>
    <item>Client-bundled secrets — an API key in front-end JS that should be server-side.</item>
    <item>`.gitignore` / `.dockerignore` actually covering the secret files they claim to.</item>
    <item>Secret-manager usage vs. hardcoding; a rotation story for any long-lived credential.</item>
    <item>Test fixtures with real-shaped credentials that could be live.</item>
    <item>Config templates (`.env.example`) carrying real values instead of placeholders.</item>
    <item>Secrets in URLs / query strings (they end up in logs and history).</item>
    <item>Encryption keys / salts hardcoded alongside the data they protect (cross-ref P7).</item>
    <item>Third-party tokens scoped more broadly than the integration needs.</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. Do NOT fabricate — if you cannot verify a credential is live, say "unverified" and lower the severity.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    secrets dimension in TRIAGE.md must appear in the output — either with findings or with
    an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with any
    triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P2-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (a secret read in one file, leaked in another) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay in secrets; park crypto-algorithm and auth-logic findings for P7.</trap>
    <trap>Don't fabricate a "known-vulnerable" claim. A credential is 🔴 only if it's real and reachable; mark a suspected-placeholder 🟡 unverified.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(secrets): P2 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P2 secrets · Persona: attacker who clones the repo first
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P2 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
