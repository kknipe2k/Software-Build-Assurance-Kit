# Changelog

Release history of the Software Build Assurance Kit, in the same shape as the release notes - capabilities, limitations, evidence - never a build diary. Full detail for the current release: [RELEASE-NOTES.md](RELEASE-NOTES.md).

## v1.0.7 - 2026-10-16

**The current release** - the field-repair hotfix on v1.0.6: the gates that passed where they should have failed now fail, proven on the gates a generated project runs on itself; full detail in [RELEASE-NOTES.md](RELEASE-NOTES.md). No interface changes to the build loop.

- **Capabilities.** Everything in v1.0.6. On Windows a project's own test lanes now run its tests: the test command reaches `cmd` intact, and a `node --test` run that finds no test file fails the step - while the project has no test file at all, the step is a named skip, which the release lane still fails. The red gate judges the repository of the file it guards, from any folder, and accepts the release command only in its one approved form. The bootstrap ends with its own commit and one READY line. The installer makes the trunk `main`. `docker_leg: false` gives a native-only release lane. A fresh App-Map passes its own check, and the spec examples land where the examples gate looks.
- **Upgrading a v1.0.6 project.** The upgrade refreshes the kit and leaves the project's own `scripts/verify-local.cjs` at v1.0.6 by design, so the Windows test-lane fix is a manual change: see "Manual change for a v1.0.6 project" below.
- **Limitations.** Unchanged from v1.0.6: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Four independent verifier rounds with the calibration self-test at zero false negatives in each; three hands-on first-run drives; the last round's fixes proven on a real project's own tests (none ran before the fix, all of them after, a planted failure failing every lane and the push) and on a fresh install from the release candidate; every new check mutation-tested; the release verification lane green once on the cut's head.

### Manual change for a v1.0.6 project

**First, upgrade the kit folder.** The edits below assume the new kit is in `sbak/`. Download the new release's `sbak-install.cjs` into your project folder, start `claude` there, type `sbak-install`, and answer `upgrade` (the same command as the install). The upgrade refreshes `sbak/` and the kit-managed scripts, `scripts/kit-update.cjs` and `scripts/lib/read-ledger.cjs` among them. It leaves `scripts/verify-local.cjs` at v1.0.6 by design. Then make edits 1 to 5 by hand. With the new kit in place, the `--apply` step for edits 6 to 8 takes the new reader.

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
