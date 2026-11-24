#!/usr/bin/env node
// @kit-version 1.0.12
// validators/validate-spec-chain.cjs
//
// THE SPEC CHAIN (M34.7.A, R-189) - the original spec frozen at the bootstrap commit, the live
// spec born as its byte copy, and a hash chain from the one to the other.
//
//   spec/project-spec.md   the original: what was first agreed. Never edited after the bootstrap
//                          commit; the commit floor refuses a staged change to it.
//   spec/live-spec.md      the live spec: the only spec that changes. Born as a byte copy of the
//                          original; it may differ from it only where the chain reaches it.
//   spec/spec-chain.json   { "original": { "path", "sha256", "commit" },
//                            "live": { "path", "sha256" },
//                            "changes": [ { "file", "before", "after" }, ... ] }
//                          The chain starts at the original's sha256; each change's "before"
//                          equals the previous link; the last link equals the live spec.
//                          "commit" is written null: a commit cannot carry its own hash, so the
//                          freeze commit is read from git (the commit that added this file).
//
// Every sha256 is taken over the file's bytes with CRLF read as LF, so a checkout that converts
// line endings (core.autocrlf) hashes the same as the blob git stores.
//
// The content checks (Full), on the original at the freeze and on the live spec when it changes:
//   requirement ids  - REQ- and three or more digits (REQ-001). An id is DEFINED where it opens a
//                      list item or a table row's first cell, and referenced elsewhere; fenced
//                      blocks are skipped. Refused: an id defined twice, a REQ- token that is not
//                      that shape, a spec that defines no id.
//   assumptions      - a heading (## or ###) ending in "Assumptions", then a table with a column
//                      naming the assumption and one saying what would show it false, at least
//                      one row, both cells of every row filled (no blank, {{placeholder}}, TBD).
//
// THE CHANGE PATH (M34.7.B): every requirement change is one file, spec/changes/NNNN-<slug>.md,
// written from prompts/SPEC-CHANGE-TEMPLATE.md: the milestone that implements it, the requirement
// ids and the assumptions it touches, five fields (the current contract, the requested change, the
// behaviour preserved, the affected tests, the updated contract), the live spec's sha256 before and
// after, and the approval line. `--change <file>` checks the fields, writes the two hashes into the
// file and appends the link to the chain; the commit floor then refuses a live-spec edit staged with
// no change file, a change file not added in the same commit, a change whose "before" is not the
// previous link or whose "after" is not the staged live spec, a placeholder field, and an edit or
// deletion of a recorded change (the recorded changes are append-only). The approval line is the
// person's typed word as text: the kit checks that it is filled, not who wrote it.
// `--closeout <milestone>` walks the chain on disk, refusing one that does not close at the live
// spec, and prints the closeout's requirement-changes block: each change whose Milestone line names
// the milestone, with its ids, tests, assumptions and approval line, or "no requirement changed".
//
// A CHANGE'S IDS (M34.7.D, R-306): every id on a change's **Requirement ids:** line is defined in the
// live spec before the change or after it (an id it adds, removes or edits passes; one defined in
// neither is refused, naming it), and the template's placeholder on that line is refused. --change
// reads "before" as the previous link's bytes (HEAD's live spec, the index's, or the original, the
// one whose sha256 is the link; failing all three, a change recorded on an uncommitted one, HEAD's).
// The floor reads HEAD's live spec and the staged one: several new changes in one commit are each
// checked against the commit's start and end, because the bytes between them are kept nowhere.
// Whether the ids named are the ids the edit changed, the contract text and the named tests are the
// change file's words, not compared with the live spec.
//
// A spec committed before the chain (a project split by kit-update --migrate, its original already
// at HEAD) is frozen at its bytes as they are: the split commit is not refused for ids or an
// Assumptions section it never had; the live spec's first change carries both.
//
// THE SPEC CHALLENGE (M34.7.C, R-246, R-299): at Full the spec is challenged before it is frozen.
// A fresh context reads spec/project-spec.md and spec/discovery-notes.md only (the bias guard) and
// hunts for what the author missed; spec/spec-challenge.md records it in the shape of
// templates/SPEC-CHALLENGE-PROMPT.md: **Challenge:** run (the read set and at least one findings
// row, "none found" a row) or declined - <the person's word>; **Signed off:** the person's line;
// **Second sign-off:** a second person's line or the words "no second person" (never inferred).
// --freeze checks the record on disk after the ids and the Assumptions section, and the bootstrap
// commit (--staged, no chain and no original at HEAD) checks it in the commit; a read set naming
// anything else is refused. The record is text: the kit does not check that the session was fresh,
// what it read, or who signed. The split commit and a project frozen before this check are not
// asked for it, and the record is not hashed into the chain.
//
// Usage:
//   node validators/validate-spec-chain.cjs --freeze [--root DIR]   # the bootstrap's one write
//   node validators/validate-spec-chain.cjs --staged [--root DIR]   # the commit floor
//   node validators/validate-spec-chain.cjs --change FILE [--root DIR]        # record a change
//   node validators/validate-spec-chain.cjs --closeout MILESTONE [--root DIR] # the closeout's block
//   node validators/validate-spec-chain.cjs [--root DIR]            # the files on disk, by hand
//
// When it arms (M34.7.D, R-306): a project that carries the chain is checked whatever its **Tier:**
// line reads - the floor on HEAD's chain (never on the staged tier or a staged chain, values the
// commit under judgment supplies), the file check, --change and --closeout on the chain on disk -
// and every check a Full project runs, the content checks included, runs there. The tier decides
// only for a project with no chain: at Full the spec is asked to freeze; anywhere else one n/a line
// prints. A project-config.md that is unreadable or deleted does not disarm a chain either. It
// takes no severity flag: the original's freeze and the chain are deterministic
// enforcement, so a warn severity in project-config.md does not loosen it. `git commit
// --no-verify` skips it, as it skips every commit-floor check.
//
// Exit 0 = clean, written, or a visible n/a. Exit 1 = refused. Exit 2 = bad invocation, or a git
// error (fail-closed: an unknown staged set is never a pass).
// Dependency-free (Node builtins + the kit's own lib). .cjs = always CommonJS.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { placeholderForm } = require('./lib/fenced-block.cjs');

// Assembled from the directory name, as validate-spec-examples.cjs does: these are files the project
// authors (the spec is a Phase-1 deliverable, not a scaffold row), and a quoted path literal would read
// to golden-bootstrap's dereference registry as an artifact demanding a generation row.
const SPEC = 'spec';
const ORIG = [SPEC, 'project-spec.md'].join('/');
const LIVE = [SPEC, 'live-spec.md'].join('/');
const CHAIN = [SPEC, 'spec-chain.json'].join('/');
const FREEZE_LINE = 'node validators/validate-spec-chain.cjs --freeze';
const CHANGES = [SPEC, 'changes'].join('/');
const CHANGE_LINE = 'node validators/validate-spec-chain.cjs --change';
const CHANGE_TEMPLATE = ['prompts', 'SPEC-CHANGE-TEMPLATE.md'].join('/');
const isChangeFile = (rel) => rel.indexOf(CHANGES + '/') === 0 && /^[^/]+\.md$/i.test(rel.slice(CHANGES.length + 1));
const CHALLENGE = [SPEC, 'spec-challenge.md'].join('/');
const NOTES = [SPEC, 'discovery-notes.md'].join('/');
const CHALLENGE_PROMPT = ['templates', 'SPEC-CHALLENGE-PROMPT.md'].join('/');
const READ_SET = [ORIG, NOTES];

class GitError extends Error {}

function lf(buf) { return Buffer.from(Buffer.from(buf).toString('latin1').replace(/\r\n/g, '\n'), 'latin1'); }
function sha(buf) { return crypto.createHash('sha256').update(lf(buf)).digest('hex'); }
function short(h) { return String(h || '').slice(0, 12); }

function git(root, args, okCodes) {
  const r = spawnSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new GitError(`git ${args[0]}: ${r.error.message}`);
  if ((okCodes || [0]).indexOf(r.status) === -1) {
    throw new GitError(`git ${args.join(' ')}: exit ${r.status} ${String(r.stderr || '').trim()}`);
  }
  return r;
}
// A blob at a revision (':0:' the index, 'HEAD:' the last commit), or null when it is not there.
function blobAt(root, rev, rel) {
  const e = git(root, ['cat-file', '-e', `${rev}${rel}`], [0, 1, 128]);
  if (e.status !== 0) return null;
  return git(root, ['cat-file', 'blob', `${rev}${rel}`]).stdout;
}

// ---- project-config: the tier ----
function readTier(root, staged) {
  let cfg = null;
  if (staged) { try { cfg = blobAt(root, ':0:', 'project-config.md'); } catch (_) { cfg = null; } }
  if (cfg === null) { try { cfg = fs.readFileSync(path.join(root, 'project-config.md')); } catch (_) { cfg = null; } }
  if (cfg === null) return { armed: false, na: 'no project-config.md at the root (not a generated-project root)' };
  const m = String(cfg).replace(/\r\n/g, '\n').match(/^\*\*Tier:\*\*\s*(\S+)/m);
  if (!m) return { armed: false, na: 'project-config.md carries no **Tier:** line; the check arms on an explicit Full tier' };
  if (!/^full$/i.test(m[1])) return { armed: false, na: `tier is ${m[1]}; the check arms at Full` };
  return { armed: true };
}

// ---- the content checks ----
function unfenced(text) {
  const out = [];
  let fence = null;
  String(text).replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; out.push({ n: i + 1, line: '' }); return; }
    out.push({ n: i + 1, line: fence ? '' : line });
  });
  return out;
}
const ID_SHAPE = /^REQ-\d{3,}$/;
const DEF_LIST = /^\s*(?:[-*+]|\d+[.)])\s+[*_]{0,2}(REQ-[A-Za-z0-9_-]*)/;
const DEF_ROW = /^\s*\|\s*[*_]{0,2}(REQ-[A-Za-z0-9_-]*)/;
function checkIds(text, rel) {
  const errs = [];
  const seen = new Map();
  for (const { n, line } of unfenced(text)) {
    for (const m of line.matchAll(/\bREQ-[A-Za-z0-9_-]*/g)) {
      if (!ID_SHAPE.test(m[0])) errs.push(`${rel}:${n}: requirement id ${JSON.stringify(m[0])} is malformed (the shape is REQ- and three or more digits, e.g. REQ-001)`);
    }
    const d = line.match(DEF_LIST) || line.match(DEF_ROW);
    if (d && ID_SHAPE.test(d[1])) {
      if (seen.has(d[1])) errs.push(`${rel}:${n}: requirement id ${d[1]} is defined twice (first at line ${seen.get(d[1])}); every requirement keeps one id`);
      else seen.set(d[1], n);
    }
  }
  if (!seen.size) errs.push(`${rel}: defines no requirement id; each requirement opens with its id (a list item or a table row starting REQ-001), so a change, a test and the closeout can name it`);
  return errs;
}
// M34.7.D: the ids a spec DEFINES (checkIds' grammar), as a set; an absent spec defines none.
function definedIds(buf) {
  const out = new Set();
  if (!buf) return out;
  for (const { line } of unfenced(Buffer.from(buf).toString('utf8'))) {
    const d = line.match(DEF_LIST) || line.match(DEF_ROW);
    if (d && ID_SHAPE.test(d[1])) out.add(d[1]);
  }
  return out;
}
// Each id a change names must be defined in the live spec before it or after it. `when` names the
// two sides in the refusal ('change' at --change, 'commit' at the floor).
function idErrors(p, rel, beforeBuf, afterBuf, when) {
  const b = definedIds(beforeBuf); const a = definedIds(afterBuf);
  const errs = [];
  for (const id of new Set(String(p.ids || '').match(/\bREQ-\d{3,}\b/g) || [])) {
    if (!b.has(id) && !a.has(id)) {
      errs.push(`${rel} names ${id}, which the live spec defines neither before this ${when} (sha256 ${short(beforeBuf ? sha(beforeBuf) : '')}) nor after it (sha256 ${short(afterBuf ? sha(afterBuf) : '')}); a change names the requirement ids it adds, edits or removes`);
    }
  }
  return errs;
}
function cells(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}
function checkAssumptions(text, rel) {
  const lines = unfenced(text);
  let at = -1; let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].line.match(/^(#{2,3})\s+(.*?)\s*#*\s*$/);
    if (h && /\bassumptions$/i.test(h[2].replace(/[*_`]/g, '').trim())) { at = i; level = h[1].length; break; }
  }
  if (at === -1) return [`${rel}: no Assumptions section; at Full the spec names each assumption with what would show it false (a "## Assumptions" heading and its table)`];
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const h = lines[i].line.match(/^(#{1,6})\s/);
    if (h && h[1].length <= level) break;
    body.push(lines[i]);
  }
  const rows = body.filter((x) => /^\s*\|/.test(x.line));
  if (rows.length < 3) return [`${rel}:${lines[at].n}: the Assumptions section has no table with a row; each assumption gets a row with what would show it false`];
  const head = cells(rows[0].line);
  const ai = head.findIndex((c) => /assumption/i.test(c));
  const fi = head.findIndex((c, i) => i !== ai && /false/i.test(c));
  if (ai === -1 || fi === -1) return [`${rel}:${rows[0].n}: the Assumptions table needs a column for the assumption and one for what would show it false`];
  const errs = [];
  for (const r of rows.slice(2)) {
    const c = cells(r.line);
    const pa = placeholderForm(c[ai]); const pf = placeholderForm(c[fi]);
    if (pa) errs.push(`${rel}:${r.n}: an assumption cell is ${pa}`);
    if (pf) errs.push(`${rel}:${r.n}: the assumption ${JSON.stringify(String(c[ai] || '').slice(0, 60))} names no falsifier (the cell is ${pf}); say what would show it false`);
  }
  return errs;
}
function contentErrors(buf, rel) { const t = Buffer.from(buf).toString('utf8'); return checkIds(t, rel).concat(checkAssumptions(t, rel)); }

// ---- the spec challenge (M34.7.C) ----
function lineField(text, name) {
  const m = text.match(new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}
// The record's errors; present(rel) says whether a read-set file is there, where names the place.
function challengeErrors(buf, present, where) {
  if (!buf) return [`${CHALLENGE} is missing: at Full the spec is challenged before it is frozen. Run the challenge in ${CHALLENGE_PROMPT} (sbak/${CHALLENGE_PROMPT} in an installed kit), a fresh context that reads ${ORIG} and ${NOTES} only, and record it in ${CHALLENGE} in that template's shape, or record **Challenge:** declined with the person's typed word`];
  const t = Buffer.from(lf(buf)).toString('utf8');
  const errs = [];
  const ch = lineField(t, 'Challenge');
  const pch = ch === null ? 'missing' : placeholderForm(ch);
  if (pch) errs.push(`${CHALLENGE}: the **Challenge:** line is ${pch}; it reads run, or declined - with the person's typed word`);
  else if (/^declined\b/i.test(ch)) {
    const w = ch.replace(/^declined\b\s*[-:]?\s*/i, '');
    const pw = placeholderForm(w);
    if (pw) errs.push(`${CHALLENGE}: the challenge is declined with no word (${pw}); the line reads declined - <the person's typed word, their name and the time>`);
  } else if (/^run$/i.test(ch)) {
    const rs = lineField(t, 'Read set');
    const entries = rs === null ? [] : rs.split(',').map((e) => e.replace(/`/g, '').trim()).filter(Boolean);
    if (!entries.length) errs.push(`${CHALLENGE}: no **Read set:** line; the challenge's read set is ${READ_SET.join(', ')}`);
    for (const e of entries) {
      if (READ_SET.indexOf(e) === -1) errs.push(`${CHALLENGE}: the bias guard: the challenge reads ${READ_SET.join(' and ')} only, never the conversation that wrote the spec or a plan; its read set names ${JSON.stringify(e)}`);
    }
    if (entries.length) {
      for (const r of READ_SET) {
        if (entries.indexOf(r) === -1) errs.push(`${CHALLENGE}: the read set leaves out ${r}; the challenge reads ${READ_SET.join(' and ')}`);
        else if (!present(r)) errs.push(`${CHALLENGE}: ${r} is in the challenge's read set but not ${where}`);
      }
    }
    const lines = t.split('\n');
    const at = lines.findIndex((l) => /^#{2,3}\s+Findings\s*$/i.test(l.trim()));
    const rows = [];
    if (at !== -1) {
      for (let i = at + 1; i < lines.length && !/^#{1,3}\s/.test(lines[i]); i++) if (/^\s*\|/.test(lines[i])) rows.push({ n: i + 1, line: lines[i] });
    }
    if (rows.length < 3) errs.push(`${CHALLENGE}: no findings row under a "## Findings" table; each finding gets a row with its disposition, and a challenge that found nothing writes the row none found`);
    for (const r of rows.slice(2)) {
      const c = cells(r.line);
      const pf = placeholderForm(c[0]); const pd = placeholderForm(c[1]);
      if (pf) errs.push(`${CHALLENGE}:${r.n}: a finding cell is ${pf}`);
      else if (pd) errs.push(`${CHALLENGE}:${r.n}: the finding ${JSON.stringify(String(c[0]).slice(0, 60))} has no disposition (the cell is ${pd}); fold it into the spec or its Assumptions section, or answer it in a line`);
    }
  } else errs.push(`${CHALLENGE}: the **Challenge:** line reads ${JSON.stringify(ch)}; it reads run, or declined - with the person's typed word`);
  const so = lineField(t, 'Signed off');
  const pso = so === null ? 'missing' : placeholderForm(so);
  if (pso) errs.push(`${CHALLENGE}: the **Signed off:** line is ${pso}; it records the person's typed word, their name and the time`);
  const ss = lineField(t, 'Second sign-off');
  const pss = ss === null ? 'missing' : placeholderForm(ss);
  if (pss) errs.push(`${CHALLENGE}: the **Second sign-off:** line is ${pss}; the second sign-off is recorded, never inferred: the second person's typed word, name and time, or the words no second person`);
  return errs;
}

// ---- the change file ----
// The five fields, in order, as the template's headings name them; then the approval section.
const FIELDS = ['Current contract', 'Requested change', 'Behaviour preserved', 'Affected tests', 'Updated contract'];
const MILESTONE_SHAPE = /^M\d{2,}(?:\.\d+)*$/;
const HEX64 = /\bsha256\s+([0-9a-f]{64})\b/;
function parseChange(buf) {
  const lines = unfenced(Buffer.from(buf).toString('utf8').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, '')));
  const field = (name) => {
    const re = new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'i');
    for (const { line } of lines) { const m = line.match(re); if (m) return m[1].trim(); }
    return null;
  };
  const sections = {};
  let cur = null;
  for (const { line } of lines) {
    const h = line.match(/^##\s+(?:(\d)\.\s+)?(.*?)\s*$/);
    if (h) { cur = h[2].replace(/[*_`]/g, '').trim().toLowerCase(); sections[cur] = []; continue; }
    if (/^#\s/.test(line)) { cur = null; continue; }
    if (cur !== null) sections[cur].push(line);
  }
  const hash = (v) => { const m = String(v || '').match(HEX64); return m ? m[1] : null; };
  return {
    milestone: field('Milestone'),
    ids: field('Requirement ids'),
    assumptions: field('Assumptions touched'),
    beforeLine: field('Live spec before'),
    afterLine: field('Live spec after'),
    before: hash(field('Live spec before')),
    after: hash(field('Live spec after')),
    approved: field('Approved'),
    section: (name) => (sections[name.toLowerCase()] ? sections[name.toLowerCase()].join('\n').trim() : null),
  };
}
// The fields a change file must carry filled. `hashes` asks for the two recorded hashes too (the floor).
function changeErrors(p, rel, hashes) {
  const errs = [];
  for (let i = 0; i < FIELDS.length; i++) {
    const body = p.section(FIELDS[i]);
    if (body === null) { errs.push(`${rel}: has no "## ${i + 1}. ${FIELDS[i]}" field; copy the five fields from ${CHANGE_TEMPLATE}`); continue; }
    const pf = placeholderForm(body);
    if (pf) errs.push(`${rel}: the field "${i + 1}. ${FIELDS[i]}" is ${pf}; fill it before the change is recorded`);
  }
  if (p.milestone === null || !MILESTONE_SHAPE.test(p.milestone.replace(/[*_`]/g, '').trim())) {
    errs.push(`${rel}: its Milestone line names no milestone (${p.milestone === null ? 'no **Milestone:** line' : JSON.stringify(p.milestone)}); the form is M and two or more digits (M03), the milestone whose closeout lists this change`);
  }
  // M34.7.D: the template's placeholder on the ids line is refused like every other unfilled field
  const pi = p.ids === null ? null : placeholderForm(p.ids);
  if (pi) errs.push(`${rel}: its **Requirement ids:** line is ${pi}; name the live-spec ids the change adds, edits or removes (e.g. REQ-003)`);
  else {
    const ids = String(p.ids || '').match(/\bREQ-[A-Za-z0-9_-]*/g) || [];
    if (!ids.length) errs.push(`${rel}: names no requirement id (a **Requirement ids:** line listing the live-spec ids it touches, e.g. REQ-003)`);
    for (const id of ids) if (!ID_SHAPE.test(id)) errs.push(`${rel}: requirement id ${JSON.stringify(id)} is malformed (the shape is REQ- and three or more digits)`);
  }
  const pa = placeholderForm(p.assumptions);
  if (pa) errs.push(`${rel}: its **Assumptions touched:** line is ${pa}; name the assumptions rows the change touches, or write none`);
  const pp = placeholderForm(p.approved);
  if (pp) errs.push(`${rel}: has no approval line (the **Approved:** line is ${pp}); the person's typed word, their name and the time, recorded as text the person confirms`);
  if (p.beforeLine === null || p.afterLine === null) errs.push(`${rel}: has no **Live spec before:** or **Live spec after:** line; copy both from ${CHANGE_TEMPLATE}`);
  else if (hashes && (!p.before || !p.after)) errs.push(`${rel}: records no live-spec hashes; run ${CHANGE_LINE} ${rel}, which writes them`);
  return errs;
}
function idsOf(p) { return (String(p.ids || '').match(/\bREQ-\d{3,}\b/g) || []).join(', '); }
function setHashLine(text, name, hex) {
  const re = new RegExp(`^(\\*\\*${name}:\\*\\*)[^\\r\\n]*`, 'mi');
  return text.replace(re, (m, k) => `${k} sha256 ${hex}`);
}

// ---- the chain ----
function parseChain(buf, where) {
  let c;
  try { c = JSON.parse(Buffer.from(buf).toString('utf8')); } catch (e) { return { err: `${CHAIN} (${where}) is not valid JSON: ${e.message}` }; }
  if (!c || typeof c !== 'object' || !c.original || typeof c.original.sha256 !== 'string' || !c.live || typeof c.live.sha256 !== 'string' || !Array.isArray(c.changes)) {
    return { err: `${CHAIN} (${where}) lacks its shape: { "original": { "path", "sha256", "commit" }, "live": { "path", "sha256" }, "changes": [] }` };
  }
  return { chain: c };
}
// The walk: the original's sha256, each change's before and after, the last link the live spec.
function walk(chain, origBuf, liveBuf, present) {
  const errs = [];
  const o = sha(origBuf);
  if (chain.original.sha256 !== o) errs.push(`the chain starts at ${short(chain.original.sha256)} but ${ORIG} is ${short(o)}`);
  let link = chain.original.sha256;
  let at = 'the original';
  chain.changes.forEach((c, i) => {
    if (!c || typeof c.file !== 'string' || !present(c.file)) errs.push(`change ${i + 1} names ${JSON.stringify(c && c.file)}, which is not in the commit`);
    if (!c || c.before !== link) errs.push(`the first broken link: change ${i + 1} (${c && c.file}) starts at ${short(c && c.before)}, but the previous link (${at}) ends at ${short(link)}`);
    link = c ? c.after : link; at = `change ${i + 1}`;
  });
  if (chain.live.sha256 !== link) errs.push(`${CHAIN} records the live spec as ${short(chain.live.sha256)}, but its last link (${at}) ends at ${short(link)}`);
  const l = sha(liveBuf);
  if (l !== link) {
    errs.push(`the first broken link: ${LIVE} is ${short(l)}, which the chain does not reach (it ends at ${at}, ${short(link)}). The live spec changes only through a recorded change; to undo this edit: git restore --staged --worktree ${LIVE}`);
  }
  return errs;
}

function freezeCommit(root) {
  try {
    const r = git(root, ['log', '--diff-filter=A', '--reverse', '--format=%h', '--', CHAIN]);
    return String(r.stdout).split('\n')[0].trim() || 'the bootstrap commit';
  } catch (_) { return 'the bootstrap commit'; }
}

function refuse(errs) {
  for (const e of errs) process.stderr.write(`FAIL  spec-chain: ${e}\n`);
  process.exit(1);
}

// ---- the same-commit rule (M34.7.B) ----
// recorded: HEAD's chain entries; staged: the staged chain; touched: path -> git status letter.
// headLive: HEAD's live spec, the commit's start (M34.7.D's id check reads it beside the staged one).
function sameCommit(recorded, staged, touched, idx, liveBuf, headLive) {
  const errs = [];
  // the recorded changes are append-only: their files and their chain entries
  for (const [p, st] of touched) {
    const n = recorded.findIndex((c) => c && c.file === p);
    if (n !== -1 && st !== 'A') errs.push(`${p} is recorded change ${n + 1}; a recorded change is never edited or deleted (a further change is a new file). To undo: git restore --staged --worktree ${p}`);
  }
  for (let i = 0; i < recorded.length; i++) {
    if (JSON.stringify(staged.changes[i]) !== JSON.stringify(recorded[i])) {
      errs.push(`the chain's recorded changes were rewritten from HEAD (change ${i + 1} differs); a recorded change is never edited or removed. To undo: git restore --staged --worktree ${CHAIN}`);
      break;
    }
  }
  if (errs.length) return errs;
  const fresh = staged.changes.slice(recorded.length);
  if (touched.has(LIVE) && !fresh.length) {
    return [`${LIVE} is staged with no change file: a requirement change is one file under ${CHANGES}/, written from ${CHANGE_TEMPLATE} and recorded with ${CHANGE_LINE} <file>, committed with the live spec. To undo the edit: git restore --staged --worktree ${LIVE}`];
  }
  for (const [p, st] of touched) {
    if (isChangeFile(p) && st === 'A' && !fresh.some((c) => c && c.file === p)) errs.push(`${p} is staged but ${CHAIN} does not name it; record it with ${CHANGE_LINE} ${p}`);
  }
  let link = recorded.length ? recorded[recorded.length - 1].after : staged.original.sha256;
  let at = recorded.length ? `change ${recorded.length}` : 'the original';
  fresh.forEach((c, k) => {
    const n = recorded.length + k + 1;
    const file = c && c.file;
    if (typeof file !== 'string' || !isChangeFile(file)) { errs.push(`change ${n} names ${JSON.stringify(file)}, which is not a change file under ${CHANGES}/`); return; }
    if (touched.get(file) !== 'A') { errs.push(`change ${n} names ${file}, which is not added in this commit; a change file is applied in the same commit as its live-spec edit`); return; }
    const p = parseChange(idx(file));
    const fe = changeErrors(p, file, true);
    if (fe.length) { errs.push(...fe); return; }
    // M34.7.D: the ids it names, against the commit's start (HEAD's live spec) and end (the staged one)
    const ie = idErrors(p, file, headLive, liveBuf, 'commit');
    if (ie.length) errs.push(...ie.map((e) => `${e}. Correct its **Requirement ids:** line and re-run ${CHANGE_LINE} ${file}`));
    if (p.before !== link) {
      errs.push(`the first broken link: change ${n} (${file}) records before ${short(p.before)}, but the previous link (${at}) ends at ${short(link)}; the live spec moved after this change was recorded: re-run ${CHANGE_LINE} ${file}`);
    } else if (p.before !== c.before || p.after !== c.after) {
      errs.push(`change ${n}: ${CHAIN} records ${short(c.before)}..${short(c.after)} but ${file} records ${short(p.before)}..${short(p.after)}; re-run ${CHANGE_LINE} ${file}`);
    }
    link = p.after; at = `change ${n}`;
  });
  if (!errs.length && fresh.length) {
    const l = sha(liveBuf);
    if (l !== link) {
      const last = fresh[fresh.length - 1].file;
      errs.push(`the first broken link: ${at} (${last}) records after ${short(link)}, but the staged ${LIVE} is ${short(l)}; the live spec changed after this change was recorded: re-run ${CHANGE_LINE} ${last} and stage its output`);
    }
  }
  return errs;
}

// ---- --staged: the commit floor ----
// Does HEAD carry the chain? An unborn HEAD does not; a git error is thrown (fail-closed in main).
function headHasChain(root) {
  if (git(root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], [0, 1, 128]).status !== 0) return false;
  return blobAt(root, 'HEAD:', CHAIN) !== null;
}
function staged(root) {
  git(root, ['rev-parse', '--git-dir']);
  const ns = String(git(root, ['diff', '--cached', '--name-status', '--no-renames', '-z']).stdout).split('\0');
  const touched = new Map();
  for (let i = 0; i + 1 < ns.length; i += 2) if (ns[i]) touched.set(ns[i + 1].replace(/\\/g, '/'), ns[i][0]);
  if (![...touched.keys()].some((p) => p.indexOf('spec/') === 0)) return 0;
  const hasHead = git(root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], [0, 1, 128]).status === 0;
  const head = (rel) => (hasHead ? blobAt(root, 'HEAD:', rel) : null);
  const idx = (rel) => blobAt(root, ':0:', rel);
  const headChain = head(CHAIN);
  const errs = [];
  if (headChain) {
    const at = freezeCommit(root);
    if (touched.has(ORIG)) {
      errs.push(`${ORIG} is the original spec, frozen at ${at}; it is never edited again (${touched.get(ORIG) === 'D' ? 'a deletion' : 'a change'} is staged). A requirement change goes to ${LIVE} through a change file (spec/changes/). To undo: git restore --staged --worktree ${ORIG}`);
    }
    if (touched.get(CHAIN) === 'D' || touched.get(LIVE) === 'D') errs.push(`${touched.get(CHAIN) === 'D' ? CHAIN : LIVE} is staged for deletion; the chain and the live spec stay for the life of the project`);
    if (errs.length) refuse(errs);
    const hc = parseChain(headChain, 'HEAD');
    const ic = parseChain(idx(CHAIN), 'staged');
    if (ic.err) refuse([ic.err]);
    if (!hc.err && JSON.stringify(hc.chain.original) !== JSON.stringify(ic.chain.original)) {
      refuse([`the chain's original record changed from HEAD (${short(hc.chain.original.sha256)} to ${short(ic.chain.original.sha256)}); it is written once, at the freeze. To undo: git restore --staged --worktree ${CHAIN}`]);
    }
    const ob = idx(ORIG); const lb = idx(LIVE);
    if (!ob || !lb) refuse([`${!ob ? ORIG : LIVE} is not in the commit`]);
    // M34.7.B: the change path - one change file per live-spec change, added in the same commit.
    const recorded = hc.err ? [] : hc.chain.changes;
    const cerrs = sameCommit(recorded, ic.chain, touched, idx, lb, head(LIVE));
    // a live-spec edit with no new link also names the first broken link, as the walk reads it
    if (cerrs.length) refuse(touched.has(LIVE) && ic.chain.changes.length === recorded.length ? cerrs.concat(walk(ic.chain, ob, lb, (rel) => idx(rel) !== null)) : cerrs);
    const w = walk(ic.chain, ob, lb, (rel) => idx(rel) !== null);
    if (w.length) refuse(w);
    if (touched.has(LIVE)) { const c = contentErrors(lb, LIVE); if (c.length) refuse(c); }
    return 0;
  }
  // No chain at HEAD.
  const chainBuf = idx(CHAIN);
  if (chainBuf) {
    const ob = idx(ORIG); const lb = idx(LIVE);
    if (!ob) refuse([`${CHAIN} is staged but ${ORIG} is not in the commit; run ${FREEZE_LINE} over the spec`]);
    if (!lb) refuse([`${CHAIN} is staged but ${LIVE} is not; run ${FREEZE_LINE} and stage the three files together`]);
    const ic = parseChain(chainBuf, 'staged');
    if (ic.err) refuse([ic.err]);
    if (!lf(ob).equals(lf(lb))) errs.push(`${LIVE} is not a byte copy of ${ORIG} at the freeze; run ${FREEZE_LINE} again and stage its output`);
    if (ic.chain.changes.length) errs.push(`the freeze records no change; ${CHAIN} carries ${ic.chain.changes.length}`);
    if (ic.chain.original.sha256 !== sha(ob) || ic.chain.live.sha256 !== sha(ob)) errs.push(`${CHAIN} does not record ${ORIG} as it is staged (${short(sha(ob))}); the spec changed after the freeze: run ${FREEZE_LINE} again and stage its output`);
    if (errs.length) refuse(errs);
    // M34.7.B: a spec already at HEAD (split by kit-update --migrate) is frozen at its bytes as they
    // are; the ids and the Assumptions section arrive with the live spec's first change.
    if (!head(ORIG)) {
      const c = contentErrors(ob, ORIG); if (c.length) refuse(c);
      // M34.7.C: the bootstrap commit carries the challenge record (the split above is not asked).
      const ce = challengeErrors(idx(CHALLENGE), (rel) => idx(rel) !== null, 'in the commit'); if (ce.length) refuse(ce);
    }
    return 0;
  }
  if (touched.get(ORIG) === 'A' && !head(ORIG)) {
    refuse([`${ORIG} is committed for the first time with no freeze: run ${FREEZE_LINE}, which writes ${LIVE} as its byte copy and ${CHAIN}, and commit the three files together. From that commit on the original is never edited again`]);
  }
  if (head(ORIG)) {
    console.log(`spec-chain - n/a: this project's spec predates the live spec (no ${CHAIN} at HEAD), so its edits are not checked`);
  }
  return 0;
}

// ---- --freeze: the bootstrap's one write ----
function freeze(root, armed) {
  const op = path.join(root, ORIG);
  let ob;
  try { ob = fs.readFileSync(op); } catch (_) { process.stderr.write(`FAIL  spec-chain: no ${ORIG} to freeze\n`); return 1; }
  let hasHead = false;
  try { hasHead = git(root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], [0, 1, 128]).status === 0; } catch (_) { hasHead = false; }
  if (hasHead) {
    let hc = null;
    try { hc = blobAt(root, 'HEAD:', CHAIN); } catch (_) { hc = null; }
    if (hc) { process.stderr.write(`FAIL  spec-chain: the original is already frozen at ${freezeCommit(root)}; ${ORIG} is never re-frozen, and the live spec changes through a change file\n`); return 1; }
  }
  if (armed) { const c = contentErrors(ob, ORIG); if (c.length) { for (const e of c) process.stderr.write(`FAIL  spec-chain: ${e}\n`); process.stderr.write('FAIL  spec-chain: nothing written; fix the spec and run the freeze again\n'); return 1; } }
  if (armed) {
    let cb = null; try { cb = fs.readFileSync(path.join(root, CHALLENGE)); } catch (_) { cb = null; }
    const ce = challengeErrors(cb, (rel) => fs.existsSync(path.join(root, rel)), 'on disk');
    if (ce.length) { for (const e of ce) process.stderr.write(`FAIL  spec-chain: ${e}\n`); process.stderr.write('FAIL  spec-chain: nothing written; record the challenge and run the freeze again\n'); return 1; }
  }
  const h = sha(ob);
  fs.writeFileSync(path.join(root, LIVE), ob);
  const chain = { original: { path: ORIG, sha256: h, commit: null }, live: { path: LIVE, sha256: h }, changes: [] };
  fs.writeFileSync(path.join(root, CHAIN), JSON.stringify(chain, null, 2) + '\n');
  console.log(`spec-chain: frozen - ${LIVE} written as a byte copy of ${ORIG}, and ${CHAIN} records sha256 ${short(h)} for both; commit the three files together`);
  return 0;
}

// ---- --change: record one requirement change (M34.7.B) ----
// The live spec's bytes at the link `before`: HEAD's, the index's or the original on disk, whichever
// hashes to it; none of them (a change recorded on an uncommitted one) falls back to HEAD's.
function beforeBytes(root, before) {
  const at = (rev) => { try { return blobAt(root, rev, LIVE); } catch (_) { return null; } };
  const headLive = at('HEAD:');
  let orig = null; try { orig = fs.readFileSync(path.join(root, ORIG)); } catch (_) { orig = null; }
  for (const b of [headLive, at(':0:'), orig]) if (b && sha(b) === before) return b;
  return headLive;
}

// A chain is on disk for --change, so it always runs every check (M34.7.D): no tier argument.
function change(root, fileArg) {
  const E = (s) => process.stderr.write(`FAIL  spec-chain: ${s}\n`);
  const rel = path.relative(root, path.resolve(root, fileArg)).split(path.sep).join('/');
  if (!isChangeFile(rel)) { E(`${fileArg} is not a change file: a change is spec/changes/NNNN-<slug>.md (one file per change, never under a subfolder)`); return 1; }
  const read = (r) => { try { return fs.readFileSync(path.join(root, r)); } catch (_) { return null; } };
  const cb = read(CHAIN);
  if (!cb) { E(`no ${CHAIN}: the spec is not frozen, so there is no chain to record a change on (${FREEZE_LINE} at the bootstrap; kit-update --migrate splits an existing spec)`); return 1; }
  const pc = parseChain(cb, 'on disk');
  if (pc.err) { E(pc.err); return 1; }
  const chain = pc.chain;
  const fb = read(rel);
  if (!fb) { E(`${rel} is not there; write it from ${CHANGE_TEMPLATE}`); return 1; }
  const lb = read(LIVE);
  if (!lb) { E(`${LIVE} is missing`); return 1; }
  const p = parseChange(fb);
  const fe = changeErrors(p, rel, false);
  if (fe.length) { fe.forEach(E); E('nothing written; fill the change file and run the same command again'); return 1; }
  // where it goes: the next link, or (re-recorded before its commit) the chain's last link again
  const at = chain.changes.findIndex((c) => c && c.file === rel);
  if (at !== -1 && at !== chain.changes.length - 1) { E(`${rel} is recorded change ${at + 1}, and later changes follow it; a recorded change is never re-recorded (a further change is a new file)`); return 1; }
  const prior = at === -1 ? chain.changes : chain.changes.slice(0, at);
  const before = prior.length ? prior[prior.length - 1].after : chain.original.sha256;
  const after = sha(lb);
  if (after === before) { E(`${LIVE} is unchanged since the previous link (${short(before)}); edit the live spec first, then record the change`); return 1; }
  { const c = contentErrors(lb, LIVE); if (c.length) { c.forEach(E); E('nothing written; the live spec carries its ids and its Assumptions section on every change'); return 1; } }
  const ie = idErrors(p, rel, beforeBytes(root, before), lb, 'change');
  if (ie.length) { ie.forEach(E); E(`nothing written; name ids the live spec defines, or define the new id in ${LIVE}, and run the same command again`); return 1; }
  let text = Buffer.from(fb).toString('utf8');
  text = setHashLine(setHashLine(text, 'Live spec before', before), 'Live spec after', after);
  fs.writeFileSync(path.join(root, rel), text);
  const entry = { file: rel, before, after };
  chain.changes = prior.concat([entry]);
  chain.live.sha256 = after;
  fs.writeFileSync(path.join(root, CHAIN), JSON.stringify(chain, null, 2) + '\n');
  console.log(`spec-chain: recorded change ${chain.changes.length} (${rel}) - before ${short(before)}, after ${short(after)}; stage ${LIVE}, the change file and ${CHAIN} together`);
  return 0;
}

// ---- --closeout: the closeout's requirement-changes block (M34.7.B) ----
function closeout(root, milestone) {
  const read = (rel) => { try { return fs.readFileSync(path.join(root, rel)); } catch (_) { return null; } };
  if (!MILESTONE_SHAPE.test(milestone)) { process.stderr.write(`FAIL  spec-chain: --closeout ${JSON.stringify(milestone)} is not a milestone id (M03)\n`); return 2; }
  const cb = read(CHAIN);
  if (!cb) { console.log(`spec-chain - n/a: no ${CHAIN} (the spec is not frozen), so the closeout has no chain to reconcile`); return 0; }
  const fail = (errs) => {
    for (const e of errs) process.stderr.write(`FAIL  spec-chain: ${e}\n`);
    process.stderr.write(`FAIL  spec-chain: the closeout cannot reconcile a chain that does not close at the live spec; repair it before the ${milestone} closeout\n`);
    return 1;
  };
  const ic = parseChain(cb, 'on disk');
  if (ic.err) return fail([ic.err]);
  const ob = read(ORIG); const lb = read(LIVE);
  if (!ob || !lb) return fail([`${!ob ? ORIG : LIVE} is missing`]);
  const w = walk(ic.chain, ob, lb, (rel) => read(rel) !== null);
  if (w.length) return fail(w);
  const mine = [];
  const errs = [];
  ic.chain.changes.forEach((c, i) => {
    const p = parseChange(read(c.file));
    const m = String(p.milestone || '').replace(/[*_`]/g, '').trim();
    if (!MILESTONE_SHAPE.test(m)) { errs.push(`change ${i + 1} (${c.file}) names no milestone, so no closeout would list it`); return; }
    if (m === milestone) mine.push({ c, p });
  });
  if (errs.length) return fail(errs);
  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const tests = (p) => (p.section('Affected tests') || '').split('\n').map((l) => l.replace(/^\s*[-*+]\s+/, '').trim()).filter(Boolean).join('; ');
  const out = [`## Requirement changes (${milestone})`, ''];
  if (!mine.length) out.push('no requirement changed');
  for (const { c, p } of mine) {
    out.push(`- ${c.file}: ${idsOf(p)}; tests: ${tests(p)}; assumptions touched: ${flat(p.assumptions)}; approved: ${flat(p.approved)}`);
  }
  const n = ic.chain.changes.length;
  out.push('', `chain: closes at the live spec (sha256 ${short(sha(lb))}); ${mine.length} of ${n} change${n === 1 ? '' : 's'} in the chain ${mine.length === 1 ? 'is' : 'are'} ${milestone}'s`);
  console.log(out.join('\n'));
  return 0;
}

// ---- file mode: the files on disk ----
function files(root) {
  const read = (rel) => { try { return fs.readFileSync(path.join(root, rel)); } catch (_) { return null; } };
  const cb = read(CHAIN);
  if (!cb) { console.log(`spec-chain - n/a: no ${CHAIN} (the spec is not frozen)`); return 0; }
  const ic = parseChain(cb, 'on disk');
  if (ic.err) refuse([ic.err]);
  const ob = read(ORIG); const lb = read(LIVE);
  if (!ob || !lb) refuse([`${!ob ? ORIG : LIVE} is missing`]);
  const w = walk(ic.chain, ob, lb, (rel) => read(rel) !== null);
  if (w.length) refuse(w);
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let mode = 'files';
  let operand = null;
  const usage = () => { process.stderr.write('usage: validate-spec-chain.cjs [--freeze | --staged | --change FILE | --closeout MILESTONE] [--root DIR]\n'); process.exit(2); };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') root = path.resolve(args[++i] || '.');
    else if (args[i] === '--staged') mode = 'staged';
    else if (args[i] === '--freeze') mode = 'freeze';
    else if (args[i] === '--change' || args[i] === '--closeout') { mode = args[i].slice(2); operand = args[++i]; if (!operand) usage(); }
    else usage();
  }
  const tier = readTier(root, mode === 'staged');
  if (mode === 'freeze') process.exit(freeze(root, tier.armed));
  if (mode === 'change') process.exit(change(root, operand));
  try {
    // M34.7.D: a project that carries the chain is checked whatever its Tier line reads. The floor
    // arms on HEAD's chain, never on the staged tier or a staged chain (the commit under judgment
    // supplies those); the other modes arm on the chain on disk.
    const chained = mode === 'staged' ? headHasChain(root) : fs.existsSync(path.join(root, CHAIN));
    if (!tier.armed && !chained) { console.log(`spec-chain - n/a: ${tier.na}`); process.exit(0); }
    if (mode === 'closeout') process.exit(closeout(root, operand));
    process.exit(mode === 'staged' ? staged(root) : files(root));
  } catch (e) {
    if (e instanceof GitError) {
      process.stderr.write(`FAIL  spec-chain: cannot read the commit through git (${e.message}); refusing to pass the spec chain on an unknown staged set (fail-closed)\n`);
      process.exit(2);
    }
    throw e;
  }
}

main();
