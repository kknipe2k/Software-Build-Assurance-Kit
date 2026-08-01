#!/usr/bin/env node
// @kit-version 1.0.3
// scripts/kit-update.cjs
//
// THE UPDATE STORY (I13, M20.5.B) — a bootstrapped project's drift report against the
// kit's templates/, and its per-file re-copy. Before this tool, kit-update was a prose
// note ("manually re-copy hooks") over ~5.6k LOC of inherited enforcement.
//
// WHAT IT DOES (read-only by default — a plain run never writes):
//   • For every kit-MANAGED enforcement file (validators/ · .claude/hooks/ ·
//     .claude/commands/ · scripts/ · .githooks/ — the row-set-derived bounded list
//     below), diff the LIVE copy against the kit's template:
//       clean      — byte-identical after LF normalization
//       note       — line-endings differ only (normalized-identical; the .gitattributes
//                    eol=lf discipline makes this a checkout artifact, not drift)
//       stamp      — @kit-version stamps disagree (the kit updated; --apply re-copies COPY rows)
//       drifted    — content differs from the template (--apply restores)
//       divergent  — the live file DECLARES itself intentionally divergent (ARC-007 header,
//                    case-insensitive); reported, NEVER overwritten — --apply refuses it
//       wiring     — a bootstrap-FILLED file ({{placeholders}} replaced at Phase 3); content
//                    drift is by design, so only the stamp is compared.
//                    --apply REFUSES wiring rows even on stamp drift: a placeholder template
//                    cannot restore a filled file — take a kit update here by bootstrap fill
//                    or hand-merge (M20.5.V F1)
//       absent     — the row is not rendered in this project (tier/toggle) — skipped
//   • `--apply <file>` restores ONE named copy-row file from its template, byte-identical,
//     via WRITE-TEMP-RENAME (never truncate-in-place), confined below the project
//     root (scripts/lib/sandbox.cjs assertInside — fail-closed on a hostile path).
//
// M22.C (UAT #0/#2/#3/#16/#19/#23) adds three subcommands to the same engine:
//   • `--detect` — repo-STATE classifier: fresh | project | stripped. Needs NO
//     template source (a fully-stripped repo may have lost templates/ too, and
//     detection must never fail because the thing it detects is missing). The
//     stripped report ASKS (re-adopt / full bootstrap / stop) — it never
//     auto-routes; misclassifying a real fresh bootstrap as stripped is as bad
//     as the reverse.
//   • `--adopt [--dry-run]` — the INSTALLER (copy ≠ install was UAT #2): walks
//     templates/dot-claude → .claude/, templates/dot-githooks → .githooks/,
//     templates/scripts → scripts/, installs what is absent, VERIFIES what is
//     present (the existing engine), sets core.hooksPath, verifies the receipts
//     hook landed byte-identical (#0), and mediates every collision by REPORT,
//     never overwrite (#16) — EXCEPT .claude/settings.json, where KF-56 (M27.B)
//     replaces keep-and-report with a VERIFIED MERGE via lib/settings-merge.cjs:
//     byte-exact archive + semantic merge of the template-derived kit
//     registrations and permissions floor + atomic replace + auto-restore. User
//     hooks, rules, and unknown keys survive; conflicts are reported per the
//     two-class taxonomy (never silently resolved); an unparseable settings
//     file is archived and reported, never replaced. Adoption may not end
//     "controls dormant."
//     Its route table reads the file-classes from release-manifest.json in THIS
//     repo — one source of truth with the pack path (C.3.5) — and FAILS CLOSED
//     when the manifest is absent: never guess classes. Idempotent: a clean
//     second run writes zero bytes. `--dry-run` prints the plan, writes nothing.
//   • `--ingest` — brownfield known-issue harvest (#19): TD-labeled test titles,
//     .skip/fixme markers, retry configs land in docs/gotchas.md /
//     docs/tech-debt.md as IMPORTED entries — imported, never invented; the
//     ledgers are append-only, so a re-run never duplicates an entry. --adopt
//     runs it automatically (not under --dry-run).
//
// TEMPLATE SOURCE resolution: `--kit <dir>` (a kit checkout) → else `./templates/` in
// the project root (kept at bootstrap) → else exit 2 with guidance.
//
// KIT-REPO NO-OP: inside the kit WORKSHOP itself (a contributor clone included)
// this tool has no job — the kit IS the source, and its live copies legitimately
// diverge from templates/ mid-milestone (ARC-007). One line, exit 0. The
// discriminator is the workshop-only pair release/CLAUDE.md + scripts/smoke.cjs
// (BOTH required): neither ships in the release ZIP nor lands in an adopted
// repo, and demanding the pair means an app's own scripts/smoke.cjs can never
// no-op the installer. The old marker (the golden row-set fixture) is WRONG for
// this job since C.3.5 packs scripts/fixtures/ into the payload — an unzipped
// starter carries rows.json, and no-opping there is exactly the UAT #2 failure
// ("kit-update would detect it, but it no-ops in what looks like the kit repo").
//
// Exit 0 = clean (declared divergences and notes do not fail). Exit 1 = drift reported.
// Exit 2 = usage / fail-closed (no template source, hostile --apply path, unknown file).
//
// HONEST LOCUS: this reports and restores the kit-managed ENFORCEMENT set. Project-owned
// content (docs/, prompts/, read-first lists, settings.json's filled fence, LICENSE) is
// deliberately OUT — the project is supposed to change those.
//
// .cjs = always CommonJS regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The confinement primitive travels with the tool (red ruling D2 — extend, don't fork).
const { assertInside, classifyDestination } = require(path.join(__dirname, 'lib', 'sandbox.cjs'));
const { repairHookModes } = require(path.join(__dirname, 'lib', 'hook-chmod.cjs'));
const { applySettingsMerge, deriveKitSettings, flattenRegistrations } = require(path.join(__dirname, 'lib', 'settings-merge.cjs'));

// ── the MANAGED set (rows-derived, smoke-locked against rows.json BOTH directions) ──────
// Every enforcement-class row of the golden row-set (scripts/fixtures/golden-bootstrap/
// rows.json): file = the live path in a generated project; template = the path under the
// kit; render = 'copy' (byte-compare, normalized) or 'wiring' (bootstrap-filled — stamp
// compare only). A row absent on disk is 'absent' (tier/toggle-conditional), never an
// error. This list is DERIVED from rows.json at kit-build time and reconciled by the
// kit's smoke suite — edit rows.json, not (only) this table.
const MANAGED = [
  { file: 'validators/validate-stage-prompts.cjs', template: 'validators/validate-stage-prompts.cjs', render: 'copy' },
  { file: 'validators/validate-retrospective.cjs', template: 'validators/validate-retrospective.cjs', render: 'copy' },
  { file: 'validators/validate-app-map.cjs', template: 'validators/validate-app-map.cjs', render: 'copy' },
  { file: 'validators/validate-test-honesty.cjs', template: 'validators/validate-test-honesty.cjs', render: 'copy' },
  { file: 'validators/validate-operating-mode.cjs', template: 'validators/validate-operating-mode.cjs', render: 'copy' },
  { file: 'validators/validate-outcome-challenge.cjs', template: 'validators/validate-outcome-challenge.cjs', render: 'copy' },
  { file: 'validators/validate-risk-escalation.cjs', template: 'validators/validate-risk-escalation.cjs', render: 'copy' },
  { file: 'validators/validate-destructive-op.cjs', template: 'validators/validate-destructive-op.cjs', render: 'copy' },
  { file: 'validators/validate-risk-matrix.cjs', template: 'validators/validate-risk-matrix.cjs', render: 'copy' },
  { file: 'validators/validate-calibration.cjs', template: 'validators/validate-calibration.cjs', render: 'copy' },
  { file: 'validators/validate-reconciliation.cjs', template: 'validators/validate-reconciliation.cjs', render: 'copy' },
  { file: 'validators/validate-transition.cjs', template: 'validators/validate-transition.cjs', render: 'copy' },
  { file: 'validators/validate-release-readiness.cjs', template: 'validators/validate-release-readiness.cjs', render: 'copy' },
  { file: 'validators/validate-carry-forward.cjs', template: 'validators/validate-carry-forward.cjs', render: 'copy' },
  { file: 'validators/validate-spec-examples.cjs', template: 'validators/validate-spec-examples.cjs', render: 'copy' },
  { file: 'validators/check-append-only.cjs', template: 'validators/check-append-only.cjs', render: 'copy' },
  { file: 'validators/lib/fenced-block.cjs', template: 'validators/lib/fenced-block.cjs', render: 'copy' },
  { file: 'validators/README.md', template: 'validators/README.md', render: 'copy' },
  { file: '.claude/hooks/session-start-read-first.cjs', template: 'templates/dot-claude/hooks/session-start-read-first.cjs', render: 'copy' },
  { file: '.claude/hooks/user-prompt-submit-mode-check.cjs', template: 'templates/dot-claude/hooks/user-prompt-submit-mode-check.cjs', render: 'copy' },
  { file: '.claude/hooks/pretooluse-red-gate.cjs', template: 'templates/dot-claude/hooks/pretooluse-red-gate.cjs', render: 'copy' },
  { file: '.claude/hooks/receipts-lifecycle.cjs', template: 'templates/dot-claude/hooks/receipts-lifecycle.cjs', render: 'copy' },
  { file: '.claude/commands/stage.md', template: 'templates/dot-claude/commands/stage.md', render: 'copy' },
  { file: '.claude/commands/verify.md', template: 'templates/dot-claude/commands/verify.md', render: 'copy' },
  { file: '.claude/commands/refactor.md', template: 'templates/dot-claude/commands/refactor.md', render: 'copy' },
  { file: '.claude/commands/closeout.md', template: 'templates/dot-claude/commands/closeout.md', render: 'copy' },
  { file: '.claude/commands/on-track.md', template: 'templates/dot-claude/commands/on-track.md', render: 'copy' },
  { file: '.claude/commands/approve-red.md', template: 'templates/dot-claude/commands/approve-red.md', render: 'copy' },
  { file: 'scripts/set-mode.cjs', template: 'templates/scripts/set-mode.cjs', render: 'copy' },
  { file: 'scripts/stage-active.cjs', template: 'templates/scripts/stage-active.cjs', render: 'copy' },
  { file: 'scripts/approve-red.cjs', template: 'templates/scripts/approve-red.cjs', render: 'copy' },
  { file: 'scripts/install-hooks.cjs', template: 'templates/scripts/install-hooks.cjs', render: 'copy' },
  { file: 'scripts/verify-local.cjs', template: 'templates/scripts/verify-local.cjs', render: 'wiring' },
  { file: 'scripts/kit-update.cjs', template: 'templates/scripts/kit-update.cjs', render: 'copy' },
  { file: 'scripts/smoke-project.cjs', template: 'templates/scripts/smoke-project.cjs', render: 'copy' },
  { file: 'scripts/lib/sandbox.cjs', template: 'templates/scripts/lib/sandbox.cjs', render: 'copy' },
  { file: 'scripts/lib/hook-chmod.cjs', template: 'templates/scripts/lib/hook-chmod.cjs', render: 'copy' },
  { file: 'scripts/lib/settings-merge.cjs', template: 'templates/scripts/lib/settings-merge.cjs', render: 'copy' },
  { file: 'scripts/lib/stage-structure.cjs', template: 'templates/scripts/lib/stage-structure.cjs', render: 'copy' },
  { file: 'scripts/lib/receipts.cjs', template: 'templates/scripts/lib/receipts.cjs', render: 'copy' },
  { file: 'scripts/lib/receipts-collect.cjs', template: 'templates/scripts/lib/receipts-collect.cjs', render: 'copy' },
  { file: 'scripts/build-receipts.cjs', template: 'templates/scripts/build-receipts.cjs', render: 'copy' },
  { file: '.githooks/pre-commit', template: 'templates/dot-githooks/pre-commit', render: 'wiring' },
  { file: '.githooks/pre-push', template: 'templates/dot-githooks/pre-push', render: 'copy' },
];

// The ARC-007 convention (M09.D): a live file declaring itself intentionally divergent.
// HEAD-SCOPED: the convention is a file-TOP header (like the kit's own verify-local /
// pre-commit headers), so only the first lines are consulted — a file whose BODY merely
// contains the marker string (this tool's own regex source, a doc example) is never a
// false divergent (the self-report false positive the M20.5.B demo transcript caught).
// CASE-INSENSITIVE (M20.5.V F6): the marker is a convention, not a shibboleth — a
// lowercase declaration is equally protected (case-sensitive matching classed it
// drifted, where --apply would overwrite the user's declared divergence). This file's
// own head therefore never spells the two marker words adjacently in lowercase.
const DIVERGENCE_RE = /INTENTIONAL DIVERGENCE/i;
const DIVERGENCE_HEAD_LINES = 30;
const STAMP_RE = /@kit-version\s+(\S+)/;

// CRLF (and lone CR) → LF, so a Windows checkout never reads as content drift.
function normalize(s) { return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }
function declaresDivergence(text) {
  return DIVERGENCE_RE.test(normalize(text).split('\n').slice(0, DIVERGENCE_HEAD_LINES).join('\n'));
}
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
function stampOf(text) { const m = STAMP_RE.exec(String(text)); return m ? m[1] : null; }

function usage(msg) {
  if (msg) process.stderr.write(`kit-update: ${msg}\n`);
  process.stderr.write(
    'usage: node scripts/kit-update.cjs [--kit <kit-checkout>] [--apply <live-file>]\n' +
    '                                   [--detect] [--adopt [--dry-run]] [--ingest]\n' +
    '  read-only drift report by default; --apply restores ONE managed file from its template;\n' +
    '  --detect classifies the repo state (fresh|project|stripped); --adopt installs the live\n' +
    '  enforcement wiring from templates/ (collisions reported, never overwritten; an existing\n' +
    '  .claude/settings.json is MERGED with a byte-exact archive + rollback, KF-56); --ingest\n' +
    '  harvests existing known-issue markers into the ledgers as imported entries.\n'
  );
  process.exit(2);
}

// ── --detect: the repo-state classifier (UAT #3 — the stripped third state) ────────────
// project  — project files present (this repo is initialized)
// stripped — NO project files, but at least one previously-kitted / existing-code signal
// fresh    — neither: a genuinely fresh bootstrap
// Pure repo inspection: no template source needed, nothing written, exit 0 always.
const PROJECT_FILES = ['project-config.md', 'docs/identity.md', 'docs/scope.md'];
// Kit vocabulary in commit subjects: stage ids (M01.A / M20.5.B), the per-stage
// artifacts, the framework docs. Deliberately stage-shaped — an app repo's own
// history should not trip it, and a false "stripped" only ever ASKS, never routes.
const KIT_VOCAB_RE = /\bM\d{2}(?:\.\d+)*\.[A-Z]\b|\bretrospective\b|\bread-first\b|BUILD-PLAYBOOK|stage-active|approve-red/i;
const SRC_DIRS = ['src', 'lib', 'app'];
function detectRepoState(projRoot) {
  if (PROJECT_FILES.some((f) => fs.existsSync(path.join(projRoot, f)))) {
    return { state: 'project', signals: [] };
  }
  const signals = [];
  const ch = readIf(path.join(projRoot, 'CHANGELOG.md'));
  if (ch !== null && normalize(ch).split('\n').some((l) => l.trim() !== '' && !/^#/.test(l.trim()))) {
    signals.push('populated CHANGELOG.md');
  }
  const log = spawnSync('git', ['log', '--format=%s', '-n', '200'], { cwd: projRoot, encoding: 'utf8' });
  if (log.status === 0 && KIT_VOCAB_RE.test(String(log.stdout || ''))) {
    signals.push('kit vocabulary in git history');
  }
  if (SRC_DIRS.some((d) => { try { return fs.readdirSync(path.join(projRoot, d)).length > 0; } catch (_) { return false; } })) {
    signals.push('app source tree present');
  }
  return signals.length ? { state: 'stripped', signals: signals } : { state: 'fresh', signals: [] };
}
function cmdDetect(projRoot) {
  const d = detectRepoState(projRoot);
  if (d.state === 'stripped') {
    process.stdout.write(
      'kit-update: state=stripped — this looks like a previously-kitted or existing project (' + d.signals.join('; ') + ').\n' +
      '  Choose: re-adopt (node scripts/kit-update.cjs --adopt), full bootstrap, or stop.\n' +
      '  Never silently proceed as a fresh bootstrap: adopt restores the enforcement wiring; bootstrap re-runs calibration.\n'
    );
  } else if (d.state === 'project') {
    process.stdout.write('kit-update: state=project — project files present; this repo is initialized (use the drift report / --apply).\n');
  } else {
    process.stdout.write('kit-update: state=fresh — no project files and no stripped-state signals; a fresh bootstrap is the right path.\n');
  }
  return 0;
}

// ── --ingest: brownfield known-issue harvest (UAT #19 — imported, never invented) ──────
// Scans the repo's own test files for markers the host already wrote down —
// TD-labeled test titles, .skip / fixme annotations, retry configs — and appends
// them to docs/gotchas.md + docs/tech-debt.md (TD-labeled) or docs/gotchas.md
// (the rest) as IMPORTED entries. The ledgers are append-only: an entry whose
// title is already present is never appended again, so --ingest (and the --adopt
// that runs it) is idempotent. No markers → nothing written, no files created.
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const INGEST_SKIP_DIRS = new Set(['.git', 'node_modules', 'templates', '.claude', '.githooks',
  'dist', 'build', 'out', 'coverage', 'vendor', 'retrospectives']);
function collectTestFiles(root) {
  const out = [];
  (function walkDir(dir, depth) {
    if (depth > 6) return;
    let names; try { names = fs.readdirSync(dir); } catch (_) { return; }
    for (const name of names) {
      if (INGEST_SKIP_DIRS.has(name)) continue;
      const p = path.join(dir, name);
      let st; try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) walkDir(p, depth + 1);
      else if (TEST_FILE_RE.test(name)) out.push(p);
    }
  })(root, 0);
  return out;
}
function harvestKnownIssues(projRoot) {
  const found = [];
  for (const abs of collectTestFiles(projRoot)) {
    const rel = path.relative(projRoot, abs).split(path.sep).join('/');
    const text = readIf(abs);
    if (text === null) continue;
    for (const line of normalize(text).split('\n')) {
      const tm = /['"`]([^'"`]+)['"`]/.exec(line);
      const title = tm ? tm[1] : null;
      if (!title) continue;
      // The kind never repeats the TD id — the title already carries it, and a
      // ledger entry should hold each marker exactly once (the rider counts them).
      const td = /\bTD-\d+\b/.exec(line);
      if (td) found.push({ title: title, kind: 'TD-labeled test', file: rel, td: true });
      else if (/\b(?:it|test|describe)\.skip\s*\(/.test(line)) found.push({ title: title, kind: 'skipped test (.skip)', file: rel, td: false });
      else if (/\bfixme\b/i.test(line)) found.push({ title: title, kind: 'fixme marker', file: rel, td: false });
      else if (/\bretr(?:y|ies)\s*[:(]/.test(line)) found.push({ title: title, kind: 'retry config', file: rel, td: false });
    }
  }
  return found;
}
function cmdIngest(projRoot, dryRun) {
  const found = harvestKnownIssues(projRoot);
  if (found.length === 0) {
    process.stdout.write('kit-update: ingest — no known-issue markers found; nothing imported (imported, never invented).\n');
    return 0;
  }
  const gotchas = path.join(projRoot, 'docs', 'gotchas.md');
  const techdebt = path.join(projRoot, 'docs', 'tech-debt.md');
  let added = 0;
  for (const f of found) {
    const entry = '- **[imported — ' + f.kind + ']** "' + f.title + '" — harvested from `' + f.file +
      '` by kit-update --ingest; a pre-existing known issue the repo had already written down, not new work.\n';
    for (const ledger of f.td ? [gotchas, techdebt] : [gotchas]) {
      const cur = readIf(ledger) || '';
      if (cur.indexOf(f.title) !== -1) continue; // append-only: never import the same issue twice
      added++;
      if (dryRun) continue;
      const header =
        (cur === '' ? '# ' + (ledger === gotchas ? 'Gotchas' : 'Tech debt') + '\n' : '') +
        (cur.indexOf('## Imported known issues') === -1 ? '\n## Imported known issues (kit-update --ingest)\n\n' : '');
      fs.mkdirSync(path.dirname(ledger), { recursive: true });
      fs.appendFileSync(ledger, header + entry);
    }
  }
  process.stdout.write('kit-update: ingest — ' + added + (dryRun ? ' would be' : '') + ' imported (TD-labeled / .skip / fixme / retry markers; existing entries never duplicated).\n');
  return 0;
}

// ── --adopt: the installer (UAT #2/#0/#16; C.3.5 route table) ───────────────────────────
// The packed kit nests under ONE dir at the unzip root (M22.D namespace repack;
// #23): CLAUDE.md is the only root file, everything else lives in sbak/. Probe
// order everywhere below: the flat location first (workshop / clone / a
// pre-repack install), then sbak/ (a nested unzip or adopted repo).
const KIT_DIR = 'sbak';
const ADOPT_TREES = [
  { from: 'templates/dot-claude', to: '.claude' },
  { from: 'templates/dot-githooks', to: '.githooks' },
  { from: 'templates/scripts', to: 'scripts' },
];
const FILE_CLASSES = ['payload', 'repo-identity'];
function walkFiles(root) {
  const out = [];
  (function w(dir, rel) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(p).isDirectory()) w(p, r);
      else out.push(r);
    }
  })(root, '');
  return out;
}
function cmdAdopt(projRoot, kitRoot, dryRun) {
  // Route table: the file-classes from THIS repo's release-manifest.json — the
  // same classes the pack path reads (C.3.5, one source of truth). FAIL-CLOSED
  // when absent or unclassified: the installer never guesses what is kit
  // machinery and what is the host repo's own paperwork.
  let man = null;
  // C-c (M22.D): the manifest ships nested — probe the root (flat checkout),
  // then the kit dir (nested unzip / adopted repo).
  for (const cand of ['release-manifest.json', KIT_DIR + '/release-manifest.json']) {
    try { man = JSON.parse(fs.readFileSync(path.join(projRoot, cand), 'utf8')); break; } catch (_) { man = null; }
  }
  if (!man || !Array.isArray(man.files)) {
    process.stderr.write(
      'kit-update: --adopt refused — release-manifest.json is missing or unreadable in this repo (fail-closed).\n' +
      '  The manifest carries the file-class route table (payload | repo-identity); without it the installer\n' +
      '  will not guess. Install from the release ZIP (which ships release-manifest.json), or copy it from a\n' +
      '  kit checkout, then re-run.\n'
    );
    return 2;
  }
  const unclassed = man.files.filter((e) => FILE_CLASSES.indexOf(e.fileClass) === -1);
  if (unclassed.length) {
    process.stderr.write('kit-update: --adopt refused — release-manifest.json entries missing/unknown fileClass: ' +
      unclassed.map((e) => e.dest).join(', ') + ' (fail-closed; every entry must be payload | repo-identity).\n');
    return 2;
  }
  const repoIdentity = man.files.filter((e) => e.fileClass === 'repo-identity').map((e) => e.dest);

  const managedByFile = new Map(MANAGED.map((r) => [r.file, r]));
  const W = (s) => process.stdout.write(s + '\n');
  W('kit-update --adopt' + (dryRun ? ' (dry-run — the PLAN below; zero writes)' : '') + ' — installing the live enforcement wiring from ' + path.join(kitRoot, 'templates'));
  let installed = 0; let kept = 0; let drifted = 0; let ok = 0;
  let placeholderNote = false;
  let hookRefused = 0; // KF-55: refused .githooks entries — a non-zero count means activation is INCOMPLETE and adopt exits non-zero
  let settingsIncomplete = 0; // KF-56: unparseable/aborted/restored settings merge, or reported conflicts — INCOMPLETE, non-zero
  let settingsConflicts = 0;
  let rowRefused = 0; // KF-58 (M28.E): symlink refusals at NON-.githooks destination rows
  let missingSources = 0;
  const refusedRows = new Set();
  // Finding 4 (M28.E): the named enforcement layers this run could not activate. A successful
  // --adopt means every one of them is LIVE, so anything landing here also decides the exit.
  // `repair` is a command that RUNS IN THE STATE IT IS PRINTED IN or it is null — the whole
  // point of A's decision 4 was that `git config core.hooksPath .githooks`, printed in a
  // directory with no repository, returns exit 128. Guidance that cannot run is not guidance.
  // `alt` carries a non-executable alternative when one honestly exists.
  const missingControls = [];
  const missing = (control, why, repair, alt) =>
    missingControls.push({ control: control, why: why, repair: repair || null, alt: alt || null });
  for (const t of ADOPT_TREES) {
    const srcRoot = path.join(kitRoot, t.from);
    if (!fs.existsSync(srcRoot)) {
      // Finding 4 (M28.E): this used to print and fall through to exit 0 — a partial kit copy
      // installed NOTHING under this tree and adoption still reported success. For
      // templates/dot-claude that means every session control, including the receipts hook
      // (#0), is absent while the summary says "installed".
      W('  missing-source ' + t.from + '/ — template tree absent in the kit source, skipped (partial kit copy?)');
      missingSources++;
      missing('kit template tree ' + t.from + '/ (installs ' + t.to + '/)',
        'the template tree is absent from the kit source, so nothing under ' + t.to + '/ was installed',
        null,
        'point --adopt at a complete kit checkout: node scripts/kit-update.cjs --adopt --kit <path-to-a-kit-checkout>');
      continue;
    }
    for (const rel of walkFiles(srcRoot)) {
      const destRel = t.to + '/' + rel;
      const srcAbs = path.join(srcRoot, rel);
      const tpl = fs.readFileSync(srcAbs);
      const tplText = tpl.toString('utf8');
      // KF-55 (M27.A, owner condition C2b) GENERALIZED to every destination row at M28.E
      // (KF-58). A SYMLINK at any managed destination is refused up front, and the check runs
      // on the PLAIN JOINED path BEFORE the confinement assert — assertInside resolves
      // symlinks by design, so asserting first would either throw the generic confinement
      // error (external target) or hand back the TARGET path (internal target) and make the
      // link invisible. A DANGLING link reads as absent below (readIf follows the link), and
      // the install rename would silently REPLACE the user's link with template bytes — the
      // existsSync-false path. M27.A closed that for `.githooks/` only; every other row still
      // took it, which is KF-58. Measured on the pre-fix tree: 5457 bytes written over a
      // dangling scripts/set-mode.cjs link and 2101 over .claude/commands/stage.md, exit 0,
      // no refusal line.
      //
      // The COUNTER is routed by tree so the KF-55 report stays exactly as it shipped: a
      // .githooks refusal still means "hook activation INCOMPLETE"; any other row is this
      // stage's own never-overwrite refusal. Both are visible and both exit non-zero.
      {
        const cls = classifyDestination(path.join(projRoot, destRel));
        if (cls.kind === 'symlink') {
          refusedRows.add(destRel);
          const dang = cls.dangling ? ' (dangling)' : '';
          if (destRel.startsWith('.githooks/')) {
            hookRefused++;
            W('  refused    ' + destRel + ' — symlink' + dang
              + '; adopt never installs over or chmods through a symlink — replace it with a regular file to activate this hook');
          } else if (destRel === '.claude/settings.json') {
            // The settings row earns its own repair text: refusing here means the KF-56
            // verified merge never ran, so the kit's registrations are not merely uninstalled
            // — they are DORMANT, which is the failure KF-56 exists to prevent. Saying
            // "replace it with a regular file" alone would hide that.
            rowRefused++;
            W('  refused    ' + destRel + ' — symlink' + dang
              + '; adopt never writes over or through a symlink, so the verified settings merge (KF-56) did NOT run'
              + ' and the kit session controls are dormant — repair: materialize it as a regular file (copy the'
              + ' link\'s contents in place of the link) and re-run --adopt to merge, or merge the "hooks" section'
              + ' by hand from the kit template');
          } else {
            rowRefused++;
            W('  refused    ' + destRel + ' — symlink' + dang
              + '; adopt never installs over a symlink, so your link and its target are left exactly as they are'
              + ' (#16 never-overwrite) — repair: replace it with a regular file to let adopt install this row,'
              + ' or merge the template by hand');
          }
          continue;
        }
      }
      let liveAbs;
      try { liveAbs = assertInside(projRoot, destRel); } catch (e) { W('  refused    ' + destRel + ' — ' + e.message); continue; }
      const row = managedByFile.get(destRel);
      // The wiring annotation keys off the ROW's render kind for managed rows
      // (build-receipts legitimately contains {{…}} in its rendered-HTML strings
      // and is still a plain copy row); only an UNMANAGED file falls back to a
      // token scan (settings.json and the read-first lists are bootstrap-filled).
      const carriesTokens = row ? row.render === 'wiring' : /\{\{[A-Z0-9_]+\}\}/.test(tplText);
      const live = readIf(liveAbs);
      if (live === null) {
        installed++;
        if (carriesTokens) placeholderNote = true;
        if (dryRun) { W('  would-install ' + destRel + (carriesTokens ? ' (wiring — carries {{placeholders}}; filled at bootstrap, not at adopt)' : '')); continue; }
        const tmp = liveAbs + '.kit-update.tmp';
        fs.mkdirSync(path.dirname(liveAbs), { recursive: true });
        fs.writeFileSync(tmp, tpl);
        fs.renameSync(tmp, liveAbs);
        W('  installed  ' + destRel + (carriesTokens ? ' (wiring — carries {{placeholders}}; filled at bootstrap, not at adopt)' : ''));
        continue;
      }
      // Present: NEVER overwritten by adopt (#16). Verify managed copy rows with
      // the engine's own rules; everything else is kept + reported.
      if (declaresDivergence(live)) {
        kept++;
        // KF-56 gate-3 ruling: an ARC-007-declared settings file is the user's
        // explicit standing choice — kept, exit 0 (the C1 never-modify-user-rules
        // principle) — but the note must name EVERY dormant control and the
        // exact undo; a quiet "kept" here would be §8 blocker 2 wearing a
        // declaration.
        let divNote = '';
        if (destRel === '.claude/settings.json') {
          let dormant = null;
          try {
            const kitSet = deriveKitSettings(kitRoot);
            const have = new Set(flattenRegistrations(JSON.parse(live)).map((r) => r.command));
            dormant = Array.from(new Set(kitSet.registrations.map((r) => r.command))).filter((c) => !have.has(c));
          } catch (_) { dormant = null; } // unparseable / underivable — cannot inspect
          const tplSettingsRel = path.relative(projRoot, path.join(kitRoot, 'templates', 'dot-claude', 'settings.json')).split(path.sep).join('/');
          if (dormant === null) {
            divNote = ' — NOTE: cannot inspect the declared-divergent settings (unparseable); ALL kit session controls may be dormant.';
          } else if (dormant.length === 0) {
            divNote = ' — all kit registrations present by parsed inspection; nothing dormant.';
          } else {
            divNote = ' — DORMANT controls (' + dormant.length + '): ' + dormant.join(', ') + '.';
          }
          if (dormant === null || dormant.length > 0) {
            divNote += ' Undo: remove the INTENTIONAL DIVERGENCE line from the file head and re-run --adopt to merge them, or hand-merge the "hooks" section from ' + tplSettingsRel + '.';
          }
        }
        W('  divergent  ' + destRel + ' — declared intentional divergence (ARC-007); kept, never overwritten' + divNote);
        continue;
      }
      // KF-56 (M27.B): adoption may not end "controls dormant" — an existing
      // settings.json is MERGED, never kept-dormant and never overwritten:
      // byte-exact archive → semantic merge of the TEMPLATE-DERIVED kit
      // registrations + permissions floor (lib/settings-merge.cjs; exact-command
      // ownership, user hooks/rules/unknown keys survive, two-class conflict
      // taxonomy) → temp write → verify → atomic replace → re-verify →
      // auto-restore on failure. The old string-regex wiredness hint died here:
      // wiredness is parsed-registration inspection, and an unparseable file is
      // archived + reported, never replaced.
      if (destRel === '.claude/settings.json') {
        let sres;
        try {
          sres = applySettingsMerge({ projRoot, kitRoot, dryRun, log: (line) => W('  ' + line) });
        } catch (e) {
          settingsIncomplete++;
          W('  ERROR      .claude/settings.json merge unavailable — ' + e.message + ' (fail-closed; your settings were not touched)');
          continue;
        }
        settingsConflicts += sres.conflictCount;
        if (sres.conflictCount > 0 || sres.status === 'unparseable' || sres.status === 'aborted' || sres.status === 'restored') {
          settingsIncomplete++;
        }
        continue;
      }
      if (row && row.render === 'copy' && normalize(live) !== normalize(tplText)) {
        drifted++;
        W('  drift      ' + destRel + ' — differs from its template; kept (adopt never overwrites — restore explicitly with --apply ' + destRel + ')');
        continue;
      }
      if (row && row.render === 'copy') { ok++; W('  ok         ' + destRel + ' — matches its template'); continue; }
      kept++;
      W('  kept       ' + destRel + ' — exists; never overwritten by adopt');
    }
  }

  // hooksPath: copy without install was exactly the UAT #2 gap.
  //
  // FINDING 4 (M28.E) — ACTIVATION IS VERIFIED, NOT ATTEMPTED AND ASSUMED. M28.A's executed
  // baseline: this block printed a FAILED line and fell through, feeding neither exit counter,
  // so adoption reported "36 installed" and exited 0 with the entire commit-gate layer
  // inactive. Worse, the repair it printed — `git config core.hooksPath .githooks` — returns
  // exit 128 in a directory with no repository, so the guidance was not thin but WRONG.
  //
  // The repository is therefore probed BEFORE the write, for two distinct reasons:
  //   (a) no repository at all -> the honest repair is `git init`, which this branch prints
  //       and which actually runs where it is printed;
  //   (b) the repository's root is ELSEWHERE -> git resolves a RELATIVE core.hooksPath from
  //       the repository root, so hooks installed here would never fire, and the pre-fix code
  //       wrote core.hooksPath into an enclosing repository the kit was never pointed at.
  //       Refusing is both the fail-closed answer and the confinement one.
  const gitTopR = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: projRoot, encoding: 'utf8' });
  const gitTop = gitTopR.status === 0 ? String(gitTopR.stdout || '').trim() : '';
  const samePath = (a, b) => {
    try {
      const n = (s) => { const r = path.resolve(fs.realpathSync(s)); return process.platform === 'win32' ? r.toLowerCase() : r; };
      return n(a) === n(b);
    } catch (_) { return false; }
  };
  const hp = spawnSync('git', ['config', 'core.hooksPath'], { cwd: projRoot, encoding: 'utf8' });
  const hpCur = String(hp.stdout || '').trim();
  if (gitTop === '') {
    W('  hooksPath  NOT ARMED — this directory is not a Git repository, so there are no hooks to arm');
    missing('Git hook activation (core.hooksPath)',
      'this directory is not a Git repository, so Git has no hooks to arm',
      'git init');
  } else if (!samePath(gitTop, projRoot)) {
    W('  hooksPath  NOT ARMED — the enclosing Git repository is at ' + gitTop + ', not here');
    missing('Git hook activation (core.hooksPath)',
      'the enclosing Git repository is at ' + gitTop + ', not here; Git resolves a relative '
        + 'core.hooksPath from the repository root, so hooks installed here would never run — and '
        + 'adopt will not write configuration into a repository it was not pointed at',
      'git init',
      'adopt the enclosing repository instead — run --adopt from ' + gitTop);
  } else {
    if (hpCur === '.githooks') W('  hooksPath  already .githooks');
    else if (dryRun) W('  would-set  core.hooksPath = .githooks');
    else {
      const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: projRoot, encoding: 'utf8' });
      W(r.status === 0 ? '  hooksPath  set to .githooks' : '  hooksPath  FAILED to set (' + String(r.stderr || '').trim() + ') — run: git config core.hooksPath .githooks');
    }
    // READ IT BACK. A write that reported success and a value that reads back wrong are the
    // same inactive control, and only one of them is visible in the write's exit status.
    if (!dryRun) {
      const back = spawnSync('git', ['config', 'core.hooksPath'], { cwd: projRoot, encoding: 'utf8' });
      const now = String(back.stdout || '').trim();
      if (now !== '.githooks') {
        missing('Git hook activation (core.hooksPath)',
          'the hooks path could not be set — core.hooksPath reads ' + (now === '' ? '(unset)' : now)
            + ' after the attempt, so the commit and push gates are not armed',
          'git config core.hooksPath .githooks');
      }
    }
  }

  // Hook executability (the M26 Linux-CI finding): POSIX git SILENTLY IGNORES a
  // non-executable core.hooksPath hook — one hint line, then the commit proceeds
  // UNGATED. The install loop above lands files via writeFileSync (mode 0644), so on
  // Linux/macOS every "gated" commit ran ungated while win32 (no exec bit) masked the
  // gap. install-hooks.cjs always chmodded; --adopt absorbed its hooksPath half
  // (UAT #2) and dropped the chmod half — restored here. Covers installed AND
  // kept-from-an-earlier-adopt hooks: the exec bit is wiring, not content, so this
  // never violates the #16 never-overwrite contract.
  // KF-55 (M27.A): the repair is CONFINED via lib/hook-chmod.cjs — manifest-owned
  // hook names only (the MANAGED .githooks rows), lstat + O_NOFOLLOW fd mutation,
  // symlinks refused visibly, existing modes preserved, unknown files reported.
  // The M26 statSync/chmodSync sweep followed symlinks: a repository-controlled
  // .githooks link could direct the chmod OUTSIDE the project.
  {
    const hookNames = MANAGED.filter((r) => r.file.startsWith('.githooks/')).map((r) => r.file.slice('.githooks/'.length));
    const hookRes = repairHookModes({ projRoot, hookNames, dryRun, log: (line) => W('  ' + line) });
    hookRefused += hookRes.refused.length;
  }

  // Receipts verification (#0): the hook whose absence let the kit lose its own telemetry.
  const rcptLive = readIf(path.join(projRoot, '.claude/hooks/receipts-lifecycle.cjs'));
  const rcptTpl = readIf(path.join(kitRoot, 'templates/dot-claude/hooks/receipts-lifecycle.cjs'));
  if (dryRun && rcptLive === null) W('  receipts   hook would be installed and verified (byte-identical to its template)');
  else if (rcptLive !== null && rcptTpl !== null && normalize(rcptLive) === normalize(rcptTpl)) W('  receipts   hook verified byte-identical — the kit can account for itself again (UAT #0)');
  else W('  receipts   hook NOT verified — live copy ' + (rcptLive === null ? 'absent' : 'differs from its template') + '; the kit cannot account for its own runs until this lands');
  // Finding 4 (M28.E), narrowly: ABSENT is a missing control, DIFFERS is not. A live copy that
  // differs is the user's own file, kept by the #16 never-overwrite contract — making that
  // non-zero would fail every adopt into a repo with a customized hook, which is the overshoot
  // this stage was warned about. Absent means the #0 telemetry hook simply is not there.
  // Suppressed when a missing template tree or a refused row already named the same root cause,
  // so one defect is reported once.
  if (!dryRun && rcptLive === null && missingSources === 0
      && !refusedRows.has('.claude/hooks/receipts-lifecycle.cjs')) {
    missing('receipts lifecycle hook (.claude/hooks/receipts-lifecycle.cjs)',
      'the hook is absent after adoption, so the kit cannot account for its own runs (UAT #0)',
      'node scripts/kit-update.cjs --apply .claude/hooks/receipts-lifecycle.cjs');
  }

  // Root paperwork audit: repo-identity names are the HOST repo's files; adopt
  // never installs or overwrites them (C.3.5 route table; #16's real fix).
  for (const dest of repoIdentity) {
    if (!dest.endsWith('/') && fs.existsSync(path.join(projRoot, dest))) {
      W('  left-alone ' + dest + ' — repo-identity (your repo\'s paperwork; the kit never installs or overwrites these)');
    }
  }
  if (placeholderNote) W('  note: installed wiring files carry {{placeholders}} — they are filled by the bootstrap (or by hand), never by adopt.');
  W('=> ' + (dryRun ? installed + ' would install' : installed + ' installed') + ', ' + ok + ' verified ok, ' + kept + ' kept (never overwritten), ' + drifted + ' drift (use --apply per file)'
    + (hookRefused > 0 ? ', ' + hookRefused + ' hook(s) REFUSED' : ''));
  if (hookRefused > 0) {
    // KF-55: a refused hook means adoption may NOT conclude "hooks installed" —
    // visible AND non-zero, so nothing downstream reads this run as fully armed.
    W('=> hook activation INCOMPLETE — ' + hookRefused + ' .githooks entr' + (hookRefused === 1 ? 'y' : 'ies')
      + ' refused (symlinks are never installed over or chmodded through). The commit gates are NOT fully'
      + ' armed until each refused hook is replaced with a regular file; exiting non-zero.');
    // M28.E: also carried in the named-control list, so the verdict block below can never
    // report a count it does not itemize. The wording above is byte-unchanged from M27.A.
    missing('Git hook activation (.githooks entries)',
      hookRefused + ' .githooks entr' + (hookRefused === 1 ? 'y is a symlink and was' : 'ies are symlinks and were')
        + ' refused, so the commit gates are not fully armed',
      null,
      'replace each refused hook with a regular file, then re-run --adopt');
  }
  if (settingsIncomplete > 0) {
    // KF-56: same rule at the control plane — a conflicted, unparseable, or
    // rolled-back settings merge may not read as "controls armed".
    W('=> settings activation INCOMPLETE — '
      + (settingsConflicts > 0 ? settingsConflicts + ' conflict(s) reported above; ' : '')
      + 'everything non-conflicted was merged and your own rules and commands were NOT modified. '
      + 'Resolve the reported items by hand, then re-run --adopt; exiting non-zero.');
    missing('kit session controls (.claude/settings.json)',
      'the settings merge did not complete cleanly ('
        + (settingsConflicts > 0 ? settingsConflicts + ' conflict(s) reported above' : 'see the report above')
        + '), so some kit registrations may be dormant',
      null,
      'resolve the reported items by hand, then re-run --adopt');
  }

  // ── THE VERDICT (Finding 4, M28.E). One line, always, in both directions. Before this,
  // the only summary was "=> 36 installed, 0 verified ok, …", which reads as success no matter
  // what did not activate — and no PARTIAL INSTALLATION label existed anywhere in the tree.
  // The KF-55 and KF-56 blocks above keep their own wording byte-for-byte; they are counted
  // here as controls so the run ends with a single, countable statement of what is live.
  if (rowRefused > 0) {
    W('=> destination refusals — ' + rowRefused + ' managed path' + (rowRefused === 1 ? ' is a symlink and was' : 's are symlinks and were')
      + ' left untouched (adopt never installs over a link, dangling included; #16 never-overwrite).');
    missing('managed file installation (' + rowRefused + ' destination row' + (rowRefused === 1 ? '' : 's') + ')',
      rowRefused + ' managed destination' + (rowRefused === 1 ? ' is a symlink and was' : 's are symlinks and were')
        + ' refused, so ' + (rowRefused === 1 ? 'that file was' : 'those files were') + ' not installed'
        + ' (each is named on its own `refused` line above)',
      null,
      'replace each refused path with a regular file, then re-run --adopt');
  }
  // EVERY control is itemized. The count and the list are the same list — an earlier build of
  // this block counted hookRefused/rowRefused/settingsIncomplete separately and then printed
  // no MISSING group for them, so a refused-row run announced "1 required control NOT active"
  // and named none of them in the block. A count you cannot itemize is the shape of claim this
  // whole stage exists to remove.
  const controlsMissing = missingControls.length;
  if (controlsMissing > 0) {
    W('=> ADOPTION INCOMPLETE — ' + controlsMissing + ' required control' + (controlsMissing === 1 ? '' : 's')
      + ' NOT active. A successful --adopt means every required enforcement layer is live, so this'
      + ' run exits non-zero; nothing downstream may read it as armed.');
    for (const m of missingControls) {
      W('   MISSING: ' + m.control);
      W('       why: ' + m.why);
      if (m.repair) W('    repair: ' + m.repair);
      if (m.alt) W('        or: ' + m.alt);
    }
    W('   Then re-run: node scripts/kit-update.cjs --adopt   (adoption is idempotent — a clean re-run writes nothing)');
  } else if (dryRun) {
    W('=> dry-run PLAN complete — no required control was found blocked, and nothing was written.'
      + ' Re-run without --dry-run to install.');
  } else {
    W('=> adoption COMPLETE — every required enforcement layer is active: Git hooks armed'
      + ' (core.hooksPath=.githooks), no destination refused, no incomplete settings merge.');
  }

  if (!dryRun) cmdIngest(projRoot, false);
  else W('  (dry-run: the known-issue ingest also runs on a real adopt — nothing harvested now)');
  return (hookRefused > 0 || rowRefused > 0 || settingsIncomplete > 0 || missingControls.length > 0) ? 1 : 0;
}

function main() {
  const argv = process.argv.slice(2);
  const kitIdx = argv.indexOf('--kit');
  const applyIdx = argv.indexOf('--apply');
  if (kitIdx !== -1 && (!argv[kitIdx + 1] || argv[kitIdx + 1].startsWith('--'))) usage('--kit needs a directory');
  if (applyIdx !== -1 && (!argv[applyIdx + 1] || argv[applyIdx + 1].startsWith('--'))) usage('--apply needs a managed live-file path');
  const detect = argv.includes('--detect');
  const adopt = argv.includes('--adopt');
  const ingest = argv.includes('--ingest');
  const dryRun = argv.includes('--dry-run');

  const projRoot = process.cwd();

  // KIT-REPO NO-OP — the workshop-only pair, BOTH required (see the header note:
  // the packed fixture set made rows.json the wrong discriminator, and demanding
  // the pair keeps an app's own scripts/smoke.cjs from no-opping the installer).
  if (fs.existsSync(path.join(projRoot, 'release', 'CLAUDE.md'))
    && fs.existsSync(path.join(projRoot, 'scripts', 'smoke.cjs'))) {
    process.stdout.write(
      'kit-update: this is the kit repo — the kit IS the source of truth; its live copies ' +
      'legitimately diverge from templates/ mid-milestone (ARC-007). Nothing to update.\n'
    );
    process.exit(0);
  }

  // --detect / --ingest are pure repo inspection — dispatched BEFORE template
  // resolution, so a repo whose templates/ was stripped (or that keeps the kit
  // elsewhere) can still be classified and harvested.
  if (detect) process.exit(cmdDetect(projRoot));
  if (ingest && !adopt) process.exit(cmdIngest(projRoot, dryRun));

  // Template-source resolution: --kit, else ./templates (flat checkout), else
  // ./sbak/templates (C-b, M22.D: the nested unzip keeps the kit under sbak/).
  let kitRoot = kitIdx !== -1 ? path.resolve(argv[kitIdx + 1]) : null;
  if (kitRoot === null && fs.existsSync(path.join(projRoot, 'templates'))) kitRoot = projRoot;
  if (kitRoot === null && fs.existsSync(path.join(projRoot, KIT_DIR, 'templates'))) kitRoot = path.join(projRoot, KIT_DIR);
  if (kitRoot === null || !fs.existsSync(path.join(kitRoot, 'templates'))) {
    process.stderr.write(
      'kit-update: no template source found (fail-closed).\n' +
      '  Pass --kit <path-to-a-kit-checkout>, or keep the kit\'s templates/ directory in the project\n' +
      '  (at the root, or nested as ' + KIT_DIR + '/templates per the packed layout).\n'
    );
    process.exit(2);
  }

  if (adopt) process.exit(cmdAdopt(projRoot, kitRoot, dryRun));

  // Classify every managed row against its template.
  const report = [];
  for (const row of MANAGED) {
    const liveAbs = path.join(projRoot, row.file);
    const tplAbs = path.join(kitRoot, row.template);
    const live = readIf(liveAbs);
    const tpl = readIf(tplAbs);
    if (live === null) { report.push({ row, cls: 'absent', detail: 'row not rendered in this project (tier/toggle) — skipped' }); continue; }
    if (tpl === null) { report.push({ row, cls: 'absent-template', detail: `template ${row.template} missing in the kit source — skipped (partial kit tree?)` }); continue; }

    if (declaresDivergence(live)) {
      report.push({ row, cls: 'divergent', detail: 'declared intentional divergence (ARC-007) — reported, never overwritten' });
      continue;
    }
    const liveStamp = stampOf(live);
    const tplStamp = stampOf(tpl);
    if (liveStamp !== null && tplStamp !== null && liveStamp !== tplStamp) {
      report.push({ row, cls: 'stamp', detail: `live @${liveStamp} vs template @${tplStamp} (kit updated; --apply to take the template)` });
      continue;
    }
    if (row.render === 'wiring') {
      // A wiring row is bootstrap-FILLED: content drift is by design, so only the stamp is
      // compared — BUT "filled at Phase 3" was ASSERTED, never verified (KF-27 residual, M26.C).
      // A live wiring file still carrying an unfilled {{TOKEN}} ships a broken gate (the
      // {{FAST_CHECK_COMMAND}} → `command not found` wall on the first commit). Scan the LIVE file
      // for a surviving placeholder — the SAME regex golden-bootstrap enforces on the render, so
      // "filled" here means exactly what it means there — and FLAG it (exit non-zero), catching a
      // fill that never happened at update time instead of at the user's first commit.
      const surviving = (live.match(/\{\{[A-Za-z0-9_]+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
      if (surviving.length) {
        report.push({ row, cls: 'unfilled', detail: `bootstrap-filled row still carries ${surviving.join(', ')} — Phase 3 did not fill it; fill the live file (fill-verification, KF-27)` });
      } else {
        report.push({ row, cls: 'wiring', detail: `bootstrap-filled; stamp compared only (@${liveStamp || 'unstamped'} ok)` });
      }
      continue;
    }
    if (live === tpl) { report.push({ row, cls: 'clean', detail: `@${liveStamp || 'unstamped'}` }); continue; }
    if (normalize(live) === normalize(tpl)) {
      report.push({ row, cls: 'note', detail: 'line-endings differ only (normalized-identical; see .gitattributes eol=lf)' });
      continue;
    }
    report.push({ row, cls: 'drifted', detail: `content differs from ${row.template} (--apply to restore)` });
  }

  // ── --apply <file>: restore ONE managed live file from its template ──────────────────
  if (applyIdx !== -1) {
    const target = argv[applyIdx + 1].replace(/\\/g, '/');
    const entry = report.find((r) => r.row.file === target);
    if (!entry) {
      // Refuse anything outside the bounded managed set — including traversal shapes;
      // confinement is asserted again below for defense in depth.
      process.stderr.write(`kit-update: refused — "${target}" is not a kit-managed file (unknown to the bounded row-derived set).\n`);
      process.exit(2);
    }
    if (entry.cls === 'divergent') {
      process.stderr.write(
        `kit-update: refused — ${target} declares an INTENTIONAL DIVERGENCE (ARC-007). ` +
        'A declared local divergence is the user\'s right; remove the header first if you truly want the template back.\n'
      );
      process.exit(2);
    }
    if (entry.cls === 'absent-template') {
      process.stderr.write(`kit-update: refused — the template for ${target} is missing in the kit source.\n`);
      process.exit(2);
    }
    // Keyed off the ROW's render kind, never the report class: a stamp-drifted wiring
    // row classifies 'stamp', and re-copying through that door bricks the filled file
    // just the same (M20.5.V F1 — the verifier's live repro).
    if (entry.row.render === 'wiring') {
      process.stderr.write(
        `kit-update: refused — ${target} is a bootstrap-FILLED (wiring) file; its template still carries ` +
        '{{placeholders}}, so --apply would replace the live filled file with a raw template and brick it. ' +
        'Take the kit update by bootstrap fill or hand-merge; --apply cannot restore a filled file from a ' +
        'placeholder template.\n'
      );
      process.exit(2);
    }
    // KF-58 (M28.E) — the artifact sweep's SECOND site. --apply is the deliberate overwrite
    // door, but "restore this file" is not permission to replace the LINK the user placed with
    // a regular file, nor to write through it onto its target. assertInside cannot catch this:
    // it RESOLVES symlinks by design, so a dangling link resolves to its own path and reads as
    // absent, and an internal link hands back its target so the write lands there instead.
    // Measured pre-fix: --apply replaced a dangling scripts/set-mode.cjs link with 5457 bytes,
    // exit 0. Classify first, then confine — the same order the install loop uses.
    {
      const cls = classifyDestination(path.join(projRoot, target));
      if (cls.kind === 'symlink') {
        process.stderr.write(
          `kit-update: refused — ${target} is a symlink${cls.dangling ? ' (dangling)' : ''}; --apply never writes over ` +
          'or through a link (that would replace the link you placed with a regular file, or silently overwrite its ' +
          'target instead). Remove or replace the link first, then re-run --apply.\n'
        );
        process.exit(2);
      }
    }
    let liveAbs;
    try {
      liveAbs = assertInside(projRoot, target); // fail-closed on ../, absolute, symlinked escapes
    } catch (e) {
      process.stderr.write(`kit-update: refused — ${e.message}\n`);
      process.exit(2);
    }
    const tplBuf = fs.readFileSync(path.join(kitRoot, entry.row.template));
    // WRITE-TEMP-RENAME (the ERR-002 discipline): a kill mid-apply leaves the live file
    // either original or fully copied, never half-written.
    const tmp = liveAbs + '.kit-update.tmp';
    fs.mkdirSync(path.dirname(liveAbs), { recursive: true });
    fs.writeFileSync(tmp, tplBuf);
    fs.renameSync(tmp, liveAbs);
    process.stdout.write(`kit-update: applied — ${target} restored byte-identical from ${entry.row.template}.\n`);
    process.exit(0);
  }

  // ── the read-only report ──────────────────────────────────────────────────────────────
  const order = ['clean', 'note', 'wiring', 'unfilled', 'stamp', 'drifted', 'divergent', 'absent', 'absent-template'];
  report.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || (a.row.file < b.row.file ? -1 : 1));
  process.stdout.write(`kit-update — drift report vs ${path.join(kitRoot, 'templates')} (read-only; --apply <file> to restore one file)\n`);
  for (const r of report) {
    process.stdout.write(`  ${r.cls.padEnd(10)} ${r.row.file.padEnd(50)} ${r.detail}\n`);
  }
  // An unfilled wiring file counts toward the exit code alongside content/stamp drift: a gate that
  // never got its placeholder filled is as broken as one that drifted (KF-27 fill-verification).
  const drifted = report.filter((r) => r.cls === 'drifted' || r.cls === 'stamp' || r.cls === 'unfilled');
  const unfilled = report.filter((r) => r.cls === 'unfilled');
  const divergent = report.filter((r) => r.cls === 'divergent');
  process.stdout.write(`=> ${drifted.length} drifted${unfilled.length ? ` (incl. ${unfilled.length} unfilled)` : ''}, ${divergent.length} divergent-by-declaration; exit ${drifted.length ? 1 : 0}\n`);
  process.exit(drifted.length ? 1 : 0);
}

module.exports = { MANAGED, DIVERGENCE_RE, declaresDivergence, STAMP_RE, normalize, detectRepoState, harvestKnownIssues };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`kit-update: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2);
  }
}
