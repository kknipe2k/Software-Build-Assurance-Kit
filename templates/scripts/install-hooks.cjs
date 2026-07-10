#!/usr/bin/env node
// @kit-version 0.1.0-dev
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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
  // chmod +x on POSIX so the hooks are runnable; no-op on Windows.
  if (process.platform !== 'win32') {
    const dir = path.resolve(process.cwd(), '.githooks');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o755);
    }
  }
  console.log('OK  git hooks installed (core.hooksPath = .githooks).');
  console.log('    pre-commit: fast checks    pre-push: full local matrix (Linux + native)');
} catch (e) {
  console.error('FAIL  could not install hooks:', e.message);
  process.exit(1);
}
