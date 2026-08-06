#!/usr/bin/env node
// @kit-version 1.0.4
// validators/validate-retrospective.cjs
//
// Pre-commit gate for the user stamp in stage retrospectives.
//
// The retro axes are agent-authored — the agent grading its own work. The
// user-stamp is the one independent signal. Honor-system doesn't hold (it was
// the weakness the stamp exists to fix), so this validator makes the stamp
// mechanically required: a retro that reaches commit with an empty or missing
// stamp fails the gate.
//
// THE BINARY CUTOVER (A-15, M20.5.C). The stamp form is `verdict: pass|fail`
// (+ optional `note:`), replacing the 1–5 score — the owner does not discern
// 1–5, and the deliberation was pure tax. Semantics (the standing owner rule):
// default = pass ("if you do not see something to fix — or if I do not tell
// you to fix BEFORE proceeding — then it is pass"); fail only on an explicit
// owner fix/fail. An explicit `fail` is a VALID stamp (exit 0) that FORCES the
// Friction-heavy outcome (surfaced as a NOTE; PROCESS-VALIDATION carries the
// rule) — a fail is an owner signal, not a validation error.
//
// GRANDFATHER (history is never rewritten): retros predating the cutover keep
// their 1–5 stamps and validate under the LEGACY rules unchanged. The set is
// an explicit checked-in baseline — validators/retro-stamp-grandfather.json,
// path-exact, diff-visible (a file cannot join it silently), byte-deterministic
// (no git dependency in file mode or CI). Absent baseline (every generated
// project) → nothing grandfathered; new projects speak only the verdict form.
//
// What it checks, per retrospective file:
//   1. A ```user-stamp fenced block exists.
//   2. NEW FORM: a `verdict:` line that is exactly pass|fail (case-insensitive;
//      placeholders rejected; any other value rejected naming the two values).
//      `note:` is OPTIONAL — but a present note must be real (no placeholder,
//      no whitespace-only — DF-012).
//   3. A stamp carrying BOTH `score:` and `verdict:` is rejected as ambiguous.
//   4. `verdict: fail` → NON-blocking NOTE: outcome forced to Friction-heavy +
//      protocol iteration before the next stage (the human enforces the
//      routing; the validator surfaces it so it isn't missed).
//   5. GRANDFATHERED FILES ONLY: the legacy 1–5 rules apply unchanged (integer
//      score, non-placeholder note, the |user_score − axes-mean| ≥ 2 advisory).
//   6. THE CLOSEOUT CONSUMPTION GATE (M29.A half a). A CLOSEOUT retro (stage
//      letter E) must carry a typed ```human-drive fenced block — fields drove: /
//      verified: / recorded:, each non-blank and non-placeholder — WHEN THE GATE
//      ARMS: tier Full AND the spec carries the three-part IRL/HITL plan section
//      (detection shared with validators/validate-irl-plan.cjs via lib/irl-plan.cjs,
//      so the two halves can never disagree). The field finding this consumes
//      (2026-08-04): the spec's human-drive plan existed as an authored section
//      with NO consumer, so a milestone closed — green PR, valid stamp — with no
//      human ever running the app. The stamp only counts once the human's answers
//      are TYPED. Not armed (Lite / section-less spec / spec-less / no
//      project-config.md — the kit's own workshop tree) → a VISIBLE n/a NOTE on
//      each closeout retro, never a silent pass and never a workshop RED-loop.
//      Work-stage retros (A–D, R, V) are untouched — consumption is a closeout
//      contract. Detection is fence-structural (G9/G12), composing with the
//      user-stamp block, never replacing it.
//
// Usage:
//   node validators/validate-retrospective.cjs <retro-file> [<retro-file> ...]
//   node validators/validate-retrospective.cjs --staged    # all staged retro files
//
// Exit 0 = all good (advisories are not failures). Exit 1 = at least one file
// has a missing/empty/invalid stamp. Exit 2 = bad invocation.
//
// .cjs = always CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// EXTEND, DON'T FORK (M16.A / DF-023): the shared block-bound field reader. DF-012 — a
// whitespace-only `note:` slipped the "non-empty note" gate (the dead `length === 0` branch: the
// old `.+?` captured one space). The stamp block is read line-anchored and the note is read as a
// block-bound field with the shared blank check, so whitespace/placeholder is BLANK.
const { extractBlocks, fieldInBlock, isBlankValue } = require('./lib/fenced-block.cjs');
// M29.A: the shared IRL/HITL-plan detector — the consumption gate's arming check reads the
// SAME three-part detection the presence floor enforces (extend, don't fork).
const { detectParts, readProjectContext } = require('./lib/irl-plan.cjs');

const PLACEHOLDER = /\{\{.*\}\}/;

// The grandfather baseline (M20.5.C cutover). Repo-relative, forward-slash paths.
// Absent or unparseable → EMPTY set (generated projects grandfather nothing; the
// kit's own history is the only intended member set). Deliberately a checked-in
// explicit list, never a date/git heuristic — deterministic in file mode + CI,
// and a new file can only join it via a reviewable diff.
const REPO_ROOT = path.resolve(__dirname, '..');
function grandfatheredSet() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'retro-stamp-grandfather.json'), 'utf8'));
    return new Set(Array.isArray(j.files) ? j.files : []);
  } catch (_) {
    return new Set();
  }
}
function relKey(f) {
  return path.relative(REPO_ROOT, path.resolve(f)).split(path.sep).join('/');
}

// ERR-013: precise path discipline for which staged files are stage retros.
// The old `/retrospective/i` matcher over-matched: the *directory* segment
// `retrospectives/` made it fire on `retrospectives/audit/*` (audit outputs that
// carry the G_AUDIT_OUT caveat, NOT a user-stamp) and on `templates/*-RETROSPECTIVE-
// TEMPLATE.md` (placeholders, not a real retro) — forcing a logged `--no-verify`
// on every audit-mode commit and eroding the no-bypass discipline. Match ONLY a
// genuine stage retrospective: `retrospectives/M\d\d…-retrospective.md` — OR the
// bug_fix mode's `retrospectives/B\d…-retrospective.md` (UAT #14: the B01.A-named
// retro escaped this filter entirely, so the stamp gate never fired; the stated
// convention is M[NN].<X>, but the widened match is defense-in-depth) — directly
// under retrospectives/ (no audit/ subdir), and never under templates/.
function isStageRetroPath(f) {
  if (!f.endsWith('.md')) return false;
  if (/(^|\/)templates\//.test(f)) return false;            // a template, not a real retro
  if (/(^|\/)retrospectives\/audit\//.test(f)) return false; // audit output: G_AUDIT_OUT caveat, not a user-stamp
  return /(^|\/)retrospectives\/(M\d\d|B\d+)[^/]*-retrospective\.md$/.test(f);
}

// FAIL CLOSED (ERR-004): identical fix to the operating_mode validator — a git
// failure must surface and exit non-zero, never collapse to an empty list ->
// silent PASS. "git ran, nothing staged" (empty stdout) is fine; "git failed"
// (throw) blocks.
function stagedRetroFiles() {
  let out;
  try {
    out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown git error';
    process.stderr.write(
      `FAIL  cannot enumerate staged files via \`git diff --cached\`: ${detail}\n` +
      `      Refusing to pass the retrospective gate on an unknown staged set (fail-closed, ERR-004).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter(isStageRetroPath);
}

// ── M29.A: the closeout consumption gate ─────────────────────────────────────────────────
// A closeout retro is the .E stage letter, directly by basename — work stages (A–D, R, V)
// never carry the human-drive obligation.
function isCloseoutRetroPath(f) {
  return /\.E-retrospective\.md$/i.test(path.basename(f));
}

// Arming context, resolved ONCE per run against the invocation cwd (where pre-commit runs).
// Armed = tier Full AND the spec carries all three parts of the IRL/HITL plan. Anything
// else is a VISIBLE n/a: the reason is surfaced as a NOTE on each closeout retro checked —
// never a silent pass, and never a RED-loop on the kit's own workshop tree (which has no
// project-config.md and honestly claims no such surface).
let m29aArming = null;
function armingContext() {
  if (m29aArming) return m29aArming;
  const ctx = readProjectContext(process.cwd());
  if (!ctx.armed) {
    m29aArming = { armed: false, na: ctx.na };
  } else {
    const { missing } = detectParts(ctx.specText);
    m29aArming = missing.length === 0
      ? { armed: true }
      : {
          armed: false,
          na: `the spec's IRL/HITL plan is incomplete (missing part ${missing.map((p) => p.id).join('/')}) — ` +
              'that defect belongs to the presence floor (validate-irl-plan.cjs), not a second RED here',
        };
  }
  return m29aArming;
}

const HUMAN_DRIVE_FIELDS = ['drove', 'verified', 'recorded'];

function validateHumanDrive(file, text, errors, advisories) {
  if (!isCloseoutRetroPath(file)) return;
  const arm = armingContext();
  if (!arm.armed) {
    advisories.push(`${file}: human-drive consumption gate n/a — ${arm.na}.`);
    return;
  }
  const blocks = extractBlocks(text, 'human-drive');
  if (blocks.length === 0) {
    errors.push(
      `${file}: closeout is missing the \`\`\`human-drive block — the spec's IRL/HITL plan has a consumer now: ` +
      'the human\'s answers (drove: / verified: / recorded:) are TYPED here before the friction stamp counts (M29.A).'
    );
    return;
  }
  const body = blocks[0];
  for (const key of HUMAN_DRIVE_FIELDS) {
    const v = fieldInBlock(body, key);
    if (v === null) {
      errors.push(`${file}: human-drive block has no \`${key}:\` line — all three answers are required (drove / verified / recorded).`);
    } else if (PLACEHOLDER.test(v)) {
      errors.push(`${file}: human-drive \`${key}:\` is still a placeholder — an untyped answer is not an answer; type the real one.`);
    } else if (isBlankValue(v)) {
      errors.push(`${file}: human-drive \`${key}:\` is empty/whitespace — type the real answer (the DF-012 blank-value class).`);
    }
  }
}

// The shared note check: a present note must be real. Returns an error string or null.
function noteError(file, noteVal) {
  if (PLACEHOLDER.test(noteVal)) {
    return `${file}: user-stamp note is still the placeholder — replace it with one real sentence (or delete the note: line).`;
  }
  if (isBlankValue(noteVal)) {
    return `${file}: user-stamp note is empty/whitespace — fill it or delete the note: line (DF-012).`;
  }
  return null;
}

// LEGACY (grandfathered files only): the pre-cutover 1–5 rules, unchanged.
function validateLegacy(file, body, text, errors, advisories) {
  const scoreLine = body.match(/^\s*score:\s*(.+?)\s*$/m);
  let userScore = null;
  if (!scoreLine) {
    errors.push(`${file}: user-stamp has no \`score:\` line (legacy 1–5 form expected for this grandfathered retro).`);
  } else if (PLACEHOLDER.test(scoreLine[1])) {
    errors.push(`${file}: user-stamp score is still the {{1-5}} placeholder — fill in your score.`);
  } else if (!/^[1-5]$/.test(scoreLine[1])) {
    errors.push(`${file}: user-stamp score "${scoreLine[1]}" is not an integer 1-5.`);
  } else {
    userScore = parseInt(scoreLine[1], 10);
  }

  const noteVal = fieldInBlock(body, 'note');
  if (noteVal === null) {
    errors.push(`${file}: user-stamp has no \`note:\` line — add one sentence on the stage from your side.`);
  } else {
    const ne = noteError(file, noteVal);
    if (ne) errors.push(ne);
  }

  // Divergence advisory (pre-cutover records only — retired as the operative rule at M20.5.C).
  if (userScore !== null) {
    const axes = [...text.matchAll(/\*\*Score:\s*(\d)\s*\*\*/g)]
      .map((m) => parseInt(m[1], 10))
      .filter((n) => n >= 1 && n <= 5);
    if (axes.length >= 1) {
      const mean = axes.reduce((a, b) => a + b, 0) / axes.length;
      if (Math.abs(userScore - mean) >= 2) {
        advisories.push(
          `${file}: user score ${userScore} vs agent axis-mean ${mean.toFixed(1)} ` +
          `(|Δ| ≥ 2) → outcome must be Friction-heavy + protocol iteration before next stage (pre-cutover rule).`
        );
      }
    }
  }
}

// Returns { ok, errors:[], advisories:[] } for one file.
function validateFile(file, grandfathered) {
  const errors = [];
  const advisories = [];

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, errors: [`${file}: cannot read file`], advisories };
  }

  // 0. M29.A: the closeout consumption gate runs FIRST so its findings survive the stamp
  //    gate's early returns — the two compose; neither replaces the other.
  validateHumanDrive(file, text, errors, advisories);

  // 1. Locate the ```user-stamp fenced block (LINE-ANCHORED — M16.A; a mid-prose mention is
  //    not the stamp).
  const stampBodies = extractBlocks(text, 'user-stamp');
  if (stampBodies.length === 0) {
    errors.push(`${file}: missing \`\`\`user-stamp block — the required human stamp is absent. The agent does not fill this; you do.`);
    return { ok: false, errors, advisories };
  }
  const body = stampBodies[0];

  const verdictLine = body.match(/^\s*verdict:\s*(.+?)\s*$/m);
  const scoreLine = body.match(/^\s*score:\s*(.+?)\s*$/m);

  // 2. Ambiguity: one stamp, one form. Both present → rejected outright.
  if (verdictLine && scoreLine) {
    errors.push(`${file}: user-stamp carries BOTH \`verdict:\` and \`score:\` — ambiguous form. Keep \`verdict: pass|fail\` only.`);
    return { ok: false, errors, advisories };
  }

  // 3. Grandfathered history validates under the legacy rules, byte-untouched.
  if (grandfathered.has(relKey(file))) {
    validateLegacy(file, body, text, errors, advisories);
    return { ok: errors.length === 0, errors, advisories };
  }

  // 4. Post-cutover: the verdict form is the only form.
  if (!verdictLine) {
    if (scoreLine) {
      errors.push(
        `${file}: the 1–5 \`score:\` stamp was retired at the M20.5.C cutover — use \`verdict: pass|fail\` ` +
        `(+ optional note:). Pre-cutover retros are grandfathered via validators/retro-stamp-grandfather.json; ` +
        `new retros speak the verdict form.`
      );
    } else {
      errors.push(`${file}: user-stamp has no \`verdict:\` line — add \`verdict: pass\` or \`verdict: fail\`.`);
    }
    return { ok: false, errors, advisories };
  }

  const raw = verdictLine[1];
  if (PLACEHOLDER.test(raw)) {
    errors.push(`${file}: user-stamp verdict is still the {{pass|fail}} placeholder — replace it with your verdict.`);
  } else {
    const v = raw.trim().toLowerCase();
    if (v !== 'pass' && v !== 'fail') {
      errors.push(`${file}: user-stamp verdict "${raw}" is not valid — the only values are pass | fail.`);
    } else if (v === 'fail') {
      // An explicit owner fail is a VALID stamp that forces the routing (mut4's teeth).
      advisories.push(
        `${file}: explicit owner verdict: fail → outcome FORCED to Friction-heavy + protocol iteration ` +
        `before the next stage (PROCESS-VALIDATION, the A-15 rule).`
      );
    }
  }

  // 5. Optional note: present ⇒ real.
  const noteVal = fieldInBlock(body, 'note');
  if (noteVal !== null) {
    const ne = noteError(file, noteVal);
    if (ne) errors.push(ne);
  }

  return { ok: errors.length === 0, errors, advisories };
}

function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length === 1 && args[0] === '--staged') {
    files = stagedRetroFiles();
    if (files.length === 0) process.exit(0); // nothing staged to check
  } else if (args.length >= 1 && !args[0].startsWith('--')) {
    files = args;
  } else {
    process.stderr.write('usage: validate-retrospective.cjs <retro-file>... | --staged\n');
    process.exit(2);
  }

  const grandfathered = grandfatheredSet();
  let failed = 0;
  const allAdvisories = [];
  for (const f of files) {
    const { ok, errors, advisories } = validateFile(f, grandfathered);
    for (const e of errors) console.error(`FAIL  ${e}`);
    allAdvisories.push(...advisories);
    if (!ok) failed++;
  }
  for (const a of allAdvisories) console.error(`NOTE  ${a}`);

  if (failed > 0) {
    console.error(`\n${failed} retrospective file(s) failed the retrospective gate (user-stamp / human-drive). Fix the flagged block(s), then re-stage.`);
    process.exit(1);
  }
  process.exit(0);
}

main();
