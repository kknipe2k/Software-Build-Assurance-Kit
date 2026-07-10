# Framework Configuration — {{PROJECT_NAME}}

> The active tier, expertise level, and toggles for this project. Read by every fresh session at start (after `CLAUDE.md`). Edit this file to re-tier or change individual toggles; append a dated entry to the override log when you do.
>
> Canonical reference for what each tier and toggle means: **`FRAMEWORK-CONFIG.md`** at the repo root.

---

## Active calibration

**Operating mode:** {{OPERATING_MODE}}  <!-- operating_mode: greenfield / bug_fix / audit / research_publish — what kind of work this is (project-scoped). Default greenfield. Drives discovery questions, scaffold deltas, and phase shape; the SessionStart hook composes the read-first list from this + role. greenfield + bug_fix + research_publish are implemented; audit is TBD (M07). NOTE for research_publish: the tier above applies to Phase A (the app) only — Phase R (research) is Lite-process-locked regardless of tier, keeping just the mandatory sources registry; Phase A re-tiers and inherits Stage V. -->
**Tier:** {{TIER}}
**Expertise:** {{EXPERTISE}}
**Deliverable type:** {{DELIVERABLE_TYPE}}  <!-- cli / web / library / service / other — selects spec + phase-doc templates and verification passes -->
**Permission fence:** {{PERMISSION_FENCE}}  <!-- maximum_oversight / fenced_autonomy / sleep_through — the .claude/settings.json profile the bootstrap copied into the live `permissions` block. NOT an independent dial: it's selected by approval_cadence (Maximum→maximum_oversight, Standard→fenced_autonomy [recommended], Minimum→sleep_through). Recorded here so a cadence re-tier logs the fence change too. The deny floor is level-invariant; git commit/push stay `ask` at every level (G1). -->

risk_triggers: {{RISK_TRIGGERS}}  <!-- [] or a comma-list of the declared risk surfaces this project touches, from the six enumerated in FRAMEWORK-CONFIG.md §4.19 (destructive_data_ops / archive_extraction / untrusted_fs_writes / credentials / untrusted_html / installers). RISK OVERRIDES TIER: each declared trigger auto-escalates verification depth + approval cadence above the tier floor, VISIBLY. validators/validate-risk-escalation.cjs (G11) BLOCKS a declared trigger that carries no visible escalation record (the token `deep verification because:` bound to the trigger) in docs/gates.md. `[]` is fine and common — the point is to declare, so a high-risk surface isn't left at the tier floor by omission. Set during the calibration interview. -->

**Tier rationale:** {{TIER_RATIONALE}}

**Expertise rationale:** {{EXPERTISE_RATIONALE}}

**Deliverable-type rationale:** {{DELIVERABLE_TYPE_RATIONALE}}

---

## Active toggles

| Toggle | Value | Notes |
|---|---|---|
| approval_cadence | {{APPROVAL_CADENCE}} | per_step / per_stage / per_milestone / per_pr. One dial, two effects: also selects the **permission fence** above (Maximum→maximum_oversight, Standard→fenced_autonomy, Minimum→sleep_through). |
| retro_depth | {{RETRO_DEPTH}} | none / brief / two_axis / three_axis |
| ledger | {{LEDGER}} | none / append_only_advisory / append_only_enforced |
| web_verify | {{WEB_VERIFY}} | always / on_request / never |
| read_first_cap | {{READ_FIRST_CAP}} | small (4) / medium (8) / large (12) / unlimited |
| research_mode | {{RESEARCH_MODE}} | best_practice_first / token_frugal / time_bound / complexity_bound |
| escalation | {{ESCALATION}} | time_box_2x / time_box_strict / iteration_3 |
| hook_enforcement | {{HOOK_ENFORCEMENT}} | enforced / advisory / disabled |
| explanation_mode | {{EXPLANATION_MODE}} | verbose / standard / terse |
| red_review | {{RED_REVIEW}} | on / off — red-stop gate: pause after tests are red for test-design approval before implementing green. Default `on` at Standard+, `off` at Lite. |
| verbosity | {{VERBOSITY}} | terse / standard / verbose — meta-dial: sets explanation_mode + web_verify + pre_write_surface + retro narration together (each still overridable). Default: Novice→verbose, Expert→terse, else standard. |
| pre_write_surface | {{PRE_WRITE_SURFACE}} | always / spec_and_plan_only / none — which artifacts are surfaced before writing vs written-then-reviewed. Default `spec_and_plan_only` at Standard. Set by `verbosity`. |
| gap_analysis_cadence | {{GAP_ANALYSIS_CADENCE}} | per_milestone / per_release — when the full gap-analysis ledger entry is written. Default `per_release` at Standard (summary + CHANGELOG at intermediate closeouts), `per_milestone` at Full. |
| verification_locus | {{VERIFICATION_LOCUS}} | cloud / local_first / hybrid — where tests run. local_first/hybrid: full suite local at pre-push (`scripts/verify-local.cjs`); cloud only on version tags. hybrid adds one ubuntu PR smoke check as the non-bypassable backstop. Default `hybrid`. See `FRAMEWORK-CONFIG.md` §4.14. |
| refactor_mode | {{REFACTOR_MODE}} | skip / trigger_n5 / trigger_n3 / trigger_n2 / every_milestone — cadence of Stage R (refactor health check). Trigger-based on `docs/tech-debt.md` count OR milestone interval, whichever first. Default: Lite=`skip`, Standard=`trigger_n5`, Full=`trigger_n3`. Thresholds are data-tunable hypotheses. See `FRAMEWORK-CONFIG.md` §4.11. |
| off_track_check | {{OFF_TRACK_CHECK}} | brief / advisory / enforced — priority-drift guard (G8): the per-stage off-track line + full closeout check against `docs/backlog.md`, flagging unjustified priority inversions. Default: Lite=`brief`, Standard=`advisory`, Full=`enforced`. `/on-track` is available at every value. Backlog is HITL co-authored (no AI-only edits). See `FRAMEWORK-CONFIG.md` §4.15. |
| app_map | {{APP_MAP}} | skip / on — `docs/app-map.md`, the living drive/test map (surface · gesture · test-id · State), bound to test-ids by `validators/validate-app-map.cjs`. Default: `on` at Standard+ for drivable surface classes (`ui`/`command`/`endpoint`); `skip` for Lite and for `library` (`api`). The map is type-agnostic; only the vocabulary adapts. See `FRAMEWORK-CONFIG.md` §4.16. |
| test_honesty | {{TEST_HONESTY}} | warn / block — the G9 test-honesty gate: a v1.7+ work stage carries a `<test_honesty>` slot (named mutation, or `n/a — no risk surface`) and no staged test is assertion-free / exception-only, enforced by `validators/validate-test-honesty.cjs`. `warn` = advisory, `block` = blocks the commit. Default: Lite=`warn`, Standard=`warn`, Full=`block`. Risk-tiered + incremental; pre-v1.7 docs grandfathered. See `FRAMEWORK-CONFIG.md` §4.17. |
| risk_escalation | {{RISK_ESCALATION}} | warn / block — the G11 risk-escalation gate: each `risk_triggers:` token (above) must carry a visible escalation record (`deep verification because:`) in `docs/gates.md`, enforced by `validators/validate-risk-escalation.cjs`. `warn` = advisory, `block` = blocks the commit. Default: Lite=`warn`, Standard=`warn`, Full=`block`. Fail-closed (a declared trigger + unreadable `gates.md` → non-zero; a no-trigger project never reads it). See `FRAMEWORK-CONFIG.md` §4.19. |

See `FRAMEWORK-CONFIG.md` §4 for the full schema and each toggle's semantics.

---

## Override log (append-only)

This log records every tier change and toggle override. Don't edit prior entries — that defeats the audit trail. Append new entries below with a date and rationale.

This log follows the same invariant as the project's other append-only ledgers — the kit's shared checker `validators/check-append-only.cjs` (run on PRs by `.github/workflows/append-only-ledger.yml`) is the reference. Note, though, that *this file as a whole is intentionally editable* (the Tier line and toggle table change on re-tier), so `project-config.md` is **deliberately excluded** from that workflow's whole-file path set — a byte-prefix check would false-positive on a legitimate re-tier. The override log stays append-only by convention and human review.

- {{BOOTSTRAP_DATE}}: Initial bootstrap as {{TIER}} tier, {{EXPERTISE}} expertise.

---

## How to change calibration

**To change tier:** edit the `Tier` line above. Update toggles to match the new tier's defaults (or keep specific overrides — note them in the log). Append a dated log entry with the trigger (e.g., "audit needs surfaced; escalating to Full").

**To change a single toggle:** edit the row in the Active toggles table. Append a log entry naming the toggle, the old value, the new value, and why.

**To change expertise:** edit the `Expertise` line. Adjust toggles that depend on expertise (`web_verify`, `research_mode`, `explanation_mode`, `approval_cadence`). Append a log entry.

**To change operating mode:** rare mid-project — a mode change usually means a *new* project (e.g., an `audit`'s findings becoming a `greenfield` remediation). If you do switch, edit the `Operating mode` line, append a dated log entry naming the trigger, and expect the SessionStart hook to compose a different read-first list family on the next session. The pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any value outside {greenfield, bug_fix, audit, research_publish}.

Re-tiering changes *future* behavior, not history. Existing retrospectives, ledger entries, and Phase docs stay as they are; new ones follow the new calibration. See `FRAMEWORK-CONFIG.md` §7 for the re-tier protocol in detail.

---

## Quick references

- Tier definitions and decision aids: `FRAMEWORK-CONFIG.md` §2–§3
- Expertise dimension: `FRAMEWORK-CONFIG.md` §2.5
- Toggle schema (full): `FRAMEWORK-CONFIG.md` §4
- Toggle interaction smells (anti-patterns): `FRAMEWORK-CONFIG.md` §8
- Per-tier overhead estimates: `FRAMEWORK-CONFIG.md` §10
- Read-first cap rationale: `BUILD-PLAYBOOK.md` §2.4
- SessionStart hook (auto-loads read-first list): `.claude/hooks/session-start-read-first.cjs`
- Read-first list (capped at session start): `.claude/read-first-list.txt`
