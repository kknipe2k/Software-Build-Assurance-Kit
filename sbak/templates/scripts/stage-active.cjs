#!/usr/bin/env node
// @kit-version 1.0.8
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
// THE ROLE AT OPEN (M33.A, R-50 a): the open also writes .claude/stage-role, the session's role
// read through the channel library's strict reader (a resolved role; absent gives work; a garbage
// marker gives unresolved). The red-gate judges stage-role, never the live .claude/role an edit
// tool could flip mid-stage; --clear removes it with the other two markers.
//
// THE LISTENING GATE (M32.1.C, V-27, R-39: "starting the stage is fine without my calling slash
// - but there needs to be a gate that something is watching (Orch)? and it needs to announce
// loudly"). When another worktree of this repo has .claude/role = orchestrator, a stage opens
// only while the orchestrator listens or is present (PRESENCE, below; the judge `channel status`
// uses: a marker is not a listener); otherwise nothing is written and one line names both ways
// to satisfy the gate. No orchestrator worktree (Lite, or before
// the split): the stage opens and the line says the gate did not apply. Every open prints one
// loud STAGE OPEN line on STDERR (stdout keeps its one-line contract) and publishes the
// stage-open packet itself, carrying that line, so the orchestrator's pickup surfaces it.
// --clear is never gated.
//
// PRESENCE (M33.G). The gate opens when the orchestrator is listening - a watcher whose pid
// is alive AND whose start token is fresh (lib/channel.cjs watcherState; any other live pid is not
// a listener) - OR present: the receipts hook writes <its tree>/.claude/channel/present.<side>.json
// at every SessionStart and prompt, and the orchestrator tree's record is inside the window
// (project-config.md presence_minutes, default 30). The refusal names both ways. The open prints
// the bell after the STAGE OPEN line; --clear prints the stage's measure line on stderr.
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
const stageRoleFile = path.join(claudeDir, 'stage-role');

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
  // The measure is read before the markers go (the open stage names it) and printed after the
  // pinned stdout line, on stderr; a stage with nothing to measure prints nothing.
  let measureLine = null;
  try {
    const open = fs.readFileSync(stageFile, 'utf8').split(String.fromCharCode(0)).join('').trim();
    if (open) measureLine = require('./lib/read-ledger.cjs').measure(process.cwd(), open).line;
  } catch (_) { measureLine = null; }
  for (const f of [stageFile, redApprovedFile, stageRoleFile]) {
    try { fs.rmSync(f, { force: true }); } catch (_) { /* best effort */ }
  }
  process.stdout.write('stage-active + red-approved cleared (gate dormant)\n');
  if (measureLine) process.stderr.write(measureLine + '\n');
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
  const w = chan.watcherState(path.join(claudeDir, 'channel', 'watch.orchestrator.json'));
  if (w.state === 'listening') return { open: true, applied: true, line: `STAGE OPEN: ${id} - the orchestrator is listening (watcher pid ${w.m.pid}, armed ${typeof w.m.since === 'string' ? w.m.since : 'at an unknown time'}).` };
  // Presence: the orchestrator tree's own record, judged against the window.
  let windowMin = 30;
  try {
    const v = require('./lib/read-ledger.cjs').readConfigValue(fs.readFileSync(path.join(process.cwd(), 'project-config.md'), 'utf8'), 'presence_minutes');
    if (v && /^[1-9][0-9]{0,4}$/.test(v)) windowMin = parseInt(v, 10);
  } catch (_) { /* no config: the default */ }
  let p = null;
  try { p = JSON.parse(fs.readFileSync(path.join(orch[0], '.claude', 'channel', 'present.orchestrator.json'), 'utf8')); } catch (_) { p = null; }
  const at = p && typeof p.at === 'string' ? Date.parse(p.at) : NaN;
  if (!Number.isFinite(at)) return { open: false, why: 'no presence record' };
  const ago = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (Date.now() - at > windowMin * 60000) return { open: false, why: `last prompt ${ago} min ago, over the ${windowMin}-minute window` };
  return { open: true, applied: true, line: `STAGE OPEN: ${id} - the orchestrator is present (last prompt ${p.at}, ${ago} min ago, inside the ${windowMin}-minute window); the bell rings its session and the log keeps every packet.` };
}
const gate = listeningGate();
if (!gate.open) {
  process.stderr.write(`stage-active: ${id} is NOT open - the orchestrator is not listening (no watcher with a fresh token) and not present (${gate.why}). Type any prompt in the orchestrator window, or /listen ${id} there, then open the stage again.\n`);
  process.exit(2);
}

try {
  atomicWrite(stageFile, id + '\n');
  // the role the gate judges for this stage, recorded now (M33.A).
  const r = chan.readRole(process.cwd());
  atomicWrite(stageRoleFile, (r.state === 'unresolved' ? 'unresolved' : r.role) + '\n');
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
  else { const r = chan.append(process.cwd(), res, 'stage-open', 'open', Buffer.from(gate.line, 'utf8')); published = r.ok ? { ok: true, bell: chan.bellLine(res, r.msg.seq) } : { ok: false, why: r.line }; }
} catch (e) { published = { ok: false, why: e && e.message ? e.message : 'error' }; }
process.stderr.write(gate.line + '\n');
if (published.ok && published.bell) process.stderr.write(published.bell + '\n');
if (gate.applied && !published.ok) {
  process.stderr.write(`stage-active: the stage-open packet was NOT published (${published.why}) - publish it by hand: node scripts/channel.cjs publish --class stage-open --body "${gate.line}"\n`);
}
process.exit(0);
