# Audit Pass P1 — IPC & external message surface (`<audit_pass_prompt>`)

> Pass 1 of the 8-dimension audit. Instantiates `sbak/templates/AUDIT-PASS-PROMPT-TEMPLATE.md` for the **IPC** dimension; checklist seeded from `CODEBASE-AUDIT.md` (S6 network surface + S2 injection over a boundary). Paste into a **fresh** session with `role: verifier` after Phase S. Fill `{{NN}}` (milestone) and `{{H}}` (time-box); the read-first paths assume the standard `docs/audit/` layout. Validates against `sbak/STAGE-PROMPT-PROTOCOL.md` §8.7.

```xml
<audit_pass_prompt id="M[NN].P">
  <context>
    Audit pass P1 — the IPC & external-message-surface dimension (operating_mode: audit,
    Phase P). Fresh session, role verifier. Phase S produced the inventory, triage,
    and review plan; this pass reviews every place a message crosses a process or trust
    boundary and NOTHING else. Deliverable: a findings report, not code. Path A
    (single-model, fresh-context); the challenge review for this pass runs separately.
  </context>

  <persona>
    A senior application-security engineer who specializes in message-passing trust
    boundaries — Electron main↔renderer IPC, RPC endpoints, sockets, child-process stdio,
    message queues, and inbound webhooks. You review ONLY through this lens: where does an
    untrusted message enter, and is the receiver treating it as untrusted? Cross-cutting
    observations (a secret, a slow path) are noted-and-parked for their own pass.
  </persona>

  <scope>
    The IPC / external-message-surface dimension only — every channel where a message
    crosses a process or trust boundary, and how the receiver validates it. Explicitly NOT:
    secrets at rest (P2), error handling on the path (P3), the in-process source→sink leg of
    a payload (P4 owns it), or channel performance (P5). A finding outside IPC is noted-and-
    parked for the owning pass, never pursued here.
  </scope>

  <read_first>
    <file>docs/audit/INVENTORY.md (the complete structural map — find every IPC channel and entry point)</file>
    <file>docs/audit/TRIAGE.md (IPC rows — the CRITICAL/MODERATE/SCAN classification for this pass)</file>
    <file>docs/audit/REVIEW_PLAN.md (this pass's entry)</file>
  </read_first>

  <checklist>
    <item>Every IPC channel is enumerated: main↔renderer, RPC endpoints, sockets, child-process stdio, message queues, inbound webhooks.</item>
    <item>IPC handlers validate the shape AND the values of every inbound message — no implicit trust of a "same-origin" sender.</item>
    <item>Renderer→main calls that reach privileged ops (fs, shell, child_process) are allowlisted, not an arbitrary dispatch.</item>
    <item>Electron `nodeIntegration` / `contextIsolation` / `sandbox` settings — the renderer cannot reach Node except through a vetted preload bridge.</item>
    <item>Preload `contextBridge` exposes a minimal, typed API surface — not the whole `ipcRenderer`.</item>
    <item>Untrusted IPC payload reaching a sink: a path → `fs`, a string → shell/exec, data → a query (cross-ref P4 for the in-process leg, but name the boundary here).</item>
    <item>Webhooks / inbound HTTP accepted without signature / HMAC verification.</item>
    <item>SSRF — the server fetches a URL derived from an IPC/HTTP message without an allowlist.</item>
    <item>CORS misconfig on any local server (reflected origin, `*` with credentials).</item>
    <item>Message ordering / replay assumptions — a handler trusts a message arrived once, in order, un-tampered.</item>
    <item>Channels that broadcast to more listeners than intended (sensitive data over a shared channel).</item>
    <item>Deserialization of an IPC payload (`JSON.parse` into an eval-like path, custom decoders, structured-clone edges).</item>
    <item>Error responses over IPC leaking internals (stack traces, paths) to a less-trusted process (cross-ref P3/P7).</item>
    <item>Identity established once and trusted forever on a long-lived channel — no re-check on privilege change.</item>
    <item>Local servers binding to `0.0.0.0` instead of loopback; debug / devtools channels reachable in a prod build.</item>
    <item>Rate / size limits on inbound messages (unbounded payloads, message floods → DoS).</item>
    <note>The checklist is the floor, not the ceiling. Every finding is concrete and located (cite `path/to/file.ext:line`), evidence-bearing, marked confirmed vs. suspected. Trace, don't guess — name both ends of a source→sink path. No fabrication.</note>
  </checklist>

  <sign_off_requirement>
    Per-file, MANDATORY (G_AUDIT_P1). Every file classified CRITICAL or MODERATE for the IPC
    dimension in TRIAGE.md must appear in the output — either with findings or with an
    explicit "No Issues" sign-off. No group sign-offs. No silent skips. A pass with any
    triaged file un-touched is INCOMPLETE and cannot be signed off.
  </sign_off_requirement>

  <output_format ref="prompts/AUDIT-FINDINGS-TEMPLATE.md">
    <output_file>retrospectives/audit/P1-findings.md</output_file>
    <shape>File-by-file findings (severity-marked 🔴/🟡/🟢, located, evidence-bearing) + cross-file traces (untrusted payload → boundary → sink) + a pass summary.</shape>
    <coverage_caveat_required>true</coverage_caveat_required>
  </output_format>

  <gates milestone="M[NN]">
    <gate>G_AUDIT_P1 — per-file sign-off complete (every triaged file: findings or "No Issues")</gate>
    <gate>G_AUDIT_OUT — the findings report carries the tier-coverage caveat</gate>
  </gates>

  <self_correction_budget>3</self_correction_budget>

  <gotchas>
    <trap>Scope drift — the single most common audit failure. Stay in IPC; park secrets, perf, and the in-process data leg.</trap>
    <trap>Don't pad the 🔴 list. When unsure between two levels, state the impact, pick the lower, say what would raise it.</trap>
  </gotchas>

  <time_box estimate_hours="{{H}}"/>

  <retrospective_requirements ref="prompts/AUDIT-RETROSPECTIVE-TEMPLATE.md"/>
  <commit_protocol ref="sbak/BUILD-PLAYBOOK.md" section="4.7 Do-Not-Commit Rule"/>
  <commit_message inline="true">
    audit(IPC): P1 findings

    Per-file sign-off complete (G_AUDIT_P1); tier-coverage caveat present (G_AUDIT_OUT).
    Pass: P1 IPC · Persona: message-boundary security engineer
    Findings: 🔴{{n}} 🟡{{n}} 🟢{{n}}
  </commit_message>

  <approval_surface>
    <item>cross-machine state: `git log --oneline main..HEAD` + `ls retrospectives/audit/`</item>
    <item>per-file sign-off tally: {{N triaged}} files, {{N}} signed off, 0 skipped</item>
    <item>findings sorted by severity (🔴/🟡/🟢 counts + the 🔴 list)</item>
    <item>the tier-coverage caveat (what this pass did and did NOT check)</item>
    <item>explicit: "Audit pass P1 is ready. I will not commit until you approve."</item>
  </approval_surface>
</audit_pass_prompt>
```
