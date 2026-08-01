#!/usr/bin/env node
// validators/lib/release-version.cjs
// @kit-version 1.0.3
//
// THE ONE DERIVATION SOURCE for the kit's release identity.
//
// Before this module, the release version was hand-anchored in several release-shape
// checks as string AND regex literals — including an ESCAPED-REGEX form (a regex spelled
// `<major>\.<minor>\.<patch>`, dots backslash-escaped) that a plain-text sweep cannot
// see — while NOTHING at all read the version strings rendered into shipped documents.
// That combination is how a quickstart carried a superseded version through three
// releases: the docs drifted where no check was looking, and every bump cost a manual
// re-anchor round across sites nobody could enumerate reliably.
//
// One source in: release-manifest.json. Everything else is derived from it.
//
// ── SCOPE: THE DERIVATION ONLY ────────────────────────────────────────────────────────
// This module is the shipped half. It answers "what is the release identity" and nothing
// else. The workshop's stale-literal sweep, its dated allowlist and its document-set
// derivations live OUTSIDE the packaged tree (scripts/lib/release-sweep.cjs), because
// they have no shipped consumer and because an allowlist necessarily names the internal
// findings it defers — which the payload's no-autobiography rule forbids. Keeping the
// halves apart makes that structural rather than a rule someone has to remember.
//
// ── WHY THIS LIVES IN validators/lib/ (both halves are load-bearing) ──────────────────
//   (1) `validators/` is already a DIRECTORY PASSTHROUGH row in release-manifest.json,
//       so this file ships with zero new manifest rows. A module required by shipped
//       code but missing a manifest row is a real defect class this kit has shipped
//       before; this home carries none of that risk.
//   (2) validate-entry-docs.cjs derives validator_count with a NON-RECURSIVE readdir
//       over `validators/`, so nothing in `validators/lib/` moves that count — and no
//       shipped document's "N validators" claim shifts because this module landed.
//   Precedent: validators/lib/fenced-block.cjs.
//
// Dependency-free (Node builtins only). .cjs = always CommonJS.

'use strict';

const fs = require('fs');
const path = require('path');

function load(root, manifestPath) {
  const p = manifestPath || path.join(root, 'release-manifest.json');
  let man;
  try { man = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    throw new Error(`release-version: cannot read the derivation source ${p} — ${e.message}`);
  }
  if (typeof man.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(man.version)) {
    throw new Error(`release-version: ${p} carries no usable "version" (got ${JSON.stringify(man.version)}) — fail closed, never guess`);
  }
  if (typeof man.slug !== 'string' || !man.slug) {
    throw new Error(`release-version: ${p} carries no usable "slug" — fail closed, never guess`);
  }
  const version = man.version;
  const slug = man.slug;
  return {
    version,
    slug,
    major: Number(version.split('.')[0]),
    tag: 'v' + version,
    zipName: `${slug}-v${version}-starter.zip`,
    sha256Name: `${slug}-v${version}-starter.zip.sha256`,
  };
}

// The escaped-regex FORM, produced BY ESCAPING the derived string — never hand-written.
// The teeth: an UNescaped version regex also matches dot-wildcard variants, so a hand anchor whose
// author forgot the backslashes is a wider matcher than they think. Deriving the escape
// makes that class unwritable.
function escaped(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// RegExp factory over the derived identity. Callers ask for a KIND, never a literal.
function re(kind, d) {
  switch (kind) {
    case 'version': return new RegExp(escaped(d.version));
    case 'tag': return new RegExp(escaped(d.tag));
    case 'zip': return new RegExp(escaped(d.zipName));
    case 'sha256': return new RegExp(escaped(d.sha256Name));
    default: throw new Error(`release-version: unknown regex kind ${JSON.stringify(kind)}`);
  }
}

module.exports = { load, escaped, re };
