#!/usr/bin/env node
// @kit-version 0.2.0
// validators/validate-calibration.cjs
//
// The G14 verifier-proof gate, shipped framework-wide so
// every generated project inherits it. The adversary-side analog of G9's mutation-kill: where
// the FLOOR is proven falsifiable (mutate a validator → a test goes RED), this gate proves the
// ADVERSARY falsifiable (seed a known defect → the verifier's plan-challenge must flag it).
// Grounded in defect-seeding / bebugging + LLM-as-judge meta-evaluation (the FNR against a
// known-answer set).
//
// ── THE HONEST LOCUS (non-negotiable — no false confidence) ────────────────────────────────
//   This validator is the STATIC FLOOR ONLY. It proves the calibration HARNESS is PRESENT +
//   WIRED:
//     • the calibration set exists and SHADOWS the full §8.5 catalog (one fixture per class),
//     • every fixture carries a SEALED ground-truth label (labels/<class>.label.md),
//     • the seal holds (a fixture does NOT contain its own answer token), and
//     • a "Sound" verifier-findings file RECORDS a calibration-result block (seeds caught / FNR).
//   It does NOT — and structurally CANNOT — prove the verifier actually CAUGHT the seeds. THE
//   CATCH IS AGENT JUDGMENT, recorded at V-time as the FNR (false-negative rate) — you can't run
//   a judge in a pre-commit smoke test, so the catch is NOT a pre-commit check. Conflating
//   "the harness is present" with "the verifier caught the seeds" is the exact presence-≠-
//   effectiveness theater these gates exist to kill. Floor (this validator, present + wired) + adversary
//   (the V-run FNR) = a real gate; neither alone is. See prompts/calibration/README.md.
//
// ── THE MECHANICAL FLOOR ───────────────────────────────────────────────────────────────────
//   --set <dir>  (the calibration set, default prompts/calibration/):
//     • COVERAGE (from fixture FILENAMES): every catalog class in REQUIRED_CLASSES has a
//       fixtures/<class>.md. A missing class → finding (the set must shadow the WHOLE catalog;
//       a partial set — a fifth of it — cannot pass). This is the FORWARD half (list → fixture).
//     • --catalog <STAGE-PROMPT-PROTOCOL.md> adds the REVERSE half: the §8.5
//       numbered catalog is COUNTED and must equal the shadowed class count, so a new §8.5 hunt
//       with no fixture is FLAGGED. With both halves the set and the §8.5 catalog cannot silently
//       drift apart in EITHER direction (without --catalog only the forward half runs).
//     • THE GROUND-TRUTH-LABEL REQUIREMENT (the mutant target, see fixtureMissingLabel): every
//       fixture carries labels/<base>.label.md with `expected: must-flag` + a `class:`.
//     • SEALING: a fixture that contains its own answer token (`expected:` / `must-flag`) →
//       seal-broken finding (the verifier would read the answer; FNR=0 would prove nothing).
//   <findings-file>...  (or --staged over *-findings.md):
//     • a file asserting a "Sound" verdict with NO fenced ```calibration block (seeds / FNR) →
//       finding. FNR unrecorded = the verifier-proof never ran for this milestone → untrusted.
//
// Severity / the toggle (mirrors test_honesty / risk_matrix, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed branches (exit 2 —
//                      an unreadable fixture / a git-enumeration error) are NEVER downgraded.
//
// Usage:
//   node validators/validate-calibration.cjs [--warn] --set <dir> [--catalog <protocol.md>]  # check the set (+ reverse binding)
//   node validators/validate-calibration.cjs [--warn] <findings.md>...     # check findings files
//   node validators/validate-calibration.cjs [--warn] --staged             # staged set + findings
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (unreadable fixture, git-enumeration error).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of the host
// project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// EXTEND, DON'T FORK: the shared line-anchored, block-bound extractor. The unanchored-presence
// defect runs in BOTH directions, closed here at the primitive: the
// verdict is read from a line-START field (not a quoted mention) and the calibration record from
// a real ```calibration block's BODY (not a decoy fence + a stray prose FNR).
const { extractBlocks, normalize } = require('./lib/fenced-block.cjs');

// The 11 escape classes — the SHADOW of STAGE-PROMPT-PROTOCOL.md §8.5 (the canonical source).
// The first 10 are 1:1 with the §8.5 numbered enumeration; the 11th (non-covering-test) is the
// G13-floor gap the prior stages owe C. Coverage of ALL of these is what makes FNR=0 prove the
// WHOLE catalog, not a fifth of it.
const REQUIRED_CLASSES = [
  'false-na', 'prose-dodge-count', 'assert-a-constant', 'forged-ledger',
  'stub-passes-assembled', 'under-declared-trigger', 'toy-path-confinement',
  'bare-startswith', 'dropped-fence-caveat', 'gate-contract-skipped', 'non-covering-test',
];

// Classes in REQUIRED_CLASSES that are NOT in §8.5's numbered enumeration — owed extras the
// prior stages added beyond the catalog (today: the G13-floor `non-covering-test` gap). The
// §8.5 numbered catalog therefore shadows REQUIRED_CLASSES MINUS these.
const OWED_EXTRA = ['non-covering-test'];
const EXPECTED_CATALOG_COUNT = REQUIRED_CLASSES.length - OWED_EXTRA.length;

// The SEAL: an answer token must NEVER appear in a fixture — the verdict lives only in labels/.
const ANSWER_TOKEN = /expected:|must-flag/i;

function classOf(fixtureName) { return fixtureName.replace(/\.md$/i, ''); }

// FAIL CLOSED: refuse to pass on an unknown set / unreadable fixture.
function failClosed(msg) {
  process.stderr.write(`FAIL  ${msg}\n      Refusing to pass the calibration gate on an unknown set (fail-closed).\n`);
  process.exit(2);
}

// THE MUTANT TARGET. Every seeded fixture MUST carry a sealed ground-truth
// label. Reverting this to `return []` ("any file in the set passes") makes the "unlabeled
// fixture -> flagged" smoke test go RED while coverage (computed from filenames) stays
// satisfied — the mutation isolates EXACTLY the label requirement (no second finding survives).
function fixtureMissingLabel(labelsDir, fixtureName) {
  const base = classOf(fixtureName);
  const labelPath = path.join(labelsDir, `${base}.label.md`);
  let lb;
  try {
    lb = fs.readFileSync(labelPath, 'utf8');
  } catch (_) {
    return [`fixtures/${fixtureName} has NO ground-truth label (labels/${base}.label.md) — every seeded fixture MUST carry a sealed must-flag label (G14).`];
  }
  if (!/expected:\s*must-flag/i.test(lb) || !/\bclass:\s*\S/i.test(lb)) {
    return [`labels/${base}.label.md is incomplete — a sealed ground-truth label needs \`expected: must-flag\` and a \`class:\` (G14).`];
  }
  return [];
}

// Check a calibration set: coverage (from filenames) + the label requirement + sealing.
// Fail-closed (exit 2) on an unenumerable fixtures dir or an unreadable fixture.
function checkSet(setDir) {
  const findings = [];
  const fixturesDir = path.join(setDir, 'fixtures');
  const labelsDir = path.join(setDir, 'labels');

  let names;
  try {
    names = fs.readdirSync(fixturesDir).filter((n) => /\.md$/i.test(n));
  } catch (e) {
    failClosed(`cannot enumerate calibration fixtures at ${fixturesDir}: ${e && e.message ? e.message : 'unknown error'}`);
  }

  const covered = new Set();
  for (const n of names) {
    let fx;
    try {
      fx = fs.readFileSync(path.join(fixturesDir, n), 'utf8');
    } catch (e) {
      failClosed(`unreadable calibration fixture fixtures/${n}: ${e && e.message ? e.message : 'unknown error'}`);
    }
    covered.add(classOf(n));
    // SEALING — the answer must not live in the fixture the verifier reads.
    if (ANSWER_TOKEN.test(fx)) {
      findings.push(`fixtures/${n} CONTAINS its own ground-truth answer (\`expected:\` / \`must-flag\`) — the seal is broken; the verifier would read the answer. Keep the verdict in labels/${classOf(n)}.label.md only (G14 sealing).`);
    }
    // THE GROUND-TRUTH-LABEL REQUIREMENT (mutant target).
    findings.push(...fixtureMissingLabel(labelsDir, n));
  }

  // COVERAGE of the WHOLE catalog (from filenames), so the omitted-label case above does not
  // also drop a class (that would let the mutation survive via a second finding).
  for (const cls of REQUIRED_CLASSES) {
    if (!covered.has(cls)) {
      findings.push(`${setDir}: calibration set does not cover escape class '${cls}' — the set must shadow the full §8.5 catalog (one fixture per class). FNR=0 must prove the WHOLE catalog.`);
    }
  }

  return findings;
}

// THE REVERSE (BIDIRECTIONAL) BINDING. checkSet above pins list -> §8.5 + fixture
// (forward, via REQUIRED_CLASSES + the smoke shadow). Nothing bound the REVERSE: a NEW numbered
// hunt added to §8.5 with no fixture / REQUIRED_CLASSES entry tripped nothing, so catalog GROWTH
// slipped silently — FNR=0 would then stop proving the WHOLE catalog (the exact representativeness
// invariant G14 rests on). This counts the §8.5 numbered enumeration and requires it equal the
// shadowed class count (REQUIRED_CLASSES minus the owed extras), so a §8.5 that grows or shrinks
// without the set + REQUIRED_CLASSES moving in lockstep is FLAGGED. The set and the catalog now
// cannot silently drift apart in EITHER direction.
function catalogNumberedCount(protocolText) {
  const norm = protocolText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const idx = norm.search(/standing escape catalog/i);
  if (idx === -1) return null; // can't locate the canonical catalog — caller fails LOUD
  let count = 0, started = false;
  for (const line of norm.slice(idx).split('\n')) {
    if (/^\s*\d+\.\s/.test(line)) { count++; started = true; }
    else if (started) break; // the contiguous numbered enumeration ended
  }
  return started ? count : null;
}

// Fail-LOUD on an unreadable / locatable-less catalog (never a silent pass — same instinct as the
// reconciliation gate's "refuse to pass a count that cannot be recomputed").
function checkCatalogBinding(catalogPath) {
  let text;
  try {
    text = fs.readFileSync(catalogPath, 'utf8');
  } catch (e) {
    return [`cannot read --catalog source "${catalogPath}" (${e && e.message ? e.message : 'unknown error'}) — refusing to verify the §8.5<->set binding (fail-loud).`];
  }
  const n = catalogNumberedCount(text);
  if (n === null) {
    return [`${catalogPath}: cannot locate the "standing escape catalog" numbered enumeration — refusing to verify the §8.5<->set binding (fail-loud).`];
  }
  if (n !== EXPECTED_CATALOG_COUNT) {
    return [
      `${catalogPath}: the §8.5 standing escape catalog has ${n} numbered hunt(s) but the calibration set shadows ${EXPECTED_CATALOG_COUNT} ` +
      `(REQUIRED_CLASSES ${REQUIRED_CLASSES.length} − ${OWED_EXTRA.length} owed extra). The binding is BIDIRECTIONAL: a new §8.5 hunt must get a fixture + a ` +
      `REQUIRED_CLASSES entry (and an obsolete one removed from both), or FNR=0 stops proving the WHOLE catalog (G14).`,
    ];
  }
  return [];
}

// Check a verifier-findings file: a "Sound" verdict must RECORD a calibration-result block.
// The unanchored-presence defect (BOTH directions) closed at the shared primitive:
//   • fail-CLOSED (:197) — the verdict is read from a LINE-ANCHORED `status:`/`verdict:` field
//     (in or out of a ```verdict fence). A `status: Sound` QUOTED mid-prose (backtick/text before
//     it) is not the file's verdict, so an illustrative mention no longer false-blocks.
//   • fail-OPEN (:198) — the calibration record must be a LINE-ANCHORED ```calibration block
//     whose BODY carries the FNR (block-bound). A decoy fence, or an FNR only in prose OUTSIDE
//     the block, no longer satisfies the record requirement.
function checkFindings(file, text) {
  const hasSound = /^[ \t]*(?:status|verdict)\s*:\s*`?Sound\b/im.test(normalize(text));
  const hasCalBlock = extractBlocks(text, 'calibration').some((b) => /FNR/i.test(b));
  if (hasSound && !hasCalBlock) {
    return [`${file}: asserts a "Sound" verdict but records NO calibration-result block (a fenced \`\`\`calibration block with seeds caught / FNR). FNR unrecorded = the verifier-proof never ran for this milestone — untrusted (G14).`];
  }
  return [];
}

// FAIL CLOSED: a `git diff --cached` failure must surface and exit non-zero.
function stagedFiles() {
  let out;
  try {
    out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown git error';
    failClosed(`cannot enumerate staged files via \`git diff --cached\`: ${detail}`);
  }
  return out.split(/\r?\n/).filter(Boolean);
}

function emit(findings, warn) {
  if (findings.length === 0) process.exit(0);
  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} calibration finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} calibration finding(s) block this commit (G14 — the seeded-defect set + the recorded FNR are the verifier-proof).\n`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const setIdx = args.indexOf('--set');
  const catIdx = args.indexOf('--catalog');
  const catalogPath = catIdx !== -1 ? args[catIdx + 1] : null;
  if (catIdx !== -1 && (!catalogPath || catalogPath.startsWith('--'))) {
    process.stderr.write('usage: validate-calibration.cjs ... --catalog <STAGE-PROMPT-PROTOCOL.md>\n');
    process.exit(2);
  }

  if (setIdx !== -1) {
    const setDir = args[setIdx + 1];
    if (!setDir || setDir.startsWith('--')) {
      process.stderr.write('usage: validate-calibration.cjs [--warn] --set <dir> [--catalog <protocol.md>]\n');
      process.exit(2);
    }
    const findings = checkSet(setDir); // may fail-closed (exit 2) on an unreadable fixture
    // The REVERSE binding — opt-in via --catalog: also assert the §8.5 numbered catalog and
    // the shadowed set haven't drifted apart (a new §8.5 hunt with no fixture is FLAGGED).
    if (catalogPath) findings.push(...checkCatalogBinding(catalogPath));
    emit(findings, warn);
    return;
  }

  if (args.includes('--staged')) {
    const staged = stagedFiles();
    const findings = [];
    if (staged.some((f) => /(^|\/)prompts\/calibration\//.test(f))) {
      findings.push(...checkSet('prompts/calibration'));
    }
    const findingsFiles = staged.filter((f) => /-findings\.md$/i.test(f) && !/^templates\//.test(f));
    for (const f of findingsFiles) {
      let text;
      try { text = fs.readFileSync(f, 'utf8'); } catch (e) { findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`); continue; }
      findings.push(...checkFindings(f, text));
    }
    emit(findings, warn);
    return;
  }

  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    process.stderr.write('usage: validate-calibration.cjs [--warn] (--set <dir> | <findings.md>... | --staged)\n');
    process.exit(2);
  }
  const findings = [];
  for (const f of positional) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`); continue; }
    findings.push(...checkFindings(f, text));
  }
  emit(findings, warn);
}

main();
