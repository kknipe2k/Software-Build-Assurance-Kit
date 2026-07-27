# Spec — deliverable-type sections

> Per-type addendum to the base spec (`spec/project-spec.md`). The base spec structure (Identity / Scope / Architecture / Engineering charter / Open questions) is the same for every deliverable; this file defines the **one contract section each type adds** — the thing that type lives or dies on. At Phase 1, after the base spec, the agent appends the section matching `deliverable_type` from `project-config.md`.
>
> One file instead of six full template variants: the base is shared; only the contract section differs. Maintain the delta here, not six copies of the whole spec.
>
> **Examples must be structurally marked** — `validators/validate-spec-examples.cjs` demands that every literal example in the spec appears in at least one test fixture, and it reads **structure**, not prose. Put examples under an **`## Examples`** heading, in a fenced block tagged ```` ```example ````, or under a bolded **`**Example**`** list label (the `Examples` bullets below are that third form). A backticked token in an ordinary requirements sentence is *not* an example and is never demanded — that exclusion is deliberate (a gate that demanded every flag name and file path become a fixture would be switched off within a day), but it does mean an example written that way escapes the gate entirely. If an example genuinely should not have a fixture, waive it in place with `harvest-waiver: <reason>`; the reason is required and every waiver prints on every run.

---

## `cli` — Command surface

The contract a CLI is judged against. Add to the spec as a section.

- **Commands / subcommands** — each command, its one-line purpose.
- **Arguments & flags** — per command: positional args (name, required?, type), flags (`--name`, short form, default, what it does).
- **stdin / stdout / stderr** — what's read from stdin (if any), what shape goes to stdout (human text? JSON? both via a `--json` flag?), what goes to stderr.
- **Exit codes** — `0` success; enumerate the non-zero codes and what each means. This is the machine-facing contract; scripts depend on it.
- **Examples** — 2–3 invocation → output examples that double as acceptance criteria.

Gate implication (`docs/gates.md`): an arg-parse + exit-code test per command; a golden-output test for the primary path.

## `library` — API surface

The public contract other code imports. Changing it without a major version bump is a breaking change.

- **Public API** — every exported type, function, class the consumer is meant to use: signature, what it returns, what it throws/errors.
- **What's NOT public** — internal modules the consumer must not depend on (so refactors aren't breaking changes).
- **Stability & semver** — which surfaces are stable vs experimental; the semver policy (what counts as patch / minor / major).
- **Usage examples** — the canonical "import and use it" snippet(s); these become doctests / example-runs.
- **Compatibility** — supported runtime/language versions; peer dependencies.

Gate implication: doctest / example-run in the gate set (the README example must actually execute); a public-API-surface review at closeout (did we expand the surface intentionally?).

## `service` — Endpoint contracts

The wire contract for a long-running server/API.

- **Endpoints** — per route: method + path, purpose, auth required?, request shape, response shape (success), error responses (status + body).
- **Auth model** — how callers authenticate; which routes are public vs protected; authz on state-changing routes.
- **Health & readiness** — the health-check endpoint and what "healthy" means.
- **Operational contract** — rate limits, timeouts, idempotency of mutating routes, expected throughput.
- **Deployment surface** — where it runs, config/secrets it needs, how it starts.

Gate implication: a live-request smoke (start the service, hit the health check + one primary route) in the Behavior pass; authz check in the Security pass.

## `web` — Design requirements + Visual acceptance

Web/UI is the one type whose contract lives in a separate artifact: **`docs/design.md`** (authored at Phase 1.5/1.6). The spec carries a short pointer + the visual acceptance criteria.

- **Design brief reference** — "see `docs/design.md` for the design system (tokens, components, layout, responsive)."
- **Visual acceptance** — checkable UI-done criteria the design pass verifies: "uses design tokens, not raw values"; "no raw browser defaults"; "typographic hierarchy ≥ N levels"; "meets the contrast target"; "primary interaction completes in a fresh browser with no console errors."

Gate implication: Playwright (or equivalent) browser-load e2e in the gate set; Stage V Pass 4 (observed-running) + Pass 5 (design conformance against `docs/design.md`).

## `other` (desktop / mobile / agent / runtime)

No specialized contract section yet. Use the closest fit (usually `cli`'s command surface or `service`'s contracts) and **flag in the spec's Open Questions that the deliverable-type contract isn't specialized** — so the gap is visible rather than silently absent. The agent proposes the nearest applicable section and notes what type-specific gates are missing.
