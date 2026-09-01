#!/usr/bin/env node
// @kit-version 1.0.5
// validators/validate-gate-manifest.cjs
//
// The gate-command manifest (M30.I - the general form of the drift class that
// surfaced three times in one field PR): local gate invocations and CI cannot diverge.
// The manifest is DERIVED AT CHECK TIME from the tree's own wiring - hand-listed rows rot
// (the derive-what-can-be-derived doctrine):
//
//   local set:  every `node validators/<name>.cjs` invocation in .githooks/pre-commit and
//               .githooks/pre-push
//   CI set:     every `node validators/<name>.cjs` invocation in .github/workflows/*.yml,
//               plus AGGREGATOR coverage - a workflow that runs one of the registered
//               aggregate suites (verify-local, smoke, or a project's filled smoke
//               command token) covers the locally-invoked validators as a set, because
//               those suites execute the validator estate themselves.
//
// A validator invoked locally with NO CI path to it (named nowhere in a workflow, and no
// aggregator present) BLOCKS naming it; the reverse direction (CI names a validator the
// local hooks never run) is flagged the same way. Honest locus: aggregator coverage is
// asserted at the aggregator level - this check proves a CI lane EXISTS that reaches the
// validator estate, not that a given aggregator exercises one specific validator; the
// suites' own inventory pins carry that. A tree with no workflows at all is a visible
// note, not a block (local-only projects exist).
//
// Usage:
//   node validators/validate-gate-manifest.cjs [--root <dir>]

'use strict';

const fs = require('fs');
const path = require('path');

const AGGREGATORS = [/verify-local\.cjs/, /\bsmoke(\.cjs|-project\.cjs)?\b/, /\{\{SMOKE_COMMAND\}\}/];

function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

function validatorsIn(text) {
  const out = new Set();
  if (text === null) return out;
  const re = /node\s+(?:[.\w/\\-]*[/\\])?validators[/\\]([\w.-]+\.cjs)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  const ri = args.indexOf('--root');
  if (ri !== -1) {
    if (!args[ri + 1]) { process.stderr.write('usage: validate-gate-manifest.cjs [--root <dir>]\n'); process.exit(2); }
    root = path.resolve(args[ri + 1]);
  }
  const unknown = args.filter((a, i) => a.startsWith('--') && a !== '--root' && i !== ri);
  if (unknown.length > 0) {
    process.stderr.write(`gate-manifest: unknown flag ${unknown[0]} - the only flag is --root <dir>; ask in this session rather than guessing.\n`);
    process.exit(2);
  }

  const local = new Set();
  for (const h of ['pre-commit', 'pre-push']) {
    for (const v of validatorsIn(readIf(path.join(root, '.githooks', h)))) local.add(v);
  }

  const wfDir = path.join(root, '.github', 'workflows');
  let wfFiles = [];
  try { wfFiles = fs.readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n)); } catch (_) { wfFiles = []; }
  if (wfFiles.length === 0) {
    process.stderr.write('NOTE  gate-manifest: no .github/workflows here - local gates have no CI half to reconcile against (local-only project). Nothing to check.\n');
    process.exit(0);
  }

  const ci = new Set();
  let aggregated = false;
  for (const n of wfFiles) {
    const t = readIf(path.join(wfDir, n)) || '';
    for (const v of validatorsIn(t)) ci.add(v);
    if (AGGREGATORS.some((re) => re.test(t))) aggregated = true;
  }

  const errors = [];
  if (!aggregated) {
    for (const v of local) {
      if (!ci.has(v)) errors.push(`local gate ${v} (in .githooks/) is invoked by NO workflow, and no aggregate suite (verify-local / smoke) runs in CI - local and CI have diverged`);
    }
  }
  for (const v of ci) {
    if (!local.has(v) && !aggregated) errors.push(`CI invokes ${v} but no local hook runs it - the gate fires only after push`);
  }

  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`FAIL  gate-manifest: ${e}\n`);
    process.stderr.write(`${errors.length} gate divergence(s). Wire the missing half, or route CI through an aggregate suite.\n`);
    process.exit(1);
  }
  process.exit(0);
}

main();
