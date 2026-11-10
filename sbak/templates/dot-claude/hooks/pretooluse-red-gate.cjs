#!/usr/bin/env node
// @kit-version 1.0.10
// .claude/hooks/pretooluse-red-gate.cjs
//
// PreToolUse hook (matcher Edit|Write|MultiEdit|NotebookEdit, and a second group with matcher
// Bash|PowerShell for the shell rules below - M32.1.B, M33.A). The HARD form of
// the per-stage TDD red-stop (PROC-001): it blocks an IMPLEMENTATION
// edit until the human has run /approve-red on the RED tests. It makes the third
// approval gate (plan -> RED -> stage-end) structural instead of prose a builder
// can blow past — which is exactly what happened in M09.A.
//
// THREE STATES, NEVER TWO (M34.A). Before it judges anything the hook establishes one state with
// its own probe (probeWalk and the strict marker reads below), which needs nothing but Node - not
// the resolver, whose absence is one of the faults it reports:
//   * confirmed inactive - a project root was found and .claude/stage-active is absent: allow,
//     say nothing. The resolver is not even loaded (a dormant gate never locks anyone out);
//   * active - .claude/stage-active holds a stage id: judged as below;
//   * unknown - no project root above the payload cwd or above the hook's own folder; a marker
//     that is a link of any kind (M34.1.A: read by the lstat of the path itself, never through it),
//     a directory, unreadable, empty, or (stage-active) not a stage id; a red-approved that is
//     one line beside the v2 approval record for the open stage (M34.2.A: the release writes two
//     lines); the resolver
//     (scripts/lib/hook-root.cjs) missing or throwing at load while a stage is open; a payload
//     that is not a JSON object, names no tool, or names an edit tool with no path; a throw
//     anywhere in the judgment. "Cannot establish that a stage exists" is never read as "no stage
//     exists": the unknown state is refused, edit tools and shell tools alike, with one line that
//     names the fault and the recovery (node scripts/kit-update.cjs --ready, then --adopt).
//
// THE DECISION ORDER (one order for the edit tools and the shell tools; the first match decides):
//   1. a repair invocation (REPAIR_EXACT), bare and alone in the call, run from the project root,
//      with scripts/kit-update.cjs AUTHENTICATED (below): allowed in every state, unknown included;
//   2. a write to a control target - hook-root CONTROL_FILES under .claude/ and CONTROL_PATHS (the
//      installed release manifest) - by an edit tool or by a recognised shell write construct (its
//      literal target, a directory pathspec holding one, or a glob that could expand to one):
//      refused in every state, .claude/settings.json included (M34.C: Phase 3 places it through
//      the kit-update --place-settings door, and the line names the door), and the read-first
//      lists .claude/read-first-list*.txt (M34.D: CONTROL_LIST_GLOB, placed through
//      --place-read-first);
//   3. the unknown state: refused. A repair invocation that failed its authentication is refused
//      with the human-path line instead, so the person learns the repair is theirs to run;
//   4. an open, unapproved work stage: the four conditions below, and for a shell tool the one
//      release rule, the same human-path refusal of an unauthenticated repair, and the shell write
//      gate (below);
//   5. approved, a stage opened by a verifier/orchestrator/refactor session, or confirmed
//      inactive: allowed, no output (the one release rule still judges a shell call in every known
//      state, as it always has). M34.C: an approved work stage's implementation edit stands only
//      while its approval does (below, THE APPROVAL RECORD).
//
// THE APPROVAL RECORD (M34.C, materiality case 3 and C1). The release writes the marker as the stage
// id and `record <sha256>` - the hash of the approval row it appended to .claude/channel/
// approval.json (probeRowHash, lockstep with scripts/lib/channel.cjs approvalRowHash). Before an
// implementation edit on an approved work stage the gate reads that record and hashes the files the
// approval named - those only - against their latest approved or acked sha256. A record missing or
// not matching the marker, a later approval the marker does not name, a void row, or a file missing,
// renamed or changed with no ack covering it: the approval is void, and the edit is refused with
// one line naming which ([red-gate] approval void - ...). A one-line marker is a legacy marker,
// judged as before only where no v2 record exists for the stage (R-92 R2); one line beside the v2
// record for the stage is the unknown state, its fault naming the clear (M34.2.A); a second line
// that is not a binding is the unknown state. After the human's void (approve-red --void) the marker
// is gone and the refusal names the void and its reason.
//
// Step 4 BLOCKS (exit 2) only when ALL FOUR positively confirm:
//   1. the stage was opened in `work` mode     (.claude/stage-role, written by stage-active.cjs
//                                               at open; absent -> engaged, see judge())
//   2. a stage is open                         (.claude/stage-active holds a stage id)
//   3. the open stage is NOT red-approved      (.claude/red-approved absent or != stage)
//   4. the target is an IMPLEMENTATION path    (not a test / doc / .claude / allow-listed path)
//      — OR a path OUTSIDE the repo that is in none of the scratch homes (below)
// Test paths, docs/, retrospectives/, .claude/ (minus the control set), root-level repo config
// (.gitignore, .gitattributes, .editorconfig) and the scratch homes all proceed — the builder MUST
// be able to write the failing tests and fill the retro before approval.
//
// THE REPAIR EXEMPTION IS AUTHENTICATED (M34.A). A repair command (kit-update --ready, --adopt,
// --adopt --dry-run, --migrate with its documented flags) restores the control files without
// switching the protection off - but only the script the installer verified may run through it.
// Before the exemption applies the hook hashes scripts/kit-update.cjs and
// sbak/templates/scripts/kit-update.cjs with the manifest's rule (payloadHash below, the same
// function as build-release's payloadSha256: sha256 over the bytes with CRLF read as LF) and
// compares both to sbak/release-manifest.json payload["sbak/templates/scripts/kit-update.cjs"] -
// the map build-release writes and the installer checked against the ZIP's pinned sha256. Either
// differs, or the manifest is absent, unparseable or carries no payload map: no exemption, never
// trust. The kit's own workshop checkout tracks a release-manifest.json with no payload map, so
// there the exemption never applies and the recovery is the person's own terminal.
// sbak/release-manifest.json is a control path, so the reference cannot be edited into agreement.
//
// ESSENTIAL AND OPTIONAL (M34.A). The gate is essential: on its own fault it stops, with the
// unknown line. Reporting and liveness are optional and degrade instead: the receipts adapter
// keeps its one exit (0) and no stdout, the bell is a printed line, and the mode-check keeps its
// own policy on a root it cannot find (the KF-62 class: a hook that cannot find a repo must not
// lock the person out). The red gate alone refuses.
//
// THE EVIDENCE PATH (M34.6.B, R-139). Fail-soft is reversed for the seven required evidence records
// and nothing else: stage_opened, gate_probed liveness, red_approved, tests_run RED, tests_run GREEN,
// lane_run and gate.json, with stage_cleared checked at the next open. When one of them cannot be
// written its writer refuses, and the boundary that reads it refuses when it is absent or
// contradictory (deterministic enforcement at stage-active, the release, the stage-end publish, the
// pre-commit and the closeout check); every other record keeps the M34 stage A rule: written when
// possible, instrumentation_degraded when not, never a refusal (observed evidence, diagnostic).
// This hook writes none of the seven. It writes gate_judged, a diagnostic row per judged call (a
// stage open, or the state unknown; a confirmed-inactive call writes nothing) to the session's
// receipts ledger through the receipts sink: the state, the verdict, the refusal's class (read from
// the line printed), the tool's category, the target as target_ref (the read ledger's refFor over
// its canonical form, never a path), and the identity - the host's tool_use_id when the hook input
// carries one (coverage host_id), else hook_seq, a counter under .claude/receipts/ (coverage
// hook_seq, which identifies a row and claims no coverage). The verdict is fixed before the write,
// the write is fail-soft, and the decision never waits on it. On a stage on the evidence path an ack
// row in the approval record folds only when the orchestrator's channel message it names is in the
// log with that sha256; a role and a hash identify a message on this machine, not a person.
//
// THE ROLE IS THE ONE RECORDED AT STAGE OPEN (M33.A, R-50 a): the live .claude/role is a file an
// edit tool could flip, and a flip to verifier used to stand the gate down. The gate now reads
// .claude/stage-role, which stage-active.cjs writes beside stage-active; both are in the control
// set. A tree whose stage opened before stage-role existed has no such file, and then the gate
// ENGAGES whatever the live role says (fail closed), never stands down.
//
// OUTSIDE THE REPO (M32.H, proposals/M32-FIELD-REPAIR.md §3.7, ruling R-15 plus the gate-1
// refinement): a path that resolves outside the repo root never reaches the allow globs (the
// `**/*.md` glob used to match a `../`-escaped path). Only the scratch homes pass: the session
// scratchpad tree (<tmpdir>/claude/), the durable stage scratch (<repo>/.claude/measurements/),
// and Claude Code's own memory and plan folders (~/.claude/projects/, ~/.claude/plans/). Every
// other outside-repo path is BLOCKED with a message naming them. The rest of ~/.claude/ stays
// blocked on purpose: its settings.json can switch every hook off. The control-file carve still
// runs first.
//
// WHICH REPO (M32.1.B, V-2; R-36, the §3.1 deviation that supersedes R-28 cwd-first for this
// gate): an ABSOLUTE tool path is judged by the repo above the target itself - from a sibling
// repo's shell the session's own repo has no stage, and the gate went dormant for an edit into
// the stage repo, red-approved included. The session's repo is STILL judged too, with its own
// markers (gate-1 Q1): it is what keeps an outside-repo path blocked when that path's own root (a
// home kept in git, a stray ancestor .git) has no stage. Either one blocking blocks, and either
// one unknown is unknown. A new file reached through a link is judged by its real parent
// (probeRealForm, realOrLexical, V-3) for the carve, the homes and the repo boundary.
//
// THE ONE RELEASE RULE (M32.1.B, R-35 c): a shell command that names approve-red.cjs runs only as
// the bare release command, whitespace-normalized and alone (M33.A, V-17: a PowerShell tool call's
// command string is judged by the same rules, unchanged; Claude Code documents its payload as
// tool_input.command, the Bash field) -
//   node scripts/approve-red.cjs --stage <id> --release-seq <n>     (n: digits, or none)
//   node scripts/approve-red.cjs --stage <id> --void --reason "<text>"   (M34.C: the un-approve)
// - so the permission prompt the human clicks shows the stage and the seq, and nothing rides
// in front of it or after it (the drive's `; echo "exit=$?"`). The form check is no shell parser;
// a name spelled with a quoted part or an escaped character names it too (M34.6.J), read in each word
// the tool's lexer reads and in the text with its escapes removed; any other form is refused in one
// line, except, under the Bash tool, one read-only command (M32.1.C, V-15: a listed
// verb first and no separator, substitution or redirect; M34.6.I, R11: and no parenthesis or brace
// outside quotes, read by the shell write gate's lexer for the tool the call names, since
// PowerShell runs a command inside a grouping, an array subexpression or a script block in
// argument position - see plainRead). A word with a glob character that could expand to the
// release script names it too (M34.B).
//
// THE GATE'S OWN SCRIPTS (M34.6.G). The same rule holds for the script that opens and clears the
// gate: a shell command that names stage-active.cjs, or carries a glob that could expand to it, runs
// only as one of its bare forms, whitespace-normalized and alone in the call (node
// scripts/stage-active.cjs <stage id>, node scripts/stage-active.cjs --clear, node
// scripts/stage-active.cjs --clear --tree <path>), so under the Bash tool the ask rule that
// outranks any allow matches every form that runs (deterministic enforcement, at PreToolUse where
// Claude Code runs this hook). The kit sets no ask rule for Claude Code's PowerShell tool, on
// automatically on Windows without Git Bash, opt-in elsewhere (CLAUDE_CODE_USE_POWERSHELL_TOOL=1)
// and off on Windows with Git Bash while the kit's Bash deny rules stand unless that variable is
// set; under it a command that names either script or one of the gate's control files runs only in a
// bare form, with no read-only exemption (the name guard, M34.6.J), and the scripts' own click holds
// (deterministic enforcement). Under it the bare forms are the gate scripts' and the two hook commands
// the kit prints, each exact and alone in the call (node .claude/hooks/session-start-read-first.cjs
// --check and node scripts/kit-update.cjs --apply .claude/hooks/receipts-lifecycle.cjs; M34.6.K, V5-G2).
// Any other form is refused in one line naming them, and under the Bash
// tool the read-only commands above, by the same guard (plainRead), are not judged. The click the release, the void and the clear need from a session is the scripts' own
// check (scripts/lib/receipts.cjs recordedClick), not this hook's. A wrapper, a script that names
// either gate script inside a file, is not judged: it is on the list below of what is not judged.
//
// THE SHELL WRITE GATE (M34.B). A shell command (Bash or PowerShell, one parser for both) is read
// for these write constructs, every one in the call (`;`, `&&`, `||`, `|`, `&` and newlines
// separate commands; one refusal refuses the call):
//   * the redirects >, >>, >|, &>, &>>, n>, n>>, *> and *>> (not targets: /dev/null, nul, $null,
//     /dev/stdout, /dev/stderr, /dev/tty, /dev/fd/N, &N), a heredoc's redirect among them;
//   * tee and tee -a (every operand), and Tee-Object (-FilePath, -LiteralPath or positional);
//   * sed -i / --in-place and perl -i (the file operands); cp, mv and install (the last operand
//     or -t; a directory target lands each source at <dir>/<name>);
//   * node -e / --eval, node -p / --print / -pe (M34.2.A), python -c and python3 -c whose text
//     carries writeFileSync, writeFile(, appendFileSync, open( with a write mode, or .write_text(
//     (the call's first argument when it is one whole string literal);
//   * truncate and Clear-Content (clc), which rewrite a file's bytes (M34.2.A): their operands are
//     write targets as well as victims (below);
//   * Set-Content, Add-Content, Out-File, New-Item (not -ItemType Directory), Copy-Item, Move-Item
//     (-Path, -FilePath, -LiteralPath, -Destination or positional) and [IO.File]::WriteAllText;
//   * git apply <patch> (the patch's --- a/ and +++ b/ paths, read from a patch inside the repo or
//     a scratch home), git restore <pathspec> (not --staged alone), git checkout -- <pathspec>,
//     and git checkout <operand> when the operand is an existing file.
// NESTED (M34.1.A, V-3): each construct is judged wherever the call nests it, by the same lexer,
// recursive, to depth 8 - inside the body of $(...), a backtick pair (Bash), <(...) and >(...); a
// PowerShell script block { ... }, $(...) and @(...); and the literal text of bash -c, sh -c,
// zsh -c, eval, pwsh -c (or -Command) and powershell -c (or -Command). Under Bash (M34.2.A, V-5)
// the same holds for the $(...) and backtick spans inside an unquoted heredoc body (<<EOF, <<-EOF;
// a quoted delimiter, <<'EOF', <<"EOF" or <<\EOF, is text, never read), inside an arithmetic
// expansion $((...)) or $[...], and inside a parameter expansion ${...}; and a case arm written
// pat) inside a body closes nothing (a case ... esac takes its arms, so the body ends where bash
// ends it). At command position the prefixes if, then, elif, else, do, while, until, {, !, time,
// command, builtin, exec, nohup, sudo, doas, timeout (with its duration), nice, setsid, env (with
// its options and NAME=value operands), function NAME, NAME () and a leading NAME=value move the
// command word right (PowerShell: $var = and a [type] cast too); a for, select or case list is
// text, and a case arm's pattern is skipped. A body nested past depth 8, one never closed (a span
// with no close, an unclosed $(( or ${), or a wrapper whose text is not a literal (bash -c "$CMD",
// eval $x, pwsh -EncodedCommand) is refused at step 4 while the stage is engaged, with the body
// line, never allowed by default.
// DELETIONS AND MOVES (M34.1.A, V-4): rm, rmdir, unlink, shred, truncate, git rm, git clean with -x
// or -X, git stash (bare, push or save) with -a or --all (M34.2.A, Y-14: both remove the ignored
// files, the markers among them), the sources of mv, rename and git mv, Remove-Item (del, ri, rm,
// rmdir, rd, erase), Move-Item's sources (mv, mi, move), Rename-Item (ren, rni), Clear-Content
// (clc), [IO.File]::Delete and ::Move, [IO.Directory]::Delete, and in node -e text rmSync,
// unlinkSync, renameSync, rmdirSync, rm, unlink, rename and rmdir with a literal argument: each
// victim is judged by the carve at step 2 in every state - a control file, a folder holding one
// (rm -rf .claude), a glob that could reach one - and its line names the person's terminal, since
// no state allows it; a victim that is not a control target is not judged. A dry run (git clean
// -n, git rm -n, git mv -n) removes nothing and is not judged. A victim with no path operand is
// one the gate cannot read (M34.2.A, V-6): a PowerShell removal or move fed from the pipeline
// (Get-Item ... | Remove-Item, ls .claude | rm; under the PowerShell reading mv is Move-Item), and
// a removal, move or write verb xargs carries (ls .claude | xargs rm), its operands arriving on
// xargs's input.
// The tokenizer honours single and double quotes (a quoted > is text), skips a quoted heredoc body
// and comments, and resolves a relative target against the payload cwd moved by a literal cd in the
// same call (Git Bash's /c/... and ~ read as paths). Under tool_name Bash an unquoted backslash
// escapes the next character (docs/a\ b is the folder "a b"); under PowerShell a backslash is a
// path character and a backtick escapes, and a cmdlet's operands keep that reading under either
// tool name. M34.6.J: under PowerShell the lexer follows PowerShell's written rules - the quote
// characters of each class (the typographic ones too), a doubled quote and the backtick as the
// escapes, no backslash escape or line continuation, here-strings and their bodies, braced variables,
// block comments, its white space and a lone CR, a > or < inside a bare word as text and a > where a
// token starts as a redirect (M34.6.K: after a quote's or a here-string's close, a body, or a stream
// number; about_Parsing), the stop-parsing token's line as literal text that is still judged
// as a command list (M34.6.K), and a parenthesis as
// a grouping - and real PowerShell checks that reading on a corpus wherever pwsh is installed (the
// differential pin, M34.6.J). A literal target goes through the edit tools' own path rule (probeControl at step 2,
// judge() at step 4: the carve, the scratch homes, the repo boundary, the allow globs). A target
// the gate cannot read - a variable, a glob, a substitution, or none - is refused at step 4 with
// the construct named, never allowed by default.
// NOT JUDGED, said plainly: a command with no recognised write construct - every script and
// program run (node scripts/*.cjs, npm test, the lanes, git commit, git add, make, npx); test and
// build runs writing under their own output folders; an interpreter that writes without the path
// in the command text (a script file that writes, a script fed on stdin) or through a call not on
// the list (copyFileSync, createWriteStream, write_bytes, WriteAllLines, and python -c removals
// such as os.remove or shutil.rmtree); aliases (a shell alias, PowerShell aliases such as ac or
// ni); the wrappers the gate does not read (env -S, xargs carrying any other command, find -exec,
// coproc, cmd /c, Invoke-Expression and iex, a shell other than bash, sh and zsh); the writers and
// removers on no list (ln, dd of=, find -delete, npx rimraf, a .NET method on an object such as
// (Get-Item ...).Delete() - M34.2.A, G-16); the git commands that write implementation from
// elsewhere (git merge, git cherry-pick, git pull, git stash pop and apply, git reset --hard, git
// switch, git checkout <branch or directory> without --); and a relative target is resolved
// against the payload cwd, so a shell working folder carried over from an earlier call that
// differs from it is not seen. A deletion or move whose victim the gate cannot read (rm $F) is
// refused while a stage is engaged and allowed when confirmed inactive or approved, the same as a
// wrapper whose text is not a literal. The two gate scripts' form rule (above) does not judge, under
// the Bash tool, one read-only command that names either one; a parenthesis or brace outside quotes,
// by the tool's own reading, makes a command no read (M34.6.I); under the PowerShell tool no
// read-only command naming either one is exempt (M34.6.J). A command parser is not a sandbox: the
// recognised list is the whole control.
//
// HONEST SCOPE. This is a PROCESS gate, not a security boundary:
//   * a hook that cannot START (the file deleted, node absent, a syntax error, a hang) is outside
//     its own reach, and the host decides (M34.D, M34.1.A): on Claude Code 2.1.295 and above, with
//     "onFailure": "block" on the red gate's registrations, a hook that cannot start,
//     exits other than 0 or 2, or times out blocks the call; below that floor the call runs, and
//     the readiness cli row (kit-update --ready) says which the project has. The state probe
//     covers every fault the running hook can see; the stdin read is BOUNDED so a never-closing or
//     oversized stream cannot hang the edit path.
//   * it matches the edit TOOLS and the shell write constructs above; a shell command outside the
//     recognised list (the NOT JUDGED list) passes. It is a bar-raise, not a wall. The control
//     set's second layer (M33.A) is the Edit(...) deny rules in settings.json: they hold outside a
//     stage too, and reach recognized Bash file commands and redirect targets, but not a script
//     that writes a file itself.
//   * it stops implement-before-red; it does NOT catch test-deletion or
//     test-weakening (the documented AI-TDD failure mode). It is effective ONLY
//     paired with the human red-review + mutation-kill. Claim no more.
//
// Cross-platform (Node, no shell-isms). Dependency-free.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BLOCK = 2; // PreToolUse contract: exit 2 blocks the tool call.
const ALLOW = 0; // exit 0 allows it. (Any other exit is a failure: "onFailure": "block" makes it block.)

// THE REPO-ROOT RESOLVER (M32.A, §3.1): scripts/lib/hook-root.cjs carries the full judgment's path
// helpers (realOrLexical, the control list) - loaded INSIDE main() and only once a stage is known
// to be open: a missing resolver is then the unknown state, refused; with no stage open it is not
// needed and not loaded. At module level a throw would escape every handler.
let hookRoot = null;

// ---- the state probe (M34.A): self-contained, so the state test survives the resolver's absence.
// Deliberate copies of hook-root's walk, real form, byte decode and control list, under their own
// names; the lockstep pins bind each copy to hook-root's (and payloadHash to build-release's).
const PROBE_MAX_BYTES = 8 * 1024 * 1024; // one tool call is far below this; it only guards the stream
const PROBE_CONTROL_FILES = ['settings.json', 'settings.local.json', 'role', 'stage-active', 'stage-role', 'red-approved', 'red-gate-allow.txt', 'hooks'];
const PROBE_CONTROL_LIST_GLOB = 'read-first-list*.txt'; // M34.D: the read-first lists, hook-root CONTROL_LIST_GLOB
const PROBE_CONTROL_FILE_RE = new RegExp('^' + PROBE_CONTROL_LIST_GLOB.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
const PROBE_CONTROL_PATHS = ['sbak/release-manifest.json'];
const STAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHELL_TOOLS = /^(?:Bash|PowerShell)$/;
const EDIT_TOOLS = /^(?:Edit|Write|MultiEdit|NotebookEdit)$/;
const NUL = String.fromCharCode(0);

function probeDecode(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
}
// The payload, read up to the cap and no further: { text, over }. A TTY yields ''.
function probeStdin() {
  if (process.stdin.isTTY) return { text: '', over: false };
  const buf = Buffer.allocUnsafe(65536);
  const out = [];
  let total = 0;
  const deadline = Date.now() + 10000;
  for (;;) {
    let n;
    try {
      n = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e && e.code === 'EAGAIN' && Date.now() < deadline) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); continue; }
      break; // EOF (win32 throws it) or unreadable: what was read is the payload
    }
    if (n === 0) break;
    total += n;
    if (total > PROBE_MAX_BYTES) return { text: '', over: true };
    out.push(Buffer.from(buf.subarray(0, n)));
  }
  return { text: probeDecode(Buffer.concat(out)), over: false };
}
function probeCwd() {
  try { return process.cwd(); } catch (_) { return null; }
}
function probeSame(a, b) {
  const x = path.resolve(a); const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function probeIsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}
function probeHasGit(dir) {
  try { const st = fs.statSync(path.join(dir, '.git')); return st.isDirectory() || st.isFile(); } catch (_) { return false; }
}
function probeHasControl(dir) {
  let home = null;
  try { home = os.homedir(); } catch (_) { home = null; }
  if (typeof home === 'string' && home !== '' && probeSame(dir, home)) return false; // ~/.claude is the user config
  const claudeDir = path.join(dir, '.claude');
  if (!probeIsDir(claudeDir)) return false;
  let names;
  try { names = fs.readdirSync(claudeDir); } catch (_) { return false; }
  return names.some((n) => PROBE_CONTROL_FILES.indexOf(n) !== -1 || PROBE_CONTROL_FILE_RE.test(n));
}
// The nearest directory holding `.git` (a directory or a worktree file) or a `.claude/` with a
// control file, never climbing into a GIT_CEILING_DIRECTORIES entry; null when there is none.
function probeWalk(start) {
  if (typeof start !== 'string' || !start) return null;
  let dir = path.resolve(start);
  const raw = process.env.GIT_CEILING_DIRECTORIES;
  const stops = typeof raw === 'string' && raw ? raw.split(path.delimiter).map((s) => s.trim()).filter(Boolean) : [];
  for (let guard = 0; guard < 256; guard++) {
    if (probeHasControl(dir) || probeHasGit(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    if (stops.some((c) => probeSame(c, parent))) return null;
    dir = parent;
  }
  return null;
}
// The realpath where the target exists; else the realpath of its nearest existing ancestor with the
// rest re-appended; lexical only when nothing on the way resolves.
function probeRealForm(p) {
  const abs = path.resolve(p);
  try { return fs.realpathSync(abs); } catch (_) { /* not there yet: climb */ }
  const rest = [];
  let dir = abs;
  for (let guard = 0; guard < 256; guard++) {
    const parent = path.dirname(dir);
    if (parent === dir) return abs;
    rest.unshift(path.basename(dir));
    dir = parent;
    try { return path.join(fs.realpathSync(dir), ...rest); } catch (_) { /* keep climbing */ }
  }
  return abs;
}
// A marker, read strictly: { absent } | { value } | { fault }. Absent is the only quiet answer, and
// only from the lstat of the path itself (M34.1.A, V-1): a symbolic link or a junction there is a
// fault whatever it points to - the kit writes regular files at these paths, and a read through a
// link whose target is gone used to come back ENOENT, read as no stage.
function probeMarker(root, name) {
  const p = path.join(root, '.claude', name);
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return { absent: true };
    return { fault: `.claude/${name} is unreadable (${(e && e.code) || 'lstat failed'})` };
  }
  if (st.isSymbolicLink()) return { fault: `.claude/${name} is a link` };
  if (st.isDirectory()) return { fault: `.claude/${name} is a directory` };
  if (!st.isFile()) return { fault: `.claude/${name} is not a regular file` };
  let b;
  try { b = fs.readFileSync(p); } catch (e) { return { fault: `.claude/${name} is unreadable (${(e && e.code) || 'read failed'})` }; }
  const v = probeDecode(b).split(NUL).join('').trim();
  return v ? { value: v } : { fault: `.claude/${name} is empty` };
}
// One root's state: { kind: 'inactive' } | { kind: 'active', stage, role, approved } | { kind: 'unknown', fault }.
// A garbage stage-role is not a fault: judge() reads it as unresolved and engages (DF-005).
function probeState(root) {
  const sa = probeMarker(root, 'stage-active');
  if (sa.absent) return { kind: 'inactive' };
  if (sa.fault) return { kind: 'unknown', fault: sa.fault };
  if (!STAGE_ID.test(sa.value)) return { kind: 'unknown', fault: '.claude/stage-active does not hold a stage id' };
  const sr = probeMarker(root, 'stage-role');
  if (sr.fault) return { kind: 'unknown', fault: sr.fault };
  const ra = probeMarker(root, 'red-approved');
  if (ra.fault) return { kind: 'unknown', fault: ra.fault };
  // M34.C (C1): the marker is the stage id, then `record <sha256 of the approval row>` binding the
  // approval record. One line is a legacy marker (judged as before); any other second line is a fault.
  let approved = null; let binding = null;
  if (!ra.absent) {
    const parts = ra.value.split(/\r?\n/).map((l) => l.trim());
    if (parts.length > 2 || (parts.length === 2 && !/^record [0-9a-f]{64}$/.test(parts[1]))) return { kind: 'unknown', fault: '.claude/red-approved carries a second line that is not "record <sha256>"' };
    approved = parts[0];
    binding = parts.length === 2 ? parts[1].slice(7) : null;
  }
  // M34.2.A (Y-12): a release beside a v2 record writes the two-line marker, so a one-line marker for
  // the open stage beside a v2 record for it is the unknown state - never the legacy approval, which
  // stands only where no v2 record exists for the stage (R-92 R2).
  if (approved === sa.value && binding === null) {
    const rec = readRecord(root);
    if (rec && rec.v === 2 && rec.stage === sa.value) return { kind: 'unknown', fault: `.claude/red-approved is one line beside the v2 approval record for stage ${sa.value}; clear it from your own terminal (node scripts/stage-active.cjs --clear)` };
  }
  return { kind: 'active', stage: sa.value, role: sr.absent ? null : sr.value, approved, binding };
}
// The control-file carve (decision-order step 2), judged by the probe alone so it binds in every
// state: the path relative to each root, in its lexical and its real form, dot-dot-normalized and
// lowercased (the Windows FS is case-insensitive; over-blocking an odd-cased path on a
// case-sensitive FS is the fail-closed direction). `hooks` is a directory, matched as a prefix.
// -> the control target's repo-relative form, or null.
function probeIsControl(rel) {
  const p = rel.toLowerCase();
  return PROBE_CONTROL_FILES.some((n) => p === '.claude/' + n || p.startsWith('.claude/' + n + '/'))
    || PROBE_CONTROL_PATHS.some((c) => p === c)
    || (p.startsWith('.claude/') && p.indexOf('/', 8) === -1 && PROBE_CONTROL_FILE_RE.test(p.slice(8)));
}
function probeControl(rawPath, roots) {
  for (const r of roots) {
    if (!r) continue;
    const abs = path.resolve(r, rawPath);
    for (const rel of [path.relative(r, abs), path.relative(probeRealForm(r), probeRealForm(abs))]) {
      const n = normRel(path.normalize(rel));
      // On win32 an odd-cased spelling is the same file: the line names the control file itself
      // (M34.1.A). Elsewhere it is another file, refused fail-closed under the spelling given.
      if (probeIsControl(n)) return process.platform === 'win32' ? n.toLowerCase() : n;
    }
  }
  return null;
}
// The manifest's hashing rule, byte-exact: build-release.cjs payloadSha256 (latin1, CRLF as LF).
function payloadHash(buf) {
  return crypto.createHash('sha256').update(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');
}
// The approval row's binding hash (M34.C, C1): scripts/lib/channel.cjs approvalRowHash, byte-exact
// (sha256 over the row with every object's keys sorted, arrays in order, values as JSON), kept here
// so the check needs nothing but Node; the lockstep pin binds the two.
function probeCanon(v) {
  if (Array.isArray(v)) return `[${v.map(probeCanon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${probeCanon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function probeRowHash(row) { return crypto.createHash('sha256').update(probeCanon(row), 'utf8').digest('hex'); }

// ---- the approval record (M34.C): case 3 at the gate, the binding, the void ----
// On an approved work stage, before an implementation edit, the gate reads the record the marker
// binds and hashes the record's files - those only, a few small reads - against the latest bytes the
// approval or an ack after it names. -> null (the approval stands) or the one void line.
// A legacy one-line marker is judged as before (no record check).
function readRecord(root) {
  try { const j = JSON.parse(probeDecode(fs.readFileSync(path.join(root, '.claude', 'channel', 'approval.json')))); return j && typeof j === 'object' ? j : null; } catch (_) { return null; }
}
function voidReason(reasonText) { return oneLine(reasonText).slice(0, 200); }
// M34.6.B (item 10): on a stage on the evidence path (its lifecycle carries an opened row) an ack row
// folds only when the orchestrator's channel row it names is in the log with that sha256, kind ack,
// answering the amendment's seq; each log row's body is re-hashed first. Lockstep with
// scripts/lib/channel.cjs ackBoundFor.
function evidencePath(root, stage) {
  try {
    return probeDecode(fs.readFileSync(path.join(root, '.claude', 'evidence', stage, 'lifecycle.jsonl'))).split('\n')
      .some((l) => { try { const j = JSON.parse(l); return !!j && j.row === 'opened' && j.stage === stage; } catch (_) { return false; } });
  } catch (_) { return false; }
}
function orchMessages(root) {
  const out = new Map();
  try {
    for (const l of probeDecode(fs.readFileSync(path.join(root, '.claude', 'channel', 'orch-to-builder.jsonl'))).split('\n')) {
      if (!l.trim()) continue;
      let m = null; try { m = JSON.parse(l); } catch (_) { continue; }
      if (m && Number.isInteger(m.seq) && typeof m.body === 'string' && m.hash === 'sha256:' + crypto.createHash('sha256').update(Buffer.from(m.body, 'utf8')).digest('hex')) out.set(m.seq, m);
    }
  } catch (_) { /* no log: no ack is bound */ }
  return out;
}
const ackBound = (msgs, r) => { if (!Number.isInteger(r.message_seq) || typeof r.message_sha256 !== 'string') return false; const m = msgs.get(r.message_seq); return !!m && m.hash === r.message_sha256 && m.kind === 'ack' && m.reply_to === r.seq; };
function approvalVoidLine(root, st) {
  if (!st.binding) return null;
  const bindingLine = `[red-gate] approval void - the approval record for stage ${st.stage} is missing or does not match the marker; the owner runs /approve-red\n`;
  const rec = readRecord(root);
  if (!rec || rec.v !== 2 || rec.stage !== st.stage || !Array.isArray(rec.rows)) return bindingLine;
  const idx = rec.rows.findIndex((r) => r && r.kind === 'approval' && probeRowHash(r) === st.binding);
  if (idx === -1) return bindingLine;
  const latest = new Map((Array.isArray(rec.rows[idx].files) ? rec.rows[idx].files : []).map((f) => [String(f.path), f.sha256]));
  const bound = evidencePath(root, st.stage) ? orchMessages(root) : null;
  for (const r of rec.rows.slice(idx + 1)) {
    if (!r) continue;
    if (r.kind === 'approval') return bindingLine; // a later approval the marker does not name
    if (r.kind === 'void') return `[red-gate] approval void - stage ${st.stage}'s RED approval was voided (${voidReason(r.reason)}); the owner runs /approve-red\n`;
    if (r.kind === 'ack' && (!bound || ackBound(bound, r))) for (const f of Array.isArray(r.files) ? r.files : []) latest.set(String(f.path), f.sha256);
  }
  for (const [rel, sha] of latest) {
    let now = null;
    try { now = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, ...rel.split('/')))).digest('hex'); } catch (_) { now = null; }
    if (now === null || now !== sha) return `[red-gate] approval void - ${rel} changed since the RED approval and no ack covers it; the owner runs /approve-red (an amendment inside an approved file is acked by the orchestrator)\n`;
  }
  return null;
}
// After the human's void the marker is gone and the gate engaged; the refusal names the void.
function explicitVoidLine(root, st) {
  const rec = readRecord(root);
  if (!rec || rec.v !== 2 || rec.stage !== st.stage || !Array.isArray(rec.rows) || !rec.rows.length) return null;
  const last = rec.rows[rec.rows.length - 1];
  return last && last.kind === 'void' ? `[red-gate] approval void - stage ${st.stage}'s RED approval was voided (${voidReason(last.reason)}); the owner runs /approve-red\n` : null;
}

// ---- the repair exemption (decision-order step 1) ----
// The exact bare forms, whitespace-normalized and alone in the call (COMPOUND refuses an appended
// command, a redirect, a substitution, a newline): --ready, --adopt, --adopt --dry-run, and
// --migrate followed only by its documented flags (--pin <version>, --base/--kit/--release <one
// plain token>, --apply-all).
const REPAIR_EXACT = /^node scripts\/kit-update\.cjs (?:--ready|--adopt|--adopt --dry-run|--migrate(?: (?:--pin \d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?|--(?:base|kit|release) [A-Za-z0-9._/\\:@+][A-Za-z0-9._/\\:@+-]*|--apply-all))*)$/;
const REPAIR_KEY = 'sbak/templates/scripts/kit-update.cjs';
function repairForm(command) {
  if (typeof command !== 'string' || COMPOUND.test(command)) return false;
  return REPAIR_EXACT.test(command.trim().split(/\s+/).join(' '));
}
// Both copies of the script hash to the installed release's entry -> null (authentic); otherwise the
// cause (M34.1.A, G-13): 'nomap' - the manifest absent, unparseable, or carrying no payload entry for
// the script; 'hash' - a copy missing or its hash different.
function repairCause(root) {
  let man = null;
  try { man = JSON.parse(probeDecode(fs.readFileSync(path.join(root, 'sbak', 'release-manifest.json')))); } catch (_) { return 'nomap'; }
  const want = man && man.payload && typeof man.payload === 'object' ? man.payload[REPAIR_KEY] : null;
  if (typeof want !== 'string' || !/^[0-9a-f]{64}$/.test(want)) return 'nomap';
  for (const rel of ['scripts/kit-update.cjs', REPAIR_KEY]) {
    let buf;
    try { buf = fs.readFileSync(path.join(root, ...rel.split('/'))); } catch (_) { return 'hash'; }
    if (payloadHash(buf) !== want) return 'hash';
  }
  return null;
}

// ---- the refusal lines ----
function oneLine(x) {
  return String(x === undefined || x === null ? 'an unnamed error' : x).replace(/\s+/g, ' ').trim().slice(0, 300).replace(/\.+$/, '');
}
function unknownLine(fault) {
  return `[red-gate] REFUSED - state unknown: ${oneLine(fault)}. Recovery: node scripts/kit-update.cjs --ready, then --adopt; if this call is refused, run them from your own terminal.\n`;
}
// The human path, by its cause (M34.1.A, G-13): the line names the hash only when it was measured.
const HUMAN_PATH_LINES = {
  hash: '[red-gate] REFUSED - scripts/kit-update.cjs does not match the installed release\'s hash, so the agent may not run the repair; run it from your own terminal, or re-run the installer, which re-verifies the payload.\n',
  nomap: '[red-gate] REFUSED - the installed release carries no payload map, so the agent may not run the repair; run it from your own terminal, or re-run the installer, which re-verifies the payload.\n',
};
function controlLine(rel, construct, removal) {
  // M34.C: settings.json has a door - the kit's script validates a filled copy and places it.
  // M34.D: so do the read-first lists - the same script shape, a staged list checked and placed.
  if (/^\.claude\/[^/]+$/i.test(rel) && PROBE_CONTROL_FILE_RE.test(rel.slice(8).toLowerCase())) return `[red-gate] REFUSED - '${rel}' is a red-gate control file, not writable by an edit tool${construct ? ` or a shell write (${construct})` : ''}; place a staged copy with node scripts/kit-update.cjs --place-read-first <role> <staged list>.\n`;
  if (rel.toLowerCase() === '.claude/settings.json') return `[red-gate] REFUSED - '${rel}' is a red-gate control file, not writable by an edit tool${construct ? ` or a shell write (${construct})` : ''}; place a filled copy with node scripts/kit-update.cjs --place-settings <filled-file>.\n`;
  // M34.2.A (G-18): a removal or a move of a control file is refused in every state, approved
  // included, so its line names the person's terminal, never the release.
  if (removal) return `[red-gate] REFUSED - '${rel}' is a red-gate control file, not writable by an edit tool or a shell write (${construct}); removing or moving it is refused in every state; the kit's scripts do it from your own terminal (a stage's markers: node scripts/stage-active.cjs --clear).\n`;
  return `[red-gate] REFUSED - '${rel}' is a red-gate control file, not writable by an edit tool${construct ? ` or a shell write (${construct})` : ''}; the kit's scripts write it (the release is /approve-red, or: node scripts/approve-red.cjs --stage <id> --release-seq <n>).\n`;
}
function unreadLine(construct, token) {
  return `[red-gate] REFUSED - ${construct} writes to a target the gate cannot read ('${String(token).replace(/\s+/g, ' ').slice(0, 200)}'); name the file, or run the write after /approve-red.\n`;
}
// M34.1.A (V-3): a body the lexer cannot read - nested past BODY_DEPTH, never closed, or a wrapper
// whose text is not a literal - refused while a stage is engaged.
function bodyLine(token) {
  return `[red-gate] REFUSED - a command body the gate cannot read ('${String(token).replace(/\s+/g, ' ').slice(0, 200)}'); write it flat, or run it after /approve-red.\n`;
}
function refuse(line) {
  process.stderr.write(line);
  judgedRow('refuse', line);
  process.exit(BLOCK);
}
function allow() {
  judgedRow('allow', null);
  process.exit(ALLOW);
}

// ---- the judgment row (M34.6.B item 7): diagnostic, fail-soft, after the verdict is fixed ----
// JUDGED is filled by main() as the call is read; a refusal before the state is known is the unknown
// state, and a call with no project root writes nothing (there is no ledger to write to).
const JUDGED = { root: null, payload: null, tool: '', target: null, st: null, fault: false };
function classOf(line) {
  const l = String(line || '');
  if (l.indexOf('[red-gate] REFUSED - state unknown') === 0) return 'unknown';
  if (Object.keys(HUMAN_PATH_LINES).some((k) => HUMAN_PATH_LINES[k] === l)) return 'human-path';
  if (/^\[red-gate\] REFUSED - '[^']*' is a red-gate control file/.test(l)) return 'control';
  if (l.indexOf('[red-gate] REFUSED - the release command') === 0) return 'release-form';
  if (/^\[red-gate\] REFUSED - (?:.* writes to a target the gate cannot read|a command body the gate cannot read)/.test(l)) return 'unreadable';
  if (/^\[red-gate\] Implementation edit /.test(l)) return 'implementation';
  if (/^\[red-gate\] Outside-repo edit /.test(l)) return 'outside';
  if (l.indexOf('[red-gate] approval void') === 0) return 'void';
  return 'other';
}
// The read ledger's refFor (sha256 over 'sbak-read:' and the canonical form, 16 hex) over the
// target's repo-relative real form, lowercased; a target outside the repo is 'outside:' and its
// absolute real form. A ref, never the path.
function targetRef(root, target) {
  const abs = probeRealForm(path.resolve(root, String(target)));
  const rel = path.relative(probeRealForm(root), abs);
  const canonical = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/').toLowerCase() : `outside:${abs.split(path.sep).join('/').toLowerCase()}`;
  return crypto.createHash('sha256').update('sbak-read:' + canonical, 'utf8').digest('hex').slice(0, 16);
}
// hook_seq: the next value of .claude/receipts/gate-seq, under an O_EXCL lock (at most 200 ms; a lock
// older than 5 s is taken over).
function nextSeq(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'gate-seq');
  const lock = file + '.lock';
  const t0 = Date.now();
  let fd = null;
  while (fd === null) {
    try { fd = fs.openSync(lock, 'wx'); } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) fs.rmSync(lock, { force: true }); } catch (_) { /* gone */ }
      if (Date.now() - t0 > 200) throw new Error('the gate-seq lock is busy');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  try {
    let n = 0;
    try { n = parseInt(fs.readFileSync(file, 'utf8'), 10) || 0; } catch (_) { n = 0; }
    n++;
    fs.writeFileSync(file + '.tmp', `${n}\n`);
    fs.renameSync(file + '.tmp', file);
    return n;
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* closed */ }
    try { fs.rmSync(lock, { force: true }); } catch (_) { /* the next call takes it over */ }
  }
}
function judgedRow(verdict, line) {
  let receipts = null; let dir = null;
  try {
    const root = JUDGED.root;
    if (!root) return;
    const st = JUDGED.st;
    if (!JUDGED.fault && st && st.kind === 'inactive') return; // confirmed inactive: no stage to name
    const state = JUDGED.fault || !st || st.kind !== 'active' ? 'unknown' : (st.approved && st.approved === st.stage ? 'approved' : 'active');
    receipts = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'receipts.cjs'));
    dir = path.join(root, '.claude', 'receipts');
    const p = JUDGED.payload || {};
    const row = { schema: receipts.SCHEMA_VERSION, at: new Date().toISOString(), event: 'gate_judged', emitter: 'PreToolUse', state, verdict, class: verdict === 'allow' ? 'allow' : classOf(line), tool_category: receipts.toolCategory(JUDGED.tool) };
    if (typeof p.session_id === 'string' && p.session_id) row.session = p.session_id;
    if (st && st.kind === 'active') { row.stage = st.stage; if (st.role) { const m = classifyRole(st.role); row.role = m === 'unresolved' ? 'unknown' : m; } }
    if (JUDGED.target) row.target_ref = targetRef(root, JUDGED.target);
    if (typeof p.tool_use_id === 'string' && p.tool_use_id) { row.tool_use_id = p.tool_use_id; row.coverage = 'host_id'; }
    else { row.hook_seq = nextSeq(dir); row.coverage = 'hook_seq'; }
    const r = receipts.appendEvent(dir, row);
    if (!r || !r.ok) throw new Error(r && r.reason ? r.reason : 'the receipts sink refused the row');
  } catch (_) {
    try { if (receipts && dir) receipts.appendEvent(dir, { schema: receipts.SCHEMA_VERSION, at: new Date().toISOString(), event: 'instrumentation_degraded', emitter: 'PreToolUse', marker: 'degraded' }); } catch (__) { /* the degraded write is itself bonus */ }
  }
}

// ---- the role, as recorded at stage open ----
const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];
// Classify a marker's token: a bare valid role -> that role; anything present-but-non-
// canonical (garbage) -> 'unresolved' (which the gate treats as fail-CLOSED = engage, DF-005).
function classifyRole(t) {
  const low = t.toLowerCase();
  return VALID_MODES.includes(low) ? low : 'unresolved';
}
// An open stage engages the gate unless a verifier/orchestrator/refactor session opened it or it
// is red-approved.
function engaged(st) {
  if (st.kind !== 'active') return false;
  if (st.role !== null) {
    const mode = classifyRole(st.role);
    if (mode !== 'work' && mode !== 'unresolved') return false;
  }
  return !(st.approved && st.approved === st.stage);
}

// ---- allow-list (CONFIG-DRIVEN; the hook hardcodes NO project's test file) ----
// A path is NON-implementation (allowed before /approve-red) if it matches a
// built-in non-code default OR a glob in .claude/red-gate-allow.txt — that file is
// where a project names its own test entrypoint(s) (e.g. a single-file smoke rig
// the standard *.test.* patterns don't catch).
const BUILTIN_ALLOW = [
  'docs/**', 'retrospectives/**', 'prompts/**', '.claude/**', '.github/**',
  'spec/**', 'proposals/**',
  '**/*.md',
  '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*',
  '**/test/**', '**/tests/**', '**/__tests__/**',
  // M32.H: root-level repo config carries no implementation. The globs are anchored, so a
  // nested `<repo>/sub/.gitignore` (which can hide an implementation tree's artifacts) is not.
  '.gitignore', '.gitattributes', '.editorconfig',
];
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // globstar. DF-002 (M16.B): `**/` matches zero-or-more WHOLE path segments — it is
        // SEGMENT-ANCHORED, so `**/test/**` matches a real `test/` segment, NOT any dir merely
        // ENDING in "test" (`latest/`, `greatest/`). A trailing/bare `**` matches anything left.
        i++; // consume the second *
        if (glob[i + 1] === '/') { re += '(?:[^/]+/)*'; i++; } // `**/` → whole-segment prefix
        else re += '.*';                                       // trailing/bare `**`
      } else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.indexOf(c) !== -1) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}
function normRel(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}
// The edit TOOLS pass an ABSOLUTE file_path, but the allow globs are repo-relative
// (e.g. a project's named test rig). Relativize an absolute path against the REPO ROOT
// BEFORE matching, or the gate over-blocks its own allow-listed test files (PROC-003).
// M32.A: the base is the resolved root, never the session cwd - from a subfolder the cwd
// base turned `<root>/<the project's test rig>` into `../../<the project's test rig>`, which
// matches no glob. path.relative emits OS separators (backslashes on Windows) — normRel (called
// downstream) folds those back to forward slashes so the relative glob matches.
function toRepoRel(rawPath, repoRootDir) {
  let p = String(rawPath);
  if (path.isAbsolute(p)) {
    try { p = path.relative(repoRootDir || process.cwd(), p); } catch (_) { /* keep as-is */ }
  }
  return p;
}
function loadAllowGlobs(claudeDir) {
  const globs = BUILTIN_ALLOW.slice();
  try {
    const txt = fs.readFileSync(path.join(claudeDir, 'red-gate-allow.txt'), 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      // DF-004 (M16.B): reject a WILDCARD-ONLY allow entry (`*`, `**`, `*/**`, `**/*`, `/`…).
      // Such a line compiles to an all-matching pattern and would DISABLE the whole gate. A
      // glob that is nothing but wildcards + slashes matches (root-level or every) path; skip
      // it loudly rather than silently neuter the gate. A real glob (`*.md`, `packages/**`)
      // still carries a literal segment and is kept.
      if (l.replace(/[*/]/g, '') === '') {
        process.stderr.write(`[red-gate] ignoring wildcard-only allow entry '${l}' in red-gate-allow.txt (would disable the gate; DF-004).\n`);
        continue;
      }
      globs.push(l);
    }
  } catch (_) { /* optional config */ }
  return globs;
}
function isAllowedPath(relPath, globs) {
  const rel = normRel(relPath);
  return globs.some((g) => globToRe(normRel(g)).test(rel));
}

// ---- the scratch homes and the repo boundary (M32.H) ----
// Paths are compared RESOLVED: path.resolve, then realOrLexical (realpath where the target
// exists, the lexical form otherwise), lowercased on win32 only - the FS is case-insensitive
// there, and on a case-sensitive FS lowercasing would over-allow (the fail-open direction).
// Each root is compared in BOTH its lexical and its realpath form, with a trailing separator:
// on macOS the tmpdir sits under a symlinked system folder (var, whose real form is
// private/var), an existing target realpaths while a new one cannot, so one form alone
// false-blocks one of the two cases; the separator keeps <tmpdir>/claude-other/ from
// matching <tmpdir>/claude/.
function caseFold(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}
function rootForms(dir) {
  const lex = path.resolve(dir);
  const forms = [lex, hookRoot.realOrLexical(lex)].map((f) => caseFold(f.endsWith(path.sep) ? f : f + path.sep));
  return forms[0] === forms[1] ? [forms[0]] : forms;
}
function isUnder(target, roots) {
  return roots.some((r) => target.startsWith(r));
}
// The homes a builder may write outside the implementation tree during RED. A home whose
// base is unknown (an empty or relative tmpdir/homedir) is left out, never guessed.
function scratchHomes(repoRootDir) {
  const homes = [path.join(repoRootDir, '.claude', 'measurements')]; // the durable stage scratch
  const tmp = os.tmpdir();
  if (tmp && path.isAbsolute(tmp)) homes.push(path.join(tmp, 'claude')); // the session scratchpad tree
  const home = os.homedir();
  if (home && path.isAbsolute(home)) {
    homes.push(path.join(home, '.claude', 'projects')); // Claude Code's memory folders
    homes.push(path.join(home, '.claude', 'plans'));    // Claude Code's plan files
  }
  return homes;
}

// ---- the one release rule (M32.1.B, R-35 c) ----
// Any command naming the release script (case-insensitive: win32 runs APPROVE-RED.CJS as the same
// file) must be EXACTLY the bare release command once whitespace is normalized. Not a shell
// parser: anything in front of it, after it, or a different spelling of it is a refusal.
// M32.1.C (V-15): the name match stays the fail-closed trigger; ONE read-only command is not
// judged - no separator, substitution or redirect anywhere in it (; & | newline ` $( > <) and a
// listed read-only verb first. No verb with an exec path is listed (sed's `e` command runs a shell
// line; rg runs a program per file under --pre / --pre-glob, so rg with either is judged).
// M34.6.I (R11): and no parenthesis or brace outside quotes, by the tool's own reading (plainRead).
const RELEASE_NAMED = /approve-red\.cjs/i;
const RELEASE_EXACT = /^node scripts\/approve-red\.cjs --stage [A-Za-z0-9][A-Za-z0-9._-]{0,63} --release-seq (?:[1-9][0-9]{0,8}|none)$/;
// M34.C (CFI-02): the second bare shape of the one release script - the human's un-approve. The
// reason is double-quoted and carries no character a shell reads (" $ ` \ ; & | < > newline), so
// nothing rides inside it; the one ask rule's glob matches both shapes.
const RELEASE_VOID = /^node scripts\/approve-red\.cjs --stage [A-Za-z0-9][A-Za-z0-9._-]{0,63} --void --reason "[^"$`\\;&|<>\r\n]{1,200}"$/;
const COMPOUND = /[;&|`<>\r\n]|\$\(/;
const READ_ONLY = /^(?:(?:cat|head|tail|wc|grep|rg|diff|cmp|ls|stat)|git (?:add|diff|show|log|blame|status|commit))(?: |$)/;
// M34.B: a word carrying a glob character that could expand to scripts/approve-red.cjs from the
// working directory it runs in (`approve-red.c?s`, `scripts/*`, a brace form) also names it -
// `globNamed`, worked out by the shell write gate's parser, which tracks that directory. The limit
// that remains: a wrapper, or a script that names the release script inside a file, is not judged.
// M34.6.I (R11): the one read-only exemption, shared by the release and the stage script. A plain read
// is a listed verb first with no separator, substitution or redirect (M32.1.C) and no rg --pre, and -
// read by lexShell for the tool the call names, the shell write gate's own lexer - no parenthesis or
// brace outside quotes: PowerShell runs a command inside a grouping, an array subexpression or an
// invoked script block in argument position (`cat (node ...)`) with none of COMPOUND's characters.
// An unquoted ( or ) is a par token under both tools; a PowerShell { } or @( ), and any $( ), <( ),
// >( ) or Bash backtick pair, is a body on its word; an unquoted { or } elsewhere marks the word br.
// No catch here: a throw is the unknown state, refused by main's caller.
function plainRead(command, tool) {
  const norm = command.trim().split(/\s+/).join(' ');
  if (COMPOUND.test(command) || !READ_ONLY.test(norm) || /^rg .*--pre(?:-glob)?(?:[ =]|$)/.test(norm)) return false;
  return !lexShell(command, tool).some((t) => t.k === 'par' || (t.k === 'w' && (t.br || t.bodies.length > 0)));
}
// M34.6.J (item 2, gate 1 Q3; clarification Q-B): the gate's own names in every spelling the shell
// resolves to the same file. A name is looked for in the command as written, in the command with every
// backtick (PowerShell) or backslash (Bash) removed, and in each word the tool's lexer reads, its quotes
// and escapes removed, bodies included; each text after collapsing repeated separators, ./ segments and
// <segment>/../ (a backslash read as a separator). A throw here is the unknown state (main's catch).
function nameTexts(command, tool) {
  const words = [];
  const walk = (src, depth) => { if (depth > BODY_DEPTH) return; for (const t of lexShell(src, tool)) { if (t.k !== 'w') continue; words.push(t.v); for (const b of t.bodies || []) walk(b.text, depth + 1); } };
  walk(command, 0);
  const norm = (t) => { let s = String(t).replace(/\\/g, '/').replace(/\/(?:\.\/)+/g, '/').replace(/\/{2,}/g, '/'); for (let k = 0; k < 64; k++) { const x = s.replace(/(^|\/)(?!\.\.\/)[^/\s"'`()]+\/\.\.\//, '$1'); if (x === s) break; s = x; } return s; };
  return [command, command.replace(tool === 'PowerShell' ? /`/g : /\\/g, '')].concat(words).map(norm);
}
const namesGate = (command, tool, re) => re.test(command) || nameTexts(command, tool).some((t) => re.test(t));
// Under the PowerShell tool a read that names a gate script, or any command that names a red-gate control
// file, is refused with this line (item 2); no reading decides it, and no read-only command is exempt.
const psReadLine = (name) => `[red-gate] REFUSED - under the PowerShell tool a command that names '${name}' runs only as a bare gate-script form or one of the kit's two hook commands (node .claude/hooks/session-start-read-first.cjs --check, node scripts/kit-update.cjs --apply .claude/hooks/receipts-lifecycle.cjs); read the file with the Read tool, and pass text that names it in a file (git commit -F <file>).\n`;
// The control set as names (the probe's own lists, PROBE_CONTROL_FILES under .claude/, the read-first
// glob and PROBE_CONTROL_PATHS), any case, never part of a longer name.
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PS_CONTROL_NAME = new RegExp('(?:^|[^A-Za-z0-9_.-])(' + PROBE_CONTROL_FILES.map((f) => '\\.claude/' + reEsc(f))
  .concat(['\\.claude/' + PROBE_CONTROL_LIST_GLOB.split('*').map(reEsc).join('[A-Za-z0-9_.-]*')], PROBE_CONTROL_PATHS.map(reEsc)).join('|') + ')(?![A-Za-z0-9_.-])', 'i');
function psControlName(command) {
  for (const t of nameTexts(command, 'PowerShell')) { const m = PS_CONTROL_NAME.exec(t); if (m) return m[1].toLowerCase(); }
  return null;
}
// Gate 1 Q2: the two commands the kit prints that name a hook file and write nothing, bare and alone.
const PS_KIT_FORMS = [/^node \.claude\/hooks\/session-start-read-first\.cjs --check$/, /^node scripts\/kit-update\.cjs --apply \.claude\/hooks\/receipts-lifecycle\.cjs$/];
const psKitForm = (command) => !COMPOUND.test(command) && PS_KIT_FORMS.some((re) => re.test(command.trim().split(/\s+/).join(' ')));
// -> null (not judged, or the exact form) or the one refusal line.
function releaseRefusal(command, globNamed, tool) {
  if (typeof command !== 'string' || !(globNamed || namesGate(command, tool, RELEASE_NAMED))) return null; // not judged: no output
  const norm = command.trim().split(/\s+/).join(' ');
  if (plainRead(command, tool)) return tool === 'PowerShell' ? psReadLine('approve-red.cjs') : null;
  if (RELEASE_EXACT.test(norm) || RELEASE_VOID.test(norm)) return null;
  return '[red-gate] REFUSED - the release command runs only in its bare form, alone in the call: node scripts/approve-red.cjs --stage <id> --release-seq <n> (n is the pending approval-request seq, or none).\n';
}
// M34.6.G (item 1): the script that opens and clears the gate runs only in its three bare forms, as
// the release does - the open, the clear, and the orchestrator's clear of a builder worktree (one
// plain path token: no quote, $, glob or space, never a leading -). The ask rule
// Bash(node scripts/stage-active.cjs*) matches all three, so every form this lets run is one the fence
// asks about under the Bash tool (M34.6.I: the PowerShell tool has no kit ask rule; these forms hold
// there, and so does the clear's own click; the open takes none). The same read-only commands are not judged, by the same guard
// (plainRead); a word with a glob character that could expand to scripts/stage-active.cjs names it
// too (`stageGlob`, from the same parser).
const STAGE_NAMED = /stage-active\.cjs/i;
const STAGE_EXACT = /^node scripts\/stage-active\.cjs (?:[A-Za-z0-9][A-Za-z0-9._-]{0,63}|--clear|--clear --tree [A-Za-z0-9_.\/~:+@\\][A-Za-z0-9_.\/~:+@\\-]{0,511})$/;
function stageRefusal(command, globNamed, tool) {
  if (typeof command !== 'string' || !(globNamed || namesGate(command, tool, STAGE_NAMED))) return null; // not judged: no output
  const norm = command.trim().split(/\s+/).join(' ');
  if (plainRead(command, tool)) return tool === 'PowerShell' ? psReadLine('stage-active.cjs') : null;
  if (!COMPOUND.test(command) && STAGE_EXACT.test(norm)) return null;
  return '[red-gate] REFUSED - the stage script runs only in its bare forms, alone in the call: node scripts/stage-active.cjs <stage id>, node scripts/stage-active.cjs --clear, or node scripts/stage-active.cjs --clear --tree <path>.\n';
}

// ---- the shell write gate (M34.B): the recognised write constructs and their targets ----
// A parser, not a sandbox (the header's NOT JUDGED list). It needs nothing but Node, like the state
// probe, because its control-file targets are judged in every state, the unknown one included.
// shellWrites(command, cwd, tool, root, depth) -> { finds: [{ construct, token, abs, glob?, cwd?,
// dir?, victim?, only?, body? }], releaseGlob, stageGlob, cwdMoved }: abs null is a target the gate cannot
// read; glob carries a glob target for the control-set test (step 2); dir marks a directory
// pathspec; victim marks a deletion's or a move source's operand (the carve's alone, M34.1.A), only
// a victim judged as the path itself; body a command body the gate cannot read.

// The lexer: words (quotes removed, with flags), separators, redirects, heredocs. A quoted `>`,
// `;`, `|` or `&` is text; a heredoc body is skipped. M34.1.A (V-3): it reads by the tool. Under
// Bash an unquoted backslash escapes the next character (`a\ b` is one word, `a b`) and a backtick
// pair is a command substitution; under PowerShell a backslash is a path character, a backtick
// escapes, and a `{ ... }` script block, `$(...)` and `@(...)` are statement lists. The body of
// `$(...)`, a backtick pair, `<(...)`, `>(...)` and a script block is kept on its word (`bodies`),
// the word itself one opaque token for the outer command; shellWrites lexes each body as a command
// list of its own, to BODY_DEPTH. A word also carries `pv`, its PowerShell reading (a backslash a
// path character), so a cmdlet's operands read the same under either tool name.
const BODY_DEPTH = 8;
// M34.6.J (item 1): PowerShell's own lexical rules as its language specification writes them (the
// PowerShell Language Specification 3.0 chapter 2, about_Quoting_Rules and about_Comments, read
// 2026-11-08), read under the PowerShell tool only; Bash's reading is unchanged. The quote classes
// (2.3.5.2): a string opened by any quote of a class is closed by any quote of the same class, a doubled
// quote is an escaped one, and a backslash escapes nothing. White space (2.2.4): Zs, Zl, Zp, tab,
// vertical tab, form feed. A new line (2.2.2): CR, LF or CRLF; no backslash continues a line. A comment
// (2.2.3) starts only where a token may, never inside a word. Each is built from character codes, so
// this file stays ASCII.
const PS_DQ = '"' + String.fromCharCode(0x201C, 0x201D, 0x201E);
const PS_SQ = "'" + String.fromCharCode(0x2018, 0x2019, 0x201A, 0x201B);
const psDq = (c) => typeof c === 'string' && c.length === 1 && PS_DQ.indexOf(c) !== -1;
const psSq = (c) => typeof c === 'string' && c.length === 1 && PS_SQ.indexOf(c) !== -1;
// M34.6.K (gate 1 Q1): the characters a stop-parsing line is judged without (every quote of both classes,
// the backtick, the comment mark and the braces), so none of them can hide text inside it.
const PS_STOP_BLANK = new RegExp('[' + PS_DQ + PS_SQ + '`#{}]', 'g');
const PS_WS = /^[\t\v\f\p{Zs}\p{Zl}\p{Zp}]$/u;
const psWs = (c) => typeof c === 'string' && PS_WS.test(c);
// A comment may start at the text's start, after white space or a new line, or after a character that
// ends an expression or a statement or opens a body: ( ) { } [ ] ; , = | & or a quote.
const psCommentAt = (s, j, from) => j <= from || /[\s(){}[\];,=|&]/.test(s[j - 1]) || psWs(s[j - 1]) || psDq(s[j - 1]) || psSq(s[j - 1]);
// The index after the braced variable ${ ... } at s[i] (2.3.2: to the first } a backtick does not
// escape; quotes and braces inside it are text), or -1 when it never closes.
function psBraceEnd(s, i) {
  for (let j = i + 2; j < s.length; j++) { if (s[j] === '`') { j++; continue; } if (s[j] === '}') return j + 1; }
  return -1;
}
// The index of the quote that closes the string opened at s[i], or -1. In a double-quoted string a
// backtick escapes the next character, and a $( ) or a ${ } inside it is skipped to its own close.
function psQuoteEnd(s, i, tool) {
  const cls = psDq(s[i]) ? psDq : psSq;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (cls === psDq) {
      if (c === '`') { j++; continue; }
      if (c === '$' && s[j + 1] === '(') { const k = closeOf(s, j + 1, tool); if (k === -1) return -1; j = k - 1; continue; }
      if (c === '$' && s[j + 1] === '{') { const k = psBraceEnd(s, j); if (k === -1) return -1; j = k - 1; continue; }
    }
    if (cls(c)) { if (cls(s[j + 1])) { j++; continue; } return j; }
  }
  return -1;
}
// A here-string opened at s[i] (2.3.5.2: @ and a quote of either class, white space, a new line; closed
// by a new line, then a quote of the same class at the line's start, then @) -> { body, bodyEnd, end, dq },
// or null when s[i] opens none. One never closed runs to the end.
function psHere(s, i) {
  if (s[i] !== '@' || !(psDq(s[i + 1]) || psSq(s[i + 1]))) return null;
  let j = i + 2; while (j < s.length && psWs(s[j])) j++;
  if (s[j] === '\r' && s[j + 1] === '\n') j += 2; else if (s[j] === '\n' || s[j] === '\r') j += 1; else return null;
  const dq = psDq(s[i + 1]); const cls = dq ? psDq : psSq;
  for (let ls = j; ;) {
    if (cls(s[ls]) && s[ls + 1] === '@') return { body: j, bodyEnd: ls, end: ls + 2, dq };
    let le = ls; while (le < s.length && s[le] !== '\n' && s[le] !== '\r') le++;
    if (le >= s.length) return { body: j, bodyEnd: s.length, end: s.length, dq };
    ls = le + (s[le] === '\r' && s[le + 1] === '\n' ? 2 : 1);
  }
}
// The end of the bracketed text opened at s[i] ('(' or '{'): quotes and the tool's escape skipped,
// the same bracket counted -> the index after its close, or -1 when it never closes.
// M34.2.A (V-5 iii): under Bash a `case ... esac` at command position inside the parentheses takes
// its `pat)` arms, so the text closes where bash closes it, never at the first arm.
function closeOf(s, i, tool) {
  const open = s[i]; const close = open === '{' ? '}' : ')';
  const esc = tool === 'PowerShell' ? '`' : '\\';
  const cases = open === '(' && tool !== 'PowerShell' ? [] : null;
  // A keyword at command position: after the opening, a separator, or a keyword that runs the next word.
  const atCommand = (j, w, after) => {
    if (!s.startsWith(w, j) || !after.test(s[j + w.length] === undefined ? ' ' : s[j + w.length])) return false;
    let k = j - 1; while (k > i && /[ \t]/.test(s[k])) k--;
    if (k <= i || /[;&|(\n{]/.test(s[k])) return true;
    const m = /(?:^|[\s;&|(])(then|do|else|elif|!|time)$/.exec(s.slice(i + 1, k + 1));
    return !!m;
  };
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === esc) { j++; continue; }
    // M34.6.J (a), (c), (d), (e): under PowerShell the quotes by class, a here-string, a braced variable
    // and a comment are skipped as PowerShell reads them, so a bracket inside one closes nothing.
    if (tool === 'PowerShell') {
      if (c === '@') { const h = psHere(s, j); if (h) { j = h.end - 1; continue; } }
      if (psDq(c) || psSq(c)) { const k = psQuoteEnd(s, j, tool); if (k === -1) return -1; j = k; continue; }
      if (c === '$' && s[j + 1] === '{') { const k = psBraceEnd(s, j); if (k === -1) return -1; j = k - 1; continue; }
      if (c === '<' && s[j + 1] === '#' && psCommentAt(s, j, i + 1)) { const k = s.indexOf('#>', j + 2); if (k === -1) return -1; j = k + 1; continue; }
      if (c === '#' && psCommentAt(s, j, i + 1)) { let k = j; while (k < s.length && s[k] !== '\n' && s[k] !== '\r') k++; j = k - 1; continue; }
    }
    if (c === "'") { const k = s.indexOf("'", j + 1); if (k === -1) return -1; j = k; continue; }
    if (c === '"') { let k = j + 1; while (k < s.length && s[k] !== '"') { if (s[k] === esc) k++; k++; } if (k >= s.length) return -1; j = k; continue; }
    if (cases && depth > 0) {
      if (c === 'c' && atCommand(j, 'case', /\s/)) { cases.push(depth); j += 3; continue; }
      if (c === 'e' && cases.length && atCommand(j, 'esac', /[\s;)&|]/)) { cases.pop(); j += 3; continue; }
    }
    if (c === open) depth++;
    else if (c === close) {
      if (cases && cases.length && cases[cases.length - 1] === depth) continue; // a case arm's pat)
      depth--; if (depth === 0) return j + 1;
    }
  }
  return -1;
}
// M34.2.A (V-5 i, ii): the substitutions inside a span the lexer otherwise keeps as text - an
// unquoted heredoc body, an arithmetic expansion, a parameter expansion. Each $(...) and backtick
// pair from `from` to `to` is a body on `into` (judged as anywhere, one it cannot close an open one);
// an inner $((...)) is read the same way. `quotes`: a single quote quotes (in a heredoc body it is text).
function subsIn(s, from, to, tool, quotes, into) {
  for (let j = from; j < to; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (quotes && c === "'") { const k = s.indexOf("'", j + 1); j = k === -1 || k >= to ? to : k; continue; }
    if (c === '`') {
      const k = backtickClose(s, j); const bad = k === -1 || k > to; const e = bad ? to : k;
      into.push({ text: s.slice(j + 1, bad ? to : k - 1), tool, open: bad, tok: s.slice(j, e), block: false });
      j = e - 1; continue;
    }
    if (c === '$' && s[j + 1] === '(') {
      const k = closeOf(s, j + 1, tool); const bad = k === -1 || k > to; const e = bad ? to : k;
      if (s[j + 2] === '(') {
        if (bad) into.push({ text: '', tool, open: true, tok: s.slice(j, e), block: false });
        else subsIn(s, j + 3, e - 2, tool, quotes, into);
      } else into.push({ text: s.slice(j + 2, bad ? to : k - 1), tool, open: bad, tok: s.slice(j, e), block: false });
      j = e - 1;
    }
  }
}
// The end of the Bash backtick pair opened at s[i] (a backslash escapes) -> the index after it, or -1.
function backtickClose(s, i) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '`') return j + 1;
  }
  return -1;
}
function lexShell(src, tool) {
  const ps = tool === 'PowerShell';
  const toks = [];
  const n = src.length;
  const pend = []; // heredoc delimiters waiting for the end of their line
  let i = 0;
  let w = null;
  // br (M34.6.I): an unquoted { or } on the word - plainRead's guard, beside the par tokens and bodies.
  const start = () => { if (!w) w = { k: 'w', v: '', pv: '', raw: '', s: i, q: false, sub: false, vr: false, br: false, bodies: [] }; };
  const add = (x, px) => { w.v += x; w.pv += px === undefined ? x : px; };
  const end = () => { if (w) { w.raw = src.slice(w.s, i); toks.push(w); w = null; } };
  const lineEnd = (from) => { const j = src.indexOf('\n', from); return j === -1 ? n : j; };
  // M34.6.K (item 1): under PowerShell a > is text only where it continues a bare word (about_Parsing:
  // < > @ and # are special only at a token's start). bareTo is the index after the last character read
  // as part of a bare word and runAt where that bare run began; a quote, a here-string or a body ends a
  // run, so a > right after one starts a token, and a run that is a stream number (digits, *) is n>.
  let bareTo = -1; let runAt = -1;
  const bare = (k) => { if (bareTo !== i) runAt = i; add(src.slice(i, i + k)); i += k; bareTo = i; };
  // A body from its lead at `from` ($ < > @, or the bracket itself) through the close of the bracket at o.
  const body = (from, o, block) => {
    const k = closeOf(src, o, tool);
    const e = k === -1 ? n : k;
    w.bodies.push({ text: src.slice(o + 1, k === -1 ? n : k - 1), tool, open: k === -1, tok: src.slice(from, e), block: !!block });
    add(src.slice(from, e)); i = e;
  };
  // A Bash backtick pair at i (in or out of double quotes).
  const ticks = () => {
    const k = backtickClose(src, i); const e = k === -1 ? n : k;
    w.sub = true;
    w.bodies.push({ text: src.slice(i + 1, k === -1 ? n : k - 1), tool, open: k === -1, tok: src.slice(i, e), block: false });
    add(src.slice(i, e)); i = e;
  };
  // $(...) at i: a body; $((...)) under Bash is arithmetic, its own substitutions the bodies
  // (M34.2.A, V-5 ii), one never closed an open body.
  const dollarParen = () => {
    w.sub = true;
    if (!ps && src[i + 2] === '(') {
      const k = closeOf(src, i + 1, tool); const e = k === -1 ? n : k;
      if (k === -1) w.bodies.push({ text: '', tool, open: true, tok: src.slice(i, e), block: false });
      else subsIn(src, i + 3, e - 2, tool, true, w.bodies);
      add(src.slice(i, e)); i = e; return;
    }
    body(i, i + 1);
  };
  // ${...} at i, unquoted: to its own close (quotes, substitutions and nested braces counted); under
  // Bash its substitutions are bodies (M34.2.A, Q5), one never closed an open body.
  const dollarBrace = () => {
    w.vr = true; w.br = true;
    let j = i + 2; let d = 1;
    for (; j < n && d > 0; j++) {
      const c2 = src[j];
      if (c2 === (ps ? '`' : '\\')) { j++; continue; }
      if (c2 === "'") { const k = src.indexOf("'", j + 1); if (k === -1) { j = n; break; } j = k; continue; }
      if (c2 === '"') { let k = j + 1; while (k < n && src[k] !== '"') { if (src[k] === '\\') k++; k++; } j = k; continue; }
      if (!ps && c2 === '$' && src[j + 1] === '(') { const k = closeOf(src, j + 1, tool); if (k === -1) { j = n; break; } j = k - 1; continue; }
      if (!ps && c2 === '`') { const k = backtickClose(src, j); if (k === -1) { j = n; break; } j = k - 1; continue; }
      if (c2 === '{') d++;
      else if (c2 === '}') d--;
    }
    const e = d === 0 ? j : n;
    if (!ps) {
      if (d !== 0) w.bodies.push({ text: '', tool, open: true, tok: src.slice(i, e), block: false });
      else subsIn(src, i + 2, e - 1, tool, true, w.bodies);
    }
    add(src.slice(i, e)); i = e;
  };
  // M34.6.J (c): the $( ) bodies and ${ } variables of an expandable PowerShell here-string, from..to.
  const psExpand = (from, to) => {
    for (let j = from; j < to; j++) {
      const d = src[j];
      if (d === '`') { j++; continue; }
      if (d !== '$') continue;
      w.vr = true;
      if (src[j + 1] === '(') {
        const k = closeOf(src, j + 1, tool); const bad = k === -1 || k > to; const e = bad ? to : k;
        w.sub = true; w.bodies.push({ text: src.slice(j + 2, bad ? to : k - 1), tool, open: bad, tok: src.slice(j, e), block: false });
        j = e - 1; continue;
      }
      if (src[j + 1] === '{') { const k = psBraceEnd(src, j); j = (k === -1 || k > to ? to : k) - 1; }
    }
  };
  while (i < n) {
    const c = src[i];
    if (ps && c === '\r' && src[i + 1] !== '\n') { end(); toks.push({ k: 'op', v: '\n', s: i }); i++; continue; } // M34.6.J (f): a lone CR ends a statement
    if (c === ' ' || c === '\t' || c === '\r' || (ps && psWs(c))) { end(); i++; continue; } // M34.6.J (f): PowerShell's white space
    if (c === '\n') {
      end(); toks.push({ k: 'op', v: '\n', s: i }); i++;
      while (pend.length) {
        const h = pend.shift();
        const from = i; let to = n;
        while (i < n) {
          const ls = i;
          const le = lineEnd(i);
          let line = src.slice(i, le).replace(/\r$/, '');
          if (h.strip) line = line.replace(/^\t+/, '');
          i = le < n ? le + 1 : n;
          if (line === h.delim) { to = ls; break; }
        }
        // M34.2.A (V-5 i): bash expands an unquoted heredoc body - its substitutions are bodies on
        // the heredoc's token; a quoted delimiter keeps the body text.
        if (!h.quoted && !ps) subsIn(src, from, to, tool, false, h.hd.bodies);
      }
      continue;
    }
    if (c === '\\') {
      if (ps) { start(); bare(1); continue; } // M34.6.J (b): PowerShell: a path character, never an escape or a line continuation
      if (src[i + 1] === '\n') { i += 2; continue; } // a line continuation
      if (src[i + 1] === '\r' && src[i + 2] === '\n') { i += 3; continue; }
      start();
      if (ps) { add(c); i++; continue; } // PowerShell: a path character
      const nx = src[i + 1] === undefined ? '' : src[i + 1];
      add(nx, c + nx); i += 2; continue; // Bash: the next character, escaped
    }
    if (c === '#' && !w) { if (ps) { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; } else i = lineEnd(i); continue; } // a comment, to the end of the line (PowerShell: a CR ends it too)
    // M34.6.J (e): a PowerShell block comment where a token may start, white space to its close (or the
    // end); inside a word < is a word character, so a word's <# opens no comment (about_Comments).
    if (ps && c === '<' && src[i + 1] === '#' && (!w || psCommentAt(src, i, 0))) { end(); const k = src.indexOf('#>', i + 2); i = k === -1 ? n : k + 2; continue; }
    if (ps && c === '<' && w) { bare(1); continue; }
    // M34.6.J (a): a PowerShell single-quoted string, opened and closed by any single quote of the class.
    if (ps && psSq(c)) {
      start(); w.q = true;
      const k = psQuoteEnd(src, i, tool); const e = k === -1 ? n : k;
      let v = ''; for (let j = i + 1; j < e; j++) { v += src[j]; if (psSq(src[j]) && psSq(src[j + 1])) j++; }
      add(v); i = e + 1; continue;
    }
    // M34.6.J (c): a PowerShell here-string, its quotes by class, white space after the opener; an
    // expandable one's $( ) are bodies, as in a double-quoted string.
    if (ps && c === '@' && !w) {
      const h = psHere(src, i);
      if (h) {
        start(); w.q = true;
        add(src.slice(h.body, h.bodyEnd).replace(/\r?\n$/, ''));
        if (h.dq) psExpand(h.body, h.bodyEnd);
        i = h.end; continue;
      }
    }
    if (c === "'") { start(); w.q = true; const j = src.indexOf("'", i + 1); const k = j === -1 ? n : j; add(src.slice(i + 1, k)); i = k + 1; continue; }
    if (c === '@' && !w && (src[i + 1] === "'" || src[i + 1] === '"') && /^\r?\n/.test(src.slice(i + 2, i + 4))) {
      // a PowerShell here-string: one quoted word to the line that opens with its closing quote
      const qc = src[i + 1]; const close = src.indexOf('\n' + qc + '@', i + 2);
      start(); w.q = true;
      const hs = src.slice(i + 2, close === -1 ? n : close);
      add(hs.replace(/^\r?\n/, ''));
      if (qc === '"' && hs.indexOf('$') !== -1) w.vr = true;
      i = close === -1 ? n : close + 3; continue;
    }
    if (ps && c === '@' && src[i + 1] === '(') { start(); w.sub = true; body(i, i + 1); continue; } // @(...)
    if (ps && c === '{') { start(); body(i, i, true); continue; } // a script block
    // M34.6.J (a), (b), (d): a PowerShell double-quoted string, opened and closed by any double quote of
    // the class; a doubled quote or a backtick before one is a quote; a backslash is text; ${ } is a
    // braced variable to its own close; $( ) a body.
    if (ps && psDq(c)) {
      start(); w.q = true; i++;
      while (i < n) {
        const d = src[i];
        if (psDq(d)) { if (psDq(src[i + 1])) { add(d); i += 2; continue; } break; }
        if (d === '`') { if (psDq(src[i + 1])) { add(src[i + 1]); i += 2; continue; } w.vr = true; add(src.slice(i, i + 2)); i += 2; continue; }
        if (d === '$') {
          if (src[i + 1] === '(') { dollarParen(); continue; }
          if (src[i + 1] === '{') { const k = psBraceEnd(src, i); const e = k === -1 ? n : k; w.vr = true; add(src.slice(i, e)); i = e; continue; }
          w.vr = true;
        }
        add(d); i++;
      }
      i++; continue;
    }
    if (c === '"') {
      start(); w.q = true; i++;
      while (i < n && src[i] !== '"') {
        const d = src[i];
        if (d === '\\' && (src[i + 1] === '"' || src[i + 1] === '\\' || (!ps && (src[i + 1] === '$' || src[i + 1] === '`')))) { add(src[i + 1]); i += 2; continue; }
        if (d === '`') {
          if (!ps) { ticks(); continue; }
          if (src[i + 1] === '"') { add('"'); i += 2; continue; }
          w.vr = true; add(src.slice(i, i + 2)); i += 2; continue; // PowerShell: the escape character
        }
        if (d === '$') {
          if (src[i + 1] === '(') { dollarParen(); continue; }
          w.vr = true;
        }
        add(d); i++;
      }
      i++; continue;
    }
    if (c === '`') {
      if (ps) {
        if (src[i + 1] === '\n') { i += 2; continue; } // a PowerShell line continuation
        if (src[i + 1] === '\r' && src[i + 2] === '\n') { i += 3; continue; }
        start(); w.vr = true; bare(2); continue; // the escape character
      }
      start(); ticks(); continue;
    }
    if (c === '$') {
      start();
      if (src[i + 1] === '(') { dollarParen(); continue; }
      if (ps && src[i + 1] === '{') { const k = psBraceEnd(src, i); const e = k === -1 ? n : k; w.vr = true; w.br = true; add(src.slice(i, e)); i = e; continue; } // M34.6.J (d): a braced variable
      if (src[i + 1] === '{') { dollarBrace(); continue; }
      w.vr = true; bare(1); continue;
    }
    if (c === ';') { end(); toks.push({ k: 'op', v: ';', s: i }); i++; continue; }
    if (c === '|') {
      end();
      if (src[i + 1] === '|') { toks.push({ k: 'op', v: '||', s: i }); i += 2; } else { toks.push({ k: 'op', v: '|', s: i }); i += src[i + 1] === '&' ? 2 : 1; }
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') { end(); toks.push({ k: 'op', v: '&&', s: i }); i += 2; continue; }
      if (src[i + 1] === '>') { end(); const op = src[i + 2] === '>' ? '&>>' : '&>'; toks.push({ k: 'r', op, s: i }); i += op.length; continue; }
      end(); toks.push({ k: 'op', v: '&', s: i }); i++; continue;
    }
    // M34.6.J (g): under PowerShell a grouping ( ... ) is a body, so its pipeline is judged and a grouped
    // operand is a target the gate cannot read; a ) with no ( stays a par token.
    if (ps && c === '(') { end(); start(); w.sub = true; body(i, i); continue; }
    if (c === '(' || c === ')') { end(); toks.push({ k: 'par', v: c, s: i }); i++; continue; }
    // M34.6.J (e): under PowerShell a > inside a word is a word character (pwsh echoes `a>b`, probes/
    // ps-facts2.txt), unless the word is a stream number or * (2>, *>) or the > follows a quote or a close.
    // M34.6.K (item 1): and only where the > continues a bare run that is not a stream number; after a
    // here-string's close, a body or a quote the > starts a token (V5-R1; probes/ps-facts-k-base.txt).
    if (ps && c === '>' && w && !/^(?:\d+|\*)$/.test(w.v) && !(psDq(src[i - 1]) || psSq(src[i - 1]) || /[)}\]]/.test(src[i - 1])) && bareTo === i && !/^(?:\d+|\*)$/.test(src.slice(runAt, i))) { bare(1); continue; }
    if (c === '>') {
      if (src[i + 1] === '(') { end(); start(); w.sub = true; body(i, i + 1); continue; } // >(...)
      let op = '>';
      if (w && !w.q && w.s + w.v.length === i && /^(?:\d+|\*)$/.test(w.v)) { op = w.v + '>'; w = null; } // 2> 2>> *>
      // M34.6.K (item 1): under PowerShell a stream number right after a token's close starts its own token,
      // n> (pwsh writes `"x"1>f`, K33): the run leaves the word, which ends where the run began.
      else if (ps && w && bareTo === i && runAt > w.s && /^(?:\d+|\*)$/.test(src.slice(runAt, i))) { op = src.slice(runAt, i) + '>'; w.v = w.v.slice(0, runAt - i); w.pv = w.pv.slice(0, runAt - i); const at = i; i = runAt; end(); i = at; }
      else end();
      let j = i + 1;
      if (src[j] === '>') { op += '>'; j++; } else if (src[j] === '|') { op += '|'; j++; }
      toks.push({ k: 'r', op, s: i }); i = j;
      const m = /^&(\d+|-)/.exec(src.slice(i, i + 12)); // a duplication: 2>&1, >&2, >&-
      if (m) { toks.push({ k: 'w', v: m[0], pv: m[0], raw: m[0], s: i, q: false, sub: false, vr: false, dup: true, bodies: [] }); i += m[0].length; }
      continue;
    }
    if (c === '<') {
      end();
      if (src[i + 1] === '<' && src[i + 2] === '<') { toks.push({ k: 'hs', s: i }); i += 3; continue; } // a here-string
      if (src[i + 1] === '<') {
        let j = i + 2; let strip = false; let quoted = false;
        if (src[j] === '-') { strip = true; j++; }
        while (src[j] === ' ' || src[j] === '\t') j++;
        let d = '';
        while (j < n && !/[\s;|&<>()]/.test(src[j])) {
          if (src[j] === "'" || src[j] === '"') { quoted = true; const q = src[j]; const k = src.indexOf(q, j + 1); const e = k === -1 ? n : k; d += src.slice(j + 1, e); j = e + 1; continue; }
          if (src[j] === '\\') { quoted = true; j++; continue; }
          d += src[j]; j++;
        }
        const hd = { k: 'hd', s: i, bodies: [] };
        toks.push(hd); pend.push({ delim: d, strip, quoted, hd }); i = j; continue;
      }
      if (src[i + 1] === '(') { start(); w.sub = true; body(i, i + 1); continue; } // <(...)
      toks.push({ k: 'in', s: i }); i++; continue;
    }
    // M34.6.K (gate 1 Q1): PowerShell's stop-parsing token where a token may start. The rest of its line,
    // to a new line or a lone CR, is literal text for the command (about_Parsing; a bare | ends it too,
    // probes/ps-facts-k-base.txt K54). The hook keeps that text as one word and also judges it as a command
    // list with every quote, backtick, #, { and } read as a space, so nothing in it hides a pipeline from
    // the gate and no quote in it reaches the next line.
    if (ps && c === '-' && src.startsWith('--%', i) && (!w || bareTo !== i)) {
      end(); start();
      let le = i + 3; while (le < n && src[le] !== '\n' && src[le] !== '\r') le++;
      const text = src.slice(i, le);
      w.q = true; w.sub = true;
      w.bodies.push({ text: text.slice(3).replace(PS_STOP_BLANK, ' '), tool, open: false, tok: text, block: false });
      add(text); i = le; end(); continue;
    }
    start(); if (c === '{' || c === '}') w.br = true;
    bare(1);
  }
  end();
  return toks;
}
// The commands of a call: their words, redirects, heredoc flag, separators and source range.
// M34.1.A: the parentheses stay among the items, so a word right before `)` (a case pattern, when
// more words follow it) and a word before `()` (a function's name) are marked for commandWord.
function shellCommands(src, tool) {
  const cmds = [];
  let cur = null; let depth = 0; let before = null;
  for (const t of lexShell(src, tool)) {
    if (t.k === 'op') { if (cur) { cur.after = t.v; cur.e = t.s; cmds.push(cur); cur = null; } before = t.v; continue; }
    if (t.k === 'par') { depth = Math.max(0, depth + (t.v === '(' ? 1 : -1)); if (cur) { cur.paren = true; cur.items.push(t); } continue; }
    if (!cur) cur = { items: [], depth, paren: depth > 0, before, after: null, s: t.s, e: src.length };
    cur.items.push(t);
  }
  if (cur) cmds.push(cur);
  for (const c of cmds) {
    c.words = []; c.reds = []; c.heredoc = false; c.hdBodies = []; c.raw = src.slice(c.s, c.e);
    c.all = c.items.filter((t) => t.k === 'w');
    for (let k = 0; k < c.items.length; k++) {
      const t = c.items[k]; const nx = c.items[k + 1];
      if (t.k === 'w') {
        c.words.push(t);
        if (nx && nx.k === 'par' && nx.v === ')') t.cp = true;
        if (nx && nx.k === 'par' && nx.v === '(' && c.items[k + 2] && c.items[k + 2].k === 'par' && c.items[k + 2].v === ')') t.fn = true;
      } else if (t.k === 'r') { if (nx && nx.k === 'w') { c.reds.push({ op: t.op, target: nx }); k++; } else c.reds.push({ op: t.op, target: null }); }
      else if (t.k === 'in' || t.k === 'hs') { if (nx && nx.k === 'w') k++; } // a source, not a word
      else if (t.k === 'hd') { c.heredoc = true; for (const b of t.bodies || []) c.hdBodies.push(b); }
    }
  }
  return cmds;
}
// M34.1.A (V-3 ii): the command word, past the prefixes - the keywords and words that run the next
// word (if then elif else do while until { ! time command builtin exec nohup sudo doas, env with its
// options and NAME=value operands, function NAME, NAME (), a leading NAME=value; under PowerShell
// `$var =` and a [type] cast) and a case pattern; `for`, `select` and `env -S` make the command
// text. -> { k: its index in c.words (c.words.length: none), cwdUnknown: env -C moved the folder }.
const PREFIX_WORDS = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until', '{', '!', 'time', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'doas', 'timeout', 'nice', 'setsid']);
const PREFIX_VALUE_OPTS = { exec: /^-a$/, sudo: /^-[ugCDhprtUT]$/, doas: /^-[uCa]$/, timeout: /^-[sk]$/, nice: /^-n$/ };
function commandWord(c, tool) {
  const ws = c.words; const ps = tool === 'PowerShell';
  const none = { k: ws.length, cwdUnknown: false };
  let k = 0; let cwdUnknown = false;
  const assign = (x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x.raw);
  for (let guard = 0; guard < 256 && k < ws.length; guard++) {
    const w = ws[k];
    if (w.cp && k + 1 < ws.length) { k++; continue; } // a case pattern: `pat) cmd`
    if (ps && w.vr && /^\$[\w:]+$/.test(w.v) && ws[k + 1] && /^(?:[-+*/%]|\?\?)?=$/.test(ws[k + 1].v)) { k += 2; continue; } // $var =
    if (w.q || w.sub || w.vr) break;
    const v = ps ? w.v.toLowerCase() : w.v;
    if (w.fn) { k++; continue; } // NAME (): the parentheses are not words
    if (ps && /^\[[^\]]+\]$/.test(w.v)) { k++; continue; } // a [type] cast
    if (assign(w)) { k++; continue; }
    if (v === 'for' || v === 'select') return none;
    if (v === 'case') { k++; while (k < ws.length && (ps ? ws[k].v.toLowerCase() : ws[k].v) !== 'in') k++; k++; continue; }
    if (v === 'function') { k += 2; continue; }
    if (v === 'env') {
      k++;
      while (k < ws.length) {
        const o = ws[k].v;
        if (/^(?:-S|--split-string)(?:=|$)/.test(o) || /^-[a-zA-Z]*S/.test(o) && !/^--/.test(o)) return none; // env -S: a wrapper the gate does not read
        if (/^(?:-C|--chdir)$/.test(o)) { cwdUnknown = true; k += 2; continue; }
        if (/^--chdir=/.test(o)) { cwdUnknown = true; k++; continue; }
        if (/^(?:-u|--unset)$/.test(o)) { k += 2; continue; }
        if (o === '--') { k++; break; }
        if (/^-/.test(o) || assign(ws[k])) { k++; continue; }
        break;
      }
      continue;
    }
    if (PREFIX_WORDS.has(v)) {
      k++;
      const takes = PREFIX_VALUE_OPTS[v];
      while (k < ws.length && /^-./.test(ws[k].v)) {
        if (ws[k].v === '--') { k++; break; }
        k += takes && takes.test(ws[k].v) ? 2 : 1;
      }
      if (v === 'sudo' || v === 'doas') while (k < ws.length && assign(ws[k])) k++;
      if (v === 'timeout' && k < ws.length) k++; // M34.2.A (G-16): its duration, then the command
      continue;
    }
    break;
  }
  return { k: Math.min(k, ws.length), cwdUnknown };
}

// A glob, as a regular expression over a forward-slash path (case-insensitive: fail closed).
function globPart(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const k = g.indexOf(']', i + 2);
      if (k === -1) re += '\\[';
      else { let cls = g.slice(i + 1, k).replace(/\\/g, '\\\\'); if (cls[0] === '!') cls = '^' + cls.slice(1); re += `[${cls}]`; i = k; }
    } else if (c === '{') {
      let d = 0; let k = i; const alts = []; let from = i + 1;
      for (; k < g.length; k++) {
        if (g[k] === '{') d++;
        else if (g[k] === '}') { d--; if (d === 0) break; } else if (g[k] === ',' && d === 1) { alts.push(g.slice(from, k)); from = k + 1; }
      }
      if (k >= g.length || !alts.length) re += '\\{';
      else { alts.push(g.slice(from, k)); re += `(?:${alts.map(globPart).join('|')})`; i = k; }
    } else re += /[.+^$(){}|\\\]]/.test(c) ? '\\' + c : c;
  }
  return re;
}
function globRe(g) {
  try { return new RegExp('^' + globPart(String(g).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')) + '$', 'i'); } catch (_) { return null; }
}
const fwd = (p) => p.split(path.sep).join('/');
const GLOB_CHAR = /[*?[\]{}]/;
const PCT_VAR = /%[A-Za-z_][A-Za-z0-9_]*%/;
const NULL_TARGET = /^(?:\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)|nul:?|\$null)$/i;
const readableWord = (wd) => !wd.sub && !wd.vr && !PCT_VAR.test(wd.v) && !GLOB_CHAR.test(wd.v) && !/\$\(|`/.test(wd.v);
const wordOf = (v) => ({ k: 'w', v, raw: v, q: false, sub: /\$\(|`/.test(v), vr: /\$/.test(v) });

// Where a literal target lands: against the working directory the shell writes in; `~` is the home
// folder; under tool_name Bash on win32 (Git Bash) /c/... is the C drive and /tmp/... the temp folder.
function shellPath(v, cwd, tool) {
  let p = String(v);
  if (p === '~' || /^~[\\/]/.test(p)) {
    let h = null; try { h = os.homedir(); } catch (_) { h = null; }
    if (!h) return null;
    p = path.join(h, p.slice(1));
  } else if (process.platform === 'win32' && tool === 'Bash') {
    const m = /^\/([A-Za-z])(?:\/(.*))?$/.exec(p.replace(/\\/g, '/'));
    if (m) p = `${m[1].toUpperCase()}:\\${(m[2] || '').replace(/\//g, '\\')}`;
    else if (/^\/tmp(?:\/|$)/.test(p)) p = path.join(os.tmpdir(), p.slice(4));
  }
  if (process.platform !== 'win32') p = p.replace(/\\/g, '/');
  if (path.isAbsolute(p)) return path.resolve(p);
  return cwd ? path.resolve(cwd, p) : null;
}
// A patch file the gate may read: inside the root or a scratch home (lexical or real form).
function patchHome(abs, root) {
  const homes = [];
  if (root) homes.push(root);
  try { const t = os.tmpdir(); if (t && path.isAbsolute(t)) homes.push(path.join(t, 'claude')); } catch (_) { /* no tmpdir */ }
  try { const h = os.homedir(); if (h && path.isAbsolute(h)) homes.push(path.join(h, '.claude', 'projects'), path.join(h, '.claude', 'plans')); } catch (_) { /* no home */ }
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const forms = (p) => [path.resolve(p), probeRealForm(p)].map((f) => fold(f.endsWith(path.sep) ? f : f + path.sep));
  const t = [path.resolve(abs), probeRealForm(abs)].map(fold);
  return homes.some((h) => forms(h).some((f) => t.some((x) => x.startsWith(f))));
}
// The paths a unified diff writes: each `--- a/` and `+++ b/` pair (not /dev/null), -p and
// --directory applied.
function patchPaths(text, strip, dir) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  const name = (s) => {
    let p = s.replace(/\t.*$/, '').trim();
    if (/^".*"$/.test(p)) p = p.slice(1, -1).replace(/\\(["\\])/g, '$1');
    if (p === '/dev/null' || !p) return null;
    const segs = p.split('/');
    if (segs.length <= strip) return null;
    const rest = segs.slice(strip).join('/');
    return dir ? `${dir.replace(/\/+$/, '')}/${rest}` : rest;
  };
  for (let k = 0; k + 1 < lines.length; k++) {
    if (!lines[k].startsWith('--- ') || !lines[k + 1].startsWith('+++ ')) continue;
    for (const s of [lines[k].slice(4), lines[k + 1].slice(4)]) { const p = name(s); if (p && out.indexOf(p) === -1) out.push(p); }
    k++;
  }
  return out;
}
// A call's top-level arguments as text, from the `(` at i.
function callArgs(s, i) {
  const out = []; let depth = 0; let cur = '';
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { let k = j + 1; while (k < s.length && s[k] !== c) { if (s[k] === '\\') k++; k++; } cur += s.slice(j, k + 1); j = k; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; if (j !== i) cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { out.push(cur); return out; } cur += c; continue; }
    if (c === ',' && depth === 1) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
// One whole string literal (JS or Python) -> its value, or null.
function literalOf(a) {
  const t = String(a).trim();
  let m = /^([rRbBuU]{0,2})(['"])((?:\\[\s\S]|(?!\2)[^\\])*)\2$/.exec(t);
  if (m) return m[3].replace(/\\([\\'"])/g, '$1');
  m = /^`([^`$\\]*)`$/.exec(t);
  return m ? m[1] : null;
}
// One whole PowerShell string literal -> its value, or null.
function psLiteralOf(a) {
  const t = String(a).trim();
  let m = /^'((?:''|[^'])*)'$/.exec(t);
  if (m) return m[1].replace(/''/g, "'");
  m = /^"([^"`]*)"$/.exec(t);
  return m ? m[1] : null;
}
// The PowerShell cmdlets: target parameters (with aliases), value parameters, switches, and the
// position of the target among the positional arguments.
const PS_CMDLETS = {
  'set-content': { name: 'Set-Content', targets: ['path', 'literalpath'], values: ['value', 'encoding', 'filter', 'include', 'exclude', 'credential', 'stream', 'delimiter'], switches: ['passthru', 'force', 'nonewline', 'asbytestream', 'whatif', 'confirm', 'usetransaction'] },
  'add-content': { name: 'Add-Content', targets: ['path', 'literalpath'], values: ['value', 'encoding', 'filter', 'include', 'exclude', 'credential', 'stream', 'delimiter'], switches: ['passthru', 'force', 'nonewline', 'asbytestream', 'whatif', 'confirm', 'usetransaction'] },
  'out-file': { name: 'Out-File', targets: ['filepath', 'literalpath'], aliases: { path: 'filepath' }, values: ['encoding', 'width', 'inputobject'], switches: ['append', 'force', 'noclobber', 'nonewline', 'whatif', 'confirm'] },
  'tee-object': { name: 'Tee-Object', targets: ['filepath', 'literalpath'], aliases: { path: 'filepath' }, values: ['variable', 'inputobject', 'encoding'], switches: ['append'] },
  'new-item': { name: 'New-Item', targets: ['path'], values: ['name', 'itemtype', 'value', 'credential', 'target'], aliases: { type: 'itemtype' }, switches: ['force', 'whatif', 'confirm'] },
  'copy-item': { name: 'Copy-Item', targets: ['destination'], values: ['path', 'literalpath', 'filter', 'include', 'exclude', 'credential', 'fromsession', 'tosession'], switches: ['container', 'force', 'recurse', 'passthru', 'whatif', 'confirm'] },
  'move-item': { name: 'Move-Item', targets: ['destination'], values: ['path', 'literalpath', 'filter', 'include', 'exclude', 'credential'], switches: ['force', 'passthru', 'whatif', 'confirm'] },
};
function psParse(args, spec) {
  const named = {}; const pos = [];
  const all = spec.targets.concat(spec.values, spec.switches);
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    const m = /^-([A-Za-z][A-Za-z0-9]*)(?::([\s\S]*))?$/.exec(a.v);
    if (!m) { pos.push(a); continue; }
    let nm = m[1].toLowerCase();
    nm = (spec.aliases && spec.aliases[nm]) || ({ pspath: 'literalpath', lp: 'literalpath' })[nm] || nm;
    if (all.indexOf(nm) === -1) { const hits = all.filter((p) => p.startsWith(nm)); nm = hits.length === 1 ? hits[0] : null; }
    if (nm && spec.switches.indexOf(nm) !== -1) continue;
    const val = m[2] !== undefined ? wordOf(m[2]) : args[++k];
    if (nm && val) (named[nm] = named[nm] || []).push(val); // an unknown parameter's value is swallowed: the target may then be absent
  }
  return { named, pos };
}
// A comma list of PowerShell paths, one word each.
const psPieces = (wds) => [].concat(...wds.map((w) => (w.v.indexOf(',') === -1 || w.q ? [w] : w.v.split(',').filter(Boolean).map((p) => Object.assign({}, w, { v: p })))));

// The deletion and move verbs (M34.1.A, V-4): their operands are victims, judged by the carve at
// step 2 in every state. The POSIX names, and the PowerShell cmdlets with their aliases (under
// tool_name PowerShell rm and rmdir are Remove-Item's; the operands read the same either way).
const DEL_VERBS = { rm: 'rm', rmdir: 'rmdir', unlink: 'unlink', shred: 'shred', truncate: 'truncate', 'remove-item': 'Remove-Item', del: 'Remove-Item', ri: 'Remove-Item', erase: 'Remove-Item', rd: 'Remove-Item', 'clear-content': 'Clear-Content', clc: 'Clear-Content' };
const DEL_VALUE_OPTS = { shred: /^-(?:[A-Za-z]*[ns]|-iterations|-size)$/, truncate: /^-(?:[A-Za-z]*[sr]|-size|-reference)$/ };
const PS_ONLY = new Set(['remove-item', 'del', 'ri', 'erase', 'rd', 'clear-content', 'clc', 'rename-item', 'ren', 'rni']);
const PS_MOVE_ALIASES = { mi: 'move-item', move: 'move-item' };
// M34.2.A (C1): the verbs xargs may carry whose operands then arrive on its input.
const XARGS_VICTIM = new Set(['rm', 'rmdir', 'unlink', 'shred', 'truncate', 'mv', 'rename']);
const XARGS_WRITE = new Set(['tee', 'cp', 'install']);
const RENAME_SPEC = { name: 'Rename-Item', targets: ['path', 'literalpath'], values: ['newname', 'credential'], switches: ['force', 'passthru', 'whatif', 'confirm', 'usetransaction'] };
const PWSH_VALUE_PARAMS = ['executionpolicy', 'windowstyle', 'workingdirectory', 'outputformat', 'inputformat', 'configurationname', 'configurationfile', 'version', 'settingsfile', 'custompipename', 'psconsolefile', 'sessionname'];
const PWSH_VALUE_ALIASES = ['ex', 'ep', 'w', 'wd', 'o', 'of', 'if', 'v'];
// Every operand: the words that are not options (a leading -), every word after --, and the value of
// a -Name:value form; `takes` names the options that take the next word.
function operands(as, takes) {
  const out = []; let only = false;
  for (let k = 0; k < as.length; k++) {
    const v = as[k].v;
    if (only) { out.push(as[k]); continue; }
    if (v === '--') { only = true; continue; }
    if (/^-[A-Za-z][\w-]*:./.test(v)) { out.push(wordOf(v.slice(v.indexOf(':') + 1))); continue; }
    if (v.startsWith('-') && v.length > 1) { if (takes && takes.test(v)) k++; continue; }
    out.push(as[k]);
  }
  return out;
}

function shellWrites(command, cwd0, tool, root, depth) {
  const lvl = depth || 0;
  const finds = [];
  let releaseGlob = false;
  let stageGlob = false; // M34.6.G: a glob that could expand to scripts/stage-active.cjs
  let moved = false;
  let cwd = cwd0 || null;
  const push = (construct, token, abs, extra) => finds.push(Object.assign({ construct, token, abs: abs || null }, extra || {}));
  const target = (construct, wd, ctx) => {
    if (!wd) { push(construct, '(none)', null); return; }
    if (wd.dup || NULL_TARGET.test(wd.v)) return;
    if (wd.sub || wd.vr || PCT_VAR.test(wd.v) || /\$\(|`/.test(wd.v)) { push(construct, wd.v, null); return; }
    if (GLOB_CHAR.test(wd.v)) { push(construct, wd.v, null, { glob: wd.v, cwd: ctx.cwd }); return; }
    push(construct, wd.v, shellPath(wd.v, ctx.cwd, ctx.tool));
  };
  // cp, mv, install, Copy-Item, Move-Item: a directory target lands each source at <dir>/<name>.
  const landings = (construct, srcs, dest, ctx) => {
    if (!dest) { push(construct, '(none)', null); return; }
    if (!readableWord(dest)) { target(construct, dest, ctx); return; }
    const abs = shellPath(dest.v, ctx.cwd, ctx.tool);
    if (!abs) { push(construct, dest.v, null); return; }
    if (!/[\\/]$/.test(dest.v) && !probeIsDir(abs)) { push(construct, dest.v, abs); return; }
    if (!srcs.length) { push(construct, '(none)', null); return; }
    for (const s of srcs) {
      if (!readableWord(s)) { push(construct, s.v, null); continue; }
      const base = path.basename(s.v.replace(/\\/g, '/').replace(/\/+$/, ''));
      push(construct, `${dest.v.replace(/[\\/]+$/, '')}/${base}`, path.join(abs, base));
    }
  };
  // git restore / checkout pathspecs: `.`, `:` magic or none cannot be read; a directory is judged
  // by a child name and by the control files it holds.
  const pathspec = (construct, wd, ctx) => {
    const v = wd.v;
    if (v === '.' || v === './' || v === '' || v.startsWith(':')) { push(construct, v, null); return; }
    if (!readableWord(wd)) { target(construct, wd, ctx); return; }
    const abs = shellPath(v, ctx.cwd, ctx.tool);
    if (!abs) { push(construct, v, null); return; }
    if (/[\\/]$/.test(v) || probeIsDir(abs)) push(construct, v, path.join(abs, '__any__'), { dir: abs });
    else push(construct, v, abs);
  };
  const literal = (construct, value, ctx) => (value === null ? push(construct, '(none)', null) : target(construct, wordOf(value), ctx));
  // A glob that could expand to a gate script (the release script, or since M34.6.G the stage
  // script) from this command's directory names it.
  const namesScript = (v, ctx, file) => {
    if (!root) return false;
    const re = globRe(v);
    if (!re) return false;
    const abs = path.join(root, 'scripts', file);
    if (re.test(fwd(abs))) return true;
    if (ctx.cwd) return re.test(fwd(path.relative(ctx.cwd, abs)));
    return (globRe(String(v).replace(/\\/g, '/').split('/').pop()) || /$^/).test(file);
  };
  const namesRelease = (v, ctx) => namesScript(v, ctx, 'approve-red.cjs');
  // M34.1.A (V-3): a body is a command list of its own, judged by this same function one level down.
  // Past BODY_DEPTH, never closed, or a wrapper's text that is not a literal: the body line at step 4.
  const literalWord = (wd) => !wd.sub && !wd.vr && !PCT_VAR.test(wd.v);
  const unreadBody = (tok) => finds.push({ construct: 'a command body', token: tok, abs: null, body: true });
  const judgeBody = (text, bodyTool, tok, ctx, open) => {
    if (open || lvl + 1 > BODY_DEPTH) { unreadBody(tok); return false; }
    const sub = shellWrites(text, ctx.cwd, bodyTool, root, lvl + 1);
    for (const f of sub.finds) finds.push(f);
    if (sub.releaseGlob) releaseGlob = true;
    if (sub.stageGlob) stageGlob = true;
    return sub.cwdMoved;
  };
  // M34.1.A (V-4): a victim of a deletion or a move (its source) - the carve judges it at step 2 in
  // every state: the path, a folder holding a control target, a glob that could reach one. `only` (a
  // move's destination, a new name): the path itself, never a folder. One the gate cannot read is
  // refused at step 4 while engaged.
  const victim = (construct, wd, ctx, only) => {
    if (!wd || wd.dup || NULL_TARGET.test(wd.v)) return;
    if (!literalWord(wd) || /\$\(|`/.test(wd.v)) { push(construct, wd.v, null, { victim: true }); return; }
    if (GLOB_CHAR.test(wd.v)) { push(construct, wd.v, null, ctx.cwd ? { victim: true, glob: wd.v, cwd: ctx.cwd, only: !!only } : { victim: true }); return; }
    const abs = shellPath(wd.v, ctx.cwd, ctx.tool);
    push(construct, wd.v, abs, abs ? { victim: true, only: !!only } : { victim: true });
  };
  const literalVictim = (construct, value, ctx, only) => (value === null ? push(construct, '(none)', null, { victim: true }) : victim(construct, wordOf(value), ctx, only));
  // M34.1.A (V-4), M34.2.A (Y-14): a command that removes the ignored files (git clean -x, git stash
  // -a) writes to the ignored control markers - judged by the flag, never an operand, naming the
  // first marker present.
  const ignoredVictim = (construct, g) => {
    const top = probeWalk(g.cwd || root || '') || root;
    const nm = top ? ['stage-active', 'stage-role', 'red-approved', 'role', 'settings.local.json'].find((n) => { try { fs.lstatSync(path.join(top, '.claude', n)); return true; } catch (_) { return false; } }) || 'stage-active' : null;
    if (nm) push(construct, `.claude/${nm}`, path.join(top, '.claude', nm), { victim: true, only: true });
    else push(construct, '(none)', null, { victim: true });
  };

  for (const c of shellCommands(command, tool)) {
    const ctx = { cwd, tool, root };
    for (const t of c.items) if (t.k === 'w' && !t.dup && /[*?[{]/.test(t.v) && namesRelease(t.v, ctx)) releaseGlob = true;
    for (const t of c.items) if (t.k === 'w' && !t.dup && /[*?[{]/.test(t.v) && namesScript(t.v, ctx, 'stage-active.cjs')) stageGlob = true;
    let blockMoved = false;
    for (const t of c.all) for (const b of t.bodies || []) if (judgeBody(b.text, b.tool, b.tok, ctx, b.open) && b.block) blockMoved = true;
    for (const b of c.hdBodies) judgeBody(b.text, b.tool, b.tok, ctx, b.open); // M34.2.A (V-5 i): an unquoted heredoc body's substitutions
    for (const r of c.reds) target(`the ${c.heredoc ? 'heredoc ' : ''}redirect '${r.op}'`, r.target, ctx);
    const cw0 = commandWord(c, tool);
    if (cw0.cwdUnknown) ctx.cwd = null;
    const cw = c.words[cw0.k];
    const name0 = cw ? path.basename(cw.v.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '') : '';
    // M34.2.A (V-6): under the PowerShell reading mv is Move-Item's alias, as mi and move are.
    const name = PS_MOVE_ALIASES[name0] || (tool === 'PowerShell' && name0 === 'mv' ? 'move-item' : name0);
    const args = c.words.slice(cw0.k + 1);
    // A cmdlet's operands keep the PowerShell reading under either tool name (M34.1.A, Q3).
    const psArgs = tool === 'PowerShell' ? args : args.map((a) => Object.assign({}, a, { v: a.pv }));
    const opts = (a) => a.v.startsWith('-') && a.v.length > 1;
    if (name === 'tee' && tool !== 'PowerShell') {
      const ops = args.filter((a) => !opts(a));
      if (!ops.length) push('tee', '(none)', null);
      for (const a of ops) target('tee', a, ctx);
    } else if (name === 'sed' || name === 'perl') {
      let inplace = false; let script = false; let only = false; const ops = [];
      for (let k = 0; k < args.length; k++) {
        const v = args[k].v;
        if (only || !opts(args[k])) { ops.push(args[k]); if (name === 'perl') only = true; continue; }
        if (v === '--') { only = true; continue; }
        if (v.startsWith('--')) {
          if (/^--in-place(=|$)/.test(v)) inplace = true;
          else if (/^--(?:expression|file)(=|$)/.test(v)) { script = true; if (v.indexOf('=') === -1) k++; } else if (v === '--line-length') k++;
          continue;
        }
        for (let j = 1; j < v.length; j++) {
          const ch = v[j];
          if (ch === 'i') { inplace = true; if (v === '-i' && name === 'sed' && args[k + 1] && args[k + 1].v === '') k++; break; } // -i '' (BSD sed)
          if (ch === 'e' || ch === 'f' || (name === 'perl' && ch === 'E')) { script = true; if (j === v.length - 1) k++; break; }
          if (ch === 'l' && name === 'sed') { if (j === v.length - 1) k++; break; }
          if (name === 'perl' && 'IMm'.indexOf(ch) !== -1) { if (j === v.length - 1) k++; break; }
          if (name === 'perl' && 'Flx0'.indexOf(ch) !== -1) break;
        }
      }
      if (inplace) {
        const files = script ? ops : ops.slice(1);
        if (!files.length) push(`${name} -i`, '(none)', null);
        for (const a of files) target(`${name} -i`, a, ctx);
      }
    } else if (name === 'cp' || name === 'mv' || name === 'install') {
      let dirOnly = false; let tdir = null; let only = false; const ops = [];
      const argOpts = name === 'install' ? 'tSmog' : 'tS';
      for (let k = 0; k < args.length; k++) {
        const v = args[k].v;
        if (only || !opts(args[k])) { ops.push(args[k]); continue; }
        if (v === '--') { only = true; continue; }
        if (v.startsWith('--')) {
          const m = /^--target-directory(?:=([\s\S]*))?$/.exec(v);
          if (m) tdir = m[1] !== undefined ? wordOf(m[1]) : args[++k] || null;
          else if (v === '--directory') dirOnly = true;
          else if (/^--(?:suffix|mode|owner|group)$/.test(v)) k++;
          continue;
        }
        for (let j = 1; j < v.length; j++) {
          const ch = v[j];
          if (ch === 'd' && name === 'install') dirOnly = true;
          if (argOpts.indexOf(ch) !== -1) {
            const val = j < v.length - 1 ? wordOf(v.slice(j + 1)) : args[++k] || null;
            if (ch === 't') tdir = val;
            break;
          }
        }
      }
      if (!dirOnly) {
        if (tdir) landings(name, ops, Object.assign({}, tdir, { v: tdir.v.replace(/[\\/]*$/, '/') }), ctx);
        else if (ops.length < 2) push(name, '(none)', null);
        else landings(name, ops.slice(0, -1), ops[ops.length - 1], ctx);
      }
      // M34.1.A (V-4): a move's sources are victims - the carve, never B's path rule.
      if (name === 'mv') for (const s of tdir ? ops : ops.slice(0, -1)) victim('mv', s, ctx);
    } else if (name === 'node' || name === 'python' || name === 'python3') {
      let code = null;
      let construct = name === 'node' ? 'node -e' : `${name} -c`;
      for (let k = 0; k < args.length && code === null; k++) {
        const v = args[k].v;
        if (name === 'node') {
          if (v === '-e' || v === '--eval') code = args[k + 1] ? args[k + 1].v : '';
          else if (/^--eval=/.test(v)) code = v.slice(7);
          // M34.2.A (Y-13): -p and --print evaluate their text as -e does (and print the result).
          else if (v === '-p' || v === '--print' || v === '-pe' || v === '-ep') { code = args[k + 1] ? args[k + 1].v : ''; construct = 'node -p'; }
          else if (/^--print=/.test(v)) { code = v.slice(8); construct = 'node -p'; }
        } else if (/^-[A-Za-z]*c$/.test(v)) code = args[k + 1] ? args[k + 1].v : '';
      }
      const re = /writeFileSync\s*\(|writeFile\s*\(|appendFileSync\s*\(|\bopen\s*\(|\.write_text\s*\(/g;
      let m;
      while (code !== null && (m = re.exec(code))) {
        const a = callArgs(code, code.indexOf('(', m.index));
        if (/^\.write_text/.test(m[0])) {
          const pm = /(?:Path|PurePath|PosixPath|WindowsPath)\(\s*([rRbBuU]{0,2}(['"])(?:\\[\s\S]|(?!\2)[^\\])*\2)\s*\)\s*$/.exec(code.slice(0, m.index));
          literal(construct, pm ? literalOf(pm[1]) : null, ctx);
          continue;
        }
        if (/^open/.test(m[0])) {
          const kw = a.find((x) => /^\s*mode\s*=/.test(x));
          const modeArg = kw ? kw.replace(/^\s*mode\s*=/, '') : (a[1] !== undefined && !/^\s*\w+\s*=/.test(a[1]) ? a[1] : null);
          if (modeArg === null) continue; // a read
          const mode = literalOf(modeArg);
          if (mode !== null && !/[wax+]/.test(mode)) continue;
        }
        literal(construct, literalOf(a[0] || ''), ctx);
      }
      // M34.1.A (V-4): node's removal and rename calls with a literal argument are victims (a rename's
      // second argument the path itself only); a call whose argument is not a literal cannot be read.
      const rx = /\b(rmSync|unlinkSync|renameSync|rmdirSync|rm|unlink|rename|rmdir)\s*\(/g;
      let mr;
      while (name === 'node' && code !== null && (mr = rx.exec(code))) {
        const a = callArgs(code, code.indexOf('(', mr.index));
        literalVictim(construct, literalOf(a[0] || ''), ctx);
        if (/^rename/.test(mr[1])) literalVictim(construct, literalOf(a[1] || ''), ctx, true);
      }
    } else if (PS_CMDLETS[name] || (name === 'tee' && tool === 'PowerShell')) {
      const spec = PS_CMDLETS[name] || PS_CMDLETS['tee-object'];
      const construct = name === 'tee' ? 'tee' : spec.name;
      const { named, pos } = psParse(psArgs, spec);
      const pick = (keys) => [].concat(...keys.map((key) => named[key] || []));
      if (spec.name === 'New-Item') {
        const type = named.itemtype && named.itemtype[0] ? named.itemtype[0].v : '';
        if (!/^d/i.test(type)) {
          const paths = psPieces(named.path || (pos.length ? [pos.shift()] : []));
          const nm = named.name && named.name[0];
          if (nm) for (const p of paths.length ? paths : [wordOf('.')]) target(construct, Object.assign({}, nm, { v: `${p.v.replace(/[\\/]+$/, '')}/${nm.v}`, sub: p.sub || nm.sub, vr: p.vr || nm.vr }), ctx);
          else if (!paths.length) push(construct, '(none)', null);
          else for (const p of paths) target(construct, p, ctx);
        }
      } else if (spec.name === 'Copy-Item' || spec.name === 'Move-Item') {
        const srcs = psPieces(named.path || named.literalpath || (pos.length ? [pos.shift()] : []));
        const dest = named.destination ? named.destination[0] : pos.shift();
        landings(construct, srcs, dest || null, ctx);
        if (spec.name === 'Move-Item') for (const s of srcs) victim('Move-Item', s, ctx); // M34.1.A (V-4)
        // M34.2.A (V-6): no source operand - the item arrives on the pipeline, a victim the gate cannot read.
        if (spec.name === 'Move-Item' && !srcs.length) push('Move-Item', '(none)', null, { victim: true });
      } else {
        const tg = psPieces(pick(spec.targets));
        if (tg.length) for (const t of tg) target(construct, t, ctx);
        else if (pos.length) for (const t of psPieces([pos[0]])) target(construct, t, ctx);
        else if (!(spec.name === 'Tee-Object' && named.variable)) push(construct, '(none)', null);
      }
    } else if (name === 'git') {
      let k = 0; let gcwd = ctx.cwd;
      while (k < args.length) {
        const v = args[k].v;
        if (v === '-C') { const d = args[k + 1]; gcwd = d && readableWord(d) ? shellPath(d.v, gcwd, tool) : null; k += 2; continue; }
        if (/^(?:-c|--git-dir|--work-tree|--namespace|--super-prefix|--config-env)$/.test(v)) { k += 2; continue; }
        if (v.startsWith('-')) { k++; continue; }
        break;
      }
      const verb = args[k] ? args[k].v : '';
      const rest = args.slice(k + 1);
      const g = { cwd: gcwd, tool, root };
      if (verb === 'apply') {
        let check = false; let apply = false; let strip = 1; let dir = ''; let only = false; const patches = [];
        for (let j = 0; j < rest.length; j++) {
          const v = rest[j].v; let m;
          if (only || !v.startsWith('-') || v === '-') { patches.push(rest[j]); continue; }
          if (v === '--') only = true;
          else if (/^--(?:check|stat|numstat|summary)$/.test(v)) check = true;
          else if (v === '--apply') apply = true;
          else if ((m = /^-p(\d+)$/.exec(v))) strip = Number(m[1]);
          else if (v === '-p' && rest[j + 1] && /^\d+$/.test(rest[j + 1].v)) strip = Number(rest[++j].v);
          else if ((m = /^--directory=([\s\S]*)$/.exec(v))) dir = m[1];
          else if (v === '--directory') dir = rest[++j] ? rest[j].v : '';
          else if (/^--(?:exclude|include|whitespace|build-fake-ancestor)$/.test(v)) j++;
        }
        if (!check || apply) {
          if (!patches.length) push('git apply', '(none)', null);
          for (const p of patches) {
            if (p.v === '-' || !readableWord(p)) { push('git apply', p.v, null); continue; }
            const abs = shellPath(p.v, g.cwd, tool);
            let text = null;
            if (abs && patchHome(abs, root)) {
              try { const st = fs.statSync(abs); if (st.isFile() && st.size <= PROBE_MAX_BYTES) text = probeDecode(fs.readFileSync(abs)); } catch (_) { text = null; }
            }
            const files = text === null ? [] : patchPaths(text, strip, dir);
            if (!files.length) { push('git apply', p.v, null); continue; }
            const top = probeWalk(g.cwd || path.dirname(abs)) || root; // patch paths are relative to the work tree's top
            for (const f of files) push('git apply', f, top ? path.resolve(top, f) : null);
          }
        }
      } else if (verb === 'restore') {
        let staged = false; let worktree = false; let only = false; let fromFile = null; const specs = [];
        for (let j = 0; j < rest.length; j++) {
          const v = rest[j].v;
          if (only || !opts(rest[j])) { specs.push(rest[j]); continue; }
          if (v === '--') only = true;
          else if (v === '--staged') staged = true;
          else if (v === '--worktree') worktree = true;
          else if (/^--pathspec-from-file(=|$)/.test(v)) fromFile = v.indexOf('=') !== -1 ? v.slice(v.indexOf('=') + 1) : (rest[++j] ? rest[j].v : '(none)');
          else if (/^--(?:source|conflict)$/.test(v)) j++;
          else if (!v.startsWith('--')) {
            for (let x = 1; x < v.length; x++) { if (v[x] === 'S') staged = true; else if (v[x] === 'W') worktree = true; else if (v[x] === 's') { if (x === v.length - 1) j++; break; } }
          }
        }
        if (!staged || worktree) {
          if (fromFile !== null) push('git restore', fromFile, null);
          else if (!specs.length) push('git restore', '(none)', null);
          for (const s of specs) pathspec('git restore', s, g);
        }
      } else if (verb === 'checkout') {
        const dd = rest.findIndex((a) => a.v === '--');
        if (dd !== -1) {
          const specs = rest.slice(dd + 1);
          if (!specs.length) push('git checkout', '(none)', null);
          for (const s of specs) pathspec('git checkout', s, g);
        } else {
          // With no --, an operand that is an existing file inside a root is a pathspec (its
          // existence rules out the ref reading); anything else is a ref and is not judged.
          for (let j = 0; j < rest.length; j++) {
            const a = rest[j]; const v = a.v;
            if (/^(?:-b|-B|--orphan)$/.test(v)) { j++; continue; }
            if (v.startsWith('-')) continue;
            if (v === '.' || (/[*?[]/.test(v) && !a.sub && !a.vr)) { pathspec('git checkout', a, g); continue; } // never a ref
            if (!readableWord(a)) continue;
            const abs = shellPath(v, g.cwd, tool);
            let file = false; try { file = !!abs && fs.statSync(abs).isFile(); } catch (_) { file = false; }
            if (file && probeWalk(path.dirname(abs))) push('git checkout', v, abs);
          }
        }
      } else if (verb === 'rm' || verb === 'mv') {
        // M34.1.A (V-4): git rm's pathspecs and git mv's operands are victims (git mv's last operand,
        // its destination, the path itself only); a dry run (-n) removes nothing and is not judged.
        const dry = rest.some((a) => a.v === '--dry-run' || /^-[A-Za-z]*n[A-Za-z]*$/.test(a.v));
        if (!dry) {
          const pf = rest.find((a) => /^--pathspec-from-file(=|$)/.test(a.v));
          if (pf) push(`git ${verb}`, pf.v, null, { victim: true });
          const ops = operands(rest);
          ops.forEach((a, j) => victim(`git ${verb}`, a, g, verb === 'mv' && ops.length > 1 && j === ops.length - 1));
        }
      } else if (verb === 'clean') {
        // M34.1.A (V-4): -x or -X removes the ignored files, the kit's markers among them: a write to
        // the control set, judged by the flag, never an operand. -n (a dry run) removes nothing.
        let x = false; let dry = false;
        for (let j = 0; j < rest.length; j++) {
          const v = rest[j].v;
          if (v === '--') break;
          if (v === '--dry-run') dry = true;
          else if (v === '--exclude') j++;
          else if (/^-[^-]/.test(v)) {
            for (let q = 1; q < v.length; q++) {
              const ch = v[q];
              if (ch === 'e') { if (q === v.length - 1) j++; break; }
              if (ch === 'n') dry = true;
              if (ch === 'x' || ch === 'X') x = true;
            }
          }
        }
        if (x && !dry) ignoredVictim('git clean -x', g);
      } else if (verb === 'stash') {
        // M34.2.A (Y-14): git stash (bare, push or save) with -a or --all stashes the ignored files
        // and removes them from the tree, the markers among them: judged as git clean -x is.
        const sub = rest[0] && !rest[0].v.startsWith('-') ? rest[0].v : null;
        if (sub === null || sub === 'push' || sub === 'save') {
          let all = false;
          for (const a of sub === null ? rest : rest.slice(1)) {
            const v = a.v;
            if (v === '--') break;
            if (v === '--all') all = true;
            else if (/^-[A-Za-z]+$/.test(v)) for (const ch of v.slice(1)) { if (ch === 'm') break; if (ch === 'a') all = true; }
          }
          if (all) ignoredVictim('git stash -a', g);
        }
      }
    } else if (DEL_VERBS[name]) {
      // M34.1.A (V-4): every operand of a deletion is a victim.
      const psr = tool === 'PowerShell' || PS_ONLY.has(name);
      const ops = operands(psr ? psArgs : args, DEL_VALUE_OPTS[name]);
      // M34.2.A (V-6): under the PowerShell reading a removal with no path operand takes its item
      // from the pipeline - a victim the gate cannot read.
      if (!ops.length && psr) push(DEL_VERBS[name], '(none)', null, { victim: true });
      // M34.2.A (the harness's finding): truncate and Clear-Content rewrite the file's bytes, so an
      // operand is a write target too, judged by the path rule beside the carve.
      const rewrites = name === 'truncate' || DEL_VERBS[name] === 'Clear-Content';
      for (const a of ops) { victim(DEL_VERBS[name], a, ctx); if (rewrites) target(DEL_VERBS[name], a, ctx); }
    } else if (name === 'xargs') {
      // M34.2.A (C1): xargs hands its carried command operands from its input - paths the gate
      // cannot read. A carried removal or move verb is an unreadable victim, a carried write verb an
      // unreadable target; the carried command's literal words are judged as a body besides.
      let k = 0;
      for (; k < args.length; k++) {
        const v = args[k].v;
        if (v === '--') { k++; break; }
        if (!/^-/.test(v)) break;
        if (/^-[IdELnPsa]$/.test(v) || /^--(?:replace|delimiter|eof|max-lines|max-args|max-procs|max-chars|arg-file|process-slot-var)$/.test(v)) k++;
      }
      const carried = args.slice(k);
      const cv = carried[0] ? path.basename(carried[0].v.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '') : '';
      const inplace = carried.slice(1).some((a) => /^-[A-Za-z]*i/.test(a.v) || /^--in-place/.test(a.v));
      if (XARGS_VICTIM.has(cv)) push(cv, '(none)', null, { victim: true });
      else if (XARGS_WRITE.has(cv)) push(cv, '(none)', null);
      else if ((cv === 'sed' || cv === 'perl') && inplace) push(`${cv} -i`, '(none)', null);
      if (carried.length && carried.every(literalWord)) { const text = carried.map((a) => a.raw).join(' '); judgeBody(text, tool, text, ctx, false); }
    } else if (name === 'rename') {
      for (const a of operands(args)) victim('rename', a, ctx);
    } else if (name === 'rename-item' || name === 'ren' || name === 'rni') {
      const { named, pos } = psParse(psArgs, RENAME_SPEC);
      const item = (named.path || named.literalpath || [])[0] || pos.shift() || null;
      const nn = (named.newname || [])[0] || pos.shift() || null;
      victim('Rename-Item', item, ctx);
      if (nn) {
        const abs = item && literalWord(item) && literalWord(nn) && !GLOB_CHAR.test(item.v) ? shellPath(item.v, ctx.cwd, ctx.tool) : null;
        if (abs) push('Rename-Item', nn.v, path.join(path.dirname(abs), nn.v), { victim: true, only: true });
        else push('Rename-Item', nn.v, null, { victim: true });
      }
    } else if (name === 'bash' || name === 'sh' || name === 'zsh') {
      // M34.1.A (V-3 iv): -c's text, when it is a literal, is a body read by the Bash rules.
      let isC = false; let k = 0;
      for (; k < args.length; k++) {
        const v = args[k].v;
        if (v === '--' || v === '-') { k++; break; }
        if (/^--(?:rcfile|init-file)$/.test(v)) { k++; continue; }
        if (/^--/.test(v)) continue;
        if (/^[-+][A-Za-z]+$/.test(v)) { if (/[oO]$/.test(v)) k++; if (v[0] === '-' && v.indexOf('c') !== -1) isC = true; continue; }
        break;
      }
      if (isC) {
        const wd = args[k] || null;
        if (!wd) unreadBody('(none)');
        else if (!literalWord(wd)) unreadBody(wd.v);
        else judgeBody(wd.v, 'Bash', wd.v, ctx, false);
      }
    } else if (name === 'eval') {
      const bad = args.find((a) => !literalWord(a));
      if (bad) unreadBody(bad.v);
      else if (args.length) { const text = args.map((a) => a.v).join(' '); judgeBody(text, 'Bash', text, ctx, false); }
    } else if (name === 'pwsh' || name === 'powershell') {
      // -c / -Command (any unique prefix): the rest of the line is a body read by the PowerShell
      // rules; -EncodedCommand cannot be read; -File (pwsh's first positional) is a script run.
      let k = 0; let mode = null;
      for (; k < args.length; k++) {
        const v = args[k].v;
        if (!/^[-/]./.test(v)) { if (name === 'powershell') mode = 'command'; break; } // Windows PowerShell's first positional is -Command
        const p = v.slice(1).split(':')[0].toLowerCase();
        if (/^c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/.test(p)) { mode = 'command'; k++; break; }
        if (/^(?:e|ec|en|enc|enco|encod|encode|encoded\w*)$/.test(p)) { mode = 'encoded'; break; }
        if (/^f(?:i(?:l(?:e)?)?)?$/.test(p)) { mode = 'file'; break; }
        if (PWSH_VALUE_ALIASES.indexOf(p) !== -1 || PWSH_VALUE_PARAMS.some((n) => n === p || (p.length >= 3 && n.startsWith(p)))) k++;
      }
      if (mode === 'encoded') unreadBody(args[k + 1] ? args[k + 1].v : '(none)');
      else if (mode === 'command') {
        const rest = args.slice(k);
        if (!rest.length) unreadBody('(none)');
        else if (rest[0].v !== '-') { // `-Command -` reads stdin: a script fed on stdin, not judged
          const bad = rest.find((a) => !literalWord(a));
          if (bad) unreadBody(bad.v);
          else { const text = rest.map((a) => a.v).join(' '); judgeBody(text, 'PowerShell', text, ctx, false); }
        }
      }
    }
    // [IO.File]::WriteAllText('<path>', ...) anywhere in the command.
    const io = /\[(?:System\.)?IO\.File\]::WriteAllText\s*\(/gi;
    let mm;
    while ((mm = io.exec(c.raw))) literal('[IO.File]::WriteAllText', psLiteralOf(callArgs(c.raw, c.raw.indexOf('(', mm.index))[0] || ''), ctx);
    // M34.1.A (V-4): [IO.File]::Delete and ::Move and [IO.Directory]::Delete, a literal argument each.
    const iod = /\[(?:System\.)?IO\.(File|Directory)\]::(Delete|Move)\s*\(/gi;
    while ((mm = iod.exec(c.raw))) {
      const a = callArgs(c.raw, c.raw.indexOf('(', mm.index));
      const construct = `[IO.${mm[1]}]::${mm[2]}`;
      literalVictim(construct, psLiteralOf(a[0] || ''), ctx);
      if (/^move$/i.test(mm[2])) literalVictim(construct, psLiteralOf(a[1] || ''), ctx, true);
    }
    // A literal cd moves the directory for the commands after it; one inside parentheses, in a
    // pipeline, sent to the background or with an operand the gate cannot read leaves it unknown.
    // A PowerShell script block that moved it leaves it unknown too (M34.1.A).
    if (blockMoved) cwd = null;
    if (/^(?:cd|pushd|chdir|set-location|sl)$/.test(name)) {
      moved = true;
      if (c.paren || c.before === '|' || c.after === '|' || c.after === '&') cwd = null;
      else {
        const ps = psParse(args, { targets: ['path', 'literalpath'], values: [], switches: ['passthru'] });
        const op = (ps.named.path || ps.named.literalpath || [])[0] || ps.pos[0];
        if (!op) { if (tool === 'PowerShell') cwd = null; else { let h = null; try { h = os.homedir(); } catch (_) { h = null; } cwd = h || null; } }
        else cwd = op.v === '-' || !readableWord(op) ? null : shellPath(op.v, cwd, tool);
      }
    } else if (name === 'popd') { moved = true; cwd = null; }
  }
  return { finds, releaseGlob, stageGlob, cwdMoved: moved };
}
// A directory pathspec that holds a control target -> that target's repo-relative form, or null.
function dirControl(dir, roots) {
  for (const r of roots) {
    if (!r) continue;
    const rel = normRel(path.relative(r, dir)).toLowerCase();
    if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) continue;
    const pre = rel === '' || rel === '.' ? '' : rel.replace(/\/+$/, '') + '/';
    const hit = PROBE_CONTROL_FILES.map((nm) => '.claude/' + nm).concat(PROBE_CONTROL_PATHS).find((t) => t.startsWith(pre));
    if (hit) return hit;
  }
  return null;
}
// A glob target that could expand, from its directory, to a control target -> that target. With
// `folders` (a deletion's victim, M34.1.A) a glob that could expand to a folder holding the control
// set (.claude, .claude/hooks, sbak) reaches it too.
const CONTROL_FOLDERS = [['.claude', '.claude/settings.json'], ['.claude/hooks', '.claude/hooks'], ['sbak', 'sbak/release-manifest.json']];
function globControl(glob, cwd, roots, folders) {
  if (!cwd) return null;
  const re = globRe(glob);
  if (!re) return null;
  for (const r of roots) {
    if (!r) continue;
    const cands = PROBE_CONTROL_FILES.map((nm) => '.claude/' + nm).concat(PROBE_CONTROL_PATHS);
    try { for (const e of fs.readdirSync(path.join(r, '.claude', 'hooks'))) cands.push(`.claude/hooks/${e}`); } catch (_) { /* no hooks folder */ }
    try { for (const e of fs.readdirSync(path.join(r, '.claude'))) if (PROBE_CONTROL_FILE_RE.test(e.toLowerCase())) cands.push(`.claude/${e}`); } catch (_) { /* no .claude folder */ }
    for (const t of cands) {
      const abs = path.join(r, ...t.split('/'));
      if (re.test(fwd(path.relative(cwd, abs))) || re.test(fwd(abs))) return t.startsWith('.claude/hooks/') ? '.claude/hooks' : t;
    }
    if (folders) {
      for (const [dir, t] of CONTROL_FOLDERS) {
        const abs = path.join(r, ...dir.split('/'));
        if (re.test(fwd(path.relative(cwd, abs))) || re.test(fwd(abs))) return t;
      }
    }
  }
  return null;
}

// judge(root, st, rawPath) -> null (this root does not block) or the one refusal line, from THIS
// root's own state (the probe's). main() asks it about every root whose stage is open: the
// target's root and the session's root. A shell write construct's literal target (M34.B) is judged
// here too, unchanged; `construct` only names it in the line.
function judge(root, st, rawPath, construct) {
  const claudeDir = path.join(root, '.claude');

  // (1)-(3): a stage opened by a work session (or with an unresolved or absent stage-role, which
  //     fail CLOSED by engaging, DF-005 and M33.A) and not red-approved for THIS exact stage.
  //     The role judged is .claude/stage-role, the one recorded at open, never the live role.
  //     M34.C: an approved work stage is judged too, by the record its marker binds (case 3).
  const approvedWork = st.kind === 'active' && !engaged(st) && st.approved === st.stage && (st.role === null || ['work', 'unresolved'].indexOf(classifyRole(st.role)) !== -1);
  if (!engaged(st) && !approvedWork) return null;

  // (4) non-implementation path (tests / docs / .claude / allow-listed) -> allow.
  //     Relativize first (PROC-003) so an absolute tool path matches the repo-relative globs.
  //     M32.1.B (V-3): the path is ALSO read in its real form - the realpath of its nearest
  //     existing ancestor - so a new file written through a link planted in a scratch home is
  //     judged where it really lands. (The control files were refused before this, by the probe.)
  const relPath = toRepoRel(rawPath, root);
  const absTarget = path.resolve(root, String(rawPath));
  const realAbs = hookRoot.realOrLexical(absTarget);
  const realRel = path.relative(hookRoot.realOrLexical(root), realAbs);

  // M32.H: the scratch homes, then the repo boundary. A relative tool path is repo-relative,
  // exactly as toRepoRel reads it. A home is matched on the target's real form, so a link
  // planted in a home cannot carry an edit into the implementation tree.
  const lexTarget = caseFold(absTarget);
  const realTarget = caseFold(realAbs);
  if (scratchHomes(root).some((h) => isUnder(realTarget, rootForms(h)))) return null;
  const repoForms = rootForms(root);
  const outside = !isUnder(lexTarget, repoForms) && !isUnder(realTarget, repoForms);

  // An outside-repo path never reaches the allow globs: `**/*.md` would match its `../` form.
  // Inside the repo the globs read the path the edit really lands on.
  const globRel = isUnder(realTarget, repoForms) ? realRel : relPath;
  if (!outside && isAllowedPath(globRel, loadAllowGlobs(claudeDir))) return null;

  // M34.C: an approved stage's implementation edit stands only while the approval does - the
  // record the marker binds, its files as approved or acked, no void after it.
  if (approvedWork) return approvalVoidLine(root, st);
  // After the human's void, the refusal names the void and its reason.
  const voided = outside ? null : explicitVoidLine(root, st);
  if (voided) return voided;

  // All four confirmed -> a refusal. Two messages: outside the repo, or an implementation path.
  // M30.I (audit row 27): one plain sentence + the command when it bites (the process-gate
  // honest-scope caveat lives in the /approve-red skill doc, not in every refusal).
  return outside
    ? `[red-gate] Outside-repo edit blocked — ${construct ? `${construct} writes '${absTarget}', which` : `'${absTarget}'`} is neither inside the repo nor in a scratch home; during an open un-approved stage the only writable places outside the repo are the session scratchpad (<tmpdir>/claude/...), <repo>/.claude/measurements/<stage>/, and Claude Code's memory and plan folders (~/.claude/projects/, ~/.claude/plans/).\n`
    : `[red-gate] Implementation edit blocked — ${construct ? `${construct} writes '${normRel(globRel)}', an implementation path, and` : `'${normRel(globRel)}' is an implementation path and`} stage ${st.stage}'s RED tests are not approved yet; after the human reviews them they run /approve-red (or: node scripts/approve-red.cjs --stage <id> --release-seq <n>).\n`;
}

function main() {
  // The payload, the roots and the state - the probe alone, before any judgment.
  const input = probeStdin();
  let payload = null;
  let fault = null;
  if (input.over) fault = 'the hook payload is over 8 MiB';
  else {
    try {
      const p = JSON.parse(input.text);
      payload = (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
    } catch (_) { payload = null; }
    if (!payload) fault = 'the hook payload is not a JSON object';
  }
  const cwd = payload && typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : probeCwd();
  const root = probeWalk(cwd) || probeWalk(path.join(__dirname, '..'));
  const tool = payload && typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (!fault && !tool) fault = 'the hook payload names no tool_name';
  const ti = payload && payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const shell = SHELL_TOOLS.test(tool);
  const rawPath = shell ? null : [ti.file_path, ti.notebook_path, ti.path].find((p) => typeof p === 'string' && p.length > 0) || null;
  if (!fault && !shell && !rawPath && EDIT_TOOLS.test(tool)) fault = `the ${tool} payload carries no file path`;
  if (!fault && !root) fault = 'no project root above the payload cwd or the hook\'s own folder (no .git, no .claude/ control file)';
  // An absolute target is owned by the repo above it (R-36); a relative one by the session's root.
  const targetRoot = rawPath && path.isAbsolute(rawPath) ? probeWalk(path.dirname(probeRealForm(rawPath))) : null;
  // The shell write gate (M34.B): every recognised write construct in the call; each literal target
  // is one absolute path, owned by the repo above it as an absolute edit-tool path is.
  const writes = shell && typeof ti.command === 'string' ? shellWrites(ti.command, cwd, tool, root) : { finds: [], releaseGlob: false, stageGlob: false };
  for (const f of writes.finds) f.root = f.abs ? probeWalk(path.dirname(probeRealForm(f.abs))) : null;
  const roots = [];
  if (!fault) {
    const want = targetRoot && !probeSame(targetRoot, root) ? [targetRoot, root] : [root];
    for (const f of writes.finds) if (f.root && !want.some((w) => probeSame(w, f.root))) want.push(f.root);
    for (const r of want) {
      const st = probeState(r);
      if (st.kind === 'unknown') { fault = probeSame(r, root) ? st.fault : `${st.fault} in ${r}`; break; }
      roots.push({ root: r, st });
    }
  }
  const stOf = (r) => { const x = r ? roots.find((y) => probeSame(y.root, r)) : null; return x ? x.st : null; };
  // M34.6.B: what the judgment row names (written by refuse() and allow(), never deciding).
  Object.assign(JUDGED, { root, payload, tool, target: rawPath || ((writes.finds.find((f) => f.abs) || {}).abs) || null, st: stOf(root), fault: !!fault });

  // 1. The repair exemption: the exact form, from the project root, the script authenticated.
  let repairDenied = null;
  if (shell && repairForm(ti.command) && root && probeSame(cwd, root)) {
    repairDenied = repairCause(root);
    if (!repairDenied) allow();
  }

  // The resolver, once a stage is known to be open (a missing one is the unknown state).
  if (!fault && roots.some((x) => x.st.kind === 'active')) {
    try {
      hookRoot = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'hook-root.cjs'));
    } catch (e) {
      fault = e && e.code === 'MODULE_NOT_FOUND' && /hook-root\.cjs/.test(String(e.message))
        ? 'the resolver scripts/lib/hook-root.cjs is missing'
        : `the resolver scripts/lib/hook-root.cjs threw at load: ${oneLine(String((e && e.message) || e).split('\n')[0])}`;
    }
  }

  // 2. The control-file carve, in every state. M34.C: settings.json is no longer excepted while
  //    confirmed inactive - Phase 3 places it through kit-update --place-settings (the door).
  if (rawPath) {
    const ctl = probeControl(rawPath, [targetRoot, root]);
    if (ctl) refuse(controlLine(ctl));
  }
  // ... and for a shell write construct's target: a literal path as above, a directory pathspec by
  // the control targets it holds, a glob by the control targets it could expand to. M34.1.A (V-4):
  // the victim of a deletion or a move the same way, its folder always (`rm -rf .claude`), a glob to
  // the folders that hold the set too; a nested construct's (V-3) like any other.
  for (const f of writes.finds) {
    let ctl = null;
    if (f.abs) JUDGED.target = f.abs;
    if (f.abs) {
      ctl = probeControl(f.abs, [f.root, root]);
      if (!ctl && (f.dir || (f.victim && !f.only))) ctl = dirControl(f.dir || f.abs, [f.root, root]);
    } else if (f.glob) ctl = globControl(f.glob, f.cwd, [root], f.victim && !f.only);
    if (ctl) refuse(controlLine(ctl, f.construct, f.victim));
  }

  // 3. The unknown state.
  if (fault) { JUDGED.fault = true; refuse(repairDenied ? HUMAN_PATH_LINES[repairDenied] : unknownLine(fault)); }

  // 4 and 5. A known state: today's judgment where a work stage is open and unapproved.
  if (shell) {
    if (repairDenied && roots.some((x) => engaged(x.st))) refuse(HUMAN_PATH_LINES[repairDenied]);
    const release = releaseRefusal(ti.command, writes.releaseGlob, tool);
    if (release) refuse(release);
    // M34.6.G: the stage script by the same rule, judged after the release (a command naming both
    // gets the release's line). M34.6.I: both read the one read-only guard by the call's tool.
    const stage = stageRefusal(ti.command, writes.stageGlob, tool);
    if (stage) refuse(stage);
    // M34.6.J (item 2): under the PowerShell tool a command that names a red-gate control file runs only
    // as one of the two bare forms the kit prints (gate 1 Q2); no reading decides it, in every known
    // state. A literal write to one was refused at step 2 already, with the control-file line.
    if (tool === 'PowerShell' && typeof ti.command === 'string') {
      const nm = psControlName(ti.command);
      if (nm && !psKitForm(ti.command)) refuse(psReadLine(nm));
    }
    // The shell write gate (M34.B): each literal target by judge(), from its own root and the
    // session's; a target the gate cannot read is refused while the session's stage is engaged.
    const sess = stOf(root);
    for (const f of writes.finds) {
      if (!f.abs) {
        if (f.victim && f.glob) continue; // a victim's glob: the carve read it at step 2 and cleared it
        if (sess && engaged(sess)) refuse(f.body ? bodyLine(f.token) : unreadLine(f.construct, f.token));
        // M34.C: a void approval engages the gate again, for an unreadable target too.
        const v = sess && sess.kind === 'active' && sess.binding && sess.approved === sess.stage ? approvalVoidLine(root, sess) : null;
        if (v) refuse(v);
        continue;
      }
      if (f.victim) continue; // a victim is the carve's alone (step 2): a deletion of a non-control path is not judged
      JUDGED.target = f.abs;
      for (const r of f.root && !probeSame(f.root, root) ? [f.root, root] : [root]) {
        const st = stOf(r);
        const refusal = st && st.kind === 'active' ? judge(r, st, f.abs, f.construct) : null;
        if (refusal) refuse(refusal); // the target's refusal named first
      }
    }
    allow();
  }
  if (rawPath) {
    for (const x of roots) {
      const refusal = x.st.kind === 'active' ? judge(x.root, x.st, rawPath) : null;
      if (refusal) refuse(refusal); // the target's refusal named first
    }
  }
  allow();
}

// Run as a hook: any internal error is the unknown state, refused with the error named. Required
// as a module (the lockstep pins), it exports the probe's copies and runs nothing.
if (require.main === module) {
  try { main(); } catch (e) { refuse(unknownLine(`the gate threw: ${(e && e.message) || e}`)); }
} else {
  module.exports = { probeWalk, probeRealForm, payloadHash, probeRowHash, PROBE_CONTROL_FILES, PROBE_CONTROL_PATHS, PROBE_CONTROL_LIST_GLOB };
}
