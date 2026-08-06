#!/usr/bin/env node
// @kit-version 1.0.4
// scripts/build-receipts.cjs
//
// The build-receipts CLI — diagnostics (M20.6.A) + collectors (M20.6.C) + the
// deterministic renderer and release preflight (M20.6.D).
//
// Usage:
//   node scripts/build-receipts.cjs validate [dir]     # per-ledger event counts
//   node scripts/build-receipts.cjs coverage [dir]     # merged coverage notes
//   node scripts/build-receipts.cjs collect [range]    # collector record counts by class
//   node scripts/build-receipts.cjs arc [range]        # the arc dry-run: classified summary + coverage
//   node scripts/build-receipts.cjs render [range] [--out dir] [--name base] [--ledger dir]...
//                                                      # normalized JSON + HTML + sanitized MD below reports/
//                                                      # --ledger (repeatable, M22.F/UAT #27): merge event
//                                                      # ledgers from EVERY supplied dir (one per worktree)
//                                                      # into ONE all-roles report; roles never observed in
//                                                      # any supplied ledger are NAMED, never omitted
//   node scripts/build-receipts.cjs --check            # the release preflight: collect + render twice,
//                                                      # byte-compare, statements valid, coverage stated
//   node scripts/build-receipts.cjs log-tokens [--input N] [--output N] [--cache-read N]
//        [--cache-write N] [--source platform-reported|derived|human-logged] [--note "…"]
//        [--role R] [--phase M##.X]                    # append a DECLARED-basis token declaration
//                                                      # (M26.F, Workstream 5): numbers need a source
//                                                      # tag; an all-null declaration needs its note
//
// [dir] defaults to .claude/receipts under the cwd. An ABSENT dir is GREEN
// with an explicit note — report-unavailable over invented (a fresh clone or
// CI checkout has no event ledgers, and that is a stated coverage state, not
// an error). [range] defaults to HEAD (collectors read committed history).
//
// THE RENDER CONTRACT (M20.6.D, per the red-approved packet):
//   * Normalized JSON is INPUTS-ONLY: no generation timestamps, no machine
//     identity, no locale formatting. Identical inputs → byte-identical bytes
//     (the determinism gate runs twice and byte-compares). Record order is the
//     model's OWN deterministic sort — input enumeration is not a hidden input.
//   * EXACTLY the 13 sections, in SECTIONS order: identity, coverage, timeline,
//     roles, gates, decisions, bau, worked, broke, shipped, assurance,
//     limitations, provenance.
//   * The HTML report is a DOCUMENT, not an app: ZERO script tags (structural
//     impossibility beats mitigation), a strict CSP meta as the harmless belt,
//     no external assets (no src=, no <link>, only #-anchor hrefs — it opens
//     from file:// and can fetch nothing). EVERY repository-derived string is
//     escaped; every substantive claim links its receipt id; unknown and
//     incomplete states render VISIBLY; frozen history is labeled.
//   * The Markdown export is sanitized under the DEFINED SANITIZER_RULES
//     (absolute paths, emails, home-dir usernames stripped; repo-relative
//     paths preserved) — "sanitized" is a contract, not an adjective.
//   * Reports write ONLY below the out dir (sandbox.assertInside), validate-
//     all-then-write, temp+rename — an interrupted generation leaves the prior
//     report intact; bounded record count + render size.
//
// HONEST LOCUS: this file renders DERIVED VIEWS. It never modifies source
// artifacts, never registers hooks (generation is explicit local invocation
// only), and never re-decides C's classification.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const receipts = require('./lib/receipts.cjs');
const collect = require('./lib/receipts-collect.cjs');
const sandbox = require('./lib/sandbox.cjs');

// ---------------------------------------------------------------------------
// The normalized model — 13 sections, inputs-only, deterministic.
// ---------------------------------------------------------------------------

const SECTIONS = Object.freeze([
  'identity', 'coverage', 'timeline', 'roles', 'gates', 'decisions',
  'bau', 'worked', 'broke', 'shipped', 'assurance', 'limitations', 'provenance',
]);

// Resource bounds: a render over an unbounded record set or into an unbounded
// file is refused BY NAME, never attempted.
const MAX_RENDER_RECORDS = 20000;
const MAX_REPORT_BYTES = 8 * 1024 * 1024;

// M22.F (#27): the canonical session roles with NO observed turns, sorted. A
// missing role is NAMED, never omitted — "unknown is never zero", applied to
// roles: the #20-instructed two-terminal topology splits the event ledger
// per-worktree, and a silently absent role made a partial render read as the
// whole run. ('unknown' and the derived roles are event-fed only — they appear
// when observed, and their absence is not a coverage gap.)
function neverObservedRoles(perRole) {
  return receipts.SESSION_ROLES.filter((r) => r !== 'unknown' && !(perRole && (r in perRole))).sort();
}

// M22.H (V-1): the release-origin derivation — the report-side CONSUMER of
// G.3.4's vocabulary (release_line_observed + the bounded release field on
// tool_started; consumed as-is, never extended). Pure over the merged events:
// walk them in their deterministic merged order, tracking per session whether
// a RED-RELEASE line-marker has been observed; each hook-observed release
// becomes one row whose state is that same-session correlation:
//   line-observed — a prior line-marker in the same session (the
//                   ruling-5-sanctioned in-session path);
//   self-release  — no prior marker: the tell. An OBSERVATION, not an
//                   accusation — the ledger supports no stronger claim.
// Zero hook-observed releases → a STATED reading, never an omitted row
// (unknown is never zero), distinguishing the two sub-cases: script release
// events present = consistent with the human's own outside shell (the
// always-sanctioned path); none at all = no release events observed.
function deriveReleaseOrigin(events) {
  const evs = Array.isArray(events) ? events : [];
  const releases = [];
  const lineSeen = Object.create(null);
  let scriptReleases = 0;
  for (const e of evs) {
    if (!e || typeof e !== 'object') continue;
    const session = (typeof e.session === 'string' && e.session) ? e.session : 'unattributed';
    if (e.event === 'release_line_observed') { lineSeen[session] = true; continue; }
    if (e.event === 'red_approved' || e.event === 'stage_cleared') { scriptReleases += 1; continue; }
    if (e.event === 'tool_started' && receipts.RELEASES.indexOf(e.release) !== -1) {
      releases.push({
        at: typeof e.at === 'string' ? e.at : '',
        session: session,
        release: e.release,
        state: lineSeen[session] ? 'line-observed' : 'self-release',
      });
    }
  }
  if (releases.length > 0) return { releases: releases };
  const reading = scriptReleases > 0
    ? 'no hook-observed release in this window; release action(s) observed only as script events (' + scriptReleases + ') - consistent with the human\'s own outside shell (the always-sanctioned path)'
    : 'no release events observed in the ledger window - nothing to classify (absence stated, never omitted)';
  return { releases: releases, reading: reading };
}

function claimText(rec) {
  try {
    const c = rec.receipt && rec.receipt.predicate && rec.receipt.predicate.claims;
    if (Array.isArray(c) && c.length && typeof c[0].text === 'string') return c[0].text;
  } catch (_) { /* fall through */ }
  return String(rec.evidence || '');
}

// normalize({ identity, records, events, coverage }) → the 13-section model.
// records = C collector records; events = A merged events; coverage = caller
// notes (arc coverage + merge notes). Pure: reads inputs, invents nothing.
function normalize(input) {
  input = input || {};
  const identityIn = input.identity || {};
  const records = Array.isArray(input.records) ? input.records : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const callerCoverage = Array.isArray(input.coverage) ? input.coverage : [];

  if (records.length > MAX_RENDER_RECORDS) {
    throw new Error('normalize refused: ' + records.length + ' records exceeds the MAX_RENDER_RECORDS bound (' + MAX_RENDER_RECORDS + ')');
  }

  // Deterministic record order → stable receipt ids (rcpt-N), independent of
  // input enumeration (proven by the reversed-enumeration byte-compare lock).
  const keyed = records.map((rec) => {
    let rk = '';
    try { rk = receipts.canonicalJson(rec.receipt || null); } catch (_) { rk = ''; }
    return { rec: rec, key: [rec.kind || '', rec.source || '', String(rec.evidence || ''), rk].join('\x1f') };
  });
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  keyed.forEach((k, i) => { k.id = 'rcpt-' + (i + 1); });

  const intervals = receipts.computeIntervals(events);

  // identity — caller-supplied inputs only.
  const identity = {};
  if (typeof identityIn.name === 'string') identity.name = identityIn.name;
  if (typeof identityIn.range === 'string') identity.range = identityIn.range;
  if (identityIn.commit) identity.commit = String(identityIn.commit);
  identity.dirty = identityIn.dirty === true;
  // operating mode — a caller-supplied fact about the run (like range), read by
  // the cover's tile-set selector. Absent -> the cover renders the base set.
  // The CLI path (buildModel) derives it from the project's DECLARED
  // operating_mode in project-config.md via readOperatingMode — read, never
  // guessed; a repo with no declaration stays modeless here.
  if (typeof identityIn.mode === 'string' && identityIn.mode) identity.mode = identityIn.mode;

  // coverage — the honesty header: caller notes + interval honesty notes +
  // the id-less tool disclosure (durations unavailable, never invented).
  const coverage = callerCoverage.slice();
  for (const n of intervals.notes) coverage.push(n);
  const idless = events.filter((e) => (e.event === 'tool_started' || e.event === 'tool_completed' || e.event === 'tool_failed') && !('tool_use_id' in e)).length;
  if (idless > 0) {
    coverage.push(idless + ' tool event(s) without ids (tool_use_id absent from the payload) — tool durations unavailable for them, never invented');
  }

  // timeline — turns + sessions + tools (event-fed) and dated records
  // (collector-fed), under a total sort with every tie broken.
  const timeline = [];
  for (const t of intervals.turns) {
    timeline.push({ at: t.start_at, kind: 'turn', session: t.session, role: t.role, status: t.status, until: t.end_at, ms: t.ms });
  }
  for (const e of events) {
    if (e.event === 'session_started') timeline.push({ at: e.at, kind: 'session', session: ('session' in e) ? e.session : 'unattributed' });
    if (e.event === 'tool_started') timeline.push({ at: e.at, kind: 'tool', session: ('session' in e) ? e.session : 'unattributed', category: e.tool_category || 'other' });
  }
  for (const k of keyed) {
    if (k.rec.kind === 'milestone' && k.rec.date) timeline.push({ at: k.rec.date, kind: 'milestone', id: k.id, text: k.rec.milestone + (k.rec.title ? ' — ' + k.rec.title : '') });
    if (k.rec.kind === 'release-transition' && k.rec.date) timeline.push({ at: k.rec.date, kind: 'release', id: k.id, text: 'reached ' + k.rec.state });
  }
  timeline.sort((a, b) => {
    const ka = [a.at || '', a.kind || '', a.session || '', a.text || '', a.id || ''].join('\x1f');
    const kb = [b.at || '', b.kind || '', b.session || '', b.text || '', b.id || ''].join('\x1f');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // roles — per-role sums straight from the interval arithmetic; unknown stays
  // null (never zero), tool time disclosed as included.
  const per_role = {};
  for (const role of Object.keys(intervals.perRole).sort()) per_role[role] = intervals.perRole[role];
  const roles = { per_role: per_role, totals: intervals.totals };
  // M22.F (#27): name every canonical role never observed in the merged ledgers
  // in the coverage section — the honesty header — so a single-ledger render of
  // a two-worktree run can never read as complete.
  const unobserved = neverObservedRoles(per_role);
  if (unobserved.length > 0) {
    coverage.push('role(s) never observed in the merged event ledgers: ' + unobserved.join(', ') + ' — named, never omitted (unknown is never zero, applied to roles)');
  }

  // gates — the demonstrated controls + the verifier-finding count + the
  // derived release-origin surface (M22.H/V-1; nested here per the gate-1
  // ruling so the frozen 13-section top level stays untouched).
  const controls = [];
  let verifierFindings = 0;
  for (const k of keyed) {
    if (k.rec.kind === 'control') controls.push({ id: k.id, stage: k.rec.stage || null, control: k.rec.control || null, text: claimText(k.rec) });
    if (k.rec.kind === 'verifier-finding') verifierFindings += 1;
  }
  const gates = { controls: controls, verifier_findings: verifierFindings, release_origin: deriveReleaseOrigin(events) };

  // decisions — the human verdicts (binary stamps, CHANGELOG verdicts): read,
  // never invented.
  const decisions = [];
  for (const k of keyed) {
    if (k.rec.kind === 'stage-rework' && k.rec.stamp) {
      decisions.push({ id: k.id, stage: k.rec.stage || null, verdict: k.rec.stamp.verdict != null ? k.rec.stamp.verdict : ('score ' + k.rec.stamp.score) });
    }
    if (k.rec.kind === 'milestone' && k.rec.verdict) {
      decisions.push({ id: k.id, milestone: k.rec.milestone, verdict: k.rec.verdict });
    }
  }

  // The Workstream-5 budget surface (M26.F) — nested under the frozen
  // 13-section model as roles.budget (the M22.H nesting precedent: no 14th
  // section). Answers "where did the build spend its budget" by role and
  // phase; every unknown stays null with its why, never zero.
  const budget = {};
  // by_role — the same interval arithmetic the roles table renders (one source).
  budget.by_role = {};
  for (const role of Object.keys(intervals.perRole).sort()) {
    const r = intervals.perRole[role];
    budget.by_role[role] = { ms: r.ms, complete_turns: r.complete_turns, incomplete_turns: r.incomplete_turns };
  }
  // by_phase — turns attribute to the stage their turn_started was stamped with
  // (the M26.F lifecycle-hook emitter). Pre-stamp/frozen history lands in the
  // 'unknown' bucket: phase-unknown is a stated bucket, never a dropped turn.
  {
    const acc = {};
    for (const t of intervals.turns) {
      const ph = (typeof t.stage === 'string' && t.stage) ? t.stage : 'unknown';
      if (!acc[ph]) acc[ph] = { ms: null, complete_turns: 0, incomplete_turns: 0 };
      if (t.status === 'complete' && t.ms !== null) {
        acc[ph].ms = (acc[ph].ms === null ? 0 : acc[ph].ms) + t.ms;
        acc[ph].complete_turns += 1;
      } else {
        acc[ph].incomplete_turns += 1;
      }
    }
    budget.by_phase = {};
    for (const ph of Object.keys(acc).sort()) budget.by_phase[ph] = acc[ph];
  }
  // tokens — DECLARED basis only (.claude/receipts/tokens-*.jsonl, validated by
  // the contract's validateTokenDeclaration; read by buildModel). No declarations
  // → honest null with its note. Never derived from prompts, never zeroed.
  budget.tokens = (input.tokens && typeof input.tokens === 'object') ? input.tokens : {
    input: null, output: null, cache_read: null, cache_write: null,
    by_source: {}, declarations: 0,
    note: 'no token declarations present (.claude/receipts/tokens-*.jsonl) — token spend unknown (honest null, never zero)',
  };
  // interventions — human touchpoints the record actually observed: permission
  // asks (hook), release actions (hook-observed + script events), recorded human
  // verdicts (stamps/CHANGELOG). Event counts are null when no events were
  // captured at all (a count over an uninstrumented window would be a fake zero).
  {
    let permission = 0; let hookReleases = 0; let scriptReleases = 0;
    for (const e of events) {
      if (e.event === 'permission_requested') permission += 1;
      if (e.event === 'tool_started' && 'release' in e) hookReleases += 1;
      if (e.event === 'red_approved' || e.event === 'stage_cleared') scriptReleases += 1;
    }
    budget.interventions = (events.length === 0)
      ? { permission_requests: null, hook_observed_releases: null, script_release_events: null, human_verdicts: decisions.length, note: 'no instrumented events in this window — event-derived intervention counts unknown (never zero); human_verdicts is collector-derived' }
      : { permission_requests: permission, hook_observed_releases: hookReleases, script_release_events: scriptReleases, human_verdicts: decisions.length };
  }
  // rework_by_origin — framework-originated vs project-originated rework,
  // aggregated over every retro's declared origin split (C's reworkOriginSplit;
  // null-never-zero, over-attribution refused with a coverage note).
  {
    let anyDeclared = false; let fSum = 0; let pSum = 0; let uSum = 0; let retros = 0;
    for (const k of keyed) {
      if (k.rec.kind !== 'stage-rework' || !k.rec.rework) continue;
      const s = collect.reworkOriginSplit(k.rec.rework);
      if (!s) continue;
      if (s.invalid) {
        coverage.push('rework origin split refused for ' + (k.rec.stage || k.rec.source) + ': ' + s.reason + ' (excluded from the attribution totals, stated here)');
        continue;
      }
      retros += 1;
      if (s.framework !== null || s.project !== null) {
        anyDeclared = true;
        fSum += s.framework || 0;
        pSum += s.project || 0;
      }
      uSum += s.unattributed || 0;
    }
    budget.rework_by_origin = anyDeclared
      ? { framework: fSum, project: pSum, unattributed: uSum, retros_counted: retros }
      : { framework: null, project: null, unattributed: uSum, retros_counted: retros, note: 'no retro declares an origin-framework/origin-project split — attribution unknown (null, never zero)' };
  }
  roles.budget = budget;

  // The four headline sections — classified VIEWS of the records (C's
  // classification consumed, never re-decided). unclassified is not forced
  // anywhere: it stays out of the headline and is counted in assurance.
  const heads = { bau: [], worked: [], broke: [], shipped: [] };
  let unclassified = 0;
  for (const k of keyed) {
    const c = collect.classify(k.rec);
    if (heads[c]) {
      heads[c].push({ id: k.id, kind: k.rec.kind, text: claimText(k.rec), source: k.rec.source || '', evidence: String(k.rec.evidence || '') });
    } else {
      unclassified += 1;
    }
  }

  // assurance — every record must feed A's statement builder; the FNR is read
  // from the CHANGELOG records, never recomputed.
  let valid = 0;
  const fnr = [];
  for (const k of keyed) {
    try { receipts.buildStatement(k.rec.receipt); valid += 1; } catch (_) { /* an invalid receipt is visible as records != valid_statements */ }
    if (k.rec.kind === 'milestone' && k.rec.fnr) fnr.push({ milestone: k.rec.milestone, num: k.rec.fnr.num, den: k.rec.fnr.den });
  }
  const assurance = { records: keyed.length, valid_statements: valid, unclassified: unclassified, fnr: fnr };

  // limitations — the distinct limitation strings off the receipts, deduped +
  // sorted (every receipt carries one; the builder refuses otherwise).
  const limSet = new Set();
  for (const k of keyed) {
    const lim = k.rec.receipt && k.rec.receipt.predicate && k.rec.receipt.predicate.limitation;
    if (typeof lim === 'string' && lim) limSet.add(lim);
  }
  const limitations = Array.from(limSet).sort();

  // provenance — one entry per distinct source: commit|dirty state, collector
  // version, claim basis.
  const provMap = new Map();
  for (const k of keyed) {
    const p = k.rec.receipt && k.rec.receipt.predicate && k.rec.receipt.predicate.provenance;
    if (!p || typeof p.source !== 'string' || provMap.has(p.source)) continue;
    const entry = { source: p.source, collector_version: p.collector_version, basis: p.basis };
    if (p.commit) entry.commit = p.commit; else if (p.dirty) entry.dirty = true;
    provMap.set(p.source, entry);
  }
  const provenance = Array.from(provMap.keys()).sort().map((s) => provMap.get(s));

  const model = {
    identity: identity,
    coverage: coverage,
    timeline: timeline,
    roles: roles,
    gates: gates,
    decisions: decisions,
    bau: heads.bau,
    worked: heads.worked,
    broke: heads.broke,
    shipped: heads.shipped,
    assurance: assurance,
    limitations: limitations,
    provenance: provenance,
  };
  return model; // inputs-only: no generation timestamp, no machine identity (the determinism contract)
}

// ---------------------------------------------------------------------------
// The HTML renderer — a document: zero script tags, self-contained, escaped.
// ---------------------------------------------------------------------------

// EVERY repository-derived string routes through esc() before it touches the
// markup. Removing a rule here is the mut1 the hostile-render lock kills.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// KF-42 (M26.F): durations HUMANIZE in every human-facing surface — "1105725 ms"
// tells a reader nothing; "18m 25.7s" does. Unknown stays the word 'unknown'
// (never zero, never invented). Pure and deterministic (no locale formatting).
function fmtMs(v) {
  if (v === null || v === undefined) return 'unknown';
  if (v < 1000) return v + ' ms';
  if (v < 60000) return (v / 1000).toFixed(1) + 's';
  if (v < 3600000) {
    const m = Math.floor(v / 60000);
    return m + 'm ' + ((v - m * 60000) / 1000).toFixed(1) + 's';
  }
  let h = Math.floor(v / 3600000);
  let m = Math.round((v - h * 3600000) / 60000);
  if (m === 60) { h += 1; m = 0; }
  return h + 'h ' + m + 'm';
}

// ---------------------------------------------------------------------------
// The derived receipt cover (M20.7.A) — a mode-adaptive summary dashboard,
// 100% DERIVED from the 13-section model. Verdict header + stat tiles + the
// build loop + a Coverage & Limitations block in the verification vocabulary.
// PURE: no timestamp, no locale, no random — reads the model, invents nothing;
// a tile with no backing path renders UNKNOWN, never a fabricated figure.
// ---------------------------------------------------------------------------

const COVER_UNKNOWN = 'UNKNOWN';

// The verification vocabulary — a CLOSED map. verificationLabel() throws on any
// eighth label, so the Coverage block and the status dots can only speak these.
const VERIFICATION_LABELS = Object.freeze({
  PASS: 'the check ran and succeeded',
  FAIL: 'the check ran and failed',
  FIXED: 'a finding was caught and corrected',
  SKIPPED: 'deliberately not run',
  NOT_RUN: 'not executed in this run',
  UNKNOWN: 'not observed - never inferred',
  BLOCKED: 'could not run (a precondition failed)',
});
const VOCAB_DISPLAY = Object.freeze({
  PASS: 'PASS', FAIL: 'FAIL', FIXED: 'FIXED', SKIPPED: 'SKIPPED',
  NOT_RUN: 'NOT RUN', UNKNOWN: 'UNKNOWN', BLOCKED: 'BLOCKED',
});
function verificationLabel(name) {
  if (!Object.prototype.hasOwnProperty.call(VERIFICATION_LABELS, name)) {
    throw new Error('unknown verification label: ' + name +
      ' (the vocabulary is closed to PASS/FAIL/FIXED/SKIPPED/NOT_RUN/UNKNOWN/BLOCKED)');
  }
  return VERIFICATION_LABELS[name];
}

// One template, mode-adaptive: the tile KEYS per mode (<= 7, most-important
// first). A mode not in this map falls back to the base set + mode UNKNOWN.
const COVER_TILE_SETS = Object.freeze({
  bug_fix: Object.freeze(['outcome', 'checks', 'caught_fixed', 'changed', 'coverage', 'unknowns']),
  audit: Object.freeze(['verdict', 'dimensions', 'findings_by_severity', 'passes', 'coverage', 'unknowns']),
  greenfield: Object.freeze(['verdict', 'checks', 'caught_fixed', 'stages_shipped', 'coverage', 'unknowns']),
  research_publish: Object.freeze(['verdict', 'sources', 'claims_bound', 'contradictions', 'coverage', 'unknowns']),
});
const COVER_BASE_TILES = Object.freeze(['verdict', 'coverage', 'unknowns']);

function coverNum(x) { return (typeof x === 'number' && isFinite(x)) ? x : null; }
function coverNum0(x) { const n = coverNum(x); return n === null ? 0 : n; }

function coverMode(model) {
  const m = model.identity && model.identity.mode;
  return (typeof m === 'string' && COVER_TILE_SETS[m]) ? m : 'unknown';
}

// The verdict is READ, never invented. greenfield/audit/research -> the last
// milestone verdict in decisions[]; bug_fix -> a 'Fixed' outcome only when a
// verdict was actually recorded; absent -> UNKNOWN (neutral).
function verdictTone(label, mode) {
  const s = String(label).toLowerCase();
  if (/^sound/.test(s)) return 'good';                        // "sound" AND "sound with fixes" -> green
  if (mode === 'bug_fix' && /fixed|pass/.test(s)) return 'good';
  if (/fail|blocked/.test(s)) return 'crit';
  return 'warn';                                              // a non-sound verdict is an amber caveat
}
function titleCaseVerdict(s) {
  const t = String(s);
  return t.length ? (t.charAt(0).toUpperCase() + t.slice(1)) : t;
}
function coverVerdict(model) {
  const mode = coverMode(model);
  const decisions = Array.isArray(model.decisions) ? model.decisions : [];
  if (mode === 'bug_fix') {
    const fixed = decisions.some((d) => d && d.verdict);   // a fix outcome only when a verdict exists
    return fixed ? { label: 'Fixed', tone: 'good' } : { label: COVER_UNKNOWN, tone: 'unknown' };
  }
  let label = null;
  for (const d of decisions) { if (d && d.milestone && d.verdict) label = d.verdict; } // last milestone wins
  if (label === null) { for (const d of decisions) { if (d && d.verdict) label = d.verdict; } }
  if (label === null) return { label: COVER_UNKNOWN, tone: 'unknown' };
  return { label: titleCaseVerdict(label), tone: verdictTone(label, mode) };
}

function coverUnknownTile(key, label, note) {
  return { key: key, label: label, value: COVER_UNKNOWN, status: 'unknown', note: note };
}
function coverControlsTile(gates) {
  // Label<->source agreement (owner ratified): gates.controls.length is a count
  // of DEMONSTRATED CONTROLS, not a check tally — so the word is "Controls".
  const controls = (gates && Array.isArray(gates.controls)) ? gates.controls : null;
  return {
    key: 'checks', label: 'Controls',
    value: (controls === null ? COVER_UNKNOWN : String(controls.length)),
    status: (controls && controls.length > 0) ? 'good' : 'unknown',
    note: 'demonstrated controls',
  };
}
function coverTile(key, model, verdict) {
  const g = model.gates || {};
  const asr = model.assurance || {};
  switch (key) {
    case 'verdict':
      return { key: key, label: 'Verdict', value: verdict.label, status: verdict.tone, note: 'human verdict' };
    case 'outcome':
      return { key: key, label: 'Outcome', value: verdict.label, status: verdict.tone, note: 'fix outcome' };
    case 'caught_fixed': {
      const vf = coverNum(g.verifier_findings);
      return {
        key: key, label: 'Caught & fixed',
        value: (vf === null ? COVER_UNKNOWN : String(model.gates.verifier_findings)),
        status: (vf && vf > 0) ? 'good' : 'unknown', note: 'verifier findings',
      };
    }
    case 'checks':
      return coverControlsTile(g);
    case 'stages_shipped': {
      const shipped = Array.isArray(model.shipped) ? model.shipped : [];
      const n = shipped.filter((s) => s && (s.kind === 'milestone-complete' || s.kind === 'release-transition' || s.kind === 'milestone')).length;
      return { key: key, label: 'Stages shipped', value: String(n), status: n > 0 ? 'good' : 'unknown', note: 'milestone / release' };
    }
    case 'coverage': {
      const recs = coverNum0(asr.records);
      const valid = coverNum0(asr.valid_statements);
      const value = (recs > 0) ? (valid + '/' + recs) : COVER_UNKNOWN;
      const status = (value === COVER_UNKNOWN) ? 'unknown' : (valid === recs ? 'good' : 'warn');
      return { key: key, label: 'Coverage', value: value, status: status, note: 'statements bound' };
    }
    case 'unknowns': {
      const t = (model.roles && model.roles.totals) || {};
      const perRole = (model.roles && model.roles.per_role) || {};
      let nullRoles = 0;
      for (const r of Object.keys(perRole)) { if (perRole[r] && perRole[r].ms === null) nullRoles++; }
      const n = coverNum0(t.incomplete_turns) + coverNum0(t.unmatched_stops) + coverNum0(asr.unclassified) + nullRoles;
      return { key: key, label: 'Unknowns', value: String(n), status: n > 0 ? 'warn' : 'good', note: 'shown, not zeroed' };
    }
    // No-backing tiles (owner ratified: no new collectors in A) -> UNKNOWN.
    case 'changed': return coverUnknownTile(key, 'Changed', 'no file-level data (privacy floor)');
    case 'dimensions': return coverUnknownTile(key, 'Dimensions', 'not in the model');
    case 'passes': return coverUnknownTile(key, 'Passes', 'not in the model');
    case 'findings_by_severity': return coverUnknownTile(key, 'Findings by severity', 'severity not structured');
    case 'sources': return coverUnknownTile(key, 'Sources', 'not in the model');
    case 'claims_bound': return coverUnknownTile(key, 'Claims bound', 'not in the model');
    case 'contradictions': return coverUnknownTile(key, 'Contradictions', 'not in the model');
    default: return coverUnknownTile(key, key, 'no model path');
  }
}

function coverLoop(model) {
  const g = model.gates || {};
  const controls = Array.isArray(g.controls) ? g.controls : [];
  const findings = coverNum0(g.verifier_findings);
  const shipped = Array.isArray(model.shipped) ? model.shipped : [];
  const broke = Array.isArray(model.broke) ? model.broke : [];
  const decisions = Array.isArray(model.decisions) ? model.decisions : [];
  return [
    { step: 'spec', on: true },
    { step: 'red-first', on: controls.length > 0 },
    { step: 'build', on: shipped.length > 0 },
    { step: 'fresh verifier', on: findings > 0 || decisions.length > 0 },
    { step: 'fix loop', on: broke.length > 0 || findings > 0 },
    { step: 'receipt', on: true },
  ];
}

// Classify a free-text coverage note into the CLOSED vocabulary (defaulting to
// UNKNOWN = not-observed). Only vocab labels ever reach the rendered table.
function classifyCoverageNote(note) {
  const s = String(note).toLowerCase();
  if (/\bnot run\b|did not run|executed .* only|ran .* only/.test(s)) return 'NOT_RUN';
  if (/\bskip/.test(s)) return 'SKIPPED';
  if (/\bblock/.test(s)) return 'BLOCKED';
  return 'UNKNOWN';
}
function coverageRows(model) {
  const notes = Array.isArray(model.coverage) ? model.coverage : [];
  return notes.map((note) => ({ label: VOCAB_DISPLAY[classifyCoverageNote(note)], text: String(note) }));
}

function coverHeadline(model, mode, verdict) {
  const asr = model.assurance || {};
  const recs = coverNum(asr.records);
  const vf = coverNum(model.gates && model.gates.verifier_findings);
  const head = (verdict.label === COVER_UNKNOWN) ? 'Build receipt' : verdict.label;
  const tail = [mode];
  if (recs !== null) tail.push(recs + ' records');
  if (vf !== null) tail.push(vf + ' caught & fixed');
  return head + ' - ' + tail.join(', ') + '.';
}
function coverSubline(model) {
  const id = model.identity || {};
  const asr = model.assurance || {};
  const recs = coverNum(asr.records);
  const valid = coverNum(asr.valid_statements);
  const bits = ['range ' + (id.range || 'HEAD')];
  if (recs !== null && valid !== null) bits.push(valid + '/' + recs + ' statements bound');
  bits.push('every figure below is derived from this run; the full evidence record follows');
  return bits.join(' · ');
}

// buildCover(model) — the PURE structured cover (no HTML). Tests assert on this
// shape; renderCover() is the HTML view of exactly this.
function buildCover(model) {
  if (!model || typeof model !== 'object') throw new Error('buildCover refused: not a model');
  const mode = coverMode(model);
  const verdict = coverVerdict(model);
  const keys = COVER_TILE_SETS[mode] || COVER_BASE_TILES;
  const tiles = keys.map((k) => coverTile(k, model, verdict));
  return {
    mode: mode,
    verdict: verdict,
    tiles: tiles,
    loop: coverLoop(model),
    coverage: coverageRows(model),
    headline: coverHeadline(model, mode, verdict),
    subline: coverSubline(model),
  };
}

// The cover's own CSS — flat, grayscale + muted green/blue, mono tabular
// numerals, hairline rules, zero rounding. rc- prefixed so it never collides
// with the dense report's classes; zero-script; no external asset.
const COVER_CSS =
  '.rc{--rc-ink:#15181c;--rc-ink2:#434b55;--rc-ink3:#6d7580;--rc-line:#d4d8de;--rc-line2:#b9c0c8;' +
  '--rc-good:#1a6b3c;--rc-goodbar:#155830;--rc-warn:#8a6100;--rc-crit:#a12318;' +
  '--rc-mono:"SF Mono","Cascadia Mono","DejaVu Sans Mono",Consolas,monospace}\n' +
  '.rc *{box-sizing:border-box;border-radius:0}\n' +
  '.rc-sheet{background:#fff;border:1px solid var(--rc-line2);border-top:3px solid var(--rc-ink);margin:0 0 1.5rem}\n' +
  '.rc-hero{display:grid;grid-template-columns:5px 1fr}\n' +
  '.rc-bar{background:var(--rc-goodbar)}\n' +
  '.rc-bar.warn{background:var(--rc-warn)}.rc-bar.crit{background:var(--rc-crit)}.rc-bar.unknown{background:var(--rc-line2)}\n' +
  '.rc-body{padding:20px 24px}\n' +
  '.rc-eyebrow{font-family:var(--rc-mono);margin:0 0 12px;color:var(--rc-ink3);text-transform:uppercase;letter-spacing:.06em;font-size:11px;font-weight:700}\n' +
  '.rc-vd{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:13px}\n' +
  '.rc-vd .rc-sw{width:11px;height:11px;display:inline-block;border:1px solid rgba(0,0,0,.25)}\n' +
  '.rc-vd.good{color:var(--rc-good)}.rc-vd.good .rc-sw{background:var(--rc-good)}\n' +
  '.rc-vd.warn{color:var(--rc-warn)}.rc-vd.warn .rc-sw{background:var(--rc-warn)}\n' +
  '.rc-vd.crit{color:var(--rc-crit)}.rc-vd.crit .rc-sw{background:var(--rc-crit)}\n' +
  '.rc-vd.unknown{color:var(--rc-ink3)}.rc-vd.unknown .rc-sw{background:var(--rc-line2)}\n' +
  '.rc-mode{font-family:var(--rc-mono);color:var(--rc-ink2);font-weight:600;text-transform:uppercase;font-size:12px;margin-left:12px}\n' +
  '.rc-h1{font-size:22px;line-height:1.2;margin:8px 0 0;font-weight:700;border:0;padding:0}\n' +
  '.rc-sub{font-size:14px;color:var(--rc-ink2);margin:10px 0 0}\n' +
  '.rc-grid{display:grid;border-top:1px solid var(--rc-line)}\n' +
  '.rc-card{padding:14px;border-left:1px solid var(--rc-line);min-height:104px;display:flex;flex-direction:column}\n' +
  '.rc-card:first-child{border-left:0}\n' +
  '.rc-k{font-family:var(--rc-mono);font-size:10.5px;text-transform:uppercase;font-weight:700;color:var(--rc-ink3);letter-spacing:.05em}\n' +
  '.rc-v{font-family:var(--rc-mono);font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1;font-size:26px;font-weight:700;margin:8px 0 auto;color:var(--rc-ink);line-height:1;overflow-wrap:anywhere}\n' +
  '.rc-v.sm{font-size:16px}\n' +
  '.rc-v.unknown{color:var(--rc-warn);font-style:italic;font-size:15px}\n' +
  '.rc-n{font-size:12px;color:var(--rc-ink2);display:flex;align-items:center;gap:6px;margin-top:8px}\n' +
  '.rc-dot{width:9px;height:9px;display:inline-block;border:1px solid rgba(0,0,0,.2);flex:none}\n' +
  '.rc-dot.good{background:var(--rc-good)}.rc-dot.warn{background:var(--rc-warn)}.rc-dot.crit{background:var(--rc-crit)}.rc-dot.unknown{background:var(--rc-line2)}\n' +
  '.rc-loop{display:flex;flex-wrap:wrap;border-top:1px solid var(--rc-line);padding:14px 18px}\n' +
  '.rc-step{font-family:var(--rc-mono);font-size:12px;font-weight:600;padding:5px 11px;border:1px solid var(--rc-line2);color:var(--rc-ink2);margin:2px}\n' +
  '.rc-step.on{background:var(--rc-ink);border-color:var(--rc-ink);color:#fff}\n' +
  '.rc-arw{display:flex;align-items:center;color:var(--rc-ink3);font-family:var(--rc-mono);padding:0 2px}\n' +
  '.rc-cov{border-top:1px solid var(--rc-line);padding:14px 20px 18px}\n' +
  '.rc-cov h2{font-size:13px;margin:0 0 10px;border:0;padding:0}\n' +
  '.rc-tag{font-family:var(--rc-mono);font-size:10px;font-weight:700;text-transform:uppercase;color:var(--rc-ink3);border:1px solid var(--rc-line2);padding:2px 7px;margin-left:8px}\n' +
  '.rc-cov table{width:100%;border-collapse:collapse;font-size:13px;margin:0}\n' +
  '.rc-cov td{padding:8px 10px 8px 0;border-top:1px solid var(--rc-line);color:var(--rc-ink2);vertical-align:top}\n' +
  '.rc-cov tr:first-child td{border-top:0}\n' +
  '.rc-lbl{width:96px;font-family:var(--rc-mono);font-size:11px;font-weight:700;color:var(--rc-ink);white-space:nowrap}\n' +
  '@media(max-width:820px){.rc-grid{grid-template-columns:repeat(2,1fr)}.rc-card{border-top:1px solid var(--rc-line)}.rc-h1{font-size:19px}}\n';

// renderCover(model) — the HTML fragment (prepended inside renderHtml above the
// dense record). EVERY model-sourced string routes through esc().
function renderCover(model) {
  if (!model || typeof model !== 'object') throw new Error('renderCover refused: not a model');
  const cover = buildCover(model);
  const toneClass = (t) => (t === 'good' || t === 'warn' || t === 'crit' || t === 'unknown') ? t : '';
  const out = [];
  const push = (s) => out.push(s);

  push('<section class="rc rc-sheet">\n');
  push('<div class="rc-hero"><div class="rc-bar ' + toneClass(cover.verdict.tone) + '"></div><div class="rc-body">\n');
  push('<p class="rc-eyebrow">Software Build Assurance Kit build receipt - summary</p>\n');
  push('<div><span class="rc-vd ' + toneClass(cover.verdict.tone) + '"><span class="rc-sw"></span> ' + esc(cover.verdict.label) + '</span>');
  push('<span class="rc-mode">' + esc(cover.mode) + '</span></div>\n');
  push('<h1 class="rc-h1">' + esc(cover.headline) + '</h1>\n');
  push('<p class="rc-sub">' + esc(cover.subline) + '</p>\n');
  push('</div></div>\n');

  const n = Math.max(1, Math.min(7, cover.tiles.length));
  push('<div class="rc-grid" style="grid-template-columns:repeat(' + n + ',1fr)">\n');
  for (const t of cover.tiles) {
    const isUnknown = t.value === COVER_UNKNOWN;
    const vClass = isUnknown ? ' unknown' : (String(t.value).length > 6 ? ' sm' : '');
    push('<div class="rc-card"><div class="rc-k">' + esc(t.label) + '</div>');
    push('<div class="rc-v' + vClass + '">' + esc(String(t.value)) + '</div>');
    push('<div class="rc-n"><span class="rc-dot ' + toneClass(t.status) + '"></span> ' + esc(String(t.note || '')) + '</div></div>\n');
  }
  push('</div>\n');

  push('<div class="rc-loop">\n');
  for (let i = 0; i < cover.loop.length; i++) {
    const s = cover.loop[i];
    push('<span class="rc-step' + (s.on ? ' on' : '') + '">' + esc(s.step) + '</span>');
    if (i < cover.loop.length - 1) push('<span class="rc-arw">&#8594;</span>');
  }
  push('\n</div>\n');

  push('<div class="rc-cov"><h2>Coverage &amp; limitations<span class="rc-tag">derived from this run</span></h2>\n');
  if (cover.coverage.length === 0) push('<p class="rc-sub">no coverage notes recorded</p>\n');
  else {
    push('<table>\n');
    for (const row of cover.coverage) push('<tr><td class="rc-lbl">' + esc(row.label) + '</td><td>' + esc(row.text) + '</td></tr>\n');
    push('</table>\n');
  }
  push('</div>\n');
  push('</section>\n');
  return out.join('');
}

function renderHtml(model) {
  if (!model || typeof model !== 'object') throw new Error('renderHtml refused: not a model');
  const out = [];
  const push = (s) => out.push(s);
  const title = esc(model.identity && model.identity.name ? model.identity.name : 'build receipt');

  push('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n');
  // The CSP meta is the harmless BELT on top of the structural zero-script
  // policy (the red ruling): viewers that honor CSP get default-src none;
  // viewers that do not still find no script element to run.
  push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">\n');
  push('<title>' + title + '</title>\n');
  push('<style>\n' +
    'body{font-family:Segoe UI,Helvetica,Arial,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#1a1a1a;background:#fff;line-height:1.45}\n' +
    'h1{border-bottom:2px solid #444;padding-bottom:.3rem}\n' +
    'h2{margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.2rem}\n' +
    'table{border-collapse:collapse;margin:.5rem 0}\n' +
    'td,th{border:1px solid #ccc;padding:.25rem .6rem;text-align:left;vertical-align:top}\n' +
    'ul{margin:.4rem 0 .4rem 1.4rem}\n' +
    '.label{display:inline-block;background:#eee;border:1px solid #ccc;border-radius:.25rem;padding:0 .35rem;font-size:.85em}\n' +
    '.unknown{color:#8a5a00;font-style:italic}\n' +
    '.none{color:#666;font-style:italic}\n' +
    '.tell{color:#a12318;border-left:3px solid #a12318;padding-left:.5rem;font-weight:600}\n' +
    '.receipt{margin:.8rem 0;padding:.4rem .8rem;border-left:3px solid #bbb;background:#fafafa}\n' +
    // M28.L presentation contract (req 5): groups collapse to a summary line via
    // self-contained details/summary — zero-script stays structurally true.
    'details{margin:.5rem 0;border:1px solid #ddd;border-radius:.3rem;padding:.25rem .6rem;background:#fcfcfc}\n' +
    'summary{cursor:pointer;font-weight:600;padding:.15rem 0}\n' +
    'details[open]>summary{border-bottom:1px solid #eee;margin-bottom:.3rem}\n' +
    COVER_CSS +
    '</style>\n</head>\n<body>\n');

  // The derived summary cover sits ATOP the dense record (M20.7.A) — a skim
  // layer over the audit-grade detail, every figure read from this same model.
  push(renderCover(model));

  push('<h1>Build receipt - ' + title + '</h1>\n');
  const ident = model.identity || {};
  push('<p>range <code>' + esc(ident.range || '') + '</code>' +
    (ident.commit ? ' · commit <code>' + esc(ident.commit) + '</code>' : '') +
    (ident.dirty ? ' · <span class="label">working tree DIRTY - uncommitted changes excluded</span>' : '') +
    '</p>\n');

  // Coverage first — the honesty header. Unknown/gap states render VISIBLY.
  push('<h2 id="sec-coverage">Coverage - what was and was not observed</h2>\n');
  const cov = Array.isArray(model.coverage) ? model.coverage : [];
  if (cov.length === 0) push('<p class="none">no coverage notes recorded</p>\n');
  else { push('<ul>\n'); for (const n of cov) push('<li>' + esc(n) + '</li>\n'); push('</ul>\n'); }

  // Roles — unknown durations render as the word, never as zero.
  push('<h2 id="sec-roles">Roles - observed turn time (unknown is never zero)</h2>\n');
  const roles = model.roles || { per_role: {}, totals: {} };
  push('<table>\n<tr><th>role</th><th>observed turn time</th><th>complete turns</th><th>incomplete turns</th><th>avg per complete turn</th></tr>\n');
  for (const role of Object.keys(roles.per_role || {})) {
    const r = roles.per_role[role];
    // M28.L (req 6): the average is arithmetic on the model's own figures — observed
    // time over complete turns; unknown time or zero complete turns stays 'unknown'.
    const avg = (r.ms == null || !r.complete_turns) ? null : r.ms / r.complete_turns;
    push('<tr><td>' + esc(role) + '</td><td' + (r.ms === null ? ' class="unknown"' : '') + '>' + esc(fmtMs(r.ms)) + '</td><td>' +
      esc(String(r.complete_turns)) + '</td><td>' + esc(String(r.incomplete_turns)) + '</td><td' +
      (avg === null ? ' class="unknown"' : '') + '>' + esc(avg === null ? 'unknown' : fmtMs(avg)) + '</td></tr>\n');
  }
  push('</table>\n');
  // M22.F (#27): the timing side of the never-observed naming — the roles table
  // shows what was observed; this line names what was not.
  const rNever = neverObservedRoles(roles.per_role);
  if (rNever.length > 0) {
    push('<p><span class="unknown">never observed</span> in the merged event ledgers: ' + esc(rNever.join(', ')) + ' - named, never omitted.</p>\n');
  }
  const tot = roles.totals || {};
  push('<ul>\n');
  push('<li>observed turn time (all roles): <span' + (tot.observed_turn_ms == null ? ' class="unknown"' : '') + '>' + esc(fmtMs(tot.observed_turn_ms)) + '</span></li>\n');
  push('<li>calendar span (instrumented event window only): <span' + (tot.calendar_span_ms == null ? ' class="unknown"' : '') + '>' + esc(fmtMs(tot.calendar_span_ms)) + '</span></li>\n');
  push('<li>tool time: <span' + (tot.tool_ms == null ? ' class="unknown"' : '') + '>' + esc(fmtMs(tot.tool_ms)) + '</span>' +
    (tot.tool_time_included_in_role_time ? ' <span class="label">included in role time - never added on top</span>' : '') + '</li>\n');
  push('<li>incomplete turns: ' + esc(String(tot.incomplete_turns == null ? 'unknown' : tot.incomplete_turns)) + ' <span class="label">an interrupt is a turn with no stop - incomplete, never synthesized</span></li>\n');
  push('<li>human attention: ' + esc(String(tot.human_attention || 'not measured')) + '</li>\n');
  push('</ul>\n');
  // M28.L (req 6): the included-session scope, answered FROM the model — which roles'
  // sessions are in these counts is what per_role's own keys record, never a guess.
  const rObserved = Object.keys(roles.per_role || {});
  push('<p id="time-scope">Scope of these times: only sessions whose event ledgers were merged into this model are counted - here the ' +
    esc(rObserved.join(' and ')) + ' session ledgers. ' +
    (rNever.length > 0
      ? 'No ' + esc(rNever.join(' or ')) + ' session appears in the merged ledgers, so no time from those roles is included in any figure above - absent, never zero, and stated from the ledgers rather than guessed.'
      : 'Every known role appears in the merged ledgers.') +
    // M28.L round 3 (the traced capture limit; its ledger entry names the fix): a machinery truth, stated so a
    // reader can weigh the role figures — each session writes its own worktree's
    // ledger, and the render only merges what it is given.
    ' One capture limit of the recommended two-CLI worktree topology is recorded on the kit\'s tech-debt ledger: each session\'s events land in its own worktree\'s ledger, and a render that is not given every sibling ledger (the <code>--ledger</code> flag) cannot see that session\'s time - orchestration time in particular can go uncounted.</p>\n');

  // Timeline. M28.L presentation contract: the merged wall of rows becomes grouped
  // collapsibles (req 5) — same rows, same order within each group, nothing dropped.
  push('<h2 id="sec-timeline">Timeline</h2>\n');
  const tl = Array.isArray(model.timeline) ? model.timeline : [];
  if (tl.length === 0) push('<p class="none">no timeline entries (no events, no dated records)</p>\n');
  else {
    const tlRow = (t) => {
      let detail = '';
      if (t.kind === 'turn') detail = (t.status === 'complete' ? 'complete, ' + fmtMs(t.ms) : 'INCOMPLETE - duration unknown (no stop observed)');
      else if (t.kind === 'tool') detail = 'tool: ' + (t.category || 'other');
      else if (t.kind === 'session') detail = 'session started';
      else detail = (t.text || '') + (t.id ? ' [' + t.id + ']' : '');
      return '<tr><td>' + esc(t.at || '') + '</td><td>' + esc(t.kind || '') + '</td><td>' + esc(t.session || t.role || '') + '</td><td>' + esc(detail) + '</td></tr>\n';
    };
    const marks = tl.filter((t) => t.kind === 'milestone' || t.kind === 'release');
    const starts = tl.filter((t) => t.kind === 'session');
    const turns = tl.filter((t) => t.kind === 'turn');
    const tools = tl.filter((t) => t.kind === 'tool');
    // req 7, the never-simulate resolution: entries the ledger recorded WITHOUT a clock
    // time render the date plus this statement — a time that was never recorded is
    // never synthesized. A model whose entries carry datetimes renders them in full.
    const dayOnly = marks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t.at)));
    if (dayOnly.length > 0) {
      push('<p id="timeline-resolution">' + dayOnly.length + ' of the ' + marks.length +
        ' milestone/release entries below are recorded at day resolution in this snapshot - the source ledger recorded a date and no clock time for them, so only the date is shown (a time that was never recorded is never invented). Session, turn, and tool events carry their full recorded timestamps.</p>\n');
    }
    if (marks.length > 0) {
      push('<details open><summary>Milestones &amp; releases - ' + marks.length + ' entries (' +
        esc(String(marks[0].at)) + ' → ' + esc(String(marks[marks.length - 1].at)) + ')</summary>\n' +
        '<table>\n<tr><th>at</th><th>kind</th><th>who</th><th>detail</th></tr>\n' +
        marks.map(tlRow).join('') + '</table>\n</details>\n');
    }
    if (starts.length > 0) {
      push('<details><summary>Sessions - ' + starts.length + ' session starts</summary>\n' +
        '<table>\n<tr><th>at</th><th>kind</th><th>who</th><th>detail</th></tr>\n' +
        starts.map(tlRow).join('') + '</table>\n</details>\n');
    }
    if (turns.length > 0) {
      const nComplete = turns.filter((t) => t.status === 'complete').length;
      push('<details><summary>Turns - ' + turns.length + ' entries (' + nComplete + ' complete, ' +
        (turns.length - nComplete) + ' incomplete)</summary>\n' +
        '<table>\n<tr><th>at</th><th>kind</th><th>who</th><th>detail</th></tr>\n' +
        turns.map(tlRow).join('') + '</table>\n</details>\n');
    }
    // req 8: tool events group per session — summary carries the per-session totals
    // (first observed event → last observed event, span, per-type counts, all
    // arithmetic on the recorded rows), expanding to the per-event view.
    if (tools.length > 0) {
      const bySess = new Map();
      for (const t of tools) { const s = String(t.session || 'unknown'); if (!bySess.has(s)) bySess.set(s, []); bySess.get(s).push(t); }
      push('<h3>Tool events - ' + tools.length + ' events across ' + bySess.size + ' sessions</h3>\n');
      push('<p>Each session collapses to its observed tool span - first recorded event to last - with per-type counts; expand for every event.</p>\n');
      for (const entry of bySess) {
        const sid = entry[0], evs = entry[1];
        const cats = {};
        for (const e of evs) { const c = e.category || 'other'; cats[c] = (cats[c] || 0) + 1; }
        const catStr = Object.keys(cats).sort().map((c) => c + ' ×' + cats[c]).join(', ');
        const spanMs = Date.parse(evs[evs.length - 1].at) - Date.parse(evs[0].at);
        const span = Number.isFinite(spanMs) ? fmtMs(spanMs) : 'unknown';
        push('<details class="tool-session"><summary>session <code>' + esc(sid.slice(0, 8)) + '</code> - ' +
          evs.length + ' tool events - ' + esc(String(evs[0].at)) + ' → ' + esc(String(evs[evs.length - 1].at)) +
          ' (span ' + esc(span) + ') - ' + esc(catStr) + '</summary>\n' +
          '<table>\n<tr><th>at</th><th>tool</th></tr>\n' +
          evs.map((e) => '<tr><td>' + esc(e.at || '') + '</td><td>' + esc(e.category || 'other') + '</td></tr>\n').join('') +
          '</table>\n</details>\n');
      }
    }
  }

  // Gates + decisions.
  push('<h2 id="sec-gates">Gates - demonstrated controls</h2>\n');
  const gates = model.gates || { controls: [], verifier_findings: 0 };
  if (!gates.controls || gates.controls.length === 0) push('<p class="none">no control records</p>\n');
  else {
    push('<details><summary>' + gates.controls.length + ' demonstrated controls - expand for the full list</summary>\n<ul>\n');
    for (const c of gates.controls) push('<li>' + esc(c.text) + ' <span class="label">' + esc(c.id) + '</span></li>\n');
    push('</ul>\n</details>\n');
  }
  push('<p>verifier findings recorded: ' + esc(String(gates.verifier_findings)) + '</p>\n');

  // M22.H (V-1): the release-origin block — G.3.4's report side. Three states
  // per session-correlated release; the tell visually distinct (the .tell
  // style) and worded as observation, not accusation; absence STATED.
  push('<h3 id="sec-release-origin">Release origin - three states per session-correlated release</h3>\n');
  const ro = (gates.release_origin && typeof gates.release_origin === 'object') ? gates.release_origin : { releases: [], reading: '' };
  const roReleases = Array.isArray(ro.releases) ? ro.releases : [];
  if (roReleases.length === 0) {
    push('<p class="none">' + esc(ro.reading || 'no release events observed in the ledger window - nothing to classify (absence stated, never omitted)') + '</p>\n');
  } else {
    push('<ul>\n');
    for (const r of roReleases) {
      if (r.state === 'line-observed') {
        push('<li>' + esc(r.at) + ' · session ' + esc(r.session) + ' · in-session release (' + esc(r.release) +
          ') - RED-RELEASE line observed earlier in the same session (the ruling-5-sanctioned path)</li>\n');
      } else {
        push('<li class="tell">' + esc(r.at) + ' · session ' + esc(r.session) + ' · in-session release (' + esc(r.release) +
          ') with no prior RED-RELEASE line observed in this session - the self-release tell (recorded state; the ledger supports no stronger claim)</li>\n');
      }
    }
    push('</ul>\n');
  }

  push('<h2 id="sec-decisions">Decisions - human verdicts (read, never invented)</h2>\n');
  const dec = Array.isArray(model.decisions) ? model.decisions : [];
  // M28.L (req 1): the verdict legend — a reader never meets a bare verdict word.
  // The four-outcome set is the BUILD-PLAYBOOK §4.4 outcome matrix (the table
  // PROCESS-VALIDATION shares); every OTHER verdict string this model actually
  // records gets its own line, explained from the shipped design and rendered
  // verbatim — recorded vocabulary is never repaired.
  const MATRIX_OUTCOMES = [
    ['Sound', 'every hard gate and every soft gate passed - the stage proceeds as-is.'],
    ['Sound but rough', 'hard gates passed, one or two soft gates failed - playbook/templates get revised first, then the work proceeds.'],
    ['Friction-heavy', 'hard gates passed but three or more soft gates failed - stop and iterate on the process before the next stage.'],
    ['Not ready', 'a hard gate failed - diagnose and fix before proceeding; the stage does not close.'],
  ];
  const explainRecorded = (v) => {
    if (v === 'Sound with fixes') return 'a recorded Verifier verdict: sound once the stage\'s named findings were fixed - historical phrasing preserved verbatim from the ledger.';
    if (/^score \d$/.test(v)) return 'a pre-cutover user stamp: the owner\'s 1–5 stage score, recorded verbatim (the numeric stamps predate the pass/fail stamp cutover and are grandfathered, never rewritten).';
    if (v === 'pass' || v === 'fail') return 'the owner\'s user-friction stamp at stage close, recorded verbatim.';
    if (/\{\{/.test(v)) return 'a template placeholder the source document never filled in - rendered exactly as recorded, never repaired.';
    return 'a verdict string recorded verbatim from the source document - shown as recorded.';
  };
  const matrixWords = MATRIX_OUTCOMES.map((p) => p[0]);
  const recordedExtra = [...new Set(dec.map((d) => String(d.verdict)))].filter((v) => matrixWords.indexOf(v) === -1);
  push('<details id="verdict-legend"><summary>What the verdict words mean - the full outcome set</summary>\n' +
    '<p>Stage and milestone outcomes come from the outcome matrix (BUILD-PLAYBOOK §4.4): every retrospective ends in exactly one of the four outcomes below. This ledger also records the additional verdict vocabularies listed after them.</p>\n<ul>\n');
  for (const p of MATRIX_OUTCOMES) push('<li><strong>' + esc(p[0]) + '</strong> - ' + esc(p[1]) + '</li>\n');
  for (const v of recordedExtra) push('<li><strong>' + esc(v) + '</strong> - ' + esc(explainRecorded(v)) + '</li>\n');
  push('</ul>\n</details>\n');
  if (dec.length === 0) push('<p class="none">no recorded verdicts</p>\n');
  else {
    // req 9: the list collapses to its computed truth — the count and per-verdict
    // breakdown are tallied from the rows themselves.
    const vCounts = {};
    for (const d of dec) { const v = String(d.verdict); vCounts[v] = (vCounts[v] || 0) + 1; }
    const breakdown = Object.keys(vCounts).map((v) => esc(v) + ' ×' + vCounts[v]).join(', ');
    push('<details><summary>' + dec.length + ' recorded verdicts - ' + breakdown + '</summary>\n<ul>\n');
    for (const d of dec) push('<li>' + esc(d.stage || d.milestone || '') + ': ' + esc(d.verdict) + ' <span class="label">' + esc(d.id) + '</span></li>\n');
    push('</ul>\n</details>\n');
  }

  // The four headline sections — every substantive claim links its receipt.
  const HEADS = [
    ['bau', 'BAU - planned work, rework inside budget (the process working)'],
    ['worked', 'What worked - demonstrated controls'],
    ['broke', 'What broke - findings, over-budget rework, post-merge discoveries'],
    ['shipped', 'What shipped - committed surfaces and transitions'],
  ];
  for (const pair of HEADS) {
    const key = pair[0];
    push('<h2 id="sec-' + key + '">' + esc(pair[1]) + '</h2>\n');
    const items = Array.isArray(model[key]) ? model[key] : [];
    if (items.length === 0) { push('<p class="none">none recorded</p>\n'); continue; }
    push('<details><summary>' + items.length + ' entries - expand for every receipt-linked claim</summary>\n<ul>\n');
    for (const it of items) {
      push('<li><a href="#' + esc(it.id) + '">' + esc(it.id) + '</a> - ' + esc(it.text) +
        ' <span class="label">' + esc(it.source) + '</span></li>\n');
    }
    push('</ul>\n</details>\n');
  }

  // Assurance + limitations.
  push('<h2 id="sec-assurance">Assurance</h2>\n');
  const asr = model.assurance || {};
  // M28.L (req 2): the block speaks English — what a record is, what valid means, and
  // what the check proved, with the model's own numbers. The all-valid phrasing is
  // CONDITIONAL on the numbers actually being equal; a shortfall is stated, not hidden.
  const asrSame = asr.records != null && String(asr.records) === String(asr.valid_statements);
  push('<p id="assurance-plain">In plain terms: a record here is one entry the collectors derived from the project\'s committed history - its retrospectives, Verifier findings files, CHANGELOG lines, the tech-debt and release-state ledgers, and git itself. Each of the ' +
    esc(String(asr.records)) + ' collected records was checked against the receipt schema (<code>software-build-assurance-kit/build-receipt/v1</code>); ' +
    (asrSame
      ? 'all ' + esc(String(asr.valid_statements)) + ' parse as valid statements. What that check proved: every claim on this page traces to a schema-valid record - none was dropped, none was rewritten.'
      : esc(String(asr.valid_statements)) + ' parse as valid statements; the remainder failed schema validation and are counted here, not hidden.') + '</p>\n');
  push('<ul>\n<li>' + esc(String(asr.records)) + ' records → ' + esc(String(asr.valid_statements)) +
    ' valid <code>software-build-assurance-kit/build-receipt/v1</code> statements</li>\n' +
    // req 3: unclassified is the unknowns-shown-as-unknown rule working, and SAYS so.
    '<li>unclassified records: ' + esc(String(asr.unclassified == null ? 0 : asr.unclassified)) +
    ' - these matched no known event class, so they are counted and shown as unknown, never forced into a bin. That is the kit\'s unknowns-shown-as-unknown rule working as designed, not confusion: a class is assigned only when a record\'s own bytes match a defined pattern.</li>\n');
  push('</ul>\n');
  // M28.L (req 3, round 2): unclassified defines the THING — the four questions a
  // reader actually has, in order. The class-table size and kind list render from
  // the collectors' own derived RECORD_KINDS (never typed by hand); the
  // reconciliation is arithmetic on the model; a descriptor renders only when the
  // model carries one, else the absence is stated.
  const uKinds = collect.RECORD_KINDS;
  const uN = asr.unclassified == null ? 0 : asr.unclassified;
  push('<details id="unclassified-explained"><summary>What does unclassified mean here?</summary>\n');
  push('<p>What a record is, versus a classified event: the collectors read the committed history - retrospectives, Verifier findings files, CHANGELOG lines, the tech-debt and release-state ledgers, and git itself - and pull out entries. The report knows how to summarize ' +
    uKinds.length + ' specific record types from that history: ' + esc(uKinds.join(', ')) +
    '. Each classified entry lands in one of the four lists above (BAU, worked, broke, shipped).</p>\n');
  push('<p>What the ' + esc(String(uN)) + ' unclassified are: real entries from that same history that match none of those types - history contains more kinds of lines than the report classifies. By the classifier\'s own rules this includes every tech-debt entry (deferred backlog, never forced into a bin), any commit that is not a stage-shaped commit, and any rework row whose budget was never declared. ' +
    // round 3: the COMPOSITION, when the model carries one (rows must reconcile
    // against the count — checked by the caller-side pin); else the stated absence.
    ((Array.isArray(asr.unclassified_breakdown) && asr.unclassified_breakdown.length > 0)
      ? 'The composition, from this model: ' + asr.unclassified_breakdown.map((b) => esc(String(b.count)) + ' ' + esc(String(b.label || b.kind || ''))).join('; ') + '.'
      : 'This frozen snapshot stores the count, not the entries or a per-kind breakdown, so the composition cannot be shown here - stated rather than invented. The capture gap is recorded on the kit\'s tech-debt ledger; a model that carries the breakdown renders it in place of this sentence.') + '</p>\n');
  (() => {
    const uClassified = ['bau', 'worked', 'broke', 'shipped'].reduce((n, k) => n + ((Array.isArray(model[k]) ? model[k] : []).length), 0);
    const uRecon = (asr.records != null && asr.unclassified != null && asr.records - asr.unclassified === uClassified);
    push('<p>What it means for the numbers: every classified-record summary on this page counts only classified entries; the unclassified are counted and disclosed so the totals stay honest - nothing was silently dropped, and nothing unknown was dressed up as known. ' +
      (uRecon
        ? 'The arithmetic is on the page: ' + esc(String(asr.records)) + ' records = ' + uClassified + ' classified + ' + esc(String(asr.unclassified)) + ' unclassified.'
        : 'The record total does not reconcile against the four classified lists in this model - a discrepancy this page states rather than papers over.') + '</p>\n');
  })();
  push('<p>Why that is a feature: the alternative is a report that either hides what it did not understand or mislabels it - this one shows its remainder.</p>\n');
  push('</details>\n');
  // req 9: the calibration list collapses to its computed truth — the uniformity claim
  // is only rendered when the rows really are uniform.
  const fnr = Array.isArray(asr.fnr) ? asr.fnr : [];
  if (fnr.length > 0) {
    const fnrUniform = fnr.every((f) => f.num === 0) && new Set(fnr.map((f) => f.den)).size === 1;
    const fnrHead = fnr.length + ' live verifier calibrations' +
      (fnrUniform ? ' - 0/' + fnr[0].den + ' false negatives in every one' : ' - expand for the per-milestone rates');
    push('<details><summary>' + fnrHead + '</summary>\n<ul>\n');
    for (const f of fnr) push('<li>calibration FNR (' + esc(f.milestone) + '): ' + esc(String(f.num)) + '/' + esc(String(f.den)) + '</li>\n');
    push('</ul>\n</details>\n');
  }

  push('<h2 id="sec-limitations">Limitations - what this report does NOT claim</h2>\n');
  const lims = Array.isArray(model.limitations) ? model.limitations : [];
  if (lims.length === 0) push('<p class="none">none stated</p>\n');
  else { push('<ul>\n'); for (const l of lims) push('<li>' + esc(l) + '</li>\n'); push('</ul>\n'); }

  // The receipts appendix — every claim link resolves HERE; frozen history is
  // labeled per receipt.
  push('<h2 id="sec-provenance">Receipts &amp; provenance</h2>\n');
  const prov = model.provenance || [];
  push('<details><summary>' + prov.length + ' provenance sources - expand for the pinned-commit table</summary>\n' +
    '<table>\n<tr><th>source</th><th>pinned</th><th>collector</th><th>basis</th></tr>\n');
  for (const p of prov) {
    push('<tr><td>' + esc(p.source) + '</td><td>' + esc(p.commit ? p.commit : (p.dirty ? 'dirty tree (stated)' : '')) + '</td><td>' +
      esc(p.collector_version || '') + '</td><td>' + esc(p.basis || '') + '</td></tr>\n');
  }
  push('</table>\n</details>\n');
  // The receipt records collapse as one group (req 5). Fragment navigation from the
  // claim links above still lands correctly: browsers auto-reveal <details> ancestors
  // of a #-target during fragment navigation.
  const rcptDivs = [];
  const allItems = [].concat(model.bau || [], model.worked || [], model.broke || [], model.shipped || []);
  const seenIds = new Set();
  for (const it of allItems) {
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    rcptDivs.push('<div class="receipt" id="' + esc(it.id) + '"><strong>' + esc(it.id) + '</strong> · ' + esc(it.kind) +
      ' <span class="label">collector-derived (historical)</span><br>' + esc(it.text) +
      '<br>source: ' + esc(it.source) + ' · evidence: ' + esc(it.evidence) + '</div>\n');
  }
  // Gate/decision receipt ids also resolve (they render their ids inline).
  for (const c of ((model.gates && model.gates.controls) || [])) {
    if (seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    rcptDivs.push('<div class="receipt" id="' + esc(c.id) + '"><strong>' + esc(c.id) + '</strong> · control <span class="label">collector-derived (historical)</span><br>' + esc(c.text) + '</div>\n');
  }
  for (const d of (model.decisions || [])) {
    if (seenIds.has(d.id)) continue;
    seenIds.add(d.id);
    rcptDivs.push('<div class="receipt" id="' + esc(d.id) + '"><strong>' + esc(d.id) + '</strong> · decision <span class="label">collector-derived (historical)</span><br>' + esc(d.verdict) + '</div>\n');
  }
  push('<details><summary>Receipts appendix - ' + rcptDivs.length + ' receipt records (every claim link above resolves here)</summary>\n' +
    rcptDivs.join('') + '</details>\n');
  push('</body>\n</html>\n');

  const html = out.join('');
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_REPORT_BYTES) {
    throw new Error('renderHtml refused: ' + bytes + ' bytes exceeds the MAX_REPORT_BYTES bound (' + MAX_REPORT_BYTES + ')');
  }
  return html;
}

// ---------------------------------------------------------------------------
// The Markdown export — sanitized under DEFINED rules.
// ---------------------------------------------------------------------------

// The sanitizer rule table (the contract, not an adjective). Home-dir
// usernames are stripped WITH their paths — a username reaches the export only
// inside a path, and paths never survive. Repo-relative paths are preserved:
// no rule matches a path that does not start at a drive letter, a UNC root, or
// a well-known POSIX / CI-container absolute root. The enumeration now covers the
// build-container roots too (workspace, github, builds, vercel, codebuild, drone, w) —
// each LEADING-SLASH-ANCHORED, so slash-commands (/verify, /approve-red, /stage) and
// repo-relative paths pass through untouched (a generic /-rule would eat them).
const SANITIZER_RULES = Object.freeze([
  { name: 'abs-path-windows', re: /(?:[A-Za-z]:[\\/]|\\\\)[^\s"'`)\]]*/g, sub: '[path]' },
  { name: 'abs-path-posix', re: /\/(?:home|Users|tmp|var|etc|root|mnt|opt|srv|private|workspace|github|builds|vercel|codebuild|drone|w)\/[^\s"'`)\]]*/g, sub: '[path]' },
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z][A-Za-z]+/g, sub: '[email]' },
]);

// RFC 2606 / RFC 6761 reserve these names precisely so documentation can use them
// without touching anyone's mailbox. `leg@example.com` in a fixture is not a leak,
// and redacting it to `[email]` destroys a reader's ability to see what the
// example says. The rule redacts real addresses; these are reserved by standard
// and can never be one.
const RESERVED_EMAIL_DOMAIN = /^(?:[A-Za-z0-9-]+\.)*(?:example\.(?:com|net|org|edu)|test|example|invalid|localhost)$/i;
function isReservedEmail(addr) {
  const at = String(addr).lastIndexOf('@');
  return at !== -1 && RESERVED_EMAIL_DOMAIN.test(String(addr).slice(at + 1));
}

function sanitizeText(s) {
  let out = String(s);
  for (const r of SANITIZER_RULES) {
    out = r.name === 'email'
      ? out.replace(r.re, (m) => (isReservedEmail(m) ? m : r.sub))
      : out.replace(r.re, r.sub);
  }
  return out;
}

function renderMarkdown(model) {
  if (!model || typeof model !== 'object') throw new Error('renderMarkdown refused: not a model');
  const L = [];
  const san = (s) => sanitizeText(String(s));
  const ident = model.identity || {};
  L.push('# Build receipt — ' + san(ident.name || 'build receipt'));
  L.push('');
  L.push('range `' + san(ident.range || '') + '`' + (ident.commit ? ' · commit `' + san(ident.commit) + '`' : '') + (ident.dirty ? ' · working tree DIRTY (uncommitted changes excluded)' : ''));
  L.push('');
  // The derived summary front-matter (M20.7.A) — the same cover, sanitized. A
  // short skim line; the dense sections below carry the full evidence record.
  const cover = buildCover(model);
  L.push('> **' + san(cover.verdict.label) + '** · ' + san(cover.mode) + ' — ' +
    cover.tiles.map((t) => san(t.label) + ' ' + san(String(t.value))).join(' · '));
  L.push('');
  L.push('## Coverage — what was and was not observed');
  for (const n of (model.coverage || [])) L.push('- ' + san(n));
  L.push('');
  L.push('## Roles (unknown is never zero)');
  const roles = model.roles || { per_role: {}, totals: {} };
  for (const role of Object.keys(roles.per_role || {})) {
    const r = roles.per_role[role];
    L.push('- ' + san(role) + ': ' + fmtMs(r.ms) + ' (' + r.complete_turns + ' complete / ' + r.incomplete_turns + ' incomplete turns)');
  }
  const mdNever = neverObservedRoles(roles.per_role);
  if (mdNever.length > 0) {
    L.push('- never observed in the merged event ledgers: ' + san(mdNever.join(', ')) + ' — named, never omitted');
  }
  const tot = roles.totals || {};
  L.push('- calendar span (instrumented event window only): ' + fmtMs(tot.calendar_span_ms) + ' · tool time: ' + fmtMs(tot.tool_ms) + ' (included in role time) · human attention: ' + san(tot.human_attention || 'not measured'));
  L.push('');
  const HEADS = [['bau', 'BAU'], ['worked', 'What worked'], ['broke', 'What broke'], ['shipped', 'What shipped']];
  for (const pair of HEADS) {
    L.push('## ' + pair[1]);
    const items = Array.isArray(model[pair[0]]) ? model[pair[0]] : [];
    if (items.length === 0) L.push('- none recorded');
    for (const it of items) L.push('- ' + it.id + ' — ' + san(it.text) + ' (' + san(it.source) + ')');
    L.push('');
  }
  const asr = model.assurance || {};
  L.push('## Assurance');
  L.push('- ' + asr.records + ' records → ' + asr.valid_statements + ' valid software-build-assurance-kit/build-receipt/v1 statements; unclassified: ' + (asr.unclassified == null ? 0 : asr.unclassified));
  for (const f of (asr.fnr || [])) L.push('- calibration FNR (' + san(f.milestone) + '): ' + f.num + '/' + f.den);
  L.push('');
  L.push('## Limitations');
  for (const l of (model.limitations || [])) L.push('- ' + san(l));
  L.push('');
  L.push('## Provenance');
  for (const p of (model.provenance || [])) {
    L.push('- ' + san(p.source) + ' — ' + (p.commit ? 'commit ' + san(p.commit) : 'dirty tree (stated)') + ' · collector ' + san(p.collector_version || '') + ' · ' + san(p.basis || ''));
  }
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// The confined atomic writer — validate-all-then-write, temp+rename.
// ---------------------------------------------------------------------------

// writeReports(outDir, files) — files = { name: content }. EVERY name is
// confined below outDir (sandbox.assertInside) and EVERY content is bounded
// BEFORE anything is written: one bad entry refuses the whole batch and the
// prior report stays intact. Writes are temp+rename (name.tmp → name), so an
// interrupted generation leaves the prior file whole and a stale temp is
// replaced on the next run.
function writeReports(outDir, files) {
  if (!files || typeof files !== 'object') throw new Error('writeReports refused: files must be a name→content map');
  const names = Object.keys(files);
  fs.mkdirSync(outDir, { recursive: true });
  const targets = [];
  for (const name of names) {
    const target = sandbox.assertInside(outDir, name); // fail-closed confinement
    const content = String(files[name]);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_REPORT_BYTES) {
      throw new Error('writeReports refused: ' + name + ' is ' + bytes + ' bytes, exceeding the MAX_REPORT_BYTES bound (' + MAX_REPORT_BYTES + ') — nothing written');
    }
    targets.push({ target: target, content: content });
  }
  for (const t of targets) {
    const tmp = t.target + '.tmp';
    fs.writeFileSync(tmp, t.content, 'utf8');
    fs.renameSync(tmp, t.target);
  }
  return { written: names.slice() };
}

// ---------------------------------------------------------------------------
// Model assembly over a real repo (collect + merge + normalize).
// ---------------------------------------------------------------------------

const OPERATING_MODES = ['greenfield', 'bug_fix', 'audit', 'research_publish'];

// Derive identity.mode from the project's DECLARED operating_mode in
// project-config.md — the same tolerant spellings the SessionStart hook's
// readConfigValue accepts (a `| operating_mode | value |` table row, or a
// `operating_mode: value` / `**Operating mode:** value` field). A mode is
// READ, never guessed (M20.7.A: "do not pass a mode the run did not declare"):
// absent file, absent key, or a token outside the four canonical values →
// undefined, and the cover renders the base tile set. HTML comments are
// stripped first — the unfilled template's `{{OPERATING_MODE}}` line carries
// the mode names inside a comment, and a commented mention is not a
// declaration.
function readOperatingMode(cwd) {
  let text;
  try { text = fs.readFileSync(path.join(cwd, 'project-config.md'), 'utf8'); } catch (_) { return undefined; }
  // Strip HTML comments to FIXPOINT, not once — a single pass leaves a live `<!--`
  // on crafted overlap (js/incomplete-multi-character-sanitization; flagged by CodeQL
  // in an adopting repo, UAT 2026-07). The 4-value allowlist below already bounds the
  // blast radius to a mis-read mode; the loop removes the flawed-sanitizer pattern.
  for (let prev = null; prev !== text; ) { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); }
  const k = 'operating[_ ]mode';
  const row = text.match(new RegExp('^\\|\\s*' + k + '\\s*\\|\\s*`?([A-Za-z][\\w-]*)`?\\s*\\|', 'mi'));
  const field = row || text.match(new RegExp(k + '\\s*[:*]+\\s*`?([A-Za-z][\\w-]*)`?', 'i'));
  const val = field && field[1] ? field[1].toLowerCase() : null;
  return OPERATING_MODES.indexOf(val) !== -1 ? val : undefined;
}

// Token declarations (M26.F, Workstream 5) — tokens-*.jsonl beside the event
// ledgers, DECLARED basis, validated line-by-line through the contract's
// validateTokenDeclaration. Refused lines become coverage notes (stated, never
// silently dropped); totals sum only declared NUMBERS — a field never declared
// numerically stays null (unknown, never zero). Deterministic: files sorted by
// basename, lines in file order.
function readTokenDeclarations(dirs) {
  const notes = [];
  const files = [];
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(d).filter((n) => /^tokens-.*\.jsonl$/.test(n)); } catch (_) { names = []; }
    for (const n of names) files.push(path.join(d, n));
  }
  files.sort((a, b) => {
    const an = path.basename(a); const bn = path.basename(b);
    if (an !== bn) return an < bn ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const totals = { input: null, output: null, cache_read: null, cache_write: null };
  const bySource = {};
  let count = 0;
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); }
    catch (_) { notes.push('token declaration file unreadable: ' + path.basename(f)); continue; }
    text.split('\n').forEach((line, i) => {
      const clean = line.replace(/\r$/, '').trim();
      if (clean === '') return;
      let parsed = null;
      try { parsed = JSON.parse(clean); } catch (_) { parsed = null; }
      const v = parsed === null ? { ok: false, reason: 'not valid JSON' } : receipts.validateTokenDeclaration(parsed);
      if (!v.ok) { notes.push('token declaration refused (' + path.basename(f) + ':' + (i + 1) + '): ' + v.reason); return; }
      count += 1;
      const d = v.declaration;
      const src = d.source || 'none (all-null with note)';
      bySource[src] = (bySource[src] || 0) + 1;
      for (const k of receipts.TOKEN_FIELDS) {
        if (d.tokens[k] === null) continue;
        totals[k] = (totals[k] === null ? 0 : totals[k]) + d.tokens[k];
      }
    });
  }
  if (count === 0 && notes.length === 0) return { tokens: null, notes: notes }; // absent → normalize states the honest-null default
  const by_source = {};
  for (const k of Object.keys(bySource).sort()) by_source[k] = bySource[k];
  const tokens = { input: totals.input, output: totals.output, cache_read: totals.cache_read, cache_write: totals.cache_write, by_source: by_source, declarations: count };
  if (count === 0) tokens.note = 'declaration file(s) present but no valid declaration — token spend unknown (each refusal stated in coverage)';
  else if (totals.input === null && totals.output === null && totals.cache_read === null && totals.cache_write === null) {
    tokens.note = 'all declarations are honest nulls with notes — token spend unknown by declaration (never zero)';
  }
  return { tokens: tokens, notes: notes };
}

// log-tokens — the DECLARED-basis emitter (M26.F): a human/courier records what
// the platform surface showed (or an honest null with its why). Validated by the
// contract BEFORE the append; an invalid declaration is refused loudly, never
// written. Appends below .claude/receipts/ (the same confinement as events).
function runLogTokens(args) {
  const num = (name) => {
    const v = flagValue(args, name);
    if (v === null || v === 'null') return null;
    return /^\d+$/.test(v) ? parseInt(v, 10) : NaN; // NaN → the validator refuses, naming the field
  };
  const decl = {
    schema: receipts.SCHEMA_VERSION,
    at: new Date().toISOString(),
    tokens: { input: num('--input'), output: num('--output'), cache_read: num('--cache-read'), cache_write: num('--cache-write') },
  };
  const source = flagValue(args, '--source');
  if (source !== null) decl.source = source;
  const note = flagValue(args, '--note');
  if (note !== null) decl.note = note;
  const role = flagValue(args, '--role');
  const phase = flagValue(args, '--phase');
  if (role !== null || phase !== null) {
    decl.scope = {};
    if (role !== null) decl.scope.role = role;
    if (phase !== null) decl.scope.phase = phase;
  }
  const v = receipts.validateTokenDeclaration(decl);
  if (!v.ok) {
    console.error('build-receipts log-tokens: ' + v.reason);
    return 1;
  }
  const dir = path.join(process.cwd(), '.claude', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  const file = 'tokens-' + v.declaration.at.slice(0, 10) + '.jsonl';
  const target = sandbox.assertInside(dir, file);
  fs.appendFileSync(target, JSON.stringify(v.declaration) + '\n', 'utf8');
  console.log('build-receipts log-tokens: declaration appended to .claude/receipts/' + file +
    ' (basis: declared' + (v.declaration.source ? '; source ' + v.declaration.source : '; all-null with note') + ')');
  return 0;
}

// buildModel(cwd, range, ledgerDirs?) — ledgerDirs (M22.F, UAT #27) is an
// optional list of explicit event-ledger dirs (the `render --ledger <dir>`
// flags, resolved against cwd). The #20-instructed two-terminal topology
// ledgers each worktree's sessions into its OWN .claude/receipts/, so a
// single-ledger render silently omitted the other half of the run; supplying
// every worktree's dir merges them (the existing total-order merge) into ONE
// all-roles model. Omitted/empty → the default single-dir path, byte-identical
// to the pre-M22.F behavior.
function buildModel(cwd, range, ledgerDirs) {
  const arc = collect.collectArc({ cwd: cwd, range: range || 'HEAD' });
  let events = [];
  const extraCoverage = [];
  const tokenDirs = []; // token declarations ride beside the event ledgers (M26.F)
  if (Array.isArray(ledgerDirs) && ledgerDirs.length > 0) {
    const ledgerFiles = [];
    for (const d of ledgerDirs) {
      const abs = path.resolve(cwd, d);
      if (fs.existsSync(abs)) tokenDirs.push(abs);
      if (!fs.existsSync(abs)) {
        // A supplied-but-absent dir is a STATED coverage note, never an error
        // (report-unavailable over invented — the same doctrine as the default).
        extraCoverage.push('supplied ledger dir absent: ' + d + ' — no events read from it (stated coverage note, never an error)');
        continue;
      }
      let names = [];
      try { names = fs.readdirSync(abs).filter((n) => /^events-.*\.jsonl$/.test(n)); } catch (_) { names = []; }
      for (const n of names) ledgerFiles.push(path.join(abs, n));
    }
    const m = receipts.mergeLedgers(ledgerFiles);
    events = m.events;
    for (const n of m.notes) extraCoverage.push(n);
    if (events.length === 0) {
      extraCoverage.push('no events in the supplied ledger dir(s) — collector-only coverage');
    } else {
      // The same event-band note as the default path (the three-band asymmetry
      // stays rendered, not smoothed), over the multi-dir merge.
      extraCoverage.push('event band (instrumented sessions): ' + m.sessions.length + ' live-session ledger(s) / ' + events.length + ' event(s) merged — observed turn times below are for these sessions; the collector band (committed history) has none');
      extraCoverage.push('multi-ledger merge: ' + ledgerDirs.length + ' ledger dir(s) supplied — one report across every role, whichever worktree ledgered it (UAT #27)');
    }
  } else if (fs.existsSync(path.join(cwd, '.claude', 'receipts'))) {
    tokenDirs.push(path.join(cwd, '.claude', 'receipts'));
    const m = receipts.mergeLedgers(path.join(cwd, '.claude', 'receipts'));
    events = m.events;
    for (const n of m.notes) extraCoverage.push(n);
    if (events.length === 0) {
      extraCoverage.push('no events in ' + path.join('.claude', 'receipts') + ' — collector-only coverage');
    } else {
      // The event band: the counterpart to collectArc's collector-band note.
      // Naming the merged session/event counts is what makes the three-band
      // asymmetry RENDERED, not smoothed — the report shows BOTH the collector
      // band (committed history, durations unknown) and the event band
      // (instrumented sessions, observed turn times). Never let the coverage
      // header claim "no events" while these sessions' turns are rendered.
      extraCoverage.push('event band (instrumented sessions): ' + m.sessions.length + ' live-session ledger(s) / ' + events.length + ' event(s) merged — observed turn times below are for these sessions; the collector band (committed history) has none');
    }
  } else {
    extraCoverage.push('no event ledgers present — collector-only coverage (.claude/receipts absent; report-unavailable over invented)');
  }
  let commit;
  let dirty = false;
  const h = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: cwd, encoding: 'utf8' });
  if (!h.error && h.status === 0) commit = (h.stdout || '').trim() || undefined;
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: cwd, encoding: 'utf8' });
  if (!st.error && st.status === 0 && (st.stdout || '').trim() !== '') dirty = true;
  const identity = { name: path.basename(cwd), range: range || 'HEAD', commit: commit, dirty: dirty };
  const opMode = readOperatingMode(cwd);
  if (opMode) identity.mode = opMode;
  const td = readTokenDeclarations(tokenDirs);
  for (const n of td.notes) extraCoverage.push(n);
  const modelInput = { identity: identity, records: arc.records, events: events, coverage: arc.coverage.concat(extraCoverage) };
  if (td.tokens) modelInput.tokens = td.tokens;
  return normalize(modelInput);
}

function printCoverage(model, cap) {
  const notes = model.coverage || [];
  const max = cap || 40;
  console.log('coverage:');
  for (const n of notes.slice(0, max)) console.log('  - ' + n);
  if (notes.length > max) console.log('  … ' + (notes.length - max) + ' more coverage note(s) (rendered in full in the report)');
}

// ---------------------------------------------------------------------------
// CLI commands.
// ---------------------------------------------------------------------------

// The arc dry-run: collectors over committed history → the classified summary +
// stated coverage boundaries. Each record's receipt feeds A's buildStatement
// (software-build-assurance-kit/build-receipt/v1) — proof the collector output is a valid statement,
// never a forked shape. This is the report-mode command the launch receipt runs.
function runArc(range, verbose) {
  const arc = collect.collectArc({ cwd: process.cwd(), range: range || 'HEAD' });
  // Feed every record through A's frozen builder — refusing a receipt lacking
  // provenance/limitation is the contract, dogfooded here.
  let built = 0;
  for (const rec of arc.records) {
    try { receipts.buildStatement(rec.receipt); built++; } catch (_) { /* a malformed record is surfaced, never counted */ }
  }
  const s = arc.summary;
  console.log(`build-receipts arc (${range || 'HEAD'}): ${arc.records.length} records → ${built} valid software-build-assurance-kit/build-receipt/v1 statements`);
  console.log(`  bau ${s.bau}  worked ${s.worked}  broke ${s.broke}  shipped ${s.shipped}  unclassified ${s.unclassified}`);
  console.log('coverage boundaries:');
  for (const n of arc.coverage) console.log(`  - ${n}`);
  // The events-not-read boundary is TRUE for this dry-run (arc reads committed
  // history only) — so it prints HERE, and is deliberately NOT in
  // collectArc.coverage, which render also consumes (where it would be false).
  console.log('  - the live .claude/receipts/ event ledgers are NOT read in this arc dry-run — run `render` for the event-fed timeline/roles (they are gitignored, out of collector scope)');
  if (verbose) {
    console.log('records:');
    for (const rec of arc.records) console.log(`  [${collect.classify(rec)}] ${rec.kind} ${rec.evidence}`);
  }
  return arc.records.length === built ? 0 : 1;
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return (i !== -1 && i + 1 < args.length) ? args[i + 1] : null;
}

// Every value of a REPEATABLE flag (M22.F: `render --ledger a --ledger b`).
function flagValues(args, name) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
}

// render — normalized JSON + HTML + sanitized MD below reports/ (temp+rename).
// --ledger <dir> (repeatable, M22.F/UAT #27): merge event ledgers from every
// supplied dir into ONE all-roles report. No flag → the default single-dir path.
function runRender(args) {
  const cwd = process.cwd();
  const outDir = flagValue(args, '--out') || 'reports';
  const name = flagValue(args, '--name') || 'build-receipt';
  const ledgerDirs = flagValues(args, '--ledger');
  const FLAGS_WITH_VALUE = ['--out', '--name', '--ledger'];
  const positional = args.filter((a, i) => !a.startsWith('--') && FLAGS_WITH_VALUE.indexOf(args[i - 1]) === -1);
  const range = positional[0] || 'HEAD';
  const model = buildModel(cwd, range, ledgerDirs);
  const files = {};
  files[name + '.json'] = JSON.stringify(model, null, 2) + '\n';
  files[name + '.html'] = renderHtml(model);
  files[name + '.md'] = renderMarkdown(model) + '\n';
  writeReports(path.resolve(cwd, outDir), files);
  console.log('build-receipts render: wrote ' + name + '.{json,html,md} below ' + outDir + '/ — ' +
    model.assurance.records + ' records, ' + model.assurance.valid_statements + ' valid statements ' +
    '(the reports/ gitignore entry is a default, not a wall — negate it to track a report deliberately)');
  printCoverage(model);
  return 0;
}

// --check — the release preflight: collectors run, render deterministic
// (JSON+HTML+MD byte-identical twice), statements valid, coverage stated. An absent
// .claude/receipts is GREEN with its note (report-unavailable over invented).
function runCheck() {
  const cwd = process.cwd();
  const a = buildModel(cwd, 'HEAD');
  const b = buildModel(cwd, 'HEAD');
  // All THREE rendered surfaces byte-compare — JSON, HTML, AND the sanitized Markdown
  // export — so an MD-only determinism regression (an unsanitized path, an injected
  // timestamp) REDs the preflight instead of shipping silently.
  const deterministic = (JSON.stringify(a, null, 2) === JSON.stringify(b, null, 2))
    && (renderHtml(a) === renderHtml(b))
    && (renderMarkdown(a) === renderMarkdown(b));
  const statementsOk = a.assurance.valid_statements === a.assurance.records;
  console.log('build-receipts --check: ' + a.assurance.records + ' records → ' + a.assurance.valid_statements +
    ' valid software-build-assurance-kit/build-receipt/v1 statements' + (statementsOk ? '' : ' (MISMATCH — a receipt failed the statement builder)') +
    '; render ' + (deterministic ? 'deterministic (JSON+HTML+MD byte-identical twice)' : 'NOT deterministic — byte-compare failed'));
  printCoverage(a);
  return (deterministic && statementsOk) ? 0 : 1;
}

function main(argv) {
  const cmd = argv[0] || 'validate';
  if (cmd === 'arc' || cmd === 'collect') {
    return runArc(argv[1], cmd === 'collect');
  }
  if (cmd === 'render') {
    return runRender(argv.slice(1));
  }
  if (cmd === '--check' || cmd === 'check') {
    return runCheck();
  }
  if (cmd === 'log-tokens') {
    return runLogTokens(argv.slice(1));
  }
  const dir = argv[1] || path.join(process.cwd(), '.claude', 'receipts');
  if (cmd !== 'validate' && cmd !== 'coverage') {
    console.error(`build-receipts: unknown command ${JSON.stringify(cmd)} (validate|coverage|collect|arc|render|log-tokens|--check)`);
    return 2;
  }
  if (!fs.existsSync(dir)) {
    console.log(`build-receipts ${cmd}: no event ledgers present — collector-only coverage (${dir} absent; report-unavailable over invented)`);
    return 0;
  }
  const names = fs.readdirSync(dir).filter((n) => /^events-.*\.jsonl$/.test(n)).sort();
  if (names.length === 0) {
    console.log(`build-receipts ${cmd}: no event ledgers present in ${dir}`);
    return 0;
  }
  if (cmd === 'validate') {
    for (const n of names) {
      const g = receipts.readLedger(path.join(dir, n));
      const flags = [
        g.torn ? 'torn tail (valid prefix kept)' : '',
        g.truncated ? 'read cap hit' : '',
      ].filter(Boolean);
      console.log(`${n}: ${g.events.length} valid event(s)${flags.length ? ' — ' + flags.join('; ') : ''}`);
    }
    return 0;
  }
  const m = receipts.mergeLedgers(dir);
  console.log(`sessions: ${m.sessions.length}; events: ${m.events.length}`);
  if (m.notes.length === 0) {
    console.log('coverage notes: none');
  } else {
    console.log(`coverage notes (${m.notes.length}):`);
    for (const n of m.notes) console.log(`  - ${n}`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = {
  main,
  SECTIONS,
  MAX_RENDER_RECORDS,
  MAX_REPORT_BYTES,
  normalize,
  renderHtml,
  renderMarkdown,
  renderCover,
  buildCover,
  VERIFICATION_LABELS,
  verificationLabel,
  COVER_TILE_SETS,
  COVER_UNKNOWN,
  SANITIZER_RULES,
  sanitizeText,
  writeReports,
  buildModel,
  fmtMs,
  readTokenDeclarations,
};
