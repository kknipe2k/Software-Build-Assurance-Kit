#!/usr/bin/env node
// @kit-version 1.0.8
// scripts/lib/read-ledger.cjs
//   (kit source of truth: templates/scripts/lib/read-ledger.cjs)
//
// The READ LEDGER (M30.G, lazy orientation) - the mechanical consumption check that replaced
// the eager session-start inline. Why it exists: the V104 field test proved instruction-
// skipping is real (a builder silently skipped the spec's IRL/HITL section), and inlining
// 176-289 KB of orientation before the first user turn was the only defence. Under lazy
// orientation the agent reads each orientation file at its `when:` boundary with its own
// tools; the lifecycle adapter records every Read-tool and Bash read as a `file_read` event
// on the receipts stream (ONE stream, one reader - never a second sink), and the boundary's
// gate asks this module whether the required reads happened. A stage that proceeds without
// its reads is REFUSED at approve-red.
//
// What this module owns:
//   * the `when:` VOCABULARY and the list-line grammar   `<path>  when: <boundary>  [- why]`
//     (an entry with no when: is `session-start` - a pre-M30 list keeps today's behaviour);
//   * path canonicalisation - the same file read as ./docs/x.md, docs/x.md and by its absolute
//     path is ONE read: resolved against the repo root (realpath where it exists), confined inside
//     it, forward slashes, LOWERCASED (Windows is case-insensitive; one rule everywhere);
//   * the read_ref - 16 hex of sha256 over the canonical relative path. The receipts privacy
//     floor is "no paths, ever"; the gate re-hashes its required entries, so the ledger never
//     carries a path and still answers the question;
//   * the Bash tokenizer - a command names a read when a whitespace / `;|&()<>`-split token
//     (quotes stripped) resolves EXACTLY to an existing regular file inside the repo. No
//     substring matching; tokens after a `>` / `>>` redirect are targets, not reads; capped
//     at 16 refs per command. Honest scope: the ledger proves a file was NAMED by a read, not
//     comprehended - the same honesty as any read ledger;
//   * the required set per boundary - the resolved list's entries tagged with that boundary,
//     plus (for stage-open) every path token in the open stage prompt's <read_first>;
//   * the check itself, and a small CLI:  node scripts/lib/read-ledger.cjs --check <boundary>
//   * the measure line (M33.G):           node scripts/lib/read-ledger.cjs --measure <stage>
//
// M33.F - context assembly. Two more list-entry forms, one resolver each, shared by the loader,
// `--check` and this gate:
//   * `view: <stage>  when: <boundary>` - the open stage's generated view (scripts/stage-view.cjs
//     writes .claude/views/<stage>.<role>.md from HEAD with a `sources:` header of HEAD blob ids).
//     The gate re-hashes every source against HEAD: a source that moved is a STALE view, refused
//     with the rebuild line; a source it cannot hash is refused, never accepted; the recorded read
//     must carry exactly the header's ids (the receipts row's `view_sources`). A current view read
//     satisfies a stage prompt's <read_first> path that is one of its sources (R-68 Q1); a list
//     entry is never satisfied that way (a whole-file entry a project keeps still binds);
//   * a `*` in an entry's LAST path segment resolves to exactly one file; zero or two matches is a
//     dead entry, never the first match (the lists name docs/build-prompts/M01-*.md).
//
// Which gate checks which boundary (per role - a verifier session must not sail through):
//   stage-open  -> scripts/approve-red.cjs (gate 2; work, or refactor if it opens a stage)
//   verify      -> `--check verify`   named as /verify step 1 (verifier)
//   closeout    -> `--check closeout` named as /closeout step 1 (work)
//   session-start / host / phase-N / on-demand -> no mechanical gate (inlined by the hook /
//   loaded by Claude Code itself / bootstrap has no script gate / the orchestrator never edits).
//
// Cross-platform (Node, no shell-isms). Requires only the frozen receipts contract next to it.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The fixed when: vocabulary. An unknown token is refused loudly by the hook and by --check.
const WHEN_VOCAB = Object.freeze(['session-start', 'host', 'stage-open', 'verify', 'closeout', 'phase-0', 'phase-1', 'phase-3', 'on-demand']);
const WHEN_DEFAULT = 'session-start';
// M33.F: the view form's one target token, and the boundaries a view is read at.
const VIEW_TARGET = '<stage>';
const VIEW_WHEN = ['stage-open', 'verify', 'closeout', 'on-demand'];

// `<path>  when: <boundary>  [- why]`  ->  { path, when, why, explicit, valid }
// `view: <stage>  when: <boundary>  [- why]`  ->  the same plus { kind: 'view', target, reason }
function parseListLine(line) {
  const l = String(line || '').trim();
  if (!l || l.startsWith('#')) return null;
  const v = /^view:\s*(\S*)\s*(.*)$/.exec(l);
  if (v) {
    const wm = /^when:\s*([A-Za-z0-9-]+)\s*(?:-\s*(.*))?$/.exec(v[2]);
    const when = wm ? wm[1].toLowerCase() : v[2];
    const reason = v[1] !== VIEW_TARGET ? `the one view form is view: ${VIEW_TARGET} (the open stage's view)`
      : !wm || VIEW_WHEN.indexOf(when) === -1 ? `a view is read at when: ${VIEW_WHEN.join(' / ')}` : '';
    return { path: 'view: ' + v[1], kind: 'view', target: v[1], when, why: wm ? (wm[2] || '').trim() : '', explicit: true, valid: !reason, reason };
  }
  const sp = l.search(/\s/);
  const p = sp === -1 ? l : l.slice(0, sp);
  const rest = sp === -1 ? '' : l.slice(sp).trim();
  if (!rest) return { path: p, when: WHEN_DEFAULT, why: '', explicit: false, valid: true };
  const m = /^when:\s*([A-Za-z0-9-]+)\s*(?:-\s*(.*))?$/.exec(rest);
  if (!m) return { path: p, when: rest, why: '', explicit: true, valid: false };
  const when = m[1].toLowerCase();
  return { path: p, when, why: (m[2] || '').trim(), explicit: true, valid: WHEN_VOCAB.indexOf(when) !== -1 };
}

// decodeBytes + realOrLexical: the shared hook helpers (M32.A fold of M32.R Dup-1 / Dup-2).
const { decodeBytes, realOrLexical } = require(path.join(__dirname, 'hook-root.cjs'));
// Canonical relative path of an existing regular file inside `root`, or null.
function canonicalRel(root, p) {
  if (typeof p !== 'string' || !p) return null;
  let abs;
  try { abs = realOrLexical(path.resolve(root, p)); } catch (_) { return null; }
  const base = realOrLexical(root);
  const rel = path.relative(base, abs);
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  try { if (!fs.statSync(abs).isFile()) return null; } catch (_) { return null; }
  return rel.split(path.sep).join('/').toLowerCase();
}
function refFor(canonical) {
  return crypto.createHash('sha256').update('sbak-read:' + canonical, 'utf8').digest('hex').slice(0, 16);
}
function refForPath(root, p) {
  const c = canonicalRel(root, p);
  return c === null ? null : refFor(c);
}

// Bash: which existing repo files does this command NAME? Exact, not fuzzy. -> [{ canonical, abs }]
const MAX_REFS_PER_COMMAND = 16;
function readPathsFromBash(root, command) {
  if (typeof command !== 'string' || !command) return [];
  const out = [];
  const seen = new Set();
  let afterRedirect = false;
  // walk the raw string so a `>` / `>>` marks the NEXT token as a redirect TARGET, not a read
  const parts = command.match(/>>?|[^\s;|&()<>]+/g) || [];
  for (const part of parts) {
    if (part === '>' || part === '>>') { afterRedirect = true; continue; }
    if (afterRedirect) { afterRedirect = false; continue; }
    let tok = part.replace(/^['"`]+|['"`]+$/g, '');
    if (!tok || tok.startsWith('-')) continue;
    if (!/[\\/.]/.test(tok)) continue; // a bare word is never a path
    const canonical = canonicalRel(root, tok);
    if (canonical && !seen.has(canonical)) { seen.add(canonical); out.push({ canonical, abs: path.resolve(root, tok) }); if (out.length >= MAX_REFS_PER_COMMAND) break; }
  }
  return out;
}
function readRefsFromBash(root, command) { return readPathsFromBash(root, command).map((p) => refFor(p.canonical)); }

// M33.F: an entry's path with a `*` in its LAST segment resolves to exactly one file.
// -> { rel } (the path itself when it carries no `*`) | { dead: '<why>' }
function resolveListPath(root, p) {
  const rel = String(p).replace(/\\/g, '/');
  if (rel.indexOf('*') === -1) return { rel };
  const dir = path.posix.dirname(rel);
  if (dir.indexOf('*') !== -1) return { dead: 'a * is allowed in the last path segment only' };
  const re = new RegExp('^' + path.posix.basename(rel).split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  let names = [];
  try { names = fs.readdirSync(path.join(root, dir)).filter((n) => re.test(n) && fs.statSync(path.join(root, dir, n)).isFile()).sort(); } catch (_) { names = []; }
  const full = names.map((n) => (dir === '.' ? n : `${dir}/${n}`));
  if (full.length === 1) return { rel: full[0] };
  return { dead: full.length === 0 ? 'matches 0 files' : `matches ${full.length} files: ${full.join(', ')}` };
}

// ---- M33.F: the stage view (scripts/stage-view.cjs writes it; the gate and the receipts hook read it) ----
const VIEW_DIR = '.claude/views';
const MAX_VIEW_SOURCES = 24;
function viewRel(stage, role) { return `${VIEW_DIR}/${stage}.${role || 'work'}.md`; }
function isViewPath(canonical) { return /^\.claude\/views\/[^/]+\.md$/.test(String(canonical || '')); }
// The header: a `sources:` line, then one `- <path> <blob id>` line per source. -> [{ path, blob }] | null
function parseViewHeader(text) {
  const lines = String(text || '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^sources:\s*$/.test(l));
  if (at === -1) return null;
  const out = [];
  for (let i = at + 1; i < lines.length && out.length <= MAX_VIEW_SOURCES; i++) {
    const m = /^- (\S+) ([0-9a-f]{40}(?:[0-9a-f]{24})?)$/.exec(lines[i]);
    if (!m) break;
    out.push({ path: m[1], blob: m[2] });
  }
  return out.length && out.length <= MAX_VIEW_SOURCES ? out : null;
}
// The header's blob ids, in order, for the receipts row - read from the file the session read.
function viewSourcesAt(abs) {
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch (_) { return null; }
  const h = parseViewHeader(text);
  return h ? h.map((s) => s.blob) : null;
}
// The HEAD blob id of each path. -> { map: Map(path -> id | null) } | { error }
function headBlobs(root, paths) {
  const { spawnSync } = require('child_process');
  const ask = (ps) => spawnSync('git', ['rev-parse'].concat(ps.map((p) => 'HEAD:./' + p)), { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, windowsHide: true });
  const map = new Map();
  const all = ask(paths);
  if (all.error) return { error: `git could not run (${all.error.message})` };
  if (all.status === 0) {
    const ids = String(all.stdout).split(/\r?\n/).filter(Boolean);
    if (ids.length !== paths.length) return { error: 'git rev-parse answered for the wrong number of sources' };
    paths.forEach((p, i) => map.set(p, ids[i]));
    return { map };
  }
  for (const p of paths) { const r = ask([p]); map.set(p, r.status === 0 ? String(r.stdout).trim() : null); } // name the one that is not at HEAD
  return { map };
}
// -> { built: false } | { built: true, sources, stale: [path] } | { built: true, error }
function viewStatus(root, rel) {
  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { return { built: false }; }
  const sources = parseViewHeader(text);
  if (!sources) return { built: true, error: 'the view carries no readable sources: header' };
  const hb = headBlobs(root, sources.map((s) => s.path));
  if (hb.error) return { built: true, error: hb.error };
  const absent = sources.filter((s) => !hb.map.get(s.path)).map((s) => s.path);
  if (absent.length) return { built: true, error: `${absent.join(', ')} not at HEAD` };
  return { built: true, sources, stale: sources.filter((s) => hb.map.get(s.path) !== s.blob).map((s) => s.path) };
}

// ---- role / list resolution (mirrors the SessionStart hook's candidate order) ----
const VALID_ROLES = ['work', 'verifier', 'orchestrator', 'refactor'];
const LIST_BY_ROLE = { work: 'read-first-list.txt', verifier: 'read-first-list-verifier.txt', orchestrator: 'read-first-list-orchestrator.txt', refactor: 'read-first-list-refactor.txt' };
const NUL = String.fromCharCode(0);
function currentRole(root) {
  try {
    const t = decodeBytes(fs.readFileSync(path.join(root, '.claude', 'role'))).split(NUL).join('').trim().toLowerCase();
    return VALID_ROLES.indexOf(t) !== -1 ? t : null;
  } catch (_) { return 'work'; } // absent = the one legitimate default
}
function readConfigValue(text, key) {
  const k = key.replace(/_/g, '[_ ]');
  // A value starts with a letter or a digit (M33.D: kit_version is a version, 1.0.6); an unfilled
  // {{TOKEN}} matches neither, so it reads as absent.
  const row = text.match(new RegExp('^\\|\\s*' + k + '\\s*\\|\\s*`?([A-Za-z0-9][\\w.-]*)`?\\s*\\|', 'mi'));
  const field = row || text.match(new RegExp(k + '\\s*[:*]+\\s*`?([A-Za-z0-9][\\w.-]*)`?', 'i'));
  return field && field[1] ? field[1].toLowerCase() : null;
}
function operatingMode(root) {
  try { return readConfigValue(fs.readFileSync(path.join(root, 'project-config.md'), 'utf8'), 'operating_mode') || 'greenfield'; }
  catch (_) { return 'greenfield'; }
}
function resolveListFile(root, role) {
  const r = role || currentRole(root) || 'work';
  const opSlug = operatingMode(root).replace(/_/g, '');
  const candidates = [`read-first-list-${opSlug}-${r}.txt`, `read-first-list-${opSlug}.txt`, LIST_BY_ROLE[r], 'read-first-list.txt'];
  for (const name of candidates) { const f = path.join(root, '.claude', name); if (fs.existsSync(f)) return f; }
  return null;
}
function loadManifest(listFile) {
  let text;
  try { text = fs.readFileSync(listFile, 'utf8'); } catch (_) { return []; }
  const out = []; const seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const e = parseListLine(raw);
    if (!e || seen.has(e.path)) continue;
    seen.add(e.path); out.push(e);
  }
  return out;
}

// ---- the stage prompt's <read_first> (stage-open only) ----
function stagePromptReadFirst(root, stageId) {
  const docs = [];
  for (const dir of ['docs/build-prompts', 'proposals']) {
    let names = [];
    try { names = fs.readdirSync(path.join(root, dir)).filter((n) => /\.md$/i.test(n)); } catch (_) { names = []; }
    for (const n of names) docs.push(path.join(root, dir, n));
  }
  const escaped = String(stageId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp('<\\w+_stage_prompt\\s+id="' + escaped + '"', 'i');
  const files = [];
  for (const doc of docs) {
    let text;
    try { text = fs.readFileSync(doc, 'utf8'); } catch (_) { continue; }
    const at = text.search(openRe);
    if (at === -1) continue;
    const body = text.slice(at);
    const end = body.search(/<\/\w+_stage_prompt>/i);
    const prompt = end === -1 ? body : body.slice(0, end);
    const rf = /<read_first>([\s\S]*?)<\/read_first>/i.exec(prompt);
    if (!rf) continue;
    for (const fm of rf[1].matchAll(/<file>([\s\S]*?)<\/file>/gi)) {
      for (const tok of (fm[1].match(/[\w.\/\\*-]+\.[A-Za-z0-9]+/g) || [])) {
        for (const p of expandStar(root, tok)) {
          const c = canonicalRel(root, p);
          if (c && !files.some((f) => f.canonical === c)) files.push({ canonical: c, display: p.split(path.sep).join('/') });
        }
      }
    }
  }
  return files; // [{ canonical, display }]
}
// One-segment `*` expansion (read-first-list*.txt); no `**`. A token without `*` is itself.
function expandStar(root, tok) {
  if (tok.indexOf('*') === -1) return [tok];
  const dir = path.dirname(tok); const base = path.basename(tok);
  const re = new RegExp('^' + base.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  let names = [];
  try { names = fs.readdirSync(path.join(root, dir)); } catch (_) { return []; }
  return names.filter((n) => re.test(n)).map((n) => path.join(dir, n));
}

// ---- the required set and the recorded set ----
// Each required read is { canonical, display, from }: the canonical (lowercased) path drives the
// hash; `display` is the path as the list or stage prompt wrote it, for the refusal line; `from`
// says whether a list entry or the stage prompt's <read_first> required it. A view entry is
// { kind: 'view', canonical, display, stage, role } (M33.F).
function requiredReads(root, boundary, stageId, role) {
  const listFile = resolveListFile(root);
  const req = [];
  const add = (item) => { if (item.canonical && !req.some((r) => r.canonical === item.canonical)) req.push(item); };
  const r0 = role || currentRole(root) || 'work';
  if (listFile) {
    for (const e of loadManifest(listFile)) {
      if (!e.valid || e.when !== boundary) continue;
      if (e.kind === 'view') {
        const rel = stageId ? viewRel(stageId, r0) : `${VIEW_DIR}/${VIEW_TARGET}.${r0}.md`;
        add({ kind: 'view', canonical: rel.toLowerCase(), display: rel, stage: stageId || null, role: r0 });
        continue;
      }
      const rp = resolveListPath(root, e.path);
      if (rp.dead) continue; // a dead entry is --check's to name, as a missing file always was
      add({ canonical: canonicalRel(root, rp.rel), display: rp.rel, from: 'list' });
    }
  }
  if (stageId && boundary === 'stage-open') for (const r of stagePromptReadFirst(root, stageId)) add({ canonical: r.canonical, display: r.display, from: 'read_first' });
  return req;
}

function ledgerDir(root) { return path.join(root, '.claude', 'receipts'); }
function readAllLedgers(root) {
  let receipts;
  try { receipts = require('./receipts.cjs'); } catch (_) { return []; }
  const dir = ledgerDir(root);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^events-.*\.jsonl$/.test(n)).sort(); } catch (_) { return []; }
  return names.map((n) => ({ file: n, events: receipts.readLedger(path.join(dir, n)).events }));
}
// Recorded read_refs in scope. stage scope: a file_read carrying `stage`, OR any file_read in a
// ledger that carries ANY event for that stage (the /stage flow reads the Phase doc at step 3
// and writes the marker at step 4 - the pre-marker read counts). role scope (no stage): the
// ledger holding the newest session_started for that role.
// M33.F: each recorded read_ref -> the view_sources arrays its rows carried (a view read records
// the header's blob ids; any other read records none).
function recordedReads(root, scope) {
  const reads = new Map();
  const note = (e) => {
    if (e.event !== 'file_read' || !e.read_ref) return;
    if (!reads.has(e.read_ref)) reads.set(e.read_ref, []);
    if (Array.isArray(e.view_sources)) reads.get(e.read_ref).push(e.view_sources);
  };
  const ledgers = readAllLedgers(root);
  if (scope && scope.stage) {
    for (const l of ledgers) {
      const touches = l.events.some((e) => e.stage === scope.stage);
      for (const e of l.events) if (e.stage === scope.stage || touches) note(e);
    }
    return reads;
  }
  const role = (scope && scope.role) || currentRole(root) || 'work';
  let newest = null;
  for (const l of ledgers) for (const e of l.events) {
    if (e.event === 'session_started' && e.role === role && (!newest || e.at > newest.at)) newest = { at: e.at, ledger: l };
  }
  if (!newest) return reads;
  for (const e of newest.ledger.events) note(e);
  return reads;
}
function recordedRefs(root, scope) { return new Set(recordedReads(root, scope).keys()); }

// The check. Returns { boundary, required: [rel...], missing: [rel...], notBuilt, stale, reread,
// errors } - the last four name a view entry's state, each with its rebuild command. The recorded
// scope is the stage at stage-open; at verify / closeout it is the role's newest session, and a
// `stage` there only names the view.
function checkReads(root, opts) {
  const o = opts || {};
  const boundary = o.boundary || 'stage-open';
  const role = o.role || currentRole(root) || 'work';
  const required = requiredReads(root, boundary, o.stage, role);
  const reads = recordedReads(root, boundary === 'stage-open' && o.stage ? { stage: o.stage } : { role });
  const res = { boundary, required: required.map((r) => r.display), missing: [], notBuilt: [], stale: [], reread: [], errors: [] };
  const covered = new Set(); // the sources of every current, read view (R-68 Q1)
  for (const r of required.filter((x) => x.kind === 'view')) {
    const cmd = `node scripts/stage-view.cjs ${r.stage || VIEW_TARGET}${r.role !== 'work' ? ' --role ' + r.role : ''}`;
    if (!r.stage) { res.errors.push({ view: r.display, cmd, why: 'no stage is open or named' }); continue; }
    const st = viewStatus(root, r.display);
    if (!st.built) { res.notBuilt.push({ view: r.display, cmd }); continue; }
    if (st.error) { res.errors.push({ view: r.display, cmd, why: st.error }); continue; }
    if (st.stale.length) { res.stale.push({ view: r.display, cmd, paths: st.stale }); continue; }
    const seen = reads.get(refFor(r.canonical));
    if (!seen) { res.missing.push(r.display); continue; }
    const want = JSON.stringify(st.sources.map((s) => s.blob));
    if (!seen.some((vs) => JSON.stringify(vs) === want)) { res.reread.push({ view: r.display, cmd }); continue; }
    for (const s of st.sources) covered.add(s.path.toLowerCase());
  }
  for (const r of required.filter((x) => x.kind !== 'view')) {
    if (reads.has(refFor(r.canonical))) continue;
    if (r.from === 'read_first' && covered.has(r.canonical)) continue;
    res.missing.push(r.display);
  }
  return res;
}
// ---- the measure (M33.G): a stage's two numbers and its lane runs, from the record ----
// minutes: the earliest stage_opened for the stage on any ledger, to now. bytes: the whole-file
// size of each distinct file a recorded read names (the stage-scoped read refs matched over the
// tracked and untracked files and the views - an upper bound, a partial read counts whole), plus
// each session's session-start list entries (the stamp loads them once per session). lanes: the
// runs .claude/verify-last-runs.jsonl records under this stage, summed and counted per lane.
const RUNS_FILE = '.claude/verify-last-runs.jsonl';
function candidateFiles(root) {
  const { spawnSync } = require('child_process');
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, windowsHide: true, maxBuffer: 64 << 20 });
  const files = r.status === 0 ? String(r.stdout).split(NUL).filter(Boolean) : [];
  try { for (const n of fs.readdirSync(path.join(root, VIEW_DIR))) if (/\.md$/.test(n)) files.push(`${VIEW_DIR}/${n}`); } catch (_) { /* no views */ }
  return files;
}
function measure(root, stage) {
  const size = (rel) => { try { return fs.statSync(path.join(root, rel)).size; } catch (_) { return 0; } };
  let opened = null;
  const sessions = new Map(); // session -> the role its events carry
  for (const l of readAllLedgers(root)) {
    const touches = l.events.some((e) => e.stage === stage);
    for (const e of l.events) {
      if (e.event === 'stage_opened' && e.stage === stage && (!opened || e.at < opened)) opened = e.at;
      if (touches && typeof e.session === 'string' && e.session && (!sessions.has(e.session) || (!sessions.get(e.session) && e.role))) sessions.set(e.session, e.role || null);
    }
  }
  const minutes = opened ? Math.max(0, Math.floor((Date.now() - Date.parse(opened)) / 60000)) : null;
  const refs = recordedRefs(root, { stage });
  let bytes = 0;
  const seen = new Set();
  for (const rel of candidateFiles(root)) {
    const c = canonicalRel(root, rel);
    if (!c || seen.has(c) || !refs.has(refFor(c))) continue;
    seen.add(c);
    bytes += size(rel);
  }
  for (const role of sessions.values()) {
    const lf = resolveListFile(root, role || undefined);
    if (!lf) continue;
    for (const e of loadManifest(lf)) {
      if (!e.valid || e.when !== WHEN_DEFAULT || e.kind === 'view') continue;
      const rp = resolveListPath(root, e.path);
      if (!rp.dead) bytes += size(rp.rel);
    }
  }
  const lanes = {};
  let text = '';
  try { text = fs.readFileSync(path.join(root, RUNS_FILE), 'utf8'); } catch (_) { text = ''; }
  for (const raw of text.split(/\r?\n/)) {
    let j = null;
    try { j = raw.trim() ? JSON.parse(raw) : null; } catch (_) { j = null; }
    if (!j || j.stage !== stage || typeof j.lane !== 'string' || !Number.isFinite(j.totalDurationMs)) continue;
    const x = lanes[j.lane] || (lanes[j.lane] = { ms: 0, n: 0 });
    x.ms += j.totalDurationMs; x.n++;
  }
  const laneText = (l) => { const x = lanes[l] || { ms: 0, n: 0 }; return `${l} ${(x.ms / 1000).toFixed(1)} s x${x.n}`; };
  const order = ['fast', 'release'].concat(Object.keys(lanes).filter((l) => l !== 'fast' && l !== 'release').sort());
  const line = `measure: ${minutes === null ? '?' : minutes} min open, ${bytes} B read, lanes: ${order.map(laneText).join(', ')}`;
  return { stage, opened, minutes, bytes, lanes, line };
}

// The refusal lines a gate prints for a checkReads result, `label` naming what was checked.
function refusalLines(res, prefix, label) {
  const out = [];
  for (const e of res.errors || []) out.push(`${prefix}: the stage view ${e.view} cannot be judged (${e.why}) - refusing rather than accepting a view whose sources cannot be hashed; rebuild it (${e.cmd}), read it, then re-run.`);
  for (const n of res.notBuilt || []) out.push(`${prefix}: the stage view is not built - run ${n.cmd}, read ${n.view}, then re-run.`);
  for (const s of res.stale || []) out.push(`${prefix}: the stage view is stale - ${s.paths.join(', ')} changed since it was built; rebuild it (${s.cmd}), read ${s.view}, then re-run.`);
  for (const r of res.reread || []) out.push(`${prefix}: the stage view was rebuilt after you read it - read ${r.view} again, then re-run.`);
  if (res.missing.length) out.push(`${prefix}: required reads not recorded for ${label}: ${res.missing.join(', ')} - read them, then re-run.`);
  return out;
}

module.exports = {
  WHEN_VOCAB, WHEN_DEFAULT, MAX_REFS_PER_COMMAND, VIEW_TARGET, VIEW_WHEN, VIEW_DIR, MAX_VIEW_SOURCES,
  parseListLine, canonicalRel, refFor, refForPath, readRefsFromBash, readPathsFromBash, resolveListPath,
  viewRel, isViewPath, parseViewHeader, viewSourcesAt, headBlobs, viewStatus,
  resolveListFile, loadManifest, stagePromptReadFirst, requiredReads, recordedReads, recordedRefs, checkReads, refusalLines,
  currentRole,
  readConfigValue, // verify-local reads docker_leg through it (M32.1.D): one config reader
  RUNS_FILE, measure, // the measure line (M33.G): --measure here, and stage-active --clear
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mi = argv.indexOf('--measure');
  if (mi !== -1) {
    const stage = argv[mi + 1];
    if (!stage || /^-/.test(stage)) { process.stderr.write('usage: node scripts/lib/read-ledger.cjs --measure <stage>\n'); process.exit(2); }
    process.stdout.write(measure(process.cwd(), stage).line + '\n');
    process.exit(0);
  }
  const i = argv.indexOf('--check');
  if (i === -1) {
    process.stderr.write('usage: node scripts/lib/read-ledger.cjs --check <stage-open|verify|closeout> [--stage <id>] | --measure <stage>\n');
    process.exit(2);
  }
  const boundary = argv[i + 1];
  if (WHEN_VOCAB.indexOf(boundary) === -1) { process.stderr.write(`read-ledger: unknown boundary ${JSON.stringify(boundary)} (one of: ${WHEN_VOCAB.join(', ')})\n`); process.exit(2); }
  const si = argv.indexOf('--stage');
  const stage = si !== -1 ? argv[si + 1] : undefined;
  const res = checkReads(process.cwd(), { boundary, stage });
  const lines = refusalLines(res, 'read-ledger', `${boundary}${stage ? ' ' + stage : ''}`);
  if (lines.length) {
    process.stderr.write(lines.join('\n') + '\n');
    process.exit(2);
  }
  process.stdout.write(`read-ledger: ${boundary}${stage ? ' ' + stage : ''} - ${res.required.length} required read(s) recorded.\n`);
  process.exit(0);
}
