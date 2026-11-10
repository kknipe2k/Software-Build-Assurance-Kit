#!/usr/bin/env node
// @kit-version 1.0.10
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
// only while the orchestrator listens - a watcher whose pid is alive AND whose start token is
// fresh (lib/channel.cjs watcherState, the judge `channel status` uses; a marker is not a
// listener); otherwise nothing is written and one line names /listen <stage> for the orchestrator
// window. No orchestrator worktree (Lite, or before the split): the stage opens and the line says
// the gate did not apply. Every open prints one loud STAGE OPEN line on STDERR (stdout keeps its
// one-line contract) and publishes the stage-open packet itself, carrying that line, so the
// orchestrator's pickup surfaces it. --clear is never gated.
//
// LISTENING ONLY (M34.6.E item 7, R-174). From M33.G to M34.6 a recent prompt in the orchestrator
// window (presence) also opened a stage; an orchestrator that chatted without /listen counted as
// present and the stage opened with nobody picking up, so presence no longer suffices. The open
// prints the bell after the STAGE OPEN line; --clear prints the stage's measure line on stderr.
//
// THE ONE CLEAR (M34.C item 4, R-56): --clear is the only clear of an approval (approve-red has
// none); it archives .claude/channel/approval.json into .claude/measurements/<stage>/ and removes
// the live record.
//
// CLEARED MEANS GONE (M34.1.B, V-2). --clear reads each marker by lstat of the path itself: a link
// (symlink or junction) is removed as a link, never followed to its target; a directory is removed
// whole; a file is unlinked. A removal that fails stops the clear with one line and exit 1, and the
// cleared line, the approval archive and the stage_cleared receipt come only after a second lstat
// of all three markers finds nothing. The open refuses over a marker that is a directory or a link
// (a rename over a link replaces it, over a directory it fails), naming the clear.
//
// A CLEAR WHERE NOTHING WAS (M34.2.B, R-113). --clear in a tree whose .claude/ holds none of the
// three markers clears nothing there, and says so on stderr, naming the folder it looked in; it
// archives nothing and writes no receipt. The stdout line is unchanged. A clear run from the wrong
// folder printed the cleared line over nothing and nothing showed it.
//
// THE EVIDENCE PATH (M34.6.B, R-139). Inside a git repository the open records the stage's
// lifecycle in .claude/evidence/<stage>/lifecycle.jsonl (scripts/lib/evidence.cjs), after the
// markers: `opened` (the role, the session, the subject at open), then `probed` - the project's own
// red-gate hook driven with two fixed payloads, a control-file edit it must refuse in every state and
// a docs write it must allow (session sbak-probe, which the stage end's summary leaves out) - then
// `host`, the effective settings read from the two project files (the kit registrations, onFailure on
// the red gate, disableAllHooks), a level recorded and never a claim that the host loaded them. The
// first two are required: when either cannot be written, or the hook answers the probe wrongly or is
// absent, the markers just written are removed and the stage is NOT open. The stage-open packet
// carries `evidence: 1` (the deletion guard). Before anything is written, the open refuses while an
// earlier stage's gate.json is accepted and its lifecycle has no `cleared` row (the clear is verified
// here, never at the stage end). --clear appends `cleared` to the open stage's lifecycle before the
// markers go; a cleared row that cannot be written stops the clear. Outside git the open writes no
// lifecycle, and the stage is judged as before (legacy).
//
// THE CLICK (M34.6.G item 3). From a Claude Code session (CLAUDE_CODE_SESSION_ID present) --clear
// needs the permission prompt this call raised on record in the session's own receipts, read by
// scripts/lib/receipts.cjs recordedClick (the calling tree first, then each worktree git lists); with
// none, or a malformed session id, it is refused before anything is read or removed, one line and
// exit 2 (deterministic enforcement over observed evidence). With no session id - the person's own
// terminal, outside the session - it clears as before. The open takes no click: it engages the gate.
//
// THE CLEAR ACROSS TREES (M34.6.G item 4). --clear --tree <path> is the orchestrator's clear of the
// builder's worktree, run from its own tree: refused unless this tree's role is orchestrator, git
// lists this repository's worktrees, the path by its real form is one of them, and it is not this
// tree; then the click (from this session's ledger), then the clear on every path of that tree - its
// markers, its lifecycle's cleared row, its approval archive, its measure line and its receipt.
//
// Usage:
//   node scripts/stage-active.cjs <stage-id>   (e.g. M09.D)  -> open a stage
//   node scripts/stage-active.cjs --clear                    -> close it (both markers)
//   node scripts/stage-active.cjs --clear --tree <path>      -> close the builder worktree's stage
//
// Exit 0 = wrote/cleared. Exit 1 = --clear could not remove a marker (it is named; nothing was
// cleared). Exit 2 = bad invocation, a broken marker at the open, or the orchestrator is not
// listening, or the gate cannot check, or a clear refused at the click or at --tree (existing
// markers untouched). .cjs = CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const path = require('path');

const claudeDir = path.join(process.cwd(), '.claude');
const stageFile = path.join(claudeDir, 'stage-active');
const redApprovedFile = path.join(claudeDir, 'red-approved');
const stageRoleFile = path.join(claudeDir, 'stage-role');
const MARKERS = [['stage-active', stageFile], ['red-approved', redApprovedFile], ['stage-role', stageRoleFile]];

// A marker by lstat of the path itself: 'absent' | 'link' | 'directory' | 'file'; any other lstat
// error is thrown to the caller.
function markerKind(f) {
  let st;
  try { st = fs.lstatSync(f); } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return 'absent';
    throw e;
  }
  return st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'directory' : 'file';
}

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
function emitReceipt(event, extra, dir) {
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
    receipts.appendEvent(path.join(dir || claudeDir, 'receipts'), evt);
  } catch (_) { /* metrics are bonus; the marker contract is sacred */ }
}

const args = process.argv.slice(2);
const clearing = (args.length === 1 && args[0] === '--clear') || (args.length === 3 && args[0] === '--clear' && args[1] === '--tree');

if (clearing) {
  // Every refusal before the clear is one stderr line and exit 2, the markers untouched.
  const refuseClear = (line) => { process.stderr.write(line + '\n'); process.exit(2); };
  let chanLib = null;
  try { chanLib = require('./lib/channel.cjs'); } catch (_) { chanLib = null; }
  const sameReal = (a, b) => {
    const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
    const x = real(a); const y = real(b);
    return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
  };
  // THE CLEAR ACROSS TREES (M34.6.G item 4, gate-1 Q1 (a)): the orchestrator clears the builder's
  // worktree from its own tree. Judged in order: this tree's role is orchestrator; git lists this
  // repository's worktrees; the path, by its real form, is one of them; it is not this tree.
  let trees = null;
  let base = process.cwd();
  if (args.length === 3) {
    const given = args[2];
    if (!chanLib) refuseClear('stage-active: refused - scripts/lib/channel.cjs did not load, so --tree cannot be judged; nothing was cleared');
    const r = chanLib.readRole(process.cwd());
    const role = r.state === 'resolved' ? r.role : r.state === 'absent' ? 'work' : 'unresolved';
    if (role !== 'orchestrator') refuseClear(`stage-active: refused - --clear --tree is the orchestrator's clear of a builder worktree, and this tree's role is ${role}; nothing was cleared`);
    trees = chanLib.worktrees(process.cwd());
    if (trees === null) refuseClear('stage-active: refused - git could not list this repository\'s worktrees, so --tree cannot be judged; nothing was cleared');
    const match = trees.find((w) => sameReal(w, path.resolve(process.cwd(), given)));
    if (!match) refuseClear(`stage-active: refused - --tree ${given} is not a worktree of this repository; nothing was cleared`);
    if (sameReal(match, process.cwd())) refuseClear('stage-active: refused - --tree names this tree; clear it with node scripts/stage-active.cjs --clear; nothing was cleared');
    base = match;
  }
  // THE CLICK (M34.6.G item 3): from a Claude Code session the clear needs the prompt this call raised
  // on record in the session's own receipts (the calling tree first, then each worktree git lists);
  // with none, or a malformed session id, it is refused before anything is read or removed. With no
  // session id - the person's own terminal, outside the session - it clears as before.
  let receiptsLib = null;
  try { receiptsLib = require('./lib/receipts.cjs'); } catch (_) { receiptsLib = null; }
  const sess = receiptsLib ? receiptsLib.clickSession(process.env) : { state: process.env.CLAUDE_CODE_SESSION_ID ? 'unreadable' : 'none' };
  if (sess.state !== 'none') {
    if (!receiptsLib) refuseClear('stage-active: refused at the click - scripts/lib/receipts.cjs did not load, so the click cannot be read; nothing was cleared - repair: node scripts/kit-update.cjs --adopt, or run it from your own terminal, outside the session');
    if (trees === null && chanLib) { try { trees = chanLib.worktrees(process.cwd()); } catch (_) { trees = null; } }
    const click = receiptsLib.recordedClick([process.cwd()].concat(trees || []), sess.state === 'session' ? sess.session : null);
    if (!click) refuseClear(receiptsLib.clickRefusalLine('stage-active', sess, 'clear', 'cleared'));
  }
  // Every path below is the cleared tree's: this one, or the builder worktree --tree named.
  const claudeDir = path.join(base, '.claude'); // shadows the module's: every path below is the cleared tree's
  const baseStage = path.join(claudeDir, 'stage-active');
  const baseMarkers = [['stage-active', baseStage], ['red-approved', path.join(claudeDir, 'red-approved')], ['stage-role', path.join(claudeDir, 'stage-role')]];
  // The measure is read before the markers go (the open stage names it) and printed after the
  // pinned stdout line, on stderr; a stage with nothing to measure prints nothing.
  let measureLine = null;
  let open = null;
  try {
    if (markerKind(baseStage) === 'file') {
      open = fs.readFileSync(baseStage, 'utf8').split(String.fromCharCode(0)).join('').trim();
      if (open) measureLine = require('./lib/read-ledger.cjs').measure(base, open).line;
    }
  } catch (_) { measureLine = null; }
  // M34.1.B (V-2): each marker removed by what lstat says it is, then a second lstat of all three;
  // a removal that fails names the marker and clears nothing more.
  const notCleared = (why) => {
    process.stderr.write(`stage-active: ${why} - the stage is NOT cleared; remove it from your own terminal, then run node scripts/stage-active.cjs --clear again\n`);
    process.exit(1);
  };
  // M34.6.B: the open stage's lifecycle gains `cleared` before its markers go (required: a row that
  // cannot be written stops the clear).
  if (open) {
    let evid = null;
    try { evid = require('./lib/evidence.cjs'); } catch (_) { evid = null; }
    if (evid && evid.stageState(base, open).onPath) {
      try { evid.appendLife(base, open, 'cleared'); } catch (e) { notCleared(`the cleared row could not be written to .claude/evidence/${open}/lifecycle.jsonl (${(e && e.code) || 'error'})`); }
    }
  }
  const named = [];
  let found = 0;
  for (const [name, f] of baseMarkers) {
    let kind;
    try { kind = markerKind(f); } catch (e) { notCleared(`could not read .claude/${name} (${(e && e.code) || 'lstat failed'})`); }
    if (kind === 'absent') continue;
    found++;
    try {
      if (kind === 'link') {
        // the link entry itself: unlink, or rmdir for a directory symlink on win32 - never rmSync
        // with recursive, which leaves a junction to a file and a dangling junction in place there
        try { fs.unlinkSync(f); } catch (e) { if (process.platform !== 'win32') throw e; fs.rmdirSync(f); }
        named.push(`stage-active: .claude/${name} was a link; removed the link, its target untouched`);
      } else if (kind === 'directory') {
        fs.rmSync(f, { recursive: true, force: true });
        named.push(`stage-active: .claude/${name} was a directory; removed`);
      } else fs.unlinkSync(f);
    } catch (e) { notCleared(`could not remove .claude/${name} (${(e && e.code) || 'removal failed'})`); }
  }
  for (const [name, f] of baseMarkers) {
    let kind;
    try { kind = markerKind(f); } catch (e) { notCleared(`could not read .claude/${name} (${(e && e.code) || 'lstat failed'})`); }
    if (kind !== 'absent') notCleared(`.claude/${name} is still there after the removal`);
  }
  // M34.2.B (R-113): no marker was here, so nothing was cleared here; no archive, no receipt.
  if (found === 0) {
    process.stdout.write('stage-active + red-approved cleared (gate dormant)\n');
    process.stderr.write(`stage-active: no marker was present in ${claudeDir}; nothing was cleared here\n`);
    process.exit(0);
  }
  // M34.C item 4: the approval record goes beside the stage's evidence (.claude/measurements/<stage>/
  // approval.json, never over an earlier archive) and the live file is removed, once the markers are
  // gone. The clear is never held up by it: an archive that cannot be written leaves the live record
  // and says so.
  let archiveNote = null;
  try { require('./lib/channel.cjs').archiveApproval(base, open); } catch (e) {
    archiveNote = `stage-active: note - the approval record (.claude/channel/approval.json) was not archived (${e && e.message ? e.message : 'error'}); it stays in place.`;
  }
  process.stdout.write('stage-active + red-approved cleared (gate dormant)\n');
  for (const l of named) process.stderr.write(l + '\n');
  if (measureLine) process.stderr.write(measureLine + '\n');
  if (archiveNote) process.stderr.write(archiveNote + '\n');
  emitReceipt('stage_cleared', { marker: 'stage-active' }, claudeDir);
  process.exit(0);
}

if (args.length !== 1 || /^-/.test(args[0])) {
  process.stderr.write('stage-active: expected a single stage id\n');
  process.stderr.write('usage: node scripts/stage-active.cjs <stage-id>   |   --clear   |   --clear --tree <path>\n');
  process.exit(2);
}

const id = args[0].trim();

// M34.1.B (V-2): a marker that is a directory or a link is broken; the open writes nothing over it
// and names the clear, which the person runs (the red gate refuses the agent while it stands).
for (const [name, f] of MARKERS) {
  let kind = 'absent';
  try { kind = markerKind(f); } catch (_) { kind = 'absent'; /* unreadable: the write below reports it */ }
  if (kind === 'directory' || kind === 'link') {
    process.stderr.write(`stage-active: ${id} is NOT open - .claude/${name} is a ${kind}; clear it from your own terminal first (the red gate refuses the agent's call while a marker is broken): node scripts/stage-active.cjs --clear, then open the stage again.\n`);
    process.exit(2);
  }
}

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
  if (trees === null) {
    // M34.A: null is "not a repository" OR "git did not run"; only the first is the
    // courier case. git itself tells them apart, and anything but its own "not a git repository"
    // is a refusal naming git (an orchestrator worktree may exist that this call cannot see).
    const g = require('child_process').spawnSync('git', ['rev-parse', '--git-dir'], { cwd: process.cwd(), encoding: 'utf8' });
    if (g.error) return { open: false, line: `stage-active: ${id} is NOT open - git did not run (${g.error.code || g.error.message}), so the listening gate cannot see this repo's worktrees; put git on PATH, then open the stage again.` };
    if (g.status !== 0 && /not a git repository/i.test(g.stderr || '')) return courier('not inside a git repository');
    const said = String(g.stderr || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || `git worktree list failed, git rev-parse exit ${g.status}`;
    return { open: false, line: `stage-active: ${id} is NOT open - git failed (${said}), so the listening gate cannot see this repo's worktrees; fix git here, then open the stage again.` };
  }
  const orch = trees.filter((w) => !sameTree(w, process.cwd())).filter((w) => { const r = chan.readRole(w); return r.state === 'resolved' && r.role === 'orchestrator'; });
  if (orch.length === 0) return courier('no orchestrator worktree in this repo (Lite, or before the worktree split)');
  const w = chan.watcherState(path.join(claudeDir, 'channel', 'watch.orchestrator.json'));
  if (w.state === 'listening') return { open: true, applied: true, line: `STAGE OPEN: ${id} - the orchestrator is listening (watcher pid ${w.m.pid}, armed ${typeof w.m.since === 'string' ? w.m.since : 'at an unknown time'}).` };
  // M34.6.E item 7 (R-174): only a live watcher opens a stage; a recent prompt (presence) no longer does.
  return { open: false, why: w.state === 'none' ? 'no watcher' : `its watcher is ${w.state}` };
}
const gate = listeningGate();
if (!gate.open && gate.line) {
  process.stderr.write(gate.line + '\n');
  process.exit(2);
}
if (!gate.open) {
  process.stderr.write(`stage-active: ${id} is NOT open - the orchestrator is not listening (${gate.why}). In the orchestrator window type /listen ${id}, then open the stage again.\n`);
  process.exit(2);
}

// M34.6.B: the evidence library, and the clear verified at the next open.
let evid;
try { evid = require('./lib/evidence.cjs'); } catch (e) {
  process.stderr.write(`stage-active: ${id} is NOT open - scripts/lib/evidence.cjs did not load (${String((e && e.message) || e).split('\n')[0]}); repair the install with node scripts/kit-update.cjs --adopt, then open the stage again.\n`);
  process.exit(2);
}
const uncleared = evid.unclearedStages(process.cwd());
if (uncleared.length) {
  const prev = uncleared[0];
  process.stderr.write(`stage-active: ${id} is NOT open - stage ${prev} is accepted and not cleared (.claude/evidence/${prev}/lifecycle.jsonl has no cleared row): run node scripts/stage-active.cjs --clear in the tree that accepted it, then commit .claude/evidence/${prev}/lifecycle.jsonl\n`);
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

// M34.6.B: the lifecycle's first rows, inside a git repository (the subject is the index). The two
// required rows refuse the open, and the markers just written go, when they cannot be recorded or
// the probe is answered wrongly; the host row is diagnostic.
let onPath = false;
const subj = evid.subject(process.cwd());
if (!subj.error) {
  const unopen = (why) => {
    for (const f of [stageFile, stageRoleFile]) { try { fs.rmSync(f, { force: true }); } catch (_) { /* reported below */ } }
    process.stderr.write(`stage-active: ${id} is NOT open - ${why}\n`);
    process.exit(2);
  };
  let session = null;
  try { session = require('./lib/receipts.cjs').resolveScriptSession(process.env).session || null; } catch (_) { session = null; }
  try {
    const r = chan.readRole(process.cwd());
    evid.appendLife(process.cwd(), id, 'opened', { role: r.state === 'resolved' ? r.role : (r.state === 'absent' ? 'work' : 'unresolved'), session, subject: subj.subject });
  } catch (e) { unopen(`the evidence could not be recorded: .claude/evidence/${id}/lifecycle.jsonl ${(e && e.code) || 'error'}`); }
  const live = evid.probeLiveness(process.cwd());
  try { evid.appendLife(process.cwd(), id, 'probed', live); } catch (e) { unopen(`the evidence could not be recorded: .claude/evidence/${id}/lifecycle.jsonl ${(e && e.code) || 'error'}`); }
  if (!live.pass) unopen(`the red gate answered the probe wrongly: ${live.detail}; the hook is .claude/hooks/pretooluse-red-gate.cjs`);
  try { evid.appendLife(process.cwd(), id, 'host', evid.probeHost(process.cwd())); } catch (_) { /* diagnostic: the stage end names a missing host row in degraded */ }
  onPath = true;
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
  else { const r = chan.append(process.cwd(), res, 'stage-open', 'open', Buffer.from(gate.line, 'utf8'), onPath ? { extra: { evidence: 1 } } : undefined); published = r.ok ? { ok: true, bell: chan.bellLine(res, r.msg.seq) } : { ok: false, why: r.line }; }
} catch (e) { published = { ok: false, why: e && e.message ? e.message : 'error' }; }
process.stderr.write(gate.line + '\n');
if (published.ok && published.bell) process.stderr.write(published.bell + '\n');
if (gate.applied && !published.ok) {
  process.stderr.write(`stage-active: the stage-open packet was NOT published (${published.why}) - publish it by hand: node scripts/channel.cjs publish --class stage-open --body "${gate.line}"\n`);
}
process.exit(0);
