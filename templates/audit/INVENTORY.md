# Audit Inventory — S1 (the complete structural map)

> Produced by Phase S, step S1 (`operating_mode: audit`). The largest single read in the mode: the agent walks the **whole codebase** and maps it before any review begins — "you can't audit what you can't see." Every subsequent setup step and every pass reads *this*, not the raw tree. Lives at `docs/audit/INVENTORY.md`.
>
> **G_AUDIT_S1 — inventory completeness.** Every file in the codebase appears below. A file deliberately left out of review (a vendored dependency, generated output, a lockfile) is listed with an **`EXCLUDED`** tag **and a rationale** — never silently dropped. The completeness rule is the whole point: a silently-omitted file is an un-audited file nobody notices.

---

## Project facts

- **Repo:** {{name}} · **commit audited:** `{{sha}}` · **date:** {{YYYY-MM-DD}}
- **Languages / frameworks / runtimes (+ versions, from manifests):** {{…}}
- **Total tracked files:** {{N}} · **in-scope:** {{N}} · **EXCLUDED:** {{N}}

---

## File map (every file — present or EXCLUDED)

> One row per tracked file. `Status` is `in-scope` or `EXCLUDED`. **An `EXCLUDED` row MUST give a rationale** (G_AUDIT_S1) — "vendored", "generated from `schema.json`", "lockfile", etc. No blank rationales; no missing files.

| File | Role / what it is | Status | EXCLUDED rationale (required if excluded) |
|---|---|---|---|
| `src/main.ts` | app entry point | in-scope | — |
| `vendor/lib.min.js` | third-party bundle | EXCLUDED | vendored dependency, not our code |
| `package-lock.json` | dependency lockfile | EXCLUDED | generated; audited via dependency pass, not line-by-line |
| … | … | … | … |

---

## Cross-cutting surfaces (the things passes trace)

- **Entry points** — `main`, server bootstrap, CLI entry, request handlers, queue/message consumers, scheduled jobs, lambda handlers.
- **External / untrusted-input surfaces** — HTTP routes, CLI args, env vars, file uploads, deserialization points, webhooks, IPC channels, sockets.
- **Trust boundaries** — where data crosses untrusted ↔ trusted.
- **Secrets & config surfaces** — where credentials/keys live or are read (env, config files, secret managers, hardcoded).
- **Data stores & sinks** — databases, caches, file writes, shell-outs, outbound network calls, template renderers.
- **IPC / message channels** — every channel + its handler + the serialized payload shape.
- **State locations** — global/shared/persistent state and its writers.
- **Dependencies** — direct third-party packages; flag any unmaintained, pinned to old majors, or fetched from non-standard sources.

| Surface kind | Location | Notes |
|---|---|---|
| {{e.g. HTTP route}} | `routes/user.js:42` | untrusted body → SQL |

---

## Completeness sign-off (G_AUDIT_S1)

- ☐ Every tracked file appears above (in-scope or EXCLUDED).
- ☐ Every EXCLUDED file has a non-blank rationale.
- ☐ File count reconciles: `in-scope + EXCLUDED == total tracked`.
