#!/usr/bin/env node
// @kit-version 1.0.10
// scripts/evidence.cjs
//   (kit source of truth: templates/scripts/evidence.cjs; the core is scripts/lib/evidence.cjs)
//
// THE EVIDENCE PATH's command line (M34.6.B, R-139). Every check reads the one library and its one
// exclusion constant (.claude/evidence/, .claude/channel/, retrospectives/):
//
//   node scripts/evidence.cjs --fingerprint                      the index's subject (sha256:<hex>)
//   node scripts/evidence.cjs --stage <id> --verify [--against head|index]
//        every file in the stage's manifest re-hashed, each record's subject checked against the
//        manifest's, the manifest's subject resolved against the tree of the commit that introduced
//        the stage's gate.json (default) or against the index (before the commit)
//   node scripts/evidence.cjs --stage <id> --review [--against head|index]
//        the orchestrator's review of a stage's bundle (M34.6.C item 4), read only: the subject, the
//        approved set, the RED's failing labels beside the red-stop packet's red-failing: lines, the
//        GREEN, config_drift, the judged and refusals summaries, the lane run and the superseded
//        records, the changed paths beside the section's named paths, the out-of-scope lines and the
//        scope lock, the acceptance criteria with the stage-end packet's acceptance <n>: pins, the
//        record ids; it writes nothing
//   node scripts/evidence.cjs --pre-commit                       the pre-commit hook's check
//   node scripts/evidence.cjs --transport-check --range <a>..<b> ci's check over a pushed range
//   node scripts/evidence.cjs --pre-push                         the pre-push hook's check (stdin)
//
// Exit 0 = passed (or nothing to check); 1 = refused, one line naming why; 2 = a bad invocation.
// The transport check: a stage commit is a single-parent commit whose diff touches
// .claude/evidence/<stage>/gate.json; it is refused when its committed lane_run.json does not carry
// the commit's own subject with verdict pass. Any other commit is covered by the lane, as before.
// An artifact store and a separate evidence ref are unsupported on this path.

'use strict';

const fs = require('fs');
const path = require('path');
const ev = require('./lib/evidence.cjs');

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 || i === argv.length - 1 ? null : argv[i + 1]; };
const has = (n) => argv.indexOf(n) !== -1;
function root() {
  const r = require('child_process').spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout).trim() : process.cwd();
}
function done(r) {
  if (r.out) process.stdout.write(r.out + '\n');
  if (r.err) process.stderr.write(r.err + '\n');
  process.exit(r.code);
}
const USAGE = 'usage: node scripts/evidence.cjs --fingerprint | --stage <id> --verify [--against head|index] | --stage <id> --review [--against head|index] | --pre-commit | --transport-check --range <a>..<b> | --pre-push';

if (has('--fingerprint')) {
  const s = ev.subject(root());
  if (s.error) done({ code: 1, err: `evidence: no subject - ${s.error}` });
  done({ code: 0, out: s.subject });
}
if (has('--verify')) {
  const stage = opt('--stage');
  const against = opt('--against') || 'head';
  if (!stage || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(stage) || ['head', 'index'].indexOf(against) === -1) done({ code: 2, err: USAGE });
  done(ev.verify(root(), stage, against));
}
if (has('--review')) {
  const stage = opt('--stage');
  const against = opt('--against');
  if (!stage || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(stage) || (against !== null && ['head', 'index'].indexOf(against) === -1)) done({ code: 2, err: USAGE });
  done(ev.review(root(), stage, against));
}
if (has('--pre-commit')) done(ev.preCommit(root()));
if (has('--transport-check')) {
  const range = opt('--range');
  const m = range ? /^([^.\s]*)\.\.([^.\s]+)$/.exec(range) : null;
  if (!m) done({ code: 2, err: USAGE });
  done(ev.transportCheck(root(), m[1] || null, m[2], range));
}
if (has('--pre-push')) {
  let text = '';
  try { text = fs.readFileSync(0, 'utf8'); } catch (_) { text = ''; }
  done(ev.prePush(root(), text));
}
done({ code: 2, err: USAGE });
