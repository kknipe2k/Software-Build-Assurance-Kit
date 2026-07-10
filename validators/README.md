# Validators

Scripts that enforce framework discipline beyond honor-system rules.

## Process-mass budget (N5) — read before you add a validator or gate

**This is a standing rule for developing the kit AND for any project that adds its own gates.** Every gate has a marginal cost that recurs forever: each new validator is an O(docs) sweep — it forces every future contributor to keep more docs, catalogs, and Phase docs reconciled with it. Past some point the marginal gate costs more than it catches. So, before adopting any new gate or validator, the adoption record must carry two things:

- **(a) a named real failure it would have caught** — a specific incident, retro, or bug that actually happened, not a hypothetical "this could go wrong."
- **(b) an O(docs) sweep-cost estimate** — how many docs/files the new gate forces every future contributor to keep reconciled (and where).

A gate whose marginal catch rate is below its sweep cost is **not adopted**. The dogfood data that bought this rule: 89% of logged friction is sev-1, and every new gate is an O(docs) sweep (M10.A / M10.B retros). Adding to the catalog below without (a) and (b) on record is the anti-pattern this rule exists to stop.

## Smoke test the whole mechanism

```bash
node scripts/smoke.cjs
```

Runs synthetic regression tests against all four hooks (SessionStart, UserPromptSubmit, PreToolUse red-gate, receipts-lifecycle) and the full validator set in ~5 seconds. Covers the IRL-found regressions: CRLF Phase docs (P#27), UTF-16LE+BOM `role` (P#29), >600-line Phase-doc warning behavior (P#16), retro-stamp enforcement (P#15), the 3-brain mode-guard cases. Exit 0 = all green.

**Proves:** the safety nets still fire correctly. **Does not prove:** output quality — that needs a walkthrough.

## The validator set (complete)

Every `validators/*.cjs` shipped, with its tier condition. `validate-validator-enumeration.cjs` enforces that this list, the bootstrap `CLAUDE.md` scaffold tables, and `templates/PROJECT-CLAUDE.md` all enumerate the full set — a shipped validator absent from any of the three blocks the commit. The count is **never hand-stated here**: the check discovers the set by glob (`validators/*.cjs`), so this table is the catalog it reconciles, not a number to keep in sync. The `tier condition` column states *when a validator activates* (Lite / Standard+ / mode-gated); every validator is still listed in **every** catalog regardless of its tier — "all tiers" in a row means "catalogued at all tiers", not "runs at all tiers". The two original gates (`validate-stage-prompts`, `validate-retrospective`) are documented in detail in the sections below; the rest carry their full usage in their own file headers.

**Four artifact classes, per-class catalogs (M19.C / I10, the A-05 "Option E" model).** `validate-validator-enumeration.cjs` reconciles four shipped classes against their own catalog sets, because the classes are catalogued in different places:

| Class | Glob | Catalogs it must appear in |
|---|---|---|
| validators | `validators/*.cjs` | this README · `CLAUDE.md` scaffold tables · `templates/PROJECT-CLAUDE.md` |
| hooks | `templates/dot-claude/hooks/*.cjs` | `CLAUDE.md` scaffold tables · the golden row-set (`scripts/fixtures/golden-bootstrap/rows.json`) |
| scripts | `templates/scripts/*.cjs` | `CLAUDE.md` scaffold tables · the golden row-set |
| commands | `templates/dot-claude/commands/*.md` | `CLAUDE.md` scaffold tables · the golden row-set |

The **bake-vs-golden divergence** this formalizes rather than papers over: the bake (`scripts/bake-and-test.cjs`) copies **all** of `validators/` into a project wholesale, while the golden bootstrap **renders only the headline validator rows** in `rows.json` (the rest inherited). So `rows.json` is the full catalog for hooks/scripts/commands (each a 1:1 render row) but is **not** a full-validator catalog — validators reconcile against the three doc catalogs above, where this README + the `CLAUDE.md`/`PROJECT-CLAUDE.md` enumeration blockquotes carry the full set. Adding a full validator render row to `rows.json` would change the rendered scaffold count, so it's deliberately not done. The same divergence is stated in `rows.json`'s own header.

| Validator | Gate / role | Tier condition |
|---|---|---|
| `validate-stage-prompts.cjs` | stage-prompt schema check (pre-commit + CI) | all tiers |
| `validate-retrospective.cjs` | user-friction-stamp gate | Standard+ |
| `validate-operating-mode.cjs` | rejects an out-of-range `operating_mode` | all tiers |
| `validate-app-map.cjs` | App-Map currency primitive + G10 assembled-execution cluster-gate | Standard+, `app_map: on` |
| `validate-test-honesty.cjs` | G9 test-honesty (slot + assertion-honesty) | Standard+ |
| `validate-risk-escalation.cjs` | G11 risk-overrides-tier escalation record | Standard+ |
| `validate-destructive-op.cjs` | G12 destructive-op rollback + confinement | Standard+ |
| `validate-risk-matrix.cjs` | G13 9-property risk matrix | Standard+ |
| `validate-calibration.cjs` | G14 verifier-proof / seeded-defect calibration set | Standard+ |
| `validate-reconciliation.cjs` | closeout count reconciliation | Standard+ |
| `validate-transition.cjs` | G15 transitions: atomic durable-state writes + honest four-type rework reconciliation; the six-state release ladder | Standard+ |
| `validate-release-readiness.cjs` | G16 release-readiness: capability-triggered independent whole-product review + ladder well-formedness + the SLSA-level cite at the release end; the manual-aging flag | Standard+ |
| `validate-sources.cjs` | source-registry binding | `research_publish` mode |
| `check-append-only.cjs` | append-only ledger byte-prefix check (the `append-only-ledger.yml` engine) | Full |
| `validate-validator-enumeration.cjs` | enumeration coherence, extended to **four artifact classes** (validators / hooks / scripts / commands) each against its own catalogs (see the per-class table above) — a CI / pre-commit inheritance check, not a numbered gate | all tiers |
| `validate-entry-docs.cjs` | the doc-sync engine: derives/binds the kit's self-descriptive facts into `framework-manifest.json` and polices the entry-doc set for drifted self-claims, including the identity classes (`tier_terms`/`role_terms`/`product_name`). **Disclosed locus:** value-class doc-sets are curated file arrays, not directory globs — a NEW file bearing a policed name/term must be added to its class's list. A kit self-sync inheritance check, not a numbered gate | all tiers |

> **Shared library (not a validator):** `validators/lib/fenced-block.cjs` — the line-anchored, block-bound fence/field extractor. Consumed by the presence-gate validators (`validate-reconciliation` / `validate-calibration` / `validate-risk-matrix` / `validate-retrospective` / `validate-operating-mode` / `validate-stage-prompts`) so a datum counts as "present" only in its right structural place (a real fenced block / a line-start field), never anywhere in the blob — closing the whole unanchored-presence family at one primitive. **Deliberately NOT in the enumeration above** — it is a `lib`, not a shipped `validators/*.cjs` gate (the enumeration globs top-level `validators/*.cjs` only).

## `validate-stage-prompts.cjs`

Validates fenced ```xml stage prompt blocks inside Phase docs against the schemas defined in `STAGE-PROMPT-PROTOCOL.md`. Catches structural drift — missing required tags, unknown root elements, malformed `id` attributes — before a stage is run from a broken prompt.

### Usage

```bash
# Validate all Phase docs in docs/build-prompts/M*.md (typical CI usage)
node validators/validate-stage-prompts.cjs --all

# Validate template XML examples (allows M[NN] placeholder IDs)
node validators/validate-stage-prompts.cjs --templates

# Validate specific files
node validators/validate-stage-prompts.cjs docs/build-prompts/M01-foundation.md

# Same as above, allowing placeholder IDs (rare; usually use --templates)
node validators/validate-stage-prompts.cjs --allow-placeholders <file>
```

Exits `0` if all valid, `1` if any errors found, `2` for usage errors.

### What it checks

For each fenced ```xml block in the given files:

1. **Root element.** Must be one of `<work_stage_prompt>`, `<closeout_stage_prompt>`, or `<verifier_stage_prompt>`.
2. **`id` attribute.** Must match `M\d{2}\.[A-Z]` (e.g., `M01.A`, `M01.V`, `M01.E`). In template mode, also accepts `M[NN].<X>` placeholder form.
3. **Required tags per schema.** Each schema's required-tag set must be present (matched by opening or self-closing tag).
4. **No `ORCHESTRATOR.md` reference.** Stage prompts must never reference `ORCHESTRATOR.md` — it is the orchestrator role's manual; build / verifier / closeout sessions deliberately do not read it. Any mention inside a stage prompt block is an error.

It does **not** check:

- Form-mismatch issues (e.g., inline vs reference form for `<deliverable>`)
- Semantic correctness of tag contents
- Whether referenced files actually exist
- Inter-tag relationships (e.g., does `<read_prior_stages>` cite real prior retrospectives)

Those are human-review concerns. The validator catches the structural omissions that are repeatable and mechanical.

## `validate-retrospective.cjs`

Enforces the **user friction stamp** in stage retrospectives. The three retro axes are agent-authored (the agent grading its own work); the user-stamp is the one independent signal, so honor-system isn't enough — this validator makes it mechanically required.

### Usage

```bash
# Check specific retro files
node validators/validate-retrospective.cjs retrospectives/M01.A-retrospective.md

# Check all staged retro files (typical pre-commit usage)
node validators/validate-retrospective.cjs --staged
```

Exits `0` if all stamps are valid, `1` if any retro has a missing/placeholder/invalid stamp, `2` for usage errors.

### What it checks

Per retrospective file (the A-15 binary form, M20.5.C):
- A ` ```user-stamp ` fenced block exists.
- `verdict:` is exactly `pass` or `fail` (case-insensitive; the `{{pass|fail}}` placeholder and any other value are rejected by name).
- `note:` is **optional** — a present note must be a real sentence (no placeholder, no whitespace-only).
- A stamp carrying **both** `score:` and `verdict:` is rejected as ambiguous.
- **Advisory (non-blocking):** an explicit `verdict: fail` is a VALID stamp (exit 0) that prints a `NOTE`: the outcome is forced to Friction-heavy + protocol iteration (per `PROCESS-VALIDATION.md`). A fail is an owner signal, not a validation error; the human enforces the routing.
- **Grandfather:** retros listed in `validators/retro-stamp-grandfather.json` (the kit's pre-cutover history — explicit paths, diff-visible, never grown) validate under the legacy 1–5 rules unchanged. An absent baseline (every generated project) grandfathers nothing.

Run it against real retros under `retrospectives/`, not the blank `templates/RETROSPECTIVE-TEMPLATE.md` (the template legitimately still has the `{{pass|fail}}` placeholder and will fail by design).

## Wiring as git hooks

**Generated projects (`verification_locus: local_first` / `hybrid`).** Bootstrap installs committed hooks under `.githooks/` and activates them with `core.hooksPath`:

```bash
node scripts/install-hooks.cjs   # one-time, after clone — sets core.hooksPath = .githooks
```

The generated `.githooks/pre-commit` runs these validators (when relevant files are staged) plus the project's fast checks; `.githooks/pre-push` runs the full local matrix (`scripts/verify-local.cjs`). Committing the hooks means they're reviewed in PRs and update with a pull — unlike `.git/hooks/`, which isn't version-controlled. Git won't auto-enable a repo-committed hooks path (by design, for security), so `install-hooks.cjs` is the documented setup step.

**Ad-hoc / this kit's own repo** (no `.githooks/`): wire the two validators straight into `.git/hooks/pre-commit`:

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
set -e
# Stage-prompt schema check on staged Phase docs
staged_phase=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^docs/build-prompts/M[0-9]{2}.*\.md$' || true)
if [ -n "$staged_phase" ]; then
  node validators/validate-stage-prompts.cjs $staged_phase
fi
# User friction stamp check on staged retrospectives
node validators/validate-retrospective.cjs --staged
EOF
chmod +x .git/hooks/pre-commit
```

Each check only fires when relevant files are part of the commit; other commits aren't slowed down. (Hook scripts are POSIX sh/bash; on Windows they run under Git's bundled bash. The validators themselves are cross-platform Node `.cjs`.)

## Wiring as CI

The kit ships a workflow at `templates/dot-github/workflows/validate-stage-prompts.yml` that runs `--all` on every PR touching `docs/build-prompts/`. Bootstrap installs it at `.github/workflows/validate-stage-prompts.yml` in user projects.

The kit's own CI (`.github/workflows/validate-stage-prompts.yml`) runs `--templates` against `templates/PHASE-DOC-TEMPLATE.md` so the kit's own examples stay valid.

## Adding a new schema variant

When extending `STAGE-PROMPT-PROTOCOL.md` with a new root element:

1. Add the variant to `SCHEMAS` at the top of `validate-stage-prompts.cjs`.
2. List its required tags.
3. Run `node validators/validate-stage-prompts.cjs --templates` to confirm the existing templates still parse cleanly.
4. Add an example block in `templates/PHASE-DOC-TEMPLATE.md` and verify the validator accepts it.
