#!/usr/bin/env node
// @kit-version 1.0.5
// validators/validate-claude-integrity.cjs
//
// The project's CLAUDE.md self-integrity gate (M30.I) - the one check that would
// have caught the highest-impact miss on record: a milestone closeout truncated a project's
// CLAUDE.md from 713 lines to 83, deleting every hard rule, and merged to main with no
// gate noticing (V104 slice-1 overseer finding).
//
// Two halves:
//   1. SHRINK (--staged): when the repo-root CLAUDE.md is staged, its staged byte count is
//      compared against the PREVIOUS commit's (read via git, never a stored number). A
//      staged copy under half the committed size BLOCKS. A legitimate shrink (the owner
//      cutting ceremony) passes via the override - SBAK_ALLOW_CLAUDE_SHRINK=<reason> - and
//      the reason is LOGGED to stderr, never silent.
//   2. WIRING (--staged, and --settings <file> directly): the session-hook layer must be
//      wired - .claude/settings.json carries all four session hooks
//      (session-start-read-first, receipts-lifecycle, user-prompt-submit-mode-check,
//      pretooluse-red-gate). A present settings file missing one BLOCKS naming the hook
//      (the M30.G row-2 filed gap: the stampless check needs the hooks PRESENT; this is
//      the commit-time owner of that gap). An ABSENT settings file is a visible note, not
//      a block (honor-system hosts carry no session layer at all).
//
// Honest scope: the shrink half is a byte-count tripwire, not a semantic diff - a rewrite
// that keeps the size but guts the rules passes it; the human review is the wall. The
// wiring half proves registration by parsing the hooks entries, not that the host executes
// them. Fail-closed on git errors (ERR-004 family).
//
// Usage:
//   node validators/validate-claude-integrity.cjs --staged
//   node validators/validate-claude-integrity.cjs --settings <settings.json>

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SHRINK_RATIO = 0.5; // staged < half of committed = the truncation class
const SESSION_HOOKS = [
  'session-start-read-first.cjs',
  'receipts-lifecycle.cjs',
  'user-prompt-submit-mode-check.cjs',
  'pretooluse-red-gate.cjs',
];

function die(msg, code) {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exit(code);
}

function git(args) {
  return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString();
}

// ── half 2: the wiring check ─────────────────────────────────────────────────────────────
function collectCommands(node, out) {
  if (Array.isArray(node)) { for (const x of node) collectCommands(x, out); return; }
  if (node && typeof node === 'object') {
    if (typeof node.command === 'string') out.push(node.command);
    for (const k of Object.keys(node)) collectCommands(node[k], out);
  }
}

function checkSettings(file, { absentIsNote }) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) {
    if (absentIsNote) {
      process.stderr.write(`NOTE  claude-integrity: no ${file} - the session-hook layer is not wired here (honor-system host, or pre-install). Nothing to check.\n`);
      return 0;
    }
    die(`FAIL  claude-integrity: cannot read ${file}`, 1);
  }
  let cfg;
  try { cfg = JSON.parse(raw); } catch (e) {
    die(`FAIL  claude-integrity: ${file} is not valid JSON (${e.message}) - refusing to call the hook layer wired.`, 1);
  }
  const cmds = [];
  collectCommands(cfg.hooks || {}, cmds);
  const missing = SESSION_HOOKS.filter((h) => !cmds.some((c) => c.indexOf(h) !== -1));
  if (missing.length > 0) {
    die(`FAIL  claude-integrity: ${file} does not register the session hook(s): ${missing.join(', ')} - the session layer is dormant while looking installed. Restore the wiring: node scripts/kit-update.cjs --adopt`, 1);
  }
  return 0;
}

// ── half 1: the shrink check ─────────────────────────────────────────────────────────────
function checkShrink() {
  let staged;
  try {
    staged = git('diff --cached --name-only --diff-filter=ACM').split(/\r?\n/).filter(Boolean);
  } catch (e) {
    die(`FAIL  claude-integrity: cannot enumerate staged files (${(e.stderr || e.message || '').toString().trim()}) - fail-closed (ERR-004).`, 2);
  }
  if (!staged.includes('CLAUDE.md')) return 0;

  let prev = null;
  try { prev = git('cat-file -s HEAD:CLAUDE.md').trim(); } catch (_) { prev = null; }
  if (prev === null) return 0; // first commit of the file - nothing to shrink from

  let now = null;
  try { now = git('cat-file -s :CLAUDE.md').trim(); } catch (_) { now = null; }
  if (now === null) die('FAIL  claude-integrity: CLAUDE.md is staged but its staged blob is unreadable - fail-closed.', 2);

  const before = parseInt(prev, 10);
  const after = parseInt(now, 10);
  if (!(after < before * SHRINK_RATIO)) return 0;

  const reason = process.env.SBAK_ALLOW_CLAUDE_SHRINK;
  if (reason && reason.trim() !== '') {
    process.stderr.write(`NOTE  claude-integrity: CLAUDE.md shrank ${before} -> ${after} bytes; ALLOWED by override, reason logged: ${reason.trim()}\n`);
    return 0;
  }
  die(
    `FAIL  claude-integrity: the staged CLAUDE.md shrank ${before} -> ${after} bytes (under ${Math.round(SHRINK_RATIO * 100)}% of the previous commit's) - the truncated-rules class. ` +
    `If this shrink is deliberate, re-run the commit with SBAK_ALLOW_CLAUDE_SHRINK="<reason>" so the reason is on the record.`, 1
  );
}

function main() {
  const args = process.argv.slice(2);
  const si = args.indexOf('--settings');
  if (si !== -1) {
    const file = args[si + 1];
    if (!file) die('usage: validate-claude-integrity.cjs --staged | --settings <settings.json> | <file>...', 2);
    process.exit(checkSettings(file, { absentIsNote: false }));
  }
  if (args.length === 1 && args[0] === '--staged') {
    checkShrink();
    checkSettings(path.join(process.cwd(), '.claude', 'settings.json'), { absentIsNote: true });
    process.exit(0);
  }
  // FILE MODE (positional args - how the template-policing floor drives every validator over
  // the template it polices): a settings-shaped file runs the wiring check; a CLAUDE.md-shaped
  // file has no committed baseline to compare bytes against outside a git commit, so file mode
  // is wiring-only for it - a visible note, never a silent pass and never a false block.
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length > 0 && files.length === args.length) {
    for (const f of files) {
      if (/settings\.json$/.test(f)) { checkSettings(f, { absentIsNote: false }); continue; }
      process.stderr.write(`NOTE  claude-integrity: ${f} - the shrink half is commit-relative (staged vs previous commit) and does not evaluate a bare file; wiring is the file-mode check.\n`);
    }
    process.exit(0);
  }
  die('usage: validate-claude-integrity.cjs --staged | --settings <settings.json> | <file>...', 2);
}

main();
