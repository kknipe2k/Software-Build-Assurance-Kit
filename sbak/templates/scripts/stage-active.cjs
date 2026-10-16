#!/usr/bin/env node
// @kit-version 1.0.7
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
// THE LISTENING GATE (M32.1.C, V-27, R-39: "starting the stage is fine without my calling slash
// - but there needs to be a gate that something is watching (Orch)? and it needs to announce
// loudly"). When another worktree of this repo has .claude/role = orchestrator, a stage opens
// only while <this tree>/.claude/channel/watch.orchestrator.json names a LIVE pid (the KF-67
// probe `channel status` uses: a marker is not a listener); otherwise nothing is written and one
// line says to type /listen in the orchestrator window. No orchestrator worktree (Lite, or before
// the split): the stage opens and the line says the gate did not apply. Every open prints one
// loud STAGE OPEN line on STDERR (stdout keeps its one-line contract) and publishes the
// stage-open packet itself, carrying that line, so the orchestrator's pickup surfaces it.
// --clear is never gated.
//
// Usage:
//   node scripts/stage-active.cjs <stage-id>   (e.g. M09.D)  -> open a stage
//   node scripts/stage-active.cjs --clear                    -> close it (both markers)
//
// Exit 0 = wrote/cleared. Exit 2 = bad invocation, or the orchestrator is not listening, or the
// gate cannot check (existing markers untouched). .cjs = CommonJS regardless of the host
// project's package.json type.

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
// M32.1.C (V-26 b): the row carries the session's role, read through the channel library's
// strict reader (a resolved token only; absent stays unset, as the hook rows do).
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
    try { const r = require('./lib/channel.cjs').readRole(process.cwd()); if (r.state === 'resolved') evt.role = r.role; } catch (_) { /* no role on the row */ }
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

// The gate reads before anything is written: a refusal leaves every marker as it was.
let chan;
try { chan = require('./lib/channel.cjs'); } catch (e) {
  process.stderr.write(`stage-active: ${id} is NOT open - the listening gate cannot check (scripts/lib/channel.cjs did not load); repair the install with node scripts/kit-update.cjs --adopt, then open the stage again.\n`);
  process.exit(2);
}
const sameTree = (a, b) => {
  const x = path.resolve(a); const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};
function listeningGate() {
  const courier = (why) => ({ open: true, line: `STAGE OPEN: ${id} - the listening gate did not apply: ${why}; packets travel by the human courier.` });
  const trees = chan.worktrees(process.cwd());
  if (trees === null) return courier('not inside a git repository');
  const orch = trees.filter((w) => !sameTree(w, process.cwd())).filter((w) => { const r = chan.readRole(w); return r.state === 'resolved' && r.role === 'orchestrator'; });
  if (orch.length === 0) return courier('no orchestrator worktree in this repo (Lite, or before the worktree split)');
  let m = null;
  try { m = JSON.parse(fs.readFileSync(path.join(claudeDir, 'channel', 'watch.orchestrator.json'), 'utf8')); } catch (_) { m = null; }
  if (!m || !Number.isInteger(m.pid) || m.pid <= 0 || !chan.pidAlive(m.pid)) return { open: false };
  return { open: true, applied: true, line: `STAGE OPEN: ${id} - the orchestrator is listening (watcher pid ${m.pid}, armed ${typeof m.since === 'string' ? m.since : 'at an unknown time'}).` };
}
const gate = listeningGate();
if (!gate.open) {
  process.stderr.write(`stage-active: ${id} is NOT open - the orchestrator is not listening (no live watcher in .claude/channel/watch.orchestrator.json). Type /listen ${id} in the orchestrator window, then open the stage again.\n`);
  process.exit(2);
}

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

// The stage-open packet, published here so it carries the loud line (the orchestrator's pickup
// surfaces it). The marker is already written: a failed publish never un-opens the stage - where
// the gate applied it prints the hand-publish line; with no channel (the courier case) the
// courier line already says so.
let published = { ok: false, why: 'not attempted' };
try {
  const res = chan.resolve(process.cwd());
  if (!res.ok) published = { ok: false, why: res.line };
  else if (chan.SIDE[res.role] !== 'work') published = { ok: false, why: `this tree's role is ${res.role}` };
  else { const r = chan.append(process.cwd(), res, 'stage-open', 'open', Buffer.from(gate.line, 'utf8')); published = r.ok ? { ok: true } : { ok: false, why: r.line }; }
} catch (e) { published = { ok: false, why: e && e.message ? e.message : 'error' }; }
process.stderr.write(gate.line + '\n');
if (gate.applied && !published.ok) {
  process.stderr.write(`stage-active: the stage-open packet was NOT published (${published.why}) - publish it by hand: node scripts/channel.cjs publish --class stage-open --body "${gate.line}"\n`);
}
process.exit(0);
