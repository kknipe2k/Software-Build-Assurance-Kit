#!/usr/bin/env node
// @kit-version 1.0.5
// scripts/verify-local.cjs
//
// The ONE local verification entrypoint (verification_locus: local_first | hybrid),
// with LANES. Pure Node + spawned shells; Node is already required by Claude Code.
//
//   node scripts/verify-local.cjs                     # the complete floor (=== --lane release)
//   node scripts/verify-local.cjs --lane fast         # every push (the pre-push hook default)
//   node scripts/verify-local.cjs --lane stage        # the stage-end gate
//   node scripts/verify-local.cjs --lane release      # closeout, Stage V, version tags
//   node scripts/verify-local.cjs --list [--lane L]   # the task -> lane table, run nothing
//   node scripts/verify-local.cjs --list --json       # the same table, machine-readable
//   node scripts/verify-local.cjs --summary out.json  # also write the summary JSON
//   node scripts/verify-local.cjs --summary-only      # emit ONLY the summary JSON
//   node scripts/verify-local.cjs --reconcile M03     # closeout: the three proofs + the estate review
//   node scripts/verify-local.cjs --reconcile M03 --write   # ...then mark M03's tests settled
// Non-zero exit on any failure; exit 2 on a bad flag or an invalid registry.
//
// ── LANES ─────────────────────────────────────────────────────────────────────────────
// ONE task registry as DATA; three lanes as FILTERS over it. `release` is DERIVED as the
// whole registry and ignores the lane tags, so no data edit can shrink it. In `release` a
// required skip is a FAILURE. Durations are measured and reported, never gated: a lane's
// value is its SCOPE, and a lane may never get faster by asserting less.
//
//   lane      when                                  what runs                              legs
//   fast      every push (hook default)             affected + the open milestone's       native
//                                                   active tests + the always class
//   stage     stage-end gate                        the same over the whole milestone      native
//                                                   diff (base = merge-base with main)
//   release   closeout, Stage V, version tags       the full suite; the marker is ignored  linux + native
//
// HOW `fast` NARROWS - by proof, never by hope. Three legs inside the native task:
//   affected  the runner's OWN change scoping (vitest --changed / jest --changedSince /
//             pytest --testmon), filled at bootstrap from the stack's derive-table row;
//             <base> is computed here, never pasted. This is what catches a settled test
//             whose module the diff reaches through the import graph.
//   active    the open milestone's test files, handed explicitly: every discovered test
//             file not in tests/.settled.json, plus any settled file the diff touches (the
//             affected override - settled is a state, not a judgment), plus every file of a
//             closed milestone the open stage's Phase doc re-declares (reopening).
//   always    every test whose NAME carries the token `always` - architecture-wide guards
//             that run in every lane regardless of selection.
// FALLBACK = FULL. The stack has no native selection (fill = full), the fills are unfilled,
// the base cannot be resolved, the diff touches a path outside source (lockfile, CI, runner
// config - the OUTSIDE_SOURCE table below), or the testmon plugin is not importable: the
// lane widens to the full native suite and the foreground line SAYS SO. `release` never
// reads the marker at all.
//
// THE UNION PIN. At closeout `--reconcile <milestone>` proves, in this order and before any
// write: (1) every discovered test file is in exactly one of {settled, active} once the
// closing milestone's files settle; (2) the last fast summary's handed files, unioned with
// the settled set, cover every discovered file; (3) the release lane passed at this HEAD.
// Only `--write` after all three touches tests/.settled.json (write-temp-rename).
//
// The Linux leg mirrors the GitHub ubuntu image in Docker (WSL2 via VERIFY_LINUX=wsl);
// VERIFY_SKIP_LINUX=1 is the logged emergency skip. Wired as .githooks/pre-push (`--lane
// fast`); `git push --no-verify` cannot bypass the required PR check (docs/gates.md).

'use strict';

const { spawnSync, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---- project configuration (filled at bootstrap) ----------------------------
const CONFIG = {
  // Docker image mirroring the GitHub ubuntu-latest toolchain for this stack.
  dockerImage: '{{DOCKER_IMAGE}}',              // e.g. 'node:20-bookworm'
  // The full test command, run inside the Linux container.
  // PATH-SCOPE it when the suite is Node's built-in runner: a bare `node --test` auto-
  // discovers every Node-test-pattern file anywhere under the repo - vendored trees like
  // sbak/ included. Use a QUOTED GLOB: node --test "tests/**/*.test.cjs".
  linuxTestCommand: '{{LINUX_TEST_COMMAND}}',   // e.g. 'npm ci && npm test'
  // The full test command, run natively on this dev machine.
  nativeTestCommand: '{{NATIVE_TEST_COMMAND}}', // e.g. 'npm test'
  // ── the lane fills: ONE derive-table row per stack ─────────────────────────────────
  //    node scripts/calibration-derive.cjs --lanes <vitest|jest|pytest|node|go>
  // `<base>` and `<files>` are substituted here at run time. The literal value `full`
  // means "this stack has no native selection": fast/stage run the full native suite.
  affectedTestCommand: '{{AFFECTED_TEST_COMMAND}}', // e.g. 'vitest run --changed <base>' | 'full'
  activeTestCommand: '{{ACTIVE_TEST_COMMAND}}',     // e.g. 'vitest run <files>'
  alwaysTestCommand: '{{ALWAYS_TEST_COMMAND}}',     // e.g. 'vitest run -t always'
  // Where the test files live (the same globs the App-Map validator uses); discovery for
  // the settled manifest and the union pin.
  testGlobs: '{{APP_MAP_TEST_GLOBS}}',              // e.g. 'tests/**'
};
// -----------------------------------------------------------------------------

const LANES = ['fast', 'stage', 'release'];
const DEFAULT_LANE = 'release';
const SETTLED_PATH = 'tests/.settled.json';
const SETTLED_SCHEMA = 'sbak/settled-tests/v1';
const SUMMARY_SCHEMA = 'sbak/verify-lane-summary/v1';
const LAST_DIR = '.claude';
const ALWAYS_TOKEN = 'always';

// A change here is not a source change the runner's graph can scope, so the lane widens
// to full. ONE table; `--list` prints it. Prefixes end in `/`; anything else is a basename
// or an exact relative path.
const OUTSIDE_SOURCE = [
  { match: '.github/', why: 'CI workflows' },
  { match: '.githooks/', why: 'the hooks themselves' },
  { match: 'scripts/verify-local.cjs', why: 'this script' },
  { match: SETTLED_PATH, why: 'the settled manifest' },
  { match: 'package.json', why: 'dependency / script manifest' },
  { match: 'package-lock.json', why: 'lockfile' }, { match: 'yarn.lock', why: 'lockfile' },
  { match: 'pnpm-lock.yaml', why: 'lockfile' }, { match: 'bun.lockb', why: 'lockfile' },
  { match: 'poetry.lock', why: 'lockfile' }, { match: 'Pipfile.lock', why: 'lockfile' },
  { match: 'requirements.txt', why: 'dependency manifest' }, { match: 'uv.lock', why: 'lockfile' },
  { match: 'go.mod', why: 'module manifest' }, { match: 'go.sum', why: 'lockfile' },
  { match: 'Cargo.toml', why: 'crate manifest' }, { match: 'Cargo.lock', why: 'lockfile' },
  { match: 'pyproject.toml', why: 'runner / tool config' }, { match: 'setup.cfg', why: 'runner / tool config' },
  { match: 'pytest.ini', why: 'runner config' }, { match: 'tox.ini', why: 'runner config' },
  { match: 'conftest.py', why: 'pytest root config' },
  { match: 'vitest.config.', why: 'runner config' }, { match: 'vitest.workspace.', why: 'runner config' },
  { match: 'jest.config.', why: 'runner config' }, { match: 'babel.config.', why: 'transform config' },
  { match: '.babelrc', why: 'transform config' }, { match: 'tsconfig', why: 'compiler config' },
  { match: 'Dockerfile', why: 'container definition' },
];

const RED = '\x1b[31m', GREEN = '\x1b[32m', CYAN = '\x1b[36m', DIM = '\x1b[2m', RESET = '\x1b[0m';

const unfilled = (v) => typeof v !== 'string' || v === '' || /^\{\{[A-Z_]+\}\}$/.test(v);

// ── git + fs helpers ──────────────────────────────────────────────────────────────────
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) return null;
  return r.stdout;
}
function repoRoot() {
  const out = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  return out ? out.trim() : process.cwd();
}
function have(bin, args) {
  try { return spawnSync(bin, args || ['--version'], { stdio: 'ignore' }).status === 0; } catch (_) { return false; }
}
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

function isOutsideSource(rel) {
  const n = norm(rel);
  const base = path.posix.basename(n);
  return OUTSIDE_SOURCE.find((row) => (row.match.endsWith('/') ? n.startsWith(row.match) : (n === row.match || base.startsWith(row.match))));
}

// test-file discovery under the configured globs: the common runner naming conventions
// (stack-agnostic on purpose - the manifest and the union pin need one consistent view).
const TEST_FILE = /(^|[./_-])(test|spec)s?\.[cm]?[jt]sx?$|^test_.*\.py$|_test\.(py|go)$|\.spec\.[cm]?[jt]sx?$/;
function globToRoots(globs) {
  return String(globs).split(/[,\s]+/).filter(Boolean).map((g) => norm(g).replace(/\/?\*\*.*$/, '').replace(/\/?\*.*$/, '')).filter(Boolean);
}
function discoverTests(root) {
  if (unfilled(CONFIG.testGlobs)) return null;
  const out = [];
  for (const dir of globToRoots(CONFIG.testGlobs)) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (TEST_FILE.test(ent.name)) out.push(norm(path.relative(root, p)));
      }
    };
    walk(abs);
  }
  return out.sort();
}

function readSettled(root) {
  const p = path.join(root, SETTLED_PATH);
  if (!fs.existsSync(p)) return { manifest: { schema: SETTLED_SCHEMA, milestones: {} }, absent: true };
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (m.schema !== SETTLED_SCHEMA || typeof m.milestones !== 'object') return { error: `${SETTLED_PATH} is not a ${SETTLED_SCHEMA} manifest` };
    return { manifest: m };
  } catch (e) { return { error: `${SETTLED_PATH} is unreadable: ${e.message}` }; }
}
function settledFiles(manifest, except) {
  const by = {};
  for (const [mid, entry] of Object.entries(manifest.milestones || {})) {
    if (except && except.has(mid)) continue;
    for (const f of (entry.tests || [])) (by[norm(f)] = by[norm(f)] || []).push(mid);
  }
  return by; // file -> [milestones]
}

// Reopening: the open stage's Phase doc re-declares a closed milestone's test file (or a
// milestone-specific directory of it) in <scope_locks> / <deliverable> -> that milestone
// is active again for this run. Read from .claude/stage-active, mechanically.
function reopenedMilestones(root, manifest) {
  const out = new Set();
  let active = null;
  try { active = fs.readFileSync(path.join(root, '.claude', 'stage-active'), 'utf8').trim(); } catch (_) { return out; }
  const mid = (/^(M\d+)\./.exec(active) || [])[1];
  if (!mid) return out;
  const dir = path.join(root, 'docs', 'build-prompts');
  let docs = [];
  try { docs = fs.readdirSync(dir).filter((f) => f.startsWith(mid + '-') && f.endsWith('.md')); } catch (_) { return out; }
  let text = '';
  for (const f of docs) text += fs.readFileSync(path.join(dir, f), 'utf8');
  const declared = [];
  for (const m of text.matchAll(/<scope_locks>([\s\S]*?)<\/scope_locks>|<deliverable\b([^>]*)\/?>([\s\S]*?)(?:<\/deliverable>|$)/g)) declared.push((m[1] || '') + (m[2] || '') + (m[3] || ''));
  const decl = declared.join('\n');
  if (!decl) return out;
  for (const [m, entry] of Object.entries(manifest.milestones || {})) {
    if (m === mid) continue;
    for (const f of (entry.tests || [])) {
      const n = norm(f);
      const d = path.posix.dirname(n);
      if (decl.includes(n) || (d.split('/').length >= 2 && decl.includes(d + '/'))) { out.add(m); break; }
    }
  }
  return out;
}

function resolveBase(root, lane) {
  if (lane === 'fast') {
    const up = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    if (up && up.trim()) {
      const mb = git(root, ['merge-base', 'HEAD', up.trim()]);
      if (mb) return { base: mb.trim(), how: `merge-base with ${up.trim()} (what this push adds)` };
    }
  }
  for (const ref of ['origin/main', 'main', 'origin/master', 'master']) {
    if (!git(root, ['rev-parse', '--verify', '--quiet', ref])) continue;
    const mb = git(root, ['merge-base', 'HEAD', ref]);
    if (mb) return { base: mb.trim(), how: `merge-base with ${ref}` };
  }
  return { base: null, how: 'no upstream and no main/master ref resolves' };
}

function testmonImportable() {
  for (const py of ['python', 'python3', 'py']) {
    const r = spawnSync(py, ['-c', 'import testmon'], { stdio: 'ignore' });
    if (r.status === 0) return true;
  }
  return false;
}

// ── THE PLAN: what fast/stage will hand to the runner, decided once, printed by --list ──
function computePlan(root, lane) {
  const plan = {
    lane, base: null, baseHow: null, selection: 'native', fallbackReason: null,
    discovered: [], settled: [], settledBy: {}, active: [], settledTouched: [], reopened: [], handed: [], diff: [], outsideSource: [],
  };
  const fallback = (why) => { plan.selection = 'full'; if (!plan.fallbackReason) plan.fallbackReason = why; };
  if (lane === 'release') { fallback('release runs the full suite by definition'); return plan; }

  const discovered = discoverTests(root);
  if (discovered === null) fallback('test globs are not filled (APP_MAP_TEST_GLOBS) - coverage cannot be proven');
  plan.discovered = discovered || [];
  const st = readSettled(root);
  if (st.error) fallback(st.error);
  const manifest = st.manifest || { milestones: {} };
  const reopened = reopenedMilestones(root, manifest);
  plan.reopened = [...reopened].sort();
  const by = settledFiles(manifest, reopened);
  plan.settledBy = by;
  plan.settled = Object.keys(by).sort();

  const b = resolveBase(root, lane);
  plan.base = b.base; plan.baseHow = b.how;
  if (!b.base) fallback(`the base cannot be resolved (${b.how})`);
  if (b.base) {
    const d = git(root, ['diff', '--name-only', b.base]);
    if (d === null) fallback('git diff against the base failed');
    else plan.diff = d.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(norm);
  }
  plan.outsideSource = plan.diff.filter((f) => isOutsideSource(f)).map((f) => ({ path: f, why: isOutsideSource(f).why }));
  if (plan.outsideSource.length) fallback(`the diff touches ${plan.outsideSource[0].path} (outside source: ${plan.outsideSource[0].why})`);

  if (unfilled(CONFIG.affectedTestCommand) || unfilled(CONFIG.activeTestCommand) || unfilled(CONFIG.alwaysTestCommand)) fallback('the lane fills were not filled at bootstrap (AFFECTED/ACTIVE/ALWAYS_TEST_COMMAND)');
  else if (CONFIG.affectedTestCommand.trim() === 'full') fallback('no native affected selection for this stack (AFFECTED_TEST_COMMAND = full)');
  else if (/--testmon\b/.test(CONFIG.affectedTestCommand) && !testmonImportable()) fallback('pytest-testmon is not importable (add pytest-testmon to the dev dependencies)');

  const settledSet = new Set(plan.settled);
  plan.active = plan.discovered.filter((f) => !settledSet.has(f));
  const diffSet = new Set(plan.diff);
  plan.settledTouched = plan.settled.filter((f) => diffSet.has(f));
  plan.handed = plan.selection === 'full' ? plan.discovered.slice() : [...new Set([...plan.active, ...plan.settledTouched])].sort();
  return plan;
}

// ── the registry ──────────────────────────────────────────────────────────────────────
const REQUIREMENTS = {
  'linux-runtime': {
    reason: 'the Linux leg needs Docker (mirrors the GitHub ubuntu image) or WSL2 via VERIFY_LINUX=wsl - install Docker Desktop, or re-run with VERIFY_LINUX=wsl (requires: linux-runtime)',
    probe: () => ((process.env.VERIFY_LINUX || 'docker') === 'wsl' ? have('wsl', ['--status']) || have('wsl', ['--version']) : have('docker')),
  },
};

const TASKS = [
  { id: 'linux', label: 'Linux leg (Docker mirroring the GitHub ubuntu image; WSL2 via VERIFY_LINUX=wsl)',
    lanes: ['release'], requires: ['linux-runtime'] },
  { id: 'native', label: `Native leg (${process.platform})`,
    lanes: ['fast', 'stage', 'release'], requires: [],
    laneCaveat: 'fast/stage run a NARROWED native leg: affected (runner-native) + active (handed explicitly). It is not the full suite; release is.' },
  { id: 'always', label: `always-tagged guards (tests whose name carries \`${ALWAYS_TOKEN}\`)`,
    lanes: ['fast', 'stage'], requires: [] },
];

function validateRegistry() {
  const seen = new Set();
  for (const t of TASKS) {
    if (!t.id || seen.has(t.id)) throw new Error(`registry: missing or duplicate task id ${JSON.stringify(t.id)}`);
    seen.add(t.id);
    if (!Array.isArray(t.lanes) || t.lanes.length === 0) throw new Error(`registry: task "${t.id}" belongs to no lane (membership law)`);
    for (const l of t.lanes) if (!LANES.includes(l)) throw new Error(`registry: task "${t.id}" names unknown lane "${l}"`);
    for (const r of (t.requires || [])) if (!REQUIREMENTS[r]) throw new Error(`registry: task "${t.id}" names unknown requirement "${r}"`);
  }
  return true;
}
function laneTasks(lane) { return lane === 'release' ? TASKS.slice() : TASKS.filter((t) => t.lanes.includes(lane)); }
function requiredSkipIsFailure(lane) { return lane === 'release'; }
function registryHash() {
  const canon = TASKS.map((t) => ({ id: t.id, lanes: t.lanes.slice().sort(), requires: (t.requires || []).slice().sort() }));
  const fills = [CONFIG.linuxTestCommand, CONFIG.nativeTestCommand, CONFIG.affectedTestCommand, CONFIG.activeTestCommand, CONFIG.alwaysTestCommand];
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify({ canon, fills })).digest('hex');
}

// The steps a task runs in a lane, given the plan. Each step is ONE shell string handed to
// the platform shell as a single argv element (cmd /c | sh -lc) - never hand-escaped.
function stepsFor(task, lane, plan, root) {
  if (task.id === 'linux') {
    const wsl = (process.env.VERIFY_LINUX || 'docker') === 'wsl';
    return [wsl
      ? { name: 'linux-wsl', file: 'wsl', args: ['bash', '-lc', CONFIG.linuxTestCommand], cmd: `wsl bash -lc ${JSON.stringify(CONFIG.linuxTestCommand)}` }
      : { name: 'linux-docker', file: 'docker', args: ['run', '--rm', '-v', `${root}:/work`, '-w', '/work', CONFIG.dockerImage, 'sh', '-lc', CONFIG.linuxTestCommand],
        cmd: `docker run --rm -v <root>:/work -w /work ${CONFIG.dockerImage} sh -lc ${JSON.stringify(CONFIG.linuxTestCommand)}` }];
  }
  if (task.id === 'always') {
    if (plan.selection === 'full') return [];
    return [{ name: 'always', shell: CONFIG.alwaysTestCommand, cmd: CONFIG.alwaysTestCommand }];
  }
  // native
  if (lane === 'release' || plan.selection === 'full') return [{ name: 'full', shell: CONFIG.nativeTestCommand, cmd: CONFIG.nativeTestCommand }];
  const affected = CONFIG.affectedTestCommand.split('<base>').join(plan.base);
  const steps = [{ name: 'affected', shell: affected, cmd: affected }];
  if (plan.handed.length) {
    const files = plan.handed.map((f) => (/\s/.test(f) ? JSON.stringify(f) : f)).join(' ');
    steps.push({ name: 'active', shell: CONFIG.activeTestCommand.split('<files>').join(files), cmd: CONFIG.activeTestCommand.split('<files>').join(`<${plan.handed.length} file(s)>`) });
  }
  return steps;
}

function runStep(step, root, quiet) {
  const t0 = Date.now();
  let r;
  if (step.file) r = spawnSync(step.file, step.args, { stdio: quiet ? 'ignore' : 'inherit', cwd: root });
  else {
    const [sh, args] = process.platform === 'win32' ? ['cmd', ['/c', step.shell]] : ['sh', ['-lc', step.shell]];
    r = spawnSync(sh, args, { stdio: quiet ? 'ignore' : 'inherit', cwd: root });
  }
  return { name: step.name, cmd: step.cmd, exitCode: r.status === null ? 1 : r.status, durationMs: Date.now() - t0 };
}

function atomicWrite(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
}
function readLast(root, lane) {
  try { return JSON.parse(fs.readFileSync(path.join(root, LAST_DIR, `verify-last-${lane}.json`), 'utf8')); } catch (_) { return null; }
}

// ── --reconcile: the three proofs, then (only with --write) the marker ────────────────
function reconcile(root, milestone, write) {
  const head = (git(root, ['rev-parse', 'HEAD']) || '').trim();
  const say = (s) => process.stdout.write(s + '\n');
  const fail = (s) => { process.stdout.write(`${RED}reconcile FAILED${RESET} ${s}\n`); return 1; };
  const discovered = discoverTests(root);
  if (discovered === null) return fail('test globs are not filled (APP_MAP_TEST_GLOBS) - nothing can be discovered');
  const st = readSettled(root);
  if (st.error) return fail(st.error);
  const manifest = st.manifest;
  const disc = new Set(discovered);

  // proof 1 - partition after the update
  const by = settledFiles(manifest);
  const gone = Object.keys(by).filter((f) => !disc.has(f));
  const twice = Object.entries(by).filter(([, ms]) => ms.length > 1).map(([f, ms]) => `${f} (${ms.join(', ')})`);
  const active = discovered.filter((f) => !by[f]);
  if (gone.length) return fail(`settled file(s) no longer in the tree - remove them from ${SETTLED_PATH} deliberately: ${gone.join(', ')}`);
  if (twice.length) return fail(`file(s) settled under two milestones: ${twice.join(', ')}`);
  say(`reconcile 1/3  partition: every discovered test file is in exactly one of {settled, active} after marking ${milestone} settled - ${discovered.length} discovered = ${Object.keys(by).length} settled + ${active.length} active, 0 in neither, 0 in both`);

  // proof 2 - the union pin over the last fast summary
  const fast = readLast(root, 'fast');
  if (!fast || fast.schema !== SUMMARY_SCHEMA) return fail(`no fast-lane summary at ${LAST_DIR}/verify-last-fast.json - run --lane fast first`);
  const handed = new Set(fast.selection === 'full' ? fast.discovered || [] : fast.handed || []);
  const uncovered = discovered.filter((f) => !handed.has(f) && !by[f]);
  if (uncovered.length) return fail(`uncovered: ${uncovered.map((f) => `${f} - in no lane`).join('; ')}`);
  say(`reconcile 2/3  union: the last fast-lane summary (${LAST_DIR}/verify-last-fast.json, head ${String(fast.head || '').slice(0, 9)}) handed ${handed.size} files; handed ∪ settled covers all ${discovered.length} discovered files - 0 uncovered`);

  // proof 3 - release passed at this head
  const rel = readLast(root, 'release');
  if (!rel || rel.schema !== SUMMARY_SCHEMA) return fail(`no release-lane summary at ${LAST_DIR}/verify-last-release.json - run --lane release at this head first`);
  if (rel.verdict !== 'pass') return fail(`the last release lane did not pass (verdict ${rel.verdict})`);
  if (rel.head !== head) return fail(`the last release lane ran at ${String(rel.head).slice(0, 9)}, not this HEAD ${head.slice(0, 9)} - re-run --lane release`);
  say(`reconcile 3/3  release: the release lane passed at this head (${LAST_DIR}/verify-last-release.json, verdict pass, head ${head.slice(0, 9)} == HEAD)`);

  // the estate review - numbers from this run, never typed
  const per = Object.entries(manifest.milestones || {}).map(([m, e]) => `${m}: ${(e.tests || []).length}`);
  const alwaysFiles = discovered.filter((f) => path.posix.basename(f).includes(ALWAYS_TOKEN)).length;
  say('');
  say(`test-estate review (${milestone})`);
  say(`  discovered: ${discovered.length} test file(s) under ${CONFIG.testGlobs}`);
  say(`  settled: ${Object.keys(by).length} across ${per.length} milestone(s)${per.length ? ' - ' + per.join(', ') : ''}`);
  say(`  active (${milestone}, settling at this closeout): ${active.length}${active.length ? ' - ' + active.join(', ') : ''}`);
  say(`  files whose name carries \`${ALWAYS_TOKEN}\`: ${alwaysFiles} (tags inside files are the runner's to count)`);
  say(`  last fast lane: selection ${fast.selection}${fast.fallbackReason ? ` (${fast.fallbackReason})` : ''}, handed ${handed.size} of ${discovered.length}`);
  say(`  after this closeout: ${Object.keys(by).length + active.length} settled, 0 active`);

  if (!write) { say(`\n(dry run - add --write to mark ${milestone} settled in ${SETTLED_PATH})`); return 0; }
  const entry = manifest.milestones[milestone] || { closedAt: head, tests: [] };
  entry.closedAt = head;
  entry.tests = [...new Set([...(entry.tests || []), ...active])].sort();
  manifest.milestones[milestone] = entry;
  atomicWrite(path.join(root, SETTLED_PATH), JSON.stringify(manifest, null, 2) + '\n');
  say(`\n${GREEN}settled:${RESET} ${milestone} - ${active.length} file(s) marked in ${SETTLED_PATH} (commit it with the gap-analysis entry)`);
  return 0;
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const KNOWN = ['--lane', '--list', '--json', '--summary', '--summary-only', '--reconcile', '--write'];
  for (let i = 0; i < argv.length; i++) {
    if (!KNOWN.includes(argv[i])) { process.stderr.write(`verify-local: unknown argument ${JSON.stringify(argv[i])} - known: ${KNOWN.join(', ')}\n`); process.exit(2); }
    if (['--lane', '--summary', '--reconcile'].includes(argv[i])) i++;
  }
  const flag = (n) => argv.includes(n);
  const value = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
  const root = repoRoot();

  try { validateRegistry(); } catch (e) { process.stderr.write(`\n✗ verify-local: registry invalid - ${e.message}\n`); process.exit(2); }

  if (flag('--reconcile')) {
    const m = value('--reconcile');
    if (!m || !/^M\d+$/.test(m)) { process.stderr.write('verify-local: --reconcile needs a milestone id (e.g. --reconcile M03)\n'); process.exit(2); }
    process.exit(reconcile(root, m, flag('--write')));
  }

  const lane = value('--lane') || DEFAULT_LANE;
  if (!LANES.includes(lane)) { process.stderr.write(`verify-local: unknown lane "${lane}" - expected one of ${LANES.join(', ')}\n`); process.exit(2); }
  const plan = computePlan(root, lane);
  const selected = laneTasks(lane);
  const summaryOnly = flag('--summary-only');
  const quiet = summaryOnly;

  if (flag('--list')) {
    const rows = selected.map((t) => ({ id: t.id, lanes: t.lanes.slice(), requires: (t.requires || []).slice(), steps: stepsFor(t, lane, plan, root).map((s) => s.cmd) }));
    if (flag('--json')) {
      process.stdout.write(JSON.stringify({ schema: 'sbak/verify-lane-listing/v1', lane, registryHash: registryHash(), taskCount: rows.length, selection: plan.selection, fallbackReason: plan.fallbackReason, base: plan.base, tasks: rows, outsideSource: OUTSIDE_SOURCE }, null, 2) + '\n');
      process.exit(0);
    }
    process.stdout.write(`\nlane: ${lane}  (${rows.length} task${rows.length === 1 ? '' : 's'})  ${registryHash()}\n`);
    if (lane !== 'release') process.stdout.write(`  selection: ${plan.selection}${plan.fallbackReason ? ` (${plan.fallbackReason})` : ` (base ${String(plan.base).slice(0, 9)}, ${plan.baseHow}; ${plan.handed.length} active file(s) handed, ${plan.settled.length} settled)`}\n`);
    process.stdout.write('\n');
    for (const t of selected) {
      const req = (t.requires || []).length ? `  requires: ${t.requires.join(', ')}` : '';
      process.stdout.write(`  ${t.id.padEnd(10)} [${t.lanes.join(' ')}]${req}\n`);
      const steps = stepsFor(t, lane, plan, root);
      if (steps.length === 0) process.stdout.write('      (nothing in this lane - covered by the full native run)\n');
      for (const s of steps) process.stdout.write(`      ${s.name.padEnd(13)} ${s.cmd}\n`);
      if (t.laneCaveat && lane !== 'release') process.stdout.write(`      ! ${t.laneCaveat}\n`);
    }
    process.stdout.write(`\n  release is DERIVED as the whole registry (lane tags ignored); a required skip is a failure there.\n  outside-source paths (any -> fast/stage run full): ${OUTSIDE_SOURCE.map((r) => r.match).join(' ')}\n\n`);
    process.exit(0);
  }

  if (!quiet) {
    process.stdout.write(`\n${CYAN}local verification - lane ${lane}, ${selected.length} task(s)${RESET}\n`);
    if (lane !== 'release') {
      process.stdout.write(plan.selection === 'full'
        ? `${RED}selection: full${RESET} (${plan.fallbackReason}) - the full native suite runs; nothing is narrowed\n`
        : `${DIM}selection: native - base ${String(plan.base).slice(0, 9)} (${plan.baseHow}); ${plan.handed.length} active file(s) handed (${plan.settledTouched.length} settled-but-touched, ${plan.reopened.length} milestone(s) reopened), ${plan.settled.length} settled and untouched${RESET}\n`);
    }
  }

  const availability = {};
  for (const t of selected) for (const r of (t.requires || [])) if (!(r in availability)) availability[r] = REQUIREMENTS[r].probe();
  const results = [];
  let failed = false;
  const suiteStart = Date.now();
  for (const t of selected) {
    let skip = null; let verdict = null;
    if (t.id === 'linux' && process.env.VERIFY_SKIP_LINUX === '1') { skip = 'VERIFY_SKIP_LINUX=1 - the emergency skip, logged here; never routine'; verdict = 'skip'; }
    else {
      const unmet = (t.requires || []).filter((r) => !availability[r]);
      if (unmet.length) { skip = unmet.map((r) => REQUIREMENTS[r].reason).join('; '); verdict = requiredSkipIsFailure(lane) ? 'fail' : 'skip'; }
    }
    const steps = skip ? [] : stepsFor(t, lane, plan, root);
    if (!skip && steps.length === 0) { skip = 'nothing in this lane - covered by the full native run'; verdict = 'skip'; }
    if (skip) {
      if (verdict === 'fail') failed = true;
      if (!quiet) process.stdout.write(`\n${CYAN}> ${t.label}${RESET}\n${verdict === 'fail' ? RED + 'FAIL required check did not run: ' : DIM + 'SKIP '}${skip}${RESET}\n`);
      results.push({ id: t.id, label: t.label, lanes: t.lanes.slice(), requires: (t.requires || []).slice(), verdict, skipReason: skip, durationMs: 0, exitCode: null, steps: [] });
      continue;
    }
    if (!quiet) process.stdout.write(`\n${CYAN}> ${t.label}${RESET}\n`);
    const t0 = Date.now(); const ran = []; let code = 0;
    for (const s of steps) {
      if (!quiet) process.stdout.write(`${DIM}$ [${s.name}] ${s.cmd}${RESET}\n`);
      const r = runStep(s, root, quiet);
      ran.push(r);
      if (r.exitCode !== 0) { code = r.exitCode; break; }
    }
    const durationMs = Date.now() - t0;
    if (code !== 0) failed = true;
    if (!quiet) process.stdout.write(code === 0 ? `${GREEN}OK ${t.label} (${(durationMs / 1000).toFixed(1)}s)${RESET}\n` : `${RED}FAIL ${t.label} (exit ${code}, ${(durationMs / 1000).toFixed(1)}s)${RESET}\n`);
    results.push({ id: t.id, label: t.label, lanes: t.lanes.slice(), requires: (t.requires || []).slice(), verdict: code === 0 ? 'pass' : 'fail', skipReason: null, durationMs, exitCode: code, steps: ran });
    if (code !== 0) break; // stop on first failure, as before
  }

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.verdict]++;
  const summary = {
    schema: SUMMARY_SCHEMA, durationUnit: 'ms', lane, laneDerivation: lane === 'release' ? 'derived-all' : 'tagged-filter',
    platform: process.platform, node: process.version, registryHash: registryHash(),
    head: (git(root, ['rev-parse', 'HEAD']) || '').trim(),
    base: plan.base, selection: plan.selection, fallbackReason: plan.fallbackReason,
    discovered: plan.discovered, settled: plan.settled, active: plan.active, settledTouched: plan.settledTouched, reopened: plan.reopened, handed: plan.handed, outsideSource: plan.outsideSource,
    taskCount: results.length, counts, verdict: failed ? 'fail' : 'pass', totalDurationMs: Date.now() - suiteStart, tasks: results,
  };
  try { atomicWrite(path.join(root, LAST_DIR, `verify-last-${lane}.json`), JSON.stringify(summary, null, 2) + '\n'); } catch (_) { /* a read-only tree still gets its verdict */ }
  if (value('--summary')) fs.writeFileSync(value('--summary'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  if (summaryOnly) { process.stdout.write(JSON.stringify(summary, null, 2) + '\n'); process.exit(failed ? 1 : 0); }

  process.stdout.write('\n');
  for (const r of results) process.stdout.write(`  ${r.verdict === 'pass' ? '✓' : (r.verdict === 'skip' ? '○' : '✗')} ${r.id.padEnd(10)} ${r.verdict === 'skip' ? '     -' : (r.durationMs / 1000).toFixed(1).padStart(6) + 's'}  ${r.skipReason || ''}\n`);
  process.stdout.write(`\nverify-summary ${JSON.stringify({ lane, selection: plan.selection, verdict: summary.verdict, counts, totalDurationMs: summary.totalDurationMs, handed: plan.handed.length, settled: plan.settled.length })}\n`);
  process.stdout.write(failed
    ? `\n${RED}local verification FAILED (lane ${lane}).${RESET} ${DIM}push blocked. Fix and re-push, or (emergency only) 'git push --no-verify'.${RESET}\n`
    : `\n${GREEN}local verification passed (lane ${lane}, ${(summary.totalDurationMs / 1000).toFixed(1)}s).${RESET}\n`);
  process.exit(failed ? 1 : 0);
}

module.exports = { TASKS, LANES, DEFAULT_LANE, OUTSIDE_SOURCE, laneTasks, requiredSkipIsFailure, registryHash, computePlan, isOutsideSource, discoverTests };
