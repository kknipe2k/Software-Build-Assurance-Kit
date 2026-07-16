#!/usr/bin/env node
// @kit-version 0.2.0
// scripts/lib/receipts-collect.cjs
//
// The collectors (M20.6.C) — committed artifacts become receipts. This is the
// module A's honest-locus header deliberately excluded from scripts/lib/
// receipts.cjs ("It does not ... read repository artifacts (C)"): the data
// contract stays pure, the artifact-reading collectors live HERE.
//
// EXTEND, DON'T FORK — structurally:
//   * ONE fence parser. Every fenced block (the rework block, the user-stamp
//     block) is read through validators/lib/fenced-block.cjs — the SAME
//     line-anchored primitive validate-reconciliation consumes. There is no
//     second fence regex in this file.
//   * A's statement builder is FED, never re-implemented. Collector records
//     carry a buildStatement-ready `.receipt`; scripts/build-receipts.cjs turns
//     them into software-build-assurance-kit/build-receipt/v1 statements via
//     receipts.buildStatement.
//
// THE INVENTION FLOOR — no artifact, no receipt. Every emitted record routes
// through emitReceipt, which REFUSES a record without a concrete artifact
// binding (a source + evidence). A collector cannot invent a receipt.
//
// HONEST-REWORK DOCTRINE — the classification tells the truth about a healthy
// build: an in-budget self-correction with no verifier finding is the process
// WORKING (bau), not "broke"; a RED-first cycle or a killed mutation is a
// demonstrated control (worked); a verifier finding or over-budget rework is
// broke; a committed surface / release transition is shipped; anything the
// evidence cannot decide stays UNCLASSIFIED — never forced.
//
// FROZEN HISTORY — collector-derived receipts are historical by nature: there
// are no lifecycle events for committed history, so role/turn DURATIONS are
// unknown (never zeroed). Every record is frozen:true with that boundary in its
// limitation. Live event coverage is B's capture, merged at render time (D).
//
// Collectors read COMMITTED history; the dirty working tree is a stated
// limitation, not silently included.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The ONE fence primitive (precedent: scripts/golden-bootstrap.cjs consumes it
// the same way — "consume, don't fork"). No parallel parser in this file.
const fenced = require('../../validators/lib/fenced-block.cjs');

const COLLECTOR_VERSION = '0.2.0';

// A stage commit ships a surface: M<NN>[.<NN>...].<Stage>: <subject>.
const STAGE_COMMIT_RE = /^M\d+(?:\.\d+)*\.[A-Za-z0-9]+:/;
// A post-closeout / post-merge fix commit: M<NN>.PC-<n> — a discovery after the
// milestone closed (broke, honestly).
const POST_MERGE_RE = /\.PC-\d|post-merge|post-closeout/i;
// A closeout commit names its milestone: M<NN>.E: ... (Stage E).
function closeoutMilestone(subject) {
  const m = String(subject || '').match(/^(M\d+(?:\.\d+)*)\.E\b/);
  return m ? m[1] : null;
}

// The frozen-history boundary, stated on every derived receipt.
const FROZEN_TAIL = 'derived from committed history; no lifecycle events for this range, so role/turn durations are unknown (pre-instrumentation), never zeroed';
const GIT_LIMITATION = 'hash/subject/date only; author identity omitted (J4 — pending the render-stage sanitizer); ' + FROZEN_TAIL;

// ---------------------------------------------------------------------------
// The invention floor + the provenance/receipt shaping helpers.
// ---------------------------------------------------------------------------

// No artifact, no receipt. THE guard every collector routes through (the mut3
// target). A record without a concrete artifact binding is refused here.
function emitReceipt(out, rec) {
  if (!rec.source || rec.evidence == null || rec.evidence === '') return; // no artifact, no receipt (the invention floor)
  out.push(rec);
}

// Provenance: a real commit pins the receipt; absent a commit the read is from
// the working tree (dirty), which buildStatement accepts and the limitation
// states. basis is always `derived` for a collector.
function prov(source, commit) {
  const p = { source: source, collector_version: COLLECTOR_VERSION, basis: 'derived' };
  if (commit) p.commit = commit; else p.dirty = true;
  return p;
}

// A buildStatement-ready receipt (subject + predicate{claims,provenance,limitation}).
function makeReceipt(o) {
  const subject = [{ name: o.subjectName }];
  if (o.digest) subject[0].digest = { sha256: o.digest };
  return {
    subject: subject,
    predicate: { claims: o.claims || [], provenance: prov(o.source, o.commit), limitation: o.limitation },
  };
}

function intOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^\d-]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

// ---------------------------------------------------------------------------
// Classification — pure, deterministic, doctrine-aligned. No I/O.
// ---------------------------------------------------------------------------

function classify(rec) {
  if (!rec || typeof rec !== 'object') return 'unclassified';
  switch (rec.kind) {
    case 'stage-rework': {
      const rw = rec.rework;
      const verifier = (rw && rw.verifier != null) ? rw.verifier : (rec.verifierFindings || 0);
      if (verifier > 0) return 'broke'; // a verifier finding is a break
      if (rec.budget == null || !rw || rw.implementation == null) {
        return 'unclassified'; // ambiguous — budget/rework undeclared; never forced into BAU
      }
      if (rw.implementation > rec.budget) return 'broke'; // over-budget rework is a break
      // in-budget self-correction IS the process working — BAU, not broke
      return 'bau';
    }
    case 'control': return 'worked'; // RED-first, killed mutation, gate fired, recovery proven
    case 'verifier-finding': return 'broke'; // carries severity
    case 'commit':
      if (rec.isPostMerge) return 'broke'; // a post-merge / post-closeout fix is a break caught after merge
      return rec.isStageCommit ? 'shipped' : 'unclassified';
    case 'milestone':
    case 'milestone-complete':
    case 'release-transition':
      return 'shipped';
    case 'tech-debt': return 'unclassified'; // deferred backlog — never forced
    default: return 'unclassified';
  }
}

// ---------------------------------------------------------------------------
// git collector — hash/subject/date only. Author identity stays OUT (J4).
// ---------------------------------------------------------------------------

function collectCommits(opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const range = opts.range || 'HEAD';
  const US = '\x1f'; // unit separator — subjects never contain it
  const r = spawnSync('git', ['log', '--no-color', '--format=%H' + US + '%s' + US + '%cI', range], {
    cwd: cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    const detail = (r.stderr && r.stderr.trim()) || (r.error && r.error.message) || 'unknown git error';
    // FAIL-CLOSED (ERR-004 family): never a silent 0-commit collection on a bad git state.
    throw new Error('receipts-collect: cannot run `git log ' + range + '`: ' + detail);
  }
  const out = [];
  for (const line of (r.stdout || '').split('\n')) {
    if (line.trim() === '') continue;
    const parts = line.split(US);
    if (parts.length < 3) continue;
    const hash = parts[0];
    const subject = parts[1];
    const date = parts[2];
    const isStageCommit = STAGE_COMMIT_RE.test(subject);
    const isPostMerge = POST_MERGE_RE.test(subject);
    emitReceipt(out, {
      kind: 'commit',
      hash: hash, subject: subject, date: date,
      isStageCommit: isStageCommit, isPostMerge: isPostMerge,
      source: 'git', evidence: hash, frozen: true,
      receipt: makeReceipt({
        subjectName: 'git:' + hash,
        claims: [{ kind: isPostMerge ? 'broke' : (isStageCommit ? 'shipped' : 'commit'), text: subject }],
        source: 'git', commit: hash, limitation: GIT_LIMITATION,
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CHANGELOG collector — milestone entries, verdict prose, FNR.
// ---------------------------------------------------------------------------

function parseVerdict(body) {
  let m = body.match(/verdict:\s*(sound(?:\s+with\s+fixes)?)/i);
  if (m) return m[1].replace(/\s+/g, ' ');
  m = body.match(/\b(sound with fixes|sound)\b/i);
  return m ? m[1] : null;
}
function parseFnr(body) {
  const m = body.match(/FNR\s*=\s*(\d+)\s*\/\s*(\d+)/i);
  return m ? { num: parseInt(m[1], 10), den: parseInt(m[2], 10) } : null;
}

function collectChangelog(opts) {
  opts = opts || {};
  const text = fenced.normalize(opts.text || '');
  const source = opts.source || 'CHANGELOG.md';
  const commit = opts.commit;
  const headerRe = /^###\s+(M\d+(?:\.\d+)*)\s+—\s+(.*?)\s+\((\d{4}-\d{2}-\d{2})\)\s*$/;
  const entries = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(headerRe);
    if (m) { cur = { milestone: m[1], title: m[2], date: m[3], body: [] }; entries.push(cur); }
    else if (cur) cur.body.push(line);
  }
  const out = [];
  for (const e of entries) {
    const body = e.body.join('\n');
    const verdict = parseVerdict(body);
    const fnr = parseFnr(body);
    emitReceipt(out, {
      kind: 'milestone',
      milestone: e.milestone, title: e.title, date: e.date, verdict: verdict, fnr: fnr,
      source: source, evidence: e.milestone + ' — ' + e.title, frozen: true,
      receipt: makeReceipt({
        subjectName: source + '#' + e.milestone,
        claims: [{ kind: 'shipped', text: e.milestone + (verdict ? ' — ' + verdict : '') }],
        source: source, commit: commit,
        limitation: 'verdict/FNR read from CHANGELOG prose, not recomputed; ' + FROZEN_TAIL,
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Retrospective collector — the fenced rework/stamp blocks (shared primitive),
// the budget line, the RED-first pre-flight → stage-rework + control records.
// ---------------------------------------------------------------------------

function parseStamp(text) {
  const blocks = fenced.extractBlocks(text, 'user-stamp');
  if (!blocks.length) return null;
  const b = blocks[0];
  const verdict = fenced.fieldInBlock(b, 'verdict');
  const score = fenced.fieldInBlock(b, 'score');
  if (verdict == null && score == null) return null;
  const s = {};
  if (verdict != null) s.verdict = verdict.toLowerCase();
  if (score != null) s.score = score;
  return s;
}

function parseRework(text) {
  const blocks = fenced.extractBlocks(text, 'rework');
  if (blocks.length) {
    const b = blocks[0];
    const impl = intOrNull(fenced.fieldInBlock(b, 'implementation'));
    const ver = intOrNull(fenced.fieldInBlock(b, 'verifier'));
    const irl = intOrNull(fenced.fieldInBlock(b, 'irl'));
    const pm = intOrNull(fenced.fieldInBlock(b, 'post-merge'));
    if (impl != null || ver != null) return { implementation: impl, verifier: ver, irl: irl, postMerge: pm };
  }
  // Prose fallback — M20.6-style retros carry the four-type rework as PROSE, not
  // a fenced block. A bounded, stated parse limitation (not the canonical form).
  const m = text.match(/[Ii]mplementation\s+(\d+)[\s\S]{0,120}?verifier\s+(\d+)[\s\S]{0,60}?irl\s+(\d+)[\s\S]{0,60}?post-merge\s+(\d+)/);
  if (m) return { implementation: +m[1], verifier: +m[2], irl: +m[3], postMerge: +m[4], prose: true };
  return null;
}

function parseBudget(text) {
  const m = text.match(/Self-correction budget for this stage:\**\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function collectRetros(opts) {
  opts = opts || {};
  const commit = opts.commit;
  let files = opts.files;
  if (!files) {
    try { files = fs.readdirSync(opts.dir).filter((n) => /-retrospective\.md$/.test(n)).map((n) => path.join(opts.dir, n)); }
    catch (_) { files = []; }
  }
  const out = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const base = path.basename(f);
    const sm = base.match(/^(M[\w.]+?)-retrospective\.md$/);
    const stage = sm ? sm[1] : base;
    const stamp = parseStamp(text);
    const rework = parseRework(text);
    const budget = parseBudget(text);
    const redFirst = /RED-first/i.test(text);
    // No machine-readable content (no stamp, no rework, no budget) → no
    // stage-rework record (the invention floor, at the collector level).
    if (stamp || rework || budget != null) {
      const rw = rework;
      emitReceipt(out, {
        kind: 'stage-rework',
        stage: stage, stamp: stamp, rework: rework, budget: budget,
        source: base, evidence: stage + (stamp ? ' stamp' : '') + (rework ? ' rework' : ' budget'), frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + stage,
          claims: [{ kind: 'stage-rework', text: stage + (rw ? ' impl ' + rw.implementation + '/ver ' + rw.verifier : '') + (budget != null ? ' budget ' + budget : '') }],
          source: base, commit: commit,
          limitation: 'rework/budget read from the retro' + (rw && rw.prose ? ' PROSE (fallback; not the fenced block)' : ' fenced block') + '; ' + FROZEN_TAIL,
        }),
      });
    }
    if (redFirst) {
      emitReceipt(out, {
        kind: 'control', control: 'red-first', stage: stage,
        source: base, evidence: stage + ' RED-first', frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + stage + ':red-first',
          claims: [{ kind: 'worked', text: stage + ' RED-first cycle (a demonstrated control)' }],
          source: base, commit: commit,
          limitation: 'the RED-first affirmation is read from the retro pre-flight prose; ' + FROZEN_TAIL,
        }),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verifier-findings collector — severities → broke.
// ---------------------------------------------------------------------------

function collectVerifierFindings(opts) {
  opts = opts || {};
  const commit = opts.commit;
  let files = opts.files;
  if (!files) {
    try { files = fs.readdirSync(opts.dir).filter((n) => /V-findings\.md$|-findings\.md$/.test(n)).map((n) => path.join(opts.dir, n)); }
    catch (_) { files = []; }
  }
  const out = [];
  for (const f of files) {
    let text;
    try { text = fenced.normalize(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const base = path.basename(f);
    const mm = base.match(/^(M[\w.]+?)\.V/);
    const milestone = mm ? mm[1] : base;
    for (const line of text.split('\n')) {
      const hm = line.match(/^#{1,4}\s+(.*)$/);
      if (!hm) continue;
      const sev = line.indexOf('\u{1F534}') !== -1 ? 'red' : line.indexOf('\u{1F7E1}') !== -1 ? 'yellow' : line.indexOf('\u{1F7E2}') !== -1 ? 'green' : null;
      if (!sev || sev === 'green') continue; // only red/yellow are breaks; a green rider is a nice-to-have (tech-debt)
      emitReceipt(out, {
        kind: 'verifier-finding', milestone: milestone, severity: sev, title: hm[1],
        source: base, evidence: hm[1], frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + hm[1].slice(0, 40),
          claims: [{ kind: 'broke', text: '[' + sev + '] ' + hm[1] }],
          source: base, commit: commit,
          limitation: 'severity read from the finding heading marker; ' + FROZEN_TAIL,
        }),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tech-debt collector — TD rows → unclassified (deferred backlog).
// ---------------------------------------------------------------------------

function collectTechDebt(opts) {
  opts = opts || {};
  const text = fenced.normalize(opts.text || '');
  const source = opts.source || 'docs/tech-debt.md';
  const commit = opts.commit;
  const re = /^###\s+(TD-\d+):\s*(.*)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(text)) !== null) heads.push({ id: m[1], desc: m[2], idx: m.index });
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const seg = text.slice(heads[i].idx, (i + 1 < heads.length) ? heads[i + 1].idx : text.length);
    const sev = seg.indexOf('\u{1F534}') !== -1 ? 'red' : seg.indexOf('\u{1F7E1}') !== -1 ? 'yellow' : 'green';
    const sm = seg.match(/Status:\**\s*(open|resolved)/i);
    const status = sm ? sm[1].toLowerCase() : 'open';
    emitReceipt(out, {
      kind: 'tech-debt', id: heads[i].id, severity: sev, status: status,
      source: source, evidence: heads[i].id, frozen: true,
      receipt: makeReceipt({
        subjectName: source + '#' + heads[i].id,
        claims: [{ kind: 'unclassified', text: heads[i].id + ' (' + status + ')' }],
        source: source, commit: commit,
        limitation: 'deferred backlog item — a limitations-section input, not a build outcome; ' + FROZEN_TAIL,
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Release-state collector — transitions + the attestation-LINK path (dormant).
// ---------------------------------------------------------------------------

function parseReleaseRework(seg) {
  const m = seg.match(/implementation\s+(\d+)\s*\/\s*verifier\s+(\d+)\s*\/\s*irl\s+(\d+)\s*\/\s*post-merge\s+(\d+)/i);
  return m ? { implementation: +m[1], verifier: +m[2], irl: +m[3], postMerge: +m[4] } : null;
}

function collectReleaseState(opts) {
  opts = opts || {};
  const text = fenced.normalize(opts.text || '');
  const source = opts.source || 'docs/release-state.md';
  const commit = opts.commit;
  const headRe = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+reached\s+`([^`]+)`\s+\(([^)]+)\)\s*$/gm;
  const heads = [];
  let m;
  while ((m = headRe.exec(text)) !== null) heads.push({ date: m[1], state: m[2], milestoneRaw: m[3], idx: m.index });
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const seg = text.slice(h.idx, (i + 1 < heads.length) ? heads[i + 1].idx : text.length);
    const msM = h.milestoneRaw.match(/^(M[\w.]+)/);
    const milestone = msM ? msM[1] : h.milestoneRaw;
    const rework = parseReleaseRework(seg);
    const slsaM = seg.match(/SLSA build level[^:]*:\**\s*([^\n]+)/i);
    const att = seg.match(/attestation\s+ref\s+(\S+?)@sha256:([0-9a-f]{64})/i);
    const subjects = [{ name: source + '#' + h.date + '-' + milestone }];
    let attestation = null;
    let limitation = 'transition parsed from the release-state ledger; ' + FROZEN_TAIL;
    if (att) {
      // LINK the signed attestation by reference + digest — never an embedded
      // unsigned hash. The live path is DORMANT until v0.1.0 produces a real one.
      attestation = { ref: att[1], sha256: att[2] };
      subjects.push({ name: 'attestation:' + att[1], digest: { sha256: att[2] } });
      limitation = 'attestation LINKED by reference + digest (never an embedded unsigned hash); the live attestation path is dormant until v0.1.0 (no real attestation produced yet). ' + FROZEN_TAIL;
    }
    emitReceipt(out, {
      kind: 'release-transition',
      date: h.date, state: h.state, milestone: milestone, rework: rework,
      slsa: slsaM ? slsaM[1].trim() : null, attestation: attestation,
      source: source, evidence: h.date + ' ' + milestone, frozen: true,
      receipt: {
        subject: subjects,
        predicate: { claims: [{ kind: 'shipped', text: 'reached ' + h.state + ' (' + milestone + ')' }], provenance: prov(source, commit), limitation: limitation },
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derived milestone completion — needs BOTH the closeout commit AND the row.
// ---------------------------------------------------------------------------

function deriveMilestoneCompletion(opts) {
  opts = opts || {};
  const commits = opts.commits || [];
  const rows = opts.releaseRows || [];
  const commit = opts.commit;
  const rowByMs = new Map();
  for (const r of rows) if (r.milestone) rowByMs.set(r.milestone, r);
  const out = [];
  for (const c of commits) {
    const ms = closeoutMilestone(c.subject);
    if (!ms) continue;
    const row = rowByMs.get(ms);
    if (!row) continue; // requires BOTH — a CHANGELOG-only closeout invents no completion (the M14–M16 case)
    emitReceipt(out, {
      kind: 'milestone-complete', milestone: ms,
      closeoutCommit: c.hash, releaseRow: row.date || row.milestone,
      source: 'derived', evidence: (c.hash || ms) + '+' + ms, frozen: true,
      receipt: makeReceipt({
        subjectName: 'milestone:' + ms,
        claims: [{ kind: 'shipped', text: ms + ' milestone-complete (closeout commit + release-state row)' }],
        source: 'derived (commit+release-state)', commit: commit || c.hash,
        limitation: 'derived completion — requires BOTH the closeout commit and the release-state row; ' + FROZEN_TAIL,
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The arc dry-run runner (report mode over committed history).
// ---------------------------------------------------------------------------

function collectArc(opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const range = opts.range || 'HEAD';
  const records = [];
  const coverage = [];

  // Resolve the report commit (clean HEAD pins provenance; a dirty tree is stated).
  let commit = opts.commit;
  if (!commit) {
    const h = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: cwd, encoding: 'utf8' });
    if (!h.error && h.status === 0) commit = (h.stdout || '').trim() || undefined;
    const st = spawnSync('git', ['status', '--porcelain'], { cwd: cwd, encoding: 'utf8' });
    if (!st.error && st.status === 0 && (st.stdout || '').trim() !== '') {
      coverage.push('working tree is DIRTY — receipts pin the last commit; uncommitted changes are excluded (committed history only)');
    }
  }

  let commits = [];
  try { commits = collectCommits({ cwd: cwd, range: range }); records.push(...commits); }
  catch (e) { coverage.push('git log unavailable for ' + range + ': ' + e.message); }

  const readFile = (rel) => { try { return fs.readFileSync(path.join(cwd, rel), 'utf8'); } catch (_) { return null; } };
  const cl = readFile('CHANGELOG.md');
  if (cl != null) records.push(...collectChangelog({ text: cl, source: 'CHANGELOG.md', commit: commit }));
  const rs = readFile('docs/release-state.md');
  let releaseRows = [];
  if (rs != null) { const rows = collectReleaseState({ text: rs, source: 'docs/release-state.md', commit: commit }); records.push(...rows); releaseRows = rows; }
  const td = readFile('docs/tech-debt.md');
  if (td != null) records.push(...collectTechDebt({ text: td, source: 'docs/tech-debt.md', commit: commit }));
  try { records.push(...collectRetros({ dir: path.join(cwd, 'retrospectives'), commit: commit })); } catch (_) { /* no retros */ }
  try { records.push(...collectVerifierFindings({ dir: path.join(cwd, 'retrospectives'), commit: commit })); } catch (_) { /* no findings */ }
  if (commits.length && releaseRows.length) {
    records.push(...deriveMilestoneCompletion({ commits: commits, releaseRows: releaseRows, commit: commit }));
  }

  // The collector band: a statement about the COLLECTOR-DERIVED receipts, true
  // whether or not live event ledgers merge at render time. The events-blind
  // "ledgers are NOT read" note is the arc DRY-RUN's, not the collector's — it
  // moved to runArc's print so it can never leak into a render that DID merge
  // events (the M20.6.E three-artifact-review correction: a coverage header must
  // not claim "no events" while the Roles section shows event-fed turn times).
  coverage.push('collector band (committed history): the collector-derived receipts carry no captured lifecycle events — their role/turn durations are unknown (pre-instrumentation), never zeroed (this holds whether or not live event ledgers merge at render time)');
  coverage.push('git commits are range-scoped (' + range + '); the CHANGELOG / retros / ledgers are read as the full committed corpus (stated scope asymmetry)');

  const summary = { bau: 0, worked: 0, broke: 0, shipped: 0, unclassified: 0 };
  for (const rec of records) { const c = classify(rec); if (summary[c] != null) summary[c]++; }

  return { records: records, summary: summary, coverage: coverage };
}

module.exports = {
  COLLECTOR_VERSION,
  STAGE_COMMIT_RE,
  emitReceipt,
  classify,
  collectCommits,
  collectChangelog,
  collectRetros,
  collectVerifierFindings,
  collectTechDebt,
  collectReleaseState,
  deriveMilestoneCompletion,
  collectArc,
  // exposed for the CLI / tests
  parseVerdict,
  parseFnr,
  parseRework,
  parseStamp,
  parseBudget,
};
