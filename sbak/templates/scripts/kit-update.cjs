#!/usr/bin/env node
// @kit-version 1.0.10
// scripts/kit-update.cjs
//
// THE UPDATE STORY (I13, M20.5.B) — a bootstrapped project's drift report against the
// kit's templates/, and its per-file re-copy. Before this tool, kit-update was a prose
// note ("manually re-copy hooks") over ~5.6k LOC of inherited enforcement.
//
// WHAT IT DOES (read-only by default — a plain run never writes):
//   • For every kit-MANAGED enforcement file (validators/ · .claude/hooks/ ·
//     .claude/commands/ · .claude/skills/ · scripts/ · .githooks/ · the two generated
//     .github/workflows/ — the row-set-derived bounded list below), diff the LIVE copy against
//     the kit's template:
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
// M32.J adds `--ready`: the end-of-bootstrap readiness check; M34.D makes it one readiness result,
// a line per row and one verdict with one next command; see cmdReady below.
//
// M33.D adds `--migrate`: the update path for a project built on an older kit - the per-file
// table first, then `--apply-all`, merging the bootstrap-filled wiring rows three ways from the
// pinned version's template; see cmdMigrate below.
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
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// The confinement primitive travels with the tool (red ruling D2 — extend, don't fork).
// THE THREE LIBRARIES, LOADED WHERE THEY ARE USED (M34.1.B, Y-6): lib/sandbox.cjs, hook-chmod.cjs
// and settings-merge.cjs are required by the functions that call them, never at load, so --ready
// runs with any of them missing and its modules row names the file. A live copy that is absent is
// read from the template source this run installs from (--kit, the project's templates/, or
// sbak/templates/): --adopt walks .claude/ before scripts/ and calls the sandbox on every file, so
// without it --adopt could not restore the module the modules row names. Those three only, and only
// when the live copy (or a sibling it requires) is absent; with every module present nothing changes.
// `load` and `fromKit` hold the literal requires (the live copy, and the template source's copy by
// its literal tail), so every module this script needs is named in its source.
let KIT_SOURCE = null; // --kit, set by main
const LIB_DIR = path.join(__dirname, 'lib');
function lib(load, fromKit) {
  try { return load(); } catch (e) {
    const miss = e && e.code === 'MODULE_NOT_FOUND' ? /Cannot find module '([^']+)'/.exec(String(e.message)) : null;
    const inLib = miss && path.dirname(path.resolve(miss[1])).toLowerCase() === LIB_DIR.toLowerCase();
    if (!inLib) throw e;
    for (const r of [KIT_SOURCE, process.cwd(), path.join(process.cwd(), KIT_DIR)].filter(Boolean)) {
      try { return fromKit(path.join(r, 'templates', 'scripts')); } catch (e2) { if (!e2 || e2.code !== 'MODULE_NOT_FOUND') throw e2; }
    }
    throw e;
  }
}
const sandboxLib = () => lib(() => require(path.join(__dirname, 'lib', 'sandbox.cjs')), (dir) => require(path.join(dir, 'lib', 'sandbox.cjs')));
const hookChmodLib = () => lib(() => require(path.join(__dirname, 'lib', 'hook-chmod.cjs')), (dir) => require(path.join(dir, 'lib', 'hook-chmod.cjs')));
const settingsMergeLib = () => lib(() => require(path.join(__dirname, 'lib', 'settings-merge.cjs')), (dir) => require(path.join(dir, 'lib', 'settings-merge.cjs')));
function assertInside(...a) { return sandboxLib().assertInside(...a); }
function classifyDestination(...a) { return sandboxLib().classifyDestination(...a); }
function repairHookModes(...a) { return hookChmodLib().repairHookModes(...a); }
function applySettingsMerge(...a) { return settingsMergeLib().applySettingsMerge(...a); }
function deriveKitSettings(...a) { return settingsMergeLib().deriveKitSettings(...a); }
function flattenRegistrations(...a) { return settingsMergeLib().flattenRegistrations(...a); }
function commandIdentity(...a) { return settingsMergeLib().commandIdentity(...a); }
function writeArchive(...a) { return settingsMergeLib().writeArchive(...a); }

// ── the MANAGED set (rows-derived, smoke-locked against rows.json BOTH directions) ──────
// Every enforcement-class row of the golden row-set (scripts/fixtures/golden-bootstrap/
// rows.json): file = the live path in a generated project; template = the path under the
// kit; render = 'copy' (byte-compare, normalized) or 'wiring' (bootstrap-filled — stamp
// compare only). A row absent on disk is 'absent' (tier/toggle-conditional), never an
// error. This list is DERIVED from rows.json at kit-build time and reconciled by the
// kit's smoke suite — edit rows.json, not (only) this table.
const MANAGED = [
  { file: 'validators/validate-stage-prompts.cjs', template: 'validators/validate-stage-prompts.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-retrospective.cjs', template: 'validators/validate-retrospective.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-app-map.cjs', template: 'validators/validate-app-map.cjs', render: 'copy', tiers: ['full'], app_map: true },
  { file: 'validators/validate-test-honesty.cjs', template: 'validators/validate-test-honesty.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-operating-mode.cjs', template: 'validators/validate-operating-mode.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-outcome-challenge.cjs', template: 'validators/validate-outcome-challenge.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-risk-escalation.cjs', template: 'validators/validate-risk-escalation.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-destructive-op.cjs', template: 'validators/validate-destructive-op.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-risk-matrix.cjs', template: 'validators/validate-risk-matrix.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-calibration.cjs', template: 'validators/validate-calibration.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-reconciliation.cjs', template: 'validators/validate-reconciliation.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-transition.cjs', template: 'validators/validate-transition.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-release-readiness.cjs', template: 'validators/validate-release-readiness.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-carry-forward.cjs', template: 'validators/validate-carry-forward.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-spec-examples.cjs', template: 'validators/validate-spec-examples.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-irl-plan.cjs', template: 'validators/validate-irl-plan.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-claude-integrity.cjs', template: 'validators/validate-claude-integrity.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/validate-closeout-packet.cjs', template: 'validators/validate-closeout-packet.cjs', render: 'copy', tiers: ['full'] },
  { file: 'validators/validate-gate-manifest.cjs', template: 'validators/validate-gate-manifest.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/check-append-only.cjs', template: 'validators/check-append-only.cjs', render: 'copy', tiers: ['full'], risk_armed: true },
  { file: 'validators/lib/fenced-block.cjs', template: 'validators/lib/fenced-block.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/lib/escape-regexp.cjs', template: 'validators/lib/escape-regexp.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/lib/irl-plan.cjs', template: 'validators/lib/irl-plan.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'validators/README.md', template: 'validators/README.md', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.claude/hooks/session-start-read-first.cjs', template: 'templates/dot-claude/hooks/session-start-read-first.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.claude/hooks/user-prompt-submit-mode-check.cjs', template: 'templates/dot-claude/hooks/user-prompt-submit-mode-check.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.claude/hooks/pretooluse-red-gate.cjs', template: 'templates/dot-claude/hooks/pretooluse-red-gate.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.claude/hooks/receipts-lifecycle.cjs', template: 'templates/dot-claude/hooks/receipts-lifecycle.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.claude/commands/stage.md', template: 'templates/dot-claude/commands/stage.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/commands/verify.md', template: 'templates/dot-claude/commands/verify.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/commands/refactor.md', template: 'templates/dot-claude/commands/refactor.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/skills/closeout/SKILL.md', template: 'templates/dot-claude/skills/closeout/SKILL.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/commands/on-track.md', template: 'templates/dot-claude/commands/on-track.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/skills/approve-red/SKILL.md', template: 'templates/dot-claude/skills/approve-red/SKILL.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/skills/send/SKILL.md', template: 'templates/dot-claude/skills/send/SKILL.md', render: 'copy', tiers: ['full'] },
  { file: '.claude/commands/listen.md', template: 'templates/dot-claude/commands/listen.md', render: 'copy', tiers: ['full'] },
  { file: 'scripts/set-mode.cjs', template: 'templates/scripts/set-mode.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/stage-active.cjs', template: 'templates/scripts/stage-active.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/stage-view.cjs', template: 'templates/scripts/stage-view.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/approve-red.cjs', template: 'templates/scripts/approve-red.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/install-hooks.cjs', template: 'templates/scripts/install-hooks.cjs', render: 'copy', tiers: ['lite', 'full'], locus: ['hybrid', 'local_first'] },
  { file: 'scripts/verify-local.cjs', template: 'templates/scripts/verify-local.cjs', render: 'wiring', tiers: ['lite', 'full'], locus: ['hybrid', 'local_first'] },
  { file: 'scripts/kit-update.cjs', template: 'templates/scripts/kit-update.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/smoke-project.cjs', template: 'templates/scripts/smoke-project.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/sandbox.cjs', template: 'templates/scripts/lib/sandbox.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/hook-chmod.cjs', template: 'templates/scripts/lib/hook-chmod.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/settings-merge.cjs', template: 'templates/scripts/lib/settings-merge.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/stage-structure.cjs', template: 'templates/scripts/lib/stage-structure.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/receipts.cjs', template: 'templates/scripts/lib/receipts.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/read-ledger.cjs', template: 'templates/scripts/lib/read-ledger.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/evidence.cjs', template: 'templates/scripts/lib/evidence.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/evidence.cjs', template: 'templates/scripts/evidence.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/calibration-score.cjs', template: 'templates/scripts/calibration-score.cjs', render: 'copy', tiers: ['full'] },
  { file: 'scripts/lib/hook-root.cjs', template: 'templates/scripts/lib/hook-root.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/channel.cjs', template: 'templates/scripts/channel.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/channel.cjs', template: 'templates/scripts/lib/channel.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/lib/receipts-collect.cjs', template: 'templates/scripts/lib/receipts-collect.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: 'scripts/build-receipts.cjs', template: 'templates/scripts/build-receipts.cjs', render: 'copy', tiers: ['lite', 'full'] },
  { file: '.githooks/pre-commit', template: 'templates/dot-githooks/pre-commit', render: 'wiring', tiers: ['lite', 'full'], locus: ['hybrid', 'local_first'] },
  { file: '.githooks/pre-push', template: 'templates/dot-githooks/pre-push', render: 'copy', tiers: ['lite', 'full'], locus: ['hybrid', 'local_first'] },
  // M34.D: the two generated workflows are bootstrap-filled like verify-local.cjs, so --migrate
  // merges them three ways; LICENSE stays out by rule (the project's paperwork).
  { file: '.github/workflows/pr-smoke.yml', template: 'templates/dot-github/workflows/pr-smoke.yml', render: 'wiring', tiers: ['full'], locus: ['hybrid'] },
  { file: '.github/workflows/release.yml', template: 'templates/dot-github/workflows/release.yml', render: 'wiring', tiers: ['full'], locus: ['hybrid', 'local_first'] },
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

// M34.6.A: which MANAGED rows this project renders - the row's rows.json conditions (the
// tiers, app_map, risk_armed, locus, deliverable fields above) against project-config.md, read
// through the one config reader (CFI-17, scripts/lib/read-ledger.cjs). An unreadable value reads the
// way that requires more, never less (fail-closed): tier full, app_map on, a risk trigger declared,
// any locus. -> { tier, why(row) -> { required, why } }
function requiredSet(projRoot) {
  let rl = null; try { rl = require(path.join(__dirname, 'lib', 'read-ledger.cjs')); } catch (_) { rl = null; }
  const cfg = readIf(path.join(projRoot, 'project-config.md')) || '';
  const val = (k) => (rl ? rl.readConfigValue(cfg, k) : null);
  const t = val('tier'); const tier = t === 'lite' || t === 'full' ? t : 'full';
  const appMap = val('app_map'); const locus = val('verification_locus'); const deliverable = val('deliverable_type');
  const risk = rl && typeof rl.readConfigList === 'function' ? rl.readConfigList(cfg, 'risk_triggers') : null;
  const why = (row) => {
    if (!Array.isArray(row.tiers) || row.tiers.indexOf(tier) === -1) return { required: false, why: `tier ${tier} does not render it` };
    if (row.app_map && appMap === 'skip') return { required: false, why: 'app_map skip' };
    if (row.risk_armed && Array.isArray(risk) && risk.length === 0) return { required: false, why: 'no risk trigger declared' };
    if (Array.isArray(row.locus) && locus && row.locus.indexOf(locus) === -1) return { required: false, why: `verification_locus ${locus}` };
    if (row.deliverable && deliverable && row.deliverable !== deliverable) return { required: false, why: `deliverable_type ${deliverable}` };
    const c = [`tier ${tier}`];
    if (row.app_map) c.push(`app_map ${appMap || 'unread'}`);
    if (row.risk_armed) c.push(Array.isArray(risk) ? 'risk trigger declared' : 'risk_triggers unread');
    if (Array.isArray(row.locus)) c.push(`verification_locus ${locus || 'unread'}`);
    if (row.deliverable) c.push(`deliverable_type ${deliverable || 'unread'}`);
    return { required: true, why: c.join(', ') };
  };
  return { tier, why };
}

function usage(msg) {
  if (msg) process.stderr.write(`kit-update: ${msg}\n`);
  process.stderr.write(
    'usage: node scripts/kit-update.cjs [--kit <kit-checkout>] [--apply <live-file>]\n' +
    '                                   [--detect] [--adopt [--dry-run]] [--ingest]\n' +
    '                                   [--place-project-claude <filled-file>] [--place-settings <filled-file>] [--ready [--model <m>]]\n' +
    '                                   [--place-read-first <role> <staged-list>] [--upgrade-check <new-tree>]\n' +
    '                                   [--migrate [--pin <v>] [--base <dir>] [--apply-all [--release <file>]...]]\n' +
    '  read-only drift report by default; --apply restores ONE managed file from its template;\n' +
    '  --migrate shows the per-file table to take the kit at --kit (replace / merge / retire / keep),\n' +
    '  then writes it with --apply-all, merging bootstrap-filled files from the pinned version;\n' +
    '  --ready prints one readiness result after the bootstrap commit: a line per row, then READY\n' +
    '  or NOT READY with one next command (exit 1); after READY it names this window\'s role and,\n' +
    '  in the bootstrap window, prints the leaving-bootstrap block for --model <m>; --place-settings places a filled copy of\n' +
    '  .claude/settings.json after checking the kit\'s hook registrations and permissions floor (the\n' +
    '  old bytes archived); --place-read-first places a staged read-first list the same way;\n' +
    '  --upgrade-check names the sbak/ files you changed that unzipping a new release would overwrite;\n' +
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

// ── --ready: one readiness result (M32.J; M34.D) ────────────────────────────────────────────
// Bootstrap's Phase 5 runs this right after the bootstrap commit, and the installer's upgrade
// relays it at its end. One row per check, in this order, and ALL of them run, so the person sees
// every reason at once. A row passes with `<row>: <what was checked>` or fails with
// `NOT READY: <row> - <reason>`. The last line is the verdict: the READY line (exit 0), or
// `NOT READY: <k> of <n> rows. Next: <the first failing row's repair>` (exit 1) - one next
// command. The order puts the tree before migration, because --migrate refuses a dirty tree. A
// throw inside a row is that row's NOT READY line naming the module (M34.1.B): no row prints a stack.
// A PENDING MIGRATION (M34.2.B, Y-11): while the migration row fails with --migrate and the project's
// kit files show an older release (the kit pin recorded, or the managed row's stale stamps), Next is
// --migrate, after only the rows --migrate needs first (state, payload, HEAD, tree): it brings the
// modules and the stamps the other rows ask for, and the old script's --adopt cannot. Every
// kit-update command this block prints names a script that can run it (kuCommand).
//   modules    - every scripts/*.cjs and scripts/lib/*.cjs the release's payload map names (the
//                MANAGED scripts rows when there is no map) is present; first, so a missing kit
//                module is the first repair, --adopt (M34.1.B, Y-6). A module the pinned release
//                never shipped (the migration table's add row) is the migration's, named on the pass
//                line, never this row's finding (M34.2.B, Y-11);
//   state      - the --detect classifier (detectRepoState, reused) says `project`, and the red gate's
//                three markers read as its probe reads them (readyMarkers): a fault (a link, a
//                directory, an empty or unreadable marker) is NOT READY naming the clear, because
//                the gate refuses every call in that state (M34.1.B, V-2);
//   config     - project-config.md carries no unfilled {{TOKEN}} (the kit pin named first);
//   wiring     - the project's own validators/validate-claude-integrity.cjs --settings passes: the
//                session hooks registered and every script a node command names under .claude/,
//                scripts/ or validators/ present (reused, never re-implemented; a validator that
//                cannot run is a failure, never a skipped check). Other commands are not resolved,
//                and the pass line says so (M34.1.B, Y-5);
//   hooks      - core.hooksPath reads back .githooks and each managed .githooks file is a regular
//                file, executable where the filesystem has modes (a clone carries no hooksPath);
//   read-first - the read-first hook's own --check passes (stdin closed: the hook reads stdin when
//                it is not given --check, and an open pipe hangs it);
//   cli        - `claude --version` is at least the claudeCodeFloor release-manifest.json pins: the
//                settings carry onFailure, which an older CLI may reject. Absent, unparseable, or no
//                floor to read is not ready - the unknown is never a pass;
//   payload    - every sbak/ file sbak/release-manifest.json's payload map names hashes to it (a file
//                whose head declares INTENTIONAL DIVERGENCE is named as kept, never failed);
//   managed    - each present MANAGED copy row's @kit-version stamp equals its template's, and each
//                present wiring row carries no {{TOKEN}} (the drift report's own rules; a wiring
//                row's older stamp is the migration row's);
//   HEAD       - the bootstrap commit exists;
//   tree       - nothing uncommitted but the channel's own files (lib/channel.cjs OWN_FILES);
//   migration  - --migrate's own table from the recorded kit_version: no file pending.
// The root is the cwd, as --detect.
const READY_ROWS = ['modules', 'state', 'config', 'wiring', 'hooks', 'read-first', 'cli', 'payload', 'managed', 'HEAD', 'tree', 'migration'];
const MIGRATE_PENDING = ['replace', 'add', 'merge', 'conflict', 'retire'];
// A path as the person's repository names it (forward slashes), or its basename when it lies outside.
function relOf(projRoot, p) {
  const r = path.relative(projRoot, path.resolve(String(p))).split(path.sep).join('/');
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : path.basename(String(p));
}
// A missing module, from a require's error message: its repo path, or null.
function missingModule(projRoot, msg) {
  const m = /Cannot find module '([^']+)'/.exec(String(msg || ''));
  return m ? relOf(projRoot, m[1]) : null;
}
// A child check's output as one reason. A Node stack is never relayed (M34.1.B, Y-6): a missing
// module is named by its repo path, any other crash by its error line.
const READY_LOAD_FAIL = 'is missing, so the check could not load it';
function readyReason(r, projRoot) {
  const all = normalize(`${r.stderr || ''}\n${r.stdout || ''}`);
  const stack = /^\s+at\s.+:\d+:\d+\)?\s*$/m.test(all) || /node:internal/.test(all) || /Require stack/.test(all);
  if (stack) {
    const mod = missingModule(projRoot || process.cwd(), all);
    if (mod) return `${mod} ${READY_LOAD_FAIL}`;
    const em = /^\s*(?:[A-Za-z]*Error|Error)\b[^\n]*$/m.exec(all);
    return `the check crashed: ${em ? em[0].trim().slice(0, 300) : `exit ${r.status}`}`;
  }
  const lines = all.split('\n')
    .map((l) => l.replace(/^(FAIL|NOTE)\s+claude-integrity:\s*/, '').trim()).filter(Boolean);
  const s = lines.join('; ');
  return s.length > 400 ? s.slice(0, 397) + '...' : (s || `exit ${r.status}`);
}
// A throw inside a row, as that row's reason: the missing module by its repo path, else the module
// that threw (the stack's first frame) and the message's first line - never the stack.
function readyThrew(projRoot, e) {
  const msg = String((e && e.message) || e).split('\n')[0];
  const mod = missingModule(projRoot, msg);
  if (mod) return `${mod} is missing (the check needs it)`;
  const frame = /\(?((?:[A-Za-z]:)?[^\s()]+\.c?js):\d+:\d+\)?/.exec(String((e && e.stack) || '').split('\n').slice(1).join('\n'));
  return `the check threw in ${frame ? relOf(projRoot, frame[1]) : 'scripts/kit-update.cjs'}: ${msg}`;
}
// The red gate's three markers, read as its probe reads them (pretooluse-red-gate.cjs probeMarker
// and probeState, M34.1.A): absent only by lstat ENOENT of the path itself; a link of any kind, a
// directory, a non-regular file, an unreadable or empty marker a fault with the probe's own words;
// the value decoded as the probe decodes it. Its own copy, never a shared module: the hook's probe
// must not require a library that may be missing, and a lockstep pin (fail-closed, M34.1.B pin 5)
// keeps the two one. -> { kind: 'inactive' } | { kind: 'active', stage, role, approved } |
// { kind: 'unknown', fault }
const READY_STAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function readyMarker(root, name) {
  const p = path.join(root, '.claude', name);
  let st;
  try { st = fs.lstatSync(p); } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return { absent: true };
    return { fault: `.claude/${name} is unreadable (${(e && e.code) || 'lstat failed'})` };
  }
  if (st.isSymbolicLink()) return { fault: `.claude/${name} is a link` };
  if (st.isDirectory()) return { fault: `.claude/${name} is a directory` };
  if (!st.isFile()) return { fault: `.claude/${name} is not a regular file` };
  let b;
  try { b = fs.readFileSync(p); } catch (e) { return { fault: `.claude/${name} is unreadable (${(e && e.code) || 'read failed'})` }; }
  const t = b.length >= 2 && b[0] === 0xff && b[1] === 0xfe ? b.toString('utf16le', 2)
    : b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.toString('utf8', 3) : b.toString('utf8');
  const v = t.split(String.fromCharCode(0)).join('').trim();
  return v ? { value: v } : { fault: `.claude/${name} is empty` };
}
function readyMarkers(root) {
  const sa = readyMarker(root, 'stage-active');
  if (sa.absent) return { kind: 'inactive' };
  if (sa.fault) return { kind: 'unknown', fault: sa.fault };
  if (!READY_STAGE_ID.test(sa.value)) return { kind: 'unknown', fault: '.claude/stage-active does not hold a stage id' };
  const sr = readyMarker(root, 'stage-role');
  if (sr.fault) return { kind: 'unknown', fault: sr.fault };
  const ra = readyMarker(root, 'red-approved');
  if (ra.fault) return { kind: 'unknown', fault: ra.fault };
  let approved = null;
  if (!ra.absent) {
    const parts = ra.value.split(/\r?\n/).map((l) => l.trim());
    if (parts.length > 2 || (parts.length === 2 && !/^record [0-9a-f]{64}$/.test(parts[1]))) return { kind: 'unknown', fault: '.claude/red-approved carries a second line that is not "record <sha256>"' };
    approved = parts[0];
  }
  return { kind: 'active', stage: sa.value, role: sr.absent ? null : sr.value, approved };
}
function versionCmp(a, b) {
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
// The Claude Code floor: release-manifest.json at the root (a kit checkout), else under sbak/.
function readFloor(projRoot) {
  for (const rel of ['release-manifest.json', `${KIT_DIR}/release-manifest.json`]) {
    const m = readJsonIf(path.join(projRoot, rel));
    if (m && typeof m.claudeCodeFloor === 'string' && /^\d+\.\d+\.\d+$/.test(m.claudeCodeFloor)) return m.claudeCodeFloor;
  }
  return null;
}
function claudeVersion(projRoot) {
  const opts = { cwd: projRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 };
  let r = spawnSync('claude', ['--version'], opts);
  // claude installed through npm is a .cmd shim on Windows, which spawn resolves only through cmd
  let viaCmd = false;
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') { viaCmd = true; r = spawnSync('cmd.exe', ['/d', '/s', '/c', 'claude --version'], opts); }
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const v = /\b(\d+\.\d+\.\d+)\b/.exec(r.status === 0 ? out : '');
  if (v) return { version: v[1] };
  if ((r.error && r.error.code === 'ENOENT') || (viaCmd && (r.status === 9009 || /not recognized/i.test(out)))) return { absent: true };
  return { unparsed: (out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || `exit ${r.status}`).slice(0, 120) };
}
// The kit-update command --ready prints (M34.2.B, Y-11): the live scripts/kit-update.cjs when it
// carries this script's @kit-version stamp (always so when --ready runs as the live script), else
// this script by its path in the project - an interrupted upgrade leaves the live script at the old
// release, which may not know the command at all, and a missing one cannot run.
function kuCommand(projRoot) {
  const LIVE = 'node scripts/kit-update.cjs';
  const self = path.relative(projRoot, __filename).split(path.sep).join('/');
  if (!self || self.startsWith('..') || path.isAbsolute(self) || self === 'scripts/kit-update.cjs') return LIVE;
  const mine = stampOf(readIf(__filename));
  const live = readIf(path.join(projRoot, 'scripts', 'kit-update.cjs'));
  return live !== null && mine !== null && stampOf(live) === mine ? LIVE : `node ${self}`;
}
// The rows --migrate needs passing before it runs: it refuses a broken marker and a dirty tree, needs
// the commit, and merges from the payload the payload row verifies.
const MIGRATE_FIRST = ['state', 'payload', 'HEAD', 'tree'];
function cmdReady(projRoot, opts) {
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: projRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const rows = [];
  const pass = (row, what) => rows.push({ row, ok: true, line: `${row}: ${what}` });
  const fail = (row, why, repair) => rows.push({ row, ok: false, line: `NOT READY: ${row} - ${why}`, repair });
  const KU = kuCommand(projRoot);
  const READY_AGAIN = `${KU} --ready`;
  const ADOPT = `${KU} --adopt`;
  const MIGRATE = `${KU} --migrate`;
  // M34.1.B (Y-6): a throw inside a row is that row's NOT READY line, never a stack.
  const guard = (row, fn) => { try { fn(); } catch (e) { fail(row, readyThrew(projRoot, e), ADOPT); } };
  // M34.2.B (Y-11): the migration is read once, first - the modules row needs the modules new since
  // the pinned release (they arrive with the migration), the verdict whether one is pending. The
  // migration row still prints last, from this.
  const kitRoot = fs.existsSync(path.join(projRoot, 'templates')) ? projRoot : (fs.existsSync(path.join(projRoot, KIT_DIR, 'templates')) ? path.join(projRoot, KIT_DIR) : null);
  let cur = null;
  try { cur = kitRoot ? versionAt(kitRoot) : null; } catch (_) { cur = null; }
  const mig = { pin: null, pinErr: null, table: null, threw: null, added: new Set() };
  if (kitRoot && cur) {
    try {
      try { mig.pin = readPin(projRoot).value; } catch (e) { mig.pinErr = missingModule(projRoot, e && e.message) ? `${missingModule(projRoot, e.message)} is missing` : String(e && e.message || e).split('\n')[0]; }
      if (!mig.pinErr && mig.pin && VERSION_RE.test(mig.pin) && mig.pin !== cur) {
        mig.table = migrationTable(projRoot, kitRoot, mig.pin, null, []);
        if (!mig.table.refuse) for (const r of mig.table.rows) if (r.cls === 'add') mig.added.add(r.row.file);
      }
    } catch (e) { mig.threw = e; }
  }
  let staleStamps = false;
  // modules
  guard('modules', () => {
    const man = readJsonIf(path.join(projRoot, KIT_DIR, 'release-manifest.json'));
    const map = man && man.payload && typeof man.payload === 'object' ? man.payload : null;
    const pre = `${KIT_DIR}/templates/scripts/`;
    const want = map
      ? Object.keys(map).filter((k) => k.indexOf(pre) === 0 && /^(lib\/)?[^/]+\.cjs$/.test(k.slice(pre.length))).map((k) => `scripts/${k.slice(pre.length)}`)
      : MANAGED.filter((r) => /^scripts\/(lib\/)?[^/]+\.cjs$/.test(r.file)).map((r) => r.file);
    const missing = want.filter((rel) => { try { return !fs.statSync(path.join(projRoot, rel)).isFile(); } catch (_) { return true; } });
    const arrive = missing.filter((rel) => mig.added.has(rel));
    const gone = missing.filter((rel) => !mig.added.has(rel));
    const tail = arrive.length ? `; ${arrive.length} new since v${mig.pin} ${arrive.length === 1 ? 'arrives' : 'arrive'} with the migration, first: ${arrive[0]}` : '';
    if (gone.length) fail('modules', `${gone.length} kit module(s) missing, first: ${gone[0]}`, ADOPT);
    else pass('modules', `${want.length - arrive.length} kit scripts present (every scripts/*.cjs and scripts/lib/*.cjs ${map ? 'the release\'s payload map names' : 'the kit\'s managed list names'})${tail}`);
  });
  // state
  guard('state', () => {
    const state = detectRepoState(projRoot).state;
    if (state !== 'project') { fail('state', `--detect says state=${state}, not project (none of ${PROJECT_FILES.join(', ')} is present)`, 'finish the bootstrap (Phase 3 writes project-config.md), then ' + READY_AGAIN); return; }
    const mk = readyMarkers(projRoot);
    if (mk.kind === 'unknown') fail('state', `${mk.fault}, so the red gate reads the state as unknown and refuses every edit and command`, 'node scripts/stage-active.cjs --clear, from your own terminal (the gate refuses the agent\'s call while the state is unknown), then open the stage again');
    else pass('state', mk.kind === 'active' ? `project (the project files are present; stage ${mk.stage} open, its markers read as the red gate reads them)` : 'project (the project files are present; no stage open)');
  });
  // config
  guard('config', () => {
    const cfg = readIf(path.join(projRoot, 'project-config.md'));
    if (cfg === null) { fail('config', 'project-config.md is absent', 'write project-config.md (bootstrap Phase 1), commit it, then ' + READY_AGAIN); return; }
    const toks = [];
    for (const t of cfg.match(/\{\{[A-Z0-9_]+\}\}/g) || []) if (toks.indexOf(t) === -1) toks.push(t);
    toks.sort((a, b) => (b === '{{KIT_VERSION}}') - (a === '{{KIT_VERSION}}'));
    if (toks.length) {
      const named = toks.slice(0, 3).map((t) => (t === '{{KIT_VERSION}}' ? `${t} (the kit pin)` : t));
      fail('config', `${toks.length} unfilled {{TOKEN}}${toks.length === 1 ? '' : 's'} in project-config.md, first: ${named.join(', ')}`, `fill ${toks[0]} in project-config.md, commit it, then ${READY_AGAIN}`);
    } else pass('config', 'every placeholder in project-config.md is filled');
  });
  // wiring
  guard('wiring', () => {
    const integrity = path.join(projRoot, 'validators', 'validate-claude-integrity.cjs');
    if (!fs.existsSync(integrity)) { fail('wiring', 'validators/validate-claude-integrity.cjs is absent, so the session-hook wiring cannot be checked', ADOPT); return; }
    const r = run(process.execPath, [integrity, '--settings', path.join('.claude', 'settings.json')]);
    const HUMAN = (rel) => `remove the key from ${rel} in your own editor (the agent cannot edit it), then ${READY_AGAIN}`;
    if (r.status !== 0) { const why = readyReason(r, projRoot); fail('wiring', why, /disableAllHooks/.test(why) ? HUMAN('.claude/settings.json') : ADOPT); return; }
    // M34.6.A: the effective hook policy over the two project settings files. The kit's
    // registrations (the set the door checks against) with their matchers and onFailure, and
    // .claude/settings.local.json, which outranks the project file, switching nothing off. User,
    // managed and command-line settings are outside what a project script can read, and the line says so.
    const sm = settingsMergeLib();
    let live = null; try { live = JSON.parse(readIf(path.join(projRoot, '.claude', 'settings.json'))); } catch (_) { live = null; }
    let n = null;
    if (kitRoot) {
      const kit = sm.deriveKitSettings(kitRoot);
      n = kit.registrations.length;
      const f = sm.hookPolicyFindings(live, kit);
      if (f.length) { fail('wiring', `.claude/settings.json ${f[0]}${f.length > 1 ? ` (and ${f.length - 1} more)` : ''}`, ADOPT); return; }
    }
    const localText = readIf(path.join(projRoot, '.claude', 'settings.local.json'));
    if (localText !== null) {
      let loc; try { loc = JSON.parse(localText); } catch (e) { fail('wiring', `.claude/settings.local.json is not valid JSON (${String(e.message).split('\n')[0]}), and it outranks .claude/settings.json`, `correct .claude/settings.local.json in your own editor, then ${READY_AGAIN}`); return; }
      const off = sm.disablingFinding(loc);
      if (off) { fail('wiring', `.claude/settings.local.json ${off}; it outranks .claude/settings.json`, HUMAN('.claude/settings.local.json')); return; }
    }
    pass('wiring', `.claude/settings.json registers ${n === null ? 'the session hooks (no kit template here to compare its registrations against)' : `the kit's ${n} hook registrations with their matchers, the red gate's onFailure block and the session hooks`}, every hook script a node command names under .claude/, scripts/ or validators/ is present (other commands are not resolved), and neither it nor .claude/settings.local.json sets disableAllHooks (user, managed and command-line settings are not read)`);
  });
  // hooks
  guard('hooks', () => {
    const hookFiles = MANAGED.filter((r) => r.file.startsWith('.githooks/')).map((r) => r.file);
    const hp = String(run('git', ['config', 'core.hooksPath']).stdout || '').trim();
    if (hp !== '.githooks') { fail('hooks', `core.hooksPath ${hp ? `reads ${hp}` : 'is unset'}, not .githooks (a clone does not carry it), so the commit and push gates are not armed`, ADOPT); return; }
    const bad = [];
    for (const f of hookFiles) {
      let st = null; try { st = fs.lstatSync(path.join(projRoot, f)); } catch (_) { st = null; }
      if (!st) bad.push(`${f} is absent`);
      else if (!st.isFile()) bad.push(`${f} is not a regular file`);
      else if (process.platform !== 'win32' && !(st.mode & 0o111)) bad.push(`${f} is not executable`);
    }
    if (bad.length) fail('hooks', `core.hooksPath reads .githooks, but ${bad.join('; ')}`, ADOPT);
    else pass('hooks', `core.hooksPath reads .githooks; ${hookFiles.join(', ')} ${process.platform === 'win32' ? 'are regular files' : 'are regular executable files'}`);
  });
  // read-first
  guard('read-first', () => {
    const hook = path.join(projRoot, '.claude', 'hooks', 'session-start-read-first.cjs');
    if (!fs.existsSync(hook)) { fail('read-first', '.claude/hooks/session-start-read-first.cjs is absent, so the read-first lists cannot be checked', ADOPT); return; }
    const r = run(process.execPath, [hook, '--check']);
    if (r.status === 0) { pass('read-first', 'the read-first lists pass the hook\'s own --check'); return; }
    const why = readyReason(r, projRoot);
    fail('read-first', why, why.endsWith(READY_LOAD_FAIL) ? ADOPT : `correct the entry it names in a staged copy of the list, then place it: ${KU} --place-read-first <role> <staged copy>`);
  });
  // cli
  guard('cli', () => {
    const floor = readFloor(projRoot);
    if (!floor) { fail('cli', `the Claude Code floor cannot be read (no claudeCodeFloor in release-manifest.json or ${KIT_DIR}/release-manifest.json), and this kit's settings need a known floor`, 'install a kit release that pins the floor (run sbak-install.cjs), then ' + READY_AGAIN); return; }
    const c = claudeVersion(projRoot);
    if (c.absent) fail('cli', `claude not found on PATH (floor ${floor}); run --ready from a shell where claude runs`, `run ${READY_AGAIN} from a shell where claude runs`);
    else if (c.unparsed) fail('cli', `claude --version printed no version (${c.unparsed}); the floor is ${floor}`, `run ${READY_AGAIN} from a shell where claude --version answers`);
    else if (versionCmp(c.version, floor) < 0) fail('cli', `claude ${c.version} is below the floor ${floor}: this kit's settings carry onFailure, which an older CLI may reject, and a rejected settings file drops every hook and deny rule; upgrade Claude Code`, `upgrade Claude Code (claude update), then ${READY_AGAIN}`);
    else pass('cli', `claude ${c.version} (floor ${floor})`);
  });
  // payload
  guard('payload', () => {
    const man = readJsonIf(path.join(projRoot, KIT_DIR, 'release-manifest.json'));
    const map = man && man.payload && typeof man.payload === 'object' ? man.payload : null;
    if (!map) { pass('payload', `not checked - ${man ? `${KIT_DIR}/release-manifest.json carries no payload map (an older release ships none)` : `no ${KIT_DIR}/release-manifest.json (no kit installed under ${KIT_DIR}/)`}`); return; }
    const differ = []; const kept = []; let n = 0;
    for (const rel of Object.keys(map).filter((k) => k.indexOf(`${KIT_DIR}/`) === 0)) {
      n++;
      let b = null; try { b = fs.readFileSync(path.join(projRoot, rel)); } catch (_) { b = null; }
      if (b === null) differ.push(`${rel} (absent)`);
      else if (payloadSha256(b) !== map[rel]) (declaresDivergence(b.toString('utf8')) ? kept : differ).push(rel);
    }
    const keptNote = kept.length ? `; ${kept.length} kept (INTENTIONAL DIVERGENCE): ${kept.join(', ')}` : '';
    if (differ.length) fail('payload', `${differ.length} of ${n} ${KIT_DIR}/ file(s) differ from the release's hashes in ${KIT_DIR}/release-manifest.json, first: ${differ.slice(0, 3).join(', ')}${keptNote}`, `put ${differ[0].replace(/ \(absent\)$/, '')} back from the release (git checkout, or re-run the installer), or mark it INTENTIONAL DIVERGENCE to keep it`);
    else pass('payload', `${n - kept.length} files verified against ${KIT_DIR}/release-manifest.json${keptNote}`);
  });
  // managed
  if (!kitRoot) fail('managed', `no template source (the kit's templates/ at the root or under ${KIT_DIR}/), so the kit files cannot be compared`, 'install the kit (run sbak-install.cjs), then ' + READY_AGAIN);
  else guard('managed', () => {
    const stale = []; const unfilled = []; const kept = []; let at = 0; let filled = 0;
    // M34.6.A: a required row's absent live file is NOT READY; a row the tier or a toggle
    // does not render stays a skip, and the pass line counts them
    const req = requiredSet(projRoot); const absent = []; let notRendered = 0;
    for (const row of MANAGED) {
      const live = readIf(path.join(projRoot, row.file)); const tpl = readIf(path.join(kitRoot, row.template));
      if (tpl === null) continue;
      if (live === null) { const w = req.why(row); if (w.required) absent.push({ row, w }); else notRendered++; continue; }
      if (declaresDivergence(live)) { kept.push(row.file); continue; }
      if (row.render === 'wiring') {
        const s = live.match(/\{\{[A-Za-z0-9_]+\}\}/g);
        if (s) unfilled.push({ file: row.file, tok: s[0] }); else filled++;
        continue;
      }
      const ls = stampOf(live); const ts = stampOf(tpl);
      if (ls !== null && ts !== null && ls !== ts) stale.push({ file: row.file, stamp: ls }); else at++;
    }
    const keptNote = kept.length ? `; ${kept.length} kept (INTENTIONAL DIVERGENCE): ${kept.join(', ')}` : '';
    const why = [];
    if (absent.length) {
      const extra = absent[0].w.why.replace(/^tier [a-z]+(, )?/, '');
      why.push(`${absent[0].row.file} is absent, and this project's tier (${req.tier}) requires it${extra ? ` (${extra})` : ''}${absent.length > 1 ? `; ${absent.length - 1} more required kit file(s) absent: ${absent.slice(1, 4).map((a) => a.row.file).join(', ')}` : ''}`);
    }
    if (stale.length) why.push(`${stale.length} kit file(s) not at v${cur}: ${stale.slice(0, 3).map((s) => `${s.file} @${s.stamp}`).join(', ')}`);
    if (unfilled.length) why.push(`${unfilled.length} bootstrap-filled file(s) with an unfilled {{TOKEN}}: ${unfilled.slice(0, 3).map((u) => `${u.file} (${u.tok})`).join(', ')}`);
    if (stale.length) staleStamps = true;
    if (why.length) fail('managed', why.join('; ') + keptNote, absent.length ? ADOPT : stale.length ? `${KU} --apply ${stale[0].file} (or mark it INTENTIONAL DIVERGENCE to keep it)` : `fill ${unfilled[0].tok} in ${unfilled[0].file}, commit it, then ${READY_AGAIN}`);
    else pass('managed', `${at} managed files at v${cur}, ${filled} filled, 0 unfilled tokens, ${notRendered} not rendered by this project's tier or toggles${keptNote}`);
  });
  // HEAD
  const head = run('git', ['rev-parse', '--verify', '--short', 'HEAD']);
  const sha = head.status === 0 ? String(head.stdout).trim() : '';
  if (!sha) fail('HEAD', 'no commit yet - the bootstrap commit has not landed (git rev-parse --verify HEAD failed)', 'make the bootstrap commit (git add -A, then git commit), then ' + READY_AGAIN);
  else pass('HEAD', `${sha} (the bootstrap commit has landed)`);
  // tree
  guard('tree', () => {
    let own = null;
    try { own = require(path.join(__dirname, 'lib', 'channel.cjs')).OWN_FILES; } catch (e) { own = { error: missingModule(projRoot, e && e.message) ? `${missingModule(projRoot, e.message)} is missing` : String(e && e.message || e).split('\n')[0] }; }
    const ps = run('git', ['status', '--porcelain', '--untracked-files=all']);
    if (!Array.isArray(own)) fail('tree', `the channel's own-file list cannot be read from scripts/lib/channel.cjs (${own && own.error ? own.error : 'no OWN_FILES'}), so its files cannot be told from yours`, ADOPT);
    else if (ps.status !== 0) fail('tree', `git status failed: ${readyReason(ps, projRoot)}`, 'run --ready inside the project\'s Git repository');
    else {
      const CH = '.claude/channel/';
      // M34.6.B (R1, orchestrator seq 212): the OPEN stage's evidence directory rides the stage commit
      // as the channel's logs do, so it is ignored here too; any other stage's uncommitted evidence is named.
      const sa = readyMarker(projRoot, 'stage-active');
      const EVO = sa.value && READY_STAGE_ID.test(sa.value) ? `.claude/evidence/${sa.value}/` : null;
      const dirty = normalize(ps.stdout).split('\n').filter(Boolean)
        .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
        .filter((p) => !(p.indexOf(CH) === 0 && own.some((re) => re.test(p.slice(CH.length)))))
        .filter((p) => !(EVO && (p.indexOf(EVO) === 0 || `${p}/` === EVO)));
      if (dirty.length) fail('tree', `${dirty.length} uncommitted path(s), first: ${dirty.slice(0, 3).join(', ')}`, `commit or discard them (git status lists them), then ${READY_AGAIN}`);
      else pass('tree', EVO ? `clean, ignoring .claude/channel/ (the channel's own logs, cursors and markers) and ${EVO} (the open stage's evidence, committed with the stage)` : 'clean, ignoring .claude/channel/ (the channel\'s own logs, cursors and markers)');
    }
  });
  // migration
  if (!kitRoot || !cur) fail('migration', kitRoot ? `the kit at ${path.relative(projRoot, kitRoot) || '.'} has no release-manifest.json version to migrate to` : 'no template source, so nothing can be compared', 'install the kit (run sbak-install.cjs), then ' + READY_AGAIN);
  else guard('migration', () => {
    if (mig.threw) throw mig.threw;
    const pin = mig.pin;
    if (mig.pinErr) fail('migration', `the kit pin cannot be read (${mig.pinErr})`, ADOPT);
    else if (!pin || !VERSION_RE.test(pin)) fail('migration', 'project-config.md records no kit_version, so what this project would take from the kit is unknown', MIGRATE);
    else if (pin === cur) pass('migration', `none pending (kit_version v${pin} is this kit's version)`);
    else {
      const t = mig.table;
      if (t.refuse) fail('migration', t.refuse.replace(/^kit-update: --migrate refused - /, ''), MIGRATE);
      else {
        const pending = t.rows.filter((r) => MIGRATE_PENDING.indexOf(r.cls) !== -1 || r.unresolved);
        if (pending.length) fail('migration', `${pending.length} kit file(s) pending from v${pin} to v${cur}, first: ${pending.slice(0, 3).map((r) => `${r.row.file} (${r.cls})`).join(', ')}`, MIGRATE);
        else pass('migration', `none pending (kit_version v${pin}, this kit v${cur}; nothing to take)`);
      }
    }
  });
  for (const r of rows) process.stdout.write(`${r.line}\n`);
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    // M34.2.B (Y-11): a pending migration's command comes before every repair it makes moot, after
    // only the rows --migrate needs first. Pending: the migration row asks for --migrate and the kit
    // files show an older release (the pin recorded, or stale stamps).
    const m = failed.find((r) => r.row === 'migration' && r.repair === MIGRATE);
    const pending = m && (VERSION_RE.test(String(mig.pin || '')) || staleStamps);
    const next = pending ? (failed.find((r) => MIGRATE_FIRST.indexOf(r.row) !== -1) || m) : failed[0];
    process.stdout.write(`NOT READY: ${failed.length} of ${READY_ROWS.length} rows. Next: ${next.repair}\n`);
    return 1;
  }
  const hand = handoff(projRoot, opts || {});
  process.stdout.write(`${hand.role}\n`);
  process.stdout.write(`READY. Project committed at ${sha}. Next: open a fresh terminal as the orchestrator.\n`);
  if (hand.block) process.stdout.write(hand.block);
  return 0;
}

// ── the leaving-bootstrap block (M34.6.E item 6, R-173) ────────────────────────────────────────
// A READY run names this window's role state (none, orchestrator, work, or another role) on the line
// before the READY line, and at role none - the bootstrap window, before any set-mode - with --model
// it prints the five steps itself after the READY line, filled from the project: its absolute path,
// the person's shell (the project-config shell row; unset, cmd on win32 and bash elsewhere, named in
// one line above the block), the tier (Lite starts the build session, Full the orchestrator) and the
// model. The agent quotes this output and composes nothing (the v1.0.9 field test: a block composed
// from memory dropped the set-mode line). Without --model no block is printed - a literal
// placeholder would fail as a shell redirect - and the role line names the flag; the READY line then
// stays the last line, as every caller that runs --ready without it (the installer's upgrade) reads.
const READY_SHELLS = {
  cmd: { label: 'cmd', other: 'cmd', cd: (p) => `cd /d ${p}`, launch: (m) => `set CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1 && claude --model ${m}` },
  powershell: { label: 'PowerShell', other: 'PowerShell', cd: (p) => `cd "${p}"`, launch: (m) => `$env:CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP="1"; claude --model ${m}` },
  bash: { label: 'bash', other: 'POSIX', cd: (p) => `cd "${p}"`, launch: (m) => `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1 claude --model ${m}` },
};
const READY_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/;
function readyRole(projRoot) {
  let b = null;
  try { b = fs.readFileSync(path.join(projRoot, '.claude', 'role')); } catch (e) { return e && e.code === 'ENOENT' ? 'none' : 'unresolved'; }
  const t = b.toString('utf8').split(String.fromCharCode(0)).join('').trim().toLowerCase();
  return ['work', 'orchestrator', 'verifier', 'refactor'].indexOf(t) === -1 ? 'unresolved' : t;
}
function readyShell(projRoot) {
  const dflt = process.platform === 'win32' ? 'cmd' : 'bash';
  const why = `${dflt}, the ${process.platform === 'win32' ? 'win32' : 'POSIX'} default.`;
  const raw = readIf(path.join(projRoot, 'project-config.md')) || '';
  let text = raw;
  try { text = require(path.join(__dirname, 'lib', 'read-ledger.cjs')).stripHtmlComments(raw); } catch (_) { text = raw; }
  const m = /^\|\s*shell\s*\|\s*([^|]+?)\s*\|/mi.exec(text) || /^shell:\s*(\S+)/mi.exec(text);
  const v = m ? m[1].replace(/`/g, '').trim().toLowerCase() : null;
  if (v !== null && READY_SHELLS[v]) return { shell: v, note: null };
  if (v === null || /\{\{.*\}\}/.test(v)) return { shell: dflt, note: `shell: not set in project-config.md - ${why}` };
  return { shell: dflt, note: `shell: "${v}" in project-config.md is not cmd, powershell or bash - ${why}` };
}
// -> { role: the line before READY, block: the text after it, or null }
function handoff(projRoot, opts) {
  const role = readyRole(projRoot);
  if (role !== 'none') return { role: `role: ${role} - this window already carries a role, so bootstrap is over here and no leaving-bootstrap block is printed.`, block: null };
  // The model: the project-config.md model setting first, when one exists (PHASES.md §Phase 5's order),
  // then --model (gate-1 condition A).
  let cfgModel = null;
  try {
    const v = require(path.join(__dirname, 'lib', 'read-ledger.cjs')).readConfigValue(readIf(path.join(projRoot, 'project-config.md')) || '', 'model');
    const t = v === null || v === undefined ? '' : String(v).replace(/`/g, '').trim();
    if (READY_MODEL_RE.test(t)) cfgModel = t;
  } catch (_) { cfgModel = null; }
  const model = cfgModel || (typeof opts.model === 'string' && READY_MODEL_RE.test(opts.model) ? opts.model : null);
  if (!model) return { role: `role: none - this is the bootstrap window; run --ready again with --model and the model this session runs on${typeof opts.model === 'string' && opts.model ? ` ("${opts.model}" is not a model name)` : ''}, and the leaving-bootstrap block follows the READY line.`, block: null };
  const lite = requiredSet(projRoot).tier === 'lite';
  const sh = readyShell(projRoot);
  const f = READY_SHELLS[sh.shell];
  const p = path.resolve(projRoot);
  const others = Object.keys(READY_SHELLS).filter((s) => s !== sh.shell).map((s) => `${READY_SHELLS[s].other}: ${READY_SHELLS[s].cd(p)} and ${READY_SHELLS[s].launch(model)}`);
  const lines = [];
  if (sh.note) lines.push(sh.note);
  lines.push(
    'Bootstrap is done. Five steps:',
    '1. Open a NEW terminal window.',
    `2. Paste these lines, one at a time, to start the ${lite ? 'build session' : 'orchestrator'} (${f.label}):`,
    `     ${f.cd(p)}`,
    `     node scripts/set-mode.cjs ${lite ? 'work' : 'orchestrator'}`,
    `     ${f.launch(model)}`,
    `   (${others.join(' - ')} - the set-mode line stays the same)`,
    lite ? '3. In the new session, type `let\'s start M01` - the stamp appears in its reply.'
      : '3. In the new window, type start - the orchestrator\'s stamp appears in its reply, and it tells you when and how to open the build terminal.',
    '4. If anything here is unclear, ask Claude in THIS window before closing it.',
    '5. Then close this window. Bootstrap is over.',
  );
  return { role: 'role: none - this is the bootstrap window; the leaving-bootstrap block follows the READY line.', block: lines.join('\n') + '\n' };
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

// The kit's public repository. An installed project has no copy of the kit's CHANGELOG.md
// (release-manifest.json marks it repo-identity: declared, never packed), so a line that sends a
// person there gives this address. The slug is a copy of sbak-install.cjs's REPO_SLUG, which this
// script cannot read in a project; a smoke pin holds the two equal and the path to the manifest.
const KIT_REPO_SLUG = 'kknipe2k/Software-Build-Assurance-Kit';
const KIT_CHANGELOG_URL = `https://github.com/${KIT_REPO_SLUG}/blob/main/CHANGELOG.md`;

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
      // M33.D: the tree's own README explains the kit's templates and stays with them in
      // sbak/templates/dot-claude/; adopt places what the Phase-3 render places, so it is not copied.
      if (t.from === 'templates/dot-claude' && rel === 'README.md') continue;
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
        if (sres.conflictCount > 0 || sres.status === 'unparseable' || sres.status === 'aborted' || sres.status === 'restored' || sres.status === 'disabling') {
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
    // CROSS-SOURCE identity: `a` is git-emitted (long form), `b` is node-held — which on
    // Windows can ride an 8.3 short-name alias (CI runners hand out TEMP dirs whose
    // user segment is an alias of the RUNNERAD~1 form). The JS
    // fs.realpathSync resolves symlinks but never expands short names, so it called the
    // same directory two different strings and adopt refused its own repository (the
    // windows-crlf RED, M29.2.A). realpathSync.native (GetFinalPathNameByHandle) expands
    // the alias; the JS walk stays as the fallback where native is unavailable.
    try {
      const real = (s) => { try { return fs.realpathSync.native(s); } catch (_) { return fs.realpathSync(s); } };
      const n = (s) => { const r = path.resolve(real(s)); return process.platform === 'win32' ? r.toLowerCase() : r; };
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

  // The kit pin (M33.D): a project that has project-config.md but no kit_version gets this kit's
  // version - but only when that is provably true: no managed copy file drifted and every stamped
  // managed file carries this kit's version. Never raised over a recorded value: a raised pin
  // whose filled files are older would make --migrate merge from the wrong base and drop the
  // template's changes.
  if (!dryRun && readIf(path.join(projRoot, 'project-config.md')) !== null && !readPin(projRoot).value) {
    const kv = versionAt(kitRoot);
    const stale = MANAGED.filter((r) => { const s = stampOf(readIf(path.join(projRoot, r.file)) || ''); return s !== null && s !== kv; }).length;
    if (kv && drifted === 0 && stale === 0) { writePin(projRoot, kv); W('  kit pin  kit_version recorded as ' + kv + ' in project-config.md (every managed kit file matches this kit)'); }
    else W('  kit pin  not recorded: ' + (drifted + stale) + ' managed kit file(s) are not at v' + kv + '; node scripts/kit-update.cjs --migrate asks for the version they came from');
  }
  if (!dryRun) cmdIngest(projRoot, false);
  else W('  (dry-run: the known-issue ingest also runs on a real adopt — nothing harvested now)');
  return (hookRefused > 0 || rowRefused > 0 || settingsIncomplete > 0 || missingControls.length > 0) ? 1 : 0;
}

// ── --migrate: the migrate door (M33.D) ───────────────────────────────────────────────────
// A project built on an older kit takes the current one file by file, table first:
//   node scripts/kit-update.cjs --migrate [--kit <new kit>] [--pin <v>] [--base <dir>]
//     prints one row per MANAGED file and writes nothing;
//   ... --apply-all [--release <path>]...  writes it.
// M34.D: a retire row removes a live file the pinned version shipped and the current kit does not
// (unchanged from the pinned bytes); changed, it is retire-kept, listed and never written.
// Per file, in order: an INTENTIONAL DIVERGENCE head -> keep-divergent (never written). A wiring
// row (bootstrap-filled) is merged three ways - base = the PINNED version's template, ours = the
// live file, theirs = the current template - through `git merge-file`; a clean merge is `merge`, a
// conflicted one `conflict` (written WITH its markers, the run exits non-zero), and a live file
// still carrying markers is refused until they are resolved. A copy row equal to the current
// template is `current`; equal to the pinned template (the project never changed it) is
// `replace`; anything else is `modified`, listed and never written unless the person names it
// with --release (never guessed). The pin (project-config.md kit_version) is the version merged
// FROM; it is raised to the current kit's version LAST, and only when the apply left no conflict.
// The base comes from, in order: --base <dir>; the project's own sbak/ when it is that version;
// the oldest commit in this repository whose sbak/release-manifest.json reads it; a tag v<pin> in
// the --kit checkout. Never a network fetch. Refused while a stage is open or the tree is dirty,
// so a migration is one reviewable diff at a milestone boundary.
const MIGRATE_ORDER = ['current', 'replace', 'add', 'merge', 'conflict', 'retire', 'modified', 'retire-kept', 'keep-divergent', 'absent'];
// Where a kit file lands live, for the retire class: adopt's three trees and the rendered validators.
const RETIRE_ROUTES = ADOPT_TREES.concat([{ from: 'validators', to: 'validators' }]);
const CONFLICT_MARKER_RE = /^<{7}( |$)/m;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

// The release manifest's payload hash: sha256 over the bytes with CRLF read as LF (the same rule
// scripts/build-release.cjs writes the map with; a copy, because the builder does not ship). A
// Buffer is hashed byte for byte (a binary file must not round-trip through UTF-8); text as UTF-8.
function payloadSha256(data) {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return crypto.createHash('sha256').update(Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');
}
function readJsonIf(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function versionAt(treeRoot) { const m = treeRoot ? readJsonIf(path.join(treeRoot, 'release-manifest.json')) : null; return m && m.version ? String(m.version) : null; }
function gitAt(cwd, args) { return spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }

// The one project-config reader (CFI-17): kit_version is read through it, never a parser of our own.
// Required HERE, not at load (M34.A): read-ledger.cjs requires scripts/lib/hook-root.cjs, and a
// missing hook-root.cjs is the fault the red gate tells the person to repair with --ready and
// --adopt - a load-time require crashed both before they could restore it. --ready never reaches
// this; --adopt does, in its kit-pin block after the adopt loop, by which time the loop has put
// scripts/lib/hook-root.cjs back (its managed copy row); --migrate reads the pin up front.
function readPin(projRoot) {
  const text = readIf(path.join(projRoot, 'project-config.md'));
  return { text, value: text === null ? null : require(path.join(__dirname, 'lib', 'read-ledger.cjs')).readConfigValue(text, 'kit_version') };
}
// Write the pin: the existing line or row takes the value; else one line lands under the Tier line.
function writePin(projRoot, version) {
  const p = path.join(projRoot, 'project-config.md');
  const t = readIf(p);
  if (t === null) return false;
  const eol = t.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  let out;
  const line = /^(\*\*Kit version:\*\*[ \t]*)([^\s<|]*)/m;
  const row = /^(\|[ \t]*kit[_ ]version[ \t]*\|[ \t]*)`?([^|`\s]*)`?/mi;
  if (line.test(t)) out = t.replace(line, (m, a) => a + version);
  else if (row.test(t)) out = t.replace(row, (m, a) => a + version);
  else {
    // (the comment never puts a word after "kit_version:" - the config reader would read it as the value)
    const add = `**Kit version:** ${version}  <!-- The kit pin (read as kit_version), written by kit-update: the kit release this project's kit files came from -->`;
    const tier = /^\*\*Tier:\*\*.*$/m.exec(t);
    out = tier ? t.slice(0, tier.index + tier[0].length) + eol + add + t.slice(tier.index + tier[0].length) : t.replace(/\s*$/, '') + eol + eol + add + eol;
  }
  const tmp = p + '.kit-update.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, p);
  return true;
}
function stampEvidence(projRoot) {
  const counts = new Map();
  for (const row of MANAGED) {
    const s = stampOf(readIf(path.join(projRoot, row.file)) || '');
    if (s) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

// The pinned version's kit tree, offline. Returns { label, read(rel) -> text|null, manifest } or
// { refuse } or null (nothing found).
// list() names the tree's templates/ and validators/ files (the retire class reads it when the
// pinned release carries no payload map).
function treeSource(treeRoot, label) {
  return { label, read: (rel) => readIf(path.join(treeRoot, rel)), manifest: readJsonIf(path.join(treeRoot, 'release-manifest.json')),
    list: () => ['templates', 'validators'].filter((d) => fs.existsSync(path.join(treeRoot, d))).flatMap((d) => walkFiles(path.join(treeRoot, d)).map((r) => `${d}/${r}`)) };
}
function lsTree(cwd, ref, dirs, strip) {
  const r = gitAt(cwd, ['ls-tree', '-r', '--name-only', ref, '--', ...dirs]);
  return r.status === 0 ? String(r.stdout).split(/\r?\n/).filter(Boolean).map((p) => (strip && p.indexOf(strip) === 0 ? p.slice(strip.length) : p)) : [];
}
function kitTreeIn(dir) {
  if (fs.existsSync(path.join(dir, 'templates'))) return dir;
  if (fs.existsSync(path.join(dir, KIT_DIR, 'templates'))) return path.join(dir, KIT_DIR);
  return null;
}
function resolveBase(projRoot, kitRoot, pin, baseArg) {
  if (baseArg) {
    const dir = path.resolve(baseArg);
    const tree = kitTreeIn(dir);
    const v = versionAt(tree);
    if (!tree || v !== pin) return { refuse: `kit-update: --migrate refused - --base ${baseArg} is ${tree ? (v ? 'v' + v : 'a tree with no release-manifest.json version') : 'not a kit tree (no templates/)'}, not v${pin}; nothing was written.` };
    return treeSource(tree, `--base ${baseArg} (v${pin})`);
  }
  for (const [tree, label] of [[path.join(projRoot, KIT_DIR), `${KIT_DIR}/ (v${pin})`], [projRoot, `the kit at the project root (v${pin})`]]) {
    if (path.resolve(tree) === path.resolve(kitRoot)) continue;
    if (fs.existsSync(path.join(tree, 'templates')) && versionAt(tree) === pin) return treeSource(tree, label);
  }
  // This repository's history: the OLDEST commit whose sbak/release-manifest.json reads the pin
  // (the install or upgrade commit, before any later edit of the kit copy).
  const log = gitAt(projRoot, ['log', '--format=%H', '--reverse', '--', `${KIT_DIR}/release-manifest.json`]);
  if (log.status === 0) {
    for (const sha of String(log.stdout).split(/\r?\n/).filter(Boolean)) {
      const m = gitAt(projRoot, ['show', `${sha}:${KIT_DIR}/release-manifest.json`]);
      let v = null; try { v = String(JSON.parse(m.stdout).version); } catch (_) { v = null; }
      if (m.status === 0 && v === pin) {
        const show = (rel) => { const r = gitAt(projRoot, ['show', `${sha}:${KIT_DIR}/${rel}`]); return r.status === 0 ? r.stdout : null; };
        let manifest = null; try { manifest = JSON.parse(m.stdout); } catch (_) { manifest = null; }
        return { label: `this repository's history (commit ${sha.slice(0, 12)}, v${pin})`, read: show, manifest,
          list: () => lsTree(projRoot, sha, [`${KIT_DIR}/templates`, `${KIT_DIR}/validators`], `${KIT_DIR}/`) };
      }
    }
  }
  // A kit checkout holding the release tag.
  const tag = gitAt(kitRoot, ['rev-parse', '-q', '--verify', `refs/tags/v${pin}`]);
  if (tag.status === 0) {
    const show = (rel) => { const r = gitAt(kitRoot, ['show', `v${pin}:./${rel}`]); return r.status === 0 ? r.stdout : null; };
    const m = show('release-manifest.json');
    let manifest = null; try { manifest = JSON.parse(m); } catch (_) { manifest = null; }
    return { label: `tag v${pin} in ${kitRoot}`, read: show, manifest, list: () => lsTree(kitRoot, `v${pin}`, ['templates', 'validators'], null) };
  }
  return null;
}

// The project's fills: the pinned template read as a pattern over the live file, each {{TOKEN}} a
// one-line value (the same token, the same value). -> { TOKEN: value } or null (no token, or the
// live file is not the template filled).
function readFills(tpl, live) {
  const names = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
  let src = '^'; let last = 0; let m;
  while ((m = rx.exec(tpl))) {
    src += esc(tpl.slice(last, m.index)) + (names.indexOf(m[1]) === -1 ? `(?<${m[1]}>[^\\n]*?)` : `\\k<${m[1]}>`);
    if (names.indexOf(m[1]) === -1) names.push(m[1]);
    last = rx.lastIndex;
  }
  if (!names.length) return null;
  let r = null;
  try { r = new RegExp(src + esc(tpl.slice(last)) + '$').exec(live); } catch (_) { r = null; }
  return r && r.groups ? Object.assign({}, r.groups) : null;
}
function fillTokens(text, fills) {
  return text.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (t, n) => (Object.prototype.hasOwnProperty.call(fills, n) ? fills[n] : t));
}

// One three-way merge through git (exit 0 clean, N > 0 conflicts left as markers).
function mergeThree(ours, base, theirs, labels) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-update-merge-'));
  try {
    const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
    const o = f('live', ours); const b = f('base', base); const t = f('theirs', theirs);
    const r = spawnSync('git', ['merge-file', '-p', '-L', labels[0], '-L', labels[1], '-L', labels[2], o, b, t], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status === null || r.status > 127) return { error: r.error ? r.error.message : `git merge-file exit ${r.status}: ${String(r.stderr || '').trim()}` };
    return { conflicts: r.status, text: r.stdout };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Write temp + rename, keeping the live file's mode (a .githooks file keeps its exec bit).
function writeKeepingMode(abs, data) {
  let mode = null; try { mode = fs.statSync(abs).mode & 0o777; } catch (_) { mode = null; }
  const tmp = abs + '.kit-update.tmp';
  fs.writeFileSync(tmp, data);
  if (mode !== null) { try { fs.chmodSync(tmp, mode); } catch (_) { /* win32: no exec bit */ } }
  fs.renameSync(tmp, abs);
}

function cmdMigrate(projRoot, kitRoot, opts) {
  const E = (s) => process.stderr.write(s + '\n');
  const W = (s) => process.stdout.write(s + '\n');
  // 1. a milestone boundary: no open stage
  const stageFile = path.join(projRoot, '.claude', 'stage-active');
  if (fs.existsSync(stageFile)) {
    const id = (String(readIf(stageFile) || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean)) || 'unknown';
    E(`kit-update: --migrate refused - stage ${id} is open (.claude/stage-active). Migrate at a milestone boundary: commit the stage and clear it (node scripts/stage-active.cjs --clear), then re-run.`);
    return 2;
  }
  // 2. one reviewable diff: a clean tree (the channel's own traffic aside, as --ready reads it)
  const st = gitAt(projRoot, ['status', '--porcelain', '--untracked-files=all']);
  if (st.status !== 0) {
    E('kit-update: --migrate refused - this directory is not a Git repository, so the migration could not land as one reviewable diff. Run git init and commit the project first.');
    return 2;
  }
  const dirty = normalize(st.stdout).split('\n').filter(Boolean)
    .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
    .filter((p) => !p.startsWith('.claude/channel/')).sort();
  if (dirty.length) {
    E(`kit-update: --migrate refused - ${dirty.length} uncommitted path(s): ${dirty.slice(0, 3).join(', ')}. Commit or discard them first, so the migration lands as one reviewable diff.`);
    return 2;
  }
  // M34.6.A: a live settings file that switches the hooks off is refused, never stripped -
  // the same rule as the door and adopt, before anything is written
  let liveSettings = null;
  try { liveSettings = JSON.parse(readIf(path.join(projRoot, '.claude', 'settings.json')) || 'null'); } catch (_) { liveSettings = null; }
  const off = settingsMergeLib().disablingFinding(liveSettings);
  if (off) {
    E(`kit-update: --migrate refused - .claude/settings.json ${off}; the agent cannot edit this file: remove the key in your own editor (or place a copy without it with --place-settings), then re-run; nothing was written.`);
    return 2;
  }
  // 3. the pin: recorded, or answered once with --pin (the stamps are the evidence, never a guess)
  const recorded = readPin(projRoot);
  if (recorded.value && opts.pin && recorded.value !== opts.pin) {
    E(`kit-update: --migrate refused - --pin ${opts.pin} disagrees with project-config.md kit_version ${recorded.value}; nothing was written.`);
    return 2;
  }
  const pin = recorded.value || opts.pin;
  if (!pin) {
    const ev = stampEvidence(projRoot);
    E(`kit-update: --migrate needs the kit version this project was built on - project-config.md has no kit_version. The @kit-version stamps in its kit files say: ${ev.length ? ev.map(([v, n]) => `${v} (${n} files)`).join(', ') : 'nothing (no stamped kit file found)'}. Re-run with --pin <version> to record it (never guessed).`);
    return 1;
  }
  const cur = versionAt(kitRoot);
  if (!cur) { E(`kit-update: --migrate refused - the kit at ${kitRoot} has no release-manifest.json version to migrate to; nothing was written.`); return 2; }
  if (cur === pin) { W(`kit-update: --migrate - this project is already at v${cur}; nothing to migrate (the plain report, node scripts/kit-update.cjs, shows any drift).`); return 0; }
  // 4 and 5. the base and the table (the --ready migration row reads the same table)
  const t = migrationTable(projRoot, kitRoot, pin, opts.base, opts.release);
  if (t.refuse) { E(t.refuse); return 2; }
  const { base, hashes, rows } = t;
  // 6. the table
  const unverified = hashes ? '' : `; base unverified: v${pin} ships no hashes`;
  W(opts.apply
    ? `kit-update --migrate --apply-all (v${pin} -> v${cur}; base: ${base.label}${unverified})`
    : `kit-update --migrate - table only, nothing written (v${pin} -> v${cur}; base: ${base.label}${unverified})`);
  rows.sort((a, b) => MIGRATE_ORDER.indexOf(a.cls) - MIGRATE_ORDER.indexOf(b.cls) || (a.row.file < b.row.file ? -1 : 1));
  for (const r of rows) W(`  ${r.cls.padEnd(15)} ${r.row.file.padEnd(50)} ${r.detail}`.replace(/\s+$/, ''));
  const count = (c) => rows.filter((r) => r.cls === c).length;
  W(`=> ${MIGRATE_ORDER.map((c) => `${count(c)} ${c}`).join(', ')}`);
  if (!opts.apply) {
    W('Nothing was written. Re-run the same command with --apply-all to write it' + (recorded.value ? '.' : ` (keep --pin ${pin}).`));
    return 0;
  }
  // 7. the apply: the confirmed pin first (when it was answered with --pin), the files, the pin last
  if (!recorded.value) writePin(projRoot, pin);
  let replaced = 0; let added = 0; let merged = 0; let retired = 0;
  const conflicts = [];
  for (const r of rows) {
    if (r.unresolved) { conflicts.push(r.row.file); continue; }
    if (['replace', 'add', 'merge', 'conflict', 'retire'].indexOf(r.cls) === -1) continue;
    let abs;
    try { abs = assertInside(projRoot, r.row.file); } catch (e) { E(`  refused ${r.row.file} - ${e.message}`); conflicts.push(r.row.file); continue; }
    if (r.cls === 'retire') { fs.unlinkSync(abs); retired++; }
    else if (r.cls === 'add') { fs.mkdirSync(path.dirname(abs), { recursive: true }); writeKeepingMode(abs, fs.readFileSync(path.join(kitRoot, r.row.template))); added++; }
    else if (r.cls === 'replace') { writeKeepingMode(abs, fs.readFileSync(path.join(kitRoot, r.row.template))); replaced++; }
    else { writeKeepingMode(abs, r.text); if (r.cls === 'merge') merged++; else conflicts.push(r.row.file); }
  }
  W(`=> wrote ${replaced} replaced, ${added} added, ${merged} merged, ${retired} retired${conflicts.length ? `, ${conflicts.length} with conflicts` : ''}; ${count('modified')} modified, ${count('retire-kept')} retire-kept and ${count('keep-divergent')} keep-divergent left as they are.`);
  if (conflicts.length) {
    W(`=> CONFLICT in ${conflicts.join(', ')}: the markers are in the file. kit_version stays v${pin}. Resolve them, commit, then re-run with --apply-all.`);
    return 1;
  }
  writePin(projRoot, cur);
  W(`=> kit_version raised to v${cur}. Review the diff and commit it, then run: node scripts/kit-update.cjs --ready`);
  return 0;
}

// The table --migrate prints and --ready's migration row reads: one row per MANAGED file, then the
// retire class. Returns { refuse } or { base, cur, hashes, rows }; writes nothing.
function migrationTable(projRoot, kitRoot, pin, baseArg, release) {
  const cur = versionAt(kitRoot);
  // the base: the PINNED version's templates, offline
  const base = resolveBase(projRoot, kitRoot, pin, baseArg);
  if (base && base.refuse) return { refuse: base.refuse };
  if (!base) return { refuse: `kit-update: --migrate refused - no v${pin} kit tree to merge from (tried: --base, ${KIT_DIR}/, this repo's history, tag v${pin} in --kit). Pass --base <path to a v${pin} kit tree>; nothing was written.` };
  const hashes = base.manifest && base.manifest.payload && typeof base.manifest.payload === 'object' ? base.manifest.payload : null;
  const labels = ['live', `v${pin}`, `v${cur}`];
  // classify every MANAGED row
  const rows = [];
  for (const row of MANAGED) {
    const liveAbs = path.join(projRoot, row.file);
    const live = readIf(liveAbs);
    const tplRaw = readIf(path.join(kitRoot, row.template));
    if (tplRaw === null) { rows.push({ row, cls: 'absent', detail: `the kit has no ${row.template} - skipped` }); continue; }
    if (live === null) {
      // A kit file new since the pin (no v<pin> template) is added: the project never had it, so
      // nothing of its can be lost, and the files the new kit needs arrive with it. One the pinned
      // kit already had is absent by the project's tier or toggles, and stays absent.
      rows.push(row.render === 'copy' && base.read(row.template) === null && classifyDestination(liveAbs).kind !== 'symlink'
        ? { row, cls: 'add', detail: `new since v${pin}` }
        : { row, cls: 'absent', detail: 'not in this project (tier or toggle) - skipped' });
      continue;
    }
    if (classifyDestination(liveAbs).kind === 'symlink') { rows.push({ row, cls: 'modified', detail: 'a symlink - never written through' }); continue; }
    if (declaresDivergence(live)) { rows.push({ row, cls: 'keep-divergent', detail: 'declared INTENTIONAL DIVERGENCE - never written' }); continue; }
    const L = normalize(live); const C = normalize(tplRaw);
    let P = base.read(row.template);
    let baseNote = '';
    if (P !== null && hashes) {
      const want = hashes[`${KIT_DIR}/${row.template}`];
      if (want && payloadSha256(P) !== want) { P = null; baseNote = ` (the v${pin} copy fails its release hash)`; }
    }
    if (P !== null) P = normalize(P);
    if (row.render === 'wiring') {
      if (CONFLICT_MARKER_RE.test(L)) { rows.push({ row, cls: 'conflict', unresolved: true, detail: 'unresolved conflict markers - resolve them, commit, then re-run' }); continue; }
      if (P === null) { rows.push({ row, cls: 'modified', detail: `no v${pin} template to merge from${baseNote}` }); continue; }
      if (P === C) { rows.push({ row, cls: 'current', detail: 'the template did not change' }); continue; }
      // M34.D: both templates are filled with the project's own fills, read back from the live file
      // against the pinned template, so a fill on a line the template also changed (a comment that
      // names the token) merges clean; a live file that no longer reads as the pinned template
      // filled merges from the raw templates, as before.
      const fills = readFills(P, L);
      const m = fills ? mergeThree(L, fillTokens(P, fills), fillTokens(C, fills), labels) : mergeThree(L, P, C, labels);
      if (m.error) { rows.push({ row, cls: 'modified', detail: `the merge failed: ${m.error}` }); continue; }
      if (m.conflicts === 0 && m.text === L) { rows.push({ row, cls: 'current', detail: 'already carries the template change' }); continue; }
      rows.push(m.conflicts === 0
        ? { row, cls: 'merge', text: m.text, detail: `v${pin} -> v${cur}, your fills kept` }
        : { row, cls: 'conflict', text: m.text, detail: `${m.conflicts} conflicting hunk(s), written with markers` });
      continue;
    }
    if (L === C) { rows.push({ row, cls: 'current', detail: '' }); continue; }
    if (P !== null && L === P) { rows.push({ row, cls: 'replace', detail: `unchanged since v${pin}` }); continue; }
    rows.push({ row, cls: 'modified', detail: `changed here${P === null ? ` (no v${pin} copy to compare${baseNote})` : ''} - mark it INTENTIONAL DIVERGENCE to keep it, or re-run with --release ${row.file} to take the template` });
  }
  // the retire class (M34.D): a live file the pinned version shipped whose template the current
  // kit no longer ships. Unchanged from the pinned bytes it is retired (the apply removes it);
  // changed here it is kept and named. The pinned list is its payload map when it carries one,
  // else its tree's own file list - never guessed.
  const shipped = hashes ? Object.keys(hashes).filter((k) => k.indexOf(`${KIT_DIR}/`) === 0).map((k) => k.slice(KIT_DIR.length + 1)) : (base.list ? base.list() : []);
  const managedFiles = new Set(MANAGED.map((r) => r.file));
  for (const rel of shipped.sort()) {
    const route = RETIRE_ROUTES.find((t) => rel.indexOf(t.from + '/') === 0);
    if (!route || rel === 'templates/dot-claude/README.md') continue;
    const file = route.to + rel.slice(route.from.length);
    if (managedFiles.has(file) || fs.existsSync(path.join(kitRoot, rel))) continue;
    const abs = path.join(projRoot, file);
    const live = readIf(abs);
    if (live === null) continue;
    const row = { file, template: rel, render: 'copy' };
    if (classifyDestination(abs).kind === 'symlink') { rows.push({ row, cls: 'retire-kept', detail: `gone from v${cur}; a symlink - never removed through` }); continue; }
    let P = base.read(rel);
    const want = hashes ? hashes[`${KIT_DIR}/${rel}`] : null;
    if (P !== null && want && payloadSha256(P) !== want) P = null;
    rows.push(P !== null && normalize(live) === normalize(P) && !declaresDivergence(live)
      ? { row, cls: 'retire', detail: `shipped by v${pin}, gone from v${cur}, unchanged - removed by --apply-all` }
      : { row, cls: 'retire-kept', detail: `shipped by v${pin}, gone from v${cur}, changed here - kept` });
  }
  // --release: only a file the table lists as modified (a copy row) can be released
  for (const rel of release) {
    const hit = rows.find((r) => r.row.file === rel.replace(/\\/g, '/'));
    if (!hit || hit.cls !== 'modified' || hit.row.render !== 'copy' || /symlink/.test(hit.detail)) {
      return { refuse: `kit-update: --migrate refused - --release ${rel} names no modified kit file in this table (only a copy file listed "modified" can be released); nothing was written.` };
    }
    hit.cls = 'replace'; hit.detail = 'released by you (--release)';
  }
  return { base, cur, hashes, rows };
}

// ── hard rule 5, the MERGE form (M30.D; gate-1 ruling 2 2026-08-30) ─────────────────────
// Phase 3's handoff step, mechanical instead of prose: place the FILLED project CLAUDE.md.
// A COMBINED root (the installer's `@sbak/CLAUDE.md` import line present — same detection as
// sbak-install) is the person's file and is never replaced: the project rules land in root
// CLAUDE.sbak.md (project-owned, so the kit's upgrade never touches them — sbak/ is kit-owned
// and refreshed wholesale) and the import line is rewritten to `@CLAUDE.sbak.md`. A root
// without the import line gets today's overwrite: the bootstrap file dies, the project rules
// take over.
function cmdPlaceProjectClaude(projRoot, filledPath) {
  let filled;
  try { filled = fs.readFileSync(path.resolve(filledPath), 'utf8'); } catch (e) {
    process.stderr.write('kit-update: filled project CLAUDE.md unreadable at ' + filledPath + ': ' + e.message + '\n');
    return 2;
  }
  const rootMd = path.join(projRoot, 'CLAUDE.md');
  let existing = null;
  try { existing = fs.readFileSync(rootMd, 'utf8'); } catch (_) { /* no root file — plain placement */ }
  const hasImport = existing !== null && /(^|[^`])@sbak\/CLAUDE\.md(?![`\w])/.test(existing.replace(/`[^`]*`/g, ''));
  if (hasImport) {
    fs.writeFileSync(path.join(projRoot, 'CLAUDE.sbak.md'), filled);
    fs.writeFileSync(rootMd, existing.replace(/@sbak\/CLAUDE\.md/g, '@CLAUDE.sbak.md'));
    process.stdout.write('kit-update: combined root kept — project rules placed at CLAUDE.sbak.md; the import line now reads @CLAUDE.sbak.md; sbak/CLAUDE.md stays the kit\'s copy.\n');
  } else {
    fs.writeFileSync(rootMd, filled);
    process.stdout.write('kit-update: CLAUDE.md replaced with the project rules (no import line — the bootstrap file dies so the project rules take over).\n');
  }
  return 0;
}

// ── the settings door (M34.C) ───────────────────────────────────────────────────────────────
// .claude/settings.json is a red-gate control file: the Edit(/.claude/settings.json) deny rule and
// the hook's carve keep Claude's edit tools off it in every state. Phase 3 still fills it: the agent
// copies the live file to a staging path outside .claude/, fills that copy with the edit tools, and
// this door places it. The door is the kit's floor, never a merge: it refuses a file that is
// unreadable, unparseable, still carries a {{TOKEN}}, lacks one of the template's hook registrations
// or the onFailure one carries (M34.D: the red gate's "block"), lacks a deny rule of the template's floor, or lacks (or allows) one of the template's ask rules -
// the same permissions floor settings-merge derives, so a placed file can never drop the click on a
// release. Then it archives the live bytes (settings-merge's archive) and replaces the file
// atomically. A script, so the agent may run it: the floor is what it cannot get past.
function cmdPlaceSettings(projRoot, filledArg, kitArg) {
  const refuse = (why) => { process.stderr.write(`kit-update: --place-settings refused - ${filledArg} ${why}; nothing was placed.\n`); return 2; };
  const ARCHIVE_REL = settingsMergeLib().ARCHIVE_REL;
  let text;
  try { text = fs.readFileSync(path.resolve(projRoot, filledArg), 'utf8'); } catch (e) { return refuse(`is unreadable (${e.code || e.message})`); }
  let filled;
  try { filled = JSON.parse(text); } catch (e) { return refuse(`is not valid JSON (${String(e.message).split('\n')[0]})`); }
  if (!filled || typeof filled !== 'object' || Array.isArray(filled)) return refuse('is not a settings object');
  const token = /\{\{[A-Za-z0-9_]+\}\}/.exec(text);
  if (token) return refuse(`still carries ${token[0]}; fill it, then place it`);
  // M34.6.A: the door never places a configuration that switches the hooks off
  const off = settingsMergeLib().disablingFinding(filled);
  if (off) return refuse(`${off}; remove the key, then place it`);
  let kitRoot = kitArg ? path.resolve(kitArg) : null;
  if (kitRoot === null && fs.existsSync(path.join(projRoot, 'templates', 'dot-claude', 'settings.json'))) kitRoot = projRoot;
  if (kitRoot === null && fs.existsSync(path.join(projRoot, KIT_DIR, 'templates', 'dot-claude', 'settings.json'))) kitRoot = path.join(projRoot, KIT_DIR);
  if (kitRoot === null) return refuse(`cannot be checked: no template source (the kit's templates/ at the root or under ${KIT_DIR}/, or --kit <path>)`);
  let kit;
  try { kit = deriveKitSettings(kitRoot); } catch (e) { return refuse(`cannot be checked: ${String(e.message).split('\n')[0]}`); }
  const have = new Set(flattenRegistrations(filled).map((r) => `${r.event}\u0000${r.matcher === null ? '\u0001' : r.matcher}\u0000${commandIdentity(r.command)}`));
  for (const r of kit.registrations) {
    if (!have.has(`${r.event}\u0000${r.matcher === null ? '\u0001' : r.matcher}\u0000${commandIdentity(r.command)}`)) return refuse(`lacks the kit's hook registration ${r.event}/${r.matcher === null ? '-' : r.matcher} ${r.command}`);
  }
  // M34.D: the red gate's "onFailure": "block" is part of the floor - without it a gate that cannot
  // run lets the call through
  const fields = new Set(flattenRegistrations(filled).filter((r) => r.onFailure).map((r) => `${r.event}\u0000${r.matcher === null ? '\u0001' : r.matcher}\u0000${commandIdentity(r.command)}\u0000${r.onFailure}`));
  for (const r of kit.registrations.filter((x) => x.onFailure)) {
    if (!fields.has(`${r.event}\u0000${r.matcher === null ? '\u0001' : r.matcher}\u0000${commandIdentity(r.command)}\u0000${r.onFailure}`)) return refuse(`lacks "onFailure": "${r.onFailure}" on the kit's hook registration ${r.event}/${r.matcher === null ? '-' : r.matcher} ${r.command}`);
  }
  const perms = filled.permissions && typeof filled.permissions === 'object' ? filled.permissions : {};
  const list = (k) => (Array.isArray(perms[k]) ? perms[k] : []);
  for (const rule of kit.deny) if (list('deny').indexOf(rule) === -1) return refuse(`lacks the kit's deny rule ${rule}`);
  for (const rule of kit.ask) {
    if (list('allow').indexOf(rule) !== -1) return refuse(`allows the kit's ask rule ${rule} (it stays ask, or deny)`);
    if (list('ask').indexOf(rule) === -1 && list('deny').indexOf(rule) === -1) return refuse(`lacks the kit's ask rule ${rule}`);
  }
  const live = path.join(projRoot, '.claude', 'settings.json');
  let archived = null;
  try {
    let prior = null;
    try { prior = fs.readFileSync(live); } catch (_) { prior = null; }
    if (prior !== null) archived = writeArchive(path.join(projRoot, ARCHIVE_REL), prior, new Date());
    fs.mkdirSync(path.dirname(live), { recursive: true });
    fs.writeFileSync(live + '.tmp', text);
    fs.renameSync(live + '.tmp', live);
  } catch (e) {
    try { fs.rmSync(live + '.tmp', { force: true }); } catch (_) { /* best effort */ }
    return refuse(`could not be placed (${e.code || e.message})`);
  }
  process.stdout.write(`kit-update: .claude/settings.json placed from ${filledArg} (checked: parseable, no {{TOKEN}}, the kit's ${kit.registrations.length} hook registrations, ${kit.deny.length} deny rules and ${kit.ask.length} ask rules present${archived ? `; the prior bytes archived at ${ARCHIVE_REL}/${path.basename(archived)}` : ''}).\n`);
  return 0;
}

// ── the read-first door (M34.D) ─────────────────────────────────────────────────────────────────
// .claude/read-first-list*.txt are red-gate control files: the Edit(/.claude/read-first-list*.txt)
// deny rule and the hook's carve keep Claude's edit tools off them in every state. A changed list is
// staged outside .claude/ and placed here, in the --place-settings shape: the role names the list
// (work is read-first-list.txt, any other role read-first-list-<role>.txt); every entry parses
// through read-ledger.cjs parseListLine (one parser) with an explicit when: from its vocabulary; the
// entries the loader caps fit read_first_cap (host, on-demand and phase-N sit outside it, as the
// loader counts); every path exists at HEAD, a view: entry excepted and a * in the last segment
// matching exactly one HEAD file (before the repository's first commit - a bootstrap places its
// lists before its one commit - the working tree is read instead); no {{TOKEN}} remains. Then the
// live bytes are archived under .claude/read-first.archive/ and the list replaced atomically. Each
// failed check is one line naming it, and nothing is written.
const LIST_ARCHIVE_REL = '.claude/read-first.archive';
const LIST_UNCAPPED = ['host', 'on-demand', 'phase-0', 'phase-1', 'phase-3'];
const LIST_CAPS = { small: 4, medium: 8, large: 12, unlimited: Number.MAX_SAFE_INTEGER };
function cmdPlaceReadFirst(projRoot, role, stagedArg) {
  const refuse = (why) => { process.stderr.write(`kit-update: --place-read-first refused - ${why}; nothing was placed.\n`); return 2; };
  if (!/^[a-z]+(-[a-z]+)*$/.test(String(role))) return refuse(`"${role}" is not a role name (lowercase words joined by -: work, orchestrator, verifier, ...)`);
  const listName = role === 'work' ? 'read-first-list.txt' : `read-first-list-${role}.txt`;
  let text;
  try { text = fs.readFileSync(path.resolve(projRoot, stagedArg), 'utf8'); } catch (e) { return refuse(`${stagedArg} is unreadable (${e.code || e.message})`); }
  const token = /\{\{[A-Za-z0-9_]+\}\}/.exec(text);
  if (token) return refuse(`${stagedArg} still carries ${token[0]}; fill it, then place it`);
  let rl;
  try { rl = require(path.join(__dirname, 'lib', 'read-ledger.cjs')); } catch (e) { return refuse(`the list parser cannot load (scripts/lib/read-ledger.cjs: ${String(e && e.message || e).split('\n')[0]})`); }
  const entries = [];
  const lines = normalize(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const e = rl.parseListLine(lines[i]);
    if (!e) continue;
    if (!e.explicit) return refuse(`line ${i + 1} (${e.path}) has no when: - every entry names its boundary (${rl.WHEN_VOCAB.join(' | ')})`);
    if (!e.valid) return refuse(`line ${i + 1} (${e.path}) ${e.reason || `has an unknown when: ${JSON.stringify(e.when)} (one of: ${rl.WHEN_VOCAB.join(', ')})`}`);
    entries.push(e);
  }
  const capWord = rl.readConfigValue(readIf(path.join(projRoot, 'project-config.md')) || '', 'read_first_cap');
  const cap = LIST_CAPS[capWord] || LIST_CAPS.medium;
  const capped = entries.filter((e) => LIST_UNCAPPED.indexOf(e.when) === -1);
  if (capped.length > cap) return refuse(`${capped.length} entries count toward the cap of ${cap} (read_first_cap ${capWord || 'medium'}; host, on-demand and phase-N entries sit outside it)`);
  const atHead = gitAt(projRoot, ['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  const where = atHead ? 'at HEAD' : 'in the working tree (no commit yet)';
  for (const e of entries) {
    if (e.kind === 'view') continue;
    const p = e.path.replace(/\\/g, '/');
    if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.split('/').indexOf('..') !== -1) return refuse(`${p} escapes the project root`);
    let dead = null;
    if (!atHead) {
      const r = rl.resolveListPath(projRoot, p);
      dead = r.dead || (fs.existsSync(path.join(projRoot, r.rel)) ? null : 'resolves to no file');
    } else if (p.indexOf('*') === -1) {
      const t = gitAt(projRoot, ['cat-file', '-t', `HEAD:${p}`]);
      dead = t.status === 0 && String(t.stdout).trim() === 'blob' ? null : 'is not a file';
    } else {
      const dir = path.posix.dirname(p);
      if (dir.indexOf('*') !== -1) dead = 'carries a * outside its last path segment';
      else {
        const re = new RegExp('^' + path.posix.basename(p).split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
        const ls = gitAt(projRoot, ['ls-tree', 'HEAD', '--', dir === '.' ? '.' : `${dir}/`]);
        const hits = String(ls.status === 0 ? ls.stdout : '').split(/\r?\n/).filter(Boolean)
          .map((l) => l.split('\t')).filter((x) => / blob /.test(x[0]) && re.test(path.posix.basename(x[1] || '')));
        dead = hits.length === 1 ? null : `matches ${hits.length} files`;
      }
    }
    if (dead) return refuse(`${p} ${dead} ${where}`);
  }
  const live = path.join(projRoot, '.claude', listName);
  let archived = null;
  try {
    let prior = null;
    try { prior = fs.readFileSync(live); } catch (_) { prior = null; }
    if (prior !== null) archived = writeArchive(path.join(projRoot, LIST_ARCHIVE_REL), prior, new Date(), `.${listName}`);
    fs.mkdirSync(path.dirname(live), { recursive: true });
    fs.writeFileSync(live + '.tmp', text);
    fs.renameSync(live + '.tmp', live);
  } catch (e) {
    try { fs.rmSync(live + '.tmp', { force: true }); } catch (_) { /* best effort */ }
    return refuse(`.claude/${listName} could not be placed (${e.code || e.message})`);
  }
  process.stdout.write(`kit-update: .claude/${listName} placed from ${stagedArg} (checked: every entry parses with its when:, ${capped.length} of ${cap} capped, every path ${where}, no {{TOKEN}}${archived ? `; the prior bytes archived at ${LIST_ARCHIVE_REL}/${path.basename(archived)}` : ''}).\n`);
  return 0;
}

// ── --upgrade-check (M34.D): before an extract-over ─────────────────────────────────────
// The manual upgrade unzips a new release over sbak/. This names, first, every sbak/ file the person
// changed since the installed release that the new tree would overwrite. Changed = its bytes (CRLF
// read as LF) differ from the installed sbak/release-manifest.json payload hash; for a release that
// carries no map, a file changed since the oldest commit whose sbak/release-manifest.json reads the
// installed version. A file whose head declares INTENTIONAL DIVERGENCE is named too: an extract does
// not read heads (the installer's upgrade does, and keeps it). Exit 1 when it names one, 0 when the
// extract loses nothing, 2 when it cannot tell. Writes nothing.
function cmdUpgradeCheck(projRoot, treeArg) {
  const E = (s) => process.stderr.write(s + '\n');
  const newKit = kitTreeIn(path.resolve(projRoot, treeArg));
  if (!newKit) { E(`kit-update: --upgrade-check refused - ${treeArg} is not a kit tree (no templates/ there or under ${KIT_DIR}/)`); return 2; }
  const man = readJsonIf(path.join(projRoot, KIT_DIR, 'release-manifest.json'));
  if (!man || !man.version) { E(`kit-update: --upgrade-check refused - ${KIT_DIR}/release-manifest.json is missing or names no version, so what you changed cannot be told`); return 2; }
  const installed = String(man.version);
  const map = man.payload && typeof man.payload === 'object' ? man.payload : null;
  let touched = null;
  if (!map) {
    const log = gitAt(projRoot, ['log', '--format=%H', '--reverse', '--', `${KIT_DIR}/release-manifest.json`]);
    let sha = null;
    for (const c of log.status === 0 ? String(log.stdout).split(/\r?\n/).filter(Boolean) : []) {
      const m = gitAt(projRoot, ['show', `${c}:${KIT_DIR}/release-manifest.json`]);
      let v = null; try { v = String(JSON.parse(m.stdout).version); } catch (_) { v = null; }
      if (m.status === 0 && v === installed) { sha = c; break; }
    }
    if (!sha) { E(`kit-update: --upgrade-check refused - v${installed} carries no payload map and no commit here records ${KIT_DIR}/ at v${installed}; commit the installed ${KIT_DIR}/ first`); return 2; }
    const d = gitAt(projRoot, ['diff', '--name-only', '--no-renames', sha, '--', KIT_DIR]);
    touched = new Set(d.status === 0 ? String(d.stdout).split(/\r?\n/).filter(Boolean) : []);
  }
  const lose = [];
  for (const rel of walkFiles(newKit)) {
    const dest = `${KIT_DIR}/${rel}`;
    if (dest === `${KIT_DIR}/release-manifest.json`) continue; // the release's own record, rewritten by every release
    let mine = null; try { mine = fs.readFileSync(path.join(projRoot, dest)); } catch (_) { mine = null; }
    if (mine === null) continue;
    const changed = map ? (map[dest] === undefined || payloadSha256(mine) !== map[dest]) : touched.has(dest);
    if (!changed) continue;
    if (payloadSha256(mine) === payloadSha256(fs.readFileSync(path.join(newKit, rel)))) continue; // the new tree carries your bytes
    lose.push(dest + (declaresDivergence(mine.toString('utf8')) ? ' (marked INTENTIONAL DIVERGENCE: an extract does not read it)' : ''));
  }
  const from = path.relative(projRoot, path.resolve(projRoot, treeArg)) || treeArg;
  if (!lose.length) {
    process.stdout.write(`kit-update --upgrade-check: nothing under ${KIT_DIR}/ you changed since v${installed} would be overwritten by ${from}; the extract loses nothing.\n`);
    return 0;
  }
  process.stdout.write(`kit-update --upgrade-check: ${lose.length} file(s) under ${KIT_DIR}/ you changed since v${installed} would be overwritten by unzipping ${from}:\n`);
  for (const l of lose) process.stdout.write(`  ${l}\n`);
  process.stdout.write(`Keep each one before the extract: copy it aside, or upgrade through the installer (sbak-install.cjs), which keeps a file marked INTENTIONAL DIVERGENCE and refuses over any other you changed.\n`);
  return 1;
}

function main() {
  const argv = process.argv.slice(2);
  const kitIdx = argv.indexOf('--kit');
  const applyIdx = argv.indexOf('--apply');
  const placeIdx = argv.indexOf('--place-project-claude');
  const settingsIdx = argv.indexOf('--place-settings');
  if (kitIdx !== -1 && (!argv[kitIdx + 1] || argv[kitIdx + 1].startsWith('--'))) usage('--kit needs a directory');
  if (kitIdx !== -1) KIT_SOURCE = path.resolve(argv[kitIdx + 1]);
  if (applyIdx !== -1 && (!argv[applyIdx + 1] || argv[applyIdx + 1].startsWith('--'))) usage('--apply needs a managed live-file path');
  if (placeIdx !== -1 && (!argv[placeIdx + 1] || argv[placeIdx + 1].startsWith('--'))) usage('--place-project-claude needs the filled project CLAUDE.md path');
  if (settingsIdx !== -1 && (!argv[settingsIdx + 1] || argv[settingsIdx + 1].startsWith('--'))) usage('--place-settings needs the filled settings file path (a copy outside .claude/)');
  const detect = argv.includes('--detect');
  const adopt = argv.includes('--adopt');
  const ingest = argv.includes('--ingest');
  const dryRun = argv.includes('--dry-run');

  const projRoot = process.cwd();

  // --place-project-claude is Phase-3 placement, not template comparison — dispatched
  // before template resolution AND before the kit-repo no-op (it acts on the project root).
  if (placeIdx !== -1) process.exit(cmdPlaceProjectClaude(projRoot, argv[placeIdx + 1]));
  // --place-settings is Phase-3 placement too (M34.C), dispatched before the kit-repo no-op: it
  // places the live file of the tree it runs in, the kit's workshop included.
  if (settingsIdx !== -1) process.exit(cmdPlaceSettings(projRoot, argv[settingsIdx + 1], kitIdx !== -1 ? argv[kitIdx + 1] : null));
  // --place-read-first is the same shape for the read-first lists (M34.D), dispatched here too.
  const listIdx = argv.indexOf('--place-read-first');
  if (listIdx !== -1) {
    if (!argv[listIdx + 1] || argv[listIdx + 1].startsWith('--') || !argv[listIdx + 2] || argv[listIdx + 2].startsWith('--')) usage('--place-read-first needs a role and the staged list path (a copy outside .claude/)');
    process.exit(cmdPlaceReadFirst(projRoot, argv[listIdx + 1], argv[listIdx + 2]));
  }
  // --upgrade-check reads sbak/ and a new tree and writes nothing (M34.D).
  const upIdx = argv.indexOf('--upgrade-check');
  if (upIdx !== -1) {
    if (!argv[upIdx + 1] || argv[upIdx + 1].startsWith('--')) usage('--upgrade-check needs the new release\'s unzipped folder');
    process.exit(cmdUpgradeCheck(projRoot, argv[upIdx + 1]));
  }
  // --ready is the end-of-bootstrap readiness check - it inspects the project root and needs
  // no template source, so it is dispatched before the kit-repo no-op too (inside the kit
  // workshop it honestly reports NOT READY: the workshop is not a bootstrapped project).
  if (argv.includes('--ready')) { const mi = argv.indexOf('--model'); process.exit(cmdReady(projRoot, { model: mi !== -1 && argv[mi + 1] && !argv[mi + 1].startsWith('--') ? argv[mi + 1] : (mi !== -1 ? '' : undefined) })); }
  // --required <live-file> (M34.6.A): read-only, the managed row's own set - the pre-commit
  // asks it whether a missing gate is required here. Prints "required (<why>)" or "not required
  // (<why>)", exit 0; a file the kit does not manage, exit 2.
  const reqIdx = argv.indexOf('--required');
  if (reqIdx !== -1) {
    const rel = String(argv[reqIdx + 1] || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!rel || rel.startsWith('--')) usage('--required needs a live kit file path (e.g. validators/validate-test-honesty.cjs)');
    const row = MANAGED.find((r) => r.file === rel);
    if (!row) { process.stderr.write(`kit-update: --required - ${rel} is not a kit-managed file (unknown to the managed set)\n`); process.exit(2); }
    const w = requiredSet(projRoot).why(row);
    process.stdout.write(`${w.required ? 'required' : 'not required'} (${w.why})\n`);
    process.exit(0);
  }

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

  if (argv.includes('--migrate')) {
    const valOf = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
    const pin = valOf('--pin');
    if (argv.includes('--pin') && (!pin || !VERSION_RE.test(pin))) usage('--pin needs a kit version like 1.0.6');
    if (argv.includes('--base') && (!valOf('--base') || valOf('--base').startsWith('--'))) usage('--base needs a directory');
    const release = [];
    argv.forEach((a, i) => { if (a === '--release') { if (!argv[i + 1] || argv[i + 1].startsWith('--')) usage('--release needs a managed live-file path'); release.push(argv[i + 1]); } });
    process.exit(cmdMigrate(projRoot, kitRoot, { pin, base: valOf('--base'), release, apply: argv.includes('--apply-all') }));
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
      // A wiring row is bootstrap-filled, so --apply refuses it (below): the line names the manual
      // change instead, the release CHANGELOG's subsection for projects on the live stamp's release,
      // by its public address, because the project has no copy of that file.
      report.push({ row, cls: 'stamp', detail: row.render === 'wiring'
        ? `live @${liveStamp} vs template @${tplStamp} - a bootstrap-filled file, so --apply refuses it: make the change by hand from "Manual change for a v${liveStamp} project" in the kit's CHANGELOG, ${KIT_CHANGELOG_URL}, then raise its @kit-version line, or run node scripts/kit-update.cjs --migrate`
        : `live @${liveStamp} vs template @${tplStamp} (kit updated; --apply to take the template)` });
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

module.exports = { MANAGED, DIVERGENCE_RE, declaresDivergence, STAMP_RE, normalize, detectRepoState, harvestKnownIssues, READY_ROWS, readyMarkers };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`kit-update: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2);
  }
}
