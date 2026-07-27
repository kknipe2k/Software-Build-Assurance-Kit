#!/usr/bin/env node
// @kit-version 1.0.0
// validators/validate-spec-examples.cjs
//
// THE SPEC-EXAMPLE HARVEST GATE — every literal example in the spec must appear in at
// least one test fixture.
//
// ── WHY THIS EXISTS (KF-53 instance 1 — an escape that was priced, not imagined) ────────
//   A two-arm build trial ran the same small markdown-to-HTML tool twice, once under this
//   framework and once under a lightweight control. Between them the two arms produced
//   dozens of gate runs, a verifier stage, a calibration set and a human drive — and the
//   ONE wrong result that escaped every one of those controls was the spec's OWN literal
//   example: nested emphasis, `**bold *italic* code***`. Both arms implemented it wrong.
//   Both arms' suites were green. It was caught by held-back fixtures, i.e. by the luck of
//   how the evaluation happened to be designed, not by anything either build could run on
//   itself.
//
//   The mechanism is embarrassingly simple: nothing ever forced the spec's examples into
//   the test surface. The spec said what the output should be; the tests tested something
//   adjacent; no one compared the two lists. This validator compares the two lists.
//
// ── HONEST LOCUS (no overclaim — read this before trusting the gate) ────────────────────
//   • IT PROVES AN EXAMPLE REACHED THE TEST SURFACE. It does NOT prove the test ASSERTS
//     the right output for it. A fixture that merely mentions the example satisfies this
//     gate. Presence is the cheap half — and it is also the half the trial's escape
//     actually needed, which is why it is worth its own gate.
//   • IT RECOGNIZES THREE STRUCTURAL EXAMPLE FORMS (below). An example presented with no
//     structural marker is INVISIBLE to it. That limit is the reason the spec-authoring
//     flow prescribes those forms: a gate that reads structure is only ever as good as the
//     convention that produces the structure.
//   • IT IS A TEXT RECOGNIZER, not a Markdown parser (the kit is dependency-free). It
//     anchors on fences, headings and list labels — the structural places specs use.
//   • MATCHING IS EXACT (normalized) SUBSTRING. An example re-formatted in the fixture —
//     different indentation, re-wrapped — reads as MISSING. That failure direction is
//     deliberate: it is conservative (a false block, never a false pass), and the waiver
//     path exists precisely for the cases where restating the literal is wrong.
//
// ── WHAT COUNTS AS AN EXAMPLE (three structural openers, and nothing else) ──────────────
//   1. A fenced block whose INFO STRING carries `example` (```example, ```md example).
//   2. Any fenced block or inline code span under a HEADING matching /\bexamples?\b/i,
//      up to the next heading of equal or higher level.
//   3. Any fenced block or inline code span inside a LIST ITEM whose leading label is a
//      bolded **Example** / **Examples**, up to the next list item or heading.
//
//   PROSE IS NEVER HARVESTED, and neither is a bare inline literal in a requirements
//   paragraph. That exclusion is the whole design constraint: an extractor that demanded
//   every backticked token in a spec become a fixture would fire on flag names, file
//   paths and type names, and would be switched off within a day. A gate nobody can live
//   with protects nothing. There is deliberately NO "e.g. / for example" prose rule — it
//   fires on ordinary sentences, which is the same false-positive class one step quieter.
//
// ── THE WAIVER PATH (visible, per-example, and recorded where the example lives) ────────
//   Put `harvest-waiver: <reason>` on the example's own line, or on the line immediately
//   after it (for a fenced block: the line after the closing fence). The reason is
//   REQUIRED — `harvest-waiver:` with nothing after it is not a waiver, it is a delete
//   with extra steps, and the example still blocks.
//
//   EVERY waiver is PRINTED ON EVERY RUN with its file, line and reason. A waiver that
//   nobody sees is an exemption; a waiver on screen is a decision someone can challenge at
//   review. The waiver lives in the spec, beside the example it excuses, because that is
//   where the reader who is deciding whether to believe it will be standing.
//
// ── NO FALSE BLOCK AT SPEC TIME (the KF-21 lesson, mechanized) ──────────────────────────
//   When the spec is authored there are no tests yet. Demanding fixtures then would fail
//   every project's FIRST commit, and a gate that does that gets deleted rather than
//   satisfied. So an EMPTY test surface is a VISIBLE SKIP: the run says how many examples
//   are not yet demanded and what re-arms the check (the project's first test file). It is
//   disclosed on stdout — never a silent pass — and it re-arms automatically.
//
// Usage:
//   node validators/validate-spec-examples.cjs [--warn] [--root DIR] [--spec-root DIR] [file.md ...]
//     --warn         advisory: report findings, exit 0 (the Lite render)
//     --root DIR     project root for test-surface discovery (default: cwd)
//     --spec-root D  where the spec lives, relative to root (default: the spec directory)
//     file.md ...    explicit spec files; default is every markdown file under the spec root
//
// Exit 0 = clean (or --warn, or no spec, or no test surface yet). Exit 1 = an unwaived
//          example is absent from the test surface. Exit 2 = fail-closed (an explicitly
//          named spec file could not be read).
// Dependency-free (Node builtins + the kit's own lib). .cjs.

'use strict';

const fs = require('fs');
const path = require('path');

const { normalize } = require('./lib/fenced-block.cjs'); // consume the one primitive, never fork it

// ── args ────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const WARN = argv.includes('--warn');
function optVal(flag, dflt) {
  const i = argv.indexOf(flag);
  return (i !== -1 && i + 1 < argv.length) ? argv[i + 1] : dflt;
}
const ROOT = path.resolve(optVal('--root', process.cwd()));
// Assembled from a bare directory name on purpose: this validator dereferences a DIRECTORY
// the project authors into (the spec is a Phase-1 deliverable, not a scaffold row), and a
// hard-coded 'spec/<file>' literal would read to the dereference registry as an artifact
// demanding a generation row that must never exist. A multi-file spec is also simply the
// honest shape — nothing says a project's spec is one file.
const SPEC_DIR = optVal('--spec-root', 'spec');
const EXPLICIT = argv.filter((a, i) => !a.startsWith('--')
  && !(i > 0 && ['--root', '--spec-root'].includes(argv[i - 1])));

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RESET = '\x1b[0m';

// ── the test surface ────────────────────────────────────────────────────────────────────
// Directories that are never test surface. `sbak` is named for the same reason the
// path-scoping prescription exists (KF-48 instance 3): a project that vendors this kit
// would otherwise pull the FRAMEWORK's test files into its own surface and satisfy its
// spec examples with someone else's fixtures.
const SKIP_DIRS = new Set(['node_modules', '.git', 'sbak', 'dist', 'build', 'out',
  'coverage', '.claude', '.github', 'vendor', 'target', '__pycache__', '.venv', 'venv']);
const TEST_DIR_SEGMENTS = new Set(['tests', 'test', '__tests__', 'fixtures', 'fixture']);
const TEST_FILE_RE = /(\.(spec|test)\.[cm]?[jt]sx?|(^|[/\\])test_[^/\\]*\.py|_test\.(py|go|rs|rb)|_spec\.rb|\.test\.(py|go|rs))$/;

// A bounded walk. The cap is a runaway guard for a pathological tree, and it is DISCLOSED
// when hit rather than silently truncating the surface — a silently short surface would
// turn this gate into a false-block generator.
const WALK_CAP = 50000;
function testSurface(root, specAbs) {
  const files = [];
  let visited = 0;
  let capped = false;
  const walk = (dir) => {
    if (capped) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (visited++ > WALK_CAP) { capped = true; return; }
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        // The SPEC tree is never its own fixture. Without this the spec would satisfy
        // every one of its own examples by containing them, and the gate would be a
        // tautology that reports green forever — the single worst outcome available here.
        if (path.resolve(p) === specAbs) continue;
        walk(p);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(root, p).split(path.sep).join('/');
      const inTestDir = rel.split('/').slice(0, -1).some((seg) => TEST_DIR_SEGMENTS.has(seg));
      if (inTestDir || TEST_FILE_RE.test(rel)) files.push(rel);
    }
  };
  walk(root);
  return { files: files.sort(), capped };
}

// ── harvesting ──────────────────────────────────────────────────────────────────────────
// Inline code spans on a line. Backtick-run aware (``a `b` c``), so a span containing a
// backtick is read whole rather than split into nonsense.
function inlineSpans(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') { i++; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    const open = i + n;
    const close = line.indexOf('`'.repeat(n), open);
    if (close === -1) { i += n; continue; }
    const body = line.slice(open, close);
    if (body.trim()) out.push(body);
    i = close + n;
  }
  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
const EXAMPLE_HEADING_RE = /\bexamples?\b/i;
const EXAMPLE_BULLET_RE = /^\s*[-*+]\s+\*\*Examples?\*\*/i;
const LIST_ITEM_RE = /^\s*[-*+]\s/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const WAIVER_RE = /harvest-waiver:(.*)$/i;

// Harvest every structurally-marked example from one spec file.
// Returns [{ text, line, kind }] where `line` is the 1-indexed ANCHOR line — the line a
// waiver may sit on (or immediately after).
function harvest(rawText) {
  const lines = normalize(rawText).split('\n');
  const out = [];
  let headingRegion = 0;   // heading level that opened an example region, 0 = none
  let bulletRegion = false;
  let fence = null;        // { marker, indent, info, startLine, body: [] }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- fenced blocks (state first: a heading inside a fence is content, not structure)
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[2][0] === fence.marker[0] && f[2].length >= fence.marker.length && !f[3].trim()) {
        const infoIsExample = /\bexamples?\b/i.test(fence.info);
        if (infoIsExample || headingRegion > 0 || bulletRegion) {
          const body = dedent(fence.body).join('\n').replace(/\s+$/, '');
          if (body.trim()) {
            out.push({ text: body, line: i + 1, kind: infoIsExample ? 'fenced example' : 'fenced block in an example region' });
          }
        }
        fence = null;
      } else {
        fence.body.push(line);
      }
      continue;
    }
    if (f && f[3].indexOf('`') === -1) {
      fence = { marker: f[2], indent: f[1], info: f[3].trim(), startLine: i + 1, body: [] };
      continue;
    }

    // --- headings open/close the heading-scoped example region
    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length;
      if (headingRegion > 0 && level <= headingRegion) headingRegion = 0;
      if (EXAMPLE_HEADING_RE.test(h[2])) headingRegion = level;
      bulletRegion = false;
      continue;
    }

    // --- list items open/close the bullet-scoped example region. A blank line closes it
    // too: without that, an **Example** bullet would leak its region into the prose
    // paragraph that follows, which is the over-harvest direction this design refuses.
    if (!line.trim()) bulletRegion = false;
    else if (LIST_ITEM_RE.test(line)) bulletRegion = EXAMPLE_BULLET_RE.test(line);

    if (headingRegion > 0 || bulletRegion) {
      for (const span of inlineSpans(line)) {
        out.push({ text: span, line: i + 1, kind: headingRegion > 0 ? 'example-heading span' : 'Example-label span' });
      }
    }
  }
  return out;
}

// Strip the block's common leading indentation so an indented fence in the spec still
// matches an unindented fixture (the one normalization that cannot create a false pass).
function dedent(bodyLines) {
  const widths = bodyLines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const cut = widths.length ? Math.min(...widths) : 0;
  return bodyLines.map((l) => l.slice(cut).replace(/\s+$/, ''));
}

// A waiver for the example anchored at `line`: the token on that line, or the next one.
function waiverFor(lines, line) {
  for (const idx of [line - 1, line]) {
    if (idx < 0 || idx >= lines.length) continue;
    const m = lines[idx].match(WAIVER_RE);
    if (!m) continue;
    const reason = m[1].replace(/^[\s:—-]*/, '').replace(/\s+$/, '');
    // A waiver with no reason is not a waiver. Reported as such rather than ignored, so
    // the author sees WHY their opt-out did not take.
    return { reason, line: idx + 1, valid: reason.length > 0 };
  }
  return null;
}

// ── main ────────────────────────────────────────────────────────────────────────────────
function listSpecFiles(specAbs) {
  const out = [];
  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      if (/\.md$/i.test(e.name)) out.push(p);
    }
  };
  walk(specAbs);
  return out.sort();
}

function main() {
  const specAbs = path.resolve(ROOT, SPEC_DIR);
  let specFiles;
  if (EXPLICIT.length) {
    specFiles = EXPLICIT.map((p) => path.resolve(ROOT, p));
    for (const p of specFiles) {
      if (!fs.existsSync(p)) {
        process.stderr.write(`spec-examples: named spec file not readable: ${p}\n`);
        process.exit(2); // fail closed — a named input that vanished is not a clean run
      }
    }
  } else {
    specFiles = listSpecFiles(specAbs);
  }

  if (!specFiles.length) {
    process.stdout.write(`spec-examples — no spec markdown found under ${SPEC_DIR}/ (nothing to harvest).\n`);
    process.exit(0);
  }

  // Harvest.
  const examples = [];
  const waivers = [];
  const badWaivers = [];
  for (const abs of specFiles) {
    let raw;
    try { raw = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
    const lines = normalize(raw).split('\n');
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    for (const ex of harvest(raw)) {
      const w = waiverFor(lines, ex.line);
      if (w && w.valid) { waivers.push({ ...ex, file: rel, reason: w.reason, waiverLine: w.line }); continue; }
      if (w && !w.valid) badWaivers.push({ ...ex, file: rel, waiverLine: w.line });
      examples.push({ ...ex, file: rel });
    }
  }

  const surface = testSurface(ROOT, specAbs);
  process.stdout.write(
    `spec-examples — ${examples.length + waivers.length} literal example(s) from ${specFiles.length} spec file(s); `
    + `test surface: ${surface.files.length} file(s)\n`);
  if (surface.capped) {
    process.stdout.write(`${DIM}  note  the test-surface walk hit its ${WALK_CAP}-entry cap; the surface below may be partial.${RESET}\n`);
  }

  // Waivers are disclosed on EVERY run, clean or not. This is the whole difference between
  // a waiver and an exemption.
  for (const w of waivers) {
    process.stdout.write(`${DIM}  WAIVER  ${w.file}:${w.waiverLine}  ${oneLine(w.text)} — ${w.reason}${RESET}\n`);
  }
  for (const b of badWaivers) {
    process.stdout.write(`  NOTE    ${b.file}:${b.waiverLine}  harvest-waiver: with no reason is NOT a waiver — the example below still applies.\n`);
  }

  // The bootstrap-time state: a spec exists, tests do not. Visible skip, never a block.
  if (surface.files.length === 0) {
    if (examples.length) {
      process.stdout.write(
        `  NOTE    no test surface yet — ${examples.length} example(s) not yet demanded. This check activates `
        + `with this project's first test file.\n`);
    }
    process.exit(0);
  }

  // The comparison. One normalized haystack; presence is a substring hit.
  let hay = '';
  for (const rel of surface.files) {
    try { hay += normalize(fs.readFileSync(path.join(ROOT, rel), 'utf8')) + '\n'; } catch (_) { /* unreadable → contributes nothing */ }
  }
  const missing = examples.filter((ex) => hay.indexOf(ex.text) === -1);

  for (const m of missing) {
    process.stdout.write(
      `  ${RED}MISSING${RESET} ${m.file}:${m.line}  ${oneLine(m.text)}\n`
      + `${DIM}          harvested as a ${m.kind}; no test fixture contains it. Add a fixture, or record `
      + `\`harvest-waiver: <reason>\` beside it in the spec.${RESET}\n`);
  }

  if (!missing.length) {
    process.stdout.write(`${GREEN}spec-examples: every harvested example appears in the test surface.${RESET}\n`);
    process.exit(0);
  }
  process.stdout.write(
    `\n${missing.length} spec example(s) reach no test fixture. This is the escape class the gate exists for: `
    + `the spec states an output, the suite never checks it, and both look healthy.\n`
    + `${DIM}Honest locus: this proves the example REACHED the test surface, not that the test asserts the right `
    + `output for it.${RESET}\n`);
  process.exit(WARN ? 0 : 1);
}

function oneLine(s) {
  const flat = String(s).split('\n').join(' ⏎ ').replace(/\s+/g, ' ').trim();
  return flat.length > 100 ? flat.slice(0, 97) + '...' : flat;
}

module.exports = { harvest, inlineSpans, waiverFor, testSurface, dedent };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`spec-examples: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2); // fail closed
  }
}
