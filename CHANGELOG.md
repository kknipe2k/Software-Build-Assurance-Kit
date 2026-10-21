# Changelog

Release history of the Software Build Assurance Kit, in the same shape as the release notes - capabilities, limitations, evidence - never a build diary. Full detail for the current release: [RELEASE-NOTES.md](RELEASE-NOTES.md).

## v1.0.8 - 2026-10-21

**The current release** - speed and defects on v1.0.7: every defect a real multi-milestone build on v1.0.7 surfaced is closed beside the trim in the same mechanism, and a v1.0.6 or v1.0.7 project takes this release's wiring files by one command; full detail in [RELEASE-NOTES.md](RELEASE-NOTES.md). No interface changes to the build loop.

- **Capabilities.** Everything in v1.0.7. `kit-update --migrate` upgrades the bootstrap-filled wiring files (the pre-commit hook and `verify-local`) from the version the project was built on, showing the change file by file first and merging three ways with your fills kept; a project records its kit pin and a sha256 per kit file. The red gate protects its whole control set (the role file, the stage marker, the hook itself) and judges the role recorded at stage open; PowerShell is judged like Bash. The project's release lane binds `--reconcile` to a fingerprint of the contents it tested and refuses a changed tree by path; an unreadable test summary fails; a second unreasoned release lane at a stage end is refused. A session reads one view assembled for its stage and role instead of the whole Phase doc (about a tenth of the bytes), and the bootstrap gets its own reading manifest. The two terminals ring each other when a packet lands, presence stands beside the watcher, `/send`, `/approve-red` and `/closeout` are human-only skills, and every shipped launch line keeps the watcher alive.
- **Upgrading a v1.0.6 or v1.0.7 project.** Upgrade the kit folder with `sbak-install`, then run `node scripts/kit-update.cjs --migrate` (a v1.0.6 project adds `--pin 1.0.6`); the manual change below remains for a reader who prefers to make it by hand.
- **Limitations.** Unchanged from v1.0.7: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** One fresh-context verifier round with the calibration self-test at zero false negatives, 30 of 30 planted defects killed, the six new gates driven from places the pins did not stand, this release candidate built, installed and migrated from a v1.0.7 project to READY, and the release lane green on the verified bytes; every new check mutation-tested.

### Manual change for a v1.0.7 project

**First, upgrade the kit folder.** The edits below assume the new kit is in `sbak/`. Download the new release's `sbak-install.cjs` into your project folder, start `claude` there, type `sbak-install`, and answer `upgrade` (the same command as the install). The upgrade refreshes `sbak/` and the kit-managed scripts. It leaves `scripts/verify-local.cjs` at v1.0.7 by design. Then make the edits below by hand.

**Or let the kit make it.** With the new kit in `sbak/` and the upgrade committed, run `node scripts/kit-update.cjs --migrate`: it shows the change file by file first, and with `--apply-all` it merges `scripts/verify-local.cjs` three ways from the v1.0.7 template, keeping your fills. The steps below are the same change by hand.

A project bootstrapped from v1.0.7 runs its own copy of `scripts/verify-local.cjs`, filled with the project's test commands at bootstrap. `kit-update --apply` refuses that file by design, because restoring it from the template would wipe those fills, so the change below is made by hand.

- **What it fixes.** Two checks passed where they should have failed. `--reconcile` proved only that the release lane passed at the current commit, so an edit made after that run, or a new untracked file, reconciled on contents no lane had tested. And the test-count guard passed a `node --test` step whose summary it could not read: a chunk boundary inside the summary's first character, the dot reporter, a report sent to a file, and junit's count all passed.
- **What changes.** Every lane records a fingerprint of the contents it tests beside the commit, and `--reconcile` refuses a tree whose contents changed after the release lane, one line per changed path. The run state the lanes and the stage loop write (the lane summaries, `.claude/measurements/`, the channel logs, the hook ledgers) stays out of the fingerprint, and `--list` prints that table. A `node --test` step whose summary cannot be read now fails, naming the reporter; junit's count is read; and a step the guard does not judge, such as `npm test`, says so on the run. Every run also appends one line to `.claude/verify-last-runs.jsonl`, which the stage's measure line counts.
- **How.** Make the edits below in your project's `scripts/verify-local.cjs`. Each Find block appears exactly once in the v1.0.7 file. Edits 2, 3, 4, 6, 7, 8, 11, 12, 13 and 14 are required. Edits 1, 5, 9 and 10 are optional: they bring the comments and the `--list` output in line.

**Edit 1 (optional): the header comment on the third proof.** Find these lines:

```js
// the settled set, cover every discovered file; (3) the release lane passed at this HEAD.
// Only `--write` after all three touches tests/.settled.json (write-temp-rename).
```

Replace them with:

```js
// the settled set, cover every discovered file; (3) the release lane passed at this HEAD, on
// these contents (the fingerprint every lane records before its first task; a tree changed
// after that run is refused, path by path). Only `--write` after all three touches
// tests/.settled.json (write-temp-rename).
```

**Edit 2 (required): the string decoder.** Find this line:

```js
const path = require('path');
```

Replace it with:

```js
const path = require('path');
const { StringDecoder } = require('string_decoder');
```

**Edit 3 (required): the run-state table.** Find these lines:

```js
  { match: 'Dockerfile', why: 'container definition' },
];
```

Replace them with:

```js
  { match: 'Dockerfile', why: 'container definition' },
];

// Run state: what a lane and the stage loop write while a lane runs or is reported. It stays out
// of the contents fingerprint, so closeout does not refuse its own evidence. ONE table of exact
// path prefixes (no globs); `--list` prints it.
const RUN_STATE = [
  { match: `${LAST_DIR}/verify-last-`, why: 'the lane summaries themselves' },
  { match: '.claude/measurements/', why: 'evidence redirected while a lane runs' },
  { match: '.claude/channel/', why: 'the channel logs; every packet appends' },
  { match: '.claude/receipts/', why: 'the hook ledgers' },
];
```

**Edit 4 (required): the contents fingerprint.** Find these lines:

```js
  return OUTSIDE_SOURCE.find((row) => (row.match.endsWith('/') ? n.startsWith(row.match) : (n === row.match || base.startsWith(row.match))));
}
```

Replace them with:

```js
  return OUTSIDE_SOURCE.find((row) => (row.match.endsWith('/') ? n.startsWith(row.match) : (n === row.match || base.startsWith(row.match))));
}
const isRunState = (rel) => RUN_STATE.some((row) => norm(rel).startsWith(row.match));

// The contents a lane tests, recorded beside its head: the tree of `git stash create` (index and
// worktree as one tree, the stash list untouched; its commit carries a timestamp, so only the tree
// is stable; empty output is a clean tree, so HEAD's), a digest of that tree's entries, and the
// untracked files beside their blobs (stash create leaves them out). Run state is dropped from
// both. Any git failure records { error }: the run says so once and --reconcile refuses it.
function fingerprint(root) {
  const run = (args, input) => spawnSync('git', args, { cwd: root, encoding: 'utf8', input, maxBuffer: 256 << 20, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  const why = (r, what) => `${what}: ${String(r.stderr || '').trim().split(/\r?\n/)[0] || (r.error ? r.error.message : `exit ${r.status}`)}`;
  run(['update-index', '-q', '--refresh']); // a stat-only change (a copy, a touch) makes stash create exit 1, silently
  const sc = run(['stash', 'create']);
  if (sc.status !== 0) return { error: why(sc, 'git stash create') };
  const tr = run(['rev-parse', '--verify', `${sc.stdout.trim() || 'HEAD'}^{tree}`]);
  if (tr.status !== 0) return { error: why(tr, 'git rev-parse') };
  const tree = tr.stdout.trim();
  const ls = run(['ls-tree', '-r', '-z', '--full-tree', tree]);
  if (ls.status !== 0) return { error: why(ls, 'git ls-tree') };
  const entries = ls.stdout.split('\0').filter((e) => e && !isRunState(e.slice(e.indexOf('\t') + 1)));
  const others = run(['ls-files', '--others', '--exclude-standard', '-z']);
  if (others.status !== 0) return { error: why(others, 'git ls-files') };
  const paths = others.stdout.split('\0').filter((p) => p && !isRunState(p)).sort();
  const files = paths.filter((p) => !p.endsWith('/')); // a trailing slash is a nested repository
  let blobs = [];
  if (files.length) {
    const ho = run(['hash-object', '--stdin-paths'], files.join('\n') + '\n');
    if (ho.status !== 0) return { error: why(ho, 'git hash-object') };
    blobs = ho.stdout.split(/\r?\n/).filter(Boolean);
    if (blobs.length !== files.length) return { error: `git hash-object returned ${blobs.length} blob(s) for ${files.length} path(s)` };
  }
  const blobOf = new Map(files.map((p, i) => [p, blobs[i]]));
  const untrackedFiles = paths.map((p) => [p, blobOf.get(p) || 'repository']);
  const digest = (s) => 'sha256:' + crypto.createHash('sha256').update(s).digest('hex');
  return { tree, tracked: digest(entries.join('\0')), untracked: digest(JSON.stringify(untrackedFiles)), untrackedFiles };
}
// One line per path that differs between the tested contents and these, the path last.
function contentsDiff(root, was, now) {
  const lines = [];
  if (was.tracked !== now.tracked) {
    if (git(root, ['cat-file', '-e', `${was.tree}^{tree}`]) === null) lines.push(`  (the tested tree ${String(was.tree).slice(0, 9)} is no longer in the object store, so the changed tracked paths cannot be named)`);
    else {
      for (const rec of (git(root, ['diff', '--no-renames', '--numstat', '-z', was.tree, now.tree]) || '').split('\0')) {
        const m = /^(\S+)\t(\S+)\t([\s\S]+)$/.exec(rec);
        if (m && !isRunState(m[3])) lines.push(`  changed (${m[1] === '-' ? 'binary' : `+${m[1]} -${m[2]}`})  ${m[3]}`);
      }
    }
  }
  if (was.untracked !== now.untracked) {
    const before = new Map(was.untrackedFiles || []); const after = new Map(now.untrackedFiles);
    for (const [p, b] of after) if (!before.has(p)) lines.push(`  added (untracked)  ${p}`); else if (before.get(p) !== b) lines.push(`  modified (untracked)  ${p}`);
    for (const p of before.keys()) if (!after.has(p)) lines.push(`  removed (untracked)  ${p}`);
  }
  return lines;
}
```

**Edit 5 (optional): the comment above the test-count guard.** Find these lines:

```js
// default runner is judged on the runner's OWN summary: `tests 0` fails the step. Other runners
// already fail on no tests (pytest exits 5; vitest and jest print "No test files found" and exit
// 1) and are not judged. The judged step pipes stdout and writes every chunk straight through as
// it arrives, so the run stays live on screen; only a bounded tail is kept to read the summary
// (spec `\u2139 tests N`, or tap `# tests N`: Node 20 and 22 print tap when stdout is a pipe).
```

Replace them with:

```js
// default runner is judged on the runner's OWN summary: `tests 0` fails the step, and so does a
// summary that cannot be read (the dot reporter prints none; a reporter destination other than
// stdout leaves the pipe empty) - no count is never a pass. Other runners already fail on no tests
// (pytest exits 5; vitest and jest print "No test files found" and exit 1) and are not judged; nor
// is a wrapper such as `npm test`, and every step the guard does not judge says so on the run. The
// judged step pipes stdout and writes every chunk straight through as it arrives, so the run stays
// live on screen; the chunks are decoded as one stream (a chunk boundary can split the 3-byte
// `\u2139`), and only a bounded tail is kept to read the summary (spec `\u2139 tests N`, tap
// `# tests N` - Node 20 and 22 print tap when stdout is a pipe - or junit `<!-- tests N -->`).
```

**Edit 6 (required): the summary reader.** Find these lines:

```js
  const rx = /^[^\S\n]*(?:\u2139|#)[^\S\n]+tests[^\S\n]+(\d+)[^\S\n]*$/gm;
  const t = tail.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  for (let m = rx.exec(t); m; m = rx.exec(t)) n = Number(m[1]);
  return n;
}
```

Replace them with:

```js
  const rx = /^[^\S\n]*(?:(?:\u2139|#)[^\S\n]+tests[^\S\n]+(\d+)|<!--[^\S\n]*tests[^\S\n]+(\d+)[^\S\n]*-->)[^\S\n]*$/gm;
  const t = tail.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  for (let m = rx.exec(t); m; m = rx.exec(t)) n = Number(m[1] !== undefined ? m[1] : m[2]);
  return n;
}
// The reporter shape an unreadable summary names: every --test-reporter value (none given: the
// runner's default), then each destination that is not stdout.
function reporterShape(cmd) {
  const values = (flag) => [...cmd.matchAll(new RegExp(`${flag}[= ]("?)([^\\s"]+)\\1`, 'g'))].map((m) => m[2]);
  const reporters = values('--test-reporter');
  return (reporters.length ? reporters.join('+') : 'default') + values('--test-reporter-destination').filter((d) => d !== 'stdout').map((d) => `, destination ${d}`).join('');
}
```

**Edit 7 (required): the judged step.** Find these lines:

```js
  if (!NODE_TEST.test(step.shell)) return done(spawnSync(sh, args, Object.assign({ stdio: io }, opts)).status);
  return new Promise((resolve) => {
    let tail = '';
    const child = spawn(sh, args, Object.assign({ stdio: [io, 'pipe', io] }, opts));
    child.stdout.on('data', (b) => { if (!quiet) process.stdout.write(b); tail = (tail + b.toString('utf8')).slice(-65536); });
    child.on('error', () => resolve(done(1)));
    child.on('close', (code) => { // a signal leaves code null, which fails like the sync path
      if (code !== 0 || testsRun(tail) !== 0) return resolve(done(code));
      if (noTestFiles(root)) return resolve(Object.assign(done(0), { skip: NO_TEST_YET }));
      if (!quiet) process.stdout.write(`${RED}FAIL the runner ran 0 tests: node --test found no test file - check the pattern in: ${step.cmd}${RESET}\n`);
```

Replace them with:

```js
  if (!NODE_TEST.test(step.shell)) {
    if (!quiet) process.stdout.write(`${DIM}note the tests-0 guard does not judge this step (it reads the runner's count only when the command itself runs node --test): ${step.cmd}${RESET}\n`);
    return done(spawnSync(sh, args, Object.assign({ stdio: io }, opts)).status);
  }
  return new Promise((resolve) => {
    let tail = '';
    const dec = new StringDecoder('utf8');
    const child = spawn(sh, args, Object.assign({ stdio: [io, 'pipe', io] }, opts));
    child.stdout.on('data', (b) => { if (!quiet) process.stdout.write(b); tail = (tail + dec.write(b)).slice(-65536); });
    child.on('error', () => resolve(done(1)));
    child.on('close', (code) => { // a signal leaves code null, which fails like the sync path
      tail = (tail + dec.end()).slice(-65536);
      const n = code === 0 ? testsRun(tail) : null;
      if (code !== 0 || (n !== null && n !== 0)) return resolve(done(code));
      if (noTestFiles(root)) return resolve(Object.assign(done(0), { skip: NO_TEST_YET }));
      if (!quiet) process.stdout.write(n === null
        ? `${RED}FAIL the runner's summary could not be read (reporter ${reporterShape(step.shell)}) - the step is judged on the runner's own "tests N" line on stdout, so use the spec, tap or junit reporter there: ${step.cmd}${RESET}\n`
        : `${RED}FAIL the runner ran 0 tests: node --test found no test file - check the pattern in: ${step.cmd}${RESET}\n`);
```

**Edit 8 (required): the third proof.** Find these lines:

```js
  // proof 3 - release passed at this head
  const rel = readLast(root, 'release');
  if (!rel || rel.schema !== SUMMARY_SCHEMA) return fail(`no release-lane summary at ${LAST_DIR}/verify-last-release.json - run --lane release at this head first`);
  if (rel.verdict !== 'pass') return fail(`the last release lane did not pass (verdict ${rel.verdict})`);
  if (rel.head !== head) return fail(`the last release lane ran at ${String(rel.head).slice(0, 9)}, not this HEAD ${head.slice(0, 9)} - re-run --lane release`);
  say(`reconcile 3/3  release: the release lane passed at this head (${LAST_DIR}/verify-last-release.json, verdict pass, head ${head.slice(0, 9)} == HEAD)`);
```

Replace them with:

```js
  // proof 3 - release passed at this head, on these contents
  const rel = readLast(root, 'release');
  if (!rel || rel.schema !== SUMMARY_SCHEMA) return fail(`no release-lane summary at ${LAST_DIR}/verify-last-release.json - run --lane release at this head first`);
  if (rel.verdict !== 'pass') return fail(`the last release lane did not pass (verdict ${rel.verdict})`);
  if (rel.head !== head) return fail(`the last release lane ran at ${String(rel.head).slice(0, 9)}, not this HEAD ${head.slice(0, 9)} - re-run --lane release`);
  const was = rel.contents;
  if (!was || typeof was !== 'object') return fail(`the last release lane's summary records no contents fingerprint (${LAST_DIR}/verify-last-release.json, written by an older scripts/verify-local.cjs) - re-run --lane release`);
  if (was.error) return fail(`the last release lane could not fingerprint the tree it tested (${was.error}) - re-run --lane release once it can`);
  const now = fingerprint(root);
  if (now.error) return fail(`this tree cannot be fingerprinted (${now.error}), so nothing shows it is the tree the release lane tested`);
  if (now.tracked !== was.tracked || now.untracked !== was.untracked) {
    process.stdout.write(`${RED}reconcile FAILED${RESET} the tree changed after the last release lane ran at this head (${LAST_DIR}/verify-last-release.json):\n`);
    for (const l of contentsDiff(root, was, now)) say(l);
    say('re-run --lane release on these contents');
    return 1;
  }
  say(`reconcile 3/3  release: the release lane passed at this head, on these contents (${LAST_DIR}/verify-last-release.json, verdict pass, head ${head.slice(0, 9)} == HEAD, tree ${now.tree.slice(0, 9)})`);
```

**Edit 9 (optional): the run-state table in `--list --json`.** Find this line:

```js
      process.stdout.write(JSON.stringify({ schema: 'sbak/verify-lane-listing/v1', lane, registryHash: registryHash(), taskCount: rows.length, selection: plan.selection, fallbackReason: plan.fallbackReason, base: plan.base, tasks: rows, outsideSource: OUTSIDE_SOURCE }, null, 2) + '\n');
```

Replace it with:

```js
      process.stdout.write(JSON.stringify({ schema: 'sbak/verify-lane-listing/v1', lane, registryHash: registryHash(), taskCount: rows.length, selection: plan.selection, fallbackReason: plan.fallbackReason, base: plan.base, tasks: rows, outsideSource: OUTSIDE_SOURCE, runState: RUN_STATE }, null, 2) + '\n');
```

**Edit 10 (optional): the run-state table in `--list`.** Find this line:

```js
    process.stdout.write(`\n  release is DERIVED as the whole registry (lane tags ignored); a required skip is a failure there.\n  outside-source paths (any -> fast/stage run full): ${OUTSIDE_SOURCE.map((r) => r.match).join(' ')}\n\n`);
```

Replace it with:

```js
    process.stdout.write(`\n  release is DERIVED as the whole registry (lane tags ignored); a required skip is a failure there.\n  outside-source paths (any -> fast/stage run full): ${OUTSIDE_SOURCE.map((r) => r.match).join(' ')}\n`);
    process.stdout.write(`  run state (kept out of the contents fingerprint --reconcile compares):\n${RUN_STATE.map((r) => `      ${r.match.padEnd(24)} ${r.why}\n`).join('')}\n`);
```

**Edit 11 (required): the fingerprint, taken once per run.** Find this line:

```js
  const availability = {};
```

Replace it with:

```js
  const contents = fingerprint(root);
  if (!quiet && contents.error) process.stdout.write(`${DIM}note contents not fingerprinted (${contents.error}) - --reconcile refuses this summary${RESET}\n`);
  const availability = {};
```

**Edit 12 (required): the fingerprint in the summary.** Find this line:

```js
    head: (git(root, ['rev-parse', 'HEAD']) || '').trim(),
```

Replace it with:

```js
    head: (git(root, ['rev-parse', 'HEAD']) || '').trim(), contents,
```

**Edit 13 (required): the run line.** Find these lines:

```js
function readLast(root, lane) {
  try { return JSON.parse(fs.readFileSync(path.join(root, LAST_DIR, `verify-last-${lane}.json`), 'utf8')); } catch (_) { return null; }
}
```

Replace them with:

```js
function readLast(root, lane) {
  try { return JSON.parse(fs.readFileSync(path.join(root, LAST_DIR, `verify-last-${lane}.json`), 'utf8')); } catch (_) { return null; }
}
// One line per run: the summary above is overwritten each run; this file is how a stage's
// measure line counts the lane runs it paid (scripts/lib/read-ledger.cjs measure). Run state.
function appendRunLine(root, summary) {
  let stage = null;
  try { stage = fs.readFileSync(path.join(root, '.claude', 'stage-active'), 'utf8').split(String.fromCharCode(0)).join('').trim() || null; } catch (_) { stage = null; }
  fs.mkdirSync(path.join(root, LAST_DIR), { recursive: true });
  fs.appendFileSync(path.join(root, LAST_DIR, 'verify-last-runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), stage, lane: summary.lane, verdict: summary.verdict, totalDurationMs: summary.totalDurationMs, head: summary.head }) + '\n', 'utf8');
}
```

**Edit 14 (required): the run line, written after the summary.** Find this line:

```js
  try { atomicWrite(path.join(root, LAST_DIR, `verify-last-${lane}.json`), JSON.stringify(summary, null, 2) + '\n'); } catch (_) { /* a read-only tree still gets its verdict */ }
```

Replace it with:

```js
  try { atomicWrite(path.join(root, LAST_DIR, `verify-last-${lane}.json`), JSON.stringify(summary, null, 2) + '\n'); } catch (_) { /* a read-only tree still gets its verdict */ }
  try { appendRunLine(root, summary); } catch (_) { /* the same */ }
```

After the edits:

- Change the file's `// @kit-version 1.0.7` line to the new release's version, so the drift report stops naming the file.
- Add the line `.claude/verify-last-runs.jsonl` to your `.gitignore` (run state, like the lane summaries).
- Run `node scripts/verify-local.cjs --lane release` once. A summary written before the edits carries no fingerprint, and `--reconcile` refuses it by name.
- Check it: `node scripts/verify-local.cjs --lane stage` prints `tests <N>` with your real count, and after a fast and a release lane, an uncommitted edit to a source file makes `node scripts/verify-local.cjs --reconcile <milestone>` refuse, naming that file.

## v1.0.7 - 2026-10-16

The field-repair hotfix on v1.0.6, superseded by v1.0.8: the gates that passed where they should have failed now fail, proven on the gates a generated project runs on itself. No interface changes to the build loop.

- **Capabilities.** Everything in v1.0.6. On Windows a project's own test lanes now run its tests: the test command reaches `cmd` intact, and a `node --test` run that finds no test file fails the step - while the project has no test file at all, the step is a named skip, which the release lane still fails. The red gate judges the repository of the file it guards, from any folder, and accepts the release command only in its one approved form. The bootstrap ends with its own commit and one READY line. The installer makes the trunk `main`. `docker_leg: false` gives a native-only release lane. A fresh App-Map passes its own check, and the spec examples land where the examples gate looks.
- **Upgrading a v1.0.6 project.** The upgrade refreshes the kit and leaves the project's own `scripts/verify-local.cjs` at v1.0.6 by design, so the Windows test-lane fix is a manual change: see "Manual change for a v1.0.6 project" below.
- **Limitations.** Unchanged from v1.0.6: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Four independent verifier rounds with the calibration self-test at zero false negatives in each; three hands-on first-run drives; the last round's fixes proven on a real project's own tests (none ran before the fix, all of them after, a planted failure failing every lane and the push) and on a fresh install from the release candidate; every new check mutation-tested; the release verification lane green once on the cut's head.

### Manual change for a v1.0.6 project

**First, upgrade the kit folder.** The edits below assume the new kit is in `sbak/`. Download the new release's `sbak-install.cjs` into your project folder, start `claude` there, type `sbak-install`, and answer `upgrade` (the same command as the install). The upgrade refreshes `sbak/` and the kit-managed scripts, `scripts/kit-update.cjs` and `scripts/lib/read-ledger.cjs` among them. It leaves `scripts/verify-local.cjs` at v1.0.6 by design. Then make edits 1 to 5 by hand. With the new kit in place, the `--apply` step for edits 6 to 8 takes the new reader.

**Or let the kit make it.** With the new kit in `sbak/` and the upgrade committed, run `node scripts/kit-update.cjs --migrate --pin 1.0.6` (a v1.0.6 project records no kit version, so the pin is named once): it shows the change file by file first, and with `--apply-all` it merges `scripts/verify-local.cjs` three ways from the v1.0.6 template, keeping your fills, so this change and the v1.0.7 change above land together. The steps below are this change by hand.

A project bootstrapped from v1.0.6 runs its own copy of `scripts/verify-local.cjs`, filled with the project's test commands at bootstrap. `kit-update --apply` refuses that file by design, because restoring it from the template would wipe those fills, so the fix below is made by hand.

- **What it fixes.** On Windows the copy's test lanes ran no tests and still passed. `cmd` received the quoted test pattern with its quotes escaped, so `node --test` matched no test file and exited 0. The pre-push hook, the stage lane, the release lane's native leg and the always-tagged leg all passed with a failing test in the tree. Linux and macOS are not affected, and neither is CI.
- **What changes.** The command reaches `cmd` intact, in Node's own shell form. A `node --test` run that reports `tests 0` now fails the step, saying the runner found no test file. A project with no test file yet - the bootstrap commit, before the first test stage - is not failed: when git tracks no test-shaped file, the step is a skip with one line, and the release lane fails it as a required skip.
- **How.** Make the edits below in your project's `scripts/verify-local.cjs`. Each Find block appears exactly once in the v1.0.6 file. Edits 1 to 5 fix the test lanes. Edits 6 to 8 are optional: they let a project with no Linux ship target skip the Docker leg of the release lane.

**Edit 1 (required): the child_process require.** Find this line:

```js
const { spawnSync, execFileSync } = require('child_process');
```

Replace it with:

```js
const { spawn, spawnSync, execFileSync } = require('child_process');
```

**Edit 2 (required): the step runner.** Find the whole `runStep` function:

```js
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
```

Replace it with:

```js
// node --test exits 0 when its pattern matches no file, so a step whose command is the kit's
// default runner is judged on the runner's OWN summary: `tests 0` fails the step. Other runners
// already fail on no tests (pytest exits 5; vitest and jest print "No test files found" and exit
// 1) and are not judged. The judged step pipes stdout and writes every chunk straight through as
// it arrives, so the run stays live on screen; only a bounded tail is kept to read the summary
// (spec `\u2139 tests N`, or tap `# tests N`: Node 20 and 22 print tap when stdout is a pipe).
// A project with no test file yet (the bootstrap commit, before its first test stage) reports
// `tests 0` honestly: when git tracks no test-shaped file, the step is a skip - never a pass - and
// the release lane fails it as a required skip; the guard bites once the first test file exists.
const NODE_TEST = /\bnode(?:\.exe)?"?\s+(?:\S+\s+)*?--test(?=\s|$)/;
function testsRun(tail) {
  let n = null;
  const rx = /^[^\S\n]*(?:\u2139|#)[^\S\n]+tests[^\S\n]+(\d+)[^\S\n]*$/gm;
  const t = tail.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  for (let m = rx.exec(t); m; m = rx.exec(t)) n = Number(m[1]);
  return n;
}
// Read only on the tests-0 path, so a normal run pays nothing. git failing, or no repository, is
// "unknown", never "none": the FAIL stands.
const NO_TEST_YET = 'no test file in this project yet (git ls-files finds none) - the step is judged once the first test file is committed';
const TEST_SHAPED = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[^/]+$/;
function noTestFiles(root) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return false;
  return !r.stdout.split('\0').some((f) => f && TEST_SHAPED.test(f));
}
function runStep(step, root, quiet) {
  const t0 = Date.now();
  const done = (status) => ({ name: step.name, cmd: step.cmd, exitCode: status === null ? 1 : status, durationMs: Date.now() - t0 });
  if (step.file) return done(spawnSync(step.file, step.args, { stdio: quiet ? 'ignore' : 'inherit', cwd: root }).status);
  // On Windows the command reaches cmd intact, in Node's own shell form (cmd /d /s /c "<command>",
  // arguments verbatim). cmd /c under Node's default argument quoting turned every inner " into \",
  // which cmd passes through, so a quoted test glob matched no file. The POSIX branch is unchanged.
  const win = process.platform === 'win32';
  const [sh, args] = win ? ['cmd', ['/d', '/s', '/c', `"${step.shell}"`]] : ['sh', ['-lc', step.shell]];
  const opts = { cwd: root, windowsVerbatimArguments: win };
  const io = quiet ? 'ignore' : 'inherit';
  if (!NODE_TEST.test(step.shell)) return done(spawnSync(sh, args, Object.assign({ stdio: io }, opts)).status);
  return new Promise((resolve) => {
    let tail = '';
    const child = spawn(sh, args, Object.assign({ stdio: [io, 'pipe', io] }, opts));
    child.stdout.on('data', (b) => { if (!quiet) process.stdout.write(b); tail = (tail + b.toString('utf8')).slice(-65536); });
    child.on('error', () => resolve(done(1)));
    child.on('close', (code) => { // a signal leaves code null, which fails like the sync path
      if (code !== 0 || testsRun(tail) !== 0) return resolve(done(code));
      if (noTestFiles(root)) return resolve(Object.assign(done(0), { skip: NO_TEST_YET }));
      if (!quiet) process.stdout.write(`${RED}FAIL the runner ran 0 tests: node --test found no test file - check the pattern in: ${step.cmd}${RESET}\n`);
      return resolve(done(1));
    });
  });
}
```

**Edit 3 (required): the step call and its verdict in the task loop.** Find these lines, from the step call through the task's stop-on-first-failure line:

```js
      const r = runStep(s, root, quiet);
      ran.push(r);
      if (r.exitCode !== 0) { code = r.exitCode; break; }
    }
    const durationMs = Date.now() - t0;
    if (code !== 0) failed = true;
    if (!quiet) process.stdout.write(code === 0 ? `${GREEN}OK ${t.label} (${(durationMs / 1000).toFixed(1)}s)${RESET}\n` : `${RED}FAIL ${t.label} (exit ${code}, ${(durationMs / 1000).toFixed(1)}s)${RESET}\n`);
    results.push({ id: t.id, label: t.label, lanes: t.lanes.slice(), requires: (t.requires || []).slice(), verdict: code === 0 ? 'pass' : 'fail', skipReason: null, durationMs, exitCode: code, steps: ran });
    if (code !== 0) break; // stop on first failure, as before
```

Replace them with:

```js
      const r = await runStep(s, root, quiet);
      ran.push(r);
      if (r.skip) continue; // no test file yet: judged below, never a pass
      if (r.exitCode !== 0) { code = r.exitCode; break; }
    }
    const durationMs = Date.now() - t0;
    // A step skipped for "no test file yet" makes the task a skip; in the release lane it is a
    // required check that did not run, which fails it - the same rule as an unmet requirement.
    const skipped = code === 0 ? ran.find((x) => x.skip) || null : null;
    verdict = code !== 0 ? 'fail' : !skipped ? 'pass' : requiredSkipIsFailure(lane) ? 'fail' : ran.every((x) => x.skip) ? 'skip' : 'pass';
    if (verdict === 'fail') failed = true;
    if (!quiet) process.stdout.write(code !== 0 ? `${RED}FAIL ${t.label} (exit ${code}, ${(durationMs / 1000).toFixed(1)}s)${RESET}\n`
      : verdict === 'fail' ? `${RED}FAIL required check did not run: ${skipped.skip}${RESET}\n`
      : skipped ? `${DIM}SKIP [${skipped.name}] ${skipped.skip}${RESET}\n${verdict === 'pass' ? `${GREEN}OK ${t.label} (${(durationMs / 1000).toFixed(1)}s)${RESET}\n` : ''}`
      : `${GREEN}OK ${t.label} (${(durationMs / 1000).toFixed(1)}s)${RESET}\n`);
    results.push({ id: t.id, label: t.label, lanes: t.lanes.slice(), requires: (t.requires || []).slice(), verdict, skipReason: skipped ? skipped.skip : null, durationMs, exitCode: verdict === 'fail' && code === 0 ? 1 : code, steps: ran });
    if (verdict === 'fail') break; // stop on first failure, as before
```

**Edit 4 (required): the start of the command-line block.** Find this line:

```js
if (require.main === module) {
```

Replace it with:

```js
if (require.main === module) (async () => {
```

**Edit 5 (required): the end of the command-line block.** Find these lines, just above `module.exports`:

```js
  process.exit(failed ? 1 : 0);
}

module.exports = {
```

Replace it with:

```js
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write(`verify-local: failed closed - ${e && e.message ? e.message : e}\n`); process.exit(1); });

module.exports = {
```

**Edit 6 (optional): the docker_leg reader.** Find this line:

```js
function atomicWrite(p, text) {
```

Replace it with:

```js
// docker_leg is derived at calibration from the ship targets (calibration-core.json) and recorded
// in project-config.md; it is read here at run time through the read ledger's config reader - one
// reader, never a second parser. false: the release lane is native-only. Absent, unfilled or
// unreadable: the Linux leg runs as before, and the lane says so once.
function dockerLeg(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, 'project-config.md'), 'utf8'); } catch (_) { return { value: null, why: 'project-config.md is unreadable' }; }
  let read = null;
  try { read = require(path.join(__dirname, 'lib', 'read-ledger.cjs')).readConfigValue; } catch (_) { read = null; }
  if (typeof read !== 'function') return { value: null, why: 'scripts/lib/read-ledger.cjs has no config reader' };
  const v = read(text, 'docker_leg');
  if (v === 'true' || v === 'false') return { value: v === 'true', why: null };
  return { value: null, why: v === null ? 'no docker_leg value in project-config.md' : `docker_leg "${v}" is neither true nor false` };
}

function atomicWrite(p, text) {
```

**Edit 7 (optional): reading docker_leg once per run.** Find this line:

```js
  const availability = {};
```

Replace it with:

```js
  const docker = selected.some((t) => t.id === 'linux') ? dockerLeg(root) : null;
  if (!quiet && docker && docker.value === null) process.stdout.write(`${DIM}note docker_leg not read (${docker.why}) - the Linux leg runs as before${RESET}\n`);
  const availability = {};
```

**Edit 8 (optional): the Linux leg skipped on docker_leg false.** Find this line:

```js
    if (t.id === 'linux' && process.env.VERIFY_SKIP_LINUX === '1') { skip = 'VERIFY_SKIP_LINUX=1 - the emergency skip, logged here; never routine'; verdict = 'skip'; }
```

Replace it with:

```js
    if (t.id === 'linux' && docker && docker.value === false) { skip = 'docker_leg: false in project-config.md - this project ships to no Linux target, so the release lane is native-only'; verdict = 'skip'; }
    else if (t.id === 'linux' && process.env.VERIFY_SKIP_LINUX === '1') { skip = 'VERIFY_SKIP_LINUX=1 - the emergency skip, logged here; never routine'; verdict = 'skip'; }
```

After the edits:

- Change the file's `// @kit-version 1.0.6` line to the new release's version, so the drift report stops naming the file.
- `.githooks/pre-commit`, the other bootstrap-filled file, needs only its version line raised; nothing else in it changed.
- On Node 20 and 22 the lanes now print the runner's TAP output instead of its spec output, because the runner's stdout is now a pipe that `verify-local` reads for the test count. Node 23 and later print spec either way.
- For edits 6 to 8 (optional), also run `node scripts/kit-update.cjs --apply scripts/lib/read-ledger.cjs` (a kit-managed copy, which `--apply` restores), and add the row `| docker_leg | false | true when a ship target is linux or server-class, false otherwise |` to the Active toggles table in `project-config.md`. Without the row, the Linux leg runs as before and the release lane says so once.
- Check it: `node scripts/verify-local.cjs --lane stage` prints `tests <N>` with your real count, and a planted failing test makes it exit non-zero.

## v1.0.6 - 2026-09-07

The documentation realignment on the cold-start patch, superseded by v1.0.7. No code or interface changes.

- **Capabilities.** Everything in v1.0.5. Every user-facing document re-run against v1.0.5 as shipped, describing the Full path only, with every count on a shipped surface pinned to its machine source; two lines of substance moved (the `.claude/` template README's playbook path per layout, QUICKSTART's troubleshooting pointer); the doc check restored as mechanism - a ritual change names the documents it touches, the cut waits on a derived doc-loop record, and the documentation checklist ships in the tree.
- **Limitations.** Unchanged from v1.0.5: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Two independent verifier rounds with the calibration self-test at zero false negatives in both, every landed document reconstructed against the live code, every re-pointed check mutation-tested on verifier-built fixtures, the release verification lane green once on the cut's head.

## v1.0.5 - 2026-09-01

The cold-start patch on the GA release, superseded by v1.0.6. No interface changes to the build loop. This patch closes what the first fresh bootstrap on the previous release and a real multi-milestone build surfaced: the install story, the opening ceremony, the cost of starting a session, and the handoff between the two terminals.

- **Capabilities.** Everything in v1.0.4, plus:
  - One-file install and upgrade: `sbak-install.cjs`, attested beside the ZIP, drives the whole install from inside `claude` - checksum and attestation verified, blast radius disclosed, its questions one step at a time each answered by the word that names the action, nothing written before your word, a real `CLAUDE.md` combined through one import line rather than replaced; the same command upgrades an installed kit and keeps what you modified; the bootstrap-filled files (the pre-commit hook and `verify-local`) stay at the installed version and are named - migrate them by hand until `kit-update --migrate` lands. The signed ZIP stays the manual path.
  - The bootstrap opens on what you want to build: the operating mode is inferred from that answer and the risk posture derives from the spec, shown as one acceptance line. The boot-time ceremony that a read-only audit of every ritual could not tie to a named failure is gone.
  - Lazy orientation: the session-start stamp stays eager and a stampless session fails loud, while the reading list loads at its own moment with each read recorded; the red-approval refuses a stage whose required reads were never recorded.
  - A file-based channel between the orchestrator and builder terminals: stage packets and verdicts travel over an append-only log with automatic pickup in both directions; approvals stay the human's keystrokes.
  - Verification lanes in the generated project's floor: `fast` / `stage` / `release` over one registry, an always class, settled marking for closed milestones with an affected-files override, and a union pin; the test estate is reviewed at closeout.
  - The accumulated field findings: the settings deny list names the real `.env` variants and no catch-all (the mandated `.env.example` passes); the retrospective ends in a machine-checked handoff note; the closeout packet leads with deltas-from-plan and the open findings and is validated before it surfaces; the release-state row is required at closeout; the gate manifest is validated.
- **Limitations.** Unchanged from v1.0.4: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Every mechanical change is pinned by the kit's regression suite (the suite that gates releases in the kit's development repo - run on Windows during development and on Linux CI), with the failing check recorded before each fix; the installer was driven by the owner on a real Windows machine before it shipped, and the cut's clean-environment verify drives it again on the published assets, including the POSIX hook-execution leg. Built from a signed tag and published with SLSA Level 2 build provenance covering both the ZIP and the installer.

## v1.0.4 - 2026-08-05

A field-test patch on the GA release. No interface changes. This patch closes what the first real end-to-end adoption surfaced: one new enforcement surface, mechanical support at the session-topology transitions, a regex-construction hardening pass, and the documentation fixes a real user hit.

- **Capabilities.** Everything in v1.0.3, plus:
  - A human-drive floor, both halves: a Full-tier spec must carry the in-real-life / human-in-the-loop plan section (a mandatory prose instruction is now mechanically checked), and the milestone closeout consumes that section - human-typed drive answers are required beside the closeout stamp before the closeout counts. The defect class this closes: a milestone shipping green with no human ever running the app.
  - Sessions self-identify at the topology transitions: the session-start stamp states in plain words what the session is (orchestrator / builder / verifier) plus the checkout topology where derivable; the mode-setting script prints the launch-order line that kills the shared-role-file race; a topology assist reports when the worktree split is available and prints the exact steps.
  - Regex construction across the validator layer is hardened: one shared escape routine, every concatenated pattern site enumerated and conformed, with probes proving a metacharacter payload cannot bend a verdict. The public repository's code-scanning findings were adjudicated in the same pass - two fixed at their true sites, one a documented false positive - and the kit's own scanning now runs the same widened query suite an adopter's default setup runs.
  - Line endings are pinned at the repository root (`.gitattributes`), closing the case where a default Windows clone produced a CRLF working tree and every byte-exact check failed; a Windows CI job now reproduces that exact environment on every push, and that job caught a second Windows-only defect this patch closes: the adopt step now recognizes its own repository when the working path rides an 8.3 short-name alias (the alias and the long form compared as different directories before, and adopt refused to arm the hooks).
  - The documentation fixes a real adoption surfaced: the releases-page download anchor, the two-terminal handoff walkthrough, the worktree-split delivery, the entry README's flow alignment, and the human-stamp wording stating what the stamp actually attests. The scaffold also authors the formatter's ignore fence when a formatter is in the stack, so a whole-tree format run can never silently rewrite kit-managed trees - the field case was 31 files rewritten with zero failure surface.
- **Limitations.** Unchanged from v1.0.3: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Every mechanical change is pinned by the kit's regression suite (the suite that gates releases in the kit's development repo), with the failing check recorded before each fix; the findings driving this patch came from a real adoption run end-to-end, not from an internal review. Built from a signed tag and published with SLSA Level 2 build provenance.

## v1.0.3 - 2026-08-01

A hardening patch on the GA release. No new features and no interface changes: the documentation brought to consistency in one pass against final behavior, and the release chain plus the enforcement layer hardened.

- **Capabilities.** Everything in v1.0.2, plus the hardening:
  - Every release-version literal in checks and shipped pages is derived from one root (the release manifest), and a sweep fails the build on a stale version literal in a live-claim position - the defect class that once let an old version ride through three releases in a shipped page.
  - Require resolution is verified across the assembled tree before a tag is cut, including dynamically composed requires and files that execute both at their staged position and at their rendered path - the packaging defect class that reached the public CI once now fails pre-tag.
  - A zero-recorded-executions detector: a control with no recorded run is reported rather than presumed effective.
  - The adopt step fails closed at every destination: an unclassified destination row is an install error, never a default.
  - The retired role-file alias is removed; one file is the single role marker.
  - The stage gate's self-approval carve: the gate's own control files (the approval marker, its allow list, the hook settings) are refused to agent edit-tool writes before any allow rule is consulted, so an agent can no longer write its own stage approval. The residual is stated in the hook source: engaged-gate-only, a raised bar rather than a wall.
  - The verifier calibration exam made realistic: all eleven fixtures rewritten as plausible artifacts with neutral filenames, answers held only in a sealed label set, and a leak probe run on the result (eleven of eleven fixtures leaked their defect class by filename before; zero of eleven after).
  - The kit's own regression suite hardened: narrowed section runs now fail loudly when a check's fixture depends on a section the run suppressed - a defect of exactly that class passed on Windows and failed only on Linux CI before the fix.
  - CI and the generated workflows pin actions/checkout v7.0.1, with the emitted pins moved in the same change as the live ones.
- **Limitations.** Unchanged from the GA release: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** The hardening changes are pinned by the kit's regression suite, with the failing check recorded before each fix; the counted claims here (fixture and leak-probe counts) are machine-sourced from those runs. Built from a signed tag and published with SLSA Level 2 build provenance.

## v1.0.2 - 2026-07

**The GA release** - kit content is identical to v1.0.1; this is the attested cut.

- **Capabilities.** Everything in v1.0.1, republished with verified provenance: the calibrated bootstrap (two tiers, four operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, verification lanes over one registry, the self-tested enforcement layer, build receipts, and tag-built artifacts.
- **Limitations.** The honest list is in [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md): no human security audit, no worked example ships, macOS never run, the weight is real on small solo builds.
- **Evidence.** Built from the same signed tag content as v1.0.1 and published with SLSA Level 2 build provenance; `gh attestation verify` resolves on this release's asset. The five GA decision-record properties were each demonstrated by execution, twice (framework gates plus an independent fresh-context verifier).

## v1.0.1 - 2026-07

Published before its attestation ran, then superseded by v1.0.2 (identical kit content). The release stands - the repository's immutable-release protection correctly locked it, so its page cannot be corrected in place - but its body's verification instructions do not work for its own asset. Unsupported; use v1.0.2.

## v1.0.0 - 2026-07

Tagged during release preparation, never published. The public repository's CI caught a packaging defect (a shipped validator whose dependency had no manifest row) before any release page existed; the fix shipped as v1.0.1.

## v0.2.0 - 2026-07

The first release under the name Software Build Assurance Kit: the same kit, renamed and re-cut, with a rebuilt public entry.

- **Capabilities.** The calibrated bootstrap (tiers and operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, the self-tested enforcement layer, evidence receipts, and tag-built provenance-carrying artifacts. New in this release: the entry pages [docs/what-this-is.md](docs/what-this-is.md), [docs/positioning.md](docs/positioning.md), and [docs/limitations.md](docs/limitations.md), plus this changelog.
- **Limitations.** Experimental; interfaces break between 0.x releases; no worked example ships; no human security audit has been performed. The full honest list: [docs/limitations.md](docs/limitations.md).
- **Evidence.** CI runs the kit's enforcement layer against the kit on every push; artifacts are built from a signed tag and carry SLSA Level 2 build provenance; the documentation's counted claims are machine-checked against the code.

## v0.1.0 - 2026-07

The first public cut, under the kit's earlier working name.

- **Capabilities.** The same core at its first published state: the bootstrap interview, the stage loop, the blind verifier, and the enforcement suite.
- **Limitations.** As above, with a thinner entry: the what-this-is / positioning / limitations pages did not yet exist.
- **Evidence.** The same CI self-enforcement and tag-built artifact discipline, at SLSA Level 2.
