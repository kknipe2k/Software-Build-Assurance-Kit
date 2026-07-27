#!/usr/bin/env node
// @kit-version 1.0.1
// validators/validate-operating-mode.cjs
//
// Pre-commit value check for the operating_mode dial.
//
// operating_mode is the project-scoped "what kind of work is this?" axis
// (greenfield | bug_fix | audit | research_publish), set once at calibration
// and recorded in project-config.md. This validator fails a commit whose
// project-config.md declares an operating_mode outside that set — a typo'd or
// invented mode would otherwise silently route the SessionStart hook's
// compose-with-fallback down a non-existent list family.
//
// Deliberately permissive in one direction: an ABSENT operating_mode field is
// fine (exit 0). Greenfield is the default, and a project that predates the dial
// must never be errored out. Only a PRESENT-but-bogus value fails.
//
// What it checks, per project-config.md file:
//   - If no operating_mode field is found → OK (defaults to greenfield).
//   - If found → it must be one of the four canonical values.
//
// Recognizes both the calibration-field form and a table-row form:
//   **Operating mode:** bug_fix
//   operating_mode: bug_fix
//   | operating_mode | bug_fix | ... |
//
// Usage:
//   node validators/validate-operating-mode.cjs <project-config.md> [<file> ...]
//   node validators/validate-operating-mode.cjs --staged    # staged project-config.md
//
// Exit 0 = all good. Exit 1 = a present operating_mode is not one of the four
// values. Exit 2 = bad invocation.
//
// .cjs = always CommonJS regardless of the host project's package.json type.

'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// EXTEND, DON'T FORK: the shared block-bound field reader. The old
// `([a-z_]+)` capture read a PREFIX (`greenfield9` → `greenfield` → wrongly valid), and a
// table-row value with trailing content fell through to null → greenfield default. The value is
// now read WHOLE (line-anchored) and validated in full.
const { fieldInBlock, stripHtmlComments } = require('./lib/fenced-block.cjs');

const VALID = ['greenfield', 'bug_fix', 'audit', 'research_publish'];

// Pull the declared operating_mode from a config file's text, or null if the
// field is absent. Tolerant of the field, key, and table-row spellings; the
// first match wins, so the canonical calibration field should appear first.
function declaredMode(text) {
  // COMMENTS STRIPPED ONCE, HERE — so BOTH reads below inherit it (M26.B / KF-21). The field
  // read gets it from the shared lib anyway, but the table-row read below has its OWN capture
  // bounded by `|`, so an in-cell annotation would still leak into the value if the strip were
  // left to fieldInBlock alone. Stripping at the top of the function is the single seam for
  // this validator: neither spelling can reintroduce the class.
  const live = stripHtmlComments(text);
  // Table-row form — capture the WHOLE cell value (not an `[a-z_]+` PREFIX). A value with
  // trailing junk (`greenfield9`, `bug_fix (see note)`) reads whole and is validated, never
  // silently truncated to a valid prefix or dropped to null.
  const row = live.match(/^\|\s*operating_mode\s*\|\s*([^|]+?)\s*\|/mi);
  if (row) return row[1].replace(/`/g, '').trim().toLowerCase();
  // Field form — the shared block-bound reader: a line-START `operating_mode:` / `**Operating
  // mode:**` field, WHOLE-token value, never a prose mention or a prefix.
  const field = fieldInBlock(live, 'operating_mode');
  if (field !== null && field !== '') return field.toLowerCase();
  return null;
}

// FAIL CLOSED: a git failure must NOT be swallowed into an empty list
// -> silent PASS. Distinguish "git ran, nothing staged" (empty stdout, exit 0)
// from "git failed" (throw): on a throw, surface the error and exit non-zero so
// the gate blocks instead of green-lighting an unknown staged set. git stderr is
// captured (not 'ignore'd) so there is a breadcrumb, and maxBuffer matches the
// validator family's 256 MiB so a large staged set is not itself the failure.
function stagedConfigFiles() {
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
      `      Refusing to pass the operating_mode gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter((f) => /(^|\/)project-config\.md$/.test(f));
}

// Returns { ok, error } for one file.
function validateFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, error: `${file}: cannot read file` };
  }
  const mode = declaredMode(text);
  if (mode === null) return { ok: true }; // absent → greenfield default, never an error
  // A `{{placeholder}}` value is an un-filled TEMPLATE slot (templates/project-config.md, or a
  // project mid-bootstrap before calibration fills it) — not a real declared mode. Skip it,
  // mirroring the placeholder-skip in the sibling value-validators (retro {{1-5}}, transition
  // {{...}}); a real config never carries `{{`. (The guard exists because a template edit can
  // stage templates/project-config.md, which would otherwise reach --staged with no placeholder guard.)
  if (/\{\{.*\}\}/.test(mode)) return { ok: true };
  if (VALID.includes(mode)) return { ok: true };
  return {
    ok: false,
    error: `${file}: operating_mode "${mode}" is not one of {${VALID.join(', ')}}.`,
  };
}

function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length === 1 && args[0] === '--staged') {
    files = stagedConfigFiles();
    if (files.length === 0) process.exit(0); // nothing staged to check
  } else if (args.length >= 1 && !args[0].startsWith('--')) {
    files = args;
  } else {
    process.stderr.write('usage: validate-operating-mode.cjs <project-config.md>... | --staged\n');
    process.exit(2);
  }

  let failed = 0;
  for (const f of files) {
    const { ok, error } = validateFile(f);
    if (!ok) {
      console.error(`FAIL  ${error}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} project-config file(s) declare an invalid operating_mode. Fix to one of {${VALID.join(', ')}}, then re-stage.`);
    process.exit(1);
  }
  process.exit(0);
}

main();
