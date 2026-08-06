#!/usr/bin/env node
// @kit-version 1.0.4
// validators/validate-test-honesty.cjs
//
// The G9 test-honesty gate, shipped framework-wide so every
// generated project inherits it. Two halves, both risk-tiered + incremental
// (keyed off the staged diff, not a blanket scan):
//
//   (a) SLOT REQUIREMENT — a v1.7+ (or BANNER-LESS) work-stage Phase
//       doc must carry a non-empty <test_honesty> slot for each work stage: either a
//       named mutation (the stage touches a risk/enforcement surface) or the explicit
//       `n/a` sentinel (a pure utility/doc stage). A SILENT OMISSION is the exact
//       tell — so the omission itself BLOCKS. Only an EXPLICIT pre-v1.7 banner
//       grandfathers a doc (a banner-LESS doc is CURRENT/must-comply,
//       no longer an escape); history is protected by --staged (changed-only) scoping,
//       never a retro-failing --all (see isInScope).
//
//   (b) ASSERTION HONESTY — a test that proves nothing must not ship green. A
//       test block (it(...) / test(...)) whose body contains no assertion CALL
//       (expect( / assert( / check( / .should / .toBe… / cy.…) is the assertion-
//       free / exception-only theater class → FLAGGED. Matched as call/member
//       patterns, never bare substrings, so a comment saying "assert" or the word
//       "expect" inside a string literal does not satisfy the check.
//
// Risk-tiered: the slot's CONTENT carries the risk distinction (mutation vs n/a);
// the gate never mandates a blanket mutation score (the cargo-cult the research
// warns against). Incremental: --staged keys off the staged set; the per-validator
// run only touches the files actually staged.
//
// HONEST LIMITATION — half (b) is presence-gated, same class as G10's presence-only
// Evidence cell and the reconciliation gate's prose-count escape (no false confidence):
//   • EFFECTIVENESS is not judged. A tautological assertion (`expect(1).toBe(1)`), an
//     always-matching snapshot, and a mock that asserts its OWN return value all PASS
//     this static heuristic — they contain an assertion CALL, so the assertion-free
//     check is satisfied, but they prove nothing. Presence of an assertion ≠ an
//     effective one. Whether a present test actually KILLS its named mutation is the
//     verifier's job (the `<test_honesty>` mutation is re-run in Stage V), exactly as
//     G10 (assembled-execution) and the count-reconciliation gate route effectiveness
//     to the adversary. Floor (this validator) + adversary (Stage V plan-challenge) =
//     a real gate; neither alone is.
//   • The assertion-honesty half is STACK-AWARE (closing the non-JS
//     stack gap): the evaluated set is JS/TS/JSX/TSX (the original it()/test()
//     detector + ASSERTION_PATTERNS), Python (`def test_*` + statement `assert` /
//     `self.assert*` / `pytest.raises`), Go (`func TestX(t *testing.T)` + `t.Error*/
//     t.Fatal*` / testify), and Rust (`#[test] fn` + `assert*!` macros) — extension-keyed
//     (a staged `.py` file IS Python; a config declaration can't dodge the gate, red
//     ruling D1). Comments are stripped per language first, so a comment saying "assert"
//     never satisfies the check. A RECOGNIZED test file outside the evaluated set (today:
//     Ruby `_spec/_test.rb`) emits a VISIBLE `assertion-honesty not evaluated for .<ext>`
//     note on stderr instead of passing unflagged-and-silent — the
//     note is NON-BLOCKING but ALWAYS printed. Half (a) — the slot requirement — is
//     language-agnostic and untouched.
//
// Severity / the toggle (test_honesty: block | warn, FRAMEWORK-CONFIG §4.17):
//   default (block, Full)    — any finding → exit 1.
//   --warn (warn, Standard)  — findings are advisory (NOTE), exit 0. The heuristic
//                              half (b) carries a residual false-positive rate, so
//                              the warn tier is the safety valve at Standard.
//
// Usage:
//   node validators/validate-test-honesty.cjs [--warn] <phase-doc.md | test-file>...
//   node validators/validate-test-honesty.cjs [--warn] --staged   # the staged set
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = at least one
// blocking finding. Exit 2 = bad invocation / fail-closed git error.
//
// .cjs = always CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// The protocol version that introduced <test_honesty>. A Phase doc with
// an EXPLICIT banner below this is grandfathered; a doc with NO banner is NOT (see
// isInScope — banner-less = current).
const TEST_HONESTY_VERSION = [1, 7];

// Assertion CALL / MEMBER patterns — the refinement that avoids substring theater
// (a comment that says "assert" or "expect" inside a string must NOT count). Each
// requires the call paren or member dot, never a bare word.
const ASSERTION_PATTERNS = [
  /\bexpect\s*\(/,
  /\bassert\s*[.(]/,
  /\bcheck\s*\(/,
  /\.should\b/,
  /\.to\.(?:be|equal|deep|have|throw|eql|include|exist|contain|match)\b/,
  /\bcy\.[a-zA-Z]/,
  /\.(?:toBe|toEqual|toStrictEqual|toThrow|toMatch|toContain|toHaveBeenCalled|toHaveLength|toBeNull|toBeDefined|toBeTruthy|toBeFalsy|toBeGreaterThan|toBeLessThan|resolves|rejects)\b/,
  /\bchai\b/,
];

function parseProtocolVersion(text) {
  const m = text.match(/Protocol version:\s*\**\s*v(\d+)\.(\d+)/i);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}
function gteVersion(a, b) {
  if (!a) return false;
  return a[0] !== b[0] ? a[0] > b[0] : a[1] >= b[1];
}

// BANNER-LESS = CURRENT — close the grandfather omission-escape, in lockstep with G13's
// validate-risk-matrix.cjs. A BANNER-LESS Phase doc is treated as CURRENT (must comply),
// NOT grandfathered; only an EXPLICIT pre-v1.7 banner (e.g. `**Protocol version:** v1.0`)
// exempts. History is NOT retro-failed because this validator runs on the CHANGED set
// only (--staged in the pre-commit), never --all over a repo's phase-doc history. THE
// BANNER-LESS MUTANT TARGET: reverting the `version === null` branch to `return false`
// (banner-less grandfathered again) makes the "banner-less doc missing the slot -> blocks"
// smoke test PASS → RED, while the controls (v1.7 in-scope, explicit-v1.0 grandfathered)
// stay green. See STAGE-PROMPT-PROTOCOL.md §10.
function isInScope(version, threshold) {
  if (version === null) return true;            // banner-less = current
  return gteVersion(version, threshold);        // explicit banner: exempt iff below threshold
}

function isPhaseDoc(f) {
  if (/(^|[\\/])docs[\\/]build-prompts[\\/]M\d{2}[^\\/]*\.md$/.test(f)) return true;
  // bug_fix mode phase docs live at docs/bugfix/<bug-id>.md — OUTSIDE the build-prompts
  // tree. UAT 2026-07 finding: scoping by the build-prompts path alone silently exempted
  // every instantiated bugfix doc from this gate, regardless of its protocol banner.
  return /(^|[\\/])docs[\\/]bugfix[\\/][^\\/]+\.md$/.test(f);
}
// Recognition covers the six-language evaluated set — JS/TS/JSX/TSX,
// Python, Go, Rust — plus the Ruby spec/test shapes, RECOGNIZED but not evaluated (they keep
// the visible skip; see noteNonJsSkip).
function isTestFile(f) {
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(f)) return true;          // foo.spec.ts / foo.test.js
  if (/(^|[\\/])(?:tests?|__tests__)[\\/].*\.[cm]?[jt]sx?$/.test(f)) return true; // tests/foo.js
  if (/(^|[\\/])test_[^\\/]*\.py$/.test(f) || /_test\.py$/.test(f)) return true;  // python
  if (/_test\.go$/.test(f)) return true;                              // go
  if (/(^|[\\/])tests?[\\/][^\\/]*\.rs$/.test(f)) return true;        // rust integration tests/
  if (/_(?:test|spec)\.rb$/.test(f)) return true;                     // ruby (recognized -> disclosed)
  return false;
}
// The per-language evaluation routing: JS/TS shapes go to the original detector;
// Python / Go / Rust get their own block detectors + assertion patterns (checkPyTests /
// checkGoTests / checkRustTests). A recognized test file in NONE of these (today: Ruby)
// is visibly skipped, never silent.
function isJsTsTestFile(f) {
  return /\.[cm]?[jt]sx?$/.test(f);
}
// THE EVALUATED-LANGUAGE TABLE. This table IS the routing — main()
// consumes it, so the exported coverage claim cannot diverge from what actually runs.
// Keys match validate-transition.cjs LANG_WRITE_CALLS (js covers TS/JSX/TSX via the
// extension routing); the stack_coverage manifest fact is derived from BOTH tables
// and refuses a one-sided extension. Evaluators are late-bound closures (the check
// functions are declared below).
const EVALUATED_LANGS = {
  js: { match: (f) => isJsTsTestFile(f), run: (f, text) => checkTestFile(f, text) },
  py: { match: (f) => /\.py$/.test(f), run: (f, text) => checkPyTests(f, text) },
  go: { match: (f) => /\.go$/.test(f), run: (f, text) => checkGoTests(f, text) },
  rs: { match: (f) => /\.rs$/.test(f), run: (f, text) => checkRustTests(f, text) },
};
function extOf(f) {
  const m = /\.([^.\\/]+)$/.exec(f);
  return m ? m[1] : '(no ext)';
}
// THE VISIBLE SKIP (mutant target). A recognized
// test file with NO per-language evaluation (today: Ruby; Python/Go/Rust graduated to real
// evaluation) gets this NON-BLOCKING-but-ALWAYS-PRINTED disclosure on stderr instead
// of a silent pass. Reverting this to a silent return (no write) turns the smoke
// "genuinely-other stack -> visibly noted" check RED while the evaluated controls stay green.
function noteNonJsSkip(file) {
  process.stderr.write(
    `skip  ${file}: assertion-honesty not evaluated for .${extOf(file)} ` +
    `(evaluated stacks: JS/TS/JSX-TSX, Python, Go, Rust). ` +
    `Non-blocking; the slot requirement (half (a)) still applies.\n`
  );
}

// ── per-language assertion evaluation ───────────────────────────────────────────────────
// Same contract as the JS detector: find each test BLOCK, flag any block containing no
// assertion CALL. Comments are stripped per language first, so a comment saying "assert"
// never satisfies the check (the substring-theater guard). Same honest limitation as the
// JS half: PRESENCE-gated — effectiveness stays the verifier's job.
function stripHashComments(text) { return text.replace(/#[^\n]*/g, ''); }
function stripSlashComments(text) { return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

// Python: a `def test_*(...)` block must contain a statement-position `assert`, a
// unittest `self.assert*(`, a `pytest.raises(`, or a mock `.assert_called*(`.
const PY_ASSERTION_PATTERNS = [
  /^\s*assert\b/m,
  /\bself\.assert\w+\s*\(/,
  /\bpytest\.raises\s*\(/,
  /\.assert_called\w*\s*\(/,
];
function checkPyTests(file, text) {
  const findings = [];
  const src = stripHashComments(text.replace(/\r\n?/g, '\n'));
  const blockRe = /(^|\n)[ \t]*def\s+(test_\w+)\s*\(/g;
  const starts = [];
  let m;
  while ((m = blockRe.exec(src)) !== null) starts.push({ idx: m.index, name: m[2] });
  for (let i = 0; i < starts.length; i++) {
    const slice = src.slice(starts[i].idx, i + 1 < starts.length ? starts[i + 1].idx : src.length);
    if (!PY_ASSERTION_PATTERNS.some((re) => re.test(slice))) {
      findings.push(`${file}: test "${starts[i].name}" has no assertion (assert / self.assert* / pytest.raises) — an assertion-free test proves nothing (the assertion-free theater class).`);
    }
  }
  return findings;
}

// Go: a `func TestX(t *testing.T)` block must contain a t-failure call (t.Error/t.Errorf/
// t.Fatal/t.Fatalf/t.Fail/t.FailNow) or a testify assert./require. call. The if-err +
// t.Fatalf idiom therefore PASSES — error handling is Go's assertion shape, not noise.
const GO_ASSERTION_PATTERNS = [
  /\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b/,
  /\b(?:assert|require)\.\w+\s*\(/,
];
function checkGoTests(file, text) {
  const findings = [];
  const src = stripSlashComments(text.replace(/\r\n?/g, '\n'));
  const blockRe = /\bfunc\s+(Test\w*)\s*\(\s*\w+\s+\*testing\.[TB]\s*\)/g;
  const starts = [];
  let m;
  while ((m = blockRe.exec(src)) !== null) starts.push({ idx: m.index, name: m[1] });
  for (let i = 0; i < starts.length; i++) {
    const slice = src.slice(starts[i].idx, i + 1 < starts.length ? starts[i + 1].idx : src.length);
    if (!GO_ASSERTION_PATTERNS.some((re) => re.test(slice))) {
      findings.push(`${file}: test "${starts[i].name}" has no t.Error/t.Fatal/assert call — an assertion-free test proves nothing (the assertion-free theater class).`);
    }
  }
  return findings;
}

// Rust: a `#[test]` fn must contain an assert-family macro (assert!/assert_eq!/assert_ne!/
// debug_assert*!). An unwrap-only test is the exception-only theater class and is flagged.
// The `match` idiom passes when its arms assert; `write!` is formatting, never matched.
const RS_ASSERTION_RE = /\bassert\w*!\s*\(/;
function checkRustTests(file, text) {
  const findings = [];
  const src = stripSlashComments(text.replace(/\r\n?/g, '\n'));
  const blockRe = /#\[test\]\s*(?:#\[[^\]]*\]\s*)*(?:pub\s+)?fn\s+(\w+)/g;
  const starts = [];
  let m;
  while ((m = blockRe.exec(src)) !== null) starts.push({ idx: m.index, name: m[1] });
  for (let i = 0; i < starts.length; i++) {
    const slice = src.slice(starts[i].idx, i + 1 < starts.length ? starts[i + 1].idx : src.length);
    if (!RS_ASSERTION_RE.test(slice)) {
      findings.push(`${file}: test "${starts[i].name}" has no assert!/assert_eq! macro — an assertion-free / unwrap-only test proves nothing (the assertion-free theater class).`);
    }
  }
  return findings;
}

// THE ENFORCEMENT POINT (mutant target). Reverting this to `return false`
// (the no-op / RED stub) turns the "missing slot -> BLOCKS" smoke check RED while
// the controls stay green — the mutation is killed specifically here.
function requiresTestHonesty(rootTag, docVersion) {
  return rootTag === 'work_stage_prompt' && isInScope(docVersion, TEST_HONESTY_VERSION);
}

function extractXmlBlocks(content) {
  const re = /```xml\r?\n([\s\S]*?)\r?\n```/g;
  const blocks = [];
  let m;
  while ((m = re.exec(content)) !== null) blocks.push(m[1]);
  return blocks;
}
function rootTagOf(xml) {
  const m = /^\s*<(\w+)[\s>]/m.exec(xml);
  return m ? m[1] : null;
}
function idOf(xml) {
  const m = /\bid=["']([^"']*)["']/.exec(xml);
  return m ? m[1] : '?';
}

// Findings for one Phase doc: each in-scope work stage must carry a valid slot.
function checkPhaseDoc(file, text) {
  const findings = [];
  const version = parseProtocolVersion(text);
  if (!isInScope(version, TEST_HONESTY_VERSION)) return findings; // grandfathered (explicit pre-v1.7 banner only)
  for (const block of extractXmlBlocks(text)) {
    const root = rootTagOf(block);
    if (!requiresTestHonesty(root, version)) continue;
    const id = idOf(block);
    const slot = block.match(/<test_honesty>([\s\S]*?)<\/test_honesty>/);
    if (!slot) {
      findings.push(`${file}: <${root} id="${id}"> missing required <test_honesty> — a v1.7+ work stage must declare a mutation-killing test or the explicit \`n/a — no risk surface\` sentinel. A silent omission is the tell.`);
      continue;
    }
    const body = slot[1].trim();
    if (body.length === 0) {
      findings.push(`${file}: <${root} id="${id}"> has an empty <test_honesty> — name the mutation (or \`n/a — no risk surface\`).`);
    } else if (/\{\{.*\}\}/.test(body)) {
      findings.push(`${file}: <${root} id="${id}"> <test_honesty> is still a {{placeholder}} — fill in the mutation or \`n/a\`.`);
    }
  }
  return findings;
}

// Findings for one test file: each it()/test() block must contain an assertion call.
//
// COMMENTS STRIPPED FIRST (M26.B / KF-31) — the JS/TS path was the ONE evaluated language
// reading raw text while checkPyTests / checkGoTests / checkRustTests all stripped, which is
// exactly the substring-theater guard those three carry. Both directions were live:
//   • FAIL-OPEN (the serious half): an assertion-free test whose comment merely MENTIONS
//     `expect(` satisfied ASSERTION_PATTERNS and passed — the validator certified an
//     assertion-free test as honest. Confirmed on shipped bytes by the T3b run; ledgered
//     as KF-44 because it shipped, not because it survived.
//   • FALSE-FLAG: a commented-out `it(` was scanned as a live test block and reported.
// Stripping fixes both, and makes the four language paths one rule instead of three-plus-one.
function checkTestFile(file, text) {
  const findings = [];
  const src = stripSlashComments(text.replace(/\r\n?/g, '\n'));
  const blockRe = /\b(?:it|test)\s*\(/g;
  const starts = [];
  let m;
  while ((m = blockRe.exec(src)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const slice = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
    const hasAssertion = ASSERTION_PATTERNS.some((re) => re.test(slice));
    if (!hasAssertion) {
      const nameM = /\b(?:it|test)\s*\(\s*['"`]([^'"`]*)/.exec(slice);
      const name = nameM ? nameM[1] : '(unnamed)';
      findings.push(`${file}: test "${name}" has no assertion call (expect(/assert(/check(/.should/.toBe…) — an assertion-free / exception-only test proves nothing (the assertion-free theater class).`);
    }
  }
  return findings;
}

// FAIL CLOSED: a git failure must surface and exit non-zero, never
// collapse to an empty staged set -> silent PASS. "git ran, nothing staged" (empty
// stdout) is fine; "git failed" (throw) blocks.
function stagedFiles() {
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
      `      Refusing to pass the test-honesty gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter((f) => f && (isPhaseDoc(f) || isTestFile(f)));
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const positional = args.filter((a) => !a.startsWith('--'));

  let files;
  if (args.includes('--staged')) {
    files = stagedFiles();
    if (files.length === 0) process.exit(0); // nothing relevant staged
  } else if (positional.length >= 1) {
    files = positional;
  } else {
    process.stderr.write('usage: validate-test-honesty.cjs [--warn] <phase-doc.md | test-file>... | [--warn] --staged\n');
    process.exit(2);
  }

  const findings = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      // A counted finding, not an uncaught mid-list crash.
      findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`);
      continue;
    }
    if (isPhaseDoc(f)) findings.push(...checkPhaseDoc(f, text));
    else if (isTestFile(f)) {
      // Per-language routing — driven by the EVALUATED_LANGS table
      // (the table is both the routing and the exported coverage
      // claim). A recognized test file in no table row (today: Ruby) is VISIBLY
      // noted as not-evaluated, never a silent pass.
      const lang = Object.keys(EVALUATED_LANGS).find((k) => EVALUATED_LANGS[k].match(f));
      if (lang) findings.push(...EVALUATED_LANGS[lang].run(f, text));
      else noteNonJsSkip(f);
    }
    // other files: not in G9 scope, skipped silently.
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} test-honesty finding(s) (advisory — test_honesty: warn). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} test-honesty finding(s) block this commit (G9). Fix or run under test_honesty: warn.\n`);
  process.exit(1);
}

// Export the evaluated-language table for the stack_coverage derivation. The
// require.main guard makes the module require-safe — before it, a bare
// require() executed main() against the requirer's argv.
module.exports = { EVALUATED_LANGS };

if (require.main === module) main();
