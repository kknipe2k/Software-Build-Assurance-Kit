#!/usr/bin/env node
// @kit-version 1.0.2
// validators/validate-app-map.cjs
//
// The App-Map currency primitive (M04) — sibling to check-append-only.cjs in
// the kit's fail-loud validator family. It keeps `docs/app-map.md`
// honest so the map can never be authored from inference or silently drift from
// the running app. Two checks, both TYPE-AGNOSTIC (the surface
// vocabulary differs by class — ui/command/endpoint/api — but the invariant is
// identical):
//
//   1. PRIMARY — test-id binding (a proof, not a heuristic).
//      Every `State: verified` entry cites a Test-id. The id must EXIST as a
//      literal string in at least one file under the test globs. A verified
//      entry whose id is absent → finding. (Suite GREEN-ness is enforced by CI
//      ordering — the test suite runs first in the same job — not by this
//      validator; the validator owns existence, not execution.) `manual-only`
//      entries are human-asserted and NOT test-id-checked: the State field is
//      load-bearing precisely so currency never forces fiction (an e2e for
//      every surface) through the back door.
//
//   2. SECONDARY — surface-source tripwire (a heuristic, hence the escape).
//      Given --base and one or more --surface globs, if the diff since <base>
//      touched a surface-source path WITHOUT touching the map, that's a likely
//      stale map → finding. Because it's only a heuristic (false-positives on a
//      no-UX refactor), it is silenced by a LOGGED `app-map-unchanged: <reason>`
//      token (`--reason-ok <reason>` or `--reason-file <path>`) — never a silent
//      skip, never `--no-verify`. The primary check is what actually proves
//      currency; the tripwire just catches the obvious omission early.
//
//   3. G10 — the assembled-execution cluster-gate.
//      For a surface whose derived class is runtime/drivable — `ui`,
//      `command`, or `endpoint` — unit/component green is NECESSARY-NOT-SUFFICIENT:
//      a `State: verified` entry must ALSO cite assembled-execution evidence in an
//      Evidence column. That cell holds the REFERENCE to the assembled run (the
//      verifier's assembled_execution pass drove the REAL surface and retained the
//      command + result); it is the SAME reference Stage C structures into the
//      reproducible evidence block — not free-text invented independent of a run.
//      A drivable `verified` entry with an empty/placeholder Evidence cell → G10
//      finding. A `library` (api) surface is n/a — its test-id binding alone
//      suffices. The gate STACKS ON the test-id binding (check 1); it never
//      replaces it or the coverage/unit gates. The arming is ALWAYS VISIBLE
//      ("armed because surface class = X" / "n/a — api"), never silent. The class
//      is read from the map's `surface class: \`X\`` stamp or --surface-class; an
//      unresolved/placeholder class leaves the gate UN-ARMED (a visible note), so
//      a stamp-less legacy map or the unfilled template never false-blocks.
//      LIMITATION (honest, not false confidence): the validator can only assert the
//      reference is PRESENT — it cannot run the app, so a forged reference is not
//      caught here. The run-reality is the verifier assembled_execution pass's job
//      and the count/evidence reconciliation is Stage C's; this cell is the floor
//      they bind to, not the whole proof.
//
// Usage:
//   node validators/validate-app-map.cjs [options] [<map-path>]
//
//   <map-path>            the App-Map (default: docs/app-map.md; --map also sets it)
//   --map <path>          alternative to the positional map path
//   --tests <glob>        test-file glob for the binding check (repeatable;
//                         defaults to common test/spec/e2e globs if none given)
//   --surface <glob>      surface-source glob for the tripwire (repeatable;
//                         the tripwire runs only when ≥1 is given)
//   --base <ref>          baseline ref for the tripwire diff
//                         (default: git merge-base HEAD origin/main)
//   --reason-ok <reason>  the logged app-map-unchanged token — silences the
//                         tripwire for this run (a reason is required)
//   --reason-file <path>  a file that must contain `app-map-unchanged: <reason>`
//                         to silence the tripwire
//   --surface-class <c>   override/declare the derived surface class for the G10
//                         cluster-gate (ui | command | endpoint | api). If omitted,
//                         the class is read from the map's `surface class: \`X\``
//                         stamp; if neither resolves, the cluster-gate stays UN-ARMED
//                         (a visible note) — a stamp-less legacy map never blocks.
//
// The tripwire runs ONLY when ≥1 --surface glob is given; to skip it, omit
// --surface. There is deliberately no quiet skip flag — the only way past a
// tripped tripwire is the LOGGED app-map-unchanged token (scope lock), never a
// silent bypass, never `--no-verify`.
//
// Globs match repo-relative, forward-slash paths. Support: `**` (any path,
// across `/`), `*` (any run within a segment), `?` (one non-`/` char).
//
// Exit codes:
//   0  the map is current (every verified id exists; no un-silenced tripwire)
//   1  ≥1 finding (a dead verified id, or a tripped tripwire)
//   2  usage or IO/git error (bad ref, not a repo, missing map, …)
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS
// regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: validate-app-map.cjs [options] [<map-path>]\n' +
  '  --map <path>          App-Map path (default: docs/app-map.md)\n' +
  '  --tests <glob>        test-file glob for the binding check (repeatable)\n' +
  '  --surface <glob>      surface-source glob for the tripwire (repeatable)\n' +
  '  --base <ref>          baseline ref (default: git merge-base HEAD origin/main)\n' +
  '  --reason-ok <reason>  logged app-map-unchanged token; silences the tripwire\n' +
  '  --reason-file <path>  file carrying an `app-map-unchanged: <reason>` token\n' +
  '  --surface-class <c>   surface class for the G10 cluster-gate (ui|command|endpoint|api)\n' +
  '  (the tripwire runs only when ≥1 --surface glob is given; omit --surface to skip it)\n';

const DEFAULT_MAP = 'docs/app-map.md';
const DEFAULT_TEST_GLOBS = [
  '**/*.spec.*', '**/*.test.*', 'test/**', 'tests/**', 'e2e/**', 'spec/**',
];

// G10 cluster-gate. The DRIVABLE / runtime surface classes whose
// `verified` entries require assembled-execution evidence on top of the test-id
// binding. `api` (library) is deliberately NOT here — its test-id binding alone is
// sufficient, so the gate is n/a for it.
const DRIVABLE_CLASSES = new Set(['ui', 'command', 'endpoint']);
const KNOWN_CLASSES = new Set(['ui', 'command', 'endpoint', 'api']);

// THE ENFORCEMENT POINT (mutant target). Reverting this to `return false`
// (the no-op stub) lets an un-driven runtime surface pass on unit-green — which turns
// the smoke "un-driven ui -> G10 BLOCKS" check RED while the api + back-compat
// controls stay green. The mutation is killed specifically at the runtime-class
// trigger, not the whole file.
function requiresAssembledExecution(surfaceClass) {
  return DRIVABLE_CLASSES.has(surfaceClass);
}

// Resolve the surface class: an explicit --surface-class wins; otherwise read the
// map's `surface class: \`X\`` stamp. A {{placeholder}} or unknown value resolves to
// null → the cluster-gate stays un-armed (visible note), never a false block.
function resolveSurfaceClass(explicit, mapText) {
  let raw = explicit;
  if (!raw) {
    const m = normalize(mapText).match(/surface class:\s*`?([a-z]+)`?/i);
    raw = m ? m[1] : null;
  }
  if (!raw) return null;
  const c = raw.toLowerCase().trim();
  return KNOWN_CLASSES.has(c) ? c : null;
}

function die2(msg) {
  process.stderr.write(`validate-app-map: ${msg}\n`);
  process.exit(2);
}

// Run git, no shell — args as an array, safe with spaces on every platform.
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) die2(`cannot run git (${r.error.message}). Is git on PATH and is this a repo?`);
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// CRLF (and lone CR) → LF, so a Windows checkout doesn't read as a false
// divergence against an LF-committed baseline.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// A glob → anchored RegExp over forward-slash paths. `**` spans `/`; `*` stays
// within a segment; `?` is one non-`/` char; everything else is literal.
function globToRegExp(glob) {
  const g = glob.replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++; // let a/**/b also match a/b
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + '$');
}

function matchesAny(relPath, regexps) {
  return regexps.some((re) => re.test(relPath));
}

// Recursively list files under root as repo-relative forward-slash paths,
// skipping the usual noise so a big tree doesn't blow the budget.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', 'coverage']);
// Resource-safety caps. The walk is bounded so a symlink cycle or a
// pathologically deep tree can't recurse forever / blow the stack; the per-file
// read is bounded so one giant file can't OOM the corpus scan. Both overridable by
// env (a legitimate knob; also lets the smoke harness force the bound cheaply).
const MAX_WALK_DEPTH = (() => {
  const v = parseInt(process.env.APP_MAP_MAX_DEPTH || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 64;
})();
const MAX_FILE_BYTES = (() => {
  const v = parseInt(process.env.APP_MAP_MAX_FILE_BYTES || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 16 * 1024 * 1024; // 16 MiB per-file cap
})();
function walkFiles(root) {
  const out = [];
  const seen = new Set(); // real paths already visited — the symlink-cycle guard
  function rec(dir, rel, depth) {
    if (depth > MAX_WALK_DEPTH) return; // depth cap
    let real;
    try { real = fs.realpathSync(dir); } catch (_) { real = dir; }
    if (seen.has(real)) return; // cycle / hardlink loop — already walked
    seen.add(real);
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of ents) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        rec(path.join(dir, e.name), childRel, depth + 1);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  }
  rec(root, '', 0);
  return out;
}

// Split a markdown table row into trimmed cells, dropping the leading/trailing
// pipe. (Escaped pipes aren't used in the template, so a plain split is safe.)
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')));
}

// Strip backticks / surrounding asterisks / whitespace from a cited id.
function cleanId(cell) {
  return cell.replace(/`/g, '').replace(/^\*+|\*+$/g, '').trim();
}

const EMPTY_CELL = new Set(['', '-', '—', '–', 'n/a', 'na', 'tbd']);

// Parse every markdown table that has both a Test-id and a State column. Returns
// one record per data row: { state, testid, evidence, line }. The Evidence column
// (G10 cluster-gate) is optional — absent → evidence '' for every row of that table.
function parseEntries(text) {
  const lines = normalize(text).split('\n');
  const entries = [];
  let header = null;
  let idIdx = -1;
  let stateIdx = -1;
  let evidIdx = -1;
  for (let n = 0; n < lines.length; n++) {
    const t = lines[n].trim();
    if (!t.startsWith('|')) {
      header = null;
      idIdx = -1;
      stateIdx = -1;
      evidIdx = -1;
      continue;
    }
    const cells = splitRow(t);
    if (isSeparatorRow(cells)) continue;
    if (header === null) {
      // Collapse internal whitespace before matching column names so a `Test  ID`
      // (double space / tab) header still binds the Test-id column instead of silently
      // dropping the whole table to "0 verified" (a table has no fence to anchor —
      // the in-place fix; the shared extractor is the wrong abstraction for a markdown table).
      header = cells.map((c) => c.toLowerCase().replace(/\s+/g, ' '));
      idIdx = header.findIndex((h) => /test[\s-]?id/.test(h));
      stateIdx = header.findIndex((h) => /\bstate\b/.test(h));
      evidIdx = header.findIndex((h) => /\b(?:assembled[\s-]?)?evidence\b/.test(h));
      continue;
    }
    if (idIdx === -1 || stateIdx === -1) continue; // not an App-Map table
    entries.push({
      state: (cells[stateIdx] || '').toLowerCase(),
      testid: cleanId(cells[idIdx] || ''),
      evidence: evidIdx === -1 ? '' : (cells[evidIdx] || '').trim(),
      line: n + 1,
    });
  }
  return entries;
}

function resolveDefaultBase() {
  const r = git(['merge-base', 'HEAD', 'origin/main']);
  if (r.code !== 0) {
    die2(
      'could not resolve default base `git merge-base HEAD origin/main` ' +
      `(${r.stderr.trim() || 'unknown error'}). Pass --base <ref> explicitly.`
    );
  }
  const sha = r.stdout.trim();
  if (!sha) die2('default base resolved to empty; pass --base <ref> explicitly.');
  return sha;
}

function main() {
  const argv = process.argv.slice(2);
  let mapPath = null;
  let base = null;
  const testGlobs = [];
  const surfaceGlobs = [];
  let reasonOk = null;
  let reasonFile = null;
  let surfaceClassArg = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--map') {
      mapPath = argv[++i];
      if (mapPath === undefined) die2('--map requires a <path> argument.');
    } else if (a === '--base') {
      base = argv[++i];
      if (base === undefined) die2('--base requires a <ref> argument.');
    } else if (a === '--tests') {
      const g = argv[++i];
      if (g === undefined) die2('--tests requires a <glob> argument.');
      testGlobs.push(g);
    } else if (a === '--surface') {
      const g = argv[++i];
      if (g === undefined) die2('--surface requires a <glob> argument.');
      surfaceGlobs.push(g);
    } else if (a === '--reason-ok') {
      reasonOk = argv[++i];
      if (reasonOk === undefined || reasonOk === '') die2('--reason-ok requires a <reason> argument.');
    } else if (a === '--reason-file') {
      reasonFile = argv[++i];
      if (reasonFile === undefined) die2('--reason-file requires a <path> argument.');
    } else if (a === '--surface-class') {
      surfaceClassArg = argv[++i];
      if (surfaceClassArg === undefined) die2('--surface-class requires a <class> argument (ui|command|endpoint|api).');
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      die2(`unknown option: ${a}\n${USAGE}`);
    } else {
      if (mapPath !== null) die2(`unexpected extra argument: ${a}\n${USAGE}`);
      mapPath = a;
    }
  }

  if (mapPath === null) mapPath = DEFAULT_MAP;

  let mapText;
  try {
    mapText = fs.readFileSync(mapPath, 'utf8');
  } catch (e) {
    die2(`cannot read map ${mapPath} (${e.message}).`);
  }

  let findings = 0;

  // ---- PRIMARY: test-id binding ----
  const entries = parseEntries(mapText);

  // SILENT-DROP BACKSTOP — a table VISIBLY carrying a `verified` row that parsed to ZERO entries is the
  // silent-drop-to-zero fail-open (a mangled / stray-`|` / unrecognized Test-id|State header
  // dropped the whole table). Surface it LOUDLY as a finding rather than passing green on
  // "0 verified" — the exact fail-open shape this backstop names, caught even when the header fix above
  // cannot recover the column.
  if (entries.length === 0) {
    const looksVerified = normalize(mapText).split('\n').some((l) => {
      const t = l.trim();
      return t.startsWith('|') && !isSeparatorRow(splitRow(t)) && /\bverified\b/i.test(t);
    });
    if (looksVerified) {
      console.error(
        `VIOLATION  ${mapPath}: a table row says \`verified\` but the App-Map parsed to ZERO ` +
        'entries — the Test-id/State header could not be read (a mangled, double-spaced, or ' +
        'stray-`|` header). Fix the table header so the entries bind; refusing to pass a map that ' +
        'silently dropped its verified rows.'
      );
      findings++;
    }
  }

  const verified = entries.filter((e) => e.state.includes('verified'));

  if (verified.length > 0) {
    const globs = (testGlobs.length ? testGlobs : DEFAULT_TEST_GLOBS).map(globToRegExp);
    const testFiles = walkFiles('.').filter((f) => matchesAny(f, globs));

    // Resolve the cited ids by scanning ONE FILE AT A TIME — never the whole corpus
    // in memory at once. Count any file dropped from the scan (unreadable, or
    // over the per-file size cap) so a shrunken search scope is VISIBLE rather than a
    // silent "dead id".
    const wanted = new Set(
      verified.map((e) => e.testid).filter((id) => id && !EMPTY_CELL.has(id.toLowerCase()))
    );
    const found = new Set();
    let skippedUnreadable = 0;
    let skippedOversize = 0;
    for (const f of testFiles) {
      if (found.size === wanted.size) break; // every cited id already bound — stop reading
      let size;
      try { size = fs.statSync(f).size; } catch (_) { skippedUnreadable++; continue; }
      if (size > MAX_FILE_BYTES) { skippedOversize++; continue; }
      let content;
      try { content = normalize(fs.readFileSync(f, 'utf8')); } catch (_) { skippedUnreadable++; continue; }
      for (const id of wanted) {
        if (!found.has(id) && content.includes(id)) found.add(id);
      }
      // `content` is not retained past this iteration → bounded memory.
    }
    if (skippedUnreadable > 0 || skippedOversize > 0) {
      process.stdout.write(
        `note  ${skippedUnreadable} unreadable + ${skippedOversize} oversize test file(s) skipped ` +
        `during the test-id scan (search scope reduced; files > ${MAX_FILE_BYTES} bytes are skipped).\n`
      );
    }
    const exists = (id) => found.has(id);

    for (const e of verified) {
      if (!e.testid || EMPTY_CELL.has(e.testid.toLowerCase())) {
        console.error(
          `VIOLATION  ${mapPath}:${e.line}: a \`verified\` entry cites no test-id. ` +
          'A verified surface must bind to a test-id the harness asserts (or mark it `manual-only`).'
        );
        findings++;
        continue;
      }
      if (!exists(e.testid)) {
        console.error(
          `VIOLATION  ${mapPath}:${e.line}: \`verified\` entry cites test-id "${e.testid}", ` +
          `which exists in NO test file (searched ${testFiles.length} file(s)). ` +
          'The map has drifted from the harness: restore the test-id, fix the map, or downgrade to `manual-only`.'
        );
        findings++;
      }
    }
  }

  // ---- G10: assembled-execution cluster-gate ----
  // For a runtime/drivable surface class (ui/command/endpoint), unit/component green
  // is necessary-not-sufficient: every `verified` entry must ALSO cite assembled-
  // execution evidence (the run reference the verifier's assembled_execution pass
  // retains and Stage C structures into the reproducible block). The arming is ALWAYS
  // visible; an unresolved class leaves it un-armed (a stamp-less legacy map never
  // false-blocks). This STACKS ON the test-id binding above — it does not replace it.
  const surfaceClass = resolveSurfaceClass(surfaceClassArg, mapText);
  if (surfaceClass === null) {
    // Only worth a note when there is something the gate WOULD have judged.
    if (verified.length > 0) {
      process.stdout.write(
        'note  G10 cluster-gate NOT armed: surface class undeclared ' +
        '(no `surface class: `X`` stamp and no --surface-class) — assembled-execution ' +
        'evidence not required. Declare the class to arm the gate.\n'
      );
    }
  } else if (!requiresAssembledExecution(surfaceClass)) {
    process.stdout.write(
      `note  G10 cluster-gate n/a: surface class \`${surfaceClass}\` (library/api) is not a ` +
      'runtime/drivable class — the test-id binding is sufficient; assembled-execution not required.\n'
    );
  } else {
    // ARMED — visible, never silent.
    process.stdout.write(
      `note  G10 cluster-gate armed because surface class = \`${surfaceClass}\` ` +
      '(runtime/drivable): every `verified` entry must cite assembled-execution evidence ' +
      '(unit/component green is necessary-not-sufficient).\n'
    );
    for (const e of verified) {
      const ev = (e.evidence || '').replace(/`/g, '').trim();
      const missing = !ev || EMPTY_CELL.has(ev.toLowerCase()) || /\{\{.*\}\}/.test(ev);
      if (missing) {
        console.error(
          `VIOLATION  ${mapPath}:${e.line}: G10 cluster-gate — a \`verified\` entry on a ` +
          `runtime/drivable surface (class \`${surfaceClass}\`) cites NO assembled-execution ` +
          'evidence. Drive the REAL surface (the verifier assembled_execution pass), retain the ' +
          'command + result, and reference it in the Evidence column — or downgrade to `manual-only`. ' +
          'Unit/component green cannot approve a runtime surface.'
        );
        findings++;
      }
    }
  }

  // ---- SECONDARY: surface-source tripwire (only when --surface globs given) ----
  if (surfaceGlobs.length > 0) {
    if (base === null) base = resolveDefaultBase();
    const diff = git(['diff', '--name-only', base]);
    if (diff.code !== 0) {
      die2(`git diff --name-only ${base} failed: ${diff.stderr.trim() || 'unknown error'}`);
    }
    const changed = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const surfaceRe = surfaceGlobs.map(globToRegExp);
    const touchedSurface = changed.filter((f) => matchesAny(f, surfaceRe));
    const mapPosix = mapPath.replace(/\\/g, '/').replace(/^\.\//, '');
    const mapTouched = changed.some(
      (f) => f === mapPosix || f.endsWith('/' + mapPosix) || f.endsWith('/' + path.basename(mapPosix))
    );

    if (touchedSurface.length > 0 && !mapTouched) {
      // Is the omission accounted for by a logged escape token?
      let silenced = false;
      let token = null;
      if (reasonOk) {
        silenced = true;
        token = reasonOk;
      } else if (reasonFile) {
        let body = '';
        try {
          body = fs.readFileSync(reasonFile, 'utf8');
        } catch (e) {
          die2(`cannot read --reason-file ${reasonFile} (${e.message}).`);
        }
        const m = body.match(/app-map-unchanged\s*:\s*(.+)/i);
        if (m && m[1].trim()) {
          silenced = true;
          token = m[1].trim();
        }
      }

      if (silenced) {
        process.stdout.write(
          `note  surface source changed (${touchedSurface.length} file(s)) with no ${mapPath} ` +
          `update — silenced by logged app-map-unchanged: ${token}\n`
        );
      } else {
        console.error(
          `VIOLATION  surface source changed since ${base.slice(0, 12)} ` +
          `(${touchedSurface.slice(0, 5).join(', ')}${touchedSurface.length > 5 ? ', …' : ''}) ` +
          `but ${mapPath} was not updated. If a user-facing surface changed, update the map. ` +
          'If it genuinely did not (e.g. a no-UX refactor), log a reason: ' +
          '`--reason-ok "<why>"` or an `app-map-unchanged: <why>` line in the stage surface ' +
          '(via --reason-file). Never silence it with --no-verify.'
        );
        findings++;
      }
    }
  }

  if (findings > 0) {
    process.stderr.write(
      `\n${findings} app-map finding(s). The map must stay bound to the running app: ` +
      'every `verified` entry cites a live test-id, and a surface-source change updates ' +
      'the map (or logs why it did not).\n'
    );
    process.exit(1);
  }
  process.stdout.write(`ok    ${mapPath}  (${verified.length} verified entr${verified.length === 1 ? 'y' : 'ies'} bound)\n`);
  process.exit(0);
}

main();
