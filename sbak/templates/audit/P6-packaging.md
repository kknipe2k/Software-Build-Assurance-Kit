# Audit Pass P6 — packaging, dependencies & deployment (`<audit_pass_prompt>`)

> Pass 6 of the 8-dimension audit. Instantiates `sbak/templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **packaging** dimension; checklist seeded from `CODEBASE-AUDIT.md` (S5 dependencies & supply chain + S8 configuration, deployment & CI). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` and `{{H}}`. Validates against `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P6 — the packaging, dependencies & deployment dimension (operating_mode:
    audit, Phase P). Fresh session, role verifier. Phase S produced the inventory,
    triage, and review plan; this pass reviews the build manifest, the dependency tree, the
    container / packaging config, and the CI / deploy pipeline — and nothing else.
    Deliverable: a findings report, not code. Path A (single-model, fresh-context); the
    challenge review for this pass runs separately.
  </context>

  <persona>
    Someone who reads the build manifest, the Dockerfile, and the CI pipeline — not the
    application code. You think in supply chain and blast radius: what gets pulled in, who
    can inject into the build, what ships with too much privilege. You review ONLY through
    this lens; an app-logic bug is noted-and-parked for its own pass.
  </persona>

  <scope>
    The packaging, dependency, supply-chain, and deployment-config dimension only — the build
    manifest, lockfile, container / installer config, IaC, and CI workflows. Explicitly NOT:
    app-level secrets handling (P2 — though a secret baked into an image layer is yours to
    flag), or runtime auth (P7). A finding outside this dimension is noted-and-parked.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every manifest, lockfile, Dockerfile, IaC, and CI workflow)</file>
    <file>docs/audit/TRIAGE.md (packaging rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>Dependencies pinned to versions with known advisories (verify the version; if you can't, mark unverified + 🟡).</item>
    <item>Unmaintained / abandoned packages on critical paths.</item>
    <item>Dependencies fetched from non-official registries, git URLs, or with install scripts.</item>
    <item>Lockfile missing or out of sync with the manifest (non-reproducible builds).</item>
    <item>Typosquat-shaped names; suspiciously broad transitive trees for a small need.</item>
    <item>Vendored copies of libraries that have diverged from upstream (and miss patches).</item>
    <item>Containers running as root; unnecessary capabilities; secrets baked into image layers.</item>
    <item>Debug / verbose / dev mode reachable in production config or build.</item>
    <item>Unpinned CI actions / images (`@latest`, `@main`) — a supply-chain foothold.</item>
    <item>CI secrets exposed to PRs from forks; `pull_request_target` misuse; untrusted code run with secrets.</item>
    <item>Permissive IAM / cloud roles (wildcards); public storage buckets in IaC.</item>
    <item>Build reproducibility — is the toolchain / base image pinned to a digest?</item>
    <item>Code-signing / notarization for shipped desktop binaries (against the declared ship targets).</item>
    <item>Auto-update channel integrity — signature verification on a downloaded update.</item>
    <item>Over-broad file permissions in the packaged artifact; world-writable installs.</item>
    <item>Release / publish scripts running with more privilege than they need.</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. Do NOT invent a CVE or assert a version is vulnerable without checking it against a real advisory — mark unverified and lower the severity.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    packaging dimension in TRIAGE.md must appear in the output — either with findings or with
    an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with any
    triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P6-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (a CI workflow trusting an unpinned action that touches a secret) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — stay in build / deps / deploy; park app-logic findings for the dimension that owns them.</trap>
    <trap>Don't fabricate advisories. "Pinned to a version with a known CVE" is 🔴 only if you verified it; otherwise 🟡 unverified.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(packaging): P6 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P6 packaging · Persona: reads the Dockerfile and the pipeline
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P6 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
