#!/usr/bin/env node
// @kit-version 1.0.2
// validators/validate-outcome-challenge.cjs
//
// The Outcome Challenge shape check (companion §6 A–D, Workstream 3; M26.F).
// The Outcome Challenge is the kit's contract-completeness challenge — authored
// BEFORE IMPLEMENTATION, scaled by risk. This validator polices its SHAPE: the
// four parts are present, the six-universal-quality-dimensions anchor stands,
// the risk-scaling and before-implementation statements survive. A document
// missing a part REDs NAMING the missing part.
//
// HONEST LOCUS — a shape check, not a judgment: it proves the challenge's four
// parts exist and their anchors survive editing; it does NOT judge whether the
// answers are good (parts B and D are human judgment by design). A
// template-state document (placeholders unfilled) PASSES — the structure is the
// contract here; filling it is the pre-implementation lifecycle step the doc
// itself binds, and the calibrated severity model (Full BLOCK / Lite warn)
// polices the doc whenever it is staged.
//
// Severity / the toggle (mirrors the sibling validators, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed
//                      branch (exit 2) is NEVER downgraded.
//
// Usage:
//   node validators/validate-outcome-challenge.cjs [--warn] <file> [file...]
//     no file argument → docs/outcome-challenge.md under the cwd.
//
// Exit 0 = clean (or advisory). Exit 1 = ≥1 blocking finding. Exit 2 =
// fail-closed (an unreadable named file — never a silent pass on unknown state).
//
// Dependency-free, cross-platform, CRLF/BOM-tolerant (the shared normalize).
// .cjs = always CommonJS regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require(path.join(__dirname, 'lib', 'fenced-block.cjs')); // consume, don't fork

// The four parts (companion §6) + the surviving anchors. Each check names what
// a RED is missing — "part D" must be nameable from the output, never a bare
// exit code.
const CHECKS = [
  { re: /^## A\./m, why: 'part A (the outcome contract — actor, objective, success journey, dimensions, evidence)' },
  { re: /^## B\./m, why: 'part B (the omission challenge — the seven planning questions)' },
  { re: /^## C\./m, why: 'part C (outcome drives — real entry → real operation → real observable result → real failure/recovery)' },
  { re: /^## D\./m, why: 'part D (the independent product challenge — a reviewer who did not inherit the builder\'s explanation)' },
  { re: /six universal quality dimensions/i, why: 'the six-universal-quality-dimensions anchor (part A must challenge every dimension)' },
  { re: /scaled by risk|risk scaling/i, why: 'the risk-scaling statement (one challenge scaled by risk, not a deliverable catalog)' },
  { re: /before implementation/i, why: 'the before-implementation binding (authored at closeout it is history, not a constraint)' },
];

function failClosed(msg) {
  process.stderr.write(`FAIL  ${msg}\n      Refusing to pass the outcome-challenge gate on an unknown document state (fail-closed).\n`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const files = args.filter((a) => a !== '--warn');
  if (files.length === 0) files.push(path.join(process.cwd(), 'docs', 'outcome-challenge.md'));

  const findings = [];
  for (const f of files) {
    let text;
    try { text = normalize(fs.readFileSync(f, 'utf8')); }
    catch (e) { failClosed(`cannot read ${f}: ${e && e.message ? e.message : 'unknown error'}`); }
    for (const c of CHECKS) {
      if (!c.re.test(text)) findings.push(`${path.basename(f)}: missing ${c.why}`);
    }
  }

  if (findings.length === 0) {
    process.stdout.write(`ok    outcome challenge shape holds for ${files.length} file(s) — parts A–D present, dimensions/risk-scaling/before-implementation anchors intact.\n`);
    process.exit(0);
  }
  const tag = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${tag} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} outcome-challenge finding(s) (advisory — run without --warn to block). The challenge only works whole: restore the missing part(s) before implementation.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} outcome-challenge finding(s) block this commit — the challenge only works whole (a dropped part is exactly the omission class it exists to catch).\n`);
  process.exit(1);
}

main();
