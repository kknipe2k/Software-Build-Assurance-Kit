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

## When the gate refuses

The red-gate hook (`.claude/hooks/pretooluse-red-gate.cjs`) works out one of three states before it judges an edit or a shell command: confirmed inactive, active, or unknown.

- **Confirmed inactive** - no stage is open (`.claude/stage-active` is absent). Edits and commands run, and the gate prints nothing.
- **Active** - a stage is open. Until the human runs `/approve-red`, implementation edits are refused; tests, docs and `.claude/measurements/` stay writable.
- **Unknown** - the gate cannot tell whether a stage is open: a marker is empty, a folder or unreadable, `scripts/lib/hook-root.cjs` is missing while a stage is open, or the hook's input is malformed. Every edit and every command is refused with one line:

  `[red-gate] REFUSED - state unknown: <the fault>. Recovery: node scripts/kit-update.cjs --ready, then --adopt; if this call is refused, run them from your own terminal.`

In every state the gate refuses an edit tool on its own control files: the markers, the hooks, the settings, the read-first lists and the installed release manifest. That includes `.claude/settings.json`: to change it, fill a copy outside `.claude/` and place it with `node scripts/kit-update.cjs --place-settings <filled-file>`, which checks the kit's hook registrations and permissions first, keeps the old bytes under `.claude/settings.archive/`, and replaces the file.

To recover from the unknown state:

1. Run `node scripts/kit-update.cjs --ready`. It names what is missing or drifted.
2. Run `node scripts/kit-update.cjs --adopt`. It restores missing kit files and leaves yours alone.
3. If a marker is broken (an empty `.claude/stage-active`, a folder, or a link where the marker should be), `--ready` names it on its `state` line. Clear the stage and open it again from your own terminal (the gate refuses the agent's call while the state is unknown): `node scripts/stage-active.cjs --clear`, then `node scripts/stage-active.cjs <stage>`. The clear removes a folder or a link at a marker's path (the link itself, never what it points to) and says which it removed. If it cannot remove one, it names it and stops: it never prints `cleared` over a marker that is still there. Run where no marker is present, it says so on its own line, `stage-active: no marker was present in <folder>/.claude; nothing was cleared here`, so a clear run in the wrong folder shows.

The agent may run `--ready`, `--adopt` and `--migrate` even in the unknown state, but only after the gate checks `scripts/kit-update.cjs` against the hash recorded in the installed release's manifest, which the installer verified. If the script has changed, the gate refuses with a line that sends you to your own terminal, or to the installer, which re-verifies the payload.

When `--ready` reports drift on the hook or on `scripts/kit-update.cjs` itself, `--adopt` will not help: it never overwrites a file that is already there. The path is the upgrade paragraph's `--migrate` (`node sbak/templates/scripts/kit-update.cjs --migrate --pin <the version you came from> --apply-all`), run from your own terminal at a cleared stage on a committed tree.

## When the gate refuses a shell command

While a stage is open and its failing tests are not yet approved, the gate also reads shell commands, from the Bash and PowerShell tools alike, for a short list of write constructs:

- redirects (`>`, `>>`, `2>`, `&>`, a heredoc's redirect), `tee`, and PowerShell's `Tee-Object`;
- `sed -i`, `perl -i`, `cp`, `mv` and `install`;
- `node -e`, `node -p`, `python -c` and `python3 -c` calls that write a file named in the command;
- PowerShell's `Set-Content`, `Add-Content`, `Out-File`, `New-Item`, `Copy-Item`, `Move-Item` and `[IO.File]::WriteAllText`, and `truncate` and `Clear-Content`, which rewrite a file;
- `git apply`, `git restore`, and `git checkout` of a path.

A target the gate can read is judged by the same rule as an edit: tests, docs and `.claude/measurements/` stay writable, an implementation file is refused, and a control file is refused in every state. A target it cannot read (a variable, a glob, a command substitution, or none at all) is refused with one line:

  `[red-gate] REFUSED - <construct> writes to a target the gate cannot read ('<token>'); name the file, or run the write after /approve-red.`

The gate reads a construct wherever the command nests it, up to eight levels deep: inside `$(...)`, backticks and process substitutions, inside an unquoted heredoc body (a quoted delimiter such as `<<'EOF'` keeps the body as text), an arithmetic expansion `$((...))` and a parameter expansion `${...}`, after keywords and prefixes such as `then`, `do`, `{`, `sudo` and `env`, inside a PowerShell script block, and inside the text of `bash -c`, `sh -c`, `zsh -c`, `eval`, `pwsh -c` and `powershell -Command` when that text is literal. A body it cannot read (nested deeper, never closed, or a wrapper whose text is a variable) is refused with one line:

  `[red-gate] REFUSED - a command body the gate cannot read ('<token>'); write it flat, or run it after /approve-red.`

In every state, a command that deletes, moves or empties one of the gate's control files is refused like a write to it: `rm`, `rmdir`, `unlink`, `shred`, `truncate`, `git rm`, `git clean -x` or `-X` and `git stash -a` (they remove the ignored markers), the source of `mv`, `rename` or `git mv`, PowerShell's `Remove-Item`, `Move-Item`, `Rename-Item` and `Clear-Content` with their aliases, and `node -e` removal calls such as `rmSync`. Deleting anything else is not judged, and a dry run (`git clean -n`) is not judged. A deletion whose target the gate cannot read is refused while the stage is open and unapproved: `rm $F`, a PowerShell removal or move fed from the pipeline (`Get-Item ... | Remove-Item`), and a removal, move or write that `xargs` carries (`ls .claude | xargs rm`).

The gate is a parser, not a sandbox. It does not judge a script or program that writes a file itself (`npm test`, `node scripts/...`, `make`), an alias, a wrapper it does not read (`cmd /c`, `Invoke-Expression`, `env -S`, `xargs` carrying any other command, `find -exec`), a writer on no list (`ln`, `dd`, `find -delete`), or a git command that brings implementation in from elsewhere (`git merge`, `git pull`, `git stash pop`). The hook's header lists everything it leaves alone.

## When the approval is void

A release records what it approved in `.claude/channel/approval.json` and binds the marker to that record. While a stage is approved, an implementation edit is refused with one line when the approval no longer stands:

- an approved test file was deleted, renamed or changed, and no orchestrator ack covers the change:

  `[red-gate] approval void - <file> changed since the RED approval and no ack covers it; the owner runs /approve-red (an amendment inside an approved file is acked by the orchestrator)`
- the record is missing, or does not match the marker:

  `[red-gate] approval void - the approval record for stage <id> is missing or does not match the marker; the owner runs /approve-red`
- the approval was taken back with `node scripts/approve-red.cjs --stage <id> --void --reason "<text>"`:

  `[red-gate] approval void - stage <id>'s RED approval was voided (<text>); the owner runs /approve-red`

The way back is the same each time: run `/approve-red` again, which records a new approval row. An edit inside an approved test file is not a void when it goes through the channel as an amendment and the orchestrator acks it. An amendment that removes or loosens an assertion cannot be acked: it needs `/approve-red`. The `approve-red` skill lists the five cases and who decides each.
