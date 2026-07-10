#!/usr/bin/env node
// @kit-version 0.1.0-dev
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
// TEMPLATE SOURCE resolution: `--kit <dir>` (a kit checkout) → else `./templates/` in
// the project root (kept at bootstrap) → else exit 2 with guidance.
//
// KIT-REPO NO-OP: inside the kit itself (detected by the golden row-set fixture only
// the kit carries) this tool has no job — the kit IS the source, and its live copies
// legitimately diverge from templates/ mid-milestone (ARC-007). One line, exit 0.
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

// The confinement primitive travels with the tool (red ruling D2 — extend, don't fork).
const { assertInside } = require(path.join(__dirname, 'lib', 'sandbox.cjs'));

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
    '  read-only drift report by default; --apply restores ONE managed file from its template.\n'
  );
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  const kitIdx = argv.indexOf('--kit');
  const applyIdx = argv.indexOf('--apply');
  if (kitIdx !== -1 && (!argv[kitIdx + 1] || argv[kitIdx + 1].startsWith('--'))) usage('--kit needs a directory');
  if (applyIdx !== -1 && (!argv[applyIdx + 1] || argv[applyIdx + 1].startsWith('--'))) usage('--apply needs a managed live-file path');

  const projRoot = process.cwd();

  // KIT-REPO NO-OP — only the kit carries the golden row-set fixture; a generated
  // project never does (rows.json is not a scaffold row).
  if (fs.existsSync(path.join(projRoot, 'scripts/fixtures/golden-bootstrap/rows.json'))) {
    process.stdout.write(
      'kit-update: this is the kit repo — the kit IS the source of truth; its live copies ' +
      'legitimately diverge from templates/ mid-milestone (ARC-007). Nothing to update.\n'
    );
    process.exit(0);
  }

  // Template-source resolution: --kit, else ./templates kept at bootstrap.
  let kitRoot = kitIdx !== -1 ? path.resolve(argv[kitIdx + 1]) : null;
  if (kitRoot === null && fs.existsSync(path.join(projRoot, 'templates'))) kitRoot = projRoot;
  if (kitRoot === null || !fs.existsSync(path.join(kitRoot, 'templates'))) {
    process.stderr.write(
      'kit-update: no template source found (fail-closed).\n' +
      '  Pass --kit <path-to-a-kit-checkout>, or keep the kit\'s templates/ directory in the project root.\n'
    );
    process.exit(2);
  }

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
      report.push({ row, cls: 'wiring', detail: `bootstrap-filled; stamp compared only (@${liveStamp || 'unstamped'} ok)` });
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
  const order = ['clean', 'note', 'wiring', 'stamp', 'drifted', 'divergent', 'absent', 'absent-template'];
  report.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || (a.row.file < b.row.file ? -1 : 1));
  process.stdout.write(`kit-update — drift report vs ${path.join(kitRoot, 'templates')} (read-only; --apply <file> to restore one file)\n`);
  for (const r of report) {
    process.stdout.write(`  ${r.cls.padEnd(10)} ${r.row.file.padEnd(50)} ${r.detail}\n`);
  }
  const drifted = report.filter((r) => r.cls === 'drifted' || r.cls === 'stamp');
  const divergent = report.filter((r) => r.cls === 'divergent');
  process.stdout.write(`=> ${drifted.length} drifted, ${divergent.length} divergent-by-declaration; exit ${drifted.length ? 1 : 0}\n`);
  process.exit(drifted.length ? 1 : 0);
}

module.exports = { MANAGED, DIVERGENCE_RE, declaresDivergence, STAMP_RE, normalize };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`kit-update: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2);
  }
}
