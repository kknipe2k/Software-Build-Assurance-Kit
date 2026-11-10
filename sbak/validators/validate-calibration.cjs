#!/usr/bin/env node
// @kit-version 1.0.10
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
//   CATCH IS AGENT JUDGMENT (the verifier's verdicts) and the RATE IS THE SCORER'S (the FNR,
//   false-negative rate, written by node scripts/calibration-score.cjs, which the orchestrator runs:
//   observed evidence, never the verifier's) — you can't run a judge in a pre-commit smoke test,
//   so the catch is NOT a pre-commit check. Conflating
//   "the harness is present" with "the verifier caught the seeds" is the exact presence-≠-
//   effectiveness theater these gates exist to kill. Floor (this validator, present + wired) + adversary
//   (the verifier's verdicts, scored by the program) = a real gate; neither alone is. See prompts/calibration/README.md.
//
// ── THE MECHANICAL FLOOR ───────────────────────────────────────────────────────────────────
//   --set <dir>  (the calibration set, default prompts/calibration/):
//     • THE LABELS ARE THE CLASS AUTHORITY (fixture filenames are NEUTRAL by design — a
//       filename that named its class would hand the verifier the answer). Each
//       labels/*.label.md binds `class:` to `fixture:` (the pointer). COVERAGE: every catalog
//       class in REQUIRED_CLASSES has a label whose fixture pointer RESOLVES. A missing class →
//       finding (the set must shadow the WHOLE catalog; a partial set — a fifth of it — cannot
//       pass). This is the FORWARD half (list → label → fixture).
//     • THE BINDING IS POLICED, not derived: every label's `fixture:` pointer must resolve,
//       every fixture must be claimed by EXACTLY ONE label (an orphan or doubly-claimed
//       fixture → finding — with neutral names the mapping exists only in labels/, so a hole
//       in it is a hole in the ground truth).
//     • --catalog <STAGE-PROMPT-PROTOCOL.md> adds the REVERSE half: the §8.5
//       numbered catalog is COUNTED and must equal the shadowed class count, so a new §8.5 hunt
//       with no fixture is FLAGGED. With both halves the set and the §8.5 catalog cannot silently
//       drift apart in EITHER direction (without --catalog only the forward half runs).
//     • THE GROUND-TRUTH-LABEL REQUIREMENT (the mutant target, see unclaimedFixtures): every
//       fixture is claimed by a sealed label carrying `expected: must-flag` + a `class:`.
//     • SEALING, two layers: (a) a fixture that contains its own answer token (`expected:` /
//       `must-flag`) → seal-broken finding (the verifier would read the answer; FNR=0 would
//       prove nothing); (b) the ANNOUNCEMENT seal — a fixture whose FILENAME or HEADING lines
//       name its own defect class (class tokens derived from the labels, never hand-listed) →
//       seal-broken finding. FNR=0 on a set that announces its classes proves the verifier can
//       READ, not that it can DETECT (the announcement-leak class, fixed 2026-08-01; the leak
//       probe measured 11/11 from filenames+headings alone pre-fix).
//   <findings-file>...  (or --staged over *-findings.md; [--set <dir>] names the set, default
//   prompts/calibration under the cwd; [--catalog <protocol.md>] binds seeds to the catalog too):
//     • M34.6.D - the score is the scorer's, never the verifier's. The verifier writes its blind
//       verdicts in a ```calibration-verdicts block (agent judgment); node
//       scripts/calibration-score.cjs, run by the orchestrator, writes the ```calibration block
//       (observed evidence). A file asserting a "Sound" verdict must carry: exactly one verdicts
//       block; exactly one calibration block whose `scored-by:` line is the scorer's
//       (`calibration-score.cjs verdicts-sha256 <64 hex> at <ISO time>`) and whose hash equals the
//       sha256 of the verdicts block's body as normalize() reads it (BOM dropped, CR/CRLF to LF,
//       fences excluded); `seeds` an integer equal to the set's label count (and, with --catalog,
//       to the §8.5 numbered count plus the owed extras); `caught` equal to `seeds`; FNR a number
//       equal to 0. `scored-by: pending` is refused naming the scorer line to run; a block with no
//       scorer line (the self-reported shape) is refused; a verdicts block edited after scoring is
//       refused by the hash. A file that does not assert Sound is not refused on the blocks.
//       Blocks are selected by EXACT label (the shared extractor matches a label by prefix, so
//       ```calibration would also return ```calibration-verdicts).
//     • HONEST LIMIT: this checks the record's form and its binding, never the verdicts against the
//       labels (a re-scoring validator would tell a verifier who runs it how many seeds it missed).
//       A scored-by line typed by hand with the right hash and numbers passes - the local trust
//       boundary every record on the evidence path shares.
//
// Severity / the toggle (mirrors test_honesty / risk_matrix, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed branches (exit 2 —
//                      an unreadable fixture / a git-enumeration error) are NEVER downgraded.
//
// Usage:
//   node validators/validate-calibration.cjs [--warn] --set <dir> [--catalog <protocol.md>]  # check the set (+ reverse binding)
//   node validators/validate-calibration.cjs [--warn] [--set <dir>] [--catalog <protocol.md>] <findings.md>...  # check findings files
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
const crypto = require('crypto');
const { execSync } = require('child_process');

// EXTEND, DON'T FORK: the shared line-anchored, block-bound extractor. The unanchored-presence
// defect runs in BOTH directions, closed here at the primitive: the
// verdict is read from a line-START field (not a quoted mention) and the calibration record from
// a real ```calibration block's BODY (not a decoy fence + a stray prose FNR).
const { extractBlocksWithPos, normalize, escapeRe } = require('./lib/fenced-block.cjs');

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

// FAIL CLOSED: refuse to pass on an unknown set / unreadable fixture.
function failClosed(msg) {
  process.stderr.write(`FAIL  ${msg}\n      Refusing to pass the calibration gate on an unknown set (fail-closed).\n`);
  process.exit(2);
}

// Read the labels — THE CLASS AUTHORITY. Fixture filenames are neutral by design, so the
// class↔fixture binding exists ONLY here: each label carries `class:` (which escape class it
// seeds), `fixture:` (the pointer into fixtures/), and `expected: must-flag` (the sealed
// verdict). Returns { labels: [{name, cls, fixture}], findings } — incomplete labels are
// findings, not crashes; an unreadable label is fail-closed.
function readLabels(labelsDir) {
  const findings = [];
  const labels = [];
  let names;
  try {
    names = fs.readdirSync(labelsDir).filter((n) => /\.label\.md$/i.test(n));
  } catch (e) {
    failClosed(`cannot enumerate calibration labels at ${labelsDir}: ${e && e.message ? e.message : 'unknown error'}`);
  }
  for (const n of names) {
    let lb;
    try {
      lb = fs.readFileSync(path.join(labelsDir, n), 'utf8');
    } catch (e) {
      failClosed(`unreadable calibration label labels/${n}: ${e && e.message ? e.message : 'unknown error'}`);
    }
    const cls = (lb.match(/\bclass:\s*(\S+)/i) || [])[1] || null;
    const fixture = (lb.match(/\bfixture:\s*(\S+)/i) || [])[1] || null;
    if (!/expected:\s*must-flag/i.test(lb) || !cls || !fixture) {
      findings.push(`labels/${n} is incomplete — a sealed ground-truth label needs \`expected: must-flag\`, a \`class:\`, and a \`fixture:\` pointer (with neutral fixture names the label IS the class↔fixture binding) (G14).`);
      continue;
    }
    labels.push({ name: n, cls, fixture });
  }
  return { labels, findings };
}

// THE MUTANT TARGET. Every seeded fixture MUST be claimed by a sealed ground-truth label.
// Reverting this to `return []` ("any file in the set passes") makes the "orphan fixture ->
// flagged" smoke test go RED while coverage (computed from the labels) and the pointer checks
// stay satisfied — the mutation isolates EXACTLY the every-fixture-is-labeled requirement
// (no second finding survives, because the orphan's class is still covered by its own label
// set in the smoke fixture).
function unclaimedFixtures(fixtureNames, claimedBy) {
  const out = [];
  for (const n of fixtureNames) {
    if (!claimedBy.has(n.toLowerCase())) {
      out.push(`fixtures/${n} is claimed by NO ground-truth label — every seeded fixture MUST be bound by exactly one sealed must-flag label's \`fixture:\` pointer (G14; with neutral names an unclaimed fixture has no ground truth at all).`);
    }
  }
  return out;
}

// THE ANNOUNCEMENT SEAL. A fixture whose FILENAME or HEADING lines name its own defect class
// hands the verifier the answer without any `expected:` token — FNR=0 then proves reading, not
// detection (the leak probe scored 11/11 on the pre-fix set this way). The class-token list is
// DERIVED from the label's own `class:` value, never hand-listed: the fixture is flagged when
// EVERY hyphen-separated token of its class appears (word-bounded, case-insensitive) in the
// filename + heading lines. All-tokens (not any-token) keeps ordinary technical vocabulary
// legal — a fixture about tests may say "test"; it may not say its whole class name.
function announcementLeak(fixtureName, fixtureText, cls) {
  const headings = fixtureText.split(/\r?\n/).filter((l) => /^\s*#/.test(l)).join(' ');
  const evidence = `${fixtureName.replace(/\.md$/i, '')} ${headings}`.toLowerCase();
  const tokens = cls.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const allPresent = tokens.length > 0 &&
    tokens.every((t) => new RegExp(`\\b${t}\\b`).test(evidence));
  if (allPresent) {
    return [`fixtures/${fixtureName} ANNOUNCES its defect class '${cls}' in its filename or headings — the seal is broken; a verifier can classify it without reading the artifact (G14 announcement seal). Use a neutral filename and artifact-realistic headings; the class lives only in labels/.`];
  }
  return [];
}

// Check a calibration set: label authority (pointers resolve, exactly-one-claim, coverage from
// the labels' classes) + both seal layers on every fixture.
// Fail-closed (exit 2) on an unenumerable dir or an unreadable fixture/label.
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

  const { labels, findings: labelFindings } = readLabels(labelsDir);
  findings.push(...labelFindings);

  // The pointer checks: every label's fixture resolves; every fixture claimed at most once.
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const claimedBy = new Map(); // fixture name (lowercased) -> claiming label name
  const covered = new Set();
  for (const lb of labels) {
    if (!nameSet.has(lb.fixture.toLowerCase())) {
      findings.push(`labels/${lb.name}: fixture pointer '${lb.fixture}' does NOT resolve in fixtures/ — a dangling ground-truth binding (G14; the mapping is not derivable from neutral names, so a dead pointer is a dead class).`);
      continue;
    }
    const prior = claimedBy.get(lb.fixture.toLowerCase());
    if (prior) {
      findings.push(`fixtures/${lb.fixture} is claimed by TWO labels (labels/${prior} and labels/${lb.name}) — the class↔fixture binding must be exactly one label per fixture (G14).`);
      continue;
    }
    claimedBy.set(lb.fixture.toLowerCase(), lb.name);
    covered.add(lb.cls);
  }

  // THE GROUND-TRUTH-LABEL REQUIREMENT (mutant target): no orphan fixtures.
  findings.push(...unclaimedFixtures(names, claimedBy));

  // Per-fixture seals. The class for the announcement seal comes from the claiming label.
  const classByFixture = new Map();
  for (const lb of labels) if (nameSet.has(lb.fixture.toLowerCase())) classByFixture.set(lb.fixture.toLowerCase(), lb.cls);
  for (const n of names) {
    let fx;
    try {
      fx = fs.readFileSync(path.join(fixturesDir, n), 'utf8');
    } catch (e) {
      failClosed(`unreadable calibration fixture fixtures/${n}: ${e && e.message ? e.message : 'unknown error'}`);
    }
    // SEALING (a) — the answer must not live in the fixture the verifier reads.
    if (ANSWER_TOKEN.test(fx)) {
      findings.push(`fixtures/${n} CONTAINS its own ground-truth answer (\`expected:\` / \`must-flag\`) — the seal is broken; the verifier would read the answer. Keep the verdict in labels/ only (G14 sealing).`);
    }
    // SEALING (b) — the announcement seal (filename/headings must not name the class).
    const cls = classByFixture.get(n.toLowerCase());
    if (cls) findings.push(...announcementLeak(n, fx, cls));
  }

  // COVERAGE of the WHOLE catalog, from the LABELS' classes (the authority): the omitted-claim
  // case above does not also drop a class in the mutant-kill fixture, so the mutation isolates
  // exactly the orphan check.
  for (const cls of REQUIRED_CLASSES) {
    if (!covered.has(cls)) {
      findings.push(`${setDir}: calibration set does not cover escape class '${cls}' — no label claims a resolving fixture for it. The set must shadow the full §8.5 catalog (one fixture per class); FNR=0 must prove the WHOLE catalog.`);
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

// M34.6.D - blocks by EXACT label. The shared extractor matches a fence label by prefix (its
// opening pattern is the label then any text), so ```calibration would also return a
// ```calibration-verdicts block. This filter keeps a block only when its opening fence's first
// word IS the label (an info string after whitespace still allowed). Line-anchored and CRLF/BOM-
// tolerant through the shared extractor; the shared primitive itself is untouched.
function exactBlocks(text, label) {
  const lines = normalize(text).split('\n');
  const open = new RegExp('^[ \\t]*```' + escapeRe(label) + '(?:[ \\t].*)?$');
  return extractBlocksWithPos(text, label).filter((b) => open.test(lines[b.startLine - 1] || ''));
}

// The verifier's verdicts block body -> { map: fixture -> class|clean, judged, malformed, dupes }.
// Every non-blank line is `<fixture filename>.md: <token>` or `judged-from: content`.
function verdictsOf(body) {
  const out = { map: new Map(), judged: false, malformed: [], dupes: [] };
  normalize(body).split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (!l) return;
    if (/^judged-from:\s*content$/.test(l)) { out.judged = true; return; }
    const m = l.match(/^(\S+\.md):\s*(\S+)$/i);
    if (!m) { out.malformed.push({ line: i + 1, text: l }); return; }
    if (out.map.has(m[1])) { if (out.dupes.indexOf(m[1]) === -1) out.dupes.push(m[1]); return; }
    out.map.set(m[1], m[2]);
  });
  return out;
}

// The binding: sha256 hex over the verdicts block's body as normalize() reads it (BOM dropped,
// CR/CRLF to LF), every body line with its LF, the fences excluded - so a checkout's line-ending
// conversion never breaks it.
function verdictsSha(body) { return crypto.createHash('sha256').update(normalize(body), 'utf8').digest('hex'); }

// The time's digits are written \d{2} on purpose: two \d escapes either side of a colon read as a
// Windows drive path to the release scrub's absolute-path rule.
const SCORED_BY = /^calibration-score\.cjs verdicts-sha256 ([0-9a-f]{64}) at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;
const SCORER_LINE = 'node scripts/calibration-score.cjs';
function blockField(body, key) {
  const m = normalize(body).match(new RegExp('^[ \\t]*' + escapeRe(key) + '[ \\t]*:[ \\t]*(.*?)[ \\t]*$', 'm'));
  return m ? m[1] : null;
}
function labelCount(setDir) {
  const dir = path.join(setDir, 'labels');
  try { return fs.readdirSync(dir).filter((n) => /\.label\.md$/i.test(n)).length; }
  catch (e) { failClosed(`cannot enumerate calibration labels at ${dir}: ${e && e.message ? e.message : 'unknown error'}`); }
  return 0;
}

// Check a verifier-findings file. A "Sound" verdict must carry the scorer's calibration block,
// bound to the verifier's verdicts. The unanchored-presence defect (BOTH directions) stays closed:
//   • fail-CLOSED - the verdict is read from a LINE-ANCHORED `status:`/`verdict:` field (in or
//     out of a ```verdict fence); a `status: Sound` QUOTED mid-prose is not the file's verdict.
//   • fail-OPEN - the record must be LINE-ANCHORED, EXACT-label blocks; a decoy fence or an FNR
//     only in prose OUTSIDE the block never satisfies it.
// ctx: { setDir, catalogPath }.
function checkFindings(file, text, ctx) {
  const c = ctx || {};
  const hasSound = /^[ \t]*(?:status|verdict)\s*:\s*`?Sound\b/im.test(normalize(text));
  if (!hasSound) return [];
  const cal = exactBlocks(text, 'calibration');
  const ver = exactBlocks(text, 'calibration-verdicts');
  if (!cal.length && !ver.length) {
    return [`${file}: asserts a "Sound" verdict but records NO calibration-result block (a fenced \`\`\`calibration block written by ${SCORER_LINE}) and no calibration-verdicts block - the verifier-proof never ran for this milestone; untrusted (G14).`];
  }
  if (!ver.length) return [`${file}: asserts a "Sound" verdict but carries no calibration-verdicts block - the verifier's blind verdicts are the exam the score is bound to (G14).`];
  if (ver.length > 1) return [`${file}: carries ${ver.length} calibration-verdicts blocks - one exam, one block (G14).`];
  if (!cal.length) return [`${file}: asserts a "Sound" verdict but records NO calibration-result block (a fenced \`\`\`calibration block written by ${SCORER_LINE}) (G14).`];
  if (cal.length > 1) return [`${file}: carries ${cal.length} calibration blocks - one exam, one score (G14).`];
  const body = cal[0].body;
  const sb = blockField(body, 'scored-by');
  if (sb === 'pending') {
    return [`${file}: asserts a "Sound" verdict but the calibration block is not scored (scored-by: pending) - the orchestrator runs ${SCORER_LINE} --findings ${file} --session <the verifier's session id> (G14).`];
  }
  const m = SCORED_BY.exec(sb || '');
  if (!m) {
    return [`${file}: asserts a "Sound" verdict but the calibration block was not written by ${SCORER_LINE} (no scored-by: calibration-score.cjs verdicts-sha256 <hex> at <time> line) - a self-reported rate is not a score (G14).`];
  }
  const now = verdictsSha(ver[0].body);
  if (m[1] !== now) {
    return [`${file}: the calibration-verdicts block changed after scoring (verdicts-sha256 ${m[1].slice(0, 12)} in the block, ${now.slice(0, 12)} now) - the score is bound to the verdicts it scored (G14).`];
  }
  const findings = [];
  const seedsV = blockField(body, 'seeds');
  const caughtV = blockField(body, 'caught');
  const fnrV = blockField(body, 'FNR');
  const seeds = /^\d+$/.test(seedsV || '') ? Number(seedsV) : null;
  const count = labelCount(c.setDir || 'prompts/calibration');
  if (seeds === null || seeds !== count) findings.push(`${file}: seeds ${seedsV === null ? '(missing)' : seedsV} is not the calibration set's label count ${count} (G14).`);
  if (c.catalogPath) {
    let n = null;
    try { n = catalogNumberedCount(fs.readFileSync(c.catalogPath, 'utf8')); } catch (_) { n = null; }
    if (n === null) findings.push(`${file}: cannot count the §8.5 catalog in ${c.catalogPath} - refusing to bind seeds to it (fail-loud).`);
    else if (seeds !== n + OWED_EXTRA.length) findings.push(`${file}: seeds ${seedsV} is not the shadowed catalog count ${n + OWED_EXTRA.length} (§8.5's ${n} numbered hunts plus ${OWED_EXTRA.length} owed extra) (G14).`);
  }
  const caught = /^\d+$/.test(caughtV || '') ? Number(caughtV) : null;
  if (caught === null || seeds === null || caught !== seeds) findings.push(`${file}: caught ${caughtV === null ? '(missing)' : caughtV} of seeds ${seedsV === null ? '(missing)' : seedsV} - a Sound verdict needs every seed caught (FNR 0) (G14).`);
  const fnrTok = String(fnrV || '').split(/\s+/)[0];
  const fnr = fnrTok === '' ? NaN : Number(fnrTok);
  if (!Number.isFinite(fnr)) findings.push(`${file}: FNR ${fnrV === null ? '(missing)' : fnrV} does not parse as a number (G14).`);
  else if (fnr !== 0) findings.push(`${file}: FNR ${fnrV} is not 0 - a Sound verdict needs every seed caught (G14).`);
  return findings;
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
  process.stderr.write(`\n${findings.length} calibration finding(s) block this commit (G14 — the seeded-defect set + the scorer's FNR are the verifier-proof).\n`);
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

  const setArg = setIdx !== -1 ? args[setIdx + 1] : null;
  if (setIdx !== -1 && (!setArg || setArg.startsWith('--'))) {
    process.stderr.write('usage: validate-calibration.cjs [--warn] --set <dir> [--catalog <protocol.md>]\n');
    process.exit(2);
  }
  // Positional findings files: every argument that is neither a flag nor a flag's value.
  const valueAt = new Set([setIdx, catIdx].filter((i) => i !== -1).map((i) => i + 1));
  const positional = args.filter((a, i) => !a.startsWith('--') && !valueAt.has(i));
  // M34.6.D: findings mode reads the set (for the label count) from --set when given beside
  // findings files, else prompts/calibration under the cwd; --catalog binds seeds to the catalog.
  const ctx = { setDir: setArg || 'prompts/calibration', catalogPath };

  if (setIdx !== -1 && positional.length === 0 && !args.includes('--staged')) {
    const setDir = setArg;
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
      findings.push(...checkFindings(f, text, ctx));
    }
    emit(findings, warn);
    return;
  }

  if (positional.length === 0) {
    process.stderr.write('usage: validate-calibration.cjs [--warn] (--set <dir> | <findings.md>... | --staged)\n');
    process.exit(2);
  }
  const findings = [];
  for (const f of positional) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`); continue; }
    findings.push(...checkFindings(f, text, ctx));
  }
  emit(findings, warn);
}

// M34.6.D: one source for the catalog, the label reader, the set check and the verdicts' parser
// and hash - scripts/calibration-score.cjs requires this module (the CLI runs only when invoked).
module.exports = { REQUIRED_CLASSES, OWED_EXTRA, readLabels, checkSet, exactBlocks, verdictsOf, verdictsSha, catalogNumberedCount, checkFindings };

if (require.main === module) main();
