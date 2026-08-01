#!/usr/bin/env node
// @kit-version 1.0.3
// validators/validate-validator-enumeration.cjs
//
// The artifact-enumeration coherence gate, EXTENDED to four artifact classes. It diffs the
// actual SHIPPED artifact set — by glob, so no count is ever hardcoded —
// against the CATALOGS that enumerate it, and BLOCKS when a shipped artifact is absent from any of
// its catalogs. This is the structural fix for the C1/C2 class: hooks, scripts, and slash commands
// had catalogs in several places that nothing reconciled, so a missing row shipped undetected.
//
// ── THE FOUR ARTIFACT CLASSES, EACH WITH ITS OWN CATALOG SET (the per-class catalog model) ───────
//   • validators  (validators/*.cjs)                    → validators/README.md · CLAUDE.md · templates/PROJECT-CLAUDE.md
//   • hooks       (templates/dot-claude/hooks/*.cjs)     → CLAUDE.md · scripts/fixtures/golden-bootstrap/rows.json
//   • scripts     (templates/scripts/*.cjs)              → CLAUDE.md · scripts/fixtures/golden-bootstrap/rows.json
//   • commands    (templates/dot-claude/commands/*.md)   → CLAUDE.md · scripts/fixtures/golden-bootstrap/rows.json
//   The 'CLAUDE.md' catalog is a probed sentinel: it resolves to bootstrap/SCAFFOLD-TABLES.md
//   when that file exists (the kit repo since the M24.A tables re-home) and to the root
//   CLAUDE.md otherwise (generated projects). See catalogPath().
//
//   PER-CLASS DOC-SET SCOPE is deliberate (a surfaced + ratified modeling decision). The
//   bake-vs-golden reality it FORMALIZES rather than papers over:
//     - the BAKE copies ALL of validators/ wholesale into a project;
//     - the GOLDEN bootstrap RENDERS only the HEADLINE validator rows (rows.json), the rest inherited;
//     - so rows.json is the full catalog for hooks/scripts/commands (each a 1:1 render row) but is
//       NOT treated as a full-validator catalog — validators reconcile against the three DOC catalogs
//       (README + the two scaffold-table docs), where the enumeration blockquote carries the full 16.
//   The hook/script/command generation catalogs are the two authoritative "what gets generated"
//   lists — the CLAUDE.md scaffold tables (the brace-list row is a CLAUDE.md cell) and the
//   golden rows.json row-set. validators/README.md stays the validators-only doc; PROJECT-CLAUDE.md
//   stays a validators catalog (per-project execution rules, not a hook/command file-catalog).
//   This same divergence is stated in prose in rows.json's header and validators/README.md so the
//   doc-sync engine can police it.
//
// Tier-conditional artifacts (Standard+ / app_map-gated validators, etc.) are STILL enumerated in
// their catalogs WITH their condition stated — the "all tiers" phrasing in validators/README.md
// means "listed in every catalog regardless of the tier the artifact activates at", not "ships at
// every tier". Discovery is by GLOB, so a newly-added artifact of any class is caught the moment it
// lands without a catalog entry.
//
// THE MECHANICAL FLOOR — every shipped artifact appears (by basename, as a literal string, after
// brace-expanding `{a,b,c}` path groups so the commands row's compressed list counts) in EVERY
// catalog of its class. An artifact absent from any of its catalogs → a blocking finding.
//
// FAIL CLOSED: a catalog a class NEEDS (the class has ≥1 shipped artifact) that is
// unreadable exits NON-ZERO (2) — never a silent pass on an unknown enumeration state. A class whose
// glob dir is absent contributes ZERO artifacts (a fixture root legitimately may not ship a class),
// so its catalogs are not even read — the exit-2 branch is reserved for a real unreadable catalog.
//
// Severity / the toggle (mirrors the other validators, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed branch (exit 2)
//                      is NEVER downgraded.
//
// Usage:
//   node validators/validate-validator-enumeration.cjs [--warn] [--root <dir>] [--rows <path>]
//     --root <dir>   the repo root to check (default: cwd). Lets CI / the smoke harness point at a
//                    fixture root without a chdir.
//     --rows <path>  override the golden row-set path (default: <root>/scripts/fixtures/
//                    golden-bootstrap/rows.json). Mirrors golden-bootstrap's --rows so ONE mutated
//                    rows.json copy can drive BOTH the golden --diff and this enumeration (the
//                    two-independent-locks proof).
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (unreadable catalog needed by a populated class).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of the
// host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');

// The golden row-set catalog is referenced by the sentinel 'ROWS' in a class's catalog list and
// resolved to this path (overridable with --rows). Kept in ONE place.
const DEFAULT_ROWS = 'scripts/fixtures/golden-bootstrap/rows.json';

// The four artifact classes. `dir`/`re` drive the glob (the shipped set); `catalogs` is the class's
// own doc-set scope (the per-class model). The ONLY place to edit the class↔catalog mapping.
const CLASSES = [
  { name: 'validator', dir: 'validators', re: /\.cjs$/,
    catalogs: ['validators/README.md', 'CLAUDE.md', 'templates/PROJECT-CLAUDE.md'] },
  { name: 'hook', dir: 'templates/dot-claude/hooks', re: /\.cjs$/,
    catalogs: ['CLAUDE.md', 'ROWS'] },
  { name: 'script', dir: 'templates/scripts', re: /\.cjs$/,
    catalogs: ['CLAUDE.md', 'ROWS'] },
  { name: 'command', dir: 'templates/dot-claude/commands', re: /\.md$/,
    catalogs: ['CLAUDE.md', 'ROWS'] },
];

// FAIL CLOSED — refuse to pass on an unreadable catalog a populated class needs.
function failClosed(msg) {
  process.stderr.write(
    `FAIL  ${msg}\n` +
    `      Refusing to pass the enumeration gate on an unknown enumeration state (fail-closed).\n`
  );
  process.exit(2);
}

// The shipped set for a class: basenames of <root>/<dir>/*.<ext>. A MISSING dir → [] (zero
// artifacts; a fixture root may not ship every class). An unreadable-for-another-reason dir is
// indistinguishable from missing at readdirSync, so we treat any failure as "no artifacts" — the
// exit-2 fail-closed branch is reserved for catalogs (which a populated class provably needs).
function shipped(root, cls) {
  const dir = path.join(root, cls.dir);
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return []; }
  return names.filter((n) => cls.re.test(n)).sort();
}

// Brace-expand `PREFIX{a,b,c}SUFFIX` comma-lists in path-ish text so the commands row's compressed
// `.claude/commands/{stage,verify,…}.md` yields each basename as a literal (`stage.md`, …). Scoped
// to comma-LISTS of simple tokens (word/hyphen) with path-ish affixes, so JSON objects, `{{PLACE}}`
// single-token braces, and prose braces are left alone. Additive-only: it can only ADD strings, so
// a false "enumerated" would require the expansion to coincidentally reproduce a real basename.
function braceExpand(text) {
  return String(text).replace(/([\w./-]*)\{([\w-]+(?:\s*,\s*[\w-]+)+)\}([\w./-]*)/g,
    (_, pre, body, post) => body.split(',').map((t) => pre + t.trim() + post).join(' '));
}

// A catalog enumerates an artifact iff its basename appears literally in the (brace-expanded)
// catalog text. The enumeration mutant target: reverting the consuming loop from "every artifact in
// every catalog" to "any subset passes" flips the missing-artifact smoke tests to green → RED.
function enumerates(catalogText, basename) {
  return braceExpand(catalogText).includes(basename);
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && (!args[rootIdx + 1] || args[rootIdx + 1].startsWith('--'))) {
    process.stderr.write('usage: validate-validator-enumeration.cjs [--warn] [--root <dir>] [--rows <path>]\n');
    process.exit(2);
  }
  const root = rootIdx !== -1 ? args[rootIdx + 1] : '.';
  const rowsIdx = args.indexOf('--rows');
  if (rowsIdx !== -1 && (!args[rowsIdx + 1] || args[rowsIdx + 1].startsWith('--'))) {
    process.stderr.write('usage: --rows needs a path\n');
    process.exit(2);
  }
  const rowsPath = rowsIdx !== -1 ? args[rowsIdx + 1] : path.join(root, DEFAULT_ROWS);

  // Resolve a catalog sentinel to an absolute path. The 'CLAUDE.md' catalog is a PROBED
  // sentinel since the tables re-home (M24.A, the DIET): in the kit repo the Phase-3 scaffold
  // tables + the full-validator-set note live in bootstrap/SCAFFOLD-TABLES.md, so that file IS
  // the catalog when present; in a generated project (no bootstrap/) the root CLAUDE.md —
  // rendered from PROJECT-CLAUDE.md, which carries the validator list — remains the catalog.
  // Fail-closed semantics unchanged: whichever path the probe resolves must be readable.
  const catalogPath = (rel) => {
    if (rel === 'ROWS') return rowsPath;
    if (rel === 'CLAUDE.md') {
      const tables = path.join(root, 'bootstrap', 'SCAFFOLD-TABLES.md');
      if (fs.existsSync(tables)) return tables;
    }
    return path.join(root, rel);
  };

  // Cache catalog reads (a catalog serves several classes / artifacts); fail-closed on the first
  // unreadable catalog a POPULATED class needs.
  const catalogCache = new Map();
  function readCatalog(rel) {
    if (catalogCache.has(rel)) return catalogCache.get(rel);
    const p = catalogPath(rel);
    let text;
    try { text = fs.readFileSync(p, 'utf8'); }
    catch (e) { failClosed(`cannot read enumeration catalog "${p}" (${rel}): ${e && e.message ? e.message : 'unknown error'}`); }
    catalogCache.set(rel, text);
    return text;
  }

  const findings = [];
  let totalArtifacts = 0;
  for (const cls of CLASSES) {
    const artifacts = shipped(root, cls);
    if (artifacts.length === 0) continue; // class not shipped in this root → nothing to reconcile
    totalArtifacts += artifacts.length;
    for (const rel of cls.catalogs) {
      const text = readCatalog(rel); // may fail-closed (exit 2)
      const label = rel === 'ROWS' ? `the golden row-set (${path.basename(rowsPath)})` : rel;
      for (const a of artifacts) {
        if (!enumerates(text, a)) {
          findings.push(
            `${cls.name} ${a} is NOT enumerated in ${label} — every shipped ${cls.name} must appear in ` +
            `all of its catalogs (${cls.catalogs.map((c) => (c === 'ROWS' ? 'rows.json' : c)).join(', ')}) ` +
            `so the scaffold spec, the per-project rules, and the golden row-set stay reconciled.`
          );
        }
      }
    }
  }

  if (findings.length === 0) {
    process.stdout.write(`ok    all ${totalArtifacts} artifact(s) across ${CLASSES.length} classes (validators/hooks/scripts/commands) enumerated in all their catalogs.\n`);
    process.exit(0);
  }

  const tag = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${tag} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} enumeration finding(s) (advisory — run without --warn to block). Reconcile before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} enumeration finding(s) block this commit (every shipped artifact must be listed in all its catalogs).\n`);
  process.exit(1);
}

main();
