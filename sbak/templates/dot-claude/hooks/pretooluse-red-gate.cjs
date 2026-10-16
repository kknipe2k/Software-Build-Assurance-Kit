#!/usr/bin/env node
// @kit-version 1.0.7
// .claude/hooks/pretooluse-red-gate.cjs
//
// PreToolUse hook (matcher Edit|Write|MultiEdit|NotebookEdit, and a second group with matcher
// Bash for the ONE release rule below - M32.1.B). The HARD form of
// the per-stage TDD red-stop (PROC-001): it blocks an IMPLEMENTATION
// edit until the human has run /approve-red on the RED tests. It makes the third
// approval gate (plan -> RED -> stage-end) structural instead of prose a builder
// can blow past — which is exactly what happened in M09.A.
//
// It BLOCKS (exit 2) only when ALL FOUR positively confirm:
//   1. the session is `work` mode             (.claude/role; absent -> work)
//   2. a stage is open                         (.claude/stage-active present)
//   3. the open stage is NOT red-approved      (.claude/red-approved absent or != stage)
//   4. the target is an IMPLEMENTATION path    (not a test / doc / .claude / allow-listed path)
//      — OR a path OUTSIDE the repo that is in none of the scratch homes (below)
//      — OR one of the gate's OWN control files (the self-approval carve), which are denied
//        even though the rest of .claude/** is allowed: an engaged gate must not be
//        agent-writable into approving itself.
// Anything else -> ALLOW (exit 0). Test paths, docs/, retrospectives/, .claude/
// (minus the three control files), root-level repo config (.gitignore, .gitattributes,
// .editorconfig), the scratch homes, a verifier/orchestrator session, or no open stage
// all proceed — the builder MUST be able to write the failing tests and fill the
// retro before approval.
//
// OUTSIDE THE REPO (M32.H, proposals/M32-FIELD-REPAIR.md §3.7, ruling R-15 plus the gate-1
// refinement): a path that resolves outside the repo root never reaches the allow globs (the
// `**/*.md` glob used to match a `../`-escaped path). Only the scratch homes pass: the session
// scratchpad tree (<tmpdir>/claude/), the durable stage scratch (<repo>/.claude/measurements/),
// and Claude Code's own memory and plan folders (~/.claude/projects/, ~/.claude/plans/). Every
// other outside-repo path is BLOCKED with a message naming them. The rest of ~/.claude/ stays
// blocked on purpose: its settings.json can switch every hook off. The control-file carve still
// runs first.
//
// WHICH REPO (M32.1.B, V-2; R-36, the §3.1 deviation that supersedes R-28 cwd-first for this
// gate): an ABSOLUTE tool path is judged by the repo above the target itself (hook-root's
// repoRootFor) - from a sibling repo's shell the session's own repo has no stage, and the gate
// went dormant for an edit into the stage repo, red-approved included. The session's repo is
// STILL judged too, with its own markers (gate-1 Q1): it is what keeps an outside-repo path
// blocked when that path's own root (a home kept in git, a stray ancestor .git) has no stage.
// Either one blocking blocks. A new file reached through a link is judged by its real parent
// (realOrLexical, V-3) for the carve, the homes and the repo boundary.
//
// THE ONE BASH RULE (M32.1.B, R-35 c): a Bash command that names approve-red.cjs runs only as
// the bare release command, whitespace-normalized and alone -
//   node scripts/approve-red.cjs --stage <id> --release-seq <n>     (n: digits, or none)
// - so the permission prompt the human clicks shows the stage and the seq, and nothing rides
// in front of it or after it (the drive's `; echo "exit=$?"`). It never parses shell; any
// other form is refused in one line, except one read-only command (M32.1.C, V-15: a listed verb
// first and no separator, substitution or redirect - see releaseRefusal). Every other Bash
// command exits 0 with no output, on every path, this hook's own internal error included.
//
// FAIL-OPEN BY DESIGN. This is a PROCESS gate, not a security boundary:
//   * it exits 2 ONLY on a positively-confirmed block; ANY error / ambiguity /
//     unparseable input exits non-2 so the platform's default (a non-2 exit lets
//     the tool run) degrades this to the soft red-stop — a hook bug must never
//     brick editing. The timeout direction is undocumented, so the stdin read is
//     BOUNDED and the hook stays fast; a never-closing / oversized stream cannot
//     hang the edit path.
//   * it matches the edit TOOLS, plus the one release-command rule above — a deliberate `Bash` heredoc write
//     (cat > impl.cjs) bypasses it. It is a bar-raise, not a wall.
//   * it stops implement-before-red; it does NOT catch test-deletion or
//     test-weakening (the documented AI-TDD failure mode). It is effective ONLY
//     paired with the human red-review + mutation-kill. Claim no more.
//
// Cross-platform (Node, no shell-isms). Dependency-free.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BLOCK = 2; // PreToolUse contract: exit 2 blocks the tool call.
const ALLOW = 0; // exit 0 allows it. (Any OTHER non-2 also lets the tool run.)

// THE REPO-ROOT RESOLVER (M32.A, §3.1): the one place every hook asks where the repo is -
// walk up from the payload cwd to a `.git` directory or worktree file, then CLAUDE_PROJECT_DIR,
// then the start dir. Also the shared bounded-stdin reader and marker decoder (the M32.R fold).
// This require is LOAD-BEARING on purpose: a gate that cannot find its resolver must not
// quietly fall back to the cwd anchor that failed open from a subfolder. It is loaded INSIDE
// main() (M32.1.B): a throw there degrades this hook to ALLOW, silently, through the outer try,
// exactly as any other hook fault does (fail-open by design, above). At module level it threw
// past that try - exit 1 and a stack trace, printed on every Bash call once this hook rides the
// Bash matcher. The install self-integrity check owns the missing-module case.
let hookRoot = null;

// ---- strict marker reads (mirror the A-stage hooks; absent role marker -> work) ----
const VALID_MODES = ['work', 'verifier', 'orchestrator', 'refactor'];
const NUL = String.fromCharCode(0);
function readMarker(claudeDir, name) {
  try {
    return hookRoot.decodeBytes(fs.readFileSync(path.join(claudeDir, name))).split(NUL).join('').trim();
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
// SINGLE-MARKER resolution (M28.F — the alias-window's fallback is removed).
// `.claude/role` is the only marker consulted. A present-but-garbage role FAILS CLOSED to
// 'unresolved' (DF-005) — the gate ENGAGES rather than guessing. ABSENT is the lone
// legitimate default -> 'work', which is also what a pre-rename project now resolves to:
// a retired marker can no longer DISENGAGE this gate.
function readMode(claudeDir) {
  if (fs.existsSync(path.join(claudeDir, 'role'))) return classifyRole(readMarker(claudeDir, 'role'));
  return 'work'; // ABSENT -> the lone legitimate default
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
  // M32.H: root-level repo config carries no implementation. The globs are anchored, so a
  // nested `<repo>/sub/.gitignore` (which can hide an implementation tree's artifacts) is not.
  '.gitignore', '.gitattributes', '.editorconfig',
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
// (e.g. a project's named test rig). Relativize an absolute path against the REPO ROOT
// BEFORE matching, or the gate over-blocks its own allow-listed test files (PROC-003).
// M32.A: the base is the resolved root, never the session cwd - from a subfolder the cwd
// base turned `<root>/<the project's test rig>` into `../../<the project's test rig>`, which
// matches no glob. path.relative emits OS separators (backslashes on Windows) — normRel (called
// downstream) folds those back to forward slashes so the relative glob matches.
function toRepoRel(rawPath, repoRootDir) {
  let p = String(rawPath);
  if (path.isAbsolute(p)) {
    try { p = path.relative(repoRootDir || process.cwd(), p); } catch (_) { /* keep as-is */ }
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

// ---- the scratch homes and the repo boundary (M32.H) ----
// Paths are compared RESOLVED: path.resolve, then realOrLexical (realpath where the target
// exists, the lexical form otherwise), lowercased on win32 only - the FS is case-insensitive
// there, and on a case-sensitive FS lowercasing would over-allow (the fail-open direction).
// Each root is compared in BOTH its lexical and its realpath form, with a trailing separator:
// on macOS the tmpdir sits under a symlinked system folder (var, whose real form is
// private/var), an existing target realpaths while a new one cannot, so one form alone
// false-blocks one of the two cases; the separator keeps <tmpdir>/claude-other/ from
// matching <tmpdir>/claude/.
function caseFold(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}
function rootForms(dir) {
  const lex = path.resolve(dir);
  const forms = [lex, hookRoot.realOrLexical(lex)].map((f) => caseFold(f.endsWith(path.sep) ? f : f + path.sep));
  return forms[0] === forms[1] ? [forms[0]] : forms;
}
function isUnder(target, roots) {
  return roots.some((r) => target.startsWith(r));
}
// The homes a builder may write outside the implementation tree during RED. A home whose
// base is unknown (an empty or relative tmpdir/homedir) is left out, never guessed.
function scratchHomes(repoRootDir) {
  const homes = [path.join(repoRootDir, '.claude', 'measurements')]; // the durable stage scratch
  const tmp = os.tmpdir();
  if (tmp && path.isAbsolute(tmp)) homes.push(path.join(tmp, 'claude')); // the session scratchpad tree
  const home = os.homedir();
  if (home && path.isAbsolute(home)) {
    homes.push(path.join(home, '.claude', 'projects')); // Claude Code's memory folders
    homes.push(path.join(home, '.claude', 'plans'));    // Claude Code's plan files
  }
  return homes;
}

// ---- the one Bash rule (M32.1.B, R-35 c) ----
// Any command naming the release script (case-insensitive: win32 runs APPROVE-RED.CJS as the same
// file) must be EXACTLY the bare release command once whitespace is normalized. Not a shell
// parser: anything in front of it, after it, or a different spelling of it is a refusal.
// M32.1.C (V-15): the name match stays the fail-closed trigger; ONE read-only command is not
// judged - no separator, substitution or redirect anywhere in it (; & | newline ` $( > <) and a
// listed read-only verb first. No verb with an exec path is listed (sed's `e` command runs a shell
// line; rg runs a program per file under --pre / --pre-glob, so rg with either is judged).
const RELEASE_NAMED = /approve-red\.cjs/i;
const RELEASE_EXACT = /^node scripts\/approve-red\.cjs --stage [A-Za-z0-9][A-Za-z0-9._-]{0,63} --release-seq (?:[1-9][0-9]{0,8}|none)$/;
const COMPOUND = /[;&|`<>\r\n]|\$\(/;
const READ_ONLY = /^(?:(?:cat|head|tail|wc|grep|rg|diff|cmp|ls|stat)|git (?:add|diff|show|log|blame|status|commit))(?: |$)/;
// -> null (not judged, or the exact form) or the one refusal line.
function releaseRefusal(command) {
  if (typeof command !== 'string' || !RELEASE_NAMED.test(command)) return null; // not judged: no output
  const norm = command.trim().split(/\s+/).join(' ');
  if (!COMPOUND.test(command) && READ_ONLY.test(norm) && !/^rg .*--pre(?:-glob)?(?:[ =]|$)/.test(norm)) return null;
  if (RELEASE_EXACT.test(norm)) return null;
  return '[red-gate] REFUSED - the release command runs only in its bare form, alone in the call: node scripts/approve-red.cjs --stage <id> --release-seq <n> (n is the pending approval-request seq, or none).\n';
}

function samePath(a, b) {
  return caseFold(path.resolve(a)) === caseFold(path.resolve(b));
}

// judge(root, rawPath) -> null (this root does not block) or the one refusal line, read entirely
// from THIS root's own markers. main() asks it about the target's root and the session's root.
function judge(root, rawPath) {
  const claudeDir = path.join(root, '.claude');

  // (2) a stage must be open for the gate to engage at all (dormant by default).
  const stageActive = readMarker(claudeDir, 'stage-active');
  if (!stageActive) return null;

  // (1) only a work session builds; verifier/orchestrator/refactor never implement -> ALLOW.
  //     DF-005 (M16.B): an UNRESOLVED (garbage) role value must NOT silently disable
  //     the gate (the fail-open outlier — the same value blocks/warns in the other two hooks).
  //     It fails CLOSED by ENGAGING the gate exactly as `work` does (fall through), so an
  //     implementation edit is blocked while a test/doc path still passes the (4) allow check.
  //     This adds NO new refusal of its own — the two confirmed refusals below (the
  //     control-file carve + the implementation-path block) stay the only edit-tool ones.
  //     ABSENT role marker remains the legitimate work default (readMode returns 'work').
  const mode = readMode(claudeDir);
  if (mode !== 'work' && mode !== 'unresolved') return null;

  // (3) already red-approved for THIS exact stage -> allow.
  const redApproved = readMarker(claudeDir, 'red-approved');
  if (redApproved && redApproved === stageActive) return null;

  // (4) non-implementation path (tests / docs / .claude / allow-listed) -> allow.
  //     Relativize first (PROC-003) so an absolute tool path matches the repo-relative globs.
  //     M32.1.B (V-3): the path is ALSO read in its real form - the realpath of its nearest
  //     existing ancestor - so a new file written through a link planted in a scratch home is
  //     judged where it really lands.
  const relPath = toRepoRel(rawPath, root);
  const absTarget = path.resolve(root, String(rawPath));
  const realAbs = hookRoot.realOrLexical(absTarget);
  const realRel = path.relative(hookRoot.realOrLexical(root), realAbs);

  // Self-approval deny-carve: the gate's OWN control files are refused BEFORE the allow
  // globs are consulted — no allow entry (the built-in '.claude/**' included, or any
  // red-gate-allow.txt line) may let an EDIT-TOOL write approve the agent's own
  // stage (red-approved), widen the allow list (red-gate-allow.txt), or rewire the
  // hooks (settings.json). The human path is untouched: /approve-red runs
  // scripts/approve-red.cjs as a plain process, not an edit tool. The compare is
  // dot-dot-normalized + lowercased (Windows FS is case-insensitive; over-blocking
  // an odd-cased path on a case-sensitive FS is the fail-closed direction). Both the
  // lexical and the real form are checked (M32.1.B: red-approved written through an alias
  // of .claude/ is the same self-approval). Honest residual: the carve binds only the
  // ENGAGED gate — outside an open un-approved work stage these files are as editable as
  // ever, and a Bash write still bypasses the hook entirely (it is a bar-raise, not a wall).
  const CONTROL_FILES = ['.claude/red-approved', '.claude/red-gate-allow.txt', '.claude/settings.json'];
  for (const rel of [relPath, realRel]) {
    if (CONTROL_FILES.indexOf(normRel(path.normalize(rel)).toLowerCase()) !== -1) {
      // M30.I (audit row 27): one plain sentence + the command when it bites.
      return `[red-gate] REFUSED — '${normRel(rel)}' is a red-gate control file, not agent-writable during an open un-approved stage; the human runs /approve-red (or: node scripts/approve-red.cjs --stage <id> --release-seq <n>).\n`;
    }
  }

  // M32.H: the scratch homes, then the repo boundary. A relative tool path is repo-relative,
  // exactly as toRepoRel reads it. A home is matched on the target's real form, so a link
  // planted in a home cannot carry an edit into the implementation tree.
  const lexTarget = caseFold(absTarget);
  const realTarget = caseFold(realAbs);
  if (scratchHomes(root).some((h) => isUnder(realTarget, rootForms(h)))) return null;
  const repoForms = rootForms(root);
  const outside = !isUnder(lexTarget, repoForms) && !isUnder(realTarget, repoForms);

  // An outside-repo path never reaches the allow globs: `**/*.md` would match its `../` form.
  // Inside the repo the globs read the path the edit really lands on.
  const globRel = isUnder(realTarget, repoForms) ? realRel : relPath;
  if (!outside && isAllowedPath(globRel, loadAllowGlobs(claudeDir))) return null;

  // All four confirmed -> a refusal. Two messages: outside the repo, or an implementation
  // path; the control-file carve above is the only other edit-tool refusal. main() exits 2 on
  // any of them at its one edit-tool site; the Bash rule is the hook's only other exit-2.
  // M30.I (audit row 27): one plain sentence + the command when it bites (the process-gate
  // honest-scope caveat lives in the /approve-red command doc, not in every refusal).
  return outside
    ? `[red-gate] Outside-repo edit blocked — '${absTarget}' is neither inside the repo nor in a scratch home; during an open un-approved stage the only writable places outside the repo are the session scratchpad (<tmpdir>/claude/...), <repo>/.claude/measurements/<stage>/, and Claude Code's memory and plan folders (~/.claude/projects/, ~/.claude/plans/).\n`
    : `[red-gate] Implementation edit blocked — '${normRel(globRel)}' is an implementation path and stage ${stageActive}'s RED tests are not approved yet; after the human reviews them they run /approve-red (or: node scripts/approve-red.cjs --stage <id> --release-seq <n>).\n`;
}

function main() {
  hookRoot = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'hook-root.cjs')); // inside main: a missing resolver degrades to a silent ALLOW
  // Parse the PreToolUse payload. Any failure -> fail OPEN (let the edit run).
  // M32.A: the parse-plus-root block lives in hook-root.cjs (readHookInput): the markers are
  // read from the REPO ROOT - resolved from the payload cwd by walking up to `.git` - never
  // from the session cwd, which a Bash `cd` moves into a subfolder where no marker lives.
  const { payload, root } = hookRoot.readHookInput();
  if (!payload) process.exit(ALLOW);

  const ti = payload.tool_input || {};
  if (payload.tool_name === 'Bash') {
    const bashRefusal = releaseRefusal(ti.command);
    if (!bashRefusal) process.exit(ALLOW); // not the release command, or its exact form: no output
    process.stderr.write(bashRefusal);
    process.exit(BLOCK); // exit-2 site 1 of 2: the one Bash rule
  }
  const rawPath = ti.file_path || ti.notebook_path || ti.path;
  if (typeof rawPath !== 'string' || rawPath.length === 0) process.exit(ALLOW); // no path -> can't classify -> allow

  // M32.1.B (V-2): the target's own root first, then the session's - each judged with its own
  // markers; either one blocking blocks, the target's refusal named first.
  const targetRepo = hookRoot.repoRootFor(payload, rawPath);
  const refusal = judge(targetRepo, rawPath) || (samePath(targetRepo, root) ? null : judge(root, rawPath));
  if (!refusal) process.exit(ALLOW);
  process.stderr.write(refusal);
  process.exit(BLOCK); // exit-2 site 2 of 2: the edit-tool judgment (the carve or a confirmed block)
}

// Any internal error degrades to soft (non-2) — never block on a hook bug.
try { main(); } catch (_) { process.exit(ALLOW); }
