#!/usr/bin/env node
// @kit-version 0.2.0
// validators/lib/fenced-block.cjs
//
// The shared LINE-ANCHORED, BLOCK-BOUND fence/field extractor —
// the one primitive the presence-gate audit called for. It is consumed by the presence-
// gate validators (validate-reconciliation / validate-calibration / validate-risk-matrix /
// validate-retrospective / validate-operating-mode / validate-stage-prompts) so a datum is
// only "present" when it sits in the RIGHT structural place — never anywhere in the blob.
//
// ── WHY ONE PRIMITIVE (the "unanchored-presence" family) ────────────────────────────────
//   The dominant P4 fail-open class was a gate that asserted PRESENCE SOMEWHERE — an
//   unanchored whole-file `.test()`, a substring `includes()`, a first-`.match()` — instead
//   of THE STRUCTURALLY-BOUND DATUM it meant to check. A decoy fence, a quoted verdict, a
//   prefix-plus-junk value, or whitespace then slipped a gate open (or tripped it closed).
//   These escapes recur across the presence-gate validators (validate-calibration is hit in
//   both directions). The remediation is to close it at the primitive, not with N spot-fixes:
//   this module IS that primitive (line-anchor precedent: validate-transition's extractRework).
//   Extend, don't fork — the consumers CONSUME this; they never re-implement the extraction.
//
// ── WHAT "STRUCTURAL PLACE" MEANS ───────────────────────────────────────────────────────
//   • extractBlocks(text, label) — a ```<label> block counts ONLY when its OPENING and
//     CLOSING fence each sit at a LINE START (leading whitespace only). An inline/mid-line
//     ```<label> mention (after prose on the same line), or a fence quoted inside a sentence,
//     is NOT a block. So a decoy/illustrative fence does not satisfy a gate.
//   • fieldInBlock(block, key) — a `key: value` line counts ONLY when it sits at a line start
//     WITHIN the given block/region, and the value is the WHOLE remaining token(s) on the line
//     (never a prefix capture — `greenfield9` reads as `greenfield9`, not `greenfield`). There
//     is NO whole-file fallback: a field absent from the block is absent, full stop.
//   • stripInertXml(xml) — remove XML comments + CDATA so a tag "present" only inside
//     `<!-- ... -->` is NOT counted as a live element (a commented-out tag is inert).
//
// HONEST LIMITATION (no false confidence): this is a line/structure recognizer, not an XML
// or Markdown parser. It anchors on fences and line-start fields — the structural places these
// docs actually use — and is CRLF/BOM-tolerant. A pathologically nested construct is out of
// scope; the adversarial half stays Stage V, as with every presence-gated floor in the kit.
//
// Dependency-free, cross-platform, CRLF/BOM-tolerant. .cjs = always CommonJS regardless of the
// host project's package.json "type".

'use strict';

// Strip a leading UTF-8 BOM and normalize CRLF / lone-CR to LF, so a Windows checkout never
// reads as a false divergence and a BOM-prefixed file's first fence still anchors at line 1.
function normalize(s) {
  if (s === undefined || s === null) return '';
  let t = String(s);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); // BOM
  return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Escape a string for literal use inside a RegExp.
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// LINE-ANCHORED fenced-block extraction. Returns the body (between the fences) of every
// ```<label> ... ``` block whose opening AND closing fence sit at a line start (leading
// whitespace only). The opening fence line may carry trailing text after the label
// (```<label> info-string). CRLF/BOM-tolerant. Mirrors validate-transition.extractRework
// (the proven line-anchor), generalized over an arbitrary label.
function extractBlocks(text, label) {
  const norm = normalize(text);
  const re = new RegExp('^[ \\t]*```' + escapeRe(label) + '[^\\n]*\\n([\\s\\S]*?)^[ \\t]*```', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(norm)) !== null) out.push(m[1]);
  return out;
}

// POSITION-AWARE extraction. Same anchoring as extractBlocks, but returns for
// every block { body, startLine, endLine } where startLine/endLine are 1-indexed, FENCE-INCLUSIVE
// line numbers in the NORMALIZED text (startLine = the opening ```<label> line; endLine = the
// closing ``` line). The line span is a block's IDENTITY BY POSITION — what a staged-diff
// line-range check keys off so a DUPLICATE block, a verbatim QUOTE of a block's body elsewhere, or
// a partially-edited block cannot alias one another (content set-membership can't tell them apart;
// two distinct spans always can). Consumed by validate-reconciliation / validate-transition's
// staged-added determination. CRLF/BOM-tolerant via the shared normalize, so a span line number
// matches a `git diff` new-file line number under the standard staged==working-tree assumption.
function extractBlocksWithPos(text, label) {
  const norm = normalize(text);
  const re = new RegExp('^[ \\t]*```' + escapeRe(label) + '[^\\n]*\\n([\\s\\S]*?)^[ \\t]*```', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(norm)) !== null) {
    // m.index sits at a line start (the `^` anchor), so the newline count before it IS the
    // 0-based line index; +1 → the 1-indexed opening-fence line.
    const startLine = norm.slice(0, m.index).split('\n').length;
    const endLine = startLine + m[0].split('\n').length - 1; // fence-inclusive closing line
    out.push({ body: m[1], startLine, endLine });
  }
  return out;
}

// Blank / placeholder / sentinel value — a field carrying one of these is not real content.
const EMPTY_CELL = new Set(['', '-', '—', '–', 'n/a', 'na', 'tbd']);
function isBlankValue(v) {
  if (v === undefined || v === null) return true;
  const t = String(v).replace(/`/g, '').trim();
  if (t === '') return true;
  if (/\{\{.*\}\}/.test(t)) return true;          // {{placeholder}}
  return EMPTY_CELL.has(t.toLowerCase());
}

// Turn a field key into a line-start pattern fragment. Underscore and space are treated as
// interchangeable (operating_mode / operating mode), matching how these markdown fields are
// actually written across the kit's docs.
function keyPattern(key) {
  return escapeRe(key).replace(/[_ ]/g, '[_ ]');
}

// BLOCK-BOUND field read. Returns the trimmed value of the FIRST `key: value` (or `key: **`,
// or `**key:**`) line that sits at a line start WITHIN the given block/region — NO whole-file
// fallback, and the value is the WHOLE line remainder (surrounding backticks stripped), never
// a prefix capture. Returns null when the key is absent. A prose mention (`the key: v example`
// mid-sentence) does NOT match — the line must START with the key. Case-insensitive.
function fieldInBlock(block, key) {
  const norm = normalize(block);
  const re = new RegExp('^[ \\t]*\\**\\s*' + keyPattern(key) + '\\s*\\**\\s*[:*]+[ \\t]*(.*?)[ \\t]*$', 'im');
  const m = norm.match(re);
  if (!m) return null;
  return m[1].replace(/^`+|`+$/g, '').trim();
}

// Remove XML comments (<!-- ... -->) and CDATA sections (<![CDATA[ ... ]]>) so a tag that
// appears ONLY inside a comment/CDATA is NOT read as a live element (a commented-out
// required tag must not satisfy the schema gate). Replaces with spaces of equal length so any
// line/offset math downstream is unperturbed.
function stripInertXml(xml) {
  const norm = normalize(xml);
  return norm
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => m.replace(/[^\n]/g, ' '));
}

module.exports = { normalize, escapeRe, extractBlocks, extractBlocksWithPos, fieldInBlock, isBlankValue, stripInertXml };
