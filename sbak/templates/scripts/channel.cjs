#!/usr/bin/env node
// @kit-version 1.0.8
// scripts/channel.cjs
//   (kit source of truth: templates/scripts/channel.cjs; the core is scripts/lib/channel.cjs)
//
// THE TERMINAL CHANNEL CLI (M30.H) - file-based pub/sub between the orchestrator session and the
// builder session. What the human sees is one plain line per message plus the block itself; the
// JSON log is the background layer and prints only on `replay`.
//
//   node scripts/channel.cjs publish --class <stage-open|stage-packet|clarification> [--kind k]
//                                   (--body "text" | --body-file f) [--reply-to n]      role=work
//   node scripts/channel.cjs send [--approval] [--kind k] (--body "text" | --body-file f) [--reply-to n]
//                                                                                        role=orchestrator
//   node scripts/channel.cjs ack --reply-to <seq>       role=orchestrator, no /send: answers one amendment
//   node scripts/channel.cjs pickup [--from <seq>]      surface the unread inbox; advance the cursor
//   node scripts/channel.cjs watch [--poll-ms 750] [--liveness-ms 120000] [--max-ms 28800000]
//                                                       block until the inbox grows, then exit (the wake)
//   node scripts/channel.cjs status [--json]
//   node scripts/channel.cjs replay [--stage <id>] [--json]
//
// Exit codes: 0 ok | 2 fault (fail loud: the one line names it and the human-courier fallback)
//             | 3 liveness timeout (dead peer) | 4 backlog already present (watch) | 5 watch ceiling.
//
// Direction and the sender stamp derive from THIS tree's .claude/role - there is no --to and no
// --role; the orchestrator writes orch-to-builder and every other role (work, verifier, refactor -
// the same worktree under a different role) writes builder-to-orch; an orchestrator cannot
// publish a packet and a builder-side session cannot send. A stage-end packet that quotes two
// release-lane runs carries a `release-run-reason:` line, or it is refused; the same holds for the
// other full-floor classes (a selector audit, an identity proof) under `<class>-run-reason:`.
// Every send and publish prints the bell after its sent line when a peer worktree exists: the line
// the session rings the peer with (M33.G; the jsonl stays the record, D3).

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ch = require('./lib/channel.cjs');

const cwd = process.cwd();
const argv = process.argv.slice(2);
const verb = argv[0];

function opt(name, dflt) { const i = argv.indexOf(name); return i === -1 || i === argv.length - 1 ? dflt : argv[i + 1]; }
function flag(name) { return argv.indexOf(name) !== -1; }
function die(line, code) { process.stderr.write(line + '\n'); process.exit(code === undefined ? 2 : code); }
function out(s) { process.stdout.write(s + '\n'); }

function bodyBuf() {
  const f = opt('--body-file', null);
  if (f) { try { return fs.readFileSync(path.resolve(cwd, f)); } catch (e) { die(`channel: cannot read --body-file ${f} (${e.message})`); } }
  const b = opt('--body', null);
  if (b === null) die('channel: a body is required (--body "text" or --body-file <path>)');
  return Buffer.from(b, 'utf8');
}
function resolved() { const r = ch.resolve(cwd); if (!r.ok) die(r.line); return r; }
// One release lane per stage: each distinct release-lane run a stage-end packet quotes, derived from
// the lane's own last line or its verify-summary JSON and keyed on duration. A durationless failure
// line is a run of its own unless a failed release summary in the same packet carries its duration.
function releaseRuns(text) {
  const runs = new Set(); let failedSummary = false;
  for (const m of text.matchAll(/\(lane release, (?:total )?(\d+(?:\.\d+)?)s\)/g)) runs.add(`${Number(m[1]).toFixed(1)}s`);
  for (const m of text.matchAll(/^verify-summary (\{.*\})[^\S\n]*$/gm)) {
    let j = null; try { j = JSON.parse(m[1]); } catch (_) { j = null; }
    if (!j || j.lane !== 'release' || !Number.isFinite(j.totalDurationMs)) continue;
    runs.add(`${(j.totalDurationMs / 1000).toFixed(1)}s`);
    if (j.verdict === 'fail') failedSummary = true;
  }
  if (/FAILED \(lane release\)/.test(text) && !failedSummary) runs.add('FAILED (no duration)');
  return [...runs];
}
// One long proof per stage (R-61): the other full-floor classes, each keyed on its own banner's
// duration - the selector audit's summary line and the identity proof's side-by-side row.
const LONG_BANNERS = {
  'selector-audit': /\[selector-audit\] [^\n]*?: (\d+(?:\.\d+)?) s wall, after a full run of /g,
  'identity-proof': /two floors side by side: (\d+(?:\.\d+)?) s \(pool exit /g,
};
function longRuns(text, cls) { return [...new Set([...text.matchAll(LONG_BANNERS[cls])].map((m) => `${Number(m[1]).toFixed(1)} s`))]; }
// The gate-1 grep (M33.G): the items under a "pins touched:" line (or text after it), null when
// there is no such line. Presence and non-emptiness only; the orchestrator judges the truth.
function pinsTouched(text) {
  const lines = text.split(/\r?\n/);
  const head = /^\s*(?:\*\*)?pins touched:(?:\*\*)?/i;
  const i = lines.findIndex((l) => head.test(l));
  if (i === -1) return null;
  if (lines[i].replace(head, '').trim()) return 1;
  let n = 0;
  for (let j = i + 1; j < lines.length; j++) {
    if (!lines[j].trim()) { if (n) break; continue; }
    if (!/^\s*[-*]\s+\S/.test(lines[j])) break;
    n++;
  }
  return n;
}
function bell(res, seq) { const b = ch.bellLine(res, seq); if (b) out(b); }
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
const pidAlive = ch.pidAlive; // the one KF-67 probe (the stage-active gate shares it)

// ---------------------------------------------------------------------------
if (verb === 'publish' || verb === 'send') {
  const res = resolved();
  let cls;
  if (verb === 'publish') {
    if (ch.SIDE[res.role] !== 'work') die(`channel: only the builder publishes (work, verifier or refactor; this tree's role is ${res.role}) - the orchestrator uses /send`);
    cls = opt('--class', null);
    if (!cls) die(`channel: publish needs --class <${ch.BUILDER_CLASSES.join('|')}>`);
  } else {
    if (res.role !== 'orchestrator') die(`channel: only the orchestrator sends (this tree's role is ${res.role}) - builder packets publish automatically (node scripts/channel.cjs publish)`);
    const gate = ch.sendGate(cwd);
    if (!gate.ok) die(gate.line);
    cls = flag('--approval') ? 'approval-request' : 'courier';
  }
  const kind = opt('--kind', null) || (cls === 'stage-open' ? 'open' : cls === 'courier' ? 'message' : cls);
  if (!ch.KIND_RE.test(kind)) die(`channel: --kind must match ${ch.KIND_RE}`);
  const replyTo = opt('--reply-to', null);
  const body = bodyBuf();
  const extra = {};
  if (cls === 'stage-packet' && kind === 'stage-end') {
    const text = body.toString('utf8'); const runs = releaseRuns(text);
    if (runs.length > 1 && !/^release-run-reason:[^\S\n]*\S/m.test(text)) die(`channel: this stage-end packet quotes ${runs.length} release-lane runs (${runs.join(', ')}) and no release-run-reason: line - one release lane per stage, on the final bytes; a second run needs "release-run-reason: <why>" in the packet`);
    for (const c of Object.keys(LONG_BANNERS)) {
      const rs = longRuns(text, c);
      if (rs.length > 1 && !new RegExp(`^${c}-run-reason:[^\\S\\n]*\\S`, 'm').test(text)) die(`channel: this stage-end packet quotes ${rs.length} ${c} runs (${rs.join(', ')}) and no ${c}-run-reason: line - one long proof per stage, on the final bytes; a second run needs "${c}-run-reason: <why>" in the packet`);
    }
  }
  if (cls === 'stage-packet' && kind === 'gate-1') {
    const n = pinsTouched(body.toString('utf8'));
    if (n === null) die('channel: a gate-1 packet needs a "pins touched:" block - list every smoke label and validator this stage will change (grep -n over the test surface), one per line under a "pins touched:" line; nothing was sent');
    if (n === 0) die('channel: the gate-1 packet\'s "pins touched:" block lists nothing - list every smoke label and validator this stage will change (grep -n over the test surface), or "- none: <the grep that found none>"; nothing was sent');
  }
  if (cls === 'stage-packet' && kind === 'amendment') {
    const a = ch.amendment(res);
    if (!a.ok) die(a.line);
    extra.amended = a.amended;
  }
  const r = ch.append(cwd, res, cls, kind, body, { replyTo: replyTo === null ? undefined : parseInt(replyTo, 10), extra });
  if (!r.ok) die(r.line);
  const peer = ch.PEER_NAME[ch.PEER[res.role]];
  out(`channel: sent seq ${r.msg.seq} to ${peer} (${cls}, ${r.msg.bytes} bytes, sha256 ${r.msg.hash.slice(7, 19)}) - turn: ${r.holder}`);
  bell(res, r.msg.seq);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The ack (M33.G): the orchestrator's one publish without /send, only in reply to an amendment.
if (verb === 'ack') {
  const res = resolved();
  if (res.role !== 'orchestrator') die(`channel: only the orchestrator acks (this tree's role is ${res.role}) - the builder publishes an amendment and waits for it`);
  const rt = opt('--reply-to', null);
  if (rt === null || !/^[1-9][0-9]{0,8}$/.test(rt)) die('channel: ack needs --reply-to <the amendment\'s seq> - an ack answers one amendment and nothing else');
  const r = ch.ackAmendment(cwd, res, parseInt(rt, 10));
  if (!r.ok) die(r.line);
  out(`channel: sent seq ${r.msg.seq} to ${ch.PEER_NAME[ch.PEER[res.role]]} (courier, ${r.msg.bytes} bytes, sha256 ${r.msg.hash.slice(7, 19)}) - turn: ${r.holder}`);
  bell(res, r.msg.seq);
  process.exit(0);
}

// ---------------------------------------------------------------------------
if (verb === 'pickup') {
  const res = resolved();
  const from = opt('--from', null);
  if (from !== null) ch.writeCursor(res.root, res.role, parseInt(from, 10) || 0);
  const u = ch.unreadFor(res);
  if (u.fault) die(u.fault.line);
  const peer = ch.PEER_NAME[ch.PEER[res.role]];
  if (!u.unread.length) { out(`channel: nothing new from ${peer} (cursor ${u.cursor})`); process.exit(0); }
  for (const m of u.unread) {
    out(ch.pickupLine(res, m));
    process.stdout.write(m.body);
    if (!m.body.endsWith('\n')) process.stdout.write('\n');
    out('');
    ch.emit(cwd, 'channel', 'channel_picked_up', { seq: m.seq, channel_class: m.class, role: res.role, stage: m.stage === '-' ? undefined : m.stage });
  }
  if (u.consumable > u.cursor) ch.writeCursor(res.root, res.role, u.consumable);
  let holder;
  if (u.pending) { holder = 'human'; ch.writeTurn(res.root, 'human', u.pending.seq); }
  else { holder = ch.SIDE[res.role]; ch.writeTurn(res.root, holder, u.consumable); }
  if (u.pending) out(`channel: approval-request seq ${u.pending.seq} is pending - it waits for the human (${ch.SIDE[res.role] === 'work' ? '/approve-red in this terminal' : 'a human action'}); nothing past it is consumed`);
  out(`channel: turn: ${holder} - end this turn by arming the watcher: node scripts/channel.cjs watch (run in background)`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
if (verb === 'watch') {
  const res = resolved();
  const pollMs = parseInt(opt('--poll-ms', '750'), 10) || 750;
  const livenessMs = parseInt(opt('--liveness-ms', '120000'), 10) || 120000;
  const maxMs = parseInt(opt('--max-ms', String(8 * 3600 * 1000)), 10) || 8 * 3600 * 1000;
  const peerRole = ch.PEER[res.role];
  const peer = ch.PEER_NAME[peerRole];
  const marker = path.join(res.root, `watch.${ch.SIDE[res.role]}.json`); // one watcher per SIDE (work | verifier | refactor share the builder marker)
  const clearMarker = () => { try { fs.rmSync(marker, { force: true }); } catch (_) { /* fine */ } };

  // Arm-time integrity: never go on listen over a broken inbox.
  const u0 = ch.unreadFor(res);
  if (u0.fault) die(u0.fault.line.replace('pickup stopped', 'watch not armed'));
  // One watcher per role: a live predecessor is replaced, a stale marker is dropped.
  try {
    const prev = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (prev && Number.isInteger(prev.pid) && prev.pid !== process.pid && pidAlive(prev.pid)) { try { process.kill(prev.pid); } catch (_) { /* fine */ } }
  } catch (_) { /* no marker */ }
  clearMarker();
  if (u0.unread.length) { out(ch.summaryLine(res, u0.unread)); process.exit(4); }
  // M32.I (KF-65): Claude Code reaps idle background shells under host memory pressure unless the
  // session was LAUNCHED with this variable (setting it from a shell command has no effect). The
  // value is trimmed: cmd's `set X=1 && claude` stores "1 " with a trailing space.
  if (String(process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP || '').trim() !== '1') {
    out('channel: note - this host\'s Claude Code may reap background shells under memory pressure; launch sessions with CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1 to keep the watcher alive');
  }

  const inbox = ch.inboxFile(res);
  const sizeOf = (f) => { try { const s = fs.statSync(f); return { size: s.size, mtime: s.mtimeMs }; } catch (_) { return { size: 0, mtime: 0 }; } };
  const start = Date.now();
  fs.mkdirSync(res.root, { recursive: true });
  // M33.G: the marker carries a start token and this watcher touches it every poll; a
  // live pid whose marker went stale is not listening (lib/channel.cjs watcherState).
  fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, since: new Date(start).toISOString(), inbox: path.basename(inbox), size: sizeOf(inbox).size, token: crypto.randomBytes(8).toString('hex'), poll_ms: pollMs }) + '\n');
  process.on('exit', clearMarker);
  const touch = () => { try { const t = new Date(); fs.utimesSync(marker, t, t); } catch (_) { /* a missing marker is the exit path's */ } };

  // Liveness phase: something I published is not yet consumed by the peer.
  const mine = ch.readLog(ch.outboxFile(res), res.role, res.repo);
  const lastSeq = mine.fault ? 0 : (mine.msgs.length ? mine.msgs[mine.msgs.length - 1].seq : 0);
  if (lastSeq > 0 && ch.readCursor(res.root, peerRole) < lastSeq) {
    const t0 = Date.now();
    while (ch.readCursor(res.root, peerRole) < lastSeq) {
      if (Date.now() - t0 >= livenessMs) {
        clearMarker();
        die(`channel: ${peer} has not picked up seq ${lastSeq} in ${Math.round(livenessMs / 1000)} s - that session may be closed or not listening. Fallback: paste the block by hand into the ${peer} terminal (human courier); the log keeps seq ${lastSeq}.`, 3);
      }
      sleep(pollMs);
      touch();
    }
  }

  // Inbox phase: block until the file grows (size / mtime poll; no inotify - Windows-native).
  const base = sizeOf(inbox);
  for (;;) {
    if (Date.now() - start >= maxMs) { clearMarker(); die(`channel: watcher expired after ${Math.round(maxMs / 3600000)} h with no traffic - re-arm if the stage is still live (node scripts/channel.cjs watch)`, 5); }
    sleep(pollMs);
    touch();
    const now = sizeOf(inbox);
    if (now.size !== base.size || now.mtime !== base.mtime) {
      const u = ch.unreadFor(res);
      clearMarker();
      if (u.fault) die(u.fault.line.replace('pickup stopped', 'watch stopped'));
      if (!u.unread.length) { base.size = now.size; base.mtime = now.mtime; continue; } // touched, nothing new
      out(ch.summaryLine(res, u.unread));
      process.exit(0);
    }
  }
}

// ---------------------------------------------------------------------------
if (verb === 'status') {
  const res = resolved();
  const inbox = ch.unreadFor(res);
  const turn = ch.readTurn(res.root);
  // M32.I (KF-67): a marker is not a listener. Each marker's pid is probed; a dead one (ESRCH, or a
  // marker that cannot be read at all) is reported as DEAD and its stale file removed. M33.G:
  // a live pid whose token went stale is STALE - not listening, and its marker stays (the
  // pid is alive; this command never kills a process it cannot name).
  const watchers = [];
  const dead = [];
  const stale = [];
  for (const side of ['work', 'orchestrator']) {
    const marker = path.join(res.root, `watch.${side}.json`);
    const w = ch.watcherState(marker);
    if (w.state === 'none') continue;
    if (w.state === 'listening') { watchers.push(side); continue; }
    const row = { side, pid: w.m && Number.isInteger(w.m.pid) ? w.m.pid : null, since: w.m && typeof w.m.since === 'string' ? w.m.since : null };
    if (w.state === 'stale') { stale.push(row); continue; }
    dead.push(row);
    try { fs.rmSync(marker, { force: true }); } catch (_) { /* fine */ }
  }
  // R-57: the host reaps idle background shells unless the session was launched with the variable;
  // this process inherits the session's environment, so it reports what the session has.
  const reaper = String(process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP || '').trim() === '1' ? 'off' : 'on';
  // The builder tree's unpushed work against the resolved trunk (main, else master): the list
  // /closeout derives its CHANGELOG from, read through the one resolver.
  const tk = ch.aheadOf(res.tree);
  const st = {
    role: res.role, repo: res.repo, root: res.root, turn: turn ? turn.holder : null,
    cursors: { work: ch.readCursor(res.root, 'work'), orchestrator: ch.readCursor(res.root, 'orchestrator') },
    unread: inbox.fault ? null : inbox.unread.length, fault: inbox.fault ? inbox.fault.line : null,
    watchers, dead_watchers: dead, stale_watchers: stale, trunk: tk.trunk, ahead: tk.ahead, reaper,
  };
  if (flag('--json')) { out(JSON.stringify(st)); process.exit(0); }
  const deadText = dead.map((d) => ` - watcher DEAD: ${d.side} (pid ${d.pid === null ? 'unknown' : d.pid}, armed ${d.since || 'unknown'}) - re-arm: node scripts/channel.cjs watch`).join('');
  const staleText = stale.map((d) => ` - watcher STALE: ${d.side} (pid ${d.pid}, armed ${d.since || 'unknown'}, no fresh token) - re-arm: node scripts/channel.cjs watch`).join('');
  out(`channel: role=${st.role} repo=${st.repo} root=${st.root}`);
  out(`channel: turn: ${st.turn || 'idle'} - cursors work=${st.cursors.work} orchestrator=${st.cursors.orchestrator} - unread for me: ${st.fault ? 'FAULT' : st.unread}${st.watchers.length ? ` - watching: ${st.watchers.join(', ')}` : ''}${deadText}${staleText}`);
  out(st.trunk === null ? 'channel: trunk unresolved - no main or master branch here' : `channel: trunk ${st.trunk} - ${st.ahead.length} commit(s) ahead of it`);
  out(reaper === 'off' ? 'channel: reaper: off (CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1)' : 'channel: reaper: on - launch with CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1 beside --model to keep the watcher alive');
  if (st.fault) out(st.fault);
  process.exit(0);
}

// ---------------------------------------------------------------------------
if (verb === 'replay') {
  const res = resolved();
  const stage = opt('--stage', null);
  const all = [];
  for (const writer of ['work', 'orchestrator']) {
    const file = path.join(res.root, ch.FILES[writer]);
    const { msgs, fault } = ch.readLog(file, writer, res.repo);
    if (fault) die(fault.line.replace('pickup stopped', 'replay stopped'));
    for (const m of msgs) all.push(Object.assign({ file: path.basename(file, '.jsonl') }, m));
  }
  all.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : a.seq - b.seq));
  const sel = stage ? all.filter((m) => m.stage === stage) : all;
  if (flag('--json')) { out(JSON.stringify(sel)); process.exit(0); }
  for (const m of sel) { out(`[${m.ts}] ${m.file} seq ${m.seq} ${m.role} ${m.class}/${m.kind} ${m.hash.slice(0, 19)} (${m.bytes} bytes)`); process.stdout.write(m.body); if (!m.body.endsWith('\n')) process.stdout.write('\n'); out(''); }
  process.exit(0);
}

die('channel: unknown or missing command - the commands are publish | send | ack | pickup | watch | status | replay; ask in this session for the right invocation rather than guessing.');
