#!/usr/bin/env node
// @kit-version 1.0.8
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

// THE REPO-ROOT RESOLVER (M32.A, §3.1). This hook had TWO cwd anchors - the stamp/send paths
// read payload.cwd, the role read that decides the mismatch read process.cwd() - so a verifier
// session that cd'd into a subfolder found no .claude/role there and accepted a work prompt.
// Both anchors now read the root hook-root.cjs resolves (walk up from the payload cwd to a
// `.git` directory or worktree file, then CLAUDE_PROJECT_DIR, then the start dir). The require
// is load-bearing like the classifier's: a guard that cannot find its resolver must not
// quietly fall back to the anchor that failed. The shared stdin reader and decoder ride it.
const hookRoot = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'hook-root.cjs'));
const { decodeBytes } = hookRoot;

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

// (The bounded stdin read - IPC-001, a defensive ceiling so a pathological stream cannot hang
// the prompt path - is hook-root.cjs's readStdinBounded since M32.A; one copy, every hook.)

function getPrompt(raw, payload) {
  // UserPromptSubmit delivers a JSON payload with a `prompt` field. If parsing
  // failed for any reason, fall back to treating the raw input as the prompt.
  if (payload && typeof payload.prompt === 'string') return payload.prompt;
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

// The mode file is decoded across encodings by hook-root.cjs's decodeBytes (PowerShell `>`
// writes UTF-16LE+BOM; Set-Content may add a UTF-8 BOM; Unix writes plain UTF-8). That
// BOM-decode + the NUL-strip in strictToken are the REAL ERR-002 root (a UTF-16/BOM file read
// as naive utf8 never matched the literal word, so Windows silently fell back to `work`).
// Keep them — the P#29 regression tests are the wall.

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
function stampPresent(root, sessionId) {
  let receipts;
  try { receipts = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'receipts.cjs')); }
  catch (_) { return 'unchecked'; }
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId)) return 'unchecked';
  const dir = path.join(root, '.claude', 'receipts');
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
    return 'missing';
  }
  // M32.I (KF-62): NO session_started for this session in either file. When the project's
  // settings register the read-first hook on SessionStart, the session can only have missed it by
  // starting before the hooks existed - the fresh-install session, whose SessionStart ran before
  // the installer wrote them - so it could never have been stamped: exempt with the note. With
  // SessionStart unwired it is the row-2 case (the hook layer is not wired) and still blocks.
  return sessionStartWired(root) ? 'pre-upgrade' : 'missing';
}

// M32.1.B (drive note 8b; gate-1 Q3): a session that STARTED with no role in a bootstrapped
// project is refused, every prompt, with the set-mode line its SessionStart stamp printed. All
// three must hold: .claude/role is absent; project-config.md is present; this session's own
// orientation stamps exist and none carries a resolved role. The stamps are the discriminator,
// never the directory alone - the bootstrap session writes project-config.md at Phase 1 and runs
// on role-less (its stamp says work), the KF-62 installer session has no stamp at all, and a
// session with no id or no receipts contract cannot be read: all three keep the work default.
// M32.1.C (V-14, R-40; clarification 1, orchestrator seq 123): the fourth condition - the bootstrap
// has ENDED - is decided ONCE, by the SessionStart hook's probe, and reaches this hook through the
// stamp it records: a new window mid-bootstrap is stamped role=work, so it is never refused here.
// One decision with one record: the stamp and the prompt agree by construction (CFI-05).
// V-29: the line opens with a deliberate-stop phrase (drive note 13).
const NO_ROLE_LINE = 'Stopped on purpose: this window has no role yet. Run node scripts/set-mode.cjs <orchestrator|work> and reopen this window.';
function startedWithoutRole(root, claudeDir, sessionId) {
  if (readActiveMode(claudeDir).state !== 'absent') return false;
  if (!fs.existsSync(path.join(root, 'project-config.md'))) return false;
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId)) return false;
  let receipts;
  try { receipts = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'receipts.cjs')); } catch (_) { return false; }
  const f = path.join(root, '.claude', 'receipts', `events-${sessionId}.jsonl`);
  if (!fs.existsSync(f)) return false;
  const stamps = receipts.readLedger(f, { maxBytes: 1 << 20 }).events.filter((e) => e.event === 'orientation_stamped');
  return stamps.length > 0 && !stamps.some((e) => VALID_MODES.includes(e.role));
}

// M32.1.B (V-2, MC-3; R-36 and gate-1 Q2): this hook stays cwd-first - a prompt has no path to
// anchor on - and cross-checks the repo the session STARTED in (CLAUDE_PROJECT_DIR, "the project
// root where the session started"). When the two roots disagree on the role, a stage prompt is
// refused naming both: a verifier session whose shell sits in a sibling work tree must not run a
// work stage there. Prose is never refused for it - the shell's cwd persists across Bash calls,
// so a session that wandered into a sibling worktree has to be able to talk its way back.
function sameDir(a, b) {
  const x = path.resolve(a); const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function roleOf(claudeDir) {
  const r = readActiveMode(claudeDir);
  return r.state === 'absent' ? 'work' : (r.state === 'unresolved' ? 'unresolved' : r.mode);
}
function startRootConflict(root, claudeDir) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (typeof env !== 'string' || !env) return null;
  try { if (!fs.statSync(env).isDirectory()) return null; } catch (_) { return null; }
  const startRoot = hookRoot.repoRoot({ cwd: env });
  if (sameDir(startRoot, root)) return null;
  const here = roleOf(claudeDir);
  const there = roleOf(path.join(startRoot, '.claude'));
  return here === there ? null : { here, there, startRoot };
}

// The project-scope settings files register the read-first hook on SessionStart (parsed
// registrations, never a string search over the file - a metadata mention counts for nothing).
function sessionStartWired(root) {
  for (const name of ['settings.json', 'settings.local.json']) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(path.join(root, '.claude', name), 'utf8')); } catch (_) { continue; }
    const groups = parsed && parsed.hooks && Array.isArray(parsed.hooks.SessionStart) ? parsed.hooks.SessionStart : [];
    for (const g of groups) {
      for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
        if (h && h.type === 'command' && typeof h.command === 'string' && /session-start-read-first\.cjs/.test(h.command)) return true;
      }
    }
  }
  return false;
}

function main() {
  // M32.A: ONE anchor for the whole hook - the repo root hook-root.cjs resolves from the payload
  // cwd (walk-up to `.git`), never the session cwd a Bash `cd` has moved. Both the stamp/send
  // paths below and the role read that decides the mismatch use this `root`.
  const { raw, payload, root, claudeDir } = hookRoot.readHookInput();
  const prompt = getPrompt(raw, payload);
  const stamp = stampPresent(root, payload && payload.session_id);
  if (stamp === 'missing') {
    process.stderr.write('[read-first stamp] missing - the SessionStart hook did not run here; start a new session (it stamps itself), or run node scripts/kit-update.cjs --adopt first if the hook layer was never installed.\n');
    process.exit(2);
  }
  if (stamp === 'pre-upgrade') {
    process.stderr.write('[read-first stamp] n/a - this session started before the stamp hook existed (a pre-upgrade or fresh-install session); a new session will stamp normally.\n');
  }
  if (stamp === 'unchecked') {
    process.stderr.write('[read-first stamp] not checked - the receipts contract (scripts/lib/receipts.cjs) or a session id is absent here.\n');
  }
  if (startedWithoutRole(root, claudeDir, payload && payload.session_id)) {
    process.stderr.write(NO_ROLE_LINE + '\n');
    process.exit(2);
  }

  // THE /send KEYSTROKE (M30.H, the terminal channel). The human typed /send in this terminal:
  // under role=orchestrator the hook stamps a one-shot token that `node scripts/channel.cjs send`
  // consumes - the keystroke is the adjudication record and the hook, not the agent, is the writer
  // of that record. Any other role is blocked in one line: only the orchestrator sends; builder
  // packets publish automatically. (The fence's ask rule on the send command is the other gate;
  // this token is the zero-click one when the raw line reaches the hook.)
  if (/^\s*\/send\b/.test(prompt)) {
    const sres = readActiveMode(claudeDir);
    const srole = sres.state === 'absent' ? 'work' : (sres.state === 'unresolved' ? 'unresolved' : sres.mode);
    if (srole !== 'orchestrator') {
      process.stderr.write(`channel: /send is the orchestrator's keystroke (this session's role is ${srole}) - only the orchestrator sends; builder packets publish automatically at surface time.\n`);
      process.exit(2);
    }
    try {
      const dir = path.join(claudeDir, 'channel');
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

  // M32.1.B (MC-3): the shell's repo and the session's start repo disagree on the role - refuse
  // the stage prompt, naming both (fail closed, R-36).
  const conflict = startRootConflict(root, claudeDir);
  if (conflict) {
    process.stderr.write(
      `Role conflict - this is a ${declared} stage prompt, but this session's shell is in ${root} (role ${conflict.here}) and the session started in ${conflict.startRoot} (role ${conflict.there}); fix: run the stage from a session opened in its own worktree, then re-paste.\n`
    );
    process.exit(2);
  }

  // (claudeDir is the resolved root's .claude - the second cwd anchor this hook carried until
  //  M32.A read process.cwd() here, so a cd'd verifier session resolved to `work` and passed.)
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
