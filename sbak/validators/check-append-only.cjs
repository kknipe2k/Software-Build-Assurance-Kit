#!/usr/bin/env node
// @kit-version 1.0.8
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
//   node validators/check-append-only.cjs --per-commit [--base <ref>] [--head <ref>]
//        [--ledgers <file>] [--exceptions <file>] [<path> ...]
//
//   --base <ref>   Git ref/SHA whose version is the "previously-committed"
//                  baseline. Defaults to `git merge-base HEAD origin/main`.
//                  CI passes the PR base SHA explicitly.
//
// THE WALK (M32.B, proposals/M32-FIELD-REPAIR.md §3.2). Without `--per-commit` the
// check compares the WORKING TREE against ONE baseline, so a rewrite INSIDE a branch
// passes as long as the base's bytes are still a prefix of the final file (the field:
// a pushed heading deleted two commits later and re-added, green). With it:
//
//   --per-commit        A first-parent walk from the head down to the base
//                       (`git rev-list --first-parent <head> ^<base>`): at EVERY
//                       commit each ledger's version must be a normalized byte-prefix
//                       of that commit's FIRST parent's version. The walk checks the
//                       COMMITS (what a push ships), not the working tree. The first
//                       violating commit, path, line and byte offset are printed; every
//                       violation is listed. A merge of main into the branch is crossed
//                       via its first parent only (the merge-inherited side is covered
//                       by the merge-base default). The default base is the merge-base
//                       with the remote's default branch: `origin/HEAD` first, then
//                       `origin/main`; when NEITHER exists (a first push - nothing pushed
//                       can have been rewritten) one plain line is printed and the exit
//                       is 0. Without the flag that case keeps the usage exit 2.
//   --head <ref>        The walk's start (default HEAD). GitHub's pull_request checkout
//                       is a SYNTHETIC MERGE: HEAD = merge(base, pr), HEAD^1 = the base
//                       tip, HEAD^2 = the PR head - so a walk from HEAD is ONE step (HEAD
//                       against the base tip = today's whole-branch compare) and misses a
//                       mid-branch rewrite. CI passes `--head <pull_request.head.sha>` so
//                       the PR branch's own first-parent chain is walked.
//   --ledgers <file>    One ledger path per line, `#` comments and blank lines ignored;
//                       appended to the positional paths. The ONE list the CI workflow
//                       and the pre-push leg both read (docs/append-only-ledgers.txt).
//                       A missing file is a usage error (exit 2), never an empty list.
//   --exceptions <file> Owner-approved rewrites, one per line: `<sha> <path> <reason>`
//                       (sha a 7..40-hex prefix). A listed sha's change to that path is
//                       skipped in the walk AND printed every run (`exception loaded:`
//                       for every line at start, `exception honored:` when applied), so
//                       the valve is visible, never silent. A line with fewer than three
//                       fields or a non-hex sha fails closed (exit 2) before any check.
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
// Dup-3 (M32.R): the ONE normalize - BOM stripped, CRLF and lone CR folded to LF - lives in
// the shared lib; this validator consumes it rather than carrying a ninth copy.
const { normalize } = require('./lib/fenced-block.cjs');

const USAGE =
  'usage: check-append-only.cjs [--base <ref>] <path> [<path> ...]\n' +
  '       check-append-only.cjs --per-commit [--base <ref>] [--head <ref>] [--ledgers <file>] [--exceptions <file>] [<path> ...]\n' +
  '  --base <ref>        baseline ref (default: git merge-base HEAD origin/main)\n' +
  '  --per-commit        walk every commit first-parent from the head down to the base\n' +
  '  --head <ref>        the walk\'s start (default HEAD; CI passes the PR head sha)\n' +
  '  --ledgers <file>    one ledger path per line (# comments), added to the positional paths\n' +
  '  --exceptions <file> owner-approved rewrites, `<sha> <path> <reason>` per line, printed every run\n';

// The merge valve (M32.1.A, V-4): the same sentence heads docs/append-only-ledgers.txt.
const MERGE_VALVE = 'This is a merge commit: if main\'s rows were resolved before the branch\'s, resolve the branch\'s rows first, or add an exception (--exceptions <file>, `<sha> <path> <reason>`).';

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

// The walk's default base: the merge-base of the head with the remote's default branch -
// origin/HEAD (the remote's real default, whatever its name) first, then origin/main. Null when
// neither exists: nothing has been pushed, so nothing pushed can have been rewritten.
function resolveWalkBase(head) {
  let ref = null;
  const sym = git(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']);
  if (sym.code === 0 && sym.stdout.trim()) ref = sym.stdout.trim();
  else if (git(['rev-parse', '-q', '--verify', 'refs/remotes/origin/main']).code === 0) ref = 'refs/remotes/origin/main';
  if (ref === null) return null;
  const r = git(['merge-base', head, ref]);
  if (r.code !== 0) die2(`could not resolve the walk base \`git merge-base ${head} ${ref}\` (${r.stderr.trim() || 'unknown error'}). Pass --base <ref> explicitly.`);
  const sha = r.stdout.trim();
  if (!sha) die2('the walk base resolved to empty; pass --base <ref> explicitly.');
  return sha;
}

// A ledger's content at a commit: { absent: true } when the path is not in that tree.
function showAt(ref, refPath) {
  const shown = git(['show', `${ref}:${refPath}`]);
  if (shown.code === 0) return { content: normalize(shown.stdout) };
  if (isPathAbsentFromRef(shown.stderr)) return { absent: true };
  return die2(`git show ${ref}:${refPath} failed: ${shown.stderr.trim() || 'unknown error'}`);
}

function readListFile(file, what) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return die2(`cannot read the ${what} file ${file} (${e.message}).`); }
  return normalize(text).split('\n').map((l, i) => ({ line: l.trim(), n: i + 1 })).filter((x) => x.line && !x.line.startsWith('#'));
}

// `<sha> <path> <reason>` per line; a line with fewer than three fields or a non-hex sha
// fails closed before any check runs.
function readExceptions(file) {
  const out = [];
  for (const { line, n } of readListFile(file, 'exceptions')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
    if (!m || !/^[0-9a-f]{7,40}$/i.test(m[1])) die2(`malformed exception line ${n} in ${file}: want \`<sha> <path> <reason>\` (sha 7..40 hex), got ${JSON.stringify(line)}.`);
    out.push({ sha: m[1].toLowerCase(), path: m[2].replace(/\\/g, '/'), reason: m[3].trim() });
  }
  return out;
}

function shortSha(sha) { return sha.slice(0, 12); }

// THE WALK (mutant target): every commit from the head down to the base, first-parent only;
// each ledger's version at a commit must extend its version at that commit's first parent.
// Removing the parent-to-child compare turns the pin-1/pin-2 fixtures green for the mutant.
function walk({ base, head, paths, exceptions }) {
  const headSha = git(['rev-parse', '--verify', `${head}^{commit}`]);
  if (headSha.code !== 0) die2(`--head ${head} does not resolve (${headSha.stderr.trim() || 'unknown error'}).`);
  const list = git(['rev-list', '--first-parent', headSha.stdout.trim(), `^${base}`]);
  if (list.code !== 0) die2(`git rev-list --first-parent ${head} ^${base} failed: ${list.stderr.trim() || 'unknown error'}`);
  const commits = list.stdout.split(/\r?\n/).filter(Boolean).reverse(); // oldest first
  process.stdout.write(`walk: ${commits.length} commit(s) from ${shortSha(headSha.stdout.trim())} down to base ${shortSha(base)} (first-parent)\n`);
  for (const ex of exceptions) process.stdout.write(`exception loaded: ${ex.sha} ${ex.path} - ${ex.reason}\n`);

  const seen = new Map(); // refPath -> true once present at any step
  let violations = 0;
  for (const sha of commits) {
    const parent = git(['rev-parse', '-q', '--verify', `${sha}^1`]);
    const parentSha = parent.code === 0 ? parent.stdout.trim() : null;
    const subject = git(['log', '-1', '--format=%s', sha]).stdout.trim();
    for (const p of paths) {
      const refPath = p.replace(/\\/g, '/');
      const ex = exceptions.find((e) => sha.startsWith(e.sha) && e.path === refPath);
      if (ex) {
        process.stdout.write(`exception honored: ${ex.sha} ${ex.path} - ${ex.reason} (commit ${shortSha(sha)} skipped for this path)\n`);
        seen.set(refPath, true);
        continue;
      }
      const before = parentSha === null ? { absent: true } : showAt(parentSha, refPath);
      const after = showAt(sha, refPath);
      if (!after.absent) seen.set(refPath, true);
      if (before.absent) continue;            // new at this step (or still absent): nothing prior to violate
      if (after.absent) {
        console.error(`VIOLATION  ${p} @ ${shortSha(sha)} (${subject}): present in parent ${shortSha(parentSha)} but deleted — a ledger may only grow, never be deleted.`);
        violations++;
        continue;
      }
      if (after.content.startsWith(before.content)) continue;
      const d = firstDivergence(before.content, after.content);
      // M32.1.A (V-4): a merge whose resolution put main's rows above the branch's reads as a
      // mid-file insert against the first parent; the line names the valve.
      const isMerge = git(['rev-parse', '-q', '--verify', `${sha}^2`]).code === 0;
      console.error(
        `VIOLATION  ${p} @ ${shortSha(sha)} (${subject}): the parent's content (${shortSha(parentSha)}) is no longer a prefix ` +
        `(append-only broken at line ${d.line}, byte ${d.offset}).` + (isMerge ? ` ${MERGE_VALVE}` : '')
      );
      console.error(`           parent had: ${d.base}`);
      console.error(`           commit has: ${d.cur}`);
      violations++;
    }
  }
  for (const p of paths) {
    const refPath = p.replace(/\\/g, '/');
    process.stdout.write(seen.get(refPath) ? `ok    ${p}\n` : `ok    ${p}  (absent through the walk — new or not yet created)\n`);
  }
  return violations;
}

function main() {
  const argv = process.argv.slice(2);
  let base = null;
  let head = 'HEAD';
  let perCommit = false;
  let ledgersFile = null;
  let exceptionsFile = null;
  const paths = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') {
      base = argv[++i];
      if (base === undefined) die2('--base requires a <ref> argument.');
    } else if (a === '--head') {
      head = argv[++i];
      if (head === undefined) die2('--head requires a <ref> argument.');
    } else if (a === '--ledgers') {
      ledgersFile = argv[++i];
      if (ledgersFile === undefined) die2('--ledgers requires a <file> argument.');
    } else if (a === '--exceptions') {
      exceptionsFile = argv[++i];
      if (exceptionsFile === undefined) die2('--exceptions requires a <file> argument.');
    } else if (a === '--per-commit') {
      perCommit = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      die2(`unknown option: ${a}\n${USAGE}`);
    } else {
      paths.push(a);
    }
  }

  if (ledgersFile !== null) for (const { line } of readListFile(ledgersFile, 'ledgers')) paths.push(line);
  if (paths.length === 0) die2(`no ledger paths given.\n${USAGE}`);
  const exceptions = exceptionsFile !== null ? readExceptions(exceptionsFile) : [];

  if (perCommit) {
    if (base === null) {
      base = resolveWalkBase(head);
      if (base === null) {
        process.stdout.write('walk: no origin/HEAD or origin/main to compare against (nothing pushed yet) — append-only walk skipped.\n');
        process.exit(0);
      }
    }
    const violations = walk({ base, head, paths, exceptions });
    if (violations > 0) {
      process.stderr.write(
        `\n${violations} append-only violation(s) across the walk. Ledgers grow only at the end ` +
        '(newest at bottom); prior lines are immutable in EVERY commit, not only against the base. ' +
        'Revert the rewrite and append instead, or list the commit in the --exceptions file with a reason.\n'
      );
      process.exit(1);
    }
    process.exit(0);
  }

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
