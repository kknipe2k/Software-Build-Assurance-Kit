# Changelog

Release history of the Software Build Assurance Kit, in the same shape as the release notes - capabilities, limitations, evidence - never a build diary. Full detail for the current release: [RELEASE-NOTES.md](RELEASE-NOTES.md).

## v1.0.3 - 2026-08-01

**The current release** - a hardening patch on the GA release; full detail in [RELEASE-NOTES.md](RELEASE-NOTES.md). No new features and no interface changes: the documentation brought to consistency in one pass against final behavior, and the release chain plus the enforcement layer hardened.

- **Capabilities.** Everything in v1.0.2, plus the hardening:
  - Every release-version literal in checks and shipped pages is derived from one root (the release manifest), and a sweep fails the build on a stale version literal in a live-claim position - the defect class that once let an old version ride through three releases in a shipped page.
  - Require resolution is verified across the assembled tree before a tag is cut, including dynamically composed requires and files that execute both at their staged position and at their rendered path - the packaging defect class that reached the public CI once now fails pre-tag.
  - A zero-recorded-executions detector: a control with no recorded run is reported rather than presumed effective.
  - The adopt step fails closed at every destination: an unclassified destination row is an install error, never a default.
  - The retired role-file alias is removed; one file is the single role marker.
  - The stage gate's self-approval carve: the gate's own control files (the approval marker, its allow list, the hook settings) are refused to agent edit-tool writes before any allow rule is consulted, so an agent can no longer write its own stage approval. The residual is stated in the hook source: engaged-gate-only, a raised bar rather than a wall.
  - The verifier calibration exam made realistic: all eleven fixtures rewritten as plausible artifacts with neutral filenames, answers held only in a sealed label set, and a leak probe run on the result (eleven of eleven fixtures leaked their defect class by filename before; zero of eleven after).
  - The kit's own regression suite hardened: narrowed section runs now fail loudly when a check's fixture depends on a section the run suppressed - a defect of exactly that class passed on Windows and failed only on Linux CI before the fix.
  - CI and the generated workflows pin actions/checkout v7.0.1, with the emitted pins moved in the same change as the live ones.
- **Limitations.** Unchanged from the GA release: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** The hardening changes are pinned by the kit's regression suite, with the failing check recorded before each fix; the counted claims here (fixture and leak-probe counts) are machine-sourced from those runs. Built from a signed tag and published with SLSA Level 2 build provenance.

## v1.0.2 - 2026-07

**The GA release** - kit content is identical to v1.0.1; this is the attested cut.

- **Capabilities.** Everything in v1.0.1, republished with verified provenance: the calibrated bootstrap (two tiers, four operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, verification lanes over one registry, the self-tested enforcement layer, build receipts, and tag-built artifacts.
- **Limitations.** The honest list is in [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md): no human security audit, no worked example ships, macOS never run, the weight is real on small solo builds.
- **Evidence.** Built from the same signed tag content as v1.0.1 and published with SLSA Level 2 build provenance; `gh attestation verify` resolves on this release's asset. The five GA decision-record properties were each demonstrated by execution, twice (framework gates plus an independent fresh-context verifier).

## v1.0.1 - 2026-07

Published before its attestation ran, then superseded by v1.0.2 (identical kit content). The release stands - the repository's immutable-release protection correctly locked it, so its page cannot be corrected in place - but its body's verification instructions do not work for its own asset. Unsupported; use v1.0.2.

## v1.0.0 - 2026-07

Tagged during release preparation, never published. The public repository's CI caught a packaging defect (a shipped validator whose dependency had no manifest row) before any release page existed; the fix shipped as v1.0.1.

## v0.2.0 - 2026-07

The first release under the name Software Build Assurance Kit: the same kit, renamed and re-cut, with a rebuilt public entry.

- **Capabilities.** The calibrated bootstrap (tiers and operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, the self-tested enforcement layer, evidence receipts, and tag-built provenance-carrying artifacts. New in this release: the entry pages [docs/what-this-is.md](docs/what-this-is.md), [docs/positioning.md](docs/positioning.md), and [docs/limitations.md](docs/limitations.md), plus this changelog.
- **Limitations.** Experimental; interfaces break between 0.x releases; no worked example ships; no human security audit has been performed. The full honest list: [docs/limitations.md](docs/limitations.md).
- **Evidence.** CI runs the kit's enforcement layer against the kit on every push; artifacts are built from a signed tag and carry SLSA Level 2 build provenance; the documentation's counted claims are machine-checked against the code.

## v0.1.0 - 2026-07

The first public cut, under the kit's earlier working name.

- **Capabilities.** The same core at its first published state: the bootstrap interview, the stage loop, the blind verifier, and the enforcement suite.
- **Limitations.** As above, with a thinner entry: the what-this-is / positioning / limitations pages did not yet exist.
- **Evidence.** The same CI self-enforcement and tag-built artifact discipline, at SLSA Level 2.
