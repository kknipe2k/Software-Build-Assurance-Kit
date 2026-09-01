#!/usr/bin/env node
// @kit-version 1.0.5
// .claude/hooks/user-prompt-submit-mode-check.cjs
//
// UserPromptSubmit hook. Enforces the mode separation (work / verifier /
// orchestrator / refactor) by checking that a pasted stage prompt matches the
// session's declared role in .claude/role.
//
// Why UserPromptSubmit and not SessionStart: SessionStart fires before any
// prompt exists, so it cannot see what the user is about to paste. The
// mode<->prompt match can only be checked when the prompt is in hand.
//
// WHAT THIS CLAIMS, EXACTLY (the narrowed claim; do not widen it). For the framework's
// validated stage-prompt grammar, this hook identifies the outer stage element and checks
// that its required role matches the active session role. It is a role-separation guard
// for that grammar — NOT a general XML parser, NOT a security boundary, and it proves
// nothing about arbitrary XML.
//
// The structure is read by ONE shared module — scripts/lib/stage-structure.cjs — which the
// stage-prompt validator consumes too, so hook and validator can never disagree about what
// a stage prompt is. Its verdict drives the policy:
//   none      -> ad-hoc (a question, an orchestrator consultation, prose that merely
//                MENTIONS a tag): passes silently. Blocking prose is the false-positive
//                class this design exists to kill — frequent false blocks teach operators
//                to bypass the control.
//   complete  -> enforce the root's role:
//                  <work_stage_prompt>      -> work
//                  <closeout_stage_prompt>  -> work      (closeout is a build session)
//                  <verifier_stage_prompt>  -> verifier
//                  <refactor_stage_prompt>  -> refactor  (Stage R health check)
//                  <audit_pass_prompt>      -> verifier  (audit IS verification; the
//                                             persona/checklist ride on the prompt, NOT a
//                                             new role value)
//   partial   -> an unclosed opening tag. ENFORCED when the tag is grammar-conformant
//                (it carries a real stage id — a truncated REAL prompt); treated as ad-hoc
//                when it is not (a bare tag in prose).
//   ambiguous -> two grammar-conformant roots of different kinds submitted together:
//                which one is being run is undecidable -> BLOCK with that diagnostic.
//   invalid   -> positively a stage prompt but malformed (crossed spans) -> BLOCK.
// A <mode> annotation is NOT a stage root and is never consulted: it may agree with the
// structure but can never override it (the C1-001 evasion).
//
// .claude/role holds the session's role. ABSENT is the one legitimate
// default -> "work" (a greenfield work session, or a project predating the dial).
// A PRESENT-but-unreadable / empty / unrecognized role marker is a misconfiguration,
// NOT a "work" default: silently assuming work there would disable the 3-brain
// bias guard exactly when the mode is changing (ERR-002). So this hook FAILS CLOSED
// on a present-but-unresolvable mode — it blocks and tells the user to fix it.
//
// Exit codes:
//   0  -> allow the prompt (match; ad-hoc/no stage prompt; or an absent role marker
//         resolving to the legitimate work default).
//   2  -> block: a real mode mismatch, an ambiguous or malformed stage prompt, a
//         present-but-unresolvable role marker (fail-closed, ERR-002), or an
//         unreachable/mis-wired classifier module. stderr explains and how to fix it.
//
// Cross-platform (Node, no shell-isms).

'use strict';

const fs = require('fs');
const path = require('path');

// The ONE stage-structure reader, shared with validators/validate-stage-prompts.cjs.
// The relative path resolves identically in the kit, in a generated project, in an
// adopted repo, and inside templates/ — which is why the live and template copies of this
// hook stay byte-identical. A load failure is handled in main(): it must never leave the
// guard silently DORMANT, and must never brick ordinary conversation.
let CLASSIFIER = null;
let CLASSIFIER_ERR = null;
try {
  CLASSIFIER = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'stage-structure.cjs'));
} catch (e) {
  CLASSIFIER_ERR = e && e.message ? e.message : String(e);
}

const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];

// Map a stage-prompt root element to the mode that should be executing it.
// audit_pass_prompt maps to 'verifier' (not a new mode): an audit pass IS a
// fresh-context verification session. Widening this entry is what lets
// a pasted audit pass run under role: verifier; it does NOT add a fifth
// role value (VALID_MODES is unchanged), so a real mismatch — e.g. an audit pass
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

// Classify the prompt's stage structure (IPC-006 / C1-001/002, corrected at KF-57).
//
// History, so the shape is not "simplified" back into a defect. The original classifier
// was a regex on raw text where the first tag — including `<mode>` — won. That was
// evadable two ways: a `<mode>work</mode>` PREFIX overrode the real root (C1-001), and
// FIRST-TAG-WINS false-blocked a work prompt that merely MENTIONED another tag (C1-002).
// M09.C required a real element (matching open AND close) and dropped `<mode>` from the
// candidate set — but it still took the EARLIEST such element, so a complete quoted
// example above a real prompt captured the classification (KF-57) — and, from the other
// direction, a decoy root flipped it. The structural decision now lives in ONE shared
// module; this hook only maps the module's root to a role and applies the policy above.
// Reverting to earliest-tag selection is the mutation the kit's floor kills.
function classify(prompt) {
  const res = CLASSIFIER.classifyStagePrompt(prompt);
  if (!res || typeof res.state !== 'string') {
    return { state: 'invalid', reason: 'stage-structure reader returned no verdict' };
  }
  return res;
}

// The module owns the stage-root name set. If ROOT_TO_MODE has drifted from it, a root is
// wired in one place and not the other — a half-wired root would silently classify as
// ad-hoc and skip the guard, so this fails CLOSED rather than guessing.
function lockstepBreak() {
  const want = CLASSIFIER.STAGE_ROOTS.slice().sort().join(',');
  const have = Object.keys(ROOT_TO_MODE).sort().join(',');
  return want === have ? null : `ROOT_TO_MODE [${have}] != STAGE_ROOTS [${want}]`;
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

// STRICT resolution: `.claude/role` is canonical BARE-TOKEN state, written
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
// SINGLE-MARKER resolution (M28.F — the alias-window's fallback is removed).
// `.claude/role` is the only marker consulted; a pre-rename project reads as ABSENT, which
// is the `work` default and never a role resurrected from a retired file. DF-005 is
// unchanged and now unconditional: a present-but-garbage role fails closed with no second
// marker to leak through to.
function readActiveMode(claudeDir) {
  return readMarkerState(claudeDir, 'role');
}

// THE STAMPLESS CHECK (M30.G, audit row 2 - ruled: the hook fails loud, not the agent). The
// SessionStart hook appends `orientation_stamped` to this session's receipts ledger when it
// runs. If this prompt's session has no such event, the session hooks are not wired (or the
// stamp hook did not run) - block with ONE line naming the missing stamp. Honest scope: a
// project without the receipts contract (pre-M20.6 install) cannot be checked - one stderr
// note, no block; and if this hook itself is unwired nothing fires - the installer (M30.C)
// and the commit-time self-integrity hook own that gap.
function stampPresent(cwd, sessionId) {
  let receipts;
  try { receipts = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'receipts.cjs')); }
  catch (_) { return 'unchecked'; }
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId)) return 'unchecked';
  const dir = path.join(cwd, '.claude', 'receipts');
  const files = [path.join(dir, `events-${sessionId}.jsonl`), path.join(dir, `events-script-${new Date().toISOString().slice(0, 10)}.jsonl`)];
  let started = null;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const g = receipts.readLedger(f, { maxBytes: 1 << 20 });
    if (g.events.some((e) => e.event === 'orientation_stamped')) return 'present';
    for (const e of g.events) if (e.event === 'session_started' && typeof e.at === 'string' && started === null) started = e.at;
  }
  // M30.I (A15, filed live from a wedged terminal): a session that STARTED before this
  // hook file existed cannot carry the stamp its own SessionStart never knew to write -
  // blocking it refuses every prompt including the fix, an unrecoverable loop for the
  // person. The honest discriminator is this file's own mtime: a recorded session_started
  // older than the hook is a pre-upgrade session - exempt with a note, never block. A
  // session started AFTER the hook existed with no stamp is the real row-2 case and blocks.
  if (started !== null) {
    try {
      const hookAt = fs.statSync(__filename).mtime.getTime();
      if (new Date(started).getTime() < hookAt) return 'pre-upgrade';
    } catch (_) { /* fall through to missing - fail toward the check, not past it */ }
  }
  return 'missing';
}

function main() {
  const raw = readStdin();
  const prompt = getPrompt(raw);
  let payload = null;
  try { payload = JSON.parse(raw); } catch (_) { payload = null; }
  const cwd = (payload && typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();
  const stamp = stampPresent(cwd, payload && payload.session_id);
  if (stamp === 'missing') {
    process.stderr.write('[read-first stamp] missing - the SessionStart hook did not run here; start a new session (it stamps itself), or run node scripts/kit-update.cjs --adopt first if the hook layer was never installed.\n');
    process.exit(2);
  }
  if (stamp === 'pre-upgrade') {
    process.stderr.write('[read-first stamp] n/a - this session started before the stamp hook existed (pre-upgrade session); a new session will stamp itself.\n');
  }
  if (stamp === 'unchecked') {
    process.stderr.write('[read-first stamp] not checked - the receipts contract (scripts/lib/receipts.cjs) or a session id is absent here.\n');
  }

  // THE /send KEYSTROKE (M30.H, the terminal channel). The human typed /send in this terminal:
  // under role=orchestrator the hook stamps a one-shot token that `node scripts/channel.cjs send`
  // consumes - the keystroke is the adjudication record and the hook, not the agent, is the writer
  // of that record. Any other role is blocked in one line: only the orchestrator sends; builder
  // packets publish automatically. (The fence's ask rule on the send command is the other gate;
  // this token is the zero-click one when the raw line reaches the hook.)
  if (/^\s*\/send\b/.test(prompt)) {
    const sres = readActiveMode(path.join(cwd, '.claude'));
    const srole = sres.state === 'absent' ? 'work' : (sres.state === 'unresolved' ? 'unresolved' : sres.mode);
    if (srole !== 'orchestrator') {
      process.stderr.write(`channel: /send is the orchestrator's keystroke (this session's role is ${srole}) - only the orchestrator sends; builder packets publish automatically at surface time.\n`);
      process.exit(2);
    }
    try {
      const dir = path.join(cwd, '.claude', 'channel');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'send-token'), JSON.stringify({ at: new Date().toISOString(), session: payload && payload.session_id ? payload.session_id : null }) + '\n');
    } catch (_) { /* the fence's ask rule remains the other gate */ }
    process.exit(0);
  }

  // DEGRADED INSTALL (the classifier module is unreachable or the root set has drifted).
  // Two prongs, deliberately asymmetric: ordinary conversation must never be bricked by a
  // broken install, but a stage-shaped prompt must never sail through UNCHECKED — a
  // guard that quietly stops guarding is the dormant-control class. The stage-shaped test
  // here is a plain name scan over this file's own ROOT_TO_MODE, not a second structural
  // reader: it decides only whether to fail closed, never what the role is.
  const brokenReason = CLASSIFIER === null
    ? `cannot load scripts/lib/stage-structure.cjs (${CLASSIFIER_ERR})`
    : lockstepBreak();
  if (brokenReason) {
    const stageShaped = Object.keys(ROOT_TO_MODE).some((n) => prompt.indexOf('<' + n) !== -1);
    if (!stageShaped) process.exit(0); // prose is still prose
    // M30.I (audit row 28): one plain sentence + the fix command when it bites.
    process.stderr.write(
      `Stage-prompt classifier unavailable (${brokenReason}) — refusing to run a stage-shaped prompt unchecked; fix: node scripts/kit-update.cjs --adopt, then re-paste.\n`
    );
    process.exit(2);
  }

  const structure = classify(prompt);

  // Ad-hoc prompt (no stage-prompt structure) -> nothing to enforce.
  if (structure.state === 'none') process.exit(0);

  // A bare opening tag in prose is NOT a submitted prompt: an unclosed tag that carries no
  // real stage id is someone TALKING about a stage prompt. A truncated REAL prompt (whose
  // opening tag does carry a stage id) still gets enforced.
  if (structure.state === 'partial' && !structure.conformant) process.exit(0);

  // Positively identified as a stage prompt, but the structure is undecidable or
  // malformed. Fail closed with a diagnostic that cannot be mistaken for a role mismatch.
  if (structure.state === 'ambiguous' || structure.state === 'invalid') {
    const kind = structure.state === 'ambiguous' ? 'Ambiguous stage prompt' : 'Malformed stage prompt';
    // M30.I (audit row 28): one plain sentence + the fix when it bites.
    process.stderr.write(
      `${kind} (${structure.reason}) — not a role mismatch; fix: re-paste exactly one complete stage prompt (quoted examples go inside the prompt body).\n`
    );
    process.exit(2);
  }

  const declared = ROOT_TO_MODE[structure.root];
  if (!declared) process.exit(0); // unreachable while the lockstep holds; never guess a role

  const claudeDir = path.join(process.cwd(), '.claude');
  const res = readActiveMode(claudeDir);

  // FAIL CLOSED (ERR-002): a present-but-unresolvable role marker must block,
  // never silently default to 'work'. Absent is the lone legitimate -> 'work'.
  if (res.state === 'unresolved') {
    // M30.I (audit row 28): one plain sentence + the fix command (fail-closed, never assume work).
    process.stderr.write(
      `Mode undeterminable (.claude/role unresolvable: ${res.reason}) — fix: node scripts/set-mode.cjs ${declared}, then re-paste.\n`
    );
    process.exit(2);
  }

  const active = res.state === 'absent' ? 'work' : res.mode;

  if (declared === active) process.exit(0);

  // M30.I (audit row 28): one plain sentence + the fix command when it bites.
  process.stderr.write(
    `Mode mismatch — this is a ${declared} stage prompt but this session's role is "${active}"; fix: open a fresh ${declared} session and run node scripts/set-mode.cjs ${declared}, then re-paste.\n`
  );
  process.exit(2);
}

main();
