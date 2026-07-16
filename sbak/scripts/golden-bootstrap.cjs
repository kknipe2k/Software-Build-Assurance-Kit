#!/usr/bin/env node
// scripts/golden-bootstrap.cjs
//
// THE GOLDEN BOOTSTRAP — the deterministic renderer of the COMPLETE
// Phase-3 scaffold for three reference calibrations (Lite / Standard / Full, each
// greenfield · hybrid locus · non-web deliverable — the advertised defaults), plus the
// three-way contract diff that mechanizes the drift class that shipped a dormant red-gate.
//
// ── HONEST SCOPE (non-negotiable — mirror the bake's note; no overclaim) ─────────────────
//   • PROVES THE SCAFFOLD *CONTRACT*, NOT "BOOTSTRAP VERIFIED". It renders the DETERMINISTIC
//     Phase-3 file set from checked-in fixture answer-sets and checks three ways:
//       (1) rendered tree  ⟷  the machine-readable row-set (rows.json)
//       (2) the row-set    ⟷  the CLAUDE.md Phase-3 tables (parsed, section-anchored)
//       (3) referential integrity — every scripts/*.cjs and .claude/hooks/*.cjs path
//           referenced by the rendered settings / commands / hooks resolves in the tree.
//     It does NOT prove bootstrap CONVERSATION quality (the interview, spec authoring,
//     milestone planning stay human+agent territory). It renders the WIRING, not the forms:
//     conversational/form templates (retrospective/phase-doc/spec/identity templates) ship
//     as-is with their {{placeholders}} intact — the placeholder scan applies ONLY to the
//     deterministic WIRING files the bootstrap is contractually required to fill.
//   • REPORT MODE. --diff runs against a checked-in known-gaps baseline
//     (scripts/fixtures/golden-bootstrap/known-gaps.json) that names EXACTLY the known
//     scaffold gaps — three scripts absent from templates/scripts/, the red-gate hook
//     row missing from the Phase-3 table, no LICENSE row. A finding IN the baseline
//     is reported KNOWN and the run still exits 0; a finding OUTSIDE it exits non-zero. The
//     baseline is emptied by fixing the scaffold — never by loosening the diff.
//   • A CI INHERITANCE CHECK, NOT A NUMBERED GATE (like bake-and-test / append-only-ledger).
//
// ── EXTEND, DON'T FORK ───────────────────────────────────────────────────────────────────
//   • Consumes validators/lib/fenced-block.cjs for CRLF/BOM normalization (never a new
//     unanchored matcher — spec §0.5.2).
//   • Reuses the bake's bounded copyTree (scripts/bake-and-test.cjs, require.main-guarded)
//     for the rider-1 template-deletion smoke mutation (no second tree-walk).
//   • ONE table parser (parsePhase3Tables) shared by every consumer that reads the tables.
//
// Deterministic: no Date.now() / randomness; two runs are byte-identical (the manifest carries
// a sha256 per rendered file; --check-manifest diffs a fresh render against the checked-in
// golden-manifest.json at repo root). UTF-8 no-BOM asserted on every rendered file (rule #12).
//
// Usage:
//   node scripts/golden-bootstrap.cjs --diff [--json]        report-mode three-way diff
//   node scripts/golden-bootstrap.cjs --render [--out DIR] [--keep]   render the three trees
//   node scripts/golden-bootstrap.cjs --write-manifest       (re)write repo-root golden-manifest.json
//   node scripts/golden-bootstrap.cjs --check-manifest       fresh regen == checked-in? (rider 2)
//   node scripts/golden-bootstrap.cjs --dump-tables [--json] debug: parsed Phase-3 table file-set
//   Overrides (for smoke mutations): --rows P  --claude-md P  --tables P  --known-gaps P  --src-root D
//   (--tables points the table parse at an explicit doc; --claude-md alone keeps its historical
//    meaning of "the doc the tables are parsed from" — the M24.A re-home made these distinct.)
//
// Exit 0 = clean (baseline-exact / current). Exit 1 = an out-of-baseline gap, a stale manifest,
//          or a usage/IO error. Dependency-free (Node builtins + the kit's own lib). .cjs.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const KIT_ROOT = path.resolve(__dirname, '..');
const { normalize } = require(path.join(KIT_ROOT, 'validators/lib/fenced-block.cjs')); // consume, don't fork

// ── args ─────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function has(flag) { return argv.includes(flag); }
function val(flag, dflt) { const i = argv.indexOf(flag); return (i !== -1 && i + 1 < argv.length) ? argv[i + 1] : dflt; }

const OPT = {
  srcRoot: path.resolve(val('--src-root', KIT_ROOT)),
  rowsPath: val('--rows', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/rows.json')),
  knownGapsPath: val('--known-gaps', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/known-gaps.json')),
  fixturesDir: val('--fixtures', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap')),
  claudeMd: val('--claude-md', null), // default resolved from srcRoot below
  out: val('--out', null),
  keep: has('--keep'),
  json: has('--json'),
};
// CLAUDE.md-at-parent resolver (M22.D, R1-new-3): in the packed layout the kit
// tree lives under one dir (sbak/) while CLAUDE.md stays at the unzip root —
// one level ABOVE srcRoot. Probe srcRoot first (the workshop / a flat tree),
// then the parent (a nested payload); fall through to the srcRoot path so a
// miss still errors naming the primary site.
function resolveClaudeMd(srcRoot) {
  const at = path.join(srcRoot, 'CLAUDE.md');
  if (fs.existsSync(at)) return at;
  const up = path.join(path.dirname(srcRoot), 'CLAUDE.md');
  if (fs.existsSync(up)) return up;
  return at;
}
OPT.claudeMd = OPT.claudeMd || resolveClaudeMd(OPT.srcRoot);
// Tables-doc resolver (M24.A, the DIET): the Phase-3 scaffold tables re-homed VERBATIM to
// bootstrap/SCAFFOLD-TABLES.md (workshop root; sbak/bootstrap/ in the packed layout, which is
// <srcRoot>/bootstrap/ either way). Probe the new home first; fall back to the CLAUDE.md
// resolution so pre-move fixture roots and --claude-md mutation runs keep working unchanged.
function resolveTablesDoc(srcRoot) {
  const at = path.join(srcRoot, 'bootstrap', 'SCAFFOLD-TABLES.md');
  if (fs.existsSync(at)) return at;
  return resolveClaudeMd(srcRoot);
}
// --tables overrides the tables doc alone; --claude-md (when given without --tables) keeps its
// historical meaning of "the doc the tables are parsed from" for existing smoke mutations.
OPT.tablesDoc = val('--tables', null) || (val('--claude-md', null) ? OPT.claudeMd : resolveTablesDoc(OPT.srcRoot));

const TIERS = ['lite', 'standard', 'full']; // fixed order → deterministic

// ── shared scans (also exported for unit tests) ──────────────────────────────────────────
// Unique {{PLACEHOLDER}} NAMES (without braces) surviving in a string.
function scanPlaceholders(text) {
  const out = [];
  const seen = new Set();
  const re = /\{\{([A-Za-z0-9_]+)\}\}/g;
  let m;
  while ((m = re.exec(String(text))) !== null) { if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); } }
  return out;
}
// True iff the string carries the classic UTF-8-read-as-CP1252 mojibake signature
// (the U+00E2 U+20AC pair) — the rule-#12 mis-decode class. Clean UTF-8 (em-dash, emoji) does NOT match.
function scanMojibake(text) {
  return /\u00e2\u20ac/.test(String(text));
}
// Scaffold-shaped path refs (scripts/*.cjs, .claude/hooks/*.cjs) inside a settings/command/hook
// body. Runtime-state paths (.claude/role, .claude/active-mode, *.txt, bare names) do NOT match the patterns,
// so they are naturally excluded — the check is about SCAFFOLD FILES resolving, not runtime state.
function referentialRefs(text /*, kind */) {
  const out = [];
  const seen = new Set();
  const re = /(?:scripts\/[A-Za-z0-9_-]+\.cjs|\.claude\/hooks\/[A-Za-z0-9_-]+\.cjs)/g;
  let m;
  while ((m = re.exec(String(text))) !== null) { if (!seen.has(m[0])) { seen.add(m[0]); out.push(m[0]); } }
  return out;
}

// ── the ONE table parser (section-anchored, brace-expanded) ──────────────────────────────
// Parses the CLAUDE.md "### Phase 3" scaffold tables. Only rows under a "#### <sub>" heading
// WITHIN the Phase-3 section count — a decoy table elsewhere in the doc is ignored (the
// anchoring lesson). Returns [{ file, section }]; a `{a,b,c}` brace in the first
// cell expands to one entry per option.
function parsePhase3Tables(mdText) {
  const lines = normalize(mdText).split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) { if (/^###\s+Phase 3\b/.test(lines[i])) { start = i; break; } }
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s+Phase 4\b/.test(lines[i]) || /^##\s+/.test(lines[i])) { end = i; break; }
  }
  const out = [];
  let section = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const h = line.match(/^####\s+(.*\S)\s*$/);
    if (h) { section = h[1].trim(); continue; }
    if (!section) continue;
    if (!/^\s*\|/.test(line)) continue;                 // not a table row
    if (/^[\s|:*-]+$/.test(line)) continue;             // separator |---|---|
    const parts = line.split('|');
    const first = (parts[1] || '').replace(/`/g, '').trim();
    if (!first || /^Generated file$/i.test(first)) continue; // header / empty
    const brace = first.match(/^(.*)\{([^}]+)\}(.*)$/);
    if (brace) {
      for (const opt of brace[2].split(',')) out.push({ file: brace[1] + opt.trim() + brace[3], section });
    } else {
      out.push({ file: first, section });
    }
  }
  return out;
}

// ── row-set + fixtures ───────────────────────────────────────────────────────────────────
function loadRows(rowsPath) {
  const raw = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  return Array.isArray(raw) ? raw : raw.rows;
}
function loadAnswers(tier) {
  return JSON.parse(fs.readFileSync(path.join(OPT.fixturesDir, tier + '.json'), 'utf8'));
}
// The reference calibration is greenfield · hybrid · non-web. A row applies to `tier` iff its
// tier list includes it, it is not web-only, and its locus (if constrained) includes hybrid.
function applicable(row, tier) {
  if (row.deliverable === 'web') return false;
  if (Array.isArray(row.locus) && !row.locus.includes('hybrid')) return false;
  if (!Array.isArray(row.tiers) || !row.tiers.includes(tier)) return false;
  return true;
}

// ── render one file from a row ───────────────────────────────────────────────────────────
// Returns { file, rendered, content, template, placeholders, mojibake, bom }.
function renderFile(row, answers) {
  const rec = { file: row.file, rendered: false, content: null, template: row.template || null,
    placeholders: [], mojibake: false, bom: false };

  if (row.generated === 'empty') { rec.rendered = true; rec.content = ''; return rec; }

  const tplAbs = path.join(OPT.srcRoot, row.template);
  let buf;
  try { buf = fs.readFileSync(tplAbs); } catch (_) { return rec; } // template missing → unrendered
  rec.bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let content = buf.toString('utf8');
  if (rec.bom) content = content.slice(1); // strip source BOM (we render no-BOM)

  if (row.render === 'wiring') {
    content = (row.file.endsWith('settings.json'))
      ? transformSettings(content, answers)
      : fillPlaceholders(content, answers);
    rec.placeholders = scanPlaceholders(content); // must be empty for a wiring file (fill-complete)
  }
  // 'copy' and any other render mode ship the template verbatim (forms keep their placeholders,
  // which are NOT scanned — honest locus). Encoding is scanned for EVERY rendered file.
  rec.mojibake = scanMojibake(content);
  rec.rendered = true;
  rec.content = content;
  return rec;
}

// Fill {{PLACEHOLDER}} from the answer-set's `fill` map. A placeholder with no answer is LEFT
// intact (→ the wiring placeholder scan flags it) — we never invent a value (hard rule #7).
function fillPlaceholders(text, answers) {
  const fill = (answers && answers.fill) || {};
  return String(text).replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(fill, name) ? String(fill[name]) : m);
}

// The settings.json bootstrap transform: SELECT the permission profile named by the
// fixture cadence, copy it into the live `permissions` block, DELETE `_permission_profiles`,
// then fill the {{STACK_*}} fence placeholders. Renders the TRANSFORMED form (what a bootstrapped
// project actually carries), so referential/shape checks read the real thing.
function transformSettings(text, answers) {
  const obj = JSON.parse(text);
  const profileName = (answers && answers.permission_profile) || 'fenced_autonomy';
  if (obj._permission_profiles && obj._permission_profiles[profileName]) {
    const chosen = Object.assign({}, obj._permission_profiles[profileName]);
    delete chosen._for;
    obj.permissions = chosen;
  }
  delete obj._permission_profiles;
  return fillPlaceholders(JSON.stringify(obj, null, 2), answers) + '\n';
}

// ── render a whole tier (in memory; write to disk iff destDir) ────────────────────────────
function renderTier(tier, destDir) {
  const rows = loadRows(OPT.rowsPath);
  const answers = loadAnswers(tier);
  const files = [];
  for (const row of rows) {
    if (!applicable(row, tier)) continue;
    const rec = renderFile(row, answers);
    files.push(rec);
    if (destDir && rec.rendered) {
      const outAbs = path.join(destDir, rec.file);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.writeFileSync(outAbs, rec.content, { encoding: 'utf8' }); // Node writes UTF-8 no-BOM
    }
  }
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return { tier, files };
}

// ── manifest (deterministic, canonical) ──────────────────────────────────────────────────
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function tierManifest(rendered) {
  const files = rendered.files.map((f) => ({
    file: f.file,
    rendered: f.rendered,
    sha256: f.rendered ? sha256(f.content) : null,
    placeholders: f.placeholders,
    mojibake: f.mojibake,
    bom: f.bom,
  }));
  const renderedCount = files.filter((f) => f.rendered).length;
  return {
    tier: rendered.tier,
    counts: { rows: files.length, rendered: renderedCount, unrendered: files.length - renderedCount },
    files,
  };
}
function buildManifest(destRoot) {
  const manifest = { note: 'Reference calibration: greenfield / hybrid locus / non-web. Rendered by scripts/golden-bootstrap.cjs - DERIVED, do not hand-edit; regenerate with: node scripts/golden-bootstrap.cjs --write-manifest. PLACEHOLDER-SCAN SCOPE (deliberate narrowing, honest locus): only render:wiring rows - .claude/settings.json, scripts/verify-local.cjs, .githooks/pre-commit, .github/workflows/pr-smoke.yml, .github/workflows/release.yml, LICENSE - are scanned for a surviving {{PLACEHOLDER}} and MUST be zero (these are the deterministic files the bootstrap is contractually required to fill from discovery answers - e.g. LICENSE from the owner-supplied holder/year/type). render:copy form/doc templates (identity, scope, the prompts/ retrospective + phase-doc templates, etc.) ship VERBATIM with their {{placeholders}} intact - they are filled DURING the build, not at scaffold time (the scaffold-not-interview honest locus, mirroring bake-and-test). ENCODING (UTF-8 no-BOM + mojibake) is scanned on EVERY rendered file regardless of render mode.', tiers: {} };
  for (const tier of TIERS) {
    const dest = destRoot ? path.join(destRoot, tier) : null;
    manifest.tiers[tier] = tierManifest(renderTier(tier, dest));
  }
  return manifest;
}
// Canonical serialization: sorted object keys, 2-space, trailing newline → byte-stable.
function canonical(obj) {
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

// ── the three-way diff (findings aggregated across the three tiers) ───────────────────────
function threeWayDiff() {
  const rows = loadRows(OPT.rowsPath);
  const rowFiles = new Set(rows.map((r) => r.file));

  // Render all three tiers into a temp tree (needed for referential + unrendered).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-golden-'));
  let manifest;
  try {
    manifest = buildManifest(tmp);
    const findings = [];
    const push = (cls, file, detail) => findings.push({ class: cls, file, detail });

    // (1) rendered tree ⟷ row-set — a row that did not render (template missing), aggregated.
    const unrendered = new Set();
    for (const tier of TIERS) {
      for (const f of manifest.tiers[tier].files) {
        if (!f.rendered) unrendered.add(f.file);
        if (f.rendered && f.placeholders.length) push('placeholder_survived', f.file, `surviving {{${f.placeholders.join(',')}}} in a wiring file (${tier})`);
        if (f.rendered && f.mojibake) push('mojibake', f.file, `mis-decode signature in the rendered file (${tier})`);
        // A source BOM is stripped on render (we always emit no-BOM), so it stays in the manifest
        // (informational) but is NOT itself a scaffold-contract finding.
      }
    }
    for (const file of [...unrendered].sort()) push('unrendered', file, 'row applies but its template source is absent (nothing rendered)');

    // (2) row-set ⟷ the Phase-3 scaffold tables (global set comparison). Since M24.A the
    //     tables live in bootstrap/SCAFFOLD-TABLES.md (resolveTablesDoc; CLAUDE.md fallback).
    const tableFiles = new Set(parsePhase3Tables(fs.readFileSync(OPT.tablesDoc, 'utf8')).map((r) => r.file));
    for (const rf of [...rowFiles].sort()) if (!tableFiles.has(rf)) push('table_missing', rf, 'in the row-set (the contract) but absent from the Phase-3 scaffold tables (bootstrap/SCAFFOLD-TABLES.md)');
    for (const tf of [...tableFiles].sort()) if (!rowFiles.has(tf)) push('table_extra', tf, 'in the Phase-3 scaffold tables (bootstrap/SCAFFOLD-TABLES.md) but absent from the row-set');

    // (3) referential integrity — every scaffold-path ref in rendered settings/commands/hooks
    //     resolves in the rendered tree (aggregated across tiers). Runtime-state paths excluded.
    const dangling = new Set();
    for (const tier of TIERS) {
      const present = new Set(manifest.tiers[tier].files.filter((f) => f.rendered).map((f) => f.file));
      const rendered = renderTier(tier, null); // in-memory content
      for (const f of rendered.files) {
        if (!f.rendered || f.content == null) continue;
        const isSource = /\.claude\/settings\.json$/.test(f.file)
          || /^\.claude\/commands\/.+\.md$/.test(f.file)
          || /^\.claude\/hooks\/.+\.cjs$/.test(f.file);
        if (!isSource) continue;
        for (const ref of referentialRefs(f.content)) {
          if (!present.has(ref)) dangling.add(ref);
        }
      }
    }
    for (const ref of [...dangling].sort()) push('dangling_ref', ref, 'referenced by a rendered settings/command/hook but absent from the rendered tree');

    return { manifest, findings };
  } finally {
    if (!OPT.keep) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* best effort */ } }
    else process.stderr.write(`[golden] kept render tree: ${tmp}\n`);
  }
}

// ── baseline reconciliation ──────────────────────────────────────────────────────────────
function loadKnownGaps() {
  try { const raw = JSON.parse(fs.readFileSync(OPT.knownGapsPath, 'utf8')); return Array.isArray(raw) ? raw : (raw.gaps || []); }
  catch (_) { return []; }
}
function reconcile(findings, known) {
  const keyOf = (x) => `${x.class}|${x.file}`;
  const knownMap = new Map(known.map((k) => [keyOf(k), k]));
  const matchedKeys = new Set();
  const knownOut = [], unknown = [];
  for (const f of findings) {
    const k = knownMap.get(keyOf(f));
    if (k) { matchedKeys.add(keyOf(f)); knownOut.push({ ...f, spec_item: k.spec_item }); }
    else unknown.push(f);
  }
  const phantom = known.filter((k) => !matchedKeys.has(keyOf(k)));
  return { known: knownOut, unknown, phantom };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────
function emit(obj) { process.stdout.write(OPT.json ? JSON.stringify(obj) : humanReport(obj)); }

function humanReport(rep) {
  const L = [];
  L.push('golden-bootstrap — three-way scaffold-contract diff (report mode)');
  L.push('  honest locus: proves the scaffold CONTRACT (files/wiring/placeholders/encoding), not "bootstrap verified".');
  const b = rep.baseline;
  if (b) {
    L.push(`  KNOWN gaps (in the known-gaps baseline): ${b.known.length}`);
    for (const k of b.known) L.push(`    · [${k.spec_item}] ${k.class}  ${k.file}`);
    L.push(`  UNKNOWN gaps (out of baseline → FAIL): ${b.unknown.length}`);
    for (const u of b.unknown) L.push(`    ✗ ${u.class}  ${u.file} — ${u.detail}`);
    L.push(`  PHANTOM baseline entries (declared but not observed → FAIL): ${b.phantom.length}`);
    for (const p of b.phantom) L.push(`    ? [${p.spec_item}] ${p.class}  ${p.file}`);
  }
  L.push(`  => exit ${rep.exit}`);
  return L.join('\n') + '\n';
}

function main() {
  if (has('--dump-tables')) {
    const rows = parsePhase3Tables(fs.readFileSync(OPT.tablesDoc, 'utf8'));
    if (OPT.json) process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    else { for (const r of rows) process.stdout.write(`${r.section}\t${r.file}\n`); process.stdout.write(`(${rows.length} table file cells)\n`); }
    process.exit(0);
  }

  if (has('--render')) {
    const dest = OPT.out ? path.resolve(OPT.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'kit-golden-'));
    const manifest = buildManifest(dest);
    process.stdout.write(`rendered 3 reference calibrations into ${dest}\n`);
    for (const t of TIERS) process.stdout.write(`  ${t}: ${manifest.tiers[t].counts.rendered}/${manifest.tiers[t].counts.rows} rendered\n`);
    if (!OPT.out && !OPT.keep) { try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) {} }
    else process.stdout.write(`  (kept: ${dest})\n`);
    process.exit(0);
  }

  const manifestOut = path.join(KIT_ROOT, 'golden-manifest.json');
  if (has('--write-manifest')) {
    fs.writeFileSync(manifestOut, canonical(buildManifest(null)), { encoding: 'utf8' });
    process.stdout.write(`wrote ${manifestOut}\n`);
    process.exit(0);
  }
  if (has('--check-manifest')) {
    let checkedIn;
    try { checkedIn = fs.readFileSync(manifestOut, 'utf8'); } catch (_) {
      process.stderr.write('check-manifest: golden-manifest.json absent at repo root (run --write-manifest).\n'); process.exit(1);
    }
    const fresh = canonical(buildManifest(null));
    if (fresh === checkedIn) { process.stdout.write('golden-manifest.json is byte-current.\n'); process.exit(0); }
    process.stderr.write('check-manifest: STALE — golden-manifest.json does not match a fresh render. Regenerate: node scripts/golden-bootstrap.cjs --write-manifest\n');
    process.exit(1);
  }

  if (has('--diff')) {
    const { manifest, findings } = threeWayDiff();
    const baseline = reconcile(findings, loadKnownGaps());
    const exit = (baseline.unknown.length === 0 && baseline.phantom.length === 0) ? 0 : 1;
    emit({ manifest, findings, baseline, exit });
    process.exit(exit);
  }

  process.stderr.write('golden-bootstrap: expected one of --diff / --render / --write-manifest / --check-manifest / --dump-tables\n');
  process.exit(1);
}

module.exports = {
  KIT_ROOT, TIERS,
  scanPlaceholders, scanMojibake, referentialRefs,
  parsePhase3Tables, resolveTablesDoc, loadRows, applicable,
  renderFile, renderTier, fillPlaceholders, transformSettings,
  buildManifest, tierManifest, canonical, threeWayDiff, reconcile, loadKnownGaps,
  renderAll: buildManifest, // alias the tests probe for
};

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`golden-bootstrap: ${e && e.stack ? e.stack : e}\n`); process.exit(1); }
}
