#!/usr/bin/env node
// @kit-version 1.0.5
// validators/validate-risk-escalation.cjs
//
// The G11 risk-escalation gate, shipped framework-wide
// so every generated project inherits it. The structural form of "risk overrides tier":
// a project that DECLARES a risk trigger must carry a VISIBLE escalation record, or the
// commit BLOCKS. Tier is the floor; a declared risk surface raises oversight above it,
// and the raise must state its reason — a silent escalation is as bad as none.
//
// THE MECHANICAL FLOOR (per-trigger, AND-ed):
//   For each `risk_triggers:` token declared in a project-config.md, `docs/gates.md`
//   (or --gates <path>) must carry an escalation record that BINDS the rationale to the
//   trigger: a single row/line that BOTH names the trigger AND carries the visible
//   rationale token `deep verification because:`. Missing for ANY declared trigger →
//   a blocking finding (the check is AND-ed across all declared triggers — a 1-of-N
//   "any one escalated passes" dodge is rejected). A no-trigger project (`risk_triggers:
//   []`) is a no-op. The visible-rationale token is load-bearing: a row that raises a
//   depth number without stating WHY ("verification depth 3") is a SILENT raise and is
//   rejected — the human must see the reason, not just the number.
//
// FAIL CLOSED, with the no-false-positive asymmetry (the fail-closed-on-unknown-state
// lesson, now a named standard): when a trigger IS declared and the gates.md source is
// UNREADABLE, the gate exits NON-ZERO (2), never a silent 0 — it refuses to pass on an
// unknown escalation state. But a NO-trigger project never reads gates.md at all, so a
// missing gates.md (a Lite project that has none) is NOT a false fail-closed. Presence-
// gated does NOT mean fail-open: the source-unreadable branch is hard non-zero.
//
// HONEST LIMITATION — this gate is presence-gated (no false confidence; same omission-
// escape class as G9's grandfather-banner dodge and G10's presence-only Evidence cell):
//   • A risk surface the project simply FAILED TO DECLARE (no `risk_triggers:` entry, or
//     a trigger stated only in PROSE) escapes the static check — the validator can only
//     see DECLARED triggers, not derive its own risk assessment from the codebase.
//   • The visible-rationale token is matched as text, not judged for truth: a row that
//     names the trigger and pastes `deep verification because: <anything>` satisfies the
//     floor even if the stated escalation is hollow.
//   The ADVERSARIAL half that closes both lives in Stage V's plan-challenge: the
//   fresh-context verifier derives its OWN trigger assessment and CHALLENGES under-
//   declaration — a destructive/credential/untrusted-HTML surface that declared NO
//   trigger to stay at the tier floor — and confirms each escalation is real, not
//   boilerplate. The judgement a static validator structurally cannot make. Floor (this
//   validator) + adversary (Stage V) = a real gate; neither alone is.
//
// Severity / the toggle (mirrors test_honesty / reconciliation, FRAMEWORK-CONFIG §4.17
// severity model):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed source-
//                      unreadable branch (exit 2) is NEVER downgraded by --warn.
//
// Usage:
//   node validators/validate-risk-escalation.cjs [--warn] [--gates <path>] <project-config.md>...
//   node validators/validate-risk-escalation.cjs [--warn] [--gates <path>] --staged
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (staged-enumeration or gates.md read error).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of
// the host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CRLF (and lone CR) → LF so a Windows checkout doesn't read as a false divergence.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// The visible-rationale token a real escalation record must carry (the raise
// states its reason). Matched on the SAME line as the trigger so the rationale BINDS to
// the trigger, not merely exists somewhere in the file.
const RATIONALE_TOKEN = /deep verification because\s*:/i;

// A project-config value that is a {{placeholder}} or blank is NOT a real declaration —
// so the shipped template (whose value is {{RISK_TRIGGERS}}) is never treated as having
// declared triggers.
function parseRiskTriggers(text) {
  const m = normalize(text).match(/^[^\n]*\brisk_triggers\b\s*:\s*(.*)$/im);
  if (!m) return null; // no field at all — not a risk-aware config; treated as no-op
  let raw = m[1].trim();
  // strip an HTML-comment tail (`<!-- ... -->`) the template field may carry
  raw = raw.replace(/<!--[\s\S]*$/, '').trim();
  if (raw === '' || /\{\{.*\}\}/.test(raw)) return []; // unfilled / placeholder → no triggers
  // strip a surrounding [ ... ] and split on commas
  raw = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (raw === '' || /^none$/i.test(raw)) return [];
  return raw
    .split(',')
    .map((t) => t.replace(/`/g, '').trim())
    .filter((t) => t.length > 0 && !/^none$/i.test(t));
}

// Does `line` name this trigger? Matches the token form (`destructive_data_ops`) and the
// spaced form (`destructive data ops`) — never a bare partial word, so a generic
// rationale that doesn't name the trigger does not falsely match.
function triggerMentioned(line, trigger) {
  const hay = line.toLowerCase();
  const tok = trigger.toLowerCase();
  if (hay.includes(tok)) return true;
  const spaced = tok.replace(/_/g, ' ');
  return spaced !== tok && hay.includes(spaced);
}

// THE ENFORCEMENT POINT (G11 mutant target). A trigger has an escalation
// record iff SOME line of gates.md both NAMES the trigger AND carries the visible
// rationale token. Reverting this body to `return true` (trust the declaration) makes a
// declared trigger with no/partial escalation record PASS → the "no record", "silent
// raise", "generic rationale", and "1-of-N" smoke checks (1 / 4 / 4b / 4c) all go RED
// while the controls (2 / 3) stay green. The mutation is killed specifically here.
function hasEscalationRecord(gatesText, trigger) {
  const lines = normalize(gatesText).split('\n');
  return lines.some((line) => triggerMentioned(line, trigger) && RATIONALE_TOKEN.test(line));
}

// FAIL CLOSED: a `git diff --cached` failure must surface and exit
// non-zero, never collapse to an empty staged set → silent PASS.
function stagedConfigs() {
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
      `      Refusing to pass the risk-escalation gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  // a project-config.md (the live one), never the kit's own templates/ copy (placeholders).
  return out.split(/\r?\n/).filter((f) => {
    if (!f) return false;
    if (path.basename(f) !== 'project-config.md') return false;
    return !/(^|[\\/])templates[\\/]/.test(f);
  });
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');

  // parse flags: --gates <path> (default docs/gates.md), --staged, --warn; rest positional.
  let gatesPath = 'docs/gates.md';
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--warn' || a === '--staged') continue;
    if (a === '--gates') {
      gatesPath = args[i + 1];
      i++;
      if (gatesPath === undefined) {
        process.stderr.write('usage: --gates requires a <path> value\n');
        process.exit(2);
      }
      continue;
    }
    if (a.startsWith('--')) continue; // unknown flag, ignore
    positional.push(a);
  }

  let files;
  if (args.includes('--staged')) {
    files = stagedConfigs();
    if (files.length === 0) process.exit(0); // no project-config.md staged → nothing to check
  } else if (positional.length >= 1) {
    files = positional;
  } else {
    process.stderr.write('usage: validate-risk-escalation.cjs [--warn] [--gates <path>] <project-config.md>... | --staged\n');
    process.exit(2);
  }

  // gates.md is read LAZILY (only when a trigger is actually declared) and cached, so a
  // no-trigger project never reads it — the no-false-positive half of fail-closed.
  let gatesText = null;
  function loadGates() {
    if (gatesText !== null) return gatesText;
    try {
      gatesText = fs.readFileSync(gatesPath, 'utf8');
    } catch (e) {
      process.stderr.write(
        `FAIL  a risk trigger is declared but the escalation source "${gatesPath}" is unreadable: ` +
        `${e && e.message ? e.message : 'unknown error'}\n` +
        `      Refusing to pass the risk-escalation gate on an unknown escalation state (fail-closed).\n`
      );
      process.exit(2); // fail-closed — never a silent 0; not downgraded by --warn.
    }
    return gatesText;
  }

  const findings = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`);
      continue;
    }
    const triggers = parseRiskTriggers(text);
    if (!triggers || triggers.length === 0) continue; // no declared trigger → no-op
    const gates = loadGates(); // fail-closed if unreadable
    for (const trig of triggers) {
      if (!hasEscalationRecord(gates, trig)) {
        findings.push(
          `${f}: declared risk trigger "${trig}" has NO visible escalation record in ${gatesPath} — ` +
          `a row that BOTH names "${trig}" AND states its reason ("deep verification because: ..."). ` +
          `Risk overrides tier: a declared trigger must raise oversight above the tier floor, visibly ` +
          `(G11). A silent raise (a depth with no reason) is rejected.`
        );
      }
    }
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} risk-escalation finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} risk-escalation finding(s) block this commit (G11 — risk overrides tier, visibly).\n`);
  process.exit(1);
}

main();
