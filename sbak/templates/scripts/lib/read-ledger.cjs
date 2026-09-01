#!/usr/bin/env node
// @kit-version 1.0.5
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

// `<path>  when: <boundary>  [- why]`  ->  { path, when, why, explicit, valid }
function parseListLine(line) {
  const l = String(line || '').trim();
  if (!l || l.startsWith('#')) return null;
  const sp = l.search(/\s/);
  const p = sp === -1 ? l : l.slice(0, sp);
  const rest = sp === -1 ? '' : l.slice(sp).trim();
  if (!rest) return { path: p, when: WHEN_DEFAULT, why: '', explicit: false, valid: true };
  const m = /^when:\s*([A-Za-z0-9-]+)\s*(?:-\s*(.*))?$/.exec(rest);
  if (!m) return { path: p, when: rest, why: '', explicit: true, valid: false };
  const when = m[1].toLowerCase();
  return { path: p, when, why: (m[2] || '').trim(), explicit: true, valid: WHEN_VOCAB.indexOf(when) !== -1 };
}

function realOrLexical(p) {
  try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); }
}
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

// Bash: which existing repo files does this command NAME? Exact, not fuzzy.
const MAX_REFS_PER_COMMAND = 16;
function readRefsFromBash(root, command) {
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
    const ref = refForPath(root, tok);
    if (ref && !seen.has(ref)) { seen.add(ref); out.push(ref); if (out.length >= MAX_REFS_PER_COMMAND) break; }
  }
  return out;
}

// ---- role / list resolution (mirrors the SessionStart hook's candidate order) ----
const VALID_ROLES = ['work', 'verifier', 'orchestrator', 'refactor'];
const LIST_BY_ROLE = { work: 'read-first-list.txt', verifier: 'read-first-list-verifier.txt', orchestrator: 'read-first-list-orchestrator.txt', refactor: 'read-first-list-refactor.txt' };
const NUL = String.fromCharCode(0);
function decodeBytes(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
}
function currentRole(root) {
  try {
    const t = decodeBytes(fs.readFileSync(path.join(root, '.claude', 'role'))).split(NUL).join('').trim().toLowerCase();
    return VALID_ROLES.indexOf(t) !== -1 ? t : null;
  } catch (_) { return 'work'; } // absent = the one legitimate default
}
function readConfigValue(text, key) {
  const k = key.replace(/_/g, '[_ ]');
  const row = text.match(new RegExp('^\\|\\s*' + k + '\\s*\\|\\s*`?([A-Za-z][\\w-]*)`?\\s*\\|', 'mi'));
  const field = row || text.match(new RegExp(k + '\\s*[:*]+\\s*`?([A-Za-z][\\w-]*)`?', 'i'));
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
// Each required read is { canonical, display }: the canonical (lowercased) path drives the
// hash; `display` is the path as the list or stage prompt wrote it, for the refusal line.
function requiredReads(root, boundary, stageId) {
  const listFile = resolveListFile(root);
  const req = [];
  const add = (canonical, display) => { if (canonical && !req.some((r) => r.canonical === canonical)) req.push({ canonical, display }); };
  if (listFile) {
    for (const e of loadManifest(listFile)) {
      if (!e.valid || e.when !== boundary) continue;
      add(canonicalRel(root, e.path), e.path);
    }
  }
  if (stageId && boundary === 'stage-open') for (const r of stagePromptReadFirst(root, stageId)) add(r.canonical, r.display);
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
function recordedRefs(root, scope) {
  const refs = new Set();
  const ledgers = readAllLedgers(root);
  if (scope && scope.stage) {
    for (const l of ledgers) {
      const touches = l.events.some((e) => e.stage === scope.stage);
      for (const e of l.events) {
        if (e.event !== 'file_read' || !e.read_ref) continue;
        if (e.stage === scope.stage || touches) refs.add(e.read_ref);
      }
    }
    return refs;
  }
  const role = (scope && scope.role) || currentRole(root) || 'work';
  let newest = null;
  for (const l of ledgers) for (const e of l.events) {
    if (e.event === 'session_started' && e.role === role && (!newest || e.at > newest.at)) newest = { at: e.at, ledger: l };
  }
  if (!newest) return refs;
  for (const e of newest.ledger.events) if (e.event === 'file_read' && e.read_ref) refs.add(e.read_ref);
  return refs;
}

// The check. Returns { required: [rel...], missing: [rel...] } (canonical, lowercased).
function checkReads(root, opts) {
  const o = opts || {};
  const boundary = o.boundary || 'stage-open';
  const required = requiredReads(root, boundary, o.stage);
  const have = recordedRefs(root, o.stage ? { stage: o.stage } : { role: o.role });
  const missing = required.filter((r) => !have.has(refFor(r.canonical))).map((r) => r.display);
  return { boundary, required: required.map((r) => r.display), missing };
}

module.exports = {
  WHEN_VOCAB, WHEN_DEFAULT, MAX_REFS_PER_COMMAND,
  parseListLine, canonicalRel, refFor, refForPath, readRefsFromBash,
  resolveListFile, loadManifest, stagePromptReadFirst, requiredReads, recordedRefs, checkReads,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--check');
  if (i === -1) {
    process.stderr.write('usage: node scripts/lib/read-ledger.cjs --check <stage-open|verify|closeout> [--stage <id>]\n');
    process.exit(2);
  }
  const boundary = argv[i + 1];
  if (WHEN_VOCAB.indexOf(boundary) === -1) { process.stderr.write(`read-ledger: unknown boundary ${JSON.stringify(boundary)} (one of: ${WHEN_VOCAB.join(', ')})\n`); process.exit(2); }
  const si = argv.indexOf('--stage');
  const stage = si !== -1 ? argv[si + 1] : undefined;
  const res = checkReads(process.cwd(), { boundary, stage });
  if (res.missing.length) {
    process.stderr.write(`read-ledger: required reads not recorded for ${boundary}${stage ? ' ' + stage : ''}: ${res.missing.join(', ')} - read them, then re-run.\n`);
    process.exit(2);
  }
  process.stdout.write(`read-ledger: ${boundary}${stage ? ' ' + stage : ''} - ${res.required.length} required read(s) recorded.\n`);
  process.exit(0);
}
