#!/usr/bin/env node
// @kit-version 0.2.0
// validators/validate-entry-docs.cjs
//
// THE DOC-SYNC ENGINE — one source of truth for what the kit SAYS about
// itself. The kit's entry docs make factual claims about the kit — its protocol version, gate
// counts, schema count, validator/hook counts, calibration-interview shape — and every one of
// those claims was hand-stated, so every one drifted (framework-review §2.2: the front door
// `CLAUDE.md:46` claimed "5 hard + 5 soft" against 16+5; README pinned a protocol three versions
// stale). This engine derives-or-binds every such fact into `framework-manifest.json`, then scans
// the entry-doc set for assertions of those facts and reports every mismatch.
//
// ── THE DESIGN PRINCIPLE (learned three times) ───────────────────────────────────────────────
//   DERIVE where a canonical machine source exists; BIND where it doesn't; NEVER maintain two
//   hand-stated copies. Every manifest field is tagged:
//     • derived    — parsed live from a machine source (a glob, the protocol changelog).
//     • bound      — re-parsed from its HOME DOC's structure (the gate line, the schema catalog,
//                    the interview headings) so the manifest cannot silently diverge from it.
//     • referenced — read LIVE from golden-manifest.json (the scaffold counts; never copied).
//   A field with NEITHER a derivation NOR a binding is a defect — the drift class with an extra
//   step. `selfCheck()` re-derives every field and compares to the stored value: the manifest
//   CANNOT ROT (a stale stored value fails its own check).
//
// ── ABSORBS THE OLD PROTOCOL-PIN ASSERT ──────────────────────────────────────────────────────
//   The old scripts/smoke.cjs protocol-pin assert bound CLAUDE.md's protocol pin to the
//   protocol changelog by hand. The `version` value-class now covers CLAUDE.md, so that pin↔
//   changelog binding lives in ONE home (this engine). The retired assert points here.
//
// ── EXTEND, DON'T FORK ───────────────────────────────────────────────────────────────────────
//   • validators/lib/fenced-block.cjs `normalize` for CRLF/BOM tolerance (never a new matcher).
//   • validate-reconciliation.cjs `stagedAddedLineRanges` for the ledger-class staged-added mode
//     (police only lines this commit ADDS; frozen history is never re-litigated — the
//     frozen-history directive mechanized, NOT a blanket exemption).
//   • The KNOWN/UNKNOWN/PHANTOM baseline reconciliation mirrors scripts/golden-bootstrap.cjs.
//
// ── THE IDENTITY-CLASS SEAM (design, not build) ──────────────────────────────────────────────
//   The value-class table is DATA-DRIVEN: a class = { name, field, docSet, find }. Per-class
//   doc-set scope is the load-bearing half — the identity sweep added the name/term
//   classes (`product_name`, `tier_terms`, `role_terms`) whose docSet is templates/ + the
//   packaging docs, docs the version/count classes here must NEVER scan. Adding such a
//   class needs zero core change (the three classes are pure data-table entries; the engine
//   core is byte-unchanged, proven by scripts/smoke.cjs's seam-integrity hash guard).
//   DOC-SET LOCUS (disclosed, like the version class's on-line-keyword locus): doc-sets are CURATED
//   FILE ARRAYS, not directory globs — scanTree reads one file per docSet entry. A NEW file bearing
//   a policed name/term must be ADDED to its class's list (glob doc-sets are unbuilt — not ratified;
//   they would trip the seam-integrity guard by design; propose one if wanted).
//
// ── HONEST LOCUS (no overclaim) ──────────────────────────────────────────────────────────────
//   This polices SPECIFIC VALUE CLASSES in a SPECIFIC DOC SET — not "docs can't drift". It is a
//   line-anchored recognizer, not an NLP/HTML parser (HTML text nodes are scanned as raw lines —
//   the kit is dependency-free). The adversarial half stays Stage V, as with every floor here.
//
// ── THE TWO-LEVEL SHIPPED LAYOUT (--surface; M25.F, gate-1 ratified 2026-07-15) ─────────────
//   The payload layout is INVARIANT across every shipped context (public repo, release ZIP,
//   adopted repo): the kit lives under sbak/ with CLAUDE.md at the surface root, so this file
//   always sits at <surface>/sbak/validators/ and both roots derive from __dirname — KIT_ROOT
//   (sbak/, the fact derivations) and SURFACE_ROOT (its parent, the repo-identity docs).
//   The repo-identity doc set (SURFACE_DOCS) is policed ONLY under the explicit `--surface`
//   flag: on the PUBLIC repo those root files are the kit's own and CI always passes the flag;
//   in an ADOPTED repo the same root paths are the HOST project's files, which this engine
//   must never police — an auto-detection heuristic would fail open there, so the flag is
//   explicit by design. Without --surface the skipped docs are printed BY NAME (explicit
//   narrowing, never silent); with it, the run prints "surface docs: policed (N)" so CI can
//   prove the flag activated. CLAUDE.md is the one surface-root doc policed in EVERY mode —
//   it ships in every context and is the kit's own file wherever the payload lands.
//
// Usage:
//   node validators/validate-entry-docs.cjs --report [--json]   scan + reconcile vs known-drift.json
//   node validators/validate-entry-docs.cjs [--check]           strict (baseline empty => any find fails)
//   node validators/validate-entry-docs.cjs --surface            also police the surface-root repo-identity docs (the public repo's CI mode)
//   node validators/validate-entry-docs.cjs --self-check        the manifest derived-vs-stored rot check
//   node validators/validate-entry-docs.cjs --write-manifest    (re)write payload-root framework-manifest.json
//
// Exit 0 = baseline-exact (report) / no drift (strict) / manifest current. Exit 1 = an out-of-
// baseline (UNKNOWN) find, a PHANTOM baseline entry, a rotted manifest, or a usage/IO error.
// Dependency-free (Node builtins + the kit's own lib). .cjs = always CommonJS.

'use strict';

const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.resolve(__dirname, '..');
// The SURFACE ROOT — one level above the payload root. In the shipped two-level layout
// (M25.F) the repo-identity entry docs (README, the docs/ pages, …) live here, above the
// payload's sbak/. In the workshop's flat release/ staging KIT_ROOT and SURFACE_ROOT are
// release/ and its parent; surface RESOLUTION is exercised only on the assembled tree (the
// public repo's CI), never from the staging dir — the workshop use is --write-manifest,
// which derives facts from KIT_ROOT and never reads SURFACE_ROOT (see the --surface header).
const SURFACE_ROOT = path.resolve(__dirname, '..', '..');
const { normalize } = require(path.join(KIT_ROOT, 'validators/lib/fenced-block.cjs')); // consume, don't fork
// stagedAddedLineRanges is consumed for the ledger-class mode; guard the require so a refactor of
// the reconciliation module can never brick this engine (fail-safe: no ranges -> no ledger policing).
let stagedAddedLineRanges = null;
try { ({ stagedAddedLineRanges } = require(path.join(KIT_ROOT, 'validators/validate-reconciliation.cjs'))); } catch (_) { /* optional */ }

// ── the entry-doc set (scoped — NEVER proposals/, which QUOTES drifted values as evidence) ──
// The consolidation SHRANK this set: INTERACTIVE-WALKTHROUGH.html + BUILD-PATTERN-FLOW.html
// were folded-then-deleted, leaving HOW-IT-WORKS.html the single HTML overview. The shrink is
// EXPLICIT (this edit) and guarded by entryDocSetConsistency() — a present entry-doc-shaped file
// dropped from the set REDs (no silent coverage narrowing), and a set member with no file REDs (no
// dangling). The set is also exposed as a manifest fact (`entry_docs`) so selfCheck polices its rot.
// The SHIPPED entry-doc set. It is a strict subset of the workshop's: the walkthroughs
// and the worked example are authoring aids that do not travel with the product, so a
// public tree that listed them would fail its own dangling-file check on every run.
const ENTRY_DOCS = [
  'README.md', 'CLAUDE.md', 'QUICKSTART.md', 'QUICKSTART-COPILOT.md',
  'STAGE-LOOP.md',
  'HOW-IT-WORKS.html',
  'validators/README.md',
  'WHY-THIS-KIT.md', // the evaluator digest — joined via docSet data addition only
  // The governance + entry surface. These make counted, versioned claims to a
  // reader who has not cloned anything yet — RELEASE-NOTES states the gate count
  // and the SLSA level, SECURITY states what the release controls are, the three
  // docs/ entry pages state the boundary and the costs. They were unpoliced, so
  // a drifted number there would have shipped as fact. (The conduct file left
  // this set when it left the kit at v0.x; the docs/ entry pages + the public
  // CHANGELOG joined with their authoring — a file bearing policed claims joins
  // its class's curated list WITH the file.)
  'RELEASE-NOTES.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
  'docs/what-this-is.md', 'docs/positioning.md', 'docs/limitations.md',
  // The Phase-3 scaffold tables re-homed VERBATIM out of the bootstrap CLAUDE.md (the diet) —
  // the moved self-claims (validator counts, hook rows, tier conditions) stay policed by
  // following the text to its new home. A re-homed scan surface joins, never narrows.
  'bootstrap/SCAFFOLD-TABLES.md',
  // The four operating-mode playbooks re-homed VERBATIM out of the bootstrap CLAUDE.md
  // (one loaded per session at Step 0.0) — same rule: the re-homed scan surface joins.
  'bootstrap/MODE-greenfield.md',
  'bootstrap/MODE-bug_fix.md',
  'bootstrap/MODE-research_publish.md',
  'bootstrap/MODE-audit.md',
  // the phase-local router detail re-homed VERBATIM to the phase playbook — the
  // re-homed scan surface joins, never narrows.
  'bootstrap/PHASES.md',
];

// ── THE TWO-LEVEL LAYOUT MAP (M25.F; the ENTRY_DOCS array above is CONSERVED WHOLE —
//    the manifest entry_docs fact and every structural pin still read one list). These
//    two sets are ORTHOGONAL overlays: RESOLUTION (which layout root a doc lives under)
//    and GATING (whether it is policed without --surface). ──
// SURFACE_ROOT_FILES — the docs that ship at the SURFACE ROOT (above sbak/) on the
// assembled tree; every other doc in every doc-set resolves under the payload root.
// CLAUDE.md ships here too but is payload-class and ALWAYS policed (the one surface-root
// doc that is the kit's own file in every context, including an adopted repo).
const SURFACE_ROOT_FILES = new Set([
  'CLAUDE.md',
  'README.md', 'WHY-THIS-KIT.md', 'RELEASE-NOTES.md', 'CONTRIBUTING.md',
  'SECURITY.md', 'CHANGELOG.md',
  'docs/what-this-is.md', 'docs/positioning.md', 'docs/limitations.md',
]);
// SURFACE_GATED — the repo-identity subset policed ONLY under --surface. On the PUBLIC
// repo these root files are the kit's own and CI passes the flag; in an ADOPTED repo the
// same paths are the HOST's files, which this engine must never police — so the flag is
// EXPLICIT (an auto-detect heuristic would fail open against a stranger's README). Skipped
// docs are printed by name (explicit narrowing). CLAUDE.md is deliberately NOT gated.
const SURFACE_GATED = new Set([
  'README.md', 'WHY-THIS-KIT.md', 'RELEASE-NOTES.md', 'CONTRIBUTING.md',
  'SECURITY.md', 'CHANGELOG.md',
  'docs/what-this-is.md', 'docs/positioning.md', 'docs/limitations.md',
]);
// Absolute path for a doc under the correct layout root (surface-root files one level
// above the payload root). Relative to the PASSED root, so a test root generalizes too.
function docAbs(rel, root) {
  const base = SURFACE_ROOT_FILES.has(rel) ? path.resolve(root, '..') : root;
  return path.join(base, rel);
}
// Whether a doc is policed under the current mode. Payload docs + CLAUDE.md: always.
// Repo-identity surface docs: only under --surface.
function docActive(rel, surface) { return !!surface || !SURFACE_GATED.has(rel); }

// ── ledger-class files: STAGED-ADDED-LINES mode, NOT a blanket exemption ──
const LEDGER_FILES = [
  'CHANGELOG.md', 'docs/tech-debt.md', 'docs/release-state.md',
  'docs/off-track-log.md', 'docs/consultations.md', 'docs/gap-analysis.md', 'docs/sources/registry.md',
];

// ── exemptions: evidence-based, each with a reason + a real occurrence (no prophylactic) ──
const EXEMPTIONS = [
  { scope: 'proposals/**', reason: 'evidence/history: the spec + phase docs QUOTE drifted values (":46 says 5 hard + 5 soft"); scanning them makes every addendum a false positive (self-collision). Excluded by SET MEMBERSHIP. Occurrence: the doc-sync engine spec + the hardening spec quote the corpus.' },
  { scope: 'ledger-class staged-added-lines', reason: 'CHANGELOG + enforced ledgers are policed only on lines the staged diff ADDS (stagedAddedLineRanges); frozen history carries quoted stale values by design (A-01). Occurrence: CHANGELOG.md quotes prior "v1.5" history.' },
  { scope: 'quoted / blockquote lines', reason: 'a value inside a `>` blockquote or wrapped in backticks is frozen/illustrative prose, not a LIVE self-claim (the mut-4 decoy control). Occurrence: CHANGELOG/tech-debt quote stale versions inside backticks.' },
];

// ── word -> number (interview / gate counts are written as words too) ──
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, both: 2 };
function toNum(tok) {
  if (tok === undefined || tok === null) return null;
  const t = String(tok).toLowerCase().trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return Object.prototype.hasOwnProperty.call(WORDNUM, t) ? WORDNUM[t] : null;
}

function readIf(abs) { try { return fs.readFileSync(abs, 'utf8'); } catch (_) { return null; } }
function globCount(root, dir, re) { try { return fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).length; } catch (_) { return 0; } }

// ════════════════════════════════════════════════════════════════════════════════════════
// PART 1 — THE MANIFEST (derive / bind / reference)
// ════════════════════════════════════════════════════════════════════════════════════════

// DERIVED: the newest version in STAGE-PROMPT-PROTOCOL.md's own ### Changelog (absorbs the old protocol-pin assert).
function deriveProtocolVersion(root) {
  const t = readIf(path.join(root, 'STAGE-PROMPT-PROTOCOL.md'));
  if (!t) return null;
  const i = t.indexOf('### Changelog');
  if (i < 0) return null;
  const m = t.slice(i).match(/v(\d+\.\d+)/); // newest entry first in the changelog
  return m ? m[1] : null;
}
// BOUND: PROCESS-VALIDATION.md's numbered universal line "G1–GN" + "S1–SN".
function bindGates(root) {
  const t = readIf(path.join(root, 'PROCESS-VALIDATION.md'));
  if (!t) return { hard: null, soft: null };
  const n = normalize(t);
  const hm = n.match(/G1[–-]G(\d+)/);
  const sm = n.match(/S1[–-]S(\d+)/);
  return { hard: hm ? parseInt(hm[1], 10) : null, soft: sm ? parseInt(sm[1], 10) : null };
}
// BOUND: the protocol's root-element catalog (the distinct <..._stage_prompt> / <..._pass_prompt>).
function bindSchemas(root) {
  const t = readIf(path.join(root, 'STAGE-PROMPT-PROTOCOL.md'));
  if (!t) return { count: null, names: [] };
  const seen = [];
  const re = /<([a-z_]+_(?:stage_prompt|pass_prompt))>/g;
  let m;
  while ((m = re.exec(t)) !== null) { if (!seen.includes(m[1])) seen.push(m[1]); }
  return { count: seen.length, names: seen };
}
// BOUND: CALIBRATION-INTERVIEW.md's "## Choice N —" headings.
function bindInterviewChoices(root) {
  const t = readIf(path.join(root, 'templates/CALIBRATION-INTERVIEW.md'));
  if (!t) return null;
  const m = normalize(t).match(/^##\s+Choice\s+\d+\b/gim);
  return m ? m.length : null;
}
// BOUND: the operating-mode value list ("(`greenfield` / `bug_fix` / `audit` / `research_publish`)").
function bindOperatingModes(root) {
  const t = readIf(path.join(root, 'templates/CALIBRATION-INTERVIEW.md'));
  if (!t) return null;
  const m = t.match(/operating_mode`?[^\n(]*\(([^)]*`[a-z_]+`[^)]*)\)/i);
  if (!m) return null;
  const toks = m[1].match(/`([a-z_]+)`/g);
  return toks ? toks.length : null;
}
// BOUND: scripts/set-mode.cjs's VALID_MODES array — the role values (the axis rename never touches
// them; only `active-mode`→`role` changes). A real machine source, not a decision-copy.
function bindRoleNames(root) {
  const t = readIf(path.join(root, 'scripts/set-mode.cjs'));
  if (!t) return null;
  const m = t.match(/VALID_MODES\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  const toks = m[1].match(/'([a-z_]+)'|"([a-z_]+)"/g);
  return toks ? toks.map((x) => x.replace(/['"]/g, '')) : null;
}
// REFERENCED: golden-manifest.json's per-tier rendered counts (read LIVE, never copied).
function referenceScaffoldCounts(root) {
  try {
    const g = JSON.parse(readIf(path.join(root, 'golden-manifest.json')));
    return { lite: g.tiers.lite.counts.rendered, standard: g.tiers.standard.counts.rendered, full: g.tiers.full.counts.rendered };
  } catch (_) { return null; }
}

// Build the manifest object from the tree. Every field carries { value, kind, source }.
// stack_coverage — derived from the two gate validators' own per-language
// tables. Both modules are require-safe (require.main guards). The key sets MUST agree:
// a pattern set added to one gate but not the other may not claim coverage — the
// derivation throws loudly (fail-closed; a pre-commit/CI run surfaces the divergence)
// rather than publishing a one-sided claim. Keys map to canonical display names in a
// fixed presentation order; unknown future keys pass through as-is (visible, not hidden).
function deriveStackCoverage(root) {
  root = root || KIT_ROOT;
  const g15 = require(path.join(root, 'validators/validate-transition.cjs')).LANG_WRITE_CALLS || {};
  const g9 = require(path.join(root, 'validators/validate-test-honesty.cjs')).EVALUATED_LANGS || {};
  const a = Object.keys(g15).sort();
  const b = Object.keys(g9).sort();
  if (a.length === 0 || JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(
      `stack_coverage derivation refused: G15 table keys [${a.join(', ')}] and G9 table keys [${b.join(', ')}] disagree — ` +
      `extend BOTH gates (or neither); a one-sided extension may not claim coverage (M20.5.C rider).`
    );
  }
  const DISPLAY = { js: 'JS/TS/JSX-TSX', py: 'Python', go: 'Go', rs: 'Rust' };
  const ORDER = ['js', 'py', 'go', 'rs'];
  const ordered = ORDER.filter((k) => a.includes(k)).concat(a.filter((k) => !ORDER.includes(k)));
  return ordered.map((k) => DISPLAY[k] || k);
}

function deriveManifest(root) {
  root = root || KIT_ROOT;
  const ver = deriveProtocolVersion(root);
  const gates = bindGates(root);
  const schemas = bindSchemas(root);
  const fields = {
    protocol_version: { value: ver, kind: 'derived', source: 'STAGE-PROMPT-PROTOCOL.md ### Changelog (newest v)' },
    hard_gates: { value: gates.hard, kind: 'bound', source: 'PROCESS-VALIDATION.md numbered universal line G1–GN' },
    soft_gates: { value: gates.soft, kind: 'bound', source: 'PROCESS-VALIDATION.md S1–SN' },
    gate_range: { value: gates.hard != null ? 'G1–G' + gates.hard : null, kind: 'bound', source: 'composed from hard_gates (PROCESS-VALIDATION.md)' },
    schema_count: { value: schemas.count, kind: 'bound', source: 'STAGE-PROMPT-PROTOCOL.md root-element catalog (<..._stage_prompt>/<..._pass_prompt>)' },
    schema_names: { value: schemas.names, kind: 'bound', source: 'STAGE-PROMPT-PROTOCOL.md root-element catalog' },
    validator_count: { value: globCount(root, 'validators', /\.cjs$/), kind: 'derived', source: 'validators/*.cjs glob' },
    hook_count: { value: globCount(root, 'templates/dot-claude/hooks', /\.cjs$/), kind: 'derived', source: 'templates/dot-claude/hooks/*.cjs glob' },
    script_count: { value: globCount(root, 'templates/scripts', /\.cjs$/), kind: 'derived', source: 'templates/scripts/*.cjs glob' },
    command_count: { value: globCount(root, 'templates/dot-claude/commands', /\.md$/), kind: 'derived', source: 'templates/dot-claude/commands/*.md glob' },
    interview_choice_count: { value: bindInterviewChoices(root), kind: 'bound', source: 'templates/CALIBRATION-INTERVIEW.md "## Choice N" headings' },
    operating_mode_count: { value: bindOperatingModes(root), kind: 'bound', source: 'templates/CALIBRATION-INTERVIEW.md operating_mode value list' },
    scaffold_counts: { value: referenceScaffoldCounts(root), kind: 'referenced', source: 'golden-manifest.json tiers[tier].counts.rendered (read live)' },
    entry_docs: { value: ENTRY_DOCS.slice(), kind: 'derived', source: 'validate-entry-docs.cjs ENTRY_DOCS (the policed entry-doc set; shrunk EXPLICITLY at M19.C — guarded by entryDocSetConsistency)' },
    // ── the kit's release identity — the @kit-version stamp source. DECLARED
    //    per the red ruling: no machine source exists pre-release (no git tag, no package.json),
    //    and a version file invented purely to be derived from is tag-discipline theater. ──
    kit_version: { value: '0.2.0', kind: 'declared', source: "the kit's release identity — no machine source exists pre-release (no git tag, no package.json); bumped by the release stage (v0.1.0 next), at which point it can graduate to derived-from-tag; stamped into every scaffolded enforcement file (I13) and locked by the smoke stamp lock" },
    // ── IDENTITY FACTS. DECLARED = a decision with no machine source (the manifest
    //    IS its home; selfCheck re-derives a constant to itself -> rot-proof; the classes police the
    //    docs against it). role_names is BOUND (a real machine source the rename never touches). ──
    product_name: { value: 'Software Build Assurance Kit', kind: 'declared', source: 'the product name — no machine source; the manifest is its canonical home and the product_name class polices the docs against it' },
    product_name_legacy: { value: ['Build Framework Starter Kit', 'bf-kit'], kind: 'declared', source: 'the retired display + informal names (what the product_name class flags)' },
    repo_slug: { value: 'Software-Build-Assurance-Kit', kind: 'declared', source: 'the GitHub slug; clone URLs in the docs compare against THIS' },
    tier_names: { value: ['Lite', 'Standard', 'Full'], kind: 'declared', source: 'M20 I9: the unified tier vocabulary (what project-config.md persists)' },
    tier_names_legacy: { value: ['Light', 'Mid', 'Complex'], kind: 'declared', source: 'M20 I9: the retired interview labels (Light->Lite, Mid->Standard, Complex->Full)' },
    role_names: { value: bindRoleNames(root), kind: 'bound', source: 'scripts/set-mode.cjs VALID_MODES (the role values — the axis rename never touches them)' },
    state_file: { value: '.claude/role', kind: 'declared', source: 'M20 I9: the renamed session-axis state file (was .claude/active-mode)' },
    state_file_legacy: { value: '.claude/active-mode', kind: 'declared', source: 'M20 I9: the one-release read-compatible alias (removal milestone named at B); legitimate only in the state-contract note + fallback comments (the alias-window carve-out)' },
    // ── the stack-coverage boundary — DERIVED from the two gate validators'
    //    own per-language tables (G15 LANG_WRITE_CALLS ∩ G9 EVALUATED_LANGS; derivation
    //    REFUSES a one-sided extension), never hand-declared, so the claim cannot drift
    //    from the code. The stack_coverage class polices the disclosure prose against it. ──
    stack_coverage: { value: deriveStackCoverage(root), kind: 'derived', source: 'validators/validate-transition.cjs LANG_WRITE_CALLS ∩ validators/validate-test-honesty.cjs EVALUATED_LANGS (key sets must agree; display-mapped)' },
  };
  return {
    note: 'The kit\'s self-descriptive facts. DERIVED (machine source) / BOUND (re-parsed from a home doc\'s structure) / REFERENCED (read live from golden-manifest.json) / DECLARED (a decision with no machine source — the manifest is its canonical home; the identity classes police the docs against it) — never hand-stated twice. Regenerate: node validators/validate-entry-docs.cjs --write-manifest. Policed by validators/validate-entry-docs.cjs (the entry-doc set) + selfCheck (derived-vs-stored rot). scaffold_counts is read LIVE from golden-manifest.json, not copied.',
    fields,
  };
}

// Order-independent stable stringify (sorts object keys) so a value that is structurally equal but
// serialized in a different key order (e.g. scaffold_counts after canonical() sorts its keys) does
// NOT read as a false mismatch.
function stableStr(v) {
  const s = (x) => Array.isArray(x) ? x.map(s)
    : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((o, k) => (o[k] = s(x[k]), o), {}) : x;
  return JSON.stringify(s(v));
}
// The derived-vs-stored rot check: re-derive and compare each stored field. Returns mismatches.
function selfCheck(root, stored) {
  root = root || KIT_ROOT;
  const fresh = deriveManifest(root);
  const out = [];
  const storedFields = (stored && stored.fields) || {};
  for (const [name, f] of Object.entries(fresh.fields)) {
    const s = storedFields[name];
    const sv = s ? s.value : undefined;
    if (stableStr(sv) !== stableStr(f.value)) out.push({ field: name, stored: sv, derived: f.value });
  }
  return out;
}

// THE SET-CONSISTENCY GUARD — makes shrinking the policed entry-doc set an EXPLICIT,
// two-sided act, never a silent narrowing of engine coverage:
//   • DANGLING  — a set member with no file on disk. Deleting a doc therefore FORCES its removal
//                 from the set (a stale set entry REDs), so a deletion can't leave the engine
//                 pointing at nothing.
//   • NARROWING — a present top-level *.html that is NOT in the set. HTML overviews are the class the
//                 consolidation shrinks, and they are cleanly globbable; dropping one from the set
//                 while its file still ships is silent coverage loss and REDs. (The .md entry docs
//                 carry only the dangling guard — their "universe" is not a clean glob.)
// opts.setOverride lets a caller probe a hypothetical set (the mut4 control) without mutating ENTRY_DOCS.
//
// EVIDENCE_HTML — a DECLARED divergence from the workshop copy of this file, and the only one beyond
// the product name. The one carve-out from (b), named file by file, never a glob. A build receipt is
// GENERATED from a run: it is not an overview a reader is oriented by, its content changes with every
// render, and policing it with the value classes would bind a derived artifact to the manifest's
// declared facts. The narrowing guard exists to stop an OVERVIEW being quietly dropped from coverage;
// an evidence artifact was never in that class. Naming it here keeps the exemption one file wide and
// visible, which is the same discipline the release gate's single-file dogfood exemption uses.
const EVIDENCE_HTML = ['example-receipt.html'];
function entryDocSetConsistency(root, opts) {
  root = root || KIT_ROOT;
  const surface = !!(opts && opts.surface);
  const set = (opts && Array.isArray(opts.setOverride)) ? opts.setOverride : ENTRY_DOCS;
  const violations = [];
  // (a) dangling: every ACTIVE set member resolves to a real file at its layout root (a
  // surface-gated doc with the flag off is not in the active set, so it can't dangle).
  for (const rel of set) {
    if (!docActive(rel, surface)) continue;
    if (!fs.existsSync(docAbs(rel, root))) violations.push({ kind: 'dangling', file: rel });
  }
  // (b) narrowing: every present top-level *.html is in the set (evidence artifacts excepted).
  // Check the payload root always, and the surface root under --surface (where example-
  // receipt.html lives — exempt), so a dropped overview REDs at whichever level it ships.
  const roots = surface ? [root, path.resolve(root, '..')] : [root];
  for (const r of roots) {
    let htmls = [];
    try { htmls = fs.readdirSync(r).filter((n) => /\.html$/i.test(n)); } catch (_) { htmls = []; }
    for (const h of htmls) {
      if (!set.includes(h) && !EVIDENCE_HTML.includes(h)) violations.push({ kind: 'narrowing', file: h });
    }
  }
  return violations;
}

// ════════════════════════════════════════════════════════════════════════════════════════
// PART 2 — THE VALUE CLASSES (data-driven; each = name + field + docSet + find)
// ════════════════════════════════════════════════════════════════════════════════════════

// Per-line walk with 1-indexed line numbers.
function eachLine(text, fn) {
  const lines = normalize(text).split('\n');
  for (let i = 0; i < lines.length; i++) fn(lines[i], i + 1);
}
// A hit is "quoted/frozen" (NOT a live claim) when its line is a MARKDOWN BLOCKQUOTE (`>`), the
// signal frozen/illustrative history actually uses (a ledger entry, a quoted prior verdict). We do
// NOT treat backtick-wrapping as "quoted": a value formatted in backticks (`v1.8`, `/clear`) is a
// LIVE claim in normal prose, and on a long multi-span line a naive backtick test spuriously pairs
// the CLOSE of one span with the OPEN of the next (README:105 defect). Blockquote is the honest,
// unambiguous frozen-history signal — and the one the mut-4 decoy control exercises.
function hitQuoted(line /*, token */) {
  return /^\s*>/.test(line);
}

// Each class's `find(text)` returns raw matches [{ line, value, quoted, meta }] — NO manifest
// comparison (that is the FINDING predicate, applied in scanDoc). Unit-tested directly via findInText.
const VERSION_SIGNAL = /protocol|stage[\s-]?prompt|schema|PHASE-DOC-TEMPLATE|STAGE-PROMPT/i;

// ── IDENTITY DOC-SETS (curated file arrays — see the DOC-SET LOCUS note in the header) ──
// The name/term classes scope to docs+templates surfaces the count classes never touch.
const NAME_DOCS = [
  ...ENTRY_DOCS,
  '.github/copilot-instructions.md',
  '.gitignore',                          // carries the self-ref display name today
  'proposals/DISTRIBUTION-PACKAGING.md', // the starter-ZIP name — an explicit carve-IN of ONE proposals/ file
  'templates/dot-claude/README.md',      // shipped template that lands in every generated project (a file bearing a policed name joins its class's list, the curated-list discipline)
];
const TIER_DOCS = [
  'README.md', 'CLAUDE.md', 'QUICKSTART.md', 'QUICKSTART-COPILOT.md', 'HOW-IT-WORKS.html',
  'templates/CALIBRATION-INTERVIEW.md',
  'WHY-THIS-KIT.md', // names the tiers + scaffold counts
  'bootstrap/SCAFFOLD-TABLES.md', // the tier-conditioned tables moved here — the tier vocabulary follows
  // the mode playbooks carry tier vocabulary (tier-scaled discovery, the audit dimension
  // counts, the Phase-R Lite lock) — the vocabulary follows the move.
  'bootstrap/MODE-greenfield.md', 'bootstrap/MODE-bug_fix.md',
  'bootstrap/MODE-research_publish.md', 'bootstrap/MODE-audit.md',
  'bootstrap/PHASES.md', // the tier-scaled phase detail moved here — the vocabulary follows
];
// DOCS+TEMPLATES only — the code/config surface (set-mode.cjs, the hooks, STATE_PATH_RE, the
// gitignores, smoke.cjs) is B's MECHANICS, hand-inventoried in Stage B and locked by the smoke
// suite, NOT scanned by this class (code is not an entry doc — the red-review split).
// The history exemption (set-membership, the proposals/ mechanism): FRAMEWORK-PLAN.md is a
// FROZEN May-2026 post-mortem/plan — it RECORDS WHAT WAS (its line 88 is a verbatim P#29 bug
// record about `.claude/active-mode`; renaming it would falsify the finding). A frozen evidence
// record is never swept (Key constraints: "history and evidence are never renamed"), so it is
// dropped from ROLE_DOCS here (its 10 pre-sweep baseline entries were dropped alongside). The
// A-baseline included it in error — the class should never have scanned a frozen record.
const ROLE_DOCS = [
  'bootstrap/SCAFFOLD-TABLES.md', // the read-first-list rows carry the role vocabulary — it follows the move
  // the mode playbooks carry role vocabulary (role: verifier in the audit passes, the
  // bug_fix orchestrator variant, the two-brain notes) — it follows the move.
  'bootstrap/MODE-greenfield.md', 'bootstrap/MODE-bug_fix.md',
  'bootstrap/MODE-research_publish.md', 'bootstrap/MODE-audit.md',
  'bootstrap/PHASES.md', // the two-terminal/role prose moved here — it follows the move
  'BUILD-PLAYBOOK.md', 'CLAUDE.md', 'compare/agentframework-divergence.md', 'FRAMEWORK-CONFIG.md',
  'LOCALIZE-VERIFICATION.md', 'persistence-architecture.md', 'PROCESS-VALIDATION.md',
  'QUICKSTART.md', 'QUICKSTART-COPILOT.md', 'README.md', 'STAGE-PROMPT-PROTOCOL.md', 'WALKTHROUGH.md',
  'validators/README.md',
  'templates/AUDIT-CHALLENGE-PROMPT-TEMPLATE.md', 'templates/AUDIT-PASS-PROMPT-TEMPLATE.md',
  'templates/AUDIT-RETROSPECTIVE-TEMPLATE.md', 'templates/BUGFIX-PHASE-DOC.md',
  'templates/CALIBRATION-INTERVIEW.md', 'templates/PROJECT-CLAUDE.md', 'templates/gates.md',
  'templates/project-config.md', 'templates/dot-claude/README.md', 'templates/dot-github/copilot-instructions.md',
  'templates/audit/P1-ipc.md', 'templates/audit/P2-secrets.md', 'templates/audit/P3-error-handling.md',
  'templates/audit/P4-data-flow.md', 'templates/audit/P5-performance.md', 'templates/audit/P6-packaging.md',
  'templates/audit/P7-compliance.md', 'templates/audit/P8-architecture.md', 'templates/audit/REVIEW_PLAN.md',
  'templates/dot-claude/commands/on-track.md', 'templates/dot-claude/commands/refactor.md',
  'templates/dot-claude/commands/stage.md', 'templates/dot-claude/commands/verify.md',
  'templates/dot-claude/read-first-list-audit.txt', 'templates/dot-claude/read-first-list-bugfix.txt',
  'templates/dot-claude/read-first-list-orchestrator.txt', 'templates/dot-claude/read-first-list-refactor.txt',
  'templates/dot-claude/read-first-list-verifier.txt',
];
// tier context: the word "tier", OR the legacy triple structure on the line (two of Light/Mid/
// Complex separated by / or |). The token match is CASE-SENSITIVE so the tier NAME (proper-noun-
// capitalized: "the Complex tier", "Light / Mid / Complex") fires while the adjective ("a complex
// project") does not — the on-line-keyword discipline made concrete.
const TIER_SIGNAL = /\btier(s|ed)?\b/i;
// The legacy triple structure = tier context with no "tier" word. This widened the
// separator class from [/|] to [/|+] so the +-joined legacy pair ("Light + Complex audit need") is
// caught too — two capitalized legacy NAMES on a line is unambiguously a tier reference.
const LEGACY_TIER_TRIPLE = /\b(Light|Mid|Complex)\b[^\n]*[/|+][^\n]*\b(Light|Mid|Complex)\b/;
// The calibration-TUPLE form — a legacy tier NAME joined by +/, to the interview's
// expertise/cadence axis words ("Mid + Familiar + Standard", "Light, New, Maximum"). tier_terms bound
// only to the "tier" keyword or the /|-triple, so the tuple was nobody's. This is a DATA-ONLY
// context signal on the tier_terms find() — NOT an engine-core edit (the seam-hash guard proves
// scanTree/scanDocClass/… are byte-unchanged). CASE-SENSITIVE on the legacy NAME (so "a complex
// project" prose stays silent — the disclosed token+context locus), and "Standard" is DELIBERATELY
// excluded from the axis vocabulary: it is both a current tier name and a cadence, so keying on it
// would fire on the swept form. Requiring a +/, separator keeps ordinary prose ("Mid-century design")
// out — every real calibration tuple is a +/,-joined list.
const CALIB_AXIS = /\b(New|Familiar|Experienced|Novice|Intermediate|Expert|Minimum|Maximum)\b/;
const CALIB_TUPLE = (line) => /[+,]/.test(line) && CALIB_AXIS.test(line) && /\b(Light|Mid|Complex)\b/.test(line);
// the declared alias-window carve-out: `active-mode` on a line B marks `alias-window` (the one
// state-contract note + fallback comments) is legitimate during the one-release window.
const ROLE_ALIAS_MARKER = /alias-window/i;

// ── STACK-COVERAGE DOC-SET: the surfaces that STATE the stack-coverage boundary. The class
// polices each signal line against the DERIVED stack_coverage fact — the two pre-commits'
// disclosure NOTE lines, test-honesty's own skip message, and WHY-THIS-KIT's honest-costs
// line all drift together or not at all. ──
const STACK_DOCS = [
  'WHY-THIS-KIT.md',
  '.githooks/pre-commit',
  'templates/dot-githooks/pre-commit',
  'validators/validate-test-honesty.cjs',
];

const VALUE_CLASSES = [
  {
    name: 'version', field: 'protocol_version', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (!VERSION_SIGNAL.test(line)) return;
        const re = /v(\d+\.\d+)/g; let m;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: m[1], quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.protocol_version,
    expected: (mf) => 'v' + mf.protocol_version,
  },
  {
    name: 'gate_count', field: 'hard_gates', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /(\d+)\s*hard\s*\+\s*(\d+)\s*soft/gi; let m;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: parseInt(m[1], 10), meta: { hard: parseInt(m[1], 10), soft: parseInt(m[2], 10) }, quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => hit.meta.hard !== mf.hard_gates || hit.meta.soft !== mf.soft_gates,
    expected: (mf) => mf.hard_gates + ' hard + ' + mf.soft_gates + ' soft',
    foundStr: (hit) => hit.meta.hard + ' hard + ' + hit.meta.soft + ' soft',
  },
  {
    name: 'gate_range', field: 'gate_range', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /G1[–-]G(\d+)/g; let m;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: parseInt(m[1], 10), quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => ('G1–G' + hit.value) !== mf.gate_range,
    expected: (mf) => mf.gate_range,
    foundStr: (hit) => 'G1–G' + hit.value,
  },
  {
    name: 'schema_count', field: 'schema_count', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /(\d+)[\s-]schemas?\b/gi; let m;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: parseInt(m[1], 10), quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.schema_count,
    expected: (mf) => mf.schema_count + ' schemas',
    foundStr: (hit) => hit.value + ' schemas',
  },
  {
    name: 'question_count', field: 'interview_choice_count', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        // The pattern only matches a number ADJACENT to "questions" (whitespace/hyphen between),
        // so "N discovery questions" (a tier-conditional DISCOVERY count) never matches here — no
        // separate guard needed, and a blunt line-level /discovery/ guard would false-NEGATIVE a
        // line that names both (e.g. "the 3 questions, then tier-conditional discovery").
        const re = /(\d+)[\s-]questions?\b|\b(\d+)-question\b/gi; let m;
        while ((m = re.exec(line)) !== null) {
          const num = parseInt(m[1] || m[2], 10);
          out.push({ line: ln, value: num, quoted: hitQuoted(line, m[0]) });
        }
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.interview_choice_count,
    expected: (mf) => mf.interview_choice_count + ' choices (mode + 5)',
    foundStr: (hit) => hit.value + ' questions',
  },
  {
    name: 'option_table', field: 'interview_choice_count', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /(\d+|one|two|three|four|five|six|seven|eight)\s+(?:side-by-side\s+)?option tables/gi; let m;
        while ((m = re.exec(line)) !== null) {
          const num = toNum(m[1]);
          if (num == null) continue;
          out.push({ line: ln, value: num, quoted: hitQuoted(line, m[0]) });
        }
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.interview_choice_count,
    expected: (mf) => mf.interview_choice_count + ' option tables',
    foundStr: (hit) => hit.value + ' option tables',
  },
  {
    name: 'hook_count', field: 'hook_count', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /\b(both|two|three|\d+)\s+hooks\b/gi; let m;
        while ((m = re.exec(line)) !== null) { const num = toNum(m[1]); if (num == null) continue; out.push({ line: ln, value: num, quoted: hitQuoted(line, m[0]) }); }
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.hook_count,
    expected: (mf) => mf.hook_count + ' hooks',
    foundStr: (hit) => hit.value + ' hooks',
  },
  {
    name: 'validator_count', field: 'validator_count', docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        const re = /\bboth\s+validators\b/gi; let m; // the "both" totality idiom (NOT a subset instruction like "the two validators to wire")
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: 2, quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => hit.value !== mf.validator_count,
    expected: (mf) => mf.validator_count + ' validators',
    foundStr: () => 'both validators',
  },
  // DOCTRINE — statements of /clear session semantics. field=null: every hit outside the home
  // is a finding. The home is STAGE-LOOP.md (a LOCATION contract, not an endorsement). This
  // class was TIGHTENED to the one-home rule: scanDocClass skips the home file, so the /clear doctrine
  // lives once (STAGE-LOOP.md) and any restatement elsewhere fails the enforcing engine forever. The
  // empirical resolution (CLI 2.1.201, 2026-07-05: /clear fires SessionStart source=clear) lives in
  // the home; README/QUICKSTART point at it without restating the mechanic (keyword-free pointers).
  {
    name: 'doctrine', field: null, docSet: ENTRY_DOCS, home: 'STAGE-LOOP.md',
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (!/\/clear/.test(line)) return;
        if (!/re-?fire|SessionStart|skips? orientation|orientation|restart/i.test(line)) return;
        out.push({ line: ln, value: '/clear-semantics', quoted: hitQuoted(line, '/clear') });
      });
      return out;
    },
    predicate: () => true,
    expected: () => 'the /clear doctrine lives once, in STAGE-LOOP.md (the home)',
    foundStr: () => '/clear-semantics statement',
  },
  // DOC-HYGIENE — specific literal mislabels / residue. field=null. Resolved at B/C (edited or
  // die with the tree). "26 checks" is routed here (ratified) — check-count is not a stable field.
  {
    name: 'doc_hygiene', field: null, docSet: ENTRY_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (/session-start-read-first\.sh/.test(line)) out.push({ line: ln, value: '.sh hook mislabel (is .cjs)', quoted: false });
        if (/gap-analysis[^\n]*Full only/.test(line)) out.push({ line: ln, value: 'gap-analysis "Full only" (is Standard-advisory)', quoted: false });
        if (/Done when M11 ships/.test(line)) out.push({ line: ln, value: 'M11 dogfood residue in a generic doc', quoted: false });
        if (/\b\d+\s+checks\b/.test(line) && /validator|smoke|regression/i.test(line)) out.push({ line: ln, value: 'hand-stated smoke check-count (route: the smoke suite / derive at render)', quoted: false });
      });
      return out;
    },
    predicate: () => true,
    expected: () => 'corrected at B/C (or dies with the consolidated tree)',
    foundStr: (hit) => hit.value,
  },
  // ── IDENTITY CLASSES — pure data through the seam; report-mode ──
  // TIER_TERMS — a legacy tier NAME (Light/Mid/Complex) used in tier context is drift; a
  // current name (Lite/Standard/Full) in the same context is not. find() emits any tier-name-shaped
  // token (case-sensitive) on a tier-context line; the predicate flags those not in tier_names.
  {
    name: 'tier_terms', field: 'tier_names', docSet: TIER_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (!(TIER_SIGNAL.test(line) || LEGACY_TIER_TRIPLE.test(line) || CALIB_TUPLE(line))) return; // tier context: keyword, legacy triple, or calibration tuple
        const re = /\b(Lite|Standard|Full|Light|Mid|Complex)\b/g; let m; // CASE-SENSITIVE (names are capitalized)
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: m[1], quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: (hit, mf) => Array.isArray(mf.tier_names) && !mf.tier_names.includes(hit.value),
    expected: (mf) => (mf.tier_names || []).join('/'),
    foundStr: (hit) => hit.value,
  },
  // ROLE_TERMS — the legacy axis/filename token `active-mode`. ASYMMETRIC by necessity: the
  // current token `role` is a common English word, unmatchable bare, so the class matches only the
  // legacy token and every UNEXEMPTED hit is drift. The declared alias-window marker exempts the
  // state-contract note + fallback comments during B's one-release window.
  {
    name: 'role_terms', field: 'state_file', docSet: ROLE_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (ROLE_ALIAS_MARKER.test(line)) return; // declared alias-window carve-out
        const re = /\bactive-mode\b/g; let m;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: 'active-mode', quoted: hitQuoted(line, m[0]) });
      });
      return out;
    },
    predicate: () => true, // find() emits only the legacy token — every unexempted hit is drift
    expected: () => 'role (.claude/role — the renamed session axis)',
    foundStr: () => 'active-mode',
  },
  // PRODUCT_NAME — a retired display name ("Build Framework Starter Kit"/"bf-kit") is a
  // NAME finding (→ product_name); a retired slug ("build-framework-starter-kit" in a clone URL)
  // is a SLUG finding, compared against repo_slug. FIXTURE-labeled lines are golden answer-set
  // values, never self-refs.
  {
    name: 'product_name', field: 'product_name', docSet: NAME_DOCS,
    find(text) {
      const out = [];
      eachLine(text, (line, ln) => {
        if (/FIXTURE/.test(line)) return; // fixtures stay fixtures
        const q = hitQuoted(line);
        let m;
        let re = /Build Framework Starter Kit/g;
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: 'Build Framework Starter Kit', kind: 'name', quoted: q });
        re = /build-framework-starter-kit/g; // the slug (URL/repo) — compares against repo_slug
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: 'build-framework-starter-kit', kind: 'slug', quoted: q });
        re = /\bbf-kit\b/g; // the informal short NAME (no overlap: the slug contains no "bf-kit")
        while ((m = re.exec(line)) !== null) out.push({ line: ln, value: 'bf-kit', kind: 'name', quoted: q });
      });
      return out;
    },
    predicate: (hit, mf) => hit.kind === 'slug' ? (hit.value !== mf.repo_slug) : (hit.value !== mf.product_name),
    expected: (mf) => mf.product_name,
    foundStr: (hit) => hit.value,
  },
  {
    // every line that STATES the covered-stack set (signal keywords per the
    // on-line-keyword discipline) must name exactly the DERIVED stack_coverage set —
    // an under-claim (a stack the gates cover but the line omits) and an over-claim (a
    // named stack the gates don't cover) are both findings.
    name: 'stack_coverage', field: 'stack_coverage', docSet: STACK_DOCS,
    find(text) {
      const VOCAB = ['JS/TS/JSX-TSX', 'Python', 'Go', 'Rust', 'Ruby', 'Java', 'Kotlin', 'Swift', 'C#', 'PHP'];
      const hasTok = (line, s) => (/^[A-Za-z]+$/.test(s) ? new RegExp('\\b' + s + '\\b').test(line) : line.includes(s));
      const out = [];
      eachLine(text, (line, ln) => {
        if (!/covered stacks|static floors cover|evaluated stacks/i.test(line)) return;
        const present = VOCAB.filter((s) => hasTok(line, s));
        out.push({ line: ln, value: present.join(', '), meta: { present }, quoted: hitQuoted(line) });
      });
      return out;
    },
    predicate: (hit, mf) => {
      const want = mf.stack_coverage || [];
      return !(want.every((s) => hit.meta.present.includes(s)) && hit.meta.present.every((s) => want.includes(s)));
    },
    expected: (mf) => (mf.stack_coverage || []).join(', '),
    foundStr: (hit) => hit.meta.present.join(', ') || '(no stacks named)',
  },
];

// findInText(className, text) — the raw class matcher, for unit tests (positive + decoy).
function findInText(className, text) {
  const cls = VALUE_CLASSES.find((c) => c.name === className);
  if (!cls) return [];
  return cls.find(String(text || ''));
}

// Scan one doc for one class -> findings [{class,file,line,found,expected,disposition?}].
function scanDocClass(cls, file, text, mf) {
  const out = [];
  for (const hit of cls.find(text)) {
    if (hit.quoted) continue; // frozen/illustrative — not a live claim (exemption discipline)
    // THE ONE-HOME RULE (I5 standing lock, tightened at M19.B): a class with a `home` names the
    // single canonical location for its doctrine (STAGE-LOOP.md for /clear). A statement AT the
    // home is the doctrine living where it should — not a finding; a restatement ANYWHERE ELSE is.
    // Before B this class carried the home in the baseline (allowed KNOWN); post-B the baseline is
    // empty, so the home must be skipped here or it would fail the enforcing engine forever.
    if (cls.home && file === cls.home) continue;
    if (!cls.predicate(hit, mf)) continue; // matches the manifest -> correct, not a finding
    const finding = {
      class: cls.name, file, line: hit.line,
      found: cls.foundStr ? cls.foundStr(hit) : String(hit.value),
      expected: cls.expected(mf),
    };
    if (cls.home) finding.home = (file === cls.home);
    out.push(finding);
  }
  return out;
}

// Scan the whole entry-doc set (+ ledger files in staged-added mode). Returns
// { findings, manifest, surface, policedSurface, skippedSurface }. opts.surface turns on
// the repo-identity surface docs (resolved from SURFACE_ROOT); without it they are skipped
// (recorded in skippedSurface) — the two-level shipped layout, M25.F.
function scanTree(root, opts) {
  root = root || KIT_ROOT;
  opts = opts || {};
  const surface = !!opts.surface;
  const mf = {};
  const mo = deriveManifest(root);
  for (const [k, v] of Object.entries(mo.fields)) mf[k] = v.value;

  const findings = [];
  const skippedSurface = new Set();
  for (const cls of VALUE_CLASSES) {
    for (const rel of cls.docSet) {
      if (!docActive(rel, surface)) { skippedSurface.add(rel); continue; } // surface-gated, flag off
      const text = readIf(docAbs(rel, root)); // surface-root files resolve one level up
      if (text == null) continue; // absent doc (e.g. before consolidation adds it) -> skip, not fail
      findings.push(...scanDocClass(cls, rel, text, mf));
    }
  }

  // Ledger-class files: police ONLY staged-added lines (frozen history untouched). The value +
  // doctrine classes run over the added lines; a stale value in a frozen line never fires.
  if (opts.ledger && stagedAddedLineRanges) {
    for (const rel of LEDGER_FILES) {
      if (!docActive(rel, surface)) continue; // CHANGELOG is surface-gated
      const text = readIf(docAbs(rel, root));
      if (text == null) continue;
      const ranges = stagedAddedLineRanges(rel);
      if (!ranges || ranges.length === 0) continue;
      const inAdded = (ln) => ranges.some(([a, b]) => ln >= a && ln <= b);
      for (const cls of VALUE_CLASSES) {
        for (const f of scanDocClass(cls, rel, text, mf)) { if (inAdded(f.line)) findings.push(f); }
      }
    }
  }
  // How many repo-identity surface docs were actually policed (present AND active) — the CI
  // proof that --surface fired, so a silently-inert flag can never read as coverage.
  let policedSurface = 0;
  if (surface) for (const rel of SURFACE_GATED) { if (fs.existsSync(docAbs(rel, root))) policedSurface++; }
  return { findings, manifest: mo, surface, policedSurface, skippedSurface: [...skippedSurface].sort() };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// PART 3 — BASELINE RECONCILIATION (KNOWN / UNKNOWN / PHANTOM — mirrors golden-bootstrap)
// ════════════════════════════════════════════════════════════════════════════════════════
function keyOf(x) { return `${x.class}|${x.file}|${x.line}`; }
function reconcile(findings, baseline) {
  const known = Array.isArray(baseline) ? baseline : ((baseline && baseline.drift) || []);
  const knownMap = new Map(known.map((k) => [keyOf(k), k]));
  const matched = new Set();
  const knownOut = [], unknown = [];
  for (const f of findings) {
    const k = knownMap.get(keyOf(f));
    if (k) { matched.add(keyOf(f)); knownOut.push({ ...f, note: k.note, disposition: k.disposition }); }
    else unknown.push(f);
  }
  const phantom = known.filter((k) => !matched.has(keyOf(k)));
  return { known: knownOut, unknown, phantom };
}
function loadBaseline(root) {
  try { const raw = JSON.parse(readIf(path.join(root, 'scripts/fixtures/entry-docs/known-drift.json'))); return Array.isArray(raw) ? raw : (raw.drift || []); }
  catch (_) { return []; }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// PART 4 — CLI
// ════════════════════════════════════════════════════════════════════════════════════════
function canonical(obj) {
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

function humanReport(rep) {
  const L = [];
  L.push('validate-entry-docs — the kit\'s self-claims vs framework-manifest.json (report mode)');
  L.push('  honest locus: polices SPECIFIC value classes in a SPECIFIC doc set — not "docs can\'t drift".');
  L.push(`  KNOWN drift (in scripts/fixtures/entry-docs/known-drift.json): ${rep.known.length}`);
  for (const k of rep.known) L.push(`    · ${k.class}  ${k.file}:${k.line}  found=[${k.found}] expected=[${k.expected}]${k.home ? '  (HOME — canonical)' : ''}`);
  L.push(`  UNKNOWN drift (out of baseline -> FAIL): ${rep.unknown.length}`);
  for (const u of rep.unknown) L.push(`    ✗ ${u.class}  ${u.file}:${u.line}  found=[${u.found}] expected=[${u.expected}]`);
  L.push(`  PHANTOM baseline entries (declared, not observed -> FAIL): ${rep.phantom.length}`);
  for (const p of rep.phantom) L.push(`    ? ${p.class}  ${p.file}:${p.line}`);
  L.push(`  => exit ${rep.exit}`);
  return L.join('\n') + '\n';
}

function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const json = has('--json');
  const manifestOut = path.join(KIT_ROOT, 'framework-manifest.json');

  if (has('--write-manifest')) {
    fs.writeFileSync(manifestOut, canonical(deriveManifest(KIT_ROOT)), { encoding: 'utf8' });
    process.stdout.write(`wrote ${manifestOut}\n`);
    process.exit(0);
  }

  if (has('--self-check')) {
    let stored;
    try { stored = JSON.parse(readIf(manifestOut)); } catch (_) {
      process.stderr.write('self-check: framework-manifest.json absent/unreadable at repo root (run --write-manifest).\n'); process.exit(1);
    }
    const mm = selfCheck(KIT_ROOT, stored);
    if (mm.length === 0) { process.stdout.write('framework-manifest.json is byte-current with its derivations/bindings.\n'); process.exit(0); }
    process.stderr.write('self-check: STALE manifest field(s):\n');
    for (const m of mm) process.stderr.write(`  - ${m.field}: stored=${JSON.stringify(m.stored)} derived=${JSON.stringify(m.derived)}\n`);
    process.exit(1);
  }

  // --surface polices the repo-identity docs at the surface root too (the public repo's CI
  // mode). Without it those docs are skipped and printed by name — never silently narrowed.
  const surface = has('--surface');
  // --report (reconcile vs baseline) OR default/--check (strict: baseline STILL reconciled, but at
  // B the baseline is empty so any finding is UNKNOWN -> fail). Same path; the baseline size is the
  // only difference between report-mode-at-A and enforcing-at-B.
  const scan = scanTree(KIT_ROOT, { ledger: true, surface });
  const findings = scan.findings;
  const baseline = loadBaseline(KIT_ROOT);
  const rec = reconcile(findings, baseline);
  // Set-consistency is part of the enforcing floor: a dangling set entry or a silently-narrowed
  // HTML fails the build alongside any value-class drift. Report-mode surfaces it too (it is not
  // baseline-reconciled — a structural set defect is never a "known drift").
  const setViolations = entryDocSetConsistency(KIT_ROOT, { surface });
  const exit = (rec.unknown.length === 0 && rec.phantom.length === 0 && setViolations.length === 0) ? 0 : 1;
  const rep = { ...rec, setViolations, exit };
  if (!json) {
    // The surface-coverage line: with --surface, prove N repo-identity docs were policed (an
    // inert flag can never read as coverage); without it, name what was skipped (explicit).
    if (surface) process.stdout.write(`surface docs: policed (${scan.policedSurface})\n`);
    else if (scan.skippedSurface.length) process.stdout.write(`surface docs: skipped without --surface (${scan.skippedSurface.length}): ${scan.skippedSurface.join(', ')}\n`);
    for (const v of setViolations) {
      process.stderr.write(`  ✗ entry-doc-set ${v.kind}: ${v.file} — ${v.kind === 'dangling'
        ? 'in the policed set but no file on disk (remove it from ENTRY_DOCS, or restore the file)'
        : 'a shipped top-level *.html absent from the policed set (silent coverage narrowing — add it or delete the file)'}\n`);
    }
  }
  process.stdout.write(json ? JSON.stringify({ baseline: rec, findings, setViolations, exit }) : humanReport(rep));
  process.exit(exit);
}

module.exports = {
  KIT_ROOT, ENTRY_DOCS, LEDGER_FILES, EXEMPTIONS, VALUE_CLASSES,
  deriveManifest, selfCheck, entryDocSetConsistency, findInText, scanTree, scanDocClass, reconcile, loadBaseline,
  // derivations/bindings exposed for targeted unit tests
  deriveProtocolVersion, bindGates, bindSchemas, bindInterviewChoices, bindOperatingModes, referenceScaffoldCounts,
};

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`validate-entry-docs: ${e && e.stack ? e.stack : e}\n`); process.exit(1); }
}
