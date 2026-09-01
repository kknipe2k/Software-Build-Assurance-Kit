#!/usr/bin/env node
// @kit-version 1.0.5
// scripts/lib/settings-merge.cjs
//
// The VERIFIED .claude/settings.json merge (M27.B, KF-56; rider §4 + owner
// gate-1 conditions C1–C4). ONE module consumed by scripts/kit-update.cjs
// --adopt — extend-not-fork, the sibling hook-chmod.cjs pattern. Before this
// module, adoption kept an existing settings file untouched and every installed
// control stayed DORMANT behind a manual JSON hand-merge, with "already wired"
// detected by a string regex that a metadata mention could satisfy.
//
// The contract:
//   1. OWNERSHIP IS DERIVED, NEVER HAND-LISTED (C2): the kit-owned registration
//      set (event + matcher + type + normalized command) AND the permissions
//      floor (deny union + concrete ask rules) are parsed at run time from
//      templates/dot-claude/settings.json under the caller's kitRoot — the same
//      resolution that works in the nested/adopted sbak/ layout (C3). A hand
//      list is the drift class this derivation exists to kill. An EMPTY derived
//      set throws (fail-closed): an empty derivation silently merging nothing
//      is the fail-open class. Ownership is an allowlist of exact commands —
//      never "anything under .claude/hooks" (rider §4.5).
//   2. RECOVERABILITY IS THE SPINE: byte-exact archive under
//      .claude/settings.archive/<timestamp>.settings.json (collision-safe via
//      exclusive create + a monotonic suffix — two archives in the same clock
//      second never clobber, C4) with a sibling <timestamp>.meta.json record
//      (source, archivedAt, kitVersion, preMergeSha256, postMergeSha256,
//      result). Then: sibling temp write → parse + semantic verify → atomic
//      rename → re-verify the live file → AUTO-RESTORE the archive byte-exact
//      on any post-replace failure. An UNPARSEABLE settings file is archived
//      and reported, NEVER replaced.
//      Archive RETENTION: archives stay inside .claude, carry restrictive file
//      modes where supported (0600; the directory 0700), may hold sensitive
//      permission topology, and their contents are never printed by this module
//      or its callers — keep them until you no longer need rollback, then
//      delete them by hand.
//   3. THE CONFLICT TAXONOMY (owner-ruled, two classes, two outcomes):
//      (i)  user-modified kit command — a hook entry whose command references a
//           kit-owned script but differs from the canonical form (e.g. an added
//           flag). Reported, NEVER replaced, and the kit's canonical
//           registration is NOT force-added alongside it (that would
//           double-run). Every other registration still lands. Callers exit
//           non-zero ("activation INCOMPLETE").
//      (ii) gate-defeating user permission — e.g. Bash(git commit *) in the
//           user's allow list, which defeats the kit's ask gate for the same
//           command. The kit NEVER modifies or removes a user rule and never
//           silently stacks an ask rule onto an explicit allow: the defeated
//           gate is reported loudly by name with the manual fix, everything
//           non-conflicted (hooks, deny floor, other ask rules) still lands,
//           and callers exit non-zero. Full restore is the outcome for
//           write/parse/verify-MECHANICS failures only — never for reported
//           conflicts (a verify prong demanding absolute high-risk=ask/deny
//           world-state could never pass for such users, and their controls
//           would stay dormant forever).
//      Conflict detection uses exact-rule identity for permissions and
//      kit-script-path identity for hooks; pattern-overlap semantics between
//      differently-spelled rules are out of scope and stated here rather than
//      guessed at.
//   4. SEMANTIC VERIFY is scoped to the kit's own actions: every kit-ADDED
//      registration and rule present and intact, every ORIGINAL user
//      registration, rule, and unknown top-level key untouched, nothing
//      weakened by any kit action. Wiredness everywhere in this module is
//      PARSED-registration inspection — a hook name that appears only in
//      metadata counts for nothing.
//   5. IDEMPOTENCY: a semantic no-op re-run writes nothing and creates NO new
//      archive. The merged file is serialized deterministically (2-space
//      indent + trailing newline), so a clean second run is byte-stable.
//   6. DRY-RUN prints the full plan (would-archive, would-merge with counts,
//      every permission rule that would be added, every conflict) and writes
//      zero bytes.
//
// TEST SEAM (documented, inert in production): when the environment variable
// SBAK_SETTINGS_MERGE_FAULT === 'torn-write', the module simulates a torn write
// immediately after the atomic replace (truncating the live file) so the
// re-verify + auto-restore path is drilled by a real fixture instead of being
// trusted from prose. Never set it outside a test harness.
//
// HONEST SCOPE (stated, never hidden): this protects settings content against
// the kit's own merge mechanics and reports conflicts it can positively
// identify. It is NOT an OS security sandbox and cannot referee an
// equal-authority process editing the same file concurrently; the atomic
// rename + re-verify + restore narrows, not eliminates, that window.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertInside } = require('./sandbox.cjs');

const SETTINGS_REL = '.claude/settings.json';
const ARCHIVE_REL = '.claude/settings.archive';
const KIT_VERSION = (function () {
  try {
    const m = /@kit-version\s+(\S+)/.exec(fs.readFileSync(__filename, 'utf8'));
    return m ? m[1] : 'unstamped';
  } catch (_) { return 'unstamped'; }
})();

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const normalizeCommand = (c) => String(c).trim().replace(/\s+/g, ' ');
// The ownership identity for class-(i) detection: the kit-owned script path
// inside a command. Exact commands stay the allowlist; the script path is only
// used to RECOGNIZE a user-modified variant of a kit command.
function kitScriptPath(command) {
  const m = /\.claude\/hooks\/[A-Za-z0-9._-]+\.cjs/.exec(command);
  return m ? m[0] : null;
}

// Flatten a parsed settings object's hooks into [{event, matcher, command}]
// with normalized commands. matcher === null means "group without a matcher"
// (its own identity — SessionEnd/UserPromptSubmit/Stop shape).
function flattenRegistrations(parsed) {
  const out = [];
  const hooks = (parsed && parsed.hooks) || {};
  if (typeof hooks !== 'object' || Array.isArray(hooks)) return out;
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    for (const grp of hooks[ev]) {
      if (!grp || typeof grp !== 'object') continue;
      for (const h of Array.isArray(grp.hooks) ? grp.hooks : []) {
        if (h && h.type === 'command' && typeof h.command === 'string') {
          out.push({
            event: ev,
            matcher: typeof grp.matcher === 'string' ? grp.matcher : null,
            command: normalizeCommand(h.command),
          });
        }
      }
    }
  }
  return out;
}
// Separators are escape-spelled control characters (never raw bytes in source):
// NUL cannot appear in a JSON-parsed event/matcher/command string, so the key
// is collision-free; SOH stands in for "no matcher" as its own identity.
const regKey = (r) => r.event + '\u0000' + (r.matcher === null ? '\u0001' : r.matcher) + '\u0000' + r.command;

// ── C2/C3: derive the kit-owned set from the template settings at kitRoot ────
function deriveKitSettings(kitRoot) {
  const tplPath = path.join(kitRoot, 'templates', 'dot-claude', 'settings.json');
  const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8')); // unreadable/unparseable → throw → callers fail closed
  const registrations = flattenRegistrations(tpl);
  const placeholderFree = (r) => typeof r === 'string' && r.indexOf('{{') === -1;
  const perms = (tpl.permissions && typeof tpl.permissions === 'object') ? tpl.permissions : {};
  const deny = (Array.isArray(perms.deny) ? perms.deny : []).filter(placeholderFree);
  const ask = (Array.isArray(perms.ask) ? perms.ask : []).filter(placeholderFree);
  if (registrations.length === 0) {
    throw new Error('derived kit registration set is EMPTY (' + tplPath + ' carries no hook registrations) — fail-closed; wrong layout or a stripped template tree?');
  }
  return { registrations, deny, ask, source: tplPath };
}

// ── C4: collision-safe byte-exact archive ─────────────────────────────────────
function archiveStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-'); // 2026-07-21T23-41-12-123Z (rider §4.3 shape)
}
function writeArchive(archiveDir, buf, date) {
  fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  const stamp = archiveStamp(date);
  for (let n = 0; ; n++) {
    const name = stamp + (n === 0 ? '' : '-' + n) + '.settings.json';
    const p = path.join(archiveDir, name);
    let fd;
    try {
      fd = fs.openSync(p, 'wx', 0o600); // exclusive create: same-second archives bump the suffix, never clobber
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
    try { fs.writeSync(fd, buf); } finally { fs.closeSync(fd); }
    return p;
  }
}
function writeMeta(archivePath, meta) {
  const p = archivePath.replace(/\.settings\.json$/, '.meta.json');
  fs.writeFileSync(p, JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 });
  return p;
}

// ── the pure merge (no filesystem) ────────────────────────────────────────────
function mergeSettings(opts) {
  const live = opts.live;
  const kit = opts.kit;
  const merged = JSON.parse(JSON.stringify(live));
  const res = {
    merged,
    addedRegs: [], dedupedRegs: [],
    addedDeny: [], addedAsk: [],
    conflicts: { hooks: [], permissions: [] },
    changed: false,
  };

  // hooks — merge by event+matcher semantics; user entries stay first in their
  // groups (existing registrations run alongside kit registrations, rider §4.4).
  if (!merged.hooks || typeof merged.hooks !== 'object' || Array.isArray(merged.hooks)) merged.hooks = {};
  const hooksObj = merged.hooks;
  for (const reg of kit.registrations) {
    const groups = (Array.isArray(hooksObj[reg.event]) ? hooksObj[reg.event] : []).filter((g) =>
      g && typeof g === 'object'
      && (reg.matcher === null ? typeof g.matcher !== 'string' : g.matcher === reg.matcher));
    const existing = [];
    for (const g of groups) {
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        if (h && h.type === 'command' && typeof h.command === 'string') existing.push(normalizeCommand(h.command));
      }
    }
    if (existing.indexOf(reg.command) !== -1) { res.dedupedRegs.push(reg); continue; }
    const script = kitScriptPath(reg.command);
    const clash = script ? existing.find((c) => c.indexOf(script) !== -1) : undefined;
    if (clash !== undefined) {
      // class (i): user-modified kit command — reported, never replaced, the
      // canonical form NOT force-added alongside (it would double-run).
      res.conflicts.hooks.push({ event: reg.event, matcher: reg.matcher, userCommand: clash, kitCommand: reg.command });
      continue;
    }
    let g = groups[0];
    if (!g) {
      g = reg.matcher === null ? { hooks: [] } : { matcher: reg.matcher, hooks: [] };
      if (!Array.isArray(hooksObj[reg.event])) hooksObj[reg.event] = [];
      hooksObj[reg.event].push(g);
    }
    if (!Array.isArray(g.hooks)) g.hooks = [];
    g.hooks.push({ type: 'command', command: reg.command });
    res.addedRegs.push(reg);
  }

  // permissions — the narrower policy: deny unioned (callers SHOW each added
  // rule), concrete ask rules added, allow NEVER touched or broadened.
  const perms = () => {
    if (!merged.permissions || typeof merged.permissions !== 'object' || Array.isArray(merged.permissions)) merged.permissions = {};
    return merged.permissions;
  };
  for (const rule of kit.deny) {
    const p = perms();
    if (!Array.isArray(p.deny)) p.deny = [];
    if (p.deny.indexOf(rule) === -1) { p.deny.push(rule); res.addedDeny.push(rule); }
  }
  for (const rule of kit.ask) {
    const p = perms();
    const allow = Array.isArray(p.allow) ? p.allow : [];
    if (allow.indexOf(rule) !== -1) {
      // class (ii): gate-defeating user permission — never modified, never
      // silently outranked by stacking the kit's ask rule onto it.
      res.conflicts.permissions.push({ rule, list: 'allow' });
      continue;
    }
    if (!Array.isArray(p.ask)) p.ask = [];
    if (p.ask.indexOf(rule) !== -1) continue; // already protected
    if (Array.isArray(p.deny) && p.deny.indexOf(rule) !== -1) continue; // user is stricter — deny outranks ask
    p.ask.push(rule);
    res.addedAsk.push(rule);
  }

  res.changed = (res.addedRegs.length + res.addedDeny.length + res.addedAsk.length) > 0;
  return res;
}

// ── semantic verify, scoped to the kit's own actions (taxonomy note 4) ───────
function verifyMerged(candidate, expect) {
  const errs = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return ['candidate is not a settings object'];
  const cset = new Set(flattenRegistrations(candidate).map(regKey));
  for (const r of expect.addedRegs) {
    if (!cset.has(regKey(r))) errs.push('kit registration missing: ' + r.event + '/' + (r.matcher === null ? '-' : r.matcher) + ' ' + r.command);
  }
  for (const r of flattenRegistrations(expect.original)) {
    if (!cset.has(regKey(r))) errs.push('an ORIGINAL user registration went missing: ' + r.event + '/' + (r.matcher === null ? '-' : r.matcher) + ' ' + r.command);
  }
  const cperms = (candidate.permissions && typeof candidate.permissions === 'object') ? candidate.permissions : {};
  const operms = (expect.original.permissions && typeof expect.original.permissions === 'object') ? expect.original.permissions : {};
  for (const list of ['allow', 'ask', 'deny']) {
    const orig = Array.isArray(operms[list]) ? operms[list] : [];
    const cand = Array.isArray(cperms[list]) ? cperms[list] : [];
    for (const rule of orig) if (cand.indexOf(rule) === -1) errs.push('an ORIGINAL user ' + list + ' rule went missing: ' + rule);
  }
  for (const rule of expect.addedDeny) {
    if (!(Array.isArray(cperms.deny) && cperms.deny.indexOf(rule) !== -1)) errs.push('kit deny rule missing: ' + rule);
  }
  for (const rule of expect.addedAsk) {
    if (!(Array.isArray(cperms.ask) && cperms.ask.indexOf(rule) !== -1)) errs.push('kit ask rule missing: ' + rule);
  }
  for (const k of Object.keys(expect.original)) {
    if (k === 'hooks' || k === 'permissions') continue;
    if (JSON.stringify(candidate[k]) !== JSON.stringify(expect.original[k])) errs.push('a user top-level key was mutated: ' + k);
  }
  return errs;
}

// ── the recoverable apply flow kit-update calls ───────────────────────────────
// Returns { status, conflictCount, addedCount, dedupedCount, archivePath }.
// status ∈ merged | merged-with-conflicts | already-wired | conflicts-only |
//          dry-run | unparseable | aborted | restored
// Callers treat unparseable / aborted / restored / any conflictCount > 0 as
// activation-INCOMPLETE and exit non-zero.
function applySettingsMerge(opts) {
  const projRoot = opts.projRoot;
  const dryRun = !!opts.dryRun;
  const log = opts.log || function () {};
  const kit = deriveKitSettings(opts.kitRoot);

  const livePath = assertInside(projRoot, SETTINGS_REL);
  const archiveDirPath = path.join(projRoot, ARCHIVE_REL);
  const relArchive = (p) => ARCHIVE_REL + '/' + path.basename(p);
  const originalBuf = fs.readFileSync(livePath);

  let original = null;
  let parseWhy = null;
  try {
    original = JSON.parse(originalBuf.toString('utf8'));
    if (!original || typeof original !== 'object' || Array.isArray(original)) parseWhy = 'top level is not an object';
  } catch (e) { parseWhy = String(e.message).split('\n')[0]; }

  if (parseWhy !== null) {
    if (dryRun) {
      log('would-archive ' + SETTINGS_REL + ' — UNPARSEABLE (' + parseWhy + '); a real run archives the exact bytes and reports; the file is never replaced');
      return { status: 'unparseable', conflictCount: 0, addedCount: 0, dedupedCount: 0 };
    }
    const archivePath = writeArchive(archiveDirPath, originalBuf, new Date());
    writeMeta(archivePath, {
      source: SETTINGS_REL, archivedAt: new Date().toISOString(), kitVersion: KIT_VERSION,
      preMergeSha256: sha256(originalBuf), postMergeSha256: sha256(originalBuf), result: 'unparseable-preserved',
    });
    log('archived   ' + relArchive(archivePath) + ' (byte-exact copy of your settings; contents never printed; delete when no longer needed)');
    log('ERROR      ' + SETTINGS_REL + ' is UNPARSEABLE (' + parseWhy + ') — the file was NOT replaced and adopt never will replace it. '
      + 'Fix the JSON by hand (your original is archived at ' + relArchive(archivePath) + '), then re-run --adopt to merge the kit hooks.');
    return { status: 'unparseable', conflictCount: 0, addedCount: 0, dedupedCount: 0, archivePath };
  }

  const m = mergeSettings({ live: original, kit });
  const conflictCount = m.conflicts.hooks.length + m.conflicts.permissions.length;
  for (const c of m.conflicts.hooks) {
    log('conflict   ' + c.event + '/' + (c.matcher === null ? '-' : c.matcher) + ' — your command "' + c.userCommand
      + '" is a user-modified kit command: kept as-is, never replaced, and the kit\'s canonical registration was NOT added alongside it (it would double-run). '
      + 'Resolve by hand: keep your variant, or restore the canonical "' + c.kitCommand + '".');
  }
  for (const c of m.conflicts.permissions) {
    log('conflict   permissions — your ' + c.list + ' rule "' + c.rule + '" defeats the kit\'s ask gate for the same command '
      + '(the kit never modifies or removes a user rule, and will not silently stack an ask rule onto your explicit allow). '
      + 'Manual fix: remove "' + c.rule + '" from ' + c.list + ' (or move it to ask) to arm the gate.');
  }

  if (!m.changed) {
    log((dryRun ? 'would-verify ' : 'verified   ') + SETTINGS_REL + ' — already wired: ' + m.dedupedRegs.length
      + ' kit registration(s) present by parsed inspection; nothing to merge, no archive written');
    return {
      status: conflictCount > 0 ? 'conflicts-only' : 'already-wired',
      conflictCount, addedCount: 0, dedupedCount: m.dedupedRegs.length,
    };
  }

  if (dryRun) {
    log('would-archive ' + SETTINGS_REL + ' → ' + ARCHIVE_REL + '/ (byte-exact original before any merge)');
    log('would-merge ' + SETTINGS_REL + ' — ' + m.addedRegs.length + ' kit registration(s) to add ('
      + m.dedupedRegs.length + ' already present); your hooks, permission rules, and unknown keys are preserved');
    for (const r of m.addedDeny) log('  + deny    ' + r + ' (kit floor — shown before adding)');
    for (const r of m.addedAsk) log('  + ask     ' + r);
    return { status: 'dry-run', conflictCount, addedCount: m.addedRegs.length, dedupedCount: m.dedupedRegs.length };
  }

  const archivePath = writeArchive(archiveDirPath, originalBuf, new Date());
  log('archived   ' + relArchive(archivePath) + ' (byte-exact original; restrictive mode where supported; contents never printed; keep until you no longer need rollback)');

  const serialized = JSON.stringify(m.merged, null, 2) + '\n';
  const expect = { addedRegs: m.addedRegs, addedDeny: m.addedDeny, addedAsk: m.addedAsk, original };
  const tmp = livePath + '.kit-update.tmp';
  fs.writeFileSync(tmp, serialized);
  let preErrs;
  try { preErrs = verifyMerged(JSON.parse(fs.readFileSync(tmp, 'utf8')), expect); }
  catch (e) { preErrs = ['candidate unparseable: ' + String(e.message).split('\n')[0]]; }
  if (preErrs.length) {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    writeMeta(archivePath, {
      source: SETTINGS_REL, archivedAt: new Date().toISOString(), kitVersion: KIT_VERSION,
      preMergeSha256: sha256(originalBuf), postMergeSha256: sha256(originalBuf), result: 'aborted-before-replace',
    });
    log('ERROR      settings merge aborted BEFORE replace — the candidate failed semantic verification (' + preErrs[0] + '); your live settings were not touched.');
    return { status: 'aborted', conflictCount, addedCount: 0, dedupedCount: m.dedupedRegs.length, archivePath };
  }

  let origMode = null;
  if (process.platform !== 'win32') { try { origMode = fs.statSync(livePath).mode & 0o7777; } catch (_) { origMode = null; } }
  fs.renameSync(tmp, livePath); // atomic replace — a kill leaves original or candidate, never half a file
  if (origMode !== null) { try { fs.chmodSync(livePath, origMode); } catch (_) { /* mode preservation is best-effort */ } }

  // TEST SEAM (header note): drill the re-verify + restore path. Inert in production.
  if (process.env.SBAK_SETTINGS_MERGE_FAULT === 'torn-write') {
    fs.writeFileSync(livePath, serialized.slice(0, Math.floor(serialized.length / 2)));
  }

  let postErrs;
  try { postErrs = verifyMerged(JSON.parse(fs.readFileSync(livePath, 'utf8')), expect); }
  catch (e) { postErrs = ['live file unparseable after replace: ' + String(e.message).split('\n')[0]]; }
  if (postErrs.length) {
    const rtmp = livePath + '.kit-update.restore.tmp';
    fs.writeFileSync(rtmp, originalBuf);
    fs.renameSync(rtmp, livePath);
    const exact = Buffer.compare(fs.readFileSync(livePath), originalBuf) === 0;
    writeMeta(archivePath, {
      source: SETTINGS_REL, archivedAt: new Date().toISOString(), kitVersion: KIT_VERSION,
      preMergeSha256: sha256(originalBuf), postMergeSha256: sha256(fs.readFileSync(livePath)), result: 'restored-after-verify-failure',
    });
    log('RESTORED   ' + SETTINGS_REL + ' — post-replace verification FAILED (' + postErrs[0] + '); the byte-exact original was restored from '
      + relArchive(archivePath) + (exact ? '' : ' (RESTORE MISMATCH — compare against the archive by hand)') + '.');
    return { status: 'restored', conflictCount, addedCount: 0, dedupedCount: m.dedupedRegs.length, archivePath };
  }

  writeMeta(archivePath, {
    source: SETTINGS_REL, archivedAt: new Date().toISOString(), kitVersion: KIT_VERSION,
    preMergeSha256: sha256(originalBuf), postMergeSha256: sha256(Buffer.from(serialized)),
    result: conflictCount > 0 ? 'merged-with-conflicts' : 'merged',
  });
  log('merged     ' + SETTINGS_REL + ' — ' + m.addedRegs.length + ' kit registration(s) added ('
    + m.dedupedRegs.length + ' already present, deduplicated); your hooks, permission rules, and unknown keys are preserved');
  for (const r of m.addedDeny) log('  + deny    ' + r + ' (kit floor — shown before adding)');
  for (const r of m.addedAsk) log('  + ask     ' + r);
  return {
    status: conflictCount > 0 ? 'merged-with-conflicts' : 'merged',
    conflictCount, addedCount: m.addedRegs.length, dedupedCount: m.dedupedRegs.length, archivePath,
  };
}

module.exports = {
  SETTINGS_REL,
  ARCHIVE_REL,
  normalizeCommand,
  flattenRegistrations,
  deriveKitSettings,
  archiveStamp,
  writeArchive,
  mergeSettings,
  verifyMerged,
  applySettingsMerge,
};
