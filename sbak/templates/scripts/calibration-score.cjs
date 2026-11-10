#!/usr/bin/env node
// @kit-version 1.0.10
// scripts/calibration-score.cjs
//   (kit source of truth: templates/scripts/calibration-score.cjs)
//
// The G14 scorer (M34.6.D). The verifier judges the seeded-defect calibration set blind and writes
// its verdicts in its findings file (a ```calibration-verdicts block, one line per fixture,
// `<fixture filename>: <class or clean>`, then `judged-from: content`) - agent judgment - and never
// a score. This program, run by the orchestrator in its own tree, reads the sealed labels, compares
// each verdict with its label's class and rewrites the findings file's ```calibration block in place:
// the seeds, the caught count, the false-negative rate (FNR) as a decimal and as `<missed> of
// <seeds>`, the missed classes, whether the labels check ran, and a `scored-by:` line carrying the
// sha256 of the verdicts block's body (observed evidence). validators/validate-calibration.cjs then
// refuses a Sound findings file whose block this program did not write in that form, whose verdicts
// changed after scoring, or whose FNR is not 0 (deterministic enforcement at the pre-commit).
//
//   node scripts/calibration-score.cjs --findings <file> [--set <dir>] [--session <id>]...
//
// Boundaries, in order; every refusal is one `calibration-score: refused - ...` line on stderr, exit 2,
// and nothing written:
//   * the role: .claude/role of this tree must read orchestrator - the verifier never scores itself;
//   * the set (default prompts/calibration under the tree's root) must pass the validator's set check;
//   * each --session <id>: events-<id>.jsonl is read from .claude/receipts/ of every worktree of this
//     repository (the verifier runs in another worktree); no ledger refuses, a ledger with no verifier
//     row refuses, and a recorded read of any file under the set's labels/ voids the exam (the read
//     ledger's labels rule, compared ref by ref);
//   * the verdicts: exactly one calibration-verdicts block, every line well formed, judged-from:
//     content present, every fixture judged once, no unknown fixture, every class from the catalog or
//     clean;
//   * the block: exactly one calibration block, at scored-by: pending - one exam, one score.
// A written score exits 0 whatever the rate: the rate is the result; the validator is the gate.
//
// Honest scope: a role file and a hash identify a tree and a set of bytes on this machine, not a
// person; anyone who can write the repository can type a scored-by line by hand (the local trust
// boundary every record on the evidence path shares). The labels check sees the reads the receipts
// ledger recorded (a Read-tool read or a shell command naming the file); a glob, a directory search
// or another program's read is outside it.
//
// Dependency-free, cross-platform. .cjs = always CommonJS regardless of the host project's
// package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const P = 'calibration-score';
function refuse(lines) {
  for (const l of [].concat(lines)) process.stderr.write(`${P}: refused - ${l}\n`);
  process.exit(2);
}

function argList(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === name) out.push(argv[i + 1]);
  return out;
}

function gitOut(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return r.status === 0 ? String(r.stdout) : null;
}

// The FNR's decimal: the rate to four places, trailing zeros dropped (0, 0.0909, 1).
function rate(missed, seeds) { return String(Number((missed / seeds).toFixed(4))); }

function main() {
  const argv = process.argv.slice(2);
  const usage = `usage: node scripts/calibration-score.cjs --findings <file> [--set <dir>] [--session <id>]...\n`;
  const findingsArg = argList(argv, '--findings');
  const setArg = argList(argv, '--set');
  const sessions = argList(argv, '--session');
  const known = new Set(['--findings', '--set', '--session']);
  for (let i = 0; i < argv.length; i += 2) {
    if (!known.has(argv[i]) || argv[i + 1] === undefined || /^--/.test(argv[i + 1])) { process.stderr.write(usage); process.exit(2); }
  }
  if (findingsArg.length !== 1 || setArg.length > 1) { process.stderr.write(usage); process.exit(2); }

  const cwd = process.cwd();
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel']);
  const root = top ? path.resolve(top.trim()) : cwd;

  let LEDGER; let CAL; let RECEIPTS;
  try { LEDGER = require(path.join(__dirname, 'lib', 'read-ledger.cjs')); RECEIPTS = require(path.join(__dirname, 'lib', 'receipts.cjs')); }
  catch (e) { refuse(`scripts/lib/read-ledger.cjs or scripts/lib/receipts.cjs did not load (${String((e && e.message) || e).split('\n')[0]})`); }
  try { CAL = require(path.join(__dirname, '..', 'validators', 'validate-calibration.cjs')); }
  catch (e) { refuse(`validators/validate-calibration.cjs did not load (${String((e && e.message) || e).split('\n')[0]})`); }

  // 1. the role
  const roleFile = path.join(root, '.claude', 'role');
  const role = fs.existsSync(roleFile) ? (LEDGER.currentRole(root) || 'unresolved') : 'absent';
  if (role !== 'orchestrator') refuse(`.claude/role of this tree reads ${role}, not orchestrator; the verifier never scores itself`);

  // 2. the set
  const setDir = setArg.length ? path.resolve(cwd, setArg[0]) : path.join(root, 'prompts', 'calibration');
  const setFindings = CAL.checkSet(setDir); // fail-closed (exit 2) on an unreadable set
  if (setFindings.length) refuse(`the calibration set does not pass validate-calibration --set (${setFindings[0]})`);
  const labels = CAL.readLabels(path.join(setDir, 'labels')).labels;
  const fixtures = fs.readdirSync(path.join(setDir, 'fixtures')).filter((n) => /\.md$/i.test(n)).sort();

  // 3. the sessions: the labels rule over each named verifier session's ledger, in every worktree
  let labelsLine = 'labels-unread: not checked (no --session)';
  if (sessions.length) {
    const trees = new Set([root]);
    for (const l of String(gitOut(root, ['worktree', 'list', '--porcelain']) || '').split(/\r?\n/)) if (l.startsWith('worktree ')) trees.add(path.resolve(l.slice(9).trim()));
    const refs = new Set();
    for (const id of sessions) {
      if (!/^[A-Za-z0-9._-]+$/.test(id)) refuse(`the session id ${JSON.stringify(id)} is not a session id`);
      const files = Array.from(trees).map((t) => path.join(t, '.claude', 'receipts', `events-${id}.jsonl`)).filter((f) => fs.existsSync(f));
      if (!files.length) refuse(`no receipts ledger events-${id}.jsonl in any worktree of this repository; the labels check cannot run`);
      const events = [];
      for (const f of files) for (const e of RECEIPTS.readLedger(f).events) events.push(e);
      if (!events.some((e) => e.role === 'verifier')) refuse(`the ledger for session ${id} carries no verifier row; name the verifier's session`);
      for (const e of events) if (e.event === 'file_read' && e.read_ref) refs.add(e.read_ref);
    }
    const lr = LEDGER.labelsRead(root, refs, setDir);
    if (lr.unresolved.length) refuse(`the labels check needs the set inside this tree; ${lr.unresolved[0]} does not resolve under ${root}`);
    if (lr.read.length) refuse(lr.read.map((l) => `the exam is void: the verifier read ${l}`));
    labelsLine = `labels-unread: checked over session(s) ${sessions.join(', ')} (${refs.size} recorded read(s), no label)`;
  }

  // 4. the verdicts
  const file = path.resolve(cwd, findingsArg[0]);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { refuse(`the findings file ${findingsArg[0]} cannot be read (${(e && e.code) || 'error'})`); }
  const vb = CAL.exactBlocks(raw, 'calibration-verdicts');
  if (!vb.length) refuse('the findings file carries no calibration-verdicts block');
  if (vb.length > 1) refuse(`the findings file carries ${vb.length} calibration-verdicts blocks; one exam, one block`);
  const v = CAL.verdictsOf(vb[0].body);
  const bad = [];
  for (const m of v.malformed) bad.push(`the calibration-verdicts block's line ${m.line} is not "<fixture filename>: <class or clean>" (${m.text})`);
  for (const d of v.dupes) bad.push(`the calibration-verdicts block names the fixture ${d} twice`);
  if (!v.judged) bad.push('the calibration-verdicts block has no judged-from: content line');
  const fxSet = new Set(fixtures);
  const setRel = path.relative(root, setDir);
  const setShown = setRel && !setRel.startsWith('..') && !path.isAbsolute(setRel) ? setRel.split(path.sep).join('/') : setDir;
  for (const k of v.map.keys()) if (!fxSet.has(k)) bad.push(`the verdict names the fixture ${k}, which ${setShown}/fixtures/ does not hold`);
  for (const fx of fixtures) if (!v.map.has(fx)) bad.push(`no verdict for the fixture ${fx}`);
  for (const [k, c] of v.map) if (c !== 'clean' && CAL.REQUIRED_CLASSES.indexOf(c) === -1) bad.push(`the verdict for ${k} names ${c}, a class the catalog does not name (one of: ${CAL.REQUIRED_CLASSES.join(', ')}, or clean)`);
  if (bad.length) refuse(bad);

  // 5. the block: exactly one, pending
  const cb = CAL.exactBlocks(raw, 'calibration');
  if (!cb.length) refuse('the findings file carries no calibration block to write');
  if (cb.length > 1) refuse(`the findings file carries ${cb.length} calibration blocks; one exam, one block`);
  const sb = (cb[0].body.split('\n').map((l) => l.match(/^[ \t]*scored-by:[ \t]*(.*?)[ \t]*$/)).find(Boolean) || [])[1];
  if (sb !== 'pending') refuse(`the calibration block is not pending (scored-by: ${sb === undefined ? 'missing' : sb}); one exam, one score - a re-score needs a fresh exam`);

  // 6. the score
  const seeds = labels.length;
  const missedCls = labels.filter((l) => v.map.get(l.fixture) !== l.cls).map((l) => l.cls);
  const caught = seeds - missedCls.length;
  const sha = CAL.verdictsSha(vb[0].body);
  const fnr = `${rate(missedCls.length, seeds)} (${missedCls.length} of ${seeds})`;
  const body = [
    'self-test: plan-challenge vs prompts/calibration/',
    `scored-by: calibration-score.cjs verdicts-sha256 ${sha} at ${new Date().toISOString()}`,
    labelsLine,
    `seeds: ${seeds}`,
    `caught: ${caught}`,
    `FNR: ${fnr}`,
    `missed: ${missedCls.length ? missedCls.join(', ') : 'none'}`,
  ];

  // 7. the write: only the block's body lines, the file's own line ending, temp then rename
  const lines = raw.match(/[^\n]*\n|[^\n]+$/g) || [];
  const bare = (l, i) => (i === 0 ? l.replace(/^﻿/, '') : l).replace(/\r?\n$/, '').replace(/\r$/, '');
  const open = lines.findIndex((l, i) => /^[ \t]*```calibration(?:[ \t].*)?$/.test(bare(l, i)));
  let close = -1;
  for (let i = open + 1; open !== -1 && i < lines.length; i++) if (/^[ \t]*```/.test(bare(lines[i], i))) { close = i; break; }
  if (open === -1 || close === -1) refuse('the calibration block\'s fences cannot be located in the file\'s own bytes');
  const eol = /\r\n$/.test(lines[open]) ? '\r\n' : '\n';
  const out = lines.slice(0, open + 1).join('') + body.map((l) => l + eol).join('') + lines.slice(close).join('');
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
  const shown = path.relative(cwd, file).split(path.sep).join('/') || file;
  process.stdout.write(`${P}: scored ${shown} - seeds ${seeds}, caught ${caught}, FNR ${fnr}, missed ${missedCls.length ? missedCls.join(', ') : 'none'}; verdicts-sha256 ${sha.slice(0, 12)}\n`);
  process.exit(0);
}

main();
