#!/usr/bin/env node
// @kit-version 1.0.7
// scripts/lib/hook-root.cjs
//   (twin: templates/scripts/lib/hook-root.cjs - byte-identical; ships via kit-update's table)
//
// THE ONE REPO-ROOT RESOLVER FOR EVERY HOOK (M32.A, proposals/M32-FIELD-REPAIR.md §3.1).
//
// Why it exists. The three hooks that read .claude/ state located it from the SESSION cwd:
// the red-gate from payload.cwd, the mode-check from process.cwd(), the receipts adapter from
// payload.cwd. After a `cd` into a repo subfolder the red-gate found no stage-active, exited
// ALLOW before its control-file carve, and an un-approved stage was open to implementation
// edits AND to the agent writing its own red-approved (verified in the v1.0.6 source and in
// the field: ndl M09.A, exit 2 from the root, exit 0 from research/ for the same edit). Every
// hook now asks this module where the repo is, and nothing else.
//
// Resolution order (gate-1 ruling A, 2026-10-04 - a deliberate deviation from §3.1's
// "CLAUDE_PROJECT_DIR first", recorded in the stage retro):
//   1. walk UP from payload.cwd (the hook payload's documented `cwd`), else process.cwd(),
//      to the NEAREST directory holding either a `.claude/` with a kit CONTROL file in it
//      (CONTROL_FILES below - the project root by construction: the settings that registered
//      this hook, or the markers the hooks read) or `.git`, as a DIRECTORY (a main checkout)
//      or as a FILE (a linked worktree's `gitdir: ...` pointer; every builder worktree is
//      this case);
//   2. only when that walk finds nothing: CLAUDE_PROJECT_DIR, if set and a directory;
//   3. else the start directory itself - today's behavior, so a hook that cannot find a
//      repo never fails CLOSED and locks the person out (the KF-62 class).
// Why cwd before the env var: Claude Code documents CLAUDE_PROJECT_DIR as "the project root
// where the session STARTED" and the payload cwd as following Claude into a worktree
// (code.claude.com/docs/en/hooks). A session started in the main checkout that enters a
// worktree would, env-first, read the MAIN tree's .claude markers from inside the worktree.
// Why a control-file-bearing `.claude/` is a stop marker beside `.git` (M32.A finding, a second
// recorded deviation from §3.1's ".git" wording, amended on the channel at seq 113/75/76): a kit project
// that lives in a SUBFOLDER of a larger repo (a monorepo, or any folder under a stray ancestor
// `.git` - the kit's own host carries one at the drive root) has its `.claude/` below the
// nearest `.git`; a `.git`-only walk anchored the hooks on the outer repo and the receipts
// adapter wrote its ledger there. The nearest settings.json holder is the directory the hook
// was registered from; `.git` covers the fresh checkout that has not grown one yet. A `.claude/`
// folder holding only residue is NOT a marker: the old cwd anchor left stray `.claude/receipts/`
// folders in subfolders, and they must never become roots.
// Never from __dirname: a hook can be invoked from a copied tree.
// For an edit TOOL's target the red-gate asks repoRootFor first (M32.1.B, R-36): an absolute
// target is judged by the repo above the target itself; the order above is its fallback.
//
// It never throws. Every exported function degrades to a safe value on any error, because
// each caller is a hook and a hook fault must never brick a session.
//
// The Stage R fold (M32.R Dup-1 / Dup-2 / Cx-2) rides the same module: `decodeBytes` (six
// byte-identical copies before), `realOrLexical` (three), `readStdinBounded` (three) and
// `readHookInput` (the payload-parse-plus-root block each hook main() carried) live here once.
// The hooks require it __dirname-relative: templates/dot-claude/hooks -> templates/scripts/lib
// in the kit tree, .claude/hooks -> scripts/lib in a rendered or adopted project.
//
// Cross-platform (Node, no shell-isms). Dependency-free.

'use strict';

const fs = require('fs');
const path = require('path');

// ---- the repo root ----------------------------------------------------------------------
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}
// `.git` present as a directory (main checkout) OR a regular file (linked worktree pointer).
function hasGitMarker(dir) {
  try { const st = fs.statSync(path.join(dir, '.git')); return st.isDirectory() || st.isFile(); } catch (_) { return false; }
}
// THE KIT'S CONTROL-FILE SET - the one list (in-stage ruling seq 76, M32.A). A `.claude/`
// directory anchors the root only when it holds at least one of these; a folder holding only
// the pre-M32.A bug's RESIDUE (`receipts/`, `channel/`, or both - the cwd anchor planted stray
// `.claude/receipts/` folders in project subfolders, nine in the field) is NOT a root. Why a
// set and not settings.json alone: Claude Code registers hooks from settings.local.json too,
// so a project wired only through it has no settings.json to find. The red-gate's carve list
// and the receipts adapter must never grow a second copy of this list.
// `hooks` is in the set as a DIRECTORY: the kit installs .claude/hooks/ at the project root and
// the residue never carries one (amendment seq 116: a hooks-only fixture is a real shape).
const CONTROL_FILES = ['settings.json', 'settings.local.json', 'role', 'stage-active', 'red-approved', 'red-gate-allow.txt', 'hooks'];
const CONTROL_FILE_RE = /^read-first-list.*\.txt$/;
// The user's own `~/.claude/` is Claude Code's USER config dir (it carries a settings.json and
// may carry hooks/), never a project root: a walk that reaches the home directory must not
// anchor there by its control files (amendment seq 116, found live: a fixture under %TEMP%
// resolved to the home dir and wrote its ledger into ~/.claude/receipts/). `.git` at the home
// dir still counts - a person may keep their home in git.
function isHomeDir(dir) {
  let home = null;
  try { home = require('os').homedir(); } catch (_) { home = null; }
  return typeof home === 'string' && home !== '' && samePath(dir, home);
}
function hasControlFile(dir) {
  if (isHomeDir(dir)) return false;
  const claudeDir = path.join(dir, '.claude');
  if (!isDir(claudeDir)) return false;
  let names;
  try { names = fs.readdirSync(claudeDir); } catch (_) { return false; }
  return names.some((n) => CONTROL_FILES.indexOf(n) !== -1 || CONTROL_FILE_RE.test(n));
}
function isProjectRoot(dir) {
  return hasControlFile(dir) || hasGitMarker(dir);
}
// GIT_CEILING_DIRECTORIES, git's own semantics: the walk never climbs INTO a listed directory
// (the start dir itself is always examined). A stray `.git` at a drive root - found on the
// kit's own host during M32.A - would otherwise anchor every non-repo folder on that drive;
// git stops at the same ceilings, so the hook and git agree about where a repo ends.
function samePath(a, b) {
  const x = path.resolve(a); const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function ceilings() {
  const raw = process.env.GIT_CEILING_DIRECTORIES;
  if (typeof raw !== 'string' || !raw) return [];
  return raw.split(path.delimiter).map((s) => s.trim()).filter(Boolean);
}
function walkUpToGit(start) {
  let dir = path.resolve(start);
  const stops = ceilings();
  for (let guard = 0; guard < 256; guard++) {
    if (isProjectRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root reached
    if (stops.some((c) => samePath(c, parent))) return null; // a ceiling: do not climb into it
    dir = parent;
  }
  return null;
}
function startDir(payload) {
  if (payload && typeof payload.cwd === 'string' && payload.cwd) return payload.cwd;
  try { return process.cwd(); } catch (_) { return '.'; }
}
// repoRoot(payload) -> an absolute directory path. See the order above. Never throws.
function repoRoot(payload) {
  let start = '.';
  try {
    start = startDir(payload);
    const found = walkUpToGit(start);
    if (found) return found;
    const env = process.env.CLAUDE_PROJECT_DIR;
    if (typeof env === 'string' && env && isDir(env)) return path.resolve(env);
    return path.resolve(start);
  } catch (_) {
    try { return path.resolve(start); } catch (__) { return start; }
  }
}

// THE TARGET'S OWN ROOT (M32.1.B, V-2; R-36 - supersedes R-28 cwd-first for the gate, the §3.1
// deviation). The cwd walk anchors on the repo the session's SHELL sits in; from a sibling repo
// (one Bash `cd` across side-by-side worktrees) that repo has no stage-active, so the gate went
// dormant for an edit into the stage repo, red-approved included. A tool target that is an
// ABSOLUTE path is owned by the repo above IT: walk up from the real form of its directory
// (realOrLexical below, so a new file reached through a link is walked from where it lands).
// targetRoot(targetPath) -> that root, or null when the path is relative or nothing is above it.
function targetRoot(targetPath) {
  try {
    if (typeof targetPath !== 'string' || !targetPath || !path.isAbsolute(targetPath)) return null;
    return walkUpToGit(path.dirname(realOrLexical(targetPath)));
  } catch (_) { return null; }
}
// repoRootFor(payload, targetPath) -> the target's own root when it has one, else repoRoot(payload)
// (a relative target is repo-relative to the cwd walk, exactly as before). Never throws.
function repoRootFor(payload, targetPath) {
  return targetRoot(targetPath) || repoRoot(payload);
}

// ---- the shared byte helpers (Dup-1, Dup-2) ---------------------------------------------
// Decode a tiny marker file across encodings: PowerShell `>` writes UTF-16LE+BOM, Set-Content
// may add a UTF-8 BOM, Unix writes plain UTF-8. This BOM-decode (plus the callers' NUL-strip)
// is the real ERR-002 root - a UTF-16/BOM file read as naive utf8 never matched the literal
// word, so Windows silently fell back to `work`. The P#29 regression tests are the wall.
function decodeBytes(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le', 2);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString('utf8', 3);
  return b.toString('utf8');
}
// realpath where the target exists (symlink-aware, DF-001). For a target that does not exist
// yet, the realpath of its nearest EXISTING ancestor with the rest re-appended (M32.1.B, V-3): a
// new file written through a junction or symlink planted in a scratch home is judged by the
// directory it really lands in, not by the alias's lexical path. Lexical only when no ancestor
// resolves at all.
function realOrLexical(p) {
  const abs = path.resolve(p);
  try { return fs.realpathSync(abs); } catch (_) { /* not there yet: climb */ }
  const rest = [];
  let dir = abs;
  for (let guard = 0; guard < 256; guard++) {
    const parent = path.dirname(dir);
    if (parent === dir) return abs; // the filesystem root, and nothing on the way resolved
    rest.unshift(path.basename(dir));
    dir = parent;
    try { return path.join(fs.realpathSync(dir), ...rest); } catch (_) { /* keep climbing */ }
  }
  return abs;
}

// ---- the hook payload (Cx-2) ------------------------------------------------------------
// Bounded stdin: a hook's payload is kilobytes; read up to the cap and stop, so a never-closing
// or oversized stream cannot hang the edit / prompt path (IPC-001). A TTY yields ''.
const MAX_STDIN_BYTES = 1 << 20; // 1 MiB defensive ceiling
function readStdinBounded() {
  try {
    if (process.stdin.isTTY) return '';
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
  } catch (_) { return ''; }
}
// readHookInput() -> { raw, payload, root, claudeDir }. `payload` is the parsed JSON object or
// null (not JSON / not an object / an array) - each hook keeps its OWN policy on null (the
// red-gate allows, the mode-check treats raw as the prompt, the receipts adapter records
// nothing). `root` is repoRoot(payload); `claudeDir` is <root>/.claude.
function readHookInput() {
  const raw = readStdinBounded();
  let payload = null;
  try {
    const p = JSON.parse(raw);
    payload = (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  } catch (_) { payload = null; }
  const root = repoRoot(payload);
  return { raw, payload, root, claudeDir: path.join(root, '.claude') };
}

module.exports = { repoRoot, targetRoot, repoRootFor, decodeBytes, realOrLexical, readStdinBounded, readHookInput, MAX_STDIN_BYTES, CONTROL_FILES };
