#!/usr/bin/env node
// @kit-version 1.0.8
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
// M32.C adds two rules (proposals/M32-FIELD-REPAIR.md §3.3 + §3.6):
//
//   one CI gate per step:  in a workflow with TWO OR MORE gate steps, a step with `id: setup`
//               must precede them and every gate step must carry
//               `if: ${{ !cancelled() && steps.setup.outcome == 'success' }}`, else BLOCK
//               naming the step. The claim "no gate step can skip another" is PROVEN by a
//               replay of GitHub's step-status semantics over the parsed step table (each
//               gate step forced red in turn; every other gate step must still run), not
//               asserted from the guard string. A gate step is a step that runs a validator
//               or an aggregator, or a `run:` step that sits between the setup step and the
//               last such step (the project's suite command sits there in every template
//               shape, and it is the red that hides the rest). A workflow with one gate
//               step is exempt (nothing can hide behind it). A `run:` chaining two gates
//               with `&&` is a WARN, not a wall. Replay on demand:
//               `--replay <workflow> [--fail <step name or id>]`.
//   blocking needs a locus:  when docs/gates.md exists, every table row marked blocking
//               (the word block / blocks / blocking anywhere in the row, which includes a
//               toggle whose Full default is `block`) must name a locus in its mechanism
//               column (the header cell reading Command / Enforced by / Mechanism): a
//               `validators/<name>.cjs` that exists in the tree, a workflow or hook file
//               that exists, or a filled command span. Prose only ("Codecov or
//               equivalent"), an absent validator path, or an unfilled `{{TOKEN}}` BLOCK
//               naming the row - an engine the kit does not ship is not a gate.
//               `--gates <file>` points the rule at another file (relative to --root).
//
// The step reader is a line-based reader for the workflow shapes the kit ships (a `steps:`
// list under `jobs.<job>`, `- key:` items, scalar and `|` block values); it is not a YAML
// parser. Expression evaluation covers the status functions (`success()`, `failure()`,
// `always()`, `cancelled()`), `steps.<id>.outcome` / `.conclusion`, `matrix.os` (the
// ubuntu leg), `==` / `!=` / `!` / `&&` / `||` and parentheses; any other function
// (`hashFiles`, `contains`, ...) is treated as satisfied, because the replay asks what the
// STATUS logic allows, not whether a file exists on the runner.
//
// Usage:
//   node validators/validate-gate-manifest.cjs [--root <dir>] [--gates <file>]
//   node validators/validate-gate-manifest.cjs [--root <dir>] --replay <workflow> [--fail <step>]

'use strict';

const fs = require('fs');
const path = require('path');

const AGGREGATORS = [/verify-local\.cjs/, /\bsmoke(\.cjs|-project\.cjs)?\b/, /\{\{SMOKE_COMMAND\}\}/];
const GUARD = "if: ${{ !cancelled() && steps.setup.outcome == 'success' }}";

function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

function validatorsIn(text) {
  const out = new Set();
  if (text === null) return out;
  const re = /node\s+(?:[.\w/\\-]*[/\\])?validators[/\\]([\w.-]+\.cjs)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return out;
}

// ── the step reader (M32.C) ───────────────────────────────────────────────────────────
function parseWorkflowSteps(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const steps = [];
  let job = null; let inJobs = false; let inSteps = false; let cur = null; let block = null;
  const indentOf = (l) => l.length - l.replace(/^ */, '').length;
  const flush = () => { if (block) { cur[block.key] = block.lines.map((l) => l.slice(block.indent)).join('\n').trim(); block = null; } };
  // A scalar's trailing `  # comment` is not part of the value (`id: setup   # why`,
  // `uses: actions/checkout@sha  # v7.0.1`); `if:` keeps its text for cleanIf, `run:` keeps
  // its command bytes.
  const assign = (step, key, value) => {
    if (/^[|>][+-]?$/.test(value)) { block = { key, indent: 10, lines: [] }; return; }
    if (!Object.prototype.hasOwnProperty.call(step, key)) return;
    step[key] = (key === 'if' || key === 'run') ? value.trim() : value.replace(/\s+#.*$/, '').trim();
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\t/g, '  ');
    if (block) {
      if (!line.trim() || indentOf(line) >= block.indent) { block.lines.push(line); continue; }
      flush();
    }
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const ind = indentOf(line);
    if (ind === 0) { inJobs = /^jobs:/.test(line); inSteps = false; cur = null; continue; }
    if (!inJobs) continue;
    if (ind === 2) { const m = /^ {2}([\w.-]+):/.exec(line); if (m) job = m[1]; inSteps = false; cur = null; continue; }
    if (ind === 4) { inSteps = /^ {4}steps:/.test(line); cur = null; continue; }
    if (!inSteps) continue;
    if (ind === 6 && /^ {6}- /.test(line)) {
      cur = { job, index: steps.filter((s) => s.job === job).length, line: i + 1, name: '', id: '', uses: '', if: '', run: '' };
      steps.push(cur);
      const m = /^ {6}- ([\w-]+):\s*(.*)$/.exec(line);
      if (m) assign(cur, m[1], m[2]);
      continue;
    }
    if (cur && ind === 8) { const m = /^ {8}([\w-]+):\s*(.*)$/.exec(line); if (m) assign(cur, m[1], m[2]); }
  }
  flush();
  for (const s of steps) s.label = s.name || s.uses || s.id || `step ${s.index + 1}`;
  return steps;
}

// The `if:` value as GitHub sees it: the inside of `${{ }}` when present, else the bare
// expression with a trailing comment stripped.
function cleanIf(value) {
  const v = String(value || '').trim();
  const a = v.indexOf('${{'); const b = v.lastIndexOf('}}');
  if (a !== -1 && b > a) return v.slice(a + 3, b).trim();
  return v.replace(/\s+#.*$/, '').trim();
}

// ── the expression evaluator (M32.C) ─────────────────────────────────────────────────
function evalExpr(expr, ctx) {
  const toks = [];
  const re = /\s*(?:(\|\||&&|==|!=|!|\(|\)|,)|'((?:[^']|'')*)'|([A-Za-z_][\w.-]*))/y;
  let pos = 0; let m;
  while (pos < expr.length) {
    re.lastIndex = pos; m = re.exec(expr);
    if (!m || m.index !== pos) { if (!expr.slice(pos).trim()) break; throw new Error(`cannot read if-expression at "${expr.slice(pos, pos + 20)}"`); }
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: m[1] });
    else if (m[2] !== undefined) toks.push({ t: 'str', v: m[2].replace(/''/g, "'") });
    else toks.push({ t: 'id', v: m[3] });
  }
  let i = 0;
  const peek = () => toks[i]; const take = () => toks[i++];
  const value = (x) => (typeof x === 'boolean' ? x : String(x));
  const truthy = (x) => (typeof x === 'boolean' ? x : String(x) !== '');
  function primary() {
    const tk = take();
    if (!tk) throw new Error('unexpected end of if-expression');
    if (tk.t === '(') { const v = or(); if (!peek() || take().t !== ')') throw new Error('missing )'); return v; }
    if (tk.t === '!') return !truthy(primary());
    if (tk.t === 'str') return tk.v;
    if (tk.t === 'id') {
      if (peek() && peek().t === '(') {
        take(); const args = [];
        while (peek() && peek().t !== ')') { args.push(or()); if (peek() && peek().t === ',') take(); }
        take();
        const fn = tk.v.toLowerCase();
        if (fn === 'success') return !ctx.failed;
        if (fn === 'failure') return ctx.failed;
        if (fn === 'always') return true;
        if (fn === 'cancelled') return false;
        return 'satisfied';
      }
      const parts = tk.v.split('.');
      if (parts[0] === 'steps' && parts.length === 3 && (parts[2] === 'outcome' || parts[2] === 'conclusion')) return ctx.outcomes[parts[1]] || '';
      if (tk.v === 'matrix.os') return 'ubuntu-latest';
      if (tk.v === 'true') return true;
      if (tk.v === 'false') return false;
      return '';
    }
    throw new Error(`unexpected token ${tk.t}`);
  }
  function cmp() {
    let left = primary();
    while (peek() && (peek().t === '==' || peek().t === '!=')) {
      const op = take().t; const right = primary();
      const eq = value(left) === value(right);
      left = op === '==' ? eq : !eq;
    }
    return left;
  }
  function and() { let v = cmp(); while (peek() && peek().t === '&&') { take(); const r = cmp(); v = truthy(v) && truthy(r); } return v; }
  function or() { let v = and(); while (peek() && peek().t === '||') { take(); const r = and(); v = truthy(v) || truthy(r); } return v; }
  const result = or();
  if (i !== toks.length) throw new Error('trailing tokens in if-expression');
  return truthy(result);
}

// GitHub's step-status semantics: a step with no `if:` runs iff no earlier step failed; an
// `if:` with NO status function gets success() prepended; one WITH a status function stands
// alone (so `!cancelled()` runs after a failure, and the setup outcome must be stated).
function replaySteps(steps, forced) {
  const ctx = { failed: false, outcomes: {} };
  const rows = [];
  for (const s of steps) {
    const expr = cleanIf(s.if);
    let runs;
    if (expr === '') runs = !ctx.failed;
    else if (/\b(success|failure|always|cancelled)\s*\(/.test(expr)) runs = evalExpr(expr, ctx);
    else runs = !ctx.failed && evalExpr(expr, ctx);
    const isForced = forced.has(s.label) || (s.id && forced.has(s.id));
    const outcome = !runs ? 'skipped' : (isForced ? 'failure' : 'success');
    if (outcome === 'failure') ctx.failed = true;
    if (s.id) ctx.outcomes[s.id] = outcome;
    rows.push({ step: s, runs, outcome, expr });
  }
  return rows;
}

function isGateStep(s) { return validatorsIn(s.run).size > 0 || AGGREGATORS.some((re) => re.test(s.run || '')); }

// Gate steps per job: the detected ones plus every `run:` step between the setup step and
// the last detected one (the suite). Returns [{ job, steps, gates, setupIdx }].
function jobsOf(steps) {
  const out = [];
  for (const job of [...new Set(steps.map((s) => s.job))]) {
    const js = steps.filter((s) => s.job === job);
    const setupIdx = js.findIndex((s) => s.id === 'setup');
    const detected = js.map((s, i) => (isGateStep(s) ? i : -1)).filter((i) => i !== -1);
    const last = detected.length ? detected[detected.length - 1] : -1;
    const gates = js.filter((s, i) => detected.includes(i) || (s.run && i > setupIdx && setupIdx !== -1 && i < last));
    out.push({ job, steps: js, gates, setupIdx });
  }
  return out;
}

// ── rule: one CI gate per step (M32.C §3.3) ──────────────────────────────────────────
function checkStepGuards(root, wfFiles) {
  const errors = []; const warns = [];
  for (const n of wfFiles) {
    const rel = `.github/workflows/${n}`;
    const steps = parseWorkflowSteps(readIf(path.join(root, '.github', 'workflows', n)) || '');
    for (const j of jobsOf(steps)) {
      for (const s of j.steps) {
        const names = [...validatorsIn(s.run)];
        if (names.length >= 2 && /&&/.test(s.run)) warns.push(`${rel}: step "${s.label}" chains two gates in one run: (${names.join(', ')}) - one gate per step, so a red in the first never hides the second`);
      }
      if (j.gates.length < 2) continue;
      if (j.setupIdx === -1 || j.steps.indexOf(j.gates[0]) < j.setupIdx) {
        errors.push(`${rel}: job "${j.job}" has ${j.gates.length} gate steps but no step before them carries id: setup - give the setup step (setup-node, or checkout on a non-Node stack) id: setup and guard every gate step with ${GUARD}`);
        continue;
      }
      for (const g of j.gates) {
        const expr = cleanIf(g.if);
        if (!/!\s*cancelled\s*\(\s*\)/.test(expr)) errors.push(`${rel}: gate step "${g.label}" has no !cancelled() guard - a red in an earlier gate step skips it; add ${GUARD}`);
        else if (!/steps\.setup\.(outcome|conclusion)\s*==\s*'success'/.test(expr)) errors.push(`${rel}: gate step "${g.label}" carries !cancelled() without steps.setup.outcome == 'success' - it would run after a failed setup; use ${GUARD}`);
      }
      const skippedBy = new Map();
      for (const g of j.gates) {
        let rows;
        try { rows = replaySteps(j.steps, new Set([g.label])); } catch (e) { errors.push(`${rel}: step "${g.label}": ${e.message}`); continue; }
        for (const r of rows) if (j.gates.includes(r.step) && r.step !== g && !r.runs && !skippedBy.has(r.step.label)) skippedBy.set(r.step.label, g.label);
      }
      for (const [h, g] of skippedBy) errors.push(`${rel}: gate step "${h}" would be skipped when "${g}" fails (replayed over the step table) - the red in one gate hides the other's verdict`);
    }
  }
  return { errors, warns };
}

function replayCli(opt) {
  const file = path.join(opt.root, opt.replay);
  const text = readIf(file);
  if (text === null) { process.stderr.write(`gate-manifest: --replay ${opt.replay}: cannot read ${file}\n`); process.exit(2); }
  const steps = parseWorkflowSteps(text);
  const forced = new Set(opt.fail ? [opt.fail] : []);
  if (opt.fail && !steps.some((s) => s.label === opt.fail || s.id === opt.fail)) { process.stderr.write(`gate-manifest: --fail ${JSON.stringify(opt.fail)} names no step (by name or id) in ${opt.replay}\n`); process.exit(2); }
  let rows;
  try { rows = replaySteps(steps, forced); } catch (e) { process.stderr.write(`gate-manifest: --replay ${opt.replay}: ${e.message}\n`); process.exit(2); }
  process.stdout.write(`replay ${opt.replay}${opt.fail ? ` with "${opt.fail}" failed` : ''}: ${rows.filter((r) => r.runs).length} of ${rows.length} steps run\n`);
  for (const r of rows) {
    process.stdout.write(`${r.runs ? 'run ' : 'skip'}  ${r.step.label}\n`);
    process.stdout.write(`        ${r.step.id ? `id: ${r.step.id} · ` : ''}outcome: ${r.outcome}${r.expr ? ` · if: ${r.expr}` : ' · (no if: - runs only while no earlier step failed)'}\n`);
  }
  process.exit(0);
}

// ── rule: no blocking gate without an engine (M32.C §3.6) ────────────────────────────
function splitRow(line) {
  const cells = line.replace(/\\\|/g, '\u0001').split('|').map((c) => c.replace(/\u0001/g, '\\|').trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function locusOf(cell, root) {
  const vals = [...cell.matchAll(/validators\/([\w.-]+\.cjs)/g)].map((m) => m[1]);
  if (vals.length) {
    const absent = vals.filter((v) => !fs.existsSync(path.join(root, 'validators', v)));
    return absent.length ? { ok: false, why: `names validators/${absent[0]} which is not in the tree` } : { ok: true };
  }
  const spans = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const wf = [...cell.matchAll(/\b([\w.-]+\.ya?ml)\b/g)].map((m) => m[1]);
  for (const w of wf) if (fs.existsSync(path.join(root, '.github', 'workflows', w))) return { ok: true };
  const hook = /\.githooks\/(pre-commit|pre-push)|\bpre-(commit|push) hook/i.exec(cell);
  if (hook) { const h = (hook[1] || `pre-${hook[2]}`).toLowerCase(); if (fs.existsSync(path.join(root, '.githooks', h))) return { ok: true }; }
  const filled = spans.filter((s) => !/\{\{[^}]*\}\}/.test(s) && !/\.ya?ml$/.test(s));
  if (filled.length) return { ok: true };
  if (wf.length) return { ok: false, why: `names ${wf[0]} which is not in .github/workflows` };
  if (spans.some((s) => /\{\{[^}]*\}\}/.test(s))) return { ok: false, why: 'its command is an unfilled {{TOKEN}}' };
  return { ok: false, why: 'the cell is prose with no validator, workflow, hook or command' };
}

function checkGateLocus(root, gatesRel) {
  const rel = gatesRel || 'docs/gates.md';
  const text = readIf(path.join(root, rel));
  if (text === null) { if (gatesRel) { process.stderr.write(`gate-manifest: --gates ${gatesRel}: cannot read ${path.join(root, rel)}\n`); process.exit(2); } return []; }
  const errors = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const col = header.findIndex((h) => /command|enforced by|mechanism/i.test(h));
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      if (col === -1) continue;
      const cells = splitRow(lines[j]);
      if (cells.length <= col || !/\bblock(s|ed|ing)?\b/i.test(lines[j])) continue;
      const gate = cells[0].replace(/\*\*/g, '').trim();
      const r = locusOf(cells[col], root);
      if (!r.ok) errors.push(`${rel}:${j + 1}: blocking gate "${gate}" names no locus in its "${header[col]}" column (${r.why}) - name a validators/*.cjs in the tree, a workflow or hook file, or the filled command; an engine the kit does not ship is not a gate`);
    }
    i = j - 1;
  }
  return errors;
}

// ── the original rule: local gates and CI cannot diverge (M30.I) ─────────────────────
function parseArgs(args) {
  const opt = { root: process.cwd(), gates: null, replay: null, fail: null };
  const valued = { '--root': 'root', '--gates': 'gates', '--replay': 'replay', '--fail': 'fail' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valued[a]) {
      if (!args[i + 1]) { process.stderr.write('usage: validate-gate-manifest.cjs [--root <dir>] [--gates <file>] [--replay <workflow> [--fail <step>]]\n'); process.exit(2); }
      opt[valued[a]] = a === '--root' ? path.resolve(args[i + 1]) : args[i + 1];
      i++;
    } else if (a.startsWith('--')) {
      process.stderr.write(`gate-manifest: unknown flag ${a} - the flags are --root <dir>, --gates <file>, --replay <workflow>, --fail <step>; ask in this session rather than guessing.\n`);
      process.exit(2);
    }
  }
  return opt;
}

function localSet(root) {
  const local = new Set();
  for (const h of ['pre-commit', 'pre-push']) for (const v of validatorsIn(readIf(path.join(root, '.githooks', h)))) local.add(v);
  return local;
}

function workflowFiles(root) {
  try { return fs.readdirSync(path.join(root, '.github', 'workflows')).filter((n) => /\.ya?ml$/.test(n)); } catch (_) { return []; }
}

function ciSet(root, wfFiles) {
  const ci = new Set(); let aggregated = false;
  for (const n of wfFiles) {
    const t = readIf(path.join(root, '.github', 'workflows', n)) || '';
    for (const v of validatorsIn(t)) ci.add(v);
    if (AGGREGATORS.some((re) => re.test(t))) aggregated = true;
  }
  return { ci, aggregated };
}

function divergences(local, ci, aggregated) {
  const errors = [];
  if (!aggregated) for (const v of local) if (!ci.has(v)) errors.push(`local gate ${v} (in .githooks/) is invoked by NO workflow, and no aggregate suite (verify-local / smoke) runs in CI - local and CI have diverged`);
  for (const v of ci) if (!local.has(v) && !aggregated) errors.push(`CI invokes ${v} but no local hook runs it - the gate fires only after push`);
  return errors;
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.replay) replayCli(opt);
  const errors = checkGateLocus(opt.root, opt.gates);
  const wfFiles = workflowFiles(opt.root);
  let warns = [];
  if (wfFiles.length === 0) {
    process.stderr.write('NOTE  gate-manifest: no .github/workflows here - local gates have no CI half to reconcile against (local-only project). Nothing to check.\n');
  } else {
    const guards = checkStepGuards(opt.root, wfFiles);
    warns = guards.warns;
    errors.push(...guards.errors);
    const { ci, aggregated } = ciSet(opt.root, wfFiles);
    errors.push(...divergences(localSet(opt.root), ci, aggregated));
  }
  for (const w of warns) process.stderr.write(`WARN  gate-manifest: ${w}\n`);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`FAIL  gate-manifest: ${e}\n`);
    process.stderr.write(`${errors.length} gate finding(s). Wire the missing half, guard the gate step, or name the engine.\n`);
    process.exit(1);
  }
  process.exit(0);
}

main();
