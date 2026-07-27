#!/usr/bin/env node
// @kit-version 1.0.0
// validators/validate-sources.cjs
//
// The citation↔registry binding primitive (M06) — sibling to
// validate-app-map.cjs in the kit's fail-loud validator family. It is
// to a research paper what the App-Map's test-id binding is to a running app:
// the mechanical proof that no claim was authored from inference. Under grounded
// STORM every paper finding cites a source that was actually retrieved
// and logged to the sources registry — *no source → no claim* — so this checker
// makes an ungrounded ("fabricated") citation structurally impossible to ship.
//
// It is the MECHANICAL half of the no-fabricated-citation gate G_RP_R1; the
// JUDGEMENT half is R5 (the fresh-context adversarial peer review). This file
// owns one invariant only: every inline citation marker in the paper resolves to
// an id that EXISTS in the registry. It does not judge whether the source
// actually supports the claim (that is R5), nor whether every finding carries a
// citation (the PAPER-TEMPLATE shape + R5 own that).
//
//   PRIMARY — citation resolution (a proof, not a heuristic).
//     Every `[S###]` marker in the paper names a source id. The id must appear
//     in the registry. A marker whose id is absent from the registry → finding
//     (exit 1). This is what blocks a fabricated citation.
//
//   ADVISORY — dead-source note (not a finding).
//     A registry id that NO paper cites is surfaced as a `note` on stdout (a
//     logged source that went unused). It never changes the exit code — an
//     over-collected registry is not a grounding failure.
//
// Citation marker syntax: a source id is `S` followed by one or more digits
// (e.g. `S001`), written inside square brackets. Multiple ids may share one
// bracket, comma/semicolon/space-separated: `[S001]`, `[S001, S002]`,
// `[see S001; S007]`. A plain markdown link `[text](url)` yields no id unless
// its text literally contains an `S###` token. The registry's ids are any table
// cell whose cleaned content is exactly `S###` (id-first by template, but any
// column position is accepted so a reordered registry still resolves).
//
// Usage:
//   node validators/validate-sources.cjs [options] [<paper-path>...]
//
//   <paper-path>          a paper FILE, or a DIRECTORY walked for *.md
//                         (repeatable; default: docs/paper)
//   --paper <path>        alternative to a positional paper path (repeatable)
//   --registry <path>     the sources registry (default: docs/sources/registry.md)
//
// Exit codes:
//   0  every citation resolves (no fabricated citation)
//   1  ≥1 finding (a citation id absent from the registry)
//   2  usage or IO error (missing registry, no paper found, bad args)
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS
// regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');

const USAGE =
  'usage: validate-sources.cjs [options] [<paper-path>...]\n' +
  '  <paper-path>          a paper file or a directory walked for *.md (default: docs/paper)\n' +
  '  --paper <path>        alternative to a positional paper path (repeatable)\n' +
  '  --registry <path>     the sources registry (default: docs/sources/registry.md)\n';

const DEFAULT_REGISTRY = 'docs/sources/registry.md';
const DEFAULT_PAPER_ROOT = 'docs/paper';

function die2(msg) {
  process.stderr.write(`validate-sources: ${msg}\n`);
  process.exit(2);
}

// CRLF (and lone CR) → LF, so a Windows checkout doesn't read as divergence.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// A source id token: `S` followed by one or more digits, on a word boundary.
const ID_RE = /\bS\d+\b/g;

// Split a markdown table row into trimmed cells, dropping the outer pipes.
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// Strip backticks / surrounding asterisks / whitespace from a cell.
function cleanCell(cell) {
  return cell.replace(/`/g, '').replace(/^\*+|\*+$/g, '').trim();
}

// Collect every registry id: any markdown table cell that is exactly `S###`.
function parseRegistryIds(text) {
  const ids = new Set();
  for (const raw of normalize(text).split('\n')) {
    const t = raw.trim();
    if (!t.startsWith('|')) continue;
    for (const cell of splitRow(t)) {
      const c = cleanCell(cell);
      if (/^S\d+$/.test(c)) ids.add(c);
    }
  }
  return ids;
}

// Collect every citation occurrence in a paper: each `S###` id found inside a
// `[...]` bracket group, with its 1-based line number.
function parseCitations(text) {
  const lines = normalize(text).split('\n');
  const out = []; // { id, line }
  const bracket = /\[([^\]]*)\]/g;
  for (let n = 0; n < lines.length; n++) {
    let m;
    bracket.lastIndex = 0;
    while ((m = bracket.exec(lines[n])) !== null) {
      const inner = m[1];
      let idm;
      ID_RE.lastIndex = 0;
      while ((idm = ID_RE.exec(inner)) !== null) {
        out.push({ id: idm[0], line: n + 1 });
      }
    }
  }
  return out;
}

// Recursively list *.md files under a directory as relative forward-slash paths.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', 'coverage']);
function walkMd(root) {
  const out = [];
  function rec(dir) {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of ents) {
      const child = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        rec(child);
      } else if (e.isFile() && /\.md$/i.test(e.name)) {
        out.push(child);
      }
    }
  }
  rec(root);
  return out;
}

// Expand a paper path (file or directory) into a list of paper files.
function expandPaper(p) {
  let st;
  try {
    st = fs.statSync(p);
  } catch (e) {
    die2(`cannot read paper path ${p} (${e.message}).`);
  }
  if (st.isDirectory()) return walkMd(p).sort();
  return [p];
}

function main() {
  const argv = process.argv.slice(2);
  let registryPath = null;
  const paperArgs = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--registry') {
      registryPath = argv[++i];
      if (registryPath === undefined) die2('--registry requires a <path> argument.');
    } else if (a === '--paper') {
      const p = argv[++i];
      if (p === undefined) die2('--paper requires a <path> argument.');
      paperArgs.push(p);
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      die2(`unknown option: ${a}\n${USAGE}`);
    } else {
      paperArgs.push(a);
    }
  }

  if (registryPath === null) registryPath = DEFAULT_REGISTRY;

  // ---- registry ----
  let registryText;
  try {
    registryText = fs.readFileSync(registryPath, 'utf8');
  } catch (e) {
    die2(`cannot read registry ${registryPath} (${e.message}). The sources registry is mandatory at every tier (grounded STORM).`);
  }
  const registryIds = parseRegistryIds(registryText);

  // ---- papers ----
  let paperPaths;
  if (paperArgs.length === 0) {
    // Default to the paper root; absent → IO error (nothing to check).
    if (!fs.existsSync(DEFAULT_PAPER_ROOT)) {
      die2(`no paper path given and default ${DEFAULT_PAPER_ROOT}/ does not exist. Pass a <paper-path> or --paper <path>.`);
    }
    paperPaths = expandPaper(DEFAULT_PAPER_ROOT);
  } else {
    paperPaths = [];
    for (const a of paperArgs) paperPaths.push(...expandPaper(a));
  }
  if (paperPaths.length === 0) die2('no paper files found to check.');

  let findings = 0;
  const cited = new Set();

  for (const pp of paperPaths) {
    let text;
    try {
      text = fs.readFileSync(pp, 'utf8');
    } catch (e) {
      die2(`cannot read paper ${pp} (${e.message}).`);
    }
    const posix = pp.replace(/\\/g, '/');
    for (const c of parseCitations(text)) {
      cited.add(c.id);
      if (!registryIds.has(c.id)) {
        console.error(
          `VIOLATION  ${posix}:${c.line}: citation "${c.id}" resolves to NO entry in ${registryPath}. ` +
          'Every claim binds to a logged, retrieved source — no source → no claim (grounded STORM, G_RP_R1). ' +
          `Add ${c.id} to the registry, or fix the citation.`
        );
        findings++;
      }
    }
  }

  // ---- advisory: dead sources (logged but never cited) ----
  const dead = [...registryIds].filter((id) => !cited.has(id)).sort();
  if (dead.length > 0) {
    process.stdout.write(
      `note  ${dead.length} registry source(s) cited by no paper: ${dead.join(', ')} ` +
      '(advisory — an unused source is not a grounding failure, but R4/R5 may want to drop or use it).\n'
    );
  }

  if (findings > 0) {
    process.stderr.write(
      `\n${findings} unresolved citation(s). A paper claim may only cite a source the registry ` +
      'records as retrieved; a citation with no registry id is a fabricated citation and blocks G_RP_R1.\n'
    );
    process.exit(1);
  }
  process.stdout.write(
    `ok    ${paperPaths.length} paper file(s), every citation resolves to ${registryIds.size} registered source(s).\n`
  );
  process.exit(0);
}

main();
