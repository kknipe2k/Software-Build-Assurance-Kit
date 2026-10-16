#!/usr/bin/env node
// @kit-version 1.0.7
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
// Usage:  node scripts/approve-red.cjs --stage <id> --release-seq <n>
//   --stage <id>        the open stage; any other value is refused (M32.1.B, R-35 a)
//   --release-seq <n>   the seq of the pending approval-request on the channel (the
//                       orchestrator's RED verdict), or `none` when no approval-request is
//                       pending (Lite, before the worktree split, or the human's own
//                       /approve-red ahead of a verdict). The two flags put the stage and the
//                       seq in the command line itself, so the permission prompt the human
//                       clicks names what it releases; the red-gate hook refuses any other
//                       form of the command.
// Exit 0 = wrote red-approved. Exit 2 = no open stage / a flag refused / write failure.

'use strict';

const fs = require('fs');
const path = require('path');

const claudeDir = path.join(process.cwd(), '.claude');

function readTrim(file) {
  try { return fs.readFileSync(file, 'utf8').split(String.fromCharCode(0)).join('').trim(); }
  catch (_) { return null; }
}
function refuse(line) {
  process.stderr.write(`approve-red: ${line}\n`);
  process.exit(2);
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
    // M32.1.C (V-26 b): the row carries the session's role through the channel library's strict
    // reader (a resolved token only) - the row R-35 made the record of "who" said "unknown".
    try { const r = require('./lib/channel.cjs').readRole(process.cwd()); if (r.state === 'resolved') evt.role = r.role; } catch (_) { /* no role on the row */ }
    receipts.appendEvent(path.join(claudeDir, 'receipts'), evt);
  } catch (_) { /* metrics are bonus; the marker contract is sacred */ }
}

// The orchestrator's word (M32.1.B, R-35): the approval-request the builder's pickup surfaced
// and is waiting on, read through channel.cjs - never by re-parsing the jsonl. Null when there
// is no channel here or nothing is pending.
function pendingApproval() {
  try {
    const chan = require('./lib/channel.cjs');
    const res = chan.resolve(process.cwd());
    if (!res.ok || chan.SIDE[res.role] !== 'work') return null;
    const u = chan.unreadFor(res);
    if (u.fault || !u.pending) return null;
    return { seq: u.pending.seq, first: u.unread[0].seq === u.pending.seq };
  } catch (_) { return null; }
}

// The human's click (M32.1.B, R-35 b): a permission prompt on a command (tool category exec)
// recorded in THIS session's receipts ledger within the last 120 s - the session's own file,
// read through the receipts reader, never a glob over other sessions. Null when there is none,
// or no session id to name the file.
const CLICK_WINDOW_MS = 120 * 1000;
function recordedClick() {
  try {
    const receipts = require('./lib/receipts.cjs');
    const rs = receipts.resolveScriptSession(process.env);
    if (!rs.session) return null;
    const file = path.join(claudeDir, 'receipts', receipts.ledgerFileFor(rs.session));
    if (!fs.existsSync(file)) return null;
    const now = Date.now();
    const clicks = receipts.readLedger(file).events.filter((e) => {
      if (e.event !== 'permission_requested' || e.tool_category !== 'exec') return false;
      const age = now - Date.parse(e.at);
      return age >= -5000 && age <= CLICK_WINDOW_MS;
    });
    return clicks.length ? clicks[clicks.length - 1] : null;
  } catch (_) { return null; }
}

const stageId = readTrim(path.join(claudeDir, 'stage-active'));
if (!stageId) {
  process.stderr.write('approve-red: no .claude/stage-active — there is no open stage to approve.\n');
  process.stderr.write('  Open a stage first (e.g. /stage M09 D, or node scripts/stage-active.cjs M09.D).\n');
  process.exit(2);
}

// THE RELEASE COMMAND IS LEGIBLE (M32.1.B, R-35 a): both flags, checked before anything is read
// or written. A refusal changes nothing - no marker, and a pending request stays pending.
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
}
const stageArg = flag('--stage');
if (stageArg === null) refuse(`--stage is required - run node scripts/approve-red.cjs --stage <id> --release-seq <n> (the open stage is ${stageId}).`);
if (stageArg !== stageId) refuse(`--stage ${stageArg} is not the open stage (${stageId}) - refused.`);
const seqArg = flag('--release-seq');
if (seqArg === null || !/^(?:[1-9][0-9]{0,8}|none)$/.test(seqArg)) refuse('--release-seq must be the pending approval-request\'s seq, or none - refused.');
const pending = pendingApproval();
if (seqArg === 'none' && pending) refuse(`approval-request seq ${pending.seq} is pending - pass --release-seq ${pending.seq} (the orchestrator's RED verdict) - refused.`);
if (seqArg !== 'none' && !pending) refuse('no approval-request is pending - pass --release-seq none - refused.');
if (seqArg !== 'none' && Number(seqArg) !== pending.seq) refuse(`--release-seq ${seqArg} is not the pending approval-request (seq ${pending.seq}) - refused.`);
if (pending && !pending.first) refuse(`approval-request seq ${pending.seq} is pending behind unread messages - run node scripts/channel.cjs pickup first - refused.`);

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

// THE RECEIPT BINDS BOTH HALVES, AND THE SCRIPT SAYS WHAT IT HAS (M32.1.B, R-35 b). The channel
// (M30.H): an approval-request is surfaced by pickup but never consumed by an agent - this
// command advances the builder's cursor past it. The line names the orchestrator's word (the
// request's seq) and the human's click (the permission prompt this session recorded) when both
// are on record; with no click on record it says so in a WARNING, and the marker still stands -
// the warning is the record. It never claims a human it cannot show.
// M32.1.C (V-26 a, drive note 21): the recorded time is the PROMPT's; the click lies between the
// prompt and this release and nothing records the click itself, so the line names both ends.
const click = recordedClick();
const clickText = click ? `prompt at ${click.at}, released at ${new Date().toISOString()}` : 'WARNING: no permission prompt recorded in this session\'s receipts';
let releasedSeq = null;
if (pending) {
  try { releasedSeq = require('./lib/channel.cjs').consumeApproval(process.cwd()); } catch (_) { releasedSeq = null; }
}
if (releasedSeq !== null) {
  process.stdout.write(`channel: approval-request seq ${releasedSeq} released - ${click ? `orchestrator word seq ${releasedSeq}, ${clickText}` : clickText}\n`);
} else if (pending) {
  process.stdout.write(`channel: approval-request seq ${pending.seq} was NOT advanced (the channel moved under this run) - run node scripts/channel.cjs pickup; ${clickText}\n`);
} else {
  process.stdout.write(`release: no approval-request pending (--release-seq none) - ${clickText}\n`);
}
const extra = { stage: stageId, marker: 'red-approved' };
if (releasedSeq !== null) extra.approval_seq = releasedSeq;
if (click) extra.prompt_at = click.at;
emitReceipt('red_approved', extra);
process.exit(0);
