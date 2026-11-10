#!/usr/bin/env node
// @kit-version 1.0.10
// scripts/stage-view.cjs
//   (kit source of truth: templates/scripts/stage-view.cjs)
//
// THE STAGE VIEW (M33.F, context assembly). A builder used to read the whole Phase doc and the whole
// debt ledger at stage open for one section and a dozen rows. This writes one generated file per
// stage and role holding exactly what the stage prompt names, read from HEAD, with each source's
// HEAD blob id in a `sources:` header so the gate (approve-red, read-ledger --check) can prove the
// session read current bytes: a source that moved since the build is a stale view, refused.
//
//   node scripts/stage-view.cjs <stage> [--role work|orchestrator|verifier]
//     writes .claude/views/<stage>.<role>.md (gitignored, rebuilt, never edited) and prints its size
//
// What a view carries, by role:
//   work, orchestrator - the scope block (the section the stage prompt's <scope_locks> names), the
//     stage section, every TD- KF- CFI- R- row the section names (verbatim, from its ledger), each
//     <read_prior_stages> retro's Decisions block (its handoff note when it has none), and the
//     Carry-forward block of the newest earlier milestone entry in docs/gap-analysis.md;
//   verifier - the scope block, the stage section and the findings template ONLY. The bias guard is
//     by construction: that composition never calls the retro or ledger readers, and the one source
//     reader refuses a retrospectives/ path for the verifier.
//
// The stage section is the one H2 outside a code fence whose text, after `## ` and an optional `§`,
// is the stage id or `Stage <the id after the milestone>`, followed by neither a word character nor
// a dot (`## §M33.F - ...`, `## Stage A — ...`), in the one Phase doc (docs/build-prompts/ or
// proposals/, named M<nn>-*.md) that carries it; it runs to the next H2. A Phase doc with no stage
// headings at all (one task list) is the stage's section whole. The one reader of that section is
// scripts/lib/read-ledger.cjs stageSectionAt (M34.C): the approval record hashes the same text.
//
// Refused, exit 2, one `stage-view: refused - <why>` line, no view written: a missing or ambiguous
// section, a scope section the prompt names that the doc lacks, a named id no ledger carries (all of
// them named) or two files carry, a named retro absent at HEAD or with neither block, a source not
// at HEAD, more than 24 sources (the receipts row carries at most 24 ids). Usage errors exit 2 too.
// Deterministic for a given HEAD. Cross-platform (Node + git, no shell-isms).

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rl = require(path.join(__dirname, 'lib', 'read-ledger.cjs'));

const ROLES = ['work', 'orchestrator', 'verifier'];
const LEDGERS = { TD: ['docs/tech-debt.md'], KF: ['docs/kit-findings.md'], CFI: ['docs/cross-file-invariants.md'] }; // R: every docs/rulings/*.md
const FINDINGS_TEMPLATES = ['prompts/VERIFIER-FINDINGS-TEMPLATE.md', 'templates/VERIFIER-FINDINGS-TEMPLATE.md', 'sbak/templates/VERIFIER-FINDINGS-TEMPLATE.md'];

function fail(prefix, msg) { process.stderr.write(`stage-view: ${prefix}${msg}\n`); process.exit(2); }
const refuse = (msg) => fail('refused - ', msg);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- arguments ----
const argv = process.argv.slice(2);
let stage = null; let role = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--role') { role = argv[++i] || ''; continue; }
  if (argv[i].startsWith('-')) fail('', `unknown flag ${argv[i]} - usage: node scripts/stage-view.cjs <stage> [--role work|orchestrator|verifier]`);
  if (stage !== null) fail('', 'one stage id - usage: node scripts/stage-view.cjs <stage> [--role work|orchestrator|verifier]');
  stage = argv[i];
}
if (!stage || !/^M\d+(?:\.[0-9A-Za-z]+)+$/.test(stage)) fail('', 'a stage id like M01.A is required - usage: node scripts/stage-view.cjs <stage> [--role work|orchestrator|verifier]');
const root = process.cwd();
if (role === null) {
  // CFI-04: the session role through one of the five readers (channel.cjs readRole), never a sixth.
  let rr = { state: 'absent', role: 'work' };
  try { rr = require(path.join(__dirname, 'lib', 'channel.cjs')).readRole(root); } catch (_) { /* absent = work */ }
  if (rr.state === 'unresolved') refuse('.claude/role does not name a role - pass --role work|orchestrator|verifier');
  role = rr.role;
}
if (ROLES.indexOf(role) === -1) refuse(`no ${JSON.stringify(role)} view - one of ${ROLES.join(', ')}`);
const msNum = Number(/^M(\d+)/.exec(stage)[1]);

// ---- HEAD, the only source (R-68 Q6: never the working tree) ----
function git(args, input) {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 256 << 20, timeout: 60000, windowsHide: true });
  if (r.error) refuse(`git could not run (${r.error.message})`);
  return r;
}
function lsTree(dirs) {
  const r = git(['ls-tree', '--name-only', 'HEAD'].concat(dirs.map((d) => `./${d}/`)));
  return r.status === 0 ? String(r.stdout).split(/\r?\n/).filter(Boolean) : [];
}
// path -> { blob, text } | null, one `git cat-file --batch` per call (read-ledger's reader)
function headRead(paths) {
  if (role === 'verifier' && paths.some((p) => /^retrospectives\//i.test(p))) refuse('the verifier view reads no retrospectives/ file (the bias guard)');
  const r = rl.headReadAt(root, paths);
  if (!r.ok) refuse(r.why);
  return r.map;
}

// ---- markdown slices (fence-aware): read-ledger's, the ones the stage section is cut with ----
const lines = rl.mdLines;
const trimTail = rl.mdTrimTail;
const headings = rl.mdHeadings;
const sliceFrom = rl.mdSliceFrom;

const sources = new Map(); // path -> blob, in first-use order
const use = (p, rec) => { if (!sources.has(p)) sources.set(p, rec.blob); };

// ---- 1. the Phase doc and the stage section (M34.C: read-ledger stageSectionAt, the one reader
//      the approval record hashes and the channel's publishes compare) ----
const sec = rl.stageSectionAt(root, stage);
if (!sec.ok) refuse(sec.why);
const doc = { p: sec.doc, d: { blob: sec.blob, text: sec.docText } };
const section = sec.text;
use(doc.p, doc.d);

// ---- 2. the stage prompt: what it names ----
function promptIn(text) {
  const m = new RegExp(`<(\\w+)_stage_prompt\\s+id="${esc(stage)}"[^>]*>([\\s\\S]*?)</\\1_stage_prompt>`).exec(text);
  return m ? m[2] : null;
}
const prompt = promptIn(section) || promptIn(doc.d.text) || '';
const scopeRef = /<scope_locks\s+ref="([^"]*)"\s+section="([^"]*)"\s*\/>/.exec(prompt);
const priors = role === 'verifier' ? [] : Array.from(prompt.matchAll(/<retrospective\s+section="decisions">\s*([^<\s]+)\s*<\/retrospective>/g)).map((m) => m[1]);

// ---- 3. the scope block ----
let scope = null;
if (scopeRef) {
  const ref = scopeRef[1]; const title = scopeRef[2].trim();
  const rec = ref === doc.p ? doc.d : headRead([ref]).get(ref);
  if (!rec) refuse(`the scope_locks ref ${ref} is not at HEAD`);
  const ls = lines(rec.text); const hs = headings(ls);
  const m = hs.filter((h) => h.text.replace(/^§\s*/, '').startsWith(title));
  if (m.length !== 1) refuse(`the scope_locks section "${title}" ${m.length ? `matches ${m.length} headings` : 'is not'} in ${ref}`);
  scope = { ref, title, text: sliceFrom(ls, hs, m[0]) };
  use(ref, rec);
}

// ---- 4. the rows the section names (work, orchestrator) ----
const rows = [];
if (role !== 'verifier') {
  const ids = Array.from(new Set(section.match(/\b(?:TD|KF|CFI|R)-\d+[a-z]?\b/g) || []));
  const rulings = lsTree(['docs/rulings']).filter((p) => /^docs\/rulings\/[^/]+\.md$/.test(p)).sort();
  const want = new Set();
  for (const id of ids) for (const f of (id.startsWith('R-') ? rulings : LEDGERS[id.split('-')[0]])) want.add(f);
  const ledgers = headRead(Array.from(want));
  const missing = []; const twice = [];
  for (const id of ids) {
    const found = [];
    for (const f of (id.startsWith('R-') ? rulings : LEDGERS[id.split('-')[0]])) {
      const rec = ledgers.get(f);
      if (!rec) continue;
      const row = rowIn(rec.text, id);
      if (row) found.push({ f, rec, row });
    }
    if (found.length === 0) missing.push(id);
    else if (found.length > 1) twice.push(`${id} (${found.map((x) => x.f).join(', ')})`);
    else { rows.push({ id, f: found[0].f, row: found[0].row }); use(found[0].f, found[0].rec); }
  }
  if (missing.length) refuse(`§${stage} names ${missing.join(', ')}, which no ledger at HEAD carries (TD: docs/tech-debt.md, KF: docs/kit-findings.md, CFI: docs/cross-file-invariants.md, R: docs/rulings/*.md)`);
  if (twice.length) refuse(`two ledgers carry ${twice.join('; ')}`);
}
function rowIn(text, id) {
  const ls = lines(text); const hs = headings(ls);
  const h = hs.filter((x) => x.level >= 2 && x.level <= 4 && new RegExp(`^${esc(id)}(?![\\w])`).test(x.text));
  if (h.length === 1) return sliceFrom(ls, hs, h[0]);
  if (h.length > 1) return null;
  const t = ls.filter((l) => new RegExp(`^[|] ${esc(id)} [|]`).test(l));
  return t.length === 1 ? t[0] : null;
}

// ---- 5. the prior stages' decisions (work, orchestrator) ----
const decisions = [];
if (priors.length) {
  const recs = headRead(priors);
  for (const p of priors) {
    const rec = recs.get(p);
    if (!rec) refuse(`the prior retro ${p} is not at HEAD`);
    const ls = lines(rec.text); const hs = headings(ls);
    const d = hs.find((h) => h.level === 2 && /^Decisions\b/i.test(h.text));
    let block = d ? sliceFrom(ls, hs, d) : null;
    if (!block) { const fm = /^```handoff[^\n]*\n[\s\S]*?^```\s*$/m.exec(rec.text); block = fm ? fm[0] : null; } // R-68 Q5
    if (!block) refuse(`the prior retro ${p} has neither a Decisions block nor a handoff note`);
    decisions.push({ p, block });
    use(p, rec);
  }
}

// ---- 6. the carry rows (work, orchestrator) ----
let carry = null;
if (role !== 'verifier') {
  const rec = headRead(['docs/gap-analysis.md']).get('docs/gap-analysis.md');
  if (rec) {
    const ls = lines(rec.text); const hs = headings(ls);
    const entries = hs.filter((h) => h.level === 2 && /^M(\d+)\b/.test(h.text) && Number(/^M(\d+)/.exec(h.text)[1]) < msNum);
    const entry = entries[entries.length - 1]; // append-only: the newest earlier entry is the last
    if (entry) {
      const end = hs.find((h) => h.i > entry.i && h.level <= 2);
      const c = hs.find((h) => h.i > entry.i && (!end || h.i < end.i) && h.level === 3 && /Carry-forward/i.test(h.text));
      if (c) { carry = { entry: entry.text, text: sliceFrom(ls, hs, c) }; use('docs/gap-analysis.md', rec); }
    }
  }
}

// ---- 7. the findings template (verifier) ----
let findings = null;
if (role === 'verifier') {
  const recs = headRead(FINDINGS_TEMPLATES);
  const p = FINDINGS_TEMPLATES.find((x) => recs.get(x));
  if (!p) refuse(`no findings template at HEAD (${FINDINGS_TEMPLATES.join(', ')})`);
  findings = { p, text: trimTail(lines(recs.get(p).text)).join('\n') };
  use(p, recs.get(p));
}

// ---- assemble and write ----
if (sources.size > rl.MAX_VIEW_SOURCES) refuse(`${sources.size} sources, more than the ${rl.MAX_VIEW_SOURCES} one receipts row carries`);
const head = String(git(['rev-parse', '--short', 'HEAD']).stdout).trim();
const rel = rl.viewRel(stage, role);
const out = [];
out.push(`# Stage view: ${stage} (${role})`, '');
out.push(`> Generated by \`node scripts/stage-view.cjs ${stage}${role !== 'work' ? ' --role ' + role : ''}\` from HEAD ${head} - a read surface, gitignored and rebuilt, never edited. The gate judges the sources below against HEAD: a source changed since this build is a stale view, refused with the rebuild line.${role === 'verifier' ? ' The verifier view carries no retrospective text and no ledger row (the bias guard).' : ''}`, '');
out.push('sources:');
for (const [p, b] of sources) out.push(`- ${p} ${b}`);
out.push('', '---', '');
if (scope) out.push(`## [view] Scope block - "${scope.title}" (${scope.ref})`, '', scope.text, '');
else out.push('## [view] Scope block - none (the stage prompt names no <scope_locks>)', '');
out.push(`## [view] Stage section - ${stage} (${doc.p})`, '', section, '');
if (role !== 'verifier') {
  out.push(`## [view] Ledger rows the section names (${rows.length})`, '');
  for (const r of rows) out.push(`### [view] ${r.id} (${r.f})`, '', r.row, '');
  out.push(`## [view] Prior stages' decisions (${decisions.length})`, '');
  for (const d of decisions) out.push(`### [view] ${d.p}`, '', d.block, '');
  out.push(carry ? `## [view] Carry-forward (docs/gap-analysis.md, the entry "${carry.entry}")` : '## [view] Carry-forward - none (no earlier milestone entry in docs/gap-analysis.md carries one)', '');
  if (carry) out.push(carry.text, '');
} else {
  out.push(`## [view] Findings template (${findings.p})`, '', findings.text, '');
}
const text = out.join('\n');
const abs = path.join(root, rel);
try {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs + '.tmp', text, 'utf8');
  fs.renameSync(abs + '.tmp', abs);
} catch (e) { fail('', `could not write ${rel}: ${e.message}`); }
process.stdout.write(`stage-view: wrote ${rel} - ${Buffer.byteLength(text, 'utf8')} bytes, ${sources.size} sources (the ${stage} section from ${doc.p})\n`);
