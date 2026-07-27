#!/usr/bin/env node
// @kit-version 1.0.2
// scripts/lib/sandbox.cjs
//
// The fixture-confinement primitive (M18.A, spec A-07/A-08). ONE module consumed by
// every fixture-creating site in the kit's test tooling — smoke.cjs (4 sites),
// bake-inheritance.cjs (2 sites), check-template-precommit.cjs (1 site, the site-7
// rider) — extend-not-fork: a parallel guard copy is a defect.
//
// Why this exists (the A-08 incident, 2026-07-03): a linked-worktree pre-push hook
// exports an ABSOLUTE GIT_DIR into the hook environment (a primary-checkout pre-push
// exports none — adjudication experiment E1). Every suite child inherited it, so the
// fixture harness's git ops (init / commit / branch -M main / update-ref
// refs/remotes/origin/main) landed in the REAL repo instead of the mkdtemp sandbox:
// core.bare flipped true, the local origin/main tracking ref was overwritten with
// fixture commits, the worktree's checked-out branch was renamed to a fixture `main`.
// Recovered, zero loss; reproduced line-by-line against a sacrificial sandbox repo.
//
// The three layers (belt + suspenders + observable interruption safety):
//   1. scrubGitEnv / scrubProcessEnv — never trust the invoking (hook) git env.
//   2. fixtureEnv — pin GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE inside the fixture
//      repo AND ceiling discovery at its parent, so even a cwd bug cannot reach the
//      enclosing repo (an unset GIT_DIR with a bad cwd still discovers UPWARD).
//   3. assertInside — fail-CLOSED path confinement for mutating targets, resolving
//      `..`, absolute forms and symlinks/junctions before judging; refusals name the
//      offending resolved path (hostile paths are the contract — the
//      toy-path-confinement calibration class is a guard tested only on benign paths).
// Interruption safety is CONFINEMENT, not cleanup: mutations only ever happen inside
// a sandbox root, so a kill at any instant leaves the enclosing repo untouched. The
// armTeardown removal is best-effort tidiness (on Windows a SIGTERM kill is
// TerminateProcess — no handler runs; leftover roots in the OS tmpdir are acceptable).
//
// HONEST LOCUS: confinement is proven for consumers that route through this module
// against sacrificial fixtures — it is not a claim that arbitrary code can never
// mutate anything anywhere.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// The git repo-STATE vars a hook (or caller) may export — the A-08 vector. Deliberately
// NOT scrubbed: GIT_EXEC_PATH (needed to find git-core), GIT_EDITOR and author/committer
// identity vars (harmless, sometimes load-bearing for commits).
const GIT_STATE_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
];

// A copy of `base` (default process.env) with the git repo-state vars removed. Spawn
// helpers build child envs as { ...scrubGitEnv(), ...explicitTestEnv } so an inherited
// hook GIT_DIR can never leak into a child, while a test's EXPLICIT env survives.
function scrubGitEnv(base) {
  const src = base || process.env;
  const out = {};
  for (const k of Object.keys(src)) {
    if (GIT_STATE_VARS.indexOf(k) === -1) out[k] = src[k];
  }
  return out;
}

// Startup scrub of process.env itself — call once at suite entry so every spawn that
// naively inherits the parent env is safe by default.
function scrubProcessEnv() {
  for (const k of GIT_STATE_VARS) delete process.env[k];
}

// Registered sandbox roots (this process). armTeardown removes ONLY these.
const ROOTS = new Set();
let handlersInstalled = false;

// Create + register a fixture root. `base` defaults to the OS tmpdir; nested roots
// (a sub-sandbox inside a suite's main root) pass their parent as `base`.
function sandboxRoot(prefix, base) {
  const root = fs.mkdtempSync(path.join(base || os.tmpdir(), prefix || 'kit-sandbox-'));
  ROOTS.add(path.resolve(root));
  return root;
}

function deepestExisting(p) {
  let cur = p;
  for (;;) {
    if (fs.existsSync(cur)) return cur;
    const up = path.dirname(cur);
    if (up === cur) return cur;
    cur = up;
  }
}

// Fail-closed confinement check: resolve `target` (lexical `..`/absolute forms AND
// filesystem indirection — symlinks/junctions — via realpath on the deepest existing
// ancestor), then require it to live under `root`. Returns the resolved path when
// inside; THROWS naming the offending resolved path when outside. Assert-before-mutate:
// call this BEFORE any rm/write/git op whose target could have been influenced.
function assertInside(root, target) {
  const rootReal = fs.realpathSync(root);
  const abs = path.resolve(root, target);
  const anchor = deepestExisting(abs);
  const anchorReal = fs.realpathSync(anchor);
  const resolved = anchorReal + abs.slice(anchor.length);
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const rel = path.relative(norm(rootReal), norm(resolved));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return resolved;
  throw new Error(
    'sandbox confinement: target resolves OUTSIDE the sandbox root — refused (fail-closed).\n'
    + `  target:   ${target}\n`
    + `  resolved: ${resolved}\n`
    + `  root:     ${rootReal}`
  );
}

// Child env for fixture git ops: repo state pinned INSIDE the fixture repo, discovery
// ceilinged at its parent, inherited git state scrubbed. `git init` under this env
// creates a normal (non-bare) repo exactly at repoDir regardless of any hostile
// inherited GIT_DIR (the incident's core.bare flip came from init resolving an
// inherited GIT_DIR with no work tree).
function fixtureEnv(repoDir, base) {
  const abs = path.resolve(repoDir);
  const env = scrubGitEnv(base);
  env.GIT_DIR = path.join(abs, '.git');
  env.GIT_WORK_TREE = abs;
  env.GIT_INDEX_FILE = path.join(abs, '.git', 'index');
  env.GIT_CEILING_DIRECTORIES = path.dirname(abs);
  return env;
}

function removeArmed() {
  for (const r of ROOTS) {
    try {
      assertInside(r, r); // refuse to rm anything that no longer resolves to itself
      fs.rmSync(r, { recursive: true, force: true });
    } catch (_) { /* best effort — root may already be gone */ }
  }
}

// Ordering contract: create sandbox → arm → THEN mutate. Arming after the first
// mutation recreates the A-08 window. Removal covers exit + SIGINT + SIGTERM where the
// platform delivers them; on a forceful kill the safety property is confinement.
function armTeardown(root) {
  ROOTS.add(path.resolve(root));
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', removeArmed);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { removeArmed(); process.exit(143); });
  }
}

// Worktree-safe "is this file tracked" read (the A-07 (a) poisoned-index class): the
// plain-index answer is corroborated against ls-tree HEAD, so an index rewritten by an
// escaped op (or otherwise poisoned) cannot turn a committed file into a false
// "untracked". HONEST LOCUS: answers "tracked in the index OR committed in HEAD" — a
// staged-but-uncommitted deletion reads as tracked until it is committed.
function trackedInHead(dir, rel) {
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: scrubGitEnv() });
  const ls = (g(['ls-files', '--', rel]).stdout || '').trim();
  if (ls.length > 0) return true;
  const tree = g(['ls-tree', '--name-only', 'HEAD', '--', rel]);
  return tree.status === 0 && (tree.stdout || '').trim().length > 0;
}

module.exports = {
  GIT_STATE_VARS,
  scrubGitEnv,
  scrubProcessEnv,
  sandboxRoot,
  assertInside,
  fixtureEnv,
  armTeardown,
  trackedInHead,
};
