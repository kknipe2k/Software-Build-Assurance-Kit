#!/usr/bin/env node
// validators/lib/escape-regexp.cjs
// @kit-version 1.0.5
//
// THE ONE REGEX-ESCAPE for the shipped payload (M29.C, the CodeQL class fix).
//
// Before this module, every site that built a RegExp from a runtime string carried its
// own escape: two private complete helpers (fenced-block's escapeRe, release-version's
// escaped), one PARTIAL idiom (validate-release-readiness escaped only the hyphen — safe
// solely because its input is a hardcoded ladder), and one hand-rolled per-character
// branch inside validate-app-map's glob converter that a scanner cannot recognize as a
// sanitizer. The class defect is the DRIFT that inventory invites: the next site copies
// the nearest idiom, and the nearest idiom may be the partial one. One shared helper
// makes the complete escape the only idiom there is.
//
// The escape set is the canonical MDN/TC39 set — every character with syntactic meaning
// in a JS RegExp: . * + ? ^ $ { } ( ) | [ ] \
// A character outside the set (letters, digits, '-', '/', '_') has no syntactic meaning
// OUTSIDE a character class in a JS pattern, so prefixing it is unnecessary — and '\-'
// style identity-escapes are exactly the partial-idiom smell this module retires.
//
// Zero behavior change by contract: replacing a COMPLETE local escape with this helper
// is byte-equivalent on every input; the wildcard-semantics control pin (smoke M29.C
// C-p3) proves the one non-trivial caller (the glob converter) byte-for-byte.
//
// .cjs = always CommonJS regardless of the host project's package.json type.

'use strict';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegExp };
