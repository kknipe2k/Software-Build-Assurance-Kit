#!/usr/bin/env node
// @kit-version 1.0.1
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

function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

// Milestone number from a doc/findings path: M02 -> 2, M20.5 -> 20.5. Returns null when the
// name does not carry one (the caller then has nothing to compare and skips).
function milestoneNumber(name) {
  const m = String(name).match(/M(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Every 🟡 finding id in a V-findings file, in document order, de-duplicated.
function carriedFindings(text) {
  const out = [];
  const seen = new Set();
  for (const line of normalize(text).split('\n')) {
    if (line.indexOf(YELLOW) === -1) continue;
    const ids = line.match(FINDING_ID);
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

    const prior = priorFindings(root, docNumber);
    if (!prior) continue; // first milestone, or no findings file yet — nothing carried

    const findingsText = readIf(prior.file);
    if (findingsText === null) {
      // The file was listed and is now unreadable: fail CLOSED. A gate that shrugs at an IO
      // error is the silent-skip class this whole milestone is about.
      process.stderr.write(`validate-carry-forward: ${prior.rel} is unreadable — refusing to report "nothing carried" (fail-closed).\n`);
      process.exit(2);
    }

    const carried = carriedFindings(findingsText);
    if (carried.length === 0) continue; // the Verifier recorded no 🟡 — no obligation exists

    const docText = readIf(docPath);
    if (docText === null) {
      process.stderr.write(`validate-carry-forward: ${docPath} is unreadable (fail-closed).\n`);
      process.exit(2);
    }
    const doc = normalize(docText);
    const missing = carried.filter((id) => !new RegExp('\\b' + id + '\\b').test(doc));
    if (missing.length) {
      problems.push({ doc: docPath, prior: prior.rel, carried, missing });
    }
  }

  if (problems.length === 0) process.exit(0);

  for (const p of problems) {
    process.stderr.write(
      `${warn ? 'WARN' : 'BLOCK'}  ${p.doc}: ${p.missing.length} of ${p.carried.length} carried ${YELLOW} finding(s) from ${p.prior} never land here: ${p.missing.join(', ')}\n`
      + `       BUILD-PLAYBOOK.md §3.4: a ${YELLOW} finding carries forward to the next milestone's Stage A.\n`
      + `       Name each one in this Phase doc — in scope, or explicitly deferred with the reason.\n`
      + `       Silence is the one option this gate removes: it is the shape the finding was lost in before.\n`);
  }
  process.exit(warn ? 0 : 1);
}

module.exports = { carriedFindings, priorFindings, milestoneNumber };

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(`validate-carry-forward: ${e && e.stack ? e.stack : e}\n`);
    process.exit(2);
  }
}
