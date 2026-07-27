#!/usr/bin/env node
// @kit-version 1.0.1
// scripts/install-hooks.cjs
//
// One-time git-hook install for verification_locus: local_first | hybrid.
// Points git at the committed, version-controlled .githooks/ directory and makes
// the hooks executable. Idempotent — safe to run repeatedly.
//
// Run once after cloning:
//   node scripts/install-hooks.cjs
//
// Why core.hooksPath (not .git/hooks): the hooks live in the repo, are reviewed
// in PRs, and update with a pull — no per-developer copy step. Git does not
// auto-enable a repo-committed hooks path (by design, for security), so this one
// command is the documented setup step.
//
// Per-stack upgrades (optional, see FRAMEWORK-CONFIG.md verification_locus):
//   * Node     — wire husky's `prepare` script so `npm install` auto-installs.
//   * Polyglot — `lefthook install` (single Go binary, parallel, no runtime dep).
//   * Python   — `pre-commit install`.

'use strict';

const path = require('path');
const { execSync } = require('child_process');
const { repairHookModes } = require(path.join(__dirname, 'lib', 'hook-chmod.cjs'));

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
  // Confined exec-bit repair on POSIX (KF-55, M27.A): manifest-owned hook names
  // only, existing modes preserved, symlinks refused via lib/hook-chmod.cjs —
  // never a directory-wide chmod sweep. No-op on Windows (no exec bit).
  const res = repairHookModes({ projRoot: process.cwd(), log: (line) => console.log('    ' + line) });
  if (res.refused.length > 0) {
    console.error('FAIL  hook activation INCOMPLETE — ' + res.refused.length + ' .githooks entr'
      + (res.refused.length === 1 ? 'y' : 'ies')
      + ' refused (never chmodded through a symlink); refused hooks stay INERT until replaced with regular files.');
    process.exit(1);
  }
  console.log('OK  git hooks installed (core.hooksPath = .githooks).');
  console.log('    pre-commit: fast checks    pre-push: full local matrix (Linux + native)');
} catch (e) {
  console.error('FAIL  could not install hooks:', e.message);
  process.exit(1);
}
