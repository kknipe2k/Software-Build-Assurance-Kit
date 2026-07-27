# Validators

Scripts that enforce framework discipline beyond honor-system rules.

## Process-mass budget (N5) — read before you add a validator or gate

**This is a standing rule for developing the kit AND for any project that adds its own gates.** Every gate has a marginal cost that recurs forever: each new validator is an O(docs) sweep — it forces every future contributor to keep more docs, catalogs, and Phase docs reconciled with it. Past some point the marginal gate costs more than it catches. So, before adopting any new gate or validator, the adoption record must carry two things:

- **(a) a named real failure it would have caught** — a specific incident, retro, or bug that actually happened, not a hypothetical "this could go wrong."
- **(b) an O(docs) sweep-cost estimate** — how many docs/files the new gate forces every future contributor to keep reconciled (and where).

A gate whose marginal catch rate is below its sweep cost is **not adopted**. The dogfood data that bought this rule: 89% of logged friction is sev-1, and every new gate is an O(docs) sweep (M10.A / M10.B retros). Adding to the catalog below without (a) and (b) on record is the anti-pattern this rule exists to stop.

## Smoke test the whole mechanism

In a kitted project (bootstrapped or adopted), the installed per-project rig:

```bash
node scripts/smoke-project.cjs
```

Runs synthetic regression tests against the four installed hooks (SessionStart, UserPromptSubmit, PreToolUse red-gate, receipts-lifecycle) and the wired validators in seconds — CRLF Phase docs, UTF-16LE+BOM `role`, mode-guard cases, retro-stamp enforcement. Exit 0 = all green. The kit's own full rig (`scripts/smoke.cjs`, 1,250+ checks) runs in the development repository and is not part of this snapshot; the shipped effectiveness proof is `scripts/bake-inheritance.cjs`, whose dead-validator control renders a real project and proves the inherited gates fire there.

**Proves:** the safety nets still fire correctly. **Does not prove:** output quality — that needs a walkthrough.

## The validator set (complete)

Every `validators/*.cjs` shipped, with its tier condition. `validate-validator-enumeration.cjs` — a **kit-only** check that runs in the kit's own CI, not a generated project — reconciles this list, the Phase-3 scaffold tables (`bootstrap/SCAFFOLD-TABLES.md` — re-homed there out of the bootstrap `CLAUDE.md`; in a generated project, where no `bootstrap/` exists, the probe falls back to the project's `CLAUDE.md`), and `templates/PROJECT-CLAUDE.md` so all three enumerate the full set — in the kit, a shipped validator absent from any of the three blocks the commit. Since M26.D the two kit-self validators (this one and `validate-entry-docs.cjs`) are **not copied into projects** at all (`calibration-core.json` `kit_only_validators`; a project must never inherit a validator it can never run as a gate). The count is **never hand-stated here**: the check discovers the set by glob (`validators/*.cjs`), so this table is the catalog it reconciles, not a number to keep in sync. The `tier condition` column states *when a validator activates* (Lite / Full / mode-gated); every validator is still listed in **every** catalog regardless of its tier — "all tiers" in a row means "catalogued at all tiers", not "runs at all tiers". The two original gates (`validate-stage-prompts`, `validate-retrospective`) are documented in detail in the sections below; the rest carry their full usage in their own file headers.

**Four artifact classes, per-class catalogs (M19.C / I10, the A-05 "Option E" model).** `validate-validator-enumeration.cjs` reconciles four shipped classes against their own catalog sets, because the classes are catalogued in different places:

| Class | Glob | Catalogs it must appear in |
|---|---|---|
| validators | `validators/*.cjs` | this README · the scaffold tables (probed sentinel¹) · `templates/PROJECT-CLAUDE.md` |
| hooks | `templates/dot-claude/hooks/*.cjs` | the scaffold tables (probed sentinel¹) · the golden row-set (`scripts/fixtures/golden-bootstrap/rows.json`) |
| scripts | `templates/scripts/*.cjs` | the scaffold tables (probed sentinel¹) · the golden row-set |
| commands | `templates/dot-claude/commands/*.md` | the scaffold tables (probed sentinel¹) · the golden row-set |

¹ The `CLAUDE.md` catalog is a **probed sentinel**: it resolves to `bootstrap/SCAFFOLD-TABLES.md` where that file exists (the kit repo, since the tables re-homed out of the bootstrap `CLAUDE.md`) and to the root `CLAUDE.md` otherwise (a generated project, whose `CLAUDE.md` — rendered from `PROJECT-CLAUDE.md` — carries the validator list).

**The bake-vs-golden divergence is CLOSED (M27.D, KF-48 instance 1).** It used to read: the bake copies all of `validators/` wholesale, the golden row-set renders only the *headline* rows, and adding the rest "would change the rendered scaffold count, so it's deliberately not done." The md2page trial showed what that cost — a generated project whose own `.githooks/pre-commit` **named twelve validators by name** while its scaffold shipped four, with the hook's `[ -f ]` guards turning the other eight into **silent passes**. A count is not a reason to ship a project a gate it cannot run. **Every validator any generated artifact references now carries a generation row**, at the tier that claims it, and the property is enforced mechanically in the development repository by `node scripts/golden-bootstrap.cjs --generated-refs` — DERIVED from what the generated layer itself names, so a new referencing artifact fails the check without anyone editing a list. The scaffold count moved with it (Full ~107 / Lite ~43): that growth **is** the fix, not a side effect. The two **kit-only** validators stay out by their own honestly-labelled reference lines — the label is the de-documentation, and it is read at the reference site rather than hand-declared in a baseline. `rows.json` remains the catalog `validate-validator-enumeration.cjs` reconciles hooks/scripts/commands against; validators still reconcile against the three doc catalogs above.

| Validator | Gate / role | Tier condition |
|---|---|---|
| `validate-stage-prompts.cjs` | stage-prompt schema check (pre-commit + CI) | all tiers |
| `validate-retrospective.cjs` | user-friction-stamp gate | Full |
| `validate-operating-mode.cjs` | rejects an out-of-range `operating_mode` | all tiers |
| `validate-app-map.cjs` | App-Map currency primitive + G10 assembled-execution cluster-gate | Full, `app_map: on` |
| `validate-test-honesty.cjs` | G9 test-honesty (slot + assertion-honesty) | Full |
| `validate-risk-escalation.cjs` | G11 risk-overrides-tier escalation record | Full |
| `validate-destructive-op.cjs` | G12 destructive-op rollback + confinement | Full |
| `validate-risk-matrix.cjs` | G13 9-property risk matrix | Full |
| `validate-calibration.cjs` | G14 verifier-proof / seeded-defect calibration set | Full |
| `validate-reconciliation.cjs` | closeout count reconciliation | Full |
| `validate-carry-forward.cjs` | the V-🟡 carry-forward landing slot (BUILD-PLAYBOOK §3.4): every 🟡 finding in the prior milestone's `retrospectives/M[NN].V-findings.md` must appear in the next Phase doc — in scope or explicitly deferred. Honest locus: it checks the finding **landed**, not that the treatment is adequate; what it removes is silence | Full |
| `validate-transition.cjs` | G15 transitions: atomic durable-state writes + honest four-type rework reconciliation; the six-state release ladder | Full |
| `validate-release-readiness.cjs` | G16 release-readiness: capability-triggered independent whole-product review + ladder well-formedness + the SLSA-level cite at the release end; the manual-aging flag | Full |
| `validate-outcome-challenge.cjs` | Outcome Challenge shape check (companion §6 A–D — parts present, six-dimensions / risk-scaling / before-implementation anchors intact, a missing part NAMED; pre-commit when `docs/outcome-challenge.md` is staged) | all tiers (Full BLOCK / Lite warn) |
| `validate-spec-examples.cjs` | the spec-example harvest gate: every literal example in the spec must appear in at least one test fixture. Three structural openers only (an `example` info-string fence, a fence/span under an Examples heading, a fence/span under a bolded **Example** list label) — prose is never harvested. Waivers go beside the example in the spec (`harvest-waiver: <reason>`, reason required) and print on every run. Honest locus: it proves the example **reached** the test surface, not that the test asserts the right output. With no test files yet it is a visible skip, never a first-commit block | all tiers (Full BLOCK / Lite warn) |
| `validate-sources.cjs` | source-registry binding | `research_publish` mode |
| `check-append-only.cjs` | append-only ledger byte-prefix check (the `append-only-ledger.yml` engine) | Full |
| `validate-validator-enumeration.cjs` | enumeration coherence, extended to **four artifact classes** (validators / hooks / scripts / commands) each against its own catalogs (see the per-class table above) — a **kit-only** check (reconciles the kit's catalogs in the kit's CI; a project inherits the file but does not run it), not a project gate | kit-only |
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

1. Add the root name to `STAGE_ROOTS` in `scripts/lib/stage-structure.cjs` — the shared structural reader, and **the** source of truth for what a stage root is. The validator and the UserPromptSubmit mode-check hook both key off it.
2. Add the variant to `SCHEMAS` at the top of `validate-stage-prompts.cjs`.
3. List its required tags.
4. Add the root → session-role entry to `ROOT_TO_MODE` in `.claude/hooks/user-prompt-submit-mode-check.cjs` **and its template twin**, byte-identically.
5. Run `node validators/validate-stage-prompts.cjs --templates` to confirm the existing templates still parse cleanly.
6. Add an example block in `templates/PHASE-DOC-TEMPLATE.md` and verify the validator accepts it.

Steps 1, 2 and 4 are mechanically locked together (M27.C): the validator refuses to run when `SCHEMAS` and `STAGE_ROOTS` disagree, and the hook fails closed when `ROOT_TO_MODE` and `STAGE_ROOTS` disagree. A root wired in one place and not the others used to ship silently — it would classify as ad-hoc and skip the role guard entirely.
