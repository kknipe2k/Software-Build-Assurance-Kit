#!/usr/bin/env node
// @kit-version 1.0.5
// scripts/approve-red.cjs
//
// The HUMAN's action — gate 2 of the three-gate loop (plan -> RED -> stage-end).
// After reviewing the surfaced RED tests, the human runs this (via /approve-red)
// to unlock implementation edits for the open stage. It writes .claude/red-approved
// = the current .claude/stage-active id (atomically), which the PROC-001 red-gate
// then matches to allow impl edits for THAT stage only.
//
// No open stage (.claude/stage-active absent) -> nothing to approve -> exit 2. A new
// /stage clears the approval (a fresh stage starts un-approved), so an approval can
// never carry across stages.
//
// Usage:  node scripts/approve-red.cjs
// Exit 0 = wrote red-approved. Exit 2 = no open stage / write failure.

'use strict';

const fs = require('fs');
const path = require('path');

const claudeDir = path.join(process.cwd(), '.claude');

function readTrim(file) {
  try { return fs.readFileSync(file, 'utf8').split(String.fromCharCode(0)).join('').trim(); }
  catch (_) { return null; }
}

// Best-effort build-receipt emission (M20.6.B) — runs AFTER the atomic marker rename,
// which is SACRED. It writes NO stdout (the A-15 one-line contract is byte-sacred),
// never changes the exit code, and swallows every error. Session resolves env-first
// (CLAUDE_CODE_SESSION_ID) with the unattributed script-ledger fallback; the
// vocabulary/sink is the frozen Stage-A contract (no fork).
function emitReceipt(event, extra) {
  try {
    const receipts = require('./lib/receipts.cjs');
    const rs = receipts.resolveScriptSession(process.env);
    const evt = Object.assign({
      schema: receipts.SCHEMA_VERSION,
      at: new Date().toISOString(),
      event: event,
      emitter: 'approve-red',
    }, extra || {});
    if (rs.session) evt.session = rs.session;
    receipts.appendEvent(path.join(claudeDir, 'receipts'), evt);
  } catch (_) { /* metrics are bonus; the marker contract is sacred */ }
}

const stageId = readTrim(path.join(claudeDir, 'stage-active'));
if (!stageId) {
  process.stderr.write('approve-red: no .claude/stage-active — there is no open stage to approve.\n');
  process.stderr.write('  Open a stage first (e.g. /stage M09 D, or node scripts/stage-active.cjs M09.D).\n');
  process.exit(2);
}

// THE CONSUMPTION CHECK (M30.G, lazy orientation) — gate 2 is the first mechanical gate after
// the stage-open reads must have happened. The read-first list's `when: stage-open` entries
// and every path in the open stage prompt's <read_first> must have a recorded read on the
// receipts ledger (a Read-tool or Bash read, recorded by receipts-lifecycle.cjs); a stage that
// proceeds without them is REFUSED here, one line naming the unread files. This replaced the
// SessionStart hook's eager inline (the V104 instruction-skipping defence) — it does not add on
// top of it. Marker semantics are unchanged; the check runs BEFORE the sacred rename.
try {
  const rl = require('./lib/read-ledger.cjs');
  const res = rl.checkReads(process.cwd(), { boundary: 'stage-open', stage: stageId });
  if (res.missing.length > 0) {
    process.stderr.write(`approve-red: required reads not recorded for ${stageId}: ${res.missing.join(', ')} - read them, then re-run.\n`);
    process.exit(2);
  }
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    process.stderr.write('approve-red: note - scripts/lib/read-ledger.cjs is absent, so the stage-open read check did not run (node scripts/kit-update.cjs --adopt installs it).\n');
  } else {
    process.stderr.write(`approve-red: the read check failed to run (${e && e.message ? e.message : 'error'}) - refusing rather than approving unchecked.\n`);
    process.exit(2);
  }
}

const target = path.join(claudeDir, 'red-approved');
const tmp = target + '.tmp';
try {
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(tmp, stageId + '\n', 'utf8');
  fs.renameSync(tmp, target); // atomic
} catch (e) {
  try { fs.rmSync(tmp, { force: true }); } catch (_) { /* best effort */ }
  process.stderr.write(`approve-red: could not write ${target}: ${e && e.message ? e.message : 'unknown error'}\n`);
  process.exit(2);
}

process.stdout.write(`red-approved = ${stageId} — implementation edits unlocked for this stage.\n`);
emitReceipt('red_approved', { stage: stageId, marker: 'red-approved' });
// THE CHANNEL'S HITL LINE (M30.H): an approval-request on the terminal channel is surfaced by
// pickup but never consumed by an agent - THIS command, the human's click, is what advances the
// builder's cursor past it and returns the turn. Absent channel / no pending request: nothing.
try {
  const chan = require('./lib/channel.cjs');
  const seq = chan.consumeApproval(process.cwd());
  if (seq !== null) process.stdout.write(`channel: approval-request seq ${seq} consumed by the human - turn: work
`);
} catch (_) { /* no channel here */ }
process.exit(0);
