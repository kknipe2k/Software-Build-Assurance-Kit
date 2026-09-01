#!/usr/bin/env node
// @kit-version 1.0.5
// scripts/set-mode.cjs
//
// Atomic writer for the session ROLE dial (.claude/role). This is the SOURCE-side
// half of the ERR-002 fix: `.claude/role` is canonical BARE-TOKEN state, and the
// only supported way to set it.
//
// I9 RENAME (M20.B) — AND ITS ALIAS-WINDOW, NOW CLOSED (M28.F). The session axis
// was renamed to `role` (work/verifier/orchestrator/refactor are ROLES — the kit's 3-brain
// framing). For a compatibility window this writer wrote a SECOND, legacy-named marker so a
// project bootstrapped before the rename kept resolving on its old hooks, and every reader
// fell back to that name when `.claude/role` was absent.
//
// The window is CLOSED. This writer writes exactly ONE marker, `.claude/role`, and no
// reader consults any other name. A project that still carries only the pre-rename marker
// now reads as role-ABSENT — which resolves to the `work` default, never to a resurrected
// role. That is the window closing as designed, not a regression: re-running this script
// (or re-bootstrapping) was always the migration path the window existed to buy time for.
// The retired filename and the full removal record live in the development history, not in
// this live contract.
//
// Why a script and not `echo <token> > .claude/role`: the shell redirect truncates the
// file to zero bytes BEFORE writing, and the role hooks read it on every prompt / at
// session start. A read that lands in that window sees an empty file. This script
// eliminates the race STRUCTURALLY — it writes a temp file then fs.renameSync()s it
// over the target. rename is atomic on POSIX and Windows, so a concurrent reader
// observes either the old file or the new one, never a partial / empty one. With this
// in place the strict reader can fail closed on an empty/unparseable file without ever
// false-blocking on a mid-write.
//
// Usage:
//   node scripts/set-mode.cjs <work|verifier|orchestrator|refactor>
//   node scripts/set-mode.cjs --topology   (M29.B: read-only worktree-split assist —
//                                           reports first-commit state + topology, and
//                                           prints the split steps when available)
//   node scripts/set-mode.cjs --split <branch>   (M30.H: performs the split FAIL-CLOSED —
//                                           creates ../<project>-build-wt, refuses a pre-existing
//                                           directory, writes role=work there, prints the launch block)
//   node scripts/set-mode.cjs work --expect <path>   (M30.H: the identity guard — writes the
//                                           role only when this shell's git toplevel IS <path>)
//
// Exit 0 = wrote exactly "<token>\n" to ./.claude/role (one atomic write).
// Exit 2 = invalid/missing token or bad invocation — the existing files are left
//          UNTOUCHED (no truncate, no partial write).
//
// .cjs = always CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];

function fail(msg) {
  process.stderr.write(`set-mode: ${msg}\n`);
  process.stderr.write(`usage: node scripts/set-mode.cjs <${VALID_MODES.join('|')}>\n`);
  process.exit(2);
}

// ── M29.B — `--topology`: the worktree-split assist. READ-ONLY (never touches
// .claude/role): reports the first-commit state and the current topology, and when the
// split is available-but-not-taken prints the ORCHESTRATOR.md walkthrough's split block
// with the real path and branch substituted. The block is EMBEDDED here rather than read
// from the doc — the doc lives at templates/ORCHESTRATOR.md in the workshop but
// sbak/templates/ORCHESTRATOR.md in a generated project, so a path-reading assist breaks
// in one layout or the other; the smoke drift lock byte-compares this copy's live output
// against the doc's fence, which is the parity mechanism for the deliberate duplication.
// M30.H: the block is two lines - `--split` does the worktree add fail-closed with the
// project-derived name `../<project>-build-wt` and prints the launch block itself. No hardcoded name.
const SPLIT_BLOCK = [
  'cd <project-path>',
  'node scripts/set-mode.cjs --split <milestone-branch>',
];

function gitOut(argv) {
  const r = require('child_process').spawnSync('git', argv, { encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

// Exit 0 in every report state, INCLUDING unknown: the report succeeded at telling the
// truth about a non-repo directory. Never a confident wrong topology (the banner's
// omit-don't-guess rule, applied here as an explicit `unknown`).
function reportTopology() {
  const gitDir = gitOut(['rev-parse', '--git-dir']);
  if (gitDir === null) {
    process.stdout.write('topology: unknown (not a git repository)\n');
    process.stdout.write('run this from the project root; git init (or the bootstrap) comes first.\n');
    return;
  }
  const commonDir = gitOut(['rev-parse', '--git-common-dir']);
  const linked = commonDir !== null && path.resolve(gitDir) !== path.resolve(commonDir);
  const hasFirstCommit = gitOut(['rev-parse', '--verify', 'HEAD']) !== null;
  if (linked) {
    process.stdout.write('topology: linked worktree (the split is already taken — this window carries its own .claude/role)\n');
    process.stdout.write(`first commit: ${hasFirstCommit ? 'yes' : 'no (unborn HEAD)'}\n`);
    return;
  }
  process.stdout.write('topology: main checkout, shared directory (no linked worktree here)\n');
  if (!hasFirstCommit) {
    process.stdout.write('first commit: no (unborn HEAD)\n');
    process.stdout.write('the split is not available yet — a worktree cannot be added on an unborn HEAD.\n');
    process.stdout.write('stay in Topology C (two terminals, one directory; set-mode before each session\'s\n');
    process.stdout.write('first prompt) until the first commit lands, then re-run this flag.\n');
    return;
  }
  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']) || '<milestone-branch>';
  process.stdout.write('first commit: yes\n');
  process.stdout.write('the split is available but not taken — the builder gets its own working tree now\n');
  process.stdout.write('(the recommended steady state). Open the BUILD terminal and paste this whole block:\n');
  process.stdout.write('\n');
  for (const line of SPLIT_BLOCK) {
    process.stdout.write(line
      .replace('<project-path>', process.cwd())
      .replace('<milestone-branch>', branch) + '\n');
  }
}

// ── M30.H (the three worktree-collision cures) — `--split <branch>`: the fail-closed split. The name is derived from
// the project (the main checkout's basename), never typed; a pre-existing target is refused before
// anything is created (`cd` can never land in someone else's tree); the launch block prints ONLY on
// success, so a paste-in-two-steps walkthrough is structurally fail-closed.
function doSplit(branch) {
  const top = gitOut(['rev-parse', '--show-toplevel']);
  if (top === null) fail('--split: not inside a git repository');
  const gitDir = gitOut(['rev-parse', '--git-dir']);
  const commonDir = gitOut(['rev-parse', '--git-common-dir']);
  if (gitDir !== null && commonDir !== null && path.resolve(gitDir) !== path.resolve(commonDir)) fail('--split: run this from the MAIN checkout, not from inside a linked worktree');
  if (gitOut(['rev-parse', '--verify', 'HEAD']) === null) fail('--split: unborn HEAD - a worktree cannot be added before the first commit (stay in the shared directory until it lands)');
  const project = path.basename(top);
  const target = path.resolve(top, '..', `${project}-build-wt`);
  if (fs.existsSync(target)) fail(`--split: ${target} already exists - refusing to touch it (a pre-existing directory is someone else's tree; remove it or pick another name)`);
  const branchExists = gitOut(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) !== null;
  const r = require('child_process').spawnSync('git', branchExists ? ['worktree', 'add', target, branch] : ['worktree', 'add', '-b', branch, target], { encoding: 'utf8' });
  if (r.status !== 0) fail(`--split: git worktree add failed - ${String(r.stderr || r.stdout).trim()}`);
  try {
    fs.mkdirSync(path.join(target, '.claude'), { recursive: true });
    const tmp = path.join(target, '.claude', 'role.tmp');
    fs.writeFileSync(tmp, 'work\n', 'utf8');
    fs.renameSync(tmp, path.join(target, '.claude', 'role'));
  } catch (e) { fail(`--split: the worktree exists at ${target} but its role could not be written: ${e && e.message ? e.message : 'error'}`); }
  process.stdout.write(`worktree created: ${target} (branch ${branch}) - role = work written there.\n`);
  process.stdout.write('Open the BUILD terminal and paste this whole block (the guard refuses a wrong tree before the launch):\n\n');
  process.stdout.write(`cd ${target}\n`);
  process.stdout.write(`node scripts/set-mode.cjs work --expect ${target} && claude\n`);
}

// The identity guard: the role is written only when this shell's toplevel IS the expected tree.
function expectGuard(expected) {
  const top = gitOut(['rev-parse', '--show-toplevel']);
  const norm = (p) => { let s = path.resolve(p); try { s = fs.realpathSync(s); } catch (_) { /* lexical */ } s = s.replace(/\\/g, '/'); return process.platform === 'win32' ? s.toLowerCase() : s; };
  if (top === null || norm(top) !== norm(expected)) {
    fail(`identity guard - this shell's repo root is ${top === null ? '(not a git repository)' : top} but the block expected ${expected} (git rev-parse --show-toplevel disagrees); refusing to write the role - cd to the right tree first`);
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--topology') {
  reportTopology();
  process.exit(0);
}
if (args[0] === '--split') {
  if (args.length !== 2 || !args[1]) fail('--split needs exactly one branch name');
  doSplit(args[1]);
  process.exit(0);
}
if (args.length === 3 && args[1] === '--expect') {
  expectGuard(args[2]);
  args.length = 1;
}
if (args.length !== 1) {
  fail(args.length === 0 ? 'no mode given' : `expected exactly one token, got ${args.length}`);
}

const token = args[0].toLowerCase();
if (!VALID_MODES.includes(token)) {
  // Reject BEFORE touching the file — an invalid token must never truncate the
  // existing (possibly valid) role marker.
  fail(`"${args[0]}" is not one of {${VALID_MODES.join(', ')}}`);
}

const claudeDir = path.join(process.cwd(), '.claude');

// Atomic write of a single marker: temp file in the SAME directory as the target so
// the rename stays on one filesystem (a cross-device rename is not atomic), then
// rename over the target. Bare token + newline.
function writeMarkerAtomic(name) {
  const target = path.join(claudeDir, name);
  const tmp = path.join(claudeDir, `${name}.tmp`);
  try {
    fs.writeFileSync(tmp, `${token}\n`, 'utf8');
    fs.renameSync(tmp, target); // atomic replace
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* best effort */ }
    fail(`could not write ${target}: ${e && e.message ? e.message : 'unknown error'}`);
  }
}

// Best-effort build-receipt emission (M20.6.B) — runs AFTER the role marker write,
// which is SACRED. mode_set refreshes the session role in the ledger. It writes NO
// stdout (the A-15 one-line contract is byte-sacred), never changes the exit code, and
// swallows every error. Session resolves env-first (CLAUDE_CODE_SESSION_ID) with the
// unattributed script-ledger fallback; the vocabulary/sink is the frozen Stage-A
// contract (no fork).
function emitReceipt(event, extra) {
  try {
    const receipts = require('./lib/receipts.cjs');
    const rs = receipts.resolveScriptSession(process.env);
    const evt = Object.assign({
      schema: receipts.SCHEMA_VERSION,
      at: new Date().toISOString(),
      event: event,
      emitter: 'set-mode',
    }, extra || {});
    if (rs.session) evt.session = rs.session;
    receipts.appendEvent(path.join(claudeDir, 'receipts'), evt);
  } catch (_) { /* metrics are bonus; the marker contract is sacred */ }
}

fs.mkdirSync(claudeDir, { recursive: true });
// ONE MARKER (M28.F — the alias-window's second write is retired).
writeMarkerAtomic('role');

process.stdout.write(`role = ${token}\n`);
// M29.B — the launch-order line, killing the shared-role-file race at its source. On
// STDERR by design (gate-1 rider): stdout stays byte-sacred at the A-15 one-line
// `role = <token>` contract; the user sees stderr in the terminal identically. The
// advice retires naturally once the worktree split lands — a linked worktree carries
// its own .claude/role, which the line says.
process.stderr.write('now launch `claude` in THIS window before setting any other mode — until the\n');
process.stderr.write('worktree split, sessions in this directory share this one .claude/role file\n');
process.stderr.write('(a linked worktree carries its own; see --topology for the split).\n');
emitReceipt('mode_set', { role: token, marker: 'role' });
process.exit(0);
