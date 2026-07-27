#!/usr/bin/env node
// @kit-version 1.0.2
// scripts/set-mode.cjs
//
// Atomic writer for the session ROLE dial (.claude/role). This is the SOURCE-side
// half of the ERR-002 fix: `.claude/role` is canonical BARE-TOKEN state, and the
// only supported way to set it.
//
// I9 RENAME + THE ALIAS-WINDOW (M20.B). The session axis was renamed active-mode ->
// role (work/verifier/orchestrator/refactor are ROLES — the kit's 3-brain framing).
// For ONE RELEASE this writer writes BOTH `.claude/role` (the new canonical marker)
// AND the legacy `.claude/active-mode` (the read-compatible alias), each atomically,
// with the SAME bare token — so a project bootstrapped BEFORE the rename, whose
// still-old readers only know `.claude/active-mode`, keeps resolving, while a project
// on the new hooks reads `.claude/role` first. Every reader prefers `.claude/role`
// and falls back to `.claude/active-mode` ONLY when role is absent (a present-but-
// garbage role fails closed — it does NOT fall through). This alias-window is retired
// in the first release after v0.2.0 — v0.2.0 itself still performs the legacy
// `.claude/active-mode` write and the readers' fallback. This header comment is the
// writer's record of the window; the state-file contract note in persistence-architecture.md is the
// single living-documentation home for it.
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
// Exit 0 = wrote exactly "<token>\n" to BOTH ./.claude/role and ./.claude/active-mode
//          (each atomic; the alias-window two-file write).
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
  // existing (possibly valid) active-mode.
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
// THE ALIAS-WINDOW TWO-FILE WRITE (M20.B): write the new canonical `.claude/role`
// AND the legacy `.claude/active-mode`, each atomically with the same token, so both
// a new-hook and a pre-M20-hook reader see coherent state. Write role FIRST (the
// canonical marker); the legacy alias is written second for one release.
writeMarkerAtomic('role');
writeMarkerAtomic('active-mode'); // alias-window: retired one release after v0.2.0

process.stdout.write(`role = ${token}\n`);
emitReceipt('mode_set', { role: token, marker: 'role' });
process.exit(0);
