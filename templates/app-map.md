# {{PROJECT_NAME}} — App Map

> **as-of-commit:** `{{COMMIT_SHA}}`  ·  generated for `deliverable_type: {{DELIVERABLE_TYPE}}` (surface class: `{{SURFACE_CLASS}}`)

> The living, surface-organized record of **what user-facing surfaces shipped and exactly how to drive and test each one.** It serves two readers: the **user** (what exists and how to exercise it) and the **build-time LLM** (a testing cheat-sheet loaded at session start, so it can tell you *what and how to test* without re-reading the whole repo). It is **not a second source of truth** — the test/behavior harness stays authoritative; this is the readable layer bound to it. Kept honest by `validators/validate-app-map.cjs` (the currency check) — see *Currency* below.
>
> **Maintained as a close-gate deliverable.** Each build stage writes only the **delta** for the surfaces it touched; Stage E (closeout) reconciles the whole map and refreshes the `as-of-commit` stamp above. The Verifier (Stage V) uses this file as the drive/test script for its observed-running pass — a gesture that doesn't reproduce live is a finding.

---

## Type-adaptive vocabulary legend

The entry shape and the test-id-binding invariant are **identical for every project**. Only the *nouns* for "Surface" and "Gesture" adapt to your deliverable's derived **surface class** — `ui` / `command` / `endpoint` / `api`. Instantiate the row vocabulary for your class:

| Surface class | "Surface" is a… | "Gesture" is… | "Test-id" is a… | "How-to-exercise" = |
|---|---|---|---|---|
| **`ui`** (web / electron / tauri / react / react-native / mobile / desktop / TUI) | UI region (topbar, modal, canvas, screen, panel) | click / type / drag / keyboard shortcut | e2e/component `data-testid` | open the app, do the gesture |
| **`command`** (cli) | command / subcommand / flag | invoke with args | integration test-case id | run the command |
| **`endpoint`** (service) | route / endpoint | HTTP request | route-contract test id | curl / API client |
| **`api`** (library) | public export / API | function call | unit/contract test id | call it in a script |

> **Surface class is *derived*, not a new `deliverable_type`**. The taxonomy stays `{cli, web, library, service, other}`; native UI shells (electron, tauri, react-native, …) map to the `ui` class by description at calibration — they are **not** first-class types.

---

## State semantics (load-bearing)

The **State** column distinguishes two honest conditions — and the currency check treats them differently, so it never forces fiction:

- **`verified`** — a green test-id backs this entry. `validate-app-map.cjs` asserts the cited Test-id **exists** in the test suite; a dead id is a finding (the map drifted from the harness). *Suite green-ness is enforced by CI ordering — tests run first in the same job — not by the validator.*
- **`manual-only`** — human-asserted; no e2e yet. **Not test-id-checked** (and not assembled-checked). This keeps a real coverage cost *visible* instead of smuggling in "every surface must have an e2e test." Use it honestly for surfaces that are legitimately manual-first; don't manufacture a test-id to dodge the check.

### The Evidence column — the G10 assembled-execution cluster-gate

The **Evidence** column carries the assembled-run **reference** for each `verified` entry on a **runtime/drivable** surface class (`ui` / `command` / `endpoint`) — and it is **mandatory** there. Unit/component green is **necessary-not-sufficient** for a runtime surface: a green test-id proves a line *executed*, but only driving the **REAL assembled surface** proves the user-facing behavior. So the verifier's `assembled_execution` pass drives the surface via *How-to-exercise*, retains the **command + result**, and writes that run's reference into this column. Stage C's reconcilable evidence block (command · pattern/mutation set · result) keys off **the same reference** — the cell is the bind between the two, *not* free-text invented independent of a run.

- **Runtime/drivable class (`ui` / `command` / `endpoint`):** a `verified` row **must** cite an Evidence reference. An empty cell → **G10 RED** (`validators/validate-app-map.cjs`). A row driven but not yet test-id-bound is `manual-only`, not a fake `verified`.
- **`library` (`api`) class:** Evidence is **n/a** — the test-id binding alone is sufficient; use `—`.

The arming is **visible** ("cluster-gate armed because surface class = X"), keyed off the derived surface class in the `surface class:` stamp above (or `--surface-class`); the trigger list lives in `FRAMEWORK-CONFIG.md` §4.18 + `docs/gates.md`. **Honest limitation:** the validator can only assert the reference is *present* — it cannot run the app, so the run-reality is the verifier's assembled_execution pass and Stage C's reconciliation, not this static cell.

---

## Currency — how this file stays honest

1. **Primary (a proof): test-id binding.** Every `verified` entry cites a Test-id that must exist in the harness. Run:
   ```
   node validators/validate-app-map.cjs --tests "<your test glob>" docs/app-map.md
   ```
   (The surface-source globs and test globs are named in `docs/gates.md`.)

2. **Secondary (a heuristic): surface-source tripwire.** If a stage's diff touched a surface-source path **without** updating this map, the check warns. Because it's only a heuristic (it false-positives on a no-UX refactor), it is silenced **only** by a *logged* escape token — never a silent skip, never `--no-verify`:

   > **`app-map-unchanged: <reason>`**

   Put that line in the stage surface (and pass `--reason-ok "<reason>"` or `--reason-file <path>` to the validator). The reason is recorded so the omission is always traceable to a human-stated rationale.

> **Tier note.** Standard/Full generate and maintain this file. **Lite** folds a short "how to drive what shipped" paragraph into `README.md` / `CHANGELOG.md` instead — same intent, no separate artifact.

---

## The map

> Organized by **surface**, one row per drivable affordance. Add a `## <Surface group>` heading per region and a table beneath it. Keep the seven columns; instantiate the vocabulary for your surface class (legend above).

### {{SURFACE_GROUP_1}}

| Surface | Location | Gesture | Test-id | Effect | How-to-exercise | Evidence | State |
|---|---|---|---|---|---|---|---|
| {{SURFACE}} | {{WHERE_IT_SITS}} | {{INTERACTION}} | `{{TEST_ID}}` | {{WHAT_IT_DOES}} | {{MINIMAL_STEPS_TO_DRIVE_IT}} | `{{ASSEMBLED_RUN_REF}}` | verified |
| {{SURFACE}} | {{WHERE_IT_SITS}} | {{INTERACTION}} | — | {{WHAT_IT_DOES}} | {{MINIMAL_STEPS_TO_DRIVE_IT}} | — | manual-only |

<!--
Worked shapes by surface class (delete once you have real rows). The 8th column,
**Evidence**, is the assembled-run REFERENCE (G10 cluster-gate): for a
runtime/drivable class it points at the retained assembled-execution run — the
verifier's assembled_execution pass drove the REAL surface and logged the command +
result; the SAME reference Stage C structures into its reproducible evidence block.
A `library` (api) surface is n/a (use `—`); a `manual-only` row is n/a (use `—`).

ui (web/electron/…):
| Topbar | top-right, beside avatar | click | `save-doc-btn` | persists the open doc | open app → click Save → toast "Saved" appears | `M03.V#save-doc` | verified |
| Command palette | Ctrl/Cmd-K anywhere | keyboard shortcut | `cmd-palette` | opens the command palette | press Cmd-K → palette focuses the search input | `M03.V#cmd-palette` | verified |

command (cli):
| `build` subcommand | `mytool build [--watch]` | invoke with args | `cli_build_outputs_dist` | compiles sources to dist/ | run `mytool build` in a fixture project → dist/ appears | `M03.V#build` | verified |

endpoint (service):
| `POST /sessions` | auth route | HTTP request | `sessions_post_201` | creates a session, returns a token | curl -XPOST /sessions -d '{...}' → 201 + token | `M03.V#sessions-post` | verified |

api (library) — Evidence is `—` (G10 n/a; the test-id binding is sufficient):
| `parse()` | public export | function call | `parse_roundtrips` | parses input → AST | import { parse }; assert parse(x) deep-equals expected | — | verified |

Read: a `verified` row's Test-id MUST exist in a green test file (the currency
check asserts existence; CI runs the suite first to assert green). For a
runtime/drivable surface (ui/command/endpoint) a `verified` row MUST ALSO carry an
Evidence reference — the assembled run that drove the REAL surface (G10). A surface
with no test yet is honest as `manual-only` — it is neither test-id- nor
assembled-checked.
-->

---

*Bound to the harness, not authored from inference. Delete the map and the tests still drive the app; delete the tests and the `verified` entries lose their backing — which is the point. The map makes the Verifier's observed-running pass cheaper and the orchestrator's test guidance accurate; it does not subsume them.*
