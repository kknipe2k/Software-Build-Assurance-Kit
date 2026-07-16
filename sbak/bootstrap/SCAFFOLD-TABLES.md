# SCAFFOLD-TABLES.md — the Phase-3 scaffold contract (Software Build Assurance Kit bootstrap)

> **Re-homed VERBATIM from the bootstrap `CLAUDE.md` §"Phase 3: Project scaffold generation".** Read this file at Phase 3, before any disk write. The `details` protocol reads the tables out of this file **byte-identically** — do not synthesize a tier comparison from memory; quote the tables and let the canonical text speak. Everything below this file's `### Phase 3` heading is the moved block, byte-for-byte.

### Phase 3: Project scaffold generation

#### Always generated (all tiers)

| Generated file | From template | What it is |
|---|---|---|
| `CLAUDE.md` | `sbak/templates/PROJECT-CLAUDE.md` | Project execution rules (replaces this bootstrap CLAUDE.md). Tier-conditional sections trimmed to match. |
| `project-config.md` | `sbak/templates/project-config.md` | The active tier + expertise + toggle values, plus the override log |
| `docs/identity.md` | `sbak/templates/identity.md` | What this is / what this isn't + read-first list (capped per tier) |
| `docs/scope.md` | `sbak/templates/scope.md` | The phased milestone scope (filled from Phase 2) |
| `docs/backlog.md` | `sbak/templates/backlog.md` | The ranked, HITL-co-authored priority backlog (first draft from Phase 1/2; what the off-track check / G8 measures against). On the work read-first list. Tier-scaled: Lite = `# / story / status`; Standard adds `Depends on`; Full adds override-log-on-re-rank. |
| `.claude/settings.json` | `sbak/templates/dot-claude/settings.json` | Wires the SessionStart hook (mode-aware read-first list), the UserPromptSubmit hook (mode↔prompt match enforcement), **and** the PreToolUse red-gate hook (blocks pre-approval implementation edits — PROC-001), plus the tiered permission fence (selected by `approval_cadence` — see the note below) |
| `.claude/hooks/session-start-read-first.cjs` | `sbak/templates/dot-claude/hooks/...` | Auto-loads read-first list (Node; cross-platform) |
| `.claude/hooks/user-prompt-submit-mode-check.cjs` | `sbak/templates/dot-claude/hooks/...` | Blocks a pasted stage prompt whose mode (work/verifier) disagrees with `.claude/role` — structural guard for the 3-brain separation (Node; cross-platform) |
| `.claude/hooks/pretooluse-red-gate.cjs` | `sbak/templates/dot-claude/hooks/...` | The hard PROC-001 red-stop (matcher `Edit\|Write\|MultiEdit\|NotebookEdit`): while a stage is open (`.claude/stage-active`) and not yet `/approve-red`'d, blocks edits to implementation paths so tests come before code. Work mode only; fail-open by design (Node; cross-platform) |
| `.claude/hooks/receipts-lifecycle.cjs` | `sbak/templates/dot-claude/hooks/...` | The build-receipt lifecycle adapter — ONE shared hook registered on every lifecycle boundary (SessionStart/SessionEnd/UserPromptSubmit/Stop/PreToolUse-broad/PostToolUse/PostToolUseFailure/PermissionRequest), added ALONGSIDE the read-first + mode-check + red-gate entries. Maps each boundary to a bounded receipt event and appends to `.claude/receipts/` (gitignored) via `scripts/lib/receipts.cjs`. Exit-code discipline (RCPT-09): exactly one exit (0) + no stdout, so a metrics fault never alters a hook's exit; fail-open (Node; cross-platform) |
| `scripts/set-mode.cjs` | `sbak/templates/scripts/set-mode.cjs` | Atomic writer for `.claude/role` — the only supported way to set the session role (avoids the ERR-002 truncate-write race). `/verify`, `/refactor`, and the SessionStart hook depend on it |
| `scripts/stage-active.cjs` | `sbak/templates/scripts/stage-active.cjs` | Atomic writer for `.claude/stage-active` — the open-stage marker the red-gate keys off; `/stage` opens it, `--clear` closes it (and clears `.claude/red-approved`) |
| `scripts/approve-red.cjs` | `sbak/templates/scripts/approve-red.cjs` | Writes `.claude/red-approved` for the open stage — the human's `/approve-red` unlock that releases the red-gate for that stage only (a fresh stage starts un-approved) |
| `.claude/read-first-list.txt` | `sbak/templates/dot-claude/read-first-list.txt` | Work-mode read list, capped per tier |
| `.claude/read-first-list-verifier.txt` | `sbak/templates/dot-claude/read-first-list-verifier.txt` | Verifier-mode read list (omits retros — fresh-context bias guard) |
| `.claude/read-first-list-orchestrator.txt` | `sbak/templates/dot-claude/read-first-list-orchestrator.txt` | Orchestrator-mode read list (loads ORCHESTRATOR.md first; used Standard+) |
| `.claude/read-first-list-refactor.txt` | `sbak/templates/dot-claude/read-first-list-refactor.txt` | Refactor-mode (Stage R) read list — strictest bias guard: omits retros **and** prior R findings (used Standard+; harmless at Lite where `refactor_mode: skip`) |
| `validators/validate-stage-prompts.cjs` | (copy from the kit's `sbak/validators/`, unchanged) | Schema validator; runs as pre-commit + CI |
| `validators/validate-retrospective.cjs` | (copy from the kit's `sbak/validators/`, unchanged) | User-friction-stamp gate; runs as pre-commit. Fails a commit whose staged retro has an empty/placeholder stamp. (Standard+) |
| `validators/validate-app-map.cjs` | (copy from the kit's `sbak/validators/`, unchanged) | App-Map currency primitive — test-id binding (every `verified` entry's id must exist in the test globs) + surface-source-diff tripwire. Runs in CI after the green-suite gate. Generated when `app_map: on` (Standard+ drivable surface classes). |
| `validators/validate-test-honesty.cjs` | (copy from the kit's `sbak/validators/`, unchanged) | The G9 test-honesty gate — a v1.7+ work stage carries a `<test_honesty>` slot (named mutation, or `n/a — no risk surface`) + flags assertion-free / exception-only staged tests. Runs as pre-commit (severity per `test_honesty`: `warn`/`block`). Risk-tiered + incremental; pre-v1.7 docs grandfathered. |
| `validators/README.md` | (copy from the kit's `sbak/validators/`, unchanged) | Validator usage docs. **The rows above are the tier-active headline validators; the COMPLETE inherited set — all 15 shipped `validators/*.cjs`, each with its tier condition — is enumerated in the note immediately below this table.** |
| `.github/workflows/validate-stage-prompts.yml` | `sbak/templates/dot-github/workflows/...` | CI workflow that runs `--all` on Phase docs |
| `.github/copilot-instructions.md` | `sbak/templates/dot-github/copilot-instructions.md` | Shim auto-loaded by GitHub Copilot in VS Code (Claude model). Harmless for Claude Code users; load-bearing for Copilot users. Generated regardless of host so the project is Copilot-ready out of the box. |
| `CHANGELOG.md` | (generated empty) | Release notes; for Lite, this also serves the role gap-analysis plays in higher tiers |
| `.gitattributes` | `sbak/templates/dot-gitattributes` | Forces `* text=auto eol=lf` so tracked text files are LF on disk regardless of OS or the user's `core.autocrlf`. Prevents the Windows CRLF-vs-prettier failure where every file fails `format:check`. One line; generated for every tier. |
| `.gitignore` | `sbak/templates/dot-gitignore` | Ignores framework transient state (`.claude/build-status.md`, `.claude/role`); a stub for project/stack ignores. Merge with the stack's own ignores if the user has one. |
| `LICENSE` | `sbak/templates/LICENSE` | The project's license — MIT body (the scaffold default) with `{{LICENSE_TYPE}}`/`{{LICENSE_HOLDER}}`/`{{LICENSE_YEAR}}` filled from the owner's discovery answer, **never guessed** (hard rule #7). Closes the README-implies-a-license-but-none-ships gap. To ship a non-MIT license, replace the body. |
| `scripts/verify-local.cjs` | `sbak/templates/scripts/verify-local.cjs` | The one local verification entrypoint — Linux-in-Docker + dev-OS-native in sequence, non-zero on any failure (`verification_locus`). Lite may run native-only. |
| `scripts/install-hooks.cjs` | `sbak/templates/scripts/install-hooks.cjs` | One-time `git config core.hooksPath .githooks` install — the documented setup step. |
| `.githooks/pre-commit` | `sbak/templates/dot-githooks/pre-commit` | Fast checks (lint + unit subset) + the framework validators when relevant files are staged. |
| `.githooks/pre-push` | `sbak/templates/dot-githooks/pre-push` | Runs the full local matrix (`scripts/verify-local.cjs`); blocks the push on failure. The teeth behind local-first verification. |
| `validators/lib/fenced-block.cjs` | (copy from the kit's `sbak/validators/`, unchanged) | The shared fenced-block/CRLF primitive `validate-stage-prompts` and `validate-retrospective` require — without it the rendered headline validators crash MODULE_NOT_FOUND. |
| `scripts/kit-update.cjs` | `sbak/templates/scripts/kit-update.cjs` | The update story: diffs the project's live kit-managed enforcement files against the kit's `sbak/templates/` (stamp + LF-normalized hash), respects declared ARC-007 intentional divergence (reported, never overwritten), offers explicit per-file `--apply` re-copy (temp+rename, confined). Read-only by default; no-ops in the kit repo itself. |
| `scripts/smoke-project.cjs` | `sbak/templates/scripts/smoke-project.cjs` | The generated mini-smoke: the project's OWN regression floor — each of the four hooks + every present validator entry point exercised on synthetic sandbox fixtures, one happy + one failing case each; absent validators are a visible skip. A user who tweaks a validator locally is no longer flying test-free. The bake runs the baked project's own copy. |
| `scripts/lib/sandbox.cjs` | `sbak/templates/scripts/lib/sandbox.cjs` | The fixture-confinement primitive (`assertInside`, git-env scrub, sandbox roots) that `kit-update --apply` and the mini-smoke consume — confinement travels with the tools that need it (byte-parity with the kit's own copy). |
| `scripts/lib/receipts.cjs` | `sbak/templates/scripts/lib/receipts.cjs` | The build-receipt contract: per-session append-only event ledgers under `.claude/receipts/` (gitignored), the privacy allowlist with teeth, honest interval arithmetic (unknown is never zero), and the `software-build-assurance-kit/build-receipt/v1` statement builder that refuses receipts lacking provenance or limitation (byte-parity with the kit's own copy). |
| `scripts/build-receipts.cjs` | `sbak/templates/scripts/build-receipts.cjs` | The build-receipts CLI: validate a receipts ledger dir and print coverage; the collectors and the deterministic JSON/HTML report renderer live here too. An absent ledger dir is a stated coverage note, never an error. |
| `scripts/lib/receipts-collect.cjs` | `sbak/templates/scripts/lib/receipts-collect.cjs` | The build-receipt collectors: committed artifacts (git log / CHANGELOG / retrospectives / tech-debt / release-state) become `software-build-assurance-kit/build-receipt/v1` receipts with provenance + limitation, classified to the honest-rework doctrine (in-budget self-correction is the process *working*, not "broke"; ambiguous stays unclassified, never forced). Reuses `validators/lib/fenced-block.cjs` (the one fence parser — no fork) and feeds `scripts/lib/receipts.cjs`'s statement builder. No artifact, no receipt (byte-parity with the kit's own copy). |

> **The full validator set (the complete inherited gate floor).** Every `validators/*.cjs` the bootstrap copies (all unchanged from the kit's `sbak/validators/`), with its tier condition — so a reader of this spec sees the WHOLE inherited gate set, not the original two. `validators/validate-validator-enumeration.cjs` enforces that this list, `validators/README.md`, and `sbak/templates/PROJECT-CLAUDE.md` stay reconciled (a shipped validator absent from any of the three blocks):
> - `validators/validate-stage-prompts.cjs` — stage-prompt schema check (all tiers; pre-commit + CI).
> - `validators/validate-retrospective.cjs` — user-friction-stamp gate (Standard+).
> - `validators/validate-operating-mode.cjs` — rejects an out-of-range `operating_mode` (all tiers).
> - `validators/validate-app-map.cjs` — App-Map currency primitive + G10 assembled-execution cluster-gate (Standard+, `app_map: on`).
> - `validators/validate-test-honesty.cjs` — G9 test-honesty (Standard+).
> - `validators/validate-risk-escalation.cjs` — G11 risk-overrides-tier escalation record (Standard+).
> - `validators/validate-destructive-op.cjs` — G12 destructive-op rollback + confinement (Standard+).
> - `validators/validate-risk-matrix.cjs` — G13 9-property risk matrix (Standard+).
> - `validators/validate-calibration.cjs` — G14 verifier-proof / seeded-defect calibration set (Standard+).
> - `validators/validate-reconciliation.cjs` — closeout count reconciliation (Standard+).
> - `validators/validate-transition.cjs` — G15 transitions: atomic durable-state writes + honest four-type rework reconciliation; the six-state release ladder (Standard+).
> - `validators/validate-release-readiness.cjs` — G16 release-readiness: the capability-triggered independent whole-product review + ladder well-formedness + the SLSA-level cite at the release end; the manual-aging flag (Standard+).
> - `validators/validate-sources.cjs` — source-registry binding (`research_publish` mode).
> - `validators/check-append-only.cjs` — append-only ledger byte-prefix check (Full; the `append-only-ledger.yml` engine).
> - `validators/validate-validator-enumeration.cjs` — enumeration coherence: every shipped validator is listed in all three catalogs (this list + README + PROJECT-CLAUDE.md). A CI / pre-commit inheritance check, not a numbered gate.
> - `validators/validate-entry-docs.cjs` — the doc-sync engine: derives/binds the kit's self-descriptive facts into `sbak/framework-manifest.json` and polices the entry-doc set for drifted self-claims, enforced in CI. A kit self-sync inheritance check, not a numbered gate; all tiers.

> **Verification-locus conditional (calibration Choice 5).** The four rows above (`scripts/verify-local.cjs`, `scripts/install-hooks.cjs`, `.githooks/pre-commit`, `.githooks/pre-push`) and the `pr-smoke.yml` + `release.yml` workflows (in the Standard+ table) generate under `verification_locus: hybrid` / `local_first`. Under `verification_locus: cloud` they're replaced by a single conventional `.github/workflows/ci.yml` (`sbak/templates/dot-github/workflows/ci.yml` — full matrix on every push/PR, free on public repos). `local_first` omits `pr-smoke.yml`. See `sbak/FRAMEWORK-CONFIG.md` §4.14.

> **App-Map conditional (`app_map` toggle, §4.16).** The generated CI workflows (`ci.yml` / `pr-smoke.yml`) carry an "App-Map currency check" step. Under **`app_map: on`** the bootstrap fills the `{{APP_MAP_TEST_GLOBS}}` / `{{APP_MAP_SURFACE_GLOBS}}` placeholders from `docs/gates.md`. (`fetch-depth: 0` is **already baked into both template checkouts unconditionally** — like `append-only-ledger.yml` — so the diff base is never a forgotten manual step; it's harmless when the App-Map step no-ops.) Under **`app_map: skip`** the bootstrap omits the step. Either way the step is a **structural no-op when `docs/app-map.md` is absent** — it's guarded by `if: hashFiles('docs/app-map.md') != ''`, so a missing map (skip tier, or `on` before the first surface ships its entry) never hard-fails the job. The guard is the load-bearing safety; the bootstrap's omission is just tidiness.

> **Permission fence (selected by `approval_cadence`).** `sbak/templates/dot-claude/settings.json` carries three named profiles in `_permission_profiles` — **Maximum oversight** (← Maximum cadence), **Fenced autonomy** (← Standard, the recommended default), **Sleep-through** (← Minimum). The bootstrap selects ONE by the chosen cadence, copies it into the live `permissions` block, and deletes `_permission_profiles`. The `{{STACK_*}}` allow placeholders (`{{TEST_CMD}}` / `{{LINT_CMD}}` / `{{BUILD_CMD}}` / `{{TYPECHECK_CMD}}` / `{{INSTALL_CMD}}` / `{{MANIFEST_FILE}}`) are filled from discovery. **The `deny` floor is level-invariant** — identical across all three profiles (secret reads `.env`/`.env.*`/`secrets/**`/`*.pem`/`*.key`; irreversible Bash `git push --force`/`reset --hard`/`clean`/`rm -rf`) — and `git commit`/`git push` stay `ask` at every level so G1 (no commit without approval) survives. The generated `CLAUDE.md` (from `sbak/templates/PROJECT-CLAUDE.md` §6.5) must carry the **four honest caveats**, and you should restate them when you surface the fence:
>
> 1. **`auto` is a user-level opt-in — the repo can't set it.** `defaultMode: "auto"` is **ignored** from project/local settings by design, so the repo doesn't set it; the user enables `auto` in their own `~/.claude/settings.json` for classifier-backed unattended runs. The deny floor stays the backstop.
> 2. **Secrets: `.claudeignore` is broken; `deny: Read()` is not airtight.** Never generate `.claudeignore` — it does not work (Claude reads `.env` despite it). The fence uses `deny: Read(...)`, but be honest: deny rules have had **bypasses** (an arbitrary `node`/`python` subprocess can open a file the tool layer would block), so the real fix is a **secret manager** / keeping secrets off disk + the OS sandbox. No false confidence.
> 3. **Web-remote constraint.** On Claude Code on the web, repo-set `auto` / `bypassPermissions` / `dontAsk` are **ignored** and edits are pre-approved — a checked-in fence meaningfully sets only `default`/`acceptEdits`/`plan` + allow/deny/ask there. The deny wall still applies; don't present the fence as stronger than it is in a web-remote session.
>
> 4. **Trust gate: `allow` is inert until the workspace trust dialog is accepted.** The first session in a fresh checkout/unzip may print "Ignoring permissions.allow entries…: this workspace has not been trusted" — that is the host talking, not the kit breaking. `ask` prompts still work and `deny` still wins pre-trust; accept the trust dialog in the first session and the `allow` list comes live.
>
> **Local-allow audit (fence hygiene, done whenever you surface the fence).** Also read `.claude/settings.local.json` (if present) and surface any standing local `allow` that shadows the deny floor or pre-approves what the fence keeps at `ask` (observed IRL: broad `PowerShell(Remove-Item *)` / `PowerShell(git *)` allows left over from earlier sessions). Deny still wins at every scope, but a stale broad local allow silently neutralizes the ask layer — name each shadowing entry and let the user decide whether it stays. Never edit the file yourself; it is the user's.

#### Standard and Full only

| Generated file | From template | What it is |
|---|---|---|
| `ORCHESTRATOR.md` | `sbak/templates/ORCHESTRATOR.md` | Orchestration operating manual — the orchestrator role's decision index (read only by orchestration sessions; never by build/stage sessions). §10 filled with the project's starting milestone state. |
| `docs/style.md` | `sbak/templates/style.md` | Style guide customized to chosen stack |
| `docs/gates.md` | `sbak/templates/gates.md` | Gate matrix (M01 row + roadmap; names project harnesses for Pass 4) |
| `docs/gotchas.md` | `sbak/templates/gotchas.md` | Numbered list of project-specific traps |
| `docs/sessions.md` | `sbak/templates/sessions.md` | Session register (starts empty) |
| `docs/consultations.md` | `sbak/templates/consultations.md` | Append-only ledger of ad-hoc orchestrator consultations (the "I'm seeing X, what should I do?" moments); how a future orchestrator session inherits an unplanned call |
| `docs/tech-debt.md` | `sbak/templates/tech-debt.md` | Append-only tech-debt ledger for 🟢 verifier findings |
| `docs/adr/0000-template.md` | `sbak/templates/adr-0000-template.md` | ADR template (also used for verifier-finding waivers) |
| `prompts/RETROSPECTIVE-TEMPLATE.md` | `sbak/templates/RETROSPECTIVE-TEMPLATE.md` | Per-stage retrospective shape (axes per tier) |
| `prompts/VERIFIER-RETROSPECTIVE-TEMPLATE.md` | `sbak/templates/VERIFIER-RETROSPECTIVE-TEMPLATE.md` | Stage V retrospective shape (brief; verification-soundness focus) |
| `prompts/VERIFIER-FINDINGS-TEMPLATE.md` | `sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md` | Stage V findings file with mandatory tier-coverage caveat |
| `prompts/REFACTOR-RETROSPECTIVE-TEMPLATE.md` | `sbak/templates/REFACTOR-RETROSPECTIVE-TEMPLATE.md` | Stage R retrospective shape (brief; refactor-soundness focus, checks G7) |
| `prompts/REFACTOR-FINDINGS-TEMPLATE.md` | `sbak/templates/REFACTOR-FINDINGS-TEMPLATE.md` | Stage R findings file (Duplication/Complexity/Drift; mandatory tier-coverage caveat) |
| `prompts/SUMMARY-TEMPLATE.md` | `sbak/templates/SUMMARY-TEMPLATE.md` | Per-milestone summary shape |
| `prompts/PHASE-DOC-TEMPLATE.md` | `sbak/templates/PHASE-DOC-TEMPLATE.md` | Phase doc shape (markdown wrapper + XML stage prompts; includes Stage V section) |
| `docs/build-prompts/README.md` | `sbak/templates/build-prompts-README.md` | Orientation for `docs/build-prompts/` |
| `retrospectives/README.md` | `sbak/templates/retrospectives-README.md` | Orientation for `retrospectives/` |
| `.claude/commands/{stage,verify,refactor,closeout,on-track,approve-red}.md` | `sbak/templates/dot-claude/commands/...` | Slash commands so the user runs `/stage M01 A`, `/verify M01`, `/refactor M01`, `/closeout M01`, `/on-track`, `/approve-red` instead of hand-pasting XML stage prompts (courier relief). Each reads the Phase doc and runs the matching block. `/refactor` runs Stage R (trigger-based; no-op at Lite). `/approve-red` runs `scripts/approve-red.cjs` to release the PROC-001 red-gate after the human reviews the RED tests. `/on-track` runs the on-demand off-track review **in-session** — it sets no `role` and is not a stage prompt, so the mode-check hook never blocks it. |
| `docs/gap-analysis.md` | `sbak/templates/gap-analysis.md` | Append-only product↔spec ledger. **Advisory** at Standard (generated, written during Stage E closeout, honor-system — not CI-enforced); **CI-enforced** at Full via the workflow in the Full-only table below. The file is present at Standard so the agent has somewhere to append during closeout. |
| `docs/off-track-log.md` | `sbak/templates/off-track-log.md` | Append-only log of **justified** priority inversions (the off-track check / G8). **Advisory** at Standard (honor-system); **CI-enforced** at Full — it joins M01's `append-only-ledger.yml` LEDGERS set (reuse, no new workflow). Present at Standard so the agent has somewhere to log. At Lite, inversions fold into `CHANGELOG.md` instead. |
| `docs/app-map.md` | `sbak/templates/app-map.md` | The living drive/test map — what user-facing surfaces shipped and exactly how to drive and test each one, bound to test-ids by `validators/validate-app-map.cjs` so it can't drift from the running app. A **regular Standard+ row, not Web/UI-only** (the entry shape + test-id-binding invariant are universal; only the gesture vocabulary adapts to the derived surface class `ui`/`command`/`endpoint`/`api`). Generated when **`app_map: on`** — the default at Standard+ for the drivable surface classes; `skip` at Lite and for `library` (`api`). On the work/verifier/orchestrator read-first lists (not refactor). |
| `.github/workflows/pr-smoke.yml` | `sbak/templates/dot-github/workflows/pr-smoke.yml` | One hosted `ubuntu` PR smoke check — the non-bypassable backstop under `verification_locus: hybrid`. Make it a required status check in branch protection. |
| `.github/workflows/release.yml` | `sbak/templates/dot-github/workflows/release.yml` | Full matrix incl. macOS + signed/notarized desktop packaging, on `v*` tags only — the one bounded place macOS minutes are spent. macOS leg emitted iff the Phase-0 audit found a macOS ship target. |
| `.github/workflows/pr-smoke.self-hosted.yml.example` | `sbak/templates/dot-github/workflows/pr-smoke.self-hosted.yml.example` | Commented opt-in: run the backstop on a self-hosted runner for $0 GitHub minutes (trade-offs in the file header). |

#### Full only

| Generated file | From template | What it is |
|---|---|---|
| `.github/workflows/append-only-ledger.yml` | `sbak/templates/dot-github/workflows/append-only-ledger.yml` | One parameterized workflow runs `validators/check-append-only.cjs` over the ledger set (`docs/gap-analysis.md`, `docs/tech-debt.md`, `docs/consultations.md`, `docs/off-track-log.md`) and fails any PR that mutates a prior line — turning the Standard-tier advisory ledger into a CI-enforced one. The ledger paths are an editable list in one place at the top of the workflow. `project-config.md` is deliberately **not** in the set: its Tier line + toggle table are editable on re-tier, so a whole-file byte-prefix check would false-positive — its override log cites the shared check but stays honor-system. |

#### Web/UI only (`deliverable_type: web`)

| Generated file | From template | What it is |
|---|---|---|
| `docs/design.md` | `sbak/templates/design.md` (or imported from Claude Design) | The 9-section design brief authored at Phase 1.6. Read before any UI code; the contract Stage V's design pass checks against. Added to the work read-first list. |

The design-discovery interview (`sbak/templates/DESIGN-DISCOVERY-INTERVIEW.md`) is *used* at Phase 1.5 but not copied into the project — it's a kit authoring aid, like `CALIBRATION-INTERVIEW.md`.


---

## Phase-3 generation protocol (moved from the bootstrap router at M24.C)

**Scaffold mechanism — copy-then-fill, never authoring (hard rule).** Every filled file **starts as a byte-copy of its template**; the only permitted edits to that copy are `{{PLACEHOLDER}}` substitutions and the documented tier-conditional trims — **never synthesize a scaffold file from memory**: a hand-authored lookalike silently drops enforcement wiring and voids the guarantees downstream. For `operating_mode: bug_fix`, trim the generated project `CLAUDE.md` per the **bug_fix trim spec** in `sbak/templates/PROJECT-CLAUDE.md` (the explicit keep/cut list) — not by improvisation. And `sbak/templates/` is **read-only during scaffold generation** — **fill live copies only**; never edit a template in place in the user's repo. (If a template is wrong, stop and surface it: fixing templates is kit work, not bootstrap work.)

**Lite-tier shortcut:** the bootstrap can collapse multiple Lite-tier scaffold steps into a single approval ("here are the ~36 files I'll generate"). For Standard and Full, surface the list category by category.

Also: keep `sbak/BUILD-PLAYBOOK.md`, `sbak/FRAMEWORK-CONFIG.md`, `sbak/STAGE-PROMPT-PROTOCOL.md`, `sbak/PROCESS-VALIDATION.md`, and `sbak/persistence-architecture.md` in place under `sbak/` (framework-level references the project depends on; immutable except via ADR).

**Pre-flight disclosure (before any disk write).** State the filesystem blast radius in one line so the user consents to the footprint up front: *"I'll create ~N files and modify M, across `.claude/`, `.githooks/`, `scripts/`, `docs/`, `prompts/`, `spec/`, `.github/`, plus root files (`CLAUDE.md`, `project-config.md`, `.gitattributes`, …). Want the itemized list?"* Offer the full list on request; don't dump it unprompted. This is footprint/location consent — distinct from the per-phase draft review, which is about content. Call out the directories a user might not expect touched (`.claude/`, `.github/`, root dotfiles).

The disclosure is **ask-and-WAIT**: end the turn on the question and write nothing until the user answers — never roll the disclosure and the first write into one turn. For Standard and Full, the category-by-category surfacing happens as **turn boundaries, not narration**: each category ends its turn and waits for a go, rather than scrolling past as commentary while files are already being written.

Surface the list of generated files (high-level summary; user can spot-check). On approval:

1. Write all the new project files. **Encoding: write every file as UTF-8 without a BOM.** The templates are UTF-8 and saturated with em-dashes (`—`) and the `🔴🟡🟢` severity markers. On Windows, do **not** round-trip them through `Get-Content -Raw` / `Set-Content` without `-Encoding UTF8` — PowerShell's default encoding reads UTF-8 as ANSI and mojibakes every non-ASCII char (`—` → `â€”`) across the whole scaffold. Prefer the encoding-safe Write/Edit tools over shell file I/O for scaffold writes. After writing, spot-check with a search for `â€` / stray mojibake and fix before handoff.
2. **Overwrite this bootstrap CLAUDE.md with `sbak/templates/PROJECT-CLAUDE.md` (filled in, tier-conditioned).** This is the handoff — the bootstrap dies so the project rules can take over.
3. Write `project-config.md` with the agreed tier, expertise, and toggle values.
4. Optionally, delete `sbak/templates/` (or keep it for reference; offer the user the choice). **Note:** if kept, `sbak/templates/dot-claude/hooks/` is the source of truth for the live `.claude/hooks/`. If a future kit update fixes a hook, an already-bootstrapped project must re-copy it into `.claude/hooks/` (or re-run the scaffold step) — a plain `git pull` of the kit updates only the template, not the live copy the project actually runs.

