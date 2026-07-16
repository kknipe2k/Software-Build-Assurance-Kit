# Audit Challenge Prompt — template (`<audit_pass_prompt>`, challenge variant)

> The fresh-context **challenge review** for a single audit pass (`operating_mode: audit`, Phase C). A challenge is the *same schema* as a pass (`<audit_pass_prompt>`) — but its job is the opposite: it reads **only the prior pass's findings file** and the codebase, and hunts for what the first reviewer **missed**, not to validate what they found. Validates against `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7.
>
> **The bias guard (G_AUDIT_C1).** The challenge session reads **only the prior pass's output** — never the original session's working context or reasoning. Stock Claude Code is single-model, so model-diversity is unavailable (Path A); the fresh-context, no-shared-reasoning property is what preserves the "diverse blind spots" benefit. Run it in a **fresh** session with `role: verifier`, after the pass it challenges has completed.
>
> Tier-conditional: challenge **every** pass at Full; the **security-focused** passes at Standard; **skip** at Lite (per `proposals/OPERATING-MODES.md` §5.6).

---

## CLI prompt

```xml
<audit_pass_prompt id="M[NN].C">
  <context>
    Challenge review for audit pass P{{N}} — the {{DIMENSION}} dimension (operating_mode:
    audit, Phase C). Fresh session, role verifier. You are the SECOND opinion. You
    have read ONLY the first reviewer's findings file and the codebase — not their reasoning.
    Your job is to find what the first pass MISSED, not to confirm what it found. Path A
    (single-model fresh-context challenge).
  </context>

  <persona>
    {{PERSONA — a differently-angled expert in the same dimension, e.g. for security: "an
    offensive-security researcher who assumes the first reviewer was too charitable"}}. You
    are adversarial toward the gaps, not toward the reviewer. Look where attention naturally
    lapses: the files signed off as "No Issues", the boring-looking glue, the edges of the
    dimension.
  </persona>

  <scope>
    The {{DIMENSION}} dimension only — the same scope the pass under challenge covered. You
    are not re-auditing other dimensions; you are widening coverage WITHIN this one. A
    cross-dimension smell is parked, not chased.
  </scope>

  <read_first>
    <file>retrospectives/audit/P{{N}}-findings.md (the ONLY prior-session artifact you read — the pass under challenge; NOT its reasoning or session log)</file>
    <file>docs/audit/INVENTORY.md (the structural map — to find files the pass may have under-weighted)</file>
  </read_first>

  <checklist>
    <item>For each file the pass signed off as "No Issues": is that sign-off actually warranted, or did the reviewer stop early?</item>
    <item>Which {{DIMENSION}} sub-classes does the pass's checklist NOT cover? Look there.</item>
    <item>Are any 🔴/🟡 findings UNDER-rated (severity downgraded to keep the report clean)?</item>
    <item>Cross-file traces the single-file pass would miss — does data cross a {{DIMENSION}} boundary the pass treated file-locally?</item>
    <item>{{... add dimension-specific blind-spot probes}}</item>
    <note>Output only NEW or RE-RATED findings (with the same located, evidence-bearing, confirmed/suspected discipline). Agreeing with the pass is not a finding. Disagreements on severity ARE findings — mark them "disputed".</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). For every file the original pass touched, record
    either a NEW finding, a RE-RATING (disputed severity), or an explicit "challenge concurs —
    no missed issues". No silent skips — the challenge inherits the pass's per-file discipline.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/C{{N}}-challenge.md</output_file>
    <shape>New + re-rated (disputed) findings, file-by-file, severity-marked; a challenge summary naming what the first pass missed and any disputed severities for consolidation.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_C1 — challenge read ONLY the prior pass's output, never the original session's context</gate>
    <gate>G_AUDIT_OUT — the challenge report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Confirmation drift — the pull is to validate the first pass. Resist it: your value is the MISSED finding, not agreement.</trap>
    <trap>Do NOT read the original session's reasoning or chat log — only its findings file. Reading the reasoning re-imports the bias the fresh context exists to remove (G_AUDIT_C1).</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit({{DIMENSION}}): C{{N}} challenge — missed/disputed findings

    Read only P{{N}}-findings.md (G_AUDIT_C1); tier-coverage caveat present.
    New: 🔴{{n}} 🟡{{n}} 🟢{{n}} · Disputed severities: {{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>confirmation: read ONLY P{{N}}-findings.md + codebase (G_AUDIT_C1)</item>
    <item>new findings the pass missed + disputed severities, sorted</item>
    <item>the tier-coverage caveat</item>
    <item>explicit: "Challenge C{{N}} is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
