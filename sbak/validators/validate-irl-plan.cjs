#!/usr/bin/env node
// @kit-version 1.0.5
// validators/validate-irl-plan.cjs
//
// THE IRL/HITL PRESENCE FLOOR (M29.A half b) — a Full-tier project's spec must carry the
// three-part IRL/HITL plan section (templates/IRL-HITL-PLAN.md), EACH PART INDIVIDUALLY:
//   part A — drive moments per milestone boundary
//   part B — what the human verifies BY HAND at each boundary
//   part C — where each answer gets typed
//
// ── WHY (the field finding, 2026-08-04) ─────────────────────────────────────────────────
//   The Phase-1 instruction to author this section is MANDATORY, in prose, in
//   bootstrap/PHASES.md — and a live bootstrap silently skipped it: a 68-line Full-tier
//   spec shipped with zero IRL/HITL content, and the milestone then closed with no human
//   ever running the app (FNR 0.00, green PR, immutable ledger — the kit's founding
//   thesis demonstrated against itself). A prose-only mandatory instruction is proven
//   insufficient; this floor makes it mechanical. The instruction is now checked, not
//   trusted.
//
// ── WHAT IT BINDS (each part's substance, never a heading string) ───────────────────────
//   Detection is shared with the closeout consumption gate (validators/lib/irl-plan.cjs —
//   extend-don't-fork): a part is present only as heading + at least one table data row.
//   An "IRL/HITL plan" heading with nothing behind it is missing ALL THREE parts, by name.
//   `TBD — set at Phase 2` cells are legitimate (the template's honest interim).
//
// ── CONTENT-GATED, NEVER SILENT (the workshop must not RED-loop) ────────────────────────
//   • no project-config.md at the root (the kit's own tree)  → VISIBLE n/a, exit 0
//   • tier Lite                                              → VISIBLE n/a, exit 0
//   • no spec/project-spec.md yet                            → VISIBLE n/a, exit 0
//
// ── HISTORY IS GUARDED (the M12 RETRO-FAIL GUARD discipline) ────────────────────────────
//   --staged mode checks ONLY when a spec file is actually STAGED: committed-but-unstaged
//   old-shape specs pass untouched; the identical bytes staged RED. The floor scopes to
//   the change being made — it never retro-fails history. Fail-closed on a git error
//   (ERR-004): an unknown staged set blocks, never silently passes.
//
// Usage:
//   node validators/validate-irl-plan.cjs [--warn] [--root DIR]   # file mode: check the root's spec now
//   node validators/validate-irl-plan.cjs [--warn] --staged        # pre-commit: only if the spec is staged
//     --warn   advisory: findings are NOTEs, exit 0 (the Lite render / severity toggle)
//
// Exit 0 = clean or visible n/a (or --warn). Exit 1 = a Full-tier spec is missing at
// least one part. Exit 2 = bad invocation / fail-closed git error.
// Dependency-free (Node builtins + the kit's own lib). .cjs = always CommonJS.

'use strict';

const path = require('path');
const { execSync } = require('child_process');
const { detectParts, readProjectContext } = require('./lib/irl-plan.cjs');

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let staged = false;
  let warn = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') { root = path.resolve(args[++i] || '.'); }
    else if (args[i] === '--staged') staged = true;
    else if (args[i] === '--warn') warn = true;
    else {
      process.stderr.write('usage: validate-irl-plan.cjs [--warn] [--root DIR] [--staged]\n');
      process.exit(2);
    }
  }

  if (staged) {
    // The M12 guard: only a STAGED spec re-arms the floor. Fail closed on git error.
    let out;
    try {
      out = execSync('git diff --cached --name-only --diff-filter=ACM', {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 256 * 1024 * 1024,
      }).toString();
    } catch (e) {
      const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown git error';
      process.stderr.write(
        `FAIL  cannot enumerate staged files via \`git diff --cached\`: ${detail}\n` +
        '      Refusing to pass the IRL/HITL floor on an unknown staged set (fail-closed, ERR-004).\n'
      );
      process.exit(2);
    }
    const specStaged = out.split(/\r?\n/).some((f) => /^spec\/[^/]+\.md$/.test(f));
    if (!specStaged) process.exit(0); // history untouched: the floor scopes to the change being made
  }

  const ctx = readProjectContext(root);
  if (!ctx.armed) {
    console.log(`irl-plan — n/a: ${ctx.na}`);
    process.exit(0);
  }

  const { missing } = detectParts(ctx.specText);
  if (missing.length === 0) {
    // M30.I (audit row 56): silent on green — the OK line was background in the foreground.
    process.exit(0);
  }

  const sev = warn ? 'NOTE' : 'FAIL';
  for (const part of missing) {
    process.stderr.write(
      `${sev}  ${ctx.specPath}: IRL/HITL plan missing part ${part.id} — ${part.name} ` +
      '(a heading for the part plus at least one table row; see templates/IRL-HITL-PLAN.md).\n'
    );
  }
  process.stderr.write(
    `${sev}  The Phase-1 IRL/HITL instruction is mechanical now: a Full-tier spec carries all three parts ` +
    'or names its n/a rows honestly ("n/a — no user-reachable surface yet" is a legitimate ROW, not a missing part).\n'
  );
  process.exit(warn ? 0 : 1);
}

main();
