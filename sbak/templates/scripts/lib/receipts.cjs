#!/usr/bin/env node
// @kit-version 1.0.5
// scripts/lib/receipts.cjs
//
// The receipt/event contract (M20.6.A) — ONE module consumed by the lifecycle
// adapter (B), the collectors (C), and the renderer (D). Extend-not-fork: a
// parallel event vocabulary or a second append sink is a defect.
//
// The corrected design (A-18, the 51-finding review):
//   * Per-session append-only JSONL ledgers under .claude/receipts/ — there is
//     NO cross-session sequence counter. Within a file, append order is
//     authoritative; merge happens at REPORT time under a total order
//     (at, session, in-file index), proven enumeration-independent.
//   * Real emitters only. Every event names an executable boundary that exists
//     on this host (official hooks reference, fetched at stage open). There is
//     no permission_wait_ended, no process_interrupted, no live stage/milestone
//     completion, no monotonic_ms — those have no emitter here.
//   * The privacy floor IS the allowlist: fields are enumerated, format-checked
//     or closed-enum; unknown fields are dropped at append with a coverage
//     note. No prompt text, no paths, no tool arguments, no usernames — ever.
//     tool_name itself is never persisted (MCP tool names can embed server
//     identities); only the bounded tool_category is (M20.6.A red ruling J4).
//   * Honest time: an unmatched interval boundary is UNKNOWN (null), never
//     zero. Tool time nests inside role turns, disclosed as included. Parallel
//     sessions raise effort, never calendar. Human attention: not measured.
//   * Receipts are in-toto-shaped statements (predicateType
//     software-build-assurance-kit/build-receipt/v1); the builder REFUSES a receipt without
//     provenance or limitation.
//   * Anomalies (torn tails, clock skew, unattributed script ledgers, boundary
//     re-fires) are FLAGGED as coverage notes, never silently "fixed".
//
// HONEST LOCUS: this module is the data contract. It does not register hooks
// (B), read repository artifacts (C), or render reports (D).

'use strict';

const fs = require('fs');
const path = require('path');
const sandbox = require('./sandbox.cjs');

// ---------------------------------------------------------------------------
// Bounded vocabulary — real emitters only.
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

const EVENTS = Object.freeze([
  'session_started',          // SessionStart hook
  'session_ended',            // SessionEnd hook
  'turn_started',             // UserPromptSubmit hook
  'turn_stopped',             // Stop hook (no Stop → the turn stays incomplete)
  'tool_started',             // PreToolUse hook
  'tool_completed',           // PostToolUse hook
  'tool_failed',              // PostToolUseFailure hook
  'permission_requested',     // PermissionRequest hook — start-only, honestly unpaired
  'release_line_observed',    // UserPromptSubmit hook — the RED-RELEASE line-marker (ruling 5, M22.G)
  'mode_set',                 // scripts/set-mode.cjs
  'stage_opened',             // scripts/stage-active.cjs
  'red_approved',             // scripts/approve-red.cjs
  'stage_cleared',            // scripts/stage-active.cjs --clear
  'orientation_stamped',      // SessionStart hook (session-start-read-first.cjs) — the stamp layer ran (M30.G)
  'file_read',                // PostToolUse hook — a Read-tool or Bash read of a repo file, as a hashed read_ref (M30.G)
  'channel_published',        // scripts/channel.cjs — a message appended to the terminal channel (M30.H)
  'channel_picked_up',        // scripts/channel.cjs (or approve-red.cjs: the human consuming an approval-request) — a message surfaced (M30.H)
  'instrumentation_degraded', // any allowlisted emitter reporting its own failure
]);

// The canonical session-role enum (.claude/role) + unknown. "builder" does not
// exist. Derived receipts (C) may additionally attribute human/machine.
const SESSION_ROLES = Object.freeze(['work', 'verifier', 'orchestrator', 'refactor', 'unknown']);
const DERIVED_ROLES = Object.freeze([...SESSION_ROLES, 'human', 'machine']);

// SessionStart payload `source`, verbatim (the official hooks reference).
// SessionEnd's payload has a DIFFERENT source value set — deliberately NOT
// widened into this enum (red ruling J2); an end-reason, if ever wanted, comes
// back through the contract as its own bounded field.
const SOURCES = Object.freeze(['startup', 'resume', 'clear', 'compact']);

// The marker vocabulary is CLOSED — these are the framework's own marker
// writes, not free text.
const MARKERS = Object.freeze(['stage-active', 'red-approved', 'role', 'degraded']);

// The release-origin vocabulary is CLOSED (UAT #15, M22.A; three-state at
// M22.G, ruling 5). When the lifecycle adapter observes an in-session
// invocation of a red-gate release command at PreToolUse, it classifies it to
// one of these bounded values — the raw command is read at observation and
// NEVER persisted (same shape as tool_name → tool_category, J4). Report-side
// reading is THREE-STATE: (1) a red_approved / stage_cleared script event
// WITHOUT a hook-observed release marker = the human's own outside shell, the
// always-sanctioned path; (2) a hook-observed release marker PRECEDED by a
// release_line_observed event in the same session = in-session release on the
// orchestrator packet's explicit RED-RELEASE line — the ruling-5-sanctioned
// path (the fence's ask prompt was the human's click); (3) a hook-observed
// release marker with NO prior line-marker = in-session self-release, the
// tell. The line-marker itself is bounded (line-present classification only —
// the prompt text never persists).
const RELEASES = Object.freeze(['approve-red', 'stage-clear']);

// The emitter floor: 8 hook boundaries + 3 control scripts. Nothing else may
// construct events (the authorization property).
const EMITTERS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Stop', 'SessionEnd',
  'set-mode', 'stage-active', 'approve-red', 'channel',
]);

// Per-event emitter binding (red ruling J3): an event may only be constructed
// by its own executable boundary — a flat allowlist would let any registered
// hook forge any event.
const EVENT_EMITTERS = Object.freeze({
  session_started: ['SessionStart'],
  session_ended: ['SessionEnd'],
  turn_started: ['UserPromptSubmit'],
  turn_stopped: ['Stop'],
  tool_started: ['PreToolUse'],
  tool_completed: ['PostToolUse'],
  tool_failed: ['PostToolUseFailure'],
  permission_requested: ['PermissionRequest'],
  release_line_observed: ['UserPromptSubmit'],
  mode_set: ['set-mode'],
  stage_opened: ['stage-active'],
  stage_cleared: ['stage-active'],
  red_approved: ['approve-red'],
  orientation_stamped: ['SessionStart'],
  file_read: ['PostToolUse'],
  channel_published: ['channel'],
  channel_picked_up: ['channel', 'approve-red'],
  instrumentation_degraded: EMITTERS,
});

// Bounded tool categories — the ONLY tool identity that persists (J4).
// The name→category mapping is contract data here; B's adapter consumes it.
const TOOL_CATEGORIES = Object.freeze(['edit', 'read', 'search', 'exec', 'web', 'agent', 'other']);
const TOOL_CATEGORY_MAP = Object.freeze({
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Read: 'read',
  Glob: 'search', Grep: 'search',
  Bash: 'exec', BashOutput: 'exec', KillShell: 'exec',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Task: 'agent',
});
function toolCategory(toolName) {
  return TOOL_CATEGORY_MAP[toolName] || 'other';
}

// Format checks. Stage ids and opaque ids are path-safe by construction — no
// separators, bounded length (the session id names the ledger file, so this
// doubles as a confinement guard).
const STAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Resource bounds: a raw event is size-capped BEFORE projection (defense in
// depth); a ledger read is capped to a valid prefix + truncation note.
const MAX_EVENT_BYTES = 2048;
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;

// Unknown duration is NEVER zero — every unmatched interval boundary yields
// this, and totals treat it as absent, not as 0.
const UNKNOWN_MS = null;

// The allowlist IS the privacy mechanism: any field not named here is dropped
// at append with a coverage note naming it.
// `read_ref` (M30.G) is 16 hex of sha256 over a canonical repo-relative path — a HASH, never
// the path: the "no paths, ever" floor holds while the read-ledger gate can re-hash its
// required entries (scripts/lib/read-ledger.cjs owns the derivation).
const ALLOWED_FIELDS = Object.freeze([
  'schema', 'at', 'event', 'session', 'role', 'stage', 'source',
  'emitter', 'tool_category', 'tool_use_id', 'marker', 'release', 'read_ref',
  'seq', 'channel_class', // M30.H: the channel events carry the message seq + its bounded class - never a body, hash or path
]);
// The channel's class vocabulary (M30.H) - closed, mirrors scripts/lib/channel.cjs CLASSES.
const CHANNEL_CLASSES = Object.freeze(['stage-open', 'stage-packet', 'clarification', 'courier', 'approval-request']);
const CHANNEL_EVENTS = Object.freeze(['channel_published', 'channel_picked_up']);
const READ_REF_RE = /^[0-9a-f]{16}$/;

// ---------------------------------------------------------------------------
// Envelope validation — allowlist projection + format/enum teeth.
// ---------------------------------------------------------------------------

// Returns { ok:true, event, notes } (event = the allowlisted projection;
// notes name every dropped/coerced field) or { ok:false, reason, notes }.
function validateEvent(raw) {
  const notes = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'event refused: not an object', notes };
  }
  let rawBytes;
  try { rawBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8'); }
  catch (_) { return { ok: false, reason: 'event refused: unserializable input', notes }; }
  if (rawBytes > MAX_EVENT_BYTES) {
    return { ok: false, reason: `event refused: ${rawBytes} bytes exceeds the MAX_EVENT_BYTES bound (${MAX_EVENT_BYTES})`, notes };
  }

  const event = {};
  for (const k of Object.keys(raw)) {
    if (ALLOWED_FIELDS.indexOf(k) === -1) { notes.push(`field dropped (not allowlisted): ${k}`); continue; }
    event[k] = raw[k];
  }

  if (event.schema !== SCHEMA_VERSION) {
    return { ok: false, reason: `event refused: schema must be ${SCHEMA_VERSION}`, notes };
  }
  if (typeof event.at !== 'string' || !AT_RE.test(event.at)) {
    return { ok: false, reason: 'event refused: at must be an ISO-8601 wall-clock timestamp', notes };
  }
  if (EVENTS.indexOf(event.event) === -1) {
    return { ok: false, reason: `event refused: unknown event name ${JSON.stringify(String(event.event)).slice(0, 64)}`, notes };
  }
  if (EMITTERS.indexOf(event.emitter) === -1) {
    return { ok: false, reason: 'event refused: emitter outside the bounded allowlist', notes };
  }
  if (EVENT_EMITTERS[event.event].indexOf(event.emitter) === -1) {
    return { ok: false, reason: `event refused: emitter ${event.emitter} is not a permitted boundary for ${event.event}`, notes };
  }
  if (!('role' in event) || SESSION_ROLES.indexOf(event.role) === -1) {
    if ('role' in event) notes.push('field coerced: role outside the canonical enum -> unknown (unknown stays unknown, never guessed)');
    event.role = 'unknown';
  }
  if ('session' in event && (typeof event.session !== 'string' || !ID_RE.test(event.session))) {
    return { ok: false, reason: 'event refused: session id fails the format check (path-safe opaque id required — confinement guard)', notes };
  }
  if ('stage' in event && (typeof event.stage !== 'string' || !STAGE_RE.test(event.stage))) {
    delete event.stage;
    notes.push('field dropped (format check failed): stage');
  }
  if ('source' in event && (event.event !== 'session_started' || SOURCES.indexOf(event.source) === -1)) {
    delete event.source;
    notes.push('field dropped (out of enum, or source on a non-session_started event): source');
  }
  if ('tool_category' in event && TOOL_CATEGORIES.indexOf(event.tool_category) === -1) {
    delete event.tool_category;
    notes.push('field dropped (out of enum): tool_category');
  }
  if ('tool_use_id' in event && (typeof event.tool_use_id !== 'string' || !ID_RE.test(event.tool_use_id))) {
    delete event.tool_use_id;
    notes.push('field dropped (format check failed): tool_use_id');
  }
  if ('marker' in event && MARKERS.indexOf(event.marker) === -1) {
    delete event.marker;
    notes.push('field dropped (out of enum): marker');
  }
  if ('release' in event && (event.event !== 'tool_started' || RELEASES.indexOf(event.release) === -1)) {
    delete event.release;
    notes.push('field dropped (out of enum, or release on a non-tool_started event): release');
  }
  if ('read_ref' in event && (event.event !== 'file_read' || typeof event.read_ref !== 'string' || !READ_REF_RE.test(event.read_ref))) {
    delete event.read_ref;
    notes.push('field dropped (format check failed, or read_ref on a non-file_read event): read_ref');
  }
  if ('seq' in event && (CHANNEL_EVENTS.indexOf(event.event) === -1 || !Number.isInteger(event.seq) || event.seq < 1)) {
    delete event.seq;
    notes.push('field dropped (not a positive integer, or seq on a non-channel event): seq');
  }
  if ('channel_class' in event && (CHANNEL_EVENTS.indexOf(event.event) === -1 || CHANNEL_CLASSES.indexOf(event.channel_class) === -1)) {
    delete event.channel_class;
    notes.push('field dropped (out of enum, or channel_class on a non-channel event): channel_class');
  }
  if (event.event === 'file_read' && !('read_ref' in event)) {
    return { ok: false, reason: 'event refused: file_read without a read_ref is not a read', notes };
  }
  return { ok: true, event, notes };
}

// ---------------------------------------------------------------------------
// Ledger naming + the script-event session resolution.
// ---------------------------------------------------------------------------

// events-<sessionId>.jsonl (attributed) or events-script-<YYYY-MM-DD>.jsonl
// (unattributed — the control scripts outside any hook payload). The date is
// explicit: the caller supplies it; this module never invents a correlation.
function ledgerFileFor(session, date) {
  if (session === null || session === undefined) {
    const d = String(date || '');
    if (!DATE_RE.test(d)) throw new Error('receipts: the unattributed ledger needs an explicit YYYY-MM-DD date (never invented)');
    return `events-script-${d}.jsonl`;
  }
  if (typeof session !== 'string' || !ID_RE.test(session)) {
    throw new Error('receipts: session id fails the format check — refused (confinement guard)');
  }
  return `events-${session}.jsonl`;
}

// Env-first (CLAUDE_CODE_SESSION_ID — an observed env channel, not a
// documented payload field; B probes its availability empirically), with the
// unattributed-ledger fallback. A hostile/malformed value is treated as
// ABSENT — it is neither trusted as a session nor allowed near a filename.
function resolveScriptSession(env) {
  const src = env || process.env;
  const v = src.CLAUDE_CODE_SESSION_ID;
  if (typeof v === 'string' && ID_RE.test(v)) return { attributed: true, session: v, notes: [] };
  const notes = [];
  if (v !== undefined && v !== '') {
    notes.push('CLAUDE_CODE_SESSION_ID present but fails the session format check — treated as absent (unattributed ledger; never invented, never a path vector)');
  } else {
    notes.push('CLAUDE_CODE_SESSION_ID absent — script events go to the unattributed ledger (coverage note)');
  }
  return { attributed: false, session: null, notes };
}

// ---------------------------------------------------------------------------
// The append sink — per-session files, O_APPEND single-line writes, fail-closed
// confinement below the receipts dir.
// ---------------------------------------------------------------------------

function appendEvent(receiptsDir, raw) {
  const v = validateEvent(raw);
  if (!v.ok) return v;
  const e = v.event;
  const file = ('session' in e) ? ledgerFileFor(e.session) : ledgerFileFor(null, e.at.slice(0, 10));
  fs.mkdirSync(receiptsDir, { recursive: true });
  // Fail-closed: the target must resolve BELOW the receipts dir (assert-before-
  // mutate; symlinks/junctions resolved by the shared primitive).
  const target = sandbox.assertInside(receiptsDir, file);
  // Torn-tail isolation: if the last byte isn't a newline (a crashed write),
  // prefix one so the fragment stays on its own line and THIS event lands
  // whole — one line lost (the torn one), never two.
  let prefix = '';
  try {
    const st = fs.statSync(target);
    if (st.size > 0) {
      const fd = fs.openSync(target, 'r');
      const b = Buffer.alloc(1);
      try { fs.readSync(fd, b, 0, 1, st.size - 1); } finally { fs.closeSync(fd); }
      if (b[0] !== 0x0a) prefix = '\n';
    }
  } catch (_) { /* fresh ledger */ }
  fs.appendFileSync(target, prefix + JSON.stringify(e) + '\n', 'utf8');
  return { ok: true, file, notes: v.notes };
}

// ---------------------------------------------------------------------------
// The reader — valid prefix, torn tails and invalid lines as coverage notes,
// bounded by the read cap. Never fatal, never silently lossy.
// ---------------------------------------------------------------------------

function readLedger(file, opts) {
  const maxBytes = (opts && Number.isInteger(opts.maxBytes)) ? opts.maxBytes : MAX_LEDGER_BYTES;
  const notes = [];
  const base = path.basename(file);
  let buf;
  try { buf = fs.readFileSync(file); }
  catch (_) { return { events: [], torn: false, truncated: false, notes: [`ledger unreadable: ${base}`] }; }
  let truncated = false;
  if (buf.length > maxBytes) {
    buf = buf.slice(0, maxBytes);
    truncated = true;
    notes.push(`ledger read cap: ${base} exceeds ${maxBytes} bytes — only the valid prefix within the cap is read (coverage truncated)`);
  }
  const text = buf.toString('utf8');
  const endsWithNl = /\n$/.test(text);
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const events = [];
  let torn = false;
  lines.forEach((line, i) => {
    const clean = line.replace(/\r$/, ''); // CRLF tolerance on read; writes are LF
    if (clean.trim() === '') return;
    let parsed = null;
    try { parsed = JSON.parse(clean); } catch (_) { parsed = null; }
    const v = parsed === null ? null : validateEvent(parsed);
    if (v && v.ok) {
      events.push(v.event);
      for (const n of v.notes) notes.push(`${base}:${i + 1} ${n}`);
      return;
    }
    if (i === lines.length - 1 && !endsWithNl && !truncated) {
      torn = true;
      notes.push(`torn final line: ${base}:${i + 1} — valid prefix preserved (coverage note, not corruption)`);
    } else {
      notes.push(`invalid ledger line skipped (torn or corrupt): ${base}:${i + 1}`);
    }
  });
  return { events, torn, truncated, notes };
}

// ---------------------------------------------------------------------------
// The report-time merge — deterministic TOTAL order, anomalies flagged.
// ---------------------------------------------------------------------------

// Accepts a receipts dir or an explicit file array. Files are sorted
// lexicographically by basename EITHER WAY, so the result is independent of
// enumeration order (proven by the reversed-enumeration byte-compare lock).
// Total order: (at, sessionKey, file index, in-file index) — every tie breaks
// deterministically. Within a file, append order is the authoritative record;
// where the wall clock disagrees with it, the deviation is a FLAGGED clock-
// skew note and the total order governs the report (red ruling J1).
function mergeLedgers(input) {
  let files;
  if (Array.isArray(input)) {
    files = input.slice();
  } else {
    let names = [];
    try { names = fs.readdirSync(input).filter((n) => /^events-.*\.jsonl$/.test(n)); }
    catch (_) { names = []; }
    files = names.map((n) => path.join(input, n));
  }
  files.sort((a, b) => {
    const an = path.basename(a); const bn = path.basename(b);
    if (an !== bn) return an < bn ? -1 : 1;
    // M22.F (#27): a multi-dir merge can carry the same basename from two
    // worktrees' ledger dirs — break the tie on the full path so the total
    // order stays deterministic (never enumeration order).
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const notes = [];
  const sessionsMap = new Map();
  const all = [];
  files.forEach((f, fi) => {
    const base = path.basename(f);
    const unattributed = /^events-script-/.test(base);
    const g = readLedger(f);
    notes.push(...g.notes);
    if (unattributed && g.events.length > 0) {
      notes.push(`unattributed script ledger merged by wall clock: ${base} — session correlation not observed, never invented (coverage note)`);
    }
    let lastAt = null;
    g.events.forEach((e, ei) => {
      const key = ('session' in e) ? e.session : `~script:${base}`;
      if (lastAt !== null && e.at < lastAt) {
        notes.push(`clock skew flagged (never re-written): ${base}:${ei + 1} steps backwards (${e.at} after ${lastAt})`);
      }
      lastAt = e.at;
      if (e.event === 'session_started') {
        const s = sessionsMap.get(key);
        if (!s) {
          sessionsMap.set(key, { id: key, boundary_at: e.at, refires: 0, unattributed });
        } else {
          s.refires += 1;
          notes.push(`session boundary re-fire deduped: ${key} source=${e.source || 'unknown'} at ${e.at} — orientation re-fire, not a new session (I5)`);
        }
      } else if (!sessionsMap.has(key)) {
        sessionsMap.set(key, { id: key, boundary_at: null, refires: 0, unattributed });
      }
      all.push({ e, key, fi, ei });
    });
  });

  all.sort((x, y) => {
    if (x.e.at !== y.e.at) return x.e.at < y.e.at ? -1 : 1;
    if (x.key !== y.key) return x.key < y.key ? -1 : 1;
    if (x.fi !== y.fi) return x.fi - y.fi;
    return x.ei - y.ei;
  });

  const sessions = [...sessionsMap.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // An ATTRIBUTED session whose events carry no session_started boundary — a cap-truncated
  // tail, or pre-instrumentation history — is a NAMED coverage gap, never a silent
  // boundary_at:null. Emitted over the already-SORTED sessions so the note set stays
  // enumeration-independent (the reversed-enumeration byte-compare lock). The unattributed
  // script ledger legitimately has no session_started, so it is excluded (its own wall-clock
  // note already stands).
  for (const s of sessions) {
    if (!s.unattributed && s.boundary_at === null) {
      notes.push(`attributed session ${s.id} has events but no session_started boundary observed — boundary unknown (cap-truncated tail or pre-instrumentation history), merged by wall clock (coverage note)`);
    }
  }
  return { events: all.map((x) => x.e), sessions, notes };
}

// ---------------------------------------------------------------------------
// Interval arithmetic — unknown is NEVER zero.
// ---------------------------------------------------------------------------

// turn = turn_started -> turn_stopped, same session, in merged order. No stop
// (interrupt, crash) -> INCOMPLETE, duration UNKNOWN_MS — never synthesized,
// never zeroed. Tool intervals pair by tool_use_id and NEST inside turns:
// totals disclose tool time as included in role time, never added on top.
// Parallel sessions raise effort_ms; calendar_span_ms is wall-clock extent.
function computeIntervals(merged) {
  const events = Array.isArray(merged) ? merged : merged.events;
  const notes = [];
  const bySession = new Map();
  for (const e of events) {
    const key = ('session' in e) ? e.session : 'unattributed';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(e);
  }

  const turns = [];
  const toolIntervals = [];
  let unmatchedStops = 0;

  const sessionKeys = [...bySession.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const sess of sessionKeys) {
    const list = bySession.get(sess);
    let open = null;
    const openTools = new Map();
    const closeOpen = () => {
      turns.push({ session: sess, role: open.role, stage: open.stage, start_at: open.startAt, end_at: null, ms: UNKNOWN_MS, status: 'incomplete' });
      notes.push(`turn with no stop: ${sess} @ ${open.startAt} — INCOMPLETE, duration unknown (never zero, never synthesized)`);
      open = null;
    };
    for (const e of list) {
      if (e.event === 'turn_started') {
        if (open) closeOpen();
        // M26.F: the by-phase axis — the turn carries the stage its turn_started was
        // stamped with (the lifecycle hook reads .claude/stage-active). Absent → null:
        // frozen/pre-stamp history stays phase-unknown, never guessed, never zeroed.
        open = { startAt: e.at, role: e.role || 'unknown', stage: ('stage' in e) ? e.stage : null };
      } else if (e.event === 'turn_stopped') {
        if (open) {
          let ms = Date.parse(e.at) - Date.parse(open.startAt);
          let status = 'complete';
          if (!(ms >= 0)) {
            notes.push(`negative turn interval (clock skew): ${sess} @ ${open.startAt} — duration unknown, never coerced`);
            ms = UNKNOWN_MS;
            status = 'incomplete';
          }
          turns.push({ session: sess, role: open.role, stage: open.stage, start_at: open.startAt, end_at: e.at, ms, status });
          open = null;
        } else {
          unmatchedStops += 1;
          notes.push(`stop with no start: ${sess} @ ${e.at} — unknown, never zero`);
        }
      } else if (e.event === 'tool_started' && 'tool_use_id' in e) {
        openTools.set(e.tool_use_id, e.at);
      } else if ((e.event === 'tool_completed' || e.event === 'tool_failed') && 'tool_use_id' in e) {
        if (openTools.has(e.tool_use_id)) {
          let ms = Date.parse(e.at) - Date.parse(openTools.get(e.tool_use_id));
          if (!(ms >= 0)) { ms = UNKNOWN_MS; notes.push(`negative tool interval (clock skew): ${sess}/${e.tool_use_id} — unknown`); }
          toolIntervals.push({ session: sess, tool_use_id: e.tool_use_id, ms });
          openTools.delete(e.tool_use_id);
        } else {
          notes.push(`tool completion without a start: ${sess}/${e.tool_use_id} — unpaired (coverage note)`);
        }
      }
    }
    if (open) closeOpen();
    for (const id of [...openTools.keys()].sort()) {
      notes.push(`tool with no completion: ${sess}/${id} — unpaired, duration unknown (coverage note)`);
    }
  }

  const perRole = {};
  let observedSum = 0;
  let observedAny = false;
  let incompleteTurns = 0;
  for (const t of turns) {
    if (!perRole[t.role]) perRole[t.role] = { ms: UNKNOWN_MS, complete_turns: 0, incomplete_turns: 0 };
    if (t.status === 'complete' && t.ms !== UNKNOWN_MS) {
      perRole[t.role].ms = (perRole[t.role].ms === UNKNOWN_MS ? 0 : perRole[t.role].ms) + t.ms;
      perRole[t.role].complete_turns += 1;
      observedSum += t.ms;
      observedAny = true;
    } else {
      perRole[t.role].incomplete_turns += 1;
      incompleteTurns += 1;
    }
  }

  let toolSum = 0;
  let toolAny = false;
  for (const ti of toolIntervals) {
    if (ti.ms !== UNKNOWN_MS) { toolSum += ti.ms; toolAny = true; }
  }

  let calMin = null;
  let calMax = null;
  for (const e of events) {
    if (calMin === null || e.at < calMin) calMin = e.at;
    if (calMax === null || e.at > calMax) calMax = e.at;
  }

  // Parallel-session overlap: flagged, never smoothed — effort may exceed
  // calendar and that is the honest reading.
  const completeTurns = turns.filter((t) => t.status === 'complete');
  outer:
  for (let i = 0; i < completeTurns.length; i++) {
    for (let j = i + 1; j < completeTurns.length; j++) {
      const a = completeTurns[i]; const b = completeTurns[j];
      if (a.session !== b.session && a.start_at < b.end_at && b.start_at < a.end_at) {
        notes.push('parallel sessions observed: effort exceeds calendar (overlap flagged, never merged)');
        break outer;
      }
    }
  }

  return {
    turns,
    tool_intervals: toolIntervals,
    perRole,
    totals: {
      observed_turn_ms: observedAny ? observedSum : UNKNOWN_MS,
      effort_ms: observedAny ? observedSum : UNKNOWN_MS,
      calendar_span_ms: (calMin !== null && calMax !== null) ? (Date.parse(calMax) - Date.parse(calMin)) : UNKNOWN_MS,
      tool_ms: toolAny ? toolSum : UNKNOWN_MS,
      tool_time_included_in_role_time: true,
      incomplete_turns: incompleteTurns,
      unmatched_stops: unmatchedStops,
      human_attention: 'not measured',
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Token declarations (M26.F, Workstream 5) — DECLARED-basis files
// (.claude/receipts/tokens-*.jsonl). Platform token counts have no hook
// emitter on this host, so tokens enter the record as human/courier
// DECLARATIONS, validated here. The honesty floor:
//   * a token NUMBER without a source tag is REFUSED (a number of unknown
//     provenance is the mut2 class — a derived figure claiming platform
//     provenance);
//   * the source enum is CLOSED: platform-reported | derived | human-logged;
//   * an all-null declaration must state its note (an honest null carries its
//     why); null is never coerced to zero.
// ---------------------------------------------------------------------------

const TOKEN_SOURCES = Object.freeze(['platform-reported', 'derived', 'human-logged']);
const TOKEN_FIELDS = Object.freeze(['input', 'output', 'cache_read', 'cache_write']);

// validateTokenDeclaration(raw) → { ok:true, declaration } | { ok:false, reason }.
// Pure — no I/O; the reader/CLI feed it line-by-line.
function validateTokenDeclaration(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'declaration refused: not an object' };
  }
  if (raw.schema !== SCHEMA_VERSION) {
    return { ok: false, reason: `declaration refused: schema must be ${SCHEMA_VERSION}` };
  }
  if (typeof raw.at !== 'string' || !AT_RE.test(raw.at)) {
    return { ok: false, reason: 'declaration refused: at must be an ISO-8601 wall-clock timestamp' };
  }
  const t = raw.tokens;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) {
    return { ok: false, reason: 'declaration refused: tokens must be an object with the four canonical fields' };
  }
  let anyNumber = false;
  const tokens = {};
  for (const f of TOKEN_FIELDS) {
    if (!(f in t)) return { ok: false, reason: `declaration refused: tokens.${f} is required (null when unknown — never omitted, never zeroed)` };
    const v = t[f];
    if (v === null) { tokens[f] = null; continue; }
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) {
      return { ok: false, reason: `declaration refused: tokens.${f} must be a non-negative integer or null` };
    }
    tokens[f] = v;
    anyNumber = true;
  }
  if ('source' in raw && raw.source !== undefined) {
    if (TOKEN_SOURCES.indexOf(raw.source) === -1) {
      return { ok: false, reason: `declaration refused: source outside the closed enum (${TOKEN_SOURCES.join('|')})` };
    }
  } else if (anyNumber) {
    return { ok: false, reason: 'declaration refused: a token NUMBER without a source tag (platform-reported|derived|human-logged) — provenance is required for every counted token (the mut2 schema face)' };
  }
  if ('note' in raw && raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.trim() === '')) {
    return { ok: false, reason: 'declaration refused: note must be a non-empty string when present' };
  }
  if (!anyNumber && (typeof raw.note !== 'string' || raw.note.trim() === '')) {
    return { ok: false, reason: 'declaration refused: all-null tokens need a stated note — an honest null carries its why (never a silent unknown)' };
  }
  if ('scope' in raw && raw.scope !== undefined) {
    const s = raw.scope;
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      return { ok: false, reason: 'declaration refused: scope must be an object ({ role?, phase? })' };
    }
    if ('role' in s && DERIVED_ROLES.indexOf(s.role) === -1) {
      return { ok: false, reason: 'declaration refused: scope.role outside the canonical role enum' };
    }
    if ('phase' in s && (typeof s.phase !== 'string' || !STAGE_RE.test(s.phase))) {
      return { ok: false, reason: 'declaration refused: scope.phase fails the stage format check' };
    }
  }
  const out = { schema: SCHEMA_VERSION, at: raw.at, tokens: tokens };
  if ('source' in raw && raw.source !== undefined) out.source = raw.source;
  if (typeof raw.note === 'string' && raw.note.trim() !== '') out.note = raw.note;
  if (raw.scope && typeof raw.scope === 'object') {
    const sc = {};
    if ('role' in raw.scope) sc.role = raw.scope.role;
    if ('phase' in raw.scope) sc.phase = raw.scope.phase;
    if (Object.keys(sc).length > 0) out.scope = sc;
  }
  return { ok: true, declaration: out };
}

// ---------------------------------------------------------------------------
// The software-build-assurance-kit/build-receipt/v1 statement builder (in-toto-shaped).
// ---------------------------------------------------------------------------

const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
const PREDICATE_TYPE = 'software-build-assurance-kit/build-receipt/v1';
const BASES = Object.freeze(['observed', 'derived', 'declared']);
const SHA256_RE = /^[0-9a-f]{64}$/;

// Refuses (throws, naming the field) a receipt without provenance or
// limitation — honesty is structural, not stylistic. Subjects carry sha256
// digests where a real artifact exists; a digest-less subject is allowed
// (honest) but a malformed digest is not. Release artifacts LINK the signed
// attestations release.yml produces — never duplicate hashes unsigned (C).
function buildStatement(receipt) {
  if (!receipt || typeof receipt !== 'object') throw new Error('receipt refused: not an object');
  const subject = receipt.subject;
  if (!Array.isArray(subject) || subject.length === 0) throw new Error('receipt refused: at least one subject is required');
  const outSubjects = subject.map((s) => {
    if (!s || typeof s.name !== 'string' || s.name.length === 0) throw new Error('receipt refused: every subject needs a name');
    const o = { name: s.name };
    if ('digest' in s && s.digest !== undefined) {
      if (!s.digest || typeof s.digest.sha256 !== 'string' || !SHA256_RE.test(s.digest.sha256)) {
        throw new Error(`receipt refused: malformed sha256 digest for subject ${s.name} (64 lowercase hex; omit digest when no real artifact exists)`);
      }
      o.digest = { sha256: s.digest.sha256 };
    }
    return o;
  });
  const predicate = receipt.predicate;
  if (!predicate || typeof predicate !== 'object') throw new Error('receipt refused: missing predicate');
  if (!predicate.provenance) {
    throw new Error('receipt refused: missing provenance — every derived receipt names its source, commit|dirty state, collector version, and claim basis');
  }
  const p = predicate.provenance;
  if (typeof p.source !== 'string' || p.source.length === 0) throw new Error('receipt refused: provenance.source is required');
  if (!p.commit && !p.dirty) throw new Error('receipt refused: provenance needs a commit or an explicit dirty-tree state');
  if (typeof p.collector_version !== 'string' || p.collector_version.length === 0) throw new Error('receipt refused: provenance.collector_version is required');
  if (BASES.indexOf(p.basis) === -1) {
    throw new Error(`receipt refused: provenance.basis must be one of observed|derived|declared (got ${JSON.stringify(String(p.basis)).slice(0, 32)})`);
  }
  if (typeof predicate.limitation !== 'string' || predicate.limitation.trim() === '') {
    throw new Error('receipt refused: missing limitation — every receipt states what it does NOT claim');
  }
  return { _type: STATEMENT_TYPE, subject: outSubjects, predicateType: PREDICATE_TYPE, predicate };
}

// ---------------------------------------------------------------------------
// Deterministic serialization — stable key order, byte-identical for identical
// inputs (the determinism gate byte-compares this).
// ---------------------------------------------------------------------------

function canonicalJson(value) {
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(canon(value));
}

module.exports = {
  SCHEMA_VERSION,
  EVENTS,
  CHANNEL_CLASSES,
  SESSION_ROLES,
  DERIVED_ROLES,
  SOURCES,
  MARKERS,
  RELEASES,
  EMITTERS,
  EVENT_EMITTERS,
  TOOL_CATEGORIES,
  TOOL_CATEGORY_MAP,
  toolCategory,
  STAGE_RE,
  MAX_EVENT_BYTES,
  MAX_LEDGER_BYTES,
  ALLOWED_FIELDS,
  STATEMENT_TYPE,
  PREDICATE_TYPE,
  TOKEN_SOURCES,
  TOKEN_FIELDS,
  validateTokenDeclaration,
  validateEvent,
  ledgerFileFor,
  resolveScriptSession,
  appendEvent,
  readLedger,
  mergeLedgers,
  computeIntervals,
  buildStatement,
  canonicalJson,
};
