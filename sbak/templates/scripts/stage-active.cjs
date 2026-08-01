#!/usr/bin/env node
// @kit-version 1.0.3
// scripts/stage-active.cjs
//
// Atomic writer for .claude/stage-active — the open-stage marker the PROC-001
// red-gate (templates/dot-claude/hooks/pretooluse-red-gate.cjs) keys off. /stage
// runs this at stage start; commit/closeout runs it with --clear.
//
// Writing a new stage id ALSO clears any stale .claude/red-approved: a fresh stage
// starts un-approved, so a leftover approval from a prior stage can never unlock
// the new one. --clear removes both markers (the gate goes dormant).
//
// Usage:
//   node scripts/stage-active.cjs <stage-id>   (e.g. M09.D)  -> open a stage
//   node scripts/stage-active.cjs --clear                    -> close it (both markers)
//
// Exit 0 = wrote/cleared. Exit 2 = bad invocation (existing markers untouched on a
// usage error). .cjs = CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const path = require('path');

const claudeDir = path.join(process.cwd(), '.claude');
const stageFile = path.join(claudeDir, 'stage-active');
const redApprovedFile = path.join(claudeDir, 'red-approved');

function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8'); // same dir -> rename stays on one fs (atomic)
  fs.renameSync(tmp, file);
}

// Best-effort build-receipt emission (M20.6.B) — runs AFTER the marker write, which is
// SACRED. It writes NO stdout (the A-15 one-line contract is byte-sacred), never changes
// the exit code, and swallows every error: a receipts fault must never leave a stage
// half-armed. Session resolves env-first (CLAUDE_CODE_SESSION_ID) with the unattributed
// script-ledger fallback; the vocabulary/sink is the frozen Stage-A contract (no fork).
function emitReceipt(event, extra) {
  try {
    const receipts = require('./lib/receipts.cjs');
    const rs = receipts.resolveScriptSession(process.env);
    const evt = Object.assign({
      schema: receipts.SCHEMA_VERSION,
      at: new Date().toISOString(),
      event: event,
      emitter: 'stage-active',
    }, extra || {});
    if (rs.session) evt.session = rs.session;
    receipts.appendEvent(path.join(claudeDir, 'receipts'), evt);
  } catch (_) { /* metrics are bonus; the marker contract is sacred */ }
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === '--clear') {
  for (const f of [stageFile, redApprovedFile]) {
    try { fs.rmSync(f, { force: true }); } catch (_) { /* best effort */ }
  }
  process.stdout.write('stage-active + red-approved cleared (gate dormant)\n');
  emitReceipt('stage_cleared', { marker: 'stage-active' });
  process.exit(0);
}

if (args.length !== 1 || /^-/.test(args[0])) {
  process.stderr.write('stage-active: expected a single stage id\n');
  process.stderr.write('usage: node scripts/stage-active.cjs <stage-id>   |   --clear\n');
  process.exit(2);
}

const id = args[0].trim();
try {
  atomicWrite(stageFile, id + '\n');
  // a new stage starts un-approved — clear any stale approval.
  try { fs.rmSync(redApprovedFile, { force: true }); } catch (_) { /* best effort */ }
} catch (e) {
  process.stderr.write(`stage-active: could not write ${stageFile}: ${e && e.message ? e.message : 'unknown error'}\n`);
  process.exit(2);
}

process.stdout.write(`stage-active = ${id} (red-approved cleared)\n`);
emitReceipt('stage_opened', { stage: id, marker: 'stage-active' });
process.exit(0);
