#!/usr/bin/env node
// @kit-version 1.0.9
// scripts/approve-red.cjs
//
// The HUMAN's action — gate 2 of the three-gate loop (plan -> RED -> stage-end).
// After reviewing the surfaced RED tests, the human runs this (via /approve-red)
// to unlock implementation edits for the open stage. It writes .claude/red-approved
// = the current .claude/stage-active id (atomically), which the PROC-001 red-gate
// then matches to allow impl edits for THAT stage only.
//
// No open stage (.claude/stage-active absent) -> nothing to approve -> exit 2. A new
// /stage clears the approval (a fresh stage starts un-approved), so an approval can
// never carry across stages.
//
// Usage:  node scripts/approve-red.cjs --stage <id> --release-seq <n>
//         node scripts/approve-red.cjs --stage <id> --void --reason "<text>"
//   --stage <id>        the open stage; any other value is refused (M32.1.B, R-35 a)
//   --release-seq <n>   the seq of the pending approval-request on the channel (the
//                       orchestrator's RED verdict), or `none` when no approval-request is
//                       pending (before the worktree split, or the human's own /approve-red
//                       ahead of a verdict). The two flags put the stage and the
//                       seq in the command line itself, so the permission prompt the human
//                       clicks names what it releases; the red-gate hook refuses any other
//                       form of the command.
//   --void --reason     the human's un-approve (M34.C): the approval is recorded void, the
//                       marker removed, and the red gate engages again with the reason named.
//                       The second bare shape of this script (CFI-02); the reason is 1 to 200
//                       characters with none of " $ ` \ ; & | < > or a newline.
// Exit 0 = wrote (or voided) red-approved. Exit 2 = no open stage / a flag refused / the evidence
// could not be recorded / a write failed - and then nothing was approved.
//
// EVIDENCE FIRST, MARKER LAST (M34.C, D1). The release succeeds only when its evidence is
// recorded; a missing piece is a refusal that names the step and the repair, never a note:
//   1. the channel (scripts/lib/channel.cjs): the pending approval-request and the seq check;
//   2. the stage-open read check (scripts/lib/read-ledger.cjs);
//   3. the gate word's receipt (scripts/lib/receipts.cjs): built whole - role, repository
//      identity, session, the prompt's time, the released seq - and validated, not yet written;
//   4. the approval record (.claude/channel/approval.json): the approval row appended - the
//      approved test files by sha256 and git blob, and the scope (the Phase doc, its blob at HEAD,
//      the sha256 of the stage section as the view carries it);
//   5. the marker, atomic: the stage id, then `record <sha256 of that approval row>` - the red
//      gate checks the record against it before an implementation edit;
//   6. the receipt appended; then the approval-request consumed.
// A failure at 4, 5 or 6 puts the record's and the marker's prior bytes back, so a refusal leaves
// the tree as it was and the ledger never holds an approval that did not take. Before 4, a RED set
// that is empty or that git cannot list is refused (M34.1.B): the record never holds an approval of
// nothing.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const claudeDir = path.join(process.cwd(), '.claude');
const channelRoot = path.join(claudeDir, 'channel');

function readTrim(file) {
  try { return fs.readFileSync(file, 'utf8').split(String.fromCharCode(0)).join('').trim(); }
  catch (_) { return null; }
}
function refuse(line) {
  process.stderr.write(`approve-red: ${line}\n`);
  process.exit(2);
}
const ADOPT = 'node scripts/kit-update.cjs --adopt';
// One line naming the step that could not record its evidence, and the repair (M34.C item 1).
function refuseAt(step, cause, repair) {
  refuse(`refused at ${step} - ${cause}; nothing was approved - repair: ${repair || ADOPT}`);
}
// A required library, or the refusal naming the module that is absent (a module it requires counts).
// `load` holds the literal require, so every module this script needs is named in its source.
function need(load, name, step) {
  try { return load(); } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      const m = /lib[\\/]([A-Za-z0-9._-]+\.cjs)/.exec(String(e.message));
      refuseAt(step, `scripts/lib/${m ? m[1] : name} is absent`);
    }
    refuseAt(step, `scripts/lib/${name} did not load (${String((e && e.message) || e).split('\n')[0]})`);
  }
  return null;
}

// The human's click (M32.1.B, R-35 b): a permission prompt on a command (tool category exec)
// recorded in THIS session's receipts ledger within the last 120 s - the session's own file,
// read through the receipts reader, never a glob over other sessions. Null when there is none,
// or no session id to name the file.
const CLICK_WINDOW_MS = 120 * 1000;
function recordedClick(receipts, session) {
  try {
    if (!session) return null;
    const file = path.join(claudeDir, 'receipts', receipts.ledgerFileFor(session));
    if (!fs.existsSync(file)) return null;
    const now = Date.now();
    const clicks = receipts.readLedger(file).events.filter((e) => {
      if (e.event !== 'permission_requested' || e.tool_category !== 'exec') return false;
      const age = now - Date.parse(e.at);
      return age >= -5000 && age <= CLICK_WINDOW_MS;
    });
    return clicks.length ? clicks[clicks.length - 1] : null;
  } catch (_) { return null; }
}

const stageId = readTrim(path.join(claudeDir, 'stage-active'));
if (!stageId) {
  process.stderr.write('approve-red: no .claude/stage-active — there is no open stage to approve.\n');
  process.stderr.write('  Open a stage first (e.g. /stage M09 D, or node scripts/stage-active.cjs M09.D).\n');
  process.exit(2);
}

// THE RELEASE COMMAND IS LEGIBLE (M32.1.B, R-35 a): both flags, checked before anything is read
// or written. A refusal changes nothing - no marker, and a pending request stays pending.
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
}
const stageArg = flag('--stage');
if (stageArg === null) refuse(`--stage is required - run node scripts/approve-red.cjs --stage <id> --release-seq <n> (the open stage is ${stageId}).`);
if (stageArg !== stageId) refuse(`--stage ${stageArg} is not the open stage (${stageId}) - refused.`);
const voiding = argv.indexOf('--void') !== -1;
let reason = null;
if (voiding) {
  if (argv.indexOf('--release-seq') !== -1) refuse('--void refused - --void takes --reason "<text>", never --release-seq.');
  reason = flag('--reason');
  if (reason === null || reason.length < 1 || reason.length > 200 || /["$`\\;&|<>\r\n]/.test(reason)) refuse('--void refused - --reason needs 1 to 200 characters, none of " $ ` \\ ; & | < > or a newline.');
}
const seqArg = voiding ? null : flag('--release-seq');
if (!voiding && (seqArg === null || !/^(?:[1-9][0-9]{0,8}|none)$/.test(seqArg))) refuse('--release-seq must be the pending approval-request\'s seq, or none - refused.');

// The marker's own bytes, so a later refusal can put them back.
const target = path.join(claudeDir, 'red-approved');
let markerPrior = null;
try { markerPrior = fs.readFileSync(target); } catch (_) { markerPrior = null; }

// 1. THE CHANNEL. The orchestrator's word (M32.1.B, R-35): the approval-request the builder's pickup
// surfaced and is waiting on, read through channel.cjs - never by re-parsing the jsonl.
const chan = need(() => require('./lib/channel.cjs'), 'channel.cjs', 'the channel');
let pending = null;
try {
  const res = chan.resolve(process.cwd());
  if (res.ok && chan.SIDE[res.role] === 'work') {
    const u = chan.unreadFor(res);
    if (!u.fault && u.pending) pending = { seq: u.pending.seq, first: u.unread[0].seq === u.pending.seq };
  }
} catch (e) { refuseAt('the channel', `the pending approval-request could not be read (${String((e && e.message) || e).split('\n')[0]})`); }
if (!voiding) {
  if (seqArg === 'none' && pending) refuse(`approval-request seq ${pending.seq} is pending - pass --release-seq ${pending.seq} (the orchestrator's RED verdict) - refused.`);
  if (seqArg !== 'none' && !pending) refuse('no approval-request is pending - pass --release-seq none - refused.');
  if (seqArg !== 'none' && Number(seqArg) !== pending.seq) refuse(`--release-seq ${seqArg} is not the pending approval-request (seq ${pending.seq}) - refused.`);
  if (pending && !pending.first) refuse(`approval-request seq ${pending.seq} is pending behind unread messages - run node scripts/channel.cjs pickup first - refused.`);
} else {
  const first = (markerPrior === null ? '' : markerPrior.toString('utf8')).split(/\r?\n/)[0].split(String.fromCharCode(0)).join('').trim();
  if (first !== stageId) refuse(`--void refused - stage ${stageId} is not approved, so there is nothing to void.`);
}

// 2. THE CONSUMPTION CHECK (M30.G, lazy orientation) — gate 2 is the first mechanical gate after
// the stage-open reads must have happened. The read-first list's `when: stage-open` entries
// and every path in the open stage prompt's <read_first> must have a recorded read on the
// receipts ledger (a Read-tool or Bash read, recorded by receipts-lifecycle.cjs); a stage that
// proceeds without them is REFUSED here, one line naming the unread files.
// M33.F: a `view: <stage>` entry requires the stage view, current against HEAD and read; a stale,
// unbuilt, unhashable or unread view is refused with the line that names its rebuild. The void
// needs no reads: it takes an approval away.
const rl = voiding ? null : need(() => require('./lib/read-ledger.cjs'), 'read-ledger.cjs', 'the read check');
if (rl) {
  try {
    const res = rl.checkReads(process.cwd(), { boundary: 'stage-open', stage: stageId });
    const lines = rl.refusalLines(res, 'approve-red', stageId);
    if (lines.length > 0) {
      process.stderr.write(lines.join('\n') + '\n');
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`approve-red: the read check failed to run (${e && e.message ? e.message : 'error'}) - refusing rather than approving unchecked.\n`);
    process.exit(2);
  }
}

// 3. THE GATE WORD, RECORDED WHOLE (M34.C item 3): who (the role, through the channel library's
// strict reader, V-26 b), where (the repository identity the stamp prints, never a path), when
// (the recorded prompt's time), the session and the released seq. A null is "absent" (no git, no
// session, no prompt, no request); the receipts allowlist refuses a row missing any of them.
const receipts = need(() => require('./lib/receipts.cjs'), 'receipts.cjs', 'the receipt');
const roleRead = chan.readRole(process.cwd());
if (roleRead.state === 'unresolved') refuseAt('the receipt', '.claude/role does not name a role, so the gate word cannot say who', 'node scripts/set-mode.cjs <role>');
const role = roleRead.role;
let repo = null;
try { const id = chan.repoIdentity(process.cwd()); repo = id ? id.repo : null; } catch (_) { repo = null; }
const session = receipts.resolveScriptSession(process.env).session || null;
const click = recordedClick(receipts, session);
const evt = {
  schema: receipts.SCHEMA_VERSION, at: new Date().toISOString(), event: voiding ? 'red_voided' : 'red_approved', emitter: 'approve-red',
  stage: stageId, marker: 'red-approved', role, repo, session, prompt_at: click ? click.at : null,
};
if (!voiding) evt.approval_seq = pending ? pending.seq : null;
const checked = receipts.validateEvent(evt, { append: true });
if (!checked.ok) refuseAt('the receipt', checked.reason);

// The scope the RED is approved against (M34.C item 5): the stage's section of its Phase doc at
// HEAD, through the one reader stage-view uses. No HEAD or no Phase doc for the milestone records
// scope null; a Phase doc without the stage's section (or with two) is a refusal.
let scope = null;
if (!voiding) {
  const sec = rl.stageSectionAt(process.cwd(), stageId);
  if (sec.ok) scope = { doc: sec.doc, blob: sec.blob, section_sha256: crypto.createHash('sha256').update(sec.text, 'utf8').digest('hex') };
  else if (!sec.none) refuseAt('the approval record', `the scope cannot be recorded: ${sec.why}`, 'give the stage its section in the Phase doc, commit it, then run the release again');
}

// THE RED SET (M34.1.B, Y-4): an approval names at least one test file - the test files that differ
// from HEAD, changed or untracked. An empty set, or one git cannot list, is refused before anything
// is written; the request stays pending.
if (!voiding) {
  const red = chan.redSet(process.cwd());
  const empty = red === null
    ? '[approve-red] refused - the RED set cannot be read: git could not list the test files here (not a repository, or git did not run), so there is nothing to record; nothing was approved.'
    : red.length === 0
      ? '[approve-red] refused - the RED set is empty: no test file differs from HEAD, so there is nothing to approve; the RED tests stay uncommitted until the stage end - if they were committed, the stage is off its protocol: ask the orchestrator.'
      : null;
  if (empty) {
    process.stderr.write(empty + '\n');
    process.exit(2);
  }
}

// 4. THE APPROVAL RECORD: the row appended (a re-approval appends, never overwrites).
const recordPrior = chan.recordBytes(channelRoot);
function putBack() {
  try { chan.restoreRecord(channelRoot, recordPrior); } catch (_) { /* reported by the caller's line */ }
  try {
    if (markerPrior === null) fs.rmSync(target, { force: true });
    else { fs.writeFileSync(target + '.tmp', markerPrior); fs.renameSync(target + '.tmp', target); }
  } catch (_) { /* reported by the caller's line */ }
}
let written;
try {
  written = voiding
    ? chan.appendVoid(process.cwd(), stageId, { reason, role, repo, session, prompt_at: evt.prompt_at })
    : chan.appendApproval(process.cwd(), stageId, { seq: evt.approval_seq, role, repo, session, prompt_at: evt.prompt_at, scope });
} catch (e) {
  putBack();
  refuseAt('the approval record', `.claude/channel/approval.json could not be written (${e && e.message ? e.message : 'error'})`);
}

// 5. THE MARKER. M34.A: on win32 a rename onto a file another process holds open (an editor, an
// indexer, a virus scan) fails with EPERM, EBUSY or EACCES for a moment. A bounded retry - ten
// tries, 100 ms apart - rides out the transient lock; the one line below prints only when the
// last try fails. The void removes the marker instead.
const RENAME_RETRY_CODES = ['EPERM', 'EBUSY', 'EACCES'];
const tmp = target + '.tmp';
try {
  fs.mkdirSync(claudeDir, { recursive: true });
  if (voiding) {
    fs.rmSync(target, { force: true });
  } else {
    fs.writeFileSync(tmp, `${stageId}\nrecord ${chan.approvalRowHash(written.row)}\n`, 'utf8');
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, target); // atomic
        break;
      } catch (e) {
        if (attempt >= 10 || !e || RENAME_RETRY_CODES.indexOf(e.code) === -1) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
  }
} catch (e) {
  try { fs.rmSync(tmp, { force: true }); } catch (_) { /* best effort */ }
  putBack();
  process.stderr.write(`approve-red: could not write ${target}: ${e && e.message ? e.message : 'unknown error'}\n`);
  process.exit(2);
}

// 6. THE RECEIPT, appended once the marker stands; a failure here takes the marker and the record
// back, so the ledger never records an approval that did not take. The call sites name their
// event, as stage-active and set-mode do (the contract-order lock reads them after the rename).
function emitReceipt(event) {
  try { return receipts.appendEvent(path.join(claudeDir, 'receipts'), Object.assign({}, evt, { event })); } catch (e) { return { ok: false, reason: e && e.message ? e.message : 'error' }; }
}
const appended = voiding ? emitReceipt('red_voided') : emitReceipt('red_approved');
if (!appended || !appended.ok) {
  putBack();
  refuseAt('the receipt\'s append', String((appended && appended.reason) || 'the receipts ledger did not take the row').split('\n')[0]);
}

if (voiding) {
  process.stdout.write(`red-approved voided for ${stageId} - the next implementation edit prints: [red-gate] approval void - stage ${stageId}'s RED approval was voided (${reason}); the owner runs /approve-red\n`);
  process.exit(0);
}

process.stdout.write(`red-approved = ${stageId} — implementation edits unlocked for this stage.\n`);

// THE RECEIPT BINDS BOTH HALVES, AND THE SCRIPT SAYS WHAT IT HAS (M32.1.B, R-35 b). The channel
// (M30.H): an approval-request is surfaced by pickup but never consumed by an agent - this
// command advances the builder's cursor past it. The line names the orchestrator's word (the
// request's seq) and the human's click (the permission prompt this session recorded) when both
// are on record; with no click on record it says so in a WARNING, and the marker still stands -
// the warning is the record. It never claims a human it cannot show.
// M32.1.C (V-26 a, drive note 21): the recorded time is the PROMPT's; the click lies between the
// prompt and this release and nothing records the click itself, so the line names both ends.
const clickText = click ? `prompt at ${click.at}, released at ${new Date().toISOString()}` : 'WARNING: no permission prompt recorded in this session\'s receipts';
let releasedSeq = null;
if (pending) {
  try { releasedSeq = chan.consumeApproval(process.cwd()); } catch (_) { releasedSeq = null; }
}
if (releasedSeq !== null) {
  process.stdout.write(`channel: approval-request seq ${releasedSeq} released - ${click ? `orchestrator word seq ${releasedSeq}, ${clickText}` : clickText}\n`);
} else if (pending) {
  process.stdout.write(`channel: approval-request seq ${pending.seq} was NOT advanced (the channel moved under this run) - run node scripts/channel.cjs pickup; ${clickText}\n`);
} else {
  process.stdout.write(`release: no approval-request pending (--release-seq none) - ${clickText}\n`);
}
process.exit(0);
