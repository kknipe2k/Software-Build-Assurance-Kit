#!/usr/bin/env node
// @kit-version 1.0.1
// scripts/lib/hook-chmod.cjs
//
// The CONFINED .githooks exec-bit repair (M27.A, KF-55; rider §3 + the three-site
// ratification addendum). ONE module consumed by every site that repairs hook
// executability — scripts/kit-update.cjs (--adopt) and both install-hooks.cjs
// copies — extend-not-fork: per-site chmod variants are exactly how the
// install-hooks pair drifted into an unconditional chmod of every entry.
//
// Why this exists: statSync/chmodSync FOLLOW symlinks, so repairing exec bits by
// directory sweep let a repository-controlled .githooks/pre-commit symlink direct
// a chmod at a file OUTSIDE the project — authority the user never granted by
// running adopt/install. The contract here (rider §3.2, owner-amended):
//   1. chmod candidates are MANAGED HOOK NAMES only — never a readdir sweep;
//   2. classification uses lstat; ANY symlink (external, internal, intra-dir,
//      dangling) is refused VISIBLY, never followed — callers turn a non-empty
//      refusal list into a NON-ZERO exit, so a refused hook can never read as
//      "hooks installed";
//   3. the resolved path must stay inside the project's .githooks (the shared
//      sandbox.cjs assertInside primitive — a parallel guard copy is a defect);
//   4. the mutation is fd-BOUND (openSync O_RDONLY|O_NOFOLLOW → fstat → fchmod):
//      O_NOFOLLOW makes the open fail (ELOOP per POSIX.1-2008) if a symlink races
//      in after classification, and fchmod binds the chmod to the opened inode —
//      the check/use race a path-based chmod cannot close;
//   5. existing modes are PRESERVED: exec bits derive from read bits
//      (0644→0755, 0640→0750, 0600→0700) and an already-executable hook is left
//      byte-exact — never widened to 0755;
//   6. dry-run reports exactly what would change and mutates nothing;
//   7. unknown .githooks entries are left untouched and REPORTED.
//
// HONEST SCOPE (stated, never hidden): this is protection against repository
// content and ordinary concurrent change — NOT an OS security sandbox against an
// equal-authority process. A same-user process can still hardlink or rename a
// regular file into .githooks between classification and the O_NOFOLLOW open;
// what is closed is the symlink-follow class and the path-swap race at mutation
// time. win32 has no exec bit: the repair is a POSIX operation, and on win32 this
// module deliberately no-ops (git index modes + the Linux CI legs carry the
// cross-platform proof).

'use strict';

const fs = require('fs');
const path = require('path');
const { assertInside } = require('./sandbox.cjs');

// The kit's shipped hook set — the manifest-owned names that are ever chmod
// candidates. kit-update passes its row-derived list (same source of truth,
// reconciled by the kit's smoke suite); install-hooks uses this default.
const MANAGED_HOOKS = ['pre-commit', 'pre-push'];

// Repair exec bits for the managed hooks under `projRoot`/.githooks.
// opts: { projRoot, hookNames?, dryRun?, log? } — log receives one pre-formatted
// line per event (the caller owns indentation/prefix).
// Returns { platform, repaired, kept, refused, unknown, wouldRepair }; callers
// MUST treat refused.length > 0 as activation-incomplete and exit non-zero.
function repairHookModes(opts) {
  const projRoot = opts.projRoot;
  const hookNames = opts.hookNames || MANAGED_HOOKS;
  const dryRun = !!opts.dryRun;
  const log = opts.log || function () {};
  const res = { platform: process.platform, repaired: [], kept: [], refused: [], unknown: [], wouldRepair: [] };

  if (process.platform === 'win32') return res; // no exec bit — POSIX-only repair (stated above)
  const dir = path.join(projRoot, '.githooks');
  if (!fs.existsSync(dir)) return res;
  const hooksDir = assertInside(projRoot, '.githooks');

  // Unknown entries: reported, never candidates (contract 1 + 7).
  for (const name of fs.readdirSync(dir)) {
    if (hookNames.indexOf(name) === -1) {
      res.unknown.push(name);
      log('unknown    .githooks/' + name + ' — not a kit-managed hook name; left untouched');
    }
  }

  for (const name of hookNames) {
    // Classification runs on the PLAIN JOINED path: assertInside resolves symlinks
    // by design, so confining FIRST would hand lstat the TARGET path and make the
    // link invisible (an internal link would read as its regular-file target; an
    // external one would throw the generic confinement error instead of the
    // specific symlink refusal). Names are manifest-owned; refuse any that carry
    // path syntax before joining, then classify, then confine (contract 3) only
    // once the entry is known to be a regular file.
    if (name.indexOf('/') !== -1 || name.indexOf('\\') !== -1 || name === '.' || name === '..') {
      res.refused.push({ name, why: 'invalid-hook-name' });
      log('refused    .githooks/' + name + ' — not a plain hook filename; never a chmod candidate');
      continue;
    }
    const hookPath = path.join(hooksDir, name);
    let entry;
    try { entry = fs.lstatSync(hookPath); } catch (_) { continue; } // absent — nothing to repair
    if (entry.isSymbolicLink()) {
      res.refused.push({ name, why: 'symlink' });
      log('refused    .githooks/' + name + ' — symlink' + (fs.existsSync(hookPath) ? '' : ' (dangling)')
        + '; adoption never chmods through symlinks — replace it with a regular file to activate this hook');
      continue;
    }
    if (!entry.isFile()) {
      res.refused.push({ name, why: 'not-a-regular-file' });
      log('refused    .githooks/' + name + ' — not a regular file; never a chmod candidate');
      continue;
    }
    const mode = entry.mode & 0o7777;
    if ((mode & 0o111) !== 0) { res.kept.push({ name, mode }); continue; } // already executable — preserved byte-exact
    assertInside(hooksDir, hookPath); // contract 3: the (now known-regular) entry's resolved path stays confined
    const derived = mode | ((mode & 0o444) >> 2); // contract 5: exec from read bits
    if (dryRun) {
      res.wouldRepair.push({ name, from: mode, to: derived });
      log('would-chmod .githooks/' + name + ' 0' + mode.toString(8) + ' -> 0' + derived.toString(8)
        + ' — git silently ignores a non-executable hook');
      continue;
    }
    if (typeof fs.constants.O_NOFOLLOW !== 'number') { // fail-closed paranoia; defined on every POSIX Node
      res.refused.push({ name, why: 'O_NOFOLLOW-unavailable' });
      log('refused    .githooks/' + name + ' — O_NOFOLLOW unavailable on this platform; fail-closed, not chmodded');
      continue;
    }
    let fd;
    try {
      fd = fs.openSync(hookPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); // contract 4
    } catch (e) {
      res.refused.push({ name, why: 'changed-during-repair:' + (e.code || 'open-failed') });
      log('refused    .githooks/' + name + ' — entry changed between classification and open ('
        + (e.code || e.message) + '; a symlink raced in?); not chmodded');
      continue;
    }
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile()) {
        res.refused.push({ name, why: 'not-a-regular-file-at-open' });
        log('refused    .githooks/' + name + ' — no longer a regular file at open; not chmodded');
        continue;
      }
      const m2 = st.mode & 0o7777;
      if ((m2 & 0o111) !== 0) { res.kept.push({ name, mode: m2 }); continue; }
      const to = m2 | ((m2 & 0o444) >> 2);
      fs.fchmodSync(fd, to); // bound to the opened inode, not the path
      res.repaired.push({ name, from: m2, to });
      log('chmod +x   .githooks/' + name + ' 0' + m2.toString(8) + ' -> 0' + to.toString(8)
        + ' — git silently ignores a non-executable hook; without this the commit gates never fire');
    } finally {
      fs.closeSync(fd);
    }
  }
  return res;
}

module.exports = { MANAGED_HOOKS, repairHookModes };
