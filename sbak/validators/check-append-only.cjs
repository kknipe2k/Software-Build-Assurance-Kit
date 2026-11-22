#!/usr/bin/env node
// @kit-version 1.0.11
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
//   node validators/check-append-only.cjs --pre-push [--remote <name>]
//        [--ledgers <file>] [--exceptions <file>] [<path> ...]   (git's ref feed on stdin)
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
//   --pre-push          The pre-push hook's mode (M34.5.F.9, C3-02 and W3-07): git's ref feed
//                       (`<local ref> <local sha> <remote ref> <remote sha>` per line) is read
//                       on stdin and every ref being pushed is walked, never the checked-out
//                       HEAD. An updated ref walks its local sha down from the remote's old
//                       sha, then compares each ledger at the remote's old sha with the new
//                       head (a non-fast-forward that rewrites a pushed row is caught). A new
//                       remote ref walks from its merge-base with the remote's default branch;
//                       a deletion walks nothing; a remote sha this clone lacks is refused
//                       (fetch, then push again). Any failed walk refuses the push.
//   --remote <name>     The remote being pushed to (the hook passes git's "$1"; default origin),
//                       whose <name>/HEAD or <name>/main is a new ref's base.
//   --ledgers <file>    One ledger path per line, `#` comments and blank lines ignored;
//                       appended to the positional paths. The ONE list the CI workflow
//                       and the pre-push leg both read (docs/append-only-ledgers.txt).
//                       In a walk the list is read at the base and at the head as well as
//                       in the working tree, and the union is checked (M34.5.F.9, W3-06): a
//                       commit that drops a path from the list, or deletes the list, is a
//                       violation unless the exceptions file names that commit and the list.
//                       In --per-commit and the plain mode a list absent everywhere is a usage error (exit 2), never an
//                       empty list; in --pre-push that ref's walk is skipped with one printed line.
//   --exceptions <file> Extra owner-approved rewrites for a hand run, one per line:
//                       `<sha> <path> <reason>` (sha a 7..40-hex prefix), read from the working
//                       tree. A line with fewer than three fields or a non-hex sha fails closed
//                       (exit 2) before any check.
//
// THE EXCEPTIONS FILE (M34.5.F.9, W3-08): docs/append-only-exceptions.txt, the same
// `<sha> <path> <reason>` lines, is read by every walk at the walk's head commit (never the
// working tree), so the pre-push leg and the workflow honor the same committed lines and an
// uncommitted line loosens nothing. It is itself append-only: always checked, whatever the
// list says. A malformed line is printed as ignored and grants nothing. Every run prints each
// line it loads (`exception loaded:`) and each one it applies (`exception honored:`), so the
// valve is visible, never silent. The checker reads a line's shape and applies it only at a walked
// commit whose sha starts with its prefix; it does not check that the commit exists or who wrote the line (the person's approval is recorded by the line's own commit).
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
  '       check-append-only.cjs --pre-push [--remote <name>] [--ledgers <file>] [--exceptions <file>] [<path> ...]  (git\'s ref feed on stdin)\n' +
  '  --base <ref>        baseline ref (default: git merge-base HEAD origin/main)\n' +
  '  --per-commit        walk every commit first-parent from the head down to the base\n' +
  '  --head <ref>        the walk\'s start (default HEAD; CI passes the PR head sha)\n' +
  '  --pre-push          walk every ref on git\'s pre-push feed from the remote\'s sha\n' +
  '  --remote <name>     the remote pushed to (default origin)\n' +
  '  --ledgers <file>    one ledger path per line (# comments), read at the base, the head and the working tree\n' +
  '  --exceptions <file> extra approved rewrites for a hand run, `<sha> <path> <reason>` per line\n' +
  'The exceptions file docs/append-only-exceptions.txt is read at the head of every walk.\n';

// The one exceptions file both enforcement points read (M34.5.F.9, W3-08).
const EXCEPTIONS_FILE = 'docs/append-only-exceptions.txt';

// The merge valve (M32.1.A, V-4): the same sentence heads docs/append-only-ledgers.txt.
const MERGE_VALVE = 'This is a merge commit: if main\'s rows were resolved before the branch\'s, resolve the branch\'s rows first, or add an exception (a `<sha> <path> <reason>` line in docs/append-only-exceptions.txt).';

// The recovery that works (M34.5.F.9, W3-08): a revert is itself a rewrite.
const RECOVERY =
  'A revert is itself a rewrite and adds a violation. To recover before the push lands: drop the commit from your ' +
  'local branch (git reset or git rebase), then append the change as a new line. For a rewrite a person approves: ' +
  `append "<sha> <path> <reason>" to ${EXCEPTIONS_FILE} in a new commit; that file is itself append-only, and every ` +
  'run prints the lines it honors.';

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
// <remote>/HEAD (the remote's real default, whatever its name) first, then <remote>/main. Null
// when neither exists: nothing has been pushed, so nothing pushed can have been rewritten.
function resolveWalkBase(head, remote) {
  const rn = remote || 'origin';
  let ref = null;
  const sym = git(['symbolic-ref', '-q', `refs/remotes/${rn}/HEAD`]);
  if (sym.code === 0 && sym.stdout.trim()) ref = sym.stdout.trim();
  else if (git(['rev-parse', '-q', '--verify', `refs/remotes/${rn}/main`]).code === 0) ref = `refs/remotes/${rn}/main`;
  if (ref === null) return null;
  const r = git(['merge-base', head, ref]);
  if (r.code !== 0) die2(`could not resolve the walk base \`git merge-base ${head} ${ref}\` (${r.stderr.trim() || 'unknown error'}). Pass --base <ref> explicitly.`);
  const sha = r.stdout.trim();
  if (!sha) die2('the walk base resolved to empty; pass --base <ref> explicitly.');
  return sha;
}

// A ledger's content at a commit: { absent: true } when the path is not in that tree.
const showCache = new Map();
function showAt(ref, refPath) {
  const key = `${ref}:${refPath}`;
  if (showCache.has(key)) return showCache.get(key);
  const shown = git(['show', `${ref}:${refPath}`]);
  let out;
  if (shown.code === 0) out = { content: normalize(shown.stdout) };
  else if (isPathAbsentFromRef(shown.stderr)) out = { absent: true };
  else return die2(`git show ${ref}:${refPath} failed: ${shown.stderr.trim() || 'unknown error'}`);
  showCache.set(key, out);
  return out;
}

function parseListText(text) {
  return normalize(text).split('\n').map((l, i) => ({ line: l.trim(), n: i + 1 })).filter((x) => x.line && !x.line.startsWith('#'));
}
function readListFile(file, what) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return die2(`cannot read the ${what} file ${file} (${e.message}).`); }
  return parseListText(text);
}
// The ledger list's paths at a commit, or null when the list is absent there.
function listAt(ref, listPath) {
  const s = showAt(ref, listPath.replace(/\\/g, '/'));
  return s.absent ? null : parseListText(s.content).map((x) => x.line.replace(/\\/g, '/'));
}
// The list in the working tree, or null when it is not there.
function listInTree(listPath) {
  try { return parseListText(fs.readFileSync(listPath, 'utf8')).map((x) => x.line.replace(/\\/g, '/')); } catch (_) { return null; }
}

// `<sha> <path> <reason>` per line. strict (the --exceptions flag): a line with fewer than three
// fields or a non-hex sha fails closed before any check runs. Not strict (the exceptions file, which
// is itself append-only and cannot be repaired by an edit): the line is printed as ignored and grants
// nothing.
function parseExceptions(entries, source, strict) {
  const out = [];
  for (const { line, n } of entries) {
    const m = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
    if (!m || !/^[0-9a-f]{7,40}$/i.test(m[1])) {
      if (strict) die2(`malformed exception line ${n} in ${source}: want \`<sha> <path> <reason>\` (sha 7..40 hex), got ${JSON.stringify(line)}.`);
      process.stdout.write(`exception ignored (malformed): line ${n} of ${source}: ${JSON.stringify(line)} - want \`<sha> <path> <reason>\`; it grants nothing\n`);
      continue;
    }
    out.push({ sha: m[1].toLowerCase(), path: m[2].replace(/\\/g, '/'), reason: m[3].trim() });
  }
  return out;
}
function readExceptions(file) { return parseExceptions(readListFile(file, 'exceptions'), file, true); }
// The exceptions file at a commit (absent: none).
function exceptionsAt(ref) {
  const s = showAt(ref, EXCEPTIONS_FILE);
  return s.absent ? [] : parseExceptions(parseListText(s.content), `${EXCEPTIONS_FILE} at ${shortSha(ref)}`, false);
}

function shortSha(sha) { return String(sha).slice(0, 12); }
function uniq(a) { return Array.from(new Set(a)); }

// THE WALK (mutant target): every commit from the head down to the base, first-parent only;
// each ledger's version at a commit must extend its version at that commit's first parent.
// Removing the parent-to-child compare turns the pin-1/pin-2 fixtures green for the mutant.
//   paths       the checked set (the union of the lists, the positional paths)
//   listPath    the ledger list (its shrinks are judged at every commit), or null
//   endpoint    compare each ledger at the base with the head as well (a pushed ref whose
//               remote sha is not an ancestor of the new head: a rewrite of what the remote holds)
//   label       the remote ref, in --pre-push mode
function walk({ base, head, paths, exceptions, listPath, endpoint, label }) {
  const headSha = git(['rev-parse', '--verify', `${head}^{commit}`]);
  if (headSha.code !== 0) die2(`--head ${head} does not resolve (${headSha.stderr.trim() || 'unknown error'}).`);
  const tip = headSha.stdout.trim();
  const list = git(['rev-list', '--first-parent', tip, `^${base}`]);
  if (list.code !== 0) die2(`git rev-list --first-parent ${head} ^${base} failed: ${list.stderr.trim() || 'unknown error'}`);
  const commits = list.stdout.split(/\r?\n/).filter(Boolean).reverse(); // oldest first
  const forRef = label ? ` for ${label}` : '';
  process.stdout.write(commits.length === 0
    ? `walk: 0 commit(s) from ${shortSha(tip)} down to base ${shortSha(base)}${forRef} - skipped (no commits walked)\n`
    : `walk: ${commits.length} commit(s) from ${shortSha(tip)} down to base ${shortSha(base)} (first-parent)${forRef}\n`);
  for (const ex of exceptions) process.stdout.write(`exception loaded: ${ex.sha} ${ex.path} - ${ex.reason}\n`);

  const checked = uniq(paths.map((p) => p.replace(/\\/g, '/')).concat([EXCEPTIONS_FILE]));
  const headList = listPath ? (listAt(tip, listPath) || []) : [];
  const seen = new Map();     // refPath -> true once present at any step
  const failed = new Set();   // refPath -> a violation was found
  const dropFrom = new Map(); // refPath -> the walk index from which an excepted drop leaves the set
  const excused = new Set();  // refPath -> an exception was honored for it in this walk
  let violations = 0;
  const findEx = (sha, refPath) => exceptions.find((e) => sha.startsWith(e.sha) && e.path === refPath);

  commits.forEach((sha, idx) => {
    const parent = git(['rev-parse', '-q', '--verify', `${sha}^1`]);
    const parentSha = parent.code === 0 ? parent.stdout.trim() : null;
    const subject = git(['log', '-1', '--format=%s', sha]).stdout.trim();
    // The list's own shrink (W3-06): a path the parent listed and this commit drops, not listed
    // again at the head, leaves the checked set only on an exception naming this commit and the list.
    if (listPath && parentSha !== null) {
      const before = listAt(parentSha, listPath);
      const after = listAt(sha, listPath);
      if (before !== null) {
        const dropped = before.filter((p) => (after === null || after.indexOf(p) === -1) && headList.indexOf(p) === -1);
        if (dropped.length) {
          const ex = findEx(sha, listPath);
          if (ex) {
            process.stdout.write(`exception honored: ${ex.sha} ${ex.path} - ${ex.reason} (commit ${shortSha(sha)} drops ${dropped.join(', ')} from the checked set)\n`);
            for (const p of dropped) if (!dropFrom.has(p)) dropFrom.set(p, idx);
          } else {
            if (after === null) console.error(`VIOLATION  ${listPath} @ ${shortSha(sha)} (${subject}): the ledger list was deleted - every ledger it named stays checked.`);
            for (const p of dropped) {
              console.error(`VIOLATION  ${listPath} @ ${shortSha(sha)} (${subject}): drops ${p} from the ledger list - a ledger leaves the list only with an exception line "${shortSha(sha)} ${listPath} <reason>" in ${EXCEPTIONS_FILE}.`);
              violations++;
            }
            failed.add(listPath);
          }
        }
      }
    }
    for (const refPath of checked) {
      if (dropFrom.has(refPath) && idx >= dropFrom.get(refPath)) continue;
      const ex = findEx(sha, refPath);
      if (ex) {
        process.stdout.write(`exception honored: ${ex.sha} ${ex.path} - ${ex.reason} (commit ${shortSha(sha)} skipped for this path)\n`);
        seen.set(refPath, true);
        excused.add(refPath);
        continue;
      }
      const before = parentSha === null ? { absent: true } : showAt(parentSha, refPath);
      const after = showAt(sha, refPath);
      if (!after.absent) seen.set(refPath, true);
      if (before.absent) continue;            // new at this step (or still absent): nothing prior to violate
      if (after.absent) {
        console.error(`VIOLATION  ${refPath} @ ${shortSha(sha)} (${subject}): present in parent ${shortSha(parentSha)} but deleted — a ledger may only grow, never be deleted.`);
        failed.add(refPath);
        violations++;
        continue;
      }
      if (after.content.startsWith(before.content)) continue;
      const d = firstDivergence(before.content, after.content);
      // M32.1.A (V-4): a merge whose resolution put main's rows above the branch's reads as a
      // mid-file insert against the first parent; the line names the valve.
      const isMerge = git(['rev-parse', '-q', '--verify', `${sha}^2`]).code === 0;
      console.error(
        `VIOLATION  ${refPath} @ ${shortSha(sha)} (${subject}): the parent's content (${shortSha(parentSha)}) is no longer a prefix ` +
        `(append-only broken at line ${d.line}, byte ${d.offset}).` + (isMerge ? ` ${MERGE_VALVE}` : '')
      );
      console.error(`           parent had: ${d.base}`);
      console.error(`           commit has: ${d.cur}`);
      failed.add(refPath);
      violations++;
    }
  });

  // The endpoint compare (W3-07): what the remote holds must still be a prefix of what is pushed.
  if (endpoint) {
    const where = label ? `the remote's ${label} (${shortSha(base)})` : `the base ${shortSha(base)}`;
    if (listPath) {
      const before = listAt(base, listPath);
      if (before !== null) {
        for (const p of before.filter((x) => headList.indexOf(x) === -1 && !dropFrom.has(x))) {
          console.error(`VIOLATION  ${listPath}: ${where} lists ${p}, the pushed ${shortSha(tip)} does not - a ledger leaves the list only with an exception line in ${EXCEPTIONS_FILE}.`);
          failed.add(listPath);
          violations++;
        }
      }
    }
    for (const refPath of checked) {
      if (dropFrom.has(refPath) || excused.has(refPath) || failed.has(refPath)) continue;
      const before = showAt(base, refPath);
      if (before.absent) continue;
      const after = showAt(tip, refPath);
      if (after.absent) {
        console.error(`VIOLATION  ${refPath}: present at ${where} but deleted at the pushed ${shortSha(tip)} - a ledger may only grow, never be deleted.`);
        failed.add(refPath);
        violations++;
        continue;
      }
      seen.set(refPath, true);
      if (after.content.startsWith(before.content)) continue;
      const d = firstDivergence(before.content, after.content);
      console.error(`VIOLATION  ${refPath}: ${where} is no longer a prefix of the pushed ${shortSha(tip)} (append-only broken at line ${d.line}, byte ${d.offset}) - a pushed row was rewritten.`);
      console.error(`           remote had: ${d.base}`);
      console.error(`           push has:   ${d.cur}`);
      failed.add(refPath);
      violations++;
    }
  }

  // The per-path summary (W3-15): a path with a violation prints FAIL, never ok. An empty walk
  // prints its skip on the walk line and no per-path line but a FAIL.
  const shown = paths.map((p) => p.replace(/\\/g, '/'));
  for (const extra of [listPath, EXCEPTIONS_FILE]) if (extra && shown.indexOf(extra) === -1 && (failed.has(extra) || seen.get(extra))) shown.push(extra);
  for (const refPath of uniq(shown)) {
    if (failed.has(refPath)) process.stdout.write(`FAIL  ${refPath}\n`);
    else if (commits.length === 0) continue;
    else if (dropFrom.has(refPath)) process.stdout.write(`ok    ${refPath}  (left the list by an honored exception)\n`);
    else process.stdout.write(seen.get(refPath) ? `ok    ${refPath}\n` : `ok    ${refPath}  (absent through the walk — new or not yet created)\n`);
  }
  return violations;
}

// The checked set for a walk: the positional paths and the union of the list in the working
// tree, at the head and at the base (W3-06). null when a list was named and is absent at all three.
function checkedSet(positional, listPath, head, base) {
  if (listPath === null) return positional.slice();
  const lists = [listInTree(listPath), listAt(head, listPath), listAt(base, listPath)].filter((l) => l !== null);
  if (lists.length === 0) return null;
  return uniq(positional.concat(...lists));
}

function closing(violations) {
  process.stderr.write(
    `\n${violations} append-only violation(s) across the walk. Ledgers grow only at the end ` +
    '(newest at bottom); prior lines are immutable in every commit, not only against the base. ' + RECOVERY + '\n'
  );
}

const ZERO = /^0+$/;
function prePush({ remote, listPath, positional, flagExceptions }) {
  let feed = '';
  try { feed = fs.readFileSync(0, 'utf8'); } catch (_) { feed = ''; }
  const rows = feed.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (rows.length === 0) {
    process.stdout.write('walk: no refs on git\'s feed - nothing walked\n');
    return 0;
  }
  let violations = 0;
  for (const row of rows) {
    const m = row.trim().match(/^(\S+)\s+([0-9a-f]{40,64})\s+(\S+)\s+([0-9a-f]{40,64})$/i);
    if (!m) die2(`unreadable line on git's pre-push feed: ${JSON.stringify(row)} (want "<local ref> <local sha> <remote ref> <remote sha>").`);
    const [, , localSha, remoteRef, remoteSha] = m;
    if (ZERO.test(localSha)) { process.stdout.write(`walk: ${remoteRef} deleted - nothing walked\n`); continue; }
    const peeled = git(['rev-parse', '-q', '--verify', `${localSha}^{commit}`]);
    if (peeled.code !== 0) { process.stdout.write(`walk: ${remoteRef}: ${shortSha(localSha)} is not a commit - nothing walked\n`); continue; }
    const tip = peeled.stdout.trim();
    let base;
    let endpoint = false;
    if (ZERO.test(remoteSha)) {
      base = resolveWalkBase(tip, remote);
      if (base === null) {
        process.stdout.write(`walk: no ${remote}/HEAD or ${remote}/main to compare against (nothing pushed yet) — append-only walk skipped.\n`);
        continue;
      }
    } else {
      if (git(['cat-file', '-e', `${remoteSha}^{commit}`]).code !== 0) {
        console.error(`VIOLATION  the remote's ${remoteRef} is at ${shortSha(remoteSha)}, which this clone does not have: fetch, then push again.`);
        violations++;
        continue;
      }
      base = remoteSha;
      endpoint = git(['merge-base', '--is-ancestor', remoteSha, tip]).code !== 0;
    }
    const paths = checkedSet(positional, listPath, tip, base);
    if (paths === null) {
      process.stdout.write(`walk: ${remoteRef}: no ${listPath} in the working tree, at ${shortSha(tip)} or at ${shortSha(base)} - append-only walk skipped.\n`);
      continue;
    }
    const exceptions = flagExceptions.concat(exceptionsAt(tip));
    violations += walk({ base, head: tip, paths, exceptions, listPath, endpoint, label: remoteRef });
  }
  return violations;
}

function main() {
  const argv = process.argv.slice(2);
  let base = null;
  let head = 'HEAD';
  let perCommit = false;
  let prePushMode = false;
  let remote = 'origin';
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
    } else if (a === '--remote') {
      remote = argv[++i];
      if (remote === undefined || remote === '') die2('--remote requires a <name> argument.');
    } else if (a === '--per-commit') {
      perCommit = true;
    } else if (a === '--pre-push') {
      prePushMode = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      die2(`unknown option: ${a}\n${USAGE}`);
    } else {
      paths.push(a);
    }
  }

  const listPath = ledgersFile === null ? null : ledgersFile.replace(/\\/g, '/');
  const flagExceptions = exceptionsFile !== null ? readExceptions(exceptionsFile) : [];

  if (prePushMode) {
    if (perCommit || base !== null) die2('--pre-push walks git\'s ref feed; it takes neither --per-commit nor --base.');
    if (listPath === null && paths.length === 0) die2(`no ledger paths given.\n${USAGE}`);
    const violations = prePush({ remote, listPath, positional: paths, flagExceptions });
    if (violations > 0) { closing(violations); process.exit(1); }
    process.exit(0);
  }

  if (perCommit) {
    if (base === null) {
      base = resolveWalkBase(head, 'origin');
      if (base === null) {
        if (listPath !== null && listInTree(listPath) === null && git(['rev-parse', '-q', '--verify', `${head}^{commit}`]).code === 0 && listAt(head, listPath) === null) {
          die2(`cannot read the ledgers file ${ledgersFile} (absent in the working tree and at ${head}).`);
        }
        process.stdout.write('walk: no origin/HEAD or origin/main to compare against (nothing pushed yet) — append-only walk skipped.\n');
        process.exit(0);
      }
    }
    const headRes = git(['rev-parse', '--verify', `${head}^{commit}`]);
    if (headRes.code !== 0) die2(`--head ${head} does not resolve (${headRes.stderr.trim() || 'unknown error'}).`);
    const all = checkedSet(paths, listPath, headRes.stdout.trim(), base);
    if (all === null) die2(`cannot read the ledgers file ${ledgersFile} (absent in the working tree, at the head and at the base).`);
    if (all.length === 0) die2(`no ledger paths given.\n${USAGE}`);
    const exceptions = flagExceptions.concat(exceptionsAt(headRes.stdout.trim()));
    const violations = walk({ base, head, paths: all, exceptions, listPath, endpoint: false, label: null });
    if (violations > 0) { closing(violations); process.exit(1); }
    process.exit(0);
  }

  if (listPath !== null) for (const { line } of readListFile(ledgersFile, 'ledgers')) paths.push(line);
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
      '(newest at bottom); prior lines are immutable. Restore the file and append ' +
      'instead (git restore <path>, then add the change as a new line at the end).\n'
    );
    process.exit(1);
  }
  process.exit(0);
}

main();
