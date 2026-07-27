#!/usr/bin/env node
// @kit-version 1.0.0
// validators/validate-risk-matrix.cjs
//
// The G13 risk-matrix gate, shipped framework-wide so
// every generated project inherits it. The structural form of "a high-risk capability
// names the dangerous properties its plan + tests must cover".
//
// THE MECHANICAL FLOOR (all-9, AND-ed):
//   A work stage that DECLARES a risk surface — a `<risk_declaration triggers="...">`
//   slot with a real (non-empty, non-placeholder) trigger list — must address ALL NINE
//   matrix properties: normal · hostile-input · partial-failure · confinement
//   · authorization · resource-bounds · recovery · observability · cross-platform. Each
//   property is either `covered-by: <how> — test: <name>` (names a covering test) OR an
//   explicit `n/a — <reason>`. A MISSING property, a property with no covering `test:`
//   token and no `n/a`, or an empty/placeholder property → a blocking finding (the check
//   is AND-ed across all 9 — a "one property present passes" dodge is rejected). A stage
//   with NO `<risk_declaration>` is a no-op (under-declaration is Stage V's job).
//
// BOUNDED: the 9 are the FIXED set — the verifier challenges against THEM, not
// arbitrary invented threats. The matrix is anchored, not open-ended.
//
// BANNER-LESS = CURRENT (closed here, in lockstep with G9's version gate): a BANNER-LESS Phase doc is
// treated as CURRENT (must comply), NOT grandfathered — only an EXPLICIT pre-v1.8 banner
// (e.g. `**Protocol version:** v1.7`) exempts. So a banner-less doc that declares a risk
// surface but omits the matrix no longer escapes G13. History is NOT retro-failed because
// this validator runs on the CHANGED set only (--staged in the pre-commit), never --all
// over a repo's phase-doc history (the framework's only --all is the version-AGNOSTIC
// schema validator). See `STAGE-PROMPT-PROTOCOL.md` §10.
//
// HONEST LIMITATION — presence-gated (no false confidence; same omission-escape class as
// G9's grandfather-banner dodge, G10's presence-only Evidence cell, the reconciliation
// gate's prose-count escape):
//   • The validator asserts the 9 properties are ADDRESSED with a named test or an n/a —
//     it does NOT judge whether the named coverage ACTUALLY covers the property, nor
//     whether an `n/a` is truthful. A property that pastes `covered-by: … — test: foo`
//     against a test that proves nothing satisfies the floor.
//   • The ADVERSARIAL half that closes it is Stage V's plan-challenge: the fresh-
//     context verifier derives its OWN threat model anchored on the declared matrix and
//     asks "which of the 9 properties did the plan/criteria leave UNPROVEN?", and whether
//     each `n/a` is true. The judgement a static validator structurally cannot make.
//   Floor (this validator) + adversary (Stage V) = a real gate; neither alone is.
//
// Severity / the toggle (mirrors test_honesty / risk_escalation, FRAMEWORK-CONFIG §4.17):
//   default (block)  — any finding → exit 1.
//   --warn           — findings are advisory (NOTE), exit 0. The fail-closed staged-
//                      enumeration branch (exit 2) is NEVER downgraded by --warn.
//
// Usage:
//   node validators/validate-risk-matrix.cjs [--warn] <phase-doc.md>...
//   node validators/validate-risk-matrix.cjs [--warn] --staged   # the staged set
//
// Exit 0 = clean (or all findings downgraded by --warn). Exit 1 = ≥1 blocking finding.
// Exit 2 = bad invocation / fail-closed (staged-enumeration error).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of
// the host project's package.json "type".

'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// EXTEND, DON'T FORK: the shared line-anchored fence extractor. A real
// <risk_declaration> in a ```xml block whose CLOSING fence is indented was invisible to the old
// absolute-line-start close regex, so the all-9 G13 check silently SKIPPED (fail open). The
// shared extractor tolerates a leading-whitespace close fence, so the block is seen and checked.
const { extractBlocks } = require('./lib/fenced-block.cjs');

// The protocol version that introduced the <risk_declaration> slot.
// A doc with an EXPLICIT banner below this is grandfathered; a banner-less doc is NOT
// (banner-less = current — see isInScope).
const RISK_MATRIX_VERSION = [1, 8];

// The fixed 9 matrix properties. Bounded set — not arbitrary threats.
const REQUIRED_PROPERTIES = [
  'normal', 'hostile-input', 'partial-failure', 'confinement', 'authorization',
  'resource-bounds', 'recovery', 'observability', 'cross-platform',
];

function parseProtocolVersion(text) {
  const m = text.match(/Protocol version:\s*\**\s*v(\d+)\.(\d+)/i);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}
function gteVersion(a, b) {
  if (!a) return false;
  return a[0] !== b[0] ? a[0] > b[0] : a[1] >= b[1];
}

// THE BANNER-LESS MUTANT TARGET. A banner-less doc is CURRENT (must comply); only an EXPLICIT
// pre-v1.8 banner exempts. Reverting the `version === null` branch to `return false`
// (banner-less grandfathered again) makes the "banner-less doc omitting the matrix ->
// blocks" smoke test PASS → RED, while the controls (v1.8 in-scope, v1.7 grandfathered)
// stay green. The mutation is killed specifically here.
function isInScope(version) {
  if (version === null) return true;                  // banner-less = current
  return gteVersion(version, RISK_MATRIX_VERSION);    // explicit banner: exempt iff < v1.8
}

function isPhaseDoc(f) {
  if (/(^|[\\/])docs[\\/]build-prompts[\\/]M\d{2}[^\\/]*\.md$/.test(f)) return true;
  // bug_fix mode phase docs live at docs/bugfix/<bug-id>.md — OUTSIDE the build-prompts
  // tree. UAT 2026-07 finding: scoping by the build-prompts path alone silently exempted
  // every instantiated bugfix doc from this gate, regardless of its protocol banner.
  return /(^|[\\/])docs[\\/]bugfix[\\/][^\\/]+\.md$/.test(f);
}

function extractXmlBlocks(content) {
  // LINE-ANCHORED: tolerant of a leading-whitespace close fence, so a
  // ```xml block with an indented closing ``` is still extracted (it was silently missed before,
  // skipping the G13 matrix check on any declaration it held).
  return extractBlocks(content, 'xml');
}
function rootTagOf(xml) {
  const m = /^\s*<(\w+)[\s>]/m.exec(xml);
  return m ? m[1] : null;
}
function idOf(xml) {
  const m = /\bid=["']([^"']*)["']/.exec(xml);
  return m ? m[1] : '?';
}

// A `<risk_declaration>` "declares a risk surface" iff its `triggers` attribute names at
// least one real (non-empty, non-placeholder) trigger. A {{placeholder}} or blank
// triggers value is NOT a real declaration (so the shipped PHASE-DOC template example,
// whose triggers are a placeholder, is never treated as a real declaration).
function realTriggers(attrs) {
  const m = /\btriggers=["']([^"']*)["']/.exec(attrs);
  if (!m) return null;
  const raw = m[1].trim();
  if (raw === '' || /\{\{.*\}\}/.test(raw)) return null;
  return raw;
}

// Extract the <property name="X">body</property> map from a declaration body. Names are
// lowercased so a stray-case author entry still matches the canonical set.
function parseProperties(declBody) {
  const props = {};
  const re = /<property\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/property>/g;
  let m;
  while ((m = re.exec(declBody)) !== null) props[m[1].trim().toLowerCase()] = m[2];
  return props;
}

// THE ENFORCEMENT POINT (G13 mutant target). Returns the list of the 9 matrix
// properties NOT properly addressed (missing, empty/placeholder, or named with no covering
// `test:` token and no explicit `n/a`). A complete declaration returns []. Reverting the
// all-9 requirement to "any one property present passes" — e.g. changing the consuming
// gate from `unaddressed.length > 0` to `unaddressed.length === REQUIRED_PROPERTIES.length`
// (block only when NONE is addressed) — makes the "omits confinement" smoke test PASS →
// RED, while the controls (all-9 addressed, no-trigger no-op) stay green. The mutation is
// killed specifically against this set.
function unaddressedProperties(props) {
  const missing = [];
  for (const name of REQUIRED_PROPERTIES) {
    const body = props[name];
    if (body === undefined) { missing.push({ name, why: 'no property entry' }); continue; }
    const trimmed = body.trim();
    if (trimmed === '' || /\{\{.*\}\}/.test(trimmed)) { missing.push({ name, why: 'empty / placeholder body' }); continue; }
    if (/^n\/a\b/i.test(trimmed)) continue;                 // explicit n/a — addressed
    if (!/\btest:/i.test(trimmed)) { missing.push({ name, why: 'names no covering test ("test:") and is not an explicit "n/a"' }); continue; }
  }
  return missing;
}

// Findings for one Phase doc: each in-scope work stage that declares a risk surface must
// carry a complete 9-property matrix.
function checkPhaseDoc(file, text) {
  const findings = [];
  const version = parseProtocolVersion(text);
  if (!isInScope(version)) return findings; // grandfathered (explicit pre-v1.8 banner)
  for (const block of extractXmlBlocks(text)) {
    if (rootTagOf(block) !== 'work_stage_prompt') continue;
    const id = idOf(block);
    // Locate every <risk_declaration ...> ... </risk_declaration> in the block.
    const declRe = /<risk_declaration\b([^>]*)>([\s\S]*?)<\/risk_declaration>/g;
    let dm;
    let sawRealDecl = false;
    while ((dm = declRe.exec(block)) !== null) {
      const trig = realTriggers(dm[1]);
      if (trig === null) continue; // placeholder / no real trigger → not a declaration
      sawRealDecl = true;
      const props = parseProperties(dm[2]);
      const missing = unaddressedProperties(props);
      if (missing.length > 0) {
        const names = missing.map((x) => `"${x.name}" (${x.why})`).join(', ');
        findings.push(
          `${file}: <work_stage_prompt id="${id}"> <risk_declaration triggers="${trig}"> does NOT address all 9 matrix properties — ${names}. ` +
          `Each must name how a test covers it ("covered-by: … — test: …") or be an explicit "n/a — <reason>" (bounded matrix, G13).`
        );
      }
    }
    // A self-closing <risk_declaration .../> with a real trigger but no body → all 9 missing.
    if (!sawRealDecl) {
      const scRe = /<risk_declaration\b([^>]*?)\/>/g;
      let sm;
      while ((sm = scRe.exec(block)) !== null) {
        const trig = realTriggers(sm[1]);
        if (trig === null) continue;
        findings.push(
          `${file}: <work_stage_prompt id="${id}"> <risk_declaration triggers="${trig}"/> is self-closing — it declares a risk surface but omits the 9-property matrix entirely. ` +
          `Address all 9 properties (confinement / hostile-input / … ) with a covering test or an explicit "n/a" (G13).`
        );
      }
    }
  }
  return findings;
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
      `      Refusing to pass the risk-matrix gate on an unknown staged set (fail-closed).\n`
    );
    process.exit(2);
  }
  return out.split(/\r?\n/).filter((f) => f && isPhaseDoc(f));
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const positional = args.filter((a) => !a.startsWith('--'));

  let files;
  if (args.includes('--staged')) {
    files = stagedFiles();
    if (files.length === 0) process.exit(0); // no relevant Phase doc staged
  } else if (positional.length >= 1) {
    files = positional;
  } else {
    process.stderr.write('usage: validate-risk-matrix.cjs [--warn] <phase-doc.md>... | [--warn] --staged\n');
    process.exit(2);
  }

  const findings = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      // A counted finding, not an uncaught mid-list crash.
      findings.push(`${f}: cannot read file (${e && e.message ? e.message : 'unknown error'})`);
      continue;
    }
    if (isPhaseDoc(f)) findings.push(...checkPhaseDoc(f, text));
    // other files: not in G13 scope, skipped silently.
  }

  if (findings.length === 0) process.exit(0);

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} risk-matrix finding(s) (advisory — run without --warn to block). Review before the next milestone.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} risk-matrix finding(s) block this commit (G13 — a declared risk surface covers all 9 matrix properties or blocks).\n`);
  process.exit(1);
}

main();
