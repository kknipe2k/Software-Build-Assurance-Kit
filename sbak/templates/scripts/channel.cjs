#!/usr/bin/env node
// @kit-version 1.0.5
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
// publish a packet and a builder-side session cannot send.

'use strict';

const fs = require('fs');
const path = require('path');
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
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; } }

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
  const r = ch.append(cwd, res, cls, kind, bodyBuf(), { replyTo: replyTo === null ? undefined : parseInt(replyTo, 10) });
  if (!r.ok) die(r.line);
  const peer = ch.PEER_NAME[ch.PEER[res.role]];
  out(`channel: sent seq ${r.msg.seq} to ${peer} (${cls}, ${r.msg.bytes} bytes, sha256 ${r.msg.hash.slice(7, 19)}) - turn: ${r.holder}`);
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

  const inbox = ch.inboxFile(res);
  const sizeOf = (f) => { try { const s = fs.statSync(f); return { size: s.size, mtime: s.mtimeMs }; } catch (_) { return { size: 0, mtime: 0 }; } };
  const start = Date.now();
  fs.mkdirSync(res.root, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, since: new Date(start).toISOString(), inbox: path.basename(inbox), size: sizeOf(inbox).size }) + '\n');
  process.on('exit', clearMarker);

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
    }
  }

  // Inbox phase: block until the file grows (size / mtime poll; no inotify - Windows-native).
  const base = sizeOf(inbox);
  for (;;) {
    if (Date.now() - start >= maxMs) { clearMarker(); die(`channel: watcher expired after ${Math.round(maxMs / 3600000)} h with no traffic - re-arm if the stage is still live (node scripts/channel.cjs watch)`, 5); }
    sleep(pollMs);
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
  const st = {
    role: res.role, repo: res.repo, root: res.root, turn: turn ? turn.holder : null,
    cursors: { work: ch.readCursor(res.root, 'work'), orchestrator: ch.readCursor(res.root, 'orchestrator') },
    unread: inbox.fault ? null : inbox.unread.length, fault: inbox.fault ? inbox.fault.line : null,
    watchers: ['work', 'orchestrator'].filter((r) => fs.existsSync(path.join(res.root, `watch.${r}.json`))),
  };
  if (flag('--json')) { out(JSON.stringify(st)); process.exit(0); }
  out(`channel: role=${st.role} repo=${st.repo} root=${st.root}`);
  out(`channel: turn: ${st.turn || 'idle'} - cursors work=${st.cursors.work} orchestrator=${st.cursors.orchestrator} - unread for me: ${st.fault ? 'FAULT' : st.unread}${st.watchers.length ? ` - watching: ${st.watchers.join(', ')}` : ''}`);
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

die('channel: unknown or missing command - the commands are publish | send | pickup | watch | status | replay; ask in this session for the right invocation rather than guessing.');
