# {{PROJECT_NAME}} — Gate Matrix

> The must-pass list, indexed by milestone. Gates only get added, never removed (without an ADR documenting the rationale). Gates that activate at milestone N stay active for all later milestones.

---

## Framework principle (from sbak/BUILD-PLAYBOOK.md §3.3)

Every milestone has a "Hard gates" set and a "Soft gates" set:

- **Hard gates** must pass for the milestone to ship. CI enforces. No `--no-verify` bypass.
- **Soft gates** surface findings but do not block. Findings are logged in the milestone's gap-analysis entry and addressed in the next milestone or via ADR.

Hard gates are cumulative across milestones. A gate added at M02 still applies at M07.

**Arming truth.** The per-milestone sections below are documentation order, not an arming schedule: every wired validator runs content-gated from the first commit, whatever milestone heading its row sits under. A row filed under a later milestone can fire on day one when its content trigger appears (field case: a spec-example row documented under M03 fired at M01.A). Deferring a gate is done with a waiver, never by pointing at a heading.

Per-stage CLI prompts reference gates by milestone: `<gates milestone="M[NN]"/>`. The validator (per `sbak/STAGE-PROMPT-PROTOCOL.md` §11) confirms the milestone tag matches an entry in this file.

---

## M01 — {{M01_TITLE}}

### Hard gates

| Gate | Command | Threshold | Notes |
|---|---|---|---|
| Build | `{{BUILD_COMMAND}}` | exit 0 | Workspace-wide |
| Format | `{{FORMAT_CHECK_COMMAND}}` | no diff | Whole tree |
| Lint | `{{LINT_COMMAND}}` | zero warnings | Whole tree |
| Unit tests | `{{UNIT_TEST_COMMAND}}` | all pass | All modules |
| Doc tests | `{{DOC_TEST_COMMAND_OR_NA}}` | all pass | If applicable |
| Coverage (workspace) | `{{COVERAGE_COMMAND}}` | ≥80% line | Excludes generated code, binary entry points |
| Dependency audit | `{{DEP_AUDIT_COMMAND}}` (e.g. `npm audit --audit-level=high` / `pip-audit` / `cargo audit`) | no high/critical | Full; Verifier Pass 6 mechanical floor |
| Secret scan | `{{SECRET_SCAN_COMMAND_OR_NA}}` (e.g. `gitleaks detect`) | no findings | Full; Verifier Pass 6 mechanical floor |
| Pre-commit hook | `node scripts/install-hooks.cjs` (sets `core.hooksPath`) | hook fires on test commit | Fast checks; verified by hook test |
| Pre-push hook (fast lane) | `node scripts/verify-local.cjs --lane fast` | affected + active + always-tagged tests green (native leg); a widening to full is printed | verification_locus: local_first / hybrid. Blocks push on failure. `--list` prints the lanes |
| Stage-end gate (stage lane) | `node scripts/verify-local.cjs --lane stage` | the same over the whole milestone diff, green | Run by `/stage` before the stage-end packet |
| Closeout / Stage V floor (release lane) | `node scripts/verify-local.cjs --lane release`, then `--reconcile M[NN]` at closeout | Linux-in-Docker + native, every test, green; the three union-pin proofs print before `tests/.settled.json` is written | The full floor never leaves: `/closeout`, `/verify`, and `v*` tags. A green `fast` lane is not Stage-V or closeout evidence |
| PR smoke check (backstop) | hosted `ubuntu` `pr-smoke.yml` | exit 0 | verification_locus: hybrid. Required status check — the layer `--no-verify` can't skip |
| CI workflow validates | `{{CI_VALIDATE_COMMAND_OR_NA}}` | exit 0 | If platform supports schema validation |

### Soft gates

- {{SOFT_GATE_1}} (e.g., dependency audit, license check)
- {{SOFT_GATE_2}}

---

## M02 — {{M02_TITLE}}

### Hard gates

All M01 gates plus:

| Gate | Command | Threshold | Notes |
|---|---|---|---|
| {{NEW_M02_GATE_1}} | `{{COMMAND}}` | {{THRESHOLD}} | {{NOTES}} |
| {{NEW_M02_GATE_2}} | `{{COMMAND}}` | {{THRESHOLD}} | {{NOTES}} |
| Coverage (safety primitives) | `{{TARGETED_COVERAGE_COMMAND}}` | ≥95% line on listed modules | Documented per-module baselines below |

### Safety-primitive coverage baselines (M02+)

Modules that fall under the elevated coverage gate (≥95% line). Baselines are recorded as they're established and must not regress without a retrospective entry recording the reason.

| Module | Baseline % | Established at | Excluded files | Reason for exclusion |
|---|---|---|---|---|
| {{MODULE_1}} | {{BASELINE_1}} | M02.{{STAGE}} | {{EXCLUDED_FILES_1}} | {{REASON_1}} |
| {{MODULE_2}} | {{BASELINE_2}} | M02.{{STAGE}} | {{EXCLUDED_FILES_2}} | {{REASON_2}} |

### Soft gates

All M01 soft gates plus:

- {{NEW_M02_SOFT_GATE_1}}

---

## M03 — {{M03_TITLE}}

### Hard gates

All prior milestone gates plus:

| Gate | Command | Threshold | Notes |
|---|---|---|---|
| {{NEW_M03_GATE_1}} | `{{COMMAND}}` | {{THRESHOLD}} | {{NOTES}} |
| Integration tests | `{{INTEGRATION_TEST_COMMAND}}` | all pass | Required when external integrations land |
| End-to-end tests | `{{E2E_COMMAND_OR_NA}}` | all pass | When the user-observable surface exists |
| **Assembled-execution (G10)** | `node validators/validate-app-map.cjs` + the `assembled_execution` Verifier pass | every `verified` drivable entry cites assembled evidence | **Mandatory, not conditional**, for runtime/drivable surface classes (`ui` / `command` / `endpoint`): the cluster-gate promotion of the two rows above. Integration/E2E green is necessary-not-sufficient — the verifier must drive the REAL assembled surface. `api` (library) n/a. See the cross-milestone **G10** row + §"Assembled-execution cluster-gate" below |

### Soft gates

All prior soft gates plus:

- {{NEW_M03_SOFT_GATE_1}}

---

<!-- Add M04, M05, ... as milestones are authored. Always: "All prior milestone gates plus:". -->

---

## Cross-milestone gates (always active from M01)

> **The gate-design contract.** Every gate row carries a **mechanical floor** (the static/CI-checkable column "What it checks"), an **adversarial question** (the verifier-judgment half — where falsifiability needs judgment it lives in a Stage V pass, never the validator), and names the **false-green it prevents** (the "Prevents (false-green)" column — the ceremony budget that justifies the gate's existence, the mirror of the gate-retirement-requires-ADR rule). See `sbak/BUILD-PLAYBOOK.md` §4.4.

| Gate | What it checks (mechanical floor) | Enforced by | Prevents (false-green) |
|---|---|---|---|
| Append-only: `docs/gap-analysis.md` | Prior entries are byte-identical to their committed state | CI diff check, added in M01 closeout | A silently-rewritten ledger entry laundering away a recorded gap |
| Append-only: `docs/sessions.md` | Prior entries are byte-identical to their committed state | CI diff check | A backdated/edited session record hiding what actually happened |
| Append-only: prior `retrospectives/M[NN].<X>-retrospective.md` | Once finalized, never edited | CI diff check | A retro rewritten after the fact to erase a friction event |
| Phase doc protocol conformance | All XML stage prompts validate against `sbak/STAGE-PROMPT-PROTOCOL.md` | CI script invoking the validator | A malformed stage prompt that "looks fine" but drops a required slot |
| **G9 — Test-honesty** | A v1.7+ work stage carries a `<test_honesty>` slot (named mutation, or the explicit `n/a — no risk surface`); no staged test is assertion-free / exception-only. The *effectiveness* layer on top of coverage (coverage = executed; mutation = caught). Risk-tiered + incremental; pre-v1.7 docs grandfathered. | `validators/validate-test-honesty.cjs` (pre-commit + CI). `test_honesty: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** Stage V re-runs the named mutation (presence ≠ effectiveness). | A test suite that is green but proves nothing (assertion-free / never-failing) — coverage theater |
| **G10 — Assembled-execution cluster-gate** | For a **runtime/drivable** surface class (`ui` / `command` / `endpoint`) + the destructive/packaging/real-provider risk surfaces, a `State: verified` App-Map entry must cite **assembled-execution evidence** (the verifier's `assembled_execution` pass drove the REAL surface and retained the run reference). Unit/component green is **necessary-not-sufficient** — it stacks ON coverage/unit, never replaces them. A `library` (`api`) surface is **n/a**. Arming is visible (keyed off the derived surface class). | `validators/validate-app-map.cjs` (an un-driven `verified` drivable entry → RED) + the `assembled_execution` Verifier pass (drives + retains evidence). Trigger list: `sbak/FRAMEWORK-CONFIG.md` §4.18 | "Unit tests pass" read as "the assembled app works" (the broken-todo that passed every unit test) |
| **G11 — Risk overrides tier** | A `project-config.md` that **declares a `risk_triggers:` token** must carry a **visible escalation record** in `docs/gates.md` — a row that BOTH names the trigger AND states its reason (the canonical token `deep verification because:`). Checked **per-trigger, AND-ed** (a 1-of-N "any one escalated passes" dodge is rejected); a **silent raise** (a depth with no stated reason) is rejected. A no-trigger project is a no-op. **Fail-closed** (a declared trigger + unreadable `gates.md` → non-zero; a no-trigger project never reads it). Presence-gated. | `validators/validate-risk-escalation.cjs` (pre-commit + CI). `risk_escalation: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** Stage V derives its own trigger assessment and challenges **under-declaration** (a high-risk surface that declared no trigger to stay at the tier floor). Trigger list: `sbak/FRAMEWORK-CONFIG.md` §4.19. | **Tier-floor oversight on a high-risk surface** — a tier-floor project running a destructive restore (or credential/untrusted-HTML handling) at the tier's default verification depth because nothing raised the bar (the unconfined-restore-at-normal-depth class) |
| **G12 — Destructive-op hard rule** | **Tier-independent** (alongside G1). When the staged set touches a **destructive surface** (`restore` / `import` / `migrate` / `delete` / `replace` / `extract` / `unzip` / `backup`), it must carry **BOTH** an independent **rollback** test **AND** a **confinement** test whose body exercises a **REAL** hostile path (`../`, encoded `%2e`/`%2f`, or symlink). Missing either, or a confinement test using a **toy** path, → block. Untrusted paths use the **canonicalize-then-confine** primitive (`style.md`): resolve canonical (realpath, symlinks) → `resolved === root \|\| startsWith(root + sep)`, **never** a bare `startsWith`. **Fail-closed** (a staged-enumeration error → non-zero). Presence-gated + keyword-heuristic. | `validators/validate-destructive-op.cjs` (pre-commit + CI). `destructive_op: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** Stage V confirms the confinement test path **genuinely escapes** and hunts destructive surfaces hiding under unlisted verbs. | **Rollback-passes read as safe** — a destructive op that proved rollback but shipped *unconfined*, so a path-traversal / zip-slip landed outside its root (the unconfined-restore class). rollback != confinement |
| **G13 — Risk-matrix** | A work stage that **declares a risk surface** (a `<risk_declaration triggers="…">` slot naming ≥1 real trigger) must address the **bounded 9-property risk-matrix** — `normal / hostile-input / partial-failure / confinement / authorization / resource-bounds / recovery / observability / cross-platform` — each either `covered-by: … — test: …` or an explicit `n/a — <reason>`. A missing property, a property naming no covering test and no `n/a`, or an empty one → block; **AND-ed across all 9** (a "one property present passes" dodge is rejected). A stage with no `<risk_declaration>` is a no-op. **Banner-less docs comply** — a **banner-less** doc is current/must-comply, not grandfathered (only an explicit pre-v1.8 banner exempts); history is protected by `--staged` (changed-only) scoping. **Fail-closed.** Presence-gated. | `validators/validate-risk-matrix.cjs` (pre-commit + CI). `risk_matrix: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** Stage V's plan-challenge derives its own threat model anchored on the declared matrix and asks "which of the 9 did the plan/criteria leave unproven?" (presence ≠ real coverage). Matrix defaults: `sbak/FRAMEWORK-CONFIG.md` §4.19. | **A plan that silently omits a dangerous property** — the backup that proved round-trip / rollback / compatibility but never named *confinement*, so a path-traversal shipped unconfined. The verifier sharing the planner's blind spot. |
| **G14 — Verifier-proof / seeded-defect calibration** | The plan-challenge is made falsifiable — the adversary-side analog of G9's mutation-kill. Every Stage V **opens** by running its plan-challenge against the **seeded-defect calibration set** (`prompts/calibration/` — one fixture per §8.5 escape class, sealed ground-truth in `labels/`) and must catch **every** seed: **FNR = 0** before its real findings count; the result is recorded as a `calibration` block. **Static floor:** `validate-stage-prompts.cjs` blocks a `<verifier_stage_prompt>` lacking the required `<pass name="calibration_self_test">`; `validate-calibration.cjs` checks the set exists + **shadows the full catalog**, every fixture is **labeled + sealed** (a fixture must not contain its own answer — the verifier reads `fixtures/`, never `labels/`), and a "Sound" findings file **records** the calibration block. **Fail-closed.** **HONEST LOCUS:** the validators prove only that the harness is **present + wired** — the **catch is agent judgment, recorded at V-time as the FNR**, and **cannot** run pre-commit (you can't run a judge in a smoke test). | `validators/validate-stage-prompts.cjs` + `validators/validate-calibration.cjs` (pre-commit + CI for the floor). `--warn` → advisory (Lite); `--warn` removed → enforced (the Full default). **Adversary (the gate's teeth):** the **recorded FNR from the actual V run** — judgment at V-time, NOT a pre-commit check. FNR > 0 → the verifier-proof worked; the missed seed is a real finding (`merge_gate` structural signal). | **A rubber-stamping verifier that misses a seeded defect and still reads as "Sound"** — the unfalsifiable adversarial half (a verifier sharing the planner's blind spots, never proven to have teeth) that this gate exists to kill. |
| **G15 — Transitions: atomic state + honest rework** | Two clauses. **(a) Atomic:** a transition that writes a **durable-state** file (`.claude/role` / `.claude/stage-active` markers, or a `*-state.md` ledger) must **write-temp-rename**, never truncate-then-write (the truncate-then-write race generalized) — a direct truncating `writeFileSync` of such a path → block. **(b) Honest rework:** a closeout / release `` ```rework `` block must carry the **four fixed types** (implementation / verifier / irl / post-merge — DORA's 5th metric) and its total must **reconcile** against the fix-commit evidence (extends the reconciliation primitive, never forks it) — a total that **under-reports** the fix commits (the "0 rework while fix commits exist" lie) → block. The six-state **release ladder** is recorded in the append-only `docs/release-state.md`, release end SLSA-mapped. **Fail-closed.** Presence-gated (the static floor sees inline literals + simple bindings + fenced counts). | `validators/validate-transition.cjs` (pre-commit + CI). `transition: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** Stage V challenges whether any transition **raced** under a subtler write or **under-counted** rework. | **A racing transition + a lying release.** A half-written `role` marker (truncate-then-write crash) read as a clean mode; a "0 self-correction rounds" closeout while real rebuilds happened (the dishonest accounting the kit's self-audit showed); a "released" claim hiding unsigned binaries / untested installers (the miss the SLSA-mapped ladder prevents). |
| **G16 — Release-readiness: capability-triggered review + ladder well-formedness + SLSA cite** | Three clauses on the append-only `docs/release-state.md` ladder. **(1) Capability-triggered review:** a `public-distribution-ready` entry, **when the project declares `risk_triggers:`**, must cite an **independent whole-product review record** — a fresh reviewer's own threat model (the `audit` mode repositioned as a release gate, **not** a milestone-findings re-read); missing while triggers declared → block, no-trigger project a no-op. **(2) Ladder well-formedness + continuity:** no rung silently skipped — each state between `Prior state` and the reached state is climbed or `<state>: n/a — <reason>`-exempted (a source-only deliverable legitimately skips `packaged-release-ready`); an unexplained skip → block. **And the declared `Prior state` must itself be a rung ACTUALLY REACHED by an earlier ledger entry** (continuity, checked against the append-only history — a fabricated prior never climbed can't disguise a multi-rung skip as a one-rung step); an `n/a — <reason>` / first-entry prior is exempt. **(3) SLSA cited:** a release-end state (packaged/public) cites its SLSA build level (`L1`/`L2`/`L3`, floor **L2** via `actions/attest-build-provenance`, or `n/a — <reason>`) → block if missing/bare/placeholder. Stale **manual-only / un-driven `verified`** App-Map surfaces are **FLAGGED** (advisory). **Fail-closed.** **DUAL honest-locus (neither half overclaims):** the **record is PRESENT**, not judged good (the audit-pass adversary's call); the **SLSA level is CITED**, not that **provenance was achieved** — that is `release.yml`'s attest step at build time. | `validators/validate-release-readiness.cjs` (pre-commit + CI). `release_readiness: warn` → advisory (Lite); `block` → enforced (the Full default). **Adversary:** the independent **audit-mode whole-product review** (a fresh threat model at the distribution boundary) + the build-time `attest-build-provenance` step — the judgment a static cite cannot make. SLSA + trigger defaults: `sbak/FRAMEWORK-CONFIG.md` §4.21. | **A "released" claim hiding an un-reviewed high-capability product, a silently-skipped release state (including one disguised behind a fabricated `Prior state` never actually reached — continuity is now checked against the append-only history; OR a single/bootstrap entry that BEGINS at a release state with no recorded climb behind it — its prior absent / `n/a` / unknown — bypassing the whole ladder), or unsigned / unattested binaries** — shipping "released" over **unsigned binaries and untested installers** (the undifferentiated "released" the SLSA-mapped ladder + the capability-triggered review replace). |
| ADR presence | Every Phase doc that names an ADR trigger has the ADR in `docs/adr/` | CI cross-check | A decision claimed as "recorded in an ADR" with no ADR behind it |
| Coverage delta (advisory at M01, blocking from M02) | No coverage drop on changed lines vs `main` | Codecov or equivalent (configured via `codecov.yml` or similar) | New code shipped untested under a still-high aggregate coverage number |

### Coverage delta gating

The first milestone establishes absolute thresholds (workspace ≥80%, safety primitives ≥95%) but cannot enforce a delta because there's no baseline. Starting at the second milestone, every PR also passes a delta gate: project + patch coverage thresholds set in `codecov.yml` (or equivalent). The tool pulls the coverage report uploaded by the milestone's coverage gate, compares to `main`'s last green build, and fails the PR check if any gated module regresses by >0.5 percentage points (absolute) OR if patch coverage on the changed lines drops below the project floor.

Set the delta gate as **advisory** at the first milestone to validate wiring, then flip to **blocking** at the start of the second milestone.

---

## App-Map currency globs (when `app_map: on`)

`validators/validate-app-map.cjs` keeps `docs/app-map.md` honest with two checks, and each reads a glob set named **here** so it stays per-project and per-surface-class. The generated CI steps (`ci.yml` / `pr-smoke.yml`) resolve these as `{{APP_MAP_TEST_GLOBS}}` (binding check) and `{{APP_MAP_SURFACE_GLOBS}}` (tripwire); fill them per the project's derived surface class. Both default sensibly if absent, but naming them here is what tunes the tripwire's signal.

| Glob set | Placeholder | What it feeds | Per-surface-class default |
|---|---|---|---|
| **Test globs** (binding check) | `{{APP_MAP_TEST_GLOBS}}` | Where the validator looks for each `State: verified` entry's test-id. A cited id absent from these files → finding. | `ui` → `tests/e2e/**`, `**/*.spec.{ts,tsx,js}`; `command` (cli) → `tests/integration/**`; `endpoint` (service) → `tests/contract/**`, route tests; `api` (library) → `tests/**`, unit/contract specs |
| **Surface-source globs** (tripwire) | `{{APP_MAP_SURFACE_GLOBS}}` | The source paths whose diff (without a matching `docs/app-map.md` change) trips the heuristic — silenced only by a logged `app-map-unchanged: <reason>` token. | `ui` → `src/components/**`, `src/renderer/**`; `command` (cli) → the command source dir (e.g. `src/commands/**`, `src/cli/**`); `endpoint` (service) → `src/routes/**`, `src/api/**`; `api` (library) → the public-export entry (e.g. `src/index.*`, `src/lib/**`) |

The tripwire is a heuristic (false-positives on no-UX refactors), which is why its only escape is the **logged** token, never a silent skip. The binding check is the real currency proof — id existence against a suite CI runs green first.

---

## Assembled-execution cluster-gate (G10)

`validators/validate-app-map.cjs` carries a **third** check beyond the two above: the **G10 cluster-gate**. For a surface whose derived class is **runtime/drivable** — `ui` / `command` / `endpoint` — unit/component green is **necessary-not-sufficient**. A `State: verified` App-Map entry on such a surface must **also** cite assembled-execution evidence (an **Evidence**-column reference to the run the verifier's `assembled_execution` pass retained — the command + result of driving the REAL surface). An un-driven `verified` drivable entry → **G10 RED**. A `library` (`api`) surface is **n/a** (its test-id binding alone is sufficient).

| Surface class | G10 | What a `verified` entry must carry |
|---|---|---|
| `ui` / `command` / `endpoint` (+ destructive / packaging / real-provider risk surfaces) | **armed** | a live Test-id **and** an Evidence reference to the assembled run |
| `api` (library) | **n/a** | a live Test-id (test-id binding is sufficient) |

The class is read from the App-Map's `surface class:` stamp (or `--surface-class`); an unresolved class leaves the gate **un-armed** with a visible note, so a stamp-less legacy map never false-blocks. The arming is **always visible** ("cluster-gate armed because surface class = X") — never silent. The Evidence reference is the **same** one Stage C structures into its reconcilable evidence block; the cell binds B's gate to C's block so the mechanical cell can't be satisfied by free-text invented independent of a run. The trigger list (which classes arm) is in `sbak/FRAMEWORK-CONFIG.md` §4.18.

**Composition (necessary-not-sufficient):** G10 **stacks on** the coverage + unit gates and the App-Map test-id binding — it never replaces them. Coverage proves *executed*; the test-id proves *a test exists*; the assembled run proves *the real surface behaves*. They compose.

---

## Gate retirement

A gate may only be retired via an ADR that:

1. Names the gate
2. Names the milestone where it was active
3. Explains why the gate is no longer needed (the underlying constraint is gone, or replaced by a stronger gate)
4. Identifies the replacement (if any)

Removing a gate without an ADR is a Hard Rule violation.

---

## Notes on gate authoring

- **Gate commands are concrete.** Not "lint the code" but `{{LINT_COMMAND}}`. Anyone should be able to run them.
- **Gate thresholds are non-elastic.** "≥80%" means ≥80%. "Mostly passing" is not a threshold.
- **Coverage exclusions are documented.** Each excluded file or pattern has a reason recorded in the per-module baseline table.
- **CI mirrors the local gate set** under `verification_locus: cloud`. Under `local_first` / `hybrid` the relationship inverts: the *local* pre-push hook is the full gate set, and the cloud runs only a smoke tripwire on PRs (`hybrid`) plus the full matrix on release tags. In every locus a non-bypassable check must exist — CI under `cloud`, the required PR smoke check under `hybrid` — so `--no-verify` can never ship unverified code.

---

*The gate matrix is the project's quality contract. It moves slowly and visibly. Treat it as such.*
