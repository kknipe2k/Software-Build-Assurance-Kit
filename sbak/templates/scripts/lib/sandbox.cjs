#!/usr/bin/env node
// @kit-version 1.0.4
// scripts/lib/sandbox.cjs
//
// The PATH-SAFETY primitives (M18.A, spec A-07/A-08). ONE module consumed by every
// fixture-creating site in the kit's test tooling — smoke.cjs (4 sites),
// bake-inheritance.cjs (2 sites), check-template-precommit.cjs (1 site, the site-7
// rider) — AND, since M27.A/M28.E, by the shipped install path itself: kit-update.cjs
// (--adopt's install loop and --apply) and lib/hook-chmod.cjs both mutate destinations
// inside a user's repository and both route their guards through here. Extend-not-fork:
// a parallel guard copy is a defect. (The locus line said "test tooling" through M27;
// assertInside had production consumers by then, so M28.E corrected the description
// rather than leaving a stale one next to a widened export list.)
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

// CLASSIFY BEFORE MUTATE (M28.E, KF-58) — the mandatory pre-step to assertInside, never an
// alternative to it. assertInside RESOLVES symlinks by design; that is exactly what makes it
// a confinement primitive, and exactly why it cannot be the thing that decides whether a
// destination is safe to write. By the time it has answered, a link at the target path is
// invisible in three different ways: an INTERNAL link hands back its TARGET (so the write
// lands on the target instead of being refused), an EXTERNAL one throws the generic
// confinement error (so the caller reports the wrong reason), and a DANGLING one resolves to
// the link's own path and reads as "nothing is there" — which is how the install path came to
// replace user links with template bytes at every non-.githooks row (KF-58, measured: 5457
// bytes written over a dangling scripts/set-mode.cjs link, exit 0, no refusal line).
//
// So: classify the PLAIN JOINED path FIRST, decide, and only then confine. This function
// never follows a link and never throws — an unreadable path is a classification, not an
// exception, because a caller that must fail closed cannot be handed a stack trace instead of
// an answer. Returns { kind, abs, dangling, target, mode }:
//   'symlink' — a symlink of ANY sort (external, internal, intra-directory, dangling).
//               `dangling` says whether it resolves; `target` is the link's own target string.
//   'absent'  — nothing at the path (a genuine absence, not a dangling link reading as one)
//   'file'    — a regular file; `mode` carries its permission bits
//   'dir'     — a directory
//   'other'   — socket/fifo/device: not a regular file, never a mutation candidate
function classifyDestination(p) {
  const abs = path.resolve(p);
  let st;
  try { st = fs.lstatSync(abs); } catch (_) { return { kind: 'absent', abs: abs, dangling: false, target: null, mode: null }; }
  const mode = st.mode & 0o7777;
  if (st.isSymbolicLink()) {
    let target = null;
    try { target = fs.readlinkSync(abs); } catch (_) { target = null; }
    return { kind: 'symlink', abs: abs, dangling: !fs.existsSync(abs), target: target, mode: mode };
  }
  if (st.isDirectory()) return { kind: 'dir', abs: abs, dangling: false, target: null, mode: mode };
  if (st.isFile()) return { kind: 'file', abs: abs, dangling: false, target: null, mode: mode };
  return { kind: 'other', abs: abs, dangling: false, target: null, mode: mode };
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
  classifyDestination,
  fixtureEnv,
  armTeardown,
  trackedInHead,
};
