#!/usr/bin/env node
// scripts/calibration-derive.cjs
//
// THE CALIBRATION DERIVER (M26.D) — turns the 3+1 interview's answers into the full derived
// configuration, mechanically, from the calibration core + the row registry. This is the ONE
// seam between "what the user said" (3 asks: operating_mode, tier, risk_triggers — plus the
// discovery context: description, deliverable type, repo visibility, ship targets) and "what
// the bootstrap does" (toggles, severity, locus, the scaffold file list, and the plain-English
// confirmation turn). The bootstrap agent renders the confirmation turn FROM this output; the
// smoke floor drives it with the reference fixtures (scripts/fixtures/calibration-interview/);
// M26.E's journey consumes the same derived-value tables.
//
// ── DESIGN RULES (why this exists) ───────────────────────────────────────────────────────
//   • EVERY derived value carries a plain-English `why` — the confirmation turn surfaces every
//     one and invites correction (the ratified 3+1 contract). A derived value that silently
//     no-ops is the C5 class: when a Lite project declares a risk trigger, the output SAYS the
//     ledger workflow arms at Full only and the Lite escalation stays the G11 record (gate-2
//     rider 1) — a decision, not a surprise.
//   • NOTHING here is hand-stated twice: tier toggles, severity, locus rules, and the armed
//     modules come from calibration-core.json; the file list comes from rows.json (the same
//     source golden-bootstrap renders). Counts are NEVER frozen — they are len(files).
//   • HONEST LOCUS: derives the DETERMINISTIC half (toggles + file list + disclosure lines).
//     It does not conduct the interview, infer the deliverable type from free text (the agent
//     proposes; the value arrives in context), or render the scaffold.
//     File-list support: verification_locus hybrid / local_first (the row registry's encoded
//     loci). A `cloud` locus derives toggles + disclosures correctly but the file list swaps
//     the local harness for ci.yml OUTSIDE the row registry (SCAFFOLD-TABLES locus note) — the
//     deriver refuses cloud file lists loudly rather than emit a wrong one.
//
// Usage:
//   node scripts/calibration-derive.cjs --answers <file.json> [--json]
//
// Input file shape (see scripts/fixtures/calibration-interview/*.json):
//   { "answers": { "operating_mode", "tier", "risk_triggers": [] },
//     "context": { "description", "deliverable_type", "repo_visibility", "ship_targets": [] } }
//
// Output (--json): { operating_mode, tier, risk_triggers, derived: { <k>: {value, why} },
//                    files: [..], confirmation: [ {key, value, why} .. ] }
//
// Exit 0 = derived. Exit 1 = unreadable input / unknown answer value / usage error (fail
// closed — an unrecognized tier must never silently derive defaults). Dependency-free.

'use strict';

const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.resolve(__dirname, '..');

function die(msg) { process.stderr.write('calibration-derive: ' + msg + '\n'); process.exit(1); }

// ── strict args (the KF-45 lesson: an unknown flag is an error, never silently ignored) ──
const argv = process.argv.slice(2);
const KNOWN_FLAGS = ['--answers', '--json', '--from-spec', '--mode', '--lanes'];
let answersPath = null;
let fromSpecPath = null;
let modeArg = null;
let lanesArg = null;
let asJson = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--answers') { answersPath = argv[++i]; continue; }
  if (a === '--from-spec') { fromSpecPath = argv[++i]; continue; }
  if (a === '--mode') { modeArg = argv[++i]; continue; }
  if (a === '--lanes') { lanesArg = argv[++i] || ''; continue; }
  if (a === '--json') { asJson = true; continue; }
  die('unknown argument "' + a + '" — usage: node scripts/calibration-derive.cjs --answers <file.json> | --from-spec <spec.md> [--mode <m>] | --lanes <runner> [--json] (known: ' + KNOWN_FLAGS.join(', ') + ')');
}
if (!answersPath && !fromSpecPath && lanesArg === null) die('missing --answers <file.json> (or --from-spec <spec.md> for the Full-path glance, or --lanes <runner> for the test-lane fills)');
if (answersPath && fromSpecPath) die('--answers and --from-spec are exclusive: the Custom path derives from answers, the Full path from the spec');

function readJson(p, what) {
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch (e) { die(what + ' unreadable at ' + p + ': ' + e.message); }
  try { return JSON.parse(raw); } catch (e) { die(what + ' is not valid JSON (' + p + '): ' + e.message); }
}

const core = readJson(path.join(KIT_ROOT, 'calibration-core.json'), 'calibration core');
const rowsDoc = readJson(path.join(KIT_ROOT, 'scripts/fixtures/golden-bootstrap/rows.json'), 'row registry');
const rows = Array.isArray(rowsDoc) ? rowsDoc : rowsDoc.rows;

// ── the test-lane fills (M30.F, V106 Stage 2): ONE derive-table row per stack, DATA in
//    calibration-core.json `derivations.test_lanes`. `runnerFor` picks the row from free
//    text (the stack answer / the spec) via `runner_keywords`; `laneFills` renders the three
//    tokens the shipped verify-local reads. `full` = no native selection (the lane widens
//    and says so). Fail closed on a core without the table or an unknown runner name.
function laneTable() {
  const t = core.derivations && core.derivations.test_lanes;
  if (!t || !t.runners || !t.runner_keywords) die('calibration-core.json lacks derivations.test_lanes - the lane fills derive from the core\'s data table only');
  return t;
}
function runnerFor(text) {
  const t = laneTable();
  const s = ' ' + String(text || '').toLowerCase() + ' ';
  for (const [name, keys] of Object.entries(t.runner_keywords)) {
    if (name.startsWith('_')) continue;
    if (keys.some((k) => s.includes(k))) return name;
  }
  return 'unknown';
}
function laneFills(runner) {
  const t = laneTable();
  const row = t.runners[runner];
  if (!row) die('unknown test runner "' + runner + '" (core rows: ' + Object.keys(t.runners).join(', ') + ')');
  const why = row.affected === 'full'
    ? runner + ': no native affected selection - fast/stage run the full native suite and say so (' + row._cite + ')'
    : runner + ': the runner\'s own change scoping fills the fast/stage lanes; <base> and <files> are computed by verify-local at run time (' + row._cite + ')';
  return {
    test_runner: runner,
    AFFECTED_TEST_COMMAND: row.affected, ACTIVE_TEST_COMMAND: row.active, ALWAYS_TEST_COMMAND: row.always,
    dev_dependency: row.dev_dependency || null, always_token: t.always_token, why,
  };
}
if (lanesArg !== null) {
  if (answersPath || fromSpecPath) die('--lanes is exclusive with --answers / --from-spec');
  const f = laneFills(lanesArg.trim() ? (laneTable().runners[lanesArg.trim()] ? lanesArg.trim() : runnerFor(lanesArg)) : 'unknown');
  if (asJson) process.stdout.write(JSON.stringify(f, null, 2) + '\n');
  else {
    process.stdout.write('test lanes - runner ' + f.test_runner + '\n');
    for (const k of ['AFFECTED_TEST_COMMAND', 'ACTIVE_TEST_COMMAND', 'ALWAYS_TEST_COMMAND']) process.stdout.write('  ' + k + ' = ' + f[k] + '\n');
    if (f.dev_dependency) process.stdout.write('  dev dependency: ' + f.dev_dependency + ' (verify-local falls back to full, saying so, when it is not importable)\n');
    process.stdout.write('  why: ' + f.why + '\n');
  }
  process.exit(0);
}
// ── the Full-path glance (M30.D): mode + risk triggers derived from the SPEC, as DATA ────
// One stdout line, printed by the agent verbatim — never composed. Keyword tables live in
// calibration-core.json (risk_trigger_keywords / mode_keywords / glance_smells); this branch
// adds no heuristic beyond a lowercased substring match against those lists, and one
// sentence-local rule (M32.1.A, drive note 5): a risk-trigger hit whose sentence carries a
// negation word before it, that sits in a table column headed Out / Not / No / Deferred, or
// whose row's status cell reads Out (M32.1.C, V-24) does not arm. A trigger whose every hit is negated is printed under the glance as a smell
// line, so the eyeball still sees it. Fail closed on an unknown --mode or a core missing the
// tables.
const NEGATION_WORDS = /\b(no|not|never|without|none)\b/;
const NEGATED_COLUMN = /^(out|not|no|deferred)\b/i;
// M32.1.C (V-24, drive note 4): a table with a status-like column (the header cell is wholly
// `In or out`, `In/out`, `Status` or `Scope`) - a row whose status cell is WHOLLY `out`, `no`,
// `not`, `deferred` or `not in scope` (any case) negates that row's other cells. Whole-cell only,
// so `Not started` does not negate. The drive's spec was rewritten to please the derivation
// because an Out cell VALUE armed its row; the header rule above stays.
const STATUS_HEADER = /^(in or out|in\/out|status|scope)$/i;
const NEGATED_STATUS = /^(out|no|not|deferred|not in scope)$/i;
const plainCell = (c) => String(c || '').replace(/[*_`]/g, '').trim();
// The spec as units: prose split on sentence ends (wrapped lines joined), headings and list
// items on their own, table cells one by one with their column header. Each unit keeps the spec
// line it starts on, so a derived value's why can name it.
function specUnits(raw) {
  const units = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    let joined = ''; const starts = [];
    for (const p of para) { if (joined) joined += ' '; starts.push({ from: joined.length, line: p.line }); joined += p.text; }
    const lineAt = (off) => starts.filter((s) => s.from <= off).pop().line;
    let from = 0;
    const cut = (to, next) => { const s = joined.slice(from, to); if (s.trim()) units.push({ text: s.trim(), negatedColumn: false, line: lineAt(from) }); from = next; };
    for (const m of joined.matchAll(/(?<=[.!?])\s+/g)) cut(m.index, m.index + m[0].length);
    cut(joined.length, joined.length);
    para = [];
  };
  let header = null;
  raw.replace(/\r\n?/g, '\n').split('\n').forEach((lineText, i) => {
    const line = i + 1;
    const t = lineText.trim();
    if (/^\|/.test(t)) {
      flush();
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (header === null) { header = cells; for (const c of cells) units.push({ text: c, negatedColumn: false, line }); return; }
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return;
      const rowOut = cells.some((c, j) => STATUS_HEADER.test(plainCell(header[j])) && NEGATED_STATUS.test(plainCell(c)));
      cells.forEach((c, j) => units.push({ text: c, negatedColumn: rowOut || NEGATED_COLUMN.test(header[j] || ''), line }));
      return;
    }
    header = null;
    if (t === '') { flush(); return; }
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/.test(t)) flush();
    para.push({ text: t, line });
    if (/^#{1,6}\s/.test(t)) flush();
  });
  flush();
  return units;
}
// The quoted fragment of a smell line: the unit, trimmed around the hit, never a double quote.
function smellFragment(text, at, len) {
  let f = text;
  if (text.length > 100) {
    const a = Math.max(0, at - 60); const b = Math.min(text.length, at + len + 30);
    f = (a > 0 ? '...' : '') + text.slice(a, b).trim() + (b < text.length ? '...' : '');
  }
  return f.replace(/"/g, '\'');
}
// docker_leg on the Full path: the ship targets come from the spec, matched with the --answers
// table (derivations.docker_leg.ship_target_match) at a word start, over the same units and with
// the same negation rule as the risk triggers. It rides the JSON only; `accept` writes the row.
function dockerFromSpec(units) {
  const keys = core.derivations && core.derivations.docker_leg && core.derivations.docker_leg.ship_target_match;
  if (!Array.isArray(keys)) die('calibration-core.json lacks derivations.docker_leg.ship_target_match - docker_leg derives from the core\'s data table only');
  let neg = null;
  for (const u of units) {
    const low = u.text.toLowerCase();
    const hits = [];
    for (const k of keys) for (const m of low.matchAll(new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) hits.push({ at: m.index, k, negated: u.negatedColumn || NEGATION_WORDS.test(low.slice(0, m.index)) });
    hits.sort((a, b) => a.at - b.at);
    const first = hits.find((h) => !h.negated);
    if (first) return { value: true, why: 'spec line ' + u.line + ': "' + smellFragment(u.text, first.at, first.k.length) + '" names a linux/server-class ship target (' + first.k + '), so verify-local runs the Linux-in-Docker leg before push' };
    if (!neg && hits.length) neg = { line: u.line, k: hits[0].k, fragment: smellFragment(u.text, hits[0].at, hits[0].k.length) };
  }
  if (neg) return { value: false, why: 'spec line ' + neg.line + ': "' + neg.k + '" appears only in negation ("' + neg.fragment + '"), so no linux/server-class ship target is named and verify-local runs native-only' };
  return { value: false, why: 'no linux/server-class ship target named in the spec (' + keys.join(', ') + '), so verify-local runs native-only - no Docker install for a deliverable that never ships to Linux' };
}
if (fromSpecPath) {
  let specRaw;
  try { specRaw = fs.readFileSync(path.resolve(fromSpecPath), 'utf8'); } catch (e) { die('spec unreadable at ' + fromSpecPath + ': ' + e.message); }
  const spec = specRaw.toLowerCase();
  if (!core.risk_trigger_keywords || !core.mode_keywords) die('calibration-core.json lacks risk_trigger_keywords/mode_keywords — the glance derives from the core\'s data tables only');
  const units = specUnits(specRaw);
  const trig = [];
  const negated = [];
  for (const t of core.risk_triggers) {
    let armed = false; let firstNegated = null;
    for (const u of units) {
      const low = u.text.toLowerCase();
      for (const k of core.risk_trigger_keywords[t] || []) {
        for (let at = low.indexOf(k); at !== -1; at = low.indexOf(k, at + 1)) {
          if (u.negatedColumn || NEGATION_WORDS.test(low.slice(0, at))) { if (!firstNegated) firstNegated = smellFragment(u.text, at, k.length); }
          else armed = true;
        }
      }
    }
    if (armed) trig.push(t);
    else if (firstNegated) negated.push({ trigger: t, fragment: firstNegated });
  }
  let gMode = null;
  if (modeArg !== null) {
    if (!core.operating_modes.includes(modeArg)) die('unknown --mode "' + modeArg + '" (core: ' + core.operating_modes.join(', ') + ')');
    gMode = modeArg;
  } else {
    for (const m of core.operating_modes) {
      if (m === core.default_operating_mode) continue;
      if ((core.mode_keywords[m] || []).some((k) => spec.includes(k))) { gMode = m; break; }
    }
    if (!gMode) gMode = core.default_operating_mode;
  }
  let note = null;
  for (const s of core.glance_smells || []) { if (s.mode === gMode && (s.spec_any || []).some((k) => spec.includes(k))) { note = s.note; break; } }
  const glance = 'Full / ' + gMode + ' / risk triggers: ' + (trig.length ? trig.join(', ') : 'none') + (note ? ' / note: ' + note : '') + ' [type accept; a mode word or trigger token corrects it]';
  const smells = negated.map((n) => 'mentioned only in negation: ' + n.trigger + ' ("' + n.fragment + '")');
  // the lane fills and docker_leg ride the JSON only - the glance LINE is the ruled one line, unchanged.
  const lanes = core.derivations && core.derivations.test_lanes ? laneFills(runnerFor(spec)) : null;
  if (asJson) process.stdout.write(JSON.stringify({ tier: 'Full', operating_mode: gMode, risk_triggers: trig, negated, glance, test_lanes: lanes, derived: { docker_leg: dockerFromSpec(units) } }, null, 2) + '\n');
  else process.stdout.write([glance].concat(smells).join('\n') + '\n');
  process.exit(0);
}

const input = readJson(path.resolve(answersPath), 'answers file');

const answers = input.answers || {};
const context = input.context || {};

// ── validate the answers against the core's ask set (fail closed on drift) ───────────────
const askKeys = Object.keys(answers);
if (JSON.stringify(askKeys) !== JSON.stringify(core.asks)) {
  die('answer keys [' + askKeys.join(', ') + '] != the core ask set [' + core.asks.join(', ') + '] — the fixture/interview must drive the real 3-ask flow');
}
const mode = answers.operating_mode;
if (!core.operating_modes.includes(mode)) die('unknown operating_mode "' + mode + '" (core: ' + core.operating_modes.join(', ') + ')');
const tierName = answers.tier;
const tier = core.tiers[tierName];
if (!tier) die('unknown tier "' + tierName + '" (core: ' + Object.keys(core.tiers).join(', ') + ')');
const triggers = Array.isArray(answers.risk_triggers) ? answers.risk_triggers : null;
if (!triggers) die('risk_triggers must be a list ([] is fine and common)');
for (const t of triggers) if (!core.risk_triggers.includes(t)) die('unknown risk trigger "' + t + '" (core: ' + core.risk_triggers.join(', ') + ')');

// ── context (the discovery facts the derivations consume) ────────────────────────────────
const deliverable = context.deliverable_type || 'cli';
const visibility = context.repo_visibility === 'public' ? 'public' : 'private';
const shipTargets = Array.isArray(context.ship_targets) ? context.ship_targets : [];

// ── derivations ──────────────────────────────────────────────────────────────────────────
const derived = {};
const put = (key, value, why) => { derived[key] = { value, why }; };

// verification_locus — KF-28: repo visibility + ship target, never tier.
const locus = core.derivations.verification_locus[visibility];
put('verification_locus', locus, visibility === 'public'
  ? 'public repo — GitHub Actions are free and unlimited there, so the conventional cloud matrix is simplest'
  : 'private repo — local-first (hybrid) keeps Actions spend near zero: full suite at pre-push, one cheap ubuntu PR smoke check as the backstop');

// docker_leg — KF-28's browser-game defect: target-driven, never tier-driven.
const dockerMatch = core.derivations.docker_leg.ship_target_match;
const dockerLeg = shipTargets.some((t) => dockerMatch.some((m) => String(t).toLowerCase().includes(m)));
put('docker_leg', dockerLeg, dockerLeg
  ? 'a ship target is linux/server-class (' + shipTargets.join(', ') + '), so verify-local runs the Linux-in-Docker leg before push'
  : 'no linux/server ship target (' + (shipTargets.join(', ') || 'none declared') + '), so verify-local runs native-only — no Docker install for a deliverable that never ships to Linux');

// test lanes (M30.F) — the runner from context.test_runner (or the description), one table row.
const laneRow = laneFills(context.test_runner && laneTable().runners[context.test_runner] ? context.test_runner : runnerFor((context.test_runner || '') + ' ' + (context.description || '')));
put('test_runner', laneRow.test_runner, laneRow.why);

// deliverable_type — proposed by the agent from the description; confirmed, not asked.
put('deliverable_type', deliverable, 'inferred from your description — it selects which gates and templates apply (a web/UI deliverable would add the design brief + browser-load verification); correct it if the inference is wrong');

// approval cadence — the one-line disclosure (the ask is cut, ratified).
put('approval_cadence', core.derivations.approval_cadence.value, core.derivations.approval_cadence.disclosure);
put('permission_fence', core.derivations.approval_cadence.fence, 'selected by the approval cadence: edits and tests run unattended, git commit/push and dependency installs pause for you; the deny floor (secrets, force-push, rm -rf) is identical at every level');

// severity — schema-owned (M26.C fork-1 hand-off, ruled at M26.D gate 1).
put('severity', core.severity[tierName], tierName === 'Full'
  ? 'Full is the assurance tier: the 8 advisory validators BLOCK a commit that violates them (each can be dialed back to warn per-validator in project-config.md)'
  : 'Lite keeps the 8 framework validators advisory (--warn): they speak, you decide — escalate any of them to block in project-config.md if wanted');

// tier toggles — the core's per-tier defaults, each disclosed.
const TOGGLE_WHY = {
  retro_depth: { brief: 'one-paragraph retrospectives — enough to remember why, no ceremony', two_axis: 'each stage closes with a process + product retrospective, so drift is caught at the boundary it entered' },
  ledger: { none: 'no append-only ledger; CHANGELOG.md carries the audit trail', append_only_advisory: 'append-only ledgers are generated and written, honor-system; declaring any risk trigger arms CI enforcement of them', append_only_enforced: 'a declared risk trigger armed CI enforcement: any PR that mutates a prior ledger line fails' },
  read_first_cap: { small: 'a small session-start reading list keeps orientation cheap', medium: 'a medium session-start reading list: the working docs an agent needs, capped so context stays affordable' },
  red_review: { off: 'no structural red-gate: tests-first stays discipline, not enforcement', on: 'the PROC-001 red-gate: implementation edits are blocked until a human approves the failing tests' },
  off_track_check: { brief: 'a brief are-we-building-the-right-thing check at close', advisory: 'the G8 priority-drift check runs per stage against the ranked backlog, advisory' },
  app_map: { skip: 'no app-map: the deliverable class has no drivable surface to map', on: 'docs/app-map.md records every shipped surface and exactly how to drive and test it, bound to test-ids' },
  verifier_mode: { pass_1_only: 'the Verifier runs the inventory pass only — the honest Lite floor', pass_2_4: 'the fresh-context Verifier runs hooks + behavior + security + code-quality between work stages and closeout' },
  refactor_mode: { skip: 'no trigger-based refactor stage at Lite', trigger_n5: 'Stage R (the refactor health check) arms after 5 accumulated tech-debt entries' },
};
for (const [k, v] of Object.entries(tier.toggles)) {
  let value = v;
  if (k === 'app_map' && v === 'on' && (deliverable === 'library' || deliverable === 'api')) {
    value = 'skip';
    put(k, value, 'a ' + deliverable + ' has no drivable surface, so the app-map is skipped (opt back in via project-config.md)');
    continue;
  }
  if (k === 'ledger' && triggers.length > 0 && armedModuleFor(tierName)) value = armedLedgerValue();
  put(k, value, (TOGGLE_WHY[k] && TOGGLE_WHY[k][value]) || ('the ' + tierName + ' default from calibration-core.json'));
}
function armedModuleFor(tn) {
  for (const cfg of Object.values(core.risk_armed_modules)) if (cfg.tier_scope.includes(tn)) return cfg;
  return null;
}
function armedLedgerValue() {
  for (const cfg of Object.values(core.risk_armed_modules)) if (cfg.toggle_when_armed && cfg.toggle_when_armed.ledger) return cfg.toggle_when_armed.ledger;
  return 'append_only_enforced';
}

// the formerly-expertise defaults (KF-07 cut) — one set for everyone, disclosed once.
for (const [k, v] of Object.entries(core.defaults)) {
  if (k.startsWith('_')) continue;
  put(k, v, 'the standing default (the expertise ask is retired; override in project-config.md)');
}

// ── the scaffold file list — rows.json filtered by this calibration ──────────────────────
if (locus === 'cloud') die('file-list derivation for verification_locus=cloud is not built (the row registry encodes hybrid/local_first rows; cloud swaps in ci.yml per the SCAFFOLD-TABLES locus note) — refusing to emit a wrong list');
const appMapOn = derived.app_map.value === 'on';
const files = rows.filter((r) => {
  if (!Array.isArray(r.tiers) || !r.tiers.includes(tier.row_token)) return false;
  if (r.deliverable && r.deliverable !== deliverable) return false;
  if (Array.isArray(r.locus) && !r.locus.includes(locus)) return false;
  if (r.app_map && !appMapOn) return false;
  if (r.risk_armed) {
    const cfg = core.risk_armed_modules[r.file];
    const scoped = cfg && cfg.tier_scope.includes(tierName);
    if (!(scoped && triggers.length > 0)) return false;
  }
  return true;
}).map((r) => r.file);

// ── the confirmation turn (every derived value, plain English, with its why) ─────────────
const confirmation = [];
for (const [k, dv] of Object.entries(derived)) confirmation.push({ key: k, value: dv.value, why: dv.why });
confirmation.push({
  key: 'scaffold_count', value: files.length,
  why: 'the number of files this calibration generates (derived from the row registry — see the itemized list any time with `details`)',
});
if (triggers.length > 0) {
  const cfg = armedModuleFor(tierName);
  confirmation.push({
    key: 'risk_triggers', value: triggers.join(', '),
    why: cfg
      ? 'declared risk arms CI enforcement of the append-only ledgers (.github/workflows/append-only-ledger.yml generates) and raises verification depth on the declared surfaces — each trigger needs its visible escalation record in docs/gates.md (G11)'
      : 'trigger recorded; the ledger workflow arms at Full only (Lite generates no append-only ledgers for it to police) — the Lite escalation stays the visible G11 record in docs/gates.md, which raises verification depth on the declared surfaces above the tier floor',
  });
} else {
  confirmation.push({
    key: 'risk_triggers', value: '[]',
    why: 'no declared risk surfaces — "none" is fine and common; the point of asking is that a high-risk surface is never left at the tier floor by omission',
  });
}

const out = { operating_mode: mode, tier: tierName, risk_triggers: triggers, derived, files, confirmation, test_lanes: laneRow };

if (asJson) { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); process.exit(0); }
// human-readable: the confirmation turn as the agent would speak it
const L = ['calibration-derive — ' + tierName + ' / ' + mode + (triggers.length ? ' / risk: ' + triggers.join(',') : '')];
for (const c of confirmation) L.push('  · ' + c.key + ' = ' + c.value + ' — ' + c.why);
L.push('  files: ' + files.length + ' (derived from rows.json)');
process.stdout.write(L.join('\n') + '\n');
process.exit(0);
