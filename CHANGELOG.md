# Changelog

Release history of the Software Build Assurance Kit, in the same shape as the release notes — capabilities, limitations, evidence — never a build diary. Full detail for the current release: [RELEASE-NOTES.md](RELEASE-NOTES.md).

## v0.2.0 — 2026-07

The first release under the name Software Build Assurance Kit: the same kit, renamed and re-cut, with a rebuilt public entry.

- **Capabilities.** The calibrated bootstrap (tiers and operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, the self-tested enforcement layer, evidence receipts, and tag-built provenance-carrying artifacts. New in this release: the entry pages [docs/what-this-is.md](docs/what-this-is.md), [docs/positioning.md](docs/positioning.md), and [docs/limitations.md](docs/limitations.md), plus this changelog.
- **Limitations.** Experimental; interfaces break between 0.x releases; no worked example ships; no human security audit has been performed. The full honest list: [docs/limitations.md](docs/limitations.md).
- **Evidence.** CI runs the kit's enforcement layer against the kit on every push; artifacts are built from a signed tag and carry SLSA Level 2 build provenance; the documentation's counted claims are machine-checked against the code.

## v0.1.0 — 2026-07

The first public cut, under the kit's earlier working name.

- **Capabilities.** The same core at its first published state: the bootstrap interview, the stage loop, the blind verifier, and the enforcement suite.
- **Limitations.** As above, with a thinner entry: the what-this-is / positioning / limitations pages did not yet exist.
- **Evidence.** The same CI self-enforcement and tag-built artifact discipline, at SLSA Level 2.
