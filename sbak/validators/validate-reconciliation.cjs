#!/usr/bin/env node
// @kit-version 0.2.0
// validators/validate-reconciliation.cjs
//
// Evidence-retention + count-reconciliation, shipped framework-
// wide so every generated project inherits it. The third evidence rule made
// structural: assurance claims retain reproducible evidence, and a STATED COUNT is
// recomputed from the ledger or the claim FAILS — killing the "202 scanned /
// 0 corrections" theater all three witnesses showed. Two halves, both CONTENT-GATED
// (a file with neither a ```reconcile nor a ```verdict block is a no-op, so legacy
// closeouts/findings are never retro-failed — the same grandfather instinct as G9):
//
//   (a) COUNT-RECONCILIATION — a ```reconcile fenced block (claimed + source +
//       pattern [+ range]) is RECOMPUTED: the validator derives the count FROM the
//       named ledger / status-log / git-log and BLOCKS on a mismatch. Recompute, do
//       NOT trust the stated number — that is the entire point (a fixture agreeing
//       with itself proves nothing). `source: git` counts `git log --format=%s
//       <range>` subjects matching the pattern; any other `source:` counts lines of
//       that file matching the pattern (no pattern → all non-blank lines).
//
//   (b) EVIDENCE-RETENTION + the VERDICT→RECONCILE BINDING — a ```verdict block
//       carries the assurance claim, and which trigger fires depends on its shape:
//         • a NON-NUMERIC assurance verdict (status: Sound / passed / clean /
//           verified / green) REQUIRES ≥1 complete ```evidence block (command +
//           pattern/mutation set + result) — retained, reproducible repro.
//         • a NUMERIC COUNT verdict (a count-keyword field with an integer value —
//           e.g. `scanned: 202`, `killed: 14`, `fixed: 12`) REQUIRES a ```reconcile
//           block whose `claimed` EQUALS that count, so the number is RECOMPUTED, not
//           merely retained. Evidence-presence is NOT enough for a count: a lying
//           `result: 202` (actually 187) sails through a presence check, but the
//           bound reconcile re-derives 187 → mismatch → block. This binding is what
//           makes the opt-in ```reconcile block non-optional once a count is claimed.
//       Every ```evidence block PRESENT must also be complete (no empty / {{placeholder}}
//       / n-a field) — the block is mandatory + non-removable like the coverage caveat.
//
// HONEST LIMITATION — this gate is presence-gated (no false confidence; same class
// as G10's presence-only Evidence cell and G9's grandfather-banner escape). The
// static validator can only see counts that are written INSIDE a fenced block under
// a recognized shape:
//   • a count stated in PROSE with no fenced block escapes the static check, and
//   • the count-keyword list below is deliberately NON-EXHAUSTIVE — a count under an
//     UNLISTED key (e.g. `rows: 202`) is not detected as a count and so is not
//     forced to carry a reconcile block.
// Both are the SAME omission-escape class as G9's no-banner dodge. The adversarial
// half is Stage V's plan-challenge, which challenges whether the named coverage is
// real: the fresh-context verifier confirms every stated count carries a fenced
// reconcile block — the judgement a static validator structurally cannot make. Floor
// (this validator) + adversary (V) = a real gate; neither alone is.
//
// SOURCE-TRUST — reconciliation proves `claimed == source`, NOT `source ==
// reality`. The recompute trusts the named source: for `source: git` (real commits)
// and the append-only-guarded LEDGERS this is hard to forge, but an arbitrary
// non-guarded file (e.g. a gitignored status-log) whose lines were padded would
// reconcile (claimed == recomputed) while lying. Pair reconcile blocks with git /
// append-only sources for un-forgeable counts.
//
// RECONCILE vs EVIDENCE — which block a count belongs in. A STATIC-SOURCE count
// (recomputable by reading a file or `git log` — stage commits, ledger rows, graduated
// TDs) is a ```reconcile block: the validator re-derives it and blocks on mismatch. An
// EXECUTION-REQUIRED count (only knowable by RUNNING a command — e.g. the smoke total
// "532 checks passed") is NOT reconcilable: `recomputeCount()` cannot run the command,
// so it would fail-LOUD (`cannot read reconcile source "node scripts/smoke.cjs"`).
// Such a count is EVIDENCE (a ```evidence block: command + result retained), or stated
// in prose — never a ```reconcile. Rule of thumb: if the count cannot be recomputed
// from a static source, it is evidence, not reconcile.
//
// Severity / the toggle (mirrors test_honesty, FRAMEWORK-CONFIG §4.17 severity model):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. Shipped --warn in the
//                      template pre-commit (Lite/Standard advisory); a Full project
//                      REMOVES --warn to BLOCK.
//
// Usage:
//   node validators/validate-reconciliation.cjs [--warn] <closeout|findings.md>...
//   node validators/validate-reconciliation.cjs [--warn] --staged   # staged *.md
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking
// finding. Exit 2 = bad invocation / fail-closed git error.
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless
// of the host project's package.json "type".

'use strict';

const fs = require('fs');
const { spawnSync, execSync } = require('child_process');

// EXTEND, DON'T FORK: the shared line-anchored fence extractor. A ```<label>
// block counts only when its fences sit at a line start — an illustrative MID-LINE fence in prose
// no longer satisfies a gate. This is the ONE extraction primitive; this validator
// consumes it, never re-implements it.
const { extractBlocks, extractBlocksWithPos } = require('./lib/fenced-block.cjs');

// CRLF (and lone CR) → LF so a Windows checkout doesn't read as a false divergence.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Count-keyword keys whose integer value is treated as an asserted count that MUST
// be reconcile-bound. DELIBERATELY NON-EXHAUSTIVE (see the header's honest-limitation
// note): a count under a key NOT in this set (e.g. `rows: 202`) escapes the static
// check — the same omission class as a prose count, with the plan-
// challenge as the adversarial backstop. Do not read this list as complete.
const COUNT_KEYWORD = /^(?:scanned|killed|fixed|graduated|corrections?|rework|commits?|mutants?|findings?|closed|count)$/i;

// A non-numeric assurance verdict that requires retained evidence.
const ASSURANCE_RE = /\b(?:sound|passed|clean|verified|green)\b/i;

// Blank / placeholder / sentinel cell values (an evidence field with one of these is
// not real evidence).
const EMPTY_CELL = new Set(['', '-', '—', '–', 'n/a', 'na', 'tbd']);

function isBlank(s) {
  if (s === undefined || s === null) return true;
  const t = String(s).replace(/`/g, '').trim();
  if (t === '') return true;
  if (/\{\{.*\}\}/.test(t)) return true;          // {{placeholder}}
  if (EMPTY_CELL.has(t.toLowerCase())) return true;
  return false;
}

// Extract every ```<label> ... ``` fenced block body. Now a thin delegator to the shared
// LINE-ANCHORED primitive: the opening and closing fence must each
// sit at a line start, so an illustrative mid-line ```<label> in prose is NOT a block. Kept as
// a named function (and re-exported) for the sibling validate-transition compat surface.
function extractFenced(text, label) {
  return extractBlocks(text, label);
}

// Parse a fenced block body of `key: value` lines into a lower-cased-key object.
// Splits on the FIRST colon only, so a value may itself contain a colon.
function parseKV(body) {
  const o = {};
  for (const line of normalize(body).split('\n')) {
    const m = line.match(/^\s*([^:\n]+?)\s*:\s*(.*?)\s*$/);
    if (m) o[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return o;
}

function fieldLike(obj, re) {
  for (const [k, val] of Object.entries(obj)) if (re.test(k)) return val;
  return undefined;
}

// Metric-correspondence helpers. normMetric lowercases + trims (backticks stripped); a
// verdict label CORRESPONDS to a reconcile metric on normalized equality OR either-contains-the-
// other (len ≥ 3), so "mutants killed" binds "killed" but not "scan coverage".
function normMetric(s) { return String(s === undefined || s === null ? '' : s).toLowerCase().replace(/`/g, '').trim(); }
function metricRelated(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  return false;
}

// `git log --format=%s <range>` subjects, FAIL-CLOSED: a git failure exits 2 rather
// than collapsing to an empty list → a silent "0" reconcile.
function gitSubjects(range) {
  const r = spawnSync('git', ['log', '--format=%s', range], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    const detail = (r.stderr && r.stderr.trim()) || (r.error && r.error.message) || 'unknown git error';
    process.stderr.write(
      `FAIL  cannot run \`git log ${range}\`: ${detail}\n` +
      `      Refusing to reconcile a count on an unknown git state (fail-closed).\n`
    );
    process.exit(2);
  }
  return (r.stdout || '').split(/\r?\n/).filter(Boolean);
}

function countMatching(lines, pattern) {
  if (!pattern) return lines.filter((l) => l.trim() !== '').length;
  let re;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    throw { msg: `invalid reconcile pattern /${pattern}/ (${e.message})` };
  }
  return lines.filter((l) => re.test(l)).length;
}

// THE ENFORCEMENT POINT (mutant target). It RECOMPUTES the count FROM the
// named source — it must NEVER read `directive.claimed`. Reverting this body to
// `return parseInt(directive.claimed, 10)` (trust the stated number) makes the
// recomputed count always equal the claim → the "claimed 12 / actual 11 → BLOCKS"
// smoke check goes RED while the matching-count control + the evidence checks stay
// green. The mutation is killed specifically here.
function recomputeCount(directive) {
  let lines;
  if (directive.source === 'git') {
    const range = String(directive.range || 'HEAD');
    // Reject a range base that begins with `-`/`--` BEFORE it reaches
    // `git log`. A `range:` of `--all` / `--author=x` would otherwise smuggle a git OPTION
    // into the subject count the gate depends on (an option-injection into the recompute). A
    // legitimate revision range (`HEAD`, `main..HEAD`, `v1.2..HEAD`) never leads with a dash.
    // validate-transition's rework recompute inherits this guard via recomputeCount.
    if (/^\s*-/.test(range)) {
      throw { msg: `reconcile range "${range}" begins with '-' — refusing to pass a git option as a revision range (option-injection guard)` };
    }
    lines = gitSubjects(range);
  } else {
    let text;
    try {
      text = fs.readFileSync(directive.source, 'utf8');
    } catch (e) {
      throw { msg: `cannot read reconcile source "${directive.source}" (${e.message})` };
    }
    lines = normalize(text).split('\n');
  }
  return countMatching(lines, directive.pattern);
}

// Which NEW-FILE LINE RANGES did THIS commit stage as ADDITIONS?
// Parse `git diff --cached -U0` hunk headers (`@@ -a,b +c,d @@`) into [start, end] intervals
// (1-indexed, inclusive) of added lines in the new file. Used ONLY in --staged mode. FAIL-SOFT: a
// diff error returns null and the caller treats no block as added (frozen blocks are never
// re-litigated — the same backstop-by-file-mode-CI boundary the header's HONEST LIMITATION names).
//
// Why RANGES, not pooled text: the prior stagedAddedText pooled the diff's added LINES into
// a set and asked whether every body line was a member (bodyIsAdded). Set membership is blind to
// ORDER, DUPLICATES, FENCE BOUNDARIES and HUNK IDENTITY — a frozen block whose lines all happen to
// appear among a commit's additions (an exact duplicate entry, or a verbatim quote of the block's
// body in another fence) ALIASED as "added" and was re-litigated (the false-block this fix kills). Line
// ranges + a POSITIONAL block-span check (blockIsStagedAdded) make identity structural: a duplicate
// is a distinct span, a quote is its own span, a partially-edited block has unchanged (non-added)
// lines and so is not "added".
function stagedAddedLineRanges(file) {
  const r = spawnSync('git', ['diff', '--cached', '-U0', '--', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  const ranges = [];
  // The unified-diff hunk header: `@@ -oldStart[,oldCount] +newStart[,newCount] @@`. The `+newStart,
  // newCount` half describes the ADDED span in the NEW file. Count omitted → 1; count 0 → a pure
  // deletion at that point (no added lines) → contributes no range.
  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.match(hunkRe);
    if (!m) continue;
    const start = parseInt(m[1], 10);
    const count = m[2] === undefined ? 1 : parseInt(m[2], 10);
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

// A block (its fence-inclusive { startLine, endLine } span, from extractBlocksWithPos) is
// STAGED-ADDED iff EVERY line of its span falls inside a staged-added interval. POSITIONAL identity:
// order / duplicates / fence boundaries / hunk identity all fall out of the span, so this
// cannot be confused by a duplicate block or a verbatim quote the way content set-membership was.
// A fully-new staged file yields one big added range covering every line → all its blocks are
// "added", matching the prior new-file behavior. `ranges === null` (diff error) → nothing added.
function blockIsStagedAdded(span, ranges) {
  if (!ranges || !span) return false;
  for (let ln = span.startLine; ln <= span.endLine; ln++) {
    if (!ranges.some(([a, b]) => ln >= a && ln <= b)) return false;
  }
  return span.endLine >= span.startLine;
}

// Revised axis — PORTABILITY, not position. A `source: git` reconcile range is
// NON-PORTABLE when its base (the token before `..`) is a MUTABLE LOCAL REF (`main`, `origin/main`,
// a branch, a tag) — such a range recomputes differently on every clone (a `main..HEAD` -> 0 the
// moment local `main` reaches HEAD, on a fresh clone / CI / post-merge). A range whose base is an
// ABSOLUTE SHA (`<sha>..HEAD`) or that is HEAD-anchored / has no `..` base (`HEAD`, a default range)
// is portable — deterministic on any full clone (HEAD is the commit under check; a bare-token range
// like `--all` is left for recomputeCount's option-injection guard). Position ('topmost')
// was insufficient: an earlier reconcile block is `main..HEAD`, so post-merge even the topmost
// recomputes to 0 and false-blocks the next edit. Scope by portability instead.
function isMutableRefRange(range) {
  const r = String(range === undefined || range === null ? 'HEAD' : range).trim();
  const m = r.match(/^([^.\s]+)\s*\.\./); // the base token before the first `..`
  if (!m) return false;                    // no `..` range (HEAD, a bare ref/option) — not a mutable RANGE base
  const base = m[1].trim();
  if (base === 'HEAD') return false;        // HEAD base: the commit under check — portable
  if (/^[0-9a-f]{7,40}$/i.test(base)) return false; // absolute-SHA base — portable
  return true;                              // main / origin/main / a branch / a tag — mutable, clone-dependent
}

function checkFile(file, text, findings, opts) {
  opts = opts || {};
  // Extract reconcile blocks WITH their line spans so the staged-added determination is
  // POSITIONAL (blockIsStagedAdded), not content set-membership. verdict/evidence blocks need no
  // position (they are never staged-scoped), so they stay on the body-only extractor.
  const reconcileBlocks = extractBlocksWithPos(text, 'reconcile');
  const reconciles = reconcileBlocks.map((b) => parseKV(b.body));
  const verdicts = extractFenced(text, 'verdict').map(parseKV);
  const evidences = extractFenced(text, 'evidence').map(parseKV);

  // ---- (a) COUNT-RECONCILIATION: recompute each ```reconcile block ----
  // Portability axis: the source:git RECOMPUTE is scoped by RANGE PORTABILITY,
  // not position. A NON-PORTABLE git range (a MUTABLE LOCAL REF base — `main..HEAD` etc.)
  // recomputes to 0 on any clone whose local ref has caught up (a fresh clone / CI / post-merge),
  // so it was only ever assertable at ITS OWN commit gate on its author's clone. Position
  // ('topmost') was insufficient — an earlier reconcile block is `main..HEAD`, so post-merge even
  // the topmost false-blocks. Instead:
  //   • FILE mode  — recompute only PORTABLE git blocks (absolute-SHA base / HEAD-anchored); a
  //     mutable-ref-ranged block is SKIPPED (never re-litigated against today's git state).
  //   • STAGED mode — recompute the git block(s) THIS commit ADDS; and an ADDED git block whose
  //     range base is a MUTABLE REF is BLOCKED ("cite an absolute-SHA range") — turning
  //     the BUILD-PLAYBOOK §3.5 absolute-SHA rule from honor-system into a GATE. Frozen (non-added)
  //     git blocks are skipped.
  // Net: the frozen `main..HEAD` blocks are never re-litigated anywhere; every FUTURE block is
  // portable (gate-enforced) and recomputed on every clone file-wide (teeth preserved, STRONGER).
  // The STATIC checks below (claimed/source presence, evidence completeness, verdict->reconcile
  // binding, fence anchoring) do NOT depend on git state and keep running file-wide. `source:
  // <file>` blocks recompute on EVERY block DELIBERATELY (a portability boundary): a file/ledger count is
  // deterministic per commit (same repo content -> same result on every clone), unlike a
  // git-recompute which varies with local ref state — if a frozen file-source block ever goes
  // stale as the repo evolves, this same scoping extends to it naturally.
  for (let i = 0; i < reconciles.length; i++) {
    const d = reconciles[i];
    if (d.claimed === undefined || !/^\d+$/.test(String(d.claimed))) {
      findings.push(`${file}: a \`\`\`reconcile block has no integer \`claimed:\` field.`);
      continue;
    }
    if (!d.source) {
      findings.push(`${file}: a \`\`\`reconcile block has no \`source:\` field (where to recompute the count from).`);
      continue;
    }
    if (d.source === 'git') {
      const mutable = isMutableRefRange(d.range);
      if (opts.stagedAdded != null) {
        // STAGED mode: only the block(s) this commit ADDS (by POSITION).
        if (!blockIsStagedAdded(reconcileBlocks[i], opts.stagedAdded)) continue; // frozen (not added) — skip
        if (mutable) {
          findings.push(
            `${file}: a staged \`\`\`reconcile block cites a MUTABLE range base in "${d.range}" — ` +
            `cite an ABSOLUTE-SHA range (\`<sha>..HEAD\`), never a mutable local ref like \`main..HEAD\` ` +
            `(BUILD-PLAYBOOK §3.5): a mutable-ref range recomputes to 0 on any clone whose local ` +
            `ref has caught up (a fresh clone / CI / post-merge), false-blocking future commits.`
          );
          continue; // blocked on portability — do not recompute a non-portable range
        }
      } else {
        // FILE mode: recompute only PORTABLE git blocks; a mutable-ref block is skipped (it was
        // assertable only at its own commit gate — the staged-add path above is where it is checked).
        if (mutable) continue;
      }
    }
    let computed;
    try {
      computed = recomputeCount(d);
    } catch (err) {
      // A typo'd source / bad pattern must fail LOUD — never silently pass as 0==0.
      findings.push(`${file}: ${err.msg} — refusing to pass a count that cannot be recomputed (fail-loud).`);
      continue;
    }
    const claimed = parseInt(d.claimed, 10);
    if (computed !== claimed) {
      findings.push(
        `${file}: count "${d.metric || '(unnamed)'}" claimed ${claimed} but RECOMPUTES to ${computed} ` +
        `from ${d.source}${d.pattern ? ` /${d.pattern}/` : ''}. Reconcile the count or fix the claim ` +
        `(count-reconciliation — the stated number must recompute from the ledger).`
      );
    }
  }

  // The verdict→reconcile binding joins on (metric, claimed), NOT the bare integer.
  // Keying on the integer alone let a value COLLISION satisfy a bogus verdict count (a verdict
  // `scanned: 14` satisfied by an UNRELATED reconcile that merely also claims 14). We now carry
  // each reconcile's (metric, claimed) pair; a verdict count is reconciled only by a reconcile
  // whose `metric:` CORRESPONDS to the verdict's label (its `finding:`, or the count key as a
  // fallback) AND whose `claimed` equals the count. Correspondence is normalized equality or
  // either-contains-the-other (len ≥ 3), so "mutants killed" ↔ "killed" binds while
  // "mutants killed" ↔ "scan coverage" does not.
  const reconciledPairs = reconciles
    .filter((r) => /^\d+$/.test(String(r.claimed || '')))
    .map((r) => ({ metric: normMetric(r.metric), claimed: parseInt(r.claimed, 10) }));

  // ---- (b) EVIDENCE completeness: every PRESENT ```evidence block must be complete ----
  for (const ev of evidences) {
    const missing = [];
    if (isBlank(ev.command)) missing.push('command');
    if (isBlank(fieldLike(ev, /pattern|mutation/))) missing.push('pattern/mutation set');
    if (isBlank(ev.result)) missing.push('result');
    if (missing.length) {
      findings.push(
        `${file}: an \`\`\`evidence block is missing/placeholder field(s): ${missing.join(', ')}. ` +
        `The evidence block (command + pattern/mutation set + result) is mandatory + non-removable.`
      );
    }
  }

  // ---- (b) VERDICT triggers ----
  for (const v of verdicts) {
    const blob = Object.entries(v).map(([k, val]) => `${k}: ${val}`).join('\n');

    // numeric count → MUST be reconcile-bound (the 202/0 theater killer). The value
    // must be a BARE integer (`scanned: 202`), not merely contain a digit — else a
    // label like `finding: Pass 4 — Behavior` would be misread as a count of 4.
    const verdictLabel = v.finding; // the verdict's own label of WHAT it is reporting
    for (const [k, val] of Object.entries(v)) {
      if (!COUNT_KEYWORD.test(k.trim())) continue;
      if (!/^\d+$/.test(String(val).trim())) continue;
      const c = parseInt(String(val).trim(), 10);
      const label = verdictLabel !== undefined ? verdictLabel : k; // fall back to the count key
      const bound = reconciledPairs.some((p) => p.claimed === c && metricRelated(p.metric, normMetric(label)));
      if (!bound) {
        findings.push(
          `${file}: a \`\`\`verdict asserts a count of ${c} ("${k}: ${val}"${verdictLabel !== undefined ? `, metric "${verdictLabel}"` : ''}) ` +
          `but NO \`\`\`reconcile block for that (metric, count) recomputes it. A stated count must be RECONCILED ` +
          `(recomputed from the ledger) and BOUND to its metric — a bare-integer collision with an unrelated ` +
          `reconcile is not enough (the "202 scanned / 0 corrections" theater).`
        );
      }
    }

    // non-numeric assurance verdict → MUST retain ≥1 complete evidence block
    if (ASSURANCE_RE.test(blob) && evidences.length === 0) {
      findings.push(
        `${file}: a \`\`\`verdict asserts an assurance verdict (Sound/passed/clean/...) but the file carries ` +
        `NO \`\`\`evidence block. A "Sound" claim must retain reproducible evidence (command + pattern/mutation ` +
        `set + result) — mandatory + non-removable.`
      );
    }
  }
}

// FAIL CLOSED: a `git diff --cached` failure must surface and exit
// non-zero, never collapse to an empty staged set → silent PASS.
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
      `      Refusing to pass the reconciliation gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter((f) => f && /\.md$/i.test(f));
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
    process.stderr.write('usage: validate-reconciliation.cjs [--warn] <closeout|findings.md>... | [--warn] --staged\n');
    process.exit(2);
  }

  const staged = args.includes('--staged');
  const findings = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`);
      continue;
    }
    // In --staged mode, scope the git recompute to the block(s) this commit
    // adds — by LINE-RANGE POSITION (stagedAddedLineRanges), not content pooling; in file mode,
    // checkFile runs static + portable-git checks only (opts.stagedAdded undefined).
    const opts = staged ? { stagedAdded: stagedAddedLineRanges(f) } : {};
    checkFile(f, text, findings, opts);
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} reconciliation finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} reconciliation finding(s) block this commit (evidence-retention + count-reconciliation).\n`);
  process.exit(1);
}

// EXTENSION POINT (honest-rework). validators/validate-transition.cjs
// REUSES this module's count-recompute primitive (recomputeCount + its helpers) so the
// rework reconciliation EXTENDS this reconciliation rather than forking a parallel count
// check (the duplication lesson). The CLI path is unchanged: main() runs only
// when this file is invoked directly, so requiring it from validate-transition is a pure
// import with no side effects.
// validate-transition's rework clause PORTS this module's portability
// discipline — the same `isMutableRefRange` portability predicate + the same
// staged-added detection, now POSITIONAL (`stagedAddedLineRanges` + `blockIsStagedAdded`, keyed off
// extractBlocksWithPos spans) rather than the retired content set-membership (`stagedAddedText` /
// `bodyIsAdded`, which aliased duplicate/quoted blocks). Exported here so the sibling REUSES them
// rather than forking a parallel copy (the duplication lesson).
module.exports = {
  recomputeCount, gitSubjects, countMatching, normalize, extractFenced, parseKV,
  isMutableRefRange, stagedAddedLineRanges, blockIsStagedAdded,
};

if (require.main === module) main();
