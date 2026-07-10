#!/usr/bin/env node
// @kit-version 0.1.0-dev
// validators/validate-release-readiness.cjs
//
// The G16 release-readiness gate (clause 2 — the
// capability-triggered independent product review), shipped framework-wide so every
// generated project inherits it. "public-distribution-ready" is the most load-bearing
// transition a product makes: a product can ship "released" over unsigned binaries and
// untested installers, and a milestone-findings re-read shares the builder's blind spots
// (the same shared-blind-spot failure). G16 makes the distribution boundary structural — three
// content-gated clauses on the append-only `docs/release-state.md` ladder, each a no-op
// on an entry that does not reach a gated state (the same grandfather instinct as the
// reconciliation / risk-matrix / transition gates):
//
//   CLAUSE 1 — CAPABILITY-TRIGGERED INDEPENDENT REVIEW. A ledger entry reaching
//     `public-distribution-ready`, WHEN the project declares capability triggers (the
//     `risk_triggers:` list in project-config.md — secrets / untrusted files / destructive
//     persistence / privileged APIs / generated executable content, the trigger list /
//     risk matrix), must cite an INDEPENDENT whole-product review record: a fresh reviewer
//     who derived their OWN whole-product threat model (the `audit` operating mode
//     repositioned as a release gate — NOT a re-read of the milestone findings). Missing
//     the record when triggers are declared → BLOCK. A no-trigger project is a no-op (the
//     review requirement is trigger-conditional, never blanket).
//
//   CLAUSE 2 — LADDER WELL-FORMEDNESS (no silently-skipped state). A transition may not
//     jump a rung: every ladder state strictly between the entry's `Prior state` and the
//     reached state must be EITHER climbed earlier OR explicitly exempted with the kit's
//     covered-or-n/a idiom — `<state>: n/a — <reason>` (e.g. a source/repo deliverable with
//     no packaged binary legitimately skips `packaged-release-ready`). An UNEXPLAINED skip
//     → BLOCK; a per-state `n/a — <reason>` is satisfied-by-exemption, not a skip. A first
//     entry (no `Prior state`) is a no-op (bootstrap).
//
//   CLAUSE 2b — LADDER CONTINUITY (the declared prior must be REAL). Clause 2
//     bounds the declared `Prior state` → reached jump to one rung but trusts the prior; a
//     `Prior` never actually reached makes a multi-rung skip look like a single step. So the
//     declared prior must be a rung ACTUALLY REACHED by an EARLIER ledger entry (checked
//     against the append-only history parseEntries returns) — a fabricated prior → BLOCK.
//     Composed with the n/a-escape: an n/a-exempted state is neither reached nor a skip (it
//     is never recorded as "reached"), and an `n/a — <reason>` / first-entry prior is exempt.
//
//   CLAUSE 3 — SLSA LEVEL CITED at the release end. An entry reaching a release-end state
//     (`packaged-release-ready` / `public-distribution-ready`, ladder states 5–6) must CITE
//     its SLSA build level — `L1`/`L2`/`L3`, or an explicit `n/a — <reason>` (a source-only
//     deliverable with no artifact to attest). A missing / bare / placeholder SLSA line →
//     BLOCK. The transition that says "distributable" is the one that proves provenance.
//
//   MANUAL-AGING (a FLAG, never a block). A `public-distribution-ready` entry carried
//     over an App-Map (--app-map, default docs/app-map.md) that still has a STALE manual-only
//     / un-driven `verified` surface is FLAGGED — surfaced as an advisory NOTE (exit 0 on its
//     own), never silently shipped and never a hard block. A manual-only (or `verified`-with-
//     no-Evidence) surface is one the assembled-execution pass never drove; public
//     distribution must not obscure it (the presence-≠-effectiveness defect, raised to the
//     surface level).
//
// ── THE HONEST LOCUS IS DUAL (non-negotiable — neither half overclaims) ──────────────────
//   This validator is the STATIC FLOOR ONLY. It proves two things are PRESENT / CITED, and
//   neither that they are GOOD:
//     • the review RECORD is PRESENT — NOT that the independent review was GOOD. Whether the
//       fresh reviewer's threat model was sound is the audit-pass adversary's judgment,
//       recorded at review time (like G14's FNR — you cannot run a judge in a pre-commit
//       smoke test).
//     • the SLSA level is CITED — NOT that provenance was ACHIEVED. The actual attestation is
//       proven at BUILD time by `release.yml`'s `actions/attest-build-provenance` step (with
//       its `id-token: write` + `attestations: write` permissions); this gate only checks the
//       ladder entry honestly states the level it claims.
//   Conflating "record present" with "product reviewed sound", or "level cited" with
//   "provenance achieved", is the exact presence-≠-effectiveness theater the arc exists to
//   kill. Floor (this validator) + adversary (the audit review + the build-time attest) = a
//   real gate; neither alone is.
//
// Severity / the toggle (mirrors the other validators, FRAMEWORK-CONFIG §4.21):
//   default (block)  — any blocking finding → exit 1. Manual-aging flags are advisory (NOTE) and do
//                      NOT raise the exit code on their own.
//   --warn           — blocking findings are downgraded to advisory (NOTE), exit 0. The
//                      fail-closed branch (exit 2) is NEVER downgraded by --warn.
//
// Usage:
//   node validators/validate-release-readiness.cjs [--warn] [--config <project-config.md>] \
//        [--app-map <docs/app-map.md>] <docs/release-state.md>...
//   node validators/validate-release-readiness.cjs [--warn] [--config ...] [--app-map ...] --staged
//
// Exit 0 = clean (or only manual-aging flags, or all blockers downgraded by --warn). Exit 1 = ≥1
// blocking finding. Exit 2 = bad invocation / fail-closed (unreadable ledger; or a public-
// distribution entry whose declared-trigger config is unreadable).
//
// Dependency-free, cross-platform, CRLF-tolerant. .cjs = always CommonJS regardless of the
// host project's package.json "type".

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CRLF (and lone CR) → LF so a Windows checkout doesn't read as a false divergence.
function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// The six-state release ladder, in climb order. Index = rung height.
const LADDER = [
  'stage-complete', 'milestone-complete', 'internally-usable',
  'source-release-ready', 'packaged-release-ready', 'public-distribution-ready',
];
const RELEASE_END = new Set(['packaged-release-ready', 'public-distribution-ready']); // states 5–6 cite SLSA
const PUBLIC = 'public-distribution-ready';

// The covered-or-n/a idiom: `n/a — <reason>` (an em-dash or hyphen, then a non-empty reason).
// A BARE `n/a` with no reason does NOT exempt — the human must state why (mirrors the
// risk-matrix gate's explicit-n/a requirement).
const NA_WITH_REASON = /^n\/?a\s*[—–-]\s*\S/i;

// ───────────────────────── project-config: declared capability triggers ──────────────────
// Mirrors validate-risk-escalation.cjs's parser (a tiny config-field read, NOT the
// reconciliation engine — inlining a 6-line field parser is not the duplication
// the rework engine reuse guards against). A {{placeholder}} / blank / `[]` / `none` → no
// triggers, so the shipped template (value {{RISK_TRIGGERS}}) never reads as declared.
function parseRiskTriggers(text) {
  const m = normalize(text).match(/^[^\n]*\brisk_triggers\b\s*:\s*(.*)$/im);
  if (!m) return []; // no field → not risk-aware → no triggers
  let raw = m[1].trim().replace(/<!--[\s\S]*$/, '').trim();
  if (raw === '' || /\{\{.*\}\}/.test(raw)) return [];
  raw = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (raw === '' || /^none$/i.test(raw)) return [];
  return raw.split(',').map((t) => t.replace(/`/g, '').trim()).filter((t) => t && !/^none$/i.test(t));
}

// ───────────────────────────────── ledger entry parsing ──────────────────────────────────
// Split a release-state ledger into entries. An entry starts at a `## ... reached `<state>``
// heading and runs to the next such heading (or EOF). Returns { state, prior, body, naStates }.
function parseEntries(text) {
  const norm = normalize(text);
  const lines = norm.split('\n');
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^##\s+.*reached\s+`([^`]+)`/i);
    if (h) {
      if (cur) entries.push(cur);
      cur = { state: h[1].trim(), prior: null, body: [], naStates: new Set() };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  if (cur) entries.push(cur);

  for (const e of entries) {
    const body = e.body.join('\n');
    const pm = body.match(/^[-*\s]*Prior state\s*:\s*`?([^`\n]+?)`?\s*(?:\(|$)/im);
    if (pm) e.prior = pm[1].trim();
    // per-state n/a exemptions: a line `<ladder-state>: n/a — <reason>`.
    for (const st of LADDER) {
      const re = new RegExp('^[-*\\s]*' + st.replace(/[-]/g, '\\-') + '\\s*:\\s*(.+)$', 'im');
      const mm = body.match(re);
      if (mm && NA_WITH_REASON.test(mm[1].trim())) e.naStates.add(st);
    }
    e.bodyText = body;
  }
  return entries;
}

// Read a tagged value line out of an entry body (e.g. "SLSA build level", "Independent review").
function entryField(body, label) {
  const re = new RegExp('^[-*\\s]*' + label + '[^:\\n]*:\\s*(.*)$', 'im');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function isPlaceholder(v) {
  return v === null || v === '' || /\{\{.*\}\}/.test(v);
}

// ───────────────────────────── the three enforcement points ──────────────────────────────
// Each is a single isolable predicate so a mutation-kill flips EXACTLY its target smoke test.

// CLAUSE 1 mutant target (entryMissingReview). A public-distribution entry with declared
// triggers needs an independent-review record. Reverting this body to `return false` ("always
// pass") makes the "triggers + no review record -> blocks" test go RED while the no-trigger and
// review-present controls stay green. The mutation is killed specifically here.
function entryMissingReview(entry, triggersDeclared) {
  if (entry.state !== PUBLIC) return false;     // only the public-distribution transition
  if (!triggersDeclared) return false;          // trigger-conditional, never blanket
  const ref = entryField(entry.bodyText, 'Independent[\\w -]*review');
  return isPlaceholder(ref);                     // no/placeholder record while triggers declared → block
}

// CLAUSE 2 mutant target (ladderWellFormed). A transition is well-formed iff it skips no rung
// that is not explicitly n/a-exempted. Reverting this body to `return true` ("any sequence
// passes") makes the "skipped ladder state -> blocks" test go RED while the sequential and
// n/a-escape controls stay green. The mutation is killed specifically here.
function ladderWellFormed(entry) {
  const curIdx = LADDER.indexOf(entry.state);
  if (curIdx === -1) return true;               // an unknown state name is not OUR skip check
  if (!entry.prior) return true;                // first entry / bootstrap — nothing to skip
  const priorIdx = LADDER.indexOf(entry.prior);
  if (priorIdx === -1) return true;             // unknown prior — cannot compute a skip
  if (curIdx <= priorIdx + 1) return true;      // a single rung (or no forward jump) is well-formed
  // every intervening rung must be exempted with `n/a — <reason>`.
  for (let i = priorIdx + 1; i < curIdx; i++) {
    if (!entry.naStates.has(LADDER[i])) return false; // an unexplained skipped rung
  }
  return true;
}

// CLAUSE 2b mutant target (priorReached — the continuity tighten). ladderWellFormed
// bounds the DECLARED `Prior state` → current jump to one rung but TRUSTS the self-declared prior;
// a `Prior` never actually reached makes a multi-rung skip look like a single step (confirmed on a
// two-entry ledger: entry₁ reached `internally-usable`, entry₂ declared `Prior: packaged-release-
// ready` and sailed through). Continuity is statically checkable from the append-only ledger
// (parseEntries returns the full history), so it is CHECKED, not disclosed away: the declared prior
// must be a rung ACTUALLY REACHED by an earlier ledger entry. Composed with the n/a-escape — an
// n/a-exempted state is neither *reached* (never added to `reached`) nor a *skip*, and an
// `n/a — <reason>` / unknown prior is not a real rung, so it is a no-op here. A first entry (no
// prior) is a bootstrap baseline. Reverting this body to `return true` ("trust the declared prior")
// makes the "fabricated prior -> blocks" test go RED while the reached-prior + n/a-prior controls
// stay green. The mutation is killed specifically here.
function priorReached(entry, reached) {
  if (!entry.prior) return true;                  // first entry / bootstrap baseline — no prior to verify
  if (LADDER.indexOf(entry.prior) === -1) return true; // an `n/a — <reason>` / unknown prior is not a real-rung claim
  return reached.has(entry.prior);                // a real-rung prior must have been climbed by an earlier entry
}

// BOOTSTRAP-BYPASS mutant target (bootstrapIntoRelease — the owner-review bootstrap-bypass close).
// The first-entry carve-outs above (priorReached / ladderWellFormed both no-op when there is no
// real-rung prior) exist so a legitimate INTERNAL bootstrap baseline isn't false-blocked — but
// they also let a single/first entry BEGIN directly at a RELEASE state (source/packaged/public),
// bypassing the entire recorded climb. A release claim requires the climb a first entry cannot
// show. So: a RELEASE-state entry whose `Prior state` is NOT a real ladder rung — absent, an
// `n/a — <reason>`, or an unknown label (the exact three cases priorReached + ladderWellFormed
// no-op on) — has no recorded climb behind it and is BLOCKED. An INTERNAL-state first entry
// (stage-complete / milestone-complete / internally-usable) is the legitimate baseline (the kit's
// own `milestone-complete` bootstrap entry, n/a-prior and all, still passes). A real climb's prior
// IS a real rung (whether it was actually reached is the continuity check's job, not this one), and
// a deliberately-skipped rung lives in `naStates`, not in the Prior field — so no legit case is
// lost. Reverting this body to `return false` ("any bootstrap passes") makes the
// "first entry at a release state -> blocks" tests go RED while the internal-state + real-climb
// controls stay green. The mutation is killed specifically here.
const FIRST_RELEASE_IDX = LADDER.indexOf('source-release-ready'); // ladder index 3 — the internal|release boundary
function bootstrapIntoRelease(entry) {
  const idx = LADDER.indexOf(entry.state);
  if (idx === -1) return false;                   // an unknown state name is not OUR check
  if (idx < FIRST_RELEASE_IDX) return false;      // an internal-state first entry is the legit baseline
  // a release-state entry with no real-rung prior (absent / n/a / unknown) → no recorded climb.
  return !entry.prior || LADDER.indexOf(entry.prior) === -1;
}

// CLAUSE 3 mutant target (entryMissingSlsa). A release-end entry must cite an SLSA level (a
// concrete L1–L3, or an explicit `n/a — <reason>`). Reverting this body to `return false`
// ("SLSA optional") makes the "packaged claim with no SLSA level -> blocks" test go RED while
// the L2-cited control stays green. The mutation is killed specifically here.
function entryMissingSlsa(entry) {
  if (!RELEASE_END.has(entry.state)) return false; // only the packaged/public release end
  const val = entryField(entry.bodyText, 'SLSA[\\w -]*level');
  if (isPlaceholder(val)) return true;
  if (/\bL[1-3]\b/i.test(val)) return false;       // a concrete level cited (SLSA v1.0 tops at L3; L4 does not exist)
  if (NA_WITH_REASON.test(val)) return false;      // honest n/a — <reason> (no artifact to attest)
  return true;                                     // present but uncited (bare "n/a", prose, etc.)
}

// Which App-Map surfaces are stale manual-only / un-driven `verified`? A flag, not a
// block. A `manual-only` row, or a `verified` row whose Evidence cell is empty/`—`, was never
// driven by the assembled-execution pass.
function staleManualSurfaces(appMapText) {
  const stale = [];
  for (const line of normalize(appMapText).split('\n')) {
    if (!/^\s*\|/.test(line)) continue;            // table rows only
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const state = cells[cells.length - 2].toLowerCase(); // State is the last data column
    if (/-{3,}/.test(line) || /^surface$/i.test(cells[1] || '')) continue; // header / separator
    const surface = cells[1] || '(unnamed surface)';
    if (/manual-only/.test(state)) {
      stale.push(`${surface} (manual-only — never driven by assembled-execution)`);
    } else if (/verified/.test(state)) {
      const evidence = cells[cells.length - 3] || '';
      if (evidence === '' || evidence === '—' || evidence === '-' || /\{\{.*\}\}/.test(evidence)) {
        stale.push(`${surface} (\`verified\` but un-driven — no assembled-execution Evidence)`);
      }
    }
  }
  return stale;
}

// ──────────────────────────────────── staged-set + main ──────────────────────────────────
function failClosed(msg) {
  process.stderr.write(
    `FAIL  ${msg}\n` +
    `      Refusing to pass the release-readiness gate on a state it could not read (fail-closed).\n`
  );
  process.exit(2);
}

// FAIL CLOSED: a `git diff --cached` failure must surface and exit non-zero.
function stagedLedgers() {
  let out;
  try {
    out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown git error';
    failClosed(`cannot enumerate staged files via \`git diff --cached\`: ${detail}`);
  }
  // the live release-state ledger, never the kit's own templates/ copy (placeholders).
  return out.split(/\r?\n/).filter((f) => {
    if (!f) return false;
    if (path.basename(f) !== 'release-state.md') return false;
    return !/(^|[\\/])templates[\\/]/.test(f);
  });
}

function main() {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');

  let configPath = 'project-config.md';
  let appMapPath = 'docs/app-map.md';
  let appMapExplicit = false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--warn' || a === '--staged') continue;
    if (a === '--config') { configPath = args[++i]; continue; }
    if (a === '--app-map') { appMapPath = args[++i]; appMapExplicit = true; continue; }
    if (a.startsWith('--')) continue;
    positional.push(a);
  }

  let files;
  if (args.includes('--staged')) {
    files = stagedLedgers();
    if (files.length === 0) process.exit(0); // no release-state.md staged → nothing to check
  } else if (positional.length >= 1) {
    files = positional;
  } else {
    process.stderr.write('usage: validate-release-readiness.cjs [--warn] [--config <md>] [--app-map <md>] <release-state.md>... | --staged\n');
    process.exit(2);
  }

  // project-config is read LAZILY (only when a public-distribution entry needs the triggers)
  // and cached — a ledger with no public-distribution entry never reads it (the no-false-
  // positive half of fail-closed).
  let triggersCache;
  function declaredTriggers() {
    if (triggersCache !== undefined) return triggersCache;
    let text;
    try {
      text = fs.readFileSync(configPath, 'utf8');
    } catch (e) {
      failClosed(
        `a public-distribution-ready entry exists but the trigger config "${configPath}" is unreadable: ` +
        `${e && e.message ? e.message : 'unknown error'}`
      );
    }
    triggersCache = parseRiskTriggers(text);
    return triggersCache;
  }

  // the App-Map is read once (for the manual-aging flag), best-effort: a missing default app-map is not an
  // error (Lite / library projects have none); an explicitly-named --app-map that is unreadable
  // is fail-closed.
  let appMapText = null;
  try {
    appMapText = fs.readFileSync(appMapPath, 'utf8');
  } catch (e) {
    if (appMapExplicit) failClosed(`--app-map "${appMapPath}" is unreadable: ${e && e.message ? e.message : 'unknown error'}`);
  }

  const findings = []; // blocking
  const flags = [];    // advisory (manual-aging)

  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      failClosed(`cannot read release-state ledger "${f}": ${e && e.message ? e.message : 'unknown error'}`);
    }
    // CLAUSE 2b reads the ledger's own history: a declared prior must be a rung reached by
    // an EARLIER entry. parseEntries returns entries oldest-first (newest at the bottom), so
    // accumulating reached states as we iterate gives each entry only its own past.
    const reached = new Set();
    for (const entry of parseEntries(text)) {
      // No bootstrap into a release state: a first/only entry at a release state with no
      // real-rung prior bypasses the recorded climb. Checked before continuity so the bootstrap
      // tell is the named reason when there is no real prior at all (the n/a / absent / unknown
      // case priorReached deliberately no-ops on).
      if (bootstrapIntoRelease(entry)) {
        findings.push(
          `${f}: ledger entry \`${entry.state}\` is a RELEASE state but has no recorded climb behind it — ` +
          `its \`Prior state\` is ${entry.prior ? `\`${entry.prior}\`` : 'absent'}, not a real ladder rung ` +
          `climbed by an earlier entry. A release claim requires the recorded climb a first/bootstrap entry ` +
          `cannot show; a first entry at an INTERNAL state (\`stage-complete\` / \`milestone-complete\` / ` +
          `\`internally-usable\`) is the legitimate baseline. A deliberately-skipped rung is declared ` +
          `\`<state>: n/a — <reason>\` (in naStates), never as the Prior. (G16 — no bootstrap into a ` +
          `release state.)`
        );
      }
      // CLAUSE 2b — continuity: the declared `Prior state` must be a rung actually reached.
      if (!priorReached(entry, reached)) {
        findings.push(
          `${f}: ladder entry \`${entry.state}\` declares \`Prior state: ${entry.prior}\` but that rung ` +
          `was NEVER REACHED by an earlier ledger entry. A fabricated prior makes a multi-rung skip look ` +
          `like a single step — the declared prior must be a state actually CLIMBED EARLIER in the ` +
          `append-only ledger (G16 continuity; an \`n/a — <reason>\` prior or a first-entry baseline ` +
          `is exempt). Floor: continuity is verified against the ledger history, not trusted.`
        );
      }
      // CLAUSE 2 — ladder well-formedness (no unexplained skipped state).
      if (!ladderWellFormed(entry)) {
        const ci = LADDER.indexOf(entry.state);
        const pi = LADDER.indexOf(entry.prior);
        const skipped = LADDER.slice(pi + 1, ci).filter((s) => !entry.naStates.has(s));
        findings.push(
          `${f}: ladder transition \`${entry.prior}\` → \`${entry.state}\` SKIPS state(s) ${skipped.map((s) => `\`${s}\``).join(', ')} ` +
          `with no exemption. Each intervening rung must be climbed or explicitly exempted (\`<state>: n/a — <reason>\`, ` +
          `the covered-or-n/a idiom). A skipped state hides an un-gated transition (G16, well-formedness).`
        );
      }
      // CLAUSE 3 — SLSA level cited at the release end.
      if (entryMissingSlsa(entry)) {
        findings.push(
          `${f}: \`${entry.state}\` is a release-end state but cites NO SLSA build level — it must state \`L1\`/\`L2\`/\`L3\` ` +
          `(default floor L2 via actions/attest-build-provenance) or an explicit \`n/a — <reason>\` (no packaged artifact). ` +
          `The distributable transition is the one that proves provenance (G16). Honest locus: the level is CITED, ` +
          `not that provenance was achieved — that is release.yml's attest step at build time.`
        );
      }
      // CLAUSE 1 — capability-triggered independent review (reads config lazily).
      if (entry.state === PUBLIC) {
        const triggers = declaredTriggers();
        if (entryMissingReview(entry, triggers.length > 0)) {
          findings.push(
            `${f}: \`public-distribution-ready\` is claimed and the project DECLARES capability triggers ` +
            `(${triggers.map((t) => `\`${t}\``).join(', ')}) but cites NO independent-review record. A high-capability ` +
            `product needs an INDEPENDENT whole-product review at the distribution boundary — a fresh reviewer's own ` +
            `threat model (the audit mode repositioned as a release gate), NOT a re-read of the milestone findings ` +
            `(G16 / EU AI Act Art. 14). Honest locus: the RECORD is required present, not judged good — ` +
            `that is the audit-pass adversary's call.`
          );
        }
        // Stale manual-only / un-driven surfaces at the public-distribution boundary.
        if (appMapText !== null) {
          for (const s of staleManualSurfaces(appMapText)) {
            flags.push(`${f}: \`public-distribution-ready\` carries a stale manual-only / un-driven surface — ${s}. A never-driven surface must not be obscured by public distribution; drive it (assembled-execution) or age it consciously.`);
          }
        }
      }
      // record this entry's reached rung for the NEXT entry's continuity check (clause 2b).
      // n/a-exempted intervening states are deliberately NOT added — an n/a state is neither
      // reached nor a skip, so a later entry cannot claim it as a legitimately-climbed prior.
      if (LADDER.indexOf(entry.state) !== -1) reached.add(entry.state);
    }
  }

  // Manual-aging flags are advisory — print them as NOTE, never raise the exit code on their own.
  for (const fl of flags) process.stderr.write(`NOTE  ${fl}\n`);

  if (findings.length === 0) {
    if (flags.length) process.stderr.write(`\n${flags.length} manual-aging flag(s) (advisory — surfaced, not blocking).\n`);
    process.exit(0);
  }

  const label = warn ? 'NOTE ' : 'FAIL ';
  for (const x of findings) process.stderr.write(`${label} ${x}\n`);
  if (warn) {
    process.stderr.write(`\n${findings.length} release-readiness finding(s) (advisory — run without --warn to block). Review before public distribution.\n`);
    process.exit(0);
  }
  process.stderr.write(`\n${findings.length} release-readiness finding(s) block this transition (G16 — capability-triggered review + ladder well-formedness + SLSA cite).\n`);
  process.exit(1);
}

module.exports = { entryMissingReview, ladderWellFormed, priorReached, bootstrapIntoRelease, entryMissingSlsa, parseEntries, LADDER };

if (require.main === module) main();
