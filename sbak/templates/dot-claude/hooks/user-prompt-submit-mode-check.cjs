#!/usr/bin/env node
// @kit-version 1.0.2
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
//                                             new active-mode value)
//   partial   -> an unclosed opening tag. ENFORCED when the tag is grammar-conformant
//                (it carries a real stage id — a truncated REAL prompt); treated as ad-hoc
//                when it is not (a bare tag in prose).
//   ambiguous -> two grammar-conformant roots of different kinds submitted together:
//                which one is being run is undecidable -> BLOCK with that diagnostic.
//   invalid   -> positively a stage prompt but malformed (crossed spans) -> BLOCK.
// A <mode> annotation is NOT a stage root and is never consulted: it may agree with the
// structure but can never override it (the C1-001 evasion).
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
//   2  -> block: a real mode mismatch, an ambiguous or malformed stage prompt, a
//         present-but-unresolvable active-mode (fail-closed, ERR-002), or an
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
    process.stderr.write(
      `\nStage-prompt classifier unavailable — prompt not run (fail-closed).\n` +
      `  ${brokenReason}\n` +
      `  This prompt looks like a stage prompt, and the role guard cannot classify it.\n` +
      `  Refusing to run it unchecked — that would silently disable the 3-brain bias guard.\n\n` +
      `  Fix: reinstall the enforcement wiring, then re-paste:\n` +
      `    node scripts/kit-update.cjs --adopt\n\n`
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
    process.stderr.write(
      `\n${kind} — prompt not run.\n` +
      `  ${structure.reason}\n` +
      `  This is NOT a role mismatch: the session role was never consulted, because the\n` +
      `  prompt's own structure could not be resolved to a single stage prompt.\n\n` +
      `  Fix: re-paste exactly one complete stage prompt (quoted examples belong inside the\n` +
      `  prompt body, or in a fenced block in the Phase doc — not beside the root).\n\n`
    );
    process.exit(2);
  }

  const declared = ROOT_TO_MODE[structure.root];
  if (!declared) process.exit(0); // unreachable while the lockstep holds; never guess a role

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
