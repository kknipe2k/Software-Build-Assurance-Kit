#!/usr/bin/env node
// @kit-version 1.0.10
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
//     automatically; an orchestrator's courier message leaves on its own authority, the hash, seq
//     and log row its record (M34.6.E item 2, R-144); an approval-request (the release) is written
//     only behind the owner's /send keystroke (the mode-check hook's one-shot token) and the
//     fence's ask click on `node scripts/channel.cjs send --approval`. An approval-request is
//     surfaced at pickup and NEVER consumed by an agent: approve-red.cjs (the human) advances the
//     cursor past it. Every row's body decodes as UTF-8, or nothing is written (M34.6.E item 8).
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
// M34.6.A: the repository's identity across clones, by declaration and digest, never by
// path. `origin` on every row is the committed .claude/channel/identity ("<project>-<8 hex>",
// written once by `channel.cjs identity --init`) when the channel tree carries one, else the root
// commit ("root:<sha>", the lexically first when there are several; a heuristic a shallow clone or a
// rewritten history breaks). A clone accepts both of its own: rows written before the file landed
// carry the inference. `repo` (the path hash above) stays on every row as the local collision stamp.
const IDENTITY_FILE = 'identity';
const IDENTITY_RE = /^[A-Za-z0-9._-]+-[0-9a-f]{8}$/;
function readIdentity(tree) {
  try { const v = fs.readFileSync(path.join(tree, '.claude', 'channel', IDENTITY_FILE), 'utf8').trim(); return IDENTITY_RE.test(v) ? v : null; } catch (_) { return null; }
}
function rootInference(cwd) {
  const out = git(cwd, ['rev-list', '--max-parents=0', 'HEAD']);
  const roots = out ? out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^[0-9a-f]{40,64}$/.test(s)).sort() : [];
  return roots.length ? `root:${roots[0]}` : null;
}
// -> { origin: the stamp this clone writes | null, origins: the stamps it accepts, source }
function originOf(tree) {
  const file = readIdentity(tree); const inferred = rootInference(tree);
  return { origin: file || inferred, origins: [file, inferred].filter(Boolean), source: file ? 'file' : inferred ? 'root' : 'none' };
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
  if (WRITER_ROLES.indexOf(role) !== -1) { const o = originOf(cwd); return { ok: true, role, tree: cwd, root: path.join(cwd, '.claude', 'channel'), repo: id.repo, origin: o.origin, origins: o.origins }; }
  if (role !== 'orchestrator') return { ok: false, line: `channel: role ${role} is not one the channel knows (work, verifier, refactor, orchestrator); fallback: human courier` };
  const wts = worktrees(cwd) || [];
  const cands = wts.filter((w) => normPath(w) !== normPath(cwd)).filter((w) => { const rr = readRole(w); return rr.state === 'resolved' && WRITER_ROLES.indexOf(rr.role) !== -1; });
  if (cands.length !== 1) return { ok: false, line: `channel: ${cands.length} builder worktrees found (need exactly 1: a tree whose .claude/role is work, verifier, or refactor) - the channel starts at the worktree split; fallback: human courier` };
  const o = originOf(cands[0]);
  return { ok: true, role, tree: cands[0], root: path.join(cands[0], '.claude', 'channel'), repo: id.repo, origin: o.origin, origins: o.origins };
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
// `who` is the reader's identity: a resolved channel ({ repo, origins }) or, as before, the repo
// string alone. M34.6.A: a row carrying `origin` is compared by origin across clones (one of
// this clone's accepted origins, else refused); a row without one (every row before this release) is
// read under the legacy rule - its repo stamp is this clone's, or the row stands in the log as
// committed at HEAD, so it reached this clone through this repository's own history - else refused.
function readLog(file, expectRole, who) {
  const id = typeof who === 'string' ? { repo: who, origins: [] } : (who && typeof who === 'object' ? { repo: who.repo || null, origins: Array.isArray(who.origins) ? who.origins : [] } : null);
  const base = path.basename(file);
  const expected = writersOf(expectRole);
  const fb = (what) => ({ msgs: [], fault: { line: `channel: ${what} in ${base} - pickup stopped; fallback: paste the block by hand (human courier)` } });
  if (!fs.existsSync(file)) return { msgs: [], fault: null };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let headLines; // read once, only when a legacy row from another stamp asks
  const committed = (i) => {
    if (headLines === undefined) {
      const r = spawnSync('git', ['show', `HEAD:./${base}`], { cwd: path.dirname(file), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20, windowsHide: true });
      headLines = r.status === 0 ? String(r.stdout).replace(/\r\n/g, '\n').split('\n') : [];
    }
    return i < headLines.length && headLines[i] === lines[i].replace(/\r$/, '');
  };
  const msgs = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    let m;
    try { m = JSON.parse(lines[i]); } catch (_) { return fb(`unparseable line ${n}`); }
    if (!m || typeof m !== 'object' || typeof m.seq !== 'number') return fb(`unparseable line ${n} (no seq)`);
    if (m.seq !== n) return fb(`cursor gap - expected seq ${n}, found ${m.seq}`);
    if (expected.indexOf(m.role) === -1) return fb(`role mismatch at seq ${m.seq} (stamped ${m.role}, expected ${expected.join(' | ')})`);
    if (id && typeof m.origin === 'string' && id.origins.length) {
      if (id.origins.indexOf(m.origin) === -1) return fb(`repo mismatch at seq ${m.seq} (stamped origin ${m.origin}, this repository is ${id.origins.join(' or ')})`);
    } else if (id && id.repo && m.repo !== id.repo && !(typeof m.origin !== 'string' && committed(i))) {
      return fb(`repo mismatch at seq ${m.seq} (stamped ${m.repo}, this repo is ${id.repo})`);
    }
    if (typeof m.body !== 'string' || sha(Buffer.from(m.body, 'utf8')) !== m.hash) return fb(`hash mismatch at seq ${m.seq} (the body bytes differ from the send hash - a paraphrase is not a relay)`);
    msgs.push(m);
  }
  return { msgs, fault: null };
}
function readCursor(root, role) { try { const v = parseInt(fs.readFileSync(path.join(root, `cursor.${SIDE[role] || role}`), 'utf8'), 10); return Number.isInteger(v) && v >= 0 ? v : 0; } catch (_) { return 0; } }
// The channel's own files under .claude/channel/ (M34.D): the two logs, the transient markers the
// project gitignores, and writeAtomic's temp beside each. kit-update --ready's tree row ignores
// exactly these; any other file there is uncommitted like any other.
const OWN_FILES = Object.freeze([/^(builder-to-orch|orch-to-builder)\.jsonl(\.tmp)?$/, /^cursor\.(work|orchestrator)(\.tmp)?$/, /^turn(\.tmp)?$/,
  /^(watch|present)\.(work|orchestrator)\.json(\.tmp)?$/, /^send-token(\.tmp)?$/, /^outgoing\.md$/, /^approval\.json(\.tmp)?$/,
  /^refusals\.jsonl$/, /^publish\.lock$/]); // M34.6.B: the refusal rows and the stage-end publish lock
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
  const { msgs, fault } = readLog(inboxFile(res), PEER[res.role], res);
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
// The UTF-8 judge (M34.6.E item 8): the first byte where the buffer stops being well-formed
// UTF-8 (RFC 3629: no overlong form, no surrogate, nothing past U+10FFFF, no sequence cut short),
// or null when every byte decodes. -> { offset, byte } | null
function utf8Fault(buf) {
  const b = buf;
  for (let i = 0; i < b.length;) {
    const c = b[i];
    if (c < 0x80) { i++; continue; }
    const n = c >= 0xc2 && c <= 0xdf ? 1 : c >= 0xe0 && c <= 0xef ? 2 : c >= 0xf0 && c <= 0xf4 ? 3 : 0;
    if (n === 0 || i + n >= b.length) return { offset: i, byte: c };
    const lo = c === 0xe0 ? 0xa0 : c === 0xf0 ? 0x90 : 0x80;
    const hi = c === 0xed ? 0x9f : c === 0xf4 ? 0x8f : 0xbf;
    if (b[i + 1] < lo || b[i + 1] > hi) return { offset: i, byte: c };
    for (let k = 2; k <= n; k++) if ((b[i + k] & 0xc0) !== 0x80) return { offset: i, byte: c };
    i += n + 1;
  }
  return null;
}
function utf8Refusal(bad) {
  return `channel: refused - the body is not valid UTF-8 at byte offset ${bad.offset} (0x${bad.byte.toString(16).padStart(2, '0')}); nothing was written - save the body as UTF-8, then run the command again`;
}
// -> { ok:true, msg, file } | { ok:false, line }
function append(cwd, res, cls, kind, bodyBuf, opts) {
  const o = opts || {};
  const writer = res.role;
  if (CLASSES.indexOf(cls) === -1) return { ok: false, line: `channel: unknown class ${cls} (one of ${CLASSES.join(' / ')})` };
  if ((SIDE[writer] === 'work' && BUILDER_CLASSES.indexOf(cls) === -1) || (writer === 'orchestrator' && ORCH_CLASSES.indexOf(cls) === -1)) {
    return { ok: false, line: `channel: role ${writer} cannot write class ${cls}` };
  }
  // M34.6.E item 8 (the M34.6.F seq 377 fault): the log stores the decoded text and hashes the raw bytes, so a body
  // that does not decode as UTF-8 would be a row that never verifies; refused before anything is read.
  const bad = utf8Fault(bodyBuf);
  if (bad) return { ok: false, line: utf8Refusal(bad) };
  const file = outboxFile(res);
  const { msgs, fault } = readLog(file, writer, res);
  if (fault) return { ok: false, line: fault.line.replace('pickup stopped', 'send stopped') };
  const hash = sha(bodyBuf);
  const dup = msgs.find((m) => m.hash === hash);
  if (dup) return { ok: false, dup, line: `channel: duplicate body (matches seq ${dup.seq} in ${path.basename(file)}) - refused (the loop guard: no message may ping-pong)` };
  let session = 'unattributed';
  try { const receipts = require(path.join(__dirname, 'receipts.cjs')); const rs = receipts.resolveScriptSession(process.env); if (rs.session) session = rs.session; } catch (_) { /* fine */ }
  const msg = {
    v: SCHEMA, seq: msgs.length + 1, ts: new Date().toISOString(), role: writer, session, repo: res.repo,
    stage: stageOf(res.tree), class: cls, kind: kind || cls, hash, bytes: bodyBuf.length,
    reply_to: Number.isInteger(o.replyTo) ? o.replyTo : null,
  };
  if (cls === 'stage-packet') msg.state = stateOf(res.tree);
  // M34.6.A: the cross-clone identity, beside the local collision stamp (repo)
  if (typeof res.origin === 'string' && res.origin) msg.origin = res.origin;
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
// ask rule admitted a send with no keystroke and no click). From M34.6.E item 2 (R-144) the CLI
// requires it for an approval-request only and consumes it on every send. The fence's ask rule on
// the release command stays in settings as defense-in-depth; it is never the human action.
function sendGate(cwd) {
  const tok = path.join(cwd, '.claude', 'channel', 'send-token');
  if (fs.existsSync(tok)) { try { fs.rmSync(tok, { force: true }); } catch (_) { /* fine */ } return { ok: true, via: 'token' }; }
  return { ok: false, line: 'channel: send refused - an approval request (the release) needs the owner\'s keystroke behind it: the owner types /send --approval in this orchestrator terminal (the hook stamps the keystroke, and that keystroke is the only record)' };
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
// The approval record and the amendment (M33.G; M32-FIELD-REPAIR §4.4's in-stage half), and the
// five materiality cases (M34.C, R-80 on R-21's discretion). The record (.claude/channel/
// approval.json) is a list per stage, appended to while the stage is open:
//   { v: 2, stage, rows: [ <approval | ack | void>, ... ] }
//   approval  approve-red's: who (role), where (repo), when (at, prompt_at), session, the released
//             seq, base (HEAD), scope { doc, blob, section_sha256 } and the test files changed at
//             approval, each { path, sha256, blob } - the blob is the bytes in git's object store,
//             what case 5 diffs against;
//   ack       the orchestrator's, naming the amended bytes the same way;
//   void      the human's un-approve (approve-red --void), with its reason.
// The marker's second line binds one approval row by approvalRowHash (the red gate keeps its own
// copy, lockstep-pinned). A record without v: 2 (M33.G's shape, or one a pre-M34.C release wrote) is
// a legacy record: read as rows, and case 3 at the stage end and case 4 do not run against it.
//   case 1  implementation changes during Green: expected, nothing checks them;
//   case 2  an edit inside an approved test file: an amendment, the orchestrator's ack, no keystroke;
//   case 3  a test file added, an approved one deleted or renamed, or a new stage id: scope, void
//           until the owner's /approve-red - the red gate checks the record's files before an
//           implementation edit, and the stage-end publish refuses an added file and a recorded
//           file that is missing or renamed (M34.1.B); an approval that would record no file is
//           refused (approve-red, appendApproval);
//   case 4  the approved scope section changed at HEAD: the amendment and stage-end publishes refuse;
//   case 5  an amendment that removes or loosens an assertion: the ack refuses it (the one
//           obligation); the ack prints the diff summary so the read happens in the acking turn.
// A hash proves bytes changed; the case is decided by the path class, the scope compare and the ack
// record, never by the hash alone.
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
function changedTestFiles(tree) { return redSet(tree) || []; }
// The same list, or null when git cannot list changes here (not a repository, or git did not run):
// the RED set an approval records (M34.1.B, Y-4), told apart from an empty one.
function redSet(tree) {
  const raw = git(tree, ['status', '--porcelain', '--untracked-files=all', '-z']);
  if (raw === null) return null;
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
// The approval row's binding hash: sha256 over the row with every object's keys sorted, arrays in
// order, values as JSON (an undefined value is absent, as JSON writes it). The marker's second line
// names it; the red gate's probeRowHash is its lockstep copy.
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function approvalRowHash(row) { return crypto.createHash('sha256').update(canonicalJson(row), 'utf8').digest('hex'); }
// The files' bytes written to git's object store, one call (`hash-object -w --no-filters`: the exact
// bytes). -> Map path -> blob id, or null where git could not take it (no repository).
const BLOB_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
function snapshotBlobs(tree, rels) {
  const out = new Map();
  if (!rels.length) return out;
  const r = spawnSync('git', ['hash-object', '-w', '--no-filters', '--'].concat(rels), { cwd: tree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ids = r.status === 0 ? String(r.stdout).split(/\r?\n/).filter(Boolean) : [];
  rels.forEach((p, i) => out.set(p, BLOB_RE.test(ids[i] || '') ? ids[i] : null));
  return out;
}
function blobBytes(tree, blob) {
  if (typeof blob !== 'string' || !BLOB_RE.test(blob)) return null;
  const r = spawnSync('git', ['cat-file', 'blob', blob], { cwd: tree, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout : null;
}
// -> the v2 record, a legacy record read as rows ({ legacy: true }), or null.
function readApproval(root) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(root, APPROVAL_FILE), 'utf8')); } catch (_) { return null; }
  if (!j || typeof j !== 'object' || typeof j.stage !== 'string') return null;
  if (j.v === 2 && Array.isArray(j.rows)) return j;
  if (!Array.isArray(j.files)) return null;
  const rows = [{ kind: 'approval', at: j.at || null, seq: Number.isInteger(j.approval_seq) ? j.approval_seq : null, scope: null, files: j.files }];
  for (const a of Array.isArray(j.acks) ? j.acks : []) rows.push({ kind: 'ack', seq: a.seq, files: Array.isArray(a.files) ? a.files : [] });
  return { legacy: true, stage: j.stage, rows, raw: j };
}
// The standing approval: the last approval row, each approved path's latest bytes (the approval's,
// or an ack's after it), and a void after it. -> null | { row, latest: Map path -> { sha256, blob }, voided }
// M34.6.B (item 10): opts.ackBound, when given, folds an ack row only where it returns true (the
// evidence path's rule: the orchestrator's message the row names is in the log with that hash).
function currentApproval(rec, opts) {
  if (!rec || !Array.isArray(rec.rows)) return null;
  const bound = opts && typeof opts.ackBound === 'function' ? opts.ackBound : null;
  let idx = -1;
  rec.rows.forEach((r, i) => { if (r && r.kind === 'approval') idx = i; });
  if (idx === -1) return null;
  const row = rec.rows[idx];
  const latest = new Map((Array.isArray(row.files) ? row.files : []).map((f) => [f.path, { sha256: f.sha256, blob: f.blob || null }]));
  let voided = null;
  for (const r of rec.rows.slice(idx + 1)) {
    if (r && r.kind === 'ack' && (!bound || bound(r))) for (const f of Array.isArray(r.files) ? r.files : []) latest.set(f.path, { sha256: f.sha256, blob: f.blob || null });
    if (r && r.kind === 'void') voided = r;
  }
  return { row, latest, voided };
}
function writeRecord(root, rec) { writeAtomic(path.join(root, APPROVAL_FILE), JSON.stringify(rec, null, 2) + '\n'); }
// The record's bytes as they stand (null when absent), and their return: approve-red's refusal after
// the record was written leaves the tree as it was (D1).
function recordBytes(root) { try { return fs.readFileSync(path.join(root, APPROVAL_FILE)); } catch (_) { return null; } }
function restoreRecord(root, bytes) {
  const f = path.join(root, APPROVAL_FILE);
  if (bytes === null) { fs.rmSync(f, { force: true }); return; }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(f + '.tmp', bytes);
  fs.renameSync(f + '.tmp', f);
}
// A row appended to the stage's record; a record for another stage is replaced (a new stage starts
// its own list), a legacy record for this stage is carried over as rows.
function appendRow(tree, stage, row) {
  const root = path.join(tree, '.claude', 'channel');
  const prior = readApproval(root);
  const rows = prior && prior.stage === stage ? prior.rows.concat([row]) : [row];
  const rec = { v: 2, stage, rows };
  writeRecord(root, rec);
  return rec;
}
// approve-red, step 5: the approval row. fields: { seq, role, repo, session, prompt_at, scope }.
// -> { rec, row } (the row as written: its hash is the marker's binding)
function appendApproval(tree, stage, fields) {
  const f = fields || {};
  const paths = changedTestFiles(tree);
  const blobs = snapshotBlobs(tree, paths);
  const files = paths.map((p) => ({ path: p, sha256: fileSha(tree, p), blob: blobs.get(p) || null })).filter((x) => x.sha256);
  // M34.1.B (Y-4): the record is a list of approvals, never of nothing.
  if (!files.length) throw new Error('the RED set is empty: an approval names at least one test file');
  const row = JSON.parse(JSON.stringify({
    kind: 'approval', at: new Date().toISOString(), seq: Number.isInteger(f.seq) ? f.seq : null,
    role: f.role, repo: f.repo || null, session: f.session || null, prompt_at: f.prompt_at || null,
    base: git(tree, ['rev-parse', 'HEAD']) || null, scope: f.scope || null, files,
    // M34.6.B (item 3): the RED record the release bound, and its subject (absent on a legacy stage)
    tests_run_red: f.tests_run_red || undefined, subject: f.subject || undefined,
  }));
  return { rec: appendRow(tree, stage, row), row };
}
// approve-red --void: the void row. fields: { reason, role, repo, session, prompt_at }.
function appendVoid(tree, stage, fields) {
  const f = fields || {};
  const row = JSON.parse(JSON.stringify({ kind: 'void', at: new Date().toISOString(), reason: f.reason, role: f.role, repo: f.repo || null, session: f.session || null, prompt_at: f.prompt_at || null }));
  return { rec: appendRow(tree, stage, row), row };
}
// stage-active --clear: the record archived beside the stage's evidence, the live file removed.
// Never overwrites an archive (a second is approval-1.json). -> the archive's path, or null (no record)
function archiveApproval(tree, openStage) {
  const f = path.join(tree, '.claude', 'channel', APPROVAL_FILE);
  let bytes;
  try { bytes = fs.readFileSync(f); } catch (_) { return null; }
  let stage = openStage;
  try { const j = JSON.parse(bytes.toString('utf8')); if (j && typeof j.stage === 'string') stage = j.stage; } catch (_) { /* the open stage names it */ }
  if (!stage || !STAGE_RE.test(stage)) throw new Error('the record names no stage id to archive it under');
  const dir = path.join(tree, '.claude', 'measurements', stage);
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 0; ; n++) {
    const p = path.join(dir, n === 0 ? APPROVAL_FILE : `approval-${n}.json`);
    let fd;
    try { fd = fs.openSync(p, 'wx'); } catch (e) { if (e && e.code === 'EEXIST') continue; throw e; }
    try { fs.writeSync(fd, bytes); } finally { fs.closeSync(fd); }
    fs.rmSync(f, { force: true });
    return p;
  }
}

// Case 4: the approved scope section against HEAD. The blob equal is the fast answer; a new blob
// re-slices the section (read-ledger stageSectionAt, the one reader) and compares its sha256, so an
// unrelated section's edit is not a scope change. -> null (unchanged, or nothing recorded) | the line
// M34.6.A (item n): then every ref the record carries (the prompt's scope_locks, deliverable and
// acceptance_criteria refs and docs/scope.md), each named when it moved: a section ref by its
// section's sha256 (its doc's blob the fast answer), a whole-file ref by its blob. A record with no
// refs (every one before this release) compares the stage section alone, as before.
function scopeChange(tree, stage, scope, kind) {
  if (!scope || typeof scope !== 'object' || typeof scope.doc !== 'string') return null;
  const moved = (what) => `channel: ${kind} refused - the approved scope changed: ${what} is not the one the RED was approved against; that is scope: the orchestrator /sends the amended scope and the owner runs /approve-red`;
  const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
  let rl = null;
  const lib = () => {
    if (rl) return rl;
    try { rl = require(path.join(__dirname, 'read-ledger.cjs')); } catch (_) { rl = null; }
    return rl;
  };
  const NOLIB = `channel: ${kind} refused - the approved scope cannot be compared (scripts/lib/read-ledger.cjs did not load) - repair: node scripts/kit-update.cjs --adopt`;
  if (git(tree, ['rev-parse', '--verify', '--quiet', `HEAD:${scope.doc}`]) !== scope.blob) {
    if (!lib()) return NOLIB;
    const sec = rl.stageSectionAt(tree, stage);
    if (!sec.ok || sha(sec.text) !== scope.section_sha256) return moved(`the ${stage} section of ${scope.doc}`);
  }
  for (const r of Array.isArray(scope.refs) ? scope.refs : []) {
    if (!r || typeof r.doc !== 'string') continue;
    const blob = git(tree, ['rev-parse', '--verify', '--quiet', `HEAD:${r.doc}`]);
    if (blob === r.blob) continue;
    const what = r.section ? `the ${r.section} section of ${r.doc}` : r.doc;
    if (!r.section || blob === null) return moved(what);
    if (!lib()) return NOLIB;
    const s = rl.sectionAt(tree, r.doc, r.section);
    if (!s.ok || sha(s.text) !== r.section_sha256) return moved(what);
  }
  return null;
}
// The test files changed since the approval's base (committed or not, never a deletion) plus the
// untracked ones, sorted.
function testFilesSince(tree, base) {
  const out = new Set(changedTestFiles(tree));
  const raw = base ? git(tree, ['diff', '--name-only', '-z', base]) : null;
  if (raw !== null) {
    const res = testGlobs(tree);
    for (const p of raw.split(NUL).filter(Boolean)) {
      const rel = p.replace(/\\/g, '/');
      if (res.some((re) => re.test(rel)) && fs.existsSync(path.join(tree, rel))) out.add(rel);
    }
  }
  return Array.from(out).sort();
}
// M34.6.B (item 10): the ack bound to the orchestrator's message. An ack row folds only when the
// orchestrator's log in this tree - read through readLog, the integrity check - holds a row with the
// seq and the hash the ack row names, kind ack, answering the amendment's seq. A role and a hash
// identify a message on this machine, not a person.
function ackBoundFor(res) {
  const log = readLog(path.join(res.root, FILES.orchestrator), 'orchestrator', res);
  const msgs = log.fault ? [] : log.msgs;
  return (r) => Number.isInteger(r.message_seq) && typeof r.message_sha256 === 'string'
    && msgs.some((m) => m.seq === r.message_seq && m.hash === r.message_sha256 && m.kind === 'ack' && m.reply_to === r.seq);
}
// The stage-end publish's checks (cases 3 and 4) against the open stage's v2 record; a legacy record,
// no record or another stage's record leaves the stage end as it was. -> { ok } | { ok: false, line }
// M34.6.B: on a stage on the evidence path the ack fold is the bound one, and the evidence checks
// follow (scripts/lib/evidence.cjs stageEndEvidence: the completed prefix, the GREEN and the lane on
// the candidate, the gate's and the channel's unresolved refusals); its result carries prepare(),
// which writes gate.json, the approval archive and the manifest before the packet is appended.
// A legacy stage returns { ok: true, legacy: true, line } and is published as before.
function stageEndCheck(res, body) {
  const open = stageOf(res.tree);
  let evid = null; let evErr = null;
  try { evid = require(path.join(__dirname, 'evidence.cjs')); } catch (e) { evErr = String((e && e.message) || e).split('\n')[0]; }
  if (!evid) return { ok: false, line: `channel: stage-end refused - scripts/lib/evidence.cjs did not load (${evErr}) - repair: node scripts/kit-update.cjs --adopt` };
  const onPath = open !== '-' && evid.stageState(res.tree, open).onPath;
  const a = approvalChecks(res, open, onPath ? { ackBound: ackBoundFor(res) } : null);
  if (!a.ok) return a;
  if (open === '-') return { ok: true };
  // M34.6.C (item 5): the standing row's base, the point item o derives the changed paths from
  return evid.stageEndEvidence({ root: res.tree, stage: open, body, rowHash: a.rowHash || null, base: a.base || null });
}
function approvalChecks(res, open, foldOpts) {
  const rec = readApproval(res.root);
  if (!rec || rec.legacy || rec.stage !== open) return { ok: true };
  const cur = currentApproval(rec, foldOpts);
  if (!cur) return { ok: true };
  const sc = scopeChange(res.tree, open, cur.row.scope, 'stage-end');
  if (sc) return { ok: false, line: sc };
  const added = testFilesSince(res.tree, cur.row.base).filter((p) => !cur.latest.has(p));
  // M34.1.B (Y-3; §M34.C C.2 item 6 (3) as amended): each file the approval recorded is at its path.
  // Missing is found by path; renamed by its recorded bytes among the added test files.
  for (const [p, f] of cur.latest) {
    let here = false;
    try { here = fs.statSync(path.join(res.tree, p)).isFile(); } catch (_) { here = false; }
    if (here) continue;
    const to = added.find((q) => fileSha(res.tree, q) === f.sha256);
    return { ok: false, line: to
      ? `channel: stage-end refused - ${p}, a test file the RED approval recorded, is at ${to} now (the same bytes); that is scope: the owner's /approve-red`
      : `channel: stage-end refused - ${p} is a test file the RED approval recorded and it is not in the working tree; that is scope: the owner's /approve-red` };
  }
  if (added.length) return { ok: false, line: `channel: stage-end refused - ${added[0]} is a test file added after the RED approval with no re-approval; that is scope: the owner's /approve-red` };
  // M34.6.A (item e): the bytes accepted are the bytes approved. Each recorded file at its path is
  // compared with its latest value in the record - the approval's, or an ack's after it - in the
  // working tree the builder publishes from (the candidate). A published amendment the orchestrator
  // has not acked moves nothing, so it does not cover the bytes. The hook still allows the test edit:
  // it is the amendment path; this is where the bytes are judged.
  for (const [p, f] of cur.latest) {
    const now = fileSha(res.tree, p);
    if (now !== null && now !== f.sha256) return { ok: false, line: `channel: stage-end refused - ${p} changed since the RED approval and no ack covers it; publish an amendment, or the owner runs /approve-red` };
  }
  return { ok: true, rowHash: approvalRowHash(cur.row), base: cur.row.base || null };
}

// ---------------------------------------------------------------------------
// M34.6.B: the channel's refusals (item 9) and the stage-end publish lock (item 13).
// ---------------------------------------------------------------------------
// One row per refusal the CLI prints for publish, send, ack and pickup, and one per success of the
// first three, in .claude/channel/refusals.jsonl (local, gitignored), while the open stage is on the
// evidence path. A refusal row is resolved by a later success of the same verb and kind for the same
// stage, or by a "resolved:channel:<n> <why>" line in the stage-end packet; the stage-end publish
// writes the unresolved set into gate.json and refuses while it is non-empty. Diagnostic: a row that
// cannot be written is skipped and never changes the verb's own outcome.
const REFUSALS_FILE = 'refusals.jsonl';
function refusalRow(cwd, fields) {
  try {
    const res = resolve(cwd);
    if (!res.ok) return;
    const stage = stageOf(res.tree);
    if (stage === '-') return;
    const evid = require(path.join(__dirname, 'evidence.cjs'));
    if (!evid.stageState(res.tree, stage).onPath) return;
    const row = { v: 1, verb: fields.verb, kind: fields.kind, stage, at: new Date().toISOString() };
    if (fields.ok) Object.assign(row, { ok: true, seq: fields.seq });
    else {
      const s = evid.subject(res.tree);
      Object.assign(row, { class: fields.verb === 'pickup' ? 'pickup' : `${fields.verb}:${fields.kind}`, line: String(fields.line || '').slice(0, 600), answers: Number.isInteger(fields.answers) ? fields.answers : null, subject: s.subject || null });
    }
    evid.appendRow(path.join(res.root, REFUSALS_FILE), row);
  } catch (_) { /* diagnostic */ }
}
// The lock: .claude/channel/publish.lock, created with O_EXCL, holding { pid, at }. A live holder
// refuses the second publish; a dead one is named and taken over. -> { ok, line?, note?, release }
function takePublishLock(res) {
  const file = path.join(res.root, 'publish.lock');
  fs.mkdirSync(res.root, { recursive: true });
  let note = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n'); } finally { fs.closeSync(fd); }
      let released = false;
      return { ok: true, note, release: () => { if (released) return; released = true; try { fs.rmSync(file, { force: true }); } catch (_) { /* the next publish names it stale */ } } };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') return { ok: false, line: `channel: stage-end refused - the publish lock .claude/channel/publish.lock cannot be taken (${(e && e.code) || 'error'})` };
      let held = null; try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { held = null; }
      const pid = held && Number.isInteger(held.pid) ? held.pid : null;
      const age = held && typeof held.at === 'string' && Number.isFinite(Date.parse(held.at)) ? Math.max(0, Math.round((Date.now() - Date.parse(held.at)) / 1000)) : null;
      if (pid !== null && pid !== process.pid && pidAlive(pid)) return { ok: false, line: `channel: stage-end refused - another stage-end publish holds the lock: pid ${pid}, age ${age === null ? '?' : age} s` };
      note = `channel: a stale publish lock (pid ${pid === null ? 'unknown' : pid}, age ${age === null ? '?' : age} s) was taken over`;
      try { fs.rmSync(file, { force: true }); } catch (_) { /* the second attempt reports it */ }
    }
  }
  return { ok: false, line: 'channel: stage-end refused - the publish lock .claude/channel/publish.lock could not be taken over' };
}

// Case 5's evidence: a line diff of the approved (or acked) bytes against the amended ones. Common
// head and tail trimmed, the rest by longest common subsequence. -> { hunks, added, removed }
function lineDiff(a, b) {
  const L = (t) => { const x = String(t).replace(/\r\n?/g, '\n').split('\n'); if (x.length && x[x.length - 1] === '') x.pop(); return x; };
  const A = L(a); const B = L(b);
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let e = 0; while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  const X = A.slice(s, A.length - e); const Y = B.slice(s, B.length - e);
  if (!X.length && !Y.length) return { hunks: 0, added: 0, removed: 0 };
  if (X.length * Y.length > 4e6) return { hunks: 1, added: Y.length, removed: X.length };
  const n = X.length; const m = Y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = X[i] === Y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0; let j = 0; let hunks = 0; let added = 0; let removed = 0; let open = false;
  while (i < n || j < m) {
    if (i < n && j < m && X[i] === Y[j]) { i++; j++; open = false; continue; }
    if (!open) { hunks++; open = true; }
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { added++; j++; } else { removed++; i++; }
  }
  return { hunks, added, removed };
}
// An assertion line with its literals blanked: two lines that differ only in a number or a string
// are the same assertion with a literal changed.
const skeleton = (l) => l.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, '0');
function multisetMinus(a, b) { const left = new Map(); for (const x of b) left.set(x, (left.get(x) || 0) + 1); return a.filter((x) => { const n = left.get(x) || 0; if (n) { left.set(x, n - 1); return false; } return true; }); }
// Case 5: one amended file against the bytes the approval (or an ack) named, counted by the
// test-honesty validator's own counters. The four reasons, in this order (C6): the assertion count
// went down; a skip or todo marker was added; an existing assertion line is gone and a line differing
// only in its literals stands in its place; an existing assertion line is gone with no such line.
// -> { reason, summary } | { missing: <the bytes the store lost> } | { broken: <the counter did not load> }
function classifyAmendment(tree, before, f) {
  if (!before || !before.blob) return { missing: `the approved bytes of ${f.path} (blob ${before && before.blob ? before.blob : 'none recorded'}) are not in the object store` };
  const oldBuf = blobBytes(tree, before.blob);
  if (!oldBuf) return { missing: `the approved bytes of ${f.path} (blob ${before.blob}) are not in the object store` };
  let newText = '';
  if (f.sha256) {
    const nb = blobBytes(tree, f.blob);
    if (!nb) return { missing: `the amended bytes of ${f.path} (blob ${f.blob || 'none recorded'}) are not in the object store` };
    newText = nb.toString('utf8');
  }
  const oldText = oldBuf.toString('utf8');
  const d = lineDiff(oldText, newText);
  const head = `${d.hunks} hunk(s), +${d.added} -${d.removed} lines`;
  let counter = null;
  try { counter = require(path.join(tree, 'validators', 'validate-test-honesty.cjs')).countAssertions; } catch (_) { counter = null; }
  if (typeof counter !== 'function') return { broken: 'the assertion counter validators/validate-test-honesty.cjs did not load' };
  const a = counter(f.path, oldText); const b = counter(f.path, newText);
  if (!a || !b) return { reason: null, summary: `${head}, assertions not evaluated (${path.extname(f.path) || 'no extension'})` };
  let reason = null;
  if (b.count < a.count) reason = `assertions ${a.count} -> ${b.count}`;
  if (!reason) for (const name of Object.keys(b.skips)) if ((b.skips[name] || 0) > (a.skips[name] || 0)) { reason = `${name} added`; break; }
  if (!reason) {
    const gone = multisetMinus(a.lines, b.lines); const fresh = multisetMinus(b.lines, a.lines);
    if (gone.length) reason = gone.some((o) => fresh.some((n) => skeleton(n) === skeleton(o))) ? 'a literal changed in an existing assertion' : 'an assertion rewritten';
  }
  return { reason, summary: `${head}, assertions ${a.count} -> ${b.count}` };
}

// The publish's check on --kind amendment. -> { ok:true, amended:[{path, sha256, blob}], flags:[{path, reason}] } | { ok:false, line }
// flags are the builder's notice of what the ack will refuse; the ack recounts and never trusts them.
function amendment(res) {
  const rec = readApproval(res.root);
  if (!rec) return { ok: false, line: 'channel: amendment refused - no approval record for the open stage (/approve-red writes .claude/channel/approval.json); a test change before the release belongs in the red-stop' };
  const open = stageOf(res.tree);
  if (rec.stage !== open) return { ok: false, line: `channel: amendment refused - the open stage is ${open} and the approval was for ${rec.stage}; a new stage id is scope: the owner's /approve-red` };
  const cur = currentApproval(rec);
  if (!cur) return { ok: false, line: 'channel: amendment refused - no approval record for the open stage (/approve-red writes .claude/channel/approval.json); a test change before the release belongs in the red-stop' };
  if (!rec.legacy) { const sc = scopeChange(res.tree, open, cur.row.scope, 'amendment'); if (sc) return { ok: false, line: sc }; }
  const latest = cur.latest;
  const added = changedTestFiles(res.tree).filter((p) => !latest.has(p));
  if (added.length) return { ok: false, line: `channel: amendment refused - it adds a test file ${added[0]}; that is scope: the owner's /approve-red` };
  const changed = Array.from(latest.keys()).sort().map((p) => ({ path: p, sha256: fileSha(res.tree, p) })).filter((x) => x.sha256 !== latest.get(x.path).sha256);
  if (!changed.length) return { ok: false, line: 'channel: amendment refused - no approved test file changed since the approval (nothing to amend)' };
  const blobs = snapshotBlobs(res.tree, changed.filter((x) => x.sha256).map((x) => x.path));
  const amended = changed.map((x) => ({ path: x.path, sha256: x.sha256, blob: x.sha256 ? (blobs.get(x.path) || null) : null }));
  const flags = [];
  if (!rec.legacy) for (const x of amended) { const c = classifyAmendment(res.tree, latest.get(x.path), x); if (c.reason) flags.push({ path: x.path, reason: c.reason }); }
  return { ok: true, amended, flags };
}
// The orchestrator's ack: the ONE orchestrator publish with no /send token, and only in reply to
// an amendment not yet acknowledged. It recounts each amended file against the bytes the record
// names (case 5: a loosening is refused, and so is an amendment whose bytes the object store no
// longer holds), appends an ack row naming the amended bytes, and returns the diff summary the
// orchestrator reads in the acking turn (M34.C). A legacy record is acked as before.
function ackAmendment(cwd, res, seq) {
  const theirs = readLog(path.join(res.root, FILES.work), 'work', res);
  if (theirs.fault) return { ok: false, line: theirs.fault.line.replace('pickup stopped', 'ack stopped') };
  const m = theirs.msgs.find((x) => x.seq === seq);
  if (!m) return { ok: false, line: `channel: ack answers only an amendment - builder seq ${seq} does not exist` };
  if (m.class !== 'stage-packet' || m.kind !== 'amendment') return { ok: false, line: `channel: ack answers only an amendment - seq ${seq} is ${m.class}/${m.kind}` };
  const mine = readLog(outboxFile(res), 'orchestrator', res);
  if (mine.fault) return { ok: false, line: mine.fault.line.replace('pickup stopped', 'ack stopped') };
  const prev = mine.msgs.find((x) => x.kind === 'ack' && x.reply_to === seq);
  if (prev) return { ok: false, line: `channel: amendment seq ${seq} is already acknowledged (seq ${prev.seq})` };
  const files = Array.isArray(m.amended) ? m.amended : [];
  const rec = readApproval(res.root);
  const cur = rec && !rec.legacy && rec.stage === m.stage ? currentApproval(rec) : null;
  const summary = [];
  if (cur) {
    for (const f of files) {
      const c = classifyAmendment(res.tree, cur.latest.get(f.path) || null, f);
      if (c.broken) return { ok: false, line: `channel: ack refused - amendment seq ${seq}: ${c.broken}, so a loosened assertion cannot be told from an added one - repair: node scripts/kit-update.cjs --adopt, then ack again` };
      if (c.missing) return { ok: false, line: `channel: ack refused - amendment seq ${seq}: ${c.missing}, so a loosened assertion cannot be told from an added one; the owner runs /approve-red` };
      if (c.reason) return { ok: false, line: `channel: ack refused - amendment seq ${seq} is case 5: ${f.path} ${c.reason}; the owner runs /approve-red (an amendment that removes or loosens an assertion is never acked)` };
      summary.push(`ack: ${f.path}: ${c.summary}`);
    }
  }
  const body = `ack: amendment seq ${seq} acknowledged - ${files.length} amended test file(s): ${files.map((f) => f.path).join(', ') || 'none'}`;
  const r = append(cwd, res, 'courier', 'ack', Buffer.from(body, 'utf8'), { replyTo: seq });
  if (!r.ok) return r;
  if (rec && rec.legacy) { const raw = rec.raw; raw.acks = (raw.acks || []).concat([{ seq, files }]); writeRecord(res.root, raw); }
  // M34.6.B (item 10): the ack row names the orchestrator's message it rides on, by seq and hash.
  else if (rec) { rec.rows.push(JSON.parse(JSON.stringify({ kind: 'ack', at: new Date().toISOString(), seq, ack_seq: r.msg.seq, message_seq: r.msg.seq, message_sha256: r.msg.hash, files }))); writeRecord(res.root, rec); }
  r.summary = summary;
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
  IDENTITY_FILE, IDENTITY_RE, readIdentity, rootInference, originOf, // M34.6.A
  unreadFor, append, sendGate, utf8Fault, utf8Refusal, sha, inboxFile, outboxFile, pickupLine, summaryLine, describe,
  stampLine, consumeApproval, emit, writeAtomic, pidAlive, trunkOf, aheadOf,
  LISTEN_FRESH_MS, watcherState, bellLine, peerFolder,
  APPROVAL_FILE, OWN_FILES, TEST_GLOBS, changedTestFiles, redSet, readApproval, amendment, ackAmendment,
  // the approval record cannot be weakened (M34.C)
  canonicalJson, approvalRowHash, currentApproval, appendApproval, appendVoid, recordBytes, restoreRecord, archiveApproval,
  snapshotBlobs, blobBytes, scopeChange, stageEndCheck, testFilesSince, lineDiff, classifyAmendment,
  // the evidence path (M34.6.B)
  ackBoundFor, approvalChecks, REFUSALS_FILE, refusalRow, takePublishLock,
};
