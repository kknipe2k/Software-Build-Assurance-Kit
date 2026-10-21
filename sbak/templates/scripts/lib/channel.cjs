#!/usr/bin/env node
// @kit-version 1.0.8
// scripts/lib/channel.cjs
//   (kit source of truth: templates/scripts/lib/channel.cjs)
//
// THE TERMINAL CHANNEL (M30.H, plan Stage 4) - the shared core behind scripts/channel.cjs (the
// CLI), the SessionStart stamp (the restart line + repo identity) and approve-red.cjs (the human's
// consumption of an approval-request). File-based pub/sub between the orchestrator session and
// the builder session on one machine:
//
//   * TRANSPORT: two append-only JSONL files in the BUILDER's working tree,
//       .claude/channel/orch-to-builder.jsonl   (written only by role=orchestrator)
//       .claude/channel/builder-to-orch.jsonl   (written only by role=work)
//     One JSON object per line: v, seq (per file, 1-based, contiguous), ts, role (the WRITER's
//     .claude/role via the strict reader - never an argument), session, repo, stage, class, kind,
//     hash (sha256 of the body bytes, computed at send, checked at pickup), bytes, reply_to,
//     state (stage-packet only: branch / head / ahead / status), body (verbatim).
//   * WHERE THE ROOT IS: the tree whose .claude/role is `work`. A work session uses its own tree;
//     an orchestrator session enumerates `git worktree list` and requires EXACTLY ONE tree with a
//     present `work` marker - zero or several is a loud refusal, never a guess. The channel
//     therefore starts at the worktree split (two roles cannot share one role file).
//   * THE HITL LINE: builder->orch classes (stage-open / stage-packet / clarification) publish
//     automatically; orch->builder classes (courier / approval-request) are written only behind a
//     human action - the /send keystroke (the mode-check hook's one-shot token) or the fence's
//     ask click on `node scripts/channel.cjs send`. An approval-request is surfaced at pickup and
//     NEVER consumed by an agent: approve-red.cjs (the human) advances the cursor past it.
//   * FAIL LOUD: a cursor gap, an unparseable line, a role or repo mismatch, a hash mismatch
//     (paraphrase) or a dead peer stops the pickup with one line naming the fault and the
//     human-courier fallback. A poisoned inbox is not partially trusted.
//   * PERSISTENCE: the two logs are tracked and committed with the stage; cursor.<role>, turn,
//     watch.<role>.json, send-token, present.<side>.json and approval.json are transient
//     (gitignored). Append-only means append-only:
//     nothing here rewrites, compacts or truncates a log.
//
// Dependency-free Node, Windows-native (file polling, no inotify). Requires only the frozen
// receipts contract next to it (for the two channel events; absent = no events, never a fault).

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SCHEMA = 1;
const ROLES = ['work', 'verifier', 'orchestrator', 'refactor'];
const CLASSES = Object.freeze(['stage-open', 'stage-packet', 'clarification', 'courier', 'approval-request']);
const BUILDER_CLASSES = Object.freeze(['stage-open', 'stage-packet', 'clarification']);
const ORCH_CLASSES = Object.freeze(['courier', 'approval-request']);
// M30.1.A item 6 (owner ruling: the channel persists for ALL roles): the direction rule is
// "the orchestrator writes orch-to-builder; every other role writes builder-to-orch". A
// verifier or refactor session is the builder worktree under a different role, so the three
// builder-side roles share one log, one cursor and one watch marker (SIDE) - no new files. The
// message carries the WRITING tree's role, and the foreground lines name it.
const WRITER_ROLES = Object.freeze(['work', 'verifier', 'refactor']); // the builder side
const FILES = Object.freeze({ work: 'builder-to-orch.jsonl', verifier: 'builder-to-orch.jsonl', refactor: 'builder-to-orch.jsonl', orchestrator: 'orch-to-builder.jsonl' }); // writer role -> file
const SIDE = Object.freeze({ work: 'work', verifier: 'work', refactor: 'work', orchestrator: 'orchestrator' }); // role -> cursor / marker / turn owner
const PEER = Object.freeze({ work: 'orchestrator', verifier: 'orchestrator', refactor: 'orchestrator', orchestrator: 'work' }); // role -> the peer SIDE
const PEER_NAME = Object.freeze({ work: 'builder', verifier: 'verifier', refactor: 'refactor', orchestrator: 'orchestrator' });
function writersOf(role) { return SIDE[role] === 'orchestrator' ? ['orchestrator'] : WRITER_ROLES; } // who may have stamped a side's log
const KIND_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const STAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SEND_ASK_RULE = 'Bash(node scripts/channel.cjs send *)';

// ---------------------------------------------------------------------------
// The strict role reader (the hooks' rule: bare token; absent = work; garbage = unresolved).
// ---------------------------------------------------------------------------
const NUL = String.fromCharCode(0);
// decodeBytes + realOrLexical: the shared hook helpers (M32.A fold of M32.R Dup-1 / Dup-2).
const { decodeBytes, realOrLexical } = require(path.join(__dirname, 'hook-root.cjs'));
// -> { state: 'absent' | 'resolved' | 'unresolved', role }
function readRole(tree) {
  const f = path.join(tree, '.claude', 'role');
  if (!fs.existsSync(f)) return { state: 'absent', role: 'work' };
  let t;
  try { t = decodeBytes(fs.readFileSync(f)).split(NUL).join('').trim().toLowerCase(); } catch (_) { return { state: 'unresolved', role: null }; }
  return ROLES.indexOf(t) === -1 ? { state: 'unresolved', role: null } : { state: 'resolved', role: t };
}

// ---------------------------------------------------------------------------
// git + repo identity (the worktree-collision cure: the same string the stamp prints)
// ---------------------------------------------------------------------------
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return r.status === 0 ? String(r.stdout).replace(/\r?\n$/, '') : null;
}
function normPath(p) { const s = path.resolve(p).replace(/\\/g, '/'); return process.platform === 'win32' ? s.toLowerCase() : s; }
function worktrees(cwd) {
  const out = git(cwd, ['worktree', 'list', '--porcelain']);
  if (out === null) return null;
  return out.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
}
// { repo: '<project>@<8hex>', project, main, common } or null outside git.
function repoIdentity(cwd) {
  const wts = worktrees(cwd);
  const common = git(cwd, ['rev-parse', '--git-common-dir']);
  if (!wts || !wts.length || common === null) return null;
  const main = wts[0];
  const commonAbs = normPath(realOrLexical(path.resolve(cwd, common)));
  const hex = crypto.createHash('sha256').update(commonAbs, 'utf8').digest('hex').slice(0, 8);
  return { repo: `${path.basename(main)}@${hex}`, project: path.basename(main), main, common: commonAbs };
}

// ---------------------------------------------------------------------------
// Root resolution: the work tree's .claude/channel. Refuses to guess.
// ---------------------------------------------------------------------------
// -> { ok:true, role, tree, root, repo } | { ok:false, line }
function resolve(cwd) {
  const r = readRole(cwd);
  if (r.state === 'unresolved') return { ok: false, line: 'channel: .claude/role is present but unresolvable (the strict reader) - fix it with node scripts/set-mode.cjs <role>; fallback: human courier' };
  const role = r.role;
  const id = repoIdentity(cwd);
  if (!id) return { ok: false, line: 'channel: not inside a git repository - the channel lives in the builder worktree; fallback: human courier' };
  if (WRITER_ROLES.indexOf(role) !== -1) return { ok: true, role, tree: cwd, root: path.join(cwd, '.claude', 'channel'), repo: id.repo };
  if (role !== 'orchestrator') return { ok: false, line: `channel: role ${role} is not one the channel knows (work, verifier, refactor, orchestrator); fallback: human courier` };
  const wts = worktrees(cwd) || [];
  const cands = wts.filter((w) => normPath(w) !== normPath(cwd)).filter((w) => { const rr = readRole(w); return rr.state === 'resolved' && WRITER_ROLES.indexOf(rr.role) !== -1; });
  if (cands.length !== 1) return { ok: false, line: `channel: ${cands.length} builder worktrees found (need exactly 1: a tree whose .claude/role is work, verifier, or refactor) - the channel starts at the worktree split; fallback: human courier` };
  return { ok: true, role, tree: cands[0], root: path.join(cands[0], '.claude', 'channel'), repo: id.repo };
}

// ---------------------------------------------------------------------------
// Log reading with the integrity check.
// ---------------------------------------------------------------------------
function sha(buf) { return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); }
function fileFor(writerRole) { return FILES[writerRole]; }
function inboxFile(res) { return path.join(res.root, fileFor(PEER[res.role])); }
function outboxFile(res) { return path.join(res.root, fileFor(res.role)); }

// -> { msgs:[...], fault: null | { line } }   (the fault line is the whole plain-word sentence)
// expectRole names the SIDE whose log this is; any role of that side may have stamped a line.
function readLog(file, expectRole, repo) {
  const base = path.basename(file);
  const expected = writersOf(expectRole);
  const fb = (what) => ({ msgs: [], fault: { line: `channel: ${what} in ${base} - pickup stopped; fallback: paste the block by hand (human courier)` } });
  if (!fs.existsSync(file)) return { msgs: [], fault: null };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const msgs = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    let m;
    try { m = JSON.parse(lines[i]); } catch (_) { return fb(`unparseable line ${n}`); }
    if (!m || typeof m !== 'object' || typeof m.seq !== 'number') return fb(`unparseable line ${n} (no seq)`);
    if (m.seq !== n) return fb(`cursor gap - expected seq ${n}, found ${m.seq}`);
    if (expected.indexOf(m.role) === -1) return fb(`role mismatch at seq ${m.seq} (stamped ${m.role}, expected ${expected.join(' | ')})`);
    if (repo && m.repo !== repo) return fb(`repo mismatch at seq ${m.seq} (stamped ${m.repo}, this repo is ${repo})`);
    if (typeof m.body !== 'string' || sha(Buffer.from(m.body, 'utf8')) !== m.hash) return fb(`hash mismatch at seq ${m.seq} (the body bytes differ from the send hash - a paraphrase is not a relay)`);
    msgs.push(m);
  }
  return { msgs, fault: null };
}
function readCursor(root, role) { try { const v = parseInt(fs.readFileSync(path.join(root, `cursor.${SIDE[role] || role}`), 'utf8'), 10); return Number.isInteger(v) && v >= 0 ? v : 0; } catch (_) { return 0; } }
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function writeCursor(root, role, seq) { writeAtomic(path.join(root, `cursor.${SIDE[role] || role}`), `${seq}\n`); }
function readTurn(root) { try { return JSON.parse(fs.readFileSync(path.join(root, 'turn'), 'utf8')); } catch (_) { return null; } }
function writeTurn(root, holder, seq) { writeAtomic(path.join(root, 'turn'), JSON.stringify({ holder, since: new Date().toISOString(), seq }) + '\n'); }

// Unread for a role: the inbox messages past its cursor, in order, stopping AFTER an
// approval-request (it is surfaced but never auto-consumed, so nothing past it moves).
// -> { fault, unread, consumable (seq to advance to), pending (the approval-request or null) }
function unreadFor(res) {
  const { msgs, fault } = readLog(inboxFile(res), PEER[res.role], res.repo);
  if (fault) return { fault, unread: [], consumable: readCursor(res.root, res.role), pending: null };
  const cur = readCursor(res.root, res.role);
  const unread = [];
  let consumable = cur;
  let pending = null;
  for (const m of msgs) {
    if (m.seq <= cur) continue;
    unread.push(m);
    if (m.class === 'approval-request') { pending = m; break; }
    consumable = m.seq;
  }
  return { fault: null, unread, consumable, pending, cursor: cur };
}

// ---------------------------------------------------------------------------
// Receipts (bonus, never a fault).
// ---------------------------------------------------------------------------
function emit(cwd, emitter, event, extra) {
  try {
    const receipts = require(path.join(__dirname, 'receipts.cjs'));
    const rs = receipts.resolveScriptSession(process.env);
    const evt = Object.assign({ schema: receipts.SCHEMA_VERSION, at: new Date().toISOString(), event, emitter }, extra || {});
    if (rs.session) evt.session = rs.session;
    receipts.appendEvent(path.join(cwd, '.claude', 'receipts'), evt);
  } catch (_) { /* metrics are bonus */ }
}

// ---------------------------------------------------------------------------
// Append (the only writer).
// ---------------------------------------------------------------------------
function stageOf(tree) {
  try { const t = fs.readFileSync(path.join(tree, '.claude', 'stage-active'), 'utf8').split(NUL).join('').trim(); return STAGE_RE.test(t) ? t : '-'; } catch (_) { return '-'; }
}
// The trunk, resolved the way verify-local's base fallback reads it: main, then master (a project
// adopted into an existing master repo). The ONE resolver: the packets' ahead list, `channel
// status` and /closeout's commit list all read it. Nothing here ever renames a branch.
function trunkOf(tree) {
  for (const b of ['main', 'master']) if (git(tree, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]) !== null) return b;
  return null;
}
function aheadOf(tree) {
  const trunk = trunkOf(tree);
  const raw = trunk === null ? null : git(tree, ['log', '--oneline', `${trunk}..HEAD`]);
  return { trunk, ahead: raw === null ? [] : raw.split(/\r?\n/).filter(Boolean) };
}
function stateOf(tree) {
  const branch = git(tree, ['rev-parse', '--abbrev-ref', 'HEAD']) || '-';
  const head = git(tree, ['rev-parse', '--short', 'HEAD']) || '-';
  const { ahead } = aheadOf(tree);
  const statusRaw = git(tree, ['status', '--short']);
  const status = statusRaw === null ? [] : statusRaw.split(/\r?\n/).filter(Boolean);
  return { branch, head, ahead, status };
}
// -> { ok:true, msg, file } | { ok:false, line }
function append(cwd, res, cls, kind, bodyBuf, opts) {
  const o = opts || {};
  const writer = res.role;
  if (CLASSES.indexOf(cls) === -1) return { ok: false, line: `channel: unknown class ${cls} (one of ${CLASSES.join(' / ')})` };
  if ((SIDE[writer] === 'work' && BUILDER_CLASSES.indexOf(cls) === -1) || (writer === 'orchestrator' && ORCH_CLASSES.indexOf(cls) === -1)) {
    return { ok: false, line: `channel: role ${writer} cannot write class ${cls}` };
  }
  const file = outboxFile(res);
  const { msgs, fault } = readLog(file, writer, res.repo);
  if (fault) return { ok: false, line: fault.line.replace('pickup stopped', 'send stopped') };
  const hash = sha(bodyBuf);
  const dup = msgs.find((m) => m.hash === hash);
  if (dup) return { ok: false, line: `channel: duplicate body (matches seq ${dup.seq} in ${path.basename(file)}) - refused (the loop guard: no message may ping-pong)` };
  let session = 'unattributed';
  try { const receipts = require(path.join(__dirname, 'receipts.cjs')); const rs = receipts.resolveScriptSession(process.env); if (rs.session) session = rs.session; } catch (_) { /* fine */ }
  const msg = {
    v: SCHEMA, seq: msgs.length + 1, ts: new Date().toISOString(), role: writer, session, repo: res.repo,
    stage: stageOf(res.tree), class: cls, kind: kind || cls, hash, bytes: bodyBuf.length,
    reply_to: Number.isInteger(o.replyTo) ? o.replyTo : null,
  };
  if (cls === 'stage-packet') msg.state = stateOf(res.tree);
  // A field the publish derived (an amendment's amended hashes) rides beside state, never over a stamp.
  if (o.extra) for (const k of Object.keys(o.extra)) if (!(k in msg)) msg[k] = o.extra[k];
  msg.body = bodyBuf.toString('utf8');
  fs.mkdirSync(res.root, { recursive: true });
  // Torn-tail isolation (the receipts sink's rule): a non-newline tail gets its newline first.
  let prefix = '';
  try { const st = fs.statSync(file); if (st.size > 0) { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1); try { fs.readSync(fd, b, 0, 1, st.size - 1); } finally { fs.closeSync(fd); } if (b[0] !== 0x0a) prefix = '\n'; } } catch (_) { /* fresh */ }
  fs.appendFileSync(file, prefix + JSON.stringify(msg) + '\n', 'utf8');
  const holder = cls === 'stage-open' ? 'work' : cls === 'approval-request' ? 'human' : (SIDE[writer] === 'work' ? 'orchestrator' : 'work');
  writeTurn(res.root, holder, msg.seq);
  emit(cwd, 'channel', 'channel_published', { seq: msg.seq, channel_class: cls, stage: msg.stage === '-' ? undefined : msg.stage, role: writer });
  return { ok: true, msg, file, holder };
}

// The send gate (orch->builder only): the hook's one-shot token in THIS session's tree - the
// /send keystroke - is the ONLY gate, consumed here (M30.1.A, V 🟡-2: a presence-checked fence
// ask rule admitted a send with no keystroke and no click). The fence's ask rule on the send
// command stays in settings as defense-in-depth; it is never the human action.
function sendGate(cwd) {
  const tok = path.join(cwd, '.claude', 'channel', 'send-token');
  if (fs.existsSync(tok)) { try { fs.rmSync(tok, { force: true }); } catch (_) { /* fine */ } return { ok: true, via: 'token' }; }
  return { ok: false, line: 'channel: send refused - no human action behind it: type /send in this orchestrator terminal (the hook stamps the keystroke, and that keystroke is the only record)' };
}

function describe(m) {
  const stage = m.stage && m.stage !== '-' ? m.stage : 'the open stage';
  switch (m.class) {
    case 'stage-open': return `stage-open for ${m.body.trim() || stage}`;
    case 'stage-packet': return `the ${stage} ${m.kind} packet`;
    case 'clarification': return `a clarification (${m.kind})`;
    case 'courier': return m.kind === 'build-prompt' ? 'the build prompt' : `a courier message (${m.kind})`;
    case 'approval-request': return `an approval request (${m.kind})`;
    default: return m.kind;
  }
}
// The foreground lines name the role stamped on the message (builder / verifier / refactor /
// orchestrator), never a guess from this side's resolver.
function senderName(m) { return PEER_NAME[m.role] || m.role; }
function pickupLine(res, m) { return `channel: ${senderName(m)} sent ${describe(m)} (seq ${m.seq}, ${m.class}) - surfaced below`; }
function summaryLine(res, unread) {
  const classes = Array.from(new Set(unread.map((m) => m.class))).join(', ');
  const from = Array.from(new Set(unread.map(senderName))).join(' + ');
  const range = unread.length === 1 ? `seq ${unread[0].seq}` : `seq ${unread[0].seq}..${unread[unread.length - 1].seq}`;
  return `channel: ${unread.length} new from ${from} (${range}, ${classes}) - run: node scripts/channel.cjs pickup`;
}

// The stamp's one line (SessionStart): null when there is nothing to say.
function stampLine(cwd) {
  const res = resolve(cwd);
  if (!res.ok) return null;
  const u = unreadFor(res);
  if (u.fault) return `**[channel]** ${u.fault.line.replace(/^channel: /, '')}`;
  if (!u.unread.length) return null;
  const turn = readTurn(res.root);
  if (u.pending && turn && turn.holder === 'human' && SIDE[res.role] === 'work' && u.unread[0].seq === u.pending.seq) {
    return `**[channel]** approval-request seq ${u.pending.seq} pending - the human runs /approve-red in this terminal`;
  }
  return `**[channel]** ${summaryLine(res, u.unread).replace(/^channel: /, '').replace(' new from ', ' unread from ').replace(' - run: ', ' - first action: ')}`;
}

// The liveness probe (KF-67: a watch marker is not a listener): `channel status` and the
// stage-active listening gate (M32.1.C, V-27) judge a marker's pid with this one function.
// R-49 (M33.A): on Linux a process that has exited but is not yet reaped by its parent is a
// zombie - kill(pid, 0) still succeeds on it, so /proc/<pid>/stat's state field decides (Z is
// dead). The state follows the last ')' because the command name in parentheses may hold spaces.
// Windows has no zombies; elsewhere, or with /proc unreadable, kill decides as before.
function pidAlive(pid) {
  try { process.kill(pid, 0); } catch (e) { if (!(e && e.code === 'EPERM')) return false; }
  if (process.platform === 'linux') {
    try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); if (s.slice(s.lastIndexOf(')') + 2).split(' ')[0] === 'Z') return false; } catch (_) { /* no /proc entry readable: kill decides */ }
  }
  return true;
}

// M33.G: a marker is a listener only while its pid is alive AND its start token is fresh.
// The watcher touches its marker every poll, so a marker older than max(60 s, 4 polls) belongs to a
// watcher that stopped polling, or names a pid the OS handed to something else. The one judge: the
// stage-active gate and `channel status`. -> { state: none | dead | stale | listening, m, mtime }
const LISTEN_FRESH_MS = 60 * 1000;
function watcherState(marker) {
  if (!fs.existsSync(marker)) return { state: 'none', m: null, mtime: 0 };
  let m = null; let mtime = 0;
  try { m = JSON.parse(fs.readFileSync(marker, 'utf8')); mtime = fs.statSync(marker).mtimeMs; } catch (_) { return { state: 'dead', m: null, mtime: 0 }; }
  if (!m || !Number.isInteger(m.pid) || m.pid <= 0 || !pidAlive(m.pid)) return { state: 'dead', m, mtime };
  const poll = Number.isInteger(m.poll_ms) && m.poll_ms > 0 ? m.poll_ms : 750;
  const fresh = /^[0-9a-f]{16}$/.test(String(m.token || '')) && Date.now() - mtime <= Math.max(LISTEN_FRESH_MS, 4 * poll);
  return { state: fresh ? 'listening' : 'stale', m, mtime };
}

// The bell (M33.G, D3: native messaging is a bell only). One line naming the peer session's
// worktree folder and the seq just written; the model rings the peer with it through the harness's
// cross-session message. It carries no content and binds nothing: the jsonl is the record. Null
// when there is no peer tree (Lite, or before the split): the watcher stays the wake.
function peerFolder(res) {
  if (SIDE[res.role] !== 'work') return path.basename(res.tree);
  const orch = (worktrees(res.tree) || []).filter((w) => normPath(w) !== normPath(res.tree)).find((w) => { const r = readRole(w); return r.state === 'resolved' && r.role === 'orchestrator'; });
  return orch ? path.basename(orch) : null;
}
function bellLine(res, seq) {
  const folder = peerFolder(res);
  return folder ? `channel: bell for the ${PEER_NAME[PEER[res.role]]} session (worktree ${folder}): channel: seq ${seq} landed - run: node scripts/channel.cjs pickup` : null;
}

// ---------------------------------------------------------------------------
// The approval record and the amendment (M33.G; M32-FIELD-REPAIR §4.4's in-stage half).
// approve-red records the test files changed at approval with their hashes; an amendment (edits
// INSIDE those files) carries the amended hashes; the orchestrator's ack appends them. A new test
// file or a new stage id is scope - the owner's /approve-red. Voiding an approval on a material
// change and the un-approve are not here (M34).
// ---------------------------------------------------------------------------
const APPROVAL_FILE = 'approval.json';
// The test globs of the red-gate hook (pretooluse-red-gate.cjs BUILTIN_ALLOW's test half) plus the
// project's own entries in .claude/red-gate-allow.txt - the files a red-stop may write.
const TEST_GLOBS = Object.freeze(['**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*', '**/test/**', '**/tests/**', '**/__tests__/**']);
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { re += '(?:[^/]+/)*'; i++; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.indexOf(c) !== -1) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
function testGlobs(tree) {
  const globs = TEST_GLOBS.slice();
  try {
    for (const raw of fs.readFileSync(path.join(tree, '.claude', 'red-gate-allow.txt'), 'utf8').split(/\r?\n/)) {
      const l = raw.trim();
      if (l && !l.startsWith('#') && l.replace(/[*/]/g, '') !== '') globs.push(l);
    }
  } catch (_) { /* optional */ }
  return globs.map(globToRe);
}
function fileSha(tree, rel) { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(tree, rel))).digest('hex'); } catch (_) { return null; } }
// The test files `git status` names (changed or untracked, never a deletion), sorted.
function changedTestFiles(tree) {
  const raw = git(tree, ['status', '--porcelain', '--untracked-files=all', '-z']);
  if (raw === null) return [];
  const res = testGlobs(tree);
  const out = [];
  const parts = raw.split(NUL);
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const st = e.slice(0, 2); const rel = e.slice(3).replace(/\\/g, '/');
    if (st[0] === 'R' || st[0] === 'C') i++; // the source path follows a rename or copy
    if (st.indexOf('D') !== -1) continue;
    if (res.some((re) => re.test(rel))) out.push(rel);
  }
  return Array.from(new Set(out)).sort();
}
function readApproval(root) { try { const j = JSON.parse(fs.readFileSync(path.join(root, APPROVAL_FILE), 'utf8')); return j && Array.isArray(j.files) ? j : null; } catch (_) { return null; } }
// approve-red, after its marker: the open stage, the released seq (or null) and the test files' hashes.
function writeApproval(tree, stage, seq) {
  const files = changedTestFiles(tree).map((p) => ({ path: p, sha256: fileSha(tree, p) })).filter((f) => f.sha256);
  const rec = { stage, approval_seq: Number.isInteger(seq) ? seq : null, at: new Date().toISOString(), files, acks: [] };
  writeAtomic(path.join(tree, '.claude', 'channel', APPROVAL_FILE), JSON.stringify(rec, null, 2) + '\n');
  return rec;
}
// The publish's check on --kind amendment. -> { ok:true, amended:[{path, sha256}] } | { ok:false, line }
function amendment(res) {
  const rec = readApproval(res.root);
  if (!rec) return { ok: false, line: 'channel: amendment refused - no approval record for the open stage (/approve-red writes .claude/channel/approval.json); a test change before the release belongs in the red-stop' };
  const open = stageOf(res.tree);
  if (rec.stage !== open) return { ok: false, line: `channel: amendment refused - the open stage is ${open} and the approval was for ${rec.stage}; a new stage id is scope: the owner's /approve-red` };
  const latest = new Map(rec.files.map((f) => [f.path, f.sha256]));
  for (const a of rec.acks || []) for (const f of a.files || []) latest.set(f.path, f.sha256);
  const added = changedTestFiles(res.tree).filter((p) => !latest.has(p));
  if (added.length) return { ok: false, line: `channel: amendment refused - it adds a test file ${added[0]}; that is scope: the owner's /approve-red` };
  const amended = Array.from(latest.keys()).sort().map((p) => ({ path: p, sha256: fileSha(res.tree, p) })).filter((f) => f.sha256 !== latest.get(f.path));
  if (!amended.length) return { ok: false, line: 'channel: amendment refused - no approved test file changed since the approval (nothing to amend)' };
  return { ok: true, amended };
}
// The orchestrator's ack: the ONE orchestrator publish with no /send token, and only in reply to
// an amendment not yet acknowledged. It appends the amended hashes to the record.
function ackAmendment(cwd, res, seq) {
  const theirs = readLog(path.join(res.root, FILES.work), 'work', res.repo);
  if (theirs.fault) return { ok: false, line: theirs.fault.line.replace('pickup stopped', 'ack stopped') };
  const m = theirs.msgs.find((x) => x.seq === seq);
  if (!m) return { ok: false, line: `channel: ack answers only an amendment - builder seq ${seq} does not exist` };
  if (m.class !== 'stage-packet' || m.kind !== 'amendment') return { ok: false, line: `channel: ack answers only an amendment - seq ${seq} is ${m.class}/${m.kind}` };
  const mine = readLog(outboxFile(res), 'orchestrator', res.repo);
  if (mine.fault) return { ok: false, line: mine.fault.line.replace('pickup stopped', 'ack stopped') };
  const prev = mine.msgs.find((x) => x.kind === 'ack' && x.reply_to === seq);
  if (prev) return { ok: false, line: `channel: amendment seq ${seq} is already acknowledged (seq ${prev.seq})` };
  const files = Array.isArray(m.amended) ? m.amended : [];
  const body = `ack: amendment seq ${seq} acknowledged - ${files.length} amended test file(s): ${files.map((f) => f.path).join(', ') || 'none'}`;
  const r = append(cwd, res, 'courier', 'ack', Buffer.from(body, 'utf8'), { replyTo: seq });
  if (!r.ok) return r;
  const rec = readApproval(res.root);
  if (rec) { rec.acks = (rec.acks || []).concat([{ seq, files }]); writeAtomic(path.join(res.root, APPROVAL_FILE), JSON.stringify(rec, null, 2) + '\n'); }
  return r;
}

// The human's consumption (approve-red.cjs): advance past a pending approval-request.
function consumeApproval(cwd) {
  const res = resolve(cwd);
  if (!res.ok || SIDE[res.role] !== 'work') return null;
  const u = unreadFor(res);
  if (u.fault || !u.pending || u.unread[0].seq !== u.pending.seq) return null;
  writeCursor(res.root, 'work', u.pending.seq);
  writeTurn(res.root, 'work', u.pending.seq);
  emit(cwd, 'approve-red', 'channel_picked_up', { seq: u.pending.seq, channel_class: 'approval-request', role: 'work' });
  return u.pending.seq;
}

module.exports = {
  SCHEMA, CLASSES, BUILDER_CLASSES, ORCH_CLASSES, WRITER_ROLES, FILES, SIDE, PEER, PEER_NAME, KIND_RE, SEND_ASK_RULE, writersOf,
  readRole, repoIdentity, worktrees, resolve, readLog, readCursor, writeCursor, readTurn, writeTurn,
  unreadFor, append, sendGate, sha, inboxFile, outboxFile, pickupLine, summaryLine, describe,
  stampLine, consumeApproval, emit, writeAtomic, pidAlive, trunkOf, aheadOf,
  LISTEN_FRESH_MS, watcherState, bellLine, peerFolder,
  APPROVAL_FILE, TEST_GLOBS, changedTestFiles, readApproval, writeApproval, amendment, ackAmendment,
};
