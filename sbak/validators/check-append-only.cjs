#!/usr/bin/env node
// @kit-version 1.0.4
// validators/check-append-only.cjs
//
// Byte-prefix append-only validator — the shared primitive the kit's ledgers
// (gap-analysis, tech-debt, consultations, the project-config override log, and
// future M03/M06/M07 ledgers) all consume. It enforces ONE invariant:
//
//   A ledger is append-only iff its previously-committed content is a
//   CRLF-normalized byte-prefix of its current content.
//
// Appends only ever go at the end (newest at bottom). Any edit or deletion of
// prior bytes breaks the prefix → violation. A file absent from the base is new
// → it passes (there is no prior content to violate).
//
// Usage:
//   node validators/check-append-only.cjs [--base <ref>] <path> [<path> ...]
//
//   --base <ref>   Git ref/SHA whose version is the "previously-committed"
//                  baseline. Defaults to `git merge-base HEAD origin/main`.
//                  CI passes the PR base SHA explicitly.
//
// Paths are taken LITERALLY — the script never shell-globs. On POSIX the shell
// expands a glob before the script sees it; on Windows (no shell glob) the
// caller passes explicit paths, so behaviour is identical on both.
//
// Exit codes:
//   0  every path is append-only (or new)
//   1  ≥1 violation (the offending path + first divergent line/offset is printed)
//   2  usage or IO/git error (bad ref, not a repo, --base without a value, …)
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS
// regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: check-append-only.cjs [--base <ref>] <path> [<path> ...]\n' +
  '  --base <ref>  baseline ref (default: git merge-base HEAD origin/main)\n';

function die2(msg) {
  process.stderr.write(`check-append-only: ${msg}\n`);
  process.exit(2);
}

// Run git, capturing status/stdout/stderr. No shell — args passed as an array,
// so paths with spaces or odd characters are safe on every platform.
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) die2(`cannot run git (${r.error.message}). Is git on PATH and is this a repo?`);
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// CRLF (and lone CR) → LF, so a Windows checkout doesn't read as a false
// violation against an LF-committed baseline.
function normalize(s) {
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM — match validators/lib/fenced-block.cjs's normalize
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// `git show <ref>:<path>` fails BOTH when the path is simply absent from that
// ref (→ new file, a pass) and on a genuine error (bad ref, not a repo). Git
// distinguishes them in the message; only the "absent" shapes mean "new file".
function isPathAbsentFromRef(stderr) {
  return /does not exist in|exists on disk, but not in/i.test(stderr);
}

// First point where `base` stops being a prefix of `cur` (both normalized).
// Returns the 1-based line, 0-based byte offset, and a short snippet from each.
function firstDivergence(base, cur) {
  const min = Math.min(base.length, cur.length);
  let i = 0;
  while (i < min && base[i] === cur[i]) i++;
  let line = 1;
  for (let j = 0; j < i; j++) if (base[j] === '\n') line++;
  return {
    line,
    offset: i,
    base: JSON.stringify(base.slice(i, i + 50)),
    cur: i < cur.length ? JSON.stringify(cur.slice(i, i + 50)) : '<end of file>',
  };
}

function resolveDefaultBase() {
  const r = git(['merge-base', 'HEAD', 'origin/main']);
  if (r.code !== 0) {
    die2(
      'could not resolve default base `git merge-base HEAD origin/main` ' +
      `(${r.stderr.trim() || 'unknown error'}). Pass --base <ref> explicitly.`
    );
  }
  const sha = r.stdout.trim();
  if (!sha) die2('default base resolved to empty; pass --base <ref> explicitly.');
  return sha;
}

function main() {
  const argv = process.argv.slice(2);
  let base = null;
  const paths = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') {
      base = argv[++i];
      if (base === undefined) die2('--base requires a <ref> argument.');
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      die2(`unknown option: ${a}\n${USAGE}`);
    } else {
      paths.push(a);
    }
  }

  if (paths.length === 0) die2(`no ledger paths given.\n${USAGE}`);
  if (base === null) base = resolveDefaultBase();

  let violations = 0;

  for (const p of paths) {
    // git wants a repo-relative, forward-slash ref path even on Windows.
    const refPath = p.replace(/\\/g, '/');
    const shown = git(['show', `${base}:${refPath}`]);

    if (shown.code !== 0) {
      if (isPathAbsentFromRef(shown.stderr)) {
        process.stdout.write(`ok    ${p}  (new — absent from ${base.slice(0, 12)})\n`);
        continue;
      }
      die2(`git show ${base}:${refPath} failed: ${shown.stderr.trim() || 'unknown error'}`);
    }

    const baseContent = normalize(shown.stdout);

    let current;
    try {
      current = normalize(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(
        `VIOLATION  ${p}: present in base ${base.slice(0, 12)} but missing from the ` +
        'working tree — a ledger may only grow, never be deleted.'
      );
      violations++;
      continue;
    }

    if (current.startsWith(baseContent)) {
      process.stdout.write(`ok    ${p}\n`);
      continue;
    }

    const d = firstDivergence(baseContent, current);
    console.error(
      `VIOLATION  ${p}: prior committed content is no longer a prefix of the current ` +
      `file (append-only broken at line ${d.line}, byte ${d.offset}).`
    );
    console.error(`           base had: ${d.base}`);
    console.error(`           now has:  ${d.cur}`);
    violations++;
  }

  if (violations > 0) {
    process.stderr.write(
      `\n${violations} append-only violation(s). Ledgers grow only at the end ` +
      '(newest at bottom); prior lines are immutable. Revert the edit/deletion and ' +
      'append instead.\n'
    );
    process.exit(1);
  }
  process.exit(0);
}

main();
