#!/usr/bin/env node
// @kit-version 0.1.0-dev
// .claude/hooks/receipts-lifecycle.cjs
//   (kit source of truth: templates/dot-claude/hooks/receipts-lifecycle.cjs)
//
// The M20.6.B build-receipt lifecycle adapter — ONE shared script every lifecycle
// registration invokes (extend-not-fork). It reads the hook payload from STDIN
// (the documented hook input path — this is a HOOK, so it is EXEMPT from the A-15
// control-script no-stdin rule), maps `hook_event_name` → the Stage-A event
// vocabulary, extracts ONLY allowlisted fields, and appends via the frozen Stage-A
// contract (scripts/lib/receipts.cjs). It never renders reports (D), never derives
// (C), never redefines the vocabulary or opens a second sink — a parallel vocabulary
// or sink is the fork the kit bans.
//
// EXIT-CODE DISCIPLINE (RCPT-09) — the load-bearing guarantee. A metrics fault must
// NEVER change a hook's exit code or stdout: in a Stop hook exit 2 forces
// continuation; in UserPromptSubmit exit 2 erases the user's prompt. So this adapter:
//   * has EXACTLY ONE exit, and it is METRICS_EXIT_CODE (0), ALWAYS;
//   * writes NOTHING to stdout (it is observational — it never injects context);
//   * swallows every internal error, attempts a bounded degraded marker, and lets
//     the affected intervals surface as incomplete/unknown in the report.
// Losing an event is a coverage note; changing a hook's exit is the defect class
// RCPT-09 names. Instrumentation failure never blocks development — and never lies.
//
// Real emitters only (Stage A): the 8 hook boundaries below are the only ones that
// construct events here. `session_ended` is SOURCELESS — SessionEnd's reason is a
// matcher, not a payload field (A's J2). tool_name is NEVER persisted; only the
// bounded tool_category is (A's J4). `tool_use_id` is read DEFENSIVELY when the
// payload carries it (the current CLI docs do not list it on Pre/PostToolUse; absent
// → the tool is recorded id-less and its duration is deferred to the report, never
// guessed — M20.6.B J-B2). `permission_requested` is start-only, honestly unpaired
// (there is no permission-grant boundary). `at` is the adapter's wall clock at
// observation — no payload timestamp exists (J-B4).
//
// Cross-platform (Node, no shell-isms). The require is __dirname-relative so it
// resolves identically in the kit tree (templates/dot-claude/hooks →
// templates/scripts/lib) and a rendered project (.claude/hooks → scripts/lib).

'use strict';

const fs = require('fs');
const path = require('path');

// The ONLY exit. The metrics path never blocks a hook (RCPT-09). Flipping this to a
// non-zero value is the M20.6.B mut1 the fail-open lock kills.
const METRICS_EXIT_CODE = 0;

// Consume the frozen Stage-A contract; never redefine it. Absent (a broken install)
// → the adapter simply does nothing and still exits 0.
let receipts = null;
try { receipts = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'receipts.cjs')); } catch (_) { receipts = null; }

// hook_event_name → event (the emitter IS the hook name; both are bound by A's
// EVENT_EMITTERS). Mapping SessionEnd to anything that closes a turn is the M20.6.B
// mut2 the incomplete-interval lock kills.
const EVENT_MAP = {
  SessionStart: 'session_started',
  SessionEnd: 'session_ended',
  UserPromptSubmit: 'turn_started',
  Stop: 'turn_stopped',
  PreToolUse: 'tool_started',
  PostToolUse: 'tool_completed',
  PostToolUseFailure: 'tool_failed',
  PermissionRequest: 'permission_requested',
};

// ---- bounded stdin (no-hang guard; hooks receive their payload here) ----
const MAX_STDIN_BYTES = 1 << 20; // 1 MiB defensive ceiling
function readStdinBounded() {
  const CHUNK = 65536;
  const buf = Buffer.allocUnsafe(CHUNK);
  const out = [];
  let total = 0;
  let guard = 0;
  while (total < MAX_STDIN_BYTES && guard < 100000) {
    guard++;
    let n;
    try {
      n = fs.readSync(0, buf, 0, Math.min(CHUNK, MAX_STDIN_BYTES - total), null);
    } catch (e) {
      if (e && e.code === 'EAGAIN') continue; // not ready yet; bounded by guard
      break; // EOF (some platforms throw) or unreadable → stop
    }
    if (n === 0) break;
    out.push(Buffer.from(buf.subarray(0, n)));
    total += n;
  }
  return Buffer.concat(out).toString('utf8');
}

// ---- session-role resolution (mirror the A-stage hooks; alias-window aware) ----
const VALID_ROLES = ['work', 'verifier', 'orchestrator', 'refactor'];
const NUL = String.fromCharCode(0);
function decodeBytes(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
}
function readRoleToken(claudeDir, name) {
  try {
    return decodeBytes(fs.readFileSync(path.join(claudeDir, name))).split(NUL).join('').trim().toLowerCase();
  } catch (_) {
    return undefined; // absent / unreadable
  }
}
// PREFER `.claude/role`, FALL BACK to the legacy `.claude/active-mode` ONLY when role
// is ABSENT (I9 alias-window). A present-but-garbage marker resolves to null (unknown)
// and does NOT fall through — validateEvent then coerces role to 'unknown' (never
// guessed). Returns a valid role token or null.
function resolveRole(claudeDir) {
  const r = readRoleToken(claudeDir, 'role');
  if (r !== undefined) return VALID_ROLES.indexOf(r) !== -1 ? r : null;
  const a = readRoleToken(claudeDir, 'active-mode');
  if (a !== undefined) return VALID_ROLES.indexOf(a) !== -1 ? a : null;
  return null;
}

// Best-effort observability marker: a bounded, sourceless instrumentation_degraded
// event (lands in the unattributed script ledger). Only emitted when the boundary is
// a real emitter — an unparseable/unmapped payload has no honest emitter, so it is
// silently dropped rather than forged. Itself best-effort: a failure here is swallowed.
function degrade(receiptsDir, emitter, at) {
  try {
    if (!receipts || receipts.EMITTERS.indexOf(emitter) === -1) return;
    receipts.appendEvent(receiptsDir, {
      schema: receipts.SCHEMA_VERSION,
      at: at || new Date().toISOString(),
      event: 'instrumentation_degraded',
      emitter,
      marker: 'degraded',
    });
  } catch (_) { /* the degraded write is itself bonus */ }
}

function main() {
  if (!receipts) return; // no contract available → nothing to record (exit unaffected)

  let payload;
  try { payload = JSON.parse(readStdinBounded()); } catch (_) { return; } // unparseable → no honest emitter → silent
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

  const hookName = payload.hook_event_name;
  const eventName = EVENT_MAP[hookName];
  if (!eventName) return; // unmapped boundary → forge nothing (authorization floor)

  const cwd = (typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const receiptsDir = path.join(claudeDir, 'receipts');
  const at = new Date().toISOString();

  // Build the allowlisted projection ONLY. Everything else in the payload
  // (tool_input, tool_response, prompt_id, effort, error, transcript_path,
  // permission_mode, model, cwd) is dropped here and again at the sink.
  const raw = { schema: receipts.SCHEMA_VERSION, at, event: eventName, emitter: hookName };
  if (typeof payload.session_id === 'string') raw.session = payload.session_id;
  const role = resolveRole(claudeDir);
  if (role) raw.role = role;
  if (hookName === 'SessionStart' && typeof payload.source === 'string') raw.source = payload.source;
  if (typeof payload.tool_name === 'string') raw.tool_category = receipts.toolCategory(payload.tool_name);
  if (typeof payload.tool_use_id === 'string') raw.tool_use_id = payload.tool_use_id; // defensive; absent is honest

  let res;
  try { res = receipts.appendEvent(receiptsDir, raw); }
  catch (_) { res = { ok: false }; }
  if (!res || res.ok !== true) degrade(receiptsDir, hookName, at);
}

// EXACTLY ONE exit. main() swallows its own errors; this try is belt-and-suspenders
// so even an unexpected throw cannot alter the hook's exit code (RCPT-09).
try { main(); } catch (_) { /* swallowed */ }
process.exit(METRICS_EXIT_CODE);
