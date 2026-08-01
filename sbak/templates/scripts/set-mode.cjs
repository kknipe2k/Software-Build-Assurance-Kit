#!/usr/bin/env node
// @kit-version 1.0.3
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

const args = process.argv.slice(2);
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
emitReceipt('mode_set', { role: token, marker: 'role' });
process.exit(0);
