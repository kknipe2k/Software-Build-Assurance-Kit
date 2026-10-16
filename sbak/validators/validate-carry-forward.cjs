#!/usr/bin/env node
// @kit-version 1.0.7
// validators/validate-carry-forward.cjs
//
// THE V-🟡 CARRY-FORWARD LANDING SLOT (M27.D, KF-48 instance 4).
//
// BUILD-PLAYBOOK.md §3.4 promises it in one sentence: a Verifier finding at 🟡 "carries
// forward to next milestone's Stage A". templates/ORCHESTRATOR.md repeats it as a routing
// row; templates/PHASE-DOC-TEMPLATE.md leaves a slot for the count. Until this file, NOTHING
// READ A V-FINDINGS FILE. The promise was honored by whoever happened to remember — and in
// the md2page trial the next milestone's Phase doc simply omitted the carried finding; only
// the arm's own initiative folded the fix in later. A promise with no reader is the
// advertised-but-unwired class this milestone closes, in its purest form: the ledger existed,
// the obligation was written down, and no code ever opened the file.
//
// WHAT IT CHECKS. For each staged/named Phase doc, find the most recent PRIOR milestone's
// `retrospectives/M<NN>.V-findings.md`, collect every 🟡 finding id it carries, and require
// each id to APPEAR in the Phase doc. Silence fails. Presence passes.
//
// ── HONEST LOCUS (no overclaim — the load-bearing sentence) ──────────────────────────────
//   It asserts the carried finding's ID APPEARS in the next Phase doc. It does NOT judge
//   whether the treatment is adequate, and it deliberately does NOT distinguish "in scope"
//   from "explicitly deferred": both are legitimate landings, both are the human's call, and
//   a checker that tried to grade the difference would be grading prose. What it makes
//   IMPOSSIBLE is the third option the trial actually took — saying nothing at all. A defer
//   is a decision on the record; silence is a decision nobody made.
//   It also reads the findings file's own 🟡 lines, so a findings file that never marks a
//   severity carries nothing to land, and this check no-ops. That is correct: the obligation
//   is created by the Verifier's own record, not by this validator's opinion.
//
// PRIOR-MILESTONE RESOLUTION. The highest-numbered `retrospectives/M*.V-findings.md` whose
// milestone number is strictly LESS than the Phase doc's. That handles real numbering (M20 →
// M20.5 → M21) instead of assuming NN-1, and a project with no prior findings file at all —
// the first milestone, every time — passes without a word.
//
// M32.D (§3.5) - STAGE R IDS AND PROSE CARRIES. In the field a carry to a parallel stream lapsed
// silently, because refactor findings and carries written as prose were invisible here. Two more
// obligations, both read from ONE prior milestone: the highest number below the doc's that has
// ANY of `M<NN>.V-findings.md`, `M<NN>.R-findings.md`, `M<NN>-summary.md` (gate-1 ruling - an R
// file is not re-demanded by every later Phase doc until the next Stage R). The V-id path above
// is untouched.
//   - R ids: every 🟡 line of `M<NN>.R-findings.md` contributes its Dup- / Cx- / Drift- / R- /
//     R2- ids; each must appear in the doc, exactly as a V id must.
//   - Prose carries: in that milestone's V, R and summary files, a line holding `[carry M<MM>]`
//     carries the text after the token (trimmed, one trailing period removed) to milestone MM's
//     Phase doc, which must contain it (case-sensitive, whitespace collapsed on both sides). A
//     carry addressed to another milestone binds that milestone's doc, not this one.
//
// Usage:
//   node validators/validate-carry-forward.cjs [--warn] [--root <dir>] <phase-doc.md>...
//     --warn   report findings but exit 0 (the Lite/advisory render)
//     --root   resolve retrospectives/ against this dir (default: cwd)
//
// Exit 0 = every carried 🟡 landed (or nothing was carried). Exit 1 = a carried finding is
// absent from the next Phase doc. Exit 2 = usage / fail-closed IO error.

'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require('./lib/fenced-block.cjs'); // CRLF/BOM — consume, don't fork

const YELLOW = '\u{1F7E1}';

// A findings-file line carries a landing obligation when it marks 🟡 AND names a finding id.
// Ids are the framework's own shape: V-1, V-12, V-3a. The 🟡 requirement is what keeps 🔴
// (blocks merge — a different obligation) and 🟢 (append to tech-debt) out of this gate.
const FINDING_ID = /\bV-\d+[a-z]?\b/g;
// M32.D: a Stage R finding id (R-findings files: Dup-1, Cx-2, Drift-3, R-4, R2-5).
const R_FINDING_ID = /\b(?:R2?|Dup|Drift|Cx)-\d+[a-z]?\b/g;
// M32.D: a prose carry addressed to a milestone, in milestoneNumber's own shape (M33, M20.5).
const CARRY_TOKEN = /\[carry M(\d+(?:\.\d+)?)\]/;
// The record files that make a milestone "the prior milestone" for R ids and prose carries.
const RECORD_FILE = /^M(\d+(?:\.\d+)?)(\.V-findings|\.R-findings|-summary)\.md$/;

function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

// Milestone number from a doc/findings path: M02 -> 2, M20.5 -> 20.5. Returns null when the
// name does not carry one (the caller then has nothing to compare and skips).
function milestoneNumber(name) {
  const m = String(name).match(/M(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Every 🟡 finding id in a V-findings file, in document order, de-duplicated. (M32.D: `idRe`
// selects the id shape; an R-findings file passes R_FINDING_ID.)
function carriedFindings(text, idRe) {
  const out = [];
  const seen = new Set();
  for (const line of normalize(text).split('\n')) {
    if (line.indexOf(YELLOW) === -1) continue;
    const ids = line.match(idRe || FINDING_ID);
    if (!ids) continue;
    for (const id of ids) { if (!seen.has(id)) { seen.add(id); out.push(id); } }
  }
  return out;
}

// The most recent prior milestone's V-findings file, or null.
function priorFindings(root, docNumber) {
  const dir = path.join(root, 'retrospectives');
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return null; } // no retrospectives/ yet
  let best = null, bestN = -Infinity;
  for (const n of names) {
    if (!/\.V-findings\.md$/.test(n)) continue;
    const num = milestoneNumber(n);
    if (num === null || num >= docNumber) continue;
    if (num > bestN) { bestN = num; best = n; }
  }
  return best ? { file: path.join(dir, best), rel: 'retrospectives/' + best, milestone: bestN } : null;
}

// M32.D: the ONE prior milestone for R ids and prose carries - the highest number below the
// doc's with any record file - and its record files, V then R then summary.
function priorRecords(root, docNumber) {
  const dir = path.join(root, 'retrospectives');
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return []; }
  let bestN = -Infinity;
  for (const n of names) {
    const m = RECORD_FILE.exec(n);
    if (m && parseFloat(m[1]) < docNumber && parseFloat(m[1]) > bestN) bestN = parseFloat(m[1]);
  }
  const order = { '.V-findings': 0, '.R-findings': 1, '-summary': 2 };
  return names.map((n) => ({ n, m: RECORD_FILE.exec(n) }))
    .filter((x) => x.m && parseFloat(x.m[1]) === bestN)
    .sort((a, b) => order[a.m[2]] - order[b.m[2]])
    .map((x) => ({ file: path.join(dir, x.n), rel: 'retrospectives/' + x.n, kind: x.m[2] }));
}

// M32.D: the prose carries in a record file addressed to milestone `docNumber`: the text after
// `[carry M<MM>]`, trimmed, one trailing period removed, in document order.
function proseCarries(text, docNumber) {
  const out = [];
  for (const line of normalize(text).split('\n')) {
    const m = CARRY_TOKEN.exec(line);
    if (!m || parseFloat(m[1]) !== docNumber) continue;
    const t = line.slice(m.index + m[0].length).trim().replace(/\.$/, '');
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  return out;
}
const collapse = (s) => s.replace(/\s+/g, ' ');

function main() {
  const argv = process.argv.slice(2);
  const warn = argv.includes('--warn');
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx !== -1 && rootIdx + 1 < argv.length ? path.resolve(argv[rootIdx + 1]) : process.cwd();
  const docs = argv.filter((a, i) => !a.startsWith('--') && !(rootIdx !== -1 && i === rootIdx + 1));

  if (docs.length === 0) {
    process.stderr.write('usage: validate-carry-forward.cjs [--warn] [--root <dir>] <phase-doc.md>...\n');
    process.exit(2);
  }

  const problems = [];
  for (const docPath of docs) {
    const docNumber = milestoneNumber(path.basename(docPath));
    if (docNumber === null) continue; // not a milestone-numbered Phase doc — nothing to bind

    const obligations = docObligations(root, docNumber, path.basename(docPath).match(/M\d+(?:\.\d+)?/)[0]);
    if (obligations.length === 0) continue; // nothing carried — no obligation exists

    const docText = readIf(docPath);
    if (docText === null) {
      process.stderr.write(`validate-carry-forward: ${docPath} is unreadable (fail-closed).\n`);
      process.exit(2);
    }
    const doc = normalize(docText);
    for (const o of obligations) {
      const missing = o.prose
        ? o.carried.filter((t) => collapse(doc).indexOf(collapse(t)) === -1).map((t) => JSON.stringify(t))
        : o.carried.filter((id) => !new RegExp('\\b' + id + '\\b').test(doc));
      if (missing.length) problems.push(Object.assign({ doc: docPath, missing }, o));
    }
  }

  if (problems.length === 0) process.exit(0);

  for (const p of problems) {
    process.stderr.write(
      `${warn ? 'WARN' : 'BLOCK'}  ${p.doc}: ${p.missing.length} of ${p.carried.length} carried ${p.what} from ${p.prior} never land here: ${p.missing.join(', ')}\n`
      + `       ${p.rule}\n`
      + `       Name each one in this Phase doc — in scope, or explicitly deferred with the reason.\n`
      + `       Silence is the one option this gate removes: it is the shape the finding was lost in before.\n`);
  }
  process.exit(warn ? 0 : 1);
}

// Every landing obligation a Phase doc of milestone `docNumber` carries: the V ids (today's
// path, unchanged), then (M32.D) the one prior milestone's R ids and its prose carries addressed
// to this milestone. A listed record file that is unreadable fails CLOSED (exit 2): a gate that
// shrugs at an IO error is the silent-skip class this whole milestone is about.
function docObligations(root, docNumber, docLabel) {
  const read = (rel, file) => {
    const t = readIf(file);
    if (t === null) {
      process.stderr.write(`validate-carry-forward: ${rel} is unreadable — refusing to report "nothing carried" (fail-closed).\n`);
      process.exit(2);
    }
    return t;
  };
  const out = [];
  const idRule = `BUILD-PLAYBOOK.md §3.4: a ${YELLOW} finding carries forward to the next milestone's Stage A.`;
  const prior = priorFindings(root, docNumber);
  if (prior) {
    const carried = carriedFindings(read(prior.rel, prior.file));
    if (carried.length) out.push({ prior: prior.rel, carried, what: `${YELLOW} finding(s)`, rule: idRule });
  }
  for (const rec of priorRecords(root, docNumber)) {
    const text = read(rec.rel, rec.file);
    if (rec.kind === '.R-findings') {
      const ids = carriedFindings(text, R_FINDING_ID);
      if (ids.length) out.push({ prior: rec.rel, carried: ids, what: `${YELLOW} Stage R finding(s)`, rule: idRule });
    }
    const carries = proseCarries(text, docNumber);
    if (carries.length) {
      out.push({ prior: rec.rel, carried: carries, prose: true, what: `prose line(s) addressed to ${docLabel}`,
        rule: 'BUILD-PLAYBOOK.md §3.4: a [carry M<NN>] line carries its text to milestone NN\'s Phase doc.' });
    }
  }
  return out;
}

module.exports = { carriedFindings, priorFindings, milestoneNumber };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`validate-carry-forward: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2);
  }
}
