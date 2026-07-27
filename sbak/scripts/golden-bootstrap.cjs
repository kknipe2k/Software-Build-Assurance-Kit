#!/usr/bin/env node
// scripts/golden-bootstrap.cjs
//
// THE GOLDEN BOOTSTRAP — the deterministic renderer of the COMPLETE
// Phase-3 scaffold for the two reference calibrations (Lite / Full — M26.D collapsed the
// tiers; Full is the merged default — each greenfield · hybrid locus · non-web · unarmed,
// the advertised defaults), plus the three-way contract diff that mechanizes the drift class
// that shipped a dormant red-gate. Per-tier severity renders from calibration-core.json.
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
//   • Reuses the bake's bounded copyTree (scripts/bake-inheritance.cjs, require.main-guarded)
//     for the rider-1 template-deletion smoke mutation (no second tree-walk).
//   • ONE table parser (parsePhase3Tables) shared by every consumer that reads the tables.
//
// Deterministic: no Date.now() / randomness; two runs are byte-identical (the manifest carries
// a sha256 per rendered file; --check-manifest diffs a fresh render against the checked-in
// golden-manifest.json at repo root). UTF-8 no-BOM asserted on every rendered file (rule #12).
//
// Usage:
//   node scripts/golden-bootstrap.cjs --diff [--json]        report-mode three-way diff
//   node scripts/golden-bootstrap.cjs --registry [--json]    dereference registry: every artifact a
//                                                            shipped gate/validator dereferences has
//                                                            a generation row (M26.A; baseline in
//                                                            fixtures/registry-known-gaps.json)
//   node scripts/golden-bootstrap.cjs --wiring [--json] [--root D]   wiring truth: every
//                                                            enforcement-context gate claim in a
//                                                            shipped doc (repo + release/ twins)
//                                                            maps to a project invoking path or is
//                                                            honestly scoped away (M26.C; baseline in
//                                                            fixtures/wiring-known-gaps.json)
//   node scripts/golden-bootstrap.cjs --render [--out DIR] [--keep]   render the per-tier trees
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

const TIERS = ['lite', 'full']; // fixed order → deterministic. M26.D: two tiers (the collapse) — 'full' is the merged default tier; 'standard' retired as a NAME (calibration-core.json tiers).

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

// ── the dereference registry (M26.A — the structural close of cluster C1) ────────────────
// THE DRIFT CLASS: machinery added after the scaffold tables never got a generation row, so gates
// dereference artifacts nothing generates. KF-01 (prompts/calibration/, G14 — the verifier layer
// dead on arrival in every Standard+ project), KF-23 (docs/release-state.md, G15/G16 — a release
// ladder policing nothing), KF-41 (root README.md). Three instances of ONE cause, and the newest
// gates every time: a gate gets designed, its validator written, its template authored, its row
// added to gates.md — and the one step that makes the artifact EXIST in a project is the step that
// gets forgotten, because nothing checked it.
//
// THE FIX SHAPE: the sibling of a check the kit already trusts. validate-validator-enumeration.cjs
// enforces that every shipped VALIDATOR appears in all three catalogs; this enforces that every
// ARTIFACT a shipped validator dereferences has a generation row. Generation is stronger than prose
// reconciliation — this makes C1 impossible to reintroduce, not merely patched.
//
// DERIVED, NOT HAND-LISTED (the load-bearing property). The artifact set is read out of the
// validators' and the shipped pre-commit hook's OWN dereference sites. A NEW dereferencing
// validator without a row fails this check WITHOUT ANYONE EDITING IT. A hand-maintained list would
// re-create the drift class one level up — the list itself would be the thing that goes stale.
//
// SCOPING (both directions matter — a check that flags everything reads as strict and is useless):
//   • KIT-SELF validators are excluded, detected by their own code: a validator that anchors to
//     `path.resolve(__dirname, '..')` resolves paths against ITS OWN install root, so its literals
//     are kit files, not project artifacts. validate-entry-docs.cjs polices the KIT's entry docs —
//     its 'README.md' is the kit's README. Project-scope validators carry no such anchor: their
//     literals resolve against the project cwd, which is precisely what makes them dereferences.
//   • Kit-AUTHORING paths (templates/, scripts/fixtures/, framework-manifest.json) are not
//     generated artifacts and are excluded by prefix.
//
// HONEST LOCUS (no overclaim): this asserts a generation row EXISTS for each dereferenced artifact.
// It does NOT assert the row's TIER matches the dereferencing validator's tier condition — a
// Standard+-only validator dereferencing an artifact whose row is Lite-only would pass here. That
// tier-parity check is a further step, deliberately not built at M26.A (flagged to M26.D, whose
// tier work re-derives this ground anyway). It also reads STRING LITERALS, not data flow: a path
// assembled at runtime from fragments is invisible to it. Both limits are real; neither is a reason
// to skip the floor — this is the mechanical half, and Stage V remains the adversarial half.
const KIT_ONLY_PREFIXES = [/^templates\//, /^scripts\/fixtures\//, /^framework-manifest\.json$/];

// A validator that resolves paths against its OWN install dir is a kit-self check, not a
// project-artifact consumer. This is a fact about the file's code, not a name on a list.
function isKitSelfAnchored(source) {
  return /path\.resolve\(\s*__dirname\s*,\s*['"]\.\.['"]\s*\)/.test(String(source))
    || /require\.resolve|__dirname\s*,\s*['"]\.\.['"]/.test(String(source));
}

// Project-relative artifact paths a validator hard-codes. Line comments are stripped first: a path
// named only in prose is documentation, not a dereference (the comment-blindness lesson — cluster
// C2 is the same primitive missing at a different call site).
function artifactLiterals(source) {
  const code = String(source).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const re = /['"]((?:docs|prompts|spec|retrospectives)\/[A-Za-z0-9_.\/-]+|project-config\.md|CHANGELOG\.md|ORCHESTRATOR\.md)['"]/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(code)) !== null) {
    const p = m[1].replace(/\/+$/, '');
    if (KIT_ONLY_PREFIXES.some((rx) => rx.test(p))) continue;
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

// The shipped pre-commit hook's staged-path filters name what the gates actually FIRE on — the
// wiring's own statement of the artifact set, and the honest source for artifacts a validator
// receives by argv rather than by a default constant (docs/release-state.md is exactly that shape:
// KF-23 stayed silent for a release because the hook passes staged lists, and a file that never
// exists is never staged, so the fail-closed validator was never invoked).
// ONLY CONCRETE LITERAL PATHS COUNT. The hook's filters also carry PATTERNS that match work
// products the BUILD authors, not artifacts the SCAFFOLD generates — phase docs
// (`docs/build-prompts/M[0-9]{2}…`), retrospectives, audit reports, the test-file globs. Those must
// never be demanded of the row-set: nothing generates them and nothing should. So a token is taken
// only when it is a fully literal path — anchored at `^`, `|` or `(`, terminated by `$`, `|` or `)`,
// and containing no regex metacharacter. `docs/release-state\.md$` qualifies; `docs/audit/.*\.md`
// does not, and is dropped rather than truncated to a bogus `docs/audit/.` artifact.
function hookDereferences(hookText) {
  const out = [];
  const seen = new Set();
  const re = /(^|[|(^])([A-Za-z0-9_\\./-]+?)($|[|)$])/gm;
  let m;
  while ((m = re.exec(String(hookText))) !== null) {
    const raw = m[2];
    if (/[[\]*+?{}]/.test(raw)) continue;          // a pattern, not a literal path
    const p = raw.replace(/\\\./g, '.').replace(/\\/g, '');
    const isDir = /\/$/.test(p);
    const isFile = p.indexOf('/') !== -1 && /\.[A-Za-z0-9]+$/.test(p);
    if (!isDir && !isFile) continue;               // bare words / extensionless fragments
    const artifact = p.replace(/\/+$/, '');
    if (!/^(docs|prompts|spec|retrospectives)\//.test(artifact + '/')) continue;
    if (KIT_ONLY_PREFIXES.some((rx) => rx.test(artifact))) continue;
    if (!seen.has(artifact)) { seen.add(artifact); out.push(artifact); }
  }
  return out;
}

// The derived set: [{ artifact, source }]. Sorted → deterministic.
function dereferenceSites(srcRoot) {
  const rootDir = srcRoot || OPT.srcRoot;
  const found = new Map(); // artifact → Set(source)
  const add = (artifact, source) => {
    if (!found.has(artifact)) found.set(artifact, new Set());
    found.get(artifact).add(source);
  };

  const vdir = path.join(rootDir, 'validators');
  let names = [];
  try { names = fs.readdirSync(vdir).filter((n) => /\.cjs$/.test(n)); } catch (_) { names = []; }
  for (const n of names.sort()) {
    let src;
    try { src = fs.readFileSync(path.join(vdir, n), 'utf8'); } catch (_) { continue; }
    if (isKitSelfAnchored(src)) continue; // kit-self check — its literals are kit files
    for (const a of artifactLiterals(src)) add(a, 'validators/' + n);
  }

  const hookPath = path.join(rootDir, 'templates/dot-githooks/pre-commit');
  try { for (const a of hookDereferences(fs.readFileSync(hookPath, 'utf8'))) add(a, 'templates/dot-githooks/pre-commit'); }
  catch (_) { /* a source root without the hook contributes nothing */ }

  return [...found.keys()].sort().map((artifact) => ({ artifact, sources: [...found.get(artifact)].sort() }));
}

// A dereferenced artifact is COVERED when the row-set generates it, or — for a directory
// dereference like prompts/calibration — generates at least one file beneath it.
function registryCheck(rowsPath) {
  const rows = loadRows(rowsPath || OPT.rowsPath);
  const rowFiles = rows.map((r) => r.file);
  const sites = dereferenceSites();
  const uncovered = [];
  for (const site of sites) {
    const covered = rowFiles.some((f) => f === site.artifact || f.startsWith(site.artifact + '/'));
    if (!covered) uncovered.push(site);
  }
  // Baseline reconciliation, mirroring the --diff contract: KNOWN (declared) stays exit 0,
  // UNKNOWN (out of baseline) fails, PHANTOM (declared but no longer observed) also fails so a
  // closed gap cannot linger as a permanent excuse.
  const declared = loadRegistryKnownGaps();
  const declaredMap = new Map(declared.map((g) => [g.artifact, g]));
  const matched = new Set();
  const known = [], missing = [];
  for (const u of uncovered) {
    const d = declaredMap.get(u.artifact);
    if (d) { matched.add(u.artifact); known.push({ ...u, spec_item: d.spec_item, why: d.why }); }
    else missing.push(u);
  }
  const phantom = declared.filter((g) => !matched.has(g.artifact));
  return { sites, known, missing, phantom };
}
function loadRegistryKnownGaps() {
  try {
    const p = val('--registry-known-gaps', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/registry-known-gaps.json'));
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.gaps || []);
  } catch (_) { return []; }
}

// ── the wiring-truth scan (M26.C — the structural close of cluster C3) ────────────────────
// THE DRIFT CLASS: a shipped doc CLAIMS a validator is an enforcement gate ("a pre-commit
// value check … rejects", "blocks", "enforces") while no executable path a project runs
// invokes it. KF-22 is the exemplar: the operating-mode "pre-commit gate" is claimed in 7
// shipped files and wired into no project hook/workflow/command/script — every project's
// dial validates nothing. The claim is the product; an unwired claim is a lie the user acts on.
//
// THE FIX SHAPE: the sibling of the dereference registry above. --registry asserts every
// dereferenced artifact has a generation ROW; --wiring asserts every enforcement-context CLAIM
// maps to an invoking PATH or is honestly scoped away. Wire-or-de-document, mechanically.
//
// DERIVED, NOT HAND-LISTED (the load-bearing property, inherited from --registry). The claim set
// is read out of the shipped docs' OWN sentences; the wire set out of the project-run paths' OWN
// invocations. A NEW doc claiming a new gate, with no wire, fails this check WITHOUT ANYONE
// EDITING IT. A hand list would re-create the drift one level up.
//
// SCOPING (both directions matter):
//   • KIT-SELF validators are excused, detected by their OWN code (isKitSelfAnchored — the same
//     primitive --registry trusts): a validator that resolves paths against its install root
//     polices the KIT, and its doc claim is satisfied by a KIT wire (bake-and-test.yml,
//     verify-local.cjs), not a project one. validate-entry-docs is exactly this.
//   • A project-scope validator honestly LABELLED kit-only in the claim line (the KF-36 shape:
//     an enumeration check that reconciles the kit's catalogs, dereferencing a template no
//     project has) is likewise excused — the label IS the de-documentation. A line that neither
//     wires nor labels is the defect.
//   • WIRED means a PROJECT-run path: templates/dot-githooks/pre-commit, templates/dot-github/
//     workflows/, templates/dot-claude/commands/, templates/scripts/. A KIT-side wire
//     (.githooks/, scripts/verify-local.cjs) does NOT satisfy a project-facing claim — that
//     distinction IS KF-22 (operating-mode has a kit wire and no project wire).
//
// HONEST LOCUS (no overclaim): this maps a claim that NAMES its validator (validators/<x>.cjs)
// to an invoking path. A gate claim phrased in free prose WITHOUT naming its executable is
// invisible to it — it reads greppable filenames in an enforcement context, not enforcement
// SEMANTICS. It also treats presence-in-a-project-path as "wired" (a stanza that is present but
// guarded-out for a tier still counts) — the tier-parity refinement is deferred, as --registry's
// is. Both limits are real; the mechanical half stands and Stage V is the adversarial half.
// SHIPPED SURFACE = BOTH TREES: release/ is the payload (scrubbed twins ship IN PLACE OF their
// repo copies), so a claim fixed only in the workshop copy still ships. The surface includes the
// twins; a repo-only fix fails the twin's line.
// The template-tree claim docs that ship from templates/ directly (they have NO scrubbed release/
// twin — they render into a project). The framework docs (BUILD-PLAYBOOK, FRAMEWORK-CONFIG,
// STAGE-PROMPT-PROTOCOL, PROCESS-VALIDATION, PHASES, SCAFFOLD-TABLES, …) are NOT hand-listed here —
// they are DERIVED from release-manifest.json below, so a new claim-bearing framework doc cannot be
// silently missed (the same "derived, not hand-listed" property --registry has; the first cut of
// this scan hand-listed 8 docs and MISSED PROCESS-VALIDATION + STAGE-PROMPT-PROTOCOL, both of which
// carry validator gate claims — the wiring-truth analog of the C1 drift this milestone closes).
const WIRING_DOC_SET = [
  'templates/PROJECT-CLAUDE.md', 'templates/CALIBRATION-INTERVIEW.md', 'templates/project-config.md',
  'validators/README.md',
];
const WIRING_ENFORCE_RE = /(pre-commit|pre-push|\bCI\b|blocks?\b|rejects?\b|enforces?\b|fails? any|\bgate\b)/i;
const WIRING_KITONLY_RE = /kit-only|kit self-sync|kit self-check|reconciles the kit|kit's own catalog/i;

// The shipped-doc surface: the FULL shipped framework-doc payload. Derived from
// release-manifest.json — every `release/*.md` scrubbed twin (the payload form) AND its repo
// counterpart (the workshop form): a claim fixed in one form but not the other strands the payload,
// so BOTH are scanned (the lockstep property T12 pins). Plus the four template claim docs that ship
// without a twin. Returned repo-relative (e.g. 'release/BUILD-PLAYBOOK.md') so a twin omission is
// visible. No hand-listed framework-doc set to drift.
function wiringSurface(rootDir) {
  const root = rootDir || OPT.srcRoot || KIT_ROOT;
  const out = [];
  const seen = new Set();
  const add = (rel) => { if (!seen.has(rel) && fs.existsSync(path.join(root, rel))) { seen.add(rel); out.push(rel); } };
  try {
    const man = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
    for (const f of (man.files || [])) {
      const src = String(f.src || '');
      if (!/^release\/.+\.md$/.test(src)) continue;
      add(src);                             // the shipped scrubbed twin
      add(src.replace(/^release\//, ''));   // its repo counterpart (lockstep)
    }
  } catch (_) { /* no manifest at this root → the template claim docs below are the whole surface */ }
  for (const rel of WIRING_DOC_SET) add(rel);
  return out;
}

// Derive the enforcement-context claims: a doc line naming validators/<x>.cjs in an enforcement
// context, NOT self-labelled kit-only. Returns [{validator, file, line}].
function enforcementClaims(rootDir) {
  const root = rootDir || OPT.srcRoot || KIT_ROOT;
  const claims = [];
  for (const rel of wiringSurface(root)) {
    let txt;
    try { txt = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { continue; }
    txt.split(/\r?\n/).forEach((line, i) => {
      if (!WIRING_ENFORCE_RE.test(line)) return;
      if (WIRING_KITONLY_RE.test(line)) return; // honestly scoped away — the label IS the fix
      const names = line.match(/validators\/([a-z0-9-]+)\.cjs/g);
      if (!names) return;
      for (const n of new Set(names)) claims.push({ validator: n.replace('validators/', ''), file: rel, line: i + 1 });
    });
  }
  return claims;
}

// The wire set: validator basenames invoked in a PROJECT-run path. Kit-side paths are excluded
// deliberately — a kit wire does not satisfy a project-facing claim (this is KF-22's substance).
function projectWires(rootDir) {
  const root = rootDir || OPT.srcRoot || KIT_ROOT;
  const wired = new Set();
  const eat = (text) => { const m = String(text).match(/validators\/([a-z0-9-]+)\.cjs/g) || []; for (const h of m) wired.add(h.replace('validators/', '')); };
  const readIf = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; } };
  const walk = (dir, re) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, re);
      else if (re.test(e.name)) eat(readIf(p));
    }
  };
  eat(readIf(path.join(root, 'templates/dot-githooks/pre-commit')));
  walk(path.join(root, 'templates/dot-github'), /\.ya?ml$/);
  walk(path.join(root, 'templates/dot-claude/commands'), /\.md$/);
  walk(path.join(root, 'templates/scripts'), /\.cjs$/);
  return wired;
}

// A claim is COVERED when its validator is project-wired, OR kit-self-anchored (kit-only by its
// own code — excused, its claim maps to a kit wire). Everything else is uncovered → reconciled
// against the baseline exactly as --registry does (KNOWN stays 0, UNKNOWN + PHANTOM fail).
function isKitSelf(rootDir, validator) {
  try { return isKitSelfAnchored(fs.readFileSync(path.join(rootDir || OPT.srcRoot || KIT_ROOT, 'validators', validator), 'utf8')); }
  catch (_) { return false; }
}
function wiringCheck(rootDir) {
  const root = rootDir || OPT.srcRoot || KIT_ROOT;
  const claims = enforcementClaims(root);
  const wired = projectWires(root);
  const surface = wiringSurface(root);
  // Collapse to one entry per claimed validator, carrying its claim sites.
  const byValidator = new Map();
  for (const c of claims) {
    if (!byValidator.has(c.validator)) byValidator.set(c.validator, { validator: c.validator, sites: [] });
    byValidator.get(c.validator).sites.push(c.file + ':' + c.line);
  }
  const uncovered = [];
  for (const v of [...byValidator.keys()].sort()) {
    const entry = byValidator.get(v);
    if (wired.has(v)) continue;                 // has a project wire
    if (isKitSelf(root, v)) continue;           // kit-only by its own code — claim maps to a kit wire
    uncovered.push({ validator: v, sites: entry.sites.sort() });
  }
  const declared = loadWiringKnownGaps();
  const declaredMap = new Map(declared.map((g) => [g.validator, g]));
  const matched = new Set();
  const known = [], unwired = [];
  for (const u of uncovered) {
    const d = declaredMap.get(u.validator);
    if (d) { matched.add(u.validator); known.push({ ...u, spec_item: d.spec_item, why: d.why }); }
    else unwired.push(u);
  }
  const phantom = declared.filter((g) => !matched.has(g.validator));
  return { surface, claims: claims.length, wired: [...wired].sort(), known, unwired, phantom };
}
function loadWiringKnownGaps() {
  try {
    const p = val('--wiring-known-gaps', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/wiring-known-gaps.json'));
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.gaps || []);
  } catch (_) { return []; }
}

// ── referenced ⇒ present (M27.D — the structural close of KF-48 instance 1) ───────────────
// THE DRIFT CLASS, third instance. --registry asks "does every artifact a VALIDATOR
// dereferences have a generation row?" --wiring asks "does every gate CLAIM map to an
// invoking path?" Both missed the simplest question of all: does every validator the
// GENERATED LAYER NAMES BY NAME actually get generated? It did not. The md2page trial met
// the answer as a user does — a project whose own .githooks/pre-commit invoked twelve
// validators while its scaffold shipped four, and whose `[ -f ]` guards turned the other
// eight into silent passes. Every gate read as configured; eight of twelve were dead.
//
// DERIVED, NOT HAND-LISTED (the property this whole family is built on). The reference set is
// read out of the GENERATED ARTIFACTS' OWN TEXT — each row's template source. A new generated
// doc that names a new validator fails this check WITHOUT ANYONE EDITING IT. The hand list is
// the drift class; a hand list of what must not drift is the same class one level up.
//
// THE KIT-ONLY EXEMPTION IS READ AT THE REFERENCE SITE, never declared in a baseline (owner
// ruling, 2026-07-24). A project must not inherit a validator it can never run as a gate, and
// the honest way to say so is on the line that names it: "kit-only, not copied into projects".
// That label IS the de-documentation — the same primitive --wiring trusts (WIRING_KITONLY_RE).
// A hand-baselined exemption would let a silent omission wear the same clothes as an honest
// one, which is precisely the confusion this check exists to remove.
//
// HONEST LOCUS (no overclaim): it asserts a generation ROW EXISTS for every referenced
// validator, and — via `applicable()` — that the row is live at some tier. It does NOT assert
// the row's tier matches the tier the naming artifact claims for it (the same limit --registry
// carries and states). It reads NAMES in text, so a validator invoked through a path assembled
// at runtime is invisible to it. Both limits are real; Stage V remains the adversarial half.
const KITONLY_REF_RE = /kit-only|not copied into projects/i;

// [{ validator, sources:[file:line], labelled, total }] over the generated layer, sorted.
function generatedRefs(rowsPath, srcRoot) {
  const rows = loadRows(rowsPath || OPT.rowsPath);
  const root = srcRoot || OPT.srcRoot;
  const found = new Map();
  for (const row of rows) {
    if (!row.template) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, row.template), 'utf8'); } catch (_) { continue; }
    normalize(text).split('\n').forEach((line, i) => {
      const names = line.match(/validators\/[a-z0-9-]+\.cjs/g);
      if (!names) return;
      const labelled = KITONLY_REF_RE.test(line);
      for (const n of new Set(names)) {
        if (!found.has(n)) found.set(n, { validator: n, sources: [], labelled: 0, total: 0 });
        const e = found.get(n);
        e.sources.push(row.file + ':' + (i + 1));
        e.total++;
        if (labelled) e.labelled++;
      }
    });
  }
  return [...found.keys()].sort().map((v) => {
    const e = found.get(v);
    return { validator: v, sources: e.sources.sort(), labelled: e.labelled, total: e.total };
  });
}

function generatedRefsCheck(rowsPath) {
  const rows = loadRows(rowsPath || OPT.rowsPath);
  const rowFiles = new Set(rows.map((r) => r.file));
  const sites = generatedRefs(rowsPath);
  const exempt = [], uncovered = [];
  for (const s of sites) {
    if (rowFiles.has(s.validator)) continue;
    // Kit-only ONLY when every one of its reference lines says so. One unlabelled site and
    // the project is being told it has a gate it will never receive.
    if (s.total > 0 && s.labelled === s.total) { exempt.push(s); continue; }
    uncovered.push(s);
  }
  const declared = loadGeneratedRefsKnownGaps();
  const declaredMap = new Map(declared.map((g) => [g.validator, g]));
  const matched = new Set();
  const known = [], missing = [];
  for (const u of uncovered) {
    const d = declaredMap.get(u.validator);
    if (d) { matched.add(u.validator); known.push({ ...u, spec_item: d.spec_item, why: d.why }); }
    else missing.push(u);
  }
  const phantom = declared.filter((g) => !matched.has(g.validator));
  return { sites, exempt, known, missing, phantom };
}
function loadGeneratedRefsKnownGaps() {
  try {
    const p = val('--generated-refs-known-gaps', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/generated-refs-known-gaps.json'));
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.gaps || []);
  } catch (_) { return []; }
}

// ── the generated-docs CI-claims linter (M27.D — KF-48 instance 2) ────────────────────────
// --wiring's GENERATED-LAYER SIBLING. --wiring maps a claim that names a VALIDATOR to an
// invoking path. This maps a claim that promises CI ENFORCEMENT to a real workflow step.
// KF-48's exemplar: templates/sessions.md said "CI enforces via diff check" while
// docs/sessions.md was absent from append-only-ledger.yml's LEDGERS — a ledger promised
// enforcement by a workflow that had never heard of it, in a doc every project receives.
//
// TWO FAILURE MODES, both reported:
//   • UNRESOLVED — the claim names a subject (an artifact path, or "this file" meaning the
//     doc's own generated path) that NO generated workflow covers. The sessions.md shape.
//   • UNCONDITIONAL — the claim resolves, but its covering workflow is RISK-ARMED (it
//     generates only when a risk trigger is declared) and the claim line does not say so.
//     "CI enforces append-only" is simply false in every project that declared no trigger;
//     a conditional truth stated unconditionally is the same lie with better manners.
//
// SUBJECT SELECTION (deliberately narrow — a check that flags everything reads as strict and
// is useless). A CI-enforcement sentence is dense with CITATIONS: "append-only by Hard Rule
// (per `CLAUDE.md` §4 rule 4) … CI enforces via diff check" names CLAUDE.md, which the claim
// does not promise CI enforces. So the subject set is the named artifacts under `docs/` — the
// project-ledger home — plus, when the line says "this file", the doc's OWN generated path
// (the sessions.md shape, where the subject is never spelled out because the reader is
// standing in it). Framework refs (`sbak/…`), root files and template paths are citations.
//
// HONEST LOCUS (no overclaim): it adjudicates claims that name a `docs/` artifact or their own
// file. Every CI-enforcement line is COUNTED, but one naming no such subject is free prose and
// is not adjudicated — the same limit --wiring states about claims naming no executable. It
// reads a workflow's TEXT for coverage; it does not execute the workflow or prove a step passes.
const CLAIM_CI_RE = /(CI[ -]?enforce|enforced by CI|CI[ -]?enforced)/i;
const CLAIM_ARMED_RE = /risk trigger|declared risk|risk-armed|when a trigger|armed/i;
const CLAIM_PATH_RE = /`(docs\/[A-Za-z0-9_.\/-]+\.(?:md|json|ya?ml))`/g;

// The generated workflows, by row: { file, text, armed }.
function generatedWorkflows(rowsPath, srcRoot) {
  const rows = loadRows(rowsPath || OPT.rowsPath);
  const root = srcRoot || OPT.srcRoot;
  const out = [];
  for (const row of rows) {
    if (!/^\.github\/workflows\/.+\.ya?ml$/.test(row.file) || !row.template) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, row.template), 'utf8'); } catch (_) { continue; }
    out.push({ file: row.file, text: normalize(text), armed: Boolean(row.risk_armed) });
  }
  return out;
}

function claimsCheck(rowsPath) {
  const rows = loadRows(rowsPath || OPT.rowsPath);
  const root = OPT.srcRoot;
  const workflows = generatedWorkflows(rowsPath);
  const claims = [];
  for (const row of rows) {
    if (!row.template || !/\.md$/.test(row.template)) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, row.template), 'utf8'); } catch (_) { continue; }
    normalize(text).split('\n').forEach((line, i) => {
      if (!CLAIM_CI_RE.test(line)) return;
      const subjects = [];
      let m;
      CLAIM_PATH_RE.lastIndex = 0;
      while ((m = CLAIM_PATH_RE.exec(line)) !== null) subjects.push(m[1]);
      // "this file" binds the claim to the doc's OWN generated path — the sessions.md shape,
      // where the subject is never spelled out because the reader is standing in it.
      if (subjects.length === 0 && /\bthis file\b/i.test(line)) subjects.push(row.file);
      // `full` is what the arming test reads; `text` is a truncated DISPLAY string. Keeping
      // them separate is load-bearing: testing the regex against the truncated form made a
      // correctly-narrowed claim read as unconditional whenever its condition sat past the
      // 160th character — a linter that lies about long lines is worse than no linter.
      claims.push({ file: row.template, generated: row.file, line: i + 1, subjects, full: line, text: line.trim().slice(0, 160) });
    });
  }

  const unresolved = [], unconditional = [];
  for (const c of claims) {
    if (c.subjects.length === 0) continue; // names no subject — free prose, invisible (stated limit)
    for (const subject of c.subjects) {
      const covering = workflows.filter((w) => w.text.indexOf(subject) !== -1);
      if (covering.length === 0) { unresolved.push({ ...c, subject }); continue; }
      if (covering.every((w) => w.armed) && !CLAIM_ARMED_RE.test(c.full)) {
        unconditional.push({ ...c, subject, workflow: covering.map((w) => w.file).join(', ') });
      }
    }
  }

  const declared = loadClaimsKnownGaps();
  const keyOf = (x) => `${x.file}:${x.line}:${x.subject}`;
  const declaredMap = new Map(declared.map((g) => [`${g.file}:${g.line}:${g.subject}`, g]));
  const matched = new Set();
  const known = [], failing = [];
  for (const u of unresolved.concat(unconditional)) {
    const d = declaredMap.get(keyOf(u));
    if (d) { matched.add(keyOf(u)); known.push({ ...u, spec_item: d.spec_item, why: d.why }); }
    else failing.push(u);
  }
  const phantom = declared.filter((g) => !matched.has(`${g.file}:${g.line}:${g.subject}`));
  return { claims: claims.length, workflows: workflows.map((w) => w.file), known, unresolved: failing, phantom };
}
function loadClaimsKnownGaps() {
  try {
    const p = val('--claims-known-gaps', path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/claims-known-gaps.json'));
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.gaps || []);
  } catch (_) { return []; }
}

// ── row-set + fixtures ───────────────────────────────────────────────────────────────────
function loadRows(rowsPath) {
  const raw = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  return Array.isArray(raw) ? raw : raw.rows;
}
// The calibration core (M26.D) — the single machine authority for per-tier severity (and the
// tier vocabulary itself). Loaded lazily + require-safe: a fixture root without the core still
// renders (the severity fill just stays absent and the wiring placeholder scan flags it — a
// missing schema is a loud finding, never a silent default).
let CORE_MEMO;
function loadCore() {
  if (CORE_MEMO !== undefined) return CORE_MEMO;
  try { CORE_MEMO = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'calibration-core.json'), 'utf8')); }
  catch (_) { CORE_MEMO = null; }
  return CORE_MEMO;
}
// Answer-sets stay pure test fixtures; the SEVERITY fill is injected from calibration-core.json
// (severity is schema-owned — a hand-typed severity value in a fixture would re-create the C4
// hand-carried-fact class this stage exists to kill). warn -> '--warn'; block -> '' (no flag =
// the validators' blocking default).
function loadAnswers(tier) {
  const answers = JSON.parse(fs.readFileSync(path.join(OPT.fixturesDir, tier + '.json'), 'utf8'));
  const core = loadCore();
  if (core && core.severity && core.tiers) {
    const tierName = Object.keys(core.tiers).find((n) => core.tiers[n].row_token === tier);
    if (tierName && !Object.prototype.hasOwnProperty.call(answers.fill || {}, 'VALIDATOR_SEVERITY_FLAG')) {
      answers.fill = answers.fill || {};
      answers.fill.VALIDATOR_SEVERITY_FLAG = core.severity[tierName] === 'block' ? '' : '--warn';
    }
  }
  return answers;
}
// The reference calibration is greenfield · hybrid · non-web · UNARMED (risk_triggers []). A row
// applies to `tier` iff its tier list includes it, it is not web-only, its locus (if constrained)
// includes hybrid, and it is not risk-armed (armed rows generate only on a declared trigger —
// scripts/calibration-derive.cjs derives that variant; the reference render excludes them).
function applicable(row, tier) {
  if (row.deliverable === 'web') return false;
  if (Array.isArray(row.locus) && !row.locus.includes('hybrid')) return false;
  if (!Array.isArray(row.tiers) || !row.tiers.includes(tier)) return false;
  if (row.risk_armed) return false;
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
      // .githooks/ rows are EXECUTED by git, not just read: without the exec bit POSIX
      // git silently ignores the rendered hook (a hint, then the commit proceeds
      // ungated — the M26 Linux-CI finding). Downstream copyFileSync consumers stamp
      // the SOURCE's mode, so the bit must exist at the render, not be patched later.
      if (rec.file.startsWith('.githooks/') && process.platform !== 'win32') fs.chmodSync(outAbs, 0o755);
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
  const manifest = { note: 'Reference calibration: greenfield / hybrid locus / non-web. Rendered by scripts/golden-bootstrap.cjs - DERIVED, do not hand-edit; regenerate with: node scripts/golden-bootstrap.cjs --write-manifest. PLACEHOLDER-SCAN SCOPE (deliberate narrowing, honest locus): only render:wiring rows - .claude/settings.json, scripts/verify-local.cjs, .githooks/pre-commit, .github/workflows/pr-smoke.yml, .github/workflows/release.yml, LICENSE - are scanned for a surviving {{PLACEHOLDER}} and MUST be zero (these are the deterministic files the bootstrap is contractually required to fill from discovery answers - e.g. LICENSE from the owner-supplied holder/year/type). render:copy form/doc templates (identity, scope, the prompts/ retrospective + phase-doc templates, etc.) ship VERBATIM with their {{placeholders}} intact - they are filled DURING the build, not at scaffold time (the scaffold-not-interview honest locus, mirroring bake-inheritance). ENCODING (UTF-8 no-BOM + mojibake) is scanned on EVERY rendered file regardless of render mode.', tiers: {} };
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

// ── the three-way diff (findings aggregated across the tiers) ───────────────────────
function threeWayDiff() {
  const rows = loadRows(OPT.rowsPath);
  const rowFiles = new Set(rows.map((r) => r.file));

  // Render every tier into a temp tree (needed for referential + unrendered).
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
    process.stdout.write(`rendered ${TIERS.length} reference calibrations into ${dest}\n`);
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

  if (has('--registry')) {
    const { sites, known, missing, phantom } = registryCheck();
    const exit = (missing.length === 0 && phantom.length === 0) ? 0 : 1;
    if (OPT.json) process.stdout.write(JSON.stringify({ sites, known, missing, phantom, exit }));
    else {
      const L = ['golden-bootstrap — dereference registry (every gate/validator-dereferenced artifact has a generation row)'];
      L.push('  honest locus: asserts a row EXISTS; does NOT assert the row\'s TIER matches the dereferencing validator\'s.');
      L.push(`  derived dereference sites: ${sites.length}`);
      for (const s of sites) L.push(`    · ${s.artifact}  <- ${s.sources.join(', ')}`);
      L.push(`  KNOWN gaps (in registry-known-gaps.json — emptied by adding rows, never by loosening): ${known.length}`);
      for (const k of known) L.push(`    · [${k.spec_item}] ${k.artifact}  <- ${k.sources.join(', ')}`);
      L.push(`  DEREFERENCED WITHOUT A GENERATION ROW (out of baseline → FAIL): ${missing.length}`);
      for (const m of missing) L.push(`    ✗ ${m.artifact} — dereferenced by ${m.sources.join(', ')} but nothing generates it`);
      L.push(`  PHANTOM baseline entries (declared but no longer observed → FAIL): ${phantom.length}`);
      for (const p of phantom) L.push(`    ? [${p.spec_item}] ${p.artifact}`);
      L.push(`  => exit ${exit}`);
      process.stdout.write(L.join('\n') + '\n');
    }
    process.exit(exit);
  }

  if (has('--generated-refs')) {
    const { sites, exempt, known, missing, phantom } = generatedRefsCheck();
    const exit = (missing.length === 0 && phantom.length === 0) ? 0 : 1;
    if (OPT.json) process.stdout.write(JSON.stringify({ sites, exempt, known, missing, phantom, exit }));
    else {
      const L = ['golden-bootstrap — referenced ⇒ present (every validator the GENERATED layer names has a generation row)'];
      L.push('  honest locus: asserts a ROW EXISTS; does NOT assert the row\'s tier matches the naming artifact\'s claim. Reads names in text, not runtime-assembled paths.');
      L.push(`  validators referenced by generated artifacts: ${sites.length}`);
      for (const s of sites) L.push(`    · ${s.validator}  <- ${s.sources.slice(0, 3).join(', ')}${s.sources.length > 3 ? ` (+${s.sources.length - 3})` : ''}`);
      L.push(`  KIT-ONLY, excused by the label on EVERY reference line (derived at the site, never baselined): ${exempt.length}`);
      for (const e of exempt) L.push(`    · ${e.validator}  (${e.labelled}/${e.total} lines labelled)`);
      L.push(`  KNOWN gaps (in generated-refs-known-gaps.json — emptied by adding rows, never by loosening): ${known.length}`);
      for (const k of known) L.push(`    · [${k.spec_item}] ${k.validator} — ${k.why}`);
      L.push(`  NAMED BY A GENERATED ARTIFACT, NEVER GENERATED (out of baseline → FAIL): ${missing.length}`);
      for (const m of missing) L.push(`    ✗ ${m.validator} — named at ${m.sources.slice(0, 3).join(', ')} but nothing generates it (the hook's [ -f ] guard would skip it)`);
      L.push(`  PHANTOM baseline entries (declared but no longer observed → FAIL): ${phantom.length}`);
      for (const p of phantom) L.push(`    ? [${p.spec_item}] ${p.validator}`);
      L.push(`  => exit ${exit}`);
      process.stdout.write(L.join('\n') + '\n');
    }
    process.exit(exit);
  }

  if (has('--claims')) {
    const { claims, workflows, known, unresolved, phantom } = claimsCheck();
    const exit = (unresolved.length === 0 && phantom.length === 0) ? 0 : 1;
    if (OPT.json) process.stdout.write(JSON.stringify({ claims, workflows, known, unresolved, phantom, exit }));
    else {
      const L = ['golden-bootstrap — generated-docs CI-claims linter (every "CI enforces X" claim resolves to a real workflow step)'];
      L.push('  honest locus: adjudicates claims naming a `docs/` artifact or their own file ("this file"); citations (sbak/, root files, templates) are not subjects, and a claim naming no subject is counted but not adjudicated. Reads workflow TEXT, does not execute it.');
      L.push(`  CI-enforcement claims scanned in the generated doc layer: ${claims}`);
      L.push(`  generated workflows available to resolve against: ${workflows.join(', ') || '(none)'}`);
      L.push(`  KNOWN gaps (in claims-known-gaps.json — emptied by wiring or narrowing, never by loosening): ${known.length}`);
      for (const k of known) L.push(`    · [${k.spec_item}] ${k.file}:${k.line} (${k.subject}) — ${k.why}`);
      L.push(`  CLAIMED CI ENFORCEMENT, UNRESOLVED OR UNCONDITIONAL (out of baseline → FAIL): ${unresolved.length}`);
      for (const u of unresolved) {
        L.push(u.workflow
          ? `    ✗ ${u.file}:${u.line} — claims CI enforcement of ${u.subject} unconditionally, but ${u.workflow} is RISK-ARMED (generates only on a declared trigger). Name the condition or the claim is false in every unarmed project.`
          : `    ✗ ${u.file}:${u.line} — claims CI enforcement of ${u.subject}, which NO generated workflow covers (wire it, or delete the claim)`);
      }
      L.push(`  PHANTOM baseline entries (declared but no longer observed → FAIL): ${phantom.length}`);
      for (const p of phantom) L.push(`    ? [${p.spec_item}] ${p.file}:${p.line}`);
      L.push(`  => exit ${exit}`);
      process.stdout.write(L.join('\n') + '\n');
    }
    process.exit(exit);
  }

  if (has('--wiring')) {
    const root = val('--root', OPT.srcRoot || KIT_ROOT);
    const { surface, claims, wired, known, unwired, phantom } = wiringCheck(root);
    const exit = (unwired.length === 0 && phantom.length === 0) ? 0 : 1;
    if (OPT.json) process.stdout.write(JSON.stringify({ surface, claims, wired, known, unwired, phantom, exit }));
    else {
      const L = ['golden-bootstrap — wiring truth (every enforcement-context gate claim maps to an invoking path or is honestly scoped away)'];
      L.push('  honest locus: maps a claim that NAMES its validator to a PROJECT-run path; free-prose claims naming no executable are invisible.');
      L.push(`  shipped-doc surface (repo + release/ twins): ${surface.length} file(s)`);
      L.push(`  enforcement-context claims scanned: ${claims}`);
      L.push(`  KNOWN gaps (in wiring-known-gaps.json — emptied by adding wires / labels, never by loosening): ${known.length}`);
      for (const k of known) L.push(`    · [${k.spec_item}] ${k.validator}  claimed at ${k.sites.join(', ')} — ${k.why}`);
      L.push(`  CLAIMED-AS-A-GATE BUT UNWIRED (out of baseline → FAIL): ${unwired.length}`);
      for (const u of unwired) L.push(`    ✗ ${u.validator} — claimed a gate at ${u.sites.join(', ')} but no project path invokes it (wire it or de-document)`);
      L.push(`  PHANTOM baseline entries (declared but no longer observed → FAIL): ${phantom.length}`);
      for (const p of phantom) L.push(`    ? [${p.spec_item}] ${p.validator}`);
      L.push(`  => exit ${exit}`);
      process.stdout.write(L.join('\n') + '\n');
    }
    process.exit(exit);
  }

  if (has('--diff')) {
    const { manifest, findings } = threeWayDiff();
    const baseline = reconcile(findings, loadKnownGaps());
    const exit = (baseline.unknown.length === 0 && baseline.phantom.length === 0) ? 0 : 1;
    emit({ manifest, findings, baseline, exit });
    process.exit(exit);
  }

  process.stderr.write('golden-bootstrap: expected one of --diff / --registry / --generated-refs / --claims / --wiring / --render / --write-manifest / --check-manifest / --dump-tables\n');
  process.exit(1);
}

module.exports = {
  KIT_ROOT, TIERS,
  scanPlaceholders, scanMojibake, referentialRefs,
  parsePhase3Tables, resolveTablesDoc, loadRows, applicable,
  dereferenceSites, registryCheck, artifactLiterals, hookDereferences, isKitSelfAnchored,
  generatedRefs, generatedRefsCheck, claimsCheck, generatedWorkflows,
  wiringCheck, enforcementClaims, projectWires, wiringSurface,
  renderFile, renderTier, fillPlaceholders, transformSettings,
  buildManifest, tierManifest, canonical, threeWayDiff, reconcile, loadKnownGaps,
  renderAll: buildManifest, // alias the tests probe for
};

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`golden-bootstrap: ${e && e.stack ? e.stack : e}\n`); process.exit(1); }
}
