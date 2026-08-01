#!/usr/bin/env node
// @kit-version 1.0.3
// validators/validate-stage-prompts.js
//
// Validates stage prompts embedded in Phase docs against the schemas defined
// in STAGE-PROMPT-PROTOCOL.md.
//
// Usage:
//   node validators/validate-stage-prompts.js <file> [<file> ...]
//   node validators/validate-stage-prompts.js --all          # validates all Phase docs in docs/build-prompts/
//   node validators/validate-stage-prompts.js --templates    # validates XML examples in templates/PHASE-DOC-TEMPLATE.md
//
// Exits 0 if all valid, non-zero with line-pointed errors if any fail.
//
// The validator extracts ```xml fenced blocks from markdown, identifies the
// root element (one of work_stage_prompt / closeout_stage_prompt /
// verifier_stage_prompt / refactor_stage_prompt / audit_pass_prompt), and
// checks required tags per schema. It does not
// fully parse XML — that's beyond the validation contract. Structural omission
// is what matters; form-mismatch issues (inline vs reference) are caught by
// human review.

'use strict';

const fs = require('fs');
const path = require('path');

// EXTEND, DON'T FORK: the shared inert-XML stripper. A required tag
// present ONLY inside an XML comment (or CDATA) satisfied the schema gate (checkRequiredTag
// matched the tag anywhere in the raw text). Required-tag / named-pass presence is now checked
// against the comment/CDATA-stripped XML, so a commented-out tag is NOT a live element.
const { stripInertXml } = require('./lib/fenced-block.cjs');

// The ONE stage-structure reader, shared with the UserPromptSubmit mode-check hook (M27.C,
// KF-57). This validator's structural read IS the source the hook consumes — a second
// ad-hoc classifier in the hook is exactly the drift KF-57 was filed for. It lives in
// scripts/lib/ rather than validators/lib/ because `kit-update --adopt` installs
// scripts/ but not validators/, and the hook must work in an adopted repo.
const { classifyStagePrompt, STAGE_ROOTS } = require(path.join(__dirname, '..', 'scripts', 'lib', 'stage-structure.cjs'));

const SCHEMAS = {
  work_stage_prompt: {
    required: [
      'context', 'read_first', 'scope_locks', 'gates',
      'retrospective_requirements', 'commit_protocol', 'commit_message',
      'approval_surface',
      'deliverable', 'execution_steps', 'test_plan_required',
      'acceptance_criteria',
    ],
    // v1.7: <test_honesty> is a recognized OPTIONAL work/verifier tag (the G9
    // test-honesty slot). It is NOT required here on purpose — its presence
    // is enforced by the dedicated validators/validate-test-honesty.cjs keyed off the
    // doc's declared protocol version (v1.7+ work stages must carry it; M01–M09 and
    // banner-less docs are grandfathered). Listing it required here would retro-fail
    // every pre-v1.7 doc. Recorded for lockstep (STAGE-PROMPT-PROTOCOL.md §7 / v1.7).
  },
  closeout_stage_prompt: {
    required: [
      'context', 'read_first', 'scope_locks', 'gates',
      'retrospective_requirements', 'commit_protocol', 'commit_message',
      'approval_surface',
      'cumulative_reads', 'deliverables', 'gap_analysis_requirements',
      'append_only_verification', 'three_artifact_review',
    ],
  },
  verifier_stage_prompt: {
    required: [
      'context', 'read_first', 'gates',
      'retrospective_requirements', 'commit_protocol', 'commit_message',
      'approval_surface',
      'scope_to_verify', 'verification_passes', 'findings_format',
      'merge_gate',
    ],
    // Verifier deliberately omits scope_locks (no new work to lock down),
    // execution_steps (the passes ARE the steps), test_plan_required
    // (no code change), acceptance_criteria (the findings list IS the
    // acceptance surface).
    // A <pass name="plan_challenge"> within <verification_passes>
    // is ALSO required — enforced below in validateBlock (a named pass, not a
    // top-level tag, so it cannot live in this required-tags list). Missing ->
    // BLOCK; present-but-hollow (no matrix anchor) -> WARN (Stage C's calibration
    // is the effectiveness adversary, G14).
  },
  refactor_stage_prompt: {
    required: [
      'context', 'read_first', 'gates',
      'retrospective_requirements', 'commit_protocol', 'commit_message',
      'approval_surface',
      'scope_to_refactor', 'refactor_passes', 'findings_format',
      'merge_gate',
    ],
    // Stage R mirrors the verifier schema (same fresh-context ceremony):
    // <scope_to_refactor> replaces <scope_to_verify> and <refactor_passes>
    // replaces <verification_passes>; <findings_format> + <merge_gate> are
    // shared shapes. Like the verifier, it omits scope_locks / execution_steps
    // / test_plan_required / acceptance_criteria — the passes ARE the steps and
    // the findings list IS the acceptance surface. Keeping the delta to the two
    // scope/pass tags is deliberate: it makes the add-a-stage recipe generalize.
  },
  audit_pass_prompt: {
    required: [
      'context', 'read_first', 'gates',
      'retrospective_requirements', 'commit_protocol', 'commit_message',
      'approval_surface',
      'persona', 'scope', 'checklist', 'sign_off_requirement',
      'output_format',
    ],
    // The audit pass (operating_mode: audit; M07) is a fresh-context REVIEW
    // session like the verifier — it produces findings, so it likewise omits
    // scope_locks / execution_steps / test_plan_required / acceptance_criteria.
    // But it is persona-driven and checklist-bound rather than passes-driven, so
    // it swaps the verifier's scope_to_verify / verification_passes /
    // findings_format / merge_gate for persona / scope / checklist /
    // sign_off_requirement / output_format. <sign_off_requirement> is the
    // load-bearing one (G_AUDIT_P1, mandatory per-file sign-off). This list must
    // match STAGE-PROMPT-PROTOCOL.md §8.7 exactly — that equality IS the lockstep
    // rule (§0). The root maps to role VERIFIER (audit is
    // verification) — wired in the mode-check hook's ROOT_TO_MODE, NOT a new
    // role value. The M\d{2}(?:\.\d+)?\.[A-Z] id rule is unchanged (e.g. M01.P).
  },
};

// LOCKSTEP (M27.C): the shared module owns the stage-root NAME set; this table owns each
// root's required TAGS and the hook owns each root's ROLE. The three key sets must agree —
// a schema added here without a matching entry in the module (and therefore in the hook)
// ships a root the role guard cannot see. Fail closed rather than validate half a grammar.
{
  const want = STAGE_ROOTS.slice().sort().join(',');
  const have = Object.keys(SCHEMAS).sort().join(',');
  if (want !== have) {
    console.error('validate-stage-prompts: SCHEMAS keys have drifted from scripts/lib/stage-structure.cjs STAGE_ROOTS (fail-closed).');
    console.error(`  SCHEMAS:     ${have}`);
    console.error(`  STAGE_ROOTS: ${want}`);
    console.error('  Add the root in all three places: STAGE_ROOTS, this SCHEMAS table, and the mode-check hook\'s ROOT_TO_MODE.');
    process.exit(2);
  }
}

// v1.9: the strict stage-id grammar admits ONE optional dotted-minor
// milestone segment, so a ratified minor milestone like M20.5 can express its stage
// ids (M20.5.A). Exactly one segment — a sub-sub milestone (M20.5.1.A) stays illegal
// by design. A plain milestone id (M01.A) is unchanged. Grammar-only: no slot changes.
const ID_PATTERN_STRICT = /^M\d{2}(?:\.\d+)?\.[A-Z]$/;
const ID_PATTERN_TEMPLATE = /^M(?:\[NN\]|\d{2})\.[A-Z]$/;

function extractXmlBlocks(content) {
  // Tolerate CRLF: a Windows clone of a repo without `.gitattributes` gives
  // ```xml\r\n ... \r\n``` . Anchoring on \n alone silently matches 0 blocks
  // and reports false success. \r?\n matches both line-ending styles.
  const re = /```xml\r?\n([\s\S]*?)\r?\n```/g;
  const blocks = [];
  let match;
  while ((match = re.exec(content)) !== null) {
    const lineNumber = content.slice(0, match.index).split(/\r?\n/).length + 1;
    blocks.push({ content: match[1], startLine: lineNumber });
  }
  return blocks;
}

// The raw first line-anchored element. NOT a stage-structure reader — since M27.C that is
// scripts/lib/stage-structure.cjs, shared with the hook. This survives for ONE job: naming
// the offending tag in the "unknown root element <foo>" diagnostic when the block contains
// no stage element at all. Do not grow it back into a classifier.
function findRootElement(xml) {
  const re = /^\s*<(\w+)([^>]*)>/m;
  const match = re.exec(xml);
  if (!match) return null;
  return { tag: match[1], attrs: match[2] };
}

function extractAttribute(attrs, name) {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`);
  const match = re.exec(attrs);
  return match ? match[1] : null;
}

function checkRequiredTag(xml, tag) {
  // Match opening <tag>, <tag ...>, or self-closing <tag/>, <tag .../>.
  const re = new RegExp(`<${tag}(\\s|>|/>)`);
  return re.test(xml);
}

function validateBlock(block, filePath, { allowPlaceholders }) {
  const errors = [];
  const warnings = [];
  const { content: xml, startLine } = block;

  // Presence of a required tag / named pass is judged against the comment- and
  // CDATA-stripped XML — a commented-out <tag> is not a live element. The ROOT element is read
  // from the raw xml (a real root is never inside a comment).
  const liveXml = stripInertXml(xml);

  // The SHARED structural read (M27.C): the same module, on the same bytes, that the
  // mode-check hook consumes — so a block the validator calls a work prompt can never be a
  // verifier prompt to the hook. The raw first-element scan below is only a diagnostic aid
  // for blocks with no stage element at all.
  const structure = classifyStagePrompt(xml, { allowPlaceholders });

  if (structure.state === 'invalid') {
    errors.push({ file: filePath, line: startLine, message: structure.reason });
    return { errors, warnings };
  }

  if (structure.state === 'none') {
    const raw = findRootElement(xml);
    if (!raw) {
      errors.push({ file: filePath, line: startLine, message: 'no root element found in xml block' });
    } else {
      errors.push({
        file: filePath, line: startLine,
        message: `unknown root element <${raw.tag}>. valid: ${Object.keys(SCHEMAS).join(', ')}`,
      });
    }
    return { errors, warnings };
  }

  // ONE ROOT PER BLOCK. The protocol has required this since v1.0 ("Confirm one and only
  // one root element per block") and nothing enforced it — a block carrying a quoted
  // example BESIDE its root validated as whichever one the old reader happened to pick.
  // `structure.roots` is the top-level element list, independent of which one the shared
  // precedence chose, so this fires on the ambiguous shape AND on the same-kind shape the
  // hook is content to enforce.
  if (structure.state === 'ambiguous' || (structure.roots && structure.roots.length > 1)) {
    const listed = structure.roots.map((r) => `<${r}>`).join(', ');
    errors.push({
      file: filePath, line: startLine,
      message: `more than one stage root in this xml block (${listed}) — the protocol requires `
        + `exactly one root element per block; move quoted examples inside the prompt body or into their own block`,
    });
    return { errors, warnings };
  }

  const root = { tag: structure.root, attrs: structure.attrs || '' };

  const id = extractAttribute(root.attrs, 'id');
  const idPattern = allowPlaceholders ? ID_PATTERN_TEMPLATE : ID_PATTERN_STRICT;
  if (!id) {
    errors.push({ file: filePath, line: startLine, message: `<${root.tag}> missing required id attribute` });
  } else if (!idPattern.test(id)) {
    const example = allowPlaceholders ? 'M01.A or M[NN].A' : 'M01.A or M20.5.A';
    errors.push({
      file: filePath, line: startLine,
      message: `<${root.tag} id="${id}"> id must match ${idPattern.source} (e.g., ${example})`,
    });
  }

  const schema = SCHEMAS[root.tag];
  for (const tag of schema.required) {
    if (!checkRequiredTag(liveXml, tag)) {
      errors.push({
        file: filePath, line: startLine,
        message: `<${root.tag}${id ? ` id="${id}"` : ''}> missing required <${tag}>`,
      });
    }
  }

  // Stage prompts must never reference ORCHESTRATOR.md — it is the orchestrator
  // role's manual; build/verifier/closeout sessions deliberately do not read it.
  if (/ORCHESTRATOR\.md/.test(liveXml)) {
    errors.push({
      file: filePath, line: startLine,
      message: `<${root.tag}${id ? ` id="${id}"` : ''}> references ORCHESTRATOR.md — stage prompts must not; it is orchestrator-only`,
    });
  }

  // The verifier's plan-challenge is a REQUIRED,
  // matrix-anchored pass — the standing HOME for the escape catalog accreted ad-hoc
  // across prior Stage V runs (an n/a that's false; a prose-dodged count; assert-a-constant /
  // always-matching-snapshot / mock-only; a forged ledger that still reconciles; a stub
  // that passes "assembled"; an under-declared trigger; a toy-path confinement; a
  // bare-startsWith; a quietly-dropped fence caveat; did the milestone follow the gate-design contract).
  // A <verifier_stage_prompt> WITHOUT a <pass name="plan_challenge"> leaves the
  // adversarial half of every gate unexercised -> BLOCK.
  if (root.tag === 'verifier_stage_prompt') {
    // The verifier-proof: the calibration
    // SELF-TEST is a REQUIRED pass. Every Stage V opens by running its plan-challenge against
    // the seeded-defect set (prompts/calibration/) and must catch all seeds (FNR = 0) before
    // its real findings count. A <verifier_stage_prompt> WITHOUT a <pass
    // name="calibration_self_test"> leaves the plan-challenge UNPROVEN (a rubber-stamping
    // verifier reads as "Sound") -> BLOCK. Honest locus: the floor here only checks the pass is
    // WIRED; the catch is judgment recorded at V-time as the FNR (validators/validate-
    // calibration.cjs is the set/findings floor; the FNR is the adversary). Parallel to the
    // plan_challenge requirement below.
    const calBlock = /<pass\b[^>]*\bname=["']calibration_self_test["'][\s\S]*?(?:\/>|<\/pass>)/i.exec(liveXml);
    if (!calBlock) {
      errors.push({
        file: filePath, line: startLine,
        message: `<verifier_stage_prompt${id ? ` id="${id}"` : ''}> missing the required <pass name="calibration_self_test"> — every Stage V self-tests its plan-challenge against the seeded-defect calibration set (prompts/calibration/, FNR = 0) before its findings count (G14)`,
      });
    }

    const pcBlock = /<pass\b[^>]*\bname=["']plan_challenge["'][\s\S]*?(?:\/>|<\/pass>)/i.exec(liveXml);
    if (!pcBlock) {
      errors.push({
        file: filePath, line: startLine,
        message: `<verifier_stage_prompt${id ? ` id="${id}"` : ''}> missing the required <pass name="plan_challenge"> — the matrix-anchored plan-challenge carrying the standing escape catalog`,
      });
    } else if (!/matrix|9[- ]propert|nine[- ]propert|declared risk|catalog/i.test(pcBlock[0])) {
      // Presence-gated: WARN — not block — when the plan_challenge pass is
      // hollow (no matrix anchor + no standing-catalog reference). Whether a present pass
      // actually catches defects is proven by Stage C's seeded-defect calibration (G14, the
      // adversary); the validator only floors the structure. A hollow pass that merely warns
      // here is the case Stage C's calibration is built to catch — B↔C coupling.
      warnings.push(`${filePath}: <verifier_stage_prompt${id ? ` id="${id}"` : ''}> <pass name="plan_challenge"> names no matrix anchor or standing-catalog reference — anchor it on the declared risk matrix's 9 properties + the escape catalog; Stage V/C judges effectiveness.`);
    }
  }

  return { errors, warnings };
}

// Phase docs should be intent + advisory rails, not 1000+ line speculative
// ship-lists. Warn (don't fail) above this so the author trims toward the
// 300-500 line target without blocking a commit.
const PHASE_DOC_LINE_WARN = 600;

function validateFile(filePath, options) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    // A single unreadable file is a COUNTED error, not an uncaught crash
    // that abandons every later file in the list (mid-list fault → lost coverage).
    return {
      blocks: 0,
      errors: [{ file: filePath, line: 0, message: `could not read file (${e && e.message ? e.message : 'unknown error'})` }],
      warnings: [],
    };
  }
  const warnings = [];
  const lineCount = content.split(/\r?\n/).length;
  if (/build-prompts[\\/]M\d{2}.*\.md$/.test(filePath) && lineCount > PHASE_DOC_LINE_WARN) {
    warnings.push(`${filePath}: ${lineCount} lines (> ${PHASE_DOC_LINE_WARN}) — Phase docs should be intent + advisory inventory, target 300-500 lines. Not an error; trim toward intent.`);
  }
  const blocks = extractXmlBlocks(content);
  if (blocks.length === 0) return { blocks: 0, errors: [], warnings };
  const blockResults = blocks.map(b => validateBlock(b, filePath, options));
  const errors = blockResults.flatMap(r => r.errors);
  warnings.push(...blockResults.flatMap(r => r.warnings));
  return { blocks: blocks.length, errors, warnings };
}

function findFiles(rootDir, kind) {
  if (kind === 'phase') {
    const dir = path.join(rootDir, 'docs', 'build-prompts');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => /^M\d{2}.*\.md$/.test(f))
      .map(f => path.join(dir, f));
  }
  if (kind === 'templates') {
    const templateFile = path.join(rootDir, 'templates', 'PHASE-DOC-TEMPLATE.md');
    return fs.existsSync(templateFile) ? [templateFile] : [];
  }
  return [];
}

const args = process.argv.slice(2);
let files = [];
let allowPlaceholders = false;

if (args.includes('--all')) {
  files = findFiles(process.cwd(), 'phase');
  if (files.length === 0) {
    console.log('validate-stage-prompts: no Phase docs found at docs/build-prompts/M*.md (this is fine if the project has no milestones yet)');
    process.exit(0);
  }
} else if (args.includes('--templates')) {
  files = findFiles(process.cwd(), 'templates');
  allowPlaceholders = true;
  if (files.length === 0) {
    console.log('validate-stage-prompts: no templates/PHASE-DOC-TEMPLATE.md found');
    process.exit(0);
  }
} else if (args.length === 0) {
  console.error('validate-stage-prompts: no files given. Use --all to validate Phase docs, --templates to validate template examples, or pass file paths.');
  process.exit(2);
} else {
  files = args.filter(a => !a.startsWith('--'));
  if (args.includes('--allow-placeholders')) allowPlaceholders = true;
}

let totalBlocks = 0;
let totalErrors = 0;
const fileSummaries = [];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`validate-stage-prompts: file not found: ${f}`);
    totalErrors++;
    fileSummaries.push({ file: f, blocks: 0, errors: 1 });
    continue;
  }
  const { blocks, errors, warnings } = validateFile(f, { allowPlaceholders });
  totalBlocks += blocks;
  for (const e of errors) {
    console.error(`${e.file}:${e.line}: ${e.message}`);
  }
  for (const w of (warnings || [])) {
    console.error(`warning: ${w}`);
  }
  fileSummaries.push({ file: f, blocks, errors: errors.length });
  totalErrors += errors.length;
}

console.log();
console.log('--- summary ---');
for (const s of fileSummaries) {
  const status = s.errors === 0
    ? `OK    (${s.blocks} block${s.blocks === 1 ? '' : 's'})`
    : `FAIL  (${s.errors} error${s.errors === 1 ? '' : 's'} in ${s.blocks} block${s.blocks === 1 ? '' : 's'})`;
  console.log(`${status}\t${s.file}`);
}
console.log();
console.log(`${totalBlocks} block${totalBlocks === 1 ? '' : 's'} across ${files.length} file${files.length === 1 ? '' : 's'}; ${totalErrors} error${totalErrors === 1 ? '' : 's'}.`);

process.exit(totalErrors > 0 ? 1 : 0);
