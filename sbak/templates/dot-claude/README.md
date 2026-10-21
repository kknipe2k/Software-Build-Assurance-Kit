# `.claude/` - project-scoped Claude Code config and hooks

This directory ships with the **Software Build Assurance Kit**. Its files are installed at the project root as `.claude/` (this README stays here, with the templates) and wire Claude Code's SessionStart hook to print each session's orientation stamp and to record the reads that follow it.

## What's in here

| File | Purpose |
|---|---|
| `settings.json` | Project-scoped Claude Code settings. Registers the SessionStart hooks as one group with no matcher, so every source fires them (`startup`, `resume`, `clear`, `compact`, `fork`, and any later one). |
| `hooks/session-start-read-first.cjs` | The hook (Node.js). Reads `role`, picks the matching read-first list, caps to the configured size, and prints the STAMP LAYER: the stamp line, the session identity, an orientation manifest (every entry with its `when:` boundary) and the memory-is-a-hint rule; only entries tagged `when: session-start` are inlined. The rest are read at their boundary with the agent's own tools; the receipts adapter records each read and the boundary's gate (`approve-red` for `stage-open`) checks the ledger. |
| `read-first-list.txt` | Plain-text list for **work-mode** sessions (build stages A–D). One path per line, relative to repo root. May reference retrospectives. Two more entry forms: `view: <stage>`, the open stage's view that `node scripts/stage-view.cjs <stage>` builds from HEAD (the gate refuses a stale one), and a `*` in the last path segment, which must match exactly one file. Its `phase-N` entries are the bootstrap's own reads, listed only while the bootstrap is in progress. |
| `read-first-list-verifier.txt` | Plain-text list for **verifier-mode** sessions. DELIBERATELY OMITS prior retrospectives - the fresh-context bias guard for Stage V. |
| `read-first-list-orchestrator.txt` | Plain-text list for **orchestrator-mode** sessions (Full). Loads `ORCHESTRATOR.md` first, then `CLAUDE.md`, then standing methodology + live milestone state. Includes gap-analysis (the orchestrator needs full state). |
| `read-first-list-refactor.txt` | Plain-text list for **refactor-mode** sessions (the milestone-boundary health check). Reads under the strictest bias guard in the kit. |
| `role` (created at runtime) | Plain text: `work` (default if missing), `verifier`, `orchestrator`, or `refactor`. Set before opening the matching session; reset to `work` (or delete) after. |

## Mode-aware loading

The hook reads `.claude/role` and picks the matching read-first list. Four modes:

- `work` (or missing) → `read-first-list.txt` - build stages A–D; the standard orientation, retrospectives included.
- `verifier` → `read-first-list-verifier.txt` - Stage V; **omits prior retrospectives** (the fresh-context bias guard, `sbak/BUILD-PLAYBOOK.md §3.4`).
- `orchestrator` → `read-first-list-orchestrator.txt` - orchestration sessions (Full); loads `ORCHESTRATOR.md` first. The orchestrator authors Phase docs / ADRs, adjudicates surfaces, routes findings, runs PRs. See `ORCHESTRATOR.md` for the role and §1 there for topologies.
- `refactor` → `read-first-list-refactor.txt` - the refactorer's health check at a milestone boundary, after the verifier, when the tech-debt ledger crosses its threshold or the interval elapses.

The agent verifies the right list loaded by checking the `[read-first stamp] role=<role>` line in its first-message context. If the role doesn't match expectation, surface the mismatch before doing any work.

Switch modes with the atomic writer: `node scripts/set-mode.cjs verifier` / `node scripts/set-mode.cjs orchestrator` / `node scripts/set-mode.cjs refactor` / `node scripts/set-mode.cjs work` (or `rm .claude/role` for work). Set it before opening the matching fresh session. Use `set-mode.cjs`, **not** a shell redirect: it writes a temp file then atomically renames it over `.claude/role`, so a hook reading concurrently never sees a half-written/empty file (the truncate-then-write race). `.claude/role` is canonical bare-token state - the strict reader accepts only an exact token; absent means `work`, anything else present fails closed.

**Note on `ORCHESTRATOR.md`:** it loads only in `orchestrator` mode. It must never appear in a build/verifier/closeout stage prompt's `<read_first>` - the schema validator (`validators/validate-stage-prompts.cjs`) enforces that. Build sessions follow `CLAUDE.md` + their stage prompt and ignore `ORCHESTRATOR.md` entirely.
