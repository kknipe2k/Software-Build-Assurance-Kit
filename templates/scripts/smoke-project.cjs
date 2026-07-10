#!/usr/bin/env node
// @kit-version 0.1.0-dev
// scripts/smoke-project.cjs
//
// THE GENERATED MINI-SMOKE — a bootstrapped project's OWN regression
// floor over its inherited enforcement. Before this, a project inherited ~5.6k LOC of
// validators/hooks with ZERO local tests (the kit's smoke suite stays in the kit) — a
// user who tweaks a validator locally was flying test-free.
//
// WHAT IT PROVES: each of the project's three hooks and each PRESENT validator entry
// point still fires correctly — one happy fixture (must pass) and one FAILING fixture
// (must block) per check, on synthetic fixtures in an OS-tmpdir sandbox. Effectiveness,
// not presence: a present-but-dead hook/validator lets its failing fixture through and
// this suite goes RED (a lesson shipped downstream).
//
// WHAT IT DOES NOT PROVE: output quality, your project's own tests, or the kit-side
// contracts (golden/bake stay in the kit). Validators absent from this render
// (tier/toggle-conditional) are a VISIBLE skip, never a silent pass.
//
// Usage:  node scripts/smoke-project.cjs        (run from the project root)
// Exit 0 = all present checks pass. Exit 1 = any failure.
//
// .cjs = always CommonJS regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The shipped confinement primitive — fixtures live in an OS-tmpdir sandbox, never in
// the project tree; the inherited git env is scrubbed (a lesson shipped).
const sandbox = require(path.join(__dirname, 'lib', 'sandbox.cjs'));
sandbox.scrubProcessEnv();

const PROJ = process.cwd();
const TMP = sandbox.sandboxRoot('project-smoke-');
sandbox.armTeardown(TMP);

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) { console.log(`ok    ${label}`); passed++; }
  else { console.log(`FAIL  ${label}${detail ? ` (${detail})` : ''}`); failed++; failures.push(label); }
}
function skip(label, why) { console.log(`skip  ${label} — ${why}`); skipped++; }

function runNode(script, args, opts) {
  const r = spawnSync('node', [script, ...(args || [])], {
    encoding: 'utf8',
    cwd: (opts && opts.cwd) || TMP,
    input: opts && opts.input,
    env: Object.assign({}, sandbox.scrubGitEnv(), (opts && opts.env) || {}),
    timeout: 30000,
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function write(rel, body) {
  const p = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}
function fixtureDir(name) {
  const p = path.join(TMP, name);
  fs.mkdirSync(path.join(p, '.claude'), { recursive: true });
  return p;
}

console.log('smoke-project — the generated mini-smoke (hooks + validator entry points; happy + failing fixture each)');

// ── the four hooks ────────────────────────────────────────────────────────────────────

// (1) session-start-read-first: loads the read-first list; FAIL-OPEN on a hostile/absent
// list (the session must proceed, loudly) — fail-open is this hook's failing-case contract.
const H_SS = path.join(PROJ, '.claude', 'hooks', 'session-start-read-first.cjs');
if (fs.existsSync(H_SS)) {
  const hp = fixtureDir('ss-happy');
  fs.writeFileSync(path.join(hp, '.claude', 'read-first-list.txt'), 'README.md\n');
  fs.writeFileSync(path.join(hp, 'README.md'), 'hello from the mini-smoke\n');
  let r = runNode(H_SS, [], { cwd: hp });
  ok('hook session-start-read-first: happy — loads the read-first list and stamps it',
    r.code === 0 && /read-first|loaded/i.test(r.stdout));
  const hf = fixtureDir('ss-failopen'); // no list file at all
  r = runNode(H_SS, [], { cwd: hf });
  ok('hook session-start-read-first: failing case — missing list stays FAIL-OPEN (session proceeds, loudly)',
    r.code === 0 && (r.stdout + r.stderr).trim().length > 0);
} else skip('hook session-start-read-first', 'not present in this project');

// (2) user-prompt-submit-mode-check: a stage prompt whose mode disagrees with
// .claude/role must BLOCK (exit 2); a matching one passes.
const H_MC = path.join(PROJ, '.claude', 'hooks', 'user-prompt-submit-mode-check.cjs');
if (fs.existsSync(H_MC)) {
  const mc = fixtureDir('mode-check');
  const stagePrompt = JSON.stringify({ prompt: '<work_stage_prompt id="M01.A"><context>x</context></work_stage_prompt>' });
  fs.writeFileSync(path.join(mc, '.claude', 'role'), 'verifier');
  let r = runNode(H_MC, [], { cwd: mc, input: stagePrompt });
  ok('hook mode-check (user-prompt-submit): failing case — a work stage under role=verifier must block (exit 2)',
    r.code === 2, `exit ${r.code}`);
  fs.writeFileSync(path.join(mc, '.claude', 'role'), 'work');
  r = runNode(H_MC, [], { cwd: mc, input: stagePrompt });
  ok('hook mode-check (user-prompt-submit): happy — a matching role passes', r.code === 0, `exit ${r.code}`);
} else skip('hook mode-check (user-prompt-submit)', 'not present in this project');

// (3) pretooluse-red-gate: with a stage OPEN and un-approved, an implementation edit
// must BLOCK (exit 2) — the failing-case teeth a present-but-dead hook cannot fake.
// Driven via the project's own control scripts (the real marker writers).
const H_RG = path.join(PROJ, '.claude', 'hooks', 'pretooluse-red-gate.cjs');
const S_SA = path.join(PROJ, 'scripts', 'stage-active.cjs');
const S_AR = path.join(PROJ, 'scripts', 'approve-red.cjs');
if (fs.existsSync(H_RG) && fs.existsSync(S_SA) && fs.existsSync(S_AR)) {
  const rg = fixtureDir('red-gate');
  const redGate = () => runNode(H_RG, [], {
    cwd: rg,
    input: JSON.stringify({ cwd: rg, tool_input: { file_path: path.join(rg, 'src', 'impl.cjs') } }),
  });
  runNode(S_SA, ['M01.A'], { cwd: rg });                 // open a stage, un-approved
  ok('hook red-gate (pretooluse): failing case — a pre-approval implementation edit must block (exit 2)',
    redGate().code === 2);
  runNode(S_AR, [], { cwd: rg });                        // human approval
  ok('hook red-gate (pretooluse): happy — after approve-red the edit is allowed', redGate().code === 0);
  runNode(S_SA, ['--clear'], { cwd: rg });               // stage closed -> dormant
  ok('hook red-gate (pretooluse): happy — cleared stage goes dormant (allow)', redGate().code === 0);
} else skip('hook red-gate (pretooluse)', 'hook or control scripts not present in this project');

// (4) receipts-lifecycle: the build-receipt adapter. It is OBSERVATIONAL and fail-open —
// a UserPromptSubmit payload must APPEND a turn_started event (the teeth a present-but-dead
// hook cannot fake), and it must NEVER alter the hook exit (exit 0), even on an unwritable
// receipts dir (a metrics fault must never block a session).
const H_RL = path.join(PROJ, '.claude', 'hooks', 'receipts-lifecycle.cjs');
if (fs.existsSync(H_RL)) {
  const rlHappy = fixtureDir('receipts-happy');
  fs.writeFileSync(path.join(rlHappy, '.claude', 'role'), 'work\n');
  let r = runNode(H_RL, [], { cwd: rlHappy, input: JSON.stringify({ cwd: rlHappy, session_id: 'sMini', hook_event_name: 'UserPromptSubmit' }) });
  let appended = false;
  try {
    const led = path.join(rlHappy, '.claude', 'receipts', 'events-sMini.jsonl');
    appended = fs.existsSync(led) && /"event":"turn_started"/.test(fs.readFileSync(led, 'utf8'));
  } catch (_) { /* not appended */ }
  ok('hook receipts-lifecycle: happy — a UserPromptSubmit payload appends a turn_started event (a dead hook appends nothing)',
    r.code === 0 && appended, `exit ${r.code}, appended ${appended}`);
  const rlFail = fixtureDir('receipts-failopen');
  fs.writeFileSync(path.join(rlFail, '.claude', 'receipts'), 'x'); // a FILE where the dir must go -> append throws
  r = runNode(H_RL, [], { cwd: rlFail, input: JSON.stringify({ cwd: rlFail, session_id: 'sMini', hook_event_name: 'UserPromptSubmit' }) });
  ok('hook receipts-lifecycle: failing case — an unwritable receipts dir stays FAIL-OPEN (exit 0, never blocks)',
    r.code === 0, `exit ${r.code}`);
} else skip('hook receipts-lifecycle', 'not present in this project');

// ── validator entry points (present ones only; absent = visible skip) ─────────────────

const V_DIR = path.join(PROJ, 'validators');
const vPath = (n) => path.join(V_DIR, n);
function vRun(name, args) { return runNode(vPath(name), args); }
// One happy + one FAILING fixture per present validator. `failMust` names the teeth.
function vPair(name, happy, failing, failLabel) {
  if (!fs.existsSync(vPath(name))) { skip(`validator ${name}`, 'not present in this render/tier'); return; }
  const h = happy();
  ok(`validator ${name}: happy fixture passes`, h === 0, `exit ${h}`);
  const f = failing();
  ok(`validator ${name}: failing fixture must block — ${failLabel}`, f === 1, `exit ${f}`);
}

const FENCE = '`'.repeat(3);
const VALID_STAGE_BLOCK = '<work_stage_prompt id="M01.A">\n'
  + '<context>x</context><read_first>y</read_first><scope_locks>z</scope_locks>\n'
  + '<gates>g</gates><retrospective_requirements>r</retrospective_requirements>\n'
  + '<commit_protocol>c</commit_protocol><commit_message>m</commit_message>\n'
  + '<approval_surface>a</approval_surface><deliverable>d</deliverable>\n'
  + '<execution_steps>e</execution_steps><test_plan_required>t</test_plan_required>\n'
  + '<acceptance_criteria>ac</acceptance_criteria><test_honesty>named mutation</test_honesty>\n'
  + '</work_stage_prompt>';

vPair('validate-stage-prompts.cjs',
  () => vRun('validate-stage-prompts.cjs', [write('docs/build-prompts/M01-ok.md', `# M01\n\n${FENCE}xml\n${VALID_STAGE_BLOCK}\n${FENCE}\n`)]).code,
  () => vRun('validate-stage-prompts.cjs', [write('docs/build-prompts/M01-broken.md', `# M01\n\n${FENCE}xml\n${VALID_STAGE_BLOCK.replace('<gates>g</gates>', '')}\n${FENCE}\n`)]).code,
  'a stage prompt missing a required tag');

vPair('validate-retrospective.cjs',
  () => vRun('validate-retrospective.cjs', [write('retrospectives/M01-ok-retrospective.md',
    `# Retro\n\n${FENCE}user-stamp\nverdict: pass\nnote: fine\n${FENCE}\n`)]).code,
  () => vRun('validate-retrospective.cjs', [write('retrospectives/M01-bad-retrospective.md',
    `# Retro\n\n${FENCE}user-stamp\nverdict: {{pass|fail}}\n${FENCE}\n`)]).code,
  'a placeholder user-stamp (verdict form — A-15 binary stamp)');

vPair('validate-test-honesty.cjs',
  () => vRun('validate-test-honesty.cjs', [write('ok.test.js', "it('computes', () => { expect(compute()).toBe(1); });\n")]).code,
  () => vRun('validate-test-honesty.cjs', [write('bad.test.js', "it('proves nothing', () => { const x = 1; });\n")]).code,
  'an assertion-free test');

vPair('validate-app-map.cjs',
  () => {
    write('appmap-ok/tests/e2e.spec.js', "it('drives', () => { cy.get('[data-testid=\"map-live-id\"]'); });\n");
    const m = write('appmap-ok/docs/app-map.md', '# App Map\n\n| Surface | Test-id | State |\n|---|---|---|\n| thing | map-live-id | verified |\n');
    return runNode(vPath('validate-app-map.cjs'), ['--tests', 'tests/**', m], { cwd: path.join(TMP, 'appmap-ok') }).code;
  },
  () => {
    const m = write('appmap-bad/docs/app-map.md', '# App Map\n\n| Surface | Test-id | State |\n|---|---|---|\n| thing | dead-test-id-zzz | verified |\n');
    return runNode(vPath('validate-app-map.cjs'), ['--tests', 'tests/**', m], { cwd: path.join(TMP, 'appmap-bad') }).code;
  },
  'a verified entry citing a dead test-id');

vPair('validate-transition.cjs',
  () => vRun('validate-transition.cjs', [write('set-state-ok.cjs',
    "const fs = require('fs');\nfunction setMode(m) { const tmp = '.claude/role.tmp'; fs.writeFileSync(tmp, m); fs.renameSync(tmp, '.claude/role'); }\nmodule.exports = { setMode };\n")]).code,
  () => vRun('validate-transition.cjs', [write('set-state-bad.cjs',
    "const fs = require('fs');\nfunction setMode(m) { fs.writeFileSync('.claude/role', m); }\nmodule.exports = { setMode };\n")]).code,
  'a truncate-then-write of a durable-state file');

vPair('validate-operating-mode.cjs',
  () => vRun('validate-operating-mode.cjs', [write('cfg-ok/project-config.md', '**Operating mode:** greenfield\n')]).code,
  () => vRun('validate-operating-mode.cjs', [write('cfg-bad/project-config.md', '**Operating mode:** bananas\n')]).code,
  'an out-of-range operating_mode');

vPair('validate-risk-escalation.cjs',
  () => {
    const g = write('risk-ok/docs/gates.md', '# Gates\n\ncredentials: deep verification because: this project handles tokens.\n');
    return vRun('validate-risk-escalation.cjs', ['--gates', g, write('risk-ok/project-config.md', 'risk_triggers: [credentials]\n')]).code;
  },
  () => {
    const g = write('risk-bad/docs/gates.md', '# Gates\n\n(no escalation record)\n');
    return vRun('validate-risk-escalation.cjs', ['--gates', g, write('risk-bad/project-config.md', 'risk_triggers: [credentials]\n')]).code;
  },
  'a declared risk trigger with no escalation record');

vPair('validate-destructive-op.cjs',
  () => vRun('validate-destructive-op.cjs', [write('restore-ok.test.js',
    "it('restore rollback succeeds', () => { expect(undo()).toBe(true); });\n"
    + "it('restore confinement refuses a hostile path', () => { expect(() => restore('../../etc/passwd')).toThrow(); });\n")]).code,
  () => vRun('validate-destructive-op.cjs', [write('restore-bad.test.js',
    "it('restore rollback succeeds', () => { expect(undo()).toBe(true); });\n")]).code,
  'a destructive surface with rollback but no confinement test');

vPair('validate-risk-matrix.cjs',
  () => {
    const props = ['normal', 'hostile-input', 'partial-failure', 'confinement', 'authorization',
      'resource-bounds', 'recovery', 'observability', 'cross-platform']
      .map((p) => `<property name="${p}">covered-by: x — test: t</property>`).join('\n');
    return vRun('validate-risk-matrix.cjs', [write('docs/build-prompts/M02-risk-ok.md',
      `# M02\n\n${FENCE}xml\n<work_stage_prompt id="M02.A">\n<risk_declaration triggers="credentials">\n${props}\n</risk_declaration>\n</work_stage_prompt>\n${FENCE}\n`)]).code;
  },
  () => vRun('validate-risk-matrix.cjs', [write('docs/build-prompts/M02-risk-bad.md',
    `# M02\n\n${FENCE}xml\n<work_stage_prompt id="M02.B">\n<risk_declaration triggers="credentials">\n<property name="normal">covered-by: x — test: t</property>\n</risk_declaration>\n</work_stage_prompt>\n${FENCE}\n`)]).code,
  'a risk declaration omitting matrix properties');

vPair('validate-calibration.cjs',
  () => vRun('validate-calibration.cjs', [write('M01.V-ok-findings.md',
    `# Findings\n\n${FENCE}verdict\nstatus: Sound\n${FENCE}\n\n${FENCE}calibration\nseeds caught: 8/8\nfnr: 0\n${FENCE}\n`)]).code,
  () => vRun('validate-calibration.cjs', [write('M01.V-bad-findings.md',
    `# Findings\n\n${FENCE}verdict\nstatus: Sound\n${FENCE}\n\nNo calibration block.\n`)]).code,
  'a Sound verdict with no calibration block');

vPair('validate-release-readiness.cjs',
  () => {
    const cfg = write('rr-ok-config.md', 'risk_triggers: []\n');
    const map = write('rr-ok-app-map.md', '# App Map\n\n(no surfaces)\n');
    const ledger = write('rr-ok-release-state.md',
      '# Release-State Ladder\n\n## 2026-06-20 — reached `stage-complete` (step 0)\n- Evidence: run ref\n');
    return vRun('validate-release-readiness.cjs', ['--config', cfg, '--app-map', map, ledger]).code;
  },
  () => {
    const cfg = write('rr-bad-config.md', 'risk_triggers: [credentials]\n');
    const map = write('rr-bad-app-map.md', '# App Map\n\n(no surfaces)\n');
    const ladder = ['stage-complete', 'milestone-complete', 'internally-usable',
      'source-release-ready', 'packaged-release-ready', 'public-distribution-ready'];
    let s = '# Release-State Ladder\n\n';
    for (let i = 0; i < ladder.length; i++) {
      const releaseEnd = ladder[i] === 'packaged-release-ready' || ladder[i] === 'public-distribution-ready';
      s += `## 2026-06-2${i} — reached \`${ladder[i]}\` (climb step ${i})\n`;
      if (i > 0) s += `- Prior state: \`${ladder[i - 1]}\`\n`;
      if (releaseEnd) s += '- SLSA build level: L2\n';
      s += `- Evidence: run https://ci/run/${i}\n`;
    }
    const ledger = write('rr-bad-release-state.md', s);
    return vRun('validate-release-readiness.cjs', ['--config', cfg, '--app-map', map, ledger]).code;
  },
  'a public-distribution claim with capability triggers and no independent review record');

vPair('validate-reconciliation.cjs',
  () => vRun('validate-reconciliation.cjs', [write('recon-ok.md', '# Notes\n\nNo counted claims here.\n')]).code,
  () => {
    write('recon-src.txt', 'fix one\nfix two\nfix three\n');
    return vRun('validate-reconciliation.cjs', [write('recon-bad.md',
      `# Closeout\n\n${FENCE}reconcile\ncount: 999\nsource: recon-src.txt\npattern: fix\n${FENCE}\n`)]).code;
  },
  'a claimed count that does not recompute from its named source');

// Kit-only / mode-conditional validators — visibly skipped BY DESIGN, with the reason.
const BY_DESIGN_SKIPS = {
  'validate-entry-docs.cjs': 'kit-only (polices the KIT\'s self-claims against framework-manifest.json)',
  'validate-validator-enumeration.cjs': 'kit-only (reconciles the kit\'s catalogs; a project has no rows.json)',
  'validate-sources.cjs': 'research_publish-mode only (source-registry binding)',
  'check-append-only.cjs': 'git-history-dependent (runs in CI over PR diffs, not on synthetic fixtures)',
};
let known = new Set([
  'validate-stage-prompts.cjs', 'validate-retrospective.cjs', 'validate-test-honesty.cjs',
  'validate-app-map.cjs', 'validate-transition.cjs', 'validate-operating-mode.cjs',
  'validate-risk-escalation.cjs', 'validate-destructive-op.cjs', 'validate-risk-matrix.cjs',
  'validate-calibration.cjs', 'validate-release-readiness.cjs', 'validate-reconciliation.cjs',
]);
let present = [];
try { present = fs.readdirSync(V_DIR).filter((n) => /\.cjs$/.test(n)); } catch (_) { present = []; }
for (const n of present) {
  if (known.has(n)) continue;
  if (BY_DESIGN_SKIPS[n]) skip(`validator ${n}`, BY_DESIGN_SKIPS[n]);
  else skip(`validator ${n}`, 'no fixture pair in this mini-smoke — run the kit suite for coverage');
}

// ── summary ─────────────────────────────────────────────────────────────────────────────
console.log();
if (failed === 0) {
  console.log(`smoke-project: all ${passed} checks passed (${skipped} visible skip(s)).`);
  console.log('(this proves the inherited enforcement still FIRES — for kit-side contracts, run the kit\'s own suite.)');
  process.exit(0);
}
console.log(`smoke-project: ${failed} of ${passed + failed} checks FAILED:`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
