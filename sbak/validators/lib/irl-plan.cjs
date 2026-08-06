#!/usr/bin/env node
// @kit-version 1.0.4
// validators/lib/irl-plan.cjs
//
// THE SHARED IRL/HITL-PLAN DETECTOR (M29.A) — the one reader of the spec's three-part
// IRL/HITL plan section, consumed by BOTH halves of the M29.A fix so they can never
// disagree about what "the section is present" means:
//   • validators/validate-irl-plan.cjs      — the presence FLOOR (half b)
//   • validators/validate-retrospective.cjs — the closeout CONSUMPTION gate's arming
//     check (half a): the human-drive block is demanded only when the spec actually
//     carries the section this block instantiates.
//
// WHAT "PRESENT" MEANS — THE THREE PARTS, EACH INDIVIDUALLY (never a section heading).
// The field escape this exists to kill: a bootstrap that silently skipped a mandatory
// prose-only instruction shipped a 68-line Full-tier spec with ZERO IRL/HITL content,
// and a milestone closed with no human ever running the app. The M29 plan-challenge
// names the residual escape too: "a presence floor that string-matches a heading
// instead of the three parts". So detection binds each part's SUBSTANCE:
//   part A — a heading matching /drive moments/  + at least one table data row
//   part B — a heading matching /by hand/        + at least one table data row
//   part C — a heading matching /gets typed/     + at least one table data row
// A heading with no table rows behind it (before the next heading) is MISSING. Matching
// is heading-line structural (emphasis/backticks stripped), never keyword-sniffing prose
// (the G9/G12 keyword-family lesson). `TBD` cell values are deliberately legitimate —
// the template's honest Phase-1 interim ("TBD — set at Phase 2") must not RED.
//
// ARMING CONTEXT (shared): readProjectContext(root) reads project-config.md's
// `**Tier:**` line. No project-config.md → not a generated-project root (the kit's own
// workshop tree is the canonical case) → both consumers take a VISIBLE n/a, never a
// silent pass and never a RED-loop on workshop commits.
//
// Dependency-free (Node builtins + the kit's own lib). .cjs = always CommonJS.

'use strict';

const fs = require('fs');
const path = require('path');

// The three parts, as data: static patterns only (no user input ever reaches a RegExp).
const PARTS = [
  { id: 'A', name: 'drive moments per milestone boundary', heading: /\bdrive moments\b/i },
  { id: 'B', name: 'what the human verifies by hand', heading: /\bby hand\b/i },
  { id: 'C', name: 'where each answer gets typed', heading: /\bgets typed\b/i },
];

function normalize(s) {
  let t = String(s === undefined || s === null ? '' : s);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// A heading line's comparable text: strip the #-marker, emphasis and backticks — the
// template writes `**by hand**` and an instantiated spec may not.
function headingText(line) {
  return line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/[*_`]/g, '');
}

// Detect the three parts over a spec's text. Returns { present: {A,B,C}, missing: [partObj] }.
function detectParts(specText) {
  const lines = normalize(specText).split('\n');
  // Split into heading-bounded sections: [{ text, body: [lines] }]
  const sections = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) {
      cur = { text: headingText(line), body: [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  }
  const present = {};
  for (const part of PARTS) {
    present[part.id] = sections.some((sec) => {
      if (!part.heading.test(sec.text)) return false;
      // Substance: at least one table DATA row — a pipe line that is neither the
      // header (first pipe line) nor the |---| separator.
      const pipeLines = sec.body.filter((l) => /^\s*\|/.test(l));
      const dataRows = pipeLines.filter((l) => !/^\s*\|[\s:|-]*\|?\s*$/.test(l));
      return dataRows.length >= 2; // header row + at least one real row
    });
  }
  return { present, missing: PARTS.filter((p) => !present[p.id]) };
}

// Shared arming context. Returns one of:
//   { armed: false, na: '<reason>' }                 — visible n/a; the consumer prints it
//   { armed: true, tier: 'Full', specPath, specText } — Full tier with a readable spec
// `needSpec: false` (the consumption gate) still reads the spec when present so the
// section check can run; a missing spec is its own n/a there too.
function readProjectContext(root) {
  const cfgPath = path.join(root, 'project-config.md');
  let cfg;
  try {
    cfg = fs.readFileSync(cfgPath, 'utf8');
  } catch (_) {
    return { armed: false, na: 'no project-config.md at the root (not a generated-project root — e.g. the kit workshop tree)' };
  }
  const m = normalize(cfg).match(/^\*\*Tier:\*\*\s*(\S+)/m);
  const tier = m ? m[1] : null;
  if (!tier) return { armed: false, na: 'project-config.md carries no **Tier:** line — the gate arms only on an explicit Full tier' };
  if (!/^full$/i.test(tier)) return { armed: false, na: `tier is ${tier} — the gate arms at Full tier only` };
  const specPath = path.join(root, 'spec', 'project-spec.md');
  let specText;
  try {
    specText = fs.readFileSync(specPath, 'utf8');
  } catch (_) {
    return { armed: false, na: 'no spec/project-spec.md — nothing to check the section against yet', tier: 'Full' };
  }
  return { armed: true, tier: 'Full', specPath, specText };
}

module.exports = { PARTS, detectParts, readProjectContext };
