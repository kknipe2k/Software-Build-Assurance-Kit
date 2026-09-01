#!/usr/bin/env node
// @kit-version 1.0.5
// validators/validate-closeout-packet.cjs
//
// The closeout floor (M30.I, audit fades 2 + 4, rows 48/49 - all RULED at M30.B):
//
//   --packet <file>   The closeout packet's three hard rules: (1) it LEADS with
//                     deltas-from-plan and the open V/R findings - a tidy all-good packet
//                     is the false-green shape and REDs; (2) it is reviewed AGAINST
//                     RECEIPTS, never artifact-vs-artifact - a `reviewed-against:` line
//                     naming receipts is required; (3) the CHANGELOG entry is DERIVED
//                     from the commit list (a `derived-from:` line naming the command)
//                     and the authored part is the one why-it-matters line.
//   --gap <file>      The gap-analysis content contract: the entry CITES its sources
//                     (receipts / retrospectives / V-R findings) instead of restating
//                     them, and stated counts are seeded (a ```reconcile block), never
//                     typed. Append-only is untouched - the hook owns it.
//   --ladder <milestone> --release-state <file>
//                     The ladder hook (row 49): the closing milestone must have a row in
//                     the release-state ledger - a missed update breaks the next cut
//                     silently, so its absence REDs the closeout.
//
// Honest locus (stated, not hidden): these are presence checks over a stated shape. The
// mechanical half can enforce that citations exist and numbers carry a seed; it cannot
// grade whether the synthesis is GOOD or the cited receipt supports the sentence - the
// owner's review of the packet is that wall.
//
// Usage:
//   node validators/validate-closeout-packet.cjs --packet <file>
//   node validators/validate-closeout-packet.cjs --gap <file>
//   node validators/validate-closeout-packet.cjs --ladder <MNN> --release-state <file>

'use strict';

const fs = require('fs');

function die(msg, code) { process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n'); process.exit(code); }
function readOrDie(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch (_) { die(`FAIL  closeout-packet: cannot read ${f}`, 2); }
  return '';
}

function checkPacket(file) {
  const t = readOrDie(file);
  const errors = [];
  const headings = [...t.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  if (headings.length === 0 || !/^deltas from plan/i.test(headings[0])) {
    errors.push('the packet does not LEAD with "## Deltas from plan" - an all-good packet is the false-green shape; deltas and open findings come first (hard rule 3)');
  }
  if (!headings.some((h) => /^open findings/i.test(h))) {
    errors.push('no "## Open findings" section - the open V/R findings lead the packet beside the deltas (hard rule 3)');
  }
  if (!/^reviewed-against:\s*receipts/im.test(t)) {
    errors.push('no `reviewed-against: receipts` line - the review runs against receipts, never artifact-vs-artifact (hard rule 1)');
  }
  if (!/^derived-from:\s*git log/im.test(t)) {
    errors.push('no `derived-from: git log ...` line - the CHANGELOG entry derives from the commit list (hard rule 2)');
  }
  if (!/^why-it-matters:\s*\S/im.test(t)) {
    errors.push('no `why-it-matters:` line - the one authored sentence is required (hard rule 2)');
  }
  return errors;
}

function checkGap(file) {
  const t = readOrDie(file);
  const errors = [];
  const cites = /retrospectives\/[\w.\/-]+|\.claude\/receipts|[\w.-]+-findings\.md/.test(t);
  if (!cites) {
    errors.push('the entry cites NO source (no retrospectives/, receipts, or -findings.md reference) - the contract is cite, never restate (fade 2)');
  }
  const hasCountClaims = /\b\d+\s+(tests?|commits?|findings?|lines?|checks?|files?|mutants?)\b/i.test(
    t.replace(/```reconcile[\s\S]*?```/g, ''));
  if (hasCountClaims && !/```reconcile/.test(t)) {
    errors.push('the entry states counts with no ```reconcile block - numbers are seeded from their source, never typed');
  }
  return errors;
}

function checkLadder(milestone, file) {
  const t = readOrDie(file);
  const re = new RegExp('^##\\s+\\d{4}-\\d{2}-\\d{2}[^\\n]*\\(' + milestone + '\\b', 'm');
  if (!re.test(t)) {
    return [`the release-state ledger has no row for ${milestone} - the ladder update is part of closing (row 49); append the milestone's rung before the closeout commit`];
  }
  return [];
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => { const i = args.indexOf(flag); return i === -1 ? null : (args[i + 1] || null); };
  const packet = get('--packet');
  const gap = get('--gap');
  const ladder = get('--ladder');

  let errors = [];
  let ran = false;
  if (packet) { errors = errors.concat(checkPacket(packet)); ran = true; }
  if (gap) { errors = errors.concat(checkGap(gap)); ran = true; }
  if (ladder) {
    const rs = get('--release-state') || 'docs/release-state.md';
    errors = errors.concat(checkLadder(ladder, rs));
    ran = true;
  }
  if (!ran) die('usage: validate-closeout-packet.cjs --packet <file> | --gap <file> | --ladder <MNN> [--release-state <file>]', 2);

  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`FAIL  closeout-packet: ${e}\n`);
    process.exit(1);
  }
  process.exit(0);
}

main();
