# MODE-audit.md — the `audit` operating-mode playbook (Software Build Assurance Kit bootstrap)

> **Re-homed VERBATIM from the bootstrap `CLAUDE.md` §"Phase 0 Step 0.0" + the leading-dial section.** Read this file when Phase 0 Step 0.0 resolves `operating_mode` to `audit` — a session loads exactly ONE mode playbook and leaves the other three unread. The moved text below is byte-for-byte; references to Steps 0.1–0.2, the Phases, and "below"/"above" resolve against the router's workflow in `CLAUDE.md`.

## The Step-0.0 playbook

- **`audit`** — review an existing codebase (security / performance / architecture / compliance); the deliverable is a **findings report + remediation backlog, not new code**. Routes to its own shape and **replaces** the greenfield discovery + Phases 1–4:
  - **Discovery (Step 0.2 replacement):** there is **no spec to author — the existing codebase is the spec.** Ask which **dimensions** to audit (from the 8: IPC / secrets / error-handling / data-flow / performance / packaging / compliance / architecture) and at what depth; the tier sets the default count (Lite 1–2 / Standard 3–4 / Full all 8). **Skip** the greenfield Phases 1–2 (no `spec/project-spec.md`, no `docs/scope.md` milestone breakdown) and the design discovery (1.5/1.6).
  - **Phase shape (replaces greenfield Phases 1–4):** **Phase S** (S1 inventory → S2 triage → S3 plan) → **Phase P** (the per-dimension passes P1–P8, each an `<audit_pass_prompt>` carrying a persona + scope + 15–20-item checklist + mandatory per-file sign-off, run as `role: verifier`) → **Phase C** (a fresh-context challenge per pass, reading **only** the prior pass's output) → **consolidation** (`FINAL_REVIEW.md` + the append-only findings ledger). **No milestones and no Stage V — audit *is* verification** (per-file sign-off + challenge are its internal V).
  - **Scaffold delta (Phase 3):** generate `docs/audit/INVENTORY.md` / `TRIAGE.md` / `REVIEW_PLAN.md` (from `sbak/templates/audit/`), `docs/audit/findings-ledger.md` (the append-only consolidated ledger; joins `append-only-ledger.yml`'s LEDGERS set), the per-pass + challenge output dir `retrospectives/audit/` (`P[N]-findings.md`, `C[N]-challenge.md`, `FINAL_REVIEW.md`), and copy `sbak/templates/dot-claude/read-first-list-audit.txt` (the slim INVENTORY/TRIAGE/REVIEW_PLAN + findings-ledger list the hook composes under `operating_mode: audit`). Still generate the always-on hooks, validators, and `.claude/` wiring. **Skip** the spec/scope/milestone/Phase-doc/backlog rows.
  - **Pass prompts:** use `sbak/templates/AUDIT-PASS-PROMPT-TEMPLATE.md` + the eight `sbak/templates/audit/P1–P8` passes (`<audit_pass_prompt>` schema — the 5th stage-prompt schema, maps to `role: verifier`; no new `role` value). Challenge runs from `sbak/templates/AUDIT-CHALLENGE-PROMPT-TEMPLATE.md`.
  - **`audit_multi_model` (default `false` — Path A):** single-model with fresh-context challenges (the diversity is fresh context, not a different model). Path B (multi-model via SDK) is the future route; leave at `false` unless wired.
  - **Workflow detail:** `sbak/BUILD-PLAYBOOK.md` §3.8; gates `G_AUDIT_S1/P1/C1/OUT` off the numbered line (`sbak/PROCESS-VALIDATION.md`).


## The leading-dial summary

- **`audit`** — review an existing codebase (security / performance / architecture / compliance); the deliverable is a findings report + remediation backlog, not new code. The existing codebase is the spec: **Phase S → Phase P → Phase C → consolidation**, **no milestones and no Stage V** (audit *is* verification). Tier selects the dimension count (Lite 1–2 / Standard 3–4 / Full all 8); `audit_multi_model` default `false` (Path A — fresh-context challenges). **Implemented** (`sbak/BUILD-PLAYBOOK.md` §3.8).

