#!/usr/bin/env node
// @kit-version 0.1.0-dev
// .claude/hooks/user-prompt-submit-mode-check.cjs
//
// UserPromptSubmit hook. Enforces the mode separation (work / verifier /
// orchestrator / refactor) by checking that a pasted stage prompt matches the
// session's declared role in .claude/role (falling back to the legacy .claude/active-mode alias).
//
// Why UserPromptSubmit and not SessionStart: SessionStart fires before any
// prompt exists, so it cannot see what the user is about to paste. The
// mode<->prompt match can only be checked when the prompt is in hand.
//
// Mode is detected from the pasted prompt, in priority order:
//   1. An explicit <mode>work|verifier|orchestrator|refactor</mode> tag, if present.
//   2. Otherwise the stage-prompt root element:
//        <work_stage_prompt>      -> work
//        <closeout_stage_prompt>  -> work      (closeout is a build session)
//        <verifier_stage_prompt>  -> verifier
//        <refactor_stage_prompt>  -> refactor  (Stage R health check)
//        <audit_pass_prompt>      -> verifier  (audit IS verification;
//                                   the persona/dimension/checklist ride on the
//                                   prompt, NOT a new active-mode value)
//   3. If neither is present, the prompt is treated as ad-hoc (a question,
//      an orchestrator consultation, etc.) and passes silently.
//
// .claude/active-mode holds the session's mode. ABSENT is the one legitimate
// default -> "work" (a greenfield work session, or a project predating the dial).
// A PRESENT-but-unreadable / empty / unrecognized active-mode is a misconfiguration,
// NOT a "work" default: silently assuming work there would disable the 3-brain
// bias guard exactly when the mode is changing (ERR-002). So this hook FAILS CLOSED
// on a present-but-unresolvable mode — it blocks and tells the user to fix it.
//
// Exit codes:
//   0  -> allow the prompt (match; ad-hoc/no stage prompt; or absent active-mode
//         resolving to the legitimate work default).
//   2  -> block: a real mode mismatch, OR a present-but-unresolvable active-mode
//         (fail-closed, ERR-002). stderr explains and how to fix it.
//
// Cross-platform (Node, no shell-isms).

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];

// Map a stage-prompt root element to the mode that should be executing it.
// audit_pass_prompt maps to 'verifier' (not a new mode): an audit pass IS a
// fresh-context verification session. Widening this entry is what lets
// a pasted audit pass run under active-mode: verifier; it does NOT add a fifth
// active-mode (VALID_MODES is unchanged), so a real mismatch — e.g. an audit pass
// pasted into a work session — STILL blocks.
const ROOT_TO_MODE = {
  work_stage_prompt: 'work',
  closeout_stage_prompt: 'work',
  verifier_stage_prompt: 'verifier',
  refactor_stage_prompt: 'refactor',
  audit_pass_prompt: 'verifier',
};

// Bounded stdin read (IPC-001): a defensive ceiling so a pathological / never-
// closing / oversized stream cannot be slurped whole or hang the prompt path. The
// payload we need (the JSON, or the stage-prompt head) is kilobytes; we read up to
// the cap and stop. Mode detection only needs the head.
const MAX_STDIN_BYTES = 1 << 20; // 1 MiB
function readStdin() {
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
      break; // EOF (some platforms throw) or unreadable -> stop
    }
    if (n === 0) break;
    out.push(Buffer.from(buf.subarray(0, n)));
    total += n;
  }
  return Buffer.concat(out).toString('utf8');
}

function getPrompt(raw) {
  // UserPromptSubmit delivers a JSON payload with a `prompt` field. If parsing
  // fails for any reason, fall back to treating the raw input as the prompt.
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.prompt === 'string') return obj.prompt;
  } catch (_) { /* not JSON -> use raw */ }
  return raw;
}

// Identify the ROOT stage-prompt element (IPC-006 / C1-001/002). This is the
// hardening of the old "regex on raw text, first tag (incl. <mode>) wins" classifier,
// which was evadable three ways:
//   * a `<mode>work</mode>` PREFIX overrode the real root element (C1-001), so a
//     verifier prompt could masquerade as work;
//   * FIRST-TAG-WINS on raw text false-blocked a legitimate work prompt that merely
//     MENTIONED `<verifier_stage_prompt>` in its body before its own root (C1-002).
// Fix: a REAL element has BOTH an opening `<X ...>` and a matching closing `</X>`.
// A bare mention (a quoted tag with no close) and a `<mode>` annotation (not in the
// element set) are NOT elements. Among real elements, the root is the one whose
// opening tag comes FIRST. `<mode>` may CONFIRM the structural mode but can never
// OVERRIDE it — a disagreeing `<mode>` is the evasion and is ignored.
const STAGE_ELEMENTS = Object.keys(ROOT_TO_MODE);

function detectRootElement(prompt) {
  let bestName = null;
  let bestOpen = Infinity;
  for (const name of STAGE_ELEMENTS) {
    const openM = prompt.match(new RegExp('<' + name + '\\b'));
    if (!openM) continue;
    if (prompt.indexOf('</' + name + '>') === -1) continue; // bare mention, not a real element
    if (openM.index < bestOpen) { bestOpen = openM.index; bestName = name; }
  }
  if (bestName !== null) return bestName;

  // No element has a matching close (a truncated / streamed paste). Fall back to the
  // first opening tag among the element set so a partial real prompt still classifies.
  // `<mode>` is not an element, so it still cannot win here.
  let firstName = null;
  let firstIdx = Infinity;
  for (const name of STAGE_ELEMENTS) {
    const m = prompt.match(new RegExp('<' + name + '\\b'));
    if (m && m.index < firstIdx) { firstIdx = m.index; firstName = name; }
  }
  return firstName;
}

// Returns the mode the prompt declares/implies, or null if it's not a stage prompt.
function detectMode(prompt) {
  const root = detectRootElement(prompt);
  if (root === null) return null; // ad-hoc prompt -> nothing to enforce
  // The structural root is AUTHORITATIVE. A <mode> annotation that disagrees is
  // the IPC-006 evasion and is ignored.
  return ROOT_TO_MODE[root];
}

// Decode a tiny mode file across encodings. PowerShell `>` writes UTF-16LE+BOM;
// Set-Content may add a UTF-8 BOM; Unix writes plain UTF-8. This BOM-decode +
// the NUL-strip in strictToken are the REAL ERR-002 root (a UTF-16/BOM file read
// as naive utf8 never matched the literal word, so Windows silently fell back to
// `work`). Keep them — the P#29 regression tests are the wall.
function decodeBytes(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  return buf.toString('utf8');
}

// STRICT resolution: `.claude/active-mode` is canonical BARE-TOKEN state, written
// only by scripts/set-mode.cjs (atomic). Decode, strip NULs (no-BOM UTF-16 tail),
// trim whitespace, lowercase — then accept ONLY an exact token match. No
// annotation/multi-token recovery: a decorated value ("mode: verifier # …",
// "work # mode: verifier") is non-canonical and resolves to '' here.
const NUL = String.fromCharCode(0);
function strictToken(buf) {
  return decodeBytes(buf).split(NUL).join('').trim().toLowerCase();
}

// Read ONE marker file. Returns one of:
//   { state: 'absent' }                -> no such marker file (legitimate -> work)
//   { state: 'ok', mode }              -> exact bare-token match
//   { state: 'unresolved', reason }    -> present but unreadable/empty/non-canonical
// No re-read loop: the atomic writer (set-mode.cjs) makes a partial/empty read
// impossible, so an empty read is a genuine misconfiguration -> fail closed.
function readMarkerState(claudeDir, name) {
  let buf;
  try {
    buf = fs.readFileSync(path.join(claudeDir, name));
  } catch (e) {
    if (e && e.code === 'ENOENT') return { state: 'absent' };
    // Present but unreadable (EACCES, EISDIR, lock, ...) -> fail-closed, never 'work'.
    return { state: 'unresolved', reason: `${name} unreadable (${e && e.code ? e.code : 'error'})` };
  }
  const token = strictToken(buf);
  if (token.length === 0) return { state: 'unresolved', reason: `empty ${name}` };
  if (VALID_MODES.includes(token)) return { state: 'ok', mode: token };
  return { state: 'unresolved', reason: `non-canonical ${name} (expected a bare token)` };
}
// I9 alias-window resolution (M20.B): PREFER `.claude/role`, FALL BACK to the legacy
// `.claude/active-mode` ONLY when role is ABSENT. A present-but-garbage role FAILS CLOSED
// and must NOT fall through to a valid legacy file (the DF-005 discipline). Retired at
// v0.2.0 with the alias.
function readActiveMode(claudeDir) {
  const role = readMarkerState(claudeDir, 'role');
  if (role.state === 'absent') return readMarkerState(claudeDir, 'active-mode');
  return role;
}

function main() {
  const prompt = getPrompt(readStdin());
  const declared = detectMode(prompt);

  // Ad-hoc prompt (no stage-prompt structure) -> nothing to enforce.
  if (declared === null) process.exit(0);

  const claudeDir = path.join(process.cwd(), '.claude');
  const res = readActiveMode(claudeDir);

  // FAIL CLOSED (ERR-002): a present-but-unresolvable active-mode must block,
  // never silently default to 'work'. Absent is the lone legitimate -> 'work'.
  if (res.state === 'unresolved') {
    process.stderr.write(
      `\nMode undeterminable — prompt not run (fail-closed).\n` +
      `  .claude/role (or its legacy .claude/active-mode alias) exists but its role could not be resolved: ${res.reason}.\n` +
      `  Refusing to assume "work" — that would silently disable the 3-brain bias guard\n` +
      `  (e.g. run a ${declared} prompt with a work read-first list).\n\n` +
      `  Fix: write a single valid mode (work | verifier | orchestrator | refactor),\n` +
      `  or delete the file to default to work, then re-paste:\n` +
      `    node scripts/set-mode.cjs ${declared}\n\n`
    );
    process.exit(2);
  }

  const active = res.state === 'absent' ? 'work' : res.mode;

  if (declared === active) process.exit(0);

  // Mismatch: block and explain.
  const fix = declared === 'work'
    ? 'node scripts/set-mode.cjs work   (or delete the file)'
    : `node scripts/set-mode.cjs ${declared}`;

  process.stderr.write(
    `\nMode mismatch — prompt not run.\n` +
    `  Pasted prompt is a ${declared} stage; this session's .claude/role is "${active}".\n` +
    `  Running a ${declared} prompt in a ${active} session loads the wrong read-first list\n` +
    `  (e.g. a verifier must NOT have prior retrospectives in context — the fresh-context bias guard).\n\n` +
    `  Fix: open a fresh session for the right mode, set the mode, then re-paste:\n` +
    `    ${fix}\n\n`
  );
  process.exit(2);
}

main();
