#!/usr/bin/env node
// @kit-version 1.0.12
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
// Collectors read COMMITTED history (M34.5.F.10): collectArc reads every file
// with `git show <HEAD>:<path>`, never from the working tree, and binds each
// record to the last commit that touched its source. A dirty tree is stated in
// one coverage line; its uncommitted changes are not in the report.
//
// ONE RULE FOR CLAIMS (M34.5.F.10): a verdict, a RED-first control, a stamp or a
// finding's resolution is read only from a structured `key: value` line whose
// value is in a closed vocabulary (structuredClaim). A field-shaped line outside
// the vocabulary is UNREAD: the record carries it and the report quotes it as
// UNKNOWN. No collector infers a claim from a keyword anywhere in prose.
//
// ONE STRIPPER (M34.5.F.10): every collector that reads a file parses it through
// stripTemplate first - HTML comments removed by the shared primitive (the one
// validate-release-readiness uses), and every {{placeholder}} line blanked - so a
// shipped template's example or placeholder is never read as a record.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The ONE fence primitive (precedent: scripts/golden-bootstrap.cjs consumes it
// the same way — "consume, don't fork"). No parallel parser in this file.
const fenced = require('../../validators/lib/fenced-block.cjs');

// DERIVED from this file's own @kit-version stamp, which the smoke stamp lock already
// binds to the manifest fact — so the collector version and the kit version cannot drift
// apart, and a release bump moves both without a hand edit here.
// Consumes the established in-repo idiom (scripts/lib/settings-merge.cjs KIT_VERSION)
// rather than reading the release manifest: this is a SHIPPED library, and adding a
// runtime read of an external file to it would buy a second failure mode in adopted
// projects to solve a problem the stamp already solves. Consume, don't fork.
const COLLECTOR_VERSION = (function () {
  try {
    const m = /@kit-version\s+(\S+)/.exec(fs.readFileSync(__filename, 'utf8'));
    return m ? m[1] : 'unstamped';
  } catch (_) { return 'unstamped'; }
})();

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
// The one stripper and the one rule for claims (M34.5.F.10).
// ---------------------------------------------------------------------------

// Template text is never a record: comments through the shared primitive, then
// every line carrying a {{placeholder}} blanked (the line count is kept).
function stripTemplate(text) {
  return fenced.stripHtmlComments(text).split('\n').map((l) => (/\{\{[^}\n]*\}\}/.test(l) ? '' : l)).join('\n');
}

// The closed vocabularies. A milestone verdict is one of the outcome-matrix words
// (BUILD-PLAYBOOK 4.4), the verifier's recorded "sound with fixes", or one of the
// closeout's words (the Phase-doc template's closeout commit message); a stamp is
// pass or fail; a finding's status is resolved, fixed or open.
const VERDICT_WORDS = Object.freeze(['sound', 'sound with fixes', 'sound but rough', 'friction-heavy', 'not ready',
  'strong', 'rough but shipped', 'recovery needed']);
const STAMP_WORDS = Object.freeze(['pass', 'fail']);
const STATUS_WORDS = Object.freeze({ resolved: 'fixed', fixed: 'fixed', open: 'open' });

// The leading phrase of a field's value: bold and code markers dropped, cut at the
// first sentence break, spaces collapsed, case kept as recorded (the vocabulary is
// matched lowercased).
function leadingPhrase(v) {
  let s = String(v).replace(/^[\s*`]+/, '');
  const cut = s.search(/\*\*|[.;,(`]|\s[-–—]\s/);
  if (cut !== -1) s = s.slice(0, cut);
  return s.trim().replace(/\s+/g, ' ');
}

// A field line: the key at a line start (bold markers around it tolerated), a colon,
// the value. Returns every { line, value } in order; prose never matches.
function fieldLines(text, key) {
  const re = new RegExp('^[ \\t]*\\**[ \\t]*' + fenced.escapeRe(key) + '[ \\t]*\\**[ \\t]*:[ \\t]*\\**(.*)$', 'gim');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push({ line: m[0].trim(), value: m[1] });
  return out;
}

// THE RULE: the first field line for `key` whose value `accept` maps to a claim is
// the claim ({ value, line }); a field line it refuses is UNREAD ({ unread: line });
// no field line is no claim (null). Every claim-reading collector calls this.
function structuredClaim(text, key, accept) {
  const lines = fieldLines(text, key);
  let unread = null;
  for (const f of lines) {
    const v = accept(f.value);
    if (v !== null && v !== undefined) return { value: v, line: f.line };
    if (unread === null) unread = f.line;
  }
  return unread === null ? null : { unread: unread };
}
const acceptVerdict = (v) => { const p = leadingPhrase(v); return VERDICT_WORDS.indexOf(p.toLowerCase()) !== -1 ? p : null; };
const acceptStamp = (v) => { const p = leadingPhrase(v).toLowerCase(); return STAMP_WORDS.indexOf(p) !== -1 ? p : null; };
const acceptStatus = (v) => { const p = leadingPhrase(v).toLowerCase(); return Object.prototype.hasOwnProperty.call(STATUS_WORDS, p) ? STATUS_WORDS[p] : null; };
// A commit named by a structured field: 7 to 40 hex characters as a word. Shape only:
// the collector does not resolve it against the repository (the stated limit).
const HEX_RE = /(?:^|[\s`(])([0-9a-f]{7,40})(?=$|[\s`).,;])/i;
const acceptFix = (v) => { const m = String(v).match(HEX_RE); return m ? m[1].toLowerCase() : null; };
// A RED-first field names a test file (a path with an extension) and a commit.
const acceptRedFirst = (v) => {
  const s = String(v).replace(/`/g, ' ');
  return (/(?:^|\s)[\w./\\-]*\w\.\w+(?=$|[\s,;])/.test(s) && HEX_RE.test(s)) ? s.trim() : null;
};

// ---------------------------------------------------------------------------
// Committed bytes (M34.5.F.10): every file collectArc reads comes from a commit.
// ---------------------------------------------------------------------------

function gitIn(cwd) {
  const run = (args) => spawnSync('git', args, { cwd: cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const ok = (r) => !r.error && r.status === 0;
  return {
    head() { const r = run(['rev-parse', '--verify', '-q', 'HEAD']); return ok(r) ? ((r.stdout || '').trim() || null) : null; },
    // The bytes of <path> at <commit>; null when the path is absent there.
    read(commit, rel) { const r = run(['show', commit + ':' + rel]); return ok(r) ? r.stdout : null; },
    // The files directly under <dir>/ at <commit>, by name.
    list(commit, dir) {
      const r = run(['ls-tree', '-z', '--name-only', commit, '--', dir + '/']);
      if (!ok(r)) return [];
      return (r.stdout || '').split('\0').filter(Boolean).map((p) => p.slice(dir.length + 1)).filter((n) => n && n.indexOf('/') === -1);
    },
    // The last commit that touched each path, from ONE log pass over <paths> (the
    // first commit that lists a path is the one `git log -1 -- <path>` names).
    lastTouch(commit, paths) {
      const out = new Map();
      const r = run(['log', '--format=%x01%H', '--name-only', '-z', commit, '--'].concat(paths));
      if (!ok(r)) return out;
      let cur = null;
      for (const tok of (r.stdout || '').split('\0')) {
        let t = tok.replace(/^\n+/, '');
        if (t.charAt(0) === '\x01') {
          const nl = t.indexOf('\n');
          cur = nl === -1 ? t.slice(1) : t.slice(1, nl);
          t = nl === -1 ? '' : t.slice(nl + 1).replace(/^\n+/, '');
        }
        if (t && cur && !out.has(t)) out.set(t, cur);
      }
      return out;
    },
    shallow() { const r = run(['rev-parse', '--is-shallow-repository']); return ok(r) && (r.stdout || '').trim() === 'true'; },
    dirty() { const r = run(['status', '--porcelain']); return ok(r) && (r.stdout || '').trim() !== ''; },
  };
}

// One file's bytes at HEAD (the reader build-receipts uses for project-config.md).
function readCommitted(cwd, rel) {
  const g = gitIn(cwd);
  const head = g.head();
  return head ? g.read(head, rel) : null;
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

// The collectors' class table, DERIVED from classify's own source (M28.L, owner
// requirement 3 round 2): the record kinds the report knows how to summarize are
// exactly the classifier's case list — one authority, nothing typed by hand, so
// the rendered "N specific record types" can never drift from the switch above.
const RECORD_KINDS = Object.freeze([...classify.toString().matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));

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
  let seq = 0;
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
      kind: 'commit', seq: seq++, // seq: git log's own order, 0 the newest (the provenance range reads it)
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

// The milestone verdict, from a structured `verdict:` line in the closed vocabulary
// only. Returns the word, or null. A body with no such line claims nothing.
function parseVerdict(body) {
  const c = structuredClaim(stripTemplate(body), 'verdict', acceptVerdict);
  return c && c.value ? c.value : null;
}
// The line a verdict reader would quote when no structured verdict is read: a
// field-shaped `verdict:` line outside the vocabulary, else the first body line that
// names a verdict word. null when the body names none (nothing is claimed).
const VERDICT_MENTION_RE = /\bverdict\b|\bsound\b|\bnot ready\b|\bfriction-heavy\b/i;
function unreadVerdictLine(body) {
  const text = stripTemplate(body);
  const c = structuredClaim(text, 'verdict', acceptVerdict);
  if (c && c.value) return null;
  if (c && c.unread) return c.unread;
  const hit = text.split('\n').map((l) => l.trim()).find((l) => l && VERDICT_MENTION_RE.test(l));
  return hit || null;
}
function parseFnr(body) {
  const m = body.match(/FNR\s*=\s*(\d+)\s*\/\s*(\d+)/i);
  return m ? { num: parseInt(m[1], 10), den: parseInt(m[2], 10) } : null;
}

function collectChangelog(opts) {
  opts = opts || {};
  const text = stripTemplate(opts.text || '');
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
    const unread = verdict ? null : unreadVerdictLine(body);
    const rec = {
      kind: 'milestone',
      milestone: e.milestone, title: e.title, date: e.date, verdict: verdict, fnr: fnr,
      source: source, evidence: e.milestone + ' — ' + e.title, frozen: true,
      receipt: makeReceipt({
        subjectName: source + '#' + e.milestone,
        claims: [{ kind: 'shipped', text: e.milestone + (verdict ? ' — ' + verdict : '') }],
        source: source, commit: commit,
        limitation: 'verdict read only from a structured verdict: line in the closed vocabulary; FNR read from the CHANGELOG text, not recomputed; ' + FROZEN_TAIL,
      }),
    };
    if (unread) rec.unread = [{ field: 'verdict', line: unread }];
    emitReceipt(out, rec);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Retrospective collector — the fenced rework/stamp blocks (shared primitive),
// the budget line, the RED-first pre-flight → stage-rework + control records.
// ---------------------------------------------------------------------------

// The owner's stamp, from the user-stamp fence on template-stripped text: a verdict
// in the closed vocabulary (pass, fail) or a grandfathered score. A verdict outside it
// is UNREAD (s.unread carries the line); the unfilled template's placeholder line is
// stripped, so it is no stamp at all.
function parseStamp(text) {
  const blocks = fenced.extractBlocks(stripTemplate(text), 'user-stamp');
  if (!blocks.length) return null;
  const b = blocks[0];
  const verdict = fenced.fieldInBlock(b, 'verdict');
  const score = fenced.fieldInBlock(b, 'score');
  if ((verdict == null || verdict === '') && score == null) return null;
  const s = {};
  if (verdict != null && verdict !== '') {
    const v = acceptStamp(verdict);
    if (v) s.verdict = v; else s.unread = 'verdict: ' + verdict;
  }
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
    if (impl != null || ver != null) {
      const out = { implementation: impl, verifier: ver, irl: irl, postMerge: pm };
      // M26.F (Workstream 5): the OPTIONAL origin split — framework-originated vs
      // project-originated rework, declared in the same fence (G15's parseKV grammar
      // tolerates the extra lines). Undeclared → no origin key: attribution stays
      // UNKNOWN (reworkOriginSplit renders that as null, never zero).
      const of = intOrNull(fenced.fieldInBlock(b, 'origin-framework'));
      const op = intOrNull(fenced.fieldInBlock(b, 'origin-project'));
      if (of != null || op != null) out.origin = { framework: of, project: op };
      return out;
    }
  }
  // Prose fallback — M20.6-style retros carry the four-type rework as PROSE, not
  // a fenced block. A bounded, stated parse limitation (not the canonical form).
  const m = text.match(/[Ii]mplementation\s+(\d+)[\s\S]{0,120}?verifier\s+(\d+)[\s\S]{0,60}?irl\s+(\d+)[\s\S]{0,60}?post-merge\s+(\d+)/);
  if (m) return { implementation: +m[1], verifier: +m[2], irl: +m[3], postMerge: +m[4], prose: true };
  return null;
}

// reworkOriginSplit(rework) → { framework, project, unattributed } — the M26.F
// attribution surface. Null-never-zero: an undeclared origin resolves to
// { framework: null, project: null, unattributed: <total> } (unknown attribution is
// stated, never zeroed into "no framework rework"). Over-attribution (declared origin
// events exceeding the declared rework total) is REFUSED as invalid — the split can
// never claim more rework than the fence records.
function reworkOriginSplit(rw) {
  if (!rw || typeof rw !== 'object') return null;
  let total = 0;
  for (const k of ['implementation', 'verifier', 'irl', 'postMerge']) {
    if (typeof rw[k] === 'number' && rw[k] > 0) total += rw[k];
  }
  const o = rw.origin;
  const f = (o && typeof o.framework === 'number') ? o.framework : null;
  const p = (o && typeof o.project === 'number') ? o.project : null;
  if (f === null && p === null) {
    return { framework: null, project: null, unattributed: total };
  }
  const attributed = (f || 0) + (p || 0);
  if (attributed > total) {
    return {
      framework: f, project: p, unattributed: null, invalid: true,
      reason: 'over-attribution refused: declared origin total ' + attributed + ' exceeds the fence\'s rework total ' + total,
    };
  }
  return { framework: f, project: p, unattributed: total - attributed };
}

function parseBudget(text) {
  const m = text.match(/Self-correction budget for this stage:\**\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// The files a collector reads: committed entries ({ name, text, commit }, what
// collectArc passes), or - for a direct caller - a dir or file paths on disk.
function sourceEntries(opts, nameRe) {
  if (Array.isArray(opts.entries)) return opts.entries.filter((e) => e && nameRe.test(e.name));
  let files = opts.files;
  if (!files) {
    try { files = fs.readdirSync(opts.dir).filter((n) => nameRe.test(n)).map((n) => path.join(opts.dir, n)); }
    catch (_) { files = []; }
  }
  const out = [];
  for (const f of files) {
    try { out.push({ name: path.basename(f), text: fs.readFileSync(f, 'utf8'), commit: opts.commit }); } catch (_) { /* unreadable: skipped */ }
  }
  return out;
}

// A retro that names RED-first only in prose (no red-first: field line): counts nothing.
function mentionsRedFirstInProseOnly(text) {
  const t = stripTemplate(text);
  return /RED-first/i.test(t) && fieldLines(t, 'red-first').length === 0;
}

function collectRetros(opts) {
  opts = opts || {};
  const out = [];
  for (const ent of sourceEntries(opts, /-retrospective\.md$/)) {
    const raw = ent.text;
    const text = stripTemplate(raw);
    const commit = ent.commit;
    const base = ent.name;
    const sm = base.match(/^(M[\w.]+?)-retrospective\.md$/);
    const stage = sm ? sm[1] : base;
    const stamp = parseStamp(raw);
    const rework = parseRework(text);
    const budget = parseBudget(text);
    // A RED-first control only from a structured field naming the test file and the
    // commit; a field line outside that shape is UNREAD; prose counts nothing.
    const redFirst = structuredClaim(text, 'red-first', acceptRedFirst);
    const unread = [];
    if (stamp && stamp.unread) unread.push({ field: 'verdict', line: stamp.unread });
    // No machine-readable content (no stamp, no rework, no budget) → no
    // stage-rework record (the invention floor, at the collector level).
    if (stamp || rework || budget != null) {
      const rw = rework;
      const rec = {
        kind: 'stage-rework',
        stage: stage, stamp: stamp, rework: rework, budget: budget,
        source: base, evidence: stage + (stamp ? ' stamp' : '') + (rework ? ' rework' : ' budget'), frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + stage,
          claims: [{ kind: 'stage-rework', text: stage + (rw ? ' impl ' + rw.implementation + '/ver ' + rw.verifier : '') + (budget != null ? ' budget ' + budget : '') }],
          source: base, commit: commit,
          limitation: 'rework/budget read from the retro' + (rw && rw.prose ? ' PROSE (fallback; not the fenced block)' : ' fenced block') + '; ' + FROZEN_TAIL,
        }),
      };
      if (unread.length) rec.unread = unread.slice();
      emitReceipt(out, rec);
    }
    if (redFirst && redFirst.value) {
      emitReceipt(out, {
        kind: 'control', control: 'red-first', stage: stage, field: redFirst.line,
        source: base, evidence: stage + ' RED-first', frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + stage + ':red-first',
          claims: [{ kind: 'worked', text: stage + ' RED-first cycle (a demonstrated control): ' + redFirst.value }],
          source: base, commit: commit,
          limitation: 'the RED-first control is read from a structured red-first: line naming the test file and the commit, rendered as written (its shape is checked, not its truth); ' + FROZEN_TAIL,
        }),
      });
    }
    // A red-first: line that names no test file and commit is no control; collectArc
    // quotes it in coverage (redFirstUnread), since a retro may carry no record at all.
  }
  return out;
}

// The red-first: field line a retro carries that is not a control, or null.
function redFirstUnread(text) {
  const c = structuredClaim(stripTemplate(text), 'red-first', acceptRedFirst);
  return c && c.unread ? c.unread : null;
}

// ---------------------------------------------------------------------------
// Verifier-findings collector — severities → broke.
// ---------------------------------------------------------------------------

const FINDINGS_NAME_RE = /V-findings\.md$|-findings\.md$/;

// A finding is fixed only when its own segment (its heading to the next heading)
// carries a structured `status: resolved|fixed` line or a `fix: <commit>` line; a
// status outside the vocabulary is UNREAD; anything else is open.
function findingResolution(seg) {
  const fix = structuredClaim(seg, 'fix', acceptFix);
  if (fix && fix.value) return { fixed: true, fix: fix.value };
  const st = structuredClaim(seg, 'status', acceptStatus);
  if (st && st.value) return { fixed: st.value === 'fixed', fix: null };
  const unread = [];
  if (st && st.unread) unread.push({ field: 'status', line: st.unread });
  if (fix && fix.unread) unread.push({ field: 'fix', line: fix.unread });
  return { fixed: false, fix: null, unread: unread };
}

function collectVerifierFindings(opts) {
  opts = opts || {};
  const out = [];
  for (const ent of sourceEntries(opts, FINDINGS_NAME_RE)) {
    const text = stripTemplate(ent.text);
    const commit = ent.commit;
    const base = ent.name;
    const mm = base.match(/^(M[\w.]+?)\.V/);
    const milestone = mm ? mm[1] : base;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hm = line.match(/^#{1,4}\s+(.*)$/);
      if (!hm) continue;
      const sev = line.indexOf('\u{1F534}') !== -1 ? 'red' : line.indexOf('\u{1F7E1}') !== -1 ? 'yellow' : line.indexOf('\u{1F7E2}') !== -1 ? 'green' : null;
      if (!sev || sev === 'green') continue; // only red/yellow are breaks; a green rider is a nice-to-have (tech-debt)
      let j = i + 1;
      while (j < lines.length && !/^#{1,4}\s/.test(lines[j])) j++;
      const res = findingResolution(lines.slice(i + 1, j).join('\n'));
      const rec = {
        kind: 'verifier-finding', milestone: milestone, severity: sev, title: hm[1], fixed: res.fixed,
        source: base, evidence: hm[1], frozen: true,
        receipt: makeReceipt({
          subjectName: base + '#' + hm[1].slice(0, 40),
          claims: [{ kind: 'broke', text: '[' + sev + '] ' + hm[1] + (res.fixed ? ' (fixed' + (res.fix ? ' by ' + res.fix : '') + ')' : '') }],
          source: base, commit: commit,
          limitation: 'severity read from the finding heading marker; fixed only from a structured status: or fix: line, rendered as written; ' + FROZEN_TAIL,
        }),
      };
      if (res.fix) rec.fix = res.fix;
      if (res.unread && res.unread.length) rec.unread = res.unread;
      emitReceipt(out, rec);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tech-debt collector — TD rows → unclassified (deferred backlog).
// ---------------------------------------------------------------------------

function collectTechDebt(opts) {
  opts = opts || {};
  const text = stripTemplate(opts.text || '');
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
  // The shipped ledger's example entry sits in an HTML comment: stripped, never a
  // transition (the class G16 already strips for, the same primitive).
  const text = stripTemplate(opts.text || '');
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
      // unsigned hash. The live path has produced real attestations since v1.0.2.
      attestation = { ref: att[1], sha256: att[2] };
      subjects.push({ name: 'attestation:' + att[1], digest: { sha256: att[2] } });
      limitation = 'attestation LINKED by reference + digest (never an embedded unsigned hash). ' + FROZEN_TAIL;
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
  const seen = new Set();
  for (const c of commits) {
    const ms = closeoutMilestone(c.subject);
    if (!ms) continue;
    const row = rowByMs.get(ms);
    if (!row) continue; // requires BOTH — a CHANGELOG-only closeout invents no completion (the M14–M16 case)
    // One completion per milestone (M34.5.F.10): commits arrive newest first, so a
    // second closeout commit for the same milestone adds nothing.
    if (seen.has(ms)) continue;
    seen.add(ms);
    emitReceipt(out, {
      kind: 'milestone-complete', milestone: ms,
      closeoutCommit: c.hash, releaseRow: row.date || row.milestone,
      source: 'derived', evidence: (c.hash || ms) + '+' + ms, frozen: true,
      receipt: makeReceipt({
        subjectName: 'milestone:' + ms,
        claims: [{ kind: 'shipped', text: ms + ' milestone-complete (closeout commit + release-state row)' }],
        source: 'derived (commit+release-state)', commit: c.hash || commit,
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

  // The report commit: every file below is read from it with `git show`, never from
  // the working tree (M34.5.F.10). A dirty tree is stated, and its changes are not read.
  const g = gitIn(cwd);
  const commit = opts.commit || g.head();
  let findingsFiles = 0;
  if (!commit) {
    coverage.push('no commit to read: the repository has no commits yet, so no ledger, retrospective or findings file was collected');
  } else {
    if (g.dirty()) {
      coverage.push('working tree has uncommitted changes: this report reads commit ' + commit.slice(0, 12) + ' only; the uncommitted changes are not in it. The event ledgers under .claude/receipts/ are read from disk, since they are never committed');
    }
    if (g.shallow()) {
      coverage.push('shallow clone: a record\'s commit is the last commit this clone holds that touched its source, which may be the shallow boundary rather than the commit that changed it');
    }
  }

  let commits = [];
  try { commits = collectCommits({ cwd: cwd, range: range }); records.push(...commits); }
  catch (e) { coverage.push('git log unavailable for ' + range + ': ' + e.message); }

  if (commit) {
    const LEDGERS = ['CHANGELOG.md', 'docs/release-state.md', 'docs/tech-debt.md'];
    const retroNames = g.list(commit, 'retrospectives');
    const retroPaths = retroNames.filter((n) => /-retrospective\.md$/.test(n) || FINDINGS_NAME_RE.test(n)).map((n) => 'retrospectives/' + n);
    // Each record is bound to the last commit that touched its source.
    const touch = g.lastTouch(commit, LEDGERS.concat(['retrospectives/']));
    const at = (rel) => touch.get(rel) || commit;
    const cl = g.read(commit, 'CHANGELOG.md');
    if (cl != null) records.push(...collectChangelog({ text: cl, source: 'CHANGELOG.md', commit: at('CHANGELOG.md') }));
    const rs = g.read(commit, 'docs/release-state.md');
    let releaseRows = [];
    if (rs != null) { const rows = collectReleaseState({ text: rs, source: 'docs/release-state.md', commit: at('docs/release-state.md') }); records.push(...rows); releaseRows = rows; }
    const td = g.read(commit, 'docs/tech-debt.md');
    if (td != null) records.push(...collectTechDebt({ text: td, source: 'docs/tech-debt.md', commit: at('docs/tech-debt.md') }));
    const entries = [];
    for (const rel of retroPaths) {
      const text = g.read(commit, rel);
      if (text != null) entries.push({ name: rel.slice('retrospectives/'.length), text: text, commit: at(rel) });
    }
    records.push(...collectRetros({ entries: entries }));
    records.push(...collectVerifierFindings({ entries: entries }));
    findingsFiles = entries.filter((e) => FINDINGS_NAME_RE.test(e.name)).length;
    // RED-first said only in prose, or in a red-first: line that names no test file
    // and commit, is no control: each field line is quoted, prose is counted once.
    let proseOnly = 0;
    for (const e of entries) {
      if (!/-retrospective\.md$/.test(e.name)) continue;
      const u = redFirstUnread(e.text);
      if (u) coverage.push('not a structured claim, shown as UNKNOWN: retrospectives/' + e.name + ': "' + u + '"');
      else if (mentionsRedFirstInProseOnly(e.text)) proseOnly += 1;
    }
    if (proseOnly > 0) {
      coverage.push(proseOnly + ' retrospective(s) name RED-first only in prose, with no red-first: line naming the test file and the commit, so they count no control');
    }
    if (commits.length && releaseRows.length) {
      records.push(...deriveMilestoneCompletion({ commits: commits, releaseRows: releaseRows, commit: commit }));
    }
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

  return { records: records, summary: summary, coverage: coverage, findings_files: commit ? findingsFiles : null };
}

module.exports = {
  COLLECTOR_VERSION,
  STAGE_COMMIT_RE,
  emitReceipt,
  classify,
  RECORD_KINDS,
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
  reworkOriginSplit,
  parseStamp,
  parseBudget,
  // M34.5.F.10: the one stripper, the one rule, the committed reader
  stripTemplate,
  structuredClaim,
  VERDICT_WORDS,
  findingResolution,
  readCommitted,
};
