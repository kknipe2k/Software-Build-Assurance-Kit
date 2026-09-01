# `.claude/` — project-scoped Claude Code config and hooks

This directory ships with the **Software Build Assurance Kit**. After bootstrap, it lives at the project root as `.claude/` and wires Claude Code's SessionStart hook to auto-load the read-first orientation files for every session.

## What's in here

| File | Purpose |
|---|---|
| `settings.json` | Project-scoped Claude Code settings. Registers the SessionStart hook for `startup`, `clear`, and `compact` matchers. |
| `hooks/session-start-read-first.cjs` | The hook (Node.js). Reads `role`, picks the matching read-first list, caps to the configured size, and prints the STAMP LAYER: the stamp line, the session identity, an orientation manifest (every entry with its `when:` boundary) and the memory-is-a-hint rule; only entries tagged `when: session-start` are inlined. The rest are read at their boundary with the agent's own tools; the receipts adapter records each read and the boundary's gate (`approve-red` for `stage-open`) checks the ledger. |
| `read-first-list.txt` | Plain-text list for **work-mode** sessions (build stages A–D). One path per line, relative to repo root. May reference retrospectives. |
| `read-first-list-verifier.txt` | Plain-text list for **verifier-mode** sessions. DELIBERATELY OMITS prior retrospectives — the fresh-context bias guard for Stage V. |
| `read-first-list-orchestrator.txt` | Plain-text list for **orchestrator-mode** sessions (Full). Loads `ORCHESTRATOR.md` first, then `CLAUDE.md`, then standing methodology + live milestone state. Includes gap-analysis (the orchestrator needs full state). |
| `role` (created at runtime) | Plain text: `work` (default if missing), `verifier`, or `orchestrator`. Set before opening the matching session; reset to `work` (or delete) after. |

## Mode-aware loading

The hook reads `.claude/role` and picks the matching read-first list. Three modes:

- `work` (or missing) → `read-first-list.txt` — build stages A–D; the standard orientation, retrospectives included.
- `verifier` → `read-first-list-verifier.txt` — Stage V; **omits prior retrospectives** (the fresh-context bias guard, `BUILD-PLAYBOOK.md §3.4`).
- `orchestrator` → `read-first-list-orchestrator.txt` — orchestration sessions (Full); loads `ORCHESTRATOR.md` first. The orchestrator authors Phase docs / ADRs, adjudicates surfaces, routes findings, runs PRs. See `ORCHESTRATOR.md` for the role and §1 there for topologies.

The agent verifies the right list loaded by checking the `[read-first stamp] role=<role>` line in its first-message context. If the role doesn't match expectation, surface the mismatch before doing any work.

Switch modes with the atomic writer: `node scripts/set-mode.cjs verifier` / `node scripts/set-mode.cjs orchestrator` / `node scripts/set-mode.cjs work` (or `rm .claude/role` for work). Set it before opening the matching fresh session. Use `set-mode.cjs`, **not** a shell redirect: it writes a temp file then atomically renames it over `.claude/role`, so a hook reading concurrently never sees a half-written/empty file (the truncate-then-write race). `.claude/role` is canonical bare-token state — the strict reader accepts only an exact token; absent means `work`, anything else present fails closed.

**Note on `ORCHESTRATOR.md`:** it loads only in `orchestrator` mode. It must never appear in a build/verifier/closeout stage prompt's `<read_first>` — the schema validator (`validators/validate-stage-prompts.cjs`) enforces that. Build sessions follow `CLAUDE.md` + their stage prompt and ignore `ORCHESTRATOR.md` entirely.

## Why Node.js (not bash)

Claude Code itself runs on Node.js, so `node` is already on PATH wherever Claude Code is installed — Windows cmd / PowerShell, macOS, Linux, WSL. A Node hook works on every platform Claude Code supports without extra installs (no git-bash, no WSL, no Cygwin). The script uses only Node's standard library; no `npm install` needed.

If you prefer a bash version, the hook logic is ~80 lines and easy to port. The Node version is the default because it removes a dependency-on-bash that was a Windows pain point.

## Why this is a hook and not honor-system

The framework's read-first list was originally documented in `CLAUDE.md` and "the agent reads them at session start." That's compliance-by-norm, and norms slip — especially as the list grows past 5–6 files. The hook makes the load deterministic: the files are in context whether the agent thought to read them or not.

The hook also prints a verification stamp (`[read-first stamp] role=<role>, op=<mode>, loaded N of M files (M on the manifest, read at their when:), K skipped`) the agent should echo in its first response. `N` counts inlined session-start entries, `M` the manifest; `K skipped` greater than zero names a dead, fenced or escaping entry - a setup bug to fix before any work happens. `node .claude/hooks/session-start-read-first.cjs --check` verifies every list resolves without opening a session.

## How to change the read-first list

Edit `read-first-list.txt`. Add or remove file paths (one per line). Lines starting with `#` are comments. The hook reads the list top-to-bottom and applies the cap.

Update the list when:

- A new milestone Phase doc opens (replace the previous Phase doc reference with the new one)
- A new framework-level reference becomes load-bearing
- An ADR becomes consulted often enough that auto-loading saves time

## How to change the cap

Edit `project-config.md` at repo root. Change the `read_first_cap` row to `small` (4), `medium` (8), `large` (12), or `unlimited`. The hook reads this on every session start.

See `FRAMEWORK-CONFIG.md` §4.5 (the framework-level reference) for the rationale on why caps exist and how they should scale with project size, user expertise, and stage complexity.

## Disabling the hook

If you need to disable the hook (e.g., for an air-gapped session, or because you want to test the framework without auto-loading):

1. Set `hook_enforcement: disabled` in `project-config.md`, OR
2. Remove the SessionStart entry from `settings.json`, OR
3. Rename `session-start-read-first.cjs` to anything else.

The framework continues to function without the hook; the read-first list becomes honor-system again. This is a documented trade-off, not a hidden behavior.

## Trouble-shooting

**The hook doesn't run.** Check that Claude Code is reading project-scoped settings. Run `/hooks` in Claude Code to list active hooks; the SessionStart entry should appear. If it doesn't, the most common cause is `settings.json` syntax error — validate the JSON.

**The hook runs but loads 0 files.** Check that `read-first-list.txt` exists at `.claude/read-first-list.txt` and contains non-comment lines. The hook prints a warning if the list is empty.

**The hook loads the wrong number of files.** The cap is read from `project-config.md`'s `read_first_cap` row. If that row is missing or unrecognized, the hook defaults to `medium` (8). Check the file for typos.

**`node: command not found`.** Rare — Claude Code itself requires Node.js, so `node` should always be on PATH. If somehow it isn't, install Node.js (https://nodejs.org) and restart your shell. Verify with `node --version`.

**The agent isn't echoing the read-first stamp.** Either the agent missed the instruction, or the hook isn't running. Ask the agent explicitly: "echo the read-first stamp from the SessionStart hook." If the response shows the stamp, things are fine; if not, debug the hook.
