#!/usr/bin/env node
// @kit-version 1.0.10
// scripts/lib/evidence.cjs
//   (kit source of truth: templates/scripts/lib/evidence.cjs)
//
// THE EVIDENCE PATH (M34.6.B, R-139): one stage's acceptance evidence as records a later reader can
// check, on one host (Claude Code at the version floor), one runner adapter (node --test through
// scripts/verify-local.cjs) and one transport (the stage commit). Every record lives under
// .claude/evidence/<stage>/ and names its SUBJECT: the sha256 over the index's "<path>\t<blob>"
// lines, sorted bytewise, excluding the prefixes in EXCLUDED_PREFIXES - the ONE list, read by every
// writer and reader here. The exclusion is what lets a record describe the tree it rides in without
// describing itself. The subject is the INDEX (what the commit will carry); every subject-bearing
// writer refuses while the working tree differs from the index outside the excluded prefixes, so the
// bytes tested are the bytes named (gate-1 ruling Q2, orchestrator seq 211).
//
// THE RECORD RULE (R-133). Seven records are required: stage_opened (the lifecycle's `opened`),
// gate_probed liveness (`probed`), red_approved, tests_run RED, tests_run GREEN, lane_run and
// gate.json, with stage_cleared (`cleared`) checked at the next open. Their writers refuse when they
// cannot write, and the boundaries that read them refuse when they are absent or contradictory: the
// release, the stage-end publish, the pre-commit, the transport check and the closeout check.
// Fail-soft is reversed for these and nothing else; every other record (gate_judged, the host row,
// the channel's refusal rows, the lane history) is diagnostic and degrades visibly.
//
// THE CUT-OVER (gate-1 Q1). A stage is on the evidence path when its lifecycle carries an `opened`
// row (only stage-active.cjs writes it, from this release), or when its stage-open channel row says
// `evidence: 1` (the deletion guard). Any other stage is legacy: every boundary judges it as it did
// before this path existed and prints LEGACY_LINE. Outside a git repository the open writes no lifecycle (no index, no
// subject), so the stage is legacy by that rule.
//
// THE CHALLENGE (M34.6.C). Every tests_run record names its platform, and on win32 a RED whose only
// failures are file-level rows with no signal is cancelled_or_load, which the release refuses naming
// both readings (item 1). The stage-end publish refuses a changed path outside the stage's allowed set
// unless the packet names it on an out-of-scope: line (item o; paths, never contents). review()
// renders a stage's bundle for the orchestrator's bounded review and writes nothing. The records are
// checked against each other and the commit, never against their author: a record rewritten together
// with its manifest hash by someone who can write the repository passes --verify (the local trust
// boundary, P7).
//
// Dependency-free Node; git on PATH. Lazily requires channel.cjs, receipts.cjs and read-ledger.cjs
// beside it (channel.cjs requires this file for the stage end; the lazy require keeps the two from
// loading each other at module top).

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const EXCLUDED_PREFIXES = Object.freeze(['.claude/evidence/', '.claude/channel/', 'retrospectives/']);
const EVIDENCE_REL = '.claude/evidence';
const PREFIX_ROWS = Object.freeze(['opened', 'probed', 'red_approved']);
const PROBE_SESSION = 'sbak-probe';
const STAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SUBJECT_RE = /^sha256:[0-9a-f]{64}$/;
const NUL = String.fromCharCode(0);
const ZERO_SHA = /^0+$/;
const KIT_VERSION = (() => { try { const m = /@kit-version (\S+)/.exec(fs.readFileSync(__filename, 'utf8').slice(0, 400)); return m ? m[1] : null; } catch (_) { return null; } })();

const LEGACY_LINE = (id) => `evidence: stage ${id} opened before the evidence path - no evidence required, none written`;
const UNSTAGED_LINE = (prefix, p) => `${prefix} - ${p} differs from the index (unstaged or untracked); the subject is the index: git add it, or remove it`;

// ---------------------------------------------------------------------------
// git, hashing, the exclusion rule, the subject
// ---------------------------------------------------------------------------
function git(root, args, o) {
  const opts = o || {};
  const r = spawnSync('git', args, { cwd: root, encoding: opts.buffer ? undefined : 'utf8', input: opts.input, maxBuffer: 512 << 20, stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true });
  return { ok: r.status === 0 && !r.error, status: r.status, out: r.stdout === null || r.stdout === undefined ? '' : r.stdout, err: String(r.stderr || '').trim().split(/\r?\n/)[0] || (r.error ? String(r.error.message) : '') };
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const isExcluded = (rel) => EXCLUDED_PREFIXES.some((p) => rel.startsWith(p));
const fwd = (p) => String(p).split(path.sep).join('/');
// The subject of a list of [path, blob] entries: excluded prefixes dropped, sorted bytewise.
function subjectOf(entries) {
  const kept = entries.filter(([p]) => !isExcluded(p));
  kept.sort((a, b) => Buffer.compare(Buffer.from(a[0], 'utf8'), Buffer.from(b[0], 'utf8')));
  return 'sha256:' + sha256(Buffer.from(kept.map(([p, b]) => `${p}\t${b}\n`).join(''), 'utf8'));
}
// The candidate's subject: the index (stage-0 entries). -> { subject } | { error }
function subject(root) {
  const r = git(root, ['ls-files', '-s', '-z']);
  if (!r.ok) return { error: `git ls-files failed: ${r.err}` };
  const entries = [];
  for (const e of String(r.out).split(NUL)) {
    if (!e) continue;
    const m = /^(\d+) ([0-9a-f]{40,64}) (\d)\t([\s\S]+)$/.exec(e);
    if (!m) return { error: `an index entry git printed cannot be read: ${e.slice(0, 80)}` };
    if (m[3] !== '0') return { error: `${m[4]} is unmerged in the index` };
    entries.push([m[4], m[2]]);
  }
  return { subject: subjectOf(entries) };
}
// A commit's (or any tree-ish's) subject, by the same rule. -> { subject } | { error }
function subjectOfTree(root, rev) {
  const r = git(root, ['ls-tree', '-r', '-z', '--full-tree', rev]);
  if (!r.ok) return { error: `git ls-tree ${rev} failed: ${r.err}` };
  const entries = [];
  for (const e of String(r.out).split(NUL)) {
    if (!e) continue;
    const m = /^\d+ \w+ ([0-9a-f]{40,64})\t([\s\S]+)$/.exec(e);
    if (!m) return { error: `a tree entry git printed cannot be read: ${e.slice(0, 80)}` };
    entries.push([m[2], m[1]]);
  }
  return { subject: subjectOf(entries) };
}
// The first path where the working tree differs from the index outside the excluded prefixes (an
// unstaged change, a deletion, or an untracked file that is not ignored), or null. -> { path } | { error } | {}
function indexDiff(root) {
  const r = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!r.ok) return { error: `git status failed: ${r.err}` };
  const parts = String(r.out).split(NUL);
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const x = e[0]; const y = e[1]; const rel = e.slice(3);
    if (x === 'R' || x === 'C') i++; // the source path follows
    if (isExcluded(rel)) continue;
    if ((x === '?' && y === '?') || y !== ' ') return { path: rel };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Records: whole JSON files (written to .tmp and renamed) and one-line ledgers.
// ---------------------------------------------------------------------------
function stageDir(root, stage) { return path.join(root, ...EVIDENCE_REL.split('/'), stage); }
function relOf(root, file) { return fwd(path.relative(root, file)); }
// A required record, whole or not at all: .tmp beside it, then the rename. Throws with the errno.
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
// One row, one line with its newline; a torn tail gets its newline first (the receipts sink's rule).
function appendRow(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let prefix = '';
  try { const st = fs.statSync(file); if (st.size > 0) { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1); try { fs.readSync(fd, b, 0, 1, st.size - 1); } finally { fs.closeSync(fd); } if (b[0] !== 0x0a) prefix = '\n'; } } catch (_) { /* fresh */ }
  fs.appendFileSync(file, prefix + JSON.stringify(row) + '\n');
}
// The one reader: a final line with no newline is a partial row, skipped and named.
// -> { rows, notes: [line], exists }
function readRows(file, rel) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return { rows: [], notes: [], exists: false }; }
  const lines = text.split('\n');
  const rows = []; const notes = [];
  const last = lines.length - 1; // '' when the file ends with a newline
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, '');
    if (!l.trim()) continue;
    if (i === last) { notes.push(`partial row at ${rel}:${i + 1}`); continue; }
    try { const j = JSON.parse(l); if (j && typeof j === 'object') rows.push(j); else notes.push(`unreadable row at ${rel}:${i + 1}`); } catch (_) { notes.push(`unreadable row at ${rel}:${i + 1}`); }
  }
  return { rows, notes, exists: true };
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }
const compactAt = (at) => String(at || new Date().toISOString()).replace(/[-:.]/g, '');
// A second record of one kind keeps the newest under the canonical name; the older moves aside as
// <name>.<at>.json, which the manifest lists with superseded_by.
function supersede(file) {
  if (!fs.existsSync(file)) return null;
  const old = readJson(file);
  const aside = file.replace(/\.json$/, `.${compactAt(old && old.at)}.json`);
  fs.renameSync(file, fs.existsSync(aside) ? aside.replace(/\.json$/, `-${process.pid}.json`) : aside);
  return aside;
}

// ---------------------------------------------------------------------------
// The lifecycle and the cut-over
// ---------------------------------------------------------------------------
function lifeFile(root, stage) { return path.join(stageDir(root, stage), 'lifecycle.jsonl'); }
function lifeRows(root, stage) { return readRows(lifeFile(root, stage), `${EVIDENCE_REL}/${stage}/lifecycle.jsonl`); }
function appendLife(root, stage, row, extra) { appendRow(lifeFile(root, stage), Object.assign({ v: 1, row, stage, at: new Date().toISOString() }, extra || {})); }
// The stage-open row this tree's builder log carries for the stage with evidence: 1 (the deletion
// guard), read plainly: the guard needs the flag, not the log's integrity check.
function guardRow(root, stage) {
  let text;
  try { text = fs.readFileSync(path.join(root, '.claude', 'channel', 'builder-to-orch.jsonl'), 'utf8'); } catch (_) { return null; }
  let found = null;
  for (const l of text.split('\n')) {
    if (!l.trim() || l.indexOf('"stage-open"') === -1) continue;
    try { const m = JSON.parse(l); if (m && m.class === 'stage-open' && m.stage === stage && m.evidence === 1) found = m; } catch (_) { /* not ours */ }
  }
  return found;
}
// -> { onPath, legacy, rows, notes, guard (the stage-open row or null), lifeExists }
function stageState(root, stage) {
  const lr = lifeRows(root, stage);
  const mine = lr.rows.filter((r) => r.stage === stage);
  const opened = mine.some((r) => r.row === 'opened');
  const guard = guardRow(root, stage);
  return { onPath: opened || !!guard, legacy: !opened && !guard, rows: mine, allRows: lr.rows, notes: lr.notes, guard, lifeExists: lr.exists };
}

// ---------------------------------------------------------------------------
// tests_run: the node --test adapter (TAP), the classifier, the record
// ---------------------------------------------------------------------------
const NODE_TEST = /\bnode(?:\.exe)?"?\s+(?:\S+\s+)*?--test(?=\s|$)/;
// The reporter pair inserted after --test, when the command names no reporter of its own: spec on
// stdout (the floor node's default, which the tests-0 guard reads) and tap to the given file.
function adaptCommand(command, tapFile) {
  if (!NODE_TEST.test(command) || /--test-reporter\b/.test(command)) return null;
  const q = JSON.stringify(tapFile);
  return command.replace(/(--test)(?=\s|$)/, `$1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=${q}`);
}
// The TAP stream as entries: { depth, ok, n, name, yaml: { key: value } }, and the plan's counts.
function parseTap(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const entries = []; const counts = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const c = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/.exec(l);
    if (c) { counts[c[1]] = Number(c[2]); continue; }
    const m = /^((?: {4})*)(not ok|ok) (\d+) - (.*?)(?: # (?:SKIP|TODO)\b.*)?$/.exec(l);
    if (!m) continue;
    const depth = m[1].length / 4;
    const yaml = {};
    if (lines[i + 1] !== undefined && lines[i + 1].trim() === '---') {
      for (let j = i + 2; j < lines.length; j++) {
        const y = lines[j];
        if (y.trim() === '...') { i = j; break; }
        const kv = /^\s{2,}([A-Za-z_]+): (.*)$/.exec(y);
        if (kv && y.length - y.trimStart().length === m[1].length + 2) yaml[kv[1]] = kv[2].replace(/^'(.*)'$/, '$1');
      }
    }
    entries.push({ depth, ok: m[2] === 'ok', n: Number(m[3]), name: m[4].replace(/\\#/g, '#'), yaml });
  }
  return { entries, counts };
}
// The failing leaves (a failing entry with no failing child), each labelled with its parents' names.
function failingLeaves(entries) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.ok || e.yaml.failureType === 'subtestsFailed') continue;
    // children precede their parent in TAP: the run of deeper entries right before this one
    let hasFailingChild = false;
    for (let k = i - 1; k >= 0 && entries[k].depth > e.depth; k--) if (entries[k].depth === e.depth + 1 && !entries[k].ok) hasFailingChild = true;
    if (hasFailingChild) continue;
    const names = [e.name]; let d = e.depth;
    for (let k = i + 1; k < entries.length && d > 0; k++) if (entries[k].depth === d - 1) { names.unshift(entries[k].name); d--; }
    out.push({ label: names.join(' > '), error: e.yaml.name || e.yaml.code || 'unknown', yaml: e.yaml });
  }
  return out;
}
const isAssertion = (y) => y.code === 'ERR_ASSERTION' || y.name === 'AssertionError';
const fileLevel = (y) => /^-?\d+$/.test(String(y.exitCode || ''));
const hasSignal = (y) => y.signal !== undefined && y.signal !== '~' && y.signal !== 'null' && y.signal !== '';
// M34.6.C item 1: on win32 a killed test process and a test file that fails to load reach
// node --test as one TAP shape, a file-level row with exit code 1 and no signal. A run whose only
// failures are such rows, with no test-level row before the first of them, is cancelled_or_load there.
// POSIX keeps the signal on the row, so nothing changes off win32.
function winCancelledOrLoad(tap) {
  const first = tap.entries.findIndex((e) => !e.ok);
  if (first === -1) return false;
  if (!tap.entries.filter((e) => !e.ok).every((e) => fileLevel(e.yaml) && !hasSignal(e.yaml))) return false;
  return !tap.entries.slice(0, first).some((e) => !fileLevel(e.yaml));
}
// Worst first (gate-1 Q3; M34.6.C item 1): cancelled, zero_tests, timeout, cancelled_or_load (win32 only),
// import_or_config, test_error, assertion. `platform` is the host the run happened on.
function classify(run, tap, platform) {
  if (run.signal || run.exitCode === null) return 'cancelled';
  const failing = tap.entries.filter((e) => !e.ok);
  if (failing.some((e) => hasSignal(e.yaml))) return 'cancelled';
  if (tap.counts.tests === 0) return 'zero_tests';
  if (failing.some((e) => e.yaml.failureType === 'testTimeoutFailure')) return 'timeout';
  if ((platform || process.platform) === 'win32' && winCancelledOrLoad(tap)) return 'cancelled_or_load';
  if (failing.some((e) => fileLevel(e.yaml))) return 'import_or_config';
  const leaves = failingLeaves(tap.entries);
  if (leaves.some((f) => !isAssertion(f.yaml))) return 'test_error';
  if (leaves.length) return 'assertion';
  return run.exitCode === 0 ? null : 'test_error';
}
function depsOf(root) {
  for (const f of ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb']) {
    try { return { file: f, sha256: sha256(fs.readFileSync(path.join(root, f))) }; } catch (_) { /* next */ }
  }
  return { none: 'no lockfile at the project root' };
}
// The approved set as the release will compute it (gate-1 Q5): the channel library's RED set, each
// file with its sha256. -> [{ path, sha256 }] | null (git could not list)
function approvedSet(root) {
  const ch = require(path.join(__dirname, 'channel.cjs'));
  const set = ch.redSet(root);
  if (set === null) return null;
  return set.map((p) => { let s = null; try { s = sha256(fs.readFileSync(path.join(root, ...p.split('/')))); } catch (_) { s = null; } return { path: p, sha256: s }; }).filter((x) => x.sha256);
}
const lastLine = (t) => { const l = String(t || '').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return l.length ? l[l.length - 1].slice(0, 200) : ''; };
// M34.6.F item 9: the tests' node is the node the test command's own shell resolves, never the node
// running this driver. `node --version` runs the way the command runs: shellFor(line) returns
// [file, args, spawn options] (sh -lc on POSIX, cmd /d /s /c on win32), in the same directory and
// environment. -> { node: 'v...' | null, measured: what was measured, in words }
function testsNode(root, command, shellFor) {
  const { spawnSync } = require('child_process');
  const [file, args, o] = shellFor('node --version');
  const how = `node --version through ${[file].concat(args.slice(0, -1)).join(' ')}, the test command's own shell, PATH and directory`;
  let r = null; try { r = spawnSync(file, args, Object.assign({ cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }, o || {})); } catch (e) { r = { error: e }; }
  const v = r && !r.error && r.status === 0 ? lastLine(r.stdout) : '';
  if (!/^v\d+\.\d+\.\d+\S*$/.test(v)) return { node: null, measured: `${how} printed no version (${r && r.error ? (r.error.code || r.error.message) : `exit ${r ? r.status : 'none'}`}); the tests' node is unknown` };
  const runsNode = /^\s*node(?:\.exe)?(?:\s|$)/i.test(String(command || ''));
  return { node: v, measured: runsNode ? how : `${how}; the command does not start with node, so this is the node on its PATH, not one its tests are known to run under` };
}
// config_drift, RED against GREEN: the tests' node (runner.node) and the lockfile. A tests' node that
// printed no version on either side is node_unknown, never a drift between versions (M34.6.F C1); the
// driver's node (runner.driver_node) is never compared. -> null | { node?, node_unknown?, deps? }
function configDrift(red, green) {
  if (!red || !green) return null;
  const out = {};
  if (red.runner && green.runner) {
    const rn = red.runner.node || null; const gn = green.runner.node || null;
    if (!rn || !gn) out.node_unknown = { red: rn, green: gn };
    else if (rn !== gn) out.node = { red: rn, green: gn };
  }
  if (red.deps && green.deps && (red.deps.sha256 || null) !== (green.deps.sha256 || null)) out.deps = { red: red.deps.sha256 || null, green: green.deps.sha256 || null };
  return Object.keys(out).length ? out : null;
}
// run: { command, exitCode, signal, stdout, tap (text or null), adapter: 'node-test'|'none', reason?,
// subject, testsNode? (testsNode()'s result) }. Writes .claude/evidence/<stage>/tests_run.<kind>.json.
// -> { file, rec } ; throws on write.
function recordTestsRun(root, stage, kind, run) {
  const rec = {
    schema: 'sbak/tests-run/v1', stage, kind, at: new Date().toISOString(),
    head: (String(git(root, ['rev-parse', 'HEAD']).out || '').trim() || null), subject: run.subject,
    command_sha256: sha256(Buffer.from(run.command, 'utf8')), exit_code: run.exitCode, signal: run.signal || null, adapter: run.adapter,
    platform: process.platform, // M34.6.C item 1: the classes a run can take depend on the host
  };
  if (run.adapter === 'node-test') {
    const tap = parseTap(run.tap);
    const c = tap.counts;
    rec.counts = { pass: c.pass || 0, fail: c.fail || 0, cancelled: c.cancelled || 0, skipped: c.skipped || 0, todo: c.todo || 0, total: typeof c.tests === 'number' ? c.tests : 0 };
    const leaves = failingLeaves(tap.entries);
    const fileFailures = tap.entries.filter((e) => !e.ok && fileLevel(e.yaml) && !leaves.some((x) => x.label === e.name));
    rec.failing = leaves.map((f) => f.label).concat(fileFailures.map((e) => e.name)).filter((v, i, a) => a.indexOf(v) === i);
    rec.failing_errors = leaves.map((f) => f.error).concat(fileFailures.map((e) => e.yaml.code || 'unknown')).slice(0, rec.failing.length);
    rec.classified = classify(run, tap, rec.platform);
  } else {
    rec.last_line = lastLine(run.stdout);
    rec.unsupported = 'unsupported runner: labels not read';
    if (run.reason) rec.adapter_reason = run.reason;
    rec.classified = run.signal || run.exitCode === null ? 'cancelled' : run.exitCode === 0 ? null : 'unclassified';
  }
  // runner.node is the tests' node, as the caller measured it through the test command's shell;
  // runner.driver_node is the node running this script, kept apart and never compared (M34.6.F item 9)
  const tn = run.testsNode || { node: null, measured: 'not measured: the caller named no test shell' };
  rec.runner = { name: run.adapter === 'node-test' ? 'node --test' : null, node: tn.node, node_measured: tn.measured, driver_node: process.version, reporter: run.adapter === 'node-test' ? 'spec on stdout, tap to a file' : 'the command\'s own' };
  rec.deps = depsOf(root);
  if (kind === 'red') rec.approved_set = approvedSet(root) || [];
  const file = path.join(stageDir(root, stage), `tests_run.${kind}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  supersede(file);
  writeJson(file, rec);
  return { file, rec };
}
// lane: { lane, verdict, durationMs, taskCount, counts, subject }. -> { file, rec } ; throws on write.
function recordLaneRun(root, stage, lane) {
  const rec = {
    schema: 'sbak/lane-run/v1', stage, lane: lane.lane, verdict: lane.verdict, duration_ms: lane.durationMs, task_count: lane.taskCount,
    counts: lane.counts, subject: lane.subject, head: (String(git(root, ['rev-parse', 'HEAD']).out || '').trim() || null), at: new Date().toISOString(),
  };
  const file = path.join(stageDir(root, stage), 'lane_run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  supersede(file);
  writeJson(file, rec);
  return { file, rec };
}
// The refusal line for a required record that could not be written.
function writeFailLine(root, file, e) { return `evidence: refused - ${relOf(root, file)} cannot be written: ${(e && e.code) || 'error'} (${String((e && e.message) || e).split('\n')[0].slice(0, 160)})`; }

// ---------------------------------------------------------------------------
// The release's binding (item 3): RED bound to the approved set.
// -> { legacy: true } | { ok: true, sha, subject, line? } | { ok: false, cause, repair }
// ---------------------------------------------------------------------------
function redBinding(root, stage, releaseSet) {
  const st = stageState(root, stage);
  if (st.legacy) return { legacy: true };
  const vl = `node scripts/verify-local.cjs --stage ${stage} --subject red`;
  const fix = `fix the RED, then ${vl}`;
  if (!st.lifeExists) return { ok: false, cause: `stage ${stage} opened on the evidence path (stage-open seq ${st.guard ? st.guard.seq : '?'}) and ${EVIDENCE_REL}/${stage}/lifecycle.jsonl is missing`, repair: 'ask the orchestrator: the stage\'s evidence was removed' };
  const file = path.join(stageDir(root, stage), 'tests_run.red.json');
  let bytes;
  try { bytes = fs.readFileSync(file); } catch (_) { return { ok: false, cause: `no tests_run.red.json for ${stage}`, repair: vl }; }
  let rec = null; try { rec = JSON.parse(bytes.toString('utf8')); } catch (_) { rec = null; }
  if (!rec || rec.stage !== stage || rec.kind !== 'red') return { ok: false, cause: `tests_run.red.json does not name a RED run of ${stage}`, repair: vl };
  const want = new Map((releaseSet || []).map((f) => [f.path, f.sha256]));
  const got = new Map((Array.isArray(rec.approved_set) ? rec.approved_set : []).map((f) => [f.path, f.sha256]));
  for (const [p, s] of want) {
    if (!got.has(p)) return { ok: false, cause: `the RED record is for a different set: ${p} is not in the RED record`, repair: vl };
    if (got.get(p) !== s) return { ok: false, cause: `the RED record is for a different set: ${p} changed since the RED run`, repair: vl };
  }
  for (const p of got.keys()) if (!want.has(p)) return { ok: false, cause: `the RED record is for a different set: ${p} is in the RED record and not in the RED set`, repair: vl };
  if (rec.adapter === 'none') {
    if (rec.classified === 'cancelled') return { ok: false, cause: 'the RED record is classified cancelled (a signal exit), not a failing run', repair: fix };
    if (rec.exit_code === 0) return { ok: false, cause: 'the RED run exited 0: a RED fails', repair: fix };
    return { ok: true, sha: sha256(bytes), subject: rec.subject, line: 'release: labels not read (adapter: none) - the orchestrator\'s judgment carries the label check' };
  }
  if (rec.classified === 'test_error') {
    const i = (rec.failing_errors || []).findIndex((x) => x !== 'AssertionError' && x !== 'ERR_ASSERTION');
    return { ok: false, cause: `the RED fails on ${(rec.failing_errors || [])[i] || 'an error'} at ${(rec.failing || [])[i] || 'a test'}, not an assertion: make the test assert`, repair: fix };
  }
  // M34.6.C item 1: both readings named, both repairs given
  if (rec.classified === 'cancelled_or_load') return { ok: false, cause: 'the RED record is classified cancelled_or_load (on win32 a killed test process and a test file that fails to load both report exit code 1 with no signal, so the run cannot be read as either)', repair: `make the test fail by an assertion, or run the RED on a POSIX host; then ${vl}` };
  if (rec.classified !== 'assertion') return { ok: false, cause: `the RED record is classified ${rec.classified}, not assertion`, repair: fix };
  if (!Array.isArray(rec.failing) || rec.failing.length === 0) return { ok: false, cause: 'the RED record names no failing test', repair: fix };
  return { ok: true, sha: sha256(bytes), subject: rec.subject };
}

// ---------------------------------------------------------------------------
// The gate's judgments (item 8) and the channel's refusals (item 9), summarized and resolved.
// ---------------------------------------------------------------------------
const identityOf = (r) => (typeof r.tool_use_id === 'string' ? `host:${r.tool_use_id}` : Number.isInteger(r.hook_seq) ? `seq:${r.hook_seq}` : 'unidentified');
function resolvedLines(body, kind) {
  const out = new Map();
  const re = kind === 'channel' ? /^resolved:channel:(\d+)[^\S\n]+(\S.*)$/gm : /^resolved:((?:host|seq):[^\s]+)[^\S\n]+(\S.*)$/gm;
  for (const m of String(body || '').matchAll(re)) out.set(kind === 'channel' ? Number(m[1]) : m[1], m[2].trim());
  return out;
}
function judgedSummary(root, stage, body, redAt) {
  const degraded = [];
  const dir = path.join(root, '.claude', 'receipts');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^events-.*\.jsonl$/.test(n)).sort(); } catch (e) {
    if (!(e && e.code === 'ENOENT')) degraded.push(`gate_judged rows unreadable: .claude/receipts (${(e && e.code) || 'error'})`);
  }
  let receipts = null;
  try { receipts = require(path.join(__dirname, 'receipts.cjs')); } catch (_) { if (names.length) degraded.push('gate_judged rows unreadable: scripts/lib/receipts.cjs did not load'); }
  const byId = new Map(); const ordered = [];
  for (const n of receipts ? names : []) {
    const led = receipts.readLedger(path.join(dir, n));
    for (const note of led.notes || []) if (/torn final line/.test(note)) degraded.push(`partial row at .claude/receipts/${n}`);
    for (const e of led.events) {
      if (e.event !== 'gate_judged' || e.stage !== stage || e.session === PROBE_SESSION) continue;
      if (typeof e.tool_use_id === 'string') { if (byId.has(e.tool_use_id)) ordered[byId.get(e.tool_use_id)] = e; else { byId.set(e.tool_use_id, ordered.length); ordered.push(e); } } else ordered.push(e);
    }
  }
  ordered.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const counts = { allow: 0, refuse: {} };
  let host = 0; let seq = 0;
  for (const e of ordered) {
    if (e.verdict === 'allow') counts.allow++; else counts.refuse[e.class] = (counts.refuse[e.class] || 0) + 1;
    if (e.coverage === 'host_id') host++; else seq++;
  }
  const lines = resolvedLines(body, 'gate');
  const unresolved = [];
  for (const e of ordered) {
    if (e.verdict !== 'refuse') continue;
    const id = identityOf(e);
    if (e.class === 'implementation' && redAt && e.at < redAt) continue;
    if (lines.has(id)) continue;
    if (redAt && e.target_ref && ordered.some((a) => a.verdict === 'allow' && a.target_ref === e.target_ref && a.at > e.at && a.at > redAt)) continue;
    unresolved.push({ id, class: e.class, at: e.at });
  }
  return { judged: { rows: ordered.length, counts, coverage: !ordered.length ? 'none' : !seq ? 'host_id' : !host ? 'hook_seq' : 'mixed', unresolved: unresolved.map((u) => u.id), excluded_sessions: [PROBE_SESSION], resolved_lines: Object.fromEntries(lines) }, unresolved, degraded };
}
function refusalsSummary(root, stage, body) {
  const rel = '.claude/channel/refusals.jsonl';
  const rr = readRows(path.join(root, '.claude', 'channel', 'refusals.jsonl'), rel);
  const lines = resolvedLines(body, 'channel');
  const rows = rr.rows.map((r, i) => Object.assign({ n: i + 1 }, r));
  const mine = rows.filter((r) => r.stage === stage);
  const unresolved = [];
  for (const r of mine) {
    if (r.ok) continue;
    if (r.verb === 'publish' && r.kind === 'stage-end') continue; // resolved by the stage end that succeeds
    if (lines.has(r.n)) continue;
    if (mine.some((o) => o.ok && o.verb === r.verb && o.kind === r.kind && o.n > r.n)) continue;
    unresolved.push(r);
  }
  return { refusals: { rows: mine.length, unresolved: unresolved.map((r) => `channel:${r.n}`), resolved_lines: Object.fromEntries(lines) }, unresolved, degraded: rr.notes.slice() };
}

// ---------------------------------------------------------------------------
// Item o (M34.6.C item 5): unexpected changed files. At the stage-end publish the candidate's changed
// paths (the index against the standing approval row's base) are compared with the stage's allowed
// set: the paths its section names in backticks, their twins (docs/twins.json, where it exists), the
// red gate's test and document globs and .claude/red-gate-allow.txt, .claude/measurements/<stage>/
// and the excluded prefixes. A path outside it refuses the publish unless the packet carries
// "out-of-scope:<path> <why>" for it; gate.json records every such line as out_of_scope. The check
// sees paths, never contents: a call added inside a named file stays the orchestrator's reading.
// ---------------------------------------------------------------------------
// The red gate's built-in allow list (pretooluse-red-gate.cjs BUILTIN_ALLOW), copied: the hook is a
// hook and is never required from here. The smoke section reads the hook text at every run and
// compares (lockstep), so a hook stage that edits its list reds until this copy follows.
const RED_GATE_ALLOW = Object.freeze([
  'docs/**', 'retrospectives/**', 'prompts/**', '.claude/**', '.github/**',
  'spec/**', 'proposals/**',
  '**/*.md',
  '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*',
  '**/test/**', '**/tests/**', '**/__tests__/**',
  '.gitignore', '.gitattributes', '.editorconfig',
]);
const TEST_ALLOW = Object.freeze(RED_GATE_ALLOW.slice(8, 15));
// The hook's glob rule: `**/` is whole path segments, a bare `**` anything, `*` one segment's text.
function allowGlobToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { re += '(?:[^/]+/)*'; i++; } else re += '.*'; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.indexOf(c) !== -1) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
// The project's own entries in .claude/red-gate-allow.txt, a wildcard-only line dropped (as the hook drops it).
function allowFileGlobs(root) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, '.claude', 'red-gate-allow.txt'), 'utf8'); } catch (_) { return []; }
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.replace(/[*/]/g, '') !== '');
}
// The repository paths a stage section names: each backticked span with no whitespace, none of
// <>*{}|$, not absolute and not a flag, holding a "/" or a ".". A span names itself and what lies under it.
function namedPaths(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/`([^`\n]+)`/g)) {
    const s = m[1].trim().replace(/^\.\//, '');
    if (!s || /[\s<>*{}|$]/.test(s) || /^[-/]/.test(s) || !/[/.]/.test(s) || /^[./]+$/.test(s)) continue;
    out.add(s);
  }
  return Array.from(out).sort();
}
const isNamed = (rel, named) => named.some((n) => rel === n || rel.startsWith(n.endsWith('/') ? n : `${n}/`));
function twinPairs(root) {
  const j = readJson(path.join(root, 'docs', 'twins.json'));
  return j && Array.isArray(j.pairs) ? j.pairs.filter((p) => p && typeof p.canonical === 'string' && typeof p.derived === 'string') : [];
}
// The changed paths: the index (or a commit, for a committed bundle's review) against the base.
function changedPaths(root, base, rev) {
  const r = git(root, rev ? ['diff', '--name-status', '--no-renames', '-z', base, rev] : ['diff', '--cached', '--name-status', '--no-renames', '-z', base]);
  if (!r.ok) return { error: `git diff against ${String(base).slice(0, 7)} failed: ${r.err}` };
  const parts = String(r.out).split(NUL); const paths = [];
  for (let i = 0; i + 1 < parts.length && parts[i]; i += 2) paths.push({ status: parts[i].trim().charAt(0), path: parts[i + 1] });
  return { paths };
}
function outOfScopeLines(body) {
  const out = [];
  for (const m of String(body || '').matchAll(/^out-of-scope:(\S+)[^\S\n]+(\S.*)$/gm)) if (!out.some((x) => x.path === m[1])) out.push({ path: m[1], line: m[2].trim() });
  return out;
}
// -> { rows: [{ status, path, why|null }], named, lines, notes } | { error }
function itemO(root, stage, base, body, rev) {
  const notes = [];
  let named = [];
  try {
    const sec = require(path.join(__dirname, 'read-ledger.cjs')).stageSectionAt(root, stage);
    if (sec.ok) named = namedPaths(sec.text); else notes.push(`item o: the ${stage} section could not be read (${sec.why}); no path counted as named`);
  } catch (e) { notes.push(`item o: scripts/lib/read-ledger.cjs did not load (${String((e && e.message) || e).split('\n')[0]}); no path counted as named`); }
  const cp = changedPaths(root, base, rev);
  if (cp.error) return { error: cp.error };
  const pairs = twinPairs(root);
  const own = allowFileGlobs(root).map((g) => [g, allowGlobToRe(g)]);
  const test = TEST_ALLOW.map((g) => [g, allowGlobToRe(g)]);
  const docs = RED_GATE_ALLOW.filter((g) => TEST_ALLOW.indexOf(g) === -1).map((g) => [g, allowGlobToRe(g)]);
  const why = (rel) => {
    if (isExcluded(rel)) return 'excluded';
    if (rel.startsWith(`.claude/measurements/${stage}/`)) return 'measurements';
    if (isNamed(rel, named)) return 'named';
    for (const p of pairs) { if (rel === p.derived && isNamed(p.canonical, named)) return `twin of ${p.canonical}`; if (rel === p.canonical && isNamed(p.derived, named)) return `twin of ${p.derived}`; }
    if (test.some(([, re]) => re.test(rel))) return 'test glob';
    if (own.some(([, re]) => re.test(rel))) return 'red-gate-allow.txt';
    if (docs.some(([, re]) => re.test(rel))) return 'document glob';
    return null;
  };
  return { rows: cp.paths.map((p) => ({ status: p.status, path: p.path, why: why(p.path) })), named, lines: outOfScopeLines(body), notes };
}
const OOS_LINE = (stage, paths) => SE(`${paths.length} changed path(s) outside the stage's allowed set: ${paths.slice(0, 10).join(', ')}${paths.length > 10 ? ` (+${paths.length - 10} more)` : ''}; add "out-of-scope:<path> <why>" for each to the packet (allowed: the paths the stage section names, their twins, the red gate's test and document globs, .claude/measurements/${stage}/, the excluded prefixes)`);

// ---------------------------------------------------------------------------
// The stage end (items 4, 5, 8, 9, 11): the checks, then gate.json, the archive and the manifest.
// ctx: { root, stage, body, rowHash (the standing approval row's hash), base (that row's base) }
// -> { ok: true, legacy: true } | { ok: false, line } | { ok: true, prepare: () => { notes } }
// ---------------------------------------------------------------------------
const SE = (what) => `channel: stage-end refused - ${what}`;
function stageEndEvidence(ctx) {
  const { root, stage, body } = ctx;
  const st = stageState(root, stage);
  if (st.legacy) return { ok: true, legacy: true, line: LEGACY_LINE(stage) };
  const notes = st.notes.slice();
  const d = indexDiff(root);
  if (d.error) return { ok: false, line: SE(`the candidate cannot be read (${d.error})`) };
  if (d.path) return { ok: false, line: UNSTAGED_LINE('channel: stage-end refused', d.path) };
  const s = subject(root);
  if (s.error) return { ok: false, line: SE(`the candidate's subject cannot be computed (${s.error})`) };
  const cand = s.subject;
  for (const row of PREFIX_ROWS) if (!st.rows.some((r) => r.row === row)) return { ok: false, line: SE(`the lifecycle of ${stage} has no ${row} row (the completed prefix: ${PREFIX_ROWS.join(', ')})`) };
  const ra = st.rows.filter((r) => r.row === 'red_approved').pop();
  if (ctx.rowHash && ra.row_hash && ra.row_hash !== ctx.rowHash) return { ok: false, line: SE(`the lifecycle's red_approved row does not bind the standing approval (row ${String(ra.row_hash).slice(0, 12)}, the record ${String(ctx.rowHash).slice(0, 12)}); the owner runs /approve-red`) };
  const dir = stageDir(root, stage);
  const gf = path.join(dir, 'tests_run.green.json'); const green = readJson(gf);
  if (!green) return { ok: false, line: SE(`no tests_run.green.json for ${stage}; run node scripts/verify-local.cjs --stage ${stage} --subject green on the candidate (subject ${cand})`) };
  if (green.subject !== cand) return { ok: false, line: SE(`tests_run.green.json is for subject ${green.subject}, not the candidate ${cand}; run the GREEN again on the candidate`) };
  if (green.exit_code !== 0) return { ok: false, line: SE(`tests_run.green.json exited ${green.exit_code === null ? 'by a signal' : green.exit_code}; a GREEN exits 0`) };
  if (green.adapter !== 'none' && !(green.counts && green.counts.total > 0)) return { ok: false, line: SE('tests_run.green.json ran 0 tests; a GREEN runs at least one') };
  const lf = path.join(dir, 'lane_run.json'); const lane = readJson(lf);
  if (!lane) return { ok: false, line: SE(`no lane_run.json for ${stage}; run node scripts/verify-local.cjs --lane fast --stage ${stage} on the candidate (subject ${cand})`) };
  if (lane.subject !== cand) return { ok: false, line: SE(`lane_run.json is for subject ${lane.subject}, not the candidate ${cand}; run the lane again on the candidate`) };
  if (lane.verdict !== 'pass') return { ok: false, line: SE(`lane_run.json verdict is ${lane.verdict}, not pass`) };
  // item o (M34.6.C item 5): every changed path is in the allowed set or named by an out-of-scope line
  if (!ctx.base) return { ok: false, line: SE('the approval row carries no base, so the changed paths cannot be derived') };
  const io = itemO(root, stage, ctx.base, body, null);
  if (io.error) return { ok: false, line: SE(`the changed paths cannot be derived (${io.error})`) };
  const uncovered = io.rows.filter((r) => !r.why && !io.lines.some((l) => l.path === r.path)).map((r) => r.path);
  if (uncovered.length) return { ok: false, line: OOS_LINE(stage, uncovered) };
  notes.push(...io.notes);
  const judged = judgedSummary(root, stage, body, ra.at);
  if (judged.unresolved.length) { const u = judged.unresolved[0]; return { ok: false, line: SE(`${judged.unresolved.length} unresolved gate refusal(s), first ${u.id} (${u.class}, ${u.at}): add "resolved:${u.id} <why>" to the packet`) }; }
  const ref = refusalsSummary(root, stage, body);
  if (ref.unresolved.length) { const u = ref.unresolved[0]; return { ok: false, line: SE(`${ref.unresolved.length} unresolved channel refusal(s), first channel:${u.n} (${u.class}): add "resolved:channel:${u.n} <why>" to the packet`) }; }
  const red = readJson(path.join(dir, 'tests_run.red.json'));
  return {
    ok: true,
    prepare: () => {
      const degraded = notes.concat(judged.degraded, ref.degraded);
      appendLife(root, stage, 'prepared', { subject: cand });
      const after = stageState(root, stage);
      let hookSha = null; try { hookSha = sha256(fs.readFileSync(path.join(root, '.claude', 'hooks', 'pretooluse-red-gate.cjs'))); } catch (_) { degraded.push('the red-gate hook could not be hashed'); }
      let hostCli = null;
      try { const r = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); hostCli = r.status === 0 ? String(r.stdout).trim().split(/\r?\n/)[0] || null : null; } catch (_) { hostCli = null; }
      if (hostCli === null) degraded.push('host_cli: claude --version did not answer');
      let measureLine = null; try { measureLine = require(path.join(__dirname, 'read-ledger.cjs')).measure(root, stage).line; } catch (_) { degraded.push('measure: read-ledger did not answer'); }
      let mutation = null; try { const m = /^mutation:.*$/m.exec(fs.readFileSync(path.join(root, 'retrospectives', `${stage}-retrospective.md`), 'utf8')); mutation = m ? m[0] : null; } catch (_) { mutation = null; }
      const archive = path.join(dir, 'approval.json');
      let archiveSha = null;
      try { const b = fs.readFileSync(path.join(root, '.claude', 'channel', 'approval.json')); fs.writeFileSync(archive + '.tmp', b); fs.renameSync(archive + '.tmp', archive); archiveSha = sha256(b); } catch (_) { degraded.push('the approval record could not be archived beside the evidence'); }
      const sum = (r, f) => (r ? { sha256: sha256(fs.readFileSync(f)), subject: r.subject, adapter: r.adapter, classified: r.classified, counts: r.counts || null } : null);
      const drift = configDrift(red, green);
      const probed = after.rows.filter((r) => r.row === 'probed').pop() || null;
      const hostRow = after.rows.filter((r) => r.row === 'host').pop() || null;
      const gate = {
        schema: 'sbak/gate/v1', stage, state: 'prepared', subject: cand, lifecycle: after.rows.map((r) => r.row),
        probe: { liveness: probed, host: hostRow }, judged: judged.judged, refusals: ref.refusals, hook_sha256: hookSha, kit_version: KIT_VERSION, host_cli: hostCli,
        tests_run: { red: red ? sum(red, path.join(dir, 'tests_run.red.json')) : null, green: sum(green, gf) },
        lane_run: { sha256: sha256(fs.readFileSync(lf)), subject: lane.subject, lane: lane.lane, verdict: lane.verdict, duration_ms: lane.duration_ms },
        approval_archive_sha256: archiveSha, measure: measureLine, mutation, degraded, config_drift: drift,
        out_of_scope: io.lines, // item o: every out-of-scope line the packet carried, its path and its why
      };
      writeJson(path.join(dir, 'gate.json'), gate);
      writeManifest(root, stage, cand);
      return { notes: degraded.filter((x) => /^partial row at /.test(x)) };
    },
  };
}
// The manifest: every file in the stage's directory but itself, its sha256 (for a .jsonl ledger,
// `bytes` and the sha256 of that prefix, R4: the ledger may only grow) and the subject it names.
const SUPERSEDED = /^(tests_run\.(?:red|green)|lane_run)\.\d{8}T\d{6,9}Z(?:-\d+)?\.json$/;
function writeManifest(root, stage, subj) {
  const dir = stageDir(root, stage);
  const files = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (f === 'manifest.json' || /\.tmp$/.test(f)) continue;
    const abs = path.join(dir, f);
    if (!fs.statSync(abs).isFile()) continue;
    const b = fs.readFileSync(abs);
    const e = { path: `${EVIDENCE_REL}/${stage}/${f}`, sha256: sha256(b), subject: null };
    if (/\.jsonl$/.test(f)) e.bytes = b.length;
    else if (/\.json$/.test(f)) { try { const j = JSON.parse(b.toString('utf8')); if (j && typeof j.subject === 'string') e.subject = j.subject; } catch (_) { /* no subject */ } }
    const sm = SUPERSEDED.exec(f);
    if (sm) e.superseded_by = `${sm[1]}.json`;
    files.push(e);
  }
  writeJson(path.join(dir, 'manifest.json'), { schema: 'sbak/evidence-manifest/v1', stage, subject: subj, files });
}

// ---------------------------------------------------------------------------
// accept (item 5, Q8): the orchestrator's transcription of the stamp, once.
// -> { ok: true, line } | { ok: false, line }
// ---------------------------------------------------------------------------
function accept(root, stage, seq, stampText, by) {
  const A = (what) => ({ ok: false, line: `channel: accept refused - ${what}` });
  const dir = stageDir(root, stage);
  const gf = path.join(dir, 'gate.json');
  const g = readJson(gf);
  if (!g) return A(`${stage} has no gate.json (the stage-end publish writes it)`);
  if (g.state === 'accepted') return A(`${stage} is already accepted (seq ${g.accepted_seq})`);
  if (g.state !== 'prepared') return A(`${stage}'s gate.json is at ${g.state}, not prepared`);
  let row = null;
  try { for (const l of fs.readFileSync(path.join(root, '.claude', 'channel', 'builder-to-orch.jsonl'), 'utf8').split('\n')) { if (!l.trim()) continue; const m = JSON.parse(l); if (m && m.seq === seq) row = m; } } catch (_) { row = null; }
  if (!row || row.class !== 'stage-packet' || row.kind !== 'stage-end' || row.stage !== stage) return A(`seq ${seq} is not ${stage}'s stage-end packet in the builder's log`);
  const at = new Date().toISOString();
  appendLife(root, stage, 'accepted', { accepted_seq: seq });
  Object.assign(g, { state: 'accepted', accepted_seq: seq, accepted_at: at, stamp: { text: stampText, sha256: sha256(Buffer.from(stampText, 'utf8')) }, accepted_by: by || null });
  g.lifecycle = stageState(root, stage).rows.map((r) => r.row);
  writeJson(gf, g);
  writeManifest(root, stage, g.subject);
  return { ok: true, line: `channel: accepted ${stage} on the stamp answering seq ${seq} - gate.json state accepted` };
}

// ---------------------------------------------------------------------------
// The open (items 5, 6): the next-open check, the two probe rows.
// ---------------------------------------------------------------------------
// Every stage whose gate.json is accepted and whose lifecycle has no cleared row. -> [stage]
function unclearedStages(root) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, ...EVIDENCE_REL.split('/'))); } catch (_) { return []; }
  return names.filter((s) => STAGE_RE.test(s)).filter((s) => { const g = readJson(path.join(stageDir(root, s), 'gate.json')); return g && g.state === 'accepted' && !lifeRows(root, s).rows.some((r) => r.row === 'cleared' && r.stage === s); }).sort();
}
const PROBE_REFUSE_LINE = "[red-gate] REFUSED - '.claude/stage-active' is a red-gate control file";
// The liveness row: the project's own hook driven with the two fixed payloads.
function probeLiveness(root) {
  const hook = path.join(root, '.claude', 'hooks', 'pretooluse-red-gate.cjs');
  const row = { refusing: { payload: 'Edit .claude/stage-active', verdict: 'error', exit: null }, allowing: { payload: 'Write docs/sbak-probe.md', verdict: 'error', exit: null }, hook_sha256: null, node: process.version, pass: false };
  let bytes = null;
  try { bytes = fs.readFileSync(hook); row.hook_sha256 = sha256(bytes); } catch (_) { row.detail = '.claude/hooks/pretooluse-red-gate.cjs is absent'; return row; }
  const drive = (toolInput, id, tool) => spawnSync(process.execPath, [hook], { cwd: root, input: JSON.stringify({ session_id: PROBE_SESSION, hook_event_name: 'PreToolUse', cwd: root, tool_name: tool, tool_use_id: id, tool_input: toolInput }), encoding: 'utf8', timeout: 20000, windowsHide: true, env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root }) });
  const a = drive({ file_path: path.join(root, '.claude', 'stage-active') }, 'sbak-probe-refuse', 'Edit');
  row.refusing.exit = a.status;
  row.refusing.verdict = a.status === 2 && String(a.stderr || '').indexOf(PROBE_REFUSE_LINE) === 0 ? 'refuse' : a.status === 0 ? 'allow' : 'error';
  const b = drive({ file_path: path.join(root, 'docs', 'sbak-probe.md') }, 'sbak-probe-allow', 'Write');
  row.allowing.exit = b.status;
  row.allowing.verdict = b.status === 0 ? 'allow' : b.status === 2 ? 'refuse' : 'error';
  row.pass = row.refusing.verdict === 'refuse' && row.allowing.verdict === 'allow';
  if (!row.pass) {
    row.detail = row.refusing.verdict !== 'refuse'
      ? `the refusing payload (Edit .claude/stage-active) was ${row.refusing.verdict === 'allow' ? 'allowed' : 'not refused'} (exit ${a.status})`
      : `the allowing payload (Write docs/sbak-probe.md) was ${row.allowing.verdict === 'refuse' ? 'refused' : 'not allowed'} (exit ${b.status})`;
  }
  return row;
}
// The host row: the two project settings files read, never a claim that the host loaded them (R-b).
function probeHost(root) {
  let sm = null;
  try { sm = require(path.join(__dirname, 'settings-merge.cjs')); } catch (_) { sm = null; }
  const regs = []; let disable = 'absent';
  for (const f of ['settings.json', 'settings.local.json']) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(root, '.claude', f), 'utf8')); } catch (_) { j = null; }
    if (!j) continue;
    if (typeof j.disableAllHooks === 'boolean') disable = j.disableAllHooks;
    for (const r of sm ? sm.flattenRegistrations(j) : []) {
      const id = sm.commandIdentity(r.command);
      if (/\.claude\/hooks\/[A-Za-z0-9._-]+\.cjs/.test(id)) regs.push({ file: f, event: r.event, matcher: r.matcher, command_identity: id, on_failure: r.onFailure || null });
    }
  }
  const gate = regs.filter((r) => r.event === 'PreToolUse' && /pretooluse-red-gate\.cjs/.test(r.command_identity));
  const onFailure = gate.length > 0 && gate.every((r) => r.on_failure === 'block');
  const both = gate.some((r) => /Edit/.test(String(r.matcher))) && gate.some((r) => /Bash/.test(String(r.matcher)));
  return { registrations: regs, on_failure_red_gate: onFailure, disable_all_hooks: disable, host_level: both && onFailure && disable !== true ? 'settings_verified' : 'none', claim: 'settings read from the two project files; never a claim that the host loaded them' };
}

// ---------------------------------------------------------------------------
// The commit's boundaries: the pre-commit (item 11), --verify (item 11), the transport (item 12).
// ---------------------------------------------------------------------------
function openStage(root) {
  try { const t = fs.readFileSync(path.join(root, '.claude', 'stage-active'), 'utf8').split(NUL).join('').trim(); return STAGE_RE.test(t) ? t : null; } catch (_) { return null; }
}
// -> { code, out?, err? }
function preCommit(root) {
  const stage = openStage(root);
  if (!stage) return { code: 0 };
  const st = stageState(root, stage);
  if (st.legacy) return { code: 0, err: LEGACY_LINE(stage) };
  for (const f of ['gate.json', 'manifest.json']) {
    const rel = `${EVIDENCE_REL}/${stage}/${f}`;
    const r = git(root, ['ls-files', '--error-unmatch', '--', rel]);
    if (!r.ok) return { code: 1, err: `evidence: commit refused - stage ${stage} is open on the evidence path and the index carries no ${rel}; publish the stage end, then git add ${EVIDENCE_REL}/${stage}` };
  }
  return { code: 0 };
}
function verify(root, stage, against) {
  const F = (what) => ({ code: 1, err: `evidence: verify failed - ${what}` });
  const dir = stageDir(root, stage);
  const m = readJson(path.join(dir, 'manifest.json'));
  if (!m || !Array.isArray(m.files) || !SUBJECT_RE.test(String(m.subject))) return F(`${EVIDENCE_REL}/${stage}/manifest.json is absent or unreadable`);
  let where;
  if (against === 'index') {
    const s = subject(root);
    if (s.error) return F(`the index's subject cannot be computed (${s.error})`);
    if (s.subject !== m.subject) return F(`the manifest's subject ${m.subject} is not the index's subject ${s.subject}`);
    where = 'the index';
  } else {
    const intro = String(git(root, ['log', '--format=%H', '--diff-filter=A', '-n', '1', '--', `${EVIDENCE_REL}/${stage}/gate.json`]).out || '').trim();
    if (!intro) return F(`${EVIDENCE_REL}/${stage}/gate.json is in no commit (before the commit: --against index)`);
    const s = subjectOfTree(root, intro);
    if (s.error) return F(`the subject of ${intro.slice(0, 7)}'s tree cannot be computed (${s.error})`);
    if (s.subject !== m.subject) return F(`the manifest's subject ${m.subject} is not the subject of ${intro.slice(0, 7)}'s tree (the commit that introduced gate.json)`);
    where = `the tree of ${intro.slice(0, 7)} (the commit that introduced gate.json)`;
  }
  for (const f of m.files) {
    let b;
    try { b = fs.readFileSync(path.join(root, ...String(f.path).split('/'))); } catch (_) { return F(`${f.path} is listed in the manifest and absent`); }
    const h = Number.isInteger(f.bytes) ? (b.length >= f.bytes ? sha256(b.slice(0, f.bytes)) : null) : sha256(b);
    if (h !== f.sha256) return F(`${f.path} sha256 does not match the manifest`);
    if (f.subject) { let j = null; try { j = JSON.parse(b.toString('utf8')); } catch (_) { j = null; } if (!j || j.subject !== f.subject) return F(`${f.path} names subject ${j && j.subject}, the manifest ${f.subject}`); }
    if (!f.superseded_by && /\/(tests_run\.green|lane_run|gate)\.json$/.test(String(f.path)) && f.subject !== m.subject) return F(`${f.path} is for subject ${f.subject}, not the manifest's ${m.subject}`);
  }
  return { code: 0, out: `evidence: ${stage} verified - ${m.files.length} file(s) match the manifest; the subject ${m.subject} is ${where}` };
}
// ---------------------------------------------------------------------------
// The review (M34.6.C item 4): the orchestrator's bounded review contract reads a stage's bundle
// through this rendering, before the stamp ask. It prints the records as they stand, in the order
// the contract lists them, and writes nothing (observed evidence); the five answers and the decision
// are the orchestrator's (agent judgment). The candidate is the index while gate.json is in no commit,
// else the tree of the commit that introduced it (--verify's rule); `against` overrides.
// -> { code: 0, out } | { code: 1, err }
// ---------------------------------------------------------------------------
function packetsOf(root, stage) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, '.claude', 'channel', 'builder-to-orch.jsonl'), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const l of text.split('\n')) { if (!l.trim()) continue; try { const m = JSON.parse(l); if (m && m.stage === stage && m.class === 'stage-packet') out.push(m); } catch (_) { /* not a row */ } }
  return out;
}
// A stage section's acceptance criteria, in any of three forms (M34.6.F item 8, M34.6.H item 4): the
// acceptance paragraph ("**<L>.4 - acceptance.** ...") split on ";" at parenthesis depth 0, read first;
// else the kit template's "**Acceptance criteria**" list under the section's "### <L>.4 Tests" heading,
// or the list under a closeout's "### <L>.4 Acceptance criteria" heading, one criterion per item.
// -> { id, form, how, items } | null
function acceptanceCriteria(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => /^\*\*[A-Za-z0-9.]+\.4 - acceptance\.\*\*/.test(l));
  if (i === -1) return acceptanceList(lines);
  const head = /^\*\*([A-Za-z0-9.]+\.4) - acceptance\.\*\*\s*/.exec(lines[i]);
  let para = lines[i].slice(head[0].length);
  for (let k = i + 1; k < lines.length && lines[k].trim(); k++) para += ' ' + lines[k].trim();
  const out = []; let depth = 0; let cur = '';
  for (const c of para) {
    if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return { id: head[1], form: 'paragraph', how: 'split on ; outside parentheses', items: out.map((x) => x.trim().replace(/\.$/, '')).filter(Boolean) };
}
// The template's forms: the "### <L>.4 Tests" subsection (to the next heading of level 1 to 3, fences
// skipped), its line beginning "**Acceptance criteria**", then the list under it; or the closeout's
// "### <L>.4 Acceptance criteria" subsection, the prose before its first item skipped (the template's
// "(Replaces "Tests" for the closeout stage.)"), then its list. Either list numbered (1. or 1)) or
// bulleted (-, * or +); an indented line continues its item, a blank line between items is a loose
// list, and the first unindented line that is not an item ends it. Numbered by position. The first
// of the two headings in the section is the one read.
function acceptanceList(lines) {
  const isFence = (l) => /^\s*```/.test(l);
  const ITEM = /^ {0,3}(?:\d+[.)]|[-*+])\s+(\S.*)$/;
  let h = -1; let fence = false;
  for (let k = 0; k < lines.length && h === -1; k++) { if (isFence(lines[k])) fence = !fence; else if (!fence && /^###\s+[A-Za-z0-9.]+\.4\s+(?:Tests|Acceptance criteria)\b/.test(lines[k])) h = k; }
  if (h === -1) return null;
  const id = /^###\s+([A-Za-z0-9.]+\.4)\s/.exec(lines[h])[1];
  const title = lines[h].replace(/^###\s+/, '').trim();
  const closeout = /^###\s+[A-Za-z0-9.]+\.4\s+Acceptance criteria\b/.test(lines[h]);
  let end = lines.length; fence = false;
  for (let k = h + 1; k < lines.length; k++) { if (isFence(lines[k])) fence = !fence; else if (!fence && /^#{1,3}\s/.test(lines[k])) { end = k; break; } }
  let b = -1;
  if (closeout) { fence = false; for (let k = h + 1; k < end && b === -1; k++) { if (isFence(lines[k])) fence = !fence; else if (!fence && ITEM.test(lines[k])) b = k - 1; } }
  else for (let k = h + 1; k < end; k++) if (/^\*\*Acceptance criteria\*\*/.test(lines[k].trim())) { b = k; break; }
  if (b === -1) return null;
  const items = [];
  for (let k = b + 1; k < end; k++) {
    const l = lines[k];
    const it = ITEM.exec(l);
    if (it) { items.push(it[1].trim()); continue; }
    if (!l.trim()) continue;
    if (items.length && /^\s+\S/.test(l)) { items[items.length - 1] += ` ${l.trim()}`; continue; }
    break;
  }
  const out = items.map((x) => x.replace(/\.$/, '')).filter(Boolean);
  if (!out.length) return null;
  return closeout ? { id, form: 'closeout list', how: `the list under ### ${title}, one criterion per item`, items: out }
    : { id, form: 'list', how: `the Acceptance criteria list under ### ${title}, one criterion per item`, items: out };
}
function review(root, stage, against) {
  const dir = stageDir(root, stage);
  if (!fs.existsSync(dir)) return { code: 1, err: `evidence: no review - ${EVIDENCE_REL}/${stage}/ does not exist` };
  const ch = require(path.join(__dirname, 'channel.cjs'));
  let rl = null; try { rl = require(path.join(__dirname, 'read-ledger.cjs')); } catch (_) { rl = null; }
  const L = [];
  const fileSha = (f) => { try { return 'sha256:' + sha256(fs.readFileSync(path.join(dir, f))); } catch (_) { return null; } };
  const gate = readJson(path.join(dir, 'gate.json'));
  const red = readJson(path.join(dir, 'tests_run.red.json'));
  const green = readJson(path.join(dir, 'tests_run.green.json'));
  const lane = readJson(path.join(dir, 'lane_run.json'));
  const man = readJson(path.join(dir, 'manifest.json'));
  const intro = String(git(root, ['log', '--format=%H', '--diff-filter=A', '-n', '1', '--', `${EVIDENCE_REL}/${stage}/gate.json`]).out || '').trim();
  const mode = against || (intro ? 'head' : 'index');
  let cand = null; let where; let rev = null;
  if (mode === 'index') { const s = subject(root); cand = s.subject || null; where = 'the index'; }
  else if (!intro) where = 'not computed (no commit carries gate.json; --against index reads the index)';
  else { const s = subjectOfTree(root, intro); cand = s.subject || null; rev = intro; where = `the tree of ${intro.slice(0, 7)} (the commit that introduced gate.json)`; }
  const isCand = (s) => (cand && s === cand ? 'the candidate' : 'NOT the candidate');
  let rec = ch.readApproval(dir);
  if (!rec || rec.stage !== stage) { const live = ch.readApproval(path.join(root, '.claude', 'channel')); rec = live && live.stage === stage ? live : rec; }
  const cur = rec && !rec.legacy ? ch.currentApproval(rec) : null;
  const packets = packetsOf(root, stage);
  const redStop = packets.filter((m) => m.kind === 'red-stop' && /^red-failing:/m.test(String(m.body || ''))).pop() || null;
  const packetLabels = redStop ? [...String(redStop.body).matchAll(/^red-failing:[^\S\n]*(\S.*?)\s*$/gm)].map((m) => m[1]) : [];
  const stageEnd = packets.filter((m) => m.kind === 'stage-end').pop() || null;
  L.push(`evidence review: ${stage} - read only, nothing written (observed evidence)`);
  // 1. the candidate's subject
  L.push(`subject: ${cand || '(none)'} is ${where} - gate.json names ${gate ? gate.subject : '(no gate.json)'}: ${gate && cand ? (gate.subject === cand ? 'equal' : 'DIFFERS') : 'not compared'}`);
  // 2. the approved set against the approval row
  if (!red) L.push('approved set: no tests_run.red.json');
  else if (!cur) L.push(`approved set: ${(red.approved_set || []).length} file(s) in tests_run.red.json; no approval row for ${stage} to compare`);
  else {
    const want = new Map((cur.row.files || []).map((f) => [f.path, f.sha256]));
    const got = new Map((red.approved_set || []).map((f) => [f.path, f.sha256]));
    const diff = Array.from(new Set([...want.keys(), ...got.keys()])).filter((p) => want.get(p) !== got.get(p)).sort();
    L.push(`approved set: ${got.size} file(s) in tests_run.red.json; the approval row's files: ${diff.length ? `differ at ${diff.join(', ')}` : 'equal'}`);
  }
  // 3. the RED's failing labels beside the packet's red-failing: lines
  if (!red) L.push('RED failing: no tests_run.red.json');
  else if (red.adapter === 'none') {
    L.push(`RED failing (adapter none, exit ${red.exit_code}, platform ${red.platform || 'not recorded'}):`);
    L.push('  labels not read (adapter: none): the transcripts are the orchestrator\'s reading');
  } else {
    L.push(`RED failing (adapter ${red.adapter}, classified ${red.classified}, platform ${red.platform || 'not recorded'}):`);
    (red.failing || []).forEach((lab, k) => L.push(`  ${lab} (${(red.failing_errors || [])[k] || 'unknown'}) - ${packetLabels.indexOf(lab) !== -1 ? 'named by red-failing:' : 'NOT named by the packet\'s red-failing: lines'}`));
    for (const lab of packetLabels) if ((red.failing || []).indexOf(lab) === -1) L.push(`  ${lab} - named by red-failing: and NOT failing in the RED`);
  }
  if (redStop) for (const lab of packetLabels) L.push(`  the packet (red-stop seq ${redStop.seq}): red-failing: ${lab}`);
  else L.push('  the packet: no red-stop packet carries a red-failing: line');
  // 4. the GREEN
  L.push(green ? `GREEN: exit ${green.exit_code}, counts ${green.counts ? `pass ${green.counts.pass} fail ${green.counts.fail} total ${green.counts.total}` : 'not read (adapter none)'}, platform ${green.platform || 'not recorded'}, subject ${green.subject} - ${isCand(green.subject)}` : 'GREEN: no tests_run.green.json');
  // 5. config_drift
  const drift = gate ? gate.config_drift : configDrift(red, green);
  const unknownNode = (u) => `the tests' node unknown (RED ${u.red || 'no version printed'}, GREEN ${u.green || 'no version printed'})`;
  L.push(`config_drift: ${drift ? [drift.node ? `node ${drift.node.red} (RED) to ${drift.node.green} (GREEN)` : null, drift.node_unknown ? unknownNode(drift.node_unknown) : null, drift.deps ? `deps ${drift.deps.red} (RED) to ${drift.deps.green} (GREEN)` : null].filter(Boolean).join('; ') : 'none'}`);
  // 6. the judged summary, 7. the refusals summary
  const resolved = (o) => Object.entries((o && o.resolved_lines) || {}).map(([id, why]) => `  resolved: ${/^\d+$/.test(id) ? `channel:${id}` : id} ${why}`);
  if (gate && gate.judged) {
    const j = gate.judged; const refuse = Object.entries((j.counts && j.counts.refuse) || {}).map(([c, n]) => `${c} ${n}`).join(', ') || 'none';
    L.push(`judged: ${j.rows} rows, allow ${(j.counts && j.counts.allow) || 0}, refuse ${refuse}, coverage ${j.coverage}; unresolved: ${(j.unresolved || []).join(', ') || 'none'}`);
    L.push(...resolved(j));
  } else L.push('judged: no gate.json (the stage-end publish writes it)');
  if (gate && gate.refusals) { L.push(`refusals: ${gate.refusals.rows} rows; unresolved: ${(gate.refusals.unresolved || []).join(', ') || 'none'}`); L.push(...resolved(gate.refusals)); }
  else L.push('refusals: no gate.json (the stage-end publish writes it)');
  // 8. the lane run, and every superseded record by name
  L.push(lane ? `lane_run: ${lane.lane} ${lane.verdict} ${lane.duration_ms} ms, subject ${lane.subject} - ${isCand(lane.subject)}` : 'lane_run: no lane_run.json');
  const sup = ((man && man.files) || []).filter((f) => f.superseded_by);
  if (sup.length) for (const f of sup) L.push(`  superseded: ${path.posix.basename(f.path)} (superseded by ${f.superseded_by})`);
  else L.push('  superseded: none');
  // 9. the changed paths beside the section's named paths, the out-of-scope lines and the scope lock
  const base = cur && cur.row.base;
  const lines = gate && Array.isArray(gate.out_of_scope) ? gate.out_of_scope : outOfScopeLines(stageEnd && stageEnd.body);
  if (!base) L.push('changed paths since (no approval base): not derived');
  else {
    const io = itemO(root, stage, base, (lines || []).map((x) => `out-of-scope:${x.path} ${x.line}`).join('\n'), rev);
    if (io.error) L.push(`changed paths since ${String(base).slice(0, 7)}: not derived (${io.error})`);
    else {
      L.push(`changed paths since ${String(base).slice(0, 7)} (${io.rows.length}, against ${rev ? rev.slice(0, 7) : 'the index'}):`);
      for (const r of io.rows) { const l = lines.find((x) => x.path === r.path); L.push(`  ${r.status} ${r.path} - ${r.why || (l ? `OUTSIDE, out-of-scope: ${l.line}` : 'OUTSIDE, no out-of-scope line')}`); }
      L.push(`  named paths in the section: ${io.named.join(', ') || 'none'}`);
      for (const n of io.notes) L.push(`  ${n}`);
    }
  }
  if (lines && lines.length) { L.push('out-of-scope lines:'); for (const x of lines) L.push(`  ${x.path} ${x.line}`); } else L.push('out-of-scope lines: none');
  const locks = ((cur && cur.row.scope && cur.row.scope.refs) || []).filter((r) => r && r.tag === 'scope_locks');
  if (!locks.length) L.push('scope lock: none recorded (the stage prompt names no scope_locks ref)');
  for (const r of locks) {
    const s = rl ? rl.sectionAt(root, r.doc, r.section) : { ok: false, why: 'read-ledger.cjs did not load' };
    L.push(`scope lock (${r.doc} "${r.section || 'the whole file'}"):${s.ok && r.section_sha256 && sha256(Buffer.from(s.text, 'utf8')) !== r.section_sha256 ? ' (changed since the approval)' : ''}`);
    if (s.ok) for (const t of String(s.text).split('\n')) L.push(`  | ${t}`); else L.push(`  (not read: ${s.why})`);
  }
  // 10. the acceptance criteria, each with the pins the stage-end packet names against it
  const sec = rl ? rl.stageSectionAt(root, stage) : { ok: false, why: 'read-ledger.cjs did not load' };
  const ac = sec.ok ? acceptanceCriteria(sec.text) : null;
  const mapped = new Map();
  if (stageEnd) for (const m of String(stageEnd.body || '').matchAll(/^acceptance (\d+):[^\S\n]*(\S.*?)\s*$/gm)) mapped.set(Number(m[1]), m[2]);
  if (!ac) L.push(`acceptance (no acceptance paragraph in the ${stage} section${sec.ok ? '' : `: ${sec.why}`})`);
  else {
    L.push(`acceptance (${sec.doc} §${stage}, ${ac.id}, ${ac.how}; the pins from the stage-end packet${stageEnd ? ` seq ${stageEnd.seq}` : ': none published'}):`);
    ac.items.forEach((c, k) => L.push(`  ${k + 1}. ${c} - ${mapped.get(k + 1) || 'no pin named'}`));
  }
  // 11. the record ids
  L.push('record ids:');
  for (const f of ['gate.json', 'tests_run.red.json', 'tests_run.green.json', 'lane_run.json']) L.push(`  ${f} ${fileSha(f) || '(absent)'}`);
  L.push(`  approval row ${cur ? ch.approvalRowHash(cur.row) : '(no approval row)'}`);
  return { code: 0, out: L.join('\n') };
}

// The stage commits in a range: single-parent commits whose diff touches a gate.json.
function stageCommits(root, from, to) {
  const args = from && !ZERO_SHA.test(from) ? ['rev-list', '--reverse', `${from}..${to}`] : ['rev-list', '--reverse', to, '--not', '--remotes'];
  let r = git(root, args);
  if (!r.ok && from && !ZERO_SHA.test(from)) r = git(root, ['rev-list', '--reverse', to, '--not', '--remotes']);
  if (!r.ok) return { error: `git rev-list failed: ${r.err}` };
  const out = [];
  for (const c of String(r.out).split(/\r?\n/).filter(Boolean)) {
    const p = String(git(root, ['rev-list', '--parents', '-n', '1', c]).out || '').trim().split(/\s+/);
    if (p.length !== 2) continue;
    const names = String(git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', c]).out || '').split(/\r?\n/);
    for (const n of names) { const m = /^\.claude\/evidence\/([^/]+)\/gate\.json$/.exec(n.trim()); if (m) out.push({ commit: c, stage: m[1] }); }
  }
  return { commits: out };
}
function transportCheck(root, from, to, label) {
  const sc = stageCommits(root, from, to);
  if (sc.error) return { code: 1, err: `evidence: push refused - the pushed range cannot be read (${sc.error})` };
  if (!sc.commits.length) return { code: 0, out: `evidence: no stage commit in ${label} - the lane is the evidence` };
  const outs = []; const errs = [];
  for (const { commit, stage } of sc.commits) {
    const s7 = commit.slice(0, 7);
    const lr = git(root, ['show', `${commit}:${EVIDENCE_REL}/${stage}/lane_run.json`]);
    let lane = null; try { lane = lr.ok ? JSON.parse(String(lr.out)) : null; } catch (_) { lane = null; }
    const s = subjectOfTree(root, commit);
    if (!lane) { errs.push(`evidence: push refused - ${s7} is the stage commit of ${stage} and it carries no lane_run.json`); continue; }
    if (s.error) { errs.push(`evidence: push refused - ${s7}'s subject cannot be computed (${s.error})`); continue; }
    if (lane.subject !== s.subject) { errs.push(`evidence: push refused - ${s7} is the stage commit of ${stage} and its lane_run.json subject ${lane.subject} is not the commit's subject ${s.subject}`); continue; }
    if (lane.verdict !== 'pass') { errs.push(`evidence: push refused - ${s7} is the stage commit of ${stage} and its lane_run.json verdict is ${lane.verdict}, not pass`); continue; }
    outs.push(`evidence: ${s7} stage ${stage} - lane_run subject matches the commit, verdict pass`);
  }
  return { code: errs.length ? 1 : 0, out: outs.join('\n'), err: errs.join('\n') };
}
// The pre-push feed: "<local ref> <local sha> <remote ref> <remote sha>" per line.
function prePush(root, stdinText) {
  const outs = []; const errs = []; let code = 0;
  for (const l of String(stdinText || '').split(/\r?\n/)) {
    const p = l.trim().split(/\s+/);
    if (p.length < 4 || ZERO_SHA.test(p[1])) continue;
    const r = transportCheck(root, ZERO_SHA.test(p[3]) ? null : p[3], p[1], `${ZERO_SHA.test(p[3]) ? '(new branch)' : p[3].slice(0, 12)}..${p[1].slice(0, 12)}`);
    if (r.out) outs.push(r.out); if (r.err) errs.push(r.err); if (r.code) code = 1;
  }
  return { code, out: outs.join('\n'), err: errs.join('\n') };
}

// The closeout's check (item 5): each evidence-path work stage's gate.json accepted. -> [line]
function closeoutLines(root, milestone) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, ...EVIDENCE_REL.split('/'))); } catch (_) { return []; }
  const out = [];
  for (const s of names.filter((n) => STAGE_RE.test(n)).sort()) {
    if (milestone && s !== milestone && s.slice(0, s.lastIndexOf('.')) !== milestone) continue;
    if (!lifeRows(root, s).rows.some((r) => r.row === 'opened' && r.stage === s)) continue;
    const g = readJson(path.join(stageDir(root, s), 'gate.json'));
    if (!g) out.push(`read-ledger: closeout refused - stage ${s} is on the evidence path and has no gate.json`);
    else if (g.state !== 'accepted') out.push(`read-ledger: closeout refused - stage ${s} is on the evidence path and its gate.json is not accepted (state ${g.state})`);
  }
  return out;
}

module.exports = {
  EXCLUDED_PREFIXES, EVIDENCE_REL, PREFIX_ROWS, PROBE_SESSION, KIT_VERSION, LEGACY_LINE, UNSTAGED_LINE,
  isExcluded, subjectOf, subject, subjectOfTree, indexDiff, stageDir, writeJson, appendRow, readRows, readJson, supersede,
  lifeFile, lifeRows, appendLife, stageState, guardRow,
  NODE_TEST, adaptCommand, parseTap, failingLeaves, classify, testsNode, configDrift, recordTestsRun, recordLaneRun, writeFailLine, approvedSet,
  redBinding, judgedSummary, refusalsSummary, stageEndEvidence, writeManifest, accept,
  unclearedStages, probeLiveness, probeHost, openStage, preCommit, verify, stageCommits, transportCheck, prePush, closeoutLines,
  // M34.6.C: the win32 class (item 1), item o (item 5), the review (item 4)
  winCancelledOrLoad, RED_GATE_ALLOW, namedPaths, changedPaths, outOfScopeLines, itemO, acceptanceCriteria, review,
};
