#!/usr/bin/env node
// @kit-version 1.0.4
// validators/validate-destructive-op.cjs
//
// The G12 destructive-op gate, shipped framework-wide so
// every generated project inherits it. The structural form of the destructive-op hard
// rule (tier-independent, alongside G1): every replace / import / restore / migrate /
// delete / extract is failure-safe BY CONSTRUCTION and is independently tested for BOTH
// rollback AND confinement — and the confinement test exercises a REAL hostile path. The
// exact false-green this kills: a destructive restore that proved rollback,
// had NO confinement, and shipped a zip-slip path-traversal because "rollback works" was
// read as "safe." rollback-passes != safe.
//
// THE MECHANICAL FLOOR:
//   When the staged set touches a DESTRUCTIVE SURFACE (a test-block name or a file
//   basename matching `restore|import|migrate|delete|replace|extract|unzip|backup`), the
//   set must carry BOTH:
//     • a ROLLBACK test  (a test whose name matches `rollback|revert|undo`), AND
//     • a CONFINEMENT test (a test whose name matches `confine|traversal|zip-slip|escape`)
//       whose body exercises a REAL escaping path — a `../`/`..\` segment, an encoded
//       traversal (`%2e`/`%2f`/`%5c`), or a symlink/realpath escape.
//   Missing the rollback test, missing the confinement test, OR a confinement test whose
//   path is a TOY (passes the keyword check but does not actually escape) → a blocking
//   finding. The two tests are INDEPENDENT (rollback != confinement) — that independence
//   is the whole point: a perfect rollback test does not satisfy confinement.
//
// FAIL CLOSED (the fail-closed-on-unknown-state lesson, now a named standard): when the
// staged-file enumeration (`git diff --cached`) fails, the gate exits NON-ZERO (2) and
// names the fail-closed reason — never a silent 0 that would skip the gate on an unknown
// staged set.
//
// HONEST LIMITATION — this gate is presence-gated + a KEYWORD-HEURISTIC (no false
// confidence; the same omission-escape class as G9's grandfather dodge, G10's presence-
// only Evidence cell, and the reconciliation gate's prose-count escape):
//   • A destructive op under an UNLISTED verb (a project-specific name for a destructive
//     surface) escapes the surface detector — the validator can only see the listed verbs.
//   • The hostile-path check is a TEXT heuristic: a confinement test whose path LOOKS
//     escaping (`../../etc/passwd`) satisfies the floor, but whether the code under test
//     ACTUALLY rejects that path — whether the confinement genuinely holds — is not judged
//     here. A test that references `../` but asserts nothing meaningful still passes the
//     static check.
//   The ADVERSARIAL half that closes both lives in Stage V's plan-challenge: the
//   fresh-context verifier confirms the confinement test exercises a GENUINELY escaping
//   path and that the surface actually confines it — applying the G9 test-honesty lens to
//   the destructive-op tests, and hunting destructive surfaces hiding under unlisted
//   verbs. The judgement a static validator structurally cannot make. Floor (this
//   validator) + adversary (Stage V) = a real gate; neither alone is.
//
// Severity / the toggle (mirrors test_honesty / reconciliation / risk_escalation,
// FRAMEWORK-CONFIG §4.17 severity model):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed staged-
//                      enumeration branch (exit 2) is NEVER downgraded by --warn.
//
// Usage:
//   node validators/validate-destructive-op.cjs [--warn] <test-file | source-file>...
//   node validators/validate-destructive-op.cjs [--warn] --staged
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (staged-enumeration error).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of
// the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CRLF (and lone CR) → LF so a Windows checkout doesn't read as a false divergence.
function normalize(s) {
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM — match validators/lib/fenced-block.cjs's normalize
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// The destructive-op surface verbs. Matched on test-block NAMES and
// file BASENAMES — NOT raw file content — so the ubiquitous JS `import` keyword in a
// module's import statements never false-triggers the surface (only a data-`import` TEST,
// or a file literally named for the surface, does). Deliberately non-exhaustive (the
// header's honest-limitation note); the adversary covers unlisted verbs.
const DESTRUCTIVE_RE = /\b(?:restore|import|migrate|delete|replace|extract|unzip|backup)\b/i;

// Rollback-test marker — a test that proves the op is undoable on failure.
const ROLLBACK_RE = /\b(?:rollback|roll-?back|revert|undo)\b/i;

// Confinement-test marker — a test that proves an untrusted path cannot escape the root.
const CONFINE_RE = /\b(?:confine(?:ment)?|traversal|zip-?slip|escapes?)\b/i;

// Hostile-path patterns: a REAL escaping path. A confinement test must exercise one of
// these — a toy path the confinement trivially passes is the theater test the gate exists
// to reject.
const HOSTILE_PATH_PATTERNS = [
  /\.\.[\\/]/,        // a `../` or `..\` traversal segment
  /%2e/i,             // encoded dot
  /%2f/i,             // encoded forward slash
  /%5c/i,             // encoded backslash
  /\bsymlink\b/i,     // a symlink-based escape
  /\brealpath\b/i,    // resolving a symlink that escapes
];

function isTestFile(f) {
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(f)) return true;            // foo.spec.ts / foo.test.js
  if (/(^|[\\/])(?:tests?|__tests__)[\\/].*\.[cm]?[jt]sx?$/.test(f)) return true; // tests/foo.js
  if (/(^|[\\/])test_[^\\/]*\.py$/.test(f) || /_test\.py$/.test(f)) return true;  // python
  return false;
}

// A SOURCE-CODE file (any stack). Basename-surface detection is gated to code files so a
// MARKDOWN doc whose name happens to contain a verb (e.g. `data-import-guide.md`) never
// false-triggers the destructive-op rule — only a code file named for the surface does.
function isCodeFile(f) {
  return /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|cc?|cpp|cxx|h|hpp|cs|php|swift|scala|sh|bash|sql)$/i.test(f);
}

// A file's BASENAME names a destructive surface — counted only for code files (a
// `restore.js` source with no accompanying tests is itself the tell; a doc is not).
function basenameSurface(f) {
  return isCodeFile(f) && DESTRUCTIVE_RE.test(path.basename(f));
}

// A file is in G12 scope if it is a test file OR a code file whose basename names a surface.
function inScope(f) {
  return isTestFile(f) || basenameSurface(f);
}

// Extract every it()/test() block as { name, slice } where slice is name + body (up to
// the next block, or EOF). CRLF-tolerant.
function extractBlocks(text) {
  const norm = normalize(text);
  const re = /\b(?:it|test)\s*\(\s*['"`]([^'"`]*)/g;
  const starts = [];
  let m;
  while ((m = re.exec(norm)) !== null) starts.push({ idx: m.index, name: m[1] });
  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].idx : norm.length;
    blocks.push({ name: starts[i].name, slice: norm.slice(starts[i].idx, end) });
  }
  return blocks;
}

// THE 2nd ENFORCEMENT POINT (G12 mutant target #2). A confinement test must
// exercise a REAL escaping path. Reverting this body to `return true` (any string counts
// as hostile) makes the "toy-path confinement → blocks" smoke check PASS → RED while the
// missing-test controls stay green. The mutation is killed specifically here.
function isHostilePath(text) {
  return HOSTILE_PATH_PATTERNS.some((re) => re.test(text));
}

// THE 1st ENFORCEMENT POINT (mutant targets #1 + #3). A destructive surface requires BOTH
// an independent rollback test AND an independent confinement test — the conjuncts below.
// Reverting the CONFINEMENT conjunct (`confinementRequired = false`) makes the
// "rollback-only → blocks" check PASS → RED (mutant #1). Reverting the ROLLBACK conjunct
// (`rollbackRequired = false`) makes the "confinement-only → blocks" check PASS → RED
// (mutant #3). rollback-passes != safe — the classic false-green.
const rollbackRequired = true;
const confinementRequired = true;

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
    process.stderr.write('usage: validate-destructive-op.cjs [--warn] <test-file | source-file>... | [--warn] --staged\n');
    process.exit(2);
  }

  // Aggregate the destructive-rule signals ACROSS the whole set — rollback and confinement
  // tests may live in independent files (no single fixture agreeing with itself).
  let anyDestructive = false;
  let hasRollbackTest = false;
  let hasConfinementTest = false;
  let hasConfinementWithHostile = false;
  const surfaces = new Set();
  const readErrors = [];

  for (const f of files) {
    if (basenameSurface(f)) {
      anyDestructive = true;
      const mm = path.basename(f).match(DESTRUCTIVE_RE);
      if (mm) surfaces.add(mm[0].toLowerCase());
    }
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      readErrors.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`);
      continue;
    }
    for (const block of extractBlocks(text)) {
      const dm = block.name.match(DESTRUCTIVE_RE);
      if (dm) { anyDestructive = true; surfaces.add(dm[0].toLowerCase()); }
      if (ROLLBACK_RE.test(block.name)) hasRollbackTest = true;
      if (CONFINE_RE.test(block.name)) {
        hasConfinementTest = true;
        if (isHostilePath(block.slice)) hasConfinementWithHostile = true;
      }
    }
  }

  const findings = [...readErrors];

  if (anyDestructive) {
    const where = surfaces.size ? ` (surface: ${[...surfaces].join(', ')})` : '';
    if (rollbackRequired && !hasRollbackTest) {
      findings.push(
        `destructive-op surface${where} has NO rollback test — a test whose name matches ` +
        `rollback/revert/undo proving the op is undoable on failure. Every destructive op is ` +
        `failure-safe by construction and independently tested for rollback (G12).`
      );
    }
    if (confinementRequired && !hasConfinementTest) {
      findings.push(
        `destructive-op surface${where} has NO confinement test — a test whose name matches ` +
        `confine/traversal/zip-slip/escape exercising a REAL hostile path (../, encoded, symlink). ` +
        `rollback != confinement: a rollback test alone does NOT satisfy G12 (the classic ` +
        `unconfined-restore false-green). Both independent tests are mandatory.`
      );
    } else if (hasConfinementTest && !hasConfinementWithHostile) {
      findings.push(
        `destructive-op surface${where} has a confinement test but it exercises only a TOY path ` +
        `(no ../ / encoded sequence / symlink that genuinely escapes the root). A confinement test ` +
        `must drive a REAL hostile path — a toy path the confinement trivially passes is the theater ` +
        `test G12 (and Stage V) exists to reject (canonicalize-then-confine).`
      );
    }
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} destructive-op finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} destructive-op finding(s) block this commit (G12 — failure-safe by construction: rollback AND confinement).\n`);
  process.exit(1);
}

// FAIL CLOSED: a `git diff --cached` failure must surface and exit
// non-zero with the fail-closed reason, never collapse to an empty staged set → silent
// PASS. "git ran, nothing staged" (empty stdout) is fine; "git failed" (throw) blocks.
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
      `      Refusing to pass the destructive-op gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter((f) => f && inScope(f));
}

main();
