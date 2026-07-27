#!/usr/bin/env node
// @kit-version 1.0.1
// scripts/lib/stage-structure.cjs
//
// The ONE structural reader for the framework's stage-prompt grammar (M27.C, KF-57;
// rider §5). Consumed by BOTH validators/validate-stage-prompts.cjs and the
// UserPromptSubmit mode-check hook (+ its template twin), so the two can never
// disagree about what a stage prompt IS. Extend, don't fork: a second ad-hoc reader
// is precisely the drift this module exists to retire.
//
// ── WHY IT LIVES IN scripts/lib/ AND NOT validators/lib/ ────────────────────────────────
//   `kit-update --adopt` installs three trees only — templates/dot-claude -> .claude,
//   templates/dot-githooks -> .githooks, templates/scripts -> scripts. `validators/` is
//   NOT among them. A hook requiring validators/lib/… is module-less in every adopted
//   repo, i.e. the control is silently DORMANT exactly where adoption promised it was
//   live (the KF-56 class). scripts/lib/ is present in the kit, in both scaffold tiers,
//   and in the adopt tree, so ONE relative require (../../scripts/lib/stage-structure.cjs)
//   resolves from .claude/hooks/ in the kit, in a generated project, in an adopted repo
//   AND inside templates/ — which is what keeps the hook twins byte-identical.
//
// ── WHAT IT RETURNS ─────────────────────────────────────────────────────────────────────
//   { state: 'none' }                                  no stage element present -> ad-hoc
//   { state: 'complete',  root, attrs, id, conformant, roots, span }
//   { state: 'partial',   root, attrs, id, conformant, roots }   an unclosed opening tag
//   { state: 'ambiguous', reason, roots }              two conformant roots, different kinds
//   { state: 'invalid',   reason, root }               positively a stage prompt, malformed
//   `state` plus `root`/`reason` are the contract (rider §5.3); the remaining keys are a
//   superset the validator consumes. `roots` lists the names of the TOP-LEVEL COMPLETE
//   elements in document order — what a consumer enforcing "exactly one root per block"
//   keys off, independently of which one this module chose.
//
// ── THE PRECEDENCE RULE (why an example above a real prompt no longer wins) ─────────────
//   The retired classifier took the EARLIEST recognized tag that closed anywhere, so a
//   quoted example above the real root captured the classification — and, from the other
//   direction, a decoy root before the real one flipped it. Candidates here are the
//   TOP-LEVEL elements (a quoted example nested inside the real root is dropped), and
//   among them:
//     1. two or more GRAMMAR-CONFORMANT candidates of DIFFERENT kinds -> ambiguous;
//     2. two or more conformant candidates of the SAME kind          -> that kind (the
//        answer is determinate, so do not false-block; a consumer that also requires
//        one-root-per-block still flags the input via `roots`);
//     3. exactly one conformant candidate                            -> that one, wherever
//        it sits — conformance outranks position, in both directions;
//     4. no conformant candidate                                     -> the LAST one.
//   "Grammar-conformant" means the opening tag carries a stage id the framework grammar
//   admits (M27.C, M20.5.A; the template placeholder M[NN].A under allowPlaceholders).
//   That is the whole discriminator: an illustration is written without a real stage id,
//   a submitted prompt carries one.
//
// ── HONEST SCOPE (the narrowed claim; do not widen it) ──────────────────────────────────
//   For the framework's validated stage-prompt grammar this identifies the outer stage
//   element and reports its kind. Stated in full, on one line so it cannot be quoted in
//   half: it is a role-separation guard for that grammar, not a general XML parser and
//   not a security boundary. It proves nothing about arbitrary XML. It is TOTAL by
//   contract: the hook runs it on hostile, truncated and bounded stdin, so it never
//   throws, whatever it is handed.
//
// Dependency-free, cross-platform, CRLF/BOM-tolerant. .cjs = always CommonJS regardless
// of the host project's package.json "type".

'use strict';

// The framework's stage roots. THE source of truth for the name set: the validator's
// SCHEMAS keys and the hook's ROOT_TO_MODE keys are both asserted equal to this, so
// adding a schema without wiring the hook (an ADDING-A-STAGE.md checklist item that used
// to be manual) now fails closed instead of shipping a half-wired root.
const STAGE_ROOTS = Object.freeze([
  'work_stage_prompt',
  'closeout_stage_prompt',
  'verifier_stage_prompt',
  'refactor_stage_prompt',
  'audit_pass_prompt',
]);

// The stage-id grammar (mirrors validate-stage-prompts' ID_PATTERN_STRICT /
// ID_PATTERN_TEMPLATE — one dotted-minor segment admitted, e.g. M20.5.A; a sub-sub
// milestone stays illegal by design).
const ID_STRICT = /^M\d{2}(?:\.\d+)?\.[A-Z]$/;
const ID_TEMPLATE = /^M(?:\[NN\]|\d{2})\.[A-Z]$/;

// Strip a leading UTF-8 BOM and normalize CRLF / lone-CR to LF. Byte-identical in
// behavior to validators/lib/fenced-block.normalize — see stripInert for why the
// duplication is deliberate rather than a fork.
function normalize(s) {
  if (s === undefined || s === null) return '';
  let t;
  try { t = String(s); } catch (_) { return ''; } // exotic object with a throwing toString
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Make XML comments and CDATA inert (space-preserving, so offsets are unperturbed): a
// stage root that exists ONLY inside `<!-- … -->` is not a live element, exactly as
// validate-stage-prompts already treats a commented-out required tag.
//
// DELIBERATE DUPLICATION, NOT A FORK: this is the same transform as
// validators/lib/fenced-block.stripInertXml, re-implemented here because that module is
// not in the adopt tree (see the header). The kit's floor pins the two BYTE-FOR-BYTE
// against a shared corpus, so the copy cannot drift silently — a required condition of
// keeping this module dependency-free.
function stripInert(text) {
  return normalize(text)
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => m.replace(/[^\n]/g, ' '));
}

function idOf(attrs) {
  const m = /\bid\s*=\s*["']([^"']*)["']/.exec(attrs || '');
  return m ? m[1] : null;
}

function isConformantId(id, allowPlaceholders) {
  if (typeof id !== 'string' || id.length === 0) return false;
  return allowPlaceholders ? ID_TEMPLATE.test(id) : ID_STRICT.test(id);
}

// Tokenize the stage-root open/close tags. The trailing lookahead is the word boundary:
// `<work_stage_promptX>` is a different element and must not match.
const TAG_RE = new RegExp('<(/?)(' + STAGE_ROOTS.join('|') + ')(?=[\\s/>])([^>]*)>', 'g');
// An opening tag whose `>` never arrived — a paste truncated mid-tag (the bounded-stdin
// ceiling can land here). Recognized only when no tokenized element was found at all.
const OPEN_FRAGMENT_RE = new RegExp('<(' + STAGE_ROOTS.join('|') + ')(?=[\\s/>]|$)([^>]*)$');

function tokenize(src) {
  const out = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(src)) !== null) {
    const attrs = m[3] || '';
    out.push({
      close: m[1] === '/',
      name: m[2],
      attrs: attrs.replace(/\/\s*$/, ''),
      selfClosing: /\/\s*$/.test(attrs),
      start: m.index,
      end: TAG_RE.lastIndex,
    });
  }
  return out;
}

// Pair opens with closes. Returns the complete elements (with spans), the opens that were
// never closed, and whether any two spans CROSS — the malformed shape a role check must
// not silently classify.
//
// The distinction that matters (rider §5.4 case 2): an opening tag left open INSIDE an
// element that then closes is a bare MENTION — prose naming another stage kind — and is
// simply discarded. It is not a crossing, and treating it as one would reject exactly the
// legitimate prompt case 2 requires to classify. A genuine crossing shows up later, as a
// closing tag whose opening tag was already discarded by its parent's close
// (`<work …><verifier …></work></verifier>`): there the inner element outlives its parent
// and the outer element genuinely cannot be determined.
function pairElements(tokens) {
  const stack = [];
  const elements = [];
  const discarded = [];
  let crossed = false;
  for (const t of tokens) {
    if (t.selfClosing) {
      elements.push({ name: t.name, attrs: t.attrs, start: t.start, end: t.end });
      continue;
    }
    if (!t.close) { stack.push(t); continue; }
    let i = stack.length - 1;
    while (i >= 0 && stack[i].name !== t.name) i--;
    if (i < 0) {
      // A close with no open on the stack. Malformed only if its open was discarded by an
      // earlier parent close (a true crossing); an unmatched close in prose is inert.
      if (discarded.some((d) => d.name === t.name)) crossed = true;
      continue;
    }
    const open = stack[i];
    for (let k = i + 1; k < stack.length; k++) discarded.push(stack[k]); // bare mentions
    stack.length = i;
    elements.push({ name: open.name, attrs: open.attrs, start: open.start, end: t.end });
  }
  return { elements, unclosed: stack, crossed };
}

// Keep only the elements that are not contained in another element's span — a quoted
// example NESTED inside the real root is an illustration, never a candidate root.
function topLevel(elements) {
  const sorted = elements.slice().sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const out = [];
  let cover = -1;
  for (const e of sorted) {
    if (e.start > cover) { out.push(e); cover = e.end; }
  }
  return out;
}

// The precedence rule (see the header). `candidates` are top-level completes plus
// never-closed opens, each already carrying `complete` and `conformant`.
function choose(candidates) {
  const conformant = candidates.filter((c) => c.conformant);
  if (conformant.length >= 2) {
    const kinds = [];
    for (const c of conformant) if (kinds.indexOf(c.name) === -1) kinds.push(c.name);
    if (kinds.length > 1) {
      return {
        ambiguous: true,
        reason: 'more than one grammar-conformant stage root submitted together ('
          + kinds.map((k) => '<' + k + '>').join(', ')
          + ') — which one is being run is undecidable; submit exactly one stage prompt',
      };
    }
    return { pick: conformant[conformant.length - 1] };
  }
  if (conformant.length === 1) return { pick: conformant[0] };
  return { pick: candidates[candidates.length - 1] };
}

// Classify the stage structure of `text`. TOTAL: never throws, whatever it is handed.
//   opts.allowPlaceholders — widen the id grammar to the template form (M[NN].A), for the
//   validator's --templates mode. Never set by the hook: a real session never runs a
//   placeholder prompt.
function classifyStagePrompt(text, opts) {
  try {
    const allowPlaceholders = !!(opts && opts.allowPlaceholders);
    const src = stripInert(text);
    const tokens = tokenize(src);

    if (tokens.length === 0) {
      // No complete tag. A paste truncated mid-opening-tag still declares its kind.
      const frag = OPEN_FRAGMENT_RE.exec(src);
      if (!frag) return { state: 'none' };
      const attrs = frag[2] || '';
      const id = idOf(attrs);
      return {
        state: 'partial',
        root: frag[1],
        attrs,
        id,
        conformant: isConformantId(id, allowPlaceholders),
        roots: [],
      };
    }

    const { elements, unclosed, crossed } = pairElements(tokens);
    if (crossed) {
      return {
        state: 'invalid',
        root: elements.length ? elements[0].name : (unclosed[0] && unclosed[0].name) || null,
        reason: 'malformed stage prompt: element spans cross (an inner stage element is '
          + 'closed after its parent), so the outer element cannot be determined',
      };
    }

    const tops = topLevel(elements);
    const decorate = (e, complete) => {
      const id = idOf(e.attrs);
      return {
        name: e.name,
        attrs: e.attrs,
        id,
        conformant: isConformantId(id, allowPlaceholders),
        complete,
        start: e.start,
        end: e.end,
      };
    };
    const candidates = tops.map((e) => decorate(e, true))
      .concat(unclosed.map((t) => decorate(t, false)))
      .sort((a, b) => a.start - b.start);

    const roots = tops.map((e) => e.name);
    if (candidates.length === 0) return { state: 'none' };

    const decided = choose(candidates);
    if (decided.ambiguous) return { state: 'ambiguous', reason: decided.reason, roots };

    const p = decided.pick;
    return {
      state: p.complete ? 'complete' : 'partial',
      root: p.name,
      attrs: p.attrs,
      id: p.id,
      conformant: p.conformant,
      roots,
      span: { start: p.start, end: p.end },
    };
  } catch (e) {
    // Totality is a CONTRACT, not an aspiration: the hook runs this on hostile stdin, and
    // an exception there would take the whole prompt path down. An internal fault is
    // reported as `invalid` so a consumer's documented unsafe-state policy applies — it is
    // never silently 'none' (that would read as "ad-hoc, allow").
    return { state: 'invalid', root: null, reason: 'stage-structure reader fault: ' + (e && e.message ? e.message : String(e)) };
  }
}

module.exports = { STAGE_ROOTS, classifyStagePrompt, stripInert, normalize, idOf, isConformantId };
