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

A read-first list is a control file too: change a staged copy outside `.claude/` and place it with `node scripts/kit-update.cjs --place-read-first <role> <staged list>`, which checks its shape before it replaces the list.

The gate's own two scripts run only in their bare forms. The hook refuses a shell command that names `approve-red.cjs` or `stage-active.cjs` unless it is one of their bare forms, alone in the call (`node scripts/approve-red.cjs --stage <id> --release-seq <n>` and its `--void --reason "<text>"` form; `node scripts/stage-active.cjs <stage>`, `--clear` and `--clear --tree <path>`), so under the Bash tool the permission fence's ask rule, which outranks any allow, always asks you first (deterministic enforcement under Claude Code). The kit sets no ask rule for Claude Code's PowerShell tool, which is on automatically on Windows without Git Bash, opt-in elsewhere with `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, and off on Windows with Git Bash while the kit's Bash deny rules stand, unless that variable is set; under it the hook refuses any command that names either script or one of the gate's control files unless it is one of the bare forms, with no read-only exception, and the recorded prompt below still holds (deterministic enforcement). Under that tool the bare forms are the scripts' bare forms above and the two hook commands the kit prints, `node .claude/hooks/session-start-read-first.cjs --check` and `node scripts/kit-update.cjs --apply .claude/hooks/receipts-lifecycle.cjs`, each exact and alone in the call (deterministic enforcement). From a Claude Code session the release, the void and the clear also refuse unless the prompt the command asked is on record in the session's receipts (deterministic enforcement over observed evidence); from your own shell, outside the Claude Code session, which never passes through the fence and has no session id, both scripts run as before (human authorization).

What the checks read:

- `--ready` reads the effective hook policy in the two project settings files: every kit hook registration with its matcher, the red gate's `onFailure` block, and no `disableAllHooks` in `.claude/settings.json` or `.claude/settings.local.json`; user, managed and command-line settings are outside what it can read. It also reads which kit files this project's tier and toggles require, and a required file that is missing is NOT READY.
- The pre-commit refuses a commit when a gate it would run is required here and missing.
- At the stage end the channel compares every approved test file's bytes with the approval, or with the last acked amendment: a file changed without an ack refuses the stage-end packet.
- Each channel row carries `origin`, the repository's identity across clones (the committed `.claude/channel/identity`, written once by `node scripts/channel.cjs identity --init`, or the root commit when there is none), and `repo`, this clone's stamp, which tells two repositories apart on one machine.

To recover from the unknown state:

1. Run `node scripts/kit-update.cjs --ready`. It names what is missing, unfilled or at an older kit version.
2. Run `node scripts/kit-update.cjs --adopt`. It restores missing kit files and leaves yours alone.
3. If a marker is broken (an empty `.claude/stage-active`, a folder, or a link where the marker should be), `--ready` names it on its `state` line. Clear the stage and open it again from your own terminal (the gate refuses the agent's call while the state is unknown): `node scripts/stage-active.cjs --clear`, then `node scripts/stage-active.cjs <stage>`. The clear removes a folder or a link at a marker's path (the link itself, never what it points to) and says which it removed. If it cannot remove one, it names it and stops: it never prints `cleared` over a marker that is still there. Run where no marker is present, it says so on its own line, `stage-active: no marker was present in <folder>/.claude; nothing was cleared here`, so a clear run in the wrong folder shows.

The agent may run `--ready`, `--adopt` and `--migrate` even in the unknown state, but only after the gate checks `scripts/kit-update.cjs` against the hash recorded in the installed release's manifest, which the installer verified. If the script has changed, the gate refuses with a line that sends you to your own terminal, or to the installer, which re-verifies the payload.

When `--ready` reports the hook or `scripts/kit-update.cjs` at an older kit version (it compares the @kit-version stamp; the content compare is the drift report, `node scripts/kit-update.cjs` with no flag), `--adopt` will not help: it never overwrites a file that is already there. The path is the upgrade paragraph's `--migrate` (`node sbak/templates/scripts/kit-update.cjs --migrate --pin <the version you came from> --apply-all`), run from your own terminal at a cleared stage on a committed tree.

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

## The evidence a stage leaves

Every stage opened from this release leaves its acceptance evidence under `.claude/evidence/<stage>/`, committed with the stage, so a later reader can check it without asking anyone (observed evidence). A record is required when its absence or a contradiction refuses a named boundary; every other record is diagnostic and never refuses.

Every record names its subject: the sha256 over the index's path and blob lines excluding .claude/evidence/, .claude/channel/ and retrospectives/ (one constant in scripts/lib/evidence.cjs), so a record can describe the tree it rides in without describing itself; a writer refuses while the working tree differs from the index outside those three folders, so the builder stages the candidate (git add) before the RED run, the GREEN run, the lane and the stage-end publish. The subject excludes `retrospectives/` because the retrospective is filled after GREEN; a test that reads a file under `retrospectives/` therefore reads an input the subject does not cover, and its records (observed evidence) do not show that input's bytes.

| Record | Written by, when | Who reads it | The decision that changes when it is absent or contradictory | Stays |
|---|---|---|---|---|
| `stage_opened` | `scripts/stage-active.cjs` at the open, as the lifecycle's `opened` row: the stage, the role, the session, the subject at open | the stage-end publish (the completed prefix) | the stage end is refused without it for this stage id (required) | `lifecycle.jsonl`, committed |
| `gate_probed (liveness)` | the open, after `opened`, as the `probed` row: the project's red-gate hook driven with a control-file edit it must refuse and a docs write it must allow, both verdicts, the hook's sha256, the node version | the open itself, the stage-end publish, `gate.json` | a wrong verdict, an absent hook or a row that cannot be written refuses the open, and the stage end is refused without the row (required) | `lifecycle.jsonl`, committed |
| `gate_probed (host integration)` | the open, as the `host` row: the two project settings files read, the kit registrations found, `onFailure` on the red gate, `disableAllHooks`, and `host_level` settings_verified or none; never a claim that the host loaded them | `gate.json`, the stage-end packet | none at the stage end on this path (the level is recorded, not required); readiness already refuses a disabling configuration before the stage opens | `lifecycle.jsonl`, committed |
| `gate_judged` | the red gate, one row per judged call, to the session's receipts ledger: the state, the verdict, the refusal's class, the tool's category, a target ref (never a path), and `tool_use_id` when the host supplies one, else `hook_seq` | the stage-end publish, which summarizes the stage's rows into `gate.json` | an unresolved refusal refuses the stage end; the counts and the coverage level are diagnostic, and a count is never read as "every call was judged" | the rows local until the next closeout; the summary committed in `gate.json` |
| `red_approved` | the release (`/approve-red`): the approval row in `.claude/channel/approval.json` with the RED record's sha256 and subject, and the lifecycle's `red_approved` row binding that row by its hash | the red gate, the stage-end publish, `gate.json` | the release refuses without a RED record bound to the approved tests; the stage end is refused without the row, or when the row does not bind the standing approval (required) | `approval.json` archived beside the evidence at the stage end, committed |
| `tests_run (RED)` | `node scripts/verify-local.cjs --stage <id> --subject red`, at the red-stop: the command's sha256, the exit code, the counts, the failing tests and their errors, the class of the failure, the platform (`platform`), the runner and the lockfile, the subject, the approved set | the release | the release refuses when it is absent, for a different set, zero tests, a load or configuration failure, a test error that is not an assertion, or no failing test (required) | `tests_run.red.json`, committed |
| `ack` | the orchestrator's `node scripts/channel.cjs ack`: the ack row in the approval record, naming the orchestrator's channel message by seq and sha256 | the red gate, the stage-end publish | an ack whose message is not in the log with that sha256 folds nothing, so the amendment stays unacked and the stage end refuses the changed test file | `approval.json`, archived as above |
| `tests_run (GREEN)` | `node scripts/verify-local.cjs --stage <id> --subject green`, on the final candidate, with the platform (`platform`) | the stage-end publish | the stage end is refused when it is absent, for another subject, exited non-zero, or ran zero tests (required); a different tests' node (`runner.node`, the node the test command resolves through its own shell and PATH; the driver's node is `runner.driver_node` and is not compared) or lockfile than the RED is named as config_drift, never refused, and a tests' node that printed no version is named unknown, never a drift (observed evidence) | `tests_run.green.json`, committed |
| `lane_run` | `node scripts/verify-local.cjs --lane fast --stage <id>` on the final bytes: the lane, the verdict, the duration, the task counts, the subject | the stage-end publish, the pre-push hook, the ci workflow | the stage end is refused without a passing lane run for the candidate's subject; the push and ci refuse a stage commit whose lane run is not for that commit's subject or did not pass (required) | `lane_run.json`, committed; the local `.claude/verify-last-runs.jsonl` stays the diagnostic history |
| `channel_refused` | `scripts/channel.cjs` at every refusal it prints for publish, send, ack and pickup, and an ok row at each success | the stage-end publish (the unresolved set into `gate.json`) | an unresolved refusal refuses the stage end until a later success of the same verb or a `resolved:channel:<n> <why>` line in the packet resolves it | `.claude/channel/refusals.jsonl`, local; the summary in `gate.json` |
| `gate.json` | the stage-end publish, before the commit: the subject, the lifecycle, both probe rows, the judged and the refusals summaries, the hook's sha256, both test runs, the lane run, the approval archive's sha256, the measure line, the degraded list, the out-of-scope lines (`out_of_scope`); with `manifest.json` listing every record's sha256 and subject | the orchestrator at the stage end, the pre-commit, the ci workflow, the closeout, the verifier | the stage-end publish refuses when a required record above is missing or contradictory; the pre-commit refuses a stage commit without it; the closeout refuses a work stage whose `gate.json` is not accepted (required) | committed, one per stage; rewritten once by the orchestrator's accept, before the commit |
| `stage_cleared` | `node scripts/stage-active.cjs --clear`, as the lifecycle's `cleared` row | the next open, the closeout | the next stage refuses to open while an earlier stage's `gate.json` is accepted and its lifecycle has no `cleared` row | `lifecycle.jsonl`, committed by the record commit after the clear |

`node scripts/evidence.cjs --stage <id> --verify` re-hashes every file the manifest lists and resolves the manifest's subject against the tree of the commit that introduced the stage's `gate.json` (`--against index` before the commit), which is how a later reader checks a stage (observed evidence).

The verifier's calibration (G14) is not a record in this folder: the verifier writes its blind verdicts in its findings file (agent judgment), `node scripts/calibration-score.cjs`, run by the orchestrator, writes the `calibration` block bound to those verdicts by their sha256 (observed evidence), and `validators/validate-calibration.cjs` refuses a Sound findings file without that block, with verdicts changed after scoring, or with an FNR other than 0 (deterministic enforcement at the pre-commit).

One host, one runner adapter, one transport: Claude Code at 2.1.295 or later, the node --test reporter read by scripts/verify-local.cjs, and the stage commit; any other host, any other test runner (its RED is taken on its exit code with the labels unread, and the orchestrator judges whether the failures are the approved tests), an artifact store and a separate evidence ref are unsupported on this path.

On Windows a killed test process and a test file that fails to load both reach node --test as exit code 1 with no signal, so a RED there whose only failures are file-level is classified cancelled_or_load and the release refuses it, naming both readings (deterministic enforcement at the release): make the test fail by an assertion, or run the RED on a POSIX host. The records are checked against each other and against the commit, never against their author: anyone who can write the repository can rewrite a record together with its manifest hash and evidence.cjs --verify still passes, so a fabricated record is outside the local trust boundary this path claims (observed evidence, not proof of authorship).

The stage-end publish refuses a path changed since the approval's base that lies outside the stage's allowed set (the paths its section names in backticks, their twins, the red gate's test and document globs, the stage's measurements and the excluded prefixes) unless the packet carries an out-of-scope:<path> <why> line for it, and gate.json records each line as out_of_scope (deterministic enforcement at the stage-end publish); the check sees paths, never contents, so a call added inside a named file is invisible to it and stays the orchestrator's reading of the diff (agent judgment). `node scripts/evidence.cjs --stage <id> --review` prints a stage's records for the orchestrator's review before the stamp ask and writes nothing (observed evidence).

An ack counts only when the orchestrator's channel message it names is in the log with that sha256 (deterministic enforcement at the red gate and the stage-end publish); a role and a hash identify a message on this machine, not a person.
