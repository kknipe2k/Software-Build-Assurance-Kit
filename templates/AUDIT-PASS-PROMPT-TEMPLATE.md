# Audit Pass Prompt — template (`<audit_pass_prompt>`)

> The generic per-dimension audit pass, pasted into a **fresh** session at the start of a pass (`operating_mode: audit`, Phase P). Customize the `{{PLACEHOLDERS}}` per dimension — the eight concrete passes (P1–P8) instantiate this shape, seeding `<persona>` + `<checklist>` from the dimension's review baseline (shipped in M07.B). Validates against `STAGE-PROMPT-PROTOCOL.md` §8.7.
>
> **Axis boundary.** An audit pass *is* verification — it runs as `role: verifier` reading the one `read-first-list-audit.txt` orientation list; there is **no `audit_pass_N` role**. The persona + dimension + checklist ride on this prompt, not on a new session mode. Set `.claude/role` to `verifier` before pasting.

---

## How to use

1. Open a **fresh** session at the repo root with `role: verifier`.
2. Confirm Phase S completed: `docs/audit/INVENTORY.md`, `docs/audit/TRIAGE.md`, `docs/audit/REVIEW_PLAN.md` exist.
3. Paste the filled-in block below. The agent reviews **only this dimension**, signs off **every** triaged file, and writes findings to `retrospectives/audit/P{{N}}-findings.md`.
4. It produces findings, **not** fixes — remediation is a separate, deliberate follow-up.

---

## CLI prompt

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P{{N}} — the {{DIMENSION}} dimension (operating_mode: audit, Phase P).
    Fresh session, role verifier. Phase S produced the inventory, triage, and
    review plan; this pass reviews the {{DIMENSION}} dimension across the codebase and
    nothing else. Deliverable: a findings report, not code. Path A (single-model,
    fresh-context) — the challenge review for this pass runs separately.
  </context>

  <persona>
    {{PERSONA — the one expert who would catch this dimension's bugs, e.g. "a senior
    application-security engineer specializing in input-trust boundaries"}}. You review
    ONLY through this lens. Cross-cutting observations are parked for their own pass — note,
    do not chase. The persona constrains attention so the review goes deep, not wide.
  </persona>

  <scope>
    The {{DIMENSION}} dimension only — {{one-line definition of what is in this dimension}}.
    Explicitly NOT: {{the adjacent dimensions that belong to other passes}}. A finding
    outside this dimension is noted-and-parked for the owning pass, never pursued here.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map)</file>
    <file>docs/audit/TRIAGE.md ({{DIMENSION}} rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>{{Checklist item 1 — a concrete, locatable thing to look for in this dimension}}</item>
    <item>{{Checklist item 2}}</item>
    <item>{{... 15–20 items typical; seeded from the dimension's review baseline}}</item>
    <note>The checklist is the floor, not the ceiling — the persona is expected to find more. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, and marked confirmed vs. suspected. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the
    {{DIMENSION}} dimension in TRIAGE.md must appear in the output — either with findings or
    with an explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with
    any triaged file un-touched is INCOMPLETE and cannot be signed off. The failure mode this
    prevents: quietly skipping the file you assumed was boring — which is exactly where the
    bug hides.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P{{N}}-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — the single most common audit failure. Stay in {{DIMENSION}}; park everything else.</trap>
    <trap>Don't pad the 🔴 list — a report that's all red is one nobody can triage. When unsure between two levels, state the impact, pick the lower, say what would raise it.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit({{DIMENSION}}): P{{N}} findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P{{N}} {{DIMENSION}} · Persona: {{PERSONA}}
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P{{N}} is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
