#!/usr/bin/env node
// @kit-version 1.0.2
// .claude/hooks/pretooluse-red-gate.cjs
//
// PreToolUse hook (matcher Edit|Write|MultiEdit|NotebookEdit). The HARD form of
// the per-stage TDD red-stop (PROC-001): it blocks an IMPLEMENTATION
// edit until the human has run /approve-red on the RED tests. It makes the third
// approval gate (plan -> RED -> stage-end) structural instead of prose a builder
// can blow past — which is exactly what happened in M09.A.
//
// It BLOCKS (exit 2) only when ALL FOUR positively confirm:
//   1. the session is `work` mode             (.claude/role, falling back to .claude/active-mode; absent -> work)
//   2. a stage is open                         (.claude/stage-active present)
//   3. the open stage is NOT red-approved      (.claude/red-approved absent or != stage)
//   4. the target is an IMPLEMENTATION path    (not a test / doc / .claude / allow-listed path)
// Anything else -> ALLOW (exit 0). Test paths, docs/, retrospectives/, .claude/,
// a verifier/orchestrator session, or no open stage all proceed — the builder MUST
// be able to write the failing tests and fill the retro before approval.
//
// FAIL-OPEN BY DESIGN. This is a PROCESS gate, not a security boundary:
//   * it exits 2 ONLY on a positively-confirmed block; ANY error / ambiguity /
//     unparseable input exits non-2 so the platform's default (a non-2 exit lets
//     the tool run) degrades this to the soft red-stop — a hook bug must never
//     brick editing. The timeout direction is undocumented, so the stdin read is
//     BOUNDED and the hook stays fast; a never-closing / oversized stream cannot
//     hang the edit path.
//   * it matches only the edit TOOLS — a deliberate `Bash` heredoc write
//     (cat > impl.cjs) bypasses it. It is a bar-raise, not a wall.
//   * it stops implement-before-red; it does NOT catch test-deletion or
//     test-weakening (the documented AI-TDD failure mode). It is effective ONLY
//     paired with the human red-review + mutation-kill. Claim no more.
//
// Cross-platform (Node, no shell-isms). Dependency-free.

'use strict';

const fs = require('fs');
const path = require('path');

const BLOCK = 2; // PreToolUse contract: exit 2 blocks the tool call.
const ALLOW = 0; // exit 0 allows it. (Any OTHER non-2 also lets the tool run.)

// ---- bounded stdin (no-hang guard; we only need the head for tool + path) ----
const MAX_STDIN_BYTES = 1 << 20; // 1 MiB defensive ceiling
function readStdinBounded() {
  const CHUNK = 65536;
  const buf = Buffer.allocUnsafe(CHUNK);
  const out = [];
  let total = 0;
  let guard = 0;
  while (total < MAX_STDIN_BYTES && guard < 100000) {
    guard++;
    let n;
    try {
      n = fs.readSync(0, buf, 0, Math.min(CHUNK, MAX_STDIN_BYTES - total), null);
    } catch (e) {
      if (e && e.code === 'EAGAIN') continue; // not ready yet; bounded by guard
      break; // EOF (some platforms throw) or unreadable -> stop
    }
    if (n === 0) break;
    out.push(Buffer.from(buf.subarray(0, n)));
    total += n;
  }
  return Buffer.concat(out).toString('utf8');
}

// ---- strict marker reads (mirror the A-stage hooks; absent active-mode -> work) ----
const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];
const NUL = String.fromCharCode(0);
function decodeBytes(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
}
function readMarker(claudeDir, name) {
  try {
    return decodeBytes(fs.readFileSync(path.join(claudeDir, name))).split(NUL).join('').trim();
  } catch (_) {
    return null; // absent / unreadable
  }
}
// Classify a marker's token: a bare valid role -> that role; anything present-but-non-
// canonical (empty / garbage / unreadable) -> 'unresolved' (which the gate treats as
// fail-CLOSED = engage, DF-005). Never 'work' here — absent is handled by the caller.
function classifyRole(t) {
  if (t === null) return 'unresolved'; // present-but-unreadable
  const low = t.toLowerCase();
  return VALID_MODES.includes(low) ? low : 'unresolved';
}
// I9 alias-window resolution (M20.B): PREFER `.claude/role`, FALL BACK to the legacy
// `.claude/active-mode` ONLY when role is ABSENT (no file). A present-but-garbage role
// FAILS CLOSED to 'unresolved' and does NOT fall through to a valid legacy file (DF-005).
// ABSENT-both is the lone legitimate default -> 'work'. Retired at v0.2.0 with the alias.
function readMode(claudeDir) {
  if (fs.existsSync(path.join(claudeDir, 'role'))) return classifyRole(readMarker(claudeDir, 'role'));
  if (fs.existsSync(path.join(claudeDir, 'active-mode'))) return classifyRole(readMarker(claudeDir, 'active-mode'));
  return 'work'; // ABSENT both -> the lone legitimate default
}

// ---- allow-list (CONFIG-DRIVEN; the hook hardcodes NO project's test file) ----
// A path is NON-implementation (allowed before /approve-red) if it matches a
// built-in non-code default OR a glob in .claude/red-gate-allow.txt — that file is
// where a project names its own test entrypoint(s) (e.g. a single-file smoke rig
// the standard *.test.* patterns don't catch).
const BUILTIN_ALLOW = [
  'docs/**', 'retrospectives/**', 'prompts/**', '.claude/**', '.github/**',
  'spec/**', 'proposals/**',
  '**/*.md',
  '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*',
  '**/test/**', '**/tests/**', '**/__tests__/**',
];
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // globstar. DF-002 (M16.B): `**/` matches zero-or-more WHOLE path segments — it is
        // SEGMENT-ANCHORED, so `**/test/**` matches a real `test/` segment, NOT any dir merely
        // ENDING in "test" (`latest/`, `greatest/`). A trailing/bare `**` matches anything left.
        i++; // consume the second *
        if (glob[i + 1] === '/') { re += '(?:[^/]+/)*'; i++; } // `**/` → whole-segment prefix
        else re += '.*';                                       // trailing/bare `**`
      } else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.indexOf(c) !== -1) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}
function normRel(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}
// The edit TOOLS pass an ABSOLUTE file_path, but the allow globs are repo-relative
// (e.g. a project's named test rig). Relativize an absolute path against the session
// cwd BEFORE matching, or the gate over-blocks its own allow-listed test files
// (PROC-003). path.relative emits OS separators (backslashes on Windows) — normRel
// (called downstream) folds those back to forward slashes so the relative glob matches.
function toRepoRel(rawPath, baseCwd) {
  let p = String(rawPath);
  if (path.isAbsolute(p)) {
    try { p = path.relative(baseCwd || process.cwd(), p); } catch (_) { /* keep as-is */ }
  }
  return p;
}
function loadAllowGlobs(claudeDir) {
  const globs = BUILTIN_ALLOW.slice();
  try {
    const txt = fs.readFileSync(path.join(claudeDir, 'red-gate-allow.txt'), 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      // DF-004 (M16.B): reject a WILDCARD-ONLY allow entry (`*`, `**`, `*/**`, `**/*`, `/`…).
      // Such a line compiles to an all-matching pattern and would DISABLE the whole gate. A
      // glob that is nothing but wildcards + slashes matches (root-level or every) path; skip
      // it loudly rather than silently neuter the gate. A real glob (`*.md`, `packages/**`)
      // still carries a literal segment and is kept.
      if (l.replace(/[*/]/g, '') === '') {
        process.stderr.write(`[red-gate] ignoring wildcard-only allow entry '${l}' in red-gate-allow.txt (would disable the gate; DF-004).\n`);
        continue;
      }
      globs.push(l);
    }
  } catch (_) { /* optional config */ }
  return globs;
}
function isAllowedPath(relPath, globs) {
  const rel = normRel(relPath);
  return globs.some((g) => globToRe(normRel(g)).test(rel));
}

function main() {
  // Parse the PreToolUse payload. Any failure -> fail OPEN (let the edit run).
  let payload;
  try { payload = JSON.parse(readStdinBounded()); } catch (_) { process.exit(ALLOW); }
  if (!payload || typeof payload !== 'object') process.exit(ALLOW);

  const ti = payload.tool_input || {};
  const rawPath = ti.file_path || ti.notebook_path || ti.path;
  if (typeof rawPath !== 'string' || rawPath.length === 0) process.exit(ALLOW); // no path -> can't classify -> allow

  // The session cwd is authoritative: prefer the stdin `cwd` field (the documented
  // hook payload value), fall back to process.cwd() only if absent. Used BOTH to
  // locate .claude markers AND to relativize the absolute tool path (PROC-003).
  const sessionCwd = (typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : process.cwd();
  const claudeDir = path.join(sessionCwd, '.claude');

  // (2) a stage must be open for the gate to engage at all (dormant by default).
  const stageActive = readMarker(claudeDir, 'stage-active');
  if (!stageActive) process.exit(ALLOW);

  // (1) only a work session builds; verifier/orchestrator/refactor never implement -> ALLOW.
  //     DF-005 (M16.B): an UNRESOLVED (garbage) active-mode value must NOT silently disable
  //     the gate (the fail-open outlier — the same value blocks/warns in the other two hooks).
  //     It fails CLOSED by ENGAGING the gate exactly as `work` does (fall through), so an
  //     implementation edit is blocked while a test/doc path still passes the (4) allow check.
  //     This adds NO new exit-2 site — the single confirmed-block below stays the only one.
  //     ABSENT active-mode remains the legitimate work default (readMode returns 'work').
  const mode = readMode(claudeDir);
  if (mode !== 'work' && mode !== 'unresolved') process.exit(ALLOW);

  // (3) already red-approved for THIS exact stage -> allow.
  const redApproved = readMarker(claudeDir, 'red-approved');
  if (redApproved && redApproved === stageActive) process.exit(ALLOW);

  // (4) non-implementation path (tests / docs / .claude / allow-listed) -> allow.
  //     Relativize first (PROC-003) so an absolute tool path matches the repo-relative globs.
  const relPath = toRepoRel(rawPath, sessionCwd);
  if (isAllowedPath(relPath, loadAllowGlobs(claudeDir))) process.exit(ALLOW);

  // All four confirmed -> BLOCK (the only exit-2 in this hook).
  process.stderr.write(
    `\n[red-gate] Implementation edit blocked — RED tests not yet approved for stage ${stageActive}.\n` +
    `  '${normRel(relPath)}' is an implementation path, the stage is open, and there is no\n` +
    `  matching /approve-red. Write the failing tests first, have the human review them, then:\n` +
    `      /approve-red     (or: node scripts/approve-red.cjs)\n` +
    `  and re-try the edit. To leave the stage entirely: node scripts/stage-active.cjs --clear\n` +
    `  (Process gate, not a wall: a Bash write bypasses it and it does NOT catch test-deletion —\n` +
    `   it is effective only paired with the human red-review + mutation-kill.)\n\n`
  );
  process.exit(BLOCK);
}

// Any internal error degrades to soft (non-2) — never block on a hook bug.
try { main(); } catch (_) { process.exit(ALLOW); }
