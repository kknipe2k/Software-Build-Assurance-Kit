#!/usr/bin/env node
// @kit-version 1.0.3
// validators/validate-transition.cjs
//
// The G15 transition gate, shipped framework-wide so
// every generated project inherits it. "Released" is the most load-bearing transition a
// project makes, and the kit's own transitions historically RACED (the truncate-then-write
// active-mode window) and LIED ("0 self-correction rounds" while rebuilds
// happened). G15 makes BOTH structural — two content-gated clauses, each a no-op on an
// irrelevant file (the same grandfather instinct as the reconciliation / risk-matrix gates):
//
//   CLAUSE 1 — ATOMIC durable-state writes (the truncate-write race generalized). A transition
//     that writes a DURABLE-STATE file — the red-gate / 3-brain markers `.claude/active-mode`
//     (set-mode.cjs) / `.claude/stage-active` (stage-active.cjs) / `.claude/red-approved`
//     (approve-red.cjs), or a `*-state.md` ledger (docs/release-state.md and kin) — must use
//     WRITE-TEMP-RENAME (write a temp file, then atomically rename it over the real path),
//     NEVER truncate-then-write (a crash mid-write leaves a half-written marker → the race).
//     A direct `writeFileSync`/`writeFile` of such a path → BLOCK. (The marker
//     names are the ones the writers actually use — `stage-active`, not the reversed
//     `active-stage` a filename nothing writes; `red-approved` was previously uncovered.)
//
//     SCOPED TIGHTLY (red-review): the match is the SPECIFIC durable-state path, NOT a bare
//     `active-mode` basename — a write to `<tmpdir>/active-mode` in a test is a scratch
//     file, not a transition. And clause 1 SKIPS test/harness source files (*.test.* /
//     *.spec.* / smoke.cjs / bake-inheritance.cjs / anything under tests|__tests__|fixtures|
//     validators) + temp/tmpdir write targets — so a state-named `writeFileSync` STRING in
//     a fixture (smoke.cjs is full of them) never blocks a commit. Floor only; the resolver
//     reads inline string literals + simple `const x = <expr>` bindings, not arbitrary
//     dataflow (presence-gated — Stage V is the adversary for an obfuscated
//     state-write).
//
//   CLAUSE 2 — HONEST rework reconciliation (DORA's 5th metric, project-internal). A
//     closeout / release entry's ```rework block must break rework across the FOUR FIXED
//     types — implementation corrections / verifier iterations / IRL reversals / post-merge
//     discoveries — and its total must RECONCILE against the fix-commit evidence. A block
//     OMITTING a type → BLOCK (the breakdown is the honest unit, not a lump sum). A total
//     that UNDER-REPORTS the recomputed fix-commit count (the "0 rework while fix commits
//     exist" lie) → BLOCK. The fix-commit count is a LOWER BOUND on true rework, so honest
//     OVER-reporting passes; only under-reporting is the lie (red-review-confirmed
//     under-report semantics, NOT exact-equality).
//
//     EXTENDS, DOES NOT FORK (the duplication lesson): the recompute reuses
//     validate-reconciliation.cjs's `recomputeCount` primitive — the SAME engine reconciliation uses
//     to recompute a closeout count from a git-log / ledger — never a parallel count check.
//
//   CLAUSE 2 — false-positive removal + stale-base fragility. The
//     rework match is LINE-ANCHORED (a fence at a line start, not an inline mention mid-
//     prose) and a fenced block counts as a DECLARATION only when its body carries a
//     concrete four-type breakdown — so an illustrative/inline fence in prose, or a
//     {{placeholder}} retro TEMPLATE, is SKIPPED, not blocked (it recurred, worked
//     around by rewording). And the rework recompute base is the REAL
//     `git merge-base origin/main HEAD` (not a blindly-trusted author `range:`); a declared
//     `range:` base that DISAGREES with the computed merge-base is BLOCKED (the stale/wrong-
//     base tell). The under-report teeth are unchanged.
//
//   CLAUSE 2 — frozen-history exemption (PORTABILITY axis). An earlier fix scoped the
//     base-currency check to the FIRST (topmost = newest) declaration block. That solved
//     frozen-vs-topmost AT AUTHORING TIME but went STALE once history moved past the block: after
//     an M-merge the merge-base advances, so the frozen-but-still-TOPMOST prior block's declared
//     base (correct at ITS commit) now disagrees with the live merge-base and RE-FLAGGED — a
//     current clone's `validate-transition CHANGELOG.md` exited 1 on any commit staging the
//     multi-entry CHANGELOG. The current fix ports the reconciliation gate's PORTABILITY discipline:
//       • The base-CURRENCY check (declared base vs live merge-base) is inherently TIME-DEPENDENT
//         — only meaningful at the moment the block is AUTHORED — so it is scoped to STAGED-ADDED
//         rework blocks ONLY (the closeout's own commit gate). In FILE mode a frozen block's
//         declared base is a HISTORICAL record → NO currency check (never re-litigated).
//       • The git RECOMPUTE / under-report teeth are STAGED-ADDED-scoped (STRICTER than the
//         reconcile edition). WHY: a rework `pattern:` is fix-SHAPED (`fix`, `[A-Z]-fix|PC-[0-9]`),
//         NOT milestone-anchored like a reconcile pattern (`^M16\.`). A milestone pattern's match
//         set is FROZEN as HEAD advances, so a portable reconcile block recomputes the same
//         forever (safe file-wide). A fix-shaped pattern's match set GROWS — a later in-range fix
//         commit inflates a frozen block's recomputed count past its honest total → false-flag
//         (the same disease one turn later). So the git recompute is sound only at the block's OWN
//         authoring moment (the STAGED-ADDED gate, where <base>..HEAD is bounded to that commit);
//         in FILE mode a frozen git block gets static shape checks only, never a recompute. A
//         NON-git (`source: <file>`) rework count is deterministic per commit, so it stays
//         file-wide (the portability boundary) — but in practice rework is git-sourced.
//       • Parallel to the reconciliation gate's staged gate: a staged-ADDED rework block whose range base is a
//         MUTABLE ref (`main..HEAD` etc.) BLOCKS with "cite an absolute-SHA base",
//         turning the BUILD-PLAYBOOK §3.5 absolute-SHA rule from honor-system into a GATE.
//     Net: the frozen prior blocks are never re-litigated (no growing-range false-flag);
//     every FUTURE closeout block is currency- + portability-gated at its own commit.
//
// HONEST LIMITATION — presence-gated (no false confidence; same class as the reconciliation
// / risk-matrix gates): the static floor proves the PATTERN (write-temp-rename present, the
// four types present, the total reconciles against the named source). Whether a transition
// raced under a subtler write, or a fix was mislabeled to dodge the count, is judgment — the
// ADVERSARIAL half is Stage V (whether any transition raced or under-counted). Floor (this
// validator) + adversary (V) = a real gate; neither alone is.
//
// HONEST LIMITATION — THE MERGE-BASE IS LOCAL. The rework
// recompute resolves `git merge-base origin/main HEAD`, but a LOCAL pre-commit CANNOT fetch.
// TWO distinct cases, not one:
//   • ABSENT/unresolvable local `origin/main` (no remote, or never fetched) → `merge-base`
//     errors → gitMergeBaseOriginMain() returns null → NO base check (fail-soft: fall back
//     to the declared range, no flag).
//   • STALE-BUT-PRESENT `origin/main` (fetched once, now behind) → `merge-base` resolves to
//     a (stale) SHA, so the validator DOES compute that stale merge-base and check the
//     declared range: base against it — a declared base disagreeing with the STALE base is
//     still flagged (the check runs against the stale base, not the live one).
// So a stale ref is not "no check" — it is a check against a stale base. The robust base is
// guaranteed by the closeout fetch-first discipline (BUILD-PLAYBOOK §3.5) + the CI/pre-push
// fetch backstop, not pretended airtight locally.
//
// Severity / the toggle (mirrors the other validators, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed branch (exit 2)
//                      is NEVER downgraded by --warn.
//
// Usage:
//   node validators/validate-transition.cjs [--warn] <file>...
//   node validators/validate-transition.cjs [--warn] --staged   # the staged set
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (unreadable file, or a git error in --staged /
//          the rework recompute).
//
// Dependency-free (beyond the sibling validate-reconciliation primitive), cross-platform,
// CRLF-tolerant. .cjs = always CommonJS regardless of the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// EXTEND reconciliation's primitive (recompute the fix-commit count), do not fork it.
// Also REUSE its portability discipline — the mutable-ref
// predicate and the staged-added detection, now POSITIONAL (`stagedAddedLineRanges` +
// `blockIsStagedAdded`) — rather than forking a parallel copy (the duplication lesson).
const {
  recomputeCount, isMutableRefRange, stagedAddedLineRanges, blockIsStagedAdded,
} = require('./validate-reconciliation.cjs');
// CONSUME the line-anchored fence primitive, extended with a
// position-aware variant so a rework block carries its { startLine, endLine } span — block identity
// by POSITION, the fix for the set-membership aliasing the retired bodyIsAdded suffered.
const { extractBlocksWithPos } = require('./lib/fenced-block.cjs');

// CRLF (and lone CR) → LF so a Windows checkout doesn't read as a false divergence.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ───────────────────────── clause 1: atomic durable-state writes ─────────────────────────
// The markers guarded below are the real red-gate state files —
// `.claude/active-mode` / `.claude/stage-active` / `.claude/red-approved` — plus any
// `*-state.md` ladder ledger. The pre-fix code named a phantom `active-stage` and missed
// `red-approved`; see STATE_PATH_RE.

// The SPECIFIC durable-state paths (collapsed-literal form, see collapseLiterals). The markers
// carry a `.claude/` directory component (a bare basename is NOT matched — red-review scoping);
// the ladder ledger is any `*-state.md`.
//
// The real markers the PROC-001 red-gate keys off are `.claude/stage-active` (the
// open-stage marker; writer scripts/stage-active.cjs) and `.claude/red-approved` (the approval
// marker; writer scripts/approve-red.cjs). The pre-fix pattern guarded `.claude/active-stage` — a
// reversed word order that NOTHING writes — and did not cover `red-approved` at all, so G15
// clause 1 could never fire on the two files it most needs to protect (a truncate-write of either
// is the exact truncate-write corruption class).
//
// M28.F: the session-role marker's compatibility alias is RETIRED, so the guarded set
// narrows to `.claude/role`. Nothing writes the retired name any more, and a rule that guards a
// path the product no longer has is a rule that quietly stops meaning anything — the honest move
// is to drop it, not to carry it for reassurance. The retired name is recorded in
// the development history.
const STATE_PATH_RE = /\.claude\/(?:role|stage-active|red-approved)\b|[\w-]*-state\.md\b/;

// A temp form or a tmpdir/scratch target — the SAFE half of write-temp-rename, never flagged.
// Extended with the per-language temp idioms — Python tempfile/mkstemp,
// Go os.CreateTemp, Rust tempfile/NamedTempFile — so each language's durable-write pattern
// (temp + rename/replace) passes exactly like the JS write-temp-rename.
const TEMP_RE = /\.tmp\b|\btmpdir\b|\bmkdtemp\b|\bmkstemp\b|\btempfile\b|\bNamedTemporaryFile\b|\bCreateTemp\b|\bNamedTempFile\b|\btemp_dir\b/i;

// A test / harness source file whose `writeFileSync(...state...)` text is a FIXTURE, not a
// real transition. Excluded from clause 1 so a state-named write in test code (e.g.
// smoke.cjs's own fixture strings, staged in this very milestone) never blocks a commit.
// Per-language test-file shapes join the exclusion — Python test_*/_test.py,
// Go *_test.go, Ruby *_spec/_test.rb — the same fixture-not-transition reasoning.
function isTestOrHarness(file) {
  const base = path.basename(file).toLowerCase();
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) return true;
  if (/^test_[^\\/]*\.py$/.test(base) || /_test\.py$/.test(base)) return true;
  if (/_test\.go$/.test(base)) return true;
  if (/_(?:test|spec)\.rb$/.test(base)) return true;
  // smoke-project.cjs is the SHIPPED mini-smoke — its state-named writes are
  // sandbox fixtures, the same harness class as smoke.cjs / bake-inheritance.cjs.
  if (base === 'smoke.cjs' || base === 'bake-inheritance.cjs' || base === 'smoke-project.cjs') return true;
  const norm = file.replace(/\\/g, '/');
  if (/(^|\/)(tests?|__tests__|fixtures?|validators)\//i.test(norm)) return true;
  return false;
}

// Join the string-literal segments of a path expression with '/', so a path built from
// separate join args is matched the same as an inline literal:
//   path.join(base, '.claude', 'active-mode')  →  ".claude/active-mode"
//   '.claude/active-mode'                        →  ".claude/active-mode"
function collapseLiterals(expr) {
  const segs = [];
  const re = /(['"`])((?:\\.|[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(expr)) !== null) segs.push(m[2]);
  return segs.join('/');
}

// THE ENFORCEMENT POINT (atomic-transition mutant target). A durable-state write is
// a violation iff its (collapsed) target is a SPECIFIC state path AND is NOT a temp/tmpdir
// write. Reverting this body to `return false` ("any write passes") makes the
// "truncate-then-write of a state file -> blocks" smoke test go RED while the write-temp-
// rename + false-positive controls stay green. The mutation is killed specifically here.
function isTruncateWriteViolation(argExpr, collapsed) {
  if (TEMP_RE.test(argExpr) || TEMP_RE.test(collapsed)) return false; // the write-temp half
  return STATE_PATH_RE.test(collapsed);
}

// Parse the FIRST argument expression of a call whose '(' is at openIdx. Balanced-paren +
// quote aware, so commas inside `path.join(a, b, c)` don't truncate the argument.
function firstCallArg(text, openIdx) {
  let depth = 0;
  let inStr = null;
  let arg = '';
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      arg += c;
      if (c === inStr && text[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; arg += c; continue; }
    if (c === '(') { depth++; if (depth === 1) { arg = ''; continue; } }
    else if (c === ')') { depth--; if (depth === 0) return arg.trim(); }
    else if (c === ',' && depth === 1) return arg.trim();
    arg += c;
  }
  return arg.trim();
}

function describeTarget(collapsed) {
  const m = collapsed.match(STATE_PATH_RE);
  return m ? m[0] : collapsed;
}

// ── Per-language routing — JS/TS/JSX/TSX, Python, Go, Rust (all in).
// The extension IS the language: keying detection off a project-config stack declaration
// would let an undeclared stack dodge the gate (the silent-blind-spot class this closes).
// Ruby/Java-class stacks stay visible-skip (the pre-commit disclosure line).
function langOf(file) {
  if (/\.[cm]?[jt]sx?$/i.test(file)) return 'js'; // .js/.cjs/.mjs/.jsx/.ts/.tsx — same fs API
  if (/\.py$/i.test(file)) return 'py';
  if (/\.go$/i.test(file)) return 'go';
  if (/\.rs$/i.test(file)) return 'rs';
  return null;
}

// Strip comments for the non-JS languages before pattern-matching, so a comment naming the
// banned call is never a false positive (the substring-theater guard, per-language). The JS
// path deliberately keeps its original un-stripped behavior (no regression risk). Floor
// tolerance: a string literal containing comment markers may over-strip — Stage V is the
// adversary for obfuscated writes, as ever (presence-gated).
function stripLangComments(text, lang) {
  if (lang === 'py') {
    // Triple-quoted strings (docstrings) are prose, not code — strip them FIRST, then
    // # comments, so a docstring merely mentioning the banned call is never a false
    // positive (verifier live-proven). Order matters: a # inside a
    // docstring must not eat the closing quotes. Single-line string mentions remain
    // the disclosed floor tolerance above.
    return text
      .replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '')
      .replace(/#[^\n]*/g, '');
  }
  // go / rs: line + block comments
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Full argument span (all args) of a call whose '(' is at openIdx — balanced + quote-aware.
// Python's open() carries its write mode in arg 2, so the mode test needs the whole span.
function fullCallArgs(text, openIdx) {
  let depth = 0;
  let inStr = null;
  let args = '';
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      args += c;
      if (c === inStr && text[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; args += c; continue; }
    if (c === '(') { depth++; if (depth === 1) { args = ''; continue; } }
    else if (c === ')') { depth--; if (depth === 0) return args; }
    if (depth >= 1) args += c;
  }
  return args;
}

// The per-language TRUNCATE-WRITE call shapes. Each entry: a call-open regex and
// which span to judge (first arg vs all args) plus an extra predicate (Python's 'w' mode).
// Anchored call patterns, never bare words: Rust's `write!` formatting macro does not match
// `fs::write(`; Go's `os.Rename(tmp, statePath)` is a rename, not a write; a Python
// `os.replace(` is the SAFE half. Zero-false-positive evidence lives in the smoke controls.
const LANG_WRITE_CALLS = {
  js: [{ re: /\bwriteFile(?:Sync)?\s*\(/g, span: 'first' }],
  py: [
    // open(<state>, 'w'|'wb'|'w+'|'wt'): truncate-on-open. The mode literal must be present.
    { re: /\bopen\s*\(/g, span: 'all', extra: (args) => /['"]w[bt+]?['"]/.test(args) },
    // Path(<state>).write_text(...) / .write_bytes(...): truncate-write. The state path rides
    // the receiver expression on the same line, captured via the lookbehind slice below.
    { re: /\.write_(?:text|bytes)\s*\(/g, span: 'receiver' },
  ],
  go: [
    { re: /\b(?:os|ioutil)\.WriteFile\s*\(/g, span: 'first' },
    { re: /\bos\.Create\s*\(/g, span: 'first' },
  ],
  rs: [
    { re: /\b(?:std::)?fs::write\s*\(/g, span: 'first' },
    { re: /\bFile::create\s*\(/g, span: 'first' },
  ],
};

function checkAtomic(file, text, findings) {
  if (isTestOrHarness(file)) return; // a fixture's state-named write is not a transition
  const lang = langOf(file);
  if (lang === null) return; // not a routed source language
  const norm = lang === 'js' ? normalize(text) : stripLangComments(normalize(text), lang);

  // resolve simple `const|let|var X = <expr>` bindings (last assignment wins) so a write to
  // a variable destination is matched against its assigned path expression (JS path only —
  // the non-JS floors judge the call span directly).
  const assign = {};
  if (lang === 'js') {
    const assignRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
    let a;
    while ((a = assignRe.exec(norm)) !== null) assign[a[1]] = a[2];
  }

  for (const call of LANG_WRITE_CALLS[lang]) {
    call.re.lastIndex = 0;
    let c;
    while ((c = call.re.exec(norm)) !== null) {
      const openIdx = norm.indexOf('(', c.index + c[0].length - 1);
      let arg;
      if (call.span === 'all') arg = fullCallArgs(norm, openIdx);
      else if (call.span === 'receiver') {
        // judge the receiver expression: the slice from the start of the statement line
        // through the call's args (Path("...state...").write_text(x)).
        const lineStart = norm.lastIndexOf('\n', c.index) + 1;
        arg = norm.slice(lineStart, openIdx) + ' ' + fullCallArgs(norm, openIdx);
      } else {
        arg = firstCallArg(norm, openIdx);
        if (lang === 'js' && /^[A-Za-z_$][\w$]*$/.test(arg) && assign[arg]) arg = assign[arg];
      }
      if (call.extra && !call.extra(lang === 'py' && call.span === 'all' ? fullCallArgs(norm, openIdx) : arg)) continue;
      const collapsed = collapseLiterals(arg) || arg;
      if (isTruncateWriteViolation(arg, collapsed)) {
        findings.push(
          `${file}: NON-ATOMIC durable-state write — a direct truncate-then-write of ` +
          `"${describeTarget(collapsed)}". A transition that writes durable state must ` +
          `WRITE-TEMP-RENAME (write a temp file, then atomically rename/replace it over ` +
          `the real path), never truncate-then-write (the truncate-write race generalized, ` +
          `atomic transitions; stack-aware per language). Fail-safe by construction.`
        );
      }
    }
  }
}

// ───────────────────────── clause 2: honest rework reconciliation ────────────────────────

// The FOUR FIXED rework types (DORA's 5th metric, project-internal). The breakdown
// is the honest unit — a closeout may not report rework as a lump sum.
const FOUR_TYPES = ['implementation', 'verifier', 'irl', 'post-merge'];

// A `{{placeholder}}` value (a retro TEMPLATE's un-filled slot).
const PLACEHOLDER_RE = /\{\{.*\}\}/;

// Extract every ```rework ... ``` block WITH its line span. Delegates to the shared primitive's
// position-aware extractor — validate-transition's own line-anchor originally proved this shape
// (generalized into fenced-block.cjs; the { startLine, endLine } span was added later).
// LINE-ANCHORED: the opening AND closing fence must sit at a line start, so an INLINE
// ```rework mention mid-line in prose (a changelog bullet, a doc example, this validator's own
// header) is NOT matched — skipped, not blocked. The span is the block's IDENTITY for staged-added
// scoping (blockIsStagedAdded) — a duplicate or a verbatim quote is a distinct span, never an
// alias. The four-type-body declaration gate (isReworkDeclaration) is the second
// half of the line-anchor fix.
function extractRework(text) {
  return extractBlocksWithPos(text, 'rework');
}

// Parse `key: value` lines into a lower-cased-key object (first colon splits).
function parseKV(body) {
  const o = {};
  for (const line of normalize(body).split('\n')) {
    const m = line.match(/^\s*([^:\n]+?)\s*:\s*(.*?)\s*$/);
    if (m) o[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return o;
}

// THE DECLARATION GATE. A line-anchored ```rework block is a REAL
// declaration when it carries either a concrete four-type breakdown OR reconciliation
// metadata (a non-placeholder `source:`) — so a lump-sum block that omits the four types
// but still cites where to recompute is checked (and blocks for omitting the breakdown),
// not silently skipped. The order is PLACEHOLDER-PRECEDENCE, NOT a naive source-trigger:
//   1. some four-type keys present + ALL placeholders → a retro TEMPLATE → SKIP. This MUST
//      come first: the shipped retro templates carry a literal `source: git` beside their
//      {{N}} placeholders, so a source-first check would mis-read a template as a real
//      declaration and reintroduce the exact inline-fence false-positive.
//   2. some four-type keys present (non-placeholder) → a real four-type declaration.
//   3. no four-type keys but a non-placeholder `source:` → a source-bearing lump sum (the
//      lump-sum gap: caught downstream as an omitted four-type breakdown).
//   4. otherwise (prose / inline / placeholder-only source) → SKIP.
// Keyed on the TYPE VALUES (and the source value) only, so a real concrete declaration
// carrying a stray {{...}} in a reason/commentary field is NOT skipped.
function isReworkDeclaration(kv) {
  const present = FOUR_TYPES.filter((t) => kv[t] !== undefined);
  if (present.length > 0 && present.every((t) => PLACEHOLDER_RE.test(kv[t]))) return false; // {{template}}
  if (present.length > 0) return true;                                          // real four-type decl
  if (kv.source !== undefined && !PLACEHOLDER_RE.test(kv.source)) return true;  // source-bearing lump sum
  return false;                                                                 // prose / inline / placeholder-source
}

// Resolve `git merge-base origin/main HEAD` — the robust "where did this branch diverge"
// base. Returns the SHA, or null when origin/main is unresolvable (no remote / un-fetched):
// the HONEST LIMITATION — a local pre-commit cannot fetch, so an absent/stale
// origin/main yields no base check (the CI/pre-push fetch is the backstop). cwd = the process
// cwd (the repo the file lives in, as the pre-commit / smoke caller sets it).
function gitMergeBaseOriginMain() {
  const r = spawnSync('git', ['merge-base', 'origin/main', 'HEAD'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

// Resolve a ref/sha to its commit SHA (null if it does not resolve).
function gitResolveCommit(ref) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

// Extract the BASE ref of a git range expression: `BASE..HEAD` / `BASE...HEAD` / `BASE..`.
// Returns null for a bare ref (`HEAD`) or a placeholder — no base to compare.
function rangeBase(range) {
  if (!range || PLACEHOLDER_RE.test(range)) return null;
  const m = String(range).match(/^\s*([^.\s]+)\.\.\.?/);
  return m ? m[1] : null;
}

// THE ENFORCEMENT POINT (honest-rework mutant target). Under-report semantics: the
// recomputed fix-commit count is a LOWER BOUND on true rework, so the stated total must be
// AT LEAST it; honest over-reporting passes. Reverting this body to `return false` ("any
// stated count passes") makes the "0 rework with fix commits -> blocks" smoke test go RED
// while the honest-count control stays green. The mutation is killed specifically here.
function isReworkUndercount(total, recomputed) {
  return total < recomputed;
}

// THE ENFORCEMENT POINT (stale-base mutant target). A declared range: base that
// DISAGREES with the computed merge-base is the stale/wrong-base tell (the stale-base
// fragility). Reverting this body to `return false` ("any declared base passes") makes the
// "declared base != merge-base -> flagged" smoke test go RED while the correct-base control
// and the teeth (under-report still blocks) stay green. Killed specifically here. A null on
// either side (origin/main unresolvable, or an unresolvable declared ref) → no flag (the
// honest local-pre-commit limitation), never a false block.
function isReworkBaseMismatch(declaredBaseSha, mergeBaseSha) {
  if (!declaredBaseSha || !mergeBaseSha) return false;
  return declaredBaseSha !== mergeBaseSha;
}

function checkRework(file, text, findings, opts) {
  opts = opts || {};
  // Portability axis (supersedes the earlier topmost-scoping). The
  // base-CURRENCY check (2a: declared base vs the LIVE merge-base) is inherently time-dependent
  // — only meaningful at the moment the block is AUTHORED — so it fires ONLY on a STAGED-ADDED
  // block (the closeout's own commit gate). In FILE mode a frozen block's declared base is a
  // historical record → no currency check (never re-litigated as the merge-base advances). The
  // git RECOMPUTE is scoped by RANGE PORTABILITY: an absolute-SHA-based (portable) block
  // recomputes FILE-WIDE over its DECLARED range (deterministic per commit); a MUTABLE-ref range
  // is skipped in file mode and BLOCKED when staged-added (cite an absolute-SHA base).
  // The static clauses (omitted breakdown, integer values, under-report) stay on every checked
  // block. The earlier `declSeen === 1` topmost heuristic is removed — it went stale post-merge
  // (the frozen-but-still-topmost prior block re-flagged; the live defect this fix resolves).
  for (const blk of extractRework(text)) {
    const body = blk.body; // { body, startLine, endLine } — blk carries the span for positional identity
    const kv = parseKV(body);

    // Only a REAL four-type declaration is checked; an illustrative / inline /
    // {{placeholder}} fence is skipped, not blocked.
    if (!isReworkDeclaration(kv)) continue;

    // (1) all four fixed types must be present — a missing type is an omitted breakdown.
    const missing = FOUR_TYPES.filter((t) => kv[t] === undefined);
    if (missing.length) {
      findings.push(
        `${file}: a \`\`\`rework block OMITS the four-type breakdown — missing: ${missing.join(', ')}. ` +
        `Rework must break down across implementation / verifier / irl / post-merge ` +
        `(the fixed four types, DORA's 5th metric) — never a lump sum.`
      );
      continue;
    }

    // each type value must be a non-negative integer.
    const raw = FOUR_TYPES.map((t) => String(kv[t]).trim());
    if (raw.some((v) => !/^\d+$/.test(v))) {
      findings.push(
        `${file}: a \`\`\`rework type value is not a non-negative integer ` +
        `(${FOUR_TYPES.map((t, i) => `${t}: ${raw[i]}`).join(', ')}).`
      );
      continue;
    }
    const total = raw.reduce((s, v) => s + parseInt(v, 10), 0);

    // (2) reconcile the total against the recomputed fix-commit evidence (extends reconciliation).
    if (!kv.source) {
      findings.push(
        `${file}: a \`\`\`rework block has no \`source:\` field (where to recompute the fix-commit ` +
        `evidence — e.g. \`source: git\` + \`range:\` + \`pattern:\`).`
      );
      continue;
    }

    // (2a) The git recompute (currency + under-report) is STAGED-ADDED-scoped; file mode
    //      runs ONLY the static shape checks above. WHY STRICTER THAN THE RECONCILE EDITION (which
    //      keeps portable git blocks file-wide): a rework `pattern:` is fix-SHAPED (`fix`,
    //      `[A-Z]-fix|PC-[0-9]`), NOT milestone-anchored like a reconcile pattern (`^M16\.`). A
    //      milestone pattern's match set is FROZEN as HEAD advances (future M17 commits don't
    //      match `^M16\.`), so an absolute-SHA reconcile block recomputes the same forever. A
    //      fix-shaped pattern's match set GROWS — a later in-range fix commit inflates a frozen
    //      block's recomputed count past its honest claimed total → false-flag (the same disease,
    //      one turn later). So the rework recompute is only sound at the
    //      block's OWN authoring moment, where the `<base>..HEAD` range is bounded to that commit —
    //      i.e. the STAGED-ADDED gate. A frozen (non-added) git block is never recomputed.
    const directive = { source: kv.source, range: kv.range, pattern: kv.pattern };
    if (kv.source === 'git') {
      if (opts.stagedAdded == null) {
        // FILE mode — static shape checks only (done above); the currency + under-report teeth
        // live at the commit gate. Skip the time-dependent git recompute entirely (never
        // re-litigate a frozen block against a range that grows with history).
        continue;
      }
      // STAGED mode — only the block(s) THIS commit ADDS carry the currency + portability gate
      // + the recompute (bounded to this authoring moment). Identity is POSITIONAL (the
      // block's line span ∈ the staged-added line ranges) — a duplicate or a verbatim quote of a
      // frozen block's body can no longer alias it as "added" (the set-membership false-block).
      if (!blockIsStagedAdded(blk, opts.stagedAdded)) continue; // frozen (not added) — never re-litigated
      if (isMutableRefRange(kv.range)) {
        findings.push(
          `${file}: a staged \`\`\`rework block cites a MUTABLE range base in "${kv.range}" — cite an ` +
          `ABSOLUTE-SHA base (\`<sha>..HEAD\`), never a mutable local ref like \`main..HEAD\` ` +
          `(BUILD-PLAYBOOK §3.5): a mutable-ref range recomputes to 0 on any clone whose local ref has ` +
          `caught up (a fresh clone / CI / post-merge), false-blocking future commits.`
        );
        continue; // blocked on portability — do not recompute a non-portable range
      }
      // base-currency: an ADDED block's declared base must equal the LIVE merge-base (the
      // stale-base teeth, now staged-scoped). Unresolvable origin/main → no flag (the local-can't-fetch
      // honest limitation; CI/pre-push fetch is the backstop).
      const mergeBase = gitMergeBaseOriginMain();
      const declaredBase = mergeBase ? rangeBase(kv.range) : null;
      if (declaredBase) {
        const declaredSha = gitResolveCommit(declaredBase);
        if (isReworkBaseMismatch(declaredSha, mergeBase)) {
          findings.push(
            `${file}: a staged \`\`\`rework block declares range base \`${declaredBase}\` (${declaredSha}) but the ` +
            `real \`git merge-base origin/main HEAD\` is ${mergeBase} — a stale/wrong declared base (the ` +
            `stale-base fragility). Fetch origin first (BUILD-PLAYBOOK §3.5), then cite the live ` +
            `merge-base as an absolute SHA. The durable range: cite must be honest.`
          );
        }
      }
      // fall through to the recompute below (bounded to this authoring moment).
    }
    // The recompute runs for: staged-added git blocks (bounded to authoring), and NON-git sources
    // in ANY mode (a file/ledger count is deterministic per commit — the portability boundary, file-wide).
    // A file-mode git block already `continue`d above.

    let recomputed;
    try {
      recomputed = recomputeCount(directive);
    } catch (err) {
      // a typo'd source / bad pattern must fail LOUD — never silently pass as 0==0.
      findings.push(
        `${file}: ${(err && err.msg) || (err && err.message) || 'cannot recompute rework source'} — ` +
        `refusing to pass a rework count that cannot be recomputed (fail-loud).`
      );
      continue;
    }
    if (isReworkUndercount(total, recomputed)) {
      const zero = total === 0 ? `claims 0 rework but ${recomputed} fix commit(s) exist — ` : '';
      findings.push(
        `${file}: ${zero}rework total ${total} UNDER-REPORTS the ${recomputed} fix commit(s) the ` +
        `evidence recomputes (${kv.source}${kv.pattern ? ` /${kv.pattern}/` : ''}). The fix-commit ` +
        `count is a lower bound on true rework — honest over-reporting is fine, under-reporting is ` +
        `the dishonest "0 self-correction rounds while rebuilds happened" lie (honest rework).`
      );
    }
  }
}

// ─────────────────────────────────── staged-set + main ──────────────────────────────────

// FAIL CLOSED: a `git diff --cached` failure must surface and exit non-zero,
// never collapse to an empty staged set → silent PASS.
function stagedFiles() {
  let out;
  try {
    out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown git error';
    process.stderr.write(
      `FAIL  cannot enumerate staged files via \`git diff --cached\`: ${detail}\n` +
      `      Refusing to pass the transition gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  // clause 1 reads source files (the six-language set); clause 2 reads markdown
  // closeout/ledger files.
  return out.split(/\r?\n/).filter((f) => f && /\.(c|m)?[jt]sx?$|\.(py|go|rs)$|\.md$/i.test(f));
}

function failClosed(msg) {
  process.stderr.write(
    `FAIL  ${msg}\n` +
    `      Refusing to pass the transition gate on a state it could not read (fail-closed).\n`
  );
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const positional = args.filter((a) => !a.startsWith('--'));

  let files;
  if (args.includes('--staged')) {
    files = stagedFiles();
    if (files.length === 0) process.exit(0); // nothing relevant staged
  } else if (positional.length >= 1) {
    files = positional;
  } else {
    process.stderr.write('usage: validate-transition.cjs [--warn] <file>... | [--warn] --staged\n');
    process.exit(2);
  }

  const staged = args.includes('--staged');
  const findings = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      // an explicitly-named unreadable file is fail-closed (exit 2), never a silent pass.
      failClosed(`cannot read transition file "${f}": ${e && e.message ? e.message : 'unknown error'}`);
    }
    // Clause routing: clause 1 (atomic) is a SOURCE-file check (a `writeFileSync` of a
    // durable-state path); clause 2 (rework) is a MARKDOWN closeout/retro construct (a
    // ```rework fenced block). Routing by file type keeps a ```rework STRING inside a .cjs
    // (smoke.cjs's fixtures, this validator's own doc) from being mis-read as a real block —
    // the clause-2 sibling of clause 1's test/harness exclusion.
    const isMarkdown = /\.md$/i.test(f);
    if (!isMarkdown) checkAtomic(f, text, findings);
    if (isMarkdown && !isTestOrHarness(f)) {
      // In --staged mode, scope the rework base-currency + portability gate to the
      // block(s) this commit ADDS — by LINE-RANGE POSITION (stagedAddedLineRanges), not content
      // pooling; in file mode, checkRework does no currency check and never recomputes a frozen
      // git block (opts.stagedAdded undefined).
      const opts = staged ? { stagedAdded: stagedAddedLineRanges(f) } : {};
      checkRework(f, text, findings, opts);
    }
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} transition finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} transition finding(s) block this commit (G15 — atomic transitions + honest rework).\n`);
  process.exit(1);
}

module.exports = {
  isTruncateWriteViolation, isReworkUndercount, isReworkBaseMismatch,
  isReworkDeclaration, collapseLiterals, STATE_PATH_RE,
  // The G15 per-language pattern table — exported so the stack_coverage
  // manifest fact is DERIVED from the table the check actually runs:
  // the coverage claim cannot drift from the code.
  LANG_WRITE_CALLS,
};

if (require.main === module) main();
